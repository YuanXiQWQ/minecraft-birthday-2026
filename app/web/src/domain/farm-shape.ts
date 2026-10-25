/** Shared authored farm cells project scenery, support, occupancy, water and roof heights without changing saves. */
import {soils,FARM_PLOTS} from './soil-state.ts';
export {FARM_PLOTS} from './soil-state.ts';
import type {Cell, Progress} from './types.ts';

export interface FarmBlock {
    cell: Cell;
    block: string;
    state: Record<string, string>;
    support: boolean;
    rainTop: number;
}
export interface FarmLayout {cells: Map<string, FarmBlock>; water: Cell[]; lights: Cell[]}

/** Far scenery extends beyond the invisible movement boundary in every viewing direction. */
export const FARM_RADIUS = 64;
/** Only geometry-changing saved coordinates participate in the small layout cache. */
let cached: {key: string; value: FarmLayout} | undefined;
/** Construction changes own the expensive terrain cache; soil edits only overlay its cells. */
let baseCache: {key: string; value: FarmLayout} | undefined;

/** Preserve the level working meadow while placing shallow, broken terraces at the sides and rear.
 * @param {number} x World column.
 * @param {number} z World row.
 * @return {number} Native integer ground height.
 */
export function farmHeight(x: number, z: number): number {
    const hills = [[-17, -17, 9, 2], [17, -16, 9, 2], [-26, -31, 14, 3], [25, -34, 15, 3], [-31, 9, 11, 2], [29, 19, 13, 2], [0, 35, 14, 2]];
    return Math.max(0, ...hills.map(([cx, cz, radius, height]) => Math.max(0, Math.ceil(height * (1 - Math.hypot(x - cx, z - cz) / radius)))));
}

/** Identify original solid barn cells solely to preserve existing elevated device supports.
 * @param {Cell} cell Saved support candidate.
 * @return {boolean} Whether the original barn supplied this solid.
 */
function oldBarn([x, y, z]: Cell): boolean {
    return y >= 0 && (z === -12 && x >= -10 && x <= -7 && y < 4 || [-11, -6].includes(x) && z >= -12 && z <= -8 && y < 4 || y === 4 && x >= -11 && x <= -6 && z >= -12 && z <= -8);
}

/** Derive a deterministic farm with local air around saved devices, unchanged ground support and explicit native states.
 * @param {Cell[]} occupied Existing device and placed-block coordinates; never mutated.
 * @return {FarmLayout} Shared effective cells after compatibility carving.
 */
function farmBase(occupied: Cell[]): FarmLayout {
    const key = JSON.stringify(occupied);
    if (baseCache?.key === key) return baseCache.value;
    const cells = new Map<string, FarmBlock>(), water: Cell[] = [], lights: Cell[] = [];
    /** Insert one authoritative cell, with its exact support and precipitation surface.
     * @param {string} block Native short name.
     * @param {Cell} cell World origin.
     * @param {Record<string,string>} state Exact native block properties.
     */
    const put = (block: string, cell: Cell, state: Record<string, string> = {}): void => {
        const thin = block === 'oak_slab' && state.type === 'bottom', low = ['farmland', 'dirt_path'].includes(block);
        cells.set(cell.join(','), {cell, block, state, support: !['water', 'lantern', 'oak_fence', 'oak_stairs'].includes(block) && !thin,
            rainTop: cell[1] + (thin ? .5 : low ? 15 / 16 : block === 'water' ? 7 / 8 : 1)});
    };
    const plots = new Set(FARM_PLOTS.map(c => c[0] + ',' + c[2]));
    for (let x = -FARM_RADIUS; x <= FARM_RADIUS; x++) for (let z = -FARM_RADIUS; z <= FARM_RADIUS; z++) {
        const savedGround = occupied.some(c => Math.abs(c[0] - x) <= 1 && Math.abs(c[2] - z) <= 1);
        const h = savedGround ? 0 : farmHeight(x, z);
        const canal = x === 8 && z >= -5 && z <= 0 || x === -6 && z >= -6 && z <= -2;
        const path = (x === -1 || x === 0) && z >= -8 && z <= 6 || z === -8 && x >= -9 && x <= -1 || z === -7 && x >= -8 && x <= -2;
        const block = plots.has(x + ',' + z) ? 'farmland' : canal && !savedGround ? 'water' : path ? 'dirt_path' : 'grass_block';
        put(block, [x, h - 1, z], block === 'farmland' ? {moisture: '7'} : block === 'grass_block' ? {snowy: 'false'} : {});
        if (block === 'water') {water.push([x, -1, z]); put('dirt', [x, -2, z]);}
        for (let y = -1; y < h - 1; y++) put('dirt', [x, y, z]);
    }
    for (const x of [-11, -6]) for (const z of [-12, -8]) for (let y = 0; y < 3; y++) put('oak_log', [x, y, z], {axis: 'y'});
    for (let x = -10; x <= -7; x++) for (let y = 0; y < 2; y++) put('oak_planks', [x, y, -12]);
    for (const x of [-11, -6]) for (let z = -11; z <= -10; z++) put('oak_planks', [x, 0, z]);
    // A six-block shed has a two-block ridge and one-half-block eaves.
    for (let z = -13; z <= -7; z++) {
        for (const x of [-12, -5]) put('oak_slab', [x, 2, z], {type: 'top', waterlogged: 'false'});
        for (const [x, y, facing] of [[-11, 2, 'east'], [-10, 3, 'east'], [-7, 3, 'west'], [-6, 2, 'west']] as const)
            put('oak_stairs', [x, y, z], {facing, half: 'bottom', shape: 'straight', waterlogged: 'false'});
        for (const x of [-9, -8]) put('oak_slab', [x, 4, z], {type: 'bottom', waterlogged: 'false'});
    }
    for (const cell of [[-10, 0, -11], [-9, 0, -11], [-10, 1, -11]] as Cell[]) put('hay_block', cell, {axis: 'y'});
    for (let x = 1; x <= 7; x++) put('oak_fence', [x, 0, -7]);
    put('oak_fence', [7, 0, -6]);
    for (const [x, z, height] of [[-16, -18, 4], [13, -18, 4], [-23, -7, 5], [24, -26, 5], [28, 12, 4], [-25, 18, 4]]) {
        const ground = farmHeight(x, z);
        for (let y = ground; y < ground + height; y++) put('oak_log', [x, y, z], {axis: 'y'});
        for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > (dy === 1 ? 2 : 3) || dx === 0 && dz === 0 && dy < 0) continue;
            put('oak_leaves', [x + dx, ground + height + dy, z + dz], {distance: '1', persistent: 'true', waterlogged: 'false'});
        }
    }
    for (const cell of [[-11, 1, -7], [6, 1, -7]] as Cell[]) {
        if (cell[0] === -11) put('oak_fence', [-11, 0, -7]);
        put('lantern', cell, {hanging: 'false', waterlogged: 'false'});
    }
    // Keep a one-cell access aisle and headroom around committed construction.
    for (const [id, b] of cells) if (b.cell[1] >= 0 && occupied.some(c => Math.abs(c[0] - b.cell[0]) <= 1 && Math.abs(c[2] - b.cell[2]) <= 1 && b.cell[1] >= Math.max(0, c[1] - 2) && b.cell[1] <= c[1] + 2)) cells.delete(id);
    for (const c of occupied) {
        const below: Cell = [c[0], c[1] - 1, c[2]];
        if (oldBarn(below) && !occupied.some(o => o.every((v, i) => v === below[i]))) put('oak_planks', below);
    }
    for (const b of cells.values()) if (b.block === 'oak_fence') {
        b.state = {waterlogged: 'false'};
        for (const [direction, dx, dz] of [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]] as const) {
            const neighbor = cells.get([b.cell[0] + dx, b.cell[1], b.cell[2] + dz].join(','));
            b.state[direction] = String(!!neighbor && (neighbor.block === 'oak_fence' || neighbor.support));
        }
    }
    for (const [id, b] of cells) if (b.block === 'lantern') {
        if (!cells.has([b.cell[0], b.cell[1] - 1, b.cell[2]].join(','))) cells.delete(id);
        else lights.push(b.cell);
    }
    const value = {cells, water, lights}; baseCache = {key, value}; return value;
}

/** Overlay durable soil without regenerating hills, structures or unchanged cell objects.
 * @param {Cell[]} occupied Saved construction coordinates.
 * @param {Soil[]} edits Effective soil overrides.
 * @return {FarmLayout} Immutable effective layout for this snapshot.
 */
export function farmLayout(occupied: Cell[] = [], edits: import('./soil-state.ts').Soil[] = []): FarmLayout {
    const key=JSON.stringify([occupied,edits]);
    if(cached?.key===key)return cached.value;
    const base=farmBase(occupied),cells=new Map(base.cells);
    for(const soil of edits){
        const block=soil.grass?'grass_block':soil.moisture===null?'dirt':'farmland';
        cells.set(soil.cell.join(','),{cell:soil.cell,block,state:soil.grass?{snowy:'false'}:soil.moisture===null?{}:{moisture:String(soil.moisture)},support:true,rainTop:soil.cell[1]+(block==='farmland'?15/16:1)});
    }
    const value={cells,water:base.water,lights:base.lights};cached={key,value};return value;
}

/** Resolve construction support while preserving natural ground and adjacent water around cane.
 * @param {Progress} p Committed facts.
 * @return {FarmLayout} Cached shared layout; growth ticks do not rebuild it.
 */
export function currentFarm(p: Progress): FarmLayout {
    return farmLayout([...p.scenes.farm.stations, ...(p.scenes.farm.blocks ?? []).filter(b=>b.block!=='sugar_cane')].map(s => s.cell), soils(p,'farm'));
}
