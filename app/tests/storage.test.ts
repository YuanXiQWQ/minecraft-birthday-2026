/** Native storage menus, persisted physical ownership and hopper automation regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {emptyStorage,containerDevice,storageParts,pairChest,canOpenStorage,reduceStorageInventory,storageSoundPosition} from '../web/src/domain/storage.ts';
import {emptyInventory,layout} from '../web/src/domain/inventory.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {placementBlocks} from '../web/src/domain/placed-blocks.ts';
import type {PlacedBlock,BlockHit} from '../web/src/domain/placed-blocks.ts';
import type {Rules,Stack} from '../web/src/rules/types.ts';
import type {State,Command,Cell,WorkbenchContext} from '../web/src/domain/types.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {Group} from 'three';
import {SceneView} from '../web/src/render/scene.ts';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {entityCube} from '../web/src/ui/icons.ts';
import {transferDevices} from '../web/src/domain/device-transfer.ts';

/** Locked native stack and recipe rules. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Create a finite native stack. @param {number} count Units. @return {Stack} Oak planks. */
function stack(count=1):Stack{return {id:'minecraft:oak_planks',count};}
/** Create physical storage with optional contents. @param {string} id Identity. @param {Cell} cell Position. @param {string} kind Block path. @return {PlacedBlock} Single block. */
function box(id='box',cell:Cell=[6,6,6],kind='chest'):PlacedBlock{return {id,block:kind,cell,state:{facing:'north',type:'single',open:'false'},contents:emptyStorage()};}
/** Build unlocked storage in an isolated scene. @return {State} Mutable saved fixture. */
function fixture():State{const s=structuredClone(initialState());s.progress.unlocked=['minecraft:chest','minecraft:barrel','minecraft:oak_planks','minecraft:hopper'];s.progress.scenes.plains.blocks=[box()];return s;}
/** Apply the actual validated reducer. @param {State} s Saved snapshot. @param {Command} c Semantic command. @return {ReturnType<typeof transition>} Committed result. */
function run(s:State,c:Command){return transition(s,c,WORLD_REGION,rules);}
/** Read an observed menu revision. @param {State} s Snapshot. @param {string} id Block identity. @return {WorkbenchContext} Optimistic precondition. */
function context(s:State,id='box'):WorkbenchContext{return {scene:'plains',id,expected:structuredClone(containerDevice(s.progress,'plains',id)!.contents)};}
/** Create a side placement context. @param {boolean} crouch Secondary use. @return {BlockHit} North-facing placement. */
function hit(crouch=false):BlockHit{return {cell:[6,5,6],point:[6.5,6,6.5],normal:[0,1,0],eye:[8,8,9],yaw:Math.PI,crouch};}

test('legacy decorative storage opens empty and persists independent contents through real save reload',async()=>{
    const s=fixture();delete s.progress.scenes.plains.blocks![0].contents;validateState(s);
    let raw=JSON.stringify(await seal(s,'storage-test',0));
    const session=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{raw=v;}},{exclusive:work=>work()},WORLD_REGION);session.rules=rules;await session.refresh();
    const p=session.view.envelope!.state.progress;
    await session.editInventory({type:'storage-slot',index:26,button:0},stack(17),p.player.data,undefined,context(session.view.envelope!.state));
    const loaded=await decode(raw);assert.equal(loaded.envelope.state.progress.scenes.plains.blocks![0].contents!.data.slots[26]!.count,17);
    assert.ok(!Object.hasOwn(loaded.envelope.state.progress.player.data,'storage'));session.dispose();
});

test('storage validation rejects invalid owners, sizes, counts and locked groups',()=>{
    for(const mutate of [(s:State)=>{s.progress.scenes.plains.blocks![0].contents!.data.slots.length=54;},(s:State)=>{s.progress.scenes.plains.blocks![0].contents!.data.slots[0]=stack(65);},(s:State)=>{s.progress.scenes.plains.blocks![0].block='stone';},(s:State)=>{s.progress.scenes.plains.blocks![0].contents!.data.slots[0]={id:'minecraft:diamond',count:1};}]){const s=fixture();mutate(s);assert.throws(()=>validateState(s));}
});

test('native placement joins two compatible chests, keeps right-first order and rejects a third half',()=>{
    const s=fixture(),blocks=s.progress.scenes.plains.blocks!,other=box('other',[7,6,6]);blocks.push(other);pairChest(s.progress,other,hit());
    assert.equal(blocks[0].state.type,'left');assert.equal(other.state.type,'right');
    assert.deepEqual(storageParts(s.progress,'plains','box').map(b=>b.id),['other','box']);
    assert.deepEqual(storageParts(s.progress,'plains','other').map(b=>b.id),['other','box']);
    const third=box('third',[8,6,6]);blocks.push(third);pairChest(s.progress,third,hit());assert.equal(third.state.type,'single');
    const next=run(s,{type:'inventory',intent:{type:'storage-slot',index:53,button:0},cursor:stack(3),expected:s.progress.player.data,workbench:context(s)});
    assert.equal(next.state.progress.scenes.plains.blocks![0].contents!.data.slots[26]?.count,3);
    assert.equal(next.state.progress.scenes.plains.blocks![1].contents!.data.slots.every(s=>!s),true);
    assert.deepEqual(storageSoundPosition(storageParts(s.progress,'plains','box')),[7,6.5,6.5]);
});

test('crouching suppresses automatic joining but targeting a chest side explicitly joins with its facing',()=>{
    const s=fixture(),other=box('other',[7,6,6]);s.progress.scenes.plains.blocks!.push(other);pairChest(s.progress,other,hit(true));assert.equal(other.state.type,'single');
    other.state.facing='south';pairChest(s.progress,other,{...hit(true),normal:[1,0,0]});assert.equal(other.state.facing,'north');assert.equal(other.state.type,'right');
});

test('chest obstruction checks both halves while barrels and glass-covered chests remain accessible',()=>{
    const s=fixture(),p=s.progress,blocks=p.scenes.plains.blocks!;blocks.push(box('other',[7,6,6]));pairChest(p,blocks[1],hit());
    blocks.push({id:'roof',block:'stone',cell:[7,7,6],state:{}});assert.equal(canOpenStorage(p,'plains','box'),false);
    assert.throws(()=>run(s,{type:'inventory',intent:{type:'storage-slot',index:0,button:0},cursor:stack(),expected:p.player.data,workbench:context(s)}),/station-unavailable/);
    blocks[2].block='glass';assert.equal(canOpenStorage(p,'plains','box'),true);
    blocks[0].block='barrel';blocks[2].cell=[6,7,6];blocks[2].block='stone';assert.equal(canOpenStorage(p,'plains','box'),true);
});

for(const kind of ['chest','barrel'])test(kind+' accepts hopper output, extracts from above, respects cooldown and survives a blocked lid',()=>{
    let s=fixture();const blocks=s.progress.scenes.plains.blocks!;blocks[0].block=kind;blocks[0].contents!.data.slots[26]=stack(2);
    blocks.push({id:'roof',block:'stone',cell:[6,7,6],state:{}});
    s.progress.scenes.plains.stations=[{id:'hopper',kind:'hopper',cell:[6,5,6],facing:'east',contents:emptyHopper()}];
    blocks.push(box('target',[7,5,6],kind));
    s=run(s,{type:'processing-tick',ticks:1}).state;assert.equal(s.progress.scenes.plains.stations[0].contents.version,3);
    assert.equal((s.progress.scenes.plains.stations[0].contents as ReturnType<typeof emptyHopper>).data.slots[0]?.count,1);
    s=run(s,{type:'processing-tick',ticks:7}).state;assert.equal(Boolean(s.progress.scenes.plains.blocks![2].contents!.data.slots[0]),false);
    s=run(s,{type:'processing-tick',ticks:1}).state;assert.equal(s.progress.scenes.plains.blocks![2].contents!.data.slots[0]?.count,1);
    assert.equal(s.progress.scenes.plains.blocks![0].contents!.data.slots[26],null);
});

test('hopper visits the first native slot before later merge opportunities and full destinations conserve counts',()=>{
    let s=fixture();s.progress.scenes.plains.blocks![0].contents!.data.slots[1]=stack(2);
    const h=emptyHopper();h.data.slots[0]=stack(2);s.progress.scenes.plains.stations=[{id:'h',kind:'hopper',cell:[6,7,6],facing:'down',contents:h}];
    s=run(s,{type:'processing-tick',ticks:1}).state;assert.equal(s.progress.scenes.plains.blocks![0].contents!.data.slots[0]?.count,1);assert.equal(s.progress.scenes.plains.blocks![0].contents!.data.slots[1]?.count,2);
    s=structuredClone(s);s.progress.scenes.plains.blocks![0].contents!.data.slots.fill(stack(64));s=run(s,{type:'processing-tick',ticks:8}).state;assert.equal((s.progress.scenes.plains.stations[0].contents as ReturnType<typeof emptyHopper>).data.slots[0]?.count,1);
});

test('both physical halves expose all 54 slots to hoppers without duplication; powered hoppers stay locked',()=>{
    let s=fixture();const blocks=s.progress.scenes.plains.blocks!;blocks.push(box('other',[7,6,6]));pairChest(s.progress,blocks[1],hit());blocks[0].contents!.data.slots[26]=stack(1);
    s.progress.scenes.plains.stations=[{id:'h',kind:'hopper',cell:[7,5,6],facing:'down',contents:emptyHopper()}];
    s=run(s,{type:'processing-tick',ticks:1}).state;assert.equal(s.progress.scenes.plains.blocks![0].contents!.data.slots[26],null);assert.equal((s.progress.scenes.plains.stations[0].contents as ReturnType<typeof emptyHopper>).data.slots[0]?.count,1);
    s=structuredClone(s);s.progress.scenes.plains.blocks![0].contents!.data.slots[26]=stack();s.progress.scenes.plains.blocks!.push({id:'lever',block:'lever',cell:[8,5,6],state:{face:'floor',facing:'north',powered:'true'}});
    s=run(s,{type:'processing-tick',ticks:16}).state;assert.equal(s.progress.scenes.plains.blocks![0].contents!.data.slots[26]?.count,1);
});

test('storage quick move, split, drag and hotbar swaps conserve component-bearing groups',()=>{
    let v={...emptyInventory(),storage:emptyStorage().data.slots};const unlocked=fixture().progress.unlocked;
    v.storage[0]={...stack(9),components:{'minecraft:custom_data':{label:'keepsake'}}};
    v=reduceStorageInventory(v,{type:'quick',slot:'storage:0'},unlocked,rules) as typeof v;assert.equal(v.hotbar[8]?.count,9);assert.equal(v.hotbar[8]?.components?.['minecraft:custom_data']!==undefined,true);
    v=reduceStorageInventory(v,{type:'quick',slot:'hotbar:8'},unlocked,rules) as typeof v;
    v=reduceStorageInventory(v,{type:'storage-slot',index:0,button:2},unlocked,rules) as typeof v;assert.equal(v.cursor?.count,5);assert.equal(v.storage[0]?.count,4);
    v=reduceStorageInventory(v,{type:'drag',slots:['storage:1','storage:2'],mode:'left'},unlocked,rules) as typeof v;
    v=reduceStorageInventory(v,{type:'swap',slot:'storage:2',target:'hotbar:1'},unlocked,rules) as typeof v;
    assert.equal([...v.storage,...v.hotbar,...v.backpack,v.cursor].reduce((n,s)=>n+(s?.count??0),0),9);assert.ok(!Object.hasOwn(layout(v),'storage'));
});

test('stale menu snapshots reject hopper races, and breaking one half drops only its owned contents',()=>{
    let s=fixture();const blocks=s.progress.scenes.plains.blocks!;blocks.push(box('other',[7,6,6]));pairChest(s.progress,blocks[1],hit());blocks[0].contents!.data.slots[0]=stack(8);blocks[1].contents!.data.slots[0]=stack(4);const stale=context(s);
    s=run(s,{type:'inventory',intent:{type:'storage-slot',index:27,button:2},cursor:null,expected:s.progress.player.data,workbench:context(s)}).state;
    assert.throws(()=>run(s,{type:'inventory',intent:{type:'storage-slot',index:27,button:0},cursor:null,expected:s.progress.player.data,workbench:stale}),/station-content-conflict/);
    s=run(s,{type:'break-block',scene:'plains',id:'box',expected:s.progress.player.data}).state;
    assert.equal(s.progress.scenes.plains.blocks!.length,1);assert.equal(s.progress.scenes.plains.blocks![0].state.type,'single');assert.equal(s.progress.scenes.plains.blocks![0].contents!.data.slots[0]?.count,4);assert.equal(s.progress.scenes.plains.agriculture!.drops[0].stack.count,4);
});

test('closing returns the cursor to inventory and drops overflow instead of deleting it',()=>{
    let s=fixture();let result=run(s,{type:'inventory',intent:{type:'return-cursor'},cursor:stack(7),expected:s.progress.player.data});assert.equal(result.inventory!.cursor,null);assert.equal(result.state.progress.player.data.hotbar[0]?.count,7);
    s=fixture();s.progress.player.data.backpack.fill(stack(64));s.progress.player.data.hotbar.fill(stack(64));result=run(s,{type:'inventory',intent:{type:'return-cursor'},cursor:stack(7),expected:s.progress.player.data});assert.equal(result.inventory!.cursor,null);assert.equal(result.state.progress.scenes.plains.agriculture!.drops[0].stack.count,7);
});

test('barrel placement follows the nearest vertical view direction',()=>{
    const s=fixture();s.progress.scenes.plains.blocks=[];
    assert.equal(placementBlocks(s.progress,'barrel',{...hit(),cell:[6,0,6],point:[6.5,1,6.5],eye:[6.5,4,6.5]},'up')[0].state.facing,'up');
    assert.equal(placementBlocks(s.progress,'barrel',{...hit(),cell:[6,6,6],point:[6.5,6,6.5],normal:[0,-1,0],eye:[6.5,2,6.5]},'down')[0].state.facing,'down');
});

test('native chest lid curve reaches 90 degrees in ten ticks, reverses smoothly and sound uses one opener transition',()=>{
    const root=new Group(),lid=new Group();root.userData.id='box';lid.name='chest-lid';root.add(lid);const placed=new Group();placed.add(root);
    const view=Object.assign(Object.create(SceneView.prototype),{placed,storageOpen:new Set(['box']),storageAnimation:new Map(),renderer:{domElement:{dataset:{}}}}) as SceneView;
    view.animateStorage(0);for(let i=1;i<=5;i++)view.animateStorage(i*50);assert.ok(Math.abs(lid.rotation.x+(1-.5**3)*Math.PI/2)<1e-8);
    view.storageOpen.clear();for(let i=6;i<=11;i++)view.animateStorage(i*50);assert.ok(Math.abs(lid.rotation.x)<1e-8);
    view.storageOpen.add('box');for(let i=12;i<=22;i++)view.animateStorage(i*50);assert.equal(lid.rotation.x,-Math.PI/2);
    const s=fixture(),sounds:any[]=[],frames:string[][]=[];
    const ui=Object.assign(Object.create(GameInventory.prototype),{permanent:s,station:context(s),generation:'test',storageView:(ids:string[])=>frames.push(ids),sound:(id:string,options:any)=>sounds.push({id,...options})}) as GameInventory;
    ui.storageFeedback(true);ui.storageFeedback(false);ui.storageFeedback(false);assert.deepEqual(sounds.map(s=>s.id),['block.chest.open','block.chest.close']);assert.deepEqual(frames,[['box'],[]]);assert.ok(sounds.every(s=>s.volume===.5&&s.pitch>=.9&&s.pitch<1&&s.valid()));
});

test('native compound chest geometry omits its shared internal side and retains valid quad indices',()=>{
    for(const side of ['west','east'] as const){const compiled=entityCube([side==='west'?0:1,0,1,15,10,14,0,19],'minecraft:entity/chest/normal_'+(side==='west'?'left':'right'),side);assert.equal(compiled.faces.length,5);assert.equal(compiled.positions.length,60);assert.ok(compiled.indices.every(i=>i>=0&&i<20));assert.ok(!compiled.normals.filter((_,i)=>i%3===0).includes(side==='west'?-1:1));}
});

test('two halves of the same container cannot become distinct transfer endpoints',()=>{
    const s=fixture(),blocks=s.progress.scenes.plains.blocks!;blocks.push(box('other',[7,6,6]));pairChest(s.progress,blocks[1],hit());blocks[1].contents!.data.slots[0]=stack();const before=structuredClone(s);
    assert.throws(()=>transferDevices(s.progress,{source:{context:context(s),face:'down',index:0},target:{context:context(s,'other'),face:'up'},count:1},rules),/invalid-transfer-endpoints/);assert.deepEqual(s,before);
});

test('failed storage writes preserve previous saved contents and publish no taken item',async()=>{
    const s=fixture();s.progress.scenes.plains.blocks![0].contents!.data.slots[0]=stack(8);let raw=JSON.stringify(await seal(s,'storage-failure',0));const before=raw;
    const session=new SaveSession({getItem:()=>raw,setItem:()=>{throw Error('write-failed');}},{exclusive:work=>work()},WORLD_REGION);session.rules=rules;await session.refresh();
    await assert.rejects(session.editInventory({type:'storage-slot',index:0,button:0},null,s.progress.player.data,undefined,context(s)));assert.equal(raw,before);assert.equal(session.view.envelope!.state.progress.scenes.plains.blocks![0].contents!.data.slots[0]?.count,8);session.dispose();
});
