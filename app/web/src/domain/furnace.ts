/** Deterministic native cooking state, finite output acquisition and sided container policies. */
import native from '../data/processing-rules.json' with {type: 'json'};
import type {Rules, Stack, Recipe} from '../rules/types.ts';
import {matchCooking} from '../rules/matcher.ts';
import {cooking} from '../rules/process.ts';
import {validateStack, validateCarriers, cell, reduceInventory, playerTargets, storeAcquired} from './inventory.ts';
import type {InventoryState, InventoryCommand} from './inventory.ts';
import {sameStack, quickMove} from './slots.ts';
import type {SlotValue} from './slots.ts';
import type {CraftReceipt, CraftTake} from './crafting.ts';

export type FurnaceKind = 'furnace' | 'blast_furnace';

export interface FurnaceData {
    input: Stack | null;
    fuel: Stack | null;
    output: Stack | null;
    burn: number;
    burnTotal: number;
    cook: number;
    cookTotal: number;
    recipe: string | null;
    speed: number;
    outputRecipe: string | null;
}

export interface FurnaceContents {
    version: 2;
    data: FurnaceData;
}

export type FurnaceTake = CraftTake & { button?: 0 | 2 };

/** Allocate an unlit empty instance without wall-clock or offline timestamps.
 * @return {FurnaceContents} Explicit persistent processing contract.
 */
export function emptyFurnace(): FurnaceContents {
    return {
        version: 2,
        data: {
            input: null,
            fuel: null,
            output: null,
            burn: 0,
            burnTotal: 0,
            cook: 0,
            cookTotal: 200,
            recipe: null,
            speed: 1,
            outputRecipe: null
        }
    };
}

/** Materialize the native result, retaining its complete explicit component identity.
 * @param {Recipe} recipe Native cooking recipe.
 * @return {Stack} Finite produced batch.
 */
export function cookingResult(recipe: Recipe): Stack {
    if (!recipe.result?.id) throw Error('unsupported-cooking-result');
    return structuredClone({...recipe.result, id: recipe.result.id, count: recipe.result.count ?? 1});
}

/** Validate producer-owned output without granting the item to ordinary carriers.
 * @param {FurnaceData} data Producer state.
 * @param {FurnaceKind} kind Native processing capability.
 * @param {Rules} rules Audited recipes and components.
 */
export function validateOutput(data: FurnaceData, kind: FurnaceKind, rules: Rules): void {
    if (!data.output) {
        if (data.outputRecipe !== null) throw Error('invalid-output-provenance');
        return;
    }
    const r = rules.recipes.find(r => r.id === data.outputRecipe && r.type === (kind === 'furnace' ? 'minecraft:smelting' : 'minecraft:blasting'));
    if (!r || !sameStack(cookingResult(r), data.output, rules)) throw Error('invalid-output-provenance');
    validateStack(data.output, [data.output.id], rules);
}

/** Validate exact producer fields, bounded timers and independently validated locked output provenance.
 * @param {FurnaceContents} contents Serialized device contract.
 * @param {FurnaceKind} kind Native device.
 * @param {string[]} unlocked Acquired input/fuel identities.
 * @param {Rules} rules Same-version data.
 */
export function validateFurnace(contents: FurnaceContents, kind: FurnaceKind, unlocked: string[], rules: Rules): void {
    const d = contents?.data;
    if (contents?.version !== 2 || Object.keys(contents).sort().join('|') !== 'data|version' || !d || Object.keys(d).sort().join('|') !== 'burn|burnTotal|cook|cookTotal|fuel|input|output|outputRecipe|recipe|speed') throw Error('invalid-furnace');
    for (const n of [d.burn, d.burnTotal, d.cook, d.cookTotal]) if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000) throw Error('invalid-furnace-timer');
    if (d.cookTotal < 1 || d.burn > d.burnTotal || d.cook > d.cookTotal || !Number.isFinite(d.speed) || d.speed <= 0 || d.speed > 100) throw Error('invalid-furnace-timer');
    validateStack(d.input, unlocked, rules);
    validateStack(d.fuel, unlocked, rules);
    if (d.fuel && !rules.items[d.fuel.id]?.fuel && d.fuel.id !== 'minecraft:bucket') throw Error('invalid-furnace-fuel');
    const expected = d.input && matchCooking(d.input, kind, rules);
    if (d.recipe !== (expected?.id ?? null) || d.cookTotal !== (expected ? Math.ceil(expected.cookingtime! / d.speed) : 200)) throw Error('invalid-furnace-recipe');
    validateOutput(d, kind, rules);
}

/** Reset input progress on a native identity change, leaving existing fire independent of references.
 * @param {FurnaceData} data Mutable device.
 * @param {Stack|null} before Previous input.
 * @param {FurnaceKind} kind Capability.
 * @param {Rules} rules Audited recipes.
 */
export function inputChanged(data: FurnaceData, before: Stack | null, kind: FurnaceKind, rules: Rules): void {
    if (before && data.input && sameStack(before, data.input, rules)) return;
    const r = data.input && matchCooking(data.input, kind, rules);
    data.cook = 0;
    data.recipe = r?.id ?? null;
    data.cookTotal = r ? Math.ceil(r.cookingtime! / data.speed) : 200;
}

/** Advance exact 20Hz native branches; a large step is identical to repeated single ticks.
 * @param {FurnaceContents} contents Current immutable instance.
 * @param {FurnaceKind} kind Native device context.
 * @param {number} ticks Deterministic elapsed ticks, never render frames.
 * @param {Rules} rules P4 numeric providers and recipes.
 * @return {{contents:FurnaceContents,returned:string[]}} New instance and actual ignition remainders returned by D05-A.
 */
export function tickFurnace(contents: FurnaceContents, kind: FurnaceKind, ticks: number, rules: Rules): {
    contents: FurnaceContents;
    returned: string[]
} {
    const next = structuredClone(contents);
    return {contents: next, returned: advanceFurnace(next, kind, ticks, rules)};
}

/** Advance a producer owned exclusively by an already cloned domain transaction; callers must never pass a saved snapshot.
 * @param {FurnaceContents} contents Transaction-local mutable producer.
 * @param {FurnaceKind} kind Native capability.
 * @param {number} ticks Bounded deterministic native ticks.
 * @param {Rules} rules Verified contextual data.
 * @return {string[]} Ignition remainder acquisition facts.
 */
export function advanceFurnace(contents: FurnaceContents, kind: FurnaceKind, ticks: number, rules: Rules): string[] {
    if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 1200) throw Error('invalid-processing-step');
    const d = contents.data, returned: string[] = [];
    for (let i = 0; i < ticks; i++) {
        if (d.burn > 0) d.burn--;
        let lit = d.burn > 0;
        if (lit || d.fuel && d.input) {
            if (d.input) {
                const r = matchCooking(d.input, kind, rules);
                if (r) {
                    d.recipe = r.id;
                    const result = cookingResult(r),
                        can = (!d.output && result.count <= rules.items[result.id].maxStack) || !!d.output && sameStack(d.output, result, rules) && d.output.count + result.count <= rules.items[result.id].maxStack;
                    if (can) {
                        if (!lit) {
                            const time = d.fuel && cooking(d.fuel.id, kind, r.cookingtime!, rules);
                            if (time) {
                                const fraction = d.cookTotal > 0 && d.cook < d.cookTotal ? d.cook / d.cookTotal : 0;
                                d.burn = d.burnTotal = time.burnTicks;
                                d.speed = time.speed;
                                d.cookTotal = time.cookTicks;
                                d.cook = Math.ceil(fraction * d.cookTotal);
                                lit = true;
                                const remainder = rules.items[d.fuel!.id].remainder;
                                d.fuel = d.fuel!.count > 1 ? {
                                    ...d.fuel!,
                                    count: d.fuel!.count - 1
                                } : remainder ? {id: remainder, count: 1} : null;
                                if (remainder && !returned.includes(remainder)) returned.push(remainder);
                            }
                        }
                        if (lit) {
                            d.cook++;
                            if (d.cook >= d.cookTotal) {
                                d.cook = 0;
                                d.cookTotal = Math.ceil(r.cookingtime! / d.speed);
                                d.output = {...result, count: (d.output?.count ?? 0) + result.count};
                                d.outputRecipe = r.id;
                                d.input = d.input.count > 1 ? {...d.input, count: d.input.count - 1} : null;
                                if (!d.input) {
                                    d.recipe = null;
                                    d.cookTotal = 200;
                                }
                            }
                        } else d.cook = 0;
                    } else d.cook = 0;
                }
            } else d.cook = 0;
        } else if (d.cook > 0) d.cook = Math.max(0, d.cook - 2);
    }
    return returned;
}

/** Expose native face slots, separate from whether an ingredient can cook.
 * @param {'up'|'down'|'side'} face Container side.
 * @return {number[]} Native input=0, fuel=1, output=2 indices.
 */
export function furnacePorts(face: 'up' | 'down' | 'side'): number[] {
    return face === 'up' ? [0] : face === 'down' ? [2, 1] : [1];
}

/** Determine sided insertion/extraction permission without creating a transfer or unlock.
 * @param {FurnaceData} data Current contents.
 * @param {'up'|'down'|'side'} face Access side.
 * @param {number} index Native slot index.
 * @param {Stack} stack Incoming or extracted group.
 * @param {'insert'|'extract'} action Operation kind.
 * @param {Rules} rules Native components and tags.
 * @return {boolean} Whether that face permits the operation.
 */
export function furnacePortAllows(data: FurnaceData, face: 'up' | 'down' | 'side', index: number, stack: Stack, action: 'insert' | 'extract', rules: Rules): boolean {
    if (!furnacePorts(face).includes(index)) return false;
    if (action === 'extract') return !(face === 'down' && index === 1) || native.itemTags['minecraft:furnace_fuel_bottom_takeable']?.includes(stack.id);
    return index === 0 || index === 1 && (!!rules.items[stack.id]?.fuel || stack.id === 'minecraft:bucket' && data.fuel?.id !== 'minecraft:bucket');
}

/** Move finite output into explicit targets or hotbar-first Shift delivery; caller commits output and acquisition atomically.
 * @param {InventoryState} current Player carriers, excluding producer slots.
 * @param {FurnaceContents} contents Valid producer-owned output.
 * @param {FurnaceTake} take Finite destination and optional right split.
 * @param {string[]} unlocked Existing facts.
 * @param {Rules} rules Original capacities.
 * @return {{contents:FurnaceContents,receipt:CraftReceipt}} Atomic plan with no side effects.
 */
export function takeFurnace(current: InventoryState, contents: FurnaceContents, take: FurnaceTake, unlocked: string[], rules: Rules): {
    contents: FurnaceContents;
    receipt: CraftReceipt
} {
    validateCarriers(current, unlocked, rules);
    const inventory = structuredClone(current), next = structuredClone(contents), s = next.data.output;
    if (!s) throw Error('furnace-output-empty');
    if (!['cursor', 'shift', 'hotbar', 'offhand'].includes(take.mode) || take.button !== undefined && ![0, 2].includes(take.button)) throw Error('invalid-furnace-take');
    let targets: SlotValue[];
    if (take.mode === 'shift') targets = playerTargets(inventory, true); else if (take.mode === 'hotbar') {
        if (!Number.isInteger(take.index) || take.index! < 0 || take.index! > 8) throw Error('invalid-hotbar-index');
        targets = [cell(inventory, `hotbar:${take.index!}`)];
    } else if (take.mode === 'offhand') targets = [cell(inventory, 'equipment:offhand')]; else targets = [{
        /** Read cursor. @return {Stack|null} Carried group. */get stack() {
            return inventory.cursor;
        }, /** Write cursor. @param {Stack|null} value Transferred group. */set stack(value) {
            inventory.cursor = value;
        }, policy: {take: true, place: true}
    }];
    if ((take.mode === 'hotbar' || take.mode === 'offhand') && targets[0].stack) throw Error('craft-target-full');
    const offered = take.mode === 'cursor' && !inventory.cursor && take.button === 2 ? Math.ceil(s.count / 2) : s.count,
        source: SlotValue = {stack: {...s, count: offered}, policy: {take: true, place: false}};
    if (take.mode === 'shift') storeAcquired(source, inventory, rules, true); else quickMove(source, targets, rules);
    const moved = offered - (source.stack?.count ?? 0);
    if (!moved) throw Error('craft-target-full');
    next.data.output = s.count === moved ? null : {...s, count: s.count - moved};
    if (!next.data.output) next.data.outputRecipe = null;
    validateCarriers(inventory, [...unlocked, s.id], rules);
    return {contents: next, receipt: {inventory, acquired: [s.id], batches: 0, returned: []}};
}

/** Route finite Shift moves through native recipe-before-fuel priority, keeping all other operations in the shared reducer.
 * Bulk player transfers stay in their source section so newly filled receiving slots are not moved back.
 * @param {InventoryState} current Carriers with two instance input slots.
 * @param {InventoryCommand} command Semantic operation.
 * @param {string[]} unlocked Permanent facts.
 * @param {Rules} rules Audited native rules.
 * @param {FurnaceKind} kind Device capability.
 * @return {InventoryState} Independent, validated carrier result.
 */
export function reduceFurnaceInventory(current: InventoryState, command: InventoryCommand, unlocked: string[], rules: Rules, kind: FurnaceKind): InventoryState {
    if (command.type !== 'quick' && command.type !== 'quick-all') return reduceInventory(current, command, unlocked, rules);
    validateCarriers(current, unlocked, rules);
    const v = structuredClone(current), ref = command.slot,
        selected = command.type === 'quick-all' ? command.match ?? cell(v, ref).stack : cell(v, ref).stack;
    if (!selected) return v;
    const refs = command.type === 'quick' ? [ref] : ref.startsWith('machine:') ? ['machine:0', 'machine:1'] as const : ref.startsWith('backpack:') ? Array.from({length: 27}, (_, i) => `backpack:${i}` as const) : Array.from({length: 9}, (_, i) => `hotbar:${i}` as const);
    for (const sourceRef of refs) {
        const source = cell(v, sourceRef), s = source.stack;
        if (!s || !sameStack(s, selected, rules)) continue;
        const destinations = sourceRef.startsWith('machine:') ? playerTargets(v, true) : matchCooking(s, kind, rules) ? [cell(v, 'machine:0')] : rules.items[s.id]?.fuel ? [cell(v, 'machine:1')] : sourceRef.startsWith('backpack:') ? Array.from({length: 9}, (_, i) => cell(v, `hotbar:${i}`)) : Array.from({length: 27}, (_, i) => cell(v, `backpack:${i}`));
        quickMove(source, destinations, rules);
    }
    validateCarriers(v, unlocked, rules);
    return v;
}

/** Plan a finite sided insertion for a future locked source/destination transaction; this function never copies an infinite reference.
 * @param {FurnaceContents} contents Device contents.
 * @param {FurnaceKind} kind Device capability.
 * @param {'up'|'down'|'side'} face Insertion face.
 * @param {Stack} incoming Actual finite source group.
 * @param {Rules} rules Same-version port policies.
 * @return {{contents:FurnaceContents,remainder:Stack|null,moved:number}} Pure transfer plan; caller must atomically commit the source decrease too.
 */
export function insertFurnacePort(contents: FurnaceContents, kind: FurnaceKind, face: 'up' | 'down' | 'side', incoming: Stack, rules: Rules): {
    contents: FurnaceContents;
    remainder: Stack | null;
    moved: number
} {
    validateStack(incoming, [incoming.id], rules);
    const next = structuredClone(contents),
        source: SlotValue = {stack: structuredClone(incoming), policy: {take: true, place: false}},
        before = next.data.input;
    const destinations = furnacePorts(face).filter(i => furnacePortAllows(next.data, face, i, incoming, 'insert', rules)).map(i => ({
        /** Read native port. @return {Stack|null} Input or fuel. */get stack() {
            return i === 0 ? next.data.input : next.data.fuel;
        }, /** Write accepted finite content. @param {Stack|null} value New port group. */set stack(value) {
            if (i === 0) next.data.input = value; else next.data.fuel = value;
        }, policy: {take: true, place: true}
    }));
    quickMove(source, destinations, rules);
    inputChanged(next.data, before, kind, rules);
    return {contents: next, remainder: source.stack, moved: incoming.count - (source.stack?.count ?? 0)};
}

/** Plan finite extraction without granting a permanent fact until a later successful destination transaction.
 * @param {FurnaceContents} contents Source producer.
 * @param {'up'|'down'|'side'} face Source face.
 * @param {number} index Native slot.
 * @param {number} count Bounded transfer limit.
 * @param {FurnaceKind} kind Device context.
 * @param {Rules} rules Same-version native policy.
 * @return {{contents:FurnaceContents,stack:Stack|null}} Pure plan, never itself an acquisition.
 */
export function extractFurnacePort(contents: FurnaceContents, face: 'up' | 'down' | 'side', index: number, count: number, kind: FurnaceKind, rules: Rules): {
    contents: FurnaceContents;
    stack: Stack | null
} {
    if (!Number.isSafeInteger(count) || count < 1 || count > 64) throw Error('invalid-transfer-count');
    const next = structuredClone(contents), key = index === 0 ? 'input' : index === 1 ? 'fuel' : 'output',
        s = next.data[key];
    if (!s || !furnacePortAllows(next.data, face, index, s, 'extract', rules)) return {contents: next, stack: null};
    const moved = Math.min(s.count, count), before = next.data.input;
    next.data[key] = moved === s.count ? null : {...s, count: s.count - moved};
    if (!next.data.output) next.data.outputRecipe = null;
    if (index === 0) inputChanged(next.data, before, kind, rules);
    return {contents: next, stack: {...s, count: moved}};
}
