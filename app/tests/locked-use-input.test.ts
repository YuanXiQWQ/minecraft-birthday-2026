/** Locked right-click actions are issued at the current press ray and never retracted by subsequent look or movement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {SceneView, type Pick} from '../web/src/render/scene.ts';
import {Look} from '../web/src/render/look.ts';

/** Build a production pointer-handler receiver without acquiring native mouse ownership.
 * @return {object} Scene, mutable ray target, issued actions and a right-button event.
 */
function fixture(){
    const view=Object.create(SceneView.prototype) as SceneView,used:{hit:Pick|null;modifiers:unknown}[]=[];
    const target={current:{id:'ground:a',point:[0,0,0],normal:[0,1,0],cell:[0,-1,0]} as Pick};
    Object.assign(view,{input:true,lost:false,disposed:false,pointer:null,look:new Look(),camera:new PerspectiveCamera(),
        keys:new Set(['KeyW','KeyA']),renderer:{domElement:{dataset:{},hasPointerCapture:()=>false}},
        mode:{actual:true,enter:()=>false},refreshHover:()=>view.look.active?null:target.current,
        requestRender(){},capturePointer(){},onUse:(hit:Pick|null,modifiers:unknown)=>used.push({hit,modifiers})});
    const event={button:2,buttons:2,pointerId:1,clientX:50,clientY:50,shiftKey:true,ctrlKey:false,altKey:false,preventDefault(){}} as PointerEvent;
    return{view,used,target,event};
}

for(const delta of [0,2,12,80])test(`locked right press survives ${delta}px of look movement and a changed walking ray without duplicate Use`,()=>{
    const {view,used,target,event}=fixture();
    view.beginPointer(event);
    assert.equal(used.length,1,'Use must execute on press, before moving or releasing');
    assert.equal(used[0].hit?.id,'ground:a');assert.deepEqual(used[0].modifiers,{shift:true,alt:false,ctrl:false});
    assert.equal(view.look.active,null,'locked observation is independent of right-button drag');
    target.current={...target.current,id:'ground:b'};
    view.moveLockedMouse({buttons:2,movementX:delta,movementY:0} as MouseEvent);
    assert.equal(view.refreshHover()?.id,'ground:b');
    view.releasePointer({...event,buttons:0});
    assert.equal(used.length,1);assert.equal(used[0].hit?.id,'ground:a');
    assert.deepEqual([...view.keys],['KeyW','KeyA']);
    view.beginPointer(event);view.releasePointer({...event,buttons:0});
    assert.equal(used.length,2);assert.equal(used[1].hit?.id,'ground:b');
});

test('a press reserved for acquiring the pointer cannot place when ownership arrives before release',()=>{
    const {view,used,event}=fixture();view.mode!.actual=false;view.mode!.enter=()=>true;
    view.beginPointer(event);view.mode!.actual=true;view.releasePointer({...event,buttons:0});assert.equal(used.length,0);
});

test('visible-pointer right dragging still rotates without using the world',()=>{
    const {view,used,event}=fixture();view.mode!.actual=false;
    view.beginPointer(event);assert.equal(used.length,0);
    view.movePointer({...event,clientX:80},true);view.releasePointer({...event,clientX:80,buttons:0});assert.equal(used.length,0);
    view.beginPointer(event);view.releasePointer({...event,buttons:0});assert.equal(used.length,1);
});
