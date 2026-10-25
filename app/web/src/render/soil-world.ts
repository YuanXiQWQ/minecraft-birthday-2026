/** Local soil projection retains unrelated terrain buffers, structures and native materials. */
import {Group, InstancedMesh, Matrix4} from 'three';
import type {AuthoredWorld} from './authored-world.ts';
import type {Cell, Progress} from '../domain/types.ts';
import {blockAt} from '../domain/placed-blocks.ts';
import {soils, type Soil} from '../domain/soil-state.ts';

/** Ground materials whose neighboring faces can become exposed by a soil height change. */
const GROUND=new Set(['grass_block','dirt','dirt_path','farmland']);

/** Replace changed soil and its immediate ground neighbors, compacting existing instance buffers in place.
 * @param {AuthoredWorld} world Native model owner.
 * @param {Group} parent Ground layer containing the existing batches.
 * @param {Progress} p Committed facts.
 * @param {Soil[]} previous Last rendered soil values, detached from mutable state.
 * @return {boolean} Whether collision heights changed.
 */
export function patchSoils(world:AuthoredWorld,parent:Group,p:Progress,previous:Soil[]):boolean {
    const before=new Map(previous.map(s=>[s.cell.join(','),s])),after=new Map(soils(p).map(s=>[s.cell.join(','),s])),cells=new Map<string,Cell>();
    let heightChanged=false;
    for(const key of new Set([...before.keys(),...after.keys()])){
        const old=before.get(key),next=after.get(key);
        if(JSON.stringify(old)===JSON.stringify(next))continue;
        const cell=(next??old)!.cell;
        heightChanged ||= !old||!next||(old.moisture===null)!==(next.moisture===null);
        for(const [dx,dy,dz] of [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
            const c:Cell=[cell[0]+dx,cell[1]+dy,cell[2]+dz];
            const value=blockAt(p,c);
            if(value&&!value.id&&GROUND.has(value.block))cells.set(c.join(','),c);
        }
    }
    const matrix=new Matrix4();
    // Keep edited full-height ground instanced so spreading grass cannot accumulate per-cell draw calls.
    for(const root of [...parent.children])if(root.userData.soilBatch){
        for(const cell of root.userData.cells as Cell[])cells.set(cell.join(','),cell);
        const release=new Group();release.add(root);world.clear(release);
    }
    for(const root of [...parent.children]){
        if(!GROUND.has(root.userData.block))continue;
        if(root instanceof InstancedMesh){
            const positions=root.userData.cells as Cell[];
            let changed=false;
            for(let i=root.count-1;i>=0;i--)if(cells.has(positions[i].join(','))){
                const last=--root.count;root.getMatrixAt(last,matrix);root.setMatrixAt(i,matrix);
                positions[i]=positions[last];positions.pop();
                if(root.userData.rainTops){root.userData.rainTops[i]=root.userData.rainTops[last];root.userData.rainTops.pop();}
                changed=true;
            }
            if(changed){root.instanceMatrix.needsUpdate=true;root.boundingBox=null;root.boundingSphere=null;}
            if(root.count)continue;
        }else if(!root.userData.cell||!cells.has(root.userData.cell.join(',')))continue;
        const release=new Group();release.add(root);world.clear(release);
    }
    const batches=new Map<string,{block:string;state:string;reachable:boolean;cells:Cell[]}>();
    for(const cell of cells.values()){
        const value=blockAt(p,cell)!;
        const state=value.block==='farmland'?'moisture='+value.state.moisture:value.block==='grass_block'?'snowy=false':'';
        const reachable=cell[0]>=-18&&cell[0]<=18&&cell[2]>=-22&&cell[2]<=10;
        if(value.block!=='farmland'){
            const key=value.block+state+reachable;
            if(!batches.has(key))batches.set(key,{block:value.block,state,reachable,cells:[]});
            batches.get(key)!.cells.push(cell);continue;
        }
        const root=world.block(value.block,state);
        root.position.set(...cell);
        root.userData={id:value.block==='farmland'?'plot:'+ [cell[0],cell[1]+1,cell[2]].join(','):'ground',block:value.block,state:value.state,cell,cells:[cell],rainTops:[cell[1]+(['farmland','dirt_path'].includes(value.block)?15/16:1)],collision:reachable};
        if(!reachable)root.traverse(o=>o.layers.set(1));
        parent.add(root);
    }
    for(const batch of batches.values()){
        const start=parent.children.length;
        world.batch(batch.block,batch.cells,parent,batch.reachable?'ground':'decoration',batch.state);
        for(const root of parent.children.slice(start))Object.assign(root.userData,{soilBatch:true,collision:batch.reachable,rainTops:batch.cells.map(c=>c[1]+(batch.block==='dirt_path'?15/16:1))});
    }
    return heightChanged;
}
