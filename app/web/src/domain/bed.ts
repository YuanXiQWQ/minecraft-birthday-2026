/** Java 26.3 straw-bed use, darkness eligibility and single-player sleep completion. */
import type {Cell,Progress,DomainEvent} from './types.ts';
import {blockAt,direction} from './placed-blocks.ts';
import type {PlacedBlock} from './placed-blocks.ts';
import {conductsRedstone} from './redstone.ts';
import {emptyEnvironment} from './environment.ts';
import {trackAt} from '../render/sky-tracks.ts';

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
 */
export function useBed(p:Progress,id:string,feet:Cell):void{
    const parts=bedParts(p,id);
    if(parts.length!==2)throw Error('bed.incomplete');
    if(p.sleep||parts.some(b=>b.state.occupied==='true'))throw Error('bed.occupied');
    if(feet.length!==3||!feet.every(Number.isFinite)||!parts.some(b=>Math.abs(feet[0]-b.cell[0]-.5)<=3&&Math.abs(feet[1]-b.cell[1])<=2&&Math.abs(feet[2]-b.cell[2]-.5)<=3))throw Error('bed.tooFar');
    if(parts.some(b=>{const above=blockAt(p,[b.cell[0],b.cell[1]+1,b.cell[2]]);return above&&conductsRedstone(above.block,above.state);}))throw Error('bed.obstructed');
    if(!bedDarkEnough(p))throw Error('bed.noSleep');
    for(const b of parts)b.state.occupied='true';
    p.sleep={scene:p.scene,id:parts[0].id,ticks:0};
}

/** Leave a straw bed without loot or a respawn point; native DESTROY_ON_LEAVE consumes both halves.
 * @param {Progress} p Mutable world facts.
 * @param {DomainEvent[]} events Committed positional destruction sound.
 */
export function leaveBed(p:Progress,events:DomainEvent[]):void{
    const sleep=p.sleep;if(!sleep)return;
    const parts=bedParts({...p,scene:sleep.scene},sleep.id),scene=p.scenes[sleep.scene];
    if(parts.length){scene.blocks=scene.blocks!.filter(b=>!parts.includes(b));events.push({type:'world-sound',scene:sleep.scene,sound:'block.straw_bed.break_leave',position:parts[0].cell.map(n=>n+.5) as Cell,volume:1,pitch:1});}
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
