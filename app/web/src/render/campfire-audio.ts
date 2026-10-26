/** Schedule positional crackles from lit campfires on the active world's client clock. */
import type {Cell,Progress} from '../domain/types.ts';
import type {WorldAudio} from './world-audio.ts';

/** Keep ambient campfire requests independent of rendering frame rate and smoke randomness. */
export class CampfireAudio {
    last:number|null=null;
    remainder=0;
    owner='';
    /** Share the gesture-activated audio owner and read current playable world state.
     * @param {WorldAudio} audio Verified native sound player.
     * @param {Function} current Current progress, or null while playback is paused.
     * @param {Function} random Uniform random source for native chance, volume and pitch.
     */
    constructor(public audio:WorldAudio,public current:()=>Progress|null,public random:()=>number=Math.random){}
    /** Request nearby crackles with native one-in-ten chance, volume and pitch parameters.
     * @param {number} now Client animation time in milliseconds.
     * @param {number[]} listener Actual listener position.
     */
    update(now:number,listener:number[]):void{
        const p=this.current(),owner=p?.scene??'',elapsed=this.last===null?0:Math.max(0,Math.min(250,now-this.last));
        this.last=now;
        if(!p||owner!==this.owner){this.owner=owner;this.remainder=0;return;}
        this.remainder+=elapsed;
        while(this.remainder>=50){
            this.remainder-=50;
            for(const block of p.scenes[p.scene].blocks??[]){
                if(block.block!=='campfire'||block.state.lit==='false'||block.state.waterlogged==='true')continue;
                const position:Cell=[block.cell[0]+.5,block.cell[1]+.5,block.cell[2]+.5];
                if(Math.hypot(...position.map((v,i)=>v-listener[i]))>=24||this.random()>=.1)continue;
                void this.audio.play('block.campfire.crackle',{position,volume:.5+this.random(),pitch:.6+this.random()*.7,valid:()=>{
                    const live=this.current();
                    return live?.scene===owner&&!!live.scenes[live.scene].blocks?.some(b=>b.id===block.id&&b.block==='campfire'&&b.state.lit!=='false'&&b.state.waterlogged!=='true'&&b.cell.every((v,i)=>v===block.cell[i]));
                }});
            }
        }
    }
}
