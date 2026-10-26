/** Campfire sound scheduling, world lifetime and verified positional playback regression cases. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState} from '../web/src/domain/state.ts';
import {CampfireAudio} from '../web/src/render/campfire-audio.ts';
import {WorldAudio} from '../web/src/render/world-audio.ts';
import type {SoundOptions} from '../web/src/render/world-audio.ts';

test('lit nearby campfires emit native positional crackles independent of frame rate',()=>{
    const p=initialState().progress;
    p.scenes[p.scene].blocks=[{id:'fire',block:'campfire',cell:[0,0,0],state:{lit:'true'}}];
    const calls:{id:string;options:SoundOptions}[]=[],audio={play:async(id:string,options:SoundOptions)=>{calls.push({id,options});return 'scheduled';}} as WorldAudio;
    const sounds=new CampfireAudio(audio,()=>p,()=>0);
    sounds.update(0,[0,1,0]);sounds.update(25,[0,1,0]);assert.equal(calls.length,0);
    sounds.update(50,[0,1,0]);assert.equal(calls.length,1);
    assert.equal(calls[0].id,'block.campfire.crackle');assert.deepEqual(calls[0].options.position,[.5,.5,.5]);
    assert.equal(calls[0].options.volume,.5);assert.equal(calls[0].options.pitch,.6);assert.equal(calls[0].options.valid!(),true);
    sounds.update(150,[0,1,0]);assert.equal(calls.length,3);
    sounds.random=()=>.1;sounds.update(200,[0,1,0]);assert.equal(calls.length,3);
    sounds.random=()=>0;sounds.update(250,[25,1,0]);assert.equal(calls.length,3);
    p.scenes[p.scene].blocks![0].state.lit='false';sounds.update(300,[0,1,0]);assert.equal(calls.length,3);assert.equal(calls[0].options.valid!(),false);
    p.scenes[p.scene].blocks![0].state.lit='true';p.scenes[p.scene].blocks![0].state.waterlogged='true';sounds.update(350,[0,1,0]);assert.equal(calls.length,3);
});

test('pause, scene changes and removed fires invalidate pending crackles without a resume burst',()=>{
    const p=initialState().progress;
    p.scenes[p.scene].blocks=[{id:'fire',block:'campfire',cell:[0,0,0],state:{lit:'true'}}];
    let active=true;
    const calls:SoundOptions[]=[],audio={play:async(_id:string,options:SoundOptions)=>{calls.push(options);return 'scheduled';}} as WorldAudio;
    const sounds=new CampfireAudio(audio,()=>active?p:null,()=>0);
    sounds.update(0,[0,0,0]);sounds.update(50,[0,0,0]);active=false;
    assert.equal(calls[0].valid!(),false);sounds.update(5000,[0,0,0]);assert.equal(calls.length,1);
    active=true;sounds.update(10000,[0,0,0]);assert.equal(calls.length,1);sounds.update(10050,[0,0,0]);assert.equal(calls.length,2);
    p.scenes[p.scene].blocks=[];assert.equal(calls[1].valid!(),false);
    p.scene=p.scene==='plains'?'home':'plains';assert.equal(calls[0].valid!(),false);sounds.update(10100,[0,0,0]);assert.equal(calls.length,2);
});

test('all six official crackles verify, decode and use spatial block-channel gain',async()=>{
    const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),originalFetch=globalThis.fetch;
    Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false})});
    const root=new URL('../../resources/minecraft/26.3/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('ambience-manifest.json',root),'utf8')),events=JSON.parse(readFileSync(new URL('assets/minecraft/ambience-sounds.json',root),'utf8'));
    const settings={volume:.8,blocksVolume:.5,muted:false},audio=new WorldAudio(new Map([['assets/minecraft/ambience-sounds.json',events],['$native-entries',manifest.entries]]),()=>settings as any);
    let starts=0;
    const panners:any[]=[],gains:any[]=[];
    audio.context={state:'running',currentTime:0,destination:{},decodeAudioData:async(bytes:ArrayBuffer)=>{assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'OggS');return{duration:2};},createGain:()=>{const gain={gain:{value:0},connect(){return this;},disconnect(){}};gains.push(gain);return gain;},createPanner:()=>{const panner={positionX:{value:0},positionY:{value:0},positionZ:{value:0},connect(){return this;},disconnect(){}};panners.push(panner);return panner;},createBufferSource:()=>({playbackRate:{value:1},connect(){},start(){starts++;},stop(){},disconnect(){}}),close:async()=>{}} as any;
    globalThis.fetch=async(input)=>new Response(readFileSync(new URL(String(input).split('/minecraft/26.3/')[1],root)));
    try{
        const samples=events['block.campfire.crackle'].sounds;assert.equal(samples.length,6);
        for(let i=0;i<samples.length;i++)assert.equal(await audio.play('block.campfire.crackle',{position:[.5,.5,.5],volume:.5,pitch:.6,variant:i/samples.length}),'scheduled');
        assert.equal(starts,6);assert.equal(audio.buffers.size,6);assert.equal(panners.length,6);
        assert.ok(gains.every(gain=>gain.gain.value===.2));assert.ok(audio.records.every((r:any)=>r.category==='blocksVolume'&&r.spatial&&r.pitch===.6));
        settings.blocksVolume=0;audio.sync();assert.ok(gains.every(gain=>gain.gain.value===0));
        assert.equal(await audio.play('block.campfire.crackle'),'suppressed');
    }finally{audio.dispose();globalThis.fetch=originalFetch;if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
