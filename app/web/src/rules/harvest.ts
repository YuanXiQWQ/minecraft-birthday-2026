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
