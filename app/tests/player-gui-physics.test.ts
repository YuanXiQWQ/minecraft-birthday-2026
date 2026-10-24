/** Player gravity and momentum continue through inventory-like screens while pause screens freeze simulation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {SceneView} from '../web/src/render/scene.ts';
import {PlayerMotion} from '../web/src/domain/player-motion.ts';
import {Look} from '../web/src/render/look.ts';
import {initialState} from '../web/src/domain/state.ts';

/** Exercise the actual input and physics gates with CPU geometry and no native pointer capture.
 * @return {object} Production scene receiver and document substitute cleanup.
 */
function world(){
    const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),doc={hidden:false};
    Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
    const view=Object.assign(Object.create(SceneView.prototype),{
        input:true,simulationPaused:false,disposed:false,lost:false,authored:{tickLife(){},animateLife(){}},motion:new PlayerMotion(),look:new Look(),
        keys:new Set<string>(),jumpQueued:false,movementEpoch:0,motionClock:1000,motionRemainder:0,previousFeet:[0,0,0],
        collision:[[-30,-1,-30,30,0,30]],environmentProgress:initialState().progress,camera:new PerspectiveCamera(),
        pointer:null,renderer:{domElement:{dataset:{},hasPointerCapture:()=>false}},mode:{pause(){}},
        refreshHover(){},playMovement(){},showPreview(){},requestRender(){}
    }) as SceneView;
    view.cancel=()=>view.cancelInput();view.motion.feet=[0,0,0];view.motion.grounded=true;
    return{view,doc,close(){if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}};
}

test('opening a non-pausing GUI mid-jump preserves vertical velocity and lands with movement input disabled',()=>{
    const f=world(),v=f.view;try{
        v.keys.add('Space');v.advancePlayer(1050);assert.ok(v.motion.feet[1]>0);
        const upward=v.motion.velocity[1];v.setInputEnabled(false);assert.equal(v.motion.velocity[1],upward);
        v.refreshHover=()=>assert.fail('GUI must not ray-pick the world');v.keys.add('KeyW');v.keys.add('Space');
        for(let now=1100;now<=3100;now+=50)v.advancePlayer(now);
        assert.equal(v.motion.grounded,true);assert.equal(v.motion.feet[1],0);assert.equal(v.motion.feet[2],0);
        assert.equal(v.input,false);assert.equal(v.simulationPaused,false);
    }finally{f.close();}
});

test('pause freezes an airborne player and resumes without catching up elapsed menu time',()=>{
    const f=world(),v=f.view;try{
        v.keys.add('Space');v.advancePlayer(1050);v.setInputEnabled(false);v.setSimulationPaused(true);
        const feet=[...v.motion.feet],velocity=[...v.motion.velocity];
        v.advancePlayer(5000);v.advancePlayer(10000);assert.deepEqual(v.motion.feet,feet);assert.deepEqual(v.motion.velocity,velocity);
        v.setSimulationPaused(false);v.setInputEnabled(true);v.advancePlayer(20000);assert.deepEqual(v.motion.feet,feet);
        v.advancePlayer(20050);assert.ok(v.motion.feet[1]>feet[1]);
        for(let now=20100;now<22000;now+=50)v.advancePlayer(now);assert.equal(v.motion.grounded,true);
    }finally{f.close();}
});

for(const gate of ['hidden','lost','disposed'] as const)test(`player simulation stays stopped while ${gate}`,()=>{
    const f=world(),v=f.view;try{
        v.motion.feet=[0,3,0];v.motion.velocity=[0,-.4,0];
        if(gate==='hidden')f.doc.hidden=true;else v[gate]=true;
        v.advancePlayer(1050);assert.equal(v.motion.feet[1],3);
    }finally{f.close();}
});
