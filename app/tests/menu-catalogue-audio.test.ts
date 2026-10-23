/** Production regressions cover explicit pause rows, empty catalogue cells, button sound and background music. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {emptyInventory} from '../web/src/domain/inventory.ts';
import {PersonalCursor} from '../web/src/domain/personal-menu.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {NativeButtonSounds} from '../web/src/ui/native-button-sounds.ts';
import {WorldAudio} from '../web/src/render/world-audio.ts';
import {GameMusic} from '../web/src/render/game-music.ts';
import {NativeSky} from '../web/src/render/native-sky.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {emptyEnvironment} from '../web/src/domain/environment.ts';
import {PerspectiveCamera,Vector3} from 'three';

/** Bind the real inventory command queue to actual persistence without simulating browser proof.
 * @return {Promise<object>} Production UI/session and storage failure switch.
 */
async function inventory(){
 let raw:string|null=null,deny=false;const s=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{if(deny)throw Error('write-failed');raw=v;}},{exclusive:async work=>work()},{allows:()=>true});s.rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8'));await s.refresh();await s.dispatch({type:'unlock',item:'minecraft:oak_log'});
 const u=Object.assign(Object.create(GameInventory.prototype),{permanent:s.view.envelope!.state,value:{...emptyInventory(),crafting:Array(4).fill(null)},rules:s.rules,writable:true,generation:s.view.envelope!.generation,queueEpoch:0,pending:0,queue:Promise.resolve(),personal:new PersonalCursor(),disposed:false,station:null,acquisition:null,closing:null,search:{value:''},tab:'catalogue',sideOffset:0,slots:[],modal:{open:true,dataset:{}},tooltip:{hidden:true},input:{cancel(){}},draw(){},reportFailure(){}}) as GameInventory;
 u.commit=async(...args)=>{const result=await s.editInventory(...args);u.permanent=s.view.envelope!.state;return result;};
 return{u,s,deny:()=>deny=true};
}

test('formal catalogue creates all 45 cells on the baked texture grid, including empty hit targets',async()=>{
 const h=await inventory();try{h.u.menuSlots({} as any);const sources=h.u.slots.filter(s=>s.kind==='source');assert.equal(sources.length,45);assert.ok(sources.some(s=>!s.item));for(let i=0;i<45;i++){assert.equal(sources[i].index,i);assert.equal(sources[i].x,8+i%9*18);assert.equal(sources[i].y,17+Math.floor(i/9)*18);if(!sources[i].item)assert.equal(h.u.slotStack(sources[i]),null);}assert.deepEqual(h.u.slots.filter(s=>s.kind==='hotbar').map(s=>[s.x,s.y]),Array.from({length:9},(_,i)=>[8+i*18,111]));h.u.search.value='no-such-original-item';h.u.slots=[];h.u.menuSlots({} as any);assert.equal(h.u.slots.filter(s=>s.kind==='source'&&!s.item).length,45);}finally{h.s.dispose();}
});
for(const button of [0,2] as const)test('actual GameInventory and SaveSession cancel cursor at empty catalogue cell, button '+button,async()=>{
 const h=await inventory();try{h.u.copySource({kind:'source',item:'minecraft:oak_log',x:8,y:17},'clone');await h.u.queue;assert.equal(h.u.value.cursor?.count,64);const before=structuredClone(h.s.view.envelope!.state.progress);h.u.activate({kind:'source',index:44,x:152,y:89},button);await h.u.queue;assert.equal(h.u.value.cursor,null);assert.deepEqual(h.s.view.envelope!.state.progress,before);for(const mode of ['clone','number','offhand','shift'] as const)h.u.copySource({kind:'source',index:44,x:152,y:89},mode,0);await h.u.queue;assert.equal(h.u.value.cursor,null);assert.ok(h.u.value.hotbar.every(s=>!s));}finally{h.s.dispose();}
});
test('empty-cell cancellation retains receipt gate; finite slot write failure still preserves the cursor',async()=>{
 const h=await inventory();try{h.u.copySource({kind:'source',item:'minecraft:oak_log',x:8,y:17},'clone');await h.u.queue;const empty={kind:'source' as const,index:44,x:152,y:89};h.u.acquisition={};h.u.activate(empty,0);assert.equal(h.u.value.cursor?.count,64);h.u.acquisition=null;h.deny();h.u.command({type:'slot',index:0,button:0});await h.u.queue;assert.equal(h.u.value.cursor?.count,64);assert.deepEqual(h.s.view.envelope!.state.progress.unlocked,['minecraft:oak_log']);}finally{h.s.dispose();}
});

test('native delegated button click plays quarter-volume UI event once and excludes synthetic/disabled/slot targets',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Element');class FakeElement{disabled=false;match=true;closest(){return this.match?this:null;}hasAttribute(){return this.disabled;}getAttribute(){return null;}}Object.defineProperty(globalThis,'Element',{configurable:true,value:FakeElement});
 const root=Object.assign(new EventTarget(),{contains:()=>true}),calls:any[]=[],audio={epoch:0,activate(){},context:{resume:async()=>{}},play:async(...args:any[])=>calls.push(args)},owner=new NativeButtonSounds(root as any,audio as any),target=new FakeElement();
 try{await owner.click({isTrusted:true,target} as any);assert.deepEqual(calls,[['ui.button.click',{volume:.25,pitch:1}]]);await owner.click({isTrusted:false,target} as any);target.disabled=true;await owner.click({isTrusted:true,target} as any);target.disabled=false;target.match=false;await owner.click({isTrusted:true,target} as any);assert.equal(calls.length,1);owner.dispose();target.match=true;await owner.click({isTrusted:true,target} as any);assert.equal(calls.length,1);}finally{owner.dispose();if(previous)Object.defineProperty(globalThis,'Element',previous);else Reflect.deleteProperty(globalThis,'Element');}
});

test('background music update preserves the current media, track and epoch while Off and disposal still stop it',()=>{
 const doc=Object.assign(new EventTarget(),{hidden:false});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});const settings={volume:.2,muted:false,musicVolume:1} as any,audio=new WorldAudio(new Map(),()=>settings);audio.context={state:'running'} as any;const music=new GameMusic(audio,1);let paused=0;music.media={paused:false,currentTime:12,pause(){paused++;},removeAttribute(){},load(){}} as any;music.track='music/game/shores';music.delay=0;const epoch=music.epoch;
 try{music.update(1000);doc.hidden=true;music.update(6000);assert.equal(music.media?.currentTime,12);assert.equal(music.track,'music/game/shores');assert.equal(music.epoch,epoch);assert.equal(paused,0);settings.musicVolume=0;music.sync();assert.equal(paused,1);assert.equal(music.media,null);assert.ok(music.epoch>epoch);}finally{music.dispose();}
});

test('sprint weather calls share one decode and cannot replay a burst of voices after that decode',async()=>{
 const doc=Object.assign(new EventTarget(),{hidden:false});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});const originalFetch=globalThis.fetch,perf=Object.getOwnPropertyDescriptor(globalThis,'performance');let now=0,fetches=0,decodes=0,started=0,resolve!:(v:any)=>void;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});const bytes=new Uint8Array([1,2,3]),path='assets/minecraft/sounds/rain.ogg';
 const audio=new WorldAudio(new Map([['assets/minecraft/ambience-sounds.json',{'weather.rain':{sounds:['rain']}}],['$native-entries',[{entry:path,size:3,sha256:createHash('sha256').update(bytes).digest('hex')}]]]),()=>({volume:.2,muted:false}) as any);
 globalThis.fetch=async()=>{fetches++;return new Response(bytes);};const gain={gain:{value:0},connect(){return this;},disconnect(){}},context={state:'running',currentTime:0,decodeAudioData:()=>{decodes++;return new Promise(r=>resolve=r);},createBufferSource:()=>({playbackRate:{value:1},connect(){return gain;},start(){started++;},stop(){},disconnect(){}}),createGain:()=>gain,destination:{}};audio.context=context as any;
 try{const work:Promise<string>[]=[];for(let i=0;i<100;i++){now=i*50;work.push(audio.play('weather.rain'));}while(!resolve)await new Promise(r=>setTimeout(r,0));assert.equal(fetches,1);assert.equal(decodes,1);resolve({duration:2});const results=await Promise.all(work);assert.equal(results.filter(s=>s==='scheduled').length,1);assert.equal(started,1);assert.equal(audio.loading.size,0);now+=50;assert.equal(await audio.play('weather.rain'),'scheduled');assert.equal(started,2);assert.equal(fetches,1);while(audio.voices.size<256)audio.voices.set({stop(){}} as any,{} as any);now+=50;assert.equal(await audio.play('weather.rain'),'channel-full');assert.equal(started,2);audio.voices.clear();now+=50;assert.equal(await audio.play('weather.rain'),'scheduled');assert.equal(started,3);}finally{audio.cancel();globalThis.fetch=originalFetch;if(perf)Object.defineProperty(globalThis,'performance',perf);}
});


test('production sky rises at world +X east while compass from Plains points toward the fixed spawn, not the sun',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 const image={width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([255,255,255,255]),width:1,height:1})})};
 const documents=new Map(['timeline/day','timeline/moon','dimension_type/overworld'].map(name=>['data/minecraft/'+name+'.json',JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/data/minecraft/'+name+'.json',import.meta.url),'utf8'))] as [string,any]));
 const sky=new NativeSky({documents,guiImages:{get:()=>image}} as any),state=emptyEnvironment(),camera=new PerspectiveCamera();state.dayTicks=0;state.control.advanceTime=false;
 try{sky.sync(state,{time:'game',weather:'game'},0);sky.render({render(){}} as any,camera,0);sky.scene.updateMatrixWorld(true);const sun=new Vector3().setFromMatrixPosition(sky.sun.matrixWorld);assert.ok(sun.x>90);assert.ok(Math.abs(sun.z)<.001);const view=Object.assign(Object.create(SceneView.prototype),{camera});camera.position.set(0,1.62,7);const compass=view.compassView('same-world');assert.deepEqual(compass.target,[0,0,0]);assert.ok(compass.target[2]+.5-compass.position[2]<0);assert.equal(compass.yaw,180);}finally{sky.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
