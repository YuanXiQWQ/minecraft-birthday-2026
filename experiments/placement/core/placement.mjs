/** Placement policies and a hand-authored fixture safety proof; not the P4 closure engine. */
import {FIXED_SLOTS, ITEMS, PROTECTED, SIZE, SOURCES, inBounds, key} from './definitions.mjs';

/** Index an instance by its logical coordinates.
 * @param {object} state Experiment state.
 * @param {number[]} pos Cell to inspect.
 * @return {object|undefined} Occupant.
 */
export function at(state, pos) {
  return Object.values(state.entities).find(e => key(e.pos) === key(pos));
}

/** Enumerate permitted work cells for the current fixture, independent of occupancy.
 * @param {object} state Experiment state.
 * @return {number[][]} Work cells.
 */
export function buildCells(state) {
  if (state.mode === 'A') return FIXED_SLOTS.map(s => s.pos);
  if (state.fixture === 'tight') return [[0, 1, 0], [1, 1, 0]];
  const cells = [];
  for (let x = 0; x < SIZE[0]; x++) for (let y = 0; y < SIZE[1]; y++)
    for (let z = 0; z < SIZE[2]; z++) cells.push([x, y, z]);
  return cells;
}

/** Validate a device's location against the selected placement policy.
 * @param {object} state Experiment state.
 * @param {string} type Proposed type.
 * @param {number[]} pos Proposed cell.
 * @return {string|null} Rejection reason, or null.
 */
export function policyError(state, type, pos) {
  if (!inBounds(pos)) return 'out-of-bounds';
  if (PROTECTED.some(p => key(p.pos) === key(pos))) return 'protected-position';
  if (state.mode === 'A') {
    const slot = FIXED_SLOTS.find(s => key(s.pos) === key(pos));
    return slot?.types.includes(type) ? null : 'fixed-slot-type';
  }
  return buildCells(state).some(p => key(p) === key(pos)) ? null : 'outside-build-zone';
}

/** Prove only the fixture's iron/fuel/workspace paths remain available after a proposal.
 * @param {object} state Hypothetical state, including the proposed placement.
 * @return {string|null} Missing capability or null; this is not a complete cake proof.
 */
export function safetyError(state) {
  const unlocked = new Set(state.unlocked);
  const open = buildCells(state).filter(p => !at(state, p)
      && !PROTECTED.some(q => key(q.pos) === key(p)));
  const entities = Object.values(state.entities);
  const bench = entities.some(e => e.type === 'crafting_table') || open.some(p => !policyError(state, 'crafting_table', p));
  const furnace = entities.some(e => ['furnace', 'blast_furnace'].includes(e.type))
      || open.some(p => !policyError(state, 'furnace', p));
  if (!bench) return 'last-bench-position';
  if (!furnace) return 'last-smelter-position';
  const needsBench = !entities.some(e => e.type === 'crafting_table');
  const needsFurnace = !entities.some(e => ['furnace', 'blast_furnace'].includes(e.type));
  if (needsBench && needsFurnace && !open.some(a => !policyError(state, 'crafting_table', a)
      && open.some(b => key(a) !== key(b) && !policyError(state, 'furnace', b)))) return 'last-workspace-capacity';
  const sourceAvailable = item => SOURCES.some(s => s.item === item && !at(state, s.pos));
  const wood = unlocked.has('oak_log') || sourceAvailable('oak_log');
  const sticks = unlocked.has('stick') || wood;
  const woodPick = unlocked.has('wooden_pickaxe') || (wood && bench);
  const cobble = unlocked.has('cobblestone') || (sourceAvailable('cobblestone') && woodPick);
  const stonePick = unlocked.has('stone_pickaxe') || (cobble && sticks && bench);
  const iron = unlocked.has('iron_ingot') || unlocked.has('raw_iron')
      || (sourceAvailable('raw_iron') && stonePick);
  if (!iron) return 'last-iron-path';
  const fuel = state.unlocked.some(id => ITEMS[id].fuel)
      || sourceAvailable('oak_log') || (sourceAvailable('coal') && woodPick);
  if (!unlocked.has('iron_ingot') && !fuel) return 'last-fuel-path';
  return null;
}
