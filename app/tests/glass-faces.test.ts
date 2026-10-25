/** Real native glass geometry hides shared faces while retaining complete physical block volumes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {initialState} from '../web/src/domain/state.ts';
import {glassCells,glassFaces} from '../web/src/render/glass-faces.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import {VanillaModels} from '../web/src/render/vanilla-models.ts';
import {placedModel} from '../web/src/render/placed-world.ts';
import {compileModel,resolveModel} from '../web/src/render/model-format.ts';
import type {Resources} from '../web/src/render/resources.ts';
import type {Cell} from '../web/src/domain/types.ts';

/** Build actual model geometry with CPU materials and the tracked original resource documents.
 * @return {{pack:Resources,models:VanillaModels}} Native sample compiler without browser or GPU dependencies.
 */
function nativeGlass(){
    const documents=new Map<string,any>(),root=new URL('../../resources/minecraft/26.3/',import.meta.url);
    for(const path of ['blockstates/glass.json','models/block/glass.json','models/block/cube_all.json','models/block/cube.json','models/block/block.json'])documents.set('assets/minecraft/'+path,JSON.parse(readFileSync(new URL('assets/minecraft/'+path,root),'utf8')));
    const variant={model:'minecraft:block/glass'},compiled=compileModel(resolveModel(variant.model,id=>documents.get('assets/minecraft/models/'+id.split(':')[1]+'.json')),variant);
    const pack={documents,samples:[{id:'glass',block:'glass',state:'',variant,compiled}]} as Resources;
    const models=Object.create(VanillaModels.prototype) as VanillaModels;
    Object.assign(models,{pack,materials:new Map([['minecraft:block/glass',new MeshBasicMaterial()]]),created:0,released:0});
    return {pack,models};
}

test('placed glass removes both touching faces, restores exposed faces and keeps native collision boxes',()=>{
    const {pack,models}=nativeGlass(),p=initialState().progress;
    p.scenes[p.scene].blocks=[{id:'a',block:'glass',cell:[0,0,0],state:{}},{id:'b',block:'glass',cell:[1,0,0],state:{}}];
    const cells=glassCells(p),world=new Group();
    for(const b of p.scenes[p.scene].blocks!){const object=placedModel(b,pack,models,cells);world.add(object);assert.deepEqual(object.userData.collisionShapes,[[0,0,0,1,1,1]]);assert.equal((object.children[0].children[0] as Mesh).geometry.index!.count,30);}
    world.updateMatrixWorld(true);
    assert.equal(new Raycaster(new Vector3(.5,.5,.5),new Vector3(1,0,0),0,.75).intersectObject(world,true).length,0);
    p.scenes[p.scene].blocks!.pop();const exposed=placedModel(p.scenes[p.scene].blocks![0],pack,models,glassCells(p));
    assert.equal((exposed.children[0].children[0] as Mesh).geometry.index!.count,36);
    assert.ok(glassFaces([0,0,0],glassCells(p)).includes('east'));
});

test('authored windows and placed glass cull at their shared boundary without shrinking solid or weather cells',()=>{
    const {pack,models}=nativeGlass(),p=initialState().progress;p.scene='home';
    p.scenes.home.blocks=[{id:'adjacent',block:'glass',cell:[0,2,-8],state:{}}];
    const cells=glassCells(p),authored=new AuthoredWorld(models,pack);authored.homeRoot=new Group();
    authored.homeInterior([{block:'glass',cell:[0,2,-9],state:''}],cells);
    const mesh=authored.homeRoot.children[0] as Mesh;
    assert.deepEqual(mesh.userData.cells,[[0,2,-9]]);assert.equal(mesh.userData.blocksRain,true);
    assert.deepEqual(mesh.geometry.boundingBox!.min.toArray(),[0,0,0]);assert.deepEqual(mesh.geometry.boundingBox!.max.toArray(),[1,1,1]);
    assert.ok(!glassFaces([0,2,-9],cells).includes('south'));assert.ok(!glassFaces([0,2,-8],cells).includes('north'));
    const before=mesh.geometry.index!.count;p.scenes.home.blocks=[];
    authored.homeInterior([{block:'glass',cell:[0,2,-9],state:''}],glassCells(p));
    assert.equal((authored.homeRoot.children[0] as Mesh).geometry.index!.count,before+6);
});

test('fully surrounded glass keeps full collision even with no rendered faces',()=>{
    const {pack,models}=nativeGlass(),cells=new Set<string>();
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)cells.add([x,y,z].join(','));
    assert.deepEqual(glassFaces([0,0,0],cells),[]);
    const b={id:'inner',block:'glass',cell:[0,0,0] as Cell,state:{}},object=placedModel(b,pack,models,cells);
    assert.equal((object.children[0].children[0] as Mesh).geometry.index!.count,0);
    assert.equal(object.userData.collision,true);
    assert.deepEqual(object.userData.collisionShapes,[[0,0,0,1,1,1]]);
});
