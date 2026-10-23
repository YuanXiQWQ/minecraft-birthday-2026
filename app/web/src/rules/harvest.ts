/** Native loot predicates are evaluated for the approved source kinds; probabilities remain possibilities, not guaranteed gameplay drops. */
import type {Rules, Stack} from './types.ts';
import {correctTool} from './process.ts';

export interface Drop {
    id: string;
    chance: number;
    source: string;
    modifiers: unknown[];
}

/** Evaluate a bounded original loot condition without guessing unsupported serializers.
 * @param {any} condition Original condition or predicate reference.
 * @param {{block:string,tool:Stack|null,age:number}} context Source state.
 * @param {Record<string,any>} documents Loot and predicate documents.
 * @return {number} Possibility probability, zero for an ineligible branch.
 */
function condition(condition: any, context: {
    block: string;
    tool: Stack | null;
    age: number
}, documents: Record<string, any>): number {
    if (!condition) return 1;
    if (typeof condition === 'string') {
        const doc = documents['data/minecraft/predicate/' + condition.split(':')[1] + '.json'];
        if (!doc) throw new Error('missing-loot-predicate');
        return conditionValue(doc, context, documents);
    }
    return conditionValue(condition, context, documents);
}

/** Interpret only same-version predicates present in the source profile.
 * @param {any} value Native condition.
 * @param {{block:string,tool:Stack|null,age:number}} context Native inputs.
 * @param {Record<string,any>} documents Predicate documents.
 * @return {number} Eligible probability.
 */
function conditionValue(value: any, context: {
    block: string;
    tool: Stack | null;
    age: number
}, documents: Record<string, any>): number {
    switch (value.type) {
        case'minecraft:survives_explosion':
            return 1;
        case'minecraft:random_chance':
            return value.chance;
        case'minecraft:match_block':
            return value.blocks === context.block && (!value.state?.age || String(context.age) === value.state.age) ? 1 : 0;
        case'minecraft:match_tool': {
            const p = value.predicate;
            if (p.items) return context.tool?.id === p.items ? 1 : 0;
            if (p.predicates?.['minecraft:enchantments']) {
                const native = context.tool?.components?.['minecraft:enchantments'] as Record<string, number> | undefined;
                return p.predicates['minecraft:enchantments'].every((v: any) => (native?.[v.enchantments] ?? 0) >= (v.levels?.min ?? 1)) ? 1 : 0;
            }
            throw new Error('unsupported-tool-predicate');
        }
        case'minecraft:all_of':
            return value.terms.reduce((p: number, c: any) => p * condition(c, context, documents), 1);
        default:
            throw new Error('unsupported-loot-condition:' + value.type);
    }
}

/** Obtain potential original drops after the source's actual correct-tool and alternative-branch checks.
 * @param {string} block Native block identity.
 * @param {Stack|null} tool Held tool or hand.
 * @param {Rules} rules Tool/tag registry.
 * @param {Record<string,any>} documents Original selected loot and predicates.
 * @param {number} age Wheat age, default mature; does not determine growth timing.
 * @return {Drop[]} Positive-probability original drops and their unmodified modifier evidence.
 */
export function potentialDrops(block: string, tool: Stack | null, rules: Rules, documents: Record<string, any> = rules.loot, age = 7): Drop[] {
    if (rules.sourceBlocks[block]?.requiresCorrectTool && (!tool || !correctTool(tool.id, block, rules))) return [];
    const path = 'data/minecraft/loot_table/blocks/' + block.split(':')[1] + '.json', table = documents[path];
    if (!table) throw new Error('unsupported-source-block');
    const context = {block, tool, age}, out: Drop[] = [];

    /** Visit an original item or alternatives node, stopping after the first eligible alternative.
     * @param {any} entry Loot entry.
     * @param {number} chance Accumulated eligibility.
     * @return {boolean} Whether this branch can produce an item.
     */
    function visit(entry: any, chance: number): boolean {
        const p = chance * condition(entry.condition, context, documents);
        if (p <= 0) return false;
        if (entry.type === 'minecraft:alternatives') {
            for (const child of entry.children) if (visit(child, p)) return true;
            return false;
        }
        if (entry.type !== 'minecraft:item') throw new Error('unsupported-loot-entry');
        out.push({
            id: entry.name,
            chance: p,
            source: path,
            modifiers: [...[table.modifier ?? []].flat(), ...[entry.modifier ?? []].flat()]
        });
        return true;
    }

    for (const pool of table.pools) {
        const chance = condition(pool.condition, context, documents);
        if (chance > 0) for (const entry of pool.entries) visit(entry, chance);
    }
    return out;
}

/** Roll supported native modifiers using the real held tool; no explosion or unimplemented enchantment is synthesized.
 * @param {string} block Native source.
 * @param {Stack|null} tool Actual main-hand group.
 * @param {Rules} rules Versioned registry.
 * @param {Function} random Transaction-owned uniform generator.
 * @param {number} age Actual crop age.
 * @return {Stack[]} Finite actual loot groups.
 */
export function rolledDrops(block: string, tool: Stack | null, rules: Rules, random: () => number, age = 7): Stack[] {
    const result: Stack[] = [];
    for (const drop of potentialDrops(block, tool, rules, undefined, age)) {
        if (drop.chance < 1 && random() >= drop.chance) continue;
        let count = 1;
        for (const raw of drop.modifiers) {
            const modifier = raw as any;
            if (modifier.type === 'minecraft:explosion_decay') continue;
            if (modifier.type !== 'minecraft:apply_bonus') throw Error('unsupported-loot-modifier');
            const level = Number((tool?.components?.['minecraft:enchantments'] as Record<string, number>|undefined)?.[modifier.enchantment] ?? 0);
            if (modifier.formula === 'minecraft:binomial_with_bonus_count') {
                for (let i = 0; i < level + modifier.parameters.extra; i++) if (random() < modifier.parameters.probability) count++;
            } else if (modifier.formula === 'minecraft:uniform_bonus_count') count += Math.floor(random() * (modifier.parameters.bonusMultiplier * level + 1));
            else if (modifier.formula === 'minecraft:ore_drops') {if (level) count *= Math.max(0, Math.floor(random() * (level + 2)) - 1) + 1;}
            else throw Error('unsupported-loot-bonus');
        }
        if (count) result.push({id: drop.id, count});
    }
    return result;
}
