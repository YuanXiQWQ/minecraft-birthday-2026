/** Persistent water sources, native five-tick flow and bucket/container interactions. */
import type {Cell,Progress,DomainEvent} from './types.ts';
import type {BlockHit} from './placed-blocks.ts';
import {blockAt,replaceable,placedDrops} from './placed-blocks.ts';
import {currentFarm} from './farm-shape.ts';
import {sameCell,WORLD_SCENES,nodeAtCell} from './world-config.ts';
import {handStack,setHandStack,type InteractionHand} from './hands.ts';
import {storeAcquired} from './inventory.ts';
import {INVENTORY_RULES,PROCESSING_RULES} from './easter-egg.ts';
import {agriculture} from './soil-state.ts';
import {rolledDrops} from '../rules/harvest.ts';
import {cropStage} from './agriculture.ts';
import type {Rules,Stack} from '../rules/types.ts';
export interface FluidCell {cell:Cell;level:number|null}
/** Cardinal fluid spread directions. */
const SIDES:Cell[]=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
/** Read source and flowing water, including contained water. @param {Progress} p World. @param {Cell} cell Position. @return {number|null} Native level, or no water. */
export function waterLevel(p:Progress,cell:Cell):number|null{const b=blockAt(p,cell);return b?.state.waterlogged==='true'?0:b?.block==='water'?Number(b.state.level??0):null;}
/** Enumerate effective water once for rendering, swimming and scheduled flow. @param {Progress} p World. @return {FluidCell[]} Visible fluid cells. */
export function waterCells(p:Progress):FluidCell[]{
    const map=new Map<string,FluidCell>();if(p.scene==='farm')for(const cell of currentFarm(p).water)map.set(cell.join(','),{cell,level:0});
    for(const f of p.scenes[p.scene].fluids??[])if(f.level===null)map.delete(f.cell.join(','));else map.set(f.cell.join(','),f);
    for(const b of p.scenes[p.scene].blocks??[])if(b.state.waterlogged==='true')map.set(b.cell.join(','),{cell:b.cell,level:0});else map.delete(b.cell.join(','));
    return [...map.values()];
}
/** Replace a fluid cell, retaining air tombstones for authored sources. @param {Progress} p World. @param {Cell} cell Position. @param {number|null} level Source/flow/air. */
export function setWater(p:Progress,cell:Cell,level:number|null):void{const s=p.scenes[p.scene];s.fluids??=[];const old=s.fluids.find(f=>sameCell(f.cell,cell));if(old)old.level=level;else s.fluids.push({cell:[...cell],level});}
/** Bound fluid simulation to the playable world. @param {Cell} c Position. @return {boolean} Supported coordinate. */
function inside(c:Cell):boolean{return c[0]>=-18&&c[0]<=18&&c[2]>=-22&&c[2]<=10&&c[1]>=-4&&c[1]<=15;}
/** Match the block's native water-container property, excluding solid double slabs. @param {Progress} p World. @param {Cell} cell Position. @return {boolean} Water can occupy this container. */
export function waterloggable(p:Progress,cell:Cell):boolean{const b=blockAt(p,cell);return !!b&&b.state.type!=='double'&&/^(campfire|.*_stairs|.*_slab|.*_fence|.*_trapdoor|.*_sign|.*_wall_sign|.*_wall|lantern|ladder|chest|trapped_chest|iron_bars|iron_chain)$/.test(b.block);}
/** Check fluid admission against solid blocks. @param {Progress} p World. @param {Cell} cell Position. @return {boolean} Flow can enter. */
function accepts(p:Progress,cell:Cell):boolean{const b=blockAt(p,cell);return inside(cell)&&(replaceable(b?.block)||['wheat','sugar_cane','torch','wall_torch','rail'].includes(b?.block??'')||waterloggable(p,cell));}
/** Drop plants and attachments before water replaces their cell. @param {Progress} p World. @param {Cell} cell Flooded position. */
function washAway(p:Progress,cell:Cell):void{
    const s=p.scenes[p.scene],rules=PROCESSING_RULES as unknown as Rules,stacks:Stack[]=[],crop=s.crops.find(c=>sameCell(c.cell,cell)),placed=s.blocks?.find(b=>sameCell(b.cell,cell));
    if(crop){stacks.push(...rolledDrops('minecraft:wheat',null,rules,Math.random,cropStage(crop)));s.crops=s.crops.filter(c=>c!==crop);}
    if(placed){stacks.push(...placedDrops(placed,null,rules,false));s.blocks=s.blocks!.filter(b=>b!==placed);}
    const node=WORLD_SCENES[p.scene].nodes.find(n=>!n.kind&&nodeAtCell(n,cell)&&!p.world.visits[p.scene].removed.includes(n.id));
    if(node){p.world.visits[p.scene].removed.push(node.id);stacks.push(...rolledDrops('minecraft:'+node.block,null,rules,Math.random));}
    if(stacks.length){const a=agriculture(p);for(const stack of stacks)a.drops.push({id:'water-drop-'+p.scene+'-'+(++a.serial),cell:[...cell],stack});}
}
/** Select the shortest available route to a downward opening within WaterFluid's four-block slope search. @param {Progress} p World. @param {Cell} cell Flow origin. @return {Set<string>} Allowed neighboring positions. */
function spreadDirections(p:Progress,cell:Cell):Set<string>{
    const choices=SIDES.map(d=>cell.map((v,i)=>v+d[i]) as Cell).filter(c=>accepts(p,c)&&waterLevel(p,c)!==0);
    const costs=choices.map(start=>{const queue=[{cell:start,depth:0}],seen=new Set([cell.join(',')]);for(let i=0;i<queue.length;i++){const at=queue[i],key=at.cell.join(',');if(seen.has(key))continue;seen.add(key);const below:Cell=[at.cell[0],at.cell[1]-1,at.cell[2]];if(accepts(p,below)&&waterLevel(p,below)!==0)return at.depth;if(at.depth>=4)continue;for(const d of SIDES){const next=at.cell.map((v,j)=>v+d[j]) as Cell;if(!seen.has(next.join(','))&&accepts(p,next)&&waterLevel(p,next)!==0)queue.push({cell:next,depth:at.depth+1});}}return Infinity;});
    const min=Math.min(...costs);return new Set(choices.filter((_,i)=>costs[i]===min).map(c=>c.join(',')));
}
/** Extinguish a lit fire with the native sound. @param {Progress} p World. @param {Cell} cell Position. @param {DomainEvent[]} events Commit feedback. */
export function extinguish(p:Progress,cell:Cell,events:DomainEvent[]):void{const b=p.scenes[p.scene].blocks?.find(b=>sameCell(b.cell,cell));if(b?.block==='campfire'&&b.state.lit!=='false'){b.state.lit='false';events.push({type:'world-sound',scene:p.scene,sound:'block.fire.extinguish',position:cell,volume:.5,pitch:2.6+(Math.random()-Math.random())*.8});}}
/** Exchange exactly one bucket; a full inventory drops the filled result at the interaction. @param {Progress} p World. @param {InteractionHand} hand Carrier. @param {string} id Result item. @param {Cell} cell Drop origin. */
function exchange(p:Progress,hand:InteractionHand,id:string,cell:Cell):void{
    const held=handStack(p.player.data,hand)!,result={id,count:1};if(held.count===1)setHandStack(p.player.data,hand,result);
    else {setHandStack(p.player.data,hand,{...held,count:held.count-1});const source={stack:result as typeof result|null,policy:{take:true,place:false}};storeAcquired(source,{...p.player.data,cursor:null},INVENTORY_RULES);if(source.stack){const a=agriculture(p);a.drops.push({id:'bucket-drop-'+p.scene+'-'+(++a.serial),cell:[...cell],stack:source.stack});}}
    if(!p.unlocked.includes(id))p.unlocked.push(id);
}
/** Use an empty bucket only on a source, or empty a water bucket into the target container/adjacent cell. @param {Progress} p World. @param {BlockHit} hit In-range hit. @param {InteractionHand} hand Carrier. @param {DomainEvent[]} events Commit feedback. */
export function useBucket(p:Progress,hit:BlockHit,hand:InteractionHand,events:DomainEvent[]):void{
    if(!hit.cell.every(Number.isInteger)||!hit.eye.every(Number.isFinite)||Math.hypot(...hit.point.map((v,i)=>v-hit.eye[i]))>4.50001)throw Error('invalid-bucket-hit');
    const held=handStack(p.player.data,hand),s=p.scenes[p.scene];let cell=hit.cell;
    if(held?.id==='minecraft:bucket'){
        if(waterLevel(p,cell)!==0)throw Error('water-source-required');
        const b=s.blocks?.find(b=>sameCell(b.cell,cell));if(b?.state.waterlogged==='true')b.state.waterlogged='false';else setWater(p,cell,null);
        exchange(p,hand,'minecraft:water_bucket',cell);
    }else if(held?.id==='minecraft:water_bucket'){
        if(!waterloggable(p,cell)||waterLevel(p,cell)===0)cell=hit.cell.map((v,i)=>v+hit.normal[i]) as Cell;
        if(!accepts(p,cell))throw Error('water-placement-blocked');
        const b=s.blocks?.find(b=>sameCell(b.cell,cell));
        if(waterloggable(p,cell)){if(!b)throw Error('authored-container-unavailable');extinguish(p,cell,events);b.state.waterlogged='true';}
        else {washAway(p,cell);setWater(p,cell,0);}
        exchange(p,hand,'minecraft:bucket',cell);
    }else throw Error('bucket-not-held');
    events.push({type:'world-sound',scene:p.scene,sound:held.id==='minecraft:bucket'?'item.bucket.fill':'item.bucket.empty',position:cell,volume:1,pitch:1});
}
/** Advance water toward lower terrain and then out to seven horizontal blocks; two neighboring sources renew supported water. @param {Progress} p World. @param {DomainEvent[]} events Extinguishing feedback. */
export function tickWater(p:Progress,events:DomainEvent[]):void{
    if(p.world.tick%5)return;
    for(const scene of ['plains','cave','farm','home'] as const){const view={...p,scene};if(!p.scenes[scene].fluids?.length&&!p.scenes[scene].blocks?.some(b=>b.state.waterlogged==='true'))continue;
        const fluids=waterCells(view),candidates=new Map<string,Cell>(),directions=new Map<string,Set<string>>();for(const {cell} of fluids){for(const d of [[0,0,0],[0,-1,0],...SIDES]){const c=cell.map((v,i)=>v+d[i]) as Cell;if(accepts(view,c))candidates.set(c.join(','),c);}}
        for(const f of p.scenes[scene].fluids??[])if(accepts(view,f.cell))candidates.set(f.cell.join(','),f.cell);
        const changes:FluidCell[]=[];
        for(const cell of candidates.values()){
            const old=waterLevel(view,cell);if(old===0)continue;
            const above=waterLevel(view,[cell[0],cell[1]+1,cell[2]]),below:Cell=[cell[0],cell[1]-1,cell[2]],neighbors=SIDES.map(d=>waterLevel(view,cell.map((v,i)=>v+d[i]) as Cell));
            let level:number|null=null;
            if(neighbors.filter(n=>n===0).length>=2&&(!accepts(view,below)||waterLevel(view,below)===0))level=0;
            else if(above!==null)level=8;
            else {const incoming=SIDES.flatMap((d,i)=>{const n=neighbors[i];if(n===null)return [];const from=cell.map((v,j)=>v+d[j]) as Cell,down:Cell=[from[0],from[1]-1,from[2]];if(old===null&&!directions.has(from.join(',')))directions.set(from.join(','),spreadDirections(view,from));return n!==0&&accepts(view,down)&&waterLevel(view,down)!==0||old===null&&!directions.get(from.join(','))?.has(cell.join(','))?[]:[n>=8?1:n+1];});const min=Math.min(...incoming);if(min<=7)level=min;}
            if(level!==old)changes.push({cell,level});
        }
        for(const {cell,level} of changes){const b=p.scenes[scene].blocks?.find(b=>sameCell(b.cell,cell));if(level!==null&&waterloggable(view,cell)){if(b){extinguish(view,cell,events);b.state.waterlogged='true';}continue;}if(level!==null)washAway(view,cell);setWater(view,cell,level);}
    }
}
