/** Original model dependency evidence and localization contracts are verified independently of page screenshots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {resources, RESOURCE_ROOT} from '../tools/resources.ts';
import {compileModel, resolveModel} from '../web/src/render/model-format.ts';
import {ENGLISH, translate} from '../web/src/i18n/index.ts';
import {wrap} from '../web/src/ui/pixels.ts';
import {PRESENTATION} from '../web/src/render/presentation.ts';

test('both original-resource profiles verify exact bytes; the uncut cake has original inset and half-block height', () => {
    const files = resources(), profile = JSON.parse(new TextDecoder().decode(files.get('presentation-manifest.json')));
    assert.equal(profile.entries.length, 17);
    assert.equal(files.size,783+1+JSON.parse(new TextDecoder().decode(files.get('ambience-manifest.json'))).entries.length+1+JSON.parse(new TextDecoder().decode(files.get('startup-manifest.json'))).entries.length);
    const docs = new Map([...files].filter(([n]) => n.endsWith('.json')).map(([n, b]) => [n, JSON.parse(new TextDecoder().decode(b))]));
    for (const model of Object.values(profile.models) as string[]) {
        const source = resolveModel(model, id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json'));
        const compiled = compileModel(source, {model});
        assert.ok(compiled.indices.length > 0);
        for (const texture of compiled.textures) assert.ok(files.has('assets/minecraft/textures/' + texture.split(':')[1] + '.png'));
        if (model.endsWith('/cake')) {
            const xs = compiled.positions.filter((_, i) => i % 3 === 0),
                ys = compiled.positions.filter((_, i) => i % 3 === 1);
            assert.equal(Math.min(...xs), 1 / 16);
            assert.equal(Math.max(...xs), 15 / 16);
            assert.equal(Math.max(...ys), .5);
        }
    }
    const state = docs.get('assets/minecraft/blockstates/cake.json');
    assert.equal(Object.keys(state.variants).length, 7);
    for (const variant of Object.values(state.variants) as { model: string }[]) {
        assert.ok(docs.has('assets/minecraft/models/' + variant.model.split(':')[1] + '.json'));
        const compiled = compileModel(resolveModel(variant.model, id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json')), variant);
        assert.ok(compiled.indices.length > 0);
        for (const texture of compiled.textures) assert.ok(files.has('assets/minecraft/textures/' + texture.split(':')[1] + '.png'));
    }
    assert.ok(RESOURCE_ROOT.endsWith(resolve('..', 'resources', 'minecraft', '26.3')));
});
test('missing language keys fall back to English; missing English and missing interpolation fail visibly in tests', () => {
    assert.equal(translate('common.settings', {}, {}), 'Settings');
    assert.equal(translate('common.settings', {}, {'common.settings': 'Preferences'}), 'Preferences');
    assert.equal(translate('home.title', {recipient: 'Vincent'}, {'home.title': 'Wrong {name}'}), 'Happy Birthday, Vincent!');
    assert.throws(() => translate('missing.english.key'), /missing-english/);
    assert.throws(() => translate('common.settings', {}, {}, {}), /missing-english/);
    assert.throws(() => translate('home.title'), /missing-locale-argument/);
});
test('every statically declared page key exists in external English and all English glyphs fit the ASCII profile', () => {
    const source = readFileSync(resolve('web/src/ui/inventory.ts'), 'utf8') + readFileSync(resolve('web/src/ui/inventory-input.ts'), 'utf8') + readFileSync(resolve('web/src/app.ts'), 'utf8') + readFileSync(resolve('web/index.html'), 'utf8') + readFileSync(resolve('web/game/index.html'), 'utf8');
    for (const key of Object.keys(ENGLISH)) assert.equal(typeof ENGLISH[key as keyof typeof ENGLISH], 'string');
    for (const match of source.matchAll(/['"]((?:home|game|settings|common|error|status|html|a11y|inventory)\.[A-Za-z0-9_-]+)['"]/g)) assert.ok(Object.hasOwn(ENGLISH, match[1]), match[1]);
    for (const value of Object.values(ENGLISH)) assert.match(value, /^[\x20-\x7e\n]*$/);
    assert.equal(readdirSync(resolve('web/src')).includes('labels.ts'), false);
});
test('long text wraps at words and within long tokens without deleting copy or exceeding the measured line width', () => {
    const text = 'A verylonglocalizationtoken repeated words for the birthday table';
    const lines = wrap(text, 12, v => v.length);
    assert.ok(lines.length > 3);
    assert.ok(lines.every(v => v.length <= 12));
    assert.equal(lines.join('').replaceAll(' ', ''), text.replaceAll(' ', ''));
});
test('presentation keeps native slab thickness and exact cake contact, with a materially larger authored environment', () => {
    const files = resources(),
        docs = new Map([...files].filter(([n]) => n.endsWith('.json')).map(([n, b]) => [n, JSON.parse(new TextDecoder().decode(b))])),
        id = 'minecraft:block/oak_slab',
        model = compileModel(resolveModel(id, n => docs.get('assets/minecraft/models/' + n.split(':')[1] + '.json')), {model: id}),
        top = Math.max(...model.positions.filter((_, i) => i % 3 === 1));
    assert.equal(top, .5);
    assert.equal(PRESENTATION.tabletopY + top, PRESENTATION.cakeY);
    assert.equal(PRESENTATION.xMax - PRESENTATION.xMin + 1, 49);
    assert.equal(PRESENTATION.zMax - PRESENTATION.zMin + 1, 37);
    assert.equal(PRESENTATION.eye, 1.62);
});
