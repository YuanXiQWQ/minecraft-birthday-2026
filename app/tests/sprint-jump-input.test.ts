/** Fast physical Space presses remain visible to the slower movement simulation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SceneView} from '../web/src/render/scene.ts';
import {PlayerMotion} from '../web/src/domain/player-motion.ts';
import {Look} from '../web/src/render/look.ts';

/** Bind real world input methods to a GPU-free movement receiver.
 * @return {SceneView} Player motion and lifetime gates using actual production methods.
 */
function world(): SceneView {
    return Object.assign(Object.create(SceneView.prototype), {
        input:true,lost:false,disposed:false,keys:new Set<string>(),jumpQueued:false,motion:new PlayerMotion(),
        requestRender(){},movementEpoch:0,pointer:null,look:new Look(),
        renderer:{domElement:{dataset:{},hasPointerCapture:()=>false}}
    });
}

/** Deliver one native-shaped physical key press; the real keyup handler removes it from held keys.
 * @param {SceneView} view Current world receiver.
 * @param {string} code Physical key code.
 */
function press(view: SceneView, code: string): void {view.pressMovementKey({code,repeat:false,ctrlKey:true,preventDefault(){}} as KeyboardEvent);}

for(const sprintKey of ['ControlLeft','ControlRight'])test(`released Space still starts a sprint jump with ${sprintKey} held`,()=>{
    const view=world(),floor:[number,number,number,number,number,number]=[-30,-1,-30,30,0,30];
    view.motion.grounded=true;
    press(view,sprintKey);press(view,'KeyW');
    for(let i=0;i<4;i++)view.motion.tick(view.movementKeys(),0,[floor]);
    press(view,'Space');view.keys.delete('Space');
    let peak=0;
    for(let i=0;i<12;i++){view.motion.tick(view.movementKeys(),0,[floor]);peak=Math.max(peak,view.motion.feet[1]);}
    assert.ok(peak>1.24&&peak<1.26);assert.equal(view.motion.sprinting,true);
    assert.equal(view.keys.has('Space'),false);assert.equal(view.movementKeys().has('Space'),false);
});

test('jump press is consumed once and discarded by GUI or focus cancellation',()=>{
    const view=world();press(view,'Space');view.keys.delete('Space');
    assert.equal(view.movementKeys().has('Space'),true);assert.equal(view.movementKeys().has('Space'),false);
    press(view,'Space');view.cancelInput();assert.equal(view.movementKeys().has('Space'),false);
    view.input=false;press(view,'Space');assert.equal(view.jumpQueued,false);assert.equal(view.keys.size,0);
});

test('holding Space remains held without creating repeat-event jump edges',()=>{
    const view=world();press(view,'Space');assert.equal(view.movementKeys().has('Space'),true);
    view.pressMovementKey({code:'Space',repeat:true,preventDefault(){}} as KeyboardEvent);
    assert.equal(view.jumpQueued,false);assert.equal(view.movementKeys().has('Space'),true);
    view.keys.delete('Space');assert.equal(view.movementKeys().has('Space'),false);
});
