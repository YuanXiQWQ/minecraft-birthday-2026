/** Ekac identity migration preserves complete saves, original checksums and atomic multi-session upgrades. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition} from '../web/src/domain/state.ts';
import {ODD_CAKE,ODD_BLOCK,ODD_ADVANCEMENT} from '../web/src/domain/easter-egg.ts';
import {agriculture} from '../web/src/domain/soil-state.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {emptyStorage} from '../web/src/domain/storage.ts';
import {decode,seal,checksum} from '../web/src/persistence/codec.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {parseCommand,completeCommand} from '../web/src/domain/console.ts';
import type {State} from '../web/src/domain/types.ts';

/** Persisted item/recipe identity used by released cake saves. */
const LEGACY_ITEM='jerrys_farm:upside_down_cake';
/** Persisted short block name used by placed cake saves. */
const LEGACY_BLOCK='upside_down_cake';

/** Populate all valid cake carriers plus opaque custom data and a completed challenge.
 * @return {State} Valid canonical save with observable quantities and placement state.
 */
function fixture():State {
    const state=initialState(),p=state.progress,player=p.player.data;
    p.unlocked.push(ODD_CAKE,'minecraft:stone');p.oddCakeTableTried=true;
    player.selected=4;player.hotbar[4]={id:ODD_CAKE,count:1};player.backpack[26]={id:ODD_CAKE,count:1};
    player.equipment.offhand={id:ODD_CAKE,count:1};
    player.presets[3]=Array(9).fill(null);player.presets[3]![8]={id:ODD_CAKE,count:1};
    player.backpack[0]={id:'minecraft:stone',count:23,components:{'minecraft:custom_data':{id:LEGACY_ITEM,block:LEGACY_BLOCK,nested:[LEGACY_ITEM]}}};
    p.recipeBook.data.known.push(ODD_CAKE);p.recipeBook.data.unseen.push(ODD_CAKE);
    p.advancements!.criteria[ODD_ADVANCEMENT]=['cake_crafted'];
    p.scenes.plains.stations.push({id:'bench',kind:'crafting_table',cell:[0,0,0],facing:'north',contents:{version:1,data:{grid:[{id:ODD_CAKE,count:1},...Array(8).fill(null)]}}});
    for(const name of ['cave','farm','home'] as const){
        const hopper=emptyHopper();hopper.data.slots[4]={id:ODD_CAKE,count:1};
        const furnace=emptyFurnace();furnace.data.input={id:ODD_CAKE,count:1};
        p.scenes[name].stations.push({id:'hopper-'+name,kind:'hopper',cell:[0,0,0],facing:'down',contents:hopper},{id:'furnace-'+name,kind:name==='home'?'blast_furnace':'furnace',cell:[1,0,0],facing:'north',contents:furnace});
        const contents=emptyStorage();contents.data.slots[26]={id:ODD_CAKE,count:1};
        p.scenes[name].blocks=[{id:'cake-'+name,block:ODD_BLOCK,cell:[3,0,0],state:{bites:'4'}},{id:'storage-'+name,block:name==='home'?'barrel':'chest',cell:[4,0,0],state:{facing:'north'},contents}];
        const ground=agriculture(p,name);ground.serial=2;ground.drops.push({id:'cake-drop-'+name,cell:[5,0,0],stack:{id:ODD_CAKE,count:1}});
    }
    return state;
}

/** Encode a checksummed legacy save independently of the current item validator.
 * @param {State} state Canonical expected state.
 * @param {Function} alter Optional corruption applied before checksumming.
 * @return {Promise<string>} Original stored bytes with legacy cake identities.
 */
async function legacySave(state=fixture(),alter?:(state:State)=>void):Promise<string> {
    const sealed=await seal(state,'ekac-upgrade',17),{checksum:_,...body}=JSON.parse(JSON.stringify(sealed).replaceAll(ODD_CAKE,LEGACY_ITEM).replaceAll('"block":"'+ODD_BLOCK+'"','"block":"'+LEGACY_BLOCK+'"'));
    alter?.(body.state);
    return JSON.stringify({...body,checksum:await checksum(body)});
}

test('legacy inventory, presets, containers, grids, drops, recipes and placed bites migrate losslessly',async()=>{
    const expected=fixture(),raw=await legacySave(expected),decoded=await decode(raw);
    assert.equal(decoded.itemMigration,true);assert.equal(decoded.migrated,true);
    assert.deepEqual(decoded.envelope.state,expected);assert.equal(decoded.envelope.generation,'ekac-upgrade');assert.equal(decoded.envelope.revision,17);
    assert.equal(JSON.parse(raw).state.progress.player.data.hotbar[4].id,LEGACY_ITEM);
    assert.equal(decoded.envelope.state.progress.player.data.backpack[0]!.components!['minecraft:custom_data']!==undefined,true);
    const again=await decode(JSON.stringify(decoded.envelope));assert.equal(again.itemMigration,false);assert.equal(again.migrated,false);assert.deepEqual(again.envelope,decoded.envelope);
});

test('new commands and completion expose only the canonical ekac identity',()=>{
    assert.equal(ODD_CAKE,'jerrys_farm:ekac');assert.equal(ODD_BLOCK,'ekac');
    assert.deepEqual(completeCommand('/give @s jerrys_farm:').values,[ODD_CAKE]);
    const result=transition(initialState(),{type:'console',source:'/give @s jerrys_farm:ekac'});
    assert.deepEqual(result.state.progress.player.data.hotbar[0],{id:ODD_CAKE,count:1});
    assert.ok('error'in parseCommand('/give @s '+LEGACY_ITEM));
});

test('migration checks original integrity and never repairs invalid stack counts or unknown items',async()=>{
    const raw=await legacySave(),tampered=JSON.parse(raw);tampered.state.progress.player.data.hotbar[4].count=2;
    await assert.rejects(decode(JSON.stringify(tampered)),/checksum-mismatch/);
    await assert.rejects(decode(await legacySave(fixture(),s=>{s.progress.player.data.hotbar[4]!.count=2;})),/invalid-temporary-stack/);
    await assert.rejects(decode(await legacySave(fixture(),s=>{s.progress.player.data.hotbar[4]!.id='jerrys_farm:unknown';})),/invalid-temporary-stack/);
});

test('older supported envelopes can migrate cake identities before their state validation',async()=>{
    const raw=JSON.parse(await legacySave());raw.contentVersion='p9-environment-1';
    const {checksum:_,...body}=raw,decoded=await decode(JSON.stringify({...body,checksum:await checksum(body)}));
    assert.equal(decoded.itemMigration,true);assert.deepEqual(decoded.envelope.state,fixture());
});

test('concurrent refreshes persist a single migration without replaying challenge or acquisition events',async()=>{
    let raw=await legacySave(),writes=0,tail=Promise.resolve<unknown>(null);const events:unknown[]=[];
    const storage={getItem:()=>raw,/** Store a complete migrated envelope. @param {string} _key Storage identity. @param {string} value Saved bytes. */setItem:(_key:string,value:string)=>{writes++;raw=value;}},
        locks={/** Serialize shared save upgrades. @param {Function} work Transaction. @return {Promise<T>} Committed result. */exclusive<T>(work:()=>Promise<T>){const next=tail.then(work);tail=next.catch(()=>{});return next;}},a=new SaveSession(storage,locks),b=new SaveSession(storage,locks);
    a.eventListeners.add(value=>events.push(...value));b.eventListeners.add(value=>events.push(...value));
    await Promise.all([a.refresh(),b.refresh()]);assert.equal(writes,1);assert.deepEqual(events,[]);
    assert.equal(a.view.envelope!.revision,18);assert.deepEqual(a.view.envelope!.state,fixture());assert.deepEqual(a.view.envelope,b.view.envelope);
    await a.refresh();await b.refresh();assert.equal(writes,1);assert.equal((await decode(raw)).itemMigration,false);
    a.dispose();b.dispose();
});

test('write failures preserve the original legacy save and a retry upgrades it once',async()=>{
    let raw=await legacySave(),deny=true;const original=raw;
    const session=new SaveSession({getItem:()=>raw,/** Commit only when storage is available. @param {string} _key Save key. @param {string} value Serialized save. */setItem:(_key,value)=>{if(deny)throw Error('write-failed');raw=value;}},{exclusive:async work=>work()});
    await session.refresh();assert.equal(session.view.writable,false);assert.equal(raw,original);
    deny=false;await session.refresh();assert.equal(session.view.writable,true);assert.equal(session.view.envelope!.revision,18);assert.deepEqual(session.view.envelope!.state,fixture());
    session.dispose();
});

test('read-only loading projects migrated items without overwriting the original bytes',async()=>{
    const raw=await legacySave();let writes=0;
    const session=new SaveSession({getItem:()=>raw,/** Count unexpected writes without changing the legacy bytes. */setItem:()=>{writes++;}},null);
    await session.refresh();assert.equal(writes,0);assert.equal(session.view.writable,false);assert.equal(session.view.migrated,true);assert.deepEqual(session.view.envelope!.state,fixture());session.dispose();
});

test('uncollected legacy drops migrate without granting acquisitions or recipes',async()=>{
    const state=initialState(),ground=agriculture(state.progress);ground.serial=1;ground.drops.push({id:'uncollected',cell:[0,0,0],stack:{id:ODD_CAKE,count:1}});
    const decoded=await decode(await legacySave(state));assert.equal(decoded.itemMigration,true);assert.deepEqual(decoded.envelope.state,state);assert.deepEqual(decoded.envelope.state.progress.unlocked,[]);
});

test('legacy strings inside custom data alone do not trigger migration or alter user data',async()=>{
    const state=initialState();state.progress.unlocked.push('minecraft:stone');state.progress.player.data.hotbar[0]={id:'minecraft:stone',count:1,components:{'minecraft:custom_data':{id:LEGACY_ITEM,block:LEGACY_BLOCK}}};
    const decoded=await decode(JSON.stringify(await seal(state,'opaque-data',1)));assert.equal(decoded.itemMigration,false);assert.equal(decoded.migrated,false);assert.deepEqual(decoded.envelope.state,state);
});
