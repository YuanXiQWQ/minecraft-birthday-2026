/** Approved D04 temporary carriers are independent of permanent unlocks and the versioned P3 save. */
import type {Stack,Rules} from '../rules/types.ts';import type {State} from '../domain/types.ts';import {KNOWN_ITEMS,catalogue} from '../domain/state.ts';
export type EquipmentSlot='head'|'chest'|'legs'|'feet'|'offhand';
export interface InventoryState {selected:number;hotbar:(Stack|null)[];cursor:Stack|null;equipment:Record<EquipmentSlot,Stack|null>}
export type InventoryCommand={type:'select';index:number}|{type:'wheel';direction:number}|{type:'source';item:string;mode:'left'|'right'|'clone'|'number';index?:number}|{type:'slot';index:number;button:0|2}|{type:'equipment';slot:EquipmentSlot;button:0|2};
/** Create only temporary carriers; no second finite ordinary backpack is allocated.
 * @return {InventoryState} Independent nine-slot state.
 */
export function emptyInventory():InventoryState{return{selected:0,hotbar:Array(9).fill(null),cursor:null,equipment:{head:null,chest:null,legs:null,feet:null,offhand:null}};}
/** Reject malformed or locked temporary items even when an event bypasses disabled visual controls.
 * @param {InventoryState} inventory Temporary carriers.
 * @param {State} permanent Current permanent facts.
 * @param {Rules} rules Original maximum counts and equipment identities.
 */
export function validateInventory(inventory:InventoryState,permanent:State,rules:Rules):void{if(!Number.isInteger(inventory.selected)||inventory.selected<0||inventory.selected>8||inventory.hotbar.length!==9)throw Error('invalid-hotbar');for(const stack of [...inventory.hotbar,inventory.cursor,...Object.values(inventory.equipment)])if(stack&&(!KNOWN_ITEMS.has(stack.id)||!permanent.progress.unlocked.includes(stack.id)||!Number.isSafeInteger(stack.count)||stack.count<1||stack.count>rules.items[stack.id]?.maxStack||stack.components))throw Error('invalid-temporary-stack');for(const[slot,stack]of Object.entries(inventory.equipment))if(stack&&(slot!=='offhand'&&(stack.count!==1||rules.items[stack.id]?.equipment!==slot)))throw Error('invalid-equipment');}
/** Return visible fixed mainline cells plus side items in first-unlock order, without mutating facts.
 * @param {State} permanent Durable progress.
 * @return {{item:string,unlocked:boolean}[]} Read-only catalogue projection.
 */
export function directory(permanent:State):{item:string;unlocked:boolean}[]{return catalogue(permanent);}
/** Execute bounded basic catalogue/slot commands without granting items or deciding crafting, processing or D07 exit policy.
 * @param {InventoryState} current Runtime carriers.
 * @param {InventoryCommand} command Input intent.
 * @param {State} permanent Authoritative unlock facts.
 * @param {Rules} rules Native stack and equipment predicates.
 * @return {InventoryState} Valid independent runtime state.
 */
export function inventoryCommand(current:InventoryState,command:InventoryCommand,permanent:State,rules:Rules):InventoryState{validateInventory(current,permanent,rules);const next=structuredClone(current);if(command.type==='select'){if(!Number.isInteger(command.index)||command.index<0||command.index>8)throw Error('invalid-hotbar-index');next.selected=command.index;}else if(command.type==='wheel'){if(!Number.isFinite(command.direction))throw Error('invalid-wheel');next.selected=(next.selected+Math.sign(command.direction)+9)%9;}else if(command.type==='source'){if(!KNOWN_ITEMS.has(command.item)||!permanent.progress.unlocked.includes(command.item))throw Error('locked-item');const maximum=rules.items[command.item].maxStack;if(command.mode==='number'){if(!Number.isInteger(command.index)||command.index!<0||command.index!>8)throw Error('invalid-hotbar-index');next.hotbar[command.index!]={id:command.item,count:maximum};}else if(command.mode==='clone'){if(!next.cursor)next.cursor={id:command.item,count:maximum};}else if(!next.cursor)next.cursor={id:command.item,count:1};else if(next.cursor.id===command.item){next.cursor.count+=command.mode==='left'?1:-1;if(next.cursor.count===0)next.cursor=null;else next.cursor.count=Math.min(maximum,next.cursor.count);}}
else{const equipment=command.type==='equipment',index=equipment?command.slot:command.index;if(!equipment&&(!Number.isInteger(index)||Number(index)<0||Number(index)>8))throw Error('invalid-hotbar-index');const slots=equipment?next.equipment:next.hotbar,target=equipment?next.equipment[command.slot]:next.hotbar[command.index],cursor=next.cursor,accept=(s:Stack|null)=>!s||!equipment||command.slot==='offhand'||rules.items[s.id]?.equipment===command.slot,limit=(id:string)=>equipment&&command.slot!=='offhand'?1:rules.items[id].maxStack;
/** Commit one temporary slot replacement after its policy has already accepted the stack.
 * @param {Stack|null} stack New slot content.
 */
function put(stack:Stack|null):void{(slots as any)[index]=stack;}
if(!cursor&&target){const count=command.button===2?Math.ceil(target.count/2):target.count;next.cursor={...target,count};put(count===target.count?null:{...target,count:target.count-count});}else if(cursor&&accept(cursor)){if(!target){const count=Math.min(command.button===2?1:cursor.count,limit(cursor.id));put({...cursor,count});cursor.count-=count;if(!cursor.count)next.cursor=null;}else if(target.id===cursor.id){const count=Math.min(command.button===2?1:cursor.count,limit(cursor.id)-target.count);target.count+=count;cursor.count-=count;if(!cursor.count)next.cursor=null;}else if(cursor.count<=limit(cursor.id)){put(cursor);next.cursor=target;}}}
validateInventory(next,permanent,rules);return next;}
/** Route keyboard intents without consuming text editing or browser modifier shortcuts.
 * @param {string} code Physical DOM code.
 * @param {boolean} editing Editable focus owner.
 * @param {boolean} modified Browser/OS modifier active.
 * @return {'inventory'|'escape'|number|null} Supported base intent.
 */
export function inventoryKey(code:string,editing:boolean,modified:boolean):'inventory'|'escape'|number|null{if(editing||modified)return null;if(code==='KeyE')return'inventory';if(code==='Escape')return'escape';if(/^Digit[1-9]$/.test(code))return Number(code.at(-1))-1;return null;}
/** Reserve native TooltipRenderUtil's twelve-pixel outer margin around the text, including nine-slice borders.
 * @param {number[]} widths Original font widths for each line.
 * @return {{width:number,height:number}} Logical sprite bounds.
 */
export function tooltipBox(widths:number[]):{width:number;height:number}{if(!widths.length||widths.some(w=>!Number.isFinite(w)||w<0))throw Error('invalid-tooltip-lines');return{width:Math.max(...widths)+24,height:8+(widths.length-1)*12+24};}
