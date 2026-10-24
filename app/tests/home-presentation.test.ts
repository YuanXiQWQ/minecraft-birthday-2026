/** Fixed homepage projection shares home facts without taking ownership of player motion or saved scene selection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SceneView} from '../web/src/render/scene.ts';
import {initialState} from '../web/src/domain/state.ts';

test('homepage projects home devices and completion even when the saved active scene is elsewhere',()=>{
    const p=initialState().progress;p.scene='farm';p.cakePlacement={scene:'home',table:'birthday-table'};
    const v=Object.create(SceneView.prototype) as SceneView;
    let projected:typeof p|undefined,cake=false,devices:unknown;
    Object.assign(v,{presentationOnly:true,worldId:'home',motion:{feet:[0,0,7]},renderer:{domElement:{dataset:{}}},authored:{sync:(value:typeof p)=>{projected=value;}},
        placedSignature:JSON.stringify(['home',p.scenes.home.blocks]),setCake:(value:boolean)=>{cake=value;},sync:(value:unknown)=>{devices=value;},
        rebuildCollision:()=>{},refreshHover:()=>{},requestRender:()=>{}});
    v.syncWorld(p);
    assert.equal(projected?.scene,'home');assert.equal(devices,p.scenes.home);assert.equal(cake,true);
    assert.equal(p.scene,'farm');assert.notEqual(projected,p);
});

test('homepage ignores movement and pointer-look input before accessing game controls',()=>{
    const v=Object.create(SceneView.prototype) as SceneView;
    Object.assign(v,{presentationOnly:true,motionClock:0,motionRemainder:42});
    v.beginPointer({button:2} as PointerEvent);
    v.movePointer({buttons:2,movementX:100,movementY:100} as PointerEvent,false);
    v.advancePlayer(1000);
    assert.equal(v.motionRemainder,0);assert.equal(v.motionClock,1000);
});
