/** Cake portions persist independently of birthday completion and only committed bites produce feedback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition,hasCake,validateState} from '../web/src/domain/state.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {nativeShapes} from '../web/src/domain/block-shapes.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {WorldUse} from '../web/src/ui/world-use.ts';
import {placementBlocks} from '../web/src/domain/placed-blocks.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {BIRTHDAY_ADVANCEMENT} from '../web/src/domain/advancements.ts';
import type {Rules} from '../web/src/rules/types.ts';
import type {Command} from '../web/src/domain/types.ts';

/** Locked recipes for the ordinary transaction pipeline. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Prepare an old completed save with an actual held tool.
 * @return {ReturnType<typeof initialState>} Independent player facts.
 */
function completed(){const s=initialState();s.progress.scene='home';s.progress.unlocked.push('minecraft:cake','minecraft:iron_pickaxe');s.progress.cakePlacement={scene:'home',table:'birthday-table'};s.progress.player.data.hotbar[0]={id:'minecraft:iron_pickaxe',count:1};return s;}

test('seven bites persist across reloads, retain held tools and completion, and reject duplicate observed portions',async()=>{
    let state=completed();const player=structuredClone(state.progress.player);
    for(let bites=0;bites<7;bites++){
        const command:Command={type:'eat-cake',scene:'home',id:'birthday-cake',expectedBites:bites};
        const result=transition(state,command,WORLD_REGION,rules);
        assert.ok(result.events.some(e=>e.type==='cake-eaten'));
        state=result.state;assert.equal(state.progress.cakePlacement?.bites,bites+1);
        assert.ok(hasCake(state));assert.deepEqual(state.progress.player,player);
        const duplicate=transition(state,command,WORLD_REGION,rules);
        assert.ok(!duplicate.events.some(e=>e.type==='cake-eaten'));assert.equal(duplicate.state.progress.cakePlacement?.bites,bites+1);
        state=(await decode(JSON.stringify(await seal(state,'cake-check',bites)))).envelope.state;
    }
    const invalid=structuredClone(state);invalid.progress.cakePlacement!.bites=8;assert.throws(()=>validateState(invalid));
    state=structuredClone(state);state.progress.player.data.hotbar[0]={id:'minecraft:cake',count:1};
    const refill=transition(state,{type:'record-cake-placement',scene:'home',table:'birthday-table'},WORLD_REGION,rules);
    assert.equal(refill.state.progress.player.data.hotbar[0],null);assert.equal(refill.state.progress.cakePlacement?.bites??0,0);
    assert.ok(!refill.events.some(e=>e.type==='cake-placed'));
    assert.ok(refill.events.some(e=>e.type==='cake-replaced'));
    assert.deepEqual(transition(refill.state,{type:'record-cake-placement',scene:'home',table:'birthday-table'},WORLD_REGION,rules).state.progress.player,refill.state.progress.player);
});

test('ordinary ground placement gives author guidance without consuming a cake or submitting a placement',()=>{
    const state=completed();state.progress.player.data.hotbar[0]={id:'minecraft:cake',count:1};
    const use=Object.create(WorldUse.prototype) as WorldUse,messages:string[]=[];
    Object.assign(use,{session:{view:{envelope:{state}}},heldKind:()=>null,heldBlock:()=> 'cake',author:(key:string)=>messages.push(key),run:()=>assert.fail('cake placement must not be dispatched')});
    const before=structuredClone(state);use.place({id:'ground',point:[3,0,2],normal:[0,1,0]});
    assert.deepEqual(messages,['chat.cakeTableOnly']);assert.deepEqual(state,before);
    assert.throws(()=>placementBlocks(state.progress,'cake',{cell:[4,-1,2],normal:[0,1,0],point:[4.5,0,2.5],eye:[4.5,1.62,4.5],yaw:0},'ground-cake'),/birthday-table-required/);
});

test('replacement replays only after a successful saved refill and never repeats birthday advancement or refresh events',async()=>{
    const state=completed();state.progress.cakePlacement!.bites=7;state.progress.player.data.hotbar[0]={id:'minecraft:cake',count:1};
    state.progress.advancements!.criteria[BIRTHDAY_ADVANCEMENT]=['cake_on_table'];
    let raw=JSON.stringify(await seal(state,'refill',0)),fail=true;const events:any[]=[];
    const session=new SaveSession({getItem:()=>raw,setItem:(_key,value)=>{if(fail)throw Error('write-failed');raw=value;}},{exclusive:async work=>work()},WORLD_REGION);
    session.rules=rules;await session.refresh();session.eventListeners.add(es=>events.push(...es));
    const command:Command={type:'record-cake-placement',scene:'home',table:'birthday-table',expected:state.progress.player.data};
    await assert.rejects(()=>session.dispatch(command),/write-failed/);assert.equal(events.length,0);assert.equal(session.view.envelope!.state.progress.cakePlacement!.bites,7);
    fail=false;await session.refresh();await session.dispatch(command);assert.equal(events.filter(e=>e.type==='cake-replaced').length,1);
    assert.ok(!events.some(e=>e.type==='cake-placed'||e.type==='advancements-completed'));assert.equal(session.view.envelope!.state.progress.player.data.hotbar[0],null);
    await session.refresh();await session.dispatch({type:'record-cake-placement',scene:'home',table:'birthday-table'});assert.equal(events.filter(e=>e.type==='cake-replaced').length,1);
});

test('placed cakes shrink along native X and disappear only after their seventh portion',()=>{
    let state=completed();state.progress.scenes.home.blocks=[{id:'placed-cake',block:'cake',cell:[3,0,-2],state:{bites:'0'}}];
    for(let bites=0;bites<7;bites++){
        assert.deepEqual(nativeShapes('cake',{bites:String(bites)}),[[(1+2*bites)/16,0,1/16,15/16,.5,15/16]]);
        state=transition(state,{type:'eat-cake',scene:'home',id:'placed-cake',expectedBites:bites},WORLD_REGION,rules).state;
        assert.equal(state.progress.scenes.home.blocks?.length,bites===6?0:1);
    }
    assert.equal(state.progress.cakePlacement?.bites,undefined);
});

test('right Use with a tool routes birthday and placed cakes to eating; stale or failed transactions stay silent',async()=>{
    const state=completed(),use=Object.create(WorldUse.prototype) as WorldUse,calls:any[]=[];
    state.progress.scenes.home.blocks=[{id:'placed-cake',block:'cake',cell:[3,0,-2],state:{bites:'2'}}];
    Object.assign(use,{session:{view:{envelope:{state,generation:'cake'}},serial:1},run:(...args:any[])=>{calls.push(args);return Promise.resolve(true);}});
    for(const id of ['birthday-cake','placed-cake'])use.use({id,point:[0,2,-3],normal:[0,1,0]},false);
    assert.equal(calls.length,2);assert.equal(calls[0][0].type,'eat-cake');assert.equal(calls[1][0].expectedBites,2);
    for(const call of calls){assert.equal(call[2],'entity.generic.eat');assert.equal(call[4].category,'playersVolume');}
    use.use({id:'birthday-cake',point:[0,2,-3],normal:[0,1,0]},true);assert.equal(calls.length,2);
    let sounds=0,swings=0,events:any[]=[{type:'cake-eaten'}];
    Object.assign(use,{current:()=>true,scene:{hand:{swing:()=>swings++}},sound:()=>sounds++,preview:()=>{},notify:()=>{}});
    use.session.dispatch=async()=>events;
    await WorldUse.prototype.run.call(use,calls[0][0],null,calls[0][2],undefined,calls[0][4]);
    events=[];await WorldUse.prototype.run.call(use,calls[0][0],null,calls[0][2]);
    use.session.dispatch=async()=>{throw Error('save-failed');};
    await WorldUse.prototype.run.call(use,calls[0][0],null,calls[0][2]);
    assert.equal(sounds,1);assert.equal(swings,1);
});
