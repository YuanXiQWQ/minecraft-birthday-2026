/** Pickup audio follows committed finite delivery, not unlock eligibility, overflow or GUI acquisition. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pickupSoundOptions} from '../web/src/ui/pickup-feedback.ts';
import {initialState,transition} from '../web/src/domain/state.ts';
import {WORLD_REGION,WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {soundGain} from '../web/src/domain/audio-settings.ts';
import type {DomainEvent,SceneId} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Native locked recipes, interaction rules and finite loot used by actual domain transitions. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;

test('successful resource delivery emits exactly one native Players pickup voice per acquisition',()=>{
    const state=initialState(),node=WORLD_SCENES.plains.nodes.find(n=>n.block==='oak_log')!;
    const result=transition(state,{type:'harvest-node',scene:'plains',node:node.id,visit:0,expected:state.progress.player.data},WORLD_REGION,rules),events=result.events.filter(e=>pickupSoundOptions(e));
    assert.equal(events.length,1);assert.ok(events[0].deposited!.some(s=>s.id==='minecraft:oak_log'));assert.equal(events[0].pickup,true);
    const values=[.8,.2],voice=pickupSoundOptions(events[0],()=>values.shift()!)!;
    assert.equal(voice.volume,Math.fround(.2));assert.equal(voice.pitch,2);assert.equal(voice.category,'playersVolume');
    const lower=[0,.9];assert.ok(pickupSoundOptions(events[0],()=>lower.shift()!)!.pitch!<1);
    const settings={...result.state.settings,volume:1,muted:false,blocksVolume:0,playersVolume:.7};
    assert.equal(soundGain(settings,'entity.item.pickup',voice.category),.7);
});

test('a full inventory can unlock a resource without falsely playing a successful pickup',()=>{
    const state=initialState();state.progress.unlocked=['minecraft:cobblestone'];
    state.progress.player.data.hotbar=Array.from({length:9},()=>({id:'minecraft:cobblestone',count:64}));
    state.progress.player.data.backpack=Array.from({length:27},()=>({id:'minecraft:cobblestone',count:64}));
    const node=WORLD_SCENES.plains.nodes.find(n=>n.block==='oak_log')!,result=transition(state,{type:'harvest-node',scene:'plains',node:node.id,visit:0,expected:state.progress.player.data},WORLD_REGION,rules);
    const event=result.events.find(e=>e.type==='items-acquired')!;assert.equal(event.deposited!.length,0);assert.ok(event.overflow!.length);assert.equal(pickupSoundOptions(event),null);
});

test('bucket filling preserves its own native milk sound instead of adding an item-entity pickup',()=>{
    const state=initialState(),scene=Object.entries(WORLD_SCENES).find(([,world])=>world.nodes.some(n=>n.id==='cow:0'))![0] as SceneId;
    state.progress.scene=scene;state.progress.unlocked=['minecraft:bucket'];state.progress.player.data.hotbar[0]={id:'minecraft:bucket',count:1};
    const result=transition(state,{type:'harvest-node',scene,node:'cow:0',visit:0,expected:state.progress.player.data},WORLD_REGION,rules),event=result.events.find(e=>e.type==='items-acquired')!;
    assert.equal(event.pickup,false);assert.equal(pickupSoundOptions(event),null);assert.equal(result.state.progress.player.data.hotbar[0]?.id,'minecraft:milk_bucket');
});

test('unlock notifications and empty deliveries do not advance cosmetic pickup randomness',()=>{
    for(const event of [{type:'item-unlocked',item:'minecraft:oak_log'},{type:'items-acquired',deposited:[]}] as DomainEvent[])assert.equal(pickupSoundOptions(event,()=>assert.fail('unexpected random pickup')),null);
});
