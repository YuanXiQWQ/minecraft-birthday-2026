/** Pure commands, identity validation and projections; versioned player carriers remain separate from deferred processing contracts. */
import type {Command,DomainEvent,PlacementPolicy,Progress,RuntimeState,SceneId,Settings,State,WorkbenchContext,Station} from './types.ts';
import reachable from '../data/registry.json' with {type:'json'};
import nativeInventory from '../data/inventory-rules.json' with {type:'json'};import {emptyInventory,layout,reduceInventory,validateStack,validateCarriers} from './inventory.ts';import {takeCraft} from './crafting.ts';import type {CraftReceipt} from './crafting.ts';import type {Rules} from '../rules/types.ts';import type {InventoryState} from './inventory.ts';import {identity} from './slots.ts';
/** Scene identities do not imply their P7 authored content is implemented. */
export const SCENES:SceneId[]=['plains','cave','farm','home'];
/** Presentation ordering follows the proposed main path without constraining acquisition order or recipe reachability. */
export const MAINLINE=['oak_log','oak_planks','stick','crafting_table','wooden_pickaxe','cobblestone','stone_pickaxe','furnace','raw_iron','iron_ingot','bucket','milk_bucket','wheat_seeds','wheat','sugar_cane','sugar','egg','cake'].map(id=>'minecraft:'+id);
/** Generated P4 fixed-point identities expand validation without changing unlock, discovery or temporary-stack semantics. */
export const KNOWN_ITEMS=new Set(reachable);
/** Deferred data is intentionally unpopulated until its product contract is approved. */
const RESERVED={version:0,data:null} as const;

/** Create independent empty progress, with no natural-resource visits or offline timestamps.
 * @return {Progress} Initial persistent facts.
 */
export function initialProgress():Progress{return {unlocked:[],scene:'plains',scenes:Object.fromEntries(SCENES.map(id=>[id,{layoutVersion:1,stations:[],crops:[]}])) as unknown as Progress['scenes'],player:{version:1,data:layout(emptyInventory())},recipeBook:{...RESERVED},cakePlacement:null};}
/** Create the initial documented settings and empty progress.
 * @return {State} Independent state value.
 */
export function initialState():State{return {progress:initialProgress(),settings:{locale:'en',volume:.2,muted:false}};}
/** Construct ephemeral presentation state without replaying persisted completion or notifications.
 * @return {RuntimeState} Empty runtime-only state.
 */
export function initialRuntime():RuntimeState{return {celebration:'idle',screen:'scene',natural:{}};}
/** Recursively freeze snapshots so consumers cannot mutate the durable value through selectors.
 * @param {T} value Plain domain value.
 * @return {T} Same recursively frozen object.
 */
export function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
/** Assert a structural condition with a stable nonlocalized diagnostic code.
 * @param {unknown} condition Domain invariant.
 * @param {string} code Error identity.
 */
export function ensure(condition:unknown,code='invalid-save'):asserts condition{if(!condition)throw new Error(code);}
/** Accept only the expected own fields, rejecting unknown data instead of silently dropping it.
 * @param {unknown} value Candidate record.
 * @param {string[]} keys Exact supported fields.
 */
function fields(value:unknown,keys:string[]):asserts value is Record<string,any>{ensure(value&&typeof value==='object'&&!Array.isArray(value));ensure(Object.keys(value).sort().join('|')===[...keys].sort().join('|'));}
/** Validate an explicitly deferred contract without guessing its future semantics.
 * @param {unknown} value Serialized reserved field.
 */
function reserved(value:unknown):void{fields(value,['version','data']);ensure(value.version===0&&value.data===null,'pending-contract-version');}
/** Validate known stable item identities independently of quantities or recipes.
 * @param {unknown} item Candidate original ID.
 */
function item(item:unknown):void{ensure(typeof item==='string'&&KNOWN_ITEMS.has(item),'unknown-item');}
/** Validate safe integer coordinates without approving an authored build region.
 * @param {unknown} cell Persistent logical position.
 */
function cell(cell:unknown):void{ensure(Array.isArray(cell)&&cell.length===3&&cell.every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=32767));}
/** Validate a station identity, supported orientation and versioned workbench inputs.
 * @param {unknown} value Candidate station.
 */
function station(value:unknown,unlocked:string[]):void{fields(value,['id','kind','cell','facing','contents']);ensure(typeof value.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value.id));ensure(['crafting_table','furnace','blast_furnace','hopper'].includes(value.kind));ensure(['north','east','south','west',...(value.kind==='hopper'?['down']:[])].includes(value.facing));cell(value.cell);if(value.kind==='crafting_table'&&value.contents?.version===1){fields(value.contents,['version','data']);fields(value.contents.data,['grid']);ensure(Array.isArray(value.contents.data.grid)&&value.contents.data.grid.length===9);for(const s of value.contents.data.grid)validateStack(s,unlocked,nativeInventory);}else reserved(value.contents);}
/** Validate durable structure, bounded collections and completion consistency without filling deferred contracts.
 * @param {unknown} value Decoded state.
 */
export function validateState(value:unknown):asserts value is State{
  fields(value,['progress','settings']);const p=value.progress,s=value.settings;fields(p,['unlocked','scene','scenes','player','recipeBook','cakePlacement']);fields(s,['locale','volume','muted']);
  ensure(typeof s.locale==='string'&&/^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(s.locale));ensure(typeof s.volume==='number'&&Number.isFinite(s.volume)&&s.volume>=0&&s.volume<=1);ensure(typeof s.muted==='boolean');
  ensure(Array.isArray(p.unlocked)&&p.unlocked.length<=5000&&new Set(p.unlocked).size===p.unlocked.length);p.unlocked.forEach(item);ensure(SCENES.includes(p.scene));fields(p.scenes,SCENES);fields(p.player,['version','data']);ensure(p.player.version===1,'pending-contract-version');fields(p.player.data,['selected','hotbar','equipment','presets']);validateCarriers({...p.player.data,cursor:null} as InventoryState,p.unlocked,nativeInventory);reserved(p.recipeBook);
  const ids=new Set<string>();for(const id of SCENES){const scene=p.scenes[id];fields(scene,['layoutVersion','stations','crops']);ensure(scene.layoutVersion===1&&Array.isArray(scene.stations)&&scene.stations.length<=512&&Array.isArray(scene.crops)&&scene.crops.length<=512);const occupied=new Set<string>();for(const v of scene.stations){station(v,p.unlocked);ensure(!ids.has(v.id)&&!occupied.has(v.cell.join(',')));ids.add(v.id);occupied.add(v.cell.join(','));}for(const c of scene.crops){fields(c,['id','item','cell','growth']);ensure(typeof c.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(c.id)&&!ids.has(c.id));ids.add(c.id);item(c.item);cell(c.cell);reserved(c.growth);ensure(!occupied.has(c.cell.join(',')));occupied.add(c.cell.join(','));}}
  if(p.cakePlacement!==null){fields(p.cakePlacement,['scene','table']);ensure(p.cakePlacement.scene==='home'&&p.cakePlacement.table==='birthday-table'&&p.unlocked.includes('minecraft:cake'));}
}
/** Apply a semantic command atomically; returned events describe only newly acquired facts.
 * @param {State} state Valid immutable snapshot.
 * @param {Command} command Requested operation.
 * @param {PlacementPolicy} policy Authored region policy, required before station changes can be admitted.
 * @param {Rules} rules Verified crafting rules, required only for result acquisition.
 * @return {{state:State,events:DomainEvent[],inventory?:InventoryState,receipt?:CraftReceipt}} Valid new snapshot, transient events and optional transaction-local carriers.
 */
export function transition(state:State,command:Command,policy?:PlacementPolicy,rules?:Rules): {state:State;events:DomainEvent[];inventory?:InventoryState;receipt?:CraftReceipt}{
  validateState(state);const next=structuredClone(state),p=next.progress,events:DomainEvent[]=[];let inventory:InventoryState|undefined,receipt:CraftReceipt|undefined;
  switch(command.type){
    case 'inventory':case 'craft-take':{ensure(identity(command.expected)===identity(p.player.data),'inventory-conflict');const device=command.workbench?currentWorkbench(next,command.workbench):null;const carriers:InventoryState={...p.player.data,cursor:command.cursor,...(command.crafting?{crafting:command.crafting}:{}),...(device?{workbench:structuredClone(device.contents.version===1?device.contents.data.grid:Array(9).fill(null))}:{})};if(command.type==='craft-take'){ensure(rules,'native-rules-unavailable');receipt=takeCraft(carriers,command.take,p.unlocked,rules);inventory=receipt.inventory;for(const id of receipt.acquired){item(id);if(!p.unlocked.includes(id)){p.unlocked.push(id);events.push({type:'item-unlocked',item:id});}}}else inventory=reduceInventory(carriers,command.intent,p.unlocked,nativeInventory);p.player={version:1,data:layout(inventory)};if(device)device.contents={version:1,data:{grid:structuredClone(inventory.workbench!)}};break;}
    case 'unlock':item(command.item);if(!p.unlocked.includes(command.item)){p.unlocked.push(command.item);events.push({type:'item-unlocked',item:command.item});}break;
    case 'select-scene':ensure(SCENES.includes(command.scene));p.scene=command.scene;break;
    case 'put-station':ensure(SCENES.includes(command.scene));station(command.station,p.unlocked);ensure(policy?.allows(command.scene,command.station),'placement-policy-pending');ensure(p.unlocked.includes('minecraft:'+command.station.kind),'locked-item');{const list=p.scenes[command.scene].stations,index=list.findIndex(s=>s.id===command.station.id);if(index<0)list.push(structuredClone(command.station));else{ensure(list[index].kind===command.station.kind&&identity(list[index].contents)===identity(command.station.contents),'station-content-conflict');list[index]=structuredClone(command.station);}}break;
    case 'remove-station':ensure(SCENES.includes(command.scene));p.scenes[command.scene].stations=p.scenes[command.scene].stations.filter(s=>s.id!==command.id);break;
    case 'settings':ensure(Object.keys(command.patch).every(k=>['locale','volume','muted'].includes(k)));next.settings={...next.settings,...command.patch};break;
    case 'record-cake-placement':ensure(command.scene==='home'&&command.table==='birthday-table'&&p.scene==='home'&&p.unlocked.includes('minecraft:cake'),'invalid-cake-placement');if(!p.cakePlacement){p.cakePlacement={scene:'home',table:'birthday-table'};events.push({type:'cake-placed'});}break;
    default:throw new Error('unknown-command');
  }
  validateState(next);return {state:freeze(next),events,inventory,receipt};
}
/** Reset only progress, retaining the user's language, volume and mute choice.
 * @param {Settings} settings Previously validated preferences.
 * @return {State} Fresh progress with retained settings.
 */
export function resetState(settings:Settings):State{const value={progress:initialProgress(),settings:structuredClone(settings)};validateState(value);return freeze(value);}
/** Project fixed mainline cells and stable first-acquired side items without changing permanent facts.
 * @param {State} state Current snapshot.
 * @return {{item:string,unlocked:boolean}[]} Read-only display ordering.
 */
export function catalogue(state:State):{item:string;unlocked:boolean}[]{return [...MAINLINE,...state.progress.unlocked.filter(id=>!MAINLINE.includes(id))].map(item=>({item,unlocked:state.progress.unlocked.includes(item)}));}
/** Project the sole persistent completion fact for either page.
 * @param {State} state Current snapshot.
 * @return {boolean} Whether the table should display a cake.
 */
export function hasCake(state:State):boolean{return state.progress.cakePlacement!==null;}

/** Resolve a live same-scene workbench and compare its complete content before a container transaction.
 * @param {State} state Latest locked state.
 * @param {WorkbenchContext} context Observed instance and versioned content.
 * @return {Station} Valid workbench owned by the current scene.
 */
export function currentWorkbench(state:State,context:WorkbenchContext):Station{ensure(context.scene===state.progress.scene,'station-scene-changed');const value=state.progress.scenes[context.scene].stations.find(s=>s.id===context.id);ensure(value&&value.kind==='crafting_table','station-unavailable');ensure(identity(value.contents)===identity(context.expected),'station-content-conflict');return value;}
