/** Native loading primitives, exact original assets and startup lifetime boundaries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LoadingProgress, loadingLayout, loadingCell, LOADING_STAGES, PANORAMA_FACES} from '../web/src/ui/loading-progress.ts';
import {resources} from '../tools/resources.ts';
import {LoadingScreen} from '../web/src/ui/loading-screen.ts';

test('loading never advances uncompleted work merely because realtime passes', () => {
    const p = new LoadingProgress(); p.advance(60000); assert.equal(p.target, 0); assert.equal(p.smoothed, 0);
    p.update('bootstrap', 1); p.update('code', 1); p.update('resources', 3, 10);
    assert.equal(p.target, 2.3 / 7); p.advance(5000); assert.ok(p.smoothed <= p.target && p.smoothed > p.target - .000001);
    p.update('resources', 1, 10); assert.equal(p.values.get('resources'), .3);
});

test('native progress smoothing uses float .2 per 50ms tick, not frame count', () => {
    const p = new LoadingProgress(); for (const key of LOADING_STAGES) p.update(key, 1);
    p.advance(49); assert.equal(p.smoothed, 0); p.advance(1); assert.equal(p.smoothed, Math.fround(.2));
    p.advance(50); assert.equal(p.smoothed, Math.fround(Math.fround(.2) + Math.fround(Math.fround(1 - Math.fround(.2)) * Math.fround(.2))));
    const small = new LoadingProgress(), large = new LoadingProgress(); small.update('icons', 4, 5); large.update('icons', 4, 5);
    for (let i = 0; i < 100; i++) small.advance(10); large.advance(1000);
    assert.equal(small.smoothed, large.smoothed); assert.ok(Math.abs(small.spin - large.spin) < 1e-5);
});

test('panorama completes a full turn in 180 visible realtime seconds independently of game ticks', () => {
    const p = new LoadingProgress(); p.advance(90000); assert.equal(p.spin, -180); p.advance(90000); assert.equal(p.spin, 0);
    assert.deepEqual(PANORAMA_FACES, [1, 3, 5, 4, 0, 2]);
    p.advance(-1); p.advance(NaN); assert.equal(p.spin, 0);
});

test('disposed progress ignores late loader callbacks and cannot restart animation', () => {
    const p = new LoadingProgress(); p.update('save', 1); p.advance(50); const state = {target: p.target, spin: p.spin, value: p.smoothed};
    p.ended = true; p.update('frame', 1); p.advance(10000);
    assert.deepEqual({target: p.target, spin: p.spin, value: p.smoothed}, state);
});

test('native text, two-pixel bar and status square remain centered at narrow and DPR viewports', () => {
    for (const [w, h, dpr] of [[1280,720,1.25], [1920,1080,1], [1440,900,2], [390,844,1]]) {
        const l = loadingLayout(w,h,dpr);
        assert.equal(l.barX + 100, l.cx); assert.equal(l.barY, l.textY + 12);
        assert.equal(l.chunkX + l.side / 2, l.cx); assert.equal(l.chunkY + l.side / 2, l.cy);
        assert.equal(l.side, 70); assert.ok(l.barX >= 0); assert.ok(l.chunkY + l.side < l.h); assert.ok(l.textY >= 0);
        assert.ok(Number.isInteger(l.scale * dpr));
    }
});

test('decorative chunk-style indicator uses native black, gray and white without touching real world state', () => {
    assert.equal(loadingCell(0,0,0), 0); assert.equal(loadingCell(0,0,.5), 0xffffff);
    assert.equal(loadingCell(12,12,.5), 0xcccccc); assert.equal(loadingCell(17,17,.5), 0);
    assert.equal(loadingCell(-12,12,.5), loadingCell(12,-12,.5));
});

test('formal resource profile contains full official panorama faces rather than the client jar placeholders', () => {
    const files = resources(), manifest = JSON.parse(new TextDecoder().decode(files.get('startup-manifest.json')));
    assert.equal(manifest.assetIndex.id, '34'); assert.equal(manifest.entries.length, 7);
    for (const entry of manifest.entries) {
        const body = files.get(entry.entry)!;
        assert.equal(body.length, entry.size); assert.equal(createHash('sha1').update(body).digest('hex'), entry.assetSha1);
        if (!entry.entry.includes('_overlay')) {assert.equal(Buffer.from(body).readUInt32BE(16), 1024); assert.equal(Buffer.from(body).readUInt32BE(20), 1024); assert.ok(body.length > 300000);}
    }
    for (const [path, expected] of Object.entries(manifest.inputs) as [string, {size:number;sha256:string}][]) {
        const body = files.get(path)!; assert.equal(body.length, expected.size); assert.equal(createHash('sha256').update(body).digest('hex'), expected.sha256);
    }
});

test('formal entry paints original fallback before the application import and contains no prototype controls', () => {
    const html = readFileSync(new URL('../web/game/index.html', import.meta.url),'utf8'), entry = readFileSync(new URL('../web/src/game.ts', import.meta.url),'utf8');
    assert.ok(html.indexOf('id="native-loading"') < html.indexOf('id="app"')); assert.match(html, /panorama_0\.png/);
    assert.doesNotMatch(html, /<button|Welcome|table-caption/); assert.match(entry, /import\('\.\/app\.ts'\)/); assert.doesNotMatch(entry, /import \{mount\}/);
});

test('production loading teardown releases bounded GPU owners once and fences delayed work', () => {
    const calls: string[] = [], screen = Object.create(LoadingScreen.prototype) as LoadingScreen;
    Object.assign(screen, {progress: new LoadingProgress(), frame: 0, abort: {abort: () => calls.push('abort')}, blur: {dispose: () => calls.push('blur')}, mesh: {geometry: {dispose: () => calls.push('geometry')}, material: {dispose: () => calls.push('material')}}, texture: {dispose: () => calls.push('texture')}, scene: {clear: () => calls.push('scene')}, renderer: {dispose: () => calls.push('renderer'), forceContextLoss: () => calls.push('context')}, images: new Map([['original', {}]]), host: {remove: () => calls.push('host')}});
    const previous = globalThis.cancelAnimationFrame; globalThis.cancelAnimationFrame = () => {calls.push('raf');};
    try {
        screen.finish(); screen.dispose(); screen.update('frame', 1); screen.fail('late failure');
        assert.equal(screen.progress.ended, true); assert.equal(screen.progress.target, 0); assert.equal(screen.images.size, 0);
        assert.deepEqual(calls, ['raf','abort','blur','geometry','material','texture','scene','renderer','context','host']);
    } finally {globalThis.cancelAnimationFrame = previous;}
});
