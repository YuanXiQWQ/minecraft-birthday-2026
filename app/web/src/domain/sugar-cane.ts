/** Native cane ages share random section ticks and finite placed-block lifetimes. */
import type {Progress,Cell} from './types.ts';
import {blockAt,survives,type PlacedBlock} from './placed-blocks.ts';
import {agriculture} from './soil-state.ts';
import {WORLD_SCENES} from './world-config.ts';

/** Read real placed stalks and original uncollected source stalks without changing their identities.
 * @param {Progress} p Scene-local committed facts.
 * @return {PlacedBlock[]} Stalk blocks; original source entries carry a node prefix.
 */
export function caneBlocks(p:Progress):PlacedBlock[]{
    const a=agriculture(p),placed=(p.scenes[p.scene].blocks??[]).filter(b=>b.block==='sugar_cane');
    const natural=WORLD_SCENES[p.scene].nodes.filter(n=>n.block==='sugar_cane'&&!p.world.visits[p.scene].removed.includes(n.id)&&!p.scenes[p.scene].blocks?.some(b=>b.cell.every((v,i)=>v===n.cell[i])));
    if(a.caneAges)for(const id of Object.keys(a.caneAges))if(!natural.some(n=>n.id===id))delete a.caneAges[id];
    return [...placed,...natural.map(n=>({id:'node:'+n.id,block:n.block,cell:n.cell,state:{age:String(a.caneAges?.[n.id]??0)}}))];
}

/** Advance an exposed stalk once per selected random tick, growing on age fifteen below height three.
 * @param {Progress} p Mutable scene facts.
 * @param {PlacedBlock} cane Selected original or placed stalk.
 */
export function randomTickCane(p:Progress,cane:PlacedBlock):void{
    const above:Cell=[cane.cell[0],cane.cell[1]+1,cane.cell[2]];
    if(above[1]>15||blockAt(p,above)||!survives(p,cane))return;
    let height=1;while(height<3&&blockAt(p,[cane.cell[0],cane.cell[1]-height,cane.cell[2]])?.block==='sugar_cane')height++;
    if(height>=3)return;
    const a=agriculture(p),age=Number(cane.state.age??0);
    cane.state.age=String(age===15?0:age+1);
    if(cane.id.startsWith('node:'))(a.caneAges??={})[cane.id.slice(5)]=Number(cane.state.age);
    if(age===15)(p.scenes[p.scene].blocks??=[]).push({id:'cane-growth-'+p.scene+'-'+(++a.serial),block:'sugar_cane',cell:above,state:{age:'0'}});
}
