/** Official golden recipes and independent expectations exercise facts rather than unapproved inventory policy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import fixtures from './fixtures/vanilla26.3.json' with {type: 'json'};
import {findCrafting, matchCrafting, matchCooking, componentsMatch, alternatives} from '../web/src/rules/matcher.ts';
import {correctTool, cooking} from '../web/src/rules/process.ts';
import {potentialDrops} from '../web/src/rules/harvest.ts';
import {closure, tags} from '../tools/vanilla/closure.ts';
import type {Rules, Recipe, Stack} from '../web/src/rules/types.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {decode, seal} from '../web/src/persistence/codec.ts';
import {verify} from '../tools/vanilla/verify.ts';

/** Exported data is an input, while test outputs below remain explicit hand-checked facts. */
const folder = resolve('../data/minecraft/26.3'),
    catalog = JSON.parse(readFileSync(resolve(folder, 'catalog.json'), 'utf8')),
    coverage = JSON.parse(readFileSync(resolve(folder, 'coverage.json'), 'utf8')),
    manifest = JSON.parse(readFileSync(resolve(folder, 'manifest.json'), 'utf8'));
/** Full offline registry permits testing original alternatives beyond the selected candidate source. */
const rules: Rules = {
    recipes: catalog.recipes,
    items: catalog.items,
    itemTags: catalog.itemTags,
    blockTags: catalog.blockTags,
    intProviders: catalog.providers.int,
    floatProviders: catalog.providers.float,
    loot: catalog.loot,
    sourceBlocks: catalog.sourceBlocks,
    interactions: catalog.interactions
};

/** Resolve a literal native item stack.
 * @param {string} id Vanilla path.
 * @param {number} count Native stack count.
 * @return {Stack} Test input.
 */
function s(id: string, count = 1): Stack {
    return {id: 'minecraft:' + id, count};
}

/** Read an actual golden recipe with its original case and contents.
 * @param {keyof typeof fixtures} id Fixture identity.
 * @return {Recipe} Matching input.
 */
function golden(id: keyof typeof fixtures): Recipe {
    return {id: 'minecraft:' + id, ...fixtures[id].recipe} as Recipe;
}

test('P4 census parses 1763 nonbrewing recipes/21 types plus all 279 original brewing records; hashes and golden inputs match', () => {
    assert.equal(catalog.recipes.length, 2042);
    assert.equal(catalog.recipes.filter((r: Recipe) => r.type !== 'minecraft:brewing').length, 1763);
    assert.equal(new Set(catalog.recipes.filter((r: Recipe) => r.type !== 'minecraft:brewing').map((r: Recipe) => r.type)).size, 21);
    assert.equal(catalog.recipes.filter((r: Recipe) => r.type === 'minecraft:brewing').length, 279);
    for (const file of manifest.files) {
        const bytes = readFileSync(resolve(folder, file.file));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
    for (const [id, fixture] of Object.entries(fixtures)) {
        assert.deepEqual(catalog.recipes.find((r: Recipe) => r.id === 'minecraft:' + id), {id: 'minecraft:' + id, ...fixture.recipe});
        assert.equal(manifest.inputs[fixture.source], fixture.sha256);
    }
});
test('P4 shaped offsets/mirror and strict empty slots work in 2x2 and 3x3 without converting pattern/key case', () => {
    const stick = golden('stick');
    assert.equal(matchCrafting(stick, [null, s('oak_planks'), null, s('oak_planks')], 2, 2, rules)?.result.count, 4);
    assert.equal(matchCrafting(stick, [s('oak_planks'), null, null, null], 2, 2, rules), null);
    assert.equal(matchCrafting(golden('wooden_pickaxe'), [s('oak_planks'), s('oak_planks'), s('oak_planks'), null, s('stick'), null, null, s('stick'), null], 3, 3, rules)?.result.id, 'minecraft:wooden_pickaxe');
    assert.equal(matchCrafting(golden('wooden_pickaxe'), [s('oak_planks'), s('oak_planks'), s('stick'), null], 2, 2, rules), null);
    assert.equal(matchCrafting(golden('iron_spear'), [s('iron_ingot'), null, null, null, s('stick'), null, null, null, s('stick')], 3, 3, rules)?.result.id, 'minecraft:iron_spear');
    const mixed: Recipe = {
        id: 'test:case',
        type: 'minecraft:crafting_shaped',
        pattern: ['Ii'],
        key: {I: 'minecraft:iron_ingot', i: 'minecraft:iron_nugget'},
        result: {id: 'minecraft:iron_ingot'}
    };
    assert.ok(matchCrafting(mixed, [s('iron_ingot'), s('iron_nugget'), null, null], 2, 2, rules));
    assert.equal(matchCrafting(mixed, [s('iron_ingot'), s('iron_ingot'), null, null], 2, 2, rules), null);
});
test('P4 shapeless matching respects repeated slots, tags and overlapping alternatives rather than greedy assignment', () => {
    const r: Recipe = {
        id: 'test:overlap',
        type: 'minecraft:crafting_shapeless',
        ingredients: ['#minecraft:planks', 'minecraft:oak_planks'],
        result: {id: 'minecraft:stick', count: 4}
    };
    assert.ok(matchCrafting(r, [s('oak_planks'), s('birch_planks'), null, null], 2, 2, rules));
    assert.equal(matchCrafting(r, [s('oak_planks', 2), null, null, null], 2, 2, rules), null);
    assert.equal(matchCrafting(r, [s('birch_planks'), s('birch_planks'), null, null], 2, 2, rules), null);
    assert.equal(matchCrafting(golden('oak_planks'), [s('oak_log'), null, null, null], 2, 2, rules)?.result.count, 4);
});
test('P4 cake accepts every native egg alternative and yields three independent bucket remainders', () => {
    for (const egg of ['egg', 'blue_egg', 'brown_egg']) {
        const grid = [s('milk_bucket'), s('milk_bucket'), s('milk_bucket'), s('sugar'), s(egg), s('sugar'), s('wheat'), s('wheat'), s('wheat')],
            before = structuredClone(grid), result = matchCrafting(golden('cake'), grid, 3, 3, rules)!;
        assert.deepEqual(result.result, {id: 'minecraft:cake', count: 1});
        assert.deepEqual(result.remainders.slice(0, 3), [s('bucket'), s('bucket'), s('bucket')]);
        assert.equal(result.remainders.filter(Boolean).length, 3);
        assert.deepEqual(grid, before);
        grid[1] = null as any;
        grid[0].count = 3;
        assert.equal(matchCrafting(golden('cake'), grid, 3, 3, rules), null);
    }
    assert.ok(alternatives('#minecraft:eggs', rules.itemTags).includes('minecraft:blue_egg'));
});
test('P4 correct tool uses actual incorrect-drop tags; fast gold never substitutes for stone on iron ore', () => {
    assert.equal(correctTool('minecraft:wooden_pickaxe', 'minecraft:stone', rules), true);
    assert.equal(correctTool('minecraft:wooden_pickaxe', 'minecraft:iron_ore', rules), false);
    assert.equal(correctTool('minecraft:stone_pickaxe', 'minecraft:iron_ore', rules), true);
    assert.equal(correctTool('minecraft:golden_pickaxe', 'minecraft:iron_ore', rules), false);
    assert.equal(correctTool('minecraft:iron_axe', 'minecraft:iron_ore', rules), false);
    assert.equal(potentialDrops('minecraft:stone', s('wooden_pickaxe'), rules, catalog.loot)[0].id, 'minecraft:cobblestone');
    assert.equal(potentialDrops('minecraft:iron_ore', s('stone_pickaxe'), rules, catalog.loot)[0].id, 'minecraft:raw_iron');
    assert.deepEqual(potentialDrops('minecraft:iron_ore', s('golden_pickaxe'), rules, catalog.loot), []);
    assert.equal(potentialDrops('minecraft:short_grass', null, rules, catalog.loot)[0].chance, .125);
    assert.equal(potentialDrops('minecraft:short_grass', s('shears'), rules, catalog.loot)[0].id, 'minecraft:short_grass');
    assert.equal(potentialDrops('minecraft:wheat', null, rules, catalog.loot, 0)[0].id, 'minecraft:wheat_seeds');
});
test('P4 native stack, armor, damage, remainder and fuel identities come from registration evidence', () => {
    assert.equal(rules.items['minecraft:bucket'].maxStack, 16);
    assert.equal(rules.items['minecraft:milk_bucket'].maxStack, 1);
    assert.equal(rules.items['minecraft:milk_bucket'].remainder, 'minecraft:bucket');
    assert.equal(rules.items['minecraft:wooden_pickaxe'].maxDamage, 59);
    assert.equal(rules.items['minecraft:iron_chestplate'].equipment, 'chest');
    assert.equal(rules.items['minecraft:iron_chestplate'].maxDamage, 240);
    assert.equal(cooking('minecraft:stick', 'furnace', 200, rules)?.burnTicks, 100);
    assert.equal(cooking('minecraft:wooden_pickaxe', 'furnace', 200, rules)?.burnTicks, 200);
    assert.equal(cooking('minecraft:oak_planks', 'furnace', 200, rules)?.burnTicks, 300);
    assert.equal(cooking('minecraft:coal', 'furnace', 200, rules)?.burnTicks, 1600);
    assert.deepEqual(cooking('minecraft:charcoal', 'blast_furnace', 200, rules), {
        burnTicks: 800,
        speed: 2,
        cookTicks: 100
    });
    assert.equal(cooking('minecraft:iron_ingot', 'furnace', 200, rules), null);
});
test('P4 cooking matches station capabilities, stone chain and iron recovery without treating slot acceptance as processing', () => {
    assert.equal(matchCooking(s('oak_log'), 'furnace', rules)?.result?.id, 'minecraft:charcoal');
    assert.equal(matchCooking(s('oak_log'), 'blast_furnace', rules), null);
    assert.equal(matchCooking(s('cobblestone'), 'furnace', rules)?.result?.id, 'minecraft:stone');
    assert.equal(matchCooking(s('stone'), 'furnace', rules)?.result?.id, 'minecraft:smooth_stone');
    for (const station of ['furnace', 'blast_furnace'] as const) {
        assert.equal(matchCooking(s('raw_iron'), station, rules)?.result?.id, 'minecraft:iron_ingot');
        assert.equal(matchCooking(s('iron_chestplate'), station, rules)?.result?.id, 'minecraft:iron_nugget');
    }
    assert.equal(matchCrafting(golden('iron_ingot_from_nuggets'), Array.from({length: 9}, () => s('iron_nugget')), 3, 3, rules)?.result.id, 'minecraft:iron_ingot');
});
test('P4 reachable native repair supports pristine tools and damaged variants, but rejects unsupported component-bearing input', () => {
    const repair = rules.recipes.find(r => r.id === 'minecraft:repair_item')!;
    assert.equal(matchCrafting(repair, [s('wooden_pickaxe'), s('wooden_pickaxe'), null, null], 2, 2, rules)?.result.components?.['minecraft:damage'], 0);
    const a = {...s('wooden_pickaxe'), components: {'minecraft:damage': 58}};
    assert.equal(matchCrafting(repair, [a, a, null, null], 2, 2, rules)?.result.components?.['minecraft:damage'], 55);
    assert.equal(matchCrafting(repair, [s('wooden_pickaxe', 2), s('wooden_pickaxe'), null, null], 2, 2, rules), null);
    assert.throws(() => matchCrafting(repair, [{
        ...a,
        components: {'minecraft:custom_name': 'X'}
    }, a, null, null], 2, 2, rules), /variant-not-supported/);
    assert.equal(componentsMatch(a, {'minecraft:damage': 58}), true);
});
test('P4 recursive tags preserve nested alternatives, optional absent references and reject cycles', () => {
    const d = {
        'data/minecraft/tags/item/a.json': {values: ['minecraft:egg', '#minecraft:b']},
        'data/minecraft/tags/item/b.json': {values: ['minecraft:blue_egg', {id: '#minecraft:missing', required: false}]}
    };
    assert.deepEqual(tags(d, 'item')['minecraft:a'], ['minecraft:blue_egg', 'minecraft:egg']);
    assert.throws(() => tags({'data/minecraft/tags/item/a.json': {values: ['#minecraft:a']}}, 'item'), /cycle/);
});
test('P4 fixed point provides causal proofs for every item, includes side products and excludes unavailable capabilities without inventing sources', () => {
    assert.equal(Object.keys(coverage.proofs).length, 113);
    assert.equal(coverage.coverage.length, 2042);
    assert.equal(coverage.coverage.filter((c: any) => c.status === 'reachable').length, 112);
    assert.deepEqual(coverage.coverage.filter((c: any) => c.status === 'blocked'), []);
    for (const [id, p] of Object.entries(coverage.proofs) as [string, any][]) {
        assert.ok(rules.items[id]);
        assert.ok(p.requires.every((i: string) => coverage.proofs[i]));
        assert.ok(!p.requires.includes(id));
    }
    for (const id of ['cake', 'blast_furnace', 'hopper', 'chest', 'iron_spear', 'trapped_chest', 'name_tag', 'straw_bed', 'short_grass']) assert.ok(coverage.proofs['minecraft:' + id], id);
    for (const id of ['diamond', 'gold_ingot', 'leather', 'bone_meal', 'water_bucket', 'iron_ore']) assert.equal(coverage.proofs['minecraft:' + id], undefined);
    assert.ok(coverage.coverage.some((r: any) => r.type === 'minecraft:crafting_special_repairitem' && r.status === 'reachable'));
    assert.ok(coverage.coverage.filter((r: any) => r.type === 'minecraft:stonecutting').every((r: any) => r.reason.includes('capability-not-in-project')));
    const isolated: Rules = {
        ...rules,
        recipes: [{
            id: 'test:cycle',
            type: 'minecraft:crafting_shapeless',
            ingredients: ['minecraft:diamond'],
            result: {id: 'minecraft:diamond'}
        }]
    };
    assert.equal(closure(isolated, catalog.loot).proofs['minecraft:diamond'], undefined);
});
test('P4 expanded registry preserves P3 envelopes and unlock invariants; recipe knowledge never grants or discovers an item', async () => {
    let value = initialState();
    for (const id of ['oak_log', 'charcoal', 'smooth_stone', 'iron_nugget', 'hopper']) value = transition(value, {
        type: 'unlock',
        item: 'minecraft:' + id
    }).state;
    const raw = JSON.stringify(await seal(value, 'p3-existing', 4));
    assert.deepEqual((await decode(raw)).envelope.state, value);
    const added = transition(value, {type: 'unlock', item: 'minecraft:name_tag'});
    assert.equal(added.events.filter(e => e.type === 'item-unlocked').length, 1);
    assert.deepEqual(transition(added.state, {type: 'unlock', item: 'minecraft:name_tag'}).events, []);
    assert.ok(value.progress.recipeBook.data.known.includes('minecraft:charcoal'));
    assert.equal(value.progress.unlocked.includes('minecraft:cake'), false);
});
test('P4 all twelve candidate source profiles reproduce causal closure and actually match their 112 recipes and cake chain', () => {
    const profiles = JSON.parse(readFileSync(resolve(folder, 'source-profiles.json'), 'utf8'));
    assert.equal(profiles.length, 12);
    for (const p of profiles) {
        const result = closure(rules, catalog.loot, p.tree, p.egg);
        assert.deepEqual(result.proofs, p.proofs);
        assert.deepEqual(result.coverage.filter(r => r.status === 'reachable').map(r => r.recipe), p.reachableRecipes);
        const executed = verify(rules, result.proofs, result.coverage);
        assert.equal(executed.checked, 112);
        assert.equal((executed.chain.at(-1) as any).item, 'minecraft:cake');
    }
});
test('P4 component equality uses verified defaults and order-independent values; unsupported defaults and nonvanilla grid shapes are explicit', () => {
    assert.equal(componentsMatch(s('wooden_pickaxe'), {
        'minecraft:damage': 0,
        'minecraft:max_damage': 59
    }, rules), true);
    assert.equal(componentsMatch({
        ...s('paper'),
        components: {'minecraft:custom_data': {b: 2, a: 1}}
    }, {'minecraft:custom_data': {a: 1, b: 2}}, rules), true);
    assert.throws(() => componentsMatch(s('iron_chestplate'), {'minecraft:equippable': {}}, rules), /unsupported-default/);
    assert.throws(() => matchCrafting(golden('stick'), Array(6).fill(null), 2, 3, rules), /invalid-crafting-grid/);
});

test('P4 runtime registry selects crafting facts without a GUI or any save mutation', () => {
    const runtime = JSON.parse(readFileSync(resolve(folder, 'rules.json'), 'utf8')) as Rules, before = initialState();
    assert.deepEqual(findCrafting([s('oak_log'), null, null, null], 2, runtime)?.result, {
        id: 'minecraft:oak_planks',
        count: 4
    });
    assert.equal(findCrafting([s('oak_planks'), s('oak_planks'), null, null], 2, runtime)?.result.id, 'minecraft:oak_pressure_plate');
    assert.equal(findCrafting(Array(9).fill(null), 3, runtime), null);
    assert.deepEqual(before.progress.unlocked, []);
    assert.deepEqual(before.progress.recipeBook.data.known, ['minecraft:crafting_table']);
});

test('P4 runtime source and cooking context use committed native predicates rather than station-name fuel guesses', () => {
    const runtime = JSON.parse(readFileSync(resolve(folder, 'rules.json'), 'utf8')) as Rules;
    assert.equal(potentialDrops('minecraft:iron_ore', s('stone_pickaxe'), runtime)[0].id, 'minecraft:raw_iron');
    assert.equal(runtime.interactions.milk.requiresAdult, true);
    const altered = structuredClone(runtime);
    altered.loot['data/minecraft/predicate/block/fast_cooking.json'].blocks = ['minecraft:furnace'];
    assert.equal(cooking('minecraft:coal', 'furnace', 200, altered)?.cookTicks, 100);
    assert.equal(cooking('minecraft:coal', 'blast_furnace', 200, altered)?.cookTicks, 200);
});
