/** Finite native crafting consumption and remainder delivery, independent of screens and storage. */
import {findCrafting} from '../rules/matcher.ts';
import type {Rules, Stack} from '../rules/types.ts';
import {validateCarriers, validateStack, cell, playerTargets, storeAcquired} from './inventory.ts';
import type {InventoryState} from './inventory.ts';
import {capacity, sameStack, quickMove} from './slots.ts';
import type {SlotValue} from './slots.ts';

export type CraftTake = { mode: 'cursor' | 'shift' | 'hotbar' | 'offhand'; index?: number };

export interface CraftReceipt {
    inventory: InventoryState;
    acquired: string[];
    batches: number;
    returned: Stack[];
    recipe?: string;
}

/** Remove only verified redundant default components; unsupported overrides remain visible validation errors.
 * @param {Stack} stack Native matcher result.
 * @param {Rules} rules Same-version defaults.
 * @return {Stack} Equivalent carrier representation.
 */
export function carrierResult(stack: Stack, rules: Rules): Stack {
    const value = structuredClone(stack), components = value.components;
    if (components && Object.hasOwn(components, 'minecraft:max_damage') && components['minecraft:max_damage'] === rules.items[value.id]?.maxDamage) delete components['minecraft:max_damage'];
    if (components && !Object.keys(components).length) delete value.components;
    return value;
}

/** Consume complete batches and deliver automatic results/remainders hotbar-first before accepting an atomic receipt.
 * @param {InventoryState} current Player carriers and current recipe inputs.
 * @param {CraftTake} take Explicit result route.
 * @param {string[]} unlocked Permanent acquisition facts.
 * @param {Rules} rules Verified recipes, capacities and components.
 * @return {CraftReceipt} Finite transaction-local delivery, consumption and remainder facts.
 */
export function takeCraft(current: InventoryState, take: CraftTake, unlocked: string[], rules: Rules): CraftReceipt {
    validateCarriers(current, unlocked, rules);
    if (!['cursor', 'shift', 'hotbar', 'offhand'].includes(take.mode)) throw Error('invalid-craft-operation');
    let inventory = structuredClone(current), batches = 0, firstError = 'craft-no-match';
    const acquired: string[] = [], returned: Stack[] = [];
    let recipe: string | undefined;
    for (let attempt = 0; attempt < 64; attempt++) {
        const next = structuredClone(inventory), grid = next.workbench ?? next.crafting;
        if (!grid) throw Error('invalid-crafting-grid');
        const match = findCrafting(grid, next.workbench ? 3 : 2, rules);
        if (!match || recipe && match.recipe !== recipe) break;
        const result = carrierResult(match.result, rules), ids = [result.id, ...match.remainders.flatMap(s => s ? [s.id] : [])], eligible = [...new Set([...unlocked, ...acquired, ...ids])];
        validateStack(result, eligible, rules);
        let targets: SlotValue[];
        if (take.mode === 'shift') targets = playerTargets(next, true);
        else if (take.mode === 'hotbar') {
            if (!Number.isInteger(take.index) || take.index! < 0 || take.index! > 8) throw Error('invalid-hotbar-index');
            targets = [cell(next, `hotbar:${take.index!}`)];
        } else if (take.mode === 'offhand') targets = [cell(next, 'equipment:offhand')];
        else targets = [{
            /** Read the transaction-local cursor. @return {Stack|null} Current staged group. */
            get stack() {return next.cursor;},
            /** Stage one finite cursor group. @param {Stack|null} s Compatible result group. */
            set stack(s: Stack | null) {next.cursor = s;},
            policy: {take: true, place: true}
        }];
        const free = targets.reduce((n, slot) => n + (!slot.stack || sameStack(slot.stack, result, rules) ? Math.max(0, capacity(slot, result, rules) - (slot.stack?.count ?? 0)) : 0), 0);
        if (free < result.count) {firstError = 'craft-target-full'; break;}
        const output: SlotValue = {stack: structuredClone(result), policy: {take: true, place: false}};
        if (take.mode === 'shift') storeAcquired(output, next, rules, true); else quickMove(output, targets, rules);
        if (output.stack) throw Error('craft-incomplete-batch');
        let overflow = false;
        for (const i of match.used) {
            const input = grid[i]!; grid[i] = input.count > 1 ? {...input, count: input.count - 1} : null;
            const remainder = match.remainders[i];
            if (!remainder) continue;
            validateStack(remainder, eligible, rules);
            if (!grid[i]) grid[i] = structuredClone(remainder);
            else if (sameStack(grid[i]!, remainder, rules) && grid[i]!.count + remainder.count <= rules.items[remainder.id].maxStack) grid[i]!.count += remainder.count;
            else {
                const source: SlotValue = {stack: structuredClone(remainder), policy: {take: true, place: false}};
                storeAcquired(source, next, rules);
                if (source.stack) overflow = true;
            }
        }
        if (overflow) {firstError = 'craft-remainder-full'; break;}
        validateCarriers(next, eligible, rules);
        inventory = next; batches++; recipe = match.recipe;
        acquired.push(...ids.filter(id => !acquired.includes(id)));
        for (const remainder of match.remainders) if (remainder) {
            const prior = returned.find(s => sameStack(s, remainder, rules));
            if (prior) prior.count += remainder.count; else returned.push(structuredClone(remainder));
        }
        if (take.mode !== 'shift') break;
    }
    if (!batches) throw Error(firstError);
    return {inventory, acquired, returned, batches, recipe};
}
