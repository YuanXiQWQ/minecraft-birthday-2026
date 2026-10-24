/** Native movement feedback, moving weather fields, finite meadow harvest and block-light regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,PerspectiveCamera,Matrix4} from 'three';
import {PlayerMotion} from '../web/src/domain/player-motion.ts';
import {viewBob} from '../web/src/render/view-bob.ts';
import {BlockLight} from '../web/src/render/block-light.ts';
import {NativePrecipitation} from '../web/src/render/native-precipitation.ts';
import {initialState,transition} from '../web/src/domain/state.ts';
import {WORLD_SCENES,WORLD_REGION,sourceOccupied,supported} from '../web/src/domain/world-config.ts';
import {blockAt} from '../web/src/domain/placed-blocks.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {soundGain} from '../web/src/domain/audio-settings.ts';
import type {Rules} from '../web/src/rules/types.ts';
/** Ground and locked native rules are independent of render input mocks. */
const floor:[number,number,number,number,number,number]=[-30,-1,-30,30,0,30],rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;

test('sprint remains active after releasing Control, supports jumping, and stops with forward release',()=>{
    const m=new PlayerMotion();m.reset([0,1.62,7]);m.grounded=true;m.tick(new Set(['KeyW','ControlLeft']),0,[floor]);
    for(let i=0;i<10;i++)m.tick(new Set(['KeyW']),0,[floor]);assert.equal(m.sprinting,true);const z=m.feet[2];
    let peak=0;for(let i=0;i<12;i++){m.tick(new Set(i===0?['KeyW','Space']:['KeyW']),0,[floor]);peak=Math.max(peak,m.feet[1]);}
    assert.ok(peak>1.24&&peak<1.26);assert.ok(m.feet[2]<z-4);m.tick(new Set(),0,[floor]);assert.equal(m.sprinting,false);
});
test('native bob and steps depend on travel, settle at rest, and leave yaw untouched',()=>{
    const m=new PlayerMotion();m.grounded=true;let steps=0;for(let i=0;i<30;i++){m.tick(new Set(['KeyW']),0,[floor]);steps+=Number(m.step);}
    assert.ok(steps>=3);assert.ok(m.bob>.09);assert.notDeepEqual(viewBob(m,.5).elements,new Matrix4().elements);
    for(let i=0;i<50;i++)m.tick(new Set(),0,[floor]);assert.ok(m.bob<.00001);
    const sneaking=new PlayerMotion();sneaking.grounded=true;for(let i=0;i<100;i++){sneaking.tick(new Set(['KeyW','ShiftLeft']),0,[floor]);assert.equal(sneaking.step,false);}
});
test('jumping in place has no invented jump or step sound',()=>{const m=new PlayerMotion();m.grounded=true;for(let i=0;i<25;i++){m.tick(new Set(i===0?['Space']:[]),0,[floor]);assert.equal(m.step,false);assert.ok(m.landedDistance<3);}});
test('player material sounds obey Players independently of Blocks',()=>{const s=initialState().settings;s.volume=1;s.muted=false;s.blocksVolume=0;s.playersVolume=.7;assert.equal(soundGain(s,'block.grass.step','playersVolume'),.7);assert.equal(soundGain(s,'block.grass.step'),0);});
test('rain follows horizontal and vertical player cells and rebuilds placed roofs without rescanning an unchanged heightmap',()=>{
    const effect=new NativePrecipitation({guiImages:new Map(['rain','snow'].map(n=>['assets/minecraft/textures/environment/'+n+'.png',{width:64,height:64}]))} as any),camera=new PerspectiveCamera(),p=initialState().progress,world=new Group();camera.position.set(0,2,7);
    try{effect.update(camera,p,world,1,1,false);const heights=effect.heights,old=effect.mesh.geometry;camera.position.set(15,5,-16);effect.update(camera,p,world,2,1,false);assert.deepEqual(effect.center,[15,5,-16]);assert.equal(effect.heights,heights);assert.notEqual(effect.mesh.geometry,old);const a=effect.mesh.geometry.getAttribute('position');for(let i=0;i<a.count;i++){assert.ok(a.getX(i)>=4&&a.getX(i)<=26);assert.ok(a.getZ(i)>=-27&&a.getZ(i)<=-5);}
    p.scenes.plains.blocks=[{id:'roof',block:'cobblestone',cell:[14,6,-16],state:{}}];effect.update(camera,p,world,3,1,false);assert.equal(effect.heights.get('14:-16'),7);
    }finally{effect.dispose();}
});
test('torch block light attenuates by one, respects full opaque walls and clears after removal',()=>{
    const light=new BlockLight();try{light.rebuild([{cell:[0,1,0],level:14}],[]);assert.equal(light.at([0,1,0]),14);assert.equal(light.at([3,1,0]),11);assert.equal(light.at([14,1,0]),0);light.rebuild([{cell:[0,1,0],level:14}],[[1,-6,-28,2,26,20]]);assert.equal(light.at([2,1,0]),0);light.rebuild([],[]);assert.equal(light.at([0,1,0]),0);}finally{light.dispose();}
});
test('all reachable scattered grass uses stable finite sources and round-trips without losing old harvest facts',async()=>{
    let s=structuredClone(initialState());s.progress.world.visits.plains.removed=['short_grass:0','oak_log:0'];s.progress.unlocked=['minecraft:shears'];s.progress.player.data.hotbar[0]={id:'minecraft:shears',count:1};
    const nodes=WORLD_SCENES.plains.nodes.filter(n=>n.id.startsWith('meadow:'));assert.ok(nodes.length>100);assert.ok(nodes.some(n=>n.block==='tall_grass'));
    const tall=nodes.find(n=>n.block==='tall_grass')!,upper:[number,number,number]=[tall.cell[0],tall.cell[1]+1,tall.cell[2]];
    assert.equal(blockAt(s.progress,upper)?.id,'node:'+tall.id);assert.equal(sourceOccupied(s.progress,upper),true);assert.equal(supported(s.progress,upper),false);
    for(const block of ['short_grass','tall_grass']){const n=nodes.find(n=>n.block===block)!;s=transition(s,{type:'harvest-node',scene:'plains',node:n.id,visit:0,expected:s.progress.player.data},WORLD_REGION,rules).state;assert.ok(s.progress.world.visits.plains.removed.includes(n.id));}
    assert.ok(s.progress.player.data.hotbar.some(v=>v?.id==='minecraft:short_grass'&&v.count===3));assert.deepEqual((await decode(JSON.stringify(await seal(s,'meadow',1)))).envelope.state,s);
});
