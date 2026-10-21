/** Approved infinite catalogue and bounded temporary carriers; no recipes, processing or world drops are created here. */
import type {Stack} from '../rules/types.ts';import {capacity,pickup,distribute,quickMove,collect,sameStack,identity} from './slots.ts';import type {ItemRules,SlotValue} from './slots.ts';
export type EquipmentSlot='head'|'chest'|'legs'|'feet'|'offhand';
export type SlotRef=`hotbar:${number}`|`equipment:${EquipmentSlot}`;
export interface PlayerLayout {selected:number;hotbar:(Stack|null)[];equipment:Record<EquipmentSlot,Stack|null>;presets:((Stack|null)[]|null)[]}
export interface InventoryState extends PlayerLayout {cursor:Stack|null}
export type InventoryCommand={type:'select';index:number}|{type:'wheel';direction:number}|{type:'source';item:string;mode:'left'|'right'|'clone'|'number'|'shift'|'offhand';index?:number}|{type:'slot';index:number;button:0|2}|{type:'equipment';slot:EquipmentSlot;button:0|2}|{type:'clone'|'collect'|'quick'|'quick-all';slot:SlotRef;match?:Stack}|{type:'drag';slots:SlotRef[];mode:'left'|'right'|'middle'}|{type:'swap';slot:SlotRef;target:SlotRef}|{type:'drop';slot?:SlotRef;all:boolean;cursor?:boolean}|{type:'equip'}|{type:'preset';index:number;mode:'save'|'load'};
/** Allocate exactly nine references, five equipment cells and nine optional creative toolbar presets.
 * @return {InventoryState} Empty carriers, independent of permanent unlocks.
 */
export function emptyInventory():InventoryState{return{selected:0,hotbar:Array(9).fill(null),cursor:null,equipment:{head:null,chest:null,legs:null,feet:null,offhand:null},presets:Array(9).fill(null)};}
/** Project stable layout without making a policy choice about the carried cursor.
 * @param {InventoryState} state Runtime carriers.
 * @return {PlayerLayout} Durable layout data.
 */
export function layout(state:InventoryState):PlayerLayout{const {cursor:_,...value}=state;return structuredClone(value);}
/** Validate bounded supported components and native limits; unsupported component behavior is never guessed.
 * @param {Stack|null} s Candidate temporary group.
 * @param {string[]} unlocked Authoritative permanent identities.
 * @param {ItemRules} rules Original count/equipment components.
 */
export function validateStack(s:Stack|null,unlocked:string[],rules:ItemRules):void{if(s===null)return;const r=s&&rules.items[s.id];if(!r||!unlocked.includes(s.id)||!Number.isSafeInteger(s.count)||s.count<1||s.count>r.maxStack||Object.keys(s).some(k=>!['id','count','components'].includes(k)))throw Error('invalid-temporary-stack');if(s.components!==undefined){if(!s.components||Array.isArray(s.components)||identity(s.components).length>4096)throw Error('unsupported-stack-components');for(const[k,v]of Object.entries(s.components)){if(k==='minecraft:damage'){if(!r.maxDamage||!Number.isInteger(v)||Number(v)<0||Number(v)>r.maxDamage)throw Error('unsupported-stack-components');}else if(k!=='minecraft:custom_data')throw Error('unsupported-stack-components');}}}
/** Reject locked, malformed or incompatible stable carriers and saved presets before every input path.
 * @param {InventoryState} value Temporary carriers.
 * @param {string[]} unlocked Permanent acquisition identities.
 * @param {ItemRules} rules Original policies.
 */
export function validateCarriers(value:InventoryState,unlocked:string[],rules:ItemRules):void{if(!value||Object.keys(value).sort().join('|')!=='cursor|equipment|hotbar|presets|selected'||!Number.isInteger(value.selected)||value.selected<0||value.selected>8||!Array.isArray(value.hotbar)||value.hotbar.length!==9||!Array.isArray(value.presets)||value.presets.length!==9)throw Error('invalid-hotbar');if(!value.equipment||Object.keys(value.equipment).sort().join('|')!=='chest|feet|head|legs|offhand')throw Error('invalid-equipment');for(const s of [...value.hotbar,value.cursor,...Object.values(value.equipment)])validateStack(s,unlocked,rules);for(const[key,s]of Object.entries(value.equipment))if(s&&key!=='offhand'&&(s.count!==1||rules.items[s.id].equipment!==key))throw Error('invalid-equipment');for(const preset of value.presets){if(preset===null)continue;if(!Array.isArray(preset)||preset.length!==9)throw Error('invalid-preset');preset.forEach(s=>validateStack(s,unlocked,rules));}}
/** Access transaction-local cells with explicit take/place/capacity policies, ready for container adapters.
 * @param {InventoryState} value Transaction-local inventory.
 * @param {SlotRef} ref Stable logical cell identity.
 * @return {SlotValue} Live policy-bearing slot.
 */
export function cell(value:InventoryState,ref:SlotRef):SlotValue{const [kind,key]=ref.split(':');if(kind==='hotbar'&&/^[0-8]$/.test(key))return{/** Read the transaction-local group. @return {Stack|null} Current content. */get stack(){return value.hotbar[Number(key)];},/** Replace the transaction-local group. @param {Stack|null} s Accepted content. */set stack(s){value.hotbar[Number(key)]=s;},policy:{take:true,place:true}};if(kind==='equipment'&&['head','chest','legs','feet','offhand'].includes(key))return{/** Read the transaction-local group. @return {Stack|null} Current content. */get stack(){return value.equipment[key as EquipmentSlot];},/** Replace the transaction-local group. @param {Stack|null} s Accepted content. */set stack(s){value.equipment[key as EquipmentSlot]=s;},policy:{take:true,place:true,...(key==='offhand'?{}:{limit:1,equipment:key})}};throw Error('invalid-slot');}
/** List only finite owned cells; directory entries can never enter a collection/transfer loop.
 * @return {SlotRef[]} Stable pickup/transfer order.
 */
export function finiteSlots():SlotRef[]{return [...Array.from({length:9},(_,i)=>`hotbar:${i}` as SlotRef),...(['head','chest','legs','feet','offhand'] as const).map(k=>`equipment:${k}` as SlotRef)];}
/** Route hotbar armor into an empty equipment cell, and equipment back to hotbar; missing container destinations stay unavailable.
 * @param {InventoryState} v Mutable transaction.
 * @param {SlotRef} ref Source identity.
 * @param {ItemRules} rules Native equipment components.
 * @return {SlotValue[]} Bounded destinations in priority order.
 */
function targets(v:InventoryState,ref:SlotRef,rules:ItemRules):SlotValue[]{const s=cell(v,ref).stack,gear=s&&rules.items[s.id].equipment;return [...(ref.startsWith('hotbar:')&&gear&&['head','chest','legs','feet'].includes(gear)&&!v.equipment[gear as EquipmentSlot]?[cell(v,`equipment:${gear}` as SlotRef)]:[]),...(ref.startsWith('equipment:')?Array.from({length:9},(_,i)=>cell(v,`hotbar:${i}`)):[])];}
/** Execute bounded native-style temporary operations; every source/clone/preset path rechecks permanent unlocks.
 * @param {InventoryState} current Valid carriers.
 * @param {InventoryCommand} command Semantic input.
 * @param {string[]} unlocked Permanent identities; never changed.
 * @param {ItemRules} rules Original limits and equipment components.
 * @return {InventoryState} Independent next carriers.
 */
export function reduceInventory(current:InventoryState,command:InventoryCommand,unlocked:string[],rules:ItemRules):InventoryState{validateCarriers(current,unlocked,rules);const v=structuredClone(current),hot=()=>Array.from({length:9},(_,i)=>cell(v,`hotbar:${i}`));switch(command.type){
case'select':if(!Number.isInteger(command.index)||command.index<0||command.index>8)throw Error('invalid-hotbar-index');v.selected=command.index;break;
case'wheel':if(!Number.isFinite(command.direction))throw Error('invalid-wheel');v.selected=(v.selected+Math.sign(command.direction)+9)%9;break;
case'source':{if(!['left','right','clone','number','shift','offhand'].includes(command.mode))throw Error('invalid-source-mode');if(!rules.items[command.item]||!unlocked.includes(command.item))throw Error('locked-item');const max=rules.items[command.item].maxStack,s={id:command.item,count:max};if(command.mode==='number'){if(!Number.isInteger(command.index)||command.index!<0||command.index!>8)throw Error('invalid-hotbar-index');v.hotbar[command.index!]=s;}else if(command.mode==='offhand')v.equipment.offhand=s;else if(command.mode==='shift'){const source:SlotValue={stack:s,policy:{take:true,place:false}};quickMove(source,hot(),rules);}else if(command.mode==='clone'){if(!v.cursor)v.cursor=s;}else if(!v.cursor)v.cursor={...s,count:1};else if(sameStack(v.cursor,s,rules)){const n=Math.min(max,v.cursor.count+(command.mode==='left'?1:-1));v.cursor=n?{...v.cursor,count:n}:null;}break;}
case'slot':if(![0,2].includes(command.button))throw Error('invalid-button');v.cursor=pickup(cell(v,`hotbar:${command.index}`),v.cursor,command.button,rules);break;
case'equipment':if(![0,2].includes(command.button))throw Error('invalid-button');v.cursor=pickup(cell(v,`equipment:${command.slot}`),v.cursor,command.button,rules);break;
case'drag':{if(!Array.isArray(command.slots)||command.slots.length>256||!['left','right','middle'].includes(command.mode))throw Error('invalid-drag');const slots=[...new Set(command.slots)].map(r=>cell(v,r));v.cursor=distribute(slots,v.cursor,command.mode,rules);break;}
case'clone':{const s=cell(v,command.slot).stack;if(!v.cursor&&s)v.cursor={...s,count:rules.items[s.id].maxStack};break;}
case'collect':v.cursor=collect(finiteSlots().map(r=>cell(v,r)),v.cursor,rules);break;
case'quick':quickMove(cell(v,command.slot),targets(v,command.slot,rules),rules);break;
case'quick-all':{const selected=command.match??cell(v,command.slot).stack;if(selected){validateStack(selected,unlocked,rules);const refs=finiteSlots().filter(r=>r.startsWith(command.slot.split(':')[0]+':')&&cell(v,r).stack&&sameStack(cell(v,r).stack!,selected,rules));for(const r of refs){const dest=targets(v,r,rules).filter(d=>!refs.some(other=>cell(v,other).stack===d.stack&&d.stack!==null));quickMove(cell(v,r),dest,rules);}}break;}
case'swap':{const a=cell(v,command.slot),b=cell(v,command.target),x=a.stack,y=b.stack;if(a.policy.take&&b.policy.take&&(!x||x.count<=capacity(b,x,rules))&&(!y||y.count<=capacity(a,y,rules))){a.stack=y;b.stack=x;}break;}
case'drop':{if(typeof command.all!=='boolean'||command.cursor!==undefined&&typeof command.cursor!=='boolean')throw Error('invalid-drop');if(command.cursor){if(v.cursor)v.cursor=command.all||v.cursor.count===1?null:{...v.cursor,count:v.cursor.count-1};}else{const s=cell(v,command.slot??`hotbar:${v.selected}`);if(s.policy.take&&s.stack)s.stack=command.all||s.stack.count===1?null:{...s.stack,count:s.stack.count-1};}break;}
case'equip':{const hand=cell(v,`hotbar:${v.selected}`),s=hand.stack,gear=s&&rules.items[s.id].equipment;if(gear&&['head','chest','legs','feet'].includes(gear)){const target=cell(v,`equipment:${gear}` as SlotRef),old=target.stack;if(s&&s.count<=capacity(target,s,rules)&&(!old||!sameStack(old,s,rules))){target.stack=s;hand.stack=old;}}break;}
case'preset':{if(!['save','load'].includes(command.mode))throw Error('invalid-preset');if(!Number.isInteger(command.index)||command.index<0||command.index>8)throw Error('invalid-preset');if(command.mode==='save')v.presets[command.index]=structuredClone(v.hotbar);else if(v.presets[command.index])v.hotbar=structuredClone(v.presets[command.index]!);break;}
default:throw Error('unknown-inventory-command');}validateCarriers(v,unlocked,rules);return v;}
