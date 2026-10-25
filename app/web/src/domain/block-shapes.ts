/** Native voxel shape primitives for player collision and block targeting. */
import {isCake} from './easter-egg.ts';
import type {Bounds} from './player-motion.ts';
/** Whole native block cube. */
export const FULL_BLOCK:Bounds=[0,0,0,1,1,1];
/** Native HopperBlock interaction volumes supply face directions through the empty basin and horizontal outlet.
 * @param {string} block Native short block name.
 * @param {Record<string,string>} state Native properties.
 * @return {Bounds[]} Direction override volumes, independent of collision and outline geometry.
 */
export function interactionShapes(block:string,state:Record<string,string>):Bounds[]{
    if(block!=='hopper')return [];
    const basin:Bounds=[2/16,11/16,2/16,14/16,1,14/16];
    const outlet:Record<string,Bounds>={north:[6/16,8/16,0,10/16,10/16,4/16],south:[6/16,8/16,12/16,10/16,10/16,1],west:[0,8/16,6/16,4/16,10/16,10/16],east:[12/16,8/16,6/16,1,10/16,10/16]};
    return outlet[state.facing]?[basin,outlet[state.facing]]:[basin];
}
/** Obtain explicit native shape overrides; null delegates to original model element cuboids.
 * @param {string} block Native short block name.
 * @param {Record<string,string>} state Native properties.
 * @param {boolean} collision Whether the request is a collision shape rather than outline.
 * @return {Bounds[]|null} Unit-space voxel boxes.
 */
export function nativeShapes(block:string,state:Record<string,string>,collision=false):Bounds[]|null{
    if(block==='campfire')return [[0,0,0,1,7/16,1]];
    if(block.endsWith('_door')||block.endsWith('_trapdoor')){
        const trap=block.endsWith('_trapdoor');
        if(trap&&state.open!=='true')return [state.half==='top'?[0,13/16,0,1,1,1]:[0,0,0,1,3/16,1]];
        let facing=state.facing;
        if(!trap&&state.open==='true'){const order=['north','east','south','west'];facing=order[(order.indexOf(facing)+(state.hinge==='right'?3:1))%4];}
        return [facing==='north'?[0,0,13/16,1,1,1]:facing==='south'?[0,0,0,1,1,3/16]:facing==='west'?[13/16,0,0,1,1,1]:[0,0,0,3/16,1,1]];
    }
    if(block==='wheat')return collision?[]:[[0,0,0,1,(2+Math.max(0,Math.min(7,Number(state.age)||0))*2)/16,1]];
    if(block.endsWith('_stairs')){
        const top=state.half==='top',boxes:Bounds[]=[top?[0,.5,0,1,1,1]:[0,0,0,1,.5,1]],f=state.facing,left=({north:'west',west:'south',south:'east',east:'north'} as Record<string,string>)[f],corner=state.shape?.endsWith('left')?left:({north:'east',east:'south',south:'west',west:'north'} as Record<string,string>)[f];
        /** Select the half plane behind a stair riser. @param {string} d Direction. @param {number} x Quadrant X. @param {number} z Quadrant Z. @return {boolean} Occupied half. */
        const half=(d:string,x:number,z:number):boolean=>d==='north'?z===0:d==='south'?z===1:d==='east'?x===1:x===0;
        for(const x of [0,1])for(const z of [0,1])if(state.shape?.startsWith('outer')?half(f,x,z)&&half(corner,x,z):state.shape?.startsWith('inner')?half(f,x,z)||half(corner,x,z):half(f,x,z))boxes.push([x/2,top?0:.5,z/2,(x+1)/2,top?.5:1,(z+1)/2]);return boxes;
    }
    if(block==='ladder')return [state.facing==='north'?[0,0,13/16,1,1,1]:state.facing==='south'?[0,0,0,1,1,3/16]:state.facing==='west'?[13/16,0,0,1,1,1]:[0,0,0,3/16,1,1]];
    if(block==='torch')return collision?[]:[[6/16,0,6/16,10/16,10/16,10/16]];
    if(block==='straw_bed'){
        const boxes:Bounds[]=[[0,0,0,1,4/16,1]];
        if(state.part==='head')boxes.push(state.facing==='north'?[0,0,0,1,5/16,.5]:state.facing==='south'?[0,0,.5,1,5/16,1]:state.facing==='west'?[0,0,0,.5,5/16,1]:[.5,0,0,1,5/16,1]);
        return boxes;
    }
    if(block==='chest'||block==='trapped_chest'){
        const box:Bounds=[1/16,0,1/16,15/16,14/16,15/16];
        if(block==='chest'&&['left','right'].includes(state.type)){const faces=['north','east','south','west'],face=faces[(faces.indexOf(state.facing)+(state.type==='left'?1:3))%4];if(face==='east')box[3]=1;else if(face==='west')box[0]=0;else if(face==='south')box[5]=1;else box[2]=0;}
        return [box];
    }
    if(block.endsWith('_slab'))return [state.type==='double'?FULL_BLOCK:state.type==='top'?[0,.5,0,1,1,1]:[0,0,0,1,.5,1]];
    if(block==='hopper'){
        const boxes:Bounds[]=[[0,10/16,0,1,11/16,1],[0,11/16,0,2/16,1,1],[14/16,11/16,0,1,1,1],[2/16,11/16,0,14/16,1,2/16],[2/16,11/16,14/16,14/16,1,1],[4/16,4/16,4/16,12/16,10/16,12/16]];
        boxes.push(state.facing==='down'?[6/16,0,6/16,10/16,4/16,10/16]:state.facing==='north'?[6/16,4/16,0,10/16,8/16,8/16]:state.facing==='south'?[6/16,4/16,8/16,10/16,8/16,1]:state.facing==='east'?[8/16,4/16,6/16,1,8/16,10/16]:[0,4/16,6/16,8/16,8/16,10/16]);return boxes;
    }
    if(block==='cauldron')return [[0,0,0,1,4/16,1],[0,4/16,0,2/16,1,1],[14/16,4/16,0,1,1,1],[2/16,4/16,0,14/16,1,2/16],[2/16,4/16,14/16,14/16,1,1]];
    if(block==='composter')return [[0,0,0,1,2/16,1],[0,2/16,0,2/16,1,1],[14/16,2/16,0,1,1,1],[2/16,2/16,0,14/16,1,2/16],[2/16,2/16,14/16,14/16,1,1]];
    if(isCake(block))return [[(1+2*Number(state.bites??0))/16,0,1/16,15/16,.5,15/16]];
    if(block==='farmland'||block==='dirt_path')return [[0,0,0,1,15/16,1]];
    if(block==='rail')return collision?[]:[[0,0,0,1,2/16,1]];
    if(block==='short_grass')return collision?[]:[[2/16,0,2/16,14/16,13/16,14/16]];
    if(block==='sugar_cane')return collision?[]:[[2/16,0,2/16,14/16,1,14/16]];
    if(block==='oak_fence_gate'&&collision)return state.open==='true'?[]:[['north','south'].includes(state.facing)?[0,0,6/16,1,1.5,10/16]:[6/16,0,0,10/16,1.5,1]];
    if(block.endsWith('_fence')){const h=collision?1.5:1,boxes:Bounds[]=[[6/16,0,6/16,10/16,h,10/16]];for(const d of ['north','east','south','west'])if(state[d]==='true')boxes.push(d==='north'?[6/16,0,0,10/16,h,.5]:d==='south'?[6/16,0,.5,10/16,h,1]:d==='west'?[0,0,6/16,.5,h,10/16]:[.5,0,6/16,1,h,10/16]);return boxes;}
    if(block.endsWith('_wall')){const boxes:Bounds[]=[];if(state.up==='true')boxes.push([4/16,0,4/16,12/16,collision?1.5:1,12/16]);for(const d of ['north','east','south','west'])if(state[d]&&state[d]!=='none'){const h=collision?1.5:state[d]==='tall'?1:14/16;boxes.push(d==='north'?[5/16,0,0,11/16,h,.5]:d==='south'?[5/16,0,.5,11/16,h,1]:d==='west'?[0,0,5/16,.5,h,11/16]:[.5,0,5/16,1,h,11/16]);}return boxes;}
    return null;
}
/** Extract visible union edges without internal cuboid seams.
 * @param {Bounds[]} boxes Native voxel union.
 * @return {number[]} Line segment positions.
 */
export function shapeEdges(boxes:Bounds[]):number[]{
    const coordinates=[0,1,2].map(a=>[...new Set(boxes.flatMap(b=>[b[a],b[a+3]]))].sort((a,b)=>a-b)),out:number[]=[];
    /** Query a small neighboring voxel at an edge. @param {number[]} p Position. @return {boolean} Filled interior. */
    const filled=(p:number[]):boolean=>boxes.some(b=>[0,1,2].every(a=>p[a]>b[a]&&p[a]<b[a+3]));
    for(const axis of [0,1,2]){const others=[0,1,2].filter(a=>a!==axis),[u,v]=others;
        for(let k=0;k<coordinates[axis].length-1;k++)for(const a of coordinates[u])for(const b of coordinates[v]){
            const p=[0,0,0];p[axis]=(coordinates[axis][k]+coordinates[axis][k+1])/2;p[u]=a;p[v]=b;
            const values=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>{const q=[...p];q[u]+=x*1e-6;q[v]+=y*1e-6;return filled(q);}),count=values.filter(Boolean).length;
            if(count===1||count===3||count===2&&values[0]===values[3]){p[axis]=coordinates[axis][k];out.push(...p);p[axis]=coordinates[axis][k+1];out.push(...p);}
        }
    }return out;
}
