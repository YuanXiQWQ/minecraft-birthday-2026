/** Cave decoration, local illumination and save compatibility use production domain and geometry paths. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial} from 'three';
import {caveLayout, caveSolid, CAVE_TORCHES} from '../web/src/domain/cave-shape.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {WORLD_REGION, WORLD_SCENES, sourceOccupied, supported} from '../web/src/domain/world-config.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {seal, decode} from '../web/src/persistence/codec.ts';
import {lightCave, caveLight} from '../web/src/render/cave-lighting.ts';
import {placement} from '../web/src/ui/world-use.ts';
import type {Cell, Station} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Locked native rules shared with real commands. */
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url),'utf8')) as Rules;
/** Make one bounded persisted device sample.
 * @param {Cell} cell Authored sample coordinate.
 * @return {Station} Valid empty furnace suitable for a new placement command.
 */
function furnace(cell: Cell): Station {
    const contents=emptyFurnace();
    return {id:'cave-saved-furnace',kind:'furnace',cell,facing:'south',contents};
}

test('cave source identity, order and coordinates remain exact; thick rock and wood do not overlap them',()=>{
    assert.deepEqual(WORLD_SCENES.cave.nodes.map(n=>[n.id,n.cell]),[
        ['stone:0',[-6,0,-3]],['stone:1',[-5,0,-3]],['stone:2',[-4,0,-3]],['stone:3',[-6,1,-4]],['stone:4',[-5,1,-4]],
        ['coal_ore:0',[-4,1,-5]],['coal_ore:1',[-3,0,-4]],['coal_ore:2',[-3,1,-5]],
        ['iron_ore:0',[-2,0,-4]],['iron_ore:1',[-1,0,-4]],['iron_ore:2',[-2,1,-5]],['iron_ore:3',[-1,1,-5]]]);
    const layout=caveLayout();assert.equal(layout.torches.length,2);assert.equal(layout.wood.length,4);
    for(const n of WORLD_SCENES.cave.nodes) assert.equal(caveSolid(n.cell),false,n.id);
    for(const c of layout.wood) assert.ok(caveSolid(c));
    assert.ok(layout.stone.some(c=>c.join(',')==='-2,1,-6'));
});

test('old devices remove conflicting wood, torch, light and support without moving their saved facts',()=>{
    for(const cell of [[-5,0,1],...CAVE_TORCHES.flatMap(t=>[t.cell,t.wall])] as Cell[]) {
        const station=furnace(cell), saved=JSON.stringify(station), layout=caveLayout([cell]);
        assert.ok(![...layout.stone,...layout.wood,...layout.torches.map(t=>t.cell)].some(c=>c.join(',')===cell.join(',')));
        for(const t of layout.torches) assert.ok([...layout.stone,...layout.wood].some(c=>c.join(',')===t.wall.join(',')));
        assert.equal(JSON.stringify(station),saved);
    }
    assert.equal(caveLayout([[5,1,-1]]).torches.length,1);
});

test('torch occupancy rejects preview and commit, never grants full-block top support',()=>{
    const state=initialState();state.progress.scene='cave';state.progress.unlocked=['minecraft:furnace'];
    state.progress.player.data.hotbar[0]={id:'minecraft:furnace',count:2};
    for(const t of CAVE_TORCHES) {
        state.progress.scenes.cave.stations=[{...furnace([t.cell[0],t.cell[1]-1,t.cell[2]]),id:'support'}];
        assert.ok(sourceOccupied(state.progress,t.cell));
        assert.equal(supported(state.progress,[t.cell[0],t.cell[1]+1,t.cell[2]]),false);
        const hit={id:'scenery',cell:[t.cell[0],t.cell[1]-1,t.cell[2]] as Cell,point:t.cell,normal:[0,1,0] as Cell};
        assert.equal(placement(hit,{view:{envelope:{state}}} as any,'furnace','south').valid,false);
        assert.throws(()=>transition(state,{type:'put-station',scene:'cave',station:furnace(t.cell),expected:state.progress.player.data},WORLD_REGION,rules),/occupied-resource/);
    }
    state.progress.scenes.cave.stations=[];
    const target:Cell=[3,0,0], hit={id:'ground',cell:[3,-1,0] as Cell,point:target,normal:[0,1,0] as Cell};
    assert.equal(placement(hit,{view:{envelope:{state}}} as any,'furnace','south').valid,true);
    assert.equal(transition(state,{type:'put-station',scene:'cave',station:furnace(target),expected:state.progress.player.data},WORLD_REGION,rules).state.progress.scenes.cave.stations.length,1);
});

test('cave colors are stable through repeated sync and light removal; native materials and other geometry remain pristine',()=>{
    const material=new MeshBasicMaterial({vertexColors:true}), geometry=new BoxGeometry(), base=new Float32Array(geometry.getAttribute('position').count*3).fill(.72);
    geometry.setAttribute('color',new Float32BufferAttribute(base,3));
    const root=new Group(), mesh=new Mesh(geometry,material), other=new Mesh(geometry.clone(),material);
    mesh.position.set(-4,1,-4);root.add(mesh);
    const instances=new InstancedMesh(geometry.clone(),material,2);instances.setMatrixAt(0,new Matrix4().makeTranslation(4,1,-1));instances.setMatrixAt(1,new Matrix4().makeTranslation(-4,1,-12));root.add(instances);
    const lights=caveLayout().torches.map(t=>t.light);lightCave(root,lights);
    const lit=Array.from(mesh.geometry.getAttribute('color').array), instance=Array.from(instances.instanceColor!.array);
    for(let i=0;i<20;i++)lightCave(root,lights);
    assert.deepEqual(Array.from(mesh.geometry.getAttribute('color').array),lit);assert.deepEqual(Array.from(instances.instanceColor!.array),instance);
    lightCave(root,[]);lightCave(root,lights);assert.deepEqual(Array.from(mesh.geometry.getAttribute('color').array),lit);
    assert.equal(material.color.getHex(),0xffffff);assert.deepEqual(Array.from(other.geometry.getAttribute('color').array),Array.from(base));
    assert.ok(caveLight([-4,1,-12],lights).r<caveLight([-4,1,-4],lights).r*.4);
    for(const o of [mesh,other,instances])o.geometry.dispose();instances.dispose();material.dispose();
});

test('mined source save reload, same-scene selection and cross-scene recovery preserve an occupying device',async()=>{
    let state=initialState();state.progress.scene='cave';state.progress.unlocked=['minecraft:furnace','minecraft:stone_pickaxe'];
    state.progress.player.data.hotbar[0]={id:'minecraft:stone_pickaxe',count:1};
    state=transition(state,{type:'harvest-node',scene:'cave',node:'iron_ore:1',visit:0,expected:state.progress.player.data},WORLD_REGION,rules).state;
    const before=state.progress.world.visits.cave;
    state=(await decode(JSON.stringify(await seal(state,'cave-test',1)))).envelope.state;
    assert.deepEqual(state.progress.world.visits.cave,before);
    state=transition(state,{type:'select-scene',scene:'cave'},WORLD_REGION,rules).state;assert.deepEqual(state.progress.world.visits.cave,before);
    state=structuredClone(state);state.progress.player.data.hotbar[0]={id:'minecraft:furnace',count:1};
    state=transition(state,{type:'put-station',scene:'cave',station:furnace([-1,0,-4]),expected:state.progress.player.data},WORLD_REGION,rules).state;
    const saved=JSON.stringify(state.progress.scenes.cave.stations);
    for(const scene of ['home','cave'] as const)state=transition(state,{type:'select-scene',scene},WORLD_REGION,rules).state;
    assert.equal(JSON.stringify(state.progress.scenes.cave.stations),saved);assert.deepEqual(state.progress.world.visits.cave.removed,[]);
});

test('right cave work pocket admits real top/side hopper ports and finite furnace processing',()=>{
    const state=initialState();state.progress.scene='cave';state.progress.unlocked=['furnace','hopper','oak_log','coal'].map(i=>'minecraft:'+i);
    const top=emptyHopper(),side=emptyHopper();top.data.slots[0]={id:'minecraft:oak_log',count:3};side.data.slots[0]={id:'minecraft:coal',count:2};
    state.progress.scenes.cave.stations=[furnace([3,0,0]),{id:'top',kind:'hopper',cell:[3,1,0],facing:'down',contents:top},{id:'side',kind:'hopper',cell:[4,0,0],facing:'west',contents:side}];
    for(const s of state.progress.scenes.cave.stations){assert.ok(WORLD_REGION.allows('cave',s));assert.ok(supported(state.progress,s.cell));assert.equal(sourceOccupied(state.progress,s.cell),false);}
    const next=transition(state,{type:'processing-tick',ticks:16},WORLD_REGION,rules).state.progress.scenes.cave.stations;
    const output=next.find(s=>s.kind==='furnace')!.contents;assert.equal(output.version,2);if(output.version!==2)throw Error('furnace');
    assert.equal(output.data.input?.id,'minecraft:oak_log');assert.ok(output.data.burn>0);assert.ok(output.data.cook>0);
});
