/** P5 finite-slot counterexamples, component identity, creative shortcuts and durable concurrency contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyInventory, reduceInventory, validateCarriers, layout} from '../web/src/domain/inventory.ts';
import type {InventoryState, InventoryCommand} from '../web/src/domain/inventory.ts';
import {pickup, distribute, quickMove, collect, sameStack} from '../web/src/domain/slots.ts';
import type {SlotValue} from '../web/src/domain/slots.ts';
import rules from '../web/src/data/inventory-rules.json' with {type: 'json'};
import {SlotGesture} from '../web/src/ui/slot-gesture.ts';
import {initialState, KNOWN_ITEMS, transition} from '../web/src/domain/state.ts';
import {SaveSession, SAVE_KEY} from '../web/src/persistence/session.ts';
import {seal, decode, checksum, token} from '../web/src/persistence/codec.ts';

/** All candidate identities are unlocked only in this pure test fixture. */
const unlocked = [...KNOWN_ITEMS];

/** Construct a simple known temporary group.
 * @param {number} count Group size.
 * @param {string} id Original item path.
 * @return {{id:string,count:number}} Temporary group.
 */
function stack(count: number, id = 'oak_planks'): { id: string; count: number } {
    return {id: 'minecraft:' + id, count};
}

/** Apply one semantic fixture command.
 * @param {InventoryState} v Current carriers.
 * @param {InventoryCommand} command Bounded intent.
 * @return {InventoryState} New carriers.
 */
function run(v: InventoryState, command: InventoryCommand): InventoryState {
    return reduceInventory(v, command, unlocked, rules);
}

/** Count finite carried units, excluding copy-only presets.
 * @param {InventoryState} v Temporary groups.
 * @return {number} Total transferred quantity.
 */
function total(v: InventoryState): number {
    return [...v.backpack, ...v.hotbar, ...Object.values(v.equipment), v.cursor].reduce((n, s) => n + (s?.count ?? 0), 0);
}

/** Make an ordinary or output-only slot.
 * @param {number} n Initial count.
 * @param {boolean} place Placement permission.
 * @return {SlotValue} Mutable slot fixture.
 */
function slot(n = 0, place = true): SlotValue {
    return {stack: n ? stack(n) : null, policy: {take: true, place}};
}

test('G03–G06 odd halves, partial merge, right one, component swap and capacity preserve finite counts', () => {
    let v = emptyInventory();
    v.hotbar[0] = stack(9);
    const n = total(v);
    v = run(v, {type: 'slot', index: 0, button: 2});
    assert.equal(v.cursor?.count, 5);
    assert.equal(v.hotbar[0]?.count, 4);
    v = run(v, {type: 'slot', index: 1, button: 2});
    assert.equal(v.hotbar[1]?.count, 1);
    assert.equal(total(v), n);
    v.hotbar[1] = stack(63);
    const before = total(v);
    v = run(v, {type: 'slot', index: 1, button: 0});
    assert.equal(v.hotbar[1]?.count, 64);
    assert.equal(v.cursor?.count, 3);
    assert.equal(total(v), before);
    v.cursor = {...stack(3), components: {'minecraft:custom_data': {b: 2, a: 1}}};
    v.hotbar[2] = {...stack(5), components: {'minecraft:custom_data': {a: 2}}};
    v = run(v, {type: 'slot', index: 2, button: 2});
    assert.equal(v.cursor?.count, 5);
    assert.equal(v.hotbar[2]?.count, 3);
    assert.equal(sameStack({...stack(1), components: {'minecraft:custom_data': {a: 1, b: 2}}}, {
        ...stack(2),
        components: {'minecraft:custom_data': {b: 2, a: 1}}
    }), true);
});
test('G07 left drag distributes floor and retains odd remainders, deduplicates and excludes armor/wrong identity/full cells', () => {
    let v = emptyInventory();
    v.cursor = stack(10);
    v.hotbar[3] = stack(64);
    v.hotbar[4] = stack(2, 'stick');
    const before = total(v);
    v = run(v, {
        type: 'drag',
        mode: 'left',
        slots: ['hotbar:0', 'hotbar:1', 'hotbar:0', 'equipment:chest', 'hotbar:2', 'hotbar:3', 'hotbar:4']
    });
    assert.deepEqual(v.hotbar.slice(0, 3).map(s => s?.count), [3, 3, 3]);
    assert.equal(v.cursor?.count, 1);
    assert.equal(total(v), before);
});
test('G07 partial capacities do not silently redistribute or lose the unallocated remainder', () => {
    const slots = [slot(63), slot(), slot()];
    const result = distribute(slots, stack(10), 'left', rules);
    assert.deepEqual(slots.map(s => s.stack?.count), [64, 3, 3]);
    assert.equal(result?.count, 3);
});
test('G08 right drag allocates at most one per unique eligible cell and never refills its source', () => {
    let v = emptyInventory();
    v.cursor = stack(2);
    v = run(v, {
        type: 'drag',
        mode: 'right',
        slots: ['hotbar:0', 'hotbar:0', 'equipment:head', 'hotbar:1', 'hotbar:2']
    });
    assert.deepEqual(v.hotbar.slice(0, 3).map(s => s?.count ?? 0), [1, 1, 0]);
    assert.equal(v.cursor, null);
    assert.equal(total(v), 2);
});
test('G10–G11 middle cloning requires empty cursor; middle drag fills native maxima and does not consume carried group', () => {
    let v = emptyInventory();
    v.hotbar[0] = stack(1, 'bucket');
    v = run(v, {type: 'clone', slot: 'hotbar:0'});
    assert.equal(v.cursor?.count, 16);
    v = run(v, {type: 'drag', mode: 'middle', slots: ['hotbar:1', 'hotbar:2', 'equipment:head']});
    assert.equal(v.hotbar[1]?.count, 16);
    assert.equal(v.hotbar[2]?.count, 16);
    assert.equal(v.equipment.head, null);
    assert.equal(v.cursor?.count, 16);
    v = run(v, {type: 'source', item: 'minecraft:milk_bucket', mode: 'clone'});
    assert.equal(v.cursor?.id, 'minecraft:bucket');
});
test('G12 collects only matching finite groups to max; output permission forbids inserting or exchanging', () => {
    const a = slot(30), b = slot(40), out = slot(3, false), foreign = slot(4);
    foreign.stack = {...stack(4), components: {'minecraft:custom_data': {x: 1}}};
    assert.equal(collect([a, b, out, foreign], stack(1), rules)?.count, 64);
    assert.equal(a.stack, null);
    assert.equal(b.stack?.count, 7);
    assert.equal(out.stack?.count, 3);
    assert.equal(foreign.stack?.count, 4);
    assert.equal(pickup(out, stack(2), 0, rules)?.count, 2);
    assert.equal(out.stack?.count, 3);
    assert.equal(pickup(out, null, 0, rules)?.count, 3);
});
test('G13–G14 bounded Shift source/move snapshots preserve counts and autoequip by component', () => {
    let v = emptyInventory();
    v = run(v, {type: 'source', item: 'minecraft:oak_planks', mode: 'shift'});
    assert.equal(total(v), 64);
    v.hotbar[0] = stack(1, 'iron_chestplate');
    const before = total(v);
    v = run(v, {type: 'quick', slot: 'hotbar:0'});
    assert.equal(v.equipment.chest?.id, 'minecraft:iron_chestplate');
    assert.equal(total(v), before);
    v.equipment.head = stack(1, 'iron_helmet');
    v.equipment.feet = stack(1, 'iron_boots');
    v = run(v, {type: 'quick-all', slot: 'equipment:head'});
    assert.equal(v.equipment.head, null);
    assert.equal(v.equipment.feet?.id, 'minecraft:iron_boots');
    const source = slot(5), dest = [slot(63), slot()];
    quickMove(source, dest, rules);
    assert.equal(source.stack, null);
    assert.deepEqual(dest.map(s => s.stack?.count), [64, 4]);
});
test('G15–G16 numeric/F swaps respect both directions, offhand max and armor restrictions', () => {
    let v = emptyInventory();
    v.hotbar[0] = stack(64);
    v.equipment.chest = stack(1, 'iron_chestplate');
    const unchanged = run(v, {type: 'swap', slot: 'equipment:chest', target: 'hotbar:0'});
    assert.deepEqual(unchanged, v);
    v.hotbar[1] = stack(1, 'iron_chestplate');
    v = run(v, {type: 'swap', slot: 'equipment:chest', target: 'hotbar:1'});
    v = run(v, {type: 'swap', slot: 'hotbar:0', target: 'equipment:offhand'});
    assert.equal(v.equipment.offhand?.count, 64);
    assert.equal(v.hotbar[0], null);
});
test('G17–G18 Q/CtrlQ delete finite units only; C/X presets copy bounded unlocked native groups', () => {
    let v = emptyInventory();
    v.hotbar[0] = stack(3);
    v = run(v, {type: 'preset', mode: 'save', index: 8});
    v = run(v, {type: 'drop', all: false});
    assert.equal(v.hotbar[0]?.count, 2);
    v = run(v, {type: 'drop', all: true});
    assert.equal(v.hotbar[0], null);
    v = run(v, {type: 'preset', mode: 'load', index: 8});
    assert.equal(v.hotbar[0]?.count, 3);
    assert.throws(() => reduceInventory(v, {type: 'preset', mode: 'load', index: 8}, [], rules), /invalid-temporary/);
    assert.throws(() => run(v, {type: 'preset', mode: 'load', index: 9}));
});
test('G19–G20 equipment auto-use swaps occupied compatible armor, never tool suffix guesses or durability', () => {
    let v = emptyInventory();
    v.hotbar[0] = stack(1, 'iron_chestplate');
    v.equipment.chest = {...stack(1, 'iron_chestplate'), components: {'minecraft:custom_data': {identity: 'second'}}};
    v = run(v, {type: 'equip'});
    assert.equal(v.equipment.chest?.id, 'minecraft:iron_chestplate');
    assert.deepEqual(v.hotbar[0]?.components, {'minecraft:custom_data': {identity: 'second'}});
    assert.equal(total(v), 2);
    v.hotbar[0] = stack(1, 'iron_pickaxe');
    assert.deepEqual(run(v, {type: 'equip'}), v);
});
test('G30 staged gestures cancel atomically on boundary, blur/escape/cancel, reject mismatched release and deduplicate cells', () => {
    const g = new SlotGesture();
    g.begin(1, 2, 'hotbar:0', 0, 0, false, 'hotbar:0');
    g.move(1, 10, 0, 'hotbar:1', true);
    g.move(1, 20, 0, 'hotbar:1', true);
    assert.deepEqual(g.end(1, 2, 100)?.slots, ['hotbar:0', 'hotbar:1']);
    g.begin(1, 0, 'hotbar:0', 0, 0, false, null);
    g.move(1, 20, 0, null, false);
    assert.equal(g.end(1, 0, 200), null);
    g.begin(1, 0, 'hotbar:0', 0, 0, false, null);
    g.cancel();
    assert.equal(g.end(1, 0, 200), null);
    g.begin(1, 1, 'hotbar:0', 0, 0, false, null);
    assert.equal(g.end(2, 1, 200), null);
    g.begin(1, 0, 'hotbar:0', 0, 0, true, null);
    assert.equal(g.end(1, 0, 300)?.double, false);
    g.begin(1, 0, 'hotbar:0', 0, 0, true, null);
    assert.equal(g.end(1, 0, 400)?.double, true);
});
test('all 113 locked identities fail source/clone/drag/preset/old-state paths and components are explicitly bounded', () => {
    for (const id of unlocked) {
        for (const mode of ['left', 'right', 'clone', 'number', 'shift', 'offhand'] as const) assert.throws(() => reduceInventory(emptyInventory(), {
            type: 'source',
            item: id,
            mode,
            index: 0
        }, [], rules), /locked-item/);
        const v = emptyInventory();
        v.hotbar[0] = {id, count: 1};
        for (const c of [{type: 'clone', slot: 'hotbar:0'}, {
            type: 'drag',
            slots: ['hotbar:1'],
            mode: 'middle'
        }, {
            type: 'preset',
            mode: 'save',
            index: 0
        }] as InventoryCommand[]) assert.throws(() => reduceInventory(v, c, [], rules), /invalid-temporary/);
    }
    const v = emptyInventory();
    v.cursor = {...stack(1), components: {'minecraft:max_stack_size': 99}};
    assert.throws(() => validateCarriers(v, unlocked, rules), /unsupported-stack/);
});
test('stable carrier rules exactly project current P4 original maximum/equipment/damage data for all 113 items', () => {
    const source = JSON.parse(readFileSync('../data/minecraft/26.3/rules.json', 'utf8'));
    assert.deepEqual(rules.items, Object.fromEntries(Object.entries(source.items).map(([id, r]: [string, any]) => [id, {maxStack: r.maxStack, ...(r.maxDamage ? {maxDamage: r.maxDamage} : {}), ...(r.equipment ? {equipment: r.equipment} : {}), ...(r.fuel ? {fuel: r.fuel} : {})}])));
});
test('finite operations conserve every identity across 1500 seeded mixed pick/drag/quick/collect/swap actions', () => {
    let v = emptyInventory();
    v.hotbar[0] = stack(57);
    v.hotbar[1] = stack(13);
    v.hotbar[3] = stack(51, 'stick');
    v.hotbar[7] = stack(1, 'iron_helmet');
    const before = total(v);
    let seed = 29374;
    for (let i = 0; i < 1500; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const a = seed % 9, b = (seed >>> 8) % 9;
        const c: InventoryCommand = i % 5 === 0 ? {
            type: 'slot',
            index: a,
            button: i % 2 ? 2 : 0
        } : i % 5 === 1 ? {
            type: 'drag',
            slots: [`hotbar:${a}`, `hotbar:${b}`, `hotbar:${a}`],
            mode: i % 2 ? 'right' : 'left'
        } : i % 5 === 2 ? {type: 'quick', slot: `hotbar:${a}`} : i % 5 === 3 ? {
            type: 'collect',
            slot: `hotbar:${a}`
        } : {type: 'swap', slot: `hotbar:${a}`, target: `hotbar:${b}`};
        v = run(v, c);
        assert.equal(total(v), before, 'seed step ' + i);
        for (const id of ['oak_planks', 'stick', 'iron_helmet']) assert.equal([...v.backpack, ...v.hotbar, ...Object.values(v.equipment), v.cursor].filter(s => s?.id === 'minecraft:' + id).reduce((n, s) => n + s!.count, 0), id === 'oak_planks' ? 70 : id === 'stick' ? 51 : 1);
    }
});
test('native zero damage is the default identity; unsupported capacity/equippable component overrides cannot bypass policy', () => {
    assert.equal(sameStack(stack(1, 'iron_pickaxe'), {
        ...stack(1, 'iron_pickaxe'),
        components: {'minecraft:damage': 0}
    }, rules), true);
    assert.equal(sameStack(stack(1, 'iron_pickaxe'), {
        ...stack(1, 'iron_pickaxe'),
        components: {'minecraft:damage': 1}
    }, rules), false);
    const v = emptyInventory();
    v.cursor = {...stack(1), components: {'minecraft:equippable': {slot: 'head'}}};
    assert.throws(() => validateCarriers(v, unlocked, rules), /unsupported-stack/);
});
test('malformed command modes/buttons never fall through into another supported inventory operation', () => {
    for (const command of [{type: 'source', item: 'minecraft:oak_planks', mode: 'bad'}, {
        type: 'slot',
        index: 0,
        button: 1
    }, {type: 'equipment', slot: 'head', button: 3}, {type: 'drag', slots: [], mode: 'bad'}, {
        type: 'preset',
        index: 0,
        mode: 'bad'
    }, {type: 'drop', all: 1}]) assert.throws(() => run(emptyInventory(), command as any));
});

/** Shared injected lock models serialized callbacks, not revision-based compare-and-swap. */
class Mutex {
    tail: Promise<unknown> = Promise.resolve();

    /** Serialize a test transaction.
     * @param {Function} work Callback.
     * @return {Promise<T>} Result.
     */exclusive<T>(work: () => Promise<T>): Promise<T> {
        const p = this.tail.then(work);
        this.tail = p.catch(() => {
        });
        return p;
    }
}

/** Create isolated cooperating sessions with a native-shaped storage port.
 * @return {Promise<{a:SaveSession,b:SaveSession,m:Map<string,string>,lock:Mutex}>} Initialized fixtures.
 */
async function sessions(): Promise<{ a: SaveSession; b: SaveSession; m: Map<string, string>; lock: Mutex }> {
    const m = new Map<string, string>(), port = {
        getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => {
            m.set(k, v);
        }
    }, lock = new Mutex(), a = new SaveSession(port, lock), b = new SaveSession(port, lock);
    await a.refresh();
    await a.dispatch({type: 'unlock', item: 'minecraft:oak_planks'});
    await b.refresh();
    return {a, b, m, lock};
}

test('stable layout refresh and presets persist, cursor is absent; progress reset retains settings and clears layout', async () => {
    const {a, b, m} = await sessions();
    let v = await a.editInventory({
        type: 'source',
        item: 'minecraft:oak_planks',
        mode: 'number',
        index: 0
    }, null, a.view.envelope!.state.progress.player.data);
    v = await a.editInventory({type: 'preset', mode: 'save', index: 2}, null, layout(v));
    await b.refresh();
    assert.deepEqual(b.view.envelope!.state.progress.player.data.hotbar[0], stack(64));
    assert.equal(b.view.envelope!.state.progress.player.data.presets[2]?.[0]?.count, 64);
    assert.ok(!Object.hasOwn(JSON.parse(m.get(SAVE_KEY)!).state.progress.player.data, 'cursor'));
    await b.dispatch({type: 'settings', patch: {volume: .8}});
    await a.refresh();
    await a.reset(token(a.view.envelope!));
    await b.refresh();
    assert.deepEqual(b.view.envelope!.state.progress.player.data, layout(emptyInventory()));
    assert.equal(b.view.envelope!.state.settings.volume, .8);
});
test('same-layout concurrent pickup commits once; changed layout conflicts safely rather than duplicating into two cursors', async () => {
    const {a, b} = await sessions();
    await a.editInventory({
        type: 'source',
        item: 'minecraft:oak_planks',
        mode: 'number',
        index: 0
    }, null, a.view.envelope!.state.progress.player.data);
    await b.refresh();
    const expected = a.view.envelope!.state.progress.player.data, res = await Promise.allSettled([a.editInventory({
        type: 'slot',
        index: 0,
        button: 0
    }, null, expected), b.editInventory({type: 'slot', index: 0, button: 0}, null, expected)]);
    assert.equal(res.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(String((res.find(r => r.status === 'rejected') as PromiseRejectedResult).reason), /inventory-conflict/);
    assert.equal(b.view.envelope!.state.progress.player.data.hotbar[0], null);
    assert.equal(b.view.writable, true);
});
test('unrelated settings/unlock transactions merge with carrier intents; reset fences an already queued old layout write', async () => {
    const {a, b, lock} = await sessions(), expected = a.view.envelope!.state.progress.player.data;
    await b.dispatch({type: 'settings', patch: {volume: .9}});
    await a.editInventory({type: 'source', item: 'minecraft:oak_planks', mode: 'number', index: 0}, null, expected);
    assert.equal(a.view.envelope!.state.settings.volume, .9);
    await b.refresh();
    let release!: () => void;
    const held = lock.exclusive(() => new Promise<void>(r => release = r));
    await Promise.resolve();
    const reset = a.reset(token(a.view.envelope!)),
        stale = b.editInventory({type: 'drop', all: true}, null, b.view.envelope!.state.progress.player.data);
    release();
    await held;
    await reset;
    await assert.rejects(stale, /stale-session/);
});
test('P3 checksummed save migrates reserved player only, retains progress/settings/cake and old bytes until a valid change', async () => {
    let s = initialState();
    s = transition(s, {type: 'unlock', item: 'minecraft:cake'}).state;
    s = transition(s, {type: 'select-scene', scene: 'home'}).state;
    s = structuredClone(s);
    s.progress.player.data.hotbar[0] = {id: 'minecraft:cake', count: 1};
    s = transition(s, {type: 'record-cake-placement', scene: 'home', table: 'birthday-table'}).state;
    const e = await seal(s, 'old-epoch', 17), {checksum: _, ...base} = e,
        old = {...base, contentVersion: 'p3-foundation-1', state: structuredClone(s) as any};
    old.state.progress.recipeBook = {version: 0, data: null};
    old.state.progress.player = {version: 0, data: null};
    const raw = JSON.stringify({...old, checksum: await checksum(old)}), decoded = await decode(raw);
    assert.equal(decoded.migrated, true);
    assert.deepEqual(decoded.envelope.state.progress.player.data, layout(emptyInventory()));
    assert.deepEqual(decoded.envelope.state.progress.cakePlacement, s.progress.cakePlacement);
    assert.equal(decoded.envelope.revision, 17);
    old.state.progress.player.data = {unexpected: 1};
    await assert.rejects(() => checksum(old).then(c => decode(JSON.stringify({
        ...old,
        checksum: c
    }))), /migration-failed/);
});
test('carrier write failure cannot publish a successful pickup or overwrite previous bytes; extra persisted cursor is rejected', async () => {
    const {a, m} = await sessions();
    await a.editInventory({
        type: 'source',
        item: 'minecraft:oak_planks',
        mode: 'number',
        index: 0
    }, null, a.view.envelope!.state.progress.player.data);
    const raw = m.get(SAVE_KEY)!, before = a.view.envelope!.state;
    a.storage = {
        getItem: k => m.get(k) ?? null, setItem: () => {
            throw Error('quota');
        }
    };
    await assert.rejects(() => a.editInventory({
        type: 'slot',
        index: 0,
        button: 0
    }, null, before.progress.player.data), /write-failed/);
    assert.equal(m.get(SAVE_KEY), raw);
    assert.deepEqual(a.view.envelope!.state, before);
    const bad: any = structuredClone(before);
    bad.progress.player.data.cursor = stack(1);
    await assert.rejects(() => seal(bad, 'unknown-field', 1), /invalid-save/);
});
