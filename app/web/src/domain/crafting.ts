/** Approved D05 complete-batch acquisition and directory remainder returns, independent of screens and storage. */
import {findCrafting} from '../rules/matcher.ts';
import type {Rules, Stack} from '../rules/types.ts';
import {validateCarriers, validateStack, cell, playerTargets} from './inventory.ts';
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

/** Plan whole batches against finite targets, retaining ingredient stacks and returning remainders to the infinite directory.
 * @param {InventoryState} current Player carriers and optional workbench inputs.
 * @param {CraftTake} take Explicit result acquisition operation.
 * @param {string[]} unlocked Latest permanent acquisition facts.
 * @param {Rules} rules Verified runtime recipes and components.
 * @return {CraftReceipt} Transaction-local carriers, ordered acquisitions and bounded return facts.
 */
export function takeCraft(current: InventoryState, take: CraftTake, unlocked: string[], rules: Rules): CraftReceipt {
    validateCarriers(current, unlocked, rules);
    if (!['cursor', 'shift', 'hotbar', 'offhand'].includes(take.mode)) throw Error('invalid-craft-operation');
    const inventory = structuredClone(current), grid = inventory.workbench ?? inventory.crafting;
    if (!grid) throw Error('invalid-crafting-grid');
    const match = findCrafting(grid, inventory.workbench ? 3 : 2, rules);
    if (!match) throw Error('craft-no-match');
    const result = carrierResult(match.result, rules),
        acquired = [result.id, ...match.remainders.flatMap(s => s ? [s.id] : [])].filter((id, i, all) => all.indexOf(id) === i),
        eligible = [...new Set([...unlocked, ...acquired])];
    validateStack(result, eligible, rules);
    for (const s of match.remainders) validateStack(s, eligible, rules);
    let targets: SlotValue[];
    if (take.mode === 'shift') targets = playerTargets(inventory, true);
    else if (take.mode === 'hotbar') {
        if (!Number.isInteger(take.index) || take.index! < 0 || take.index! > 8) throw Error('invalid-hotbar-index');
        targets = [cell(inventory, `hotbar:${take.index!}`)];
    } else if (take.mode === 'offhand') targets = [cell(inventory, 'equipment:offhand')];
    else targets = [{
            /** Read the carried group. @return {Stack|null} Current cursor. */get stack() {
                return inventory.cursor;
            }, /** Set the carried group. @param {Stack|null} s Whole-batch result. */set stack(s) {
                inventory.cursor = s;
            }, policy: {take: true, place: true}
        }];
    const free = targets.reduce((sum, slot) => sum + (!slot.stack || sameStack(slot.stack, result, rules) ? Math.max(0, capacity(slot, result, rules) - (slot.stack?.count ?? 0)) : 0), 0),
        batches = take.mode === 'shift' ? Math.floor(free / result.count) : free >= result.count ? 1 : 0;
    if (!batches) throw Error('craft-target-full');
    // Every batch contributes at least one item into at most nine native bounded destinations.
    for (let i = 0; i < batches; i++) {
        const source: SlotValue = {stack: structuredClone(result), policy: {take: true, place: false}};
        quickMove(source, targets, rules);
        if (source.stack) throw Error('craft-incomplete-batch');
    }
    const returned: Stack[] = [];
    for (const s of match.remainders) {
        if (!s) continue;
        const known = returned.find(v => sameStack(v, s, rules));
        if (known) known.count += s.count * batches; else returned.push({
            ...structuredClone(s),
            count: s.count * batches
        });
    }
    validateCarriers(inventory, eligible, rules);
    return {inventory, acquired, batches, returned, recipe: match.recipe};
}
