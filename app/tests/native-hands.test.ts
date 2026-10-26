/** Behavioral regressions for native hands, projectiles, piercing attacks and sleep. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,transition,validateState} from '../web/src/domain/state.ts';
import {emptyInventory,reduceInventory} from '../web/src/domain/inventory.ts';
import {handStack} from '../web/src/domain/hands.ts';
import {ItemUse,SPEARS,kineticContact} from '../web/src/domain/item-use.ts';
import {EggProjectile,eggHatch,eggHatchPosition} from '../web/src/domain/egg-projectile.ts';
import {spearTargets,hurtAnimal} from '../web/src/domain/spear-combat.ts';
import {SleepView} from '../web/src/render/sleep-view.ts';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import type {Rules} from '../web/src/rules/types.ts';
import type {State,Command} from '../web/src/domain/types.ts';
import type {Bounds} from '../web/src/domain/player-motion.ts';
/** Locked inventory rules. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Prepare native finite carriers. @return {State} Valid fixture. */
function fixture():State{const s=initialState();s.progress.unlocked.push(...['egg','shield','iron_spear','oak_planks'].map(n=>'minecraft:'+n).filter(id=>!s.progress.unlocked.includes(id)));return s;}
/** Apply a real transaction. @param {State} s Snapshot. @param {Command} c Intent. @return {ReturnType<typeof transition>} Committed result. */
function run(s:State,c:Command){return transition(s,c,WORLD_REGION,rules);}
for(const hand of ['mainhand','offhand'] as const)test(hand+' egg consumes its carrier and rejects obsolete-layout replay',()=>{
    const s=fixture(),p=s.progress.player.data;p.hotbar[0]={id:'minecraft:iron_spear',count:1};if(hand==='mainhand')p.hotbar[0]={id:'minecraft:egg',count:2};else p.equipment.offhand={id:'minecraft:egg',count:2};
    const c:Command={type:'throw-egg',scene:'plains',hand,expected:structuredClone(p)},next=run(s,c).state;
    assert.equal(handStack(next.progress.player.data,hand)?.count,1);assert.equal(handStack(s.progress.player.data,hand)?.count,2);assert.throws(()=>run(next,c),/inventory-conflict/);
    const end=run(next,{...c,expected:next.progress.player.data}).state;assert.equal(handStack(end.progress.player.data,hand),null);if(hand==='offhand')assert.equal(end.progress.player.data.hotbar[0]?.id,'minecraft:iron_spear');
});
test('continuous use is exclusive and honors raise delay, direction, bypass, disable and carrier changes',()=>{
    const p=fixture().progress.player.data;p.hotbar[0]={id:'minecraft:iron_spear',count:1};p.equipment.offhand={id:'minecraft:shield',count:1};const u=new ItemUse();u.start(p,'offhand');u.update(p,4.999);assert.equal(u.block(8,1).blocked,0);u.update(p,.001);assert.equal(u.block(8,-1).blocked,0);assert.equal(u.block(8,0).blocked,8);assert.equal(u.block(8,1,true).blocked,0);assert.equal(u.block(2,1).durability,0);assert.equal(u.block(3.5,1).durability,4);
    u.start(p,'mainhand');assert.equal(u.hand,'offhand');assert.deepEqual(u.block(8,1,false,5),{blocked:8,durability:9,disabled:true});assert.equal(u.hand,null);assert.equal(u.start(p,'offhand'),false);u.update(p,100);assert.ok(u.start(p,'offhand'));p.equipment.offhand=null;u.update(p,0);assert.equal(u.hand,null);
});
test('scene damage entry applies blocking, active-hand wear and disable feedback',()=>{
    const p=fixture().progress.player.data;p.equipment.offhand={id:'minecraft:shield',count:1};const use=new ItemUse();use.start(p,'offhand');use.update(p,5);const wear:unknown[]=[],sounds:string[]=[];
    const scene={itemUse:use,motion:{feet:[0,0,0]},look:{yaw:0},onShieldWear:(...args:unknown[])=>wear.push(args),movementSound:(id:string)=>sounds.push(id),requestRender:()=>{}} as unknown as SceneView;
    assert.equal(SceneView.prototype.receiveHit.call(scene,7,[0,1,4]),7);assert.equal(SceneView.prototype.receiveHit.call(scene,7,[0,1,-4],false,5),0);assert.deepEqual(wear,[['offhand',8]]);assert.deepEqual(sounds,['item.shield.block','item.shield.break']);assert.equal(use.hand,null);
});
test('shield break removes only the shield',()=>{
    const s=fixture(),p=s.progress.player.data;p.hotbar[0]={id:'minecraft:iron_spear',count:1};p.equipment.offhand={id:'minecraft:shield',count:1,components:{'minecraft:damage':335}};
    const next=run(s,{type:'wear-shield',scene:'plains',hand:'offhand',amount:1,expected:p}).state;assert.equal(next.progress.player.data.equipment.offhand,null);assert.deepEqual(next.progress.player.data.hotbar[0],p.hotbar[0]);
});
test('workbench quick move merges before vacancies; partial transfer keeps remainder in source',()=>{
    const v=emptyInventory();v.workbench=Array(9).fill(null);v.hotbar[0]={id:'minecraft:oak_planks',count:10};v.workbench[0]={id:'minecraft:oak_planks',count:60};
    let n=reduceInventory(v,{type:'quick',slot:'hotbar:0'},['minecraft:oak_planks'],rules);assert.equal(n.workbench![0]!.count,64);assert.equal(n.workbench![1]!.count,6);assert.equal(n.hotbar[0],null);assert.ok(n.backpack.every(x=>x===null));
    v.workbench=Array.from({length:9},()=>({id:'minecraft:oak_planks',count:64}));v.workbench[4]!.count=63;n=reduceInventory(v,{type:'quick',slot:'hotbar:0'},['minecraft:oak_planks'],rules);assert.equal(n.hotbar[0]!.count,9);assert.ok(n.backpack.every(x=>x===null));
    v.workbench[4]!.count=64;n=reduceInventory(v,{type:'quick',slot:'hotbar:0'},['minecraft:oak_planks'],rules);assert.equal(n.backpack[0]!.count,10);assert.equal(n.hotbar[0],null);
});
test('egg inherits movement, applies gravity before drag and sweeps thin colliders',()=>{
    const egg=new EggProjectile([0,1.62,0],[0,0,-1],[.1,.3,.2],true,()=>.5);assert.deepEqual(egg.position,[0,1.52,0]);assert.deepEqual(egg.velocity,[.1,0,-1.3]);const hit=egg.tick([[-1,0,-.75,1,3,-.7]],[]);assert.ok(hit);assert.ok(Math.abs(hit.point[2]+.7)<1e-8);assert.equal(hit.entity,-1);assert.equal(egg.tick([],[]),null);
    const air=new EggProjectile([0,2,0],[0,0,-1],[0,.3,0],false,()=>.5);air.tick([],[]);assert.ok(Math.abs(air.velocity[1]-(.3-.03)*Math.fround(.99))<1e-8);
});
test('hatching uses independent draws and preserves babies through save validation',()=>{
    assert.equal(eggHatch(()=>.5),0);const rolls=[0,.5];assert.equal(eggHatch(()=>rolls.shift()!),1);assert.equal(eggHatch(()=>0),4);
    const s=run(fixture(),{type:'hatch-eggs',scene:'plains',feet:[1,0,1],count:4,id:'egg'}).state;assert.equal(s.progress.scenes.plains.chickens!.length,4);assert.doesNotThrow(()=>validateState(JSON.parse(JSON.stringify(s))));assert.throws(()=>run(s,{type:'hatch-eggs',scene:'plains',feet:[1,0,1],count:2,id:'bad'}));
});
test('spear pierces several targets but never reaches through a wall before its minimum range',()=>{
    const entities=[{id:'near',bounds:[-.2,1,-1.2,.2,2,-.8] as Bounds},{id:'first',bounds:[-.2,1,-3,.2,2,-2.6] as Bounds},{id:'second',bounds:[-.2,1,-4.5,.2,2,-4.2] as Bounds}];
    assert.deepEqual(spearTargets([0,1.62,0],[0,0,-1],[0,0,0],[],entities),['first','second']);assert.deepEqual(spearTargets([0,1.62,0],[0,0,-1],[0,0,0],[[-1,0,-1.5,1,3,-1.4]],entities),[]);assert.deepEqual(spearTargets([0,1.62,0],[0,0,-1],[0,0,0],[[-1,0,-4,1,3,-3.9]],entities),['first']);
});
test('kinetic attacks require raising and relative speed and expire after prolonged use',()=>{
    const p=SPEARS['minecraft:iron_spear'];assert.equal(kineticContact(p,11,20,0).damage,0);assert.deepEqual(kineticContact(p,12,0,0),{damage:0,knockback:false,dismount:false});assert.equal(kineticContact(p,12,6,6).damage,0);assert.deepEqual(kineticContact(p,12,12,0),{damage:12,knockback:true,dismount:true});assert.deepEqual(kineticContact(p,238,20,0),{damage:0,knockback:false,dismount:false});
});
test('hurt cooldown applies only excess damage; health and spear wear survive serialization',()=>{
    const first=hurtAnimal({health:10,lastDamage:0,hurtAt:-20},3,0);assert.equal(first.vitals.health,7);assert.equal(hurtAnimal(first.vitals,3,9).accepted,false);assert.equal(hurtAnimal(first.vitals,5,9).vitals.health,5);assert.equal(hurtAnimal(first.vitals,3,10).vitals.health,4);
    const s=fixture();s.progress.scene='farm';s.progress.player.data.hotbar[0]={id:'minecraft:iron_spear',count:1};const end=run(s,{type:'animal-hit',scene:'farm',id:'node:cow:0',damage:3,weapon:'minecraft:iron_spear',hand:'mainhand'}).state;assert.equal(end.progress.scenes.farm.animalVitals!['node:cow:0'].health,7);assert.equal(end.progress.player.data.hotbar[0]!.components!['minecraft:damage'],1);assert.doesNotThrow(()=>validateState(JSON.parse(JSON.stringify(end))));
});
test('sleep camera lowers with the native eye filter and fades out over ten wake ticks',()=>{
    const v=new SleepView();v.sync(true);v.update(75);assert.ok(Math.abs(v.height()-1.265)<1e-8);assert.equal(v.pose([6,0,5],'north',.25).yaw,Math.PI);assert.equal(v.pose([6,0,5],'north',.25).pitch,0);v.update(4925);assert.equal(v.timer,100);assert.equal(v.opacity(),220/255);assert.ok(Math.abs(v.pose([6,0,5],'north',.25).eye[1]-.725)<1e-8);v.sync(false);v.update(250);assert.equal(v.opacity(),110/255);v.update(250);assert.equal(v.opacity(),0);assert.ok(v.height()>1.6);
});

test('egg babies fit against a floor or wall rather than spawning inside the collider',()=>{
    const floor:Bounds=[-1,-1,-1,1,0,1],wall:Bounds=[0,0,-1,1,3,1];const a=eggHatchPosition([0,0,0],[floor])!;assert.ok(a[1]>=0&&a[1]<.00001);const b=eggHatchPosition([0,1,0],[wall])!;assert.ok(b[0]<=-.1);
});

test('damaged shield GUI keeps the native thirteen-pixel bar and per-item cooldown overlay',()=>{
    const fills:unknown[]=[],context={fillStyle:'',drawImage:()=>{},/** Record one logical rectangle. @param {number} x Left. @param {number} y Top. @param {number} w Width. @param {number} h Height. */fillRect(x:number,y:number,w:number,h:number){fills.push([context.fillStyle,x,y,w,h]);}} as unknown as CanvasRenderingContext2D;
    const view={rules,art:{icons:new Map([['minecraft:shield',{dataset:{}}]])},itemCooldown:()=>.5} as unknown as GameInventory;
    GameInventory.prototype.stack.call(view,context,{id:'minecraft:shield',count:1,components:{'minecraft:damage':168}},10,20);
    assert.deepEqual(fills.slice(0,2),[['#000',12,33,13,2],['rgb(255 255 0)',12,33,7,1]]);assert.deepEqual((fills[2] as unknown[]).slice(1),[10,28,16,8]);
});
