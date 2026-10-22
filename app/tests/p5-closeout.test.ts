/** P5 outside-drop boundaries, copy-only saved rows and ephemeral personal inputs do not implement recipe results. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyInventory, reduceInventory, layout} from '../web/src/domain/inventory.ts';
import type {InventoryState, InventoryCommand} from '../web/src/domain/inventory.ts';
import rules from '../web/src/data/inventory-rules.json' with {type: 'json'};
import {OutsideClick, outsideMenu} from '../web/src/ui/outside-click.ts';
import {PersonalCursor} from '../web/src/domain/personal-menu.ts';
import {SaveSession, SAVE_KEY} from '../web/src/persistence/session.ts';
import {decode, token} from '../web/src/persistence/codec.ts';

/** Known inputs are test grants, never a production acquisition path. */
const unlocked = ['minecraft:oak_planks', 'minecraft:bucket', 'minecraft:milk_bucket', 'minecraft:iron_helmet'];

/** Build a validated original default group.
 * @param {number} count Group quantity.
 * @param {string} id Original item.
 * @return {{id:string,count:number}} Test group.
 */
function stack(count: number, id = 'minecraft:oak_planks'): { id: string; count: number } {
    return {id, count};
}

/** Use exactly the shared reducer with an optional four-cell personal grid.
 * @param {InventoryState} value Current carriers.
 * @param {InventoryCommand} command Input intent.
 * @return {InventoryState} Valid independent result.
 */
function run(value: InventoryState, command: InventoryCommand): InventoryState {
    return reduceInventory(value, command, unlocked, rules);
}

test('G17 outside uses the full protected menu plus border guard and Tooltip; native left/all and right/one preserve stable facts', () => {
    const areas = [{left: 100, top: 100, right: 400, bottom: 400}, {left: 450, top: 130, right: 530, bottom: 170}];
    for (const [x, y] of [[100, 100], [99, 200], [401, 200], [451, 140], [250, 99]]) assert.equal(outsideMenu(x, y, areas), false);
    assert.equal(outsideMenu(50, 50, areas), true);
    const g = new OutsideClick();
    g.begin(1, 2, 50, 50, true);
    assert.equal(g.end(1, 2, true), false);
    g.begin(1, 0, 50, 50, true);
    assert.equal(g.end(1, 0, true), true);
    assert.equal(g.end(1, 0, true), null);
    const a = {...emptyInventory(), cursor: stack(7)}, b = run(a, {type: 'drop', cursor: true, all: false}),
        c = run(b, {type: 'drop', cursor: true, all: true});
    assert.equal(b.cursor?.count, 6);
    assert.equal(c.cursor, null);
    assert.deepEqual(layout(a), layout(c));
    assert.deepEqual(unlocked, ['minecraft:oak_planks', 'minecraft:bucket', 'minecraft:milk_bucket', 'minecraft:iron_helmet']);
});
test('G17 drag escape, border origin, middle, chord, canceled close and mismatched release never produce outside discard', () => {
    const g = new OutsideClick();
    g.begin(1, 0, 50, 50, false);
    assert.equal(g.end(1, 0, true), null);
    g.begin(1, 1, 50, 50, true);
    assert.equal(g.end(1, 1, true), null);
    g.begin(1, 0, 50, 50, true);
    g.move(1, 70, 50, 1);
    assert.equal(g.end(1, 0, true), null);
    g.begin(1, 0, 50, 50, true);
    assert.equal(g.end(1, 0, false), null);
    g.begin(1, 0, 50, 50, true);
    g.move(1, 50, 50, 3);
    assert.equal(g.end(1, 0, true), null);
    g.begin(1, 2, 50, 50, true);
    g.cancel();
    assert.equal(g.end(1, 2, true), null);
    g.begin(1, 0, 50, 50, true);
    assert.equal(g.end(2, 0, true), null);
});
test('G18 saved-toolbar cells copy exact saved groups/components without mutating the existing nine presets', () => {
    let v = emptyInventory();
    v.hotbar[0] = {...stack(7), components: {'minecraft:custom_data': {sample: 1}}};
    v = run(v, {type: 'preset', index: 8, mode: 'save'});
    const saved = structuredClone(v.presets);
    v = run(v, {type: 'preset-source', preset: 8, index: 0, mode: 'left'});
    assert.equal(v.cursor?.count, 7);
    assert.deepEqual(v.cursor?.components, {'minecraft:custom_data': {sample: 1}});
    v = run(v, {type: 'preset-source', preset: 8, index: 0, mode: 'right'});
    assert.equal(v.cursor?.count, 6);
    v = run(v, {type: 'preset-source', preset: 8, index: 0, mode: 'number', target: 8});
    assert.equal(v.hotbar[8]?.count, 64);
    assert.deepEqual(v.hotbar[8]?.components, {'minecraft:custom_data': {sample: 1}});
    assert.deepEqual(v.presets, saved);
    v = run(v, {type: 'preset-source', preset: 7, index: 0, mode: 'left'});
    assert.equal(v.cursor?.count, 6);
    assert.throws(() => reduceInventory(v, {
        type: 'preset-source',
        preset: 8,
        index: 0,
        mode: 'clone'
    }, [], rules), /invalid-temporary-stack/);
    assert.throws(() => run(v, {type: 'preset-source', preset: 9, index: 0, mode: 'clone'}), /invalid-preset/);
});
test('personal four inputs reuse native split/merge/drag/numeric/Shift permissions without producing any result', () => {
    let v: InventoryState = {...emptyInventory(), crafting: Array(4).fill(null), cursor: stack(11)};
    v = run(v, {type: 'drag', slots: ['crafting:0', 'crafting:1', 'crafting:0'], mode: 'left'});
    assert.equal(v.crafting?.[0]?.count, 5);
    assert.equal(v.crafting?.[1]?.count, 5);
    assert.equal(v.cursor?.count, 1);
    v = run(v, {type: 'craft-slot', index: 0, button: 2});
    assert.equal(v.crafting?.[0]?.count, 6);
    assert.equal(v.cursor, null);
    v = run(v, {type: 'craft-slot', index: 1, button: 2});
    assert.equal(v.crafting?.[1]?.count, 2);
    assert.equal(v.cursor?.count, 3);
    v = run(v, {type: 'craft-slot', index: 2, button: 0});
    v = run(v, {type: 'swap', slot: 'crafting:2', target: 'hotbar:8'});
    assert.equal(v.hotbar[8]?.count, 3);
    v = run(v, {type: 'quick', slot: 'crafting:0'});
    assert.equal(v.crafting?.[0], null);
    assert.equal(v.hotbar[8]?.count, 9);
    assert.equal('crafting' in layout(v), false);
    assert.equal('result' in v, false);
    assert.throws(() => run(v, {type: 'craft-slot', index: 4, button: 0}), /invalid-slot/);
    assert.throws(() => run({...v, crafting: [stack(65), null, null, null]}, {
        type: 'select',
        index: 0
    }), /invalid-temporary-stack/);
    assert.throws(() => run({...v, crafting: []}, {type: 'select', index: 0}), /invalid-personal-grid/);
});
test('personal inputs honor native single/16 caps, locked groups, component identity and D07 epoch isolation', () => {
    let v: InventoryState = {...emptyInventory(), crafting: Array(4).fill(null), cursor: stack(16, 'minecraft:bucket')};
    v = run(v, {type: 'drag', slots: ['crafting:0', 'crafting:1'], mode: 'middle'});
    assert.equal(v.crafting?.[0]?.count, 16);
    assert.equal(v.cursor?.count, 16);
    assert.throws(() => reduceInventory(v, {
        type: 'craft-slot',
        index: 0,
        button: 0
    }, [], rules), /invalid-temporary-stack/);
    const p = new PersonalCursor();
    p.commit(0, v.cursor, v.crafting);
    p.close();
    p.commit(0, v.cursor, v.crafting);
    assert.equal(p.value, null);
    assert.deepEqual(p.crafting, [null, null, null, null]);
    p.commit(p.epoch, null, [stack(1, 'minecraft:milk_bucket'), null, null, null]);
    assert.deepEqual(p.crafting[0], stack(1, 'minecraft:milk_bucket'));
});
test('personal input transactions use fresh locked layout and never persist cells; reset fences old menu groups', async () => {
    const values = new Map<string, string>(), s = new SaveSession({
        getItem: k => values.get(k) ?? null, setItem: (k, v) => {
            values.set(k, v);
        }
    }, {exclusive: async work => work()});
    await s.refresh();
    for (const item of unlocked) await s.dispatch({type: 'unlock', item});
    const before = s.view.envelope!;
    let result = await s.editInventory({
        type: 'craft-slot',
        index: 0,
        button: 0
    }, stack(9), before.state.progress.player.data, [null, null, null, null]);
    assert.equal(result.crafting?.[0]?.count, 9);
    assert.equal((await decode(values.get(SAVE_KEY)!)).envelope.revision, before.revision);
    result = await s.editInventory({
        type: 'swap',
        slot: 'crafting:0',
        target: 'hotbar:0'
    }, null, layout(result), result.crafting);
    assert.equal(result.hotbar[0]?.count, 9);
    assert.equal(Object.hasOwn(JSON.parse(values.get(SAVE_KEY)!).state.progress.player.data, 'crafting'), false);
    const expected = layout(result);
    await s.reset(token(s.view.envelope!));
    await assert.rejects(() => s.editInventory({
        type: 'craft-slot',
        index: 0,
        button: 0
    }, stack(1), expected, [null, null, null, null]));
    assert.equal(s.view.envelope?.state.progress.unlocked.length, 0);
});

test('all 113 locked identities are rejected in saved-toolbar copies and personal-grid entry paths', () => {
    for (const id of Object.keys(rules.items)) {
        const v: InventoryState = {...emptyInventory(), crafting: [{id, count: 1}, null, null, null]};
        v.presets[0] = [{id, count: 1}, null, null, null, null, null, null, null, null];
        for (const intent of [{type: 'preset-source', preset: 0, index: 0, mode: 'left'}, {
            type: 'preset-source',
            preset: 0,
            index: 0,
            mode: 'number',
            target: 0
        }, {type: 'craft-slot', index: 0, button: 0}, {type: 'clone', slot: 'crafting:0'}, {
            type: 'swap',
            slot: 'crafting:0',
            target: 'hotbar:0'
        }, {
            type: 'drag',
            slots: ['crafting:1'],
            mode: 'middle'
        }] as InventoryCommand[]) assert.throws(() => reduceInventory(v, intent, [], rules), /invalid-temporary-stack/);
    }
});
