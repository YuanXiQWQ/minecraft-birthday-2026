/** Java 26.3 piercing ray selection and LivingEntity damage cooldown for existing passive mobs. */
import type {Cell} from './types.ts';
import type {Bounds} from './player-motion.ts';
import {segmentBox} from './egg-projectile.ts';

export interface AnimalVitals {health:number;lastDamage:number;hurtAt:number}

/** Clip the full eye ray before testing every entity along the native two-to-four-and-a-half-block segment.
 * @param {Cell} eye Eye position.
 * @param {Cell} look Unit head direction.
 * @param {Cell} movement Actual displacement per tick.
 * @param {Bounds[]} solids Block collision shapes.
 * @param {{id:string,bounds:Bounds}[]} entities Living candidates.
 * @param {boolean} creative Whether the native creative reach modifier applies.
 * @return {string[]} All unobstructed pierced entity identities in world iteration order.
 */
export function spearTargets(eye:Cell,look:Cell,movement:Cell,solids:Bounds[],entities:{id:string;bounds:Bounds}[],creative=false):string[]{
    let reach=(creative?6.5:4.5)+Math.max(0,movement.reduce((sum,v,i)=>sum+v*look[i],0));
    const ray=look.map(v=>v*reach) as Cell;
    for(const b of solids){const t=segmentBox(eye,ray,b);if(t!==null)reach=Math.min(reach,t*Math.hypot(...ray));}
    if(reach<2)return [];
    const from=eye.map((v,i)=>v+look[i]*2) as Cell,delta=look.map(v=>v*(reach-2)) as Cell;
    return entities.filter(e=>{
        if(segmentBox(from,delta,e.bounds)!==null)return true;
        const outside=segmentBox(from,delta,e.bounds.map((v,i)=>v+(i<3?-.125:.125)) as Bounds);if(outside===null)return false;
        const point=from.map((v,i)=>v+delta[i]*outside) as Cell,toward=point.map((v,i)=>(e.bounds[i]+e.bounds[i+3])/2-v) as Cell,surface=segmentBox(point,toward,e.bounds);
        return surface!==null&&!solids.some(b=>{const hit=segmentBox(point,toward,b);return hit!==null&&hit<surface;});
    }).map(e=>e.id);
}

/** Apply unarmored LivingEntity's twenty-tick hurt window, including zero-damage egg hits.
 * @param {AnimalVitals} current Current saved health and hurt window.
 * @param {number} damage Raw nonnegative damage.
 * @param {number} tick Active world tick.
 * @return {{vitals:AnimalVitals,accepted:boolean,full:boolean}} Damage result and whether ordinary hurt feedback is emitted.
 */
export function hurtAnimal(current:AnimalVitals,damage:number,tick:number):{vitals:AnimalVitals;accepted:boolean;full:boolean}{
    if(current.health<=0)return {vitals:current,accepted:false,full:false};
    const full=tick-current.hurtAt>=10;
    if(!full&&damage<=current.lastDamage)return {vitals:current,accepted:false,full:false};
    return {vitals:{health:Math.max(0,current.health-(full?damage:damage-current.lastDamage)),lastDamage:damage,hurtAt:full?tick:current.hurtAt},accepted:true,full};
}
