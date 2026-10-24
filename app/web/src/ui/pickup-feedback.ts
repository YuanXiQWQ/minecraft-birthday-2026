/** Native pickup sound parameters are derived only from successfully deposited world drops. */
import type {DomainEvent} from '../domain/types.ts';
import type {SoundOptions} from '../render/world-audio.ts';
import {NativeRandom} from '../domain/environment.ts';

/** Cosmetic sound randomness never advances durable world time or weather randomness. */
const RANDOM = new NativeRandom(Date.now()%2147483647);

/** Apply ClientPacketListener's item pickup pitch and volume, followed by SoundEngine's pitch clamp.
 * @param {DomainEvent} event Successfully committed acquisition fact.
 * @param {Function} random Independent native nextFloat source.
 * @return {SoundOptions|null} One Players-channel pickup voice, or no actual world pickup.
 */
export function pickupSoundOptions(event:DomainEvent,random:()=>number=()=>RANDOM.float()):SoundOptions|null {
    if(event.type!=='items-acquired'||event.pickup===false||!event.deposited?.some(stack=>stack.count>0))return null;
    const f=Math.fround,pitch=f(f(f(f(random())-f(random()))*f(1.4))+2);
    return{volume:f(.2),pitch:Math.max(.5,Math.min(2,pitch)),category:'playersVolume'};
}
