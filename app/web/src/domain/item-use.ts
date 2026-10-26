/** Java 26.3 default shield and reachable spear components, verified against the locked client. */
import type {InteractionHand} from './hands.ts';
import {handStack} from './hands.ts';
import type {PlayerLayout} from './inventory.ts';

/** Items.spear parameters in ticks; speed thresholds are blocks per second. */
export const SPEARS = {
    'minecraft:wooden_spear':{delay:15,dismount:100,dismountSpeed:14,knockback:200,damage:300,multiplier:.7,jabDamage:1},
    'minecraft:stone_spear':{delay:14,dismount:90,dismountSpeed:13,knockback:180,damage:275,multiplier:.82,jabDamage:2},
    'minecraft:iron_spear':{delay:12,dismount:50,dismountSpeed:11,knockback:135,damage:225,multiplier:.95,jabDamage:3}
} as const;
export type SpearProfile = typeof SPEARS[keyof typeof SPEARS];

/** Read the registered spear's kinetic component without treating arbitrary names as weapons.
 * @param {string|null} id Item identity.
 * @return {SpearProfile|null} Native default profile.
 */
export function spearProfile(id:string|null):SpearProfile|null{return id&&Object.hasOwn(SPEARS,id)?SPEARS[id as keyof typeof SPEARS]:null;}

/** Normalize one native animation interval.
 * @param {number} time Animation time.
 * @param {number} start Interval start.
 * @param {number} end Interval end.
 * @return {number} Clamped progress.
 */
export function progress(time:number,start:number,end:number):number{return Math.max(0,Math.min(1,(time-start)/(end-start)));}

/** Compute SpearAnimations.UseParams from active use ticks.
 * @param {SpearProfile} profile Native kinetic durations.
 * @param {number} time Active elapsed ticks.
 * @return {object} Native raising, fatigue and sway channels.
 */
export function spearUsePose(profile:SpearProfile,time:number){
    const raise=progress(time,0,profile.delay),sway=progress(time,profile.delay+profile.dismount-20,profile.delay+profile.dismount),back=progress(time,profile.delay+profile.damage-5,profile.delay+profile.damage);
    const t=progress(time-20,profile.delay+profile.knockback-40,profile.delay+profile.knockback),c=2*Math.PI/4.5;
    const elastic=t===0?0:t===1?1:t<.5?-(2**(20*t-10)*Math.sin((20*t-11.125)*c))/2:2**(-20*t+10)*Math.sin((20*t-11.125)*c)/2+1;
    const intensity=2*Math.sqrt(1-(sway-1)**2)-2*(1-Math.sqrt(1-back*back));
    return {raise,start:progress(raise,0,.5),middle:progress(raise,.5,.8),end:progress(raise,.8,1),sway,lower:1-(1-elastic)**3,back,intensity,slow:Math.sin(time*19*Math.PI/180)*intensity,fast:Math.sin(time*30*Math.PI/180)*intensity};
}

/** Evaluate the native per-target kinetic contact conditions after the raising delay.
 * @param {SpearProfile} profile Held spear.
 * @param {number} ticks Active use ticks.
 * @param {number} attackerSpeed Signed velocity projected onto the look direction.
 * @param {number} targetSpeed Target's projected velocity.
 * @return {object} Damage and secondary effects; no charge accumulates while standing still.
 */
export function kineticContact(profile:SpearProfile,ticks:number,attackerSpeed:number,targetSpeed:number){
    const age=ticks-profile.delay,relative=Math.max(0,attackerSpeed-targetSpeed),ready=age>=0;
    return {damage:ready&&age<=profile.damage&&attackerSpeed>=0&&relative>=4.6?1+Math.floor(relative*profile.multiplier):0,knockback:ready&&age<=profile.knockback&&attackerSpeed>=5.1,dismount:ready&&age<=profile.dismount&&attackerSpeed>=profile.dismountSpeed};
}

/** Own a single continuous use action shared by both hands; cooldowns survive hand swaps. */
export class ItemUse {
    hand:InteractionHand|null=null;id:string|null=null;ticks=0;shieldCooldown=0;shieldCooldownLength=0;hitFeedback=100;
    /** Start a native blocking or kinetic use when no other hand is busy.
     * @param {PlayerLayout} player Current carriers.
     * @param {InteractionHand} hand Requested hand.
     * @return {boolean} Whether the action consumes the use input.
     */
    start(player:PlayerLayout,hand:InteractionHand):boolean{
        if(this.hand)return true;
        const id=handStack(player,hand)?.id??null;
        if(id!=='minecraft:shield'&&!spearProfile(id)||id==='minecraft:shield'&&this.shieldCooldown>0)return false;
        this.hand=hand;this.id=id;this.ticks=0;return true;
    }
    /** Stop use on release, lost input, GUI entry or a changed carrier. */
    stop():void{this.hand=null;this.id=null;this.ticks=0;}
    /** Fence use to the current stack and advance only active simulation time.
     * @param {PlayerLayout} player Current carriers.
     * @param {number} ticks Elapsed native ticks.
     */
    update(player:PlayerLayout,ticks:number):void{
        this.hitFeedback+=ticks;this.shieldCooldown=Math.max(0,this.shieldCooldown-ticks);
        if(this.hand&&handStack(player,this.hand)?.id!==this.id)this.stop();
        if(this.hand)this.ticks+=ticks;
    }
    /** Resolve BlocksAttacks' five-tick delay, forward hemisphere, durability and disabling.
     * @param {number} damage Incoming raw damage.
     * @param {number} facingDot Horizontal facing dotted with the direction toward the source.
     * @param {boolean} bypass Whether the damage type or piercing projectile bypasses shields.
     * @param {number} disableSeconds Attacking weapon's disable_blocking_for_seconds component.
     * @return {{blocked:number,durability:number,disabled:boolean}} Native block outcome.
     */
    block(damage:number,facingDot:number,bypass=false,disableSeconds=0):{blocked:number;durability:number;disabled:boolean}{
        if(this.id!=='minecraft:shield'||this.ticks<5||this.shieldCooldown>0||bypass||Math.acos(Math.max(-1,Math.min(1,facingDot)))>Math.fround(Math.PI/2))return {blocked:0,durability:0,disabled:false};
        const disabled=disableSeconds>0;
        if(disabled){this.shieldCooldown=this.shieldCooldownLength=Math.round(disableSeconds*20);this.stop();}
        return {blocked:damage,durability:damage<3?0:Math.floor(1+damage),disabled};
    }
}
