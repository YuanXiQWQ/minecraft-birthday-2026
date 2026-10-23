/** A finite authored carver-style passage shares its solid cells with rendering and placement. */
import type {Cell} from './types.ts';
/** Test the low irregular air envelope, including the ore alcove and connected workstation pocket.
 * @param {Cell} cell Logical voxel.
 * @return {boolean} Whether this voxel is cave air.
 */
export function caveAir([x,y,z]: Cell): boolean {
    if (y < 0) return false;
    if (x === -5 && y === 0 && z === 1) return false;
    // A stepped shoulder joins the independent sources to a thick native rock bank.
    if (x >= -7 && x <= -1 && z === -6 && y < 3 || x >= -7 && x <= -4 && z === -5 && y === 0 || x === -7 && z >= -4 && z <= -2 && y < (z === -2 ? 2 : 1)) return false;
    const entranceRight = z >= 6 ? 2 : z === 5 ? 3 : 4;
    const entranceLeft = z >= 5 ? -3 : -4;
    if (z >= 2 && z <= 7 && x >= entranceLeft && x <= entranceRight && y < (x === entranceLeft || x === entranceRight || z === 4 && x < 0 ? 2 : 3)) return true;
    if (x >= 2 && x <= (z >= 0 ? 5 : 4) && z >= -3 && z <= 2 && y < (x === 5 || z === -3 ? 2 : 3)) return true;
    const left = z >= 0 ? -5 : z >= -2 ? -6 : z >= -5 ? -7 : z === -6 ? -5 : -4;
    if (z >= -7 && z <= 1 && x >= left && x <= (z >= -1 ? 3 : 2) && y < (x === left || x === 2 && z < -1 ? 2 : 3 + (Math.abs(x + 2*z) % 7 === 0 ? 1 : 0))) return true;
    const center = z >= -10 ? -2 : -4;
    return z >= -14 && z <= -8 && Math.abs(x-center) <= (z === -9 || z === -12 ? 2 : 1) && y < 2 + (z % 3 === 0 ? 1 : 0);
}
/** Test the enclosing passage rock; vein shoulders are authored separately.
 * @param {Cell} cell Logical coordinate.
 * @return {boolean} Whether native stone occupies the voxel.
 */
export function caveSolid(cell: Cell): boolean {const [x,y,z]=cell;return x>=-9&&x<=9&&z>=-15&&z<=8&&y>=0&&y<=6&&!caveAir(cell);}
/** Persistent source identities also anchor the original mined-cell and device saves. */
export const CAVE_ORIGINAL_NODES = [
    ...originalNodes('stone', [[-6,0,-3],[-5,0,-3],[-4,0,-3],[-6,1,-4],[-5,1,-4]]),
    ...originalNodes('coal_ore', [[-4,1,-5],[-3,0,-4],[-3,1,-5]]),
    ...originalNodes('iron_ore', [[-2,0,-4],[-1,0,-4],[-2,1,-5],[-1,1,-5]])
];
/** Preserve coordinate-independent source IDs used in existing progress.
 * @param {string} block Native block name.
 * @param {Cell[]} cells Fixed coordinates.
 * @return {object[]} Stable source records.
 */
function originalNodes(block: string, cells: Cell[]) {return cells.map((cell,i)=>({id:block+':'+i,block,cell}));}
/** Six cardinal neighbors used for exposed rock faces. */
const NEIGHBORS: Cell[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
/** Native rock joins the alcove in offset shoulders and covers parts of the embedded vein. */
const BANK: Cell[] = [
    [-6,0,-4],[-5,0,-4],[-4,0,-4],[-6,1,-5],[-5,1,-5],[-4,0,-5],[-3,0,-5],[-2,0,-5],[-1,0,-5],
    [-4,2,-5],[-3,2,-6],[-2,2,-6],[-1,1,-4],[-2,0,-3],[-6,2,-5],[-5,2,-6]
];
/** Coal follows the left wall and its inward continuation, rather than one flat display face. */
const COAL: Cell[] = [[-7,0,-1],[-7,1,-1],[-7,1,0],[-6,2,0],[-7,2,-1],[-8,1,-1],[-8,1,0],[-4,2,-5],[-4,2,-6],[-5,2,-6]];
/** Iron appears in a second stepped seam with concealed continuation behind the surface. */
const IRON: Cell[] = [[3,0,-4],[3,1,-5],[4,1,-4],[4,0,-4],[4,0,-5],[-2,0,-5],[-1,0,-5],[-2,1,-6],[-1,2,-6]];
/** Build the finite authored rock volume, including its structural backing.
 * @return {Map<string,Cell>} Unique coordinates independent of visit state.
 */
const ROCK = (() => {
    const cells = new Map<string,Cell>();
    for(let x=-9;x<=9;x++)for(let z=-15;z<=8;z++)for(let y=0;y<=6;y++) {
        const c:Cell=[x,y,z];if(caveSolid(c))cells.set(c.join(','),c);
    }
    for(const c of BANK)cells.set(c.join(','),c);
    return cells;
})();
/** Keep the outer finite backing and timber structural; exposed inner rock is harvestable.
 * @param {Cell} cell Candidate voxel.
 * @return {boolean} Whether this voxel is permanent cave structure.
 */
export function caveFixed(cell: Cell): boolean {
    const [x,y,z]=cell;
    return ROCK.has(cell.join(',')) && (Math.abs(x)===9||z===-15||z===8||y>=5||CAVE_TIMBER.some(c=>c.every((v,i)=>v===cell[i])));
}
/** Assign stable coordinate identities to the finite mineable rock and native ore seams.
 * @return {object[]} Sources independent of visit, render order or remaining exposed faces.
 */
export function caveNodes() {
    const original=new Set(CAVE_ORIGINAL_NODES.map(n=>n.cell.join(','))),coal=new Set(COAL.map(c=>c.join(','))),iron=new Set(IRON.map(c=>c.join(',')));
    return [...CAVE_ORIGINAL_NODES,...[...ROCK.values()].filter(c=>!caveFixed(c)&&!original.has(c.join(','))).map(cell=>({id:'rock:'+cell.join(','),block:coal.has(cell.join(','))?'coal_ore':iron.has(cell.join(','))?'iron_ore':'stone',cell}))];
}
/** Emit only exposed stone; legacy devices retain visible access instead of being buried by a changed backdrop.
 * @param {Cell[]} stations Existing persistent instance coordinates.
 * @param {Cell} eye Approved stationary eye.
 * @param {Cell[]} excavated Persisted mined cells exposing deeper faces.
 * @return {Cell[]} Exposed original-cube coordinates.
 */
export function caveRockCells(stations: Cell[] = [], eye: Cell = [0,1.62,7], excavated: Cell[] = []): Cell[] {
    const clear = caveClearCells(stations, eye, excavated);
    for(const c of excavated)clear.add(c.join(','));
    for(const c of stations)clear.add(c.join(','));
    return [...ROCK.values()].filter(c=>!clear.has(c.join(','))&&NEIGHBORS.some(d=>{
        const next=c.map((v,i)=>v+d[i]) as Cell;
        return next[1]>=0 && (caveAir(next)&&!ROCK.has(next.join(','))||clear.has(next.join(',')));
    }));
}
/** Reserve the same old-device sight corridor for stone, timber, torches and support queries.
 * @param {Cell[]} stations Saved device coordinates.
 * @param {Cell} eye Fixed observation point.
 * @param {Cell[]} excavated Mined cells distinguish excavated placements from legacy embedded devices.
 * @return {Set<string>} Cells carved solely for compatibility with saved devices.
 */
export function caveClearCells(stations: Cell[], eye: Cell = [0,1.62,7], excavated: Cell[] = []): Set<string> {
    const clear = new Set<string>();
    for (const cell of stations.filter(c=>ROCK.has(c.join(','))&&!excavated.some(e=>e.every((v,i)=>v===c[i])))) {
        const target=cell.map(n=>n+.5),steps=Math.max(1,Math.ceil(Math.hypot(...target.map((n,i)=>n-eye[i]))*5));
        for(let s=0;s<=steps;s++) for(const offset of [-.2,0,.2]) clear.add(target.map((n,i)=>Math.floor(eye[i]+(n-eye[i])*s/steps+offset)).join(','));
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)clear.add([cell[0]+dx,cell[1]+dy,cell[2]+dz].join(','));
    }
    return clear;
}

/** Fixed native wall torches; facing points away from the supporting rock or timber. */
export const CAVE_TORCHES: {cell: Cell; wall: Cell; facing: string; light: Cell}[] = [
    {cell: [-6,1,-2], wall: [-7,1,-2], facing: 'east', light: [-5.75,1.7,-1.5]},
    {cell: [4,1,-1], wall: [5,1,-1], facing: 'west', light: [4.25,1.7,-.5]}
];
/** Timber replaces exposed shell cells, so it never adds an invisible forbidden region. */
const CAVE_TIMBER: Cell[] = [[5,0,-1],[5,1,-1],[5,2,-1],[5,3,-1],[4,3,-1]];

/** Derive stone, embedded timber and supported torches together around saved devices.
 * @param {Cell[]} stations Persistent device coordinates, never relocated.
 * @param {Cell} eye Fixed scene eye.
 * @param {Cell[]} excavated Mined rock cells; removed torch supports extinguish their light.
 * @return {object} Actual shell, decorations and their active light anchors.
 */
export function caveLayout(stations: Cell[] = [], eye: Cell = [0,1.62,7], excavated: Cell[] = []) {
    const shell = caveRockCells(stations, eye, excavated), keys = new Set(shell.map(c => c.join(',')));
    const wood = CAVE_TIMBER.filter(c => keys.has(c.join(',')));
    const woodKeys = new Set(wood.map(c => c.join(',')));
    const clear = caveClearCells(stations, eye, excavated);
    const torches = CAVE_TORCHES.filter(t => keys.has(t.wall.join(',')) && !clear.has(t.cell.join(',')) && !stations.some(s => s.every((v,i) => v === t.cell[i])));
    return {stone: shell.filter(c => !woodKeys.has(c.join(','))), wood, torches};
}
