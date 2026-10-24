/** Farm spatial facts, native source identities, compatibility and persistence regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {farmLayout,currentFarm,FARM_PLOTS} from '../web/src/domain/farm-shape.ts';
import {initialState,transition} from '../web/src/domain/state.ts';
import {WORLD_SCENES,WORLD_REGION,supported,sourceOccupied} from '../web/src/domain/world-config.ts';
import {blockAt} from '../web/src/domain/placed-blocks.ts';
import {emptyFurnace,inputChanged} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {seal,decode} from '../web/src/persistence/codec.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Cell} from '../web/src/domain/types.ts';
/** Locked recipe facts establish valid retained furnace inputs. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8'));

test('farm retains nine planting identities and every original finite source',()=>{
    assert.deepEqual(WORLD_SCENES.farm.eye,[0,1.62,7]);assert.deepEqual(WORLD_SCENES.farm.target,[0,.8,-4]);
    assert.deepEqual(FARM_PLOTS,[-2,-4,-6].flatMap(z=>[-5,-4,-3].map(x=>[x,0,z])));
    assert.deepEqual(WORLD_SCENES.farm.nodes.map(n=>[n.id,n.cell]),[['sugar_cane:0',[7,0,-3]],['sugar_cane:1',[7,0,-4]],['sugar_cane:2',[7,0,-5]],['cow:0',[2,0,-5]],['chicken-egg:0',[4,0,-2]],['chicken-egg:1',[5,0,-3]]]);
});
test('one farm cell map supplies nonoverlapping surfaces, exact native roof states and open target lanes',()=>{
    const l=farmLayout();assert.equal(l.water.length,11);
    for(const c of FARM_PLOTS){const soil=l.cells.get([c[0],-1,c[2]].join(','))!;assert.equal(soil.block,'farmland');assert.equal(soil.rainTop,-.0625);assert.ok(!l.cells.has(c.join(',')));}
    assert.equal(l.cells.get('-1,-1,3')!.block,'dirt_path');
    assert.ok([...l.cells.values()].filter(b=>b.block==='oak_stairs').every(b=>b.state.shape==='straight'&&b.state.half==='bottom'&&['east','west'].includes(b.state.facing)));
    assert.equal(Math.max(...[...l.cells.values()].filter(b=>b.block==='oak_stairs'||b.block==='oak_slab').map(b=>b.rainTop)),4.5);
    for(const c of [[4,0,-4],[6,0,-5],...WORLD_SCENES.farm.nodes.map(n=>n.cell)] as Cell[])assert.ok(!l.cells.has(c.join(',')),c.join(','));
    for(let x=1;x<=7;x++)for(let z=-2;z<=3;z++)assert.ok(!l.cells.has([x,0,z].join(',')),'open front');
});
test('old equipment at fences, pillars, canals and roof keeps contents, actual support and effective occupancy',async()=>{
    const s=initialState(),p=s.progress;p.scene='farm';p.unlocked=['minecraft:furnace','minecraft:oak_log','minecraft:wheat_seeds'];
    p.scenes.farm.stations=([[3,0,-7],[-6,0,-8],[-6,0,-4],[-8,5,-10]] as Cell[]).map((cell,i)=>{const contents=emptyFurnace();contents.data.input={id:'minecraft:oak_log',count:3};inputChanged(contents.data,null,'furnace',rules);return{id:'legacy-farm-'+i,kind:'furnace',cell,facing:'south',contents};});
    p.scenes.farm.crops=[{id:'retained-crop',item:'minecraft:wheat_seeds',cell:FARM_PLOTS[8],growth:{version:1,data:{ticks:160}}}];
    p.world.visits.farm.removed=['sugar_cane:0','chicken-egg:1'];
    const before=JSON.stringify(p),layout=currentFarm(p);
    for(const device of p.scenes.farm.stations){assert.ok(!layout.cells.has(device.cell.join(',')));assert.equal(supported(p,device.cell),true);assert.equal(blockAt(p,device.cell)?.id,device.id);}
    assert.equal(blockAt(p,[-6,-1,-4])?.block,'grass_block');assert.ok(!layout.water.some(c=>c[0]===-6&&c[2]===-4));
    assert.equal(sourceOccupied(p,[3,0,-6]),false);assert.equal(WORLD_REGION.allows('farm',{...p.scenes.farm.stations[0],cell:[3,0,-6]}),true);
    assert.equal(JSON.stringify(p),before);const envelope=await seal(s,'farm-test',0),restored=await decode(JSON.stringify(envelope));
    assert.deepEqual(restored.envelope.state.progress.scenes.farm,p.scenes.farm);assert.deepEqual(restored.envelope.state.progress.world.visits.farm,p.world.visits.farm);
    const other=transition(s,{type:'select-scene',scene:'home'},WORLD_REGION).state;
    assert.deepEqual(other.progress.scenes.farm,p.scenes.farm);
});
test('farm water never supports devices; growth and unrelated inventory snapshots retain layout identity',()=>{
    const p=initialState().progress;p.scene='farm';const l=currentFarm(p);
    assert.equal(blockAt(p,[8,-1,-3])?.block,'water');assert.equal(supported(p,[8,0,-3]),false);assert.equal(supported(p,[-6,0,-4]),false);
    assert.equal(supported(p,[-5,0,-4]),true);
    for(const ticks of [0,80,160,240]){p.scenes.farm.crops=[{id:'growth',item:'minecraft:wheat_seeds',cell:FARM_PLOTS[0],growth:{version:1,data:{ticks}}}];assert.equal(currentFarm(p),l);}
});
test('farm original model states and exporter bytes remain declared and hash locked',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/world-manifest.json',import.meta.url),'utf8'));
    for(const block of ['oak_stairs','oak_slab','hay_block','lantern'])assert.ok(manifest.states.some((s:any)=>s.block===block));
    for(const path of ['blockstates/oak_fence.json','models/block/oak_fence_post.json','models/block/oak_fence_side.json','textures/block/water_still.png.mcmeta'])assert.ok(manifest.inputs['assets/minecraft/'+path]);
    assert.equal(manifest.exporterSha256,createHash('sha256').update(readFileSync(new URL('../tools/world-assets.ts',import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex'));
});

test('legacy farm equipment keeps actual hopper input/fuel ports after local fence carving',()=>{
    const s=initialState(),p=s.progress;p.scene='farm';p.unlocked=['furnace','hopper','oak_log','coal'].map(i=>'minecraft:'+i);
    const top=emptyHopper(),side=emptyHopper();top.data.slots[0]={id:'minecraft:oak_log',count:3};side.data.slots[0]={id:'minecraft:coal',count:2};
    p.scenes.farm.stations=[{id:'farm-furnace',kind:'furnace',cell:[3,0,-7],facing:'south',contents:emptyFurnace()},{id:'farm-top',kind:'hopper',cell:[3,1,-7],facing:'down',contents:top},{id:'farm-side',kind:'hopper',cell:[4,0,-7],facing:'west',contents:side}];
    for(const d of p.scenes.farm.stations){assert.ok(supported(p,d.cell));assert.ok(!currentFarm(p).cells.has(d.cell.join(',')));}
    const next=transition(s,{type:'processing-tick',ticks:16},WORLD_REGION,rules).state.progress.scenes.farm.stations;
    const contents=next[0].contents;assert.equal(contents.version,2);if(contents.version!==2)throw Error('furnace');
    assert.equal(contents.data.input?.id,'minecraft:oak_log');assert.ok(contents.data.burn>0);assert.ok(contents.data.cook>0);
    assert.deepEqual(next.map(d=>[d.id,d.cell]),p.scenes.farm.stations.map(d=>[d.id,d.cell]));
});
