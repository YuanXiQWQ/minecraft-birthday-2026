/** Formal WorldUse timing methods commit through real SaveSession; only the clock and ray surface are controlled. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SaveSession} from '../web/src/persistence/session.ts';
import {WorldUse} from '../web/src/ui/world-use.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {token} from '../web/src/persistence/codec.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Same-version rules are never replaced with guessed tool speeds. */
const rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;
for (const boundary of ['complete', 'release', 'target', 'tool', 'gui', 'look', 'hidden', 'reset']) test('actual WorldUse held mining lifecycle: ' + boundary, async () => {
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
        oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', {value: {setInterval: () => 1}, configurable: true});
    Object.defineProperty(globalThis, 'document', {value: {hidden: false}, configurable: true});
    let raw: string | null = null, pending = Promise.resolve();
    try {
        const session = new SaveSession({
            getItem: () => raw,
            setItem: (_k, v) => raw = v
        }, {exclusive: work => work()}, WORLD_REGION);
        session.rules = rules;
        await session.refresh();
        const hit = {
            id: 'node:oak_log:0',
            point: [-5.5, .5, -2.5] as [number, number, number],
            normal: [0, 0, 1] as [number, number, number]
        }, ui = Object.create(WorldUse.prototype) as WorldUse;
        Object.assign(ui, {abort: new AbortController(),
            session,
            inventory: {
                rules,
                value: {...session.view.envelope!.state.progress.player.data, cursor: null},
                modal: {open: false}
            },
            scene: {
                renderer: {domElement: {dataset: {}}}, input: true, look: {active: null}, showCrack() {
                }, breakEffect() {
                }, refreshHover: () => hit
            },
            sound() {
            },
            notify() {
            },
            preview() {
            },
            mining: null,
            miningTimer: 0
        });
        ui.run = (...args) => pending = WorldUse.prototype.run.apply(ui, args);
        ui.beginMining(hit, 1000);
        ui.advanceMining(3999);
        assert.equal(session.view.envelope!.state.progress.world.visits.plains.removed.length, 0);
        if (boundary === 'release') ui.cancelMining();
        if (boundary === 'target') ui.scene.refreshHover = () => ({...hit, id: 'node:oak_log:1'});
        if (boundary === 'tool') await session.editInventory({
            type: 'select',
            index: 1
        }, null, session.view.envelope!.state.progress.player.data);
        if (boundary === 'gui') ui.inventory.modal.open = true;
        if (boundary === 'look') (ui.scene.look as any).active = {};
        if (boundary === 'hidden') (document as any).hidden = true;
        if (boundary === 'reset') await session.reset(token(session.view.envelope!));
        ui.advanceMining(4000);
        await pending;
        assert.equal(session.view.envelope!.state.progress.world.visits.plains.removed.includes('oak_log:0'), boundary === 'complete');
        assert.equal(ui.mining, null);
        if (boundary === 'complete') assert.ok(session.view.envelope!.state.progress.unlocked.includes('minecraft:oak_log'));
    } finally {
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete (globalThis as any).window;
        if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete (globalThis as any).document;
    }
});
