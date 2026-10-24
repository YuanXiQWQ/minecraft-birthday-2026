/** World cursor shortcuts stay separate from Use and UI-owned Ctrl combinations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SceneView} from '../web/src/render/scene.ts';
import {Look} from '../web/src/render/look.ts';

/** Exercise production gesture methods without a GPU or native browser ownership.
 * @return {object} Scene receiver, observable calls and native-shaped events.
 */
function fixture() {
    const calls: string[] = [], view = Object.create(SceneView.prototype) as SceneView;
    Object.assign(view, {
        input: true, lost: false, disposed: false, look: new Look(), pointer: null,
        mode: {enter: () => {calls.push('enter'); return false;}, toggle: () => calls.push('toggle')},
        cancel: () => {calls.push('cancel'); view.look.cancel(); view.pointer = null;},
        refreshHover: () => null, capturePointer: () => calls.push('capture'),
        canUse: () => false, onUse: () => calls.push('use'), onMineStart: () => calls.push('mine')
    });
    const event = {button: 2, buttons: 2, pointerId: 1, clientX: 50, clientY: 50,
        ctrlKey: false, shiftKey: false, altKey: false, preventDefault: () => calls.push('prevent')} as unknown as PointerEvent;
    return {view, calls, event};
}

test('ordinary empty-world right click uses its normal route and never changes pointer ownership', () => {
    const {view, calls, event} = fixture();
    view.beginPointer(event);
    view.releasePointer(event);
    assert.ok(calls.includes('use'));
    assert.ok(!calls.includes('toggle'));
    assert.ok(!calls.includes('enter'));
});

test('Ctrl + right remains a world Use gesture and cannot release the cursor', () => {
 const {view,calls,event}=fixture();view.beginPointer({...event,ctrlKey:true});view.releasePointer({...event,ctrlKey:true});assert.ok(calls.includes('use'));assert.ok(!calls.includes('toggle'));assert.ok(!calls.includes('enter'));
});

for (const blocked of ['input', 'lost', 'disposed'] as const) test(`Ctrl + right cannot affect cursor while ${blocked} blocks world input`, () => {
    const {view, calls, event} = fixture();
    view[blocked] = blocked !== 'input';
    view.beginPointer({...event, ctrlKey: true});
    assert.deepEqual(calls, []);
});

test('initial ordinary left click retains the explicit acquisition route', () => {
    const {view, calls, event} = fixture();
    view.mode!.enter = () => {calls.push('enter'); return true;};
    view.beginPointer({...event, button: 0});
    assert.deepEqual(calls, ['enter', 'prevent']);
});
