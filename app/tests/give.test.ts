/** Give commands exercise every registered item, native capacities, durable drops and atomic saves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,KNOWN_ITEMS,transition} from '../web/src/domain/state.ts';
import {parseCommand,completeCommand} from '../web/src/domain/console.ts';
import {INVENTORY_RULES,ODD_CAKE,withEasterEgg} from '../web/src/domain/easter-egg.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {decode,seal,token} from '../web/src/persistence/codec.ts';
import {translate,localeDictionary} from '../web/src/i18n/index.ts';
import type {Rules} from '../web/src/rules/types.ts';
import {resources} from '../tools/resources.ts';
import {PlayerItems} from '../web/src/ui/player-items.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import {MeshLambertMaterial} from 'three';
import type {CatalogueArt} from '../web/src/ui/icons.ts';

/** Production rules include the authored cake with its separate namespace. */
const rules=withEasterEgg(JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules);

for(const id of KNOWN_ITEMS)test('give accepts, completes and persists '+id,async()=>{
 const source='/give @s '+id,result=transition(initialState(),{type:'console',source},undefined,rules);
 assert.deepEqual(parseCommand(source),{op:'give',args:['@s',id]});
 assert.ok(completeCommand('/give @s ').values.includes(id));
 assert.deepEqual(result.state.progress.player.data.hotbar[0],{id,count:1});
 assert.ok(result.state.progress.unlocked.includes(id));
 assert.equal(result.console![0].key,'commands.give.success.single');
 const saved=await seal(result.state,'give-registry',1);
 assert.deepEqual((await decode(JSON.stringify(saved))).envelope.state,result.state);
});

test('native default namespace, target forms, integer errors and completion',()=>{
 for(const target of ['@s','@a','@p','@r','sireoh'])assert.equal(transition(initialState(),{type:'console',source:`/minecraft:give ${target} egg 17`},undefined,rules).console![0].key,'commands.give.success.single');
 assert.deepEqual(completeCommand('/give @s oak_l').values,['minecraft:oak_log']);
 assert.deepEqual(completeCommand('/give @s jerrys_farm:').values,[ODD_CAKE]);
 assert.ok(completeCommand('/gi').values.includes('give'));
 assert.ok(completeCommand('/give ','Vincent').values.includes('Vincent'));
 for(const [source,key] of [['/give @s stone 0','argument.integer.low'],['/give @s stone -2','argument.integer.low'],['/give @s stone 1.5','parsing.int.invalid'],['/give @s stone 1s','parsing.int.invalid'],['/give @s stone 2147483648','parsing.int.invalid'],['/give @s unknown_item','argument.item.id.invalid']]){
  const result=parseCommand(source);assert.ok('key'in result);assert.equal(result.key,key);assert.equal(result.error,true);assert.equal(typeof result.cursor,'number');
 }
 for(const source of ['/give','/give stone','/give @s','/give @s stone 1 extra'])assert.ok('error'in parseCommand(source));
 const state=initialState(),result=transition(state,{type:'console',source:'/give Nobody stone'},undefined,rules);
 assert.equal(result.console![0].key,'argument.entity.notfound.player');assert.deepEqual(result.state,state);
});

test('native 100-stack limits reject atomically and split by each item capacity',()=>{
 for(const id of ['minecraft:stone','minecraft:egg','minecraft:iron_pickaxe',ODD_CAKE]){
  const max=INVENTORY_RULES.items[id as keyof typeof INVENTORY_RULES.items].maxStack,initial=initialState();
  const rejected=transition(initial,{type:'console',source:`/give @s ${id} ${max*100+1}`},undefined,rules);
  assert.equal(rejected.console![0].key,'commands.give.failed.toomanyitems');assert.equal(rejected.console![0].error,true);assert.deepEqual(rejected.state,initial);assert.deepEqual(rejected.events,[]);
  const accepted=transition(initial,{type:'console',source:`/give @s ${id} ${max*100}`},undefined,rules),p=accepted.state.progress;
  const stacks=[...p.player.data.hotbar,...p.player.data.backpack,...p.scenes[p.scene].agriculture!.drops.map(d=>d.stack)].filter(s=>s!==null);
  assert.equal(stacks.length,100);assert.ok(stacks.every(s=>s.id===id&&s.count===max));assert.equal(p.scenes[p.scene].agriculture!.drops.length,64);
 }
});

test('native insertion merges selected slot, offhand and ordinary groups before hotbar vacancies',()=>{
 const initial=initialState(),p=initial.progress,bag=p.player.data;p.unlocked.push('minecraft:stone');bag.selected=5;
 bag.hotbar[5]={id:'minecraft:stone',count:60};bag.equipment.offhand={id:'minecraft:stone',count:60};bag.hotbar[2]={id:'minecraft:stone',count:60};bag.backpack[0]={id:'minecraft:stone',count:60};
 const result=transition(initial,{type:'console',source:'/give @s stone 18'},undefined,rules).state.progress.player.data;
 assert.equal(result.hotbar[5]!.count,64);assert.equal(result.equipment.offhand!.count,64);assert.equal(result.hotbar[2]!.count,64);assert.equal(result.backpack[0]!.count,64);assert.deepEqual(result.hotbar[0],{id:'minecraft:stone',count:2});assert.equal(result.selected,5);
 const empty=transition(initialState(),{type:'console',source:'/give @s egg 17'},undefined,rules).state.progress.player.data;
 assert.equal(empty.hotbar[0]!.count,16);assert.equal(empty.hotbar[1]!.count,1);assert.equal(empty.equipment.offhand,null);
});

test('full bags retain unacquired gifts on the ground until pickup can fit, including after reload',async()=>{
 const initial=initialState(),p=initial.progress;p.unlocked.push('minecraft:stone');
 p.player.data.hotbar=p.player.data.hotbar.map(()=>({id:'minecraft:stone',count:64}));p.player.data.backpack=p.player.data.backpack.map(()=>({id:'minecraft:stone',count:64}));
 const given=transition(initial,{type:'console',source:'/give @s egg 17'},undefined,rules),ground=given.state.progress.scenes.plains.agriculture!;
 assert.equal(ground.drops.length,2);assert.ok(!given.state.progress.unlocked.includes('minecraft:egg'));
 const saved=await seal(given.state,'give-overflow',1),loaded=structuredClone((await decode(JSON.stringify(saved))).envelope.state);
 loaded.progress.player.data.hotbar[0]=null;loaded.progress.player.data.hotbar[1]=null;
 const picked=transition(loaded,{type:'pickup-ground',scene:'plains',visit:loaded.progress.world.visits.plains.epoch,feet:ground.drops[0].cell},undefined,rules);
 assert.equal(picked.state.progress.scenes.plains.agriculture!.drops.length,0);assert.ok(picked.state.progress.unlocked.includes('minecraft:egg'));
 assert.deepEqual(picked.state.progress.player.data.hotbar.slice(0,2),[{id:'minecraft:egg',count:16},{id:'minecraft:egg',count:1}]);
});

test('native feedback translates item names and original messages',()=>{
 for(const [locale,expected] of [['en','Gave 2 [Egg] to sireoh'],['zh-CN','已将2个[鸡蛋]给予sireoh']]){
  const state=initialState();state.settings.locale=locale;
  const message=transition(state,{type:'console',source:'/give @s egg 2'},undefined,rules).console![0];
  assert.equal(translate(message.key,message.values,localeDictionary(locale)),expected);
 }
});

test('every granted item resolves its native ground model and packaged textures',()=>{
 const files=resources(),documents=new Map([...files].filter(([path])=>path.endsWith('.json')).map(([path,bytes])=>[path,JSON.parse(new TextDecoder().decode(bytes))])),
  builder=new PlayerItems({documents,images:new Map()} as CatalogueArt),material=new MeshLambertMaterial(),world=Object.create(AuthoredWorld.prototype) as AuthoredWorld;
 builder.material=/** Verify actual material assets without allocating a browser canvas. @param {string} id Texture identity. @return {MeshLambertMaterial} Test material. */(id:string)=>{assert.ok(files.has('assets/minecraft/textures/'+id.split(':').at(-1)+'.png'),id);return material;};
 builder.generated=/** Verify generated-sprite assets while isolating alpha extrusion. @param {string} id Texture identity. @return {object} Empty compiled sprite. */(id:string)=>{assert.ok(files.has('assets/minecraft/textures/'+id.split(':').at(-1)+'.png'),id);return{positions:[],normals:[],uvs:[],indices:[],faces:[],textures:[id]};};
 world.groundItems=builder;
 for(const id of KNOWN_ITEMS){const root=world.groundItem(id);assert.ok(root.children.length>0,id);root.traverse(object=>assert.ok(object.layers.isEnabled(1),id));builder.release(root);}
 const stone=world.groundItem('minecraft:stone');assert.deepEqual(stone.children[0].scale.toArray(),[.25,.25,.25]);builder.release(stone);material.dispose();
});

test('real sessions serialize gifts, keep failed writes atomic and reject stale reset commands',async()=>{
 let raw:string|null=null,deny=false,tail=Promise.resolve<unknown>(null);
 const storage={getItem:()=>raw,/** Persist one atomic envelope. @param {string} _key Storage key. @param {string} value Serialized state. */setItem:(_key:string,value:string)=>{if(deny)throw Error('write-failed');raw=value;}},
 locks={/** Serialize transactions across both owners. @param {Function} fn Transaction. @return {Promise<T>} Committed result. */exclusive<T>(fn:()=>Promise<T>){const work=tail.then(fn);tail=work.catch(()=>{});return work;}},a=new SaveSession(storage,locks),b=new SaveSession(storage,locks);
 a.rules=b.rules=rules;await a.refresh();await b.refresh();
 await Promise.all([a.transact({type:'console',source:'/give @s egg 2'}),b.transact({type:'console',source:'/give @s egg 3'})]);await a.refresh();assert.equal(a.view.envelope!.state.progress.player.data.hotbar[0]!.count,5);
 const before=raw;deny=true;await assert.rejects(a.transact({type:'console',source:'/give @s egg'}),/write-failed/);assert.equal(raw,before);assert.equal(a.view.envelope!.state.progress.player.data.hotbar[0]!.count,5);
 deny=false;await a.refresh();await a.reset(token(a.view.envelope!));await assert.rejects(b.transact({type:'console',source:'/give @s egg'}),/stale-session/);
});
