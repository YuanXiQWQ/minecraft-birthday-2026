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
import {token} from '../web/src/persistence/codec.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Same-version item and mining predicates. */
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;

/** Connect the real WorldUse constructor and SceneView ray refresh to a real session with controlled ray geometry and lock latency.
 * @return {Promise<object>} Gesture owner, persisted observations and deterministic controls.
 */
async function mining() {
    const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
    const events=new EventTarget();
    Object.defineProperty(globalThis,'window',{value:Object.assign(events,{setInterval:()=>1}),configurable:true});
    Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});
    let raw:string|null=null, barrier:Promise<void>|null=null, reject=false;
    const s=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{if(reject)throw Error('write-failed');raw=v;}},{exclusive:async work=>{if(barrier)await barrier;return work();}},WORLD_REGION);s.rules=rules;await s.refresh();
    let id:string|null='node:oak_log:0';
    const scene=Object.create(SceneView.prototype) as SceneView;
    Object.assign(scene,{renderer:{domElement:{dataset:{},style:{},getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100,width:100,height:100}),hasPointerCapture:()=>false}},input:true,lost:false,disposed:false,pointer:7,pointerPosition:[50,50],mode:null,look:{active:null,cancel(){}},showPreview(){},showCrack(){},breakEffect(){},pick:()=>id?{id,point:[-5,.5,-2],normal:[0,0,1]}:null});
    const inventory={rules,value:{...structuredClone(s.view.envelope!.state.progress.player.data),cursor:null},modal:{open:false}};
    const messages:string[]=[],use=new WorldUse(scene,inventory as any,s,k=>messages.push(k),()=>{}),jobs:Promise<unknown>[]=[];
    const run=use.run.bind(use);use.run=(...args)=>{const job=run(...args);jobs.push(job);return job;};
    s.subscribe(v=>{if(v.envelope)inventory.value={...structuredClone(v.envelope.state.progress.player.data),cursor:null};});
    return {s,use,scene,inventory,messages,target:(next:string|null)=>{id=next;},block:(p:Promise<void>|null)=>{barrier=p;},deny:()=>{reject=true;},raw:()=>raw,settle:async()=>{await Promise.all(jobs);await new Promise(r=>setImmediate(r));},restore:()=>{use.dispose();if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete(globalThis as any).window;if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete(globalThis as any).document;}};
}

test('one held press settles two successive real nodes, waiting five ticks before the exposed target',async()=>{
 const h=await mining();try{h.use.beginMining(h.scene.refreshHover()!,0);h.use.advanceMining(3000);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['oak_log:0']);h.target('node:oak_log:1');h.use.advanceMining(3249);assert.equal(h.use.mining,null);h.use.advanceMining(3250);assert.equal((h.use.mining as WorldUse['mining'])?.id,'node:oak_log:1');h.use.advanceMining(6250);await h.settle();assert.deepEqual(h.s.view.envelope!.state.progress.world.visits.plains.removed,['oak_log:0','oak_log:1']);assert.equal(h.s.view.envelope!.state.progress.player.data.backpack[0]?.count,2);assert.equal(h.use.holding,true);}finally{h.restore();}
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
