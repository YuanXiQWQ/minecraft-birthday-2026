/** D07 cursor lifetime and delayed-commit tests use the real UI command methods with renderer/DOM ports stubbed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import rules from '../web/src/data/inventory-rules.json' with {type: 'json'};
import {PersonalCursor} from '../web/src/domain/personal-menu.ts';
import {emptyInventory, layout, reduceInventory} from '../web/src/domain/inventory.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {GameInventory} from '../web/src/ui/inventory.ts';

/** Make a command/close harness without claiming native dialog or physical mouse verification.
 * @return {GameInventory} Real methods with isolated synchronous presentation ports.
 */
function harness(): GameInventory {
    const u = Object.create(GameInventory.prototype) as GameInventory;
    u.value = emptyInventory();
    u.permanent = transition(initialState(), {type: 'unlock', item: 'minecraft:oak_planks'}).state;
    u.writable = true;
    u.generation = 'd07';
    u.queueEpoch = 0;
    u.pending = 0;
    u.queue = Promise.resolve();
    u.personal = new PersonalCursor();
    u.disposed = false;
    u.rules = {items: rules.items} as any;
    u.modal = {
        open: true, dataset: {}, close() {
            this.open = false;
        }
    } as any;
    u.input = {
        cancel() {
        }
    } as any;
    u.tooltip = {hidden: true} as any;
    u.cursor = {hidden: false} as any;
    u.draw = () => {
    };
    u.gate = () => {
    };
    u.text = key => key;
    u.pixels = {
        text() {
        }
    } as any;
    u.commit = async (intent, cursor, expected, crafting) => {
        assert.deepEqual(expected, u.permanent!.progress.player.data);
        const result = reduceInventory({
            ...expected,
            cursor, ...(crafting ? {crafting} : {})
        }, intent, u.permanent!.progress.unlocked, rules);
        u.permanent = structuredClone(u.permanent!);
        u.permanent.progress.player.data = layout(result);
        return result;
    };
    return u;
}

test('D07 close clears cursor only, preserves stable layout and permanent facts, including when saving is read-only', async () => {
    const u = harness();
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'number', index: 2});
    await u.queue;
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'clone'});
    await u.queue;
    const stable = layout(u.value), facts = structuredClone(u.permanent);
    u.writable = false;
    u.close();
    assert.equal(u.value.cursor, null);
    assert.equal(u.personal.value, null);
    assert.equal(u.modal.open, false);
    assert.equal(u.cursor.hidden, true);
    assert.deepEqual(layout(u.value), stable);
    assert.deepEqual(u.permanent, facts);
    assert.equal(u.pending, 0);
});
test('D07 delayed pickup cannot resurrect a cursor after close, while its submitted stable-slot transaction completes', async () => {
    const u = harness();
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'number', index: 0});
    await u.queue;
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(r => release = r), ready = new Promise<void>(r => entered = r), commit = u.commit;
    u.commit = async (...args) => {
        entered();
        await wait;
        return commit(...args);
    };
    u.command({type: 'slot', index: 0, button: 0});
    await ready;
    u.close();
    release();
    await u.queue;
    assert.equal(u.value.hotbar[0], null);
    assert.equal(u.value.cursor, null);
    assert.equal(u.personal.value, null);
    assert.deepEqual(u.permanent!.progress.unlocked, ['minecraft:oak_planks']);
});
test('D07 reopening permits a fresh cursor without accepting the older close-boundary result', async () => {
    const u = harness();
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(r => release = r), ready = new Promise<void>(r => entered = r), commit = u.commit;
    let calls = 0;
    u.commit = async (...args) => {
        if (++calls === 1) {
            entered();
            await wait;
        }
        return commit(...args);
    };
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'left'});
    await ready;
    u.close();
    u.modal.open = true;
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'clone'});
    release();
    await u.queue;
    assert.equal(u.value.cursor?.count, 64);
    assert.equal(u.personal.value?.count, 64);
    assert.ok(u.value.hotbar.every(s => s === null));
});
test('D07 close/re-entry boundaries reject older results and accept fresh isolated cursor snapshots', () => {
    const cursor = new PersonalCursor(), original = {id: 'minecraft:oak_planks', count: 7};
    cursor.commit(0, original);
    original.count = 1;
    assert.equal(cursor.value?.count, 7);
    cursor.close();
    cursor.commit(0, {id: 'minecraft:oak_planks', count: 64});
    assert.equal(cursor.value, null);
    cursor.commit(cursor.epoch, {id: 'minecraft:oak_planks', count: 3});
    assert.deepEqual(cursor.value, {id: 'minecraft:oak_planks', count: 3});
});

test('D07 delayed personal input result is discarded on close while a fresh reopened input can commit', async () => {
    const u = harness();
    u.value.crafting = Array(4).fill(null);
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'clone'});
    await u.queue;
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(r => release = r), ready = new Promise<void>(r => entered = r), commit = u.commit;
    u.commit = async (...args) => {
        entered();
        await wait;
        return commit(...args);
    };
    u.command({type: 'craft-slot', index: 0, button: 0});
    await ready;
    u.close();
    release();
    await u.queue;
    assert.equal(u.value.cursor, null);
    assert.deepEqual(u.value.crafting, [null, null, null, null]);
    u.modal.open = true;
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'clone'});
    await u.queue;
    u.command({type: 'craft-slot', index: 3, button: 0});
    await u.queue;
    assert.deepEqual(u.value.crafting?.[3], {id: 'minecraft:oak_planks', count: 64});
    assert.ok(u.value.hotbar.every(s => s === null));
});

test('D07 reset initializes usable personal inputs immediately while an older menu result is still pending', async () => {
    const u = harness();
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>(r => release = r), ready = new Promise<void>(r => entered = r), commit = u.commit;
    let calls = 0;
    u.commit = async (...args) => {
        if (++calls === 1) {
            entered();
            await wait;
        }
        return commit(...args);
    };
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'clone'});
    await ready;
    u.sync(transition(initialState(), {type: 'unlock', item: 'minecraft:oak_planks'}).state, true, 'reset-epoch');
    u.command({type: 'source', item: 'minecraft:oak_planks', mode: 'clone'});
    u.command({type: 'craft-slot', index: 0, button: 0});
    release();
    await u.queue;
    assert.deepEqual(u.value.crafting?.[0], {id: 'minecraft:oak_planks', count: 64});
    assert.equal(u.value.cursor, null);
    assert.equal(u.pending, 0);
});
