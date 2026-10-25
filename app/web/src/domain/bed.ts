/** Java 26.3 straw-bed use, darkness eligibility and single-player sleep completion. */
import type {Cell,Progress,DomainEvent} from './types.ts';
import {blockAt,direction} from './placed-blocks.ts';
import type {PlacedBlock} from './placed-blocks.ts';
import {conductsRedstone} from './redstone.ts';
import {emptyEnvironment} from './environment.ts';
import {trackAt} from '../render/sky-tracks.ts';
import {blockCollision} from './block-collision.ts';
import {overlaps,playerBounds} from './player-motion.ts';
import type {Bounds} from './player-motion.ts';

/** Original day.json gameplay/sky_light_level multiplier track, over a 24000-tick day. */
const SKY_LIGHT={keyframes:[{ticks:133,value:1},{ticks:11867,value:1},{ticks:13670,value:.26666668},{ticks:22330,value:.26666668}]};

/** Evaluate Level.isDarkOutside using the native light track and WeatherAttributes blends.
 * @param {Progress} p Authoritative game clock and interpolated weather.
 * @return {boolean} Whether overworld darkness permits sleep, independently of cosmetic sky settings.
 */
export function bedDarkEnough(p:Progress):boolean{
    const e=p.environment??emptyEnvironment();
    let light=Math.fround(15*Math.fround(trackAt(SKY_LIGHT,e.dayTicks,24000)));
    const thunder=Math.fround(e.thunderLevel*e.rainLevel);
    light=Math.fround(light+(4-light)*.3125*Math.max(0,e.rainLevel-thunder));
    light=Math.fround(light+(4-light)*.52734375*thunder);
    return Math.trunc(Math.fround(15-light))>=4;
}

/** Resolve both actual bed halves with matching orientation and connected positions.
 * @param {Progress} p Current scene.
 * @param {string} id Either clicked half.
 * @return {PlacedBlock[]} Head then foot, or no usable pair.
 */
export function bedParts(p:Progress,id:string):PlacedBlock[]{
    const blocks=p.scenes[p.scene].blocks??[],b=blocks.find(b=>b.id===id&&b.block==='straw_bed');
    if(!b)return [];
    const d=direction(b.state.facing);if(!d||!['head','foot'].includes(b.state.part))return [];
    const sign=b.state.part==='head'?-1:1,other=blocks.find(v=>v.block==='straw_bed'&&v.state.facing===b.state.facing&&v.state.part===(sign===1?'head':'foot')&&v.cell.every((n,i)=>n===b.cell[i]+sign*d[i]));
    return other?(sign===1?[other,b]:[b,other]):[];
}

/** Start resting only when both halves, native reach, headroom and darkness checks pass.
 * @param {Progress} p Mutable transaction.
 * @param {string} id Clicked half.
 * @param {Cell} feet Actual player feet at the interaction.
 * @param {number} yaw Actual look direction for native wake-side selection.
 */
export function useBed(p:Progress,id:string,feet:Cell,yaw=p.scenes[p.scene].pose?.yaw??0):void{
    const parts=bedParts(p,id);
    if(parts.length!==2)throw Error('bed.incomplete');
    if(p.sleep||parts.some(b=>b.state.occupied==='true'))throw Error('bed.occupied');
    if(feet.length!==3||!feet.every(Number.isFinite)||!parts.some(b=>Math.abs(feet[0]-b.cell[0]-.5)<=3&&Math.abs(feet[1]-b.cell[1])<=2&&Math.abs(feet[2]-b.cell[2]-.5)<=3))throw Error('bed.tooFar');
    if(parts.some(b=>{const above=blockAt(p,[b.cell[0],b.cell[1]+1,b.cell[2]]);return above&&conductsRedstone(above.block,above.state);}))throw Error('bed.obstructed');
    if(!bedDarkEnough(p))throw Error('bed.noSleep');
    if(!Number.isFinite(yaw))throw Error('invalid-pose');
    p.scenes[p.scene].pose={feet:[...feet],yaw,pitch:p.scenes[p.scene].pose?.pitch??0};
    for(const b of parts)b.state.occupied='true';
    p.sleep={scene:p.scene,id:parts[0].id,ticks:0};
}

/** Find a native ordered standing location after straw-bed consumption, including bunk-bed fallback.
 * @param {Progress} p World after removal of the consumed bed.
 * @param {PlacedBlock} head Original bed head and orientation.
 * @param {number} yaw Player view angle in Three coordinates.
 * @return {Cell} Collision-free feet position, or the native head-above fallback when no exit exists.
 */
export function bedExit(p:Progress,head:PlacedBlock,yaw:number):Cell{
    const f=direction(head.state.facing),side:Cell=[-f[2],0,f[0]],look=[-Math.sin(yaw),0,-Math.cos(yaw)];
    if(side[0]*look[0]+side[2]*look[2]>0){side[0]*=-1;side[2]*=-1;}
    const around=[[1,0],[1,-1],[1,-2],[0,-2],[-1,-2],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]].map(([s,d])=>[s*side[0]+d*f[0],s*side[2]+d*f[2]]),above=[[0,0],[-f[0],-f[2]]];
    const bunk=blockAt(p,[head.cell[0],head.cell[1]-1,head.cell[2]])?.block==='straw_bed';
    const groups=bunk?[{y:head.cell[1],offsets:around},{y:head.cell[1]-1,offsets:around},{y:head.cell[1],offsets:above}]:[{y:head.cell[1],offsets:[...around,...above]}];
    /** Exclude climbable surfaces from floor finding without removing their collision walls. @param {Cell} cell Cell. @return {Bounds[]} Floor shapes. */
    const floorShapes=(cell:Cell):Bounds[]=>{const b=blockAt(p,cell);return !b||b.block==='ladder'||b.block.endsWith('_trapdoor')&&b.state.open==='true'?[]:blockCollision(b.block,b.state);};
    /** Native reachable damaging blocks are avoided in the first dismount pass. @param {Cell} cell Candidate cell. @return {boolean} Damaging surface. */
    const dangerous=(cell:Cell):boolean=>{const b=blockAt(p,cell);return !!b&&(['lava','fire','cactus','magma_block'].includes(b.block)||b.block==='campfire'&&b.state.lit!=='false');};
    for(const safe of [true,false])for(const group of groups)for(const [dx,dz] of group.offsets){
        const cell:Cell=[head.cell[0]+dx,group.y,head.cell[2]+dz],below:Cell=[cell[0],cell[1]-1,cell[2]],shape=floorShapes(cell),under=Math.max(-Infinity,...floorShapes(below).map(b=>b[4]));
        const floor=shape.length?Math.max(...shape.map(b=>b[4])):under>=1?under-1:-Infinity;
        if(!Number.isFinite(floor)||floor>=1||safe&&(dangerous(cell)||floor<=0&&dangerous(below)))continue;
        const feet:Cell=[cell[0]+.5,cell[1]+floor,cell[2]+.5],box=playerBounds(feet);
        if(box[0]<-18||box[3]>19||box[2]<-22||box[5]>11)continue;
        let blocked=false;
        for(let x=Math.floor(box[0]);x<=Math.floor(box[3]);x++)for(let z=Math.floor(box[2]);z<=Math.floor(box[5]);z++)for(let y=Math.floor(box[1])-1;y<=Math.floor(box[4]);y++){
            const b=blockAt(p,[x,y,z]);if(!b)continue;
            if(blockCollision(b.block,b.state).some(shape=>overlaps(box,shape.map((n,i)=>n+[x,y,z][i%3]) as Bounds)))blocked=true;
        }
        if(!blocked)return feet;
    }
    return [head.cell[0]+.5,head.cell[1]+1.1,head.cell[2]+.5];
}

/** Consume both bed halves without loot or respawn, then persist the native safe standing position and facing.
 * @param {Progress} p Mutable world facts.
 * @param {DomainEvent[]} events Committed positional destruction sound.
 */
export function leaveBed(p:Progress,events:DomainEvent[]):void{
    const sleep=p.sleep;if(!sleep)return;
    const parts=bedParts({...p,scene:sleep.scene},sleep.id),scene=p.scenes[sleep.scene];
    if(parts.length){
        scene.blocks=scene.blocks!.filter(b=>!parts.includes(b));
        const head=parts[0],feet=bedExit({...p,scene:sleep.scene},head,scene.pose?.yaw??0),dx=head.cell[0]+.5-feet[0],dz=head.cell[2]+.5-feet[2];
        scene.pose={feet,yaw:Math.atan2(-dx,-dz),pitch:0};
        events.push({type:'world-sound',scene:sleep.scene,sound:'block.straw_bed.break_leave',position:head.cell.map(n=>n+.5) as Cell,volume:1,pitch:1});
    }
    delete p.sleep;
}

/** Complete sleep after 100 active ticks; wake on daylight or bed removal without skipping time.
 * @param {Progress} p Mutable game state.
 * @param {DomainEvent[]} events Commit-only sound effects.
 */
export function tickBed(p:Progress,events:DomainEvent[]):void{
    const sleep=p.sleep;if(!sleep)return;
    if(sleep.scene!==p.scene||bedParts(p,sleep.id).length!==2||!bedDarkEnough(p)){leaveBed(p,events);return;}
    if(++sleep.ticks<100)return;
    const e=p.environment??=emptyEnvironment();
    if(e.control.advanceTime)e.dayTicks=(Math.floor(e.dayTicks/24000)+1)*24000;
    if(e.control.advanceWeather&&e.raining){e.raining=e.thundering=false;e.rainTime=e.thunderTime=0;}
    leaveBed(p,events);
}
