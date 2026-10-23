/** Native manifest cache compatibility across the Plains resource expansion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fetchManifest, RESOURCE_BASE} from '../web/src/render/resource-fetch.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';

test('the previous deployed manifest reproduces the reported tall-grass error', () => {
    const previous = JSON.parse(readFileSync(new URL('./fixtures/world-manifest-971a027.json', import.meta.url), 'utf8'));
    const world = new AuthoredWorld({} as any, {samples: previous.states} as any);
    assert.throws(() => world.block('tall_grass', 'half=lower'), {message: 'world-model:tall_grasshalf=lower'});
});

test('manifest loading bypasses a fresh legacy URL cache and asks for revalidation', async () => {
    const original = globalThis.fetch;
    const old = readFileSync(new URL('./fixtures/world-manifest-971a027.json', import.meta.url), 'utf8');
    const current = readFileSync(new URL('../../resources/minecraft/26.3/world-manifest.json', import.meta.url), 'utf8');
    const cached = new Map([[RESOURCE_BASE + 'world-manifest.json', old]]);
    let requested = '', policy: RequestCache | undefined;
    globalThis.fetch = async (input, init) => {
        requested = String(input); policy = init?.cache;
        return new Response(cached.get(requested) ?? current);
    };
    try {
        const manifest = await (await fetchManifest('world-manifest.json')).json();
        assert.equal(cached.has(requested), false);
        assert.equal(new URL(requested, 'https://fixture.invalid').searchParams.get('build'), 'development');
        assert.equal(policy, 'no-cache');
        assert.ok(manifest.states.some((s: any) => s.block === 'tall_grass' && s.state === 'half=lower'));
        assert.ok(manifest.states.some((s: any) => s.block === 'tall_grass' && s.state === 'half=upper'));
    } finally {globalThis.fetch = original;}
});

test('manifest HTTP and transport failures remain failures instead of falling back to stale bytes', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response('', {status: 503});
        assert.equal((await fetchManifest('world-manifest.json')).status, 503);
        globalThis.fetch = async () => {throw new TypeError('offline');};
        await assert.rejects(fetchManifest('world-manifest.json'), /offline/);
    } finally {globalThis.fetch = original;}
});

test('pre-cave manifest cannot instantiate wall torches; current version includes both actual anchors and their native dependencies', () => {
    const previous = JSON.parse(readFileSync(new URL('./fixtures/world-manifest-before-cave.json', import.meta.url), 'utf8'));
    const sounds=readFileSync(new URL('./fixtures/world-sounds-before-cave.json', import.meta.url)),entry=previous.entries.find((e:any)=>e.entry==='assets/minecraft/world-sounds.json');
    assert.equal(sounds.byteLength,entry.size);assert.equal(createHash('sha256').update(sounds).digest('hex'),entry.sha256);
    const world = new AuthoredWorld({} as any, {samples: previous.states} as any);
    assert.throws(() => world.block('wall_torch', 'facing=east'), {message:'world-model:wall_torchfacing=east'});
    const current = JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/world-manifest.json', import.meta.url), 'utf8'));
    for(const facing of ['east','west'])assert.ok(current.states.some((s:any)=>s.block==='wall_torch'&&s.state==='facing='+facing));
    for(const path of ['blockstates/wall_torch.json','models/block/wall_torch.json','models/block/template_torch_wall.json','textures/block/torch.png'])assert.ok(current.inputs['assets/minecraft/'+path]);
});
