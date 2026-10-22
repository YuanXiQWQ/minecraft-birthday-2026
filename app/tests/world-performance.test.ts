/** Timing optimizations preserve immutable rules, formal save outcomes and active-time ownership. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceActiveTicks, TickClock} from '../web/src/persistence/processing-clock.ts';
import {matchCooking} from '../web/src/rules/matcher.ts';
import {freeze, initialState, transition} from '../web/src/domain/state.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal, token} from '../web/src/persistence/codec.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {emptyFurnace, inputChanged} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {PixelUI} from '../web/src/ui/pixels.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Original runtime recipes remain the oracle rather than a hand-written optimized table. */
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;

test('cooking cache preserves native first-match semantics and ignores invalid counts even after a cached hit', () => {
    const frozen = freeze(structuredClone(rules));
    for (const id of Object.keys(rules.items)) for (const kind of ['furnace', 'blast_furnace'] as const) {
        const input = {id, count: 1}, expected = matchCooking(input, kind, rules);
        assert.deepEqual(matchCooking(input, kind, frozen), expected);
        assert.deepEqual(matchCooking({
            ...input,
            components: {'minecraft:custom_data': {sample: 1}}
        }, kind, frozen), expected);
        assert.equal(matchCooking({...input, count: 0}, kind, frozen), null);
    }
});
test('mutable rule providers never reuse stale cached recipes and separate frozen registries cannot contaminate each other', () => {
    const a = structuredClone(rules), input = {id: 'minecraft:oak_log', count: 1};
    assert.ok(matchCooking(input, 'furnace', a));
    a.recipes = [];
    assert.equal(matchCooking(input, 'furnace', a), null);
    assert.equal(matchCooking(input, 'furnace', freeze(a)), null);
    assert.ok(matchCooking(input, 'furnace', freeze(structuredClone(rules))));
});

test('long active stall drains all ticks through real SaveSession in five-tick turns with identical output and discovery ordering', async () => {
    const state = initialState();
    state.progress.unlocked = ['minecraft:furnace', 'minecraft:hopper', 'minecraft:oak_log', 'minecraft:stick'];
    const f = emptyFurnace();
    f.data.input = {id: 'minecraft:oak_log', count: 1};
    f.data.fuel = {id: 'minecraft:stick', count: 1};
    inputChanged(f.data, null, 'furnace', rules);
    state.progress.scenes.plains.stations = [{
        id: 'f',
        kind: 'furnace',
        cell: [3, 1, 0],
        facing: 'south',
        contents: f
    }, {id: 'h', kind: 'hopper', cell: [3, 0, 0], facing: 'down', contents: emptyHopper()}];
    let raw = JSON.stringify(await seal(state, 'batch', 0));
    const s = new SaveSession({
        getItem: () => raw,
        setItem: (_k, v) => raw = v
    }, {exclusive: work => work()}, WORLD_REGION);
    s.rules = rules;
    await s.refresh();
    const clock = new TickClock(0), ticks = clock.sample(30000), batches: number[] = [], events: string[] = [];
    let yields = 0;
    s.eventListeners.add(es => events.push(...es.map(e => JSON.stringify(e))));
    assert.equal(await advanceActiveTicks(ticks, n => {
        batches.push(n);
        return s.transact({type: 'processing-tick', ticks: n});
    }, () => true, async () => {
        yields++;
    }), 600);
    assert.equal(Math.max(...batches), 5);
    assert.equal(yields, 119);
    const once = transition(state, {type: 'processing-tick', ticks: 600}, WORLD_REGION, rules);
    assert.deepEqual(s.view.envelope!.state, once.state);
    assert.deepEqual(events, once.events.map(e => JSON.stringify(e)));
});

test('reset at a catch-up yield fences remaining commits and cannot restore old devices or progress', async () => {
    let raw = JSON.stringify(await seal(initialState(), 'old', 0));
    const s = new SaveSession({
        getItem: () => raw,
        setItem: (_k, v) => raw = v
    }, {exclusive: work => work()}, WORLD_REGION);
    s.rules = rules;
    await s.refresh();
    const generation = s.view.envelope!.generation;
    let yields = 0;
    const count = await advanceActiveTicks(600, n => s.transact({
        type: 'processing-tick',
        ticks: n
    }, () => s.view.envelope?.generation === generation), () => s.view.envelope?.generation === generation, async () => {
        if (++yields === 2) await s.reset(token(s.view.envelope!));
    });
    assert.equal(count, 10);
    assert.notEqual(s.view.envelope!.generation, generation);
    assert.deepEqual(s.view.envelope!.state, initialState());
    assert.equal(s.view.writable, true);
});

test('unchanged native text skips canvas/layout work while changed copy, scale and color still redraw', () => {
    const ui = Object.create(PixelUI.prototype) as PixelUI, host = {} as HTMLElement;
    let paints = 0;
    ui.texts = new Map([[host, {text: 'Plains', scale: 2, color: '#FFF7DE'}]]);
    ui.updates = new Map([[host, () => paints++]]);
    for (let i = 0; i < 100; i++) ui.text(host, 'Plains');
    assert.equal(paints, 0);
    ui.text(host, 'Farm');
    ui.text(host, 'Farm', 3);
    ui.text(host, 'Farm', 3, '#000');
    assert.equal(paints, 3);
});
