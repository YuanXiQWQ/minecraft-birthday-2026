/** Authored upside-down cake content stays separate from the locked vanilla exports. */
import inventory from '../data/inventory-rules.json' with {type:'json'};
import processing from '../data/processing-rules.json' with {type:'json'};
import type {Rules,Recipe,ItemRule} from '../rules/types.ts';

/** Stable authored item, recipe and challenge identities. */
export const ODD_CAKE='jerrys_farm:ekac', ODD_BLOCK='ekac', ODD_ADVANCEMENT='jerrys_farm:wrong_cake';
/** A complete cake batch uses the vanilla ingredients with its outer rows exchanged. */
export const ODD_RECIPE:Recipe={id:ODD_CAKE,type:'minecraft:crafting_shaped',category:'misc',pattern:['WWW','SES','MMM'],key:{W:'minecraft:wheat',S:'minecraft:sugar',E:'minecraft:egg',M:'minecraft:milk_bucket'},result:{id:ODD_CAKE,count:1}};
/** Cake-sized finite stack, independent of permanent catalogue eligibility. */
export const ODD_ITEM:ItemRule={id:ODD_CAKE,maxStack:1,components:[],evidence:'authored upside-down cake'};
/** Carrier and device adapters include the authored item without changing original exports. */
export const INVENTORY_RULES={...inventory,items:{...inventory.items,[ODD_CAKE]:ODD_ITEM}};
/** Furnace and hopper transfers accept the authored item without adding a cooking recipe. */
export const PROCESSING_RULES={...processing,items:{...processing.items,[ODD_CAKE]:ODD_ITEM}};

/** Extend verified vanilla rules with the authored recipe and item.
 * @param {Rules} rules Verified original rule set.
 * @return {Rules} Independent runtime registry with authored content.
 */
export function withEasterEgg(rules:Rules):Rules{return {...rules,items:{...rules.items,[ODD_CAKE]:ODD_ITEM},recipes:[...rules.recipes.filter(r=>r.id!==ODD_CAKE),ODD_RECIPE]};}

/** Map a placeable short name to its actual item namespace.
 * @param {string} block Saved short block name.
 * @return {string} Namespaced inventory identity.
 */
export function blockItem(block:string):string{return block===ODD_BLOCK?ODD_CAKE:'minecraft:'+block;}

/** Identify either edible cake while preserving their distinct item identities.
 * @param {string|undefined} block Saved block name.
 * @return {boolean} Whether native cake portion behavior applies.
 */
export function isCake(block:string|undefined):boolean{return block==='cake'||block===ODD_BLOCK;}
