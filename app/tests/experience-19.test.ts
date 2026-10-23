/** Focused nineteen-requirement regressions use production reducers, matrices and SaveSession, not copied game algorithms. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group, Vector3} from 'three';
import {initialState, transition} from '../web/src/domain/state.ts';
import {emptyInventory} from '../web/src/domain/inventory.ts';
import {takeCraft} from '../web/src/domain/crafting.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal, decode, checksum, token} from '../web/src/persistence/codec.ts';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {InventoryInput} from '../web/src/ui/inventory-input.ts';
import {PersonalCursor} from '../web/src/domain/personal-menu.ts';
import {PlayerPreview} from '../web/src/ui/player-preview.ts';
import {itemColor} from '../web/src/ui/item-style.ts';
import {guiLight} from '../web/src/ui/icon-light.ts';
import {correctTool} from '../web/src/rules/process.ts';
import {rolledDrops} from '../web/src/rules/harvest.ts';
import type {State} from '../web/src/domain/types.ts';
import type {Rules, Stack} from '../web/src/rules/types.ts';
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;
/** Create one finite native group. @param {string} id Short native identity. @param {number} count Real amount. @return {Stack} Actual group. */
function stack(id: string, count = 1): Stack {return {id: 'minecraft:' + id, count};}
/** Build only explicit test acquisition facts. @param {string[]} ids Previously acquired identities. @return {State} Valid initial facts. */
function facts(...ids: string[]): State {let s = initialState(); for (const id of ids) s = transition(s, {type:'unlock',item:stack(id).id}).state; return structuredClone(s);}
/** Share real storage and a serialized lock among actual sessions. @param {State} state Valid fixture. @return {Promise<object>} Sessions and failure switch. */
async function sessions(state: State) {
    let raw = JSON.stringify(await seal(state, 'nineteen', 0)), fail = false, tail: Promise<unknown> = Promise.resolve();
    const storage = {getItem: () => raw, setItem: (_key: string, value: string) => {if (fail) throw Error('denied'); raw = value;}}, locks = {exclusive<T>(work: () => Promise<T>): Promise<T> {const p = tail.then(work); tail = p.catch(() => {}); return p;}};
    const a = new SaveSession(storage, locks, {allows: () => true}), b = new SaveSession(storage, locks, {allows: () => true}); a.rules = b.rules = rules;
    await a.refresh(); await b.refresh();
    return {a,b,raw:() => raw,deny:(value:boolean) => {fail=value;}};
}
for (const place of ['never-unlocked', 'unlocked-only', 'backpack', 'unselected', 'offhand', 'wrong', 'wood', 'stone'] as const) test('stone loot uses actual selected main hand: ' + place, () => {
    const s = facts(...(place === 'never-unlocked' ? [] : ['wooden_pickaxe', 'stone_pickaxe', 'stick'])); s.progress.scene = 'cave';
    if (place === 'backpack') s.progress.player.data.backpack[0] = stack('wooden_pickaxe');
    if (place === 'unselected') s.progress.player.data.hotbar[1] = stack('wooden_pickaxe');
    if (place === 'offhand') s.progress.player.data.equipment.offhand = stack('wooden_pickaxe');
    if (place === 'wrong') s.progress.player.data.hotbar[0] = stack('stick');
    if (['wood','stone','gold'].includes(place)) s.progress.player.data.hotbar[0] = stack(place === 'wood' ? 'wooden_pickaxe' : place === 'stone' ? 'stone_pickaxe' : 'golden_pickaxe');
    const r = transition(s,{type:'harvest-node',scene:'cave',node:'stone:0',visit:0,expected:s.progress.player.data},undefined,rules), allowed = ['wood','stone','gold'].includes(place);
    assert.equal(r.state.progress.unlocked.includes(stack('cobblestone').id),allowed);
    assert.equal([...r.state.progress.player.data.hotbar,...r.state.progress.player.data.backpack].reduce((n,s) => n + (s?.id===stack('cobblestone').id?s.count:0),0),allowed?1:0);
    assert.equal(r.events.some(e=>e.type==='items-acquired'),allowed);
});
for (const [tool,allowed] of [['wooden_pickaxe',false],['stone_pickaxe',true]] as const) test('iron loot tier is not tool speed: ' + tool, () => {
    const s = facts(tool); s.progress.scene='cave'; s.progress.player.data.hotbar[0]=stack(tool);
    const r=transition(s,{type:'harvest-node',scene:'cave',node:'iron_ore:0',visit:0,expected:s.progress.player.data},undefined,rules);
    assert.equal(r.state.progress.unlocked.includes(stack('raw_iron').id),allowed);
});
test('full bag settles effective log acquisition without depositing overflow or retaining the resource',()=>{
    const s=facts('oak_log');s.progress.player.data.backpack=Array.from({length:27},()=>stack('oak_log',64));s.progress.player.data.hotbar=Array.from({length:9},()=>stack('oak_log',64));const before=structuredClone(s.progress.player.data);
    const r=transition(s,{type:'harvest-node',scene:'plains',node:'oak_log:0',visit:0,expected:s.progress.player.data},undefined,rules),event=r.events.find(e=>e.type==='items-acquired')!;
    assert.deepEqual(r.state.progress.player.data,before);assert.deepEqual(event.stacks,[stack('oak_log')]);assert.deepEqual(event.deposited,[]);assert.deepEqual(event.overflow,[stack('oak_log')]);assert.ok(r.state.progress.world.visits.plains.removed.includes('oak_log:0'));assert.equal(r.events.some(e=>e.type==='item-unlocked'),false);
});

test('native mature wheat bonus uses three Bernoulli trials, not uniform one-item loot',()=>{
    const rich=rolledDrops('minecraft:wheat',null,rules,()=>0,7), lean=rolledDrops('minecraft:wheat',null,rules,()=>.999,7);
    assert.equal(rich.find(s=>s.id===stack('wheat').id)?.count,1); assert.ok(rich.find(s=>s.id===stack('wheat_seeds').id)!.count>lean.find(s=>s.id===stack('wheat_seeds').id)!.count);
});
test('crafting shift consumes only finite logs and does not refill from permanent facts',()=>{
    const v={...emptyInventory(),crafting:[stack('oak_log',3),null,null,null]}, r=takeCraft(v,{mode:'shift'},[stack('oak_log').id],rules);
    assert.equal(r.batches,3); assert.ok(r.inventory.crafting!.every(s=>s===null)); assert.equal(r.inventory.hotbar.reduce((n,s)=>n+(s?.count??0),0),12); assert.equal(v.crafting[0]!.count,3);
});
/** Create one workbench with real remaining inputs. @return {State} Persistable fixture. */
function bench(): State {const s=facts('crafting_table','oak_log'); s.progress.scenes.plains.stations.push({id:'table',kind:'crafting_table',cell:[2,0,0],facing:'south',contents:{version:1,data:{grid:[stack('oak_log',5),...Array(8).fill(null)]}}}); return s;}
test('real sessions atomically return and clear workbench once, including competing closes and refresh',async()=>{
    const h=await sessions(bench()); const commands=await Promise.allSettled([h.a.dispatch({type:'close-workbench',scene:'plains',id:'table'}),h.b.dispatch({type:'close-workbench',scene:'plains',id:'table'})]); assert.ok(commands.every(r=>r.status==='fulfilled'));
    const p=(await decode(h.raw())).envelope.state.progress; assert.equal(p.player.data.backpack[0]?.count,5); assert.deepEqual((p.scenes.plains.stations[0].contents as any).data.grid,Array(9).fill(null));
});
test('full return rejects without partial movement; freeing a slot permits retry',async()=>{
    const s=bench(); s.progress.player.data.backpack=Array.from({length:27},()=>stack('oak_log',64)); s.progress.player.data.hotbar=Array.from({length:9},()=>stack('oak_log',64)); const h=await sessions(s), before=h.raw();
    await assert.rejects(h.a.dispatch({type:'close-workbench',scene:'plains',id:'table'}),/workbench-return-full/); assert.equal(h.raw(),before); assert.equal(h.a.view.writable,true);
    await h.a.editInventory({type:'drop',slot:'backpack:0',all:true},null,h.a.view.envelope!.state.progress.player.data);
    await h.a.dispatch({type:'close-workbench',scene:'plains',id:'table'}); assert.equal(h.a.view.envelope!.state.progress.player.data.backpack[0]?.count,5);
});
test('production GameInventory close waits for real return and a write failure leaves visible recoverable station',async()=>{
    const h=await sessions(bench()), u=Object.create(GameInventory.prototype) as GameInventory, modal={open:true,dataset:{},close(){this.open=false;}};
    Object.assign(u,{modal,station:{scene:'plains',id:'table',expected:h.a.view.envelope!.state.progress.scenes.plains.stations[0].contents},value:{...emptyInventory(),workbench:[stack('oak_log',5),...Array(8).fill(null)]},personal:new PersonalCursor(),generation:'nineteen',queue:Promise.resolve(),closing:null,clearPersonal(){this.personal.close();},refreshPreview(){},gate(){},draw(){},text:(k:string)=>k,returnWorkbench:(scene:'plains',id:string)=>h.a.dispatch({type:'close-workbench',scene,id})});
    h.deny(true); assert.equal(await u.close(),false); assert.equal(modal.open,true); assert.equal(u.closing,null); assert.equal(u.notice,'inventory.returnFull');
    h.deny(false); await h.a.refresh(); assert.equal(await u.close(),true); assert.equal(modal.open,false); assert.equal(h.a.view.envelope!.state.progress.player.data.backpack[0]?.count,5);
});
test('username migration preserves facts and reset keeps the latest valid identity',async()=>{
    const s=facts('oak_log'); delete s.settings.username;
    const old:any=structuredClone(await seal(s,'legacy',4)); old.contentVersion='p8-inventory-1'; const {checksum:_,...body}=old; old.checksum=await checksum(body);
    const d=await decode(JSON.stringify(old)); assert.equal(d.envelope.state.settings.username,'sireoh'); assert.deepEqual(d.envelope.state.progress,s.progress);
    const h=await sessions(d.envelope.state); await h.a.dispatch({type:'settings',patch:{username:'Vincent_26'}}); await h.a.reset(token(h.a.view.envelope!),h.a.serial); assert.equal(h.a.view.envelope!.state.settings.username,'Vincent_26');
    await assert.rejects(h.a.dispatch({type:'settings',patch:{username:'<script>'}})); assert.equal(h.a.view.writable,true);
});
for (const [x,y] of [[100,0],[-100,0],[0,100],[0,-100],[100,100],[-100,-100],[-100,100],[100,-100]]) test('actual preview hierarchy has a non-cancelled final head vector: '+x+','+y,()=>{
    const p=Object.create(PlayerPreview.prototype) as PlayerPreview; const tilt=new Group(),body=new Group(),native=new Group(),head=new Group();tilt.add(body);body.add(native);native.scale.set(.9375,-.9375,-.9375);native.add(head);
    Object.assign(p,{tilt,body,native,parts:new Map([['head',head]]),armor:new Group(),camera:{position:new Vector3(),updateProjectionMatrix(){}},items:{update(){},animations:new Map()},renderer:{domElement:{width:49,height:70,style:{}},setPixelRatio(){},setSize(){},clear(){},render(){},info:{memory:{},render:{}}},pointer:{x:0,y:0},hands:[],renders:0});
    p.draw('personal',50.5+x,43+y,1); tilt.updateMatrixWorld(true); const vector=new Vector3(0,0,-1).transformDirection(head.matrixWorld);
    assert.ok(vector.z>0); if(x) assert.equal(Math.sign(vector.x),Math.sign(x)); if(y) assert.ok(Math.abs(vector.y)>.01);
    const before=vector.toArray();p.draw('personal',50.5+x,43+y,1);tilt.updateMatrixWorld(true);assert.deepEqual(new Vector3(0,0,-1).transformDirection(head.matrixWorld).toArray(),before);
});
test('Epic name override does not mutate cake stack identity and native icon lighting preserves directional contrast',()=>{
    const item=stack('cake'),before=structuredClone(item);assert.equal(itemColor(item.id),'#FF55FF');assert.equal(itemColor(stack('oak_log').id),'#FFFFFF');assert.deepEqual(item,before);
    const light=[[1,0,0],[0,1,0],[0,0,1],[-1,0,0]].map(n=>guiLight(new Vector3(...n as [number,number,number])));assert.ok(light.every(n=>n>=.4&&n<=1));assert.ok(new Set(light).size>1);
});


test('same-version full registry gold pickaxe cannot mine iron despite its high native speed',()=>{
    const catalog=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/catalog.json',import.meta.url),'utf8'));
    const evidence={...rules,items:catalog.items,blockTags:catalog.blockTags} as Rules;
    assert.equal(catalog.items['minecraft:golden_pickaxe'].tool.speed,12);
    assert.equal(correctTool('minecraft:golden_pickaxe','minecraft:iron_ore',evidence),false);
});


test('viewport-local backdrop discard excludes native container, tabs, GUI border and visible tooltip',()=>{
    /** Supply a native layout rectangle without manufacturing a player event. @return {object} Visible test surface. */
    const area=(left:number,top:number,width:number,height:number)=>({hidden:false,getBoundingClientRect:()=>({left,top,right:left+width,bottom:top+height,width,height})});
    const modal={querySelectorAll:()=>[area(300,200,352,332),area(300,144,352,64)]}, tooltip=area(660,230,120,40);
    const input=Object.create(InventoryInput.prototype) as InventoryInput;Object.assign(input,{ui:{modal,tooltip}});
    for(const point of [[300,200],[301,201],[650,530],[640,160],[670,240]]) assert.equal(input.isOutside(...point as [number,number]),false);
    assert.equal(input.isOutside(100,400),true);assert.equal(input.isOutside(800,400),true);
});
