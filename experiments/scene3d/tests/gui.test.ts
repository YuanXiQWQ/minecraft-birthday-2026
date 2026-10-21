/** Input candidates, live-resource dimensions and inherited GUI transforms have independent regression checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readVanillaResources } from '../tools/vanilla-resources.ts';
import { SlotExperiment, guiSlots } from '../web/src/gui-state.ts';
import { resolveModel } from '../web/src/model-format.ts';
import type { ModelSource } from '../web/src/model-format.ts';

test('Q10 right split, single placement, finite merge and unlock invariance',()=>{
  const s=new SlotExperiment('furnace');s.click('inv-0',2);assert.deepEqual(s.cursor,{item:'egg',count:5});assert.equal(s.groups['inv-0']?.count,4);
  s.click('input',2);assert.equal(s.groups.input?.count,1);assert.equal(s.cursor?.count,4);s.click('input',0);assert.equal(s.groups.input?.count,5);assert.equal(s.cursor,null);
  assert.deepEqual(s.unlocked,['egg','furnace']);s.click('result',0);assert.equal(s.cursor,null);s.click('fuel',0);assert.equal(s.cursor,null);
});
test('Q11 drag snapshots stay bounded with duplicate, full and unsupported slots',()=>{
  const s=new SlotExperiment('crafting_table');s.cursor={item:'egg',count:10};s.drag(['grid-0','grid-1','grid-2','grid-1','result'],0);
  assert.equal(s.cursor?.count,1);for(let i=0;i<3;i++)assert.equal(s.groups[`grid-${i}`]?.count,3);
  s.cursor={item:'egg',count:7};s.drag(['grid-0','grid-1','grid-2'],2);assert.equal(s.cursor?.count,4);assert.equal(s.groups['grid-0']?.count,4);
  s.groups['grid-0']={item:'egg',count:16};s.cursor={item:'egg',count:1};s.click('grid-0',0);assert.equal(s.cursor?.count,1);
});
test('Q12 clone, Shift research transfer, number swap and finite double collect',()=>{
  const s=new SlotExperiment('inventory');s.click('inv-0',1);assert.equal(s.cursor?.count,16);assert.equal(s.groups['inv-0']?.count,9);
  s.cursor=null;s.click('inv-1',0,true);assert.equal(s.groups['hot-0']?.count,12);assert.equal(s.groups['inv-1'],null);
  s.swap('inv-0',1);assert.equal(s.groups['hot-1']?.count,9);assert.equal(s.groups['inv-0'],null);
  s.groups['inv-2']={item:'egg',count:12};s.cursor={item:'egg',count:2};s.collect('inv-2');assert.equal(s.cursor?.count,16);assert.deepEqual(s.unlocked,['egg','furnace']);
});
test('Q13 menu slot origins retain same-version menu topology, not a universal web card grid',()=>{
  assert.equal(guiSlots('inventory').filter(s=>s.group==='grid').length,4);assert.equal(guiSlots('crafting_table').filter(s=>s.group==='grid').length,9);
  assert.deepEqual(guiSlots('furnace').find(s=>s.id==='input'),{id:'input',x:56,y:17,group:'grid'});
  assert.equal(guiSlots('hopper').filter(s=>s.group==='grid').length,5);
});
test('Q14 child display contexts merge without dropping the inherited GUI transform',()=>{
  const m=resolveModel('debug:child',(id):ModelSource=>id==='debug:child'?{parent:'debug:parent',display:{ground:{scale:[1,1,1]}}}:{display:{gui:{rotation:[30,225,0]}}});
  assert.deepEqual(m.display?.gui.rotation,[30,225,0]);assert.ok(m.display?.ground);
});
test('Q15 committed GUI cohort hashes, image dimensions and distinct item source routes',()=>{
  const files=readVanillaResources(),manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
  assert.ok(manifest.gui);
  assert.equal(manifest.gui.entries.length,33);for(const path of manifest.gui.entries)assert.ok(files.has(path));
  const inventory=Buffer.from(files.get('assets/minecraft/textures/gui/container/inventory.png')!);assert.equal(inventory.readUInt32BE(16),256);assert.equal(inventory.readUInt32BE(20),256);
  const flat=JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/items/egg.json'))),block=JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/items/furnace.json')));
  assert.equal(flat.model.model,'minecraft:item/egg');assert.equal(block.model.model,'minecraft:block/furnace');assert.equal(files.has('assets/minecraft/textures/item/furnace.png'),false);
});
