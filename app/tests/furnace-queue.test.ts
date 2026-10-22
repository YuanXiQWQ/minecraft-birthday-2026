/** Formal UI method bodies and real SaveSession transactions with controlled receipt timing; DOM rendering is stubbed, not browser input. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {InventoryInput} from '../web/src/ui/inventory-input.ts';
import {SlotGesture} from '../web/src/ui/slot-gesture.ts';
import {OutsideClick} from '../web/src/ui/outside-click.ts';
import {PersonalCursor} from '../web/src/domain/personal-menu.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {token} from '../web/src/persistence/codec.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import type {Rules, Stack} from '../web/src/rules/types.ts';

/** Actual committed P4 recipes and components. */
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;

/** Construct native bounded ingredients.
 * @param {string} id Original item path.
 * @param {number} count Temporary count.
 * @return {Stack} Ingredient group.
 */
function item(id: string, count = 1): Stack {
    return {id: 'minecraft:' + id, count};
}

/** Allocate a manually resolved promise without a timer or a production delay hook.
 * @return {object} Promise and release callback.
 */
function latch() {
    let release!: () => void;
    const promise = new Promise<void>(r => release = r);
    return {promise, release};
}

/** Bind actual UI/input prototype methods to presentation stubs and the real persistence class.
 * @param {object} options Initial acquisition and station configuration.
 * @return {Promise<object>} UI, session and controlled receipt boundary.
 */
async function harness(options: { known?: boolean; merge?: number; bench?: boolean } = {}) {
    let raw: string | null = null, deny = false, tail: Promise<unknown> = Promise.resolve();
    const s = new SaveSession({
        getItem: () => raw, setItem: (_k, v) => {
            if (deny) throw Error('write-failed');
            raw = v;
        }
    }, {
        exclusive(work) {
            const p = tail.then(work);
            tail = p.catch(() => {
            });
            return p;
        }
    }, {allows: () => true});
    s.rules = rules;
    await s.refresh();
    for (const id of ['oak_log', 'stick', 'furnace', ...(options.known || options.merge ? ['charcoal'] : [])]) await s.dispatch({
        type: 'unlock',
        item: 'minecraft:' + id
    });
    const contents = emptyFurnace();
    await s.dispatch({
        type: 'put-station',
        scene: 'plains',
        station: {id: 'table', kind: 'furnace', cell: [2, 0, 0], facing: 'north', contents}
    });
    for (const [index, id] of [[0, 'oak_log'], [1, 'stick']] as const) {
        const r = await s.editInventory({
            type: 'source',
            item: 'minecraft:' + id,
            mode: 'clone'
        }, null, s.view.envelope!.state.progress.player.data);
        await s.editInventory({
            type: 'machine-slot',
            index,
            button: 0
        }, r.cursor, s.view.envelope!.state.progress.player.data, undefined, {
            scene: 'plains',
            id: 'table',
            expected: structuredClone(s.view.envelope!.state.progress.scenes.plains.stations[0].contents)
        });
    }
    await s.dispatch({type: 'processing-tick', ticks: 1000});
    const u = Object.create(GameInventory.prototype) as GameInventory;
    u.value = {} as any;
    u.station = null;
    u.notice = '';
    u.permanent = null;
    u.generation = '';
    u.queueEpoch = 0;
    u.pending = 0;
    u.queue = Promise.resolve();
    u.personal = new PersonalCursor();
    u.disposed = false;
    u.rules = rules;
    u.previewSignature = '';
    u.preview = {status: 'empty', result: null};
    u.modal = {
        open: true, dataset: {}, setAttribute() {
        }, close() {
            this.open = false;
        }, showModal() {
            this.open = true;
        }, querySelector() {
            return {
                focus() {
                }
            };
        }, hasPointerCapture() {
            return false;
        }, releasePointerCapture() {
        }, getBoundingClientRect() {
            return {left: 0, right: 400, top: 0, bottom: 400};
        }, remove() {
        }
    } as any;
    u.panel = {
        setPointerCapture() {
        }, hasPointerCapture() {
            return false;
        }, releasePointerCapture() {
        }, getBoundingClientRect() {
            return {left: 0, right: 400, top: 0, bottom: 400};
        }
    } as any;
    const input = Object.create(InventoryInput.prototype) as InventoryInput;
    input.ui = u;
    input.gesture = new SlotGesture();
    input.outside = new OutsideClick();
    input.keys = new Set();
    input.abort = new AbortController();
    input.start = null;
    input.quickMatch = null;
    input.editing = () => false;
    input.at = () => u.hover;
    u.input = input;
    u.tooltip = {
        hidden: true, remove() {
        }
    } as any;
    u.cursor = {
        hidden: true, remove() {
        }
    } as any;
    u.hud = {
        remove() {
        }
    } as any;
    u.art = {
        dispose() {
        }
    } as any;
    u.abort = new AbortController();
    u.animation = 0;
    u.draw = () => u.refreshPreview();
    u.gate = () => {
    };
    u.blocked = () => false;
    u.text = k => k;
    u.pixels = {
        text() {
        }
    } as any;
    let ordinary = 0;
    u.commit = (...args) => {
        ordinary++;
        return s.editInventory(...args);
    };
    const entered = latch(), release = latch();
    let pause = true;
    u.acquire = async (...args) => s.takeCraft(...args);
    u.acquireOutput = async (...args) => {
        const r = await s.takeOutput(...args);
        if (pause) {
            pause = false;
            entered.release();
            await release.promise;
        }
        return r;
    };
    s.subscribe(v => {
        if (v.envelope) u.sync(v.envelope.state, v.writable, v.envelope.generation);
    });
    u.openWorkbench('table');
    if (options.merge) {
        u.personal.value = item('charcoal', options.merge);
        u.value.cursor = structuredClone(u.personal.value);
    }
    u.refreshPreview();
    return {
        u,
        s,
        entered: entered.promise,
        release: release.release,
        raw: () => raw,
        ordinary: () => ordinary,
        deny: (value: boolean) => {
            deny = value;
        },
        other: async () => {
            const other = new SaveSession(s.storage, s.locks, s.policy);
            other.rules = rules;
            await other.refresh();
            return other;
        }
    };
}

for (const known of [false, true]) test('formal furnace UI unresolved receipt rejects all carrier mutation families and preserves actual finite output delivery: ' + known, async () => {
    const h = await harness({known});
    h.u.takeResult({mode: 'cursor'});
    await h.entered;
    for (const intent of [{type: 'slot', index: 0, button: 0}, {
        type: 'source',
        item: 'minecraft:oak_log',
        mode: 'clone'
    }, {type: 'machine-slot', index: 0, button: 0}, {type: 'equipment', slot: 'offhand', button: 0}, {
        type: 'drop',
        cursor: true,
        all: true
    }, {type: 'swap', slot: 'hotbar:0', target: 'equipment:offhand'}, {
        type: 'preset',
        index: 0,
        mode: 'load'
    }, {type: 'drag', slots: ['machine:0'], mode: 'clone'}, {
        type: 'quick',
        slot: 'machine:1'
    }]) h.u.command(intent as any);
    h.release();
    await h.u.queue;
    assert.deepEqual(h.u.value.cursor, item('charcoal', 5));
    assert.equal(h.ordinary(), 0);
    assert.equal(h.s.view.envelope!.state.progress.scenes.plains.stations[0].contents.version === 2 && (h.s.view.envelope!.state.progress.scenes.plains.stations[0].contents as any).data.output, null);
    h.u.command({type: 'slot', index: 0, button: 0});
    await h.u.queue;
    assert.deepEqual(h.u.value.hotbar[0], item('charcoal', 5));
    assert.equal(h.u.carrierBusy(), false);
});
test('formal furnace right split with existing same cursor merges only moved finite units', async () => {
    const h = await harness({merge: 60});
    h.u.takeResult({mode: 'cursor', button: 2});
    await h.entered;
    h.release();
    await h.u.queue;
    assert.deepEqual(h.u.value.cursor, item('charcoal', 64));
    assert.equal((h.s.view.envelope!.state.progress.scenes.plains.stations[0].contents as any).data.output.count, 1);
});
for (const close of ['Done', 'E', 'Esc']) test('formal furnace pending ' + close + ' close does not revive cursor and preserves instance input references', async () => {
    const h = await harness();
    h.u.takeResult({mode: 'cursor'});
    await h.entered;
    if (close === 'Done') h.u.close(); else h.u.input.key({
        code: close === 'E' ? 'KeyE' : 'Escape',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        repeat: false,
        target: null,
        preventDefault() {
        },
        stopPropagation() {
        }
    } as KeyboardEvent);
    h.release();
    await h.u.queue;
    assert.equal(h.u.modal.open, false);
    assert.equal(h.u.value.cursor, null);
    assert.equal((h.s.view.envelope!.state.progress.scenes.plains.stations[0].contents as any).data.input.id, 'minecraft:oak_log');
    assert.equal(h.u.carrierBusy(), false);
});
test('formal furnace failed write leaves output intact and gate releases for a successful retry', async () => {
    const h = await harness();
    h.deny(true);
    h.u.takeResult({mode: 'cursor'});
    await h.u.queue;
    assert.equal(h.u.carrierBusy(), false);
    assert.equal(h.u.value.cursor, null);
    assert.equal(h.s.view.envelope!.state.progress.unlocked.includes('minecraft:charcoal'), false);
    assert.equal((h.s.view.envelope!.state.progress.scenes.plains.stations[0].contents as any).data.output.count, 5);
    h.deny(false);
    await h.s.refresh();
    h.u.takeResult({mode: 'cursor'});
    await h.entered;
    h.release();
    await h.u.queue;
    assert.equal((h.u.value.cursor as Stack | null)?.count, 5);
});
for (const change of ['reset', 'remove', 'dispose']) test('formal furnace ' + change + ' fences a committed delayed receipt without resurrection', async () => {
    const h = await harness();
    h.u.takeResult({mode: 'cursor'});
    await h.entered;
    if (change === 'dispose') h.u.dispose(); else {
        const b = await h.other();
        if (change === 'reset') await b.reset(token(b.view.envelope!)); else await b.dispatch({
            type: 'remove-station',
            scene: 'plains',
            id: 'table'
        });
        await h.s.refresh();
    }
    h.release();
    await h.u.queue;
    assert.equal(h.u.personal.value, null);
    assert.equal(h.u.carrierBusy(), false);
});
test('returning from finite furnace output to an unchanged empty personal grid cannot reuse producer preview cache', async () => {
    const h = await harness();
    h.u.close();
    h.u.open();
    h.u.refreshPreview();
    assert.deepEqual(h.u.preview, {status: 'empty', result: null});
    assert.equal(h.u.value.machine, undefined);
    h.u.openWorkbench('table');
    assert.deepEqual(h.u.preview.result, item('charcoal', 5));
    h.u.close();
    h.u.open();
    assert.deepEqual(h.u.preview, {status: 'empty', result: null});
    assert.ok(h.u.value.crafting!.every(s => s === null));
});

