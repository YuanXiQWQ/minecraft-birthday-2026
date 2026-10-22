/** Java 26.3 strength and tool timing for the finite authored harvest/device profile. */
import type {Rules, Stack} from '../rules/types.ts';

/** Verified Blocks registration strengths, independent from blast resistance and drop qualification. */
export const STRENGTH: Record<string, number> = {
    oak_log: 2,
    stone: 1.5,
    coal_ore: 3,
    iron_ore: 3,
    crafting_table: 2.5,
    furnace: 3.5,
    blast_furnace: 3.5,
    hopper: 3,
    short_grass: 0,
    sugar_cane: 0,
    wheat: 0
};

/** Compute grounded, unenchanted mining ticks; tool speed and correct-drop permission are separate native predicates.
 * @param {string} block Unnamespaced supported block.
 * @param {Stack|null} held Current selected actual tool.
 * @param {Rules} rules Native components and block tags.
 * @return {number} Required active 20Hz ticks, including the native final discrete tick.
 */
export function miningTicks(block: string, held: Stack | null, rules: Rules): number {
    const hardness = STRENGTH[block];
    if (hardness === undefined) throw Error('unsupported-mining-block');
    if (!hardness) return 0;
    const id = 'minecraft:' + block, tool = held && rules.items[held.id]?.tool,
        requires = ['stone', 'coal_ore', 'iron_ore', 'furnace', 'blast_furnace', 'hopper'].includes(block),
        correct = !requires || !!tool && tool.role === 'pickaxe' && !rules.blockTags[tool.incorrect]?.includes(id),
        effective = !!tool && rules.blockTags['minecraft:mineable/' + tool.role]?.includes(id),
        speed = effective ? tool!.speed : 1;
    return Math.ceil(hardness * (correct ? 30 : 100) / speed);
}
