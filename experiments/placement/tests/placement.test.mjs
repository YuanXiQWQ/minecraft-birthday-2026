/** Behavioral counterexamples for the isolated placement experiment, using Node built-ins only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createState, demo, dispatch, fill } from '../core/model.mjs';
import { connections } from '../core/flow.mjs';
import { faceSlots } from '../core/containers.mjs';
import { loadState, saveState, STORAGE_KEY } from '../core/persistence.mjs';
import { createExperimentServer } from '../server.mjs';

/** Execute a sequence through public commands rather than private state mutations.
 * @param {object} state Initial state.
 * @param {object[]} actions Command sequence.
 * @return {object} Final state.
 */
function run(state, ...actions) { return actions.reduce(dispatch, state); }

/** Add a hopper through the same placement checks used in the browser.
 * @param {object} state Initial state.
 * @param {number[]} pos Logical cell.
 * @param {string} facing Outlet orientation.
 * @return {object} New state.
 */
function hopper(state, pos, facing = 'down') { return dispatch(state, { type: 'place', device: 'hopper', pos, facing }); }

/** Sum finite carriers, excluding infinite catalogue availability and machine production.
 * @param {object} state State to inspect.
 * @return {number} Number of temporary items.
 */
function total(state) { return Object.values(state.entities).flatMap(e => e.slots).reduce((sum, s) => sum + (s?.count ?? 0), state.cursor?.count ?? 0); }

/** Assert that a rejected command is atomic, including its diagnostics and ID counter.
 * @param {object} state State that must be preserved.
 * @param {object} action Rejected command.
 * @param {RegExp} reason Expected reason.
 */
function rejects(state, action, reason) {
  const before = structuredClone(state);
  assert.throws(() => dispatch(state, action), reason);
  assert.deepEqual(state, before);
}

test('A01 A permits only typed author slots and rejects hoppers', () => {
  const s = createState({ mode: 'A' });
  rejects(s, { type: 'place', device: 'furnace', pos: [1, 1, 0] }, /fixed-slot-type/);
  rejects(s, { type: 'place', device: 'hopper', pos: [3, 2, 0] }, /unsupported-device/);
  rejects(s, { type: 'place', device: 'furnace', pos: [0, 1, 0] }, /fixed-slot-type/);
  assert.equal(Object.keys(demo('A').entities).length, 2);
});

test('A02 A replacement resets contents/timers, then removal allows a fresh device', () => {
  let s = dispatch(demo('A'), { type: 'tick', count: 30 });
  s = dispatch(s, { type: 'place', device: 'blast_furnace', pos: [3, 2, 0], replace: true });
  assert.equal(s.entities.w2, undefined);
  assert.deepEqual(s.entities.w3.slots, [null, null, null]);
  assert.equal(s.entities.w3.machine.progress, 0);
  s = run(s, { type: 'remove', id: 'w3' }, { type: 'place', device: 'furnace', pos: [3, 2, 0] });
  assert.equal(s.entities.w4.type, 'furnace');
  assert.ok(s.unlocked.includes('furnace'));
});

test('A03 A rejects replacement without explicit consent and rejects rotation', () => {
  const s = demo('A');
  rejects(s, { type: 'place', device: 'blast_furnace', pos: [3, 2, 0] }, /occupied/);
  rejects(s, { type: 'rotate', id: 'w2', facing: 'west' }, /fixed-orientation/);
});

test('A04 fixed workbench can be filled, replaced, removed, and placed again', () => {
  let s = fill(demo('A'), 'w1', 0, 'stick', 3);
  s = dispatch(s, { type: 'place', device: 'crafting_table', pos: [0, 1, 0], replace: true });
  assert.equal(s.entities.w1, undefined);
  assert.ok(s.entities.w3.slots.every(slot => slot === null));
  s = run(s, { type: 'remove', id: 'w3' }, { type: 'place', device: 'crafting_table', pos: [0, 1, 0] });
  assert.equal(s.entities.w4.type, 'crafting_table');
  assert.ok(s.unlocked.includes('stick'));
});

test('AB01 A and B use identical machine state transitions for identical initial contents', () => {
  let a = demo('A');
  let b = createState();
  b = run(b, { type: 'place', device: 'crafting_table', pos: [0, 1, 0] }, { type: 'place', device: 'furnace', pos: [3, 2, 0] });
  b = fill(fill(b, 'w2', 0, 'raw_iron'), 'w2', 1, 'stick');
  a = dispatch(a, { type: 'tick', count: 230 }); b = dispatch(b, { type: 'tick', count: 230 });
  assert.deepEqual(a.entities.w2, b.entities.w2);
  assert.deepEqual(a.unlocked, b.unlocked);
});

test('B01 B supports multiple instances, every outlet direction, and depth connections', () => {
  let s = hopper(hopper(createState(), [1, 2, 0], 'south'), [1, 2, 1], 'north');
  assert.equal(connections(s).length, 2);
  s = dispatch(s, { type: 'rotate', id: 'w1', facing: 'east' });
  assert.equal(connections(s).length, 1);
  rejects(s, { type: 'rotate', id: 'w1', facing: 'up' }, /invalid-facing/);
  rejects(s, { type: 'place', device: 'furnace', pos: [7, 1, 0] }, /out-of-bounds/);
});

test('B02 hopper GUI carrier has exactly five independent slots', () => {
  let s = hopper(createState(), [1, 2, 0]);
  assert.equal(s.entities.w1.slots.length, 5);
  for (let slot = 0; slot < 5; slot++) s = fill(s, 'w1', slot, 'stick', slot + 1);
  assert.deepEqual(s.entities.w1.slots.map(v => v.count), [1, 2, 3, 4, 5]);
  rejects(s, { type: 'click', id: 'w1', slot: 5 }, /invalid-slot/);
});

test('PORT01 top exposes input, side exposes fuel, bottom exposes output plus restricted remainder', () => {
  const furnace = demo('A').entities.w2;
  assert.deepEqual(faceSlots(furnace, 'up'), [0]);
  assert.deepEqual(faceSlots(furnace, 'east'), [1]);
  assert.deepEqual(faceSlots(furnace, 'down'), [2, 1]);
});

for (const cooker of ['furnace', 'blast_furnace']) {
  test(`FLOW01 ${cooker}: top raw iron, side sticks, bottom output, downstream hopper`, () => {
    const original = demo('B', cooker);
    const first = dispatch(original, { type: 'tick' });
    assert.equal(first.entities.w2.slots[0].item, 'raw_iron');
    assert.equal(first.entities.w2.slots[1].item, 'stick');
    assert.equal(total(first), total(original));
    const cooked = dispatch(first, { type: 'tick', count: cooker === 'furnace' ? 208 : 108 });
    assert.ok(cooked.unlocked.includes('iron_ingot'));
    assert.equal(cooked.entities.w6.slots[0]?.item, 'iron_ingot');
    assert.equal(cooked.entities.w2.slots[0].count, 3);
    assert.equal(cooked.entities.w2.slots[1].count, 2);
    assert.ok(cooked.unlocked.every(item => item === 'iron_ingot' || original.unlocked.includes(item)));
  });
}

test('PORT02 side feeder cannot insert raw iron as fuel', () => {
  let s = demo('B');
  s = fill(s, 'w4', 1, 'raw_iron', 2);
  s = dispatch(s, { type: 'click', id: 'w4', slot: 0 });
  s = dispatch(s, { type: 'clear-cursor' });
  s = dispatch(s, { type: 'tick', count: 16 });
  assert.equal(s.entities.w2.slots[1], null);
  assert.equal(s.entities.w4.slots[1].count, 2);
});

test('PORT03 bottom extracts bucket remainder but cannot extract coal fuel', () => {
  let s = demo('B');
  s = fill(s, 'w2', 1, 'bucket');
  s = dispatch(s, { type: 'remove', id: 'w4' });
  s = dispatch(s, { type: 'tick' });
  assert.equal(s.entities.w2.slots[1], null);
  assert.equal(s.entities.w5.slots[0].item, 'bucket');
  s = fill(s, 'w2', 1, 'coal', 3);
  s = dispatch(s, { type: 'tick', count: 7 });
  assert.equal(s.entities.w2.slots[1].count, 3);
});

test('COOK01 invalid manual/top input is accepted but never processed in a blast furnace', () => {
  let s = demo('B', 'blast_furnace');
  s = run(s, { type: 'click', id: 'w3', slot: 0 }, { type: 'clear-cursor' });
  s = fill(s, 'w3', 0, 'oak_log');
  s = dispatch(s, { type: 'tick', count: 400 });
  assert.equal(s.entities.w2.slots[0].item, 'oak_log');
  assert.equal(s.entities.w2.slots[2], null);
  assert.equal(s.unlocked.includes('charcoal'), false);
});

test('COOK02 quick routing chooses input before fuel, with no full-input fallback', () => {
  let s = demo('A');
  s = run(s, { type: 'click', id: 'w2', slot: 0 }, { type: 'clear-cursor' }, { type: 'catalogue', item: 'oak_log', count: 64 }, { type: 'quick', id: 'w2' });
  assert.equal(s.entities.w2.slots[0].item, 'oak_log');
  s = dispatch(s, { type: 'catalogue', item: 'oak_log', count: 1 });
  rejects(s, { type: 'quick', id: 'w2' }, /no-quick-target/);
  assert.equal(s.entities.w2.slots[1].item, 'stick');
});

test('COOK03 blast furnace routes a log to fuel while allowing inert manual input', () => {
  let s = demo('A', 'blast_furnace');
  s = run(s, { type: 'click', id: 'w2', slot: 1 }, { type: 'clear-cursor' }, { type: 'catalogue', item: 'oak_log', count: 1 }, { type: 'quick', id: 'w2' });
  assert.equal(s.entities.w2.slots[1].item, 'oak_log');
});

test('COOK04 sample speed and infinite short-fuel references are equal for A/B', () => {
  let slow = demo('A'), fast = demo('A', 'blast_furnace');
  slow = dispatch(slow, { type: 'tick', count: 100 }); fast = dispatch(fast, { type: 'tick', count: 100 });
  assert.equal(slow.entities.w2.slots[2], null);
  assert.equal(fast.entities.w2.slots[2].count, 1);
  slow = dispatch(slow, { type: 'tick', count: 100 });
  assert.equal(slow.entities.w2.slots[2].count, 1);
  assert.equal(slow.entities.w2.slots[0].count, 1);
  assert.equal(slow.entities.w2.slots[1].count, 1);
  assert.equal(slow.unlocked.includes('iron_ingot'), false);
  slow = dispatch(slow, { type: 'click', id: 'w2', slot: 2 });
  assert.ok(slow.unlocked.includes('iron_ingot'));
});

test('COOK05 manual invalid input stays in its slot without producing or acquiring charcoal', () => {
  let s = demo('A', 'blast_furnace');
  s = run(s, { type: 'click', id: 'w2', slot: 0 }, { type: 'clear-cursor' });
  s = fill(s, 'w2', 0, 'oak_log');
  s = dispatch(s, { type: 'tick', count: 400 });
  assert.equal(s.entities.w2.slots[0].item, 'oak_log');
  assert.equal(s.entities.w2.slots[2], null);
  assert.equal(s.unlocked.includes('charcoal'), false);
});

test('BLOCK01 target full/source empty transfers preserve groups and permanent unlocks', () => {
  let s = hopper(hopper(createState(), [1, 2, 0], 'east'), [2, 2, 0], 'east');
  s = fill(s, 'w1', 0, 'raw_iron', 2);
  for (let i = 0; i < 5; i++) s = fill(s, 'w2', i, 'raw_iron', 64);
  const before = total(s), unlocks = [...s.unlocked];
  s = dispatch(s, { type: 'tick', count: 80 });
  assert.equal(total(s), before);
  assert.equal(s.entities.w1.slots[0].count, 2);
  assert.deepEqual(s.unlocked, unlocks);
  rejects(s, { type: 'move', from: 'w1', slot: 1, to: 'w2', targetSlot: 0 }, /transfer-rejected/);
  rejects(s, { type: 'move', from: 'w1', slot: 0, to: 'w2', targetSlot: 0 }, /transfer-rejected/);
});

test('BLOCK02 occupied output pauses sample production without exceeding maximum stack', () => {
  let s = demo('A');
  s.entities.w2.slots[2] = { item: 'iron_ingot', count: 64 }; // Explicit full-output fixture, not a user insert command.
  s = dispatch(s, { type: 'tick', count: 400 });
  assert.equal(s.entities.w2.slots[2].count, 64);
  assert.equal(s.unlocked.includes('iron_ingot'), false);
  rejects(s, { type: 'catalogue', item: 'iron_ingot', count: 1 }, /locked-item/);
});

test('LIFE01 removing/replacing a target immediately invalidates old connections and references', () => {
  let s = demo('B');
  s = dispatch(s, { type: 'remove', id: 'w2' });
  assert.equal(connections(s).some(e => e.from === 'w2' || e.to === 'w2'), false);
  s = dispatch(s, { type: 'tick', count: 16 });
  assert.equal(s.entities.w3.slots[0].count, 3);
  rejects(s, { type: 'click', id: 'w2', slot: 0 }, /missing-device/);
  s = dispatch(s, { type: 'place', device: 'blast_furnace', pos: [3, 2, 0] });
  assert.ok(connections(s).some(e => e.to === 'w7'));
});

test('FLOW02 direction changes disconnect and reconnect without retained graph objects', () => {
  let s = demo('B');
  s = dispatch(s, { type: 'rotate', id: 'w4', facing: 'west' });
  assert.equal(connections(s).some(e => e.from === 'w4'), false);
  s = dispatch(s, { type: 'tick', count: 9 });
  assert.equal(s.entities.w2.slots[1], null);
  s = dispatch(s, { type: 'rotate', id: 'w4', facing: 'east' });
  s = dispatch(s, { type: 'tick' });
  assert.equal(s.entities.w2.slots[1].item, 'stick');
});

test('FLOW03 chains cannot relay a newly received group within the same tick', () => {
  let s = hopper(hopper(hopper(createState(), [0, 2, 0], 'east'), [1, 2, 0], 'east'), [2, 2, 0], 'east');
  s = fill(s, 'w1', 0, 'stick', 3);
  s = dispatch(s, { type: 'tick' });
  assert.equal(s.entities.w2.slots[0].count, 1);
  assert.equal(s.entities.w3.slots[0], null);
  s = dispatch(s, { type: 'tick', count: 7 });
  assert.equal(s.entities.w1.slots[0].count, 2);
  s = dispatch(s, { type: 'tick' });
  assert.equal(s.entities.w1.slots[0].count, 1);
  assert.equal(s.entities.w3.slots[0].count, 1);
  assert.equal(total(s), 3);
});

test('FLOW04 a four-hopper cycle stays bounded and conserves finite groups for 1000 ticks', () => {
  let s = createState();
  for (const [pos, facing] of [[[0, 2, 0], 'east'], [[1, 2, 0], 'south'], [[1, 2, 1], 'west'], [[0, 2, 1], 'north']]) s = hopper(s, pos, facing);
  s = fill(s, 'w1', 0, 'stick', 17);
  const original = [...s.unlocked];
  s = dispatch(s, { type: 'tick', count: 1000 });
  assert.equal(total(s), 17);
  assert.deepEqual(s.unlocked, original);
  assert.ok(s.metrics.transferChecks <= 4 * 1000 * 25);
  assert.ok(s.events.length <= 80);
});

test('INV01 normal finite moves decrement carriers without decrementing permanent unlocks', () => {
  let s = hopper(hopper(createState(), [0, 2, 0]), [2, 2, 0]);
  s = fill(s, 'w1', 0, 'stick', 3);
  const unlocks = [...s.unlocked];
  s = dispatch(s, { type: 'move', from: 'w1', slot: 0, to: 'w2', targetSlot: 2 });
  assert.equal(s.entities.w1.slots[0].count, 2);
  assert.equal(s.entities.w2.slots[2].count, 1);
  assert.deepEqual(s.unlocked, unlocks);
});

test('INV02 cursor half/single moves respect item maxima and rejected commands are atomic', () => {
  let s = hopper(createState(), [0, 2, 0]);
  s = fill(s, 'w1', 0, 'stick', 9);
  s = dispatch(s, { type: 'click', id: 'w1', slot: 0, half: true });
  assert.equal(s.cursor.count, 5); assert.equal(s.entities.w1.slots[0].count, 4);
  s = dispatch(s, { type: 'click', id: 'w1', slot: 1, half: true });
  assert.equal(s.cursor.count, 4); assert.equal(s.entities.w1.slots[1].count, 1);
  s = dispatch(s, { type: 'clear-cursor' });
  rejects(s, { type: 'catalogue', item: 'bucket', count: 17 }, /invalid-count/);
  rejects(s, { type: 'catalogue', item: 'wooden_pickaxe', count: 2 }, /invalid-count/);
});

test('WORLD01 refill preserves instances/content and suppresses covered sources until next uncovered visit', () => {
  let s = createState();
  s = run(s, { type: 'harvest', source: 'iron-a' }, { type: 'place', device: 'hopper', pos: [5, 0, 0] });
  s = fill(s, 'w1', 0, 'stick', 3);
  s = dispatch(s, { type: 'revisit' });
  assert.equal(s.resources['iron-a'], false);
  assert.equal(s.resources['iron-b'], true);
  assert.equal(s.entities.w1.slots[0].count, 3);
  s = run(s, { type: 'remove', id: 'w1' }, { type: 'revisit' });
  assert.equal(s.resources['iron-a'], true);
});

test('SAFE01 last iron path is protected after wrong-tool destruction, with atomic rejection', () => {
  let s = createState({ unlocked: ['crafting_table', 'furnace', 'hopper', 'stone_pickaxe'] });
  s = run(s, { type: 'harvest', source: 'iron-a' }, { type: 'harvest', source: 'iron-b' },
    { type: 'place', device: 'hopper', pos: [5, 0, 0] });
  rejects(s, { type: 'place', device: 'hopper', pos: [6, 0, 0] }, /last-iron-path/);
  assert.equal(s.unlocked.includes('raw_iron'), false);
  s = dispatch(s, { type: 'revisit' });
  assert.equal(s.resources['iron-b'], true);
});

test('SAFE02 unlocking raw iron permits covering the final ore source', () => {
  let s = createState();
  s = run(s, { type: 'harvest', source: 'iron-a' }, { type: 'harvest', source: 'iron-b' },
    { type: 'place', device: 'hopper', pos: [5, 0, 0] }, { type: 'place', device: 'hopper', pos: [6, 0, 0] });
  assert.equal(Object.keys(s.entities).length, 2);
});

test('SAFE03 coal and wood are alternative fuel paths; do not block the last remaining one', () => {
  let s = createState({ unlocked: ['crafting_table', 'furnace', 'hopper', 'raw_iron', 'wooden_pickaxe'] });
  s = run(s, { type: 'harvest', source: 'coal' }, { type: 'place', device: 'hopper', pos: [3, 0, 0] }, { type: 'harvest', source: 'tree' });
  // Tree harvesting unlocks renewable fuel, so covering it is now safe.
  s = dispatch(s, { type: 'place', device: 'hopper', pos: [4, 0, 0] });
  assert.ok(s.unlocked.includes('oak_log'));
  // A deliberately damaged/legacy fixture tests the otherwise unreachable no-fuel edge case.
  const damaged = structuredClone(s);
  damaged.unlocked = ['crafting_table', 'furnace', 'hopper', 'raw_iron'];
  delete damaged.entities.w2;
  rejects(damaged, { type: 'place', device: 'hopper', pos: [4, 0, 0] }, /last-fuel-path/);
});

test('SAFE04 last required work position is protected instead of relying on later demolition', () => {
  let s = createState({ fixture: 'tight' });
  s = dispatch(s, { type: 'place', device: 'crafting_table', pos: [0, 1, 0] });
  rejects(s, { type: 'place', device: 'hopper', pos: [1, 1, 0] }, /last-smelter-position/);
  s = dispatch(s, { type: 'place', device: 'furnace', pos: [1, 1, 0] });
  rejects(s, { type: 'place', device: 'hopper', pos: [0, 1, 0], replace: true }, /last-bench-position/);
});

test('SAFE05 farmland, cake table, live sources, locked devices and stale tools reject placement/acquisition', () => {
  const s = createState();
  rejects(s, { type: 'place', device: 'hopper', pos: [6, 0, 1] }, /protected-position/);
  rejects(s, { type: 'place', device: 'hopper', pos: [5, 0, 1] }, /protected-position/);
  rejects(s, { type: 'place', device: 'hopper', pos: [5, 0, 0] }, /resource-present/);
  rejects(createState({ unlocked: [] }), { type: 'place', device: 'hopper', pos: [1, 2, 0] }, /locked-device/);
  rejects(createState({ unlocked: [] }), { type: 'harvest', source: 'iron-a', tool: 'stone_pickaxe' }, /locked-tool/);
});

test('SAFE06 two missing workstations cannot both reserve the same last free cell', () => {
  const s = createState({ fixture: 'tight' });
  rejects(s, { type: 'place', device: 'hopper', pos: [0, 1, 0] }, /last-workspace-capacity/);
  assert.equal(Object.keys(s.entities).length, 0);
});

test('BLOCK03 blocked automatic collection never acquires an uncollected output', () => {
  let s = demo('B');
  for (let slot = 0; slot < 5; slot++) s = fill(s, 'w5', slot, 'coal', 64);
  s = dispatch(s, { type: 'rotate', id: 'w5', facing: 'west' });
  s = dispatch(s, { type: 'tick', count: 209 });
  assert.equal(s.entities.w2.slots[2].item, 'iron_ingot');
  assert.equal(s.unlocked.includes('iron_ingot'), false);
  s = dispatch(s, { type: 'click', id: 'w5', slot: 0 });
  s = dispatch(s, { type: 'clear-cursor' });
  s = dispatch(s, { type: 'tick', count: 8 });
  assert.ok(s.unlocked.includes('iron_ingot'));
});

for (const mode of ['A', 'B']) {
  test(`SAVE01 ${mode} preserves instance IDs, direction, slots, timers, and derived edges`, () => {
    const original = dispatch(demo(mode), { type: 'tick', count: 45 });
    const restored = loadState(saveState(original));
    assert.deepEqual(restored.entities, original.entities);
    assert.deepEqual(connections(restored), connections(original));
    assert.equal(saveState(dispatch(restored, { type: 'tick', count: 180 })), saveState(dispatch(original, { type: 'tick', count: 180 })));
    assert.equal(STORAGE_KEY.includes('placement-experiment'), true);
  });
}

test('SAVE02 deleted targets stay deleted after restoring; cursor and events are ephemeral', () => {
  const original = run(demo('B'), { type: 'remove', id: 'w2' }, { type: 'catalogue', item: 'stick', count: 3 });
  const restored = loadState(saveState(original));
  assert.equal(restored.cursor, null); assert.equal(restored.events.length, 0);
  assert.equal(connections(restored).some(e => e.to === 'w2' || e.from === 'w2'), false);
});

for (const [name, corrupt] of [
  ['version', s => { s.schema = 2; }], ['overflow', s => { s.entities.w3.slots[0].count = 65; }],
  ['unknown item', s => { s.entities.w3.slots[0].item = 'diamond'; }],
  ['overlap', s => { s.entities.w4.pos = [...s.entities.w3.pos]; }],
  ['orientation', s => { s.entities.w3.facing = 'up'; }], ['next ID', s => { s.nextId = 1; }],
  ['cooldown', s => { s.entities.w3.cooldown = -1; }], ['coordinates', s => { s.entities.w3.pos = [99, 0, 0]; }],
]) {
  test(`SAVE03 rejects corrupted ${name} without changing the original state`, () => {
    const original = demo('B'), bad = JSON.parse(saveState(original)); corrupt(bad);
    assert.throws(() => loadState(JSON.stringify(bad)), /invalid-save/);
    assert.equal(original.entities.w3.slots[0].count, 3);
  });
}

test('BOUND01 scheduler rejects unbounded tick batches and handles empty sources deterministically', () => {
  const s = hopper(createState(), [0, 2, 0]);
  rejects(s, { type: 'tick', count: Infinity }, /invalid-tick-count/);
  rejects(s, { type: 'tick', count: 10001 }, /invalid-tick-count/);
  const end = dispatch(s, { type: 'tick', count: 1000 });
  assert.equal(total(end), 0); assert.equal(end.metrics.transferChecks, 0);
});

test('HTTP01 server serves only experiment UI/modules, with no repository or test-file access', async () => {
  const server = createExperimentServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/', '/ui.mjs', '/core/model.mjs']) assert.equal((await fetch(base + path)).status, 200);
    for (const path of ['/AGENTS.md', '/docs/p1/report.md', '/server.mjs', '/tests/placement.test.mjs', '/%2e%2e%2fAGENTS.md']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
