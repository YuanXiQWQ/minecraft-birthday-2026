/** Native recipe previews are read-only projections; D05 acquisition is a separate command. */
import {findCrafting} from '../rules/matcher.ts';
import type {Rules, Stack} from '../rules/types.ts';

export type CraftingPreview =
    { status: 'empty'; result: null }
    | { status: 'matched'; recipe: string; result: Stack }
    | { status: 'unavailable'; reason: string; result: null };

/** Derive a native 2x2 or 3x3 output independently of acquisition, discovery, consumption and remainder policy.
 * @param {(Stack|null)[]} grid Personal or instance inputs in row-major order.
 * @param {Rules} rules Existing same-version runtime rules.
 * @param {2|3} width Native menu width.
 * @return {CraftingPreview} Result facts or an explicit unsupported-data state, without mutating inputs.
 */
export function personalPreview(grid: (Stack | null)[], rules: Rules, width: 2 | 3 = 2): CraftingPreview {
    if (grid.length !== width * width) return {status: 'unavailable', reason: 'invalid-personal-grid', result: null};
    if (grid.every(s => s === null)) return {status: 'empty', result: null};
    try {
        const match = findCrafting(grid, width, rules);
        return match ? {
            status: 'matched',
            recipe: match.recipe,
            result: structuredClone(match.result)
        } : {status: 'empty', result: null};
    } catch (error) {
        return {
            status: 'unavailable',
            reason: error instanceof Error ? error.message : 'preview-unavailable',
            result: null
        };
    }
}
