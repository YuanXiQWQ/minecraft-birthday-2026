/** Farming-root completion follows durable descendants and the existing coordinated save migration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {BIRTHDAY_ADVANCEMENT,HUSBANDRY_ROOT,advancementDone,emptyAdvancements,syncHusbandryRoot} from '../web/src/domain/advancements.ts';
import {seal,token} from '../web/src/persistence/codec.ts';
import {SaveSession} from '../web/src/persistence/session.ts';

test('new saves and unrelated story completions leave the farming root incomplete; a completed farming child grants it once',()=>{
    const facts=emptyAdvancements();assert.equal(syncHusbandryRoot(facts),false);assert.equal(advancementDone(facts,HUSBANDRY_ROOT),false);
    facts.criteria[BIRTHDAY_ADVANCEMENT]=['cake_on_table'];facts.criteria['minecraft:story/smelt_iron']=['iron'];
    assert.equal(syncHusbandryRoot(facts),false);
    facts.criteria['minecraft:husbandry/plant_seed']=['wheat'];const before=structuredClone(facts.criteria);
    assert.equal(syncHusbandryRoot(facts),true);assert.equal(advancementDone(facts,HUSBANDRY_ROOT),true);
    assert.deepEqual(facts.criteria,{...before,[HUSBANDRY_ROOT]:['consumed_item']});assert.equal(syncHusbandryRoot(facts),false);
});

test('existing completed farming child silently unlocks its root under the shared lock; failure, refresh and reset preserve their contracts',async()=>{
    const state=initialState();state.progress.advancements!.criteria['minecraft:husbandry/plant_seed']=['wheat'];state.progress.advancements!.criteria[BIRTHDAY_ADVANCEMENT]=['cake_on_table'];
    const original=JSON.stringify(await seal(state,'farming-root',7));let raw=original,deny=true,writes=0,tail:Promise<unknown>=Promise.resolve();
    const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{if(deny)throw Error('write-failed');raw=value;writes++;}};
    const locks={exclusive<T>(work:()=>Promise<T>):Promise<T>{const result=tail.then(work);tail=result.catch(()=>{});return result;}};
    const a=new SaveSession(storage,locks),b=new SaveSession(storage,locks),events:unknown[]=[];a.eventListeners.add(items=>events.push(...items));b.eventListeners.add(items=>events.push(...items));
    try{
        await a.refresh();assert.equal(raw,original);assert.equal(a.view.writable,false);
        deny=false;await Promise.all([a.refresh(),b.refresh()]);assert.equal(writes,1);assert.equal(a.view.envelope!.revision,8);assert.equal(b.view.envelope!.revision,8);assert.equal(a.view.envelope!.generation,'farming-root');
        const stored=JSON.parse(raw).state;assert.equal(advancementDone(stored.progress.advancements,HUSBANDRY_ROOT),true);delete stored.progress.advancements.criteria[HUSBANDRY_ROOT];assert.deepEqual(stored,state);assert.deepEqual(events,[]);
        await a.refresh();await b.refresh();assert.equal(writes,1);assert.deepEqual(events,[]);
        await a.reset(token(a.view.envelope!));assert.equal(advancementDone(a.view.envelope!.state.progress.advancements,HUSBANDRY_ROOT),false);assert.equal(advancementDone(a.view.envelope!.state.progress.advancements,'minecraft:husbandry/plant_seed'),false);
    }finally{a.dispose();b.dispose();}
});
