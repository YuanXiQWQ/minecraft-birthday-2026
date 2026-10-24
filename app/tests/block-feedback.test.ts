/** Locked native particle equations, sheet projection and retained source geometry regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,BufferGeometry,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,Texture,Vector3,CustomBlending,DstColorFactor,SrcColorFactor} from 'three';
import {resources} from '../tools/resources.ts';
import {BlockFeedback,crackUv,particleSprite} from '../web/src/render/block-feedback.ts';
import {terrainBurst,tickTerrainFragment} from '../web/src/render/terrain-fragments.ts';
import {NativeRandom} from '../web/src/domain/environment.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import {initialState} from '../web/src/domain/state.ts';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {FULL_BLOCK,nativeShapes} from '../web/src/domain/block-shapes.ts';
import {SceneView} from '../web/src/render/scene.ts';
import type {Resources} from '../web/src/render/resources.ts';
import type {VanillaModels} from '../web/src/render/vanilla-models.ts';

test('full cube destruction creates 64 volume samples with native lifetime, size, quarter sprite and gravity',()=>{
    const random=new NativeRandom(123),particles=terrainBurst([FULL_BLOCK],[2,3,4],()=>random.float());
    assert.equal(particles.length,64);assert.equal(new Set(particles.map(p=>p.position.join(','))).size,64);
    for(const p of particles){assert.ok(p.lifetime>=4&&p.lifetime<=40);assert.ok(p.halfSize>=.05&&p.halfSize<=.1);assert.ok(p.u>=0&&p.u<3&&p.v>=0&&p.v<3);assert.ok(p.position[0]>2&&p.position[0]<3);}
    const p=particles[0],before=[...p.velocity];tickTerrainFragment(p,[]);
    assert.equal(p.velocity[1],(before[1]-.04)*Math.fround(.98));
    for(let i=0;i<41;i++)tickTerrainFragment(p,[]);assert.ok(p.age>p.lifetime);
    assert.equal(terrainBurst([[0,0,0,1,.5,1]],[0,0,0],()=>random.float()).length,32);
    assert.equal(terrainBurst(nativeShapes('wheat',{age:'0'})!,[0,0,0],()=>random.float()).length,32);
});

test('native particle model references resolve using the complete ordinary-build resource union',()=>{
    const files=resources(),documents=new Map([...files].filter(([p])=>p.includes('/models/')&&p.endsWith('.json')||p.includes('/blockstates/')&&p.endsWith('.json')).map(([p,b])=>[p,JSON.parse(Buffer.from(b).toString())]));
    const pack={documents} as unknown as Resources;
    for(const block of new Set(Object.values(WORLD_SCENES).flatMap(s=>s.nodes.map(n=>n.block)).filter(b=>!['cow','egg'].includes(b)))){
        const {texture}=particleSprite(pack,block);assert.ok(files.has('assets/minecraft/textures/'+texture.split(':')[1]+'.png'),texture);
    }
    assert.equal(particleSprite(pack,'crafting_table').texture,'minecraft:block/crafting_table_front');
    assert.equal(particleSprite(pack,'grass_block').texture,'minecraft:block/dirt');
    assert.equal(particleSprite(pack,'grass_block').tinted,false);
    assert.notEqual(particleSprite(pack,'tall_grass',{half:'upper'}).texture,particleSprite(pack,'tall_grass',{half:'lower'}).texture);
    assert.equal(particleSprite(pack,'wheat',{age:'7'}).texture,'minecraft:block/wheat_stage7');
});

test('hit fragments preserve frozen placed properties and distinguish the upper half of combined natural grass',()=>{
    const progress=initialState().progress,properties=Object.freeze({half:'upper'});progress.scenes.plains.blocks=[{id:'placed',block:'tall_grass',cell:[0,0,0],state:properties}];
    const events:unknown[][]=[],view=Object.assign(Object.create(SceneView.prototype),{environmentProgress:progress,worldId:'plains',collision:[],renderer:{domElement:{dataset:{}}},feedbackEffects:{batches:[],hit:(...args:unknown[])=>events.push(args)},requestRender(){}}) as SceneView;
    view.hitEffect({id:'placed',cell:[0,0,0],normal:[0,0,1],point:[.5,.5,1]},'tall_grass');
    assert.equal((events[0][3] as any).half,'upper');assert.deepEqual(properties,{half:'upper'});
    view.hitEffect({id:'node:grass',cell:[0,0,0],normal:[0,0,1],point:[.5,1.5,1]},'tall_grass');
    assert.deepEqual(events[1][1],[0,1,0]);assert.equal((events[1][3] as any).half,'upper');
});

test('crack stages retain one mesh, use projected UV independent of original UV, and native multiplicative blend',()=>{
    const maps=new Map(Array.from({length:10},(_,i)=>['minecraft:block/destroy_stage_'+i,{map:new Texture()}]));
    const effect=new BlockFeedback({} as Resources,{textures:maps} as unknown as VanillaModels,new Scene(),new PerspectiveCamera(),null);
    const target=new Group(),geometry=new BoxGeometry(1,1,1);geometry.translate(.5,.5,.5);target.add(new Mesh(geometry,new MeshBasicMaterial()));target.userData.cell=[0,0,0];
    effect.showCrack(target,0);const mesh=effect.crack!.children[0] as Mesh<BufferGeometry,MeshBasicMaterial>;
    assert.equal(mesh.material.blending,CustomBlending);assert.equal(mesh.material.blendSrc,DstColorFactor);assert.equal(mesh.material.blendDst,SrcColorFactor);assert.equal(mesh.material.alphaTest,.1);
    effect.showCrack(target,9);assert.equal(effect.crack!.children[0],mesh);assert.equal(mesh.material.map,maps.get('minecraft:block/destroy_stage_9')!.map);
    for(const normal of [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]])assert.ok(crackUv(new Vector3(.25,.5,.75),new Vector3(...normal)).every(Number.isFinite));
    let disposed=0;geometry.addEventListener('dispose',()=>disposed++);effect.dispose();assert.equal(disposed,0);geometry.dispose();
});

test('removing one meadow source preserves unrelated native mesh identity and static decoration',()=>{
    const world=Object.assign(Object.create(AuthoredWorld.prototype),{natural:new Group(),crops:new Group(),staticRoot:new Group(),signature:'',plainsDecor:null,plainsSignature:'',soilSignature:'[]',staticVersion:0}) as AuthoredWorld;
    world.block=()=>{const root=new Group();root.add(new Mesh(new BoxGeometry(),new MeshBasicMaterial()));return root;};world.animal=world.block as any;world.egg=world.block as any;
    const progress=initialState().progress;world.sync(progress);
    const first=WORLD_SCENES.plains.nodes.find(n=>n.block==='short_grass')!,other=world.natural.children.find(o=>o.userData.id!== 'node:'+first.id)!;
    const geometry=(other.children[0] as Mesh).geometry;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
    progress.world.visits.plains.removed.push(first.id);world.sync(progress);
    assert.ok(world.natural.children.includes(other));assert.equal(disposed,0);assert.equal(world.staticVersion,0);
    const stages:string[]=[];world.block=(_block,state='')=>{stages.push(state);return new Group();};
    const crop={id:'dry-wheat',item:'minecraft:wheat_seeds',cell:[14,2,5] as [number,number,number],growth:{version:1 as const,data:{ticks:35,age:1}}};
    progress.scenes.plains.crops.push(crop);world.sync(progress);assert.equal(stages.at(-1),'age=1');assert.equal(world.crops.children[0].position.y,2-.0625);
    crop.growth.data.age=3;crop.growth.data.ticks=103;world.sync(progress);assert.equal(stages.at(-1),'age=3');assert.equal(world.crops.children.length,1);
    world.dispose();assert.equal(disposed,1);
});
