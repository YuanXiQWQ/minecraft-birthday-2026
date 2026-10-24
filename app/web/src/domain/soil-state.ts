/** Lightweight persistent soil identities keep terrain queries independent of simulation imports. */
import type {Cell,Progress} from './types.ts';
import type {Stack} from '../rules/types.ts';
import {NativeRandom} from './environment.ts';
/** Original nine crop cells used only to initialize legacy soil facts. */
export const FARM_PLOTS:Cell[]=Array.from({length:9},(_,i)=>[-5+i%3,0,-2-Math.floor(i/3)*2]);
/** Compare integer world cells. @param {Cell} a First cell. @param {Cell} b Second cell. @return {boolean} Same coordinate. */
function sameCell(a:Cell,b:Cell):boolean{return a.every((v,i)=>v===b[i]);}
export interface Soil {cell: Cell; moisture: number | null}
export interface GroundDrop {id: string; cell: Cell; stack: Stack}
export interface Agriculture {version: 1; random: number; soils: Soil[]; drops: GroundDrop[]; serial: number}

/** Read original pretilled soil only for saves without explicit soil facts.
 * @param {Progress} p Current facts.
 * @param {SceneId} scene Owning scene.
 * @return {Soil[]} Effective edits, including legacy farm plots.
 */
export function soils(p: Progress, scene = p.scene): Soil[] {
    return p.scenes[scene].agriculture?.soils ?? (scene === 'farm' ? FARM_PLOTS.map(([x,y,z]) => ({cell: [x,y-1,z] as Cell, moisture: 7})) : []);
}
/** Initialize soil persistence without discarding crops, sources, devices or inventory.
 * @param {Progress} p Transaction-local facts.
 * @param {SceneId} scene Owning scene.
 * @return {Agriculture} Mutable transaction state.
 */
export function agriculture(p: Progress, scene = p.scene): Agriculture {
    return p.scenes[scene].agriculture ??= {version: 1, random: Number(new NativeRandom(174761 + ['plains','cave','farm','home'].indexOf(scene)).state), soils: soils(p,scene), drops: [], serial: 0};
}
/** Resolve a soil override without consulting renderer geometry.
 * @param {Progress} p Current facts.
 * @param {Cell} cell Ground cell.
 * @return {Soil|undefined} Persistent soil or legacy pretilled soil.
 */
export function soilAt(p: Progress, cell: Cell): Soil | undefined {return soils(p).find(s => sameCell(s.cell,cell));}
