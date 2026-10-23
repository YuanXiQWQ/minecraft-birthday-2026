/** Explicit capacity and birthday smoke setup; only imported by the isolated verification observer. */
import {initialState,transition} from '../web/src/domain/state.ts';import {initialBook} from '../web/src/domain/recipe-book.ts';import {seal} from '../web/src/persistence/codec.ts';import {SAVE_KEY,SaveSession,LOCK_NAME} from '../web/src/persistence/session.ts';import {WORLD_SCENES} from '../web/src/domain/world-config.ts';import {loadRules} from '../web/src/rules/load.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
/** Build a clearly labelled fixture, then use the unchanged ordinary player entry.
 * @param {'full'|'partial'|'cake'} kind Explicit test initial conditions.
 * @return {Promise<void>} Prepared isolated-origin state and normal game navigation.
 */
async function prepare(kind:'full'|'partial'|'cake'):Promise<void>{
 let state=initialState();for(const id of ['oak_log','wheat_seeds',...(kind==='cake'?['crafting_table','milk_bucket','sugar','egg','wheat']:[])])state=transition(state,{type:'unlock',item:'minecraft:'+id}).state;
 state=structuredClone(state);state.progress.scene=kind==='cake'?'plains':'farm';
 if(kind==='cake')state.progress.scenes.plains.stations=[{id:'capacity-table',kind:'crafting_table',cell:[-1,0,2],facing:'south',contents:{version:1,data:{grid:['milk_bucket','milk_bucket','milk_bucket','sugar','egg','sugar','wheat','wheat','wheat'].map(id=>({id:'minecraft:'+id,count:1}))}}}];
 else {state.progress.player.data.backpack=Array.from({length:27},()=>({id:'minecraft:oak_log',count:64}));state.progress.player.data.hotbar=Array.from({length:9},()=>({id:'minecraft:oak_log',count:64}));}
 if(kind==='partial'){state.progress.player.data.backpack[0]={id:'minecraft:wheat_seeds',count:63};state.progress.scenes.farm.crops=[{id:'capacity-wheat',item:'minecraft:wheat_seeds',cell:WORLD_SCENES.farm.plots[1],growth:{version:1,data:{ticks:240}}}];}
 state.progress.recipeBook=initialBook(state.progress.unlocked);
 const envelope=await seal(state,'capacity-'+kind+'-'+crypto.randomUUID(),0);await navigator.locks.request(LOCK_NAME,()=>localStorage.setItem(SAVE_KEY,JSON.stringify(envelope)));location.assign(import.meta.env.BASE_URL+'game/?capture-native&settings-audit');
}

/** Explicit fixture actions remain outside ordinary builds and saves. */
const controls=document.createElement('aside');controls.id='capacity-fixtures';controls.style.cssText='position:fixed;bottom:6px;left:6px;z-index:100;background:#fff;color:#000';
for(const kind of ['full','partial','cake'] as const){const b=document.createElement('button');b.textContent='TEST ONLY: prepare '+kind;b.onclick=()=>{void prepare(kind);};controls.append(b);}
/** Synthetic input regression is separate from trustworthy browser player operations. */
const dom=document.createElement('button');dom.textContent='TEST ONLY: mounted settings draft';controls.append(dom);
/** Exercise production mount listeners and SettingsEdits using explicitly synthetic input, not a claimed physical drag. */
dom.onclick=async()=>{const volume=document.getElementById('volume') as HTMLInputElement,feedback=document.createElement('output');feedback.id='mounted-settings-test';feedback.hidden=true;controls.append(feedback);const raw=localStorage.getItem(SAVE_KEY),rules=await loadRules(),session=new SaveSession(localStorage,{exclusive:work=>navigator.locks.request(LOCK_NAME,work)});session.rules=rules;await session.refresh();volume.value='.8';volume.dispatchEvent(new Event('input',{bubbles:true}));await session.dispatch({type:'processing-tick',ticks:5});await session.dispatch({type:'settings',patch:{volume:.35}});window.dispatchEvent(new StorageEvent('storage',{key:SAVE_KEY,newValue:localStorage.getItem(SAVE_KEY),oldValue:raw,storageArea:localStorage}));await new Promise(r=>setTimeout(r,50));const draft={value:volume.value,label:document.querySelector('.volume-label')?.textContent};volume.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,200));feedback.textContent=JSON.stringify({actualMountedPage:document.getElementById('app')?.className,syntheticDOMInputs:true,draft,settledValue:volume.value,save:localStorage.getItem(SAVE_KEY)});};
document.body.append(controls);
/** Mount the synthetic regression trigger inside the actual modal so it obeys browser focus ownership. */
function attachSettingsTest():void{document.getElementById('settings')?.append(dom,fault);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachSettingsTest,{once:true});else queueMicrotask(attachSettingsTest);

/** Storage fault trigger is scoped to the isolated page and restores its browser API. */
const fault=document.createElement('button');fault.textContent='TEST ONLY: mounted settings write failure';
/** Fail only the isolated page's save write and restore the real browser API before reporting. */
fault.onclick=async()=>{const before=localStorage.getItem(SAVE_KEY),volume=document.getElementById('volume') as HTMLInputElement,original=Storage.prototype.setItem;try{Storage.prototype.setItem=function(key:string,value:string):void{if(key===SAVE_KEY)throw Error('test-write-denied');original.call(this,key,value);};volume.value='.9';volume.dispatchEvent(new Event('input',{bubbles:true}));volume.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,200));}finally{Storage.prototype.setItem=original;}const out=document.createElement('output');out.id='mounted-settings-failure';out.hidden=true;out.textContent=JSON.stringify({testOnlyFailure:true,syntheticDOMInputs:true,unchanged:localStorage.getItem(SAVE_KEY)===before,volume:volume.value,disabled:volume.disabled,feedback:document.getElementById('preference-feedback')?.textContent});document.getElementById('settings')!.append(out);};
