/** Pure, bounded placement rules for a debug-only P2 slice, independent of Three.js and the DOM. */
export type Cell = [number, number, number];
export type Kind = 'crafting_table' | 'furnace' | 'blast_furnace' | 'hopper';
export type Facing = 'north' | 'east' | 'south' | 'west' | 'down';
export interface Instance { id: string; kind: Kind; cell: Cell; facing: Facing }
export interface Layout { schema: 1; nextId: number; instances: Instance[] }
export interface Edge { from: string; to: string; face: Facing | 'up'; port: 'input' | 'fuel' | 'output' | 'container'; action: 'push' | 'pull' }

/** Debug fixture bounds only: not an approved product scene size. */
export const BOUNDS = { x: [-4, 4], y: [0, 3], z: [-3, 3] } as const;
/** Allowed debug device kinds, without a progression or crafting system. */
export const KINDS: Kind[] = ['crafting_table', 'furnace', 'blast_furnace', 'hopper'];
/** Direction vectors use Y-up and negative Z as north. */
export const VECTORS: Record<Facing | 'up', Cell> = { north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0], down: [0, -1, 0], up: [0, 1, 0] };
/** Protected debug resource/workspace cells test spatial rejection, not complete cake reachability. */
export const PROTECTED = ['-4,0,-3', '4,0,-3'];

/** Encode an integer logical cell for occupancy lookup.
 * @param {Cell} cell Logical position.
 * @return {string} Stable cell key.
 */
export function key(cell: Cell): string { return cell.join(','); }

/** Add logical coordinates without using render transforms.
 * @param {Cell} a Origin.
 * @param {Cell} b Offset.
 * @return {Cell} Adjacent cell.
 */
export function add(a: Cell, b: Cell): Cell { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

/** Validate coordinates, author bounds, protected cells and occupancy atomically.
 * @param {Layout} state Current layout.
 * @param {Cell} cell Proposed cell.
 * @return {string|null} Diagnostic rejection key or null.
 */
export function placementError(state: Layout, cell: Cell): string | null {
  if (cell.length !== 3 || !cell.every(Number.isInteger)) return 'invalid-coordinate';
  if (cell.some((v, i) => v < [BOUNDS.x, BOUNDS.y, BOUNDS.z][i][0] || v > [BOUNDS.x, BOUNDS.y, BOUNDS.z][i][1])) return 'outside-zone';
  if (PROTECTED.includes(key(cell))) return 'protected-cell';
  if (state.instances.some(e => key(e.cell) === key(cell))) return 'occupied';
  return null;
}

/** Check device-specific facing; hoppers cannot point upward.
 * @param {Kind} kind Device kind.
 * @param {Facing} facing Proposed orientation.
 * @return {boolean} Facing validity.
 */
export function validFacing(kind: Kind, facing: Facing): boolean { return Object.hasOwn(VECTORS, facing) && facing !== ('up' as Facing) && (kind === 'hopper' || facing !== 'down'); }

/** Place a clean debug instance, preserving the original state on failure.
 * @param {Layout} state Current layout.
 * @param {Kind} kind Device kind.
 * @param {Cell} cell Logical position.
 * @param {Facing} facing Orientation.
 * @return {Layout} New layout.
 */
export function place(state: Layout, kind: Kind, cell: Cell, facing: Facing): Layout {
  if (!KINDS.includes(kind) || !validFacing(kind, facing)) throw new Error('invalid-device-or-facing');
  const error = placementError(state, cell); if (error) throw new Error(error);
  return { ...state, nextId: state.nextId + 1, instances: [...state.instances, { id: `w${state.nextId}`, kind, cell: [...cell], facing }] };
}

/** Change one live instance without mutating render objects.
 * @param {Layout} state Current layout.
 * @param {string} id Stable instance ID.
 * @param {Facing|null} facing New direction, or null to remove.
 * @return {Layout} New layout.
 */
export function change(state: Layout, id: string, facing: Facing | null): Layout {
  const e = state.instances.find(v => v.id === id); if (!e) throw new Error('missing-instance');
  if (facing && !validFacing(e.kind, facing)) throw new Error('invalid-device-or-facing');
  return { ...state, instances: facing ? state.instances.map(v => v.id === id ? { ...v, facing } : v) : state.instances.filter(v => v.id !== id) };
}

/** Derive local hopper edges from cells, with no saved graph or screen-space proximity.
 * @param {Layout} state Current layout.
 * @return {Edge[]} Physical ports; this slice does not process items.
 */
export function edges(state: Layout): Edge[] {
  const result: Edge[] = [];
  for (const e of state.instances.filter(v => v.kind === 'hopper')) {
    const target = state.instances.find(v => key(v.cell) === key(add(e.cell, VECTORS[e.facing])));
    const source = state.instances.find(v => key(v.cell) === key(add(e.cell, VECTORS.up)));
    const opposite: Record<Facing, Facing | 'up'> = { north: 'south', south: 'north', east: 'west', west: 'east', down: 'up' };
    if (target && target.kind !== 'crafting_table') result.push({ from: e.id, to: target.id, face: opposite[e.facing],
      port: target.kind === 'hopper' ? 'container' : e.facing === 'down' ? 'input' : 'fuel', action: 'push' });
    if (source && source.kind !== 'crafting_table') result.push({ from: source.id, to: e.id, face: 'down',
      port: source.kind === 'hopper' ? 'container' : 'output', action: 'pull' });
  }
  return result;
}

/** Create the reproducible debug feeder/cooker/collector arrangement.
 * @return {Layout} Fresh fixture.
 */
export function fixture(): Layout {
  let state: Layout = { schema: 1, nextId: 1, instances: [] };
  for (const [kind, cell, facing] of [
    ['crafting_table', [-2, 0, 0], 'east'], ['furnace', [0, 1, 0], 'north'],
    ['hopper', [0, 2, 0], 'down'], ['hopper', [-1, 1, 0], 'east'],
    ['hopper', [0, 0, 0], 'east'], ['hopper', [1, 0, 0], 'east'],
    ['blast_furnace', [2, 0, -1], 'south'],
  ] as [Kind, Cell, Facing][]) state = place(state, kind, cell, facing);
  return state;
}

/** Validate an experiment layout before restoring it; no production save key is used.
 * @param {string} json Serialized layout.
 * @return {Layout} Revalidated logical state.
 */
export function restore(json: string): Layout {
  if (json.length > 60000) throw new Error('invalid-save');
  const raw = JSON.parse(json) as Layout;
  if (raw.schema !== 1 || !Number.isSafeInteger(raw.nextId) || raw.nextId < 1 || !Array.isArray(raw.instances) || raw.instances.length > 252) throw new Error('invalid-save');
  let checked: Layout = { schema: 1, nextId: 1, instances: [] }; const ids = new Set<string>(); let largest = 0;
  for (const e of raw.instances) {
    if (!e || !/^w[1-9]\d*$/.test(e.id) || ids.has(e.id) || !Array.isArray(e.cell)) throw new Error('invalid-save');
    checked = place(checked, e.kind, e.cell, e.facing); checked.instances.at(-1)!.id = e.id;
    ids.add(e.id); largest = Math.max(largest, Number(e.id.slice(1)));
  }
  if (raw.nextId <= largest) throw new Error('invalid-save');
  return { ...checked, nextId: raw.nextId };
}
