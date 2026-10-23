/** Native indented terrain rays exercise formal placement, use routing and durable occupancy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene, Group, PerspectiveCamera, Raycaster, MeshBasicMaterial} from 'three';
import {resources} from '../tools/resources.ts';
import {compileModel, resolveModel} from '../web/src/render/model-format.ts';
import {VanillaModels} from '../web/src/render/vanilla-models.ts';
import {AuthoredWorld} from '../web/src/render/authored-world.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {Look} from '../web/src/render/look.ts';
import {WorldUse, placement} from '../web/src/ui/world-use.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {seal, token} from '../web/src/persistence/codec.ts';
import {initialState} from '../web/src/domain/state.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import type {Rules} from '../web/src/rules/types.ts';
import type {GameInventory} from '../web/src/ui/inventory.ts';
import type {Kind, Cell} from '../web/src/domain/types.ts';

/** Exact native files and rules used by the production loaders. */
const files = resources(),
    rules = JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json', import.meta.url), 'utf8')) as Rules,
    docs = new Map([...files].filter(([p]) => p.endsWith('.json')).map(([p, b]) => [p, JSON.parse(new TextDecoder().decode(b))]));

/** Build a real native farmland/path model using the production compiler and scene hit method.
 * @param {string} block Native non-full-height support.
 * @param {Cell} cell Logical support coordinate.
 * @return {object} Formal scene and nearest native ray.
 */
function nativeRay(block = 'farmland', cell: Cell = [-5, -1, -2]) {
    const compiled = compileModel(resolveModel('minecraft:block/' + (block === 'farmland' ? 'farmland_moist' : block), id => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json'))),
        sample = {id: block, block, state: '', variant: {model: block}, compiled},
        models = Object.create(VanillaModels.prototype) as VanillaModels;
    Object.assign(models, {
        pack: {samples: [sample], images: new Map(), loading: {}},
        materials: new Map(compiled.textures.map(t => [t, new MeshBasicMaterial()])),
        created: 0,
        released: 0
    });
    const authored = new AuthoredWorld(models, models.pack as any);
    if (block === 'farmland') {
        const manifest = docs.get('world-manifest.json');
        models.pack.samples = manifest.states.map((entry: any) => ({
            ...entry,
            compiled: compileModel(resolveModel(entry.variant.model, (id: string) => docs.get('assets/minecraft/models/' + id.split(':')[1] + '.json')), entry.variant)
        }));
        for (const sample of models.pack.samples) for (const texture of sample.compiled.textures) if (!models.materials.has(texture)) models.materials.set(texture, new MeshBasicMaterial());
        for (const texture of ['minecraft:entity/chicken/chicken_temperate', 'minecraft:block/water_still']) if (!models.materials.has(texture)) models.materials.set(texture, new MeshBasicMaterial());
        authored.build('farm');
    } else authored.batch(block, [cell], authored.staticRoot, 'ground');
    const v = Object.create(SceneView.prototype) as SceneView;
    Object.assign(v, {
        scene: new Scene(),
        world: new Group(),
        persistent: new Group(),placed:new Group(),keys:new Set(),playerIntersects:()=>false,
        authored,
        camera: new PerspectiveCamera(60, 1, .1, 90),
        ray: new Raycaster(),
        models,
        look: new Look(),
        input: true,
        lost: false,
        disposed: false,
        pointerPosition: [300, 300],
        renderer: {
            domElement: {
                dataset: {},
                style: {},
                getBoundingClientRect: () => ({left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600})
            }
        },
        showPreview() {
        },
        showCrack() {
        },
        breakEffect() {
        },
        requestRender() {
        }
    });
    v.scene.add(v.world, v.persistent, authored.staticRoot);
    v.camera.position.set(cell[0] + .5, 2, cell[2] + 3);
    v.camera.lookAt(cell[0] + .5, cell[1] + 15 / 16, cell[2] + .5);
    return {
        v, hit: v.pick(300, 300)!, dispose: () => {
            authored.dispose();
            for (const m of models.materials.values()) m.dispose();
        }
    };
}

/** Create two actual cooperating sessions with a finite device carrier and audited placement policy.
 * @param {Kind} kind Selected placeable device.
 * @return {Promise<object>} Durable sessions and UI input owner.
 */
async function harness(kind: Kind = 'crafting_table') {
    const state = initialState();
    state.progress.scene = 'farm';
    state.progress.unlocked = ['minecraft:' + kind, 'minecraft:wheat_seeds'];
    state.progress.player.data.hotbar[0] = {id: 'minecraft:' + kind, count: 1};
    let raw = JSON.stringify(await seal(state, 'native-farmland', 0)), tail = Promise.resolve<unknown>(null);
    const storage = {getItem: () => raw, setItem: (_k: string, v: string) => raw = v}, locks = {
        exclusive<T>(work: () => Promise<T>) {
            const p = tail.then(work);
            tail = p.catch(() => {
            });
            return p;
        }
    }, s = new SaveSession(storage, locks, WORLD_REGION), other = new SaveSession(storage, locks, WORLD_REGION);
    s.rules = other.rules = rules;
    await s.refresh();
    await other.refresh();
    const {v, hit, dispose} = nativeRay();
    let opened = '';
    const inventory = {
        rules, modal: {open: false}, value: {...state.progress.player.data, cursor: null}, autoEquip() {
        }, openWorkbench(id: string) {
            opened = id;
        }
    } as unknown as GameInventory;
    const target = new EventTarget(), previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: Object.assign(target, {setInterval, clearInterval})
    });
    const messages: string[] = [], sounds: string[] = [];
    const use = new WorldUse(v, inventory, s, key => messages.push(key), id => sounds.push(id));
    const jobs: Promise<unknown>[] = [];
    const run = use.run.bind(use);
    use.run = (...args) => {
        const job = run(...args);
        jobs.push(job);
        return job;
    };
    s.subscribe(snapshot => {
        inventory.value = {...structuredClone(snapshot.envelope!.state.progress.player.data), cursor: null};
    });
    return {
        s, other, use, v, hit, jobs, messages, sounds, opened: () => opened, dispose: () => {
            use.dispose();
            dispose();
            if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
        }
    };
}

for (const kind of ['crafting_table', 'furnace', 'hopper'] as const) test('native 15/16 farmland ray previews and places ' + kind + ' through formal Use and SaveSession', async () => {
    const h = await harness(kind);
    try {
        assert.ok(Math.abs(h.hit.point[1] + .0625) < 1e-6);
        assert.deepEqual(h.hit.cell, [-5, -1, -2]);
        const before = placement(h.hit, h.s, kind, 'south');
        assert.deepEqual(before.cell, [-5, 0, -2]);
        assert.equal(before.valid, true);
        h.use.use(h.hit, false);
        await Promise.all(h.jobs);
        const station = h.s.view.envelope!.state.progress.scenes.farm.stations[0];
        assert.deepEqual(station.cell, before.cell);
        assert.equal(station.kind, kind);
        assert.equal(h.s.view.envelope!.state.progress.scenes.farm.crops.length, 0);
        await h.other.refresh();
        assert.deepEqual(h.other.view.envelope!.state.progress.scenes.farm.stations[0], station);
        h.use.use({...h.hit, id: station.id}, false);
        assert.equal(h.opened(), station.id);
        assert.equal(placement(h.hit, h.s, kind, 'south').valid, false);
        await h.s.dispatch({type: 'remove-station', scene: 'farm', id: station.id});
        await h.s.editInventory({
            type: 'source',
            item: 'minecraft:wheat_seeds',
            mode: 'number',
            index: 0
        }, null, h.s.view.envelope!.state.progress.player.data);
        h.use.use(h.hit, false);
        await Promise.all(h.jobs);
        assert.equal(h.s.view.envelope!.state.progress.scenes.farm.crops.length, 1);
        assert.equal(placement(h.hit, h.s, kind, 'south').valid, false);
    } finally {
        h.dispose();
    }
});
test('native dirt path and edge rays retain negative logical cells, while water is explicitly not support', async () => {
    const h = await harness();
    try {
        const n = nativeRay('dirt_path', [-7, -1, -4]);
        try {
            assert.ok(Math.abs(n.hit.point[1] + .0625) < 1e-6);
            assert.deepEqual(n.hit.cell, [-7, -1, -4]);
            assert.deepEqual(placement(n.hit, h.s, 'hopper', 'down').cell, [-7, 0, -4]);
            for (const offset of [.001, .999]) {
                n.v.camera.lookAt(-7 + offset, -.0625, -4 + offset);
                const hit = n.v.pick(300, 300)!;
                assert.deepEqual(placement(hit, h.s, 'hopper', 'down').cell, [-7, 0, -4]);
            }
            assert.equal(placement({...n.hit, id: 'water', support: false}, h.s, 'hopper', 'down').valid, false);
        } finally {
            n.dispose();
        }
    } finally {
        h.dispose();
    }
});
test('plot Use without seeds sends no planting command, and remote occupancy/reset fence stale placement', async () => {
    const h = await harness();
    try {
        await h.s.editInventory({type: 'select', index: 8}, null, h.s.view.envelope!.state.progress.player.data);
        h.use.use(h.hit, false);
        assert.equal(h.jobs.length, 0);
        const expected = h.s.view.envelope!.state.progress.player.data,
            candidate = placement(h.hit, h.s, 'crafting_table', 'south');
        const {valid, ...station} = candidate;
        station.id = 'remote';
        await h.other.dispatch({type: 'put-station', scene: 'farm', station});
        await assert.rejects(() => h.s.dispatch({
            type: 'put-station',
            scene: 'farm',
            station: {...station, id: 'late'},
            expected
        }), /occupied|conflict|overlap|invalid-save/);
        await h.other.reset(token(h.other.view.envelope!));
        await assert.rejects(() => h.s.dispatch({
            type: 'put-station',
            scene: 'farm',
            station: {...station, id: 'stale'},
            expected
        }), /stale/);
    } finally {
        h.dispose();
    }
});

test('actual authored water geometry rejects placement even when its rendered top is hit', async () => {
    const h = await harness();
    try {
        h.v.camera.position.set(8.5, 2, 0);
        h.v.camera.lookAt(8.5, -.35, -3.5);
        const hit = h.v.pick(300, 300)!;
        assert.equal(hit.id, 'water');
        assert.equal(hit.support, false);
        assert.equal(placement(hit, h.s, 'hopper', 'down').valid, false);
    } finally {
        h.dispose();
    }
});
test('a queued farm placement cannot commit after another session changes the active scene', async () => {
    const h = await harness();
    try {
        const {valid, ...candidate} = placement(h.hit, h.s, 'crafting_table', 'south'),
            expected = structuredClone(h.s.view.envelope!.state.progress.player.data);
        candidate.id = 'late-farm';
        await h.other.dispatch({type: 'select-scene', scene: 'cave'});
        await assert.rejects(() => h.s.dispatch({
            type: 'put-station',
            scene: 'farm',
            station: candidate,
            expected
        }), /inventory-conflict/);
        await h.other.refresh();
        assert.equal(h.other.view.envelope!.state.progress.scene, 'cave');
        assert.equal(h.other.view.envelope!.state.progress.scenes.farm.stations.length, 0);
    } finally {
        h.dispose();
    }
});


test('completed device mining keeps break effects and finite pickup without a removal success message',async()=>{
    const h=await harness(),previous=Object.getOwnPropertyDescriptor(globalThis,'document');
    Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});
    try{
        h.use.use(h.hit,false);await Promise.all(h.jobs);h.messages.length=0;h.sounds.length=0;
        const station=h.s.view.envelope!.state.progress.scenes.farm.stations[0],hit={...h.hit,id:station.id};
        let effects=0;h.v.breakEffect=()=>{effects++;};h.v.refreshHover=()=>hit;
        h.use.beginMining(hit,1000);assert.ok(h.use.mining);h.use.advanceMining(1000+h.use.mining.ticks*50);await Promise.all(h.jobs);
        assert.deepEqual(h.messages,[]);assert.deepEqual(h.sounds,['block.wood.hit','block.wood.break']);assert.equal(effects,1);
        assert.equal(h.s.view.envelope!.state.progress.scenes.farm.stations.length,0);assert.ok(h.s.view.envelope!.state.progress.player.data.hotbar.some(s=>s?.id==='minecraft:crafting_table'&&s.count===1));
        await h.use.run({type:'remove-station',scene:'farm',id:station.id},null);assert.deepEqual(h.messages,['game.actionFailed']);
    }finally{h.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});
