/** Native plate contacts, door power edges, campfire geometry/particles and action-bar regression cases. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition} from '../web/src/domain/state.ts';
import {plateContacts,plateStrength} from '../web/src/domain/pressure-plates.ts';
import {nativeShapes} from '../web/src/domain/block-shapes.ts';
import {connectBlocks} from '../web/src/domain/placed-blocks.ts';
import {playerBounds} from '../web/src/domain/player-motion.ts';
import {poweredCells} from '../web/src/domain/redstone.ts';
import {bedExit} from '../web/src/domain/bed.ts';
import {actionBarMessage,actionBarOpacity} from '../web/src/ui/action-bar.ts';
import {SmokePuff} from '../web/src/render/campfire-smoke.ts';
import {drawIcon} from '../web/src/ui/icons.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {WorldUse} from '../web/src/ui/world-use.ts';
import type {State,Command,Cell} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Hash-locked native recipes and item rules. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Apply a real world transaction. @param {State} s Snapshot. @param {Command} c Intent. @return {ReturnType<typeof transition>} Result. */
function run(s:State,c:Command){return transition(s,c,WORLD_REGION,rules);}
/** Plate with a solid support and adjacent iron trapdoor. @param {string} block Plate family. @return {State} Native receiver fixture. */
function fixture(block='oak_pressure_plate'):State{const s=initialState();s.progress.scenes.plains.blocks=[{id:'plate',block,cell:[6,6,6],state:{powered:'false',power:'0'}},{id:'support',block:'stone',cell:[6,5,6],state:{}},{id:'door',block:'iron_trapdoor',cell:[7,5,6],state:{facing:'north',half:'bottom',open:'false',powered:'false'}}];return s;}

test('physical trigger uses native inset, living sensitivity and entity counts rather than stack sizes',()=>{
    const blocks=fixture().progress.scenes.plains.blocks!;
    const player={id:'player',living:true,bounds:playerBounds([6.5,6,6.5])},item={id:'item',living:false,bounds:[6.4,6,6.4,6.6,6.25,6.6] as [number,number,number,number,number,number]};
    assert.equal(plateContacts(blocks,[player,item,item])[0].count,2);
    blocks[0].block='stone_pressure_plate';assert.equal(plateContacts(blocks,[player,item])[0].count,1);
    player.bounds=playerBounds([6.5,6.251,6.5]);assert.equal(plateContacts(blocks,[player])[0].count,0);
    for(const [count,power] of [[0,0],[1,1],[10,1],[11,2],[149,15],[151,15]])assert.equal(plateStrength('heavy_weighted_pressure_plate',count),power);
});

for(const [block,delay,family] of [['oak_pressure_plate',20,'wooden'],['stone_pressure_plate',20,'stone'],['heavy_weighted_pressure_plate',10,'metal']] as const)test(block+' activates physically, conducts through support and releases on its native tick with two sounds',()=>{
    let s=fixture(block);const on=run(s,{type:'pressure-contacts',scene:'plains',contacts:[{id:'plate',count:1}]});s=on.state;
    assert.equal(s.progress.scenes.plains.blocks![2].state.open,'true');assert.ok(poweredCells(s.progress,'plains').has('7,5,6'));
    assert.deepEqual(on.events.map(e=>e.sound),[`block.${family}_pressure_plate.click_on`,'block.iron_trapdoor.open']);
    s=run(s,{type:'pressure-contacts',scene:'plains',contacts:[]}).state;
    s=run(s,{type:'processing-tick',ticks:delay-1}).state;assert.equal(s.progress.scenes.plains.blocks![0].state.powered,'true');
    const off=run(s,{type:'processing-tick',ticks:1});assert.equal(off.state.progress.scenes.plains.blocks![2].state.open,'false');
    assert.deepEqual(off.events.filter(e=>e.type==='world-sound').map(e=>e.sound),[`block.${family}_pressure_plate.click_off`,'block.iron_trapdoor.close']);
});

test('heavy pressure strength changes on scheduled checks without replaying click_on',()=>{
    let s=run(fixture('heavy_weighted_pressure_plate'),{type:'pressure-contacts',scene:'plains',contacts:[{id:'plate',count:1}]}).state;
    s=run(s,{type:'pressure-contacts',scene:'plains',contacts:[{id:'plate',count:11}]}).state;
    assert.equal(s.progress.scenes.plains.blocks![0].state.power,'1');const next=run(s,{type:'processing-tick',ticks:10});assert.equal(next.state.progress.scenes.plains.blocks![0].state.power,'2');assert.equal(next.events.length,0);
});

for(const block of ['oak_door','oak_trapdoor','oak_fence_gate','iron_door','iron_trapdoor'])test(block+' manual rules, either-half power and stable-power manual override',()=>{
    let s=initialState();const door={id:'door',block,cell:[6,6,6] as Cell,state:{facing:'north',half:'lower',hinge:'left',open:'false',powered:'false'}};
    s.progress.scenes.plains.blocks=[door];if(block.endsWith('_door'))s.progress.scenes.plains.blocks.push({...structuredClone(door),id:'upper',pair:'door',cell:[6,7,6],state:{...door.state,half:'upper'}});
    const iron=block.startsWith('iron'),family=block==='oak_fence_gate'?'fence_gate':block.replace('oak_','wooden_');
    let result=run(s,{type:'use-block',scene:'plains',id:'door'});assert.equal(result.state.progress.scenes.plains.blocks![0].state.open,String(!iron));assert.equal(result.events.length,iron?0:1);if(!iron)assert.equal(result.events[0].sound,'block.'+family+'.open');
    s.progress.scenes.plains.blocks.push({id:'switch',block:'lever',cell:block.endsWith('_door')?[7,7,6]:[7,6,6],state:{facing:'east',face:'wall',powered:'false'}});
    result=run(s,{type:'use-block',scene:'plains',id:'switch'});assert.ok(result.state.progress.scenes.plains.blocks!.filter(b=>b.block===block).every(b=>b.state.open==='true'&&b.state.powered==='true'));
    s=run(result.state,{type:'use-block',scene:'plains',id:'door'}).state;s=run(s,{type:'processing-tick',ticks:2}).state;assert.equal(s.progress.scenes.plains.blocks![0].state.open,String(iron));
    s=run(s,{type:'use-block',scene:'plains',id:'switch'}).state;assert.ok(s.progress.scenes.plains.blocks!.filter(b=>b.block===block).every(b=>b.state.open==='false'));
});

test('campfire outline and collision exclude flames; hay below toggles signal smoke and water extinguishes',()=>{
    for(const lit of ['true','false'])for(const facing of ['north','east','south','west'])for(const collision of [false,true])assert.deepEqual(nativeShapes('campfire',{lit,facing},collision),[[0,0,0,1,7/16,1]]);
    const p=initialState().progress;p.scenes.plains.blocks=[{id:'fire',block:'campfire',cell:[6,6,6],state:{lit:'true'}},{id:'hay',block:'hay_block',cell:[6,5,6],state:{axis:'x'}}];connectBlocks(p);assert.equal(p.scenes.plains.blocks[0].state.signal_fire,'true');p.scenes.plains.blocks.pop();connectBlocks(p);assert.equal(p.scenes.plains.blocks[0].state.signal_fire,'false');p.scenes.plains.blocks[0].state.waterlogged='true';connectBlocks(p);assert.equal(p.scenes.plains.blocks[0].state.lit,'false');
});

test('native cosy/signal smoke lifetime, rise, fading and solid roof collision',()=>{
    const cosy=new SmokePuff([0,0,0],false,()=>.5),signal=new SmokePuff([0,0,0],true,()=>.5),roof=new SmokePuff([0,0,0],true,()=>.5);
    assert.equal(cosy.lifetime,105);assert.equal(signal.lifetime,305);assert.equal(signal.alpha,.95);
    for(let i=0;i<100;i++){cosy.tick([]);signal.tick([]);roof.tick([[0,3,0,1,4,1]]);}
    assert.ok(cosy.alpha<.1);assert.equal(signal.alpha,.95);assert.ok(signal.position[1]>7);assert.ok(roof.position[1]<=2.75);assert.ok(roof.stopped);
});

test('bed action bar selects all native failures and lasts sixty ticks with twenty-tick fade',()=>{
    for(const key of ['bed.noSleep','bed.tooFar','bed.obstructed','bed.occupied'])assert.ok(actionBarMessage(key));assert.equal(actionBarMessage('game.placed'),false);
    assert.equal(actionBarOpacity(0),1);assert.equal(actionBarOpacity(2000),1);assert.equal(actionBarOpacity(2500),.5);assert.equal(actionBarOpacity(3000),0);
});

test('straw bed chooses safe side, skips a blocking door, and uses head fallback when surrounded',()=>{
    const p=initialState().progress,head={id:'head',block:'straw_bed',cell:[6,6,5] as Cell,state:{facing:'north',part:'head'}};
    p.scenes.plains.blocks=[];for(let x=3;x<=9;x++)for(let z=2;z<=9;z++)p.scenes.plains.blocks.push({id:`floor:${x}:${z}`,block:'stone',cell:[x,5,z],state:{}});
    assert.deepEqual(bedExit(p,head,0),[7.5,6,5.5]);assert.deepEqual(bedExit(p,head,-Math.PI/2),[5.5,6,5.5]);
    p.scenes.plains.blocks.push({id:'wall',block:'stone',cell:[7,6,5],state:{}});assert.deepEqual(bedExit(p,head,0),[7.5,6,6.5]);
    for(let x=4;x<=8;x++)for(let z=3;z<=8;z++)p.scenes.plains.blocks.push({id:`block:${x}:${z}`,block:'stone',cell:[x,6,z],state:{}});assert.deepEqual(bedExit(p,head,0),[6.5,7.1,5.5]);
});

test('native icon overhang retains model scale and position for both original and locked silhouettes',()=>{
    const calls:unknown[][]=[],context={drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D,icon={dataset:{nativePadding:'4'}} as HTMLCanvasElement,mask={} as HTMLCanvasElement;
    drawIcon(context,icon,10,20);assert.deepEqual(calls[0],[icon,6,16,24,24]);drawIcon(context,icon,10,20,6,mask);assert.deepEqual(calls[1],[mask,8.5,18.5,9,9]);
});

test('physical adapter publishes player contacts and release even after a prior saved contact',async()=>{
    const s=fixture(),commands:Command[]=[],view=Object.assign(Object.create(WorldUse.prototype),{session:{view:{envelope:{state:s}}},scene:{motion:{feet:[6.5,6,6.5]},authored:{animals:new Map()}},run:async(c:Command)=>{commands.push(c);return true;}}) as WorldUse;
    view.samplePlates();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual((commands[0] as any).contacts,[{id:'plate',count:1}]);
    s.progress.scenes.plains.blocks![0].state.contacts='1';view.scene.motion.feet=[8.5,6,6.5];view.samplePlates();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual((commands[1] as any).contacts,[{id:'plate',count:0}]);
});
