/** Automatic chat boundaries, native compass bearings and real narrow-cave geometry regression. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene} from 'three';
import {systemFeedback, FAILURE_COLOR} from '../web/src/ui/system-feedback.ts';
import {harvestFeedback} from '../web/src/ui/harvest-feedback.ts';
import {NativeCompass, compassModel} from '../web/src/ui/compass.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {Look} from '../web/src/render/look.ts';
import {WORLD_SCENES, WORLD_COMPASS_TARGET, fixedSolid} from '../web/src/domain/world-config.ts';
import {caveAir, caveRockCells} from '../web/src/domain/cave-shape.ts';
import {initialState} from '../web/src/domain/state.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import {VanillaModels} from '../web/src/render/vanilla-models.ts';
import {compileModel, resolveModel} from '../web/src/render/model-format.ts';
import {resources} from '../tools/resources.ts';
import {reachable} from './spatial-access.ts';

/** Exact original documents used by both the runtime and independent threshold expectations. */
const files = resources(), docs = new Map([...files].filter(([p])=>p.endsWith('.json')).map(([p,b])=>[p,JSON.parse(new TextDecoder().decode(b))]));

test('automatic status chat omits item acquisition and routine success without filtering other channels',()=>{
    for(const key of ['game.worldHint','chat.tutorial','game.cakePlaced','status.migrated','scene.plains','scene.cave','scene.farm','scene.home']) assert.equal(systemFeedback(key),'information',key);
    for(const key of ['status.ready','error.lock-busy','game.actionFailed','game.acquired','game.placed','game.rotated','game.planted','game.removed','game.harvested','game.pickedUp','error.contextRestored','inventory.returned','book.discovered']) assert.equal(systemFeedback(key),'omit',key);
    for(const key of ['game.inventoryFull','game.harvestOverflow','game.invalidPosition','game.tableNeedsCake','game.pointerFailed','error.corrupt','error.write','audio.uiBlocked','audio.uiFailed','status.unknown']) assert.equal(systemFeedback(key),'failure',key);
    assert.equal(FAILURE_COLOR,'#FF5555');
    assert.deepEqual(harvestFeedback({type:'items-acquired',overflow:[{id:'minecraft:oak_log',count:2}]} as any,()=> 'overflow'),[[{text:'overflow',color:'#FF5555'}]]);
    assert.deepEqual(harvestFeedback({type:'items-acquired',inserted:[{id:'minecraft:oak_log',count:2}]} as any,()=> 'pickup'),[]);
});

test('native compass uses fixed world target, actual owner yaw and the original half-frame thresholds',()=>{
    const definition=docs.get('assets/minecraft/items/compass.json'), expected=['minecraft:item/compass_16','minecraft:item/compass_24','minecraft:item/compass_00','minecraft:item/compass_08'];
    for(const [i,yaw] of [180,90,0,-90].entries()){
        const compass=new NativeCompass(),owner={position:[.5,1.62,7],target:WORLD_COMPASS_TARGET,yaw,scope:'world'};
        let angle=0;for(let t=0;t<250;t++)angle=compass.angle(owner,t);
        assert.equal(compassModel(definition,angle),expected[i]);
    }
    assert.equal(compassModel(definition,0),'minecraft:item/compass_16');
    assert.equal(compassModel(definition,.5/32-1e-7),'minecraft:item/compass_16');
    assert.equal(compassModel(definition,.5/32+1e-7),'minecraft:item/compass_17');
});

test('wobbler changes once per native tick, takes the shortest turn and invalidates old-generation inertia',()=>{
    const compass=new NativeCompass(),owner={position:[.5,1.62,7],target:WORLD_COMPASS_TARGET,yaw:180,scope:'first'};
    compass.angle(owner,0);assert.equal(compass.velocity,0.020000001415610313);assert.equal(compass.rotation,Math.fround(.019999980926513672));
    const old=[compass.rotation,compass.velocity];compass.angle({...owner,yaw:0},0);assert.deepEqual([compass.rotation,compass.velocity],old);
    compass.angle(owner,1);assert.notEqual(compass.rotation,old[0]);
    compass.angle({...owner,scope:'reset'},2);assert.deepEqual([compass.rotation,compass.velocity],old);
});

test('formal SceneView converts its real camera heading to Java compass yaw without screen-frame constants',()=>{
    const view=Object.create(SceneView.prototype) as SceneView;view.camera=new PerspectiveCamera();view.camera.position.set(...WORLD_SCENES.cave.eye);
    view.camera.rotation.set(0,.5,0,'YXZ');const owner=view.compassView('generation');
    assert.deepEqual(owner.position,WORLD_SCENES.cave.eye);assert.equal(owner.target,WORLD_COMPASS_TARGET);assert.equal(owner.scope,'generation');assert.equal(owner.yaw,180-.5*180/Math.PI);
    view.camera.rotation.y=-.5;assert.notEqual(view.compassView('generation').yaw,owner.yaw);
});

test('narrow carver envelope keeps the eye, source cells and workable pocket while closing giant room space',()=>{
    assert.deepEqual(WORLD_SCENES.cave.eye,[0,1.62,7]);
    assert.ok(caveAir([0,1,7]));assert.ok(!caveAir([0,3,7]));assert.ok(!fixedSolid('cave',[-4,1,6]));
    for(const n of WORLD_SCENES.cave.nodes.slice(0,12))assert.ok(caveAir(n.cell),n.id);
    assert.ok(caveAir([4,2,0]));assert.ok(!caveAir([4,3,0]));assert.ok(caveAir([-4,1,-13]));assert.ok(!caveAir([0,1,-13]));
    const old=[-5,0,1] as [number,number,number], shell=caveRockCells([old]);
    assert.ok(caveRockCells().some(c=>c.join(',')===old.join(',')));assert.ok(!shell.some(c=>c.join(',')===old.join(',')));
});

test('real original stone shell leaves every ore type reachable using survival-range production rays from sampled cave corridor positions',()=>{
    const manifest=docs.get('world-manifest.json'), samples=[...manifest.states,{id:'legacy-furnace',block:'furnace',state:'facing=south,lit=false',variant:docs.get('assets/minecraft/blockstates/furnace.json').variants['facing=south,lit=false']}].map((s:any)=>({...s,compiled:compileModel(resolveModel(s.variant.model,id=>docs.get('assets/minecraft/models/'+id.split(':')[1]+'.json')),s.variant)}));
    const models=Object.create(VanillaModels.prototype) as VanillaModels;
    Object.assign(models,{pack:{samples,images:new Map(),loading:{}},materials:new Map(samples.flatMap((s:any)=>s.compiled.textures).map((t:string)=>[t,new MeshBasicMaterial()])),created:0,released:0});
    const authored=new AuthoredWorld(models,models.pack as any),state=initialState();state.progress.scene='cave';
    const errors: unknown[][]=[],originalError=console.error;console.error=(...args)=>{errors.push(args);};
    try {authored.build('cave');authored.sync(state.progress);} finally {console.error=originalError;}
    assert.deepEqual(errors,[],'initial source projection does not add an undefined retained object');
    const view=Object.create(SceneView.prototype) as SceneView;
    Object.assign(view,{scene:new Scene(),world:new Group(),persistent:new Group(),placed:new Group(),authored,models,camera:new PerspectiveCamera(70,16/9,.1,90),ray:new Raycaster(),look:new Look(),input:true,lost:false,disposed:false,basePitch:0,renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})}}});
    view.camera.position.set(...WORLD_SCENES.cave.eye);view.camera.lookAt(...WORLD_SCENES.cave.target);view.camera.rotation.order='YXZ';view.basePitch=view.camera.rotation.x;view.scene.add(authored.staticRoot,authored.natural,authored.crops,view.persistent,view.world);
    const remaining=[...authored.natural.children],found:string[]=[];
    while(remaining.length&&found.length<48){const i=remaining.findIndex(o=>[[0,1.62,7],[0,1.62,3],[0,1.62,-1],[-2,1.62,-3],[2,1.62,-4]].some(eye=>{view.camera.position.set(...eye as [number,number,number]);return reachable(view,o);}));if(i<0)break;const [o]=remaining.splice(i,1);found.push(String(o.userData.id));o.removeFromParent();o.traverse((child:any)=>{if(child.geometry)child.geometry.dispose();});}
    for(const block of ['stone','coal_ore','iron_ore'])assert.ok(found.some(id=>WORLD_SCENES.cave.nodes.find(n=>'node:'+n.id===id)?.block===block), block);
    assert.ok(found.length>30,'walls provide many real mining targets within bounded turns');
    const legacy={id:'legacy-cave-furnace',kind:'furnace' as const,facing:'south' as const,cell:[-5,0,1] as [number,number,number],contents:emptyFurnace()};
    legacy.contents.data.input={id:'minecraft:oak_log',count:3};state.progress.scenes.cave.stations=[legacy];
    const saved=JSON.stringify(legacy);authored.sync(state.progress);
    const device=models.device(legacy.kind,legacy.facing,false);device.position.set(...legacy.cell);device.userData.id=legacy.id;view.persistent.add(device);
    view.camera.position.set(-2,1.62,2);
    assert.ok(reachable(view,device),'existing persistent device retains a visible native surface');assert.equal(JSON.stringify(state.progress.scenes.cave.stations[0]),saved);
    device.traverse((child:any)=>{if(child.geometry)child.geometry.dispose();});
    authored.dispose();for(const m of models.materials.values())m.dispose();
});
