/** B-only local adjacency and bounded hopper scheduling, without world simulation. */
import { OPPOSITE, adjacent } from './definitions.mjs';
import { canExtract, faceSlots, moveFinite } from './containers.mjs';
import { at } from './placement.mjs';

/** Rebuild graph edges from positions, so removal cannot leave cached connections.
 * @param {object} state Experiment state.
 * @return {object[]} Current physical push/pull edges; edges can still be blocked by slots.
 */
export function connections(state) {
  if (state.mode !== 'B') return [];
  const edges = [];
  for (const hopper of Object.values(state.entities).filter(e => e.type === 'hopper')) {
    const target = at(state, adjacent(hopper.pos, hopper.facing));
    if (target && target.type !== 'crafting_table') edges.push({
      kind: 'push', from: hopper.id, to: target.id, face: OPPOSITE[hopper.facing],
    });
    const source = at(state, adjacent(hopper.pos, 'up'));
    if (source && source.type !== 'crafting_table') edges.push({ kind: 'pull', from: source.id, to: hopper.id, face: 'down' });
  }
  return edges;
}

/** Move at most one item for a physical edge, bounded by tick-start source budgets.
 * @param {object} state Experiment state.
 * @param {object} edge Local connection.
 * @param {Map<string,number>} budgets Available counts from tick start.
 * @param {Function} emit Event sink.
 * @param {Function} acquire Permanent acquisition sink.
 * @return {boolean} Whether a transfer committed.
 */
function transferEdge(state, edge, budgets, emit, acquire) {
  const source = state.entities[edge.from], target = state.entities[edge.to];
  if (!source || !target) return false;
  const from = edge.kind === 'push' ? source.slots.map((_, i) => i) : faceSlots(source, edge.face);
  const to = edge.kind === 'push' ? faceSlots(target, edge.face) : target.slots.map((_, i) => i);
  for (const a of from) {
    const stack = source.slots[a];
    const budgetKey = `${source.id}:${a}`;
    if (!stack || !budgets.get(budgetKey) || !canExtract(source, a, edge.kind === 'pull' ? edge.face : 'internal')) continue;
    for (const b of to) {
      state.metrics.transferChecks++;
      const item = stack.item;
      const wasEmpty = target.slots.every(s => !s);
      if (!moveFinite(source, a, target, b)) continue;
      budgets.set(budgetKey, budgets.get(budgetKey) - 1);
      if (target.type === 'hopper' && wasEmpty) target.cooldown = Math.max(target.cooldown, 8);
      if (a === 2 && ['furnace', 'blast_furnace'].includes(source.type)) acquire(item);
      emit('transfer', { from: source.id, to: target.id, item, sourceSlot: a, targetSlot: b });
      return true;
    }
  }
  return false;
}

/** Schedule each eligible hopper once, with at most one push and one pull per tick.
 * @param {object} state Experiment state.
 * @param {Function} emit Event sink.
 * @param {Function} acquire Permanent acquisition sink.
 */
export function tickHoppers(state, emit, acquire) {
  if (state.mode !== 'B') return;
  const hoppers = Object.values(state.entities).filter(e => e.type === 'hopper').sort((a, b) => a.id.localeCompare(b.id));
  for (const hopper of hoppers) if (hopper.cooldown > 0) hopper.cooldown--;
  const budgets = new Map();
  for (const e of Object.values(state.entities)) e.slots.forEach((s, i) => budgets.set(`${e.id}:${i}`, s?.count ?? 0));
  const edges = connections(state);
  for (const hopper of hoppers) {
    if (hopper.cooldown > 0) continue;
    const push = edges.find(e => e.kind === 'push' && e.from === hopper.id);
    const pull = edges.find(e => e.kind === 'pull' && e.to === hopper.id);
    const pushed = push ? transferEdge(state, push, budgets, emit, acquire) : false;
    const pulled = pull ? transferEdge(state, pull, budgets, emit, acquire) : false;
    if (pushed || pulled) hopper.cooldown = 8;
  }
}
