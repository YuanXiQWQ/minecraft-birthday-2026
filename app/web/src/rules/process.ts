/** Same-version tool tags and contextual cooking values are interpreted independently of GUI and permanent inventory. */
import type {Rules} from './types.ts';
/** Determine correct drops from the tool's actual role and incorrect-block tag rather than material rank or mining speed.
 * @param {string} tool Item identity.
 * @param {string} block Target block identity.
 * @param {Rules} rules Original tool and block tags.
 * @return {boolean} Correct tool for a pickaxe-required source.
 */
export function correctTool(tool:string,block:string,rules:Rules):boolean{const t=rules.items[tool]?.tool;return !!t&&t.role==='pickaxe'&&!!rules.blockTags['minecraft:mineable/pickaxe']?.includes(block)&&!rules.blockTags[t.incorrect]?.includes(block);}
/** Evaluate only the contextual provider operations present in the project's reachable fuel dependency closure.
 * @param {any} value Literal, provider reference or expression.
 * @param {Record<string,any>} providers Versioned registry.
 * @param {boolean} fast Native fast-cooking block context.
 * @param {Set<string>} path Reference cycle guard.
 * @return {number} Evaluated numeric provider.
 */
export function provider(value:any,providers:Record<string,any>,fast:boolean,path=new Set<string>()):number{if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value==='string'){if(path.has(value)||!Object.hasOwn(providers,value))throw new Error('missing-or-cyclic-provider:'+value);return provider(providers[value],providers,fast,new Set([...path,value]));}if(value?.type==='minecraft:conditional'){if(value.condition!=='minecraft:block/fast_cooking')throw new Error('unsupported-cooking-condition');return provider(fast?value.on_true:value.on_false,providers,fast,path);}if(value?.type==='minecraft:div'){const right=provider(value.right,providers,fast,path);if(right===0)throw new Error('provider-zero-divisor');return Math.floor(provider(value.left,providers,fast,path)/right);}throw new Error('unsupported-provider');}
/** Project original fuel duration and contextual processing speed, without choosing infinite-refill product semantics.
 * @param {string} item Fuel identity.
 * @param {'furnace'|'blast_furnace'} station Native station context.
 * @param {number} cookingtime Original recipe tick field.
 * @param {Rules} rules Fuel components and providers.
 * @return {{burnTicks:number,speed:number,cookTicks:number}|null} Native finite-fuel timing or nonfuel.
 */
export function cooking(item:string,station:'furnace'|'blast_furnace',cookingtime:number,rules:Rules):{burnTicks:number;speed:number;cookTicks:number}|null{const key=rules.items[item]?.fuel;if(!key)return null;if(!Number.isFinite(cookingtime)||cookingtime<=0)throw new Error('invalid-cookingtime');const native=rules.loot['data/minecraft/predicate/block/fast_cooking.json'];if(native?.type!=='minecraft:match_block'||native.state)throw new Error('unsupported-fast-cooking-predicate');const blocks=Array.isArray(native.blocks)?native.blocks:[native.blocks],fast=blocks.includes('minecraft:'+station),burnTicks=provider(key,rules.intProviders,fast),speed=provider('minecraft:cooking/speed_default',rules.floatProviders,fast);if(burnTicks<=0||speed<=0)throw new Error('invalid-fuel-component');return{burnTicks,speed,cookTicks:Math.ceil(cookingtime/speed)};}
