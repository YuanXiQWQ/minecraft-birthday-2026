/** Domain queries share native shape overrides and the renderer's exported model-element bounds. */
import models from '../data/block-model-shapes.json' with {type:'json'};
import facts from '../data/block-properties.json' with {type:'json'};
import {nativeShapes,FULL_BLOCK} from './block-shapes.ts';
import type {Bounds} from './player-motion.ts';

/** Match original variant and multipart state predicates.
 * @param {Record<string,unknown>} when Native property expression.
 * @param {Record<string,string>} state Block properties.
 * @return {boolean} Whether the model part participates in collision.
 */
function matches(when:Record<string,unknown>,state:Record<string,string>):boolean{return Object.entries(when).every(([k,v])=>k==='OR'?(v as Record<string,unknown>[]).some(w=>matches(w,state)):k==='AND'?(v as Record<string,unknown>[]).every(w=>matches(w,state)):String(v).split('|').includes(state[k]??'false'));}

/** Resolve local collision boxes without loading renderer assets during a transaction.
 * @param {string} block Native short block name.
 * @param {Record<string,string>} state Native properties.
 * @return {Bounds[]} Unit-space boxes used by both occupied-cell and safe-exit checks.
 */
export function blockCollision(block:string,state:Record<string,string>):Bounds[]{
    const fact=(facts as Record<string,{collision:boolean}>)[block==='wall_torch'?'torch':block==='oak_wall_sign'?'oak_sign':block];
    if(fact?.collision===false||['air','water','tall_grass'].includes(block))return [];
    const native=nativeShapes(block,state,true);if(native!==null)return native;
    const rows=(models as Record<string,{when:Record<string,unknown>;boxes:number[][]}[]>)[block];
    return rows?rows.filter(row=>matches(row.when,state)).flatMap(row=>row.boxes as Bounds[]):[FULL_BLOCK];
}
