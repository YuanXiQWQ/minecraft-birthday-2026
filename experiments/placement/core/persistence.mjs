/** Experiment-only JSON snapshots, with no dependency on a production save schema. */
import { DEVICES, ITEMS, SOURCES, key } from './definitions.mjs';
import { validStack } from './containers.mjs';
import { policyError, safetyError } from './placement.mjs';
import { validFacing } from './model.mjs';

/** Separate storage namespace; never read or clear the future game's save keys. */
export const STORAGE_KEY = 'minecraft-birthday:placement-experiment:v1';

/** Persist complete commands only, excluding ephemeral events and the temporary cursor.
 * @param {object} state Experiment state.
 * @return {string} Versioned JSON snapshot.
 */
export function saveState(state) { return JSON.stringify({ ...state, cursor: null, events: [] }); }

/** Validate a bounded nonnegative integer.
 * @param {number} value Candidate number.
 * @param {number} max Maximum allowed.
 * @return {boolean} Whether the value is in range.
 */
function integer(value, max) { return Number.isSafeInteger(value) && value >= 0 && value <= max; }

/** Restore validated instances first; connections are derived separately from live coordinates.
 * @param {string} json Snapshot text.
 * @return {object} Restored state; invalid input throws without overwriting a live state.
 */
export function loadState(json) {
  if (typeof json !== 'string' || json.length > 128000) throw new Error('invalid-save-size');
  const s = JSON.parse(json);
  if (!s || s.schema !== 1 || !['A', 'B'].includes(s.mode) || !['normal', 'tight'].includes(s.fixture)) throw new Error('invalid-save-version');
  if (!integer(s.tick, 1e9) || !integer(s.nextId, 1e9) || s.nextId < 1) throw new Error('invalid-save-clock');
  if (!Array.isArray(s.unlocked) || new Set(s.unlocked).size !== s.unlocked.length
    || s.unlocked.some(id => !Object.hasOwn(ITEMS, id))) throw new Error('invalid-save-unlocks');
  if (!s.entities || Array.isArray(s.entities) || typeof s.entities !== 'object'
    || Object.keys(s.entities).length > 70) throw new Error('invalid-save-entities');
  const occupied = new Set();
  let largestId = 0;
  for (const [id, e] of Object.entries(s.entities)) {
    if (!/^w[1-9]\d*$/.test(id) || e.id !== id || !Object.hasOwn(DEVICES, e.type)
      || !s.unlocked.includes(e.type)) throw new Error('invalid-save-entity');
    if (s.mode === 'A' && e.type === 'hopper') throw new Error('invalid-save-policy');
    if (policyError(s, e.type, e.pos) || occupied.has(key(e.pos)) || !validFacing(e.type, e.facing)) throw new Error('invalid-save-location');
    occupied.add(key(e.pos)); largestId = Math.max(largestId, Number(id.slice(1)));
    if (!Array.isArray(e.slots) || e.slots.length !== DEVICES[e.type] || !e.slots.every(validStack)) throw new Error('invalid-save-slots');
    if (!integer(e.cooldown, 8) || !e.machine || !integer(e.machine.burn, 20000)
      || !integer(e.machine.progress, 199) || (e.machine.fingerprint !== null && !Object.hasOwn(ITEMS, e.machine.fingerprint))) throw new Error('invalid-save-timer');
    if (['furnace', 'blast_furnace'].includes(e.type) && e.slots[1]
      && !ITEMS[e.slots[1].item].fuel && e.slots[1].item !== 'bucket'
      && e.slots[1].item !== 'water_bucket') throw new Error('invalid-save-fuel');
  }
  if (s.nextId <= largestId) throw new Error('invalid-save-next-id');
  if (!s.resources || Object.keys(s.resources).length !== SOURCES.length
    || SOURCES.some(source => typeof s.resources[source.id] !== 'boolean'
      || (s.resources[source.id] && occupied.has(key(source.pos))))) throw new Error('invalid-save-resources');
  if (!s.metrics || !integer(s.metrics.transferChecks, 1e12) || !integer(s.metrics.machineSteps, 1e12)) throw new Error('invalid-save-metrics');
  const unsafe = safetyError(s);
  if (unsafe) throw new Error(`invalid-save-safety:${unsafe}`);
  return { ...s, cursor: null, events: [] };
}
