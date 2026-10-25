/** Native armor feedback follows committed right-click equipment changes and audited resources. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {PersonalCursor} from '../web/src/domain/personal-menu.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {WorldAudio} from '../web/src/render/world-audio.ts';
import type {SoundOptions} from '../web/src/render/world-audio.ts';
import {resources} from '../tools/resources.ts';

/** Bind actual right-click equipment and its command queue to the transactional save owner.
 * @param {string} item Native held item identifier.
 * @return {Promise<object>} Inventory, session, recorded feedback and storage failure switch.
 */
async function equipment(item = 'minecraft:iron_helmet') {
    let raw: string | null = null, deny = false;
    const session = new SaveSession({getItem: () => raw, setItem: (_key, value) => {if (deny) throw Error('write-failed'); raw = value;}}, {exclusive: async work => work()}, {allows: () => true});
    session.rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8'));
    await session.refresh();
    await session.dispatch({type: 'unlock', item});
    await session.editInventory({type: 'source', item, mode: 'number', index: 0}, null, session.view.envelope!.state.progress.player.data);
    const calls: {id: string; options: SoundOptions}[] = [];
    const ui = Object.assign(Object.create(GameInventory.prototype), {
        permanent: session.view.envelope!.state, value: {...structuredClone(session.view.envelope!.state.progress.player.data), cursor: null, crafting: Array(4).fill(null)},
        rules: session.rules, writable: true, generation: session.view.envelope!.generation, queueEpoch: 0, pending: 0, queue: Promise.resolve(), personal: new PersonalCursor(),
        disposed: false, station: null, acquisition: null, closing: null, modal: {open: false}, tooltip: {hidden: true}, input: {cancel() {}}, blocked: () => false, draw() {}, reportFailure() {},
        sound: (id: string, options: SoundOptions) => calls.push({id, options})
    }) as GameInventory;
    ui.commit = async (...args) => {const result = await session.editInventory(...args); ui.permanent = session.view.envelope!.state; return result;};
    return {ui, session, calls, deny: () => {deny = true;}};
}

for (const [part, slot] of [['helmet', 'head'], ['chestplate', 'chest'], ['leggings', 'legs'], ['boots', 'feet']] as const) test('right-click ' + part + ' plays once after a successful save', async () => {
    const h = await equipment('minecraft:iron_' + part);
    try {
        assert.equal(h.ui.autoEquip(), true);
        assert.equal(h.calls.length, 0);
        await h.ui.queue;
        assert.equal(h.session.view.envelope!.state.progress.player.data.equipment[slot]?.id, 'minecraft:iron_' + part);
        assert.equal(h.calls.length, 1);
        assert.equal(h.calls[0].id, 'item.armor.equip_iron');
        assert.equal(h.calls[0].options.volume, 1);
        assert.equal(h.calls[0].options.pitch, 1);
        assert.equal(h.calls[0].options.valid!(), true);
        assert.equal(h.ui.autoEquip(), false);
        await h.ui.queue;
        assert.equal(h.calls.length, 1);
        h.ui.generation = 'another-save';
        assert.equal(h.calls[0].options.valid!(), false);
    } finally {h.session.dispose();}
});

test('identical armor, rejected saves and stale acknowledgements do not play equipment audio', async () => {
    for (const mode of ['identical', 'failure', 'stale'] as const) {
        const h = await equipment();
        try {
            if (mode === 'identical') {
                h.ui.autoEquip(); await h.ui.queue; h.calls.length = 0;
                h.ui.command({type: 'source', item: 'minecraft:iron_helmet', mode: 'number', index: 0}); await h.ui.queue;
            } else if (mode === 'failure') h.deny();
            else {const commit = h.ui.commit; h.ui.commit = async (...args) => {const result = await commit(...args); h.ui.queueEpoch++; return result;};}
            h.ui.autoEquip(); await h.ui.queue;
            assert.deepEqual(h.calls, [], mode);
        } finally {h.session.dispose();}
    }
});

test('replacing distinct equipped armor plays one sound and preserves the exchanged item', async () => {
    const h = await equipment();
    try {
        h.ui.autoEquip(); await h.ui.queue;
        h.ui.command({type: 'equipment', slot: 'head', button: 0}); await h.ui.queue;
        h.ui.value.cursor!.components = {'minecraft:damage': 1};
        h.ui.personal.value = structuredClone(h.ui.value.cursor);
        h.ui.command({type: 'equipment', slot: 'head', button: 0}); await h.ui.queue;
        h.ui.command({type: 'source', item: 'minecraft:iron_helmet', mode: 'number', index: 0}); await h.ui.queue;
        h.calls.length = 0;
        h.ui.autoEquip(); await h.ui.queue;
        assert.equal(h.calls.length, 1);
        assert.equal(h.ui.value.hotbar[0]?.components?.['minecraft:damage'], 1);
        assert.equal(h.ui.value.equipment.head?.components?.['minecraft:damage'] ?? 0, 0);
    } finally {h.session.dispose();}
});

test('all original iron equipment samples are shipped and playback obeys the player channel', async () => {
    const files = resources(), definitions = JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/controls-sounds.json')));
    assert.deepEqual(definitions['item.armor.equip_iron'].sounds, Array.from({length: 6}, (_, i) => 'item/armor/equip_iron' + (i + 1)));
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {configurable: true, value: Object.assign(new EventTarget(), {hidden: false})});
    const settings = {volume: .8, muted: false, playersVolume: .5}, audio = new WorldAudio(new Map([['assets/minecraft/controls-sounds.json', definitions]]), () => settings as any);
    const gain = {gain: {value: 0}, connect() {}, disconnect() {}};
    audio.context = {state: 'running', createGain: () => gain, createBufferSource: () => ({playbackRate: {value: 1}, connect() {}, start() {}, stop() {}, disconnect() {}}), close: async () => {}} as any;
    try {
        for (const sample of definitions['item.armor.equip_iron'].sounds) {
            const path = 'assets/minecraft/sounds/' + sample + '.ogg';
            assert.equal(Buffer.from(files.get(path)!).subarray(0, 4).toString(), 'OggS');
            audio.buffers.set(path, {duration: .5} as AudioBuffer);
        }
        assert.equal(await audio.play('item.armor.equip_iron', {volume: 1, pitch: 1}), 'scheduled');
        assert.equal(gain.gain.value, .4);
        settings.playersVolume = 0;
        assert.equal(await audio.play('item.armor.equip_iron'), 'suppressed');
    } finally {audio.dispose(); if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');}
});
