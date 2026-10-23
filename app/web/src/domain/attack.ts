/** Java 26.3 Items attributes and SwingAnimation defaults, without introducing combat damage. */
/** Read the held item's native attack speed modifier and animation component.
 * @param {string|null} id Held item identity.
 * @return {{speed:number,duration:number,stab:boolean}} Attacks per second and swing ticks.
 */
export function attackProfile(id:string|null):{speed:number;duration:number;stab:boolean}{
    const name=id?.replace('minecraft:','')??'', material=name.split('_')[0],type=name.split('_').at(-1);
    if(type==='spear'){const duration=({wooden:13,stone:15,iron:19} as Record<string,number>)[material];if(duration)return {speed:20/duration,duration,stab:true};}
    const speed=type==='sword'?1.6:type==='pickaxe'?1.2:type==='shovel'?1:type==='axe'?(material==='iron'?.9:.8):type==='hoe'?({wooden:1,stone:2,iron:3} as Record<string,number>)[material]??4:4;
    return {speed,duration:6,stab:false};
}
/** Convert elapsed active ticks to the native clamped attack charge.
 * @param {number} ticks Elapsed active ticks including partial tick.
 * @param {string|null} id Held item.
 * @return {number} Charge in the interval zero through one.
 */
export function attackCharge(ticks:number,id:string|null):number{return Math.max(0,Math.min(1,ticks*attackProfile(id).speed/20));}
