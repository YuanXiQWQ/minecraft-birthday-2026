/** Straw-bed interaction follows the locked client's darkness, reach, obstruction and disposable-rest rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition} from '../web/src/domain/state.ts';
import {bedDarkEnough,bedParts} from '../web/src/domain/bed.ts';
import {nativeShapes} from '../web/src/domain/block-shapes.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {WorldUse} from '../web/src/ui/world-use.ts';
import type {State,Command,Cell,DomainEvent} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Locked inventory rules. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Place a complete north-facing bed in unobstructed space. @param {number} time Native clock. @return {State} Valid world fixture. */
function fixture(time=18000):State{const s=initialState();s.progress.environment!.dayTicks=time;s.progress.scenes.plains.blocks=[{id:'bed',block:'straw_bed',cell:[6,6,6],state:{facing:'north',part:'foot',occupied:'false'}},{id:'bed-head',pair:'bed',block:'straw_bed',cell:[6,6,5],state:{facing:'north',part:'head',occupied:'false'}}];return s;}
/** Apply a production command. @param {State} s Prior snapshot. @param {Command} command Intent. @return {ReturnType<typeof transition>} New facts. */
function run(s:State,command:Command){return transition(s,command,WORLD_REGION,rules);}
/** Click either half using the actual feet range. @param {State} s Prior snapshot. @param {string} id Clicked half. @param {Cell} feet Player feet. @return {State} Sleeping snapshot. */
function sleep(s:State,id='bed',feet:Cell=[6.5,6,7.5]):State{return run(s,{type:'use-bed',scene:'plains',id,feet}).state;}

for(const half of ['bed','bed-head'])test(half+' sleeps for 100 active ticks then wakes at dawn and consumes both halves without loot',()=>{
    let s=sleep(fixture(),half);assert.equal(s.progress.sleep?.ticks,0);assert.ok(s.progress.scenes.plains.blocks!.every(b=>b.state.occupied==='true'));
    s=run(s,{type:'processing-tick',ticks:99}).state;assert.equal(s.progress.sleep?.ticks,99);assert.equal(s.progress.scenes.plains.blocks!.length,2);
    const end=run(s,{type:'processing-tick',ticks:1});assert.equal(end.state.progress.sleep,undefined);assert.equal(end.state.progress.environment!.dayTicks,24000);assert.equal(end.state.progress.scenes.plains.blocks!.length,0);assert.deepEqual(end.state.progress.player,s.progress.player);assert.deepEqual(end.events.filter(e=>e.type==='world-sound').map(e=>e.sound),['block.straw_bed.break_leave']);
    assert.ok(!('respawn' in end.state.progress));
});

test('daytime and ordinary rain fail, night and thunder pass using the original gameplay light track',()=>{
    const s=fixture(6000),e=s.progress.environment!;assert.equal(bedDarkEnough(s.progress),false);assert.throws(()=>sleep(s),/bed.noSleep/);
    e.raining=true;e.rainLevel=1;assert.equal(bedDarkEnough(s.progress),false);
    e.thundering=true;e.thunderLevel=1;assert.equal(bedDarkEnough(s.progress),true);assert.ok(sleep(s).progress.sleep);
    e.rainLevel=e.thunderLevel=0;e.dayTicks=12500;assert.equal(bedDarkEnough(s.progress),false);e.dayTicks=13000;assert.equal(bedDarkEnough(s.progress),true);
    e.dayTicks=23000;assert.equal(bedDarkEnough(s.progress),true);e.dayTicks=24000;assert.equal(bedDarkEnough(s.progress),false);
});

test('range uses either half with three horizontal and two vertical blocks; malformed pairs cannot sleep',()=>{
    assert.ok(sleep(fixture(),'bed-head',[9.5,8,6.5]).progress.sleep);
    for(const feet of [[9.501,6,6.5],[6.5,8.001,6.5],[6.5,6,9.501]] as Cell[])assert.throws(()=>sleep(fixture(),'bed',feet),/bed.tooFar/);
    const s=fixture();s.progress.scenes.plains.blocks!.pop();assert.throws(()=>sleep(s),/bed.incomplete/);
    const mismatch=fixture();mismatch.progress.scenes.plains.blocks![1].state.facing='south';assert.deepEqual(bedParts(mismatch.progress,'bed'),[]);
});

test('either half can be obstructed, but non-suffocating slabs do not prevent sleep',()=>{
    for(const z of [5,6]){const s=fixture();s.progress.scenes.plains.blocks!.push({id:'roof',block:'stone',cell:[6,7,z],state:{}});assert.throws(()=>sleep(s),/bed.obstructed/);s.progress.scenes.plains.blocks![2].block='oak_slab';s.progress.scenes.plains.blocks![2].state.type='bottom';assert.ok(sleep(s).progress.sleep);s.progress.scenes.plains.blocks![2].state.type='double';assert.throws(()=>sleep(s),/bed.obstructed/);}
    const occupied=fixture();occupied.progress.scenes.plains.blocks![0].state.occupied='true';assert.throws(()=>sleep(occupied),/bed.occupied/);
});

test('early leave consumes the straw bed without advancing time or clearing weather',()=>{
    const s=sleep(fixture()),end=run(s,{type:'leave-bed'});assert.equal(end.state.progress.environment!.dayTicks,18000);assert.equal(end.state.progress.sleep,undefined);assert.equal(end.state.progress.scenes.plains.blocks!.length,0);assert.equal(run(end.state,{type:'leave-bed'}).events.length,0);
});

test('frozen ticks do not finish sleep and advanceTime/advanceWeather controls are honored',()=>{
    let s=fixture();const e=s.progress.environment!;e.control.frozen=true;e.control.advanceTime=false;e.control.advanceWeather=false;e.raining=e.thundering=true;e.rainLevel=e.thunderLevel=1;
    s=sleep(s);s=run(s,{type:'processing-tick',ticks:100}).state;assert.equal(s.progress.sleep?.ticks,0);
    s=structuredClone(s);s.progress.environment!.control.stepTicks=100;const end=run(s,{type:'processing-tick',ticks:100}).state;assert.equal(end.progress.sleep,undefined);assert.equal(end.progress.environment!.dayTicks,18000);assert.equal(end.progress.environment!.raining,true);
});

test('sleep clears a thunderstorm with native weather counters on successful completion',()=>{
    const s=fixture(6000),e=s.progress.environment!;e.raining=e.thundering=true;e.rainLevel=e.thunderLevel=1;e.rainTime=e.thunderTime=1000;
    const end=run(sleep(s),{type:'processing-tick',ticks:100}).state;assert.equal(end.progress.environment!.raining,false);assert.equal(end.progress.environment!.thundering,false);assert.equal(end.progress.environment!.rainTime,0);assert.equal(end.progress.environment!.dayTicks,24000);
});

test('sleep and wake commit atomically, survive reload, and never replay sound on load',async()=>{
    let raw=JSON.stringify(await seal(fixture(),'bed',0)),deny=false;const events:DomainEvent[]=[];
    const session=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{if(deny)throw Error('denied');raw=v;}},{exclusive:async work=>work()},WORLD_REGION);session.rules=rules;
    try{await session.refresh();session.eventListeners.add(e=>events.push(...e));deny=true;await assert.rejects(session.dispatch({type:'use-bed',scene:'plains',id:'bed',feet:[6.5,6,6.5]}));assert.ok(!session.view.envelope!.state.progress.sleep);deny=false;await session.refresh();await session.dispatch({type:'use-bed',scene:'plains',id:'bed',feet:[6.5,6,6.5]});await session.dispatch({type:'processing-tick',ticks:50});await session.refresh();assert.equal((session.view.envelope!.state.progress as State["progress"]).sleep?.ticks,50);deny=true;await assert.rejects(session.dispatch({type:'leave-bed'}));assert.equal(session.view.envelope!.state.progress.scenes.plains.blocks!.length,2);assert.equal(events.filter(e=>e.type==='world-sound').length,0);deny=false;await session.refresh();await session.dispatch({type:'leave-bed'});assert.equal(events.filter(e=>e.type==='world-sound').length,1);await session.refresh();assert.equal(events.filter(e=>e.type==='world-sound').length,1);assert.ok(await decode(raw));}finally{session.dispose();}
});

test('right-use dispatches bed interaction from either half and sneak-held-block keeps placement',()=>{
    const s=fixture(),commands:Command[]=[],ui=Object.assign(Object.create(WorldUse.prototype),{session:{view:{envelope:{state:s}}},scene:{motion:{feet:[6.5,6,6.5]}},run:(c:Command)=>{commands.push(c);return Promise.resolve(true);},heldBlock:()=> 'stone',place:()=>commands.push({type:'leave-bed'})}) as WorldUse;
    for(const id of ['bed','bed-head'])ui.use({id,block:'straw_bed'} as any,false);assert.deepEqual(commands.map(c=>c.type),['use-bed','use-bed']);
    s.progress.player.data.hotbar[0]={id:'minecraft:stone',count:1};ui.use({id:'bed',block:'straw_bed'} as any,true);assert.equal(commands.at(-1)!.type,'leave-bed');
});

test('straw bed collision is four pixels high with a five-pixel head pillow',()=>{
    assert.deepEqual(nativeShapes('straw_bed',{part:'foot',facing:'north'},true),[[0,0,0,1,.25,1]]);
    assert.deepEqual(nativeShapes('straw_bed',{part:'head',facing:'north'},true),[[0,0,0,1,.25,1],[0,0,0,1,5/16,.5]]);
});
