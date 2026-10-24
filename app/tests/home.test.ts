/** Home layout regression covers saved construction space, real weather heightmaps and native light propagation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry, Group, Mesh, PerspectiveCamera} from 'three';
import {homeStructure,currentHome,homeFloor,HOME_LIGHTS,HOME_BARRIERS} from '../web/src/domain/home-shape.ts';
import {WORLD_REGION,WORLD_SCENES,supported,sourceOccupied} from '../web/src/domain/world-config.ts';
import {blockAt} from '../web/src/domain/placed-blocks.ts';
import {readFileSync} from 'node:fs';
import {resolveModel,compileModel} from '../web/src/render/model-format.ts';
import {initialState,transition} from '../web/src/domain/state.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {NativePrecipitation} from '../web/src/render/native-precipitation.ts';
import {BlockLight} from '../web/src/render/block-light.ts';
import type {Cell,Station} from '../web/src/domain/types.ts';
import type {Bounds} from '../web/src/domain/player-motion.ts';
import {PlayerMotion,playerBounds,overlaps} from '../web/src/domain/player-motion.ts';

test('home encloses the room with glass and continuous walls while leaving the main work area clear',()=>{
    const cells=homeStructure(),keys=new Set(cells.map(b=>b.cell.join(',')));
    assert.equal(keys.size,cells.length);
    assert.deepEqual(WORLD_SCENES.home.eye,[0,1.62,7]);
    const p=initialState().progress;p.scene='home';
    for(let x=-3;x<=3;x++)for(let y=2;y<=4;y++)assert.equal(blockAt(p,[x,y,-9])?.block,'glass');
    assert.equal(blockAt(p,[0,0,10])?.block,'spruce_log');
    for(const z of [6,7])for(let y=0;y<=2;y++)assert.ok(blockAt(p,[11,y,z]));
    for(let z=0;z<=9;z++)for(let y=0;y<=2;y++)assert.equal(blockAt(p,[0,y,z]),null);
    for(const c of cells)assert.equal(sourceOccupied(p,c.cell),true);
    for(const cell of [[3,0,-2],[4,0,-2],[5,0,-2],[-7,0,1],[0,0,-15],[6,6,-4]] as Cell[]){
        assert.equal(WORLD_REGION.allows('home',{cell} as Station),true);
        assert.equal(sourceOccupied(p,cell),false);
        if(cell[1]===0)assert.equal(supported(p,cell),true);
    }
    assert.equal(homeFloor(0,-15),'grass_block');
    assert.equal(homeFloor(0,-3),'oak_planks');
});

test('home boundaries prevent outdoor travel through saved-object clearances and detect outside saved poses',()=>{
    const motion=new PlayerMotion();motion.reset([10,1.62,7]);
    const floor:Bounds=[-19,-1,-23,20,0,12];
    for(let i=0;i<80;i++)motion.tick(new Set(['KeyD']),0,[floor,...HOME_BARRIERS]);
    assert.ok(motion.feet[0]<=10.7);
    for(const feet of [[12,0,7],[0,0,-15],[-12,0,0],[0,8,0]] as Cell[])assert.ok(HOME_BARRIERS.some(b=>overlaps(playerBounds(feet),b)));
    assert.equal(HOME_BARRIERS.some(b=>overlaps(playerBounds([0,0,7]),b)),false);
});

test('home preserves saved devices and blocks inside new furnishings, windows and rear walls',()=>{
    const p=initialState().progress;p.scene='home';
    p.scenes.home.stations=[{id:'rear-workbench',kind:'crafting_table',cell:[8,0,4],facing:'west',contents:{version:1,data:{grid:[{id:'minecraft:oak_planks',count:3},...Array(8).fill(null)]}}}];
    p.scenes.home.blocks=[{id:'window-block',block:'cobblestone',cell:[0,2,-9],state:{}},{id:'rear-block',block:'oak_planks',cell:[3,1,10],state:{}}];
    const before=structuredClone(p),cells=currentHome(p);
    for(const saved of [...p.scenes.home.stations,...p.scenes.home.blocks]){
        assert.equal(cells.has(saved.cell.join(',')),false);
        assert.equal(blockAt(p,saved.cell)?.id,saved.id);
        assert.equal(cells.has([saved.cell[0],saved.cell[1]+1,saved.cell[2]].join(',')),false);
    }
    assert.deepEqual(p,before);
});

test('all home native states compile through the ordinary manifest including glass sprite descriptors',()=>{
    const root=new URL('../../resources/minecraft/26.3/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('world-manifest.json',root),'utf8'));
    for(const b of homeStructure()){
        const sample=manifest.states.find((s:any)=>s.block===b.block&&s.state.includes(b.state));
        assert.ok(sample,b.block+':'+b.state);
        const model=resolveModel(sample.variant.model,id=>JSON.parse(readFileSync(new URL('assets/minecraft/models/'+id.split(':')[1]+'.json',root),'utf8')));
        assert.ok(compileModel(model,sample.variant).positions.length>0);
    }
});

test('home roof registers actual rain and snow blocking above the camera and all interior floors',()=>{
    const scenery=new Group();scenery.userData.cells=homeStructure().map(b=>b.cell);
    const p=initialState().progress;p.scene='home';
    const weather=Object.create(NativePrecipitation.prototype) as NativePrecipitation;
    weather.heightSignature='';weather.mesh=new Mesh(new BufferGeometry());
    const camera=new PerspectiveCamera();camera.position.set(...WORLD_SCENES.home.eye);
    for(const snow of [false,true]){
        weather.rebuild(camera,p,scenery,snow);
        for(let x=-10;x<=10;x++)for(let z=-8;z<=10;z++)assert.equal(weather.heights.get(x+':'+z),8);
        const positions=weather.mesh.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(x>=-10&&x<=10&&z>=-8&&z<=10)assert.ok(positions.getY(i)>=8);}
    }
    weather.mesh.geometry.dispose();
});

test('native home lighting reaches empty table and device faces, with no source outside home',()=>{
    const field=new BlockLight(),solids=homeStructure().map(b=>[...b.cell,...b.cell.map(v=>v+1)] as Bounds);
    field.rebuild(HOME_LIGHTS.map(cell=>({cell,level:15})),solids);
    for(const cell of [[0,2,-3],[3,1,-2],[4,1,-2],[5,1,-2],[0,1,7]] as Cell[])assert.ok(field.at(cell)>=3,cell.join(','));
    field.rebuild([],solids);assert.equal(field.at([0,2,-3]),0);field.dispose();
});

test('birthday commits consume once, retain devices and survive the ordinary save codec',async()=>{
    const state=initialState(),p=state.progress;p.scene='home';p.unlocked=['minecraft:cake'];
    p.player.data.hotbar[0]={id:'minecraft:cake',count:1};p.player.data.hotbar[1]={id:'minecraft:cake',count:1};
    p.scenes.home.stations=[{id:'saved-home-bench',kind:'crafting_table',cell:[-7,0,1],facing:'east',contents:{version:1,data:{grid:Array(9).fill(null)}}}];
    const command={type:'record-cake-placement',scene:'home',table:'birthday-table'} as const;
    const first=transition(state,command,WORLD_REGION);assert.equal(first.state.progress.player.data.hotbar[0],null);
    assert.equal(first.events.filter(e=>e.type==='cake-placed').length,1);
    const selected=structuredClone(first.state);selected.progress.player.data.selected=1;
    const repeated=transition(selected,command,WORLD_REGION);assert.equal(repeated.state.progress.player.data.hotbar[1]?.count,1);
    assert.equal(repeated.events.filter(e=>e.type==='cake-placed').length,0);
    const restored=await decode(JSON.stringify(await seal(repeated.state,'home-repeat',0)));
    assert.deepEqual(restored.envelope.state.progress.cakePlacement,{scene:'home',table:'birthday-table'});
    assert.deepEqual(restored.envelope.state.progress.scenes.home.stations,p.scenes.home.stations);
});
