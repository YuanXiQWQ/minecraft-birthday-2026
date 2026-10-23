/** Acquisition routing uses real finite slots, transitions and shared SaveSession transactions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {initialState,transition} from '../web/src/domain/state.ts';
import {emptyInventory,storeAcquired} from '../web/src/domain/inventory.ts';
import {takeCraft} from '../web/src/domain/crafting.ts';
import {emptyFurnace,advanceFurnace,takeFurnace} from '../web/src/domain/furnace.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import type {State,Command} from '../web/src/domain/types.ts';
import type {Rules,Stack} from '../web/src/rules/types.ts';
import type {SlotValue} from '../web/src/domain/slots.ts';
/** Same-version item capacities and actual crafting/cooking data. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Build an actual finite group. @param {string} id Native short ID. @param {number} count Physical amount. @return {Stack} Carrier value. */
function stack(id:string,count=1):Stack{return{id:'minecraft:'+id,count};}
/** Seed only stated test acquisition facts. @param {string[]} ids Existing acquired IDs. @return {State} Mutable valid state. */
function state(...ids:string[]):State{let s=initialState();for(const id of ids)s=transition(s,{type:'unlock',item:stack(id).id}).state;return structuredClone(s);}
/** Observe one real source and its current finite layout. @param {State} s Current state. @return {Command} Official harvest command. */
function harvest(s:State):Command{return{type:'harvest-node',scene:'plains',node:'oak_log:0',visit:s.progress.world.visits.plains.epoch,expected:structuredClone(s.progress.player.data)};}

test('new natural pickup uses first hotbar vacancy rather than an empty backpack',()=>{
    const s=initialState(),r=transition(s,harvest(s),undefined,rules),p=r.state.progress;
    assert.deepEqual(p.player.data.hotbar[0],stack('oak_log'));assert.ok(p.player.data.backpack.every(s=>s===null));
    assert.deepEqual(r.events.find(e=>e.type==='items-acquired')?.deposited,[stack('oak_log')]);assert.equal(r.events.filter(e=>e.type==='item-unlocked').length,1);
});

test('existing compatible stacks merge before allocating a new hotbar stack',()=>{
    const s=state('oak_log');s.progress.player.data.backpack[0]=stack('oak_log',63);
    const p=transition(s,harvest(s),undefined,rules).state.progress.player.data;
    assert.equal(p.hotbar[0],null);assert.deepEqual(p.backpack[0],stack('oak_log',64));
});

test('merge compatible groups, preferring hotbar merges, then allocate hotbar vacancies',()=>{
    const v=emptyInventory();v.hotbar[0]=stack('oak_log',63);v.backpack[0]=stack('oak_log',63);
    const source:SlotValue={stack:stack('oak_log',10),policy:{take:true,place:false}};storeAcquired(source,v,rules);
    assert.equal(v.hotbar[0]!.count,64);assert.deepEqual(v.hotbar[1],stack('oak_log',8));assert.equal(v.backpack[0]!.count,64);assert.equal(source.stack,null);
});

test('components remain distinct and a full hotbar falls back to compatible backpack capacity',()=>{
    const v=emptyInventory();v.hotbar=Array.from({length:9},()=>stack('stone',64));
    v.hotbar[0]={...stack('oak_log',63),components:{'minecraft:custom_data':{variant:1}}};v.backpack[0]=stack('oak_log',63);
    const source:SlotValue={stack:stack('oak_log',3),policy:{take:true,place:false}};storeAcquired(source,v,rules);
    assert.equal(v.hotbar[0]!.count,63);assert.equal(v.backpack[0]!.count,64);assert.deepEqual(v.backpack[1],stack('oak_log',2));assert.equal(source.stack,null);
});

test('remaining finite overflow is retained when both bands are full',()=>{
    const v=emptyInventory();v.hotbar=Array.from({length:9},()=>stack('oak_log',64));v.backpack=Array.from({length:27},()=>stack('oak_log',64));v.hotbar[3]!.count=63;
    const source:SlotValue={stack:stack('oak_log',3),policy:{take:true,place:false}};storeAcquired(source,v,rules);
    assert.equal(v.hotbar[3]!.count,64);assert.deepEqual(source.stack,stack('oak_log',2));assert.ok(v.backpack.every(s=>s?.count===64));
});

test('Shift crafting delivers a new complete finite result into the hotbar before backpack vacancies',()=>{
    const v={...emptyInventory(),crafting:[stack('oak_log'),null,null,null]};v.backpack[0]=stack('stone',60);
    const r=takeCraft(v,{mode:'shift'},['minecraft:oak_log','minecraft:stone'],rules);
    assert.deepEqual(r.inventory.hotbar[8],stack('oak_planks',4));assert.deepEqual(r.inventory.backpack[0],stack('stone',60));assert.ok(r.inventory.crafting!.every(s=>s===null));assert.equal(r.batches,1);
});

test('Shift furnace output uses a hotbar vacancy without duplicating its finite source',()=>{
    const f=emptyFurnace();f.data.input=stack('oak_log');f.data.fuel=stack('oak_planks');advanceFurnace(f,'furnace',200,rules);
    const v=emptyInventory();v.backpack[0]=stack('stone',63);
    const r=takeFurnace(v,f,{mode:'shift'},['minecraft:stone'],rules);
    assert.deepEqual(r.receipt.inventory.hotbar[8],stack('charcoal'));assert.deepEqual(r.receipt.inventory.backpack[0],stack('stone',63));assert.equal(r.contents.data.output,null);assert.equal(f.data.output!.count,1);
});

test('milk consumes exactly one held bucket and routes the generated milk bucket to another hotbar cell',()=>{
    const s=state('bucket');s.progress.scene='farm';s.progress.player.data.hotbar[0]=stack('bucket',2);
    const r=transition(s,{type:'harvest-node',scene:'farm',node:'cow:0',visit:0,expected:s.progress.player.data},undefined,rules);
    assert.deepEqual(r.state.progress.player.data.hotbar[0],stack('bucket'));assert.deepEqual(r.state.progress.player.data.hotbar[1],stack('milk_bucket'));assert.ok(r.state.progress.player.data.backpack.every(s=>s===null));
});

/** Use actual serialized storage and a shared lock for routing, failure and cross-session checks.
 * @return {Promise<object>} Real sessions plus a storage failure control.
 */
async function sessions(){
    let raw=JSON.stringify(await seal(initialState(),'hotbar-priority',0)),deny=false,tail:Promise<unknown>=Promise.resolve();
    const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{if(deny)throw Error('write-failed');raw=value;}},locks={
        /** Serialize actual save work. @param {Function} work Save operation. @return {Promise<T>} Committed outcome. */
        exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work);tail=next.catch(()=>{});return next;}
    };
    const a=new SaveSession(storage,locks,{allows:()=>true}),b=new SaveSession(storage,locks,{allows:()=>true});a.rules=b.rules=rules;await a.refresh();await b.refresh();return{a,b,raw:()=>raw,deny:(value:boolean)=>{deny=value;}};
}

test('competing real sessions persist one pickup in the hotbar and refresh the same layout',async()=>{
    const h=await sessions(),command=harvest(h.a.view.envelope!.state),out=await Promise.allSettled([h.a.dispatch(command),h.b.dispatch(command)]);
    assert.equal(out.filter(r=>r.status==='fulfilled').length,1);const p=(await decode(h.raw())).envelope.state.progress;
    assert.deepEqual(p.player.data.hotbar[0],stack('oak_log'));assert.ok(p.player.data.backpack.every(s=>s===null));assert.deepEqual(p.world.visits.plains.removed,['oak_log:0']);
    await h.b.refresh();assert.deepEqual(h.b.view.envelope!.state.progress.player.data,p.player.data);
});

test('write failure leaves slots, source and facts unchanged; retry deposits once into the hotbar',async()=>{
    const h=await sessions(),before=h.raw(),command=harvest(h.a.view.envelope!.state);h.deny(true);
    await assert.rejects(h.a.dispatch(command),/write-failed/);assert.equal(h.raw(),before);h.deny(false);await h.a.refresh();await h.a.dispatch(command);
    const p=(await decode(h.raw())).envelope.state.progress;assert.deepEqual(p.player.data.hotbar[0],stack('oak_log'));assert.deepEqual(p.unlocked,['minecraft:oak_log']);assert.ok(p.player.data.backpack.every(s=>s===null));
});


test('mixed crop drops preserve aggregate capacity by merging wheat and using the hotbar vacancy for seeds',()=>{
    const s=state('stone','wheat','wheat_seeds');s.progress.scene='farm';
    s.progress.player.data.backpack=Array.from({length:27},()=>stack('stone',64));s.progress.player.data.backpack[0]=stack('wheat',63);
    s.progress.player.data.hotbar=Array.from({length:9},()=>stack('stone',64));s.progress.player.data.hotbar[0]=null;
    s.progress.scenes.farm.crops=[{id:'grown',item:'minecraft:wheat_seeds',cell:WORLD_SCENES.farm.plots[0],growth:{version:1,data:{ticks:240}}}];
    const r=transition(s,{type:'harvest-crop',id:'grown',expected:s.progress.player.data},undefined,rules),event=r.events.find(e=>e.type==='items-acquired')!;
    assert.equal(r.state.progress.player.data.backpack[0]!.count,64);assert.equal(r.state.progress.player.data.hotbar[0]!.id,'minecraft:wheat_seeds');
    assert.deepEqual(event.overflow,[]);assert.deepEqual(event.deposited,event.stacks);assert.equal(r.state.progress.scenes.farm.crops.length,0);
});
