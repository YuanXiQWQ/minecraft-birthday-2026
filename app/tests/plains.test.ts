/** Plains geometry, persistent support compatibility, native batching and lifetime regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh, MeshBasicMaterial, Raycaster, Vector3, Group, BoxGeometry} from 'three';
import {resources} from '../tools/resources.ts';
import {compileModel, resolveModel} from '../web/src/render/model-format.ts';
import {VanillaModels} from '../web/src/render/vanilla-models.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import type {Resources} from '../web/src/render/resources.ts';
import {plainsHeight, plainsPlants, oakCrown, PLAINS_OAKS, retainedPlainsSupports} from '../web/src/domain/plains-shape.ts';
import {plainsTerrain, exposedModel} from '../web/src/render/plains-terrain.ts';
import {WORLD_SCENES, supported, sourceOccupied} from '../web/src/domain/world-config.ts';
import {initialState} from '../web/src/domain/state.ts';

/** Compile the shipped resource bytes without substituting cube or vegetation models.
 * @return {Resources} Native samples for geometry-only tests; no browser pixels are simulated.
 */
function pack(): Resources {
    const files = resources(), docs = new Map([...files].filter(([n]) => n.endsWith('.json')).map(([n, b]) => [n, JSON.parse(new TextDecoder().decode(b))]));
    const samples = docs.get('world-manifest.json').states.map((s: any) => ({...s, id: s.block + s.state, compiled: compileModel(resolveModel(s.variant.model, id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json')), s.variant)}));
    return {samples, images: new Map(), documents: docs, guiImages: new Map(), models: {}, loading: {}, tints: {grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4}};
}

test('plains is deterministic, preserves every saved floor coordinate and exposes shallow unit terraces', () => {
    for (let x = -18; x <= 18; x++) for (let z = -22; z <= 10; z++) assert.equal(plainsHeight(x, z), 0);
    const terrain = plainsTerrain(), cells = terrain.flatMap(b => b.cells), levels = new Set(cells.map(c => c[1] + 1));
    assert.deepEqual([...levels].sort(), [0, 1, 2, 3]);
    assert.ok(terrain.some(b => b.block === 'dirt' && b.cells.length));
    assert.equal(new Set(cells.map(c => c.join(','))).size, cells.length);
    assert.deepEqual(plainsTerrain(), terrain);
    assert.ok(terrain.every(b => !b.faces.includes('down')));
    for (let x = -70; x < 70; x++) for (let z = -90; z < 20; z++) {
        assert.ok(Math.abs(plainsHeight(x, z) - plainsHeight(x + 1, z)) <= 2);
        assert.ok(Math.abs(plainsHeight(x, z) - plainsHeight(x, z + 1)) <= 2);
    }
});

test('native vegetation has both tall halves, five untinted flowers, and no new sources', () => {
    const p = pack(), plants = plainsPlants(WORLD_SCENES.plains.nodes.map(n => n.cell));
    assert.deepEqual(plants, plainsPlants(WORLD_SCENES.plains.nodes.map(n => n.cell)));
    assert.equal(WORLD_SCENES.plains.nodes.length, 33);
    for (const block of ['dandelion', 'poppy', 'oxeye_daisy', 'cornflower', 'azure_bluet']) {
        assert.ok(plants.some(v => v.block === block));
        const sample = p.samples.find(s => s.block === block)!;
        assert.equal(sample.compiled.faces.length, 4);
        assert.ok(sample.compiled.faces.every(f => f.tintindex === undefined));
    }
    assert.ok(plants.filter(v => v.block.includes('grass')).length > plants.filter(v => !v.block.includes('grass')).length * 5);
    for (const plant of plants.filter(v => v.state === 'half=lower')) assert.ok(plants.some(v => v.state === 'half=upper' && v.cell[0] === plant.cell[0] && v.cell[2] === plant.cell[2] && v.cell[1] === plant.cell[1] + 1));
    assert.ok(p.samples.find(s => s.block === 'tall_grass')!.compiled.faces.every(f => f.tintindex === 0));
});

test('exposed faces preserve original grass-overlay UVs, tint and material grouping', () => {
    const source = pack().samples.find(s => s.block === 'grass_block')!.compiled, top = exposedModel(source, ['up']), side = exposedModel(source, ['east']);
    assert.equal(top.faces.length, 1);
    assert.equal(top.faces[0].tintindex, 0);
    assert.equal(side.faces.length, 2);
    for (const c of [top, side]) {
        assert.equal(c.indices.length, c.faces.length * 6);
        assert.ok(c.indices.every(i => i < c.positions.length / 3));
        assert.ok(c.uvs.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    }
});

test('source-linked crowns differ, never add static trunk overlays, and release on complete harvest', () => {
    const p = pack(), models = new VanillaModels(p);
    for (const id of new Set(p.samples.flatMap(s => s.compiled.textures))) models.materials.set(id, new MeshBasicMaterial());
    const world = new AuthoredWorld(models, p), state = initialState().progress;
    world.build('plains'); world.sync(state);
    const first = oakCrown(PLAINS_OAKS[0], 3, 0).map(c => [c[0] + 6, c[1], c[2] + 3]);
    assert.notDeepEqual(first, oakCrown(PLAINS_OAKS[1], 3, 1).map(c => [c[0] + 3, c[1], c[2] + 6]));
    assert.equal(world.natural.children.filter(c => String(c.userData.id).includes('oak_log')).length, 9);
    const ray = new Raycaster(new Vector3(0, 1.62, 7), new Vector3(-5.5, -.12, -9.5).normalize());
    world.staticRoot.updateMatrixWorld(true); world.natural.updateMatrixWorld(true);
    const hits = ray.intersectObjects([world.staticRoot, world.natural], true);
    assert.ok(hits.length);
    assert.equal(hits[0].object.parent?.userData.id, 'node:oak_log:1');
    assert.ok(world.plainsDecor!.children.filter(o => o.userData.id === 'decoration').every(o => !ray.layers.test(o.layers)));
    state.world.visits.plains.removed = Array.from({length: 9}, (_, i) => 'oak_log:' + i);
    world.sync(state);
    assert.equal(world.plainsDecor!.children.filter(c => c.userData.block === 'oak_leaves').length, 0);
    for (let i = 0; i < 3; i++) {world.build('plains'); world.sync(state);}
    world.dispose();
    assert.equal(models.created, models.released);
    models.dispose();
});

test('all multipart meshes retain local transforms and every instanced allocation is disposed', () => {
    const p = pack(), models = new VanillaModels(p), world = new AuthoredWorld(models, p);
    let released = 0, instances = 0;
    world.block = () => {const root = new Group(); for (let i = 0; i < 2; i++) {const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); mesh.position.y = i; mesh.geometry.addEventListener('dispose', () => released++); root.add(mesh);} return root;};
    world.batch('test', [[2, 0, 0], [3, 0, 0]]);
    assert.equal(world.staticRoot.children.length, 2);
    for (const child of world.staticRoot.children) child.addEventListener('dispose' as any, () => instances++);
    const second = world.staticRoot.children[1] as any;
    assert.equal(second.instanceMatrix.array[13], 1);
    world.clear(world.staticRoot);
    assert.equal(released, 2); assert.equal(instances, 2);
});

test('saved devices on former tree decoration retain support, collision and removal without save migration', () => {
    const p = initialState().progress;
    p.scenes.plains.stations.push({id: 'saved', kind: 'crafting_table', facing: 'north', cell: [12, 4, -8], contents: {version: 1, data: {grid: Array(9).fill(null)}}});
    assert.deepEqual(retainedPlainsSupports(p.scenes.plains.stations.map(s => s.cell)), [[12, 0, -8], [12, 1, -8], [12, 2, -8], [12, 3, -8]]);
    assert.ok(supported(p, [12, 4, -8])); assert.ok(sourceOccupied(p, [12, 3, -8]));
    p.scenes.plains.stations = [];
    assert.equal(sourceOccupied(p, [12, 3, -8]), false);
    assert.equal(supported(p, [12, 4, -8]), false);
});
