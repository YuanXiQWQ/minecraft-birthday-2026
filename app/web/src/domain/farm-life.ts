/** Bounded animal navigation and native ground-item presentation use active 20 Hz time. */
import type {Cell} from './types.ts';
import type {Bounds} from './player-motion.ts';
import {overlaps} from './player-motion.ts';
import {NativeRandom} from './environment.ts';

/** Native ItemEntity spin and ItemEntityRenderer hover, with a ground-model minimum at zero.
 * @param {number} ticks Active age including partial ticks.
 * @param {number} phase Stable random bob offset.
 * @return {{y:number,yaw:number}} Render-only transform, independent of pickup bounds.
 */
export function itemMotion(ticks:number,phase:number):{y:number;yaw:number}{return {y:Math.sin(ticks/10+phase)*.1+.1+.0625,yaw:ticks/20+phase};}

/** Adult LivingEntity walk state uses smoothed speed for both phase and amplitude. */
export class AnimalWalk {
    speed=0;oldSpeed=0;position=0;
    /** Advance WalkAnimationState once per 20 Hz entity tick.
     * @param {number} distance Actual horizontal displacement this tick.
     */
    update(distance:number):void {this.oldSpeed=this.speed;this.speed+=(Math.min(distance*4,1)-this.speed)*.4;this.position+=this.speed;}
    /** Evaluate a quadruped or chicken leg at the interpolated native phase.
     * @param {number} alpha Partial tick.
     * @param {boolean} opposite Whether this leg has a PI phase offset.
     * @return {number} Model-space X rotation in radians.
     */
    leg(alpha:number,opposite:boolean):number {const speed=Math.min(this.oldSpeed+(this.speed-this.oldSpeed)*alpha,1),position=this.position-this.speed*(1-alpha);return Math.cos(position*.6662+(opposite?Math.PI:0))*1.4*speed;}
}

/** One adult ambient mob, restricted by the authored two-block home radius. */
export class FarmAnimal {
    feet:Cell; previous:Cell; yaw=0; previousYaw=0; walk=0; previousWalk=0; ambientTime=0; age=0; path:Cell[]=[];
    random:NativeRandom;
    animation=new AnimalWalk();
    /** Initialize an independent lifetime at its authored center.
     * @param {'cow'|'chicken'} kind Native adult type.
     * @param {Cell} origin Home center.
     * @param {number} seed Independent deterministic stream.
     */
    constructor(public kind:'cow'|'chicken',public origin:Cell,seed:number){this.feet=[...origin];this.previous=[...origin];this.random=new NativeRandom(seed);}
    /** Find supported air that fits the full native adult body and avoids water/fences.
     * @param {number} x Desired center X.
     * @param {number} z Desired center Z.
     * @param {Bounds[]} solids Current collision boxes.
     * @param {Cell[]} water Actual water cells.
     * @return {Cell|null} Supported feet, or a blocked route.
     */
    floor(x:number,z:number,solids:Bounds[],water:Cell[]):Cell|null{
        const half=this.kind==='cow'?.45:.2,height=this.kind==='cow'?1.4:.7;
        if(Math.hypot(x-this.origin[0],z-this.origin[2])>2+1e-8||water.some(c=>x+half>c[0]&&x-half<c[0]+1&&z+half>c[2]&&z-half<c[2]+1))return null;
        const candidates=solids.filter(b=>x>=b[0]&&x<=b[3]&&z>=b[2]&&z<=b[5]&&b[4]<=this.feet[1]+.6&&b[4]>=this.feet[1]-1).map(b=>b[4]).sort((a,b)=>b-a);
        for(const y of candidates){const body:Bounds=[x-half,y,z-half,x+half,y+height,z+half];if(!solids.some(b=>overlaps(body,b)))return [x,y,z];}return null;
    }
    /** Choose among reachable quarter-grid routes inside the home disc; blocked attempts stay idle.
     * @param {Bounds[]} solids Current terrain/construction.
     * @param {Cell[]} water Water to avoid.
     */
    choosePath(solids:Bounds[],water:Cell[]):void{
        const start=[...this.feet] as Cell,queue=[{cell:start,path:[] as Cell[]}],seen=new Set<string>(['0,0']),candidates:Cell[][]=[];
        for(let i=0;i<queue.length&&i<220;i++){
            const {cell,path}=queue[i];for(const [dx,dz] of [[.25,0],[-.25,0],[0,.25],[0,-.25]]){
                const x=cell[0]+dx,z=cell[2]+dz,key=Math.round((x-start[0])*4)+','+Math.round((z-start[2])*4);if(seen.has(key))continue;seen.add(key);
                const next=this.floor(x,z,solids,water);if(!next)continue;const route=[...path,next];queue.push({cell:next,path:route});if(route.length>=4)candidates.push(route);
            }
        }
        if(candidates.length)this.path=candidates[this.random.integer(0,candidates.length-1)];
    }
    /** Advance one native-rate idle/navigation/sound tick with no elapsed-background catch-up.
     * @param {Bounds[]} solids Nearby authoritative collision.
     * @param {Cell[]} water Current water cells.
     * @return {{ambient:boolean,pitch:number,step:boolean}} Native ambient trigger and movement feedback.
     */
    tick(solids:Bounds[],water:Cell[]):{ambient:boolean;pitch:number;step:boolean}{
        this.age++;this.previous=[...this.feet];this.previousYaw=this.yaw;this.previousWalk=this.walk;
        const ambient=this.random.integer(0,999)<this.ambientTime++;if(ambient)this.ambientTime=-80;
        if(!this.path.length&&this.random.integer(0,119)===0)this.choosePath(solids,water);
        const target=this.path[0];if(target){const dx=target[0]-this.feet[0],dz=target[2]-this.feet[2],distance=Math.hypot(dx,dz),step=Math.min(distance,this.kind==='cow'?.2:.25),next=this.floor(this.feet[0]+dx/(distance||1)*step,this.feet[2]+dz/(distance||1)*step,solids,water);
            if(!next)this.path=[];else{this.feet=next;const desired=Math.atan2(-dx,-dz),turn=Math.atan2(Math.sin(desired-this.yaw),Math.cos(desired-this.yaw));this.yaw+=Math.max(-Math.PI/2,Math.min(Math.PI/2,turn));this.walk+=step;if(distance<=step+.001)this.path.shift();}
        }
        this.animation.update(Math.hypot(this.feet[0]-this.previous[0],this.feet[2]-this.previous[2]));
        return {ambient,pitch:1+(this.random.float()-this.random.float())*.2,step:Math.floor(this.walk*.6)>Math.floor(this.previousWalk*.6)};
    }
}
