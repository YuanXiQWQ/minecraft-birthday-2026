/** Bounded animal navigation and native ground-item presentation use active 20 Hz time. */
import type {Cell} from './types.ts';
import type {Bounds,PlayerMotion} from './player-motion.ts';
import {overlaps,playerBounds,clip} from './player-motion.ts';
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

/** One adult or baby mob with bounded wandering, gravity and return after external displacement. */
export class FarmAnimal {
    feet:Cell; previous:Cell; yaw=0; previousYaw=0; walk=0; previousWalk=0; ambientTime=0; age=0; path:Cell[]=[];
    random:NativeRandom;
    baby=false;grounded=true;
    animation=new AnimalWalk();
    velocity:Cell=[0,0,0];returning=false;returnRetry=0;
    /** Initialize an independent lifetime at its authored center.
     * @param {'cow'|'chicken'} kind Native adult type.
     * @param {Cell} origin Home center.
     * @param {number} seed Independent deterministic stream.
     */
    constructor(public kind:'cow'|'chicken',public origin:Cell,seed:number){this.feet=[...origin];this.previous=[...origin];this.random=new NativeRandom(seed);}
    /** Get the native adult or baby collision volume at its current feet.
     * @return {Bounds} Cow or chicken body bounds.
     */
    bounds():Bounds{const scale=this.baby?.5:1,half=(this.kind==='cow'?.45:.2)*scale;return [this.feet[0]-half,this.feet[1],this.feet[2]-half,this.feet[0]+half,this.feet[1]+(this.kind==='cow'?1.4:.7)*scale,this.feet[2]+half];}
    /** Apply unarmored LivingEntity knockback away from the damage source.
     * @param {Cell} source Source position.
     * @param {number} power Native impulse strength.
     */
    knockback(source:Cell,power:number):void{let dx=this.feet[0]-source[0],dz=this.feet[2]-source[2];while(dx*dx+dz*dz<1e-5){dx=(Math.random()-Math.random())*.01;dz=(Math.random()-Math.random())*.01;}const length=Math.hypot(dx,dz);this.velocity=[this.velocity[0]/2+dx/length*power,this.grounded?Math.min(.4,this.velocity[1]/2+power):this.velocity[1],this.velocity[2]/2+dz/length*power];this.path=[];}
    /** Find supported air that fits the current body dimensions and avoids water/fences.
     * @param {number} x Desired center X.
     * @param {number} z Desired center Z.
     * @param {Bounds[]} solids Current collision boxes.
     * @param {Cell[]} water Actual water cells.
     * @param {boolean} homeOnly Whether autonomous wandering must remain in the home disc.
     * @param {number} fromY Starting surface for a navigation edge.
     * @return {Cell|null} Supported feet, or a blocked route.
     */
    floor(x:number,z:number,solids:Bounds[],water:Cell[],homeOnly=true,fromY=this.feet[1]):Cell|null{
        const scale=this.baby?.5:1,half=(this.kind==='cow'?.45:.2)*scale,height=(this.kind==='cow'?1.4:.7)*scale;
        if(homeOnly&&Math.hypot(x-this.origin[0],z-this.origin[2])>2+1e-8||water.some(c=>x+half>c[0]&&x-half<c[0]+1&&z+half>c[2]&&z-half<c[2]+1))return null;
        const candidates=solids.filter(b=>x>=b[0]&&x<=b[3]&&z>=b[2]&&z<=b[5]&&b[4]<=fromY+.6&&b[4]>=fromY-1).map(b=>b[4]).sort((a,b)=>b-a);
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
                const next=this.floor(x,z,solids,water,true,cell[1]);if(!next)continue;const route=[...path,next];queue.push({cell:next,path:route});if(route.length>=4)candidates.push(route);
            }
        }
        if(candidates.length)this.path=candidates[this.random.integer(0,candidates.length-1)];
    }
    /** Search supported quarter-grid routes back home, permitting detours around current obstacles.
     * @param {Bounds[]} solids Current collision geometry.
     * @param {Cell[]} water Water to avoid.
     */
    returnPath(solids:Bounds[],water:Cell[]):void{
        const dx=this.origin[0]-this.feet[0],dz=this.origin[2]-this.feet[2],distance=Math.hypot(dx,dz),
            direct=this.floor(this.feet[0]+dx/distance*.25,this.feet[2]+dz/distance*.25,solids,water,false);
        if(direct){this.path=[direct];return;}
        const start=[...this.feet] as Cell,limit=Math.hypot(start[0]-this.origin[0],start[2]-this.origin[2])+3,
            queue=[{cell:start,path:[] as Cell[],score:0}],seen=new Set<string>();
        this.path=[];this.returnRetry=10;
        for(let visited=0;queue.length&&visited<2048;visited++){
            queue.sort((a,b)=>b.score-a.score);const {cell,path}=queue.pop()!,key=cell.map(n=>Math.round(n*1000)).join(',');
            if(seen.has(key))continue;seen.add(key);
            if(Math.hypot(cell[0]-this.origin[0],cell[2]-this.origin[2])<=1.75){this.path=path;return;}
            for(const [dx,dz] of [[.25,0],[-.25,0],[0,.25],[0,-.25]]){
                const x=cell[0]+dx,z=cell[2]+dz,distance=Math.hypot(x-this.origin[0],z-this.origin[2]);if(distance>limit)continue;
                const next=this.floor(x,z,solids,water,false,cell[1]);if(!next||seen.has(next.map(n=>Math.round(n*1000)).join(',')))continue;
                queue.push({cell:next,path:[...path,next],score:(path.length+1)*.25+Math.max(0,distance-1.75)});
            }
        }
    }
    /** Resolve knockback and gravity against block shapes, using supported ground steps outside the home boundary.
     * @param {Bounds[]} solids Current terrain and construction.
     * @param {Cell[]} water Water to avoid.
     */
    travelPush(solids:Bounds[],water:Cell[]):void{
        if(!this.velocity[1]&&clip(this.bounds(),solids,1,-.001)===-.001){this.grounded=false;this.velocity[1]=-.08*.98;}
        if(this.velocity[1]){
            const dy=clip(this.bounds(),solids,1,this.velocity[1]);this.feet[1]+=dy;
            for(const axis of [0,2]){const delta=clip(this.bounds(),solids,axis,this.velocity[axis]);this.feet[axis]+=delta;this.velocity[axis]*=.91;}
            if(dy!==this.velocity[1]&&this.velocity[1]<0){this.velocity[1]=0;this.grounded=true;}
            else {this.velocity[1]=(this.velocity[1]-.08)*.98;this.grounded=false;}
            if(this.kind==='chicken'&&this.velocity[1]<0)this.velocity[1]*=.6;
            this.path=[];return;
        }
        for(const axis of [0,2]){
            const amount=this.velocity[axis],count=Math.max(1,Math.ceil(Math.abs(amount)/.05));
            if(!amount)continue;
            for(let step=0;step<count;step++){
                const next=this.floor(this.feet[0]+(axis===0?amount/count:0),this.feet[2]+(axis===2?amount/count:0),solids,water,false);
                if(!next){this.velocity[axis]=0;break;}this.feet=next;
            }
            this.velocity[axis]*=.6*.91;if(Math.abs(this.velocity[axis])<.003)this.velocity[axis]=0;
        }
        if(Math.hypot(this.feet[0]-this.previous[0],this.feet[2]-this.previous[2])>1e-8){this.path=[];this.returnRetry=0;}
    }
    /** Advance native-rate push, bounded navigation, persistent home return and ambient sound.
     * @param {Bounds[]} solids Nearby authoritative collision.
     * @param {Cell[]} water Current water cells.
     * @return {{ambient:boolean,pitch:number,step:boolean}} Native ambient trigger and movement feedback.
     */
    tick(solids:Bounds[],water:Cell[]):{ambient:boolean;pitch:number;step:boolean}{
        this.age++;this.previous=[...this.feet];this.previousYaw=this.yaw;this.previousWalk=this.walk;
        this.travelPush(solids,water);
        const outside=Math.hypot(this.feet[0]-this.origin[0],this.feet[2]-this.origin[2])>2+1e-8;
        if(outside!==this.returning){this.path=[];this.returnRetry=0;}this.returning=outside;
        if(this.returnRetry>0)this.returnRetry--;
        const ambient=this.random.integer(0,999)<this.ambientTime++;if(ambient)this.ambientTime=-80;
        if(this.returning){if(!this.path.length&&!this.returnRetry)this.returnPath(solids,water);}
        else if(!this.path.length&&this.random.integer(0,119)===0)this.choosePath(solids,water);
        const target=this.path[0];if(target&&!this.velocity[1]){const dx=target[0]-this.feet[0],dz=target[2]-this.feet[2],distance=Math.hypot(dx,dz),step=Math.min(distance,this.kind==='cow'?.2:.25),next=this.floor(this.feet[0]+dx/(distance||1)*step,this.feet[2]+dz/(distance||1)*step,solids,water,!this.returning);
            if(!next){this.path=[];this.returnRetry=0;}else{this.feet=next;const desired=Math.atan2(-dx,-dz),turn=Math.atan2(Math.sin(desired-this.yaw),Math.cos(desired-this.yaw));this.yaw+=Math.max(-Math.PI/2,Math.min(Math.PI/2,turn));if(distance<=step+.001)this.path.shift();}
        }
        this.walk+=Math.hypot(this.feet[0]-this.previous[0],this.feet[2]-this.previous[2]);
        this.animation.update(Math.hypot(this.feet[0]-this.previous[0],this.feet[2]-this.previous[2]));
        return {ambient,pitch:1+(this.random.float()-this.random.float())*.2,step:Math.floor(this.walk*.6)>Math.floor(this.previousWalk*.6)};
    }
}

/** Apply native Entity.push horizontal impulses once per overlapping player/mob or mob/mob pair.
 * @param {FarmAnimal[]} animals Active adult mobs in the current scene.
 * @param {PlayerMotion} player Optional local player, including the current crouching volume.
 */
export function pushAnimals(animals:FarmAnimal[],player?:PlayerMotion):void{
    const bodies=animals.map(a=>({feet:a.feet,velocity:a.velocity,bounds:a.bounds()}));
    if(player)bodies.push({feet:player.feet,velocity:player.velocity,bounds:playerBounds(player.feet,player.crouching)});
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
        const a=bodies[i],b=bodies[j],box=[...a.bounds] as Bounds;for(const axis of [0,2]){box[axis]-=.2;box[axis+3]+=.2;}
        if(!overlaps(box,b.bounds))continue;
        const dx=b.feet[0]-a.feet[0],dz=b.feet[2]-a.feet[2],max=Math.max(Math.abs(dx),Math.abs(dz));if(max<.01)continue;
        const distance=Math.sqrt(max),scale=Math.min(1,1/distance)*Math.fround(.05)/distance;
        a.velocity[0]-=dx*scale;a.velocity[2]-=dz*scale;b.velocity[0]+=dx*scale;b.velocity[2]+=dz*scale;
    }
}
