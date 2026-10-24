/** Native soil, finite walk-over drops and bounded animal behavior exercise production domain code. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {agriculture,soilAt,canTill,hydrated,tickAgriculture,cropStage,canPickup,growthSpeed} from '../web/src/domain/agriculture.ts';
import {blockAt} from '../web/src/domain/placed-blocks.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {FarmAnimal,itemMotion} from '../web/src/domain/farm-life.ts';
import {PlayerMotion} from '../web/src/domain/player-motion.ts';
import type {Bounds} from '../web/src/domain/player-motion.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import type {Cell,Command,State} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';
/** Hash-locked native loot, stack sizes and tools. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Create only explicitly owned fixture tools/seeds. @return {State} Mutable formal state. */
function fixture():State {const s=initialState();s.progress.scene='farm';s.progress.unlocked=['minecraft:wooden_hoe','minecraft:wheat_seeds'];s.progress.player.data.hotbar[0]={id:'minecraft:wooden_hoe',count:1};s.progress.player.data.hotbar[1]={id:'minecraft:wheat_seeds',count:8};return s;}
/** Apply the real atomic command. @param {State} s Snapshot. @param {Command} command Intent. @return {State} Committed result. */
function apply(s:State,command:Command):State{return transition(s,command,WORLD_REGION,rules).state;}
/** Prepare a newly tilled and planted field. @param {Cell} ground Ground coordinate. @return {State} Planted snapshot. */
function planted(ground:Cell=[14,-1,5]):State {let s=fixture();s=apply(s,{type:'till-soil',scene:'farm',cell:ground,normal:[0,1,0],expected:s.progress.player.data});s=structuredClone(s);s.progress.player.data.selected=1;return apply(s,{type:'plant-crop',cell:[ground[0],ground[1]+1,ground[2]],id:'seed',expected:s.progress.player.data});}

test('hoe accepts clear top/side soil, rejects bottom, plants, obstruction and wrong held item',()=>{
    const p=fixture().progress,hoe=p.player.data.hotbar[0];
    assert.equal(canTill(p,[14,-1,5],[0,1,0],hoe),true);assert.equal(canTill(p,[14,-1,5],[1,0,0],hoe),true);
    assert.equal(canTill(p,[14,-1,5],[0,-1,0],hoe),false);assert.equal(canTill(p,[14,-1,5],[0,1,0],p.player.data.hotbar[1]),false);
    p.scenes.farm.stations.push({id:'cover',kind:'crafting_table',cell:[14,0,5],facing:'north',contents:{version:1,data:{grid:Array(9).fill(null)}}});
    assert.equal(canTill(p,[14,-1,5],[0,1,0],hoe),false);
});
test('new dry soil accepts one finite seed, persists outside the nine original plots, and tools do not wear',async()=>{
    const s=planted(),p=s.progress;assert.equal(soilAt(p,[14,-1,5])?.moisture,0);assert.equal(p.player.data.hotbar[1]?.count,7);assert.equal(p.player.data.hotbar[0]?.count,1);
    assert.equal(blockAt(p,[14,-1,5])?.block,'farmland');assert.equal(p.scenes.farm.crops.length,1);
    const decoded=(await decode(JSON.stringify(await seal(s,'soil-test',0)))).envelope.state;assert.deepEqual(decoded.progress,p);
    assert.throws(()=>apply(s,{type:'plant-crop',cell:[14,0,5],id:'duplicate',expected:p.player.data}),/invalid-plant/);
});
test('nearby water hydrates through four horizontal blocks; height and roof/rain rules matter',()=>{
    const p=fixture().progress;assert.equal(hydrated(p,[-2,-1,-2]),true);assert.equal(hydrated(p,[-1,-1,-2]),false);assert.equal(hydrated(p,[-6,0,-2]),false);
    p.environment!.raining=true;assert.equal(hydrated(p,[14,-1,5]),true);assert.equal(hydrated(p,[-9,-1,-12]),false);
});
test('wet crop keeps 240 active ticks while dry crop receives no accelerated progress',()=>{
    const wet=structuredClone(planted()),dry=structuredClone(planted());soilAt(wet.progress,[14,-1,5])!.moisture=7;
    for(let i=0;i<240;i++){tickAgriculture(wet.progress);tickAgriculture(dry.progress);}
    assert.equal(cropStage(wet.progress.scenes.farm.crops[0]),7);assert.equal(cropStage(dry.progress.scenes.farm.crops[0]),0);
    assert.equal(soilAt(dry.progress,[14,-1,5])!.moisture,0);assert.equal(growthSpeed(dry.progress,[14,0,5]),2);
});
test('native random ticks dry unwatered soil to dirt, retain planted dry soil, and hydrate watered fields',()=>{
    const s=planted(),p=structuredClone(s.progress),a=agriculture(p);a.soils.push({cell:[15,-1,5],moisture:1},{cell:[-2,-1,-2],moisture:0},{cell:[16,-1,5],moisture:0});
    p.scenes.farm.blocks=[{id:'gate',block:'oak_fence_gate',cell:[16,0,5],state:{open:'false',facing:'north'}}];
    for(let i=0;i<16000;i++)tickAgriculture(p);
    assert.equal(soilAt(p,[15,-1,5])!.moisture,null);assert.equal(soilAt(p,[14,-1,5])!.moisture,0);assert.equal(soilAt(p,[-2,-1,-2])!.moisture,7);
    assert.ok(cropStage(p.scenes.farm.crops[0])<7);assert.equal(soilAt(p,[16,-1,5])!.moisture,0);
});
test('walk and short drops preserve soil; a high landing destroys crop into durable collectible loot',()=>{
    let s=planted();s=apply(s,{type:'land-on-soil',scene:'farm',feet:[14.5,-.0625,5.5],distance:.5});assert.equal(s.progress.scenes.farm.crops.length,1);
    s=apply(s,{type:'land-on-soil',scene:'farm',feet:[14.5,-.0625,5.5],distance:2});assert.equal(s.progress.scenes.farm.crops.length,0);assert.equal(soilAt(s.progress,[14,-1,5])!.moisture,null);
    assert.deepEqual(s.progress.scenes.farm.agriculture!.drops.map(d=>d.stack),[{id:'minecraft:wheat_seeds',count:1}]);validateState(s);
    s=apply(s,{type:'pickup-ground',scene:'farm',feet:[14.5,0,5.5],visit:0});assert.equal(s.progress.scenes.farm.agriculture!.drops.length,0);assert.equal(s.progress.player.data.hotbar[1]!.count,8);
});
test('egg click is rejected; remote feet cannot collect; full inventory leaves it on the ground',()=>{
    const s=fixture();assert.throws(()=>apply(s,{type:'harvest-node',scene:'farm',node:'chicken-egg:0',visit:0,expected:s.progress.player.data}),/walk-over/);
    assert.equal(canPickup([0,0,7],[4,0,-2]),false);let after=apply(s,{type:'pickup-ground',scene:'farm',feet:[0,0,7],visit:0});assert.deepEqual(after.progress.world.visits.farm.removed,[]);
    const full=structuredClone(s);full.progress.unlocked.push('minecraft:oak_log');full.progress.player.data.hotbar=Array.from({length:9},()=>({id:'minecraft:oak_log',count:64}));full.progress.player.data.backpack=Array.from({length:27},()=>({id:'minecraft:oak_log',count:64}));
    const r=transition(full,{type:'pickup-ground',scene:'farm',feet:[4,0,-1],visit:0},WORLD_REGION,rules);assert.deepEqual(r.state.progress.world.visits.farm.removed,[]);assert.equal(r.events.some(e=>e.type==='items-acquired'),false);
    after=apply(s,{type:'pickup-ground',scene:'farm',feet:[4,0,-1],visit:0});assert.ok(after.progress.world.visits.farm.removed.includes('chicken-egg:0'));
    const replay=transition(after,{type:'pickup-ground',scene:'farm',feet:[4,0,-1],visit:0},WORLD_REGION,rules);assert.equal(replay.events.some(e=>e.type==='items-acquired'),false);
});
test('concurrent pickup and failed writes conserve egg lifetime and capacity',async()=>{
    let raw=JSON.stringify(await seal(fixture(),'soil-save',0)),tail=Promise.resolve<unknown>(null),deny=false;
    const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(deny)throw Error('denied');raw=v;}},locks={exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work);tail=next.catch(()=>{});return next;}};
    const a=new SaveSession(storage,locks,WORLD_REGION),b=new SaveSession(storage,locks,WORLD_REGION);a.rules=b.rules=rules;await a.refresh();await b.refresh();
    const cmd:Command={type:'pickup-ground',scene:'farm',feet:[4,0,-1],visit:0},before=raw;deny=true;await assert.rejects(a.dispatch(cmd),/write-failed/);assert.equal(raw,before);deny=false;await a.refresh();
    const results=await Promise.all([a.dispatch(cmd),b.dispatch(cmd)]);assert.equal(results.flat().filter(e=>e.type==='items-acquired').length,1);
});
test('native item bob/spin is continuous and unrelated to pickup distance',()=>{
    assert.deepEqual(itemMotion(0,0),{y:.1625,yaw:0});assert.equal(itemMotion(20,0).yaw,1);for(let t=0;t<200;t+=.1){const m=itemMotion(t,.7);assert.ok(m.y>=.0625-1e-8&&m.y<=.2625+1e-8);}
});
test('animal random routes remain within two blocks, avoid new obstacles/water and emit native ambient events',()=>{
    const solids:Bounds[]=[[-10,-1,-10,10,0,10],[.75,0,-2,1.25,2,2]],water:Cell[]=[[-2,-1,0]];
    for(const kind of ['cow','chicken'] as const){const a=new FarmAnimal(kind,[0,0,0],3);let sounds=0,moved=false;for(let i=0;i<2400;i++){const r=a.tick(solids,water);sounds+=Number(r.ambient);moved ||= Math.hypot(a.feet[0],a.feet[2])>.1;assert.ok(Math.hypot(a.feet[0],a.feet[2])<=2+1e-8);assert.ok(a.feet[0]<.75);assert.ok(r.pitch>=.8&&r.pitch<=1.2);}assert.ok(moved);assert.ok(sounds>5);}
});
test('player landing includes final downward motion and water clears accumulated fall distance',()=>{
    const m=new PlayerMotion();m.feet=[0,2,0];for(let i=0;i<30&&!m.grounded;i++)m.tick(new Set(),0,[[-5,-1,-5,5,0,5]]);assert.equal(m.landedDistance,2);
    m.fallDistance=5;m.tick(new Set(),0,[],{water:true});assert.equal(m.fallDistance,0);
});
