/** Native strong/weak power, scheduled switch sounds and transactional hopper regression cases. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition} from '../web/src/domain/state.ts';
import {poweredCells,conductsRedstone} from '../web/src/domain/redstone.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {resources} from '../tools/resources.ts';
import type {State,Station,Cell,Command,DomainEvent} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Locked native item and container rules. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Build a supported hopper with finite material. @param {string} id Identity. @param {Cell} cell Position. @param {Station['facing']} facing Output. @param {string} item Material. @return {Station} Hopper. */
function hopper(id:string,cell:Cell,facing:Station['facing']='down',item='raw_iron'):Station{const contents=emptyHopper();contents.data.slots[0]={id:'minecraft:'+item,count:3};return{id,cell,facing,kind:'hopper',contents};}
/** Reproduce a lever on a furnace with hoppers on three other faces. @return {State} Mutable fixture. */
function fixture():State{
    const s=initialState(),p=s.progress;p.unlocked=['raw_iron','iron_ingot','coal'].map(v=>'minecraft:'+v);
    const contents=emptyFurnace();contents.data.output={id:'minecraft:iron_ingot',count:3};contents.data.outputRecipe='minecraft:iron_ingot_from_smelting_raw_iron';
    p.scenes.plains.stations=[{id:'furnace',kind:'furnace',cell:[6,6,6],facing:'south',contents},hopper('top',[6,7,6]),hopper('side',[7,6,6],'west','coal'),hopper('bottom',[6,5,6])];
    p.scenes.plains.stations[3].contents=emptyHopper();
    p.scenes.plains.blocks=[{id:'switch',block:'lever',cell:[6,6,7],state:{face:'wall',facing:'south',powered:'false'}}];return s;
}
/** Apply a real transition with the formal network policy. @param {State} s Snapshot. @param {Command} command Intent. @return {ReturnType<typeof transition>} Committed candidate. */
function run(s:State,command:Command){return transition(s,command,WORLD_REGION,rules);}

test('attached powered furnace locks top, side and bottom hoppers; off resumes input, fuel and output',()=>{
    let s=fixture();const before=structuredClone(s.progress.scenes.plains.stations);
    const on=run(s,{type:'use-block',scene:'plains',id:'switch'});s=on.state;
    assert.deepEqual(on.events.filter(e=>e.type==='world-sound').map(e=>[e.sound,e.volume,e.pitch]),[['block.lever.click',.3,.6]]);
    s=run(s,{type:'processing-tick',ticks:12}).state;
    assert.deepEqual(s.progress.scenes.plains.stations,before);
    const off=run(s,{type:'use-block',scene:'plains',id:'switch'});assert.equal(off.events[0].pitch,.5);
    s=run(off.state,{type:'processing-tick',ticks:1}).state;
    const furnace=s.progress.scenes.plains.stations[0].contents;
    assert.equal(furnace.version,2);if(furnace.version!==2)return;
    assert.equal(furnace.data.input?.id,'minecraft:raw_iron');assert.equal(furnace.data.fuel?.id,'minecraft:coal');assert.equal(furnace.data.output?.count,2);
});

test('only the attachment gets strong power; weakly powered cubes and cube chains do not relay',()=>{
    const p=fixture().progress,b=p.scenes.plains.blocks![0];b.state.powered='true';
    p.scenes.plains.blocks!.push({id:'weak',block:'stone',cell:[7,6,7],state:{}},{id:'chain',block:'stone',cell:[5,6,6],state:{}});
    const power=poweredCells(p,'plains');assert.ok(power.has('7,6,7'));assert.ok(!power.has('8,6,7'));assert.ok(power.has('5,6,6'));assert.ok(!power.has('4,6,6'));
    assert.equal(poweredCells(p,'home').size,0);
    for(const block of ['furnace','blast_furnace','stone','oak_planks'])assert.ok(conductsRedstone(block,{}));
    for(const block of ['hopper','glass','glowstone','oak_leaves','oak_stairs','lever'])assert.equal(conductsRedstone(block,{}),false);
    assert.ok(conductsRedstone('oak_slab',{type:'double'}));assert.equal(conductsRedstone('oak_slab',{type:'top'}),false);
});

for(const [face,cell,receiver] of [['floor',[6,7,6],[6,5,6]],['ceiling',[6,5,6],[6,7,6]],['wall',[7,6,6],[5,6,6]]] as const)test(face+' attachment powers through its actual support',()=>{
    const p=fixture().progress,b=p.scenes.plains.blocks![0];b.cell=[...cell];b.state={face,facing:'east',powered:'true'};
    assert.ok(poweredCells(p,'plains').has(receiver.join(',')));
});

test('powered hopper cooldown advances and another active hopper can still extract from it',()=>{
    let s=fixture();const p=s.progress;p.scenes.plains.stations=[hopper('locked',[6,6,6]),hopper('receiver',[6,5,6])];p.scenes.plains.stations[1].contents=emptyHopper();
    p.scenes.plains.blocks![0].state.powered='true';p.world.hoppers.locked={cooldown:3,lastTick:0};
    s=run(s,{type:'processing-tick',ticks:1}).state;
    const stations=s.progress.scenes.plains.stations;assert.equal((stations[0].contents as ReturnType<typeof emptyHopper>).data.slots[0]?.count,2);assert.equal((stations[1].contents as ReturnType<typeof emptyHopper>).data.slots[0]?.count,1);assert.equal(s.progress.world.hoppers.locked.cooldown,2);
});

test('active hopper can insert into a powered hopper inventory',()=>{
    let s=fixture(),p=s.progress;p.scenes.plains.stations=[hopper('sender',[6,7,6]),hopper('locked',[6,6,6])];p.scenes.plains.stations[1].contents=emptyHopper();p.scenes.plains.blocks![0].state.powered='true';
    s=run(s,{type:'processing-tick',ticks:1}).state;assert.equal((s.progress.scenes.plains.stations[1].contents as ReturnType<typeof emptyHopper>).data.slots[0]?.count,1);
});

for(const [block,duration,family] of [['stone_button',20,'stone'],['oak_button',30,'wooden']] as const)test(block+' emits press/release once and expires within batched ticks',()=>{
    let s=fixture();s.progress.scenes.plains.blocks![0].block=block;
    const press=run(s,{type:'use-block',scene:'plains',id:'switch'});s=press.state;assert.equal(press.events[0].sound,`block.${family}_button.click_on`);
    s=run(s,{type:'processing-tick',ticks:duration-1}).state;
    const repeat=run(s,{type:'use-block',scene:'plains',id:'switch'});assert.equal(repeat.events.length,0);assert.equal(repeat.state.progress.scenes.plains.blocks![0].state.releaseTick,String(duration));
    const end=run(repeat.state,{type:'processing-tick',ticks:3});assert.equal(end.events.filter(e=>e.type==='world-sound').length,1);assert.equal(end.events.find(e=>e.type==='world-sound')?.sound,`block.${family}_button.click_off`);
    assert.equal((end.state.progress.scenes.plains.stations[0].contents as ReturnType<typeof emptyFurnace>).data.input?.count,1);
});

test('failed persistence publishes no switch sound or powered state; committed state survives refresh',async()=>{
    let raw=JSON.stringify(await seal(fixture(),'redstone',0)),deny=true;const events:DomainEvent[]=[];
    const session=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{if(deny)throw Error('denied');raw=v;}},{exclusive:async work=>work()},WORLD_REGION);session.rules=rules;
    try{await session.refresh();session.eventListeners.add(e=>events.push(...e));await assert.rejects(session.dispatch({type:'use-block',scene:'plains',id:'switch'}));assert.equal(events.length,0);assert.equal(session.view.envelope!.state.progress.scenes.plains.blocks![0].state.powered,'false');deny=false;await session.refresh();await session.dispatch({type:'use-block',scene:'plains',id:'switch'});assert.equal(events.filter(e=>e.type==='world-sound').length,1);events.length=0;await session.refresh();assert.equal(events.length,0);assert.ok(poweredCells(session.view.envelope!.state.progress,'plains').has('6,5,6'));}finally{session.dispose();}
});

test('audited resources include original switch events and their exact button sample parameters',()=>{
    const pack=resources(),sounds=JSON.parse(pack.get('assets/minecraft/controls-sounds.json')!.toString());
    for(const name of ['lever.click','wooden_button.click_on','wooden_button.click_off','stone_button.click_on','stone_button.click_off']){
        const event=sounds['block.'+name];assert.ok(event);
        for(const sample of event.sounds){if(sample.type==='event')continue;assert.ok(pack.has('assets/minecraft/sounds/'+(typeof sample==='string'?sample:sample.name).replace('minecraft:','')+'.ogg'));}
    }
});
