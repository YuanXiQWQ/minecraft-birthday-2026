/** Startup presentation uses the production gate; gameplay state and notification policy are not mocked here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameStartup} from '../web/src/ui/game-startup.ts';

/** Supply only the DOM properties owned by the startup gate. @return {object} Observable production gate ports. */
function setup(){const attributes=new Map<string,string>(),root={dataset:{} as Record<string,string>,setAttribute:(k:string,v:string)=>attributes.set(k,v)},scene={inert:false},nav={hidden:false,inert:false};const gate=new GameStartup(root as any,scene as any,nav as any);return{gate,root,scene,nav,attributes};}

test('native navigation and world input remain hidden while the actual composition is pending',()=>{const h=setup();assert.equal(h.root.dataset.boot,'loading');assert.equal(h.attributes.get('aria-busy'),'true');assert.equal(h.scene.inert,true);assert.equal(h.nav.hidden,true);assert.equal(h.nav.inert,true);assert.equal(h.gate.ready,false);});
test('readiness publishes the native composition once and permits the panel timer to start at entry',()=>{const h=setup();assert.equal(h.gate.finish(),true);assert.equal(h.root.dataset.boot,'ready');assert.equal(h.attributes.get('aria-busy'),'false');assert.equal(h.scene.inert,false);assert.equal(h.nav.hidden,false);assert.equal(h.nav.inert,false);assert.equal(h.gate.finish(),false);});
test('resource failure cannot expose partially loaded controls or claim the game is ready',()=>{const h=setup();h.gate.fail();assert.equal(h.root.dataset.boot,'failed');assert.equal(h.attributes.get('aria-busy'),'false');assert.equal(h.nav.hidden,true);assert.equal(h.scene.inert,true);assert.equal(h.gate.ready,false);});
test('leaving a pending document fences both late readiness and late failure display changes',()=>{const h=setup();h.gate.dispose();assert.equal(h.gate.finish(),false);h.gate.fail();assert.equal(h.root.dataset.boot,'loading');assert.equal(h.nav.hidden,true);assert.equal(h.scene.inert,true);});
