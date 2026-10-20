/** Pure command/state kernel shared by A and B. All infinite-item semantics are experimental. */
import { DEBUG_UNLOCKS, DEVICES, FACINGS, ITEMS, SOURCES, key, recipeFor } from './definitions.mjs';
import { canInsert, capacity, moveFinite, quickRoute } from './containers.mjs';
import { at, policyError, safetyError } from './placement.mjs';
import { tickHoppers } from './flow.mjs';

/** Create an explicit experiment state with debug grants, not real progression.
 * @param {object} options Mode, fixture, and optional initial unlocks.
 * @return {object} Fresh experiment state.
 */
export function createState({ mode = 'B', fixture = 'normal', unlocked = DEBUG_UNLOCKS } = {}) {
  if (!['A', 'B'].includes(mode) || !['normal', 'tight'].includes(fixture)) throw new Error('invalid-fixture');
  if (!unlocked.every(id => Object.hasOwn(ITEMS, id))) throw new Error('unknown-item');
  return { schema: 1, mode, fixture, tick: 0, nextId: 1, unlocked: [...new Set(unlocked)],
    entities: {}, resources: Object.fromEntries(SOURCES.map(s => [s.id, true])), cursor: null,
    metrics: { transferChecks: 0, machineSteps: 0 }, events: [] };
}

/** Record bounded diagnostic events without growing the save or simulation forever.
 * @param {object} state Mutable transaction state.
 * @param {string} kind Event type.
 * @param {object} data Event details.
 */
export function record(state, kind, data = {}) {
  state.events.push({ tick: state.tick, kind, ...data });
  if (state.events.length > 80) state.events.shift();
}

/** Acquire an item once, independently of temporary carriers and quantities.
 * @param {object} state Mutable transaction state.
 * @param {string} item Item identifier.
 */
export function acquire(state, item) {
  if (!state.unlocked.includes(item)) { state.unlocked.push(item); record(state, 'unlock', { item }); }
}

/** Check a direction for the specific device rather than allowing upward hoppers.
 * @param {string} type Device type.
 * @param {string} facing Logical direction.
 * @return {boolean} Whether this orientation is valid.
 */
export function validFacing(type, facing) { return FACINGS.includes(facing) && (type === 'hopper' || facing !== 'down'); }

/** Construct a clean instance; replacement never inherits old timers or contents.
 * @param {string} id Stable instance ID.
 * @param {string} type Device type.
 * @param {number[]} pos Logical cell.
 * @param {string} facing Outlet/front orientation.
 * @return {object} Instance state.
 */
export function makeEntity(id, type, pos, facing) {
  return { id, type, pos: [...pos], facing, slots: Array(DEVICES[type]).fill(null), cooldown: 0,
    machine: { progress: 0, burn: 0, fingerprint: null } };
}

/** Find a live instance or reject a stale UI/connection reference.
 * @param {object} state Experiment state.
 * @param {string} id Instance ID.
 * @return {object} Live device.
 */
function entity(state, id) {
  if (!Object.hasOwn(state.entities, id)) throw new Error('missing-device');
  return state.entities[id];
}

/** Perform protected placement against the complete hypothetical layout.
 * @param {object} state Mutable transaction state.
 * @param {object} action Placement command.
 */
function place(state, action) {
  const { device, pos, replace = false } = action;
  if (!Object.hasOwn(DEVICES, device) || (state.mode === 'A' && device === 'hopper')) throw new Error('unsupported-device');
  if (!state.unlocked.includes(device)) throw new Error('locked-device');
  const reason = policyError(state, device, pos);
  if (reason) throw new Error(reason);
  if (SOURCES.some(s => key(s.pos) === key(pos) && state.resources[s.id])) throw new Error('resource-present');
  const old = at(state, pos);
  if (old && !replace) throw new Error('occupied');
  const facing = action.facing ?? (device === 'hopper' ? 'down' : 'east');
  if (!validFacing(device, facing)) throw new Error('invalid-facing');
  if (old) { delete state.entities[old.id]; record(state, 'remove', { id: old.id, discarded: old.slots }); }
  const id = `w${state.nextId++}`;
  state.entities[id] = makeEntity(id, device, pos, facing);
  const unsafe = safetyError(state);
  if (unsafe) throw new Error(unsafe);
  record(state, 'place', { id, device, pos });
}

/** Handle basic finite-slot clicks; no production GUI shortcut claim is made.
 * @param {object} state Mutable transaction state.
 * @param {object} action Click command.
 */
function clickSlot(state, action) {
  const target = entity(state, action.id), slot = action.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot >= target.slots.length) throw new Error('invalid-slot');
  const current = target.slots[slot];
  if (!state.cursor) {
    if (!current) return;
    const count = action.half ? Math.ceil(current.count / 2) : current.count;
    state.cursor = { item: current.item, count };
    current.count -= count;
    if (!current.count) target.slots[slot] = null;
    if (slot === 2 && ['furnace', 'blast_furnace'].includes(target.type)) acquire(state, state.cursor.item);
  } else {
    if (!canInsert(target, slot, state.cursor)) throw new Error('slot-rejects-item');
    if (current && current.item !== state.cursor.item) {
      target.slots[slot] = state.cursor; state.cursor = current;
    } else {
      const count = Math.min(action.half ? 1 : state.cursor.count, capacity(current, state.cursor));
      if (!count) throw new Error('target-full');
      target.slots[slot] = { item: state.cursor.item, count: (current?.count ?? 0) + count };
      state.cursor.count -= count;
      if (!state.cursor.count) state.cursor = null;
    }
  }
  record(state, 'slot-click', { id: target.id, slot });
}

/** Tick the same sample cooking implementation under either placement policy.
 * @param {object} state Mutable transaction state.
 * @param {object} e Device instance.
 */
function tickMachine(state, e) {
  if (!['furnace', 'blast_furnace'].includes(e.type)) return;
  state.metrics.machineSteps++;
  const machine = e.machine, recipe = recipeFor(e);
  if (machine.fingerprint !== (e.slots[0]?.item ?? null)) {
    machine.fingerprint = e.slots[0]?.item ?? null; machine.progress = 0;
  }
  if (machine.burn > 0) machine.burn--;
  const output = recipe ? { item: recipe.result, count: 1 } : null;
  const canCook = output && capacity(e.slots[2], output) > 0;
  const speed = e.type === 'blast_furnace' ? 2 : 1;
  if (canCook && !machine.burn && ITEMS[e.slots[1]?.item]?.fuel) {
    machine.burn = Math.floor(ITEMS[e.slots[1].item].fuel / speed);
    record(state, 'ignite', { id: e.id });
  }
  if (canCook && machine.burn > 0) {
    machine.progress++;
    if (machine.progress === 200 / speed) {
      e.slots[2] = { item: output.item, count: (e.slots[2]?.count ?? 0) + 1 };
      machine.progress = 0;
      record(state, 'cooked', { id: e.id, item: output.item });
    }
  } else if (!recipe) machine.progress = 0;
  else if (!machine.burn) machine.progress = Math.max(0, machine.progress - 2);
}

/** Execute one atomic command by cloning first; failed commands cannot partly mutate state.
 * @param {object} previous Previous experiment state.
 * @param {object} action Command with a type and command-specific fields.
 * @return {object} New state, or a thrown rejection leaving the previous state untouched.
 */
export function dispatch(previous, action) {
  const state = structuredClone(previous);
  switch (action.type) {
    case 'place': place(state, action); break;
    case 'remove': {
      const old = entity(state, action.id); delete state.entities[old.id];
      const unsafe = safetyError(state); if (unsafe) throw new Error(unsafe);
      record(state, 'remove', { id: old.id, discarded: old.slots }); break;
    }
    case 'rotate': {
      if (state.mode !== 'B') throw new Error('fixed-orientation');
      const e = entity(state, action.id);
      if (!validFacing(e.type, action.facing)) throw new Error('invalid-facing');
      e.facing = action.facing; record(state, 'rotate', { id: e.id, facing: e.facing }); break;
    }
    case 'catalogue': {
      if (!state.unlocked.includes(action.item)) throw new Error('locked-item');
      if (!Number.isInteger(action.count) || action.count < 1 || action.count > ITEMS[action.item].max) throw new Error('invalid-count');
      if (state.cursor) throw new Error('cursor-occupied');
      state.cursor = { item: action.item, count: action.count };
      record(state, 'copy', { item: action.item, count: action.count }); break;
    }
    case 'click': clickSlot(state, action); break;
    case 'clear-cursor': state.cursor = null; record(state, 'clear-cursor'); break;
    case 'quick': {
      if (!state.cursor) throw new Error('empty-cursor');
      const target = entity(state, action.id), holder = { slots: [state.cursor] };
      let moved = 0;
      for (const slot of quickRoute(target, state.cursor)) {
        moved += moveFinite(holder, 0, target, slot, holder.slots[0]?.count ?? 0);
        if (!holder.slots[0]) break;
      }
      if (!moved) throw new Error('no-quick-target');
      state.cursor = holder.slots[0]; record(state, 'quick', { id: target.id, moved }); break;
    }
    case 'move': {
      const source = entity(state, action.from), target = entity(state, action.to);
      const item = source.slots[action.slot]?.item;
      const moved = moveFinite(source, action.slot, target, action.targetSlot, action.count ?? 1);
      if (!moved) throw new Error('transfer-rejected');
      if (action.slot === 2 && ['furnace', 'blast_furnace'].includes(source.type)) acquire(state, item);
      record(state, 'manual-transfer', { from: source.id, to: target.id, item, moved }); break;
    }
    case 'harvest': {
      const source = SOURCES.find(s => s.id === action.source);
      if (!source || !state.resources[source.id] || at(state, source.pos)) throw new Error('resource-unavailable');
      if (action.tool && !state.unlocked.includes(action.tool)) throw new Error('locked-tool');
      state.resources[source.id] = false;
      const correct = !source.tool || action.tool === source.tool
        || (source.tool === 'wooden_pickaxe' && action.tool === 'stone_pickaxe');
      if (correct) acquire(state, source.item);
      record(state, 'harvest', { source: source.id, correct }); break;
    }
    case 'revisit': {
      for (const source of SOURCES) state.resources[source.id] = !at(state, source.pos);
      record(state, 'refill'); break;
    }
    case 'tick': {
      const count = action.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('invalid-tick-count');
      for (let i = 0; i < count; i++) {
        state.tick++;
        for (const e of Object.values(state.entities)) tickMachine(state, e);
        tickHoppers(state, (kind, data) => record(state, kind, data), item => acquire(state, item));
      }
      break;
    }
    default: throw new Error('unknown-command');
  }
  return state;
}

/** Fill one fixture slot using the same public copy/click commands as the UI.
 * @param {object} state Current state.
 * @param {string} id Target instance.
 * @param {number} slot Slot index.
 * @param {string} item Unlocked item.
 * @param {number} count Temporary count.
 * @return {object} New state.
 */
export function fill(state, id, slot, item, count = 1) {
  return dispatch(dispatch(state, { type: 'catalogue', item, count }), { type: 'click', id, slot });
}

/** Create a reproducible manual A or automatic B feeder/cooker/collector fixture.
 * @param {string} mode Placement policy.
 * @param {string} cooker Furnace type.
 * @return {object} Runnable demonstration state.
 */
export function demo(mode = 'B', cooker = 'furnace') {
  let state = createState({ mode });
  state = dispatch(state, { type: 'place', device: 'crafting_table', pos: [0, 1, 0] });
  state = dispatch(state, { type: 'place', device: cooker, pos: [3, 2, 0] });
  if (mode === 'A') return fill(fill(state, 'w2', 0, 'raw_iron'), 'w2', 1, 'stick');
  for (const [pos, facing] of [[[3, 3, 0], 'down'], [[2, 2, 0], 'east'], [[3, 1, 0], 'east'], [[4, 1, 0], 'north']]) {
    state = dispatch(state, { type: 'place', device: 'hopper', pos, facing });
  }
  return fill(fill(state, 'w3', 0, 'raw_iron', 3), 'w4', 0, 'stick', 2);
}
