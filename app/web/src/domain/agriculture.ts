/** Durable soil edits and native random ticks share the existing visible-game transaction clock. */
import type {Cell, Crop, Progress, SceneId} from './types.ts';
import type {Stack} from '../rules/types.ts';
import {NativeRandom} from './environment.ts';
import {agriculture,soilAt} from './soil-state.ts';
import type {Soil} from './soil-state.ts';
export {agriculture,soilAt,soils} from './soil-state.ts';
export type {Soil,Agriculture,GroundDrop} from './soil-state.ts';
import {blockAt, BLOCK_PROPERTIES} from './placed-blocks.ts';
import {sameCell} from './world-config.ts';
import {playerBounds, overlaps} from './player-motion.ts';
import type {PlacedBlock} from './placed-blocks.ts';
import {caneBlocks,randomTickCane} from './sugar-cane.ts';

/** Retain legacy approved stages while supporting every native age for newly growing crops.
 * @param {Crop} crop Saved crop.
 * @return {number} Native wheat age.
 */
export function cropStage(crop: Crop): number {if(crop.growth.version!==1)return 0;const {ticks,age}=crop.growth.data;return age??(ticks>=240?7:ticks>=160?5:ticks>=80?2:0);}
/** Validate a current tool/face/air context against the native hoe transformer.
 * @param {Progress} p Latest transaction facts.
 * @param {Cell} cell Target block.
 * @param {Cell} normal Clicked face normal.
 * @param {Stack|null} held Actual selected tool.
 * @return {boolean} Whether this reachable soil can be tilled.
 */
export function canTill(p: Progress, cell: Cell, normal: Cell, held: Stack|null): boolean {
    return !!held && /^minecraft:(wooden|stone|iron|golden|diamond|netherite|copper)_hoe$/.test(held.id) && normal[1]!==-1 && cell.every(Number.isInteger) && cell[0]>=-18&&cell[0]<=18&&cell[2]>=-22&&cell[2]<=10&&cell[1]>=-4&&cell[1]<=6 && ['dirt','grass_block','dirt_path'].includes(blockAt(p,cell)?.block??'') && !blockAt(p,[cell[0],cell[1]+1,cell[2]]);
}
/** Set native moisture zero on a successful hoe use; tools retain the project's no-durability contract.
 * @param {Progress} p Mutable facts.
 * @param {Cell} cell Target soil.
 * @param {Cell} normal Clicked face.
 * @param {Stack|null} held Actual hoe.
 */
export function till(p: Progress, cell: Cell, normal: Cell, held: Stack|null): void {
    if(!canTill(p,cell,normal,held))throw Error('invalid-till');
    const a=agriculture(p),old=a.soils.find(s=>sameCell(s.cell,cell));
    if(old)old.moisture=0;else a.soils.push({cell:[...cell],moisture:0});
}
/** Test the exact 9×2×9 water volume, including waterlogged blocks, plus uncovered rain.
 * @param {Progress} p Scene view of current facts.
 * @param {Cell} cell Soil position.
 * @return {boolean} Native hydration availability.
 */
export function hydrated(p: Progress, cell: Cell): boolean {
    for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(let y=0;y<=1;y++){
        const b=blockAt(p,[cell[0]+x,cell[1]+y,cell[2]+z]);if(b?.block==='water'||b?.state.waterlogged==='true')return true;
    }
    if(!p.environment?.raining)return false;
    for(let y=cell[1]+1;y<=16;y++){const b=blockAt(p,[cell[0],y,cell[2]]);if(b&&b.block!=='wheat'&&BLOCK_PROPERTIES[b.block]?.collision!==false)return false;}
    return true;
}
/** Compute CropBlock's soil and neighboring-wheat growth modifier.
 * @param {Progress} p Scene-local facts.
 * @param {Cell} cell Crop cell.
 * @return {number} Native growth speed before the random chance divisor.
 */
export function growthSpeed(p: Progress, cell: Cell): number {
    let speed=1;for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){const soil=soilAt(p,[cell[0]+x,cell[1]-1,cell[2]+z]);if(soil?.moisture!==undefined&&soil.moisture!==null)speed+=(soil.moisture>0?3:1)/(x||z?4:1);}
    /** Test a same-level neighboring wheat cell. @param {number} x Column offset. @param {number} z Row offset. @return {boolean} Same crop present. */
    const wheat=(x:number,z:number):boolean=>p.scenes[p.scene].crops.some(c=>sameCell(c.cell,[cell[0]+x,cell[1],cell[2]+z]));
    if((wheat(-1,0)||wheat(1,0))&&(wheat(0,-1)||wheat(0,1))||[-1,1].some(x=>[-1,1].some(z=>wheat(x,z))))speed/=2;
    return speed;
}
/** Convert soil to dirt; crop removal is returned for native loot settlement by the transaction owner.
 * @param {Progress} p Scene facts.
 * @param {Soil} soil Mutable soil.
 * @return {Crop|undefined} Unsupported crop lifetime.
 */
export function dryToDirt(p: Progress, soil: Soil): Crop|undefined {
    soil.moisture=null;const scene=p.scenes[p.scene],crop=scene.crops.find(c=>sameCell(c.cell,[soil.cell[0],soil.cell[1]+1,soil.cell[2]]));
    if(crop)scene.crops=scene.crops.filter(c=>c!==crop);return crop;
}
/** Advance native random section samples and retain the approved wet-soil 240-tick maturity.
 * @param {Progress} p Mutable world facts.
 * @return {{scene:SceneId,crop:Crop}[]} Crops detached by newly obstructed soil.
 */
export function tickAgriculture(p: Progress): {scene:SceneId,crop:Crop}[] {
    const removed:{scene:SceneId,crop:Crop}[]=[];
    for(const scene of ['plains','cave','farm','home'] as SceneId[]){
        const view={...p,scene},a=agriculture(p,scene),rng=new NativeRandom(a.random,true),sections=new Map<string,Map<string,Soil|Crop|PlacedBlock>>();
        /** Register ticking positions by native 16-cube section. @param {Cell} cell Position. @param {Soil|Crop|PlacedBlock} value Live object. */
        const add=(cell:Cell,value:Soil|Crop|PlacedBlock):void=>{const key=cell.map(v=>Math.floor(v/16)).join(',');if(!sections.has(key))sections.set(key,new Map());sections.get(key)!.set(cell.join(','),value);};
        for(const cane of caneBlocks(view))add(cane.cell,cane);
        for(const soil of a.soils)if(soil.moisture!==null){
            const above=blockAt(view,[soil.cell[0],soil.cell[1]+1,soil.cell[2]]);
            if(above&&above.block!=='wheat'&&!above.block.endsWith('_fence_gate')&&BLOCK_PROPERTIES[above.block]?.collision){const crop=dryToDirt(view,soil);if(crop)removed.push({scene,crop});}
            else add(soil.cell,soil);
        }
        for(const crop of p.scenes[scene].crops)if(crop.growth.version===1){
            const soil=soilAt(view,[crop.cell[0],crop.cell[1]-1,crop.cell[2]]),data=crop.growth.data;
            if(soil?.moisture && data.ticks<240){data.ticks++;data.age=Math.max(cropStage(crop),(data.ticks>=240?7:data.ticks>=160?5:data.ticks>=80?2:0));}
            else if(cropStage(crop)<7)add(crop.cell,crop);
        }
        for(const [section,entries] of sections){const base=section.split(',').map(v=>Number(v)*16);for(let i=0;i<3;i++){
            const pos=base.map(v=>v+rng.integer(0,15)).join(','),value=entries.get(pos);if(!value)continue;
            if('moisture' in value){if(value.moisture===null)continue;if(hydrated(view,value.cell))value.moisture=7;else if(value.moisture>0)value.moisture--;else {const above=blockAt(view,[value.cell[0],value.cell[1]+1,value.cell[2]])?.block;if(above!=='wheat'&&!above?.endsWith('_fence_gate'))dryToDirt(view,value);}}
            else if('block' in value)randomTickCane(view,value);
            else if(value.growth.version===1&&rng.integer(0,Math.floor(25/growthSpeed(view,value.cell)))===0){const data=value.growth.data;data.age=Math.min(7,cropStage(value)+1);data.ticks=Math.max(data.ticks,Math.ceil(data.age*240/7));}
        }}a.random=Number(rng.state);
    }return removed;
}
/** Apply native fallDistance−0.5 trampling probability once for an observed player landing.
 * @param {Progress} p Mutable scene.
 * @param {Cell} feet Actual post-collision feet.
 * @param {number} distance Accumulated downward travel.
 * @return {Crop|undefined} Crop detached on a successful trample.
 */
export function trample(p: Progress, feet: Cell, distance: number): Crop|undefined {
    const a=agriculture(p),cell:Cell=[Math.floor(feet[0]),Math.floor(feet[1]-.2),Math.floor(feet[2])],soil=a.soils.find(s=>sameCell(s.cell,cell));
    if(!soil||soil.moisture===null||!Number.isFinite(distance)||distance<=.5||Math.abs(feet[1]-(cell[1]+15/16))>.1)return;
    const rng=new NativeRandom(a.random,true),hit=rng.float()<distance-.5;a.random=Number(rng.state);if(hit)return dryToDirt(p,soil);
}
/** Match Player's inflated pickup AABB to a native quarter-block item entity.
 * @param {Cell} feet Physical player feet.
 * @param {Cell} cell Item block anchor.
 * @return {boolean} Whether walk-over pickup can occur.
 */
export function canPickup(feet: Cell, cell: Cell): boolean {
    const b=playerBounds(feet);return overlaps([b[0]-1,b[1]-.5,b[2]-1,b[3]+1,b[4]+.5,b[5]+1],[cell[0]+.375,cell[1],cell[2]+.375,cell[0]+.625,cell[1]+.25,cell[2]+.625]);
}
