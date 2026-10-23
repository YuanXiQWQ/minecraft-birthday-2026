/** Gesture arbitration tests prevent right-drag from opening a workstation, independently of GPU and GUI business rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Look} from '../web/src/render/look.ts';

test('look emits a right click only below threshold and a drag only after crossing it', () => {
    const look = new Look();
    look.begin(1, 10, 10);
    assert.equal(look.move(1, 12, 12), false);
    assert.equal(look.end(1), 'use');
    assert.equal(look.end(1), null);
    look.begin(2, 10, 10);
    assert.equal(look.move(2, 16, 10), true);
    assert.notEqual(look.yaw, 0);
    assert.equal(look.end(2), 'drag');
});
test('look clamps pitch and leaves yaw unrestricted and ignores unrelated pointers, with cancellation on GUI/blur independent of saved state', () => {
    const look = new Look();
    look.begin(1, 0, 0);
    assert.equal(look.move(2, 100, 100), false);
    look.move(1, 1e6, -1e6);
    assert.equal(look.yaw, -1e6*look.sensitivity);
    assert.equal(look.pitch, look.maxPitch);
    look.cancel();
    assert.equal(look.end(1), null);
    const before = [look.yaw, look.pitch];
    assert.equal(look.move(1, 0, 0), false);
    assert.deepEqual([look.yaw, look.pitch], before);
    look.begin(3, 0, 0);
    look.move(3, -1e6, 1e6);
    assert.equal(look.yaw, 0);
    assert.equal(look.pitch, -look.maxPitch);
});
