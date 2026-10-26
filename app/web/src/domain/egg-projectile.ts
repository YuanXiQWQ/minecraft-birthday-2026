/** Java 26.3 egg launch, swept collision, gravity and hatch probabilities. */
import type {Cell} from './types.ts';
import type {Bounds} from './player-motion.ts';
import {overlaps} from './player-motion.ts';

/** Clip a segment against an axis-aligned collision volume.
 * @param {Cell} from Segment origin.
 * @param {Cell} delta Segment displacement.
 * @param {Bounds} box Collision bounds.
 * @return {number|null} First contact fraction, or no intersection.
 */
export function segmentBox(from:Cell,delta:Cell,box:Bounds):number|null{
    let start=0,end=1;
    for(let axis=0;axis<3;axis++){
        if(Math.abs(delta[axis])<1e-12){if(from[axis]<box[axis]||from[axis]>box[axis+3])return null;continue;}
        const a=(box[axis]-from[axis])/delta[axis],b=(box[axis+3]-from[axis])/delta[axis];start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));if(start>end)return null;
    }
    return start;
}

/** Roll ThrownEgg's independent one-in-eight and one-in-thirty-two draws.
 * @param {Function} random Uniform random source in [0,1).
 * @return {number} Zero, one or four baby chickens.
 */
export function eggHatch(random:()=>number=Math.random):number{return Math.floor(random()*8)===0?(Math.floor(random()*32)===0?4:1):0;}

/** Find the nearest free baby-chicken center within Entity's zero-size-to-baby adjustment volume.
 * @param {Cell} point Original egg impact.
 * @param {Bounds[]} solids Block collision boxes.
 * @return {Cell|null} Adjusted feet, or no room to spawn.
 */
export function eggHatchPosition(point:Cell,solids:Bounds[]):Cell|null{
    const near=solids.filter(b=>b.every((v,i)=>i<3?v<point[i]+.6:v>point[i-3]-.6));
    for(const height of [.35,0]){
        const half:Cell=[.1,height/2,.1],allowed:Cell=[.1000005,height/2+.0000005,.1000005];
        const axes=point.map((v,i)=>[v,...near.flatMap(b=>[b[i]-half[i]-.0000001,b[i+3]+half[i]+.0000001])].filter(n=>Math.abs(n-v)<=allowed[i]));
        let best:Cell|null=null,distance=Infinity;
        for(const x of axes[0])for(const y of axes[1])for(const z of axes[2]){const c:Cell=[x,y,z],d=c.reduce((sum,v,i)=>sum+(v-point[i])**2,0),box:Bounds=[x-.1,y-height/2,z-.1,x+.1,y+height/2,z+.1];if(d<distance&&!near.some(b=>overlaps(box,b))){best=c;distance=d;}}
        if(best)return [best[0],best[1]-height/2+(height?0:.000001),best[2]];
    }
    return null;
}

/** One native thrown egg, simulated at 20 Hz and interpolated only for rendering. */
export class EggProjectile {
    position:Cell;previous:Cell;velocity:Cell;age=0;alive=true;
    /** Apply the eye offset, triangular inaccuracy and inherited player movement.
     * @param {Cell} eye Player eye position.
     * @param {Cell} direction Unit look vector.
     * @param {Cell} movement Known player movement per tick.
     * @param {boolean} grounded Whether to omit inherited vertical movement.
     * @param {Function} random Uniform random source.
     */
    constructor(eye:Cell,direction:Cell,movement:Cell,grounded:boolean,random:()=>number=Math.random){
        this.position=[eye[0],eye[1]-.1,eye[2]];this.previous=[...this.position];
        const length=Math.hypot(...direction)||1;
        this.velocity=direction.map((v,i)=>(v/length+(random()-random())*.0172275)*1.5+(i===1&&grounded?0:movement[i])) as Cell;
    }
    /** Apply gravity before drag and sweep the complete movement segment for the nearest impact.
     * @param {Bounds[]} solids Native block collision boxes.
     * @param {Bounds[]} entities Living target boxes.
     * @param {Cell[]} water Water cells applying submerged drag.
     * @return {{point:Cell,entity:number}|null} One terminal impact, or ongoing flight.
     */
    tick(solids:Bounds[],entities:Bounds[],water:Cell[]=[]):{point:Cell;entity:number}|null{
        if(!this.alive)return null;
        this.previous=[...this.position];
        const submerged=water.some(c=>this.position.every((v,i)=>v>=c[i]&&v<c[i]+(i===1?7/8:1))),drag=submerged?Math.fround(.8):Math.fround(.99);
        this.velocity[1]-=.03;this.velocity=this.velocity.map(v=>v*drag) as Cell;
        let fraction=Infinity,entity=-1;
        for(const box of solids){const hit=segmentBox(this.position,this.velocity,box);if(hit!==null&&hit<fraction)fraction=hit;}
        const margin=Math.max(0,Math.min(.3,(this.age-2)/20));
        entities.forEach((box,index)=>{const inflated=box.map((v,i)=>v+(i<3?-margin:margin)) as Bounds,hit=segmentBox(this.position,this.velocity,inflated);if(hit!==null&&hit<fraction){fraction=hit;entity=index;}});
        this.position=this.position.map((v,i)=>v+this.velocity[i]*Math.min(1,fraction)) as Cell;this.age++;
        if(fraction<=1){this.alive=false;return {point:[...this.position],entity};}
        if(this.position[1]<-64)this.alive=false;
        return null;
    }
}
