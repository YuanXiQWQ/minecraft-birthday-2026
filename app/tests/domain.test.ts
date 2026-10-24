/** Domain contracts assert facts and counterexamples without DOM, renderer or unapproved finite-stack behavior. */
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    catalogue,
    freeze,
    hasCake,
    initialRuntime,
    initialState,
    MAINLINE,
    resetState,
    transition,
    validateState
} from '../web/src/domain/state.ts';
import type {Station} from '../web/src/domain/types.ts';

test('unlock is immutable, monotonic and idempotent; side items follow first acquisition', () => {
    const start = freeze(initialState()), first = transition(start, {type: 'unlock', item: 'minecraft:charcoal'}),
        again = transition(first.state, {type: 'unlock', item: 'minecraft:charcoal'}),
        last = transition(again.state, {type: 'unlock', item: 'minecraft:coal'});
    assert.equal(first.events.filter(e => e.type === 'item-unlocked').length, 1);
    assert.deepEqual(again.events, []);
    assert.deepEqual(start.progress.unlocked, []);
    assert.deepEqual(last.state.progress.unlocked, ['minecraft:charcoal', 'minecraft:coal']);
    assert.deepEqual(catalogue(last.state).slice(0, MAINLINE.length).map(v => v.item), MAINLINE);
    assert.deepEqual(catalogue(last.state).slice(MAINLINE.length).map(v => v.item), last.state.progress.unlocked);
    assert.throws(() => last.state.progress.unlocked.push('minecraft:egg'));
});
test('completion is a single table fact; requires unlocked cake, home context and the canonical table', () => {
    let s = initialState();
    assert.throws(() => transition(s, {
        type: 'record-cake-placement',
        scene: 'home',
        table: 'birthday-table'
    }), /invalid-cake/);
    s = transition(s, {type: 'unlock', item: 'minecraft:cake'}).state;
    assert.equal(hasCake(s), false);
    assert.throws(() => transition(s, {type: 'record-cake-placement', scene: 'home', table: 'birthday-table'}));
    s = transition(s, {type: 'select-scene', scene: 'home'}).state;
    s = structuredClone(s);
    s.progress.player.data.hotbar[0] = {id: 'minecraft:cake', count: 1};
    const result = transition(s, {type: 'record-cake-placement', scene: 'home', table: 'birthday-table'});
    assert.equal(hasCake(result.state), true);
    assert.deepEqual(result.events, [{type: 'cake-placed'}, {type:'advancements-completed',advancements:['jerrys_farm:happy_birthday']}]);
    assert.deepEqual(transition(result.state, {
        type: 'record-cake-placement',
        scene: 'home',
        table: 'birthday-table'
    }).events, []);
    assert.deepEqual(initialRuntime(), {celebration: 'idle', screen: 'scene', natural: {}});
});
test('placement accepts only explicit authored policy; stable instances remain separate from view and natural state', () => {
    let s = transition(initialState(), {type: 'unlock', item: 'minecraft:furnace'}).state;
    const station: Station = {
        id: 'station-1',
        kind: 'furnace',
        cell: [1, 0, -2],
        facing: 'east',
        contents: emptyFurnace()
    }, cmd = {type: 'put-station' as const, scene: 'plains' as const, station};
    assert.throws(() => transition(s, cmd), /placement-policy-pending/);
    const policy = {allows: () => true};
    s = transition(s, cmd, policy).state;
    assert.deepEqual(s.progress.scenes.plains.stations, [station]);
    assert.throws(() => transition(s, {...cmd, station: {...station, id: 'other'}}, policy));
    assert.throws(() => transition(s, {...cmd, station: {...station, cell: [NaN, 0, 0]}}, policy));
    assert.throws(() => transition(s, {...cmd, station: {...station, facing: 'down'}}, policy));
    s = transition(s, {...cmd, station: {...station, facing: 'south'}}, policy).state;
    assert.equal(s.progress.scenes.plains.stations[0].facing, 'south');
    s = transition(s, {type: 'remove-station', scene: 'plains', id: 'station-1'}).state;
    assert.equal(s.progress.scenes.plains.stations.length, 0);
    assert.ok(s.progress.unlocked.includes('minecraft:furnace'));
});
test('unsupported IDs, contract payloads, malformed coordinates and extra durable fields are never discarded silently', () => {
    assert.throws(() => transition(initialState(), {type: 'unlock', item: 'minecraft:unrecognised'}), /unknown-item/);
    const s: any = initialState();
    s.progress.player = {version: 99, data: {count: 64}};
    assert.throws(() => validateState(s), /pending-contract/);
    s.progress.player = initialState().progress.player;
    s.progress.natural = {tree: false};
    assert.throws(() => validateState(s));
});
test('progress reset retains approved settings and clears all progress without changing other snapshots', () => {
    let s = transition(initialState(), {type: 'settings', patch: {locale: 'fr', volume: .75, muted: true}}).state;
    s = transition(s, {type: 'unlock', item: 'minecraft:egg'}).state;
    const reset = resetState(s.settings);
    assert.deepEqual(reset.settings, s.settings);
    assert.deepEqual(reset.progress.unlocked, []);
    assert.equal(hasCake(reset), false);
    assert.equal(s.progress.unlocked.length, 1);
});
