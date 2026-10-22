/** Offline finite least-fixed-point analysis records witnesses and exclusions rather than assuming every visible block is collectible. */
import {alternatives} from '../../web/src/rules/matcher.ts';
import {correctTool, cooking} from '../../web/src/rules/process.ts';
import type {Ingredient, Recipe, Rules} from '../../web/src/rules/types.ts';
import {potentialDrops} from '../../web/src/rules/harvest.ts';

export interface Proof {
    kind: string;
    requires: string[];
    recipe?: string;
    source?: string;
    details?: unknown;
    round: number;
}

export interface Coverage {
    recipe: string;
    type: string;
    status: 'reachable' | 'excluded' | 'blocked';
    reason: string;
    missing?: Ingredient[];
    witness?: string[];
}

/** Explicit capability boundary does not follow from the ability to craft an unrelated station block.
 * @param {Recipe} recipe Original recipe.
 * @return {string|null} Capability gate, or null for dynamic crafting.
 */
function station(recipe: Recipe): string | null {
    if (recipe.type === 'minecraft:crafting_shaped') {
        const p = recipe.pattern!;
        return p.length > 2 || p.some(row => row.length > 2) ? 'minecraft:crafting_table' : null;
    }
    if (recipe.type === 'minecraft:crafting_shapeless') return recipe.ingredients!.length > 4 ? 'minecraft:crafting_table' : null;
    return ({
        'minecraft:smelting': 'minecraft:furnace',
        'minecraft:blasting': 'minecraft:blast_furnace',
        'minecraft:stonecutting': 'excluded:stonecutter',
        'minecraft:smoking': 'excluded:smoker',
        'minecraft:campfire_cooking': 'excluded:campfire',
        'minecraft:smithing_transform': 'excluded:smithing',
        'minecraft:smithing_trim': 'excluded:smithing',
        'minecraft:brewing': 'excluded:brewing'
    })[recipe.type] ?? null;
}

/** Enumerate every mandatory ingredient for ordinary and native special recipes; optional modifiers are not prerequisites.
 * @param {Recipe} r Original recipe.
 * @return {Ingredient[]} Required ingredient predicates.
 */
export function requirements(r: Recipe): Ingredient[] {
    switch (r.type) {
        case'minecraft:crafting_shaped':
            return r.pattern!.flatMap(row => [...row].filter(c => c !== ' ').map(c => r.key![c]));
        case'minecraft:crafting_shapeless':
            return r.ingredients!;
        case'minecraft:smelting':
        case'minecraft:blasting':
        case'minecraft:smoking':
        case'minecraft:campfire_cooking':
        case'minecraft:stonecutting':
            return [r.ingredient!];
        case'minecraft:crafting_transmute':
            return [r.input, r.material];
        case'minecraft:crafting_dye':
            return [r.target, r.dye];
        case'minecraft:crafting_decorated_pot':
            return [r.back, r.front, r.left, r.right];
        case'minecraft:crafting_special_bannerduplicate':
            return [r.banner, r.banner];
        case'minecraft:crafting_special_bookcloning':
            return [r.source, r.material];
        case'minecraft:crafting_special_firework_rocket':
            return [r.fuel, r.shell];
        case'minecraft:crafting_special_firework_star':
            return [r.fuel, r.dye];
        case'minecraft:crafting_special_firework_star_fade':
            return [r.target, r.dye];
        case'minecraft:crafting_special_mapextending':
            return [r.map, r.material];
        case'minecraft:crafting_special_shielddecoration':
            return [r.target, r.banner];
        case'minecraft:crafting_imbue':
            return [r.source, r.material];
        case'minecraft:crafting_special_repairitem':
            return [];
        case'minecraft:smithing_trim':
        case'minecraft:smithing_transform':
            return [r.template, r.base, r.addition];
        case'minecraft:brewing':
            return [r.input ?? r.ingredient ?? []];
        default:
            throw new Error('unknown-recipe-type:' + r.type);
    }
}

/** Resolve nested item/block tags with missing required references and cycles reported explicitly.
 * @param {Record<string,any>} documents Original source JSON.
 * @param {'item'|'block'} kind Registry kind.
 * @return {Record<string,string[]>} Expanded tag predicates.
 */
export function tags(documents: Record<string, any>, kind: 'item' | 'block'): Record<string, string[]> {
    const prefix = 'data/minecraft/tags/' + kind + '/', raw: Record<string, any> = {},
        out: Record<string, string[]> = {};
    for (const [p, d] of Object.entries(documents)) if (p.startsWith(prefix)) raw['minecraft:' + p.slice(prefix.length, -5)] = d;

    /** Expand one tag while retaining optional-reference semantics.
     * @param {string} id Tag identity.
     * @param {Set<string>} path Active recursion path.
     * @return {string[]} Unique values.
     */
    function expand(id: string, path = new Set<string>()): string[] {
        if (out[id]) return out[id];
        if (path.has(id) || !raw[id]) throw new Error('tag-cycle-or-missing:' + id);
        const next = new Set([...path, id]);
        return out[id] = [...new Set<string>(raw[id].values.flatMap((v: any) => {
            const value = typeof v === 'string' ? v : v.id;
            if (value.startsWith('#')) {
                if (!raw[value.slice(1)] && typeof v === 'object' && v.required === false) return [];
                return expand(value.slice(1), next);
            }
            return [value];
        }))].sort();
    }

    for (const id of Object.keys(raw)) expand(id);
    return out;
}

/** Compute conditional reachability for an explicitly named candidate tree/egg source profile.
 * @param {Rules} rules Original rule data.
 * @param {Record<string,any>} documents Original loot/interaction evidence.
 * @param {string} log Candidate log identity, not an approved P7 tree selection.
 * @param {string} egg Candidate chicken egg identity.
 * @return {{proofs:Record<string,Proof>,coverage:Coverage[],fuels:object[]}} Fixed point and per-recipe classification.
 */
export function closure(rules: Rules, documents: Record<string, any>, log = 'minecraft:oak_log', egg = 'minecraft:egg'): {
    proofs: Record<string, Proof>;
    coverage: Coverage[];
    fuels: object[]
} {
    const proofs: Record<string, Proof> = {}, coverage: Coverage[] = [];
    let round = 0;

    /** Add a first acyclic witness only when every prerequisite already exists.
     * @param {string} id Newly reachable item.
     * @param {Omit<Proof,'round'>} proof Witness.
     */
    function add(id: string, proof: Omit<Proof, 'round'>): void {
        if (!proofs[id]) {
            if (!rules.items[id]) throw new Error('missing-native-item-rule:' + id);
            if (proof.requires.some(i => !proofs[i])) throw new Error('noncausal-proof');
            proofs[id] = {...proof, round};
        }
    }

    for (const drop of potentialDrops(log, null, rules, documents)) add(drop.id, {
        kind: 'source',
        requires: [],
        source: 'plains/tree',
        details: {...drop, candidateSpecies: true, stripping: false, leaves: false}
    });
    for (const drop of potentialDrops('minecraft:short_grass', null, rules, documents)) add(drop.id, {
        kind: 'source',
        requires: [],
        source: 'plains/short_grass',
        details: {...drop, guaranteed: drop.chance === 1}
    });
    for (const drop of potentialDrops('minecraft:sugar_cane', null, rules, documents)) add(drop.id, {
        kind: 'source',
        requires: [],
        source: 'sugar-cane; scene position undecided',
        details: drop
    });
    add(egg, {kind: 'source', requires: [], source: 'farm/fixed-egg; candidate variant'});
    let changed = true;
    while (changed) {
        const before = Object.keys(proofs).length;
        round++;
        const have = new Set(Object.keys(proofs)), fuel = [...have].find(id => !!rules.items[id].fuel);
        if (have.has('minecraft:wheat_seeds')) for (const drop of potentialDrops('minecraft:wheat', null, rules, documents)) add(drop.id, {
            kind: 'source',
            requires: ['minecraft:wheat_seeds'],
            source: 'farm/pretilled-wheat',
            details: {...drop, age: 7, timing: 'not-selected'}
        });
        const milk = rules.interactions.milk;
        if (have.has(milk.input)) add(milk.output, {kind: 'interaction', requires: [milk.input], source: milk.source});
        const shears = have.has('minecraft:shears');
        if (shears) for (const drop of potentialDrops('minecraft:short_grass', {
            id: 'minecraft:shears',
            count: 1
        }, rules, documents)) add(drop.id, {
            kind: 'harvest',
            requires: ['minecraft:shears'],
            source: 'existing interactive grass',
            details: drop
        });
        for (const block of ['stone', 'coal_ore', 'iron_ore']) {
            const tool = [...have].find(i => correctTool(i, 'minecraft:' + block, rules));
            if (tool) for (const drop of potentialDrops('minecraft:' + block, {
                id: tool,
                count: 1
            }, rules, documents)) add(drop.id, {
                kind: 'harvest',
                requires: [tool],
                source: 'cave/' + block,
                details: {...drop, correctTool: true, silkTouch: false}
            });
        }
        for (const r of rules.recipes) {
            const cap = station(r);
            if (cap?.startsWith('excluded:') || (cap && !have.has(cap))) continue;
            if (r.type === 'minecraft:crafting_special_repairitem') continue;
            const required = requirements(r),
                chosen = required.map(v => alternatives(v, rules.itemTags).find(id => have.has(id)));
            if (chosen.some(v => !v)) continue;
            if ((r.type === 'minecraft:smelting' || r.type === 'minecraft:blasting') && !fuel) continue;
            if (!['minecraft:crafting_shaped', 'minecraft:crafting_shapeless', 'minecraft:smelting', 'minecraft:blasting'].includes(r.type)) continue;
            if (!r.result?.id) throw new Error('unknown-static-result');
            const needs = [...new Set([...chosen as string[], ...(cap ? [cap] : []), ...((r.type === 'minecraft:smelting' || r.type === 'minecraft:blasting') ? [fuel!] : [])])];
            add(r.result.id, {
                kind: 'recipe',
                requires: needs,
                recipe: r.id,
                details: {count: r.result.count ?? 1, station: cap ?? 'personal-2x2'}
            });
            for (const id of chosen as string[]) {
                const rem = rules.items[id]?.remainder;
                if (rem) add(rem, {kind: 'remainder', requires: needs, recipe: r.id, details: {ingredient: id}});
            }
        }
        changed = Object.keys(proofs).length !== before;
        if (round > 100) throw new Error('closure-nontermination');
    }
    const have = new Set(Object.keys(proofs)), fuels = [...have].filter(i => rules.items[i].fuel).sort().map(id => ({
        id,
        furnace: cooking(id, 'furnace', 200, rules),
        blastFurnace: cooking(id, 'blast_furnace', 200, rules)
    }));
    for (const r of rules.recipes) {
        const cap = station(r);
        if (cap?.startsWith('excluded:')) {
            coverage.push({
                recipe: r.id,
                type: r.type,
                status: 'excluded',
                reason: 'capability-not-in-project:' + cap.slice(9)
            });
            continue;
        }
        if (r.type === 'minecraft:crafting_special_repairitem') {
            const repairable = [...have].filter(id => rules.items[id].maxDamage);
            coverage.push({
                recipe: r.id,
                type: r.type,
                status: repairable.length ? 'reachable' : 'excluded',
                reason: repairable.length ? 'repair-handler; default and damage/max_damage variants; unapproved arbitrary components explicitly rejected' : 'no-repairable-items',
                witness: repairable
            });
            continue;
        }
        const required = requirements(r),
            missing = required.filter(v => !alternatives(v, rules.itemTags).some(i => have.has(i)));
        if (missing.length || (cap && !have.has(cap))) {
            coverage.push({
                recipe: r.id,
                type: r.type,
                status: 'excluded',
                reason: missing.length ? 'mandatory-ingredient-unreachable' : 'station-unreachable',
                missing
            });
            continue;
        }
        if (['minecraft:smelting', 'minecraft:blasting'].includes(r.type) && !fuels.length) {
            coverage.push({recipe: r.id, type: r.type, status: 'blocked', reason: 'no-reachable-fuel'});
            continue;
        }
        const supported = ['minecraft:crafting_shaped', 'minecraft:crafting_shapeless', 'minecraft:smelting', 'minecraft:blasting'].includes(r.type);
        coverage.push({
            recipe: r.id,
            type: r.type,
            status: supported ? 'reachable' : 'blocked',
            reason: supported ? 'supported-handler' : 'reachable-type-needs-handler',
            witness: required.map(v => alternatives(v, rules.itemTags).find(i => have.has(i))!)
        });
    }
    return {proofs, coverage, fuels};
}
