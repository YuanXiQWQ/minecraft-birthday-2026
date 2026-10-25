/** Native grass propagation, cover decay, light thresholds and durable soil compatibility. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState} from '../web/src/domain/state.ts';
import {agriculture,soilAt} from '../web/src/domain/soil-state.ts';
import {till} from '../web/src/domain/agriculture.ts';
import {blockAt} from '../web/src/domain/placed-blocks.ts';
import {randomTickGrass,tickGrass} from '../web/src/domain/grass.ts';
import {NativeRandom} from '../web/src/domain/environment.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import type {Cell} from '../web/src/domain/types.ts';

/** Select one valid offset in each of the native four spread attempts. */
class OffsetRandom extends NativeRandom {
    index=0;
    /** Retain a deterministic target. @param {Cell} offset Source-to-target offset. */
    constructor(public offset:Cell){super(1);}
    /** Sample each axis while checking native bounds. @param {number} min Lower bound. @param {number} max Upper bound. @return {number} Deterministic in-range offset. */
    integer(min:number,max:number):number{const value=this.offset[this.index++%3];assert.ok(value>=min&&value<=max);return value;}
}
/** Prepare trampled soil next to a natural grass source. @return {State} Mutable test snapshot. */
function fixture(){const s=initialState();s.progress.scene='farm';agriculture(s.progress).soils[0].moisture=null;return s;}
/** Source and destination straddle the edge of the original field. */
const SOURCE:Cell=[-5,-1,-1],TARGET:Cell=[-5,-1,-2];

test('grass spreads into trampled dirt, preserves inventory, survives reload, and can be tilled again',async()=>{
    const s=fixture(),p=s.progress,before=structuredClone(p.player);
    randomTickGrass(p,SOURCE,new OffsetRandom([0,0,-1]));
    assert.equal(blockAt(p,TARGET)?.block,'grass_block');assert.deepEqual(p.player,before);
    assert.equal(blockAt(p,[-4,-1,-2])?.block,'farmland');validateState(s);
    const restored=structuredClone((await decode(JSON.stringify(await seal(s,'grass-test',0)))).envelope.state);
    assert.equal(blockAt(restored.progress,TARGET)?.block,'grass_block');
    till(restored.progress,TARGET,[0,1,0],{id:'minecraft:wooden_hoe',count:1});
    assert.equal(soilAt(restored.progress,TARGET)?.grass,undefined);assert.equal(blockAt(restored.progress,TARGET)?.block,'farmland');
});

test('night stops unlit spread but nearby torch light enables it; a sealed opaque roof blocks daylight',()=>{
    const p=fixture().progress;p.environment!.dayTicks=18000;
    randomTickGrass(p,SOURCE,new OffsetRandom([0,0,-1]));assert.equal(blockAt(p,TARGET)?.block,'dirt');
    p.scenes.farm.blocks=[{id:'torch',block:'torch',cell:[-4,0,-1],state:{}}];
    randomTickGrass(p,SOURCE,new OffsetRandom([0,0,-1]));assert.equal(blockAt(p,TARGET)?.block,'grass_block');
    const glow=fixture().progress;glow.environment!.dayTicks=18000;glow.scenes.farm.blocks=[{id:'glow',block:'glowstone',cell:[-4,0,-1],state:{}}];
    randomTickGrass(glow,SOURCE,new OffsetRandom([0,0,-1]));assert.equal(blockAt(glow,TARGET)?.block,'grass_block');
    const dark=fixture().progress;dark.scenes.farm.blocks=[];
    for(let x=-12;x<=2;x++)for(let z=-8;z<=6;z++)dark.scenes.farm.blocks.push({id:'roof-'+x+'-'+z,block:'stone',cell:[x,1,z],state:{}});
    randomTickGrass(dark,SOURCE,new OffsetRandom([0,0,-1]));assert.equal(blockAt(dark,TARGET)?.block,'dirt');
});

test('opaque cover, bottom slabs and water reject propagation; glass and top slabs transmit the supporting face',()=>{
    for(const [block,state,expected] of [['stone',{},'dirt'],['water',{level:'0'},'dirt'],['oak_slab',{type:'bottom',waterlogged:'false'},'dirt'],['oak_slab',{type:'top',waterlogged:'false'},'grass_block'],['oak_slab',{type:'top',waterlogged:'true'},'dirt'],['glass',{},'grass_block']] as const){
        const p=fixture().progress;p.scenes.farm.blocks=[{id:'cover',block,cell:[-5,0,-2],state:{...state}}];
        randomTickGrass(p,SOURCE,new OffsetRandom([0,0,-1]));assert.equal(blockAt(p,TARGET)?.block,expected,block+JSON.stringify(state));
    }
});

test('covered native grass decays and placed dirt conversion retains the original removable lifetime',()=>{
    const p=fixture().progress;p.scenes.farm.blocks=[{id:'cover',block:'stone',cell:[-5,0,-1],state:{}}];
    randomTickGrass(p,SOURCE,new NativeRandom(4));assert.equal(blockAt(p,SOURCE)?.block,'dirt');
    p.scenes.farm.blocks=[{id:'placed-dirt',block:'dirt',cell:[-4,0,-1],state:{}}];
    randomTickGrass(p,[-3,-1,-1],new OffsetRandom([-1,1,0]));
    assert.equal(p.scenes.farm.blocks[0].id,'placed-dirt');assert.equal(p.scenes.farm.blocks[0].block,'grass_block');
    assert.equal(soilAt(p,[-4,0,-1]),undefined);
});

test('the active section clock eventually spreads without a forced source tick and persists its random stream',async()=>{
    const s=fixture(),p=s.progress;let ticks=0;
    while(blockAt(p,TARGET)?.block==='dirt'&&ticks++<12000)tickGrass(p);
    assert.equal(blockAt(p,TARGET)?.block,'grass_block');assert.ok(ticks>1);validateState(s);
    const restored=structuredClone((await decode(JSON.stringify(await seal(s,'grass-clock',0)))).envelope.state);
    tickGrass(p);tickGrass(restored.progress);assert.deepEqual(restored.progress.scenes.farm.agriculture,p.scenes.farm.agriculture);
    const legacy=fixture();assert.equal(legacy.progress.scenes.farm.agriculture!.grassRandom,undefined);validateState(legacy);
});
