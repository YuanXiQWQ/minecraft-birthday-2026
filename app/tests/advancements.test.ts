/** Formal transactions prove native advancement predicates, finite carriers, migration and save fencing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {BIRTHDAY_ADVANCEMENT,ADVANCEMENTS,advancementDone,emptyAdvancements,updateAdvancements,visibleAdvancements} from '../web/src/domain/advancements.ts';
import {AdvancementView} from '../web/src/ui/advancements.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal,decode,checksum,token} from '../web/src/persistence/codec.ts';
import {WORLD_SCENES,WORLD_REGION} from '../web/src/domain/world-config.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {ToastSlots} from '../web/src/ui/toast-slots.ts';
import {resources} from '../tools/resources.ts';
import type {State,Command} from '../web/src/domain/types.ts';
import type {InventoryCommand} from '../web/src/domain/inventory.ts';
import type {Rules,Stack} from '../web/src/rules/types.ts';

/** Exact committed original rules drive all real inventory and world transactions. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Build a native group. @param {string} id Short ID. @param {number} count Quantity. @return {Stack} Group. */
function stack(id:string,count=1):Stack{return{id:'minecraft:'+id,count};}
/** Create isolated real storage and serialized lock ports.
 * @param {State} state Explicit preconditions, never an acquisition shortcut.
 * @return {Promise<object>} Sessions, fault control and raw saved bytes.
 */
async function harness(state:State=initialState()) {
    let raw=JSON.stringify(await seal(state,'advancement-test',0)),deny=false,tail:Promise<unknown>=Promise.resolve();
    const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(deny)throw Error('write-failed');raw=v;}},locks={exclusive<T>(work:()=>Promise<T>):Promise<T>{const p=tail.then(work);tail=p.catch(()=>{});return p;}};
    const a=new SaveSession(storage,locks,WORLD_REGION),b=new SaveSession(storage,locks,WORLD_REGION);a.rules=b.rules=rules;await a.refresh();await b.refresh();
    return{a,b,raw:()=>raw,deny:(value:boolean)=>{deny=value;}};
}
/** Submit through the real unified inventory command. @param {SaveSession} s Session. @param {InventoryCommand} intent Slot operation. @param {Stack|null} cursor Explicit transient group. @return {Promise<import('../web/src/domain/inventory.ts').InventoryState>} Committed receipt. */
async function edit(s:SaveSession,intent:InventoryCommand,cursor:Stack|null=null){return s.editInventory(intent,cursor,s.view.envelope!.state.progress.player.data);}
/** Read one namespaced completion. @param {SaveSession} s Session. @param {string} id Native path. @return {boolean} Completion. */
function done(s:SaveSession,id:string):boolean{return advancementDone(s.view.envelope!.state.progress.advancements,'minecraft:'+id);}

for(const [item,id] of [['crafting_table','root'],['cobblestone','mine_stone'],['stone_pickaxe','upgrade_tools'],['iron_ingot','smelt_iron'],['iron_pickaxe','iron_tools'],...['iron_helmet','iron_chestplate','iron_leggings','iron_boots'].map(i=>[i,'obtain_armor'])])test('native actual-player acquisition '+item,async()=>{
    const {a}=await harness();await a.dispatch({type:'unlock',item:stack(item).id});assert.equal(done(a,'story/'+id),false);
    const cursor=(await edit(a,{type:'source',item:stack(item).id,mode:'left'})).cursor;
    assert.equal(done(a,'story/'+id),false,'cursor is not Inventory');
    const events:any[]=[];a.eventListeners.add(es=>events.push(...es));
    await edit(a,{type:'backpack-slot',index:0,button:0},cursor);assert.equal(done(a,'story/'+id),true);
    assert.equal(events.filter(e=>e.type==='advancements-completed').length,1);
    if(id!=='root')assert.equal(done(a,'story/root'),false,'parent is not required or auto-granted');
    if(id==='obtain_armor')assert.ok(Object.values(a.view.envelope!.state.progress.player.data.equipment).every(s=>s===null));
    await a.refresh();await a.dispatch({type:'settings',patch:{volume:.4}});await a.dispatch({type:'select-scene',scene:'home'});
    assert.equal(events.filter(e=>e.type==='advancements-completed').length,1);
});
for(const item of ['wooden_pickaxe','stone','stone_axe','stone_shovel','iron_axe','raw_iron','iron_nugget','iron_block'])test('native precise predicate rejects '+item,async()=>{
    const {a}=await harness();await a.dispatch({type:'unlock',item:stack(item).id});await edit(a,{type:'source',item:stack(item).id,mode:'number',index:0});
    assert.deepEqual(a.view.envelope!.state.progress.advancements,emptyAdvancements());
});
for(const mode of ['number','offhand'] as const)test('catalogue '+mode+' writes Inventory and grants',async()=>{
    const {a}=await harness();await a.dispatch({type:'unlock',item:stack('iron_ingot').id});await edit(a,{type:'source',item:stack('iron_ingot').id,mode,index:3});assert.equal(done(a,'story/smelt_iron'),true);
});
for(const destination of ['quick','swap','equipment','equip','preset'] as const)test('unified Inventory pathway '+destination,async()=>{
    const s=initialState();s.progress.unlocked=[stack('iron_helmet').id];
    if(destination==='preset')s.progress.player.data.presets[0]=[stack('iron_helmet'),...Array(8).fill(null)];
    else if(destination==='equip')s.progress.player.data.hotbar[0]=stack('iron_helmet');
    else if(destination==='swap')s.progress.player.data.backpack[0]=stack('iron_helmet');
    const {a}=await harness(s);
    if(destination==='equipment')await edit(a,{type:'equipment',slot:'head',button:0},stack('iron_helmet'));
    if(destination==='equip')await edit(a,{type:'equip'});
    if(destination==='swap')await edit(a,{type:'swap',slot:'backpack:0',target:'equipment:offhand'});
    if(destination==='preset')await edit(a,{type:'preset',index:0,mode:'load'});
    if(destination==='quick')await a.transact({type:'inventory',intent:{type:'quick',slot:'crafting:0'},cursor:null,crafting:[stack('iron_helmet'),null,null,null],expected:a.view.envelope!.state.progress.player.data});
    assert.equal(done(a,'story/obtain_armor'),true);
});
test('one multi-slot preset grants every changedItem, not merely its first item',async()=>{
    const s=initialState();s.progress.unlocked=['crafting_table','cobblestone','stone_pickaxe','iron_ingot','iron_helmet','iron_pickaxe'].map(id=>stack(id).id);
    s.progress.player.data.presets[0]=[...s.progress.unlocked.map(id=>({id,count:1})),null,null,null];
    const {a}=await harness(s);const events=await a.dispatch({type:'inventory',intent:{type:'preset',index:0,mode:'load'},cursor:null,expected:a.view.envelope!.state.progress.player.data});
    assert.equal(events.find(e=>e.type==='advancements-completed')?.advancements?.length,6);
});
test('changedItem does not rescan unchanged inventory, ignores templates, normalizes default components, detects counts and components',()=>{
    const s=initialState();s.progress.unlocked=[stack('iron_pickaxe').id];s.progress.player.data.hotbar[0]=stack('iron_pickaxe');
    for(const command of [{type:'settings',patch:{volume:.9}},{type:'select-scene',scene:'cave'},{type:'processing-tick',ticks:100}] as Command[]){const r=transition(s,command,WORLD_REGION,rules);assert.deepEqual(r.state.progress.advancements,emptyAdvancements());}
    const before=structuredClone(s.progress.player.data),after=structuredClone(before),facts=emptyAdvancements();after.hotbar[0]!.components={'minecraft:damage':0};assert.deepEqual(updateAdvancements(facts,before,after),[]);
    after.hotbar[0]!.components={'minecraft:damage':1};assert.deepEqual(updateAdvancements(facts,before,after),['minecraft:story/iron_tools']);
    const bag=initialState().progress.player.data;bag.hotbar[0]=stack('iron_ingot',2);const next=structuredClone(bag);next.hotbar[0]!.count=1;
    assert.deepEqual(updateAdvancements(emptyAdvancements(),bag,next),['minecraft:story/smelt_iron']);
});
test('finite furnace output and hopper slots are excluded; actual machine pickup to cursor then player grants once',async()=>{
    const s=initialState();s.progress.scene='cave';s.progress.unlocked=['furnace','hopper','raw_iron'].map(id=>stack(id).id);
    const furnace=emptyFurnace();furnace.data.output=stack('iron_ingot');furnace.data.outputRecipe='minecraft:iron_ingot_from_smelting_raw_iron';
    const hopper=emptyHopper();s.progress.unlocked.push(stack('iron_ingot').id);hopper.data.slots[0]=stack('iron_ingot');
    s.progress.scenes.cave.stations=[{id:'f',kind:'furnace',cell:[0,0,0],facing:'south',contents:furnace},{id:'h',kind:'hopper',cell:[1,0,0],facing:'down',contents:hopper}];
    const {a}=await harness(s);await a.dispatch({type:'settings',patch:{muted:true}});assert.equal(done(a,'story/smelt_iron'),false);
    const d=a.view.envelope!.state.progress.scenes.cave.stations[0];const r=await a.takeOutput({mode:'cursor',button:0},null,a.view.envelope!.state.progress.player.data,{scene:'cave',id:'f',expected:d.contents});
    assert.equal(done(a,'story/smelt_iron'),false);await edit(a,{type:'backpack-slot',index:0,button:0},r.inventory.cursor);assert.equal(done(a,'story/smelt_iron'),true);
});
test('full-bag real stone harvest unlocks cobblestone but grants only when a later player slot actually changes',async()=>{
    const s=initialState();s.progress.scene='cave';s.progress.unlocked=['oak_log','wooden_pickaxe'].map(id=>stack(id).id);s.progress.player.data.backpack=Array.from({length:27},()=>stack('oak_log',64));s.progress.player.data.hotbar=Array.from({length:9},()=>stack('oak_log',64));s.progress.player.data.hotbar[0]=stack('wooden_pickaxe');
    const {a}=await harness(s);await a.dispatch({type:'harvest-node',scene:'cave',node:'stone:0',visit:0,expected:a.view.envelope!.state.progress.player.data});assert.ok(a.view.envelope!.state.progress.unlocked.includes(stack('cobblestone').id));assert.equal(done(a,'story/mine_stone'),false);
    await edit(a,{type:'source',item:stack('cobblestone').id,mode:'number',index:1});assert.equal(done(a,'story/mine_stone'),true);
});
test('successful planting consumes a seed and immediately completes child and its husbandry root; failures and harvesting do not',async()=>{
    const {a}=await harness();for(const id of ['wheat_seeds','wooden_hoe','wheat'])await a.dispatch({type:'unlock',item:stack(id).id});
    await a.dispatch({type:'select-scene',scene:'farm'});await edit(a,{type:'source',item:stack('wooden_hoe').id,mode:'number',index:0});
    const plant=()=>a.dispatch({type:'plant-crop',id:'crop',cell:WORLD_SCENES.farm.plots[0],expected:a.view.envelope!.state.progress.player.data});
    await assert.rejects(plant,/invalid-plant/);assert.equal(done(a,'husbandry/plant_seed'),false);
    await edit(a,{type:'source',item:stack('wheat_seeds').id,mode:'number',index:0});const n=a.view.envelope!.state.progress.player.data.hotbar[0]!.count;
    await plant();assert.equal(a.view.envelope!.state.progress.player.data.hotbar[0]!.count,n-1);assert.equal(a.view.envelope!.state.progress.scenes.farm.crops[0].growth.version,1);
    assert.equal(done(a,'husbandry/plant_seed'),true);assert.equal(done(a,'husbandry/root'),true);assert.ok(visibleAdvancements().has('minecraft:husbandry/root'));
    await assert.rejects(plant,/invalid-plant/);
});
test('harvesting an existing mature crop and acquiring a seed or hoe cannot invent a placed-wheat event',async()=>{
    const s=initialState();s.progress.scene='farm';s.progress.unlocked=['wheat_seeds','wooden_hoe'].map(id=>stack(id).id);s.progress.scenes.farm.crops=[{id:'existing',item:stack('wheat_seeds').id,cell:WORLD_SCENES.farm.plots[0],growth:{version:1,data:{ticks:240}}}];
    const {a}=await harness(s);await edit(a,{type:'source',item:stack('wooden_hoe').id,mode:'number',index:0});await a.dispatch({type:'harvest-crop',id:'existing',expected:a.view.envelope!.state.progress.player.data});assert.equal(done(a,'husbandry/plant_seed'),false);
    await edit(a,{type:'source',item:stack('wheat_seeds').id,mode:'number',index:0});assert.equal(done(a,'husbandry/plant_seed'),false);
});
test('denied planting writes leave the seed, plot, criteria and notification stream unchanged',async()=>{
    const s=initialState();s.progress.scene='farm';s.progress.unlocked=[stack('wheat_seeds').id];s.progress.player.data.hotbar[0]=stack('wheat_seeds');const h=await harness(s),before=h.raw(),events:any[]=[];h.a.eventListeners.add(es=>events.push(...es));h.deny(true);
    await assert.rejects(()=>h.a.dispatch({type:'plant-crop',id:'plant',cell:WORLD_SCENES.farm.plots[0],expected:h.a.view.envelope!.state.progress.player.data}),/write-failed/);assert.equal(h.raw(),before);assert.deepEqual(h.a.view.envelope!.state,s);assert.deepEqual(events,[]);
    h.deny(false);await h.a.refresh();await h.a.dispatch({type:'plant-crop',id:'plant',cell:WORLD_SCENES.farm.plots[0],expected:h.a.view.envelope!.state.progress.player.data});assert.equal(done(h.a,'husbandry/plant_seed'),true);assert.equal(h.a.view.envelope!.state.progress.player.data.hotbar[0],null);
});
for(const mode of ['cursor','shift'] as const)test('actual native crafting-table result '+mode+' distinguishes acquired cursor and Inventory',async()=>{
    const s=initialState();s.progress.unlocked=[stack('oak_planks').id];const {a}=await harness(s),r=await a.takeCraft({mode},null,Array.from({length:4},()=>stack('oak_planks')),a.view.envelope!.state.progress.player.data);
    assert.equal(done(a,'story/root'),mode==='shift');assert.equal(a.view.envelope!.state.progress.cakePlacement,null);
    if(mode==='cursor'){assert.equal(r.inventory.cursor?.id,stack('crafting_table').id);await edit(a,{type:'backpack-slot',index:0,button:0},r.inventory.cursor);assert.equal(done(a,'story/root'),true);}
});
test('failed storage, competing tabs, reset and stale old callbacks preserve atomic progress and notify once',async()=>{
    const s=initialState();s.progress.unlocked=[stack('iron_ingot').id];const h=await harness(s),{a,b}=h,events:any[]=[];a.eventListeners.add(e=>events.push(...e));
    h.deny(true);const before=h.raw();await assert.rejects(()=>edit(a,{type:'source',item:stack('iron_ingot').id,mode:'number',index:0}),/write-failed/);assert.equal(h.raw(),before);assert.equal(events.length,0);
    h.deny(false);await a.refresh();const results=await Promise.allSettled([a,b].map(s=>edit(s,{type:'source',item:stack('iron_ingot').id,mode:'number',index:0})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    await a.refresh();await b.refresh();assert.equal(done(a,'story/smelt_iron'),true);const count=events.filter(e=>e.type==='advancements-completed').length;
    await a.reset(token(a.view.envelope!));assert.deepEqual(a.view.envelope!.state.progress.advancements,emptyAdvancements());await assert.rejects(()=>edit(b,{type:'source',item:stack('iron_ingot').id,mode:'number',index:0}),/stale-session/);
    await a.dispatch({type:'unlock',item:stack('iron_ingot').id});await edit(a,{type:'source',item:stack('iron_ingot').id,mode:'number',index:0});assert.equal(events.filter(e=>e.type==='advancements-completed').length,count+1);
});
test('additive old-save adaptation reads only current Inventory, never unlocked items, old crops, devices or birthday; restore is silent',async()=>{
    const s=initialState();s.progress.unlocked=['iron_ingot','iron_helmet','cake','wheat_seeds'].map(id=>stack(id).id);s.progress.player.data.backpack[0]=stack('iron_helmet');s.progress.cakePlacement={scene:'home',table:'birthday-table'};
    s.progress.scenes.farm.crops=[{id:'old',item:stack('wheat_seeds').id,cell:WORLD_SCENES.farm.plots[0],growth:{version:1,data:{ticks:240}}}];delete s.progress.advancements;
    const e=await seal(s,'old-adv',44),{checksum:_,...body}=e,raw=JSON.stringify({...body,checksum:await checksum(body)}),r=await decode(raw);
    assert.equal(r.migrated,true);assert.equal(r.envelope.revision,44);assert.equal(advancementDone(r.envelope.state.progress.advancements,'minecraft:story/obtain_armor'),true);assert.equal(advancementDone(r.envelope.state.progress.advancements,'minecraft:story/smelt_iron'),false);assert.equal(advancementDone(r.envelope.state.progress.advancements,'minecraft:husbandry/plant_seed'),false);
    const {advancements,...progress}=r.envelope.state.progress;assert.deepEqual(progress,s.progress);assert.deepEqual(r.envelope.state.settings,s.settings);
    const stored=JSON.stringify(await seal(r.envelope.state,'old-adv',45));assert.equal((await decode(stored)).migrated,false);
    const bad=structuredClone(r.envelope.state);bad.progress.advancements!.criteria['minecraft:story/root']=['fake'];assert.throws(()=>validateState(bad),/invalid-advancements/);
});
test('locked refresh durably synchronizes old Inventory once, with no toast events; failed migration preserves original bytes',async()=>{
    const state=initialState();state.progress.unlocked=[stack('iron_helmet').id];state.progress.player.data.backpack[0]=stack('iron_helmet');delete state.progress.advancements;
    const original=JSON.stringify(await seal(state,'sync-once',7));let raw=original,writes=0,deny=true;const s=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{if(deny)throw Error('write-failed');raw=v;writes++;}},{exclusive:work=>work()}),events:any[]=[];s.eventListeners.add(e=>events.push(...e));
    await s.refresh();assert.equal(raw,original);assert.equal(s.view.writable,false);deny=false;await s.refresh();assert.equal(s.view.envelope!.revision,8);assert.equal(done(s,'story/obtain_armor'),true);assert.equal(writes,1);assert.deepEqual(events,[]);await s.refresh();assert.equal(writes,1);assert.deepEqual(events,[]);
    const readOnly=new SaveSession({getItem:()=>original,setItem:()=>{throw Error('no-write');}},null);await readOnly.refresh();assert.equal(readOnly.view.writable,false);assert.equal(readOnly.view.envelope!.revision,7);
});
test('original data, translated Suit Up title, no rewards, root flags and shared five-row toast allocation',()=>{
    const evidence=JSON.parse(readFileSync(new URL('../../docs/p9/advancements/native-evidence.json',import.meta.url),'utf8'));
    for(const entry of evidence.derived)assert.equal(createHash('sha256').update(readFileSync(new URL('../../'+entry.entry,import.meta.url))).digest('hex'),entry.sha256);
    const files=resources();for(const [id,definition] of Object.entries(ADVANCEMENTS).filter(([id])=>id.startsWith('minecraft:'))){const path='data/minecraft/advancement/'+id.split(':')[1]+'.json';assert.deepEqual(JSON.parse(Buffer.from(files.get(path)!).toString()),definition);assert.equal('rewards' in definition,false);}
    assert.equal(ADVANCEMENTS['minecraft:story/root'].display.show_toast,false);assert.equal(ADVANCEMENTS['minecraft:story/mine_stone'].display.icon.id,stack('wooden_pickaxe').id);
    assert.equal(JSON.parse(readFileSync(new URL('../web/src/i18n/advancements.zh_cn.json',import.meta.url),'utf8'))['advancements.story.obtain_armor.title'],'整装上阵');
    const rows=new ToastSlots(),owners=Array.from({length:6},()=>({}));assert.deepEqual(owners.map(o=>rows.claim(o)),[0,1,2,3,4,-1]);rows.release(owners[1]);assert.equal(rows.claim(owners[5]),1);assert.equal(rows.claim(owners[0]),0);
});

test('birthday challenge uses original frame assets and a localized upper-right native-size toast without replay',()=>{
 const files=resources();for(const state of ['obtained','unobtained'])assert.ok(files.has('assets/minecraft/textures/gui/sprites/advancements/challenge_frame_'+state+'.png'));
 const saved=Object.fromEntries(['document','requestAnimationFrame','cancelAnimationFrame','devicePixelRatio'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const canvases:any[]=[],drawn:any[]=[],sprites:string[]=[];let next:(()=>void)|undefined;
 const ctx={setTransform(){},clearRect(){}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,createElement:()=>({style:{},dataset:{},width:0,height:0,isConnected:false,setAttribute(){},getContext:()=>ctx,remove(){}})}});
 Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(fn:()=>void)=>{next=fn;return 1;}});
 Object.defineProperty(globalThis,'cancelAnimationFrame',{configurable:true,value:()=>{}});
 Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1});
 try{
  const view=Object.assign(Object.create(AdvancementView.prototype),{facts:{version:1,criteria:{[BIRTHDAY_ADVANCEMENT]:['cake_on_table']}},generation:'birthday',notified:new Set(),tasks:[],slots:new ToastSlots(),frame:0,disposed:false,host:{append:(canvas:any)=>canvases.push(canvas)},sound(){},sprite:(_ctx:any,name:string)=>sprites.push(name),ui:{scale:2,permanent:{settings:{locale:'zh-CN'}},stack(){},pixels:{font:{width:(text:string)=>text.length*6,draw:(_ctx:any,...args:any[])=>drawn.push(args)}}}}) as AdvancementView;
  view.notify([BIRTHDAY_ADVANCEMENT],'birthday');next!();
  assert.equal(canvases.length,1);assert.equal(canvases[0].width,320);assert.equal(canvases[0].height,64);
  assert.match(canvases[0].style.cssText,/top:0px;transform:translateX\(320px\)/);assert.doesNotMatch(canvases[0].style.cssText,/left:|bottom:|right:auto/);assert.ok(drawn.some(args=>args[0]==='挑战已完成！'&&args[3]==='#FF88FF'));assert.ok(drawn.some(args=>args[0]==='生日快乐！'));
  assert.deepEqual(sprites,['sprites/toast/advancement']);view.notify([BIRTHDAY_ADVANCEMENT],'birthday');assert.equal(canvases.length,1);view.clearToasts();
 }finally{for(const [key,value] of Object.entries(saved)){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}
});
