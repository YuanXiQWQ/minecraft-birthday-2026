/** Native mining material definitions and production decode lifecycle regressions; no human listening is inferred. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {blockSounds} from '../web/src/domain/block-sounds.ts';
import {WorldAudio} from '../web/src/render/world-audio.ts';
import {resources} from '../tools/resources.ts';
import {fetchAsset, fetchManifest, RESOURCE_BASE} from '../web/src/render/resource-fetch.ts';

test('every authored mining material uses the native Blocks/SoundType family and pitch',()=>{
 for(const block of ['oak_log','crafting_table'])assert.deepEqual(blockSounds(block),{hit:'block.wood.hit',break:'block.wood.break',volume:1,pitch:1});
 for(const block of ['stone','coal_ore','iron_ore','furnace','blast_furnace'])assert.deepEqual(blockSounds(block),{hit:'block.stone.hit',break:'block.stone.break',volume:1,pitch:1});
 assert.deepEqual(blockSounds('hopper'),{hit:'block.metal.hit',break:'block.metal.break',volume:1,pitch:1.5});
 assert.equal(blockSounds('wheat').hit,'block.grass.hit');assert.equal(blockSounds('wheat').break,'block.crop.break');assert.throws(()=>blockSounds('cow'));
});

test('native hit events retain all six original weighted choices and every verified audio byte enters the normal build',()=>{
 const files=resources(),events=JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/world-sounds.json')));
 for(const [family,sample] of [['wood','wood'],['stone','stone'],['metal','stone'],['grass','grass']]){
 assert.deepEqual(events['block.'+family+'.hit'].sounds,Array.from({length:6},(_,i)=>'step/'+sample+(i+1)));
 for(const sound of events['block.'+family+'.hit'].sounds)assert.ok(files.get('assets/minecraft/sounds/'+sound+'.ogg')!.length>7000);
 }
 assert.deepEqual(events['block.metal.break'].sounds,events['block.stone.break'].sounds);
});

test('an old cached world sound document is revalidated with the current manifest before native hit playback',async()=>{
 const original=globalThis.fetch,old=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/world-manifest.json',import.meta.url),'utf8'));
 const previous={...old,entries:old.entries.filter((e:any)=>!e.entry.includes('/sounds/step/'))};let policy:RequestCache|undefined;
 globalThis.fetch=async(input,init)=>{policy=init?.cache;return new Response(JSON.stringify(String(input)===RESOURCE_BASE+'world-manifest.json'?previous:old));};
 try{const current=await(await fetchManifest('world-manifest.json')).json();assert.equal(policy,'no-cache');assert.ok(current.entries.some((e:any)=>e.entry==='assets/minecraft/sounds/step/wood1.ogg'));assert.ok(!previous.entries.some((e:any)=>e.entry==='assets/minecraft/sounds/step/wood1.ogg'));}finally{globalThis.fetch=original;}
});

test('production WorldAudio cancels a hit whose target becomes invalid while its verified decode is pending',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),originalFetch=globalThis.fetch;
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false})});
 let live=true,decoded!:(value:any)=>void,starts=0;
 const bytes=new Uint8Array([1,2,3]),path='assets/minecraft/sounds/step/wood1.ogg';
 const audio=new WorldAudio(new Map([['assets/minecraft/world-sounds.json',{'block.wood.hit':{sounds:['step/wood1']}}],['$native-entries',[{entry:path,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]]]),()=>({volume:.8,blocksVolume:.5,muted:false}) as any);
 globalThis.fetch=async()=>new Response(bytes);
 const gain={gain:{value:0},connect(){return this;},disconnect(){}},context={state:'running',currentTime:0,destination:{},decodeAudioData:()=>new Promise(r=>decoded=r),createGain:()=>gain,createBufferSource:()=>({playbackRate:{value:1},connect(){},start(){starts++;},stop(){},disconnect(){}}),close:async()=>{}};
 audio.context=context as any;
 try{
 const work=audio.play('block.wood.hit',{volume:.25,pitch:.5,valid:()=>live});while(!decoded)await new Promise(r=>setTimeout(r,0));live=false;decoded({duration:.4});assert.equal(await work,'cancelled');assert.equal(starts,0);
 live=true;assert.equal(await audio.play('block.wood.hit',{volume:.25,pitch:.5,valid:()=>live}),'scheduled');assert.equal(starts,1);assert.equal(gain.gain.value,.1);assert.equal((audio.records.at(-1) as any).pitch,.5);assert.equal((audio.records.at(-1) as any).category,'blocksVolume');
 live=false;assert.equal(await audio.play('block.wood.hit',{valid:()=>live}),'cancelled');assert.equal(starts,1);
 }finally{audio.dispose();globalThis.fetch=originalFetch;if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});

test('production payload loader revalidates old cached sound JSON without disabling immutable audio caching',async()=>{
 const original=globalThis.fetch,current=readFileSync(new URL('../../resources/minecraft/26.3/assets/minecraft/world-sounds.json',import.meta.url),'utf8'),calls:any[]=[];
 globalThis.fetch=async(input,init)=>{calls.push({path:String(input),cache:init?.cache});return new Response(init?.cache==='no-cache'?current:'{"block.wood.break":{}}');};
 try{const doc=await(await fetchAsset('assets/minecraft/world-sounds.json')).json();assert.ok(doc['block.wood.hit']);assert.equal(calls[0].cache,'no-cache');await fetchAsset('assets/minecraft/sounds/step/wood1.ogg');assert.equal(calls[1].cache,undefined);}finally{globalThis.fetch=original;}
});

test('local mining feedback connects directly to client output regardless of listener distance while environmental audio remains positional',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false})});
 const audio=new WorldAudio(new Map([['assets/minecraft/world-sounds.json',{'block.wood.hit':{sounds:['step/wood1']},'block.wood.break':{sounds:['dig/wood1']},'weather.rain':{sounds:['rain']}}]]),()=>({volume:.8,blocksVolume:.5,weatherVolume:.5,muted:false}) as any);
 let panners=0;const outputs:unknown[]=[],destination={},gain={gain:{value:0},connect(target:unknown){outputs.push(target);return this;},disconnect(){}},panner={positionX:{value:0},positionY:{value:0},positionZ:{value:0},connect(){return this;},disconnect(){}};
 const listener=Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map(k=>[k,{value:0}]));
 audio.context={state:'running',currentTime:0,destination,listener,createGain:()=>gain,createPanner:()=>{panners++;return panner;},createBufferSource:()=>({playbackRate:{value:1},connect(){},start(){},stop(){},disconnect(){}}),close:async()=>{}} as any;
 for(const path of ['step/wood1','dig/wood1','rain'])audio.buffers.set('assets/minecraft/sounds/'+path+'.ogg',{duration:.4} as AudioBuffer);
 try{
 audio.listener([0,1.62,7]);await audio.play('block.wood.hit',{volume:.25,pitch:.5});const first=(audio.records.at(-1) as any).volume;
 audio.listener([10000,10000,10000]);await audio.play('block.wood.hit',{volume:.25,pitch:.5});assert.equal((audio.records.at(-1) as any).volume,first);assert.equal(first,.1);assert.equal((audio.records.at(-1) as any).spatial,false);
 await audio.play('block.wood.break');assert.equal((audio.records.at(-1) as any).spatial,false);assert.equal(panners,0);assert.deepEqual(outputs,[destination,destination,destination]);
 await audio.play('weather.rain',{position:[1,2,3]});assert.equal(panners,1);assert.equal((audio.records.at(-1) as any).spatial,true);assert.equal(audio.voices.size,4);
 }finally{audio.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
