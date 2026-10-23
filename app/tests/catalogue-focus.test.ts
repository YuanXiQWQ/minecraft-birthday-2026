/** Creative search focus is a menu lifecycle, independent from recipe-book editor focus. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {GameInventory} from '../web/src/ui/inventory.ts';
import {InventoryInput} from '../web/src/ui/inventory-input.ts';
import {emptyInventory} from '../web/src/ui/inventory-state.ts';
import {resources} from '../tools/resources.ts';

/** Bind actual inventory methods to an observable semantic focus owner.
 * @return {object} Formal UI with minimal rendering and document ports.
 */
function focusHarness() {
    const page = {activeElement: null as unknown}, search = {hidden: false, focus() {page.activeElement = search;}};
    const button = {focus() {page.activeElement = button;}}, ui = Object.create(GameInventory.prototype) as GameInventory;
    Object.assign(ui, {tab: 'catalogue', station: null, search, value: emptyInventory(), permanent: {}, text: (key: string) => key, input: {cancel() {}}, blocked: () => false, gate() {},
        modal: {open: false, setAttribute() {}, show() {this.open = true;}, querySelector: () => button}, draw() {search.hidden = ui.tab !== 'catalogue';}});
    Object.defineProperty(globalThis, 'document', {value: page, configurable: true});
    return {ui, page, search, button};
}

test('formal open focuses creative search immediately and preserves it on repeated focus requests', () => {
    const {ui, page, search} = focusHarness();
    ui.open();
    assert.equal(page.activeElement, search);
    assert.equal(ui.search.hidden, false);
    page.activeElement = {role: 'scrollbar'};
    assert.equal(ui.focusCatalogue(), true);
    assert.equal(page.activeElement, search);
});

test('recipe book, player page, real stations and closed menus never inherit catalogue autofocus', () => {
    const {ui, page} = focusHarness(), recipeSearch = {};
    ui.open();
    for (const change of [{tab: 'crafting'}, {tab: 'equipment'}, {tab: 'catalogue', station: {id: 'bench'}}, {station: null, modal: {open: false}}]) {
        Object.assign(ui, change); page.activeElement = recipeSearch;
        assert.equal(ui.focusCatalogue(), false);
        assert.equal(page.activeElement, recipeSearch);
    }
});

test('creative search text captures letters while hovered numeric copies and Esc retain their native routes', () => {
    const {ui, search} = focusHarness(), input = Object.create(InventoryInput.prototype) as InventoryInput, actions: unknown[] = [];
    ui.open();
    Object.assign(ui, {carrierBusy: () => false, hover: null, close: () => actions.push('close'), copySource: (...args: unknown[]) => actions.push(args)});
    Object.assign(input, {ui, keys: new Set(), editing: (target: unknown) => target === search, cancel() {}, cancelGesture() {}});
    const key = (code: string) => input.key({code, target: search, preventDefault() {}, stopPropagation() {}} as unknown as KeyboardEvent);
    for (const code of ['KeyE', 'KeyF', 'KeyQ', 'KeyC', 'KeyX', 'Digit2']) key(code);
    assert.deepEqual(actions, []);
    ui.hover = {kind: 'source', item: 'minecraft:oak_log', x: 0, y: 0};
    key('Digit2');
    assert.deepEqual(actions, [[ui.hover, 'number', 1]]);
    key('Escape');
    assert.equal(actions.at(-1), 'close');
});

test('native compass exports all original range models without a hardcoded UI direction', () => {
    const files = resources(), manifest = JSON.parse(new TextDecoder().decode(files.get('book-manifest.json')));
    assert.equal(manifest.compassModels.length,32);
    assert.equal(manifest.uiCompass,undefined);
    const definition=JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/items/compass.json')));
    assert.deepEqual(manifest.compassModels,[...new Set(definition.model.on_false.entries.map((e:any)=>e.model.model))]);
    for(const id of manifest.compassModels){const model=JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/models/'+id.split(':')[1]+'.json')));assert.ok(files.has('assets/minecraft/textures/'+model.textures.layer0.split(':')[1]+'.png'));}
    assert.deepEqual(files.get('assets/minecraft/textures/item/compass_12.png'), readFileSync(new URL('../../resources/minecraft/26.3/assets/minecraft/textures/item/compass_12.png', import.meta.url)));
    assert.equal(createHash('sha256').update(files.get('assets/minecraft/textures/item/compass_12.png')!).digest('hex'), 'b513404a2d8c886b97ea9d5bfa07ea00b4f7d631e5a616bc166c72e54e290ee2');
});
