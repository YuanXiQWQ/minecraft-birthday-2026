/** Domain, conversion and owned-geometry regressions using independent debug fixtures, not vanilla assets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { EYE_STATIONS, setEyeView } from '../web/src/camera.ts';
import { change, edges, fixture, place, restore } from '../web/src/domain.ts';
import { compileModel, resolveModel, resolveTexture, resourceId } from '../web/src/model-format.ts';
import { candidateCell } from '../web/src/scene-adapter.ts';
import { DebugModels } from '../web/src/debug-models.ts';
import { summarize } from '../web/src/metrics.ts';
import type { ModelSource } from '../web/src/model-format.ts';

/** A deliberately small original test prism, unrelated to any Minecraft source model. */
const prism: ModelSource={textures:{surface:'debug:plain'},elements:[{from:[0,0,0],to:[8,16,4],faces:{north:{texture:'#surface'},east:{texture:'#surface'},up:{texture:'#surface'}}}]};

test('C01 resize preserves eye position and central composition across desktop and portrait',()=>{
  const camera=new PerspectiveCamera(70,1,.1,100);
  for(const aspect of [1440/900,1280/720,360/740]) for(const view of ['Front','Left','Right'] as const) {
    camera.aspect=aspect; setEyeView(camera,view);
    assert.deepEqual(camera.position.toArray(),[...EYE_STATIONS[view]]);
    const focus=new Vector3(.5,1.35,.5).project(camera);
    assert.ok(Math.abs(focus.x)<1e-10 && Math.abs(focus.y)<1e-10);
    assert.ok(Math.abs(camera.getWorldDirection(new Vector3()).y)<.1);
  }
});

test('D01 authored bounds, occupied and protected cells reject without mutation',()=>{
  const state=fixture(), before=JSON.stringify(state);
  for(const cell of [[9,0,0],[-4,0,-3],[0,1,0],[.5,0,0]] as [number,number,number][]) assert.throws(()=>place(state,'furnace',cell,'north'));
  assert.equal(JSON.stringify(state),before);
});
test('D02 placement allocates independent stable instances',()=>{
  const state=place(fixture(),'furnace',[2,0,2],'east'); assert.equal(state.instances.length,8); assert.equal(state.nextId,9);
  assert.equal(state.instances.at(-1)!.id,'w8'); assert.equal(fixture().instances.length,7);
});
test('D03 hopper has five possible outlet directions, no upward or downward furnace',()=>{
  assert.throws(()=>place(fixture(),'furnace',[2,0,2],'down'));
  assert.throws(()=>place(fixture(),'hopper',[2,0,2],'up' as 'down'));
  assert.equal(place(fixture(),'hopper',[2,0,2],'down').instances.at(-1)!.facing,'down');
});
test('D04 furnace ports and hopper collector use independent coordinate adjacency',()=>{
  const links=edges(fixture()); assert.equal(links.length,4);
  assert.deepEqual(links.find(e=>e.from==='w3'),{from:'w3',to:'w2',face:'up',port:'input',action:'push'});
  assert.equal(links.find(e=>e.from==='w4')!.port,'fuel'); assert.equal(links.find(e=>e.to==='w5')!.port,'output');
});
test('D05 rotation and removal cannot retain stale graph edges',()=>{
  let state=change(fixture(),'w4','west'); assert.ok(!edges(state).some(e=>e.from==='w4'));
  state=change(state,'w2',null); assert.ok(!edges(state).some(e=>e.to==='w2'||e.from==='w2'));
  assert.throws(()=>change(state,'w2','north'));
});
test('D06 restore retains IDs, positions, orientation and derived edges',()=>{
  const state=change(place(fixture(),'hopper',[2,0,2],'west'),'w2','south'), copy=restore(JSON.stringify(state));
  assert.deepEqual(copy,state); assert.deepEqual(edges(copy),edges(state));
});
for(const [label,mutate] of [
  ['schema',(s:any)=>{s.schema=2;}],['overlap',(s:any)=>{s.instances[1].cell=s.instances[0].cell;}],
  ['direction',(s:any)=>{s.instances[0].facing='up';}],['ID',(s:any)=>{s.instances[1].id=s.instances[0].id;}],
  ['next ID',(s:any)=>{s.nextId=1;}],['kind',(s:any)=>{s.instances[0].kind='chest';}],
] as const) test(`D07 rejects corrupted ${label}`,()=>{const state=fixture();mutate(state);assert.throws(()=>restore(JSON.stringify(state)));});
test('P01 face selection respects negative cell coordinates and epsilon',()=>{
  assert.deepEqual(candidateCell([-.001,0,2.4],[0,1,0]),[-1,0,2]);
  assert.deepEqual(candidateCell([0,1,.5],[-1,0,0]),[-1,1,0]);
  assert.deepEqual(candidateCell([.5,1,.5],[0,1,0]),[0,1,0]);
});
test('M01 inherited textures override parents without appending replaced elements',()=>{
  const sources:Record<string,ModelSource>={'debug:base':prism,'debug:child':{parent:'debug:base',textures:{surface:'debug:alternate'}}};
  const compiled=compileModel(resolveModel('debug:child',id=>sources[id]));
  assert.equal(compiled.faces.length,3);assert.deepEqual(compiled.textures,['debug:alternate']);
  assert.equal(Math.max(...compiled.positions.filter((_,i)=>i%3===0)),.5);
});
test('M02 model-parent, texture-variable cycles and missing references fail explicitly',()=>{
  assert.throws(()=>resolveModel('debug:a',()=>({parent:'debug:a'})),/cycle/);
  assert.throws(()=>resolveTexture('#a',{a:'#b',b:'#a'}),/cycle/);
  assert.throws(()=>resolveTexture('#missing',{}),/missing/);
  assert.throws(()=>resourceId('minecraft:../../private'),/invalid/);
});
test('M03 rotated north face has east normal in Y-up render coordinates',()=>{
  const data=compileModel(prism,{model:'debug:prism',y:90});
  assert.deepEqual(data.normals.slice(0,3).map(v=>Math.round(v)||0),[1,0,0]);
  assert.ok(data.positions.every(Number.isFinite)); assert.ok(data.uvs.every(v=>v>=0&&v<=1));
});
test('M04 UV-lock and element rotations are rejected, not silently approximated',()=>{
  assert.throws(()=>compileModel(prism,{model:'debug:prism',uvlock:true}),/unsupported/);
  assert.throws(()=>compileModel({...prism,elements:[{...prism.elements![0],rotation:{axis:'x',angle:22.5}}]}),/unsupported/);
});
test('M05 original debug hopper is hollow and its outlet rotates toward east',()=>{
  const factory=new DebugModels(), model=factory.device('hopper','east'); model.updateMatrixWorld(true);
  const p=model.getObjectByName('outlet')!.getWorldPosition(new Vector3()); assert.ok(p.x>.7);
  const box=new Box3().setFromObject(model); assert.ok(box.max.y<1.01); assert.ok(model.children[0].children.length>1);
  factory.release(model); assert.equal(factory.created,factory.released); factory.dispose(); assert.equal(factory.materials.size,0);
});
test('R01 repeated model creation/release balances owned geometry and shared materials',()=>{
  const factory=new DebugModels(); for(let i=0;i<50;i++) factory.release(factory.device('furnace','west'));
  assert.equal(factory.created,factory.released); assert.equal(factory.materials.size,3); factory.dispose(); assert.equal(factory.materials.size,0);
});
test('T01 frame summary uses actual intervals and rejects empty or invalid samples',()=>{
  const s=summarize([10,20,30,40]); assert.equal(s.fps,40);assert.equal(s.p50Ms,20);assert.equal(s.maxMs,40);
  assert.throws(()=>summarize([])); assert.throws(()=>summarize([0]));
});
