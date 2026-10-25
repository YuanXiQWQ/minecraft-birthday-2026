/** Shared glass adjacency removes only internal touching faces from world geometry. */
import type {Cell,Progress} from '../domain/types.ts';
import {currentHome} from '../domain/home-shape.ts';
import type {Face} from './model-format.ts';

/** Original axis-aligned neighboring block directions. */
const NEIGHBORS: [Face,Cell][]=[['west',[-1,0,0]],['east',[1,0,0]],['down',[0,-1,0]],['up',[0,1,0]],['north',[0,0,-1]],['south',[0,0,1]]];

/** Collect visible authored windows and player glass in the same logical world.
 * @param {Progress} p Current committed world facts.
 * @return {Set<string>} Occupied glass coordinates.
 */
export function glassCells(p:Progress):Set<string>{
    const cells=new Set((p.scenes[p.scene].blocks??[]).filter(b=>b.block==='glass').map(b=>b.cell.join(',')));
    if(p.scene==='home')for(const b of currentHome(p).values())if(b.block==='glass')cells.add(b.cell.join(','));
    return cells;
}

/** Retain external faces, including faces beside non-glass materials.
 * @param {Cell} cell Native block origin.
 * @param {ReadonlySet<string>} glass Authored and player glass coordinates.
 * @return {Face[]} Directions without an adjacent glass block.
 */
export function glassFaces(cell:Cell,glass:ReadonlySet<string>):Face[]{
    return NEIGHBORS.filter(([,offset])=>!glass.has(cell.map((n,i)=>n+offset[i]).join(','))).map(([face])=>face);
}
