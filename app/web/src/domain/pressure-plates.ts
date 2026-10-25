/** Native pressure-plate contacts and scheduled strength changes for living and item entities. */
import type {Progress,SceneId,DomainEvent,Cell} from './types.ts';
import type {PlacedBlock} from './placed-blocks.ts';
import {overlaps} from './player-motion.ts';
import type {Bounds} from './player-motion.ts';
export interface PlateEntity {id:string;living:boolean;bounds:Bounds}
/** Reachable native pressure plates. */
export const PRESSURE_PLATES=new Set(['oak_pressure_plate','stone_pressure_plate','heavy_weighted_pressure_plate']);

/** Count entity bodies, not stack quantities, inside the native 14 by 4 by 14 pixel trigger volume.
 * @param {PlacedBlock[]} blocks Current scene blocks.
 * @param {PlateEntity[]} entities Unique physical entities.
 * @return {{id:string;count:number}[]} Counts for every placed plate, including released plates.
 */
export function plateContacts(blocks:PlacedBlock[],entities:PlateEntity[]):{id:string;count:number}[]{
    const unique=[...new Map(entities.map(e=>[e.id,e])).values()];
    return blocks.filter(b=>PRESSURE_PLATES.has(b.block)).map(b=>({id:b.id,count:unique.filter(e=>(b.block!=='stone_pressure_plate'||e.living)&&overlaps(e.bounds,[b.cell[0]+1/16,b.cell[1],b.cell[2]+1/16,b.cell[0]+15/16,b.cell[1]+.25,b.cell[2]+15/16])).length}));
}

/** Convert the native entity count to the plate's signal strength.
 * @param {string} block Native plate.
 * @param {number} count Entities intersecting the trigger.
 * @return {number} Signal from zero to fifteen; heavy plates require ten entities per level.
 */
export function plateStrength(block:string,count:number):number{return block==='heavy_weighted_pressure_plate'?Math.ceil(Math.min(150,count)/10):count>0?15:0;}

/** Set a plate's native state and emit audio only when crossing the powered/unpowered boundary.
 * @param {Progress} p Transaction state.
 * @param {SceneId} scene Plate's scene.
 * @param {PlacedBlock} b Plate.
 * @param {DomainEvent[]} events Commit-only audio.
 */
function checkPlate(p:Progress,scene:SceneId,b:PlacedBlock,events:DomainEvent[]):void{
    const old=b.block==='heavy_weighted_pressure_plate'?Number(b.state.power??0):b.state.powered==='true'?15:0,next=plateStrength(b.block,Number(b.state.contacts??0));
    b.state.power=String(next);b.state.powered=String(next>0);
    if(!!old!==!!next)events.push({type:'world-sound',scene,sound:`block.${b.block==='oak_pressure_plate'?'wooden':b.block==='stone_pressure_plate'?'stone':'metal'}_pressure_plate.click_${next?'on':'off'}`,volume:1,pitch:1,position:b.cell.map(n=>n+.5) as Cell});
    if(next)b.state.checkTick=String(p.world.tick+(b.block==='heavy_weighted_pressure_plate'?10:20));else delete b.state.checkTick;
}

/** Publish physical contacts immediately; already pressed plates retain their scheduled native check.
 * @param {Progress} p Mutable progress.
 * @param {SceneId} scene Observed scene.
 * @param {{id:string;count:number}[]} contacts Current contact counts.
 * @param {DomainEvent[]} events Commit-only sound effects.
 */
export function updatePlateContacts(p:Progress,scene:SceneId,contacts:{id:string;count:number}[],events:DomainEvent[]):void{
    if(scene!==p.scene||contacts.length>16384||new Set(contacts.map(c=>c.id)).size!==contacts.length||contacts.some(c=>!Number.isInteger(c.count)||c.count<0||c.count>10000))throw Error('invalid-plate-contacts');
    const counts=new Map(contacts.map(c=>[c.id,c.count]));
    for(const b of p.scenes[scene].blocks??[])if(PRESSURE_PLATES.has(b.block)){
        b.state.contacts=String(counts.get(b.id)??0);
        if(b.state.powered!=='true'&&Number(b.state.power??0)===0&&Number(b.state.contacts)>0)checkPlate(p,scene,b,events);
    }
}

/** Re-evaluate occupied plates at their native twenty/ten tick intervals before hopper movement.
 * @param {Progress} p Transaction state.
 * @param {DomainEvent[]} events Commit-only sound effects.
 */
export function tickPlates(p:Progress,events:DomainEvent[]):void{
    for(const scene of Object.keys(p.scenes) as SceneId[])for(const b of p.scenes[scene].blocks??[])if(PRESSURE_PLATES.has(b.block)&&b.state.checkTick&&p.world.tick>=Number(b.state.checkTick))checkPlate(p,scene,b,events);
}
