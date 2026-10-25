/** Actual hopper and rotated furnace rays drive native face placement and durable device orientation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene, Group, MeshBasicMaterial, PerspectiveCamera, Raycaster} from 'three';
import {SceneView} from '../web/src/render/scene.ts';
import {VanillaModels} from '../web/src/render/vanilla-models.ts';
import {compileModel, resolveModel} from '../web/src/render/model-format.ts';
import {resources} from '../tools/resources.ts';
import {WorldUse, placement} from '../web/src/ui/world-use.ts';
import {initialState} from '../web/src/domain/state.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import type {Cell, Facing, Station} from '../web/src/domain/types.ts';
import type {Rules} from '../web/src/rules/types.ts';

/** Audited model documents and finite item rules used by the ordinary game. */
const files = resources(), docs = new Map([...files].filter(([p]) => p.endsWith('.json')).map(([p, bytes]) => [p, JSON.parse(new TextDecoder().decode(bytes))])),
    rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules;

/** Construct the production model and SceneView ray path without a GPU or browser input claim.
 * @param {Station} station Saved device geometry.
 * @param {Cell} eye Camera origin.
 * @param {Cell} target Visible surface aimed at.
 * @return {object} Real scene, native hit and resource disposer.
 */
function deviceRay(station: Station, eye: Cell, target: Cell) {
    const variants = docs.get('assets/minecraft/blockstates/' + station.kind + '.json').variants,
        key = Object.keys(variants).find(k => k.includes('facing=' + station.facing) && (!k.includes('lit=') || k.includes('lit=false')))!, variant = variants[key],
        compiled = compileModel(resolveModel(variant.model, id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json')), variant),
        models = Object.assign(Object.create(VanillaModels.prototype), {created: 0, released: 0, pack: {samples: [{id: key, block: station.kind, state: key, variant, compiled}], images: new Map()}, materials: new Map(compiled.textures.map(t => [t, new MeshBasicMaterial()]))}) as VanillaModels;
    const scene = Object.assign(Object.create(SceneView.prototype), {
        scene: new Scene(), world: new Group(), persistent: new Group(), placed: new Group(), camera: new PerspectiveCamera(60, 1, .1, 90), ray: new Raycaster(), models,
        input: true, lost: false, disposed: false, motion: {crouching: true}, renderer: {domElement: {dataset: {}, getBoundingClientRect: () => ({left: 0, top: 0, width: 600, height: 600})}},
        requestRender() {}, showPreview() {}, playerIntersects: () => false
    }) as SceneView;
    scene.scene.add(scene.world, scene.persistent, scene.placed);
    scene.sync({stations: [station]} as any);
    scene.camera.position.set(...eye); scene.camera.lookAt(...target);
    const hit = scene.pick(300, 300)!;
    assert.ok(hit);
    return {scene, hit, dispose: () => {scene.persistent.traverse(o => {if ('geometry' in o) (o.geometry as any).dispose();}); for (const material of models.materials.values()) material.dispose();}};
}

/** Create a real saved scene containing one anchor and a held finite placement item.
 * @param {Station} anchor Existing device.
 * @param {string} held Selected native item.
 * @return {Promise<SaveSession>} Shared transactional placement owner.
 */
async function saved(anchor: Station, held: string) {
    const state = initialState(); state.progress.scene = 'home'; state.progress.scenes.home.stations = [anchor];
    state.progress.unlocked = ['minecraft:' + anchor.kind, 'minecraft:' + held].filter((v, i, a) => a.indexOf(v) === i);
    state.progress.player.data.hotbar[0] = {id: 'minecraft:' + held, count: 2};
    let raw = JSON.stringify(await seal(state, 'hopper-placement', 0));
    const session = new SaveSession({getItem: () => raw, setItem: (_key, value) => {raw = value;}}, {exclusive: work => work()}, WORLD_REGION);
    session.rules = rules; await session.refresh(); return session;
}

for (const facing of ['down', 'north', 'east', 'south', 'west'] as Facing[]) test('hopper basin uses the native upper interaction face, outlet ' + facing, async () => {
    const anchor: Station = {id: 'anchor', kind: 'hopper', cell: [3, 0, 0], facing, contents: emptyHopper()},
        ray = deviceRay(anchor, [3.5, 1.6, 2.5], [3.5, .8, .13]);
    const session = await saved(anchor, 'furnace');
    try {
        const rawHit = ray.scene.ray.intersectObjects(ray.scene.persistent.children, true)[0];
        const rawNormal = rawHit.face!.normal.clone().transformDirection(rawHit.object.matrixWorld);
        assert.ok(Math.abs(rawNormal.y) < .001, 'the visible basin wall has a horizontal normal');
        assert.deepEqual(ray.hit.normal, [0, 1, 0]);
        assert.deepEqual(ray.hit.point, rawHit.point.toArray(), 'native override retains the visible surface point');
        const candidate = placement(ray.hit, session, 'furnace', 'south');
        assert.deepEqual(candidate.cell, [3, 1, 0]); assert.equal(candidate.valid, true);
        const use = Object.assign(Object.create(WorldUse.prototype), {scene: ray.scene, session, inventory: {value: {...session.view.envelope!.state.progress.player.data, cursor: null}, rules}, abort: new AbortController(), notify() {}, sound() {}}) as WorldUse;
        const jobs: Promise<boolean>[] = [], run = use.run.bind(use); use.run = (...args) => {const work = run(...args); jobs.push(work); return work;};
        use.use(ray.hit, true); await Promise.all(jobs);
        assert.deepEqual(session.view.envelope!.state.progress.scenes.home.stations[1].cell, [3, 1, 0]);
        assert.equal(session.view.envelope!.state.progress.player.data.hotbar[0]?.count, 1);
    } finally {ray.dispose(); session.dispose();}
});

test('hopper exterior side retains its outward placement face', () => {
    const ray = deviceRay({id: 'anchor', kind: 'hopper', cell: [3, 0, 0], facing: 'down', contents: emptyHopper()}, [3.5, .8, 2.5], [3.5, .8, 1]);
    try {assert.deepEqual(ray.hit.normal, [0, 0, 1]);} finally {ray.dispose();}
});

for (const facing of ['north', 'east', 'south', 'west'] as Facing[]) test('crouched placement points hopper into the clicked furnace face, furnace ' + facing, async () => {
    const anchor: Station = {id: 'anchor', kind: 'furnace', cell: [3, 1, 0], facing, contents: emptyFurnace()},
        ray = deviceRay(anchor, [3.5, 1.5, 3], [3.5, 1.5, .5]), session = await saved(anchor, 'hopper');
    try {
        const use = Object.assign(Object.create(WorldUse.prototype), {scene: ray.scene, session, inventory: {value: {...session.view.envelope!.state.progress.player.data, cursor: null}, rules}, abort: new AbortController(), notify() {}, sound() {}}) as WorldUse;
        const jobs: Promise<boolean>[] = [], run = use.run.bind(use); use.run = (...args) => {const work = run(...args); jobs.push(work); return work;};
        use.use(ray.hit, true); await Promise.all(jobs);
        const hopper = session.view.envelope!.state.progress.scenes.home.stations[1];
        assert.deepEqual(hopper.cell, [3, 1, 1]);
        assert.equal(hopper.facing, 'north', 'outlet points back toward the furnace, regardless of model rotation');
    } finally {ray.dispose(); session.dispose();}
});
