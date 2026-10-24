/** World cursor shortcuts stay separate from Use and UI-owned Ctrl combinations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SceneView} from '../web/src/render/scene.ts';
import {Look} from '../web/src/render/look.ts';
import {PlayerMotion} from '../web/src/domain/player-motion.ts';

/** Exercise production gesture methods without a GPU or native browser ownership.
 * @return {object} Scene receiver, observable calls and native-shaped events.
 */
function fixture() {
    const calls: string[] = [], view = Object.create(SceneView.prototype) as SceneView;
    Object.assign(view, {
        input: true, lost: false, disposed: false, look: new Look(), pointer: null,
        keys:new Set<string>(),motion:new PlayerMotion(),movementEpoch:0,motionRemainder:37,jumpQueued:false,
        renderer:{domElement:{dataset:{},hasPointerCapture:()=>false,getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100})}},
        mode: {actual:true,pause:()=>{},enter: () => {calls.push('enter'); return false;}, toggle: () => calls.push('toggle')},
        cancel: () => view.cancelInput(),
        requestRender:()=>{},refreshHover: () => null, capturePointer: () => calls.push('capture'),
        canUse: () => false, onUse: () => calls.push('use'), onMineStart: () => calls.push('mine')
    });
    const event = {button: 2, buttons: 2, pointerId: 1, clientX: 50, clientY: 50,
        ctrlKey: false, shiftKey: false, altKey: false, preventDefault: () => calls.push('prevent')} as unknown as PointerEvent;
    return {view, calls, event};
}

test('right click uses the world when pointer acquisition is already satisfied', () => {
    const {view, calls, event} = fixture();
    view.beginPointer(event);
    view.releasePointer(event);
    assert.ok(calls.includes('use'));
    assert.ok(!calls.includes('toggle'));
    assert.ok(calls.includes('enter'));
});

test('Ctrl + right remains a world Use gesture and cannot release the cursor', () => {
 const {view,calls,event}=fixture();view.beginPointer({...event,ctrlKey:true});view.releasePointer({...event,ctrlKey:true});assert.ok(calls.includes('use'));assert.ok(!calls.includes('toggle'));assert.ok(calls.includes('enter'));
});

for (const blocked of ['input', 'lost', 'disposed'] as const) test(`Ctrl + right cannot affect cursor while ${blocked} blocks world input`, () => {
    const {view, calls, event} = fixture();
    view[blocked] = blocked !== 'input';
    view.beginPointer({...event, ctrlKey: true});
    assert.deepEqual(calls, []);
});

for(const button of [0,2])test(`world mouse button ${button} acquires hidden ownership without also mining or using`, () => {
    const {view, calls, event} = fixture();
    view.mode!.enter = fromGesture => {assert.equal(fromGesture,true);calls.push('enter'); return true;};
    view.beginPointer({...event, button});
    view.releasePointer({...event, button});
    assert.deepEqual(calls, ['enter', 'prevent']);
});

for(const codes of [['KeyW','KeyA'],['KeyW','KeyD'],['KeyS','KeyA'],['KeyS','KeyD']])test(`right-click Use preserves held diagonal movement: ${codes.join('+')}`,()=>{
    const {view,event}=fixture();
    view.keys=new Set([...codes,'ControlLeft']);view.motion.sprinting=true;view.motion.forwardDown=true;view.jumpQueued=true;
    for(let i=0;i<3;i++){view.beginPointer(event);view.releasePointer(event);}
    assert.deepEqual([...view.keys],[...codes,'ControlLeft']);assert.equal(view.movementEpoch,0);assert.equal(view.motionRemainder,37);
    assert.equal(view.motion.sprinting,true);assert.equal(view.motion.forwardDown,true);assert.equal(view.jumpQueued,true);
    view.jumpQueued=false;view.motion.grounded=true;view.motion.tick(view.movementKeys(),0,[[-30,-1,-30,30,0,30]]);
    assert.notEqual(view.motion.velocity[0],0);assert.notEqual(view.motion.velocity[2],0);
});

for(const route of ['locked-button-loss','visible-button-loss','visible-leave','right-button-loss','capture-end'])test(`pointer-only cancellation preserves movement on ${route}`,()=>{
    const {view,event}=fixture();view.keys=new Set(['KeyW','KeyA']);view.pointer=1;
    if(route==='locked-button-loss')view.moveLockedMouse({buttons:0} as MouseEvent);
    else if(route==='capture-end')view.cancelPointerGesture();
    else {view.mode!.actual=false;if(route==='right-button-loss'){view.pointer=null;view.look.begin(1,50,50);}
        view.movePointer({...event,buttons:route==='visible-leave'?1:0,clientX:route==='visible-leave'?150:50},true);}
    assert.deepEqual([...view.keys],['KeyW','KeyA']);assert.equal(view.movementEpoch,0);assert.equal(view.pointer,null);assert.equal(view.look.active,null);
});

test('UI and lifetime cancellation still clears held movement and queued jumping',()=>{
    const {view}=fixture();view.keys=new Set(['KeyW','KeyA','ControlLeft']);view.jumpQueued=true;view.motion.sprinting=true;
    view.setInputEnabled(false);assert.equal(view.keys.size,0);assert.equal(view.jumpQueued,false);assert.equal(view.motion.sprinting,false);assert.equal(view.movementEpoch,1);
});
