/** Reproducible scenario evidence, separate from the browser and formal application. */
import assert from 'node:assert/strict';
import { createState, demo, dispatch, fill } from './core/model.mjs';
import { connections } from './core/flow.mjs';
import { loadState, saveState } from './core/persistence.mjs';

/** Sum finite carriers without treating catalogue unlocks as inventory quantities.
 * @param {object} state Experiment state.
 * @return {number} Finite item count.
 */
function total(state) { return Object.values(state.entities).flatMap(e => e.slots).reduce((n, s) => n + (s?.count ?? 0), 0); }

/** Run and describe one shared-machine or hopper-chain scenario.
 * @param {string} mode Placement policy.
 * @param {string} cooker Sample machine type.
 * @return {object} Observed results and restorable snapshot.
 */
function pipeline(mode, cooker) {
  const ticks = cooker === 'furnace' ? 200 : 100;
  let state = dispatch(demo(mode, cooker), { type: 'tick', count: ticks + (mode === 'B' ? 9 : 0) });
  const producedBeforeTake = state.unlocked.includes('iron_ingot');
  if (mode === 'A') state = dispatch(state, { type: 'click', id: 'w2', slot: 2 });
  assert.ok(state.unlocked.includes('iron_ingot'));
  if (mode === 'B') assert.equal(state.entities.w6.slots[0]?.item, 'iron_ingot');
  const restored = loadState(saveState(state));
  assert.equal(saveState(restored), saveState(state));
  return { mode, cooker, ticks: state.tick, instances: Object.keys(state.entities).length,
    edges: connections(state), acquiredBeforeManualTake: producedBeforeTake, metrics: state.metrics,
    snapshot: JSON.parse(saveState(state)) };
}

/** Exercise a finite cycle without cooking or catalogue copies during scheduling.
 * @return {object} Observed conservation and scheduler counters.
 */
function cycle() {
  let state = createState();
  for (const [pos, facing] of [[[0, 2, 0], 'east'], [[1, 2, 0], 'south'], [[1, 2, 1], 'west'], [[0, 2, 1], 'north']]) {
    state = dispatch(state, { type: 'place', device: 'hopper', pos, facing });
  }
  state = fill(state, 'w1', 0, 'stick', 17);
  const before = total(state);
  state = dispatch(state, { type: 'tick', count: 1000 });
  assert.equal(total(state), before);
  return { ticks: state.tick, instances: 4, finiteBefore: before, finiteAfter: total(state),
    metrics: state.metrics, boundedEventCount: state.events.length };
}

process.stdout.write(JSON.stringify({ experiment: 'P1 placement supplement; candidate semantics only',
  node: process.version, pipelines: ['A', 'B'].flatMap(mode => ['furnace', 'blast_furnace'].map(cooker => pipeline(mode, cooker))),
  cycle: cycle() }, null, 2) + '\n');
