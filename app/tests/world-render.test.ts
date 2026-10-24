/** Native source coverage, rotated cutout geometry and actual world input routing complement browser screenshots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resources} from '../tools/resources.ts';
import {compileModel, resolveModel} from '../web/src/render/model-format.ts';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {placement} from '../web/src/ui/world-use.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {initialState} from '../web/src/domain/state.ts';
import type {Pick} from '../web/src/render/scene.ts';
import type {VanillaPack} from '../web/src/render/resources.ts';
import {VanillaModels} from '../web/src/render/vanilla-models.ts';
import animals from '../web/src/data/animal-models.json' with {type: 'json'};
import {playerCube} from '../web/src/ui/player-model.ts';

/** Committed original resources remain hash-checked without a client cache. */
const files = resources(), world = JSON.parse(new TextDecoder().decode(files.get('world-manifest.json'))),
    docs = new Map([...files].filter(([p]) => p.endsWith('.json')).map(([p, b]) => [p, JSON.parse(new TextDecoder().decode(b))]));
test('all selected native world states compile with retained UV/texture dependencies and no guessed variant', () => {
    for (const v of world.states) {
        const c = compileModel(resolveModel(v.variant.model, id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json')), v.variant);
        assert.ok(c.positions.length);
        assert.ok(c.positions.every(Number.isFinite));
        assert.equal(c.uvs.length, c.positions.length / 3 * 2);
        for (const texture of c.textures) assert.ok(files.has('assets/minecraft/textures/' + texture.split(':')[1] + '.png'));
    }
    assert.deepEqual(world.states.filter((v: any) => v.block === 'wheat').map((v: any) => v.state), Array.from({length:8},(_,i)=>'age='+i));
});
test('rotated cross uses native 45-degree rescale and upward shade; native UV-lock and sign rotations compile; invalid rotations fail explicitly', () => {
    const m = resolveModel('minecraft:block/short_grass', id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json')),
        c = compileModel(m);
    assert.equal(c.faces.length, 4);
    assert.ok(c.faces.every(f => f.shadeDirection === 'up'));
    assert.ok(c.normals.some(v => Math.abs(Math.abs(v) - Math.SQRT1_2) < 1e-6));
    assert.ok(compileModel(m, {model: 'minecraft:block/short_grass', uvlock: true}).uvs.every(Number.isFinite));
    const bad = structuredClone(m);
    bad.elements![0].rotation = {origin: [8, 8, 8], axis: 'y', angle: NaN};
    assert.throws(() => compileModel(bad), /unsupported/);
});
test('world profile agrees with P4 oak/regular-egg closure, decorative leaves/dirt/water are not sources', () => {
    const nodes = Object.values(WORLD_SCENES).flatMap(s => s.nodes), kinds = new Set(nodes.map(n => n.block));
    assert.deepEqual([...kinds].sort(), ['coal_ore', 'cow', 'egg', 'iron_ore', 'oak_log', 'short_grass', 'tall_grass', 'stone', 'sugar_cane'].sort());
    for (const n of ['oak_leaves', 'dirt', 'water', 'oak_planks']) assert.equal(kinds.has(n), false);
    const coverage = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/coverage.json', import.meta.url), 'utf8'));
    assert.equal(coverage.profile.tree, 'minecraft:oak_log');
    assert.equal(coverage.profile.egg, 'minecraft:egg');
});
test('adult animal geometry includes actual head/body/four cow legs and chicken beak/wattle/wings with native atlases', () => {
    assert.equal(animals.cow.parts.filter(p => p.name.startsWith('leg')).length, 4);
    assert.equal(animals.chicken.parts.filter(p => p.name.includes('wing')).length, 2);
    assert.equal(animals.chicken.parts.find(p => p.name === 'head')!.boxes.length, 3);
    for (const data of [animals.cow, animals.chicken]) {
        assert.ok(files.has('assets/minecraft/textures/' + data.texture.split(':')[1] + '.png'));
        for (const part of data.parts) for (const box of part.boxes) {
            const c = playerCube(box, data.texture, data.height);
            assert.equal(c.positions.length, 72);
            assert.ok(c.uvs.every(n => n >= 0 && n <= 1));
        }
    }
    assert.equal(createHash('sha256').update(readFileSync(new URL('../web/src/data/animal-models.json', import.meta.url), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), world.animalModelSha256);
});
test('world dependencies keep source hashes and bounded extraction excludes full clients and developer directories', () => {
    for (const [path, hash] of Object.entries(world.inputs) as [string, string][]) if (path.startsWith('assets/')) assert.equal(createHash('sha256').update(files.get(path)!).digest('hex'), hash, path);
    for (const name of files.keys()) assert.ok(!/client\.jar|docs\/|AGENTS|AppData|\.class$/.test(name));
    for(const name of ['world/level/block/FarmlandBlock','world/level/block/CropBlock','world/entity/Mob','client/renderer/entity/ItemEntityRenderer'])assert.match(world.classes['net/minecraft/'+name+'.class'],/^[a-f0-9]{64}$/);
});
test('placement derives adjacent cells from actual top/side face, checks occupancy/support and excludes natural nodes', () => {
    const s = new SaveSession({
        getItem: () => null, setItem() {
        }
    }, null), state = initialState();
    s.view = {status: 'ready', writable: true, migrated: false, envelope: {state, generation: 'test'} as any};
    for (const [point, normal, cell] of [[[3.3, 0, .7], [0, 1, 0], [3, 0, 0]], [[4, 1.2, .6], [-1, 0, 0], [3, 1, 0]]] as const) {
        const hit: Pick = {id: 'ground', point: [...point], normal: [...normal]},
            p = placement(hit, s, 'hopper', 'down');
        assert.deepEqual(p.cell, cell);
        assert.equal(p.valid, true);
    }
    assert.equal(placement({
        id: 'node:oak_log:0',
        point: [-6, 0, -3],
        normal: [0, 1, 0]
    }, s, 'hopper', 'down').valid, false);
    assert.equal(placement({id: 'ground', point: [-2, 0, 0], normal: [0, 1, 0]}, s, 'furnace', 'south').valid, true);
    state.progress.scenes.plains.stations.push({
        id: 'rim',
        kind: 'hopper',
        cell: [3, 0, 0],
        facing: 'down',
        contents: {version: 3, data: {slots: Array(5).fill(null)}}
    });
    const side = placement({id: 'rim', point: [3.625, .5, .5], normal: [1, 0, 0]}, s, 'hopper', 'west');
    assert.deepEqual(side.cell, [4, 0, 0]);
    assert.equal(side.valid, true);
    const top = placement({id: 'rim', point: [3.5, .625, .5], normal: [0, 1, 0]}, s, 'hopper', 'down');
    assert.deepEqual(top.cell, [3, 1, 0]);
    assert.equal(top.valid, true);
});
test('texture material grouping preserves every quad index and original alpha lookup after reordering', () => {
    const c = compileModel(resolveModel('minecraft:block/hopper', id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json'))),
        factory = Object.create(VanillaModels.prototype) as VanillaModels;
    factory.created = 0;
    factory.released = 0;
    factory.pack = {samples: [], images: new Map(), loading: {}} as VanillaPack;
    factory.materials = new Map(c.textures.map(id => [id, {} as any]));
    const group = factory.sample({
        id: 'hopper',
        block: 'hopper',
        state: '',
        variant: {model: 'minecraft:block/hopper'},
        compiled: c
    }), mesh = group.children[0] as import('three').Mesh, g = mesh.geometry;
    assert.equal(g.groups.length, c.textures.length);
    assert.deepEqual([...g.index!.array].sort((a, b) => a - b), [...c.indices].sort((a, b) => a - b));
    assert.equal(g.getAttribute('position').count, c.positions.length / 3);
    g.dispose();
    assert.equal(factory.released, 1);
});
