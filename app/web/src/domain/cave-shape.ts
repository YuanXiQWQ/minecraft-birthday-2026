/** A finite authored carver-style passage shares its solid cells with rendering and placement. */
import type {Cell} from './types.ts';
/** Test the low irregular air envelope, including the ore alcove and connected workstation pocket.
 * @param {Cell} cell Logical voxel.
 * @return {boolean} Whether this voxel is cave air.
 */
export function caveAir([x,y,z]: Cell): boolean {
    if (y < 0) return false;
    const entranceRight = z >= 6 ? 2 : z === 5 ? 3 : 4;
    if (z >= 2 && z <= 7 && x >= -3 && x <= entranceRight && y < (x === -3 || x === entranceRight || z === 4 && x < 0 ? 2 : 3)) return true;
    if (x >= 2 && x <= (z >= 0 ? 5 : 4) && z >= -3 && z <= 2 && y < (x === 5 || z === -3 ? 2 : 3)) return true;
    const left = z >= 1 ? -4 : z === 0 ? -5 : z === -1 ? -5 : z === -2 ? -6 : z >= -5 ? -7 : z === -6 ? -5 : -4;
    if (z >= -7 && z <= 1 && x >= left && x <= (z >= -1 ? 3 : 2) && y < (x === left || x === 2 && z < -1 ? 2 : 3 + (Math.abs(x + 2*z) % 7 === 0 ? 1 : 0))) return true;
    const center = z >= -10 ? -2 : -4;
    return z >= -14 && z <= -8 && Math.abs(x-center) <= (z === -9 || z === -12 ? 2 : 1) && y < 2 + (z % 3 === 0 ? 1 : 0);
}
/** Match the authored cave shell without excluding a whole resource or build region.
 * @param {Cell} cell Logical coordinate.
 * @return {boolean} Whether native stone occupies the voxel.
 */
export function caveSolid(cell: Cell): boolean {const [x,y,z]=cell;return x>=-9&&x<=9&&z>=-15&&z<=8&&y>=0&&y<=6&&!caveAir(cell);}
/** Emit only exposed stone; legacy devices retain visible access instead of being buried by a changed backdrop.
 * @param {Cell[]} stations Existing persistent instance coordinates.
 * @param {Cell} eye Approved stationary eye.
 * @return {Cell[]} Exposed original-cube coordinates.
 */
export function caveRockCells(stations: Cell[] = [], eye: Cell = [0,1.62,7]): Cell[] {
    const clear = new Set<string>();
    for (const cell of stations.filter(c=>!caveAir(c))) {
        const target=cell.map(n=>n+.5),steps=Math.max(1,Math.ceil(Math.hypot(...target.map((n,i)=>n-eye[i]))*5));
        for(let s=0;s<=steps;s++) for(const offset of [-.2,0,.2]) clear.add(target.map((n,i)=>Math.floor(eye[i]+(n-eye[i])*s/steps+offset)).join(','));
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)clear.add([cell[0]+dx,cell[1]+dy,cell[2]+dz].join(','));
    }
    const cells:Cell[]=[],directions:Cell[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(let x=-9;x<=9;x++)for(let z=-15;z<=8;z++)for(let y=0;y<=6;y++){
        const c:Cell=[x,y,z];
        if(caveSolid(c)&&!clear.has(c.join(','))&&directions.some(d=>caveAir(c.map((v,i)=>v+d[i]) as Cell)||clear.has(c.map((v,i)=>v+d[i]).join(','))))cells.push(c);
    }
    return cells;
}
