/** Native animal walk interpolation and finite sugar-cane planting, growth and harvest. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnimalWalk} from '../web/src/domain/farm-life.ts';
import {caneBlocks,advanceCaneAge} from '../web/src/domain/sugar-cane.ts';
import {agriculture} from '../web/src/domain/soil-state.ts';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {blockAt,survives,placementBlocks,type PlacedBlock} from '../web/src/domain/placed-blocks.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import type {Cell,Command,State} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';
/** Original finite items and native loot rules. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Prepare an owned stalk at a real canal bank.
 * @return {State} Mutable initial snapshot.
 */
function fixture():State{const s=initialState();s.progress.scene='farm';s.progress.unlocked=['minecraft:sugar_cane'];s.progress.player.data.hotbar[0]={id:'minecraft:sugar_cane',count:4};return s;}
/** Apply a real transaction. @param {State} s Snapshot. @param {Command} c Intent. @return {State} Committed state. */
function apply(s:State,c:Command):State{return transition(s,c,WORLD_REGION,rules).state;}
test('adult walk state caps speed, smooths by .4 and retains native partial-tick phase when stopping',()=>{
    const w=new AnimalWalk();w.update(.2);assert.ok(Math.abs(w.speed-.32)<1e-12);assert.equal(w.leg(0,false),0);
    assert.ok(Math.abs(w.leg(1,false)-Math.cos(.32*.6662)*1.4*.32)<1e-12);
    w.update(.2);assert.ok(Math.abs(w.speed-.512)<1e-12);const previous=w.leg(1,false);w.update(0);assert.ok(Math.abs(w.leg(0,false)-previous)<1e-12);assert.ok(w.leg(1,false)!==0);
    assert.ok(Math.abs(w.leg(.5,false)+w.leg(.5,true))<1e-12);for(let i=0;i<40;i++)w.update(0);assert.ok(Math.abs(w.leg(1,false))<1e-8);
    w.update(10);assert.ok(w.speed<=1);
});

test('native planting consumes one stalk on a wet bank, rejects dry/diagonal water and farmland',async()=>{
    const s=fixture(),hit={cell:[7,-1,0] as Cell,normal:[0,1,0] as Cell,point:[7.5,0,.5] as Cell,eye:[7.5,1.62,2.5] as Cell,yaw:0};
    const next=apply(s,{type:'place-block',scene:'farm',item:'sugar_cane',hit,id:'planted-cane',expected:s.progress.player.data});assert.equal(next.progress.player.data.hotbar[0]!.count,3);
    assert.equal(blockAt(next.progress,[7,0,0])?.block,'sugar_cane');assert.deepEqual((await decode(JSON.stringify(await seal(next,'cane',0)))).envelope.state,next);
    assert.throws(()=>placementBlocks(s.progress,'sugar_cane',{...hit,cell:[14,-1,5],point:[14.5,0,5.5],eye:[14.5,1.62,7]},'dry'),/unsupported/);
    const p=fixture().progress,b:PlacedBlock={id:'test',block:'sugar_cane',cell:[14,0,5],state:{age:'0'}};
    p.scenes.farm.blocks=[{id:'water',block:'oak_slab',cell:[15,-1,6],state:{type:'bottom',waterlogged:'true'}}];assert.equal(survives(p,b),false);
    p.scenes.farm.blocks[0].cell=[15,-1,5];assert.equal(survives(p,b),true);agriculture(p).soils.push({cell:[14,-1,5],moisture:7});assert.equal(survives(p,b),false);
});

test('cane uses sixteen age steps per tier, stops at three and respects an occupied top',()=>{
    const p=fixture().progress,base=caneBlocks(p)[0];assert.equal(survives(p,base),true);
    for(let i=0;i<15;i++)advanceCaneAge(p,base);assert.equal(p.scenes.farm.blocks?.length??0,0);assert.equal(agriculture(p).caneAges![base.id.slice(5)],15);
    advanceCaneAge(p,base);let top=p.scenes.farm.blocks![0];assert.equal(top.cell[1],1);assert.equal(base.state.age,'0');
    for(let i=0;i<16;i++)advanceCaneAge(p,top);top=p.scenes.farm.blocks![1];assert.equal(top.cell[1],2);
    for(let i=0;i<50;i++)advanceCaneAge(p,top);assert.equal(p.scenes.farm.blocks!.length,2);assert.equal(top.state.age,'0');
    p.scenes.farm.blocks!.pop();p.scenes.farm.blocks!.push({id:'roof',block:'oak_planks',cell:[base.cell[0],2,base.cell[2]],state:{}});
    advanceCaneAge(p,p.scenes.farm.blocks![0]);assert.equal(p.scenes.farm.blocks![0].state.age,'0');validateState({progress:p,settings:initialState().settings});
});

test('shared active ticks persist cane ages and growth; upper harvest preserves root and root harvest clears the column',async()=>{
    let s=fixture();const base=caneBlocks(s.progress)[0],a=agriculture(s.progress);a.caneAges={[base.id.slice(5)]:15};
    s=apply(s,{type:'processing-tick',ticks:15});assert.equal(s.progress.scenes.farm.blocks?.length,1);validateState(s);
    s=(await decode(JSON.stringify(await seal(s,'cane-tick',1)))).envelope.state;
    const upper=s.progress.scenes.farm.blocks![0];s=apply(s,{type:'break-block',scene:'farm',id:upper.id,expected:s.progress.player.data});assert.equal(blockAt(s.progress,base.cell)?.block,'sugar_cane');assert.equal(s.progress.player.data.hotbar[0]!.count,5);
    s=structuredClone(s);const root=caneBlocks(s.progress).find(b=>b.id===base.id)!;root.state.age='15';advanceCaneAge(s.progress,root);s=apply(s,{type:'harvest-node',scene:'farm',node:base.id.slice(5),visit:0,expected:s.progress.player.data});
    assert.equal(blockAt(s.progress,base.cell),null);assert.equal(s.progress.scenes.farm.blocks!.length,0);assert.equal(s.progress.player.data.hotbar[0]!.count,7);assert.equal(s.progress.scenes.farm.agriculture!.caneAges?.[base.id.slice(5)],undefined);
});

test('cane grows one tier per 240 active ticks, preserves partial age through reload and pauses at the height cap',async()=>{
    let s=fixture();s.progress.scenes.farm.blocks=[{id:'fast-cane',block:'sugar_cane',cell:[7,0,0],state:{age:'0'}}];
    s=apply(s,{type:'processing-tick',ticks:239});assert.equal(blockAt(s.progress,[7,1,0]),null);
    s=(await decode(JSON.stringify(await seal(s,'fast-cane',0)))).envelope.state;
    s=structuredClone(s);s.progress.environment!.control.frozen=true;s=apply(s,{type:'processing-tick',ticks:600});assert.equal(s.progress.world.tick,239);assert.equal(blockAt(s.progress,[7,1,0]),null);
    s=structuredClone(s);s.progress.environment!.control.frozen=false;s=apply(s,{type:'processing-tick',ticks:1});assert.equal(blockAt(s.progress,[7,1,0])?.block,'sugar_cane');
    s=apply(s,{type:'processing-tick',ticks:239});assert.equal(blockAt(s.progress,[7,2,0]),null);
    s=apply(s,{type:'processing-tick',ticks:1});assert.equal(blockAt(s.progress,[7,2,0])?.block,'sugar_cane');
    s=apply(s,{type:'processing-tick',ticks:480});assert.equal(blockAt(s.progress,[7,3,0]),null);assert.equal(s.progress.player.data.hotbar[0]!.count,4);
});
