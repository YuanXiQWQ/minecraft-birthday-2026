/** UI-facing projections reuse the domain's bounded carriers without embedding durable mutations in rendering. */
import type {State} from '../domain/types.ts';
import type {Rules} from '../rules/types.ts';
import {catalogue} from '../domain/state.ts';
import {reduceInventory, validateCarriers} from '../domain/inventory.ts';
import type {InventoryState, InventoryCommand} from '../domain/inventory.ts';

export {emptyInventory} from '../domain/inventory.ts';
export type {InventoryState, InventoryCommand, EquipmentSlot, SlotRef} from '../domain/inventory.ts';

/** Validate runtime carriers against authoritative facts and native predicates.
 * @param {InventoryState} value Runtime carriers.
 * @param {State} permanent Durable facts.
 * @param {Rules} rules Native item rules.
 */
export function validateInventory(value: InventoryState, permanent: State, rules: Rules): void {
    validateCarriers(value, permanent.progress.unlocked, rules);
}

/** Read fixed primary cells and first-acquired side items without changing unlocks.
 * @param {State} permanent Durable facts.
 * @return {{item:string,unlocked:boolean}[]} Display projection.
 */
export function directory(permanent: State): { item: string; unlocked: boolean }[] {
    return catalogue(permanent);
}

/** Run the same domain reducer used inside durable transactions.
 * @param {InventoryState} value Runtime carriers.
 * @param {InventoryCommand} command Semantic intent.
 * @param {State} permanent Durable facts.
 * @param {Rules} rules Native item rules.
 * @return {InventoryState} Independent carriers.
 */
export function inventoryCommand(value: InventoryState, command: InventoryCommand, permanent: State, rules: Rules): InventoryState {
    return reduceInventory(value, command, permanent.progress.unlocked, rules);
}

/** Route basic keys without stealing editable focus or browser/OS modifier chords.
 * @param {string} code Physical DOM code.
 * @param {boolean} editing Editable focus owner.
 * @param {boolean} modified Browser/OS modifier chord.
 * @return {'inventory'|'escape'|number|null} Base intent.
 */
export function inventoryKey(code: string, editing: boolean, modified: boolean): 'inventory' | 'escape' | number | null {
    if (editing || modified) return null;
    if (code === 'KeyE') return 'inventory';
    if (code === 'Escape') return 'escape';
    if (/^Digit[1-9]$/.test(code)) return Number(code.at(-1)) - 1;
    return null;
}

/** Reserve the native tooltip outer margin including nine-slice borders.
 * @param {number[]} widths Native font widths.
 * @return {{width:number,height:number}} Logical pixel bounds.
 */
export function tooltipBox(widths: number[]): { width: number; height: number } {
    if (!widths.length || widths.some(w => !Number.isFinite(w) || w < 0)) throw Error('invalid-tooltip-lines');
    return {width: Math.max(...widths) + 24, height: 8 + (widths.length - 1) * 12 + 24};
}
