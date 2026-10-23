/** Production held mining, real persistence and native slot presentation boundaries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WorldUse} from '../web/src/ui/world-use.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {systemFeedback, FAILURE_COLOR} from '../web/src/ui/system-feedback.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {token,seal} from '../web/src/persistence/codec.ts';
import {initialState} from '../web/src/domain/state.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import type {State} from '../web/src/domain/types.ts';
import type {SoundOptions} from '../web/src/render/world-audio.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Same-version item and mining predicates. */
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;

/** Connect the real WorldUse constructor and SceneView ray refresh to a real session with controlled ray geometry and lock latency.
 * @param {State} state Optional explicit valid saved-world fixture.
 * @return {Promise<object>} Gesture owner, persisted observations and deterministic controls.
 */
async function mining(state?:State) {
    const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
    const events=new EventTarget();
    Object.defineProperty(globalThis,'window',{value:Object.assign(events,{setInterval:()=>1}),configurable:true});
    Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});
    let raw:string|null=state?JSON.stringify(await seal(state,'mining-audio',0)):null, barrier:Promise<void>|null=null, reject=false;
    const s=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{if(reject)throw Error('write-failed');raw=v;}},{exclusive:async work=>{if(barrier)await barrier;return work();}},WORLD_REGION);s.rules=rules;await s.refresh();
    let id:string|null='node:oak_log:0';
    const scene=Object.create(SceneView.prototype) as SceneView;
    Object.assign(scene,{renderer:{domElement:{dataset:{},style:{},getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100,width:100,height:100}),hasPointerCapture:()=>false}},input:true,lost:false,disposed:false,pointer:7,pointerPosition:[50,50],mode:null,look:{active:null,cancel(){}},/** Relay production cancellation within the geometry fixture. */cancel:()=>scene.onMineCancel?.(),showPreview(){},showCrack(){},breakEffect(){},pick:()=>id?{id,point:[-5,.5,-2],normal:[0,0,1]}:null});
    const inventory={rules,value:{...structuredClone(s.view.envelope!.state.progress.player.data),cursor:null},modal:{open:false}};
    const messages:string[]=[],sounds:{id:string;options?:SoundOptions}[]=[],use=new WorldUse(scene,inventory as any,s,k=>messages.push(k),(id,options)=>sounds.push({id,options})),jobs:Promise<unknown>[]=[];
    const run=use.run.bind(use);use.run=(...args)=>{const job=run(...args);jobs.push(job);return job;};
    s.subscribe(v=>{if(v.envelope)inventory.value={...structuredClone(v.envelope.state.progress.player.data),cursor:null};});
    return {s,use,scene,inventory,messages,sounds,target:(next:string|null)=>{id=next;},block:(p:Promise<void>|null)=>{barrier=p;},deny:()=>{reject=true;},raw:()=>raw,settle:async()=>{await Promise.all(jobs);await new Promise(r=>setImmediate(r));},restore:()=>{use.dispose();s.dispose();if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete(globalThis as any).window;if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete(globalThis as any).document;}};
}

test('formal held mining plays the native initial hit and four-tick cadence before a separate committed break',async()=>{
 const h=await mining();try{
 h.use.beginMining(h.scene.refreshHover()!,0);assert.deepEqual(h.sounds.map(s=>s.id),['block.wood.hit']);
 const first=h.sounds[0].options!;assert.equal(first.volume,.25);assert.equal(first.pitch,.5);assert.equal(first.position,undefined);assert.equal(first.valid!(),true);
 for(const now of [25,50,100,199])h.use.advanceMining(now);assert.equal(h.sounds.length,1);
 h.use.advanceMining(200);h.use.advanceMining(225);h.use.advanceMining(399);assert.equal(h.sounds.length,2);
 h.use.advanceMining(400);assert.equal(h.sounds.length,3);assert.deepEqual(h.s.view.envelope!.state.progress.unlocked,[]);
 h.use.advanceMining(3000);await h.settle();assert.deepEqual(h.sounds.map(s=>s.id),['block.wood.hit','block.wood.hit','block.wood.hit','block.wood.break']);assert.equal(first.valid!(),false);
 }finally{h.restore();}
});

test('changing the real target starts its native material sound and invalidates pending audio from the previous target',async()=>{
 const h=await mining();try{
 h.use.beginMining(h.scene.refreshHover()!,0);const old=h.sounds[0].options!;h.target('node:oak_log:1');h.use.advanceMining(75);assert.equal(old.valid!(),false);assert.equal(h.sounds.length,2);assert.equal(h.sounds[1].options!.valid!(),true);h.use.advanceMining(274);assert.equal(h.sounds.length,2);h.use.advanceMining(275);assert.equal(h.sounds.length,3);
 h.use.cancelMining();await h.s.dispatch({type:'select-scene',scene:'cave'});h.target('node:stone:0');h.use.beginMining(h.scene.refreshHover()!,400);assert.equal(h.sounds.at(-1)!.id,'block.stone.hit');assert.equal(h.sounds.at(-1)!.options!.pitch,.5);
 }finally{h.restore();}
});

for(const boundary of ['release','gui','hidden','reset','scene','dispose'] as const)test('unfinished hit decode is no longer valid after '+boundary,async()=>{
 const h=await mining();try{h.use.beginMining(h.scene.refreshHover()!,0);const pending=h.sounds[0].options!;
 if(boundary==='release')h.use.cancelMining();
 if(boundary==='gui')h.inventory.modal.open=true;
 if(boundary==='hidden')(document as any).hidden=true;
 if(boundary==='reset')await h.s.reset(token(h.s.view.envelope!));
 if(boundary==='scene')await h.s.dispatch({type:'select-scene',scene:'cave'});
 if(boundary==='dispose')h.use.dispose();
 assert.equal(pending.valid!(),false);h.use.advanceMining(200);assert.equal(h.sounds.length,1);assert.deepEqual(h.s.view.envelope!.state.progress.unlocked,[]);
 }finally{h.restore();}
});

test('a stalled callback does not burst missed hit sounds and instant grass has no sustained mining sound',async()=>{
 const h=await mining();try{h.use.beginMining(h.scene.refreshHover()!,0);h.use.advanceMining(2050);assert.equal(h.sounds.length,2);h.use.advanceMining(2075);assert.equal(h.sounds.length,2);h.use.advanceMining(2200);assert.equal(h.sounds.length,3);h.use.cancelMining();h.sounds.length=0;h.target('node:short_grass:0');h.use.beginMining(h.scene.refreshHover()!,10000);await h.settle();assert.deepEqual(h.sounds.map(s=>s.id),['block.grass.break']);}finally{h.restore();}
});

for(const [kind,material,pitch] of [['crafting_table','wood',1],['furnace','stone',1],['blast_furnace','stone',1],['hopper','metal',1.5]] as const)test('real persisted '+kind+' plays its hit family and commits a separate break',async()=>{
 const state=initialState();state.progress.unlocked=['minecraft:'+kind];state.progress.scenes.plains.stations=[{id:'audio-device',kind,cell:[2,0,0],facing:'south',contents:kind==='crafting_table'?{version:1,data:{grid:Array(9).fill(null)}}:kind==='hopper'?emptyHopper():emptyFurnace()}];
 const h=await mining(state);try{h.target('audio-device');h.use.beginMining(h.scene.refreshHover()!,0);assert.equal(h.sounds[0].id,'block.'+material+'.hit');assert.equal(h.sounds[0].options!.pitch,pitch*.5);assert.equal(h.sounds[0].options!.position,undefined);h.use.advanceMining(200);assert.equal(h.sounds[1].id,h.sounds[0].id);h.use.advanceMining(50000);await h.settle();assert.equal(h.sounds.at(-1)!.id,'block.'+material+'.break');assert.equal(h.sounds.at(-1)!.options!.pitch,pitch);assert.equal(h.sounds.at(-1)!.options!.position,undefined);assert.deepEqual(h.s.view.envelope!.state.progress.scenes.plains.stations,[]);}finally{h.restore();}
});

test('one held press settles two successive real nodes, waiting five ticks before the exposed target',async t=>{
 // Share the explicit synthetic time origin with the asynchronous completion clock.
 t.mock.method(performance,'now',()=>0);
 const h=await mining();try{h.use.beginMining(h.scene.refreshHover()!,0);h.use.advanceMining(3000);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['oak_log:0']);h.target('node:oak_log:1');h.use.advanceMining(3249);assert.equal(h.use.mining,null);h.use.advanceMining(3250);assert.equal((h.use.mining as WorldUse['mining'])?.id,'node:oak_log:1');h.use.advanceMining(6250);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['oak_log:0','oak_log:1']);assert.equal(h.s.view.envelope!.state.progress.player.data.hotbar[0]?.count,2);assert.equal(h.use.holding,true);}finally{h.restore();}
});

test('held target change and empty ray reset only progress, never reuse progress against the new block',async()=>{
 const h=await mining();try{h.use.beginMining(h.scene.refreshHover()!,0);h.use.advanceMining(2500);h.target('node:oak_log:1');h.use.advanceMining(2600);assert.equal(h.use.mining?.start,2600);h.use.advanceMining(3000);assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,[]);h.target(null);h.use.advanceMining(4000);assert.equal(h.use.mining,null);assert.equal(h.use.holding,true);h.target('node:oak_log:2');h.use.advanceMining(4100);h.use.advanceMining(7100);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['oak_log:2']);}finally{h.restore();}
});

for(const boundary of ['release','gui','hidden','reset','dispose'] as const)test('late mining acknowledgement cannot restart after '+boundary,async()=>{
 const h=await mining();let release!:()=>void;try{h.use.beginMining(h.scene.refreshHover()!,0);h.block(new Promise<void>(r=>release=r));h.use.advanceMining(3000);h.target('node:oak_log:1');h.use.advanceMining(8000);assert.equal(h.use.mining,null);
 if(boundary==='release')h.scene.releasePointer({button:0,pointerId:7,clientX:50,clientY:50} as PointerEvent);
 if(boundary==='gui'){h.inventory.modal.open=true;h.scene.cancelInput();}
 if(boundary==='hidden'){(document as any).hidden=true;h.scene.cancelInput();}
 if(boundary==='dispose')h.use.dispose();
 release();h.block(null);await h.settle();if(boundary==='reset')await h.s.reset(token(h.s.view.envelope!));h.use.advanceMining(9000);assert.equal(h.use.holding,false);assert.equal(h.use.mining,null);assert.equal(h.s.view.envelope!.state.progress.world.visits.plains.removed.includes('oak_log:1'),false);
 }finally{release?.();h.restore();}
});

test('a failed mining write does not auto-retry the same resource or continue a held chain',async()=>{
 const h=await mining();try{h.use.beginMining(h.scene.refreshHover()!,0);h.deny();h.use.advanceMining(3000);await h.settle();assert.equal(h.use.holding,false);assert.deepEqual(h.messages,['game.actionFailed']);h.use.advanceMining(9000);assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,[]);assert.deepEqual(h.messages,['game.actionFailed']);}finally{h.restore();}
});

test('empty/no-match result hover has no tooltip; ghost result keeps only the native item tooltip',()=>{
 const u=Object.create(GameInventory.prototype) as GameInventory;let hidden=0,lines:string[]=[];
 Object.assign(u,{hover:{kind:'preview'},value:{cursor:null},book:null,slotStack:()=>null,hideTooltip:()=>hidden++,showTooltipText:(v:string[])=>lines=v,text:(k:string)=>k});
 u.showTooltip(1,1);assert.equal(hidden,1);assert.deepEqual(lines,[]);u.book={ghost:{result:{id:'minecraft:stone_shovel',count:1}}} as any;u.showTooltip(1,1);assert.equal(lines.length,1);assert.equal(lines.some(s=>/recipe|NBT|minecraft:|component/i.test(s)),false);
});

test('operation failures route to red system chat without changing native Toast and tooltip classifications',()=>{
 const u=Object.create(GameInventory.prototype) as GameInventory,keys:string[]=[];Object.assign(u,{disposed:false,text:(k:string)=>k,feedback:(k:string)=>keys.push(k)});u.reportFailure('inventory.returnFull');assert.deepEqual(keys,['inventory.returnFull']);assert.equal(systemFeedback(keys[0]),'failure');assert.equal(FAILURE_COLOR,'#FF5555');for(const k of ['book.missing','book.conflict','inventory.previewEmpty','book.discovered','inventory.returned'])assert.equal(systemFeedback(k),'omit');u.disposed=true;u.reportFailure('inventory.returnFull');assert.equal(keys.length,1);
});


test('native instant resources continue on the next attack tick instead of the progressive block delay',async()=>{
 const h=await mining();try{h.target('node:short_grass:0');h.use.beginMining(h.scene.refreshHover()!,10000);await h.settle();h.target('node:short_grass:1');h.use.advanceMining(10049);assert.equal(h.use.mining,null);h.use.advanceMining(10050);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['short_grass:0','short_grass:1']);}finally{h.restore();}
});

test('game settings operation feedback follows chat policy without moving notifications or normal save acknowledgements to chat',()=>{
 for(const key of ['settings.saveFailed','settings.resetFailed','inventory.returnFull','book.failed'])assert.equal(systemFeedback(key),'failure');
 assert.equal(systemFeedback('settings.resetDone'),'information');
 for(const key of ['settings.saved','settings.saving','book.newTitle','book.newDescription','inventory.previewEmpty','book.missing'])assert.equal(systemFeedback(key),'omit');
});

test('a hold begun over empty space can acquire a later real target without another press',async()=>{
 const h=await mining();try{h.target(null);h.use.beginMining(null,0);h.use.advanceMining(100);assert.equal(h.use.holding,true);assert.equal(h.use.mining,null);h.target('node:oak_log:1');h.use.advanceMining(1000);h.use.advanceMining(4000);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['oak_log:1']);}finally{h.restore();}
});

test('formal SceneView does not request pointer capture in an actual or newly acquired browser pointer lock',()=>{
 const scene=Object.create(SceneView.prototype) as SceneView,captured:number[]=[],ownerDocument={pointerLockElement:null as object|null};Object.assign(scene,{mode:{actual:true},renderer:{domElement:{ownerDocument,setPointerCapture:(id:number)=>{if(ownerDocument.pointerLockElement)throw Error('InvalidStateError');captured.push(id);}}}});
 scene.capturePointer(7);assert.deepEqual(captured,[]);scene.mode!.actual=false;ownerDocument.pointerLockElement={};scene.capturePointer(7);assert.deepEqual(captured,[]);ownerDocument.pointerLockElement=null;scene.capturePointer(7);assert.deepEqual(captured,[7]);
});
