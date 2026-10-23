/** D04 base contracts use independently asserted quantities and never modify P3 durable facts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {
    emptyInventory,
    inventoryCommand,
    validateInventory,
    directory,
    inventoryKey,
    tooltipBox
} from '../web/src/ui/inventory-state.ts';
import {initialState, transition, MAINLINE, KNOWN_ITEMS} from '../web/src/domain/state.ts';
import {seal, decode} from '../web/src/persistence/codec.ts';
import type {State} from '../web/src/domain/types.ts';
import type {InventoryCommand} from '../web/src/ui/inventory-state.ts';
import type {Rules} from '../web/src/rules/types.ts';
import {iconParts, iconModel, iconGeometry} from '../web/src/ui/icon-model.ts';
import {entityCube} from '../web/src/ui/icons.ts';
import {itemName} from '../web/src/i18n/items.ts';
import {resources} from '../tools/resources.ts';

/** Committed default-profile rules are authoritative limits rather than guessed item suffixes. */
const rules = JSON.parse(readFileSync(resolve('../data/minecraft/26.3/rules.json'), 'utf8')) as Rules;

/** Build a durable test fact through normal domain commands, never through player UI grants.
 * @param {string[]} ids Item paths in acquisition order.
 * @return {State} Valid permanent facts.
 */
function unlocked(...ids: string[]): State {
    return ids.reduce((s, id) => transition(s, {type: 'unlock', item: 'minecraft:' + id}).state, initialState());
}

test('P5 directory keeps every mainline index and appends side items by first acquisition, without sorting or unlocking', () => {
    const s = unlocked('shield', 'charcoal', 'shield', 'oak_log', 'anvil'), before = structuredClone(s),
        list = directory(s);
    assert.deepEqual(list.slice(0, 18).map(e => e.item), MAINLINE);
    assert.deepEqual(list.slice(18).map(e => e.item), ['minecraft:shield', 'minecraft:charcoal', 'minecraft:anvil']);
    assert.equal(list[1].unlocked, false);
    assert.deepEqual(s, before);
    assert.equal(KNOWN_ITEMS.size, 113);
});
test('P5 every source command rejects all locked registered identities, including numeric, middle, left and right paths', () => {
    const s = initialState(), v = emptyInventory();
    for (const id of KNOWN_ITEMS) for (const mode of ['left', 'right', 'clone', 'number'] as const) assert.throws(() => inventoryCommand(v, {
        type: 'source',
        item: id,
        mode,
        index: 2
    }, s, rules), /locked-item/);
    assert.deepEqual(v, emptyInventory());
    assert.deepEqual(s, initialState());
});
test('P5 catalogue is an inexhaustible source; repeated identical references and native stack caps never create permanent quantities', () => {
    const s = unlocked('oak_planks', 'milk_bucket', 'bucket', 'wooden_pickaxe'), before = structuredClone(s);
    let v = emptyInventory();
    for (let i = 0; i < 9; i++) v = inventoryCommand(v, {
        type: 'source',
        item: 'minecraft:oak_planks',
        mode: 'number',
        index: i
    }, s, rules);
    assert.ok(v.hotbar.every(stack => stack?.count === 64 && stack.id === 'minecraft:oak_planks'));
    for (const [id, count] of [['milk_bucket', 1], ['bucket', 16], ['wooden_pickaxe', 1]] as const) {
        v = inventoryCommand(v, {type: 'source', item: 'minecraft:' + id, mode: 'number', index: 0}, s, rules);
        assert.equal(v.hotbar[0]?.count, count);
    }
    assert.deepEqual(s, before);
    assert.equal(s.progress.unlocked.length, 4);
    assert.deepEqual(s.progress.player, initialState().progress.player);
});
test('P5 bounded basic pickup halves odd groups, places one, merges to maximum and swaps distinct actual carriers', () => {
    const s = unlocked('oak_planks', 'stick');
    let v = emptyInventory();
    v.hotbar[0] = {id: 'minecraft:oak_planks', count: 9};
    v = inventoryCommand(v, {type: 'slot', index: 0, button: 2}, s, rules);
    assert.equal(v.hotbar[0]?.count, 4);
    assert.equal(v.cursor?.count, 5);
    v = inventoryCommand(v, {type: 'slot', index: 1, button: 2}, s, rules);
    assert.equal(v.hotbar[1]?.count, 1);
    assert.equal(v.cursor?.count, 4);
    v.hotbar[1]!.count = 63;
    v = inventoryCommand(v, {type: 'slot', index: 1, button: 0}, s, rules);
    assert.equal(v.hotbar[1]?.count, 64);
    assert.equal(v.cursor?.count, 3);
    v.hotbar[2] = {id: 'minecraft:stick', count: 2};
    v = inventoryCommand(v, {type: 'slot', index: 2, button: 0}, s, rules);
    assert.equal(v.hotbar[2]?.count, 3);
    assert.equal(v.cursor?.id, 'minecraft:stick');
    assert.equal(v.cursor?.count, 2);
});
test('P5 original equipment identity rejects a tool in armor, allows a legal chestplate and uses the native offhand stack maximum', () => {
    const s = unlocked('iron_chestplate', 'iron_pickaxe', 'shield', 'stick');
    let v = emptyInventory();
    v.cursor = {id: 'minecraft:iron_pickaxe', count: 1};
    assert.deepEqual(inventoryCommand(v, {type: 'equipment', slot: 'chest', button: 0}, s, rules), v);
    v.cursor = {id: 'minecraft:iron_chestplate', count: 1};
    v = inventoryCommand(v, {type: 'equipment', slot: 'chest', button: 0}, s, rules);
    assert.equal(v.equipment.chest?.id, 'minecraft:iron_chestplate');
    assert.equal(v.cursor, null);
    v.cursor = {id: 'minecraft:shield', count: 1};
    v = inventoryCommand(v, {type: 'equipment', slot: 'offhand', button: 0}, s, rules);
    assert.equal(v.equipment.offhand?.id, 'minecraft:shield');
    v.equipment.offhand = null;
    v.cursor = {id: 'minecraft:stick', count: 64};
    v = inventoryCommand(v, {type: 'equipment', slot: 'offhand', button: 0}, s, rules);
    assert.equal(v.equipment.offhand?.count, 64);
    assert.deepEqual(s.progress.player, initialState().progress.player);
});
test('P5 nine selections wrap wheel boundaries and preserve browser/text focus shortcuts', () => {
    const s = initialState();
    let v = inventoryCommand(emptyInventory(), {type: 'wheel', direction: -1}, s, rules);
    assert.equal(v.selected, 8);
    v = inventoryCommand(v, {type: 'wheel', direction: 1}, s, rules);
    assert.equal(v.selected, 0);
    for (let i = 1; i <= 9; i++) assert.equal(inventoryKey('Digit' + i, false, false), i - 1);
    for (const code of ['KeyE', 'Digit1', 'Escape']) {
        assert.equal(inventoryKey(code, true, false), null);
        assert.equal(inventoryKey(code, false, true), null);
    }
    assert.equal(inventoryKey('KeyE', false, false), 'inventory');
    assert.throws(() => inventoryCommand(v, {type: 'select', index: 9}, s, rules));
});
test('P5 malformed or locked temporary carriers and maximum-count violations cannot bypass the command gate', () => {
    const s = unlocked('milk_bucket'), v = emptyInventory();
    v.cursor = {id: 'minecraft:milk_bucket', count: 2};
    assert.throws(() => validateInventory(v, s, rules), /invalid-temporary/);
    v.cursor = {id: 'minecraft:stone', count: 1};
    assert.throws(() => validateInventory(v, s, rules), /invalid-temporary/);
    const forged = {type: 'source', item: 'minecraft:milk_bucket', mode: 'number', index: -1} as InventoryCommand;
    assert.throws(() => inventoryCommand(emptyInventory(), forged, s, rules), /invalid-hotbar/);
});
test('P5 temporary commands preserve P3 envelope shape, permanent monotonicity and independent recipe/discovery contracts', async () => {
    const s = unlocked('oak_log', 'shield'), bookBefore = structuredClone(s.progress.recipeBook),
        bytes = JSON.stringify(await seal(s, 'p3-compatible', 7));
    const v = inventoryCommand(emptyInventory(), {
        type: 'source',
        item: 'minecraft:shield',
        mode: 'number',
        index: 3
    }, s, rules);
    assert.equal(v.hotbar[3]?.id, 'minecraft:shield');
    const decoded = await decode(bytes);
    assert.deepEqual(decoded.envelope.state, s);
    assert.deepEqual(s.progress.recipeBook, bookBefore);
    assert.deepEqual(s.progress.player, initialState().progress.player);
});
test('P5 all 113 original item definitions resolve their default GUI dependencies and item names with auditable original bytes', () => {
    const files = resources(), manifest = JSON.parse(new TextDecoder().decode(files.get('catalogue-manifest.json'))),
        docs = new Map([...files].filter(([p]) => p.endsWith('.json')).map(([p, b]) => [p, JSON.parse(new TextDecoder().decode(b))]));
    assert.equal(manifest.items.length, 113);
    assert.equal(files.size, 675);
    for (const [file, hash] of Object.entries(manifest.adapterSources)) assert.equal(createHash('sha256').update(readFileSync(resolve('web/src', file), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
    assert.equal(manifest.entries.length, 363);
    assert.equal(createHash('sha256').update(readFileSync(resolve('web/src/i18n/items.en.json'))).digest('hex'), manifest.namesSha256);
    assert.equal(createHash('sha256').update(readFileSync(resolve('tools/catalogue-assets.ts'), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), manifest.exporterSha256);
    for (const [id, hash] of Object.entries(manifest.inputs)) if (files.has(id)) assert.equal(createHash('sha256').update(files.get(id)!).digest('hex'), hash);
    let generated = 0, elements = 0, special = 0, composite = 0;
    for (const id of manifest.items) {
        assert.ok(itemName(id));
        const parts = iconParts(docs.get('assets/minecraft/items/' + id.split(':')[1] + '.json').model, '10-21');
        if (parts.length > 1) composite++;
        for (const part of parts) {
            const m = iconModel(part.model, id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json'));
            if (part.special) {
                special++;
                assert.ok(['minecraft:chest', 'minecraft:shield'].includes(part.special.type));
            } else if (m.builtin) generated++; else {
                elements++;
                assert.ok(iconGeometry(m).indices.length);
            }
        }
    }
    assert.equal(special, 3);
    assert.equal(composite, 1);
    assert.ok(generated > 40 && elements > 30);
    assert.throws(() => itemName('minecraft:unknown'), /missing-english/);
    assert.equal(itemName('minecraft:stone', {'minecraft:stone': 'Translated stone'}), 'Translated stone');
});
test('P5 selects native spear GUI, default armor, date-dependent chest, grass tint and composite branches explicitly', () => {
    const files = resources(),
        doc = (id: string) => JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/items/' + id + '.json')));
    assert.equal(iconParts(doc('iron_spear').model, '10-21')[0].model, 'minecraft:item/iron_spear');
    assert.equal(iconParts(doc('iron_helmet').model, '10-21')[0].model, 'minecraft:item/iron_helmet');
    assert.equal(iconParts(doc('chest').model, '12-25')[0].special?.texture, 'minecraft:christmas');
    assert.equal(iconParts(doc('trapped_chest').model, '10-21')[0].special?.texture, 'minecraft:trapped');
    assert.equal(iconParts(doc('short_grass').model, '10-21')[0].tints?.[0].temperature, .5);
    assert.equal(iconParts(doc('straw_bed').model, '10-21').length, 2);
    assert.throws(() => iconParts({type: 'test:unknown'}, '10-21'), /unsupported/);
});
test('P5 special cuboid geometry uses native dimensions, atlas UVs and face topology rather than a generic cube icon', () => {
    const chest = entityCube([1, 0, 1, 14, 10, 14, 0, 19], 'minecraft:entity/chest/normal'),
        shield = entityCube([-6, -11, -2, 12, 22, 1, 0, 0], 'minecraft:entity/shield/shield_base_nopattern');
    assert.equal(chest.indices.length, 36);
    assert.equal(Math.max(...chest.positions.filter((_, i) => i % 3 === 1)), 10 / 16);
    assert.equal(Math.max(...shield.positions.filter((_, i) => i % 3 === 1)), 11 / 16);
    assert.equal(Math.min(...shield.positions.filter((_, i) => i % 3 === 1)), -11 / 16);
    assert.deepEqual(chest.uvs.slice(0, 8), [28 / 64, 1 - 19 / 64, 14 / 64, 1 - 19 / 64, 14 / 64, 1 - 33 / 64, 28 / 64, 1 - 33 / 64]);
});

test('P5 tooltip logical size preserves the original 12px outer margin and never violates 10px nine-slice borders', () => {
    assert.deepEqual(tooltipBox([5]), {width: 29, height: 32});
    assert.deepEqual(tooltipBox([50, 70]), {width: 94, height: 44});
    assert.throws(() => tooltipBox([]));
});
