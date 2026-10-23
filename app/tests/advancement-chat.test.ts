/** Native announcements are checked against original templates and real successful or rejected save transactions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advancementChat,nativeChatRuns} from '../web/src/ui/advancement-chat.ts';
import {initialState} from '../web/src/domain/state.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal,token} from '../web/src/persistence/codec.ts';
import {advancementText} from '../web/src/i18n/advancements.ts';
import {systemFeedback} from '../web/src/ui/system-feedback.ts';
import type {DomainEvent,State} from '../web/src/domain/types.ts';
import type {TextRun} from '../web/src/ui/item-style.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Native rules preserve actual group and slot validation in the session under test. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Read the visible text of a styled original component. @param {TextRun[]} runs Components. @return {string} Visible line. */
function visible(runs:TextRun[]):string{return runs.map(r=>r.text).join('');}
/** Prepare existing unlocked qualification, independent of actual player acquisition.
 * @return {Promise<object>} Real transaction owner, saved bytes, failure control and displayed announcements.
 */
async function harness(){
    const state=initialState();state.progress.unlocked=['minecraft:oak_log','minecraft:crafting_table','minecraft:cobblestone','minecraft:stone_pickaxe'];
    let raw=JSON.stringify(await seal(state,'native-chat',0)),fail=false,tail:Promise<unknown>=Promise.resolve();
    const s=new SaveSession({getItem:()=>raw,setItem:(_key,value)=>{if(fail)throw Error('write-failed');raw=value;}},{exclusive<T>(work:()=>Promise<T>):Promise<T>{const p=tail.then(work);tail=p.catch(()=>{});return p;}});s.rules=rules;
    const lines:TextRun[][]=[];s.eventListeners.add(events=>{for(const e of events)lines.push(...advancementChat(e,s.view.envelope!.state));});await s.refresh();
    return{s,lines,raw:()=>raw,deny:(value:boolean)=>{fail=value;}};
}
/** Run a normal catalogue operation against the latest observed inventory.
 * @param {SaveSession} s Real session.
 * @param {string} item Original short name.
 * @param {boolean} cursor Whether to acquire to the cursor rather than the hotbar.
 * @return {Promise<import('../web/src/domain/inventory.ts').InventoryState>} Saved receipt.
 */
async function acquire(s:SaveSession,item:string,cursor=false){return s.editInventory({type:'source',item:'minecraft:'+item,mode:cursor?'left':'number',index:0},null,s.view.envelope!.state.progress.player.data);}

test('original task line uses committed username, native green brackets/name and native hover title/description',()=>{
    const state=initialState();state.settings.username='Vincent';state.progress.advancements!.criteria['minecraft:story/mine_stone']=['get_stone'];
    const lines=advancementChat({type:'advancements-completed',advancements:['minecraft:story/mine_stone']},state);
    assert.equal(visible(lines[0]),'Vincent has made the advancement [Stone Age]');
    assert.equal(advancementText('chat.type.advancement.task'),'%s has made the advancement %s');
    assert.deepEqual(lines[0].filter(r=>r.color).map(r=>[r.text,r.color]),[['[','#55FF55'],['Stone Age','#55FF55'],[']','#55FF55']]);
    assert.deepEqual(lines[0].find(r=>r.hover)?.hover,[{text:'Stone Age',color:'#55FF55'},{text:'Mine Stone with your new Pickaxe',color:'#55FF55'}]);
    assert.ok(lines[0].filter(r=>!r.color).every(r=>!r.hover));
    state.settings.locale='zh-CN';assert.equal(visible(advancementChat({type:'advancements-completed',advancements:['minecraft:story/mine_stone']},state)[0]),'Vincent取得了进度[石器时代]');
});
test('unrelated unlock/acquisition, uncompleted IDs and both silent roots produce no announcement',()=>{
    const state=initialState();state.progress.advancements!.criteria['minecraft:story/root']=['crafting_table'];
    for(const event of [{type:'item-unlocked',item:'minecraft:oak_log'},{type:'items-acquired',stacks:[{id:'minecraft:oak_log',count:1}]},{type:'advancements-completed',advancements:['minecraft:story/root','minecraft:husbandry/root','minecraft:story/mine_stone','minecraft:unknown']}] as DomainEvent[])assert.deepEqual(advancementChat(event,state),[]);
    assert.equal(systemFeedback('game.acquired'),'omit');
});
test('native component substitutions preserve translated order, repeated arguments and percent escaping',()=>{
    assert.deepEqual(nativeChatRuns('%2$s / %1$s / %2$s %%',[[{text:'User'}],[{text:'Name',color:'#55FF55'}]]),[{text:'Name',color:'#55FF55'},{text:' / '},{text:'User'},{text:' / '},{text:'Name',color:'#55FF55'},{text:' '},{text:'%'}]);
});
test('real non-advancement pickup and silent root stay silent; cursor waits for actual Inventory and completes once',async()=>{
    const {s,lines}=await harness();await acquire(s,'oak_log');await acquire(s,'crafting_table');assert.deepEqual(lines,[]);
    const receipt=await acquire(s,'cobblestone',true);assert.deepEqual(lines,[]);
    await s.editInventory({type:'backpack-slot',index:0,button:0},receipt.cursor,s.view.envelope!.state.progress.player.data);assert.deepEqual(lines.map(visible),['sireoh has made the advancement [Stone Age]']);
    await acquire(s,'cobblestone');await s.refresh();await s.dispatch({type:'select-scene',scene:'home'});assert.equal(lines.length,1);
});
test('failed save has no announcement; reset fences old transactions and permits one new native completion',async()=>{
    const h=await harness();h.deny(true);const raw=h.raw();await assert.rejects(()=>acquire(h.s,'cobblestone'),/write-failed/);assert.equal(h.raw(),raw);assert.deepEqual(h.lines,[]);
    h.deny(false);await h.s.refresh();await acquire(h.s,'cobblestone');assert.equal(h.lines.length,1);
    await h.s.reset(token(h.s.view.envelope!));assert.equal(h.lines.length,1);await h.s.dispatch({type:'unlock',item:'minecraft:cobblestone'});await acquire(h.s,'cobblestone');assert.equal(h.lines.length,2);
});
test('one multi-slot saved completion emits each announce-enabled node and never the silent ancestor',async()=>{
    const h=await harness(),player=structuredClone(h.s.view.envelope!.state.progress.player.data);player.presets[0]=[{id:'minecraft:crafting_table',count:1},{id:'minecraft:cobblestone',count:1},{id:'minecraft:stone_pickaxe',count:1},...Array(6).fill(null)];
    const state:State=structuredClone(h.s.view.envelope!.state);state.progress.player.data=player;
    let raw=JSON.stringify(await seal(state,'multiple',0));const session=new SaveSession({getItem:()=>raw,setItem:(_key,value)=>{raw=value;}},{exclusive:work=>work()}),lines:TextRun[][]=[];await session.refresh();session.eventListeners.add(events=>{for(const event of events)lines.push(...advancementChat(event,session.view.envelope!.state));});
    await session.editInventory({type:'preset',index:0,mode:'load'},null,session.view.envelope!.state.progress.player.data);assert.deepEqual(lines.map(visible),['sireoh has made the advancement [Stone Age]','sireoh has made the advancement [Getting an Upgrade]']);
});
