/** Authored cake transactions, immutable vanilla recipes, inverted cut faces and legacy-save compatibility. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {ODD_CAKE,ODD_BLOCK,ODD_ADVANCEMENT,withEasterEgg} from '../web/src/domain/easter-egg.ts';
import {ADVANCEMENTS,advancementDone,visibleAdvancements} from '../web/src/domain/advancements.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {placementBlocks,placedDrops} from '../web/src/domain/placed-blocks.ts';
import {blockSounds} from '../web/src/domain/block-sounds.ts';
import {nativeShapes} from '../web/src/domain/block-shapes.ts';
import {findCrafting} from '../web/src/rules/matcher.ts';
import {compileModel,resolveModel} from '../web/src/render/model-format.ts';
import {iconGeometry,iconModel,iconParts} from '../web/src/ui/icon-model.ts';
import {definitionTransform} from '../web/src/ui/player-items.ts';
import {Vector3} from 'three';
import {initialBook,discover,bookApplicable} from '../web/src/domain/recipe-book.ts';
import {ODD_RECIPE} from '../web/src/domain/easter-egg.ts';
import {assetPath} from '../web/src/render/asset-path.ts';
import {resources} from '../tools/resources.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {itemName,matchesItem} from '../web/src/i18n/items.ts';
import {advancementText} from '../web/src/i18n/advancements.ts';
import {advancementChat} from '../web/src/ui/advancement-chat.ts';
import {scheduleOddCakeRemark,bindOddCakeRemarks} from '../web/src/ui/odd-cake-chat.ts';
import {localeDictionary,translate} from '../web/src/i18n/index.ts';
import type {Rules} from '../web/src/rules/types.ts';
import type {State,Command} from '../web/src/domain/types.ts';

/** Runtime rules overlay leaves the generated native recipe census unchanged. */
const originals=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules,rules=withEasterEgg(originals);
/** Complete, finite ingredients in the authored orientation. */
const grid=['wheat','wheat','wheat','sugar','egg','sugar','milk_bucket','milk_bucket','milk_bucket'].map(id=>({id:'minecraft:'+id,count:1}));

test('cake item and advancement artwork use the inverted original generated sprite in every item context',()=>{
    const files=resources(),docs=new Map([...files].filter(([p])=>p.endsWith('.json')).map(([p,b])=>[p,JSON.parse(Buffer.from(b).toString())]));
    const definition=docs.get(assetPath('items',ODD_CAKE));
    for(const context of ['gui','firstperson_righthand','thirdperson_righthand']){
        const [part]=iconParts(definition.model,'10-24',[],context),model=iconModel(part.model,id=>docs.get(assetPath('models',id)));
        assert.equal(part.model,'minecraft:item/cake');assert.equal(model.builtin,'minecraft:builtin/generated');assert.equal(model.textures.layer0,'minecraft:item/cake');
        const matrix=definitionTransform(part.transforms);
        assert.deepEqual(new Vector3(-.5,.5,0).applyMatrix4(matrix).toArray(),[.5,-.5,0]);
        assert.equal(ADVANCEMENTS[ODD_ADVANCEMENT].display.icon.id,ODD_CAKE);
    }
});

test('egg discovery exposes the companion crafting recipe in Misc before crafting and upgrades saved cake books silently',async()=>{
    const book=initialBook();assert.ok(!book.data.known.includes(ODD_CAKE));
    const added=discover(book,['minecraft:egg']);assert.ok(added.includes('minecraft:cake'));assert.ok(added.includes(ODD_CAKE));
    assert.equal(ODD_RECIPE.category,'misc');assert.ok(bookApplicable(ODD_RECIPE,'crafting',3));assert.equal(bookApplicable(ODD_RECIPE,'crafting',2),false);
    assert.deepEqual(discover(book,['minecraft:egg']),[]);
    const old=initialState();old.progress.recipeBook.data.known.push('minecraft:cake');
    let raw=JSON.stringify(await seal(old,'old-cake-book',4)),writes=0;const events:any[]=[];
    const session=new SaveSession({getItem:()=>raw,setItem:(_key,value)=>{raw=value;writes++;}},{exclusive:async work=>work()},WORLD_REGION);
    session.eventListeners.add(es=>events.push(...es));await session.refresh();
    const updated=session.view.envelope!.state;
    assert.ok(updated.progress.recipeBook.data.known.includes(ODD_CAKE));assert.equal(updated.progress.recipeBook.data.unseen.includes(ODD_CAKE),false);
    assert.deepEqual(updated.progress.player,old.progress.player);assert.deepEqual(updated.progress.advancements,old.progress.advancements);assert.equal(events.length,0);assert.equal(writes,1);
    await session.refresh();assert.equal(writes,1);
});
/** Build a valid fixture with actual workbench inputs.
 * @return {State} Independent durable facts.
 */
function ready():State{const s=initialState();s.progress.unlocked=[...new Set(['minecraft:crafting_table','minecraft:bucket',...grid.map(s=>s.id)])];s.progress.scenes.plains.stations.push({id:'odd-bench',kind:'crafting_table',cell:[3,0,-2],facing:'north',contents:{version:1,data:{grid:structuredClone(grid)}}});return s;}
/** Construct a fresh workbench receipt request.
 * @param {State} s Observed state.
 * @return {Command} Atomic craft operation.
 */
function craft(s:State):Command{return {type:'craft-take',expected:s.progress.player.data,cursor:null,crafting:Array(4).fill(null),take:{mode:'shift'},workbench:{scene:'plains',id:'odd-bench',expected:structuredClone(s.progress.scenes.plains.stations.find(s=>s.id==='odd-bench')!.contents)}};}

test('outer recipe rows exchange exactly, three buckets remain and only successful crafting completes the visible challenge',async()=>{
    assert.equal(findCrafting(grid,3,rules)?.result.id,ODD_CAKE);
    assert.equal(findCrafting([...grid.slice(6),...grid.slice(3,6),...grid.slice(0,3)],3,rules)?.result.id,'minecraft:cake');
    assert.equal(findCrafting(grid.slice(0,4),2,rules),null);
    const s=ready();validateState(s);assert.ok(visibleAdvancements().has(ODD_ADVANCEMENT));assert.equal(advancementDone(s.progress.advancements,ODD_ADVANCEMENT),false);
    const result=transition(s,craft(s),WORLD_REGION,rules),p=result.state.progress;
    assert.deepEqual(p.player.data.hotbar.find(s=>s?.id===ODD_CAKE),{id:ODD_CAKE,count:1});
    const bench=p.scenes.plains.stations.find(s=>s.id==='odd-bench')!.contents as any;
    assert.deepEqual(bench.data.grid,[null,null,null,null,null,null,...Array.from({length:3},()=>({id:'minecraft:bucket',count:1}))]);
    assert.ok(advancementDone(p.advancements,ODD_ADVANCEMENT));assert.equal(p.cakePlacement,null);
    assert.ok(!result.events.some(e=>e.type==='cake-crafted'||e.type==='cake-placed'));
    assert.ok(p.recipeBook.data.known.includes(ODD_CAKE));
    const event=result.events.find(e=>e.type==='advancements-completed')!;
    assert.ok(event.advancements?.includes(ODD_ADVANCEMENT));assert.ok(advancementChat(event,result.state).some(r=>r.some(t=>t.color==='#AA00AA')));
    const restored=(await decode(JSON.stringify(await seal(result.state,'odd-cake',1)))).envelope.state;
    assert.ok(advancementDone(restored.progress.advancements,ODD_ADVANCEMENT));
    const acquired=initialState();acquired.progress.unlocked.push(ODD_CAKE);acquired.progress.player.data.hotbar[0]={id:ODD_CAKE,count:1};
    const synced=transition(acquired,{type:'inventory',expected:acquired.progress.player.data,cursor:null,intent:{type:'select',index:0}},WORLD_REGION,rules);
    assert.ok(!advancementDone(synced.state.progress.advancements,ODD_ADVANCEMENT));
    assert.equal(ADVANCEMENTS[ODD_ADVANCEMENT].display.frame,'challenge');
    assert.equal(itemName(ODD_CAKE),'ǝʞɐɔ');assert.equal(itemName(ODD_CAKE,'zh-CN'),'糕蛋');assert.ok(matchesItem(ODD_CAKE,'糕蛋'));
    assert.equal(advancementText('advancements.oddCake.title','zh-CN'),'好像...不太对劲？');
    assert.equal(advancementText('advancements.oddCake.description','zh-CN'),'不小心把蛋糕搞砸了。');
});

test('ground placement consumes one cake, table placement rejects atomically and every bite persists without birthday events',async()=>{
    let s=initialState();s.progress.scene='home';s.progress.unlocked.push(ODD_CAKE);s.progress.player.data.hotbar[0]={id:ODD_CAKE,count:1};
    const hit={cell:[4,-1,2],normal:[0,1,0],point:[4.5,0,2.5],eye:[4.5,1.62,4.5],yaw:0} as const;
    const blocks=placementBlocks(s.progress,ODD_BLOCK,structuredClone(hit) as any,'odd-ground');assert.equal(blocks[0].state.bites,'0');
    s=transition(s,{type:'place-block',scene:'home',item:ODD_BLOCK,hit:structuredClone(hit) as any,id:'odd-ground',expected:s.progress.player.data},WORLD_REGION,rules).state;
    assert.equal(s.progress.player.data.hotbar[0],null);assert.equal(s.progress.cakePlacement,null);
    assert.throws(()=>placementBlocks(s.progress,ODD_BLOCK,{cell:[0,1,-3],normal:[0,1,0],point:[.5,2,-2.5],eye:[.5,2,0],yaw:0},'odd-table'),/unsupported-placement/);
    const held=structuredClone(s);held.progress.player.data.hotbar[0]={id:ODD_CAKE,count:1};held.progress.unlocked.push('minecraft:cake');
    assert.throws(()=>transition(held,{type:'record-cake-placement',scene:'home',table:'birthday-table'},WORLD_REGION,rules),/cake-not-held/);
    assert.deepEqual(blockSounds('cake'),{hit:'block.wool.hit',break:'block.wool.break',place:'block.wool.place',step:'block.wool.step',volume:1,pitch:1});
    assert.deepEqual(blockSounds(ODD_BLOCK),{...blockSounds('cake'),place:'block.slime_block.place'});assert.deepEqual(placedDrops(blocks[0],null,rules),[]);
    for(let bites=0;bites<7;bites++){
        assert.deepEqual(nativeShapes(ODD_BLOCK,{bites:String(bites)}),nativeShapes('cake',{bites:String(bites)}));
        const command:Command={type:'eat-cake',scene:'home',id:'odd-ground',expectedBites:bites};
        const result=transition(s,command,WORLD_REGION,rules);assert.ok(result.events.some(e=>e.type==='cake-eaten'));s=result.state;
        assert.ok(!transition(s,command,WORLD_REGION,rules).events.some(e=>e.type==='cake-eaten'));
        s=(await decode(JSON.stringify(await seal(s,'odd-bites',bites)))).envelope.state;
    }
    assert.equal(s.progress.scenes.home.blocks?.length,0);assert.equal(s.progress.cakePlacement,null);
});

test('all seven models rotate entire textured faces including cut interiors and GUI geometry',()=>{
    const files=resources(),docs=new Map([...files].filter(([p])=>p.endsWith('.json')).map(([p,b])=>[p,JSON.parse(Buffer.from(b).toString())]));
    const manifest=docs.get('easter-egg-manifest.json');
    for(const [path,hash] of Object.entries(manifest.inputs))assert.equal(createHash('sha256').update(files.get(path)!).digest('hex'),hash,path);
    assert.equal(createHash('sha256').update(readFileSync(new URL('../tools/easter-egg-assets.ts',import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex'),manifest.exporterSha256);
    /** Read a verified model document. @param {string} id Namespaced model. @return {any} Model JSON. */
    const load=(id:string)=>docs.get(assetPath('models',id));
    for(let bites=0;bites<7;bites++){
        const suffix=bites?'_slice'+bites:'',native=compileModel(resolveModel('minecraft:block/cake'+suffix,load)),model=resolveModel('jerrys_farm:block/ekac'+suffix,load),odd=compileModel(model);
        assert.deepEqual(odd.uvs,native.uvs);assert.deepEqual(odd.indices,native.indices);
        for(let i=0;i<native.positions.length;i+=3){assert.ok(Math.abs(odd.positions[i]-native.positions[i])<1e-8);assert.ok(Math.abs(odd.positions[i+1]-(.5-native.positions[i+1]))<1e-8);assert.ok(Math.abs(odd.positions[i+2]-(1-native.positions[i+2]))<1e-8);}
        for(let i=0;i<native.normals.length;i+=3){assert.ok(Math.abs(odd.normals[i+1]+native.normals[i+1])<1e-8);assert.ok(Math.abs(odd.normals[i+2]+native.normals[i+2])<1e-8);}
        if(bites)assert.ok(odd.textures.includes('minecraft:block/cake_inner'));
        const icon=iconGeometry(iconModel('jerrys_farm:block/ekac'+suffix,load));
        icon.positions.forEach((v,i)=>assert.ok(Math.abs(v-odd.positions[i])<1e-8));
    }
});

test('failed saves publish no challenge or item, and a successful retry commits once',async()=>{
    const initial=ready();let raw=JSON.stringify(await seal(initial,'odd-failure',0)),deny=true;const events:any[]=[];
    const session=new SaveSession({getItem:()=>raw,setItem:(_key,v)=>{if(deny)throw Error('write-failed');raw=v;}},{exclusive:async work=>work()},WORLD_REGION);
    session.rules=rules;await session.refresh();session.eventListeners.add(es=>events.push(...es));const before=raw;
    await assert.rejects(()=>session.dispatch(craft(session.view.envelope!.state)),/write-failed/);assert.equal(raw,before);assert.equal(events.length,0);
    deny=false;await session.refresh();await session.dispatch(craft(session.view.envelope!.state));
    assert.equal(events.filter(e=>e.type==='advancements-completed'&&e.advancements.includes(ODD_ADVANCEMENT)).length,1);
    await session.refresh();assert.equal(events.filter(e=>e.type==='advancements-completed').length,1);
});

test('first table attempt is saved once without consuming cake; reload, repetition and wrong held items cannot replay it',async()=>{
    let state=initialState();state.progress.scene='home';state.progress.unlocked.push(ODD_CAKE);state.progress.player.data.hotbar[0]={id:ODD_CAKE,count:1};
    const command:Command={type:'try-odd-cake-table',scene:'home',expected:state.progress.player.data};
    const result=transition(state,command,WORLD_REGION,rules);assert.equal(result.events.filter(e=>e.type==='odd-cake-table-tried').length,1);
    assert.deepEqual(result.state.progress.player,state.progress.player);assert.equal(result.state.progress.cakePlacement,null);
    state=(await decode(JSON.stringify(await seal(result.state,'table-attempt',1)))).envelope.state;
    assert.equal(state.progress.oddCakeTableTried,true);assert.ok(!transition(state,command,WORLD_REGION,rules).events.some(e=>e.type==='odd-cake-table-tried'));
    const missing=structuredClone(state);missing.progress.player.data.hotbar[0]=null;
    assert.throws(()=>transition(missing,{...command,expected:missing.progress.player.data},WORLD_REGION,rules),/cake-not-held/);
    const untried=structuredClone(state);delete untried.progress.oddCakeTableTried;
    const raw=JSON.stringify(await seal(untried,'table-failed',0));
    const session=new SaveSession({getItem:()=>raw,setItem:()=>{throw Error('write-failed');}},{exclusive:async work=>work()},WORLD_REGION),events:any[]=[];
    session.rules=rules;await session.refresh();session.eventListeners.add(es=>events.push(...es));
    await assert.rejects(()=>session.dispatch({...command,expected:session.view.envelope!.state.progress.player.data}),/write-failed/);assert.equal(events.length,0);assert.equal(session.view.envelope!.state.progress.oddCakeTableTried,undefined);
});

test('author remark follows actual toast visibility by two seconds, uses delivery language and never crosses resets or disposal',t=>{
    t.mock.timers.enable({apis:['setTimeout']});const messages:any[]=[],lifetime=new AbortController();let generation='one',locale='en',inspect=()=>{};
    const chat={append:(...args:any[])=>messages.push(args)},text=(key:string)=>translate(key,{},localeDictionary(locale));
    const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),originalObserver=Object.getOwnPropertyDescriptor(globalThis,'MutationObserver'),toast={hidden:true,dataset:{advancement:ODD_ADVANCEMENT}};
    Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
    Object.defineProperty(globalThis,'MutationObserver',{configurable:true,value:class {constructor(callback:()=>void){inspect=callback;}observe(){}disconnect(){}}});
    try{
        bindOddCakeRemarks({querySelectorAll:()=>[toast]} as any,chat,text,lifetime.signal,()=>generation);
        t.mock.timers.tick(5000);assert.equal(messages.length,0);toast.hidden=false;inspect();
        t.mock.timers.tick(1999);assert.equal(messages.length,0);locale='zh-CN';t.mock.timers.tick(1);
        assert.deepEqual(messages[0],[[{text:'hmmm,你确定吗 (ﾉ∀)`'}],'author']);
        inspect();t.mock.timers.tick(5000);assert.equal(messages.length,1);
        scheduleOddCakeRemark(chat,text,lifetime.signal,()=>generation==='one');generation='two';t.mock.timers.tick(2000);assert.equal(messages.length,1);
        scheduleOddCakeRemark(chat,text,lifetime.signal,()=>true);lifetime.abort();t.mock.timers.tick(2000);assert.equal(messages.length,1);
        assert.equal(text('chat.oddCakeTable'),'拜托 (｡•ˇ_ˇ•｡)');
    }finally{lifetime.abort();if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');if(originalObserver)Object.defineProperty(globalThis,'MutationObserver',originalObserver);else Reflect.deleteProperty(globalThis,'MutationObserver');}
});
