/** Isolated placement experiment fixtures; not production Minecraft data. */

/** Small item sample used to exercise routing, capacity, and permanent unlocks. */
export const ITEMS = Object.freeze({
  oak_log: {max: 64, fuel: 300}, stick: {max: 64, fuel: 100},
  coal: {max: 64, fuel: 1600}, charcoal: {max: 64, fuel: 1600},
  wooden_pickaxe: {max: 1, fuel: 200}, stone_pickaxe: {max: 1},
  raw_iron: {max: 64}, iron_ingot: {max: 64}, iron_nugget: {max: 64},
  iron_chestplate: {max: 1}, cobblestone: {max: 64}, stone: {max: 64},
  smooth_stone: {max: 64}, bucket: {max: 16}, water_bucket: {max: 1},
  crafting_table: {max: 64}, furnace: {max: 64}, blast_furnace: {max: 64},
  hopper: {max: 64}, wheat_seeds: {max: 64}, wheat: {max: 64},
});

/** Device slot counts, shared by both placement policies. */
export const DEVICES = Object.freeze({crafting_table: 9, furnace: 3, blast_furnace: 3, hopper: 5});

/** Sample cooking rules; the experiment deliberately has no recipe database. */
export const RECIPES = Object.freeze({
  raw_iron: {result: 'iron_ingot', fast: true},
  iron_chestplate: {result: 'iron_nugget', fast: true},
  oak_log: {result: 'charcoal', fast: false},
  cobblestone: {result: 'stone', fast: false},
  stone: {result: 'smooth_stone', fast: false},
});

/** Fixed scene dimensions: horizontal x, upward y, and two depth layers z. */
export const SIZE = Object.freeze([7, 5, 2]);

/** Logical directions; hoppers cannot point upward. */
export const VECTORS = Object.freeze({
  east: [1, 0, 0], west: [-1, 0, 0],
  up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1]
});

/** Incoming face opposite to the direction of travel. */
export const OPPOSITE = Object.freeze({
  east: 'west', west: 'east', up: 'down',
  down: 'up', north: 'south', south: 'north'
});

/** Valid outlet orientations in this experiment. */
export const FACINGS = Object.freeze(['down', 'east', 'south', 'west', 'north']);

/** Author-assigned A slots include one bench and two replaceable cooking positions. */
export const FIXED_SLOTS = Object.freeze([
  {pos: [0, 1, 0], types: ['crafting_table']},
  {pos: [3, 2, 0], types: ['furnace', 'blast_furnace']},
  {pos: [5, 2, 0], types: ['furnace', 'blast_furnace']},
]);

/** Source templates are independent of player-created instances. */
export const SOURCES = Object.freeze([
  {id: 'iron-a', item: 'raw_iron', pos: [5, 0, 0], tool: 'stone_pickaxe'},
  {id: 'iron-b', item: 'raw_iron', pos: [6, 0, 0], tool: 'stone_pickaxe'},
  {id: 'tree', item: 'oak_log', pos: [4, 0, 0], tool: null},
  {id: 'coal', item: 'coal', pos: [3, 0, 0], tool: 'wooden_pickaxe'},
  {id: 'stone', item: 'cobblestone', pos: [2, 0, 0], tool: 'wooden_pickaxe'},
]);

/** Necessary story/crop positions stay separate from the placement topology. */
export const PROTECTED = Object.freeze([
  {id: 'farmland', pos: [6, 0, 1]}, {id: 'cake-table', pos: [5, 0, 1]},
]);

/** Explicit debug grants make construction possible without implementing the game. */
export const DEBUG_UNLOCKS = Object.freeze(['crafting_table', 'furnace', 'blast_furnace',
  'hopper', 'raw_iron', 'coal', 'stick', 'oak_log', 'bucket', 'water_bucket',
  'wooden_pickaxe', 'stone_pickaxe', 'iron_chestplate', 'cobblestone', 'stone', 'wheat_seeds']);

/** Convert a logical cell to a stable index key.
 * @param {number[]} pos Cell coordinates.
 * @return {string} Stable key.
 */
export function key(pos) {
  return pos.join(',');
}

/** Check coordinates against the bounded fixture.
 * @param {number[]} pos Cell coordinates.
 * @return {boolean} Whether the cell exists.
 */
export function inBounds(pos) {
  return Array.isArray(pos) && pos.length === 3
      && pos.every((v, i) => Number.isInteger(v) && v >= 0 && v < SIZE[i]);
}

/** Return a neighboring cell without imposing world physics.
 * @param {number[]} pos Starting cell.
 * @param {string} direction Logical direction.
 * @return {number[]} Neighbor cell.
 */
export function adjacent(pos, direction) {
  return pos.map((v, i) => v + VECTORS[direction][i]);
}

/** Look up the sample cooking recipe for a device/input pair.
 * @param {object} entity Device instance.
 * @return {object|null} Supported recipe, or null for an inert input.
 */
export function recipeFor(entity) {
  if (!['furnace', 'blast_furnace'].includes(entity.type)) return null;
  const recipe = RECIPES[entity.slots[0]?.item];
  return recipe && (entity.type === 'furnace' || recipe.fast) ? recipe : null;
}
