/** Regressions for native animal food, authored supports, shovel dousing and finite buckets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {withEasterEgg} from '../web/src/domain/easter-egg.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {animalCare,animalFood,canFeed} from '../web/src/domain/husbandry.ts';
import {blockAt} from '../web/src/domain/placed-blocks.ts';
import {FarmAnimal} from '../web/src/domain/farm-life.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import {PlayerMotion} from '../web/src/domain/player-motion.ts';
import {waterLevel,setWater,tickWater,waterCells} from '../web/src/domain/water.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import type {State,Command,Cell} from '../web/src/domain/types.ts';
import type {BlockHit} from '../web/src/domain/placed-blocks.ts';
/** Locked crafting rules with native bucket interaction results. */
const rules=withEasterEgg(JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')));
/** Prepare a finite hand in the farm. @param {string} item Native short ID. @param {number} count Count. @return {State} Mutable fixture. */
function fixture(item='wheat_seeds',count=4):State{const s=initialState();s.progress.scene='farm';s.progress.unlocked.push('minecraft:'+item);s.progress.player.data.hotbar[0]={id:'minecraft:'+item,count};return s;}
/** Apply an authoritative command. @param {State} s World. @param {Command} c Command. @return {State} Committed snapshot. */
function run(s:State,c:Command):State{return transition(s,c,WORLD_REGION,rules).state;}
/** Build a reachable upward hit without occupying the target. @param {Cell} cell Target. @return {BlockHit} Hit context. */
function hit(cell:Cell):BlockHit{return {cell,normal:[0,1,0],point:[cell[0]+.5,cell[1]+1,cell[2]+.5],eye:[cell[0]+2.5,cell[1]+2.62,cell[2]+.5],yaw:0};}
test('native tags distinguish seed-fed chickens and wheat-fed cows',()=>{assert.ok(animalFood('chicken','minecraft:wheat_seeds'));assert.ok(animalFood('cow','minecraft:wheat'));assert.equal(animalFood('chicken','minecraft:wheat'),false);assert.equal(animalFood('cow','minecraft:wheat_seeds'),false);});
for(const hand of ['mainhand','offhand'] as const)test(hand+' feeding consumes one seed and cannot replay or refeed an animal in love',()=>{
    let s=fixture();if(hand==='offhand'){s.progress.player.data.equipment.offhand=s.progress.player.data.hotbar[0];s.progress.player.data.hotbar[0]=null;}
    const c:Command={type:'feed-animal',scene:'farm',id:'animal:chicken:0',hand,expected:structuredClone(s.progress.player.data)};s=run(s,c);
    assert.equal(animalCare(s.progress,'animal:chicken:0').loveUntil,600);assert.equal(canFeed(s.progress,'animal:chicken:0','minecraft:wheat_seeds'),false);assert.throws(()=>run(s,c),/inventory-conflict/);
    assert.equal((hand==='mainhand'?s.progress.player.data.hotbar[0]:s.progress.player.data.equipment.offhand)?.count,3);
});
test('two fed chickens require courtship, breed one baby, and cool down for 6000 ticks',async()=>{
    let s=fixture();for(const id of ['animal:chicken:0','animal:chicken:1'])s=run(s,{type:'feed-animal',scene:'farm',id,expected:s.progress.player.data});
    const breed:Command={type:'breed-animals',scene:'farm',parents:['animal:chicken:0','animal:chicken:1'],feet:[[4,0,-4],[5,0,-4]],id:'baby'};assert.throws(()=>run(s,breed),/animal-not-in-love/);
    s=structuredClone(s);s.progress.world.tick=60;s=run(s,breed);assert.equal(s.progress.scenes.farm.offspring?.length,1);assert.equal(animalCare(s.progress,'bred:baby').grownAt,24060);assert.equal(animalCare(s.progress,'animal:chicken:0').readyAt,6060);
    assert.throws(()=>run(s,breed),/animal-not-in-love/);const saved=await seal(s,'native-farm-test',0),restored=await decode(JSON.stringify(saved));assert.deepEqual(restored.envelope.state.progress.scenes.farm,s.progress.scenes.farm);
});
test('wheat feeds cows and same-species parents produce a calf',()=>{
    let s=fixture('wheat');s.progress.scenes.farm.offspring=[{id:'cow',kind:'cow',feet:[3,0,-5],born:0}];s.progress.world.tick=24000;
    for(const id of ['node:cow:0','bred:cow'])s=run(s,{type:'feed-animal',scene:'farm',id,expected:s.progress.player.data});s=structuredClone(s);s.progress.world.tick+=60;s=run(s,{type:'breed-animals',scene:'farm',parents:['node:cow:0','bred:cow'],feet:[[2,0,-5],[3,0,-5]],id:'calf'});assert.equal(s.progress.scenes.farm.offspring?.at(-1)?.kind,'cow');
});
test('baby feeding advances ten percent of remaining native growth seconds',()=>{let s=fixture();s.progress.scenes.farm.chickens=[{id:'egg',feet:[4,0,-4],born:0}];s=run(s,{type:'feed-animal',scene:'farm',id:'hatched:egg',expected:s.progress.player.data});assert.equal(animalCare(s.progress,'hatched:egg').grownAt,21600);assert.equal(animalCare(s.progress,'hatched:egg').loveUntil,0);});
test('food pursuit leaves the home disc and stops within the native temptation distance',()=>{const a=new FarmAnimal('chicken',[0,0,0],1);a.goal=[8,0,0];for(let i=0;i<100;i++)a.tick([[-20,-1,-20,20,0,20]],[]);assert.ok(a.feet[0]>5&&a.feet[0]<6);assert.ok(Math.hypot(a.feet[0]-8,a.feet[2])<2.5);});
for(const kind of ['cow','chicken'] as const)for(const hand of ['mainhand','offhand'] as const)test(kind+' follows the '+hand+' food through the live world tick',()=>{
    const s=fixture(kind==='cow'?'wheat':'wheat_seeds'),p=s.progress,id=kind==='cow'?'node:cow:0':'animal:chicken:0';if(hand==='offhand'){p.player.data.equipment.offhand=p.player.data.hotbar[0];p.player.data.hotbar[0]=null;}
    const world=Object.create(AuthoredWorld.prototype) as AuthoredWorld;Object.assign(world,{lifeTicks:0,animals:new Map(),natural:{children:[{userData:{id,block:kind,cell:[0,0,0]}}]}});const player=new PlayerMotion();player.feet=[8,0,.5];
    for(let i=0;i<100;i++)world.tickLife(p,[[-20,-1,-20,20,0,20]],[],null,player);const animal=world.animals.get(id)!;assert.ok(animal.feet[0]>5);assert.ok(animal.tempted);p.player.data.hotbar[0]=null;p.player.data.equipment.offhand=null;world.tickLife(p,[[-20,-1,-20,20,0,20]],[],null,player);assert.equal(animal.goal,null);assert.equal(animal.temptCooldown,100);
});
test('campfire on authored hay preserves the hay and enables signal smoke',()=>{let s=fixture('campfire',1);s=run(s,{type:'place-block',scene:'farm',item:'campfire',id:'fire',hit:hit([-9,0,-11]),expected:s.progress.player.data});assert.equal(blockAt(s.progress,[-9,0,-11])?.block,'hay_block');assert.equal(s.progress.scenes.farm.blocks?.[0].state.signal_fire,'true');assert.equal(blockAt(s.progress,[-10,1,-11])?.block,'hay_block');});
test('attached torch survives placing other blocks beside an authored barn support',()=>{let s=fixture('torch',2);const h=hit([-11,1,-8]);h.normal=[1,0,0];h.point=[-10,1.5,-7.5];s=run(s,{type:'place-block',scene:'farm',item:'torch',id:'torch',hit:h,expected:s.progress.player.data});assert.equal(s.progress.scenes.farm.blocks?.[0].block,'wall_torch');assert.equal(blockAt(s.progress,[-11,1,-8])?.block,'oak_log');});
for(const hand of ['mainhand','offhand'] as const)test(hand+' shovel douses the campfire with one durability and no block removal',()=>{let s=fixture('iron_shovel',1);s.progress.scenes.farm.blocks=[{id:'fire',block:'campfire',cell:[4,0,0],state:{facing:'north',lit:'true',waterlogged:'false',signal_fire:'false'}}];if(hand==='offhand'){s.progress.player.data.equipment.offhand=s.progress.player.data.hotbar[0];s.progress.player.data.hotbar[0]=null;}s=run(s,{type:'extinguish-campfire',scene:'farm',id:'fire',hand,expected:s.progress.player.data});assert.equal(s.progress.scenes.farm.blocks![0].state.lit,'false');assert.equal((hand==='mainhand'?s.progress.player.data.hotbar[0]:s.progress.player.data.equipment.offhand)?.components?.['minecraft:damage'],1);});
test('empty bucket takes an authored source and the water bucket places a durable source elsewhere',async()=>{
    let s=fixture('bucket',1);s=run(s,{type:'use-bucket',scene:'farm',hit:hit([8,-1,-2]),expected:s.progress.player.data});assert.equal(waterLevel(s.progress,[8,-1,-2]),null);assert.equal(s.progress.player.data.hotbar[0]?.id,'minecraft:water_bucket');
    s=run(s,{type:'use-bucket',scene:'farm',hit:hit([10,-1,0]),expected:s.progress.player.data});assert.equal(waterLevel(s.progress,[10,0,0]),0);assert.equal(s.progress.player.data.hotbar[0]?.id,'minecraft:bucket');assert.ok(waterCells(s.progress).some(f=>f.cell.join(',')==='10,0,0'));
    const restored=await decode(JSON.stringify(await seal(s,'water-test',0)));assert.equal(waterLevel(restored.envelope.state.progress,[10,0,0]),0);
});
test('stacked empty buckets retain their stack and deliver one filled bucket',()=>{let s=fixture('bucket',3);s=run(s,{type:'use-bucket',scene:'farm',hit:hit([8,-1,-2]),expected:s.progress.player.data});assert.equal(s.progress.player.data.hotbar[0]?.count,2);assert.equal([...s.progress.player.data.hotbar,...s.progress.player.data.backpack].filter(v=>v?.id==='minecraft:water_bucket').length,1);});
test('offhand bucket fills without swapping the selected tool',()=>{let s=fixture('bucket',1);s.progress.player.data.equipment.offhand=s.progress.player.data.hotbar[0];s.progress.unlocked.push('minecraft:iron_shovel');s.progress.player.data.hotbar[0]={id:'minecraft:iron_shovel',count:1};s=run(s,{type:'use-bucket',scene:'farm',hand:'offhand',hit:hit([8,-1,-2]),expected:s.progress.player.data});assert.equal(s.progress.player.data.equipment.offhand?.id,'minecraft:water_bucket');assert.equal(s.progress.player.data.hotbar[0]?.id,'minecraft:iron_shovel');});
test('full carriers drop exactly one filled bucket while consuming one empty bucket',()=>{let s=fixture('bucket',3);s.progress.unlocked.push('minecraft:oak_planks');s.progress.player.data.backpack.fill({id:'minecraft:oak_planks',count:64});for(let i=1;i<9;i++)s.progress.player.data.hotbar[i]={id:'minecraft:oak_planks',count:64};s=run(s,{type:'use-bucket',scene:'farm',hit:hit([8,-1,-2]),expected:s.progress.player.data});assert.equal(s.progress.player.data.hotbar[0]?.count,2);assert.deepEqual(s.progress.scenes.farm.agriculture?.drops.at(-1)?.stack,{id:'minecraft:water_bucket',count:1});});
test('flowing water cannot be collected and waterlogging extinguishes without removing a campfire',()=>{
    let s=fixture('bucket',1);setWater(s.progress,[10,0,0],1);assert.throws(()=>run(s,{type:'use-bucket',scene:'farm',hit:hit([10,0,0]),expected:s.progress.player.data}),/water-source-required/);
    s=fixture('water_bucket',1);s.progress.scenes.farm.blocks=[{id:'fire',block:'campfire',cell:[10,0,0],state:{facing:'north',lit:'true',waterlogged:'false',signal_fire:'false'}}];s=run(s,{type:'use-bucket',scene:'farm',hit:hit([10,0,0]),expected:s.progress.player.data});assert.equal(s.progress.scenes.farm.blocks![0].state.waterlogged,'true');assert.equal(s.progress.scenes.farm.blocks![0].state.lit,'false');
    s=run(s,{type:'use-bucket',scene:'farm',hit:hit([10,0,0]),expected:s.progress.player.data});assert.equal(s.progress.scenes.farm.blocks![0].state.waterlogged,'false');assert.equal(s.progress.scenes.farm.blocks![0].state.lit,'false');
});
test('water spreads seven cells on level ground and renews a supported two-source gap',()=>{const s=fixture();s.progress.scene='plains';setWater(s.progress,[0,0,0],0);for(let t=5;t<=45;t+=5){s.progress.world.tick=t;tickWater(s.progress,[]);}assert.equal(waterLevel(s.progress,[7,0,0]),7);assert.equal(waterLevel(s.progress,[8,0,0]),null);setWater(s.progress,[2,0,0],0);s.progress.world.tick=50;tickWater(s.progress,[]);assert.equal(waterLevel(s.progress,[1,0,0]),0);validateState(s);});
