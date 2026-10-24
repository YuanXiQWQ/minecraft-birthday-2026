/** Export only authored-world block, animal and interaction-sound dependencies from locked Java 26.3 sources. */
import {readClient} from './vanilla/zip.ts';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {resourceId, resolveModel, resolveTexture} from '../web/src/render/model-format.ts';

/** Extraction inputs do not participate in ordinary browser loading. */
const root = resolve(import.meta.dirname, '../..'), out = resolve(root, 'resources/minecraft/26.3'),
    jar = readClient(process.argv[process.argv.indexOf('--client') + 1]), files = new Map<string, Buffer>(),
    inputs: Record<string, string> = {};

/** Hash exact original bytes. @param {Uint8Array|string} b Source bytes. @param {string} algo Digest identity. @return {string} Hex digest. */
function hash(b: Uint8Array | string, algo = 'sha256'): string {
    return createHash(algo).update(b).digest('hex');
}

/** Retain a native archive asset. @param {string} p Archive path. @return {Buffer} Exact bytes. */
function take(p: string): Buffer {
    const b = jar.get(p);
    if (!b) throw Error('missing-world-asset:' + p);
    files.set(p, b);
    inputs[p] = hash(b);
    return b;
}

/** Resolve required parents without including unrelated models. @param {string} id Model ID. @return {any} Native document. */
function model(id: string): any {
    const p = 'assets/minecraft/models/' + resourceId(id).split(':')[1] + '.json', m = JSON.parse(take(p).toString());
    if (m.parent) model(m.parent);
    return m;
}

/** Preserve pixels and native animation metadata. @param {string} id Native texture. */
function texture(id: string): void {
    const p = 'assets/minecraft/textures/' + resourceId(id).split(':')[1] + '.png';
    take(p);
    if (jar.has(p + '.mcmeta')) take(p + '.mcmeta');
}

/** Authoring chooses exact native states, not unsupported arbitrary weighted rotations. */
const states: { block: string; state: string; variant: any }[] = [];
for (const block of ['grass_block', 'dirt', 'dirt_path', 'oak_log', 'oak_leaves', 'short_grass', 'tall_grass', 'dandelion', 'poppy', 'oxeye_daisy', 'cornflower', 'azure_bluet', 'sugar_cane', 'coal_ore', 'iron_ore', 'stone', 'cobblestone', 'farmland', 'wheat', 'oak_planks', 'wall_torch', 'oak_stairs', 'oak_slab', 'hay_block', 'lantern', 'spruce_log', 'spruce_planks', 'birch_planks', 'stone_bricks', 'smooth_stone', 'bookshelf', 'red_wool', 'glowstone', 'glass']) {
    const doc = JSON.parse(take('assets/minecraft/blockstates/' + block + '.json').toString());
    for (const [state, value] of Object.entries(doc.variants)) {
        if (block === 'grass_block' && state !== 'snowy=false' || block === 'oak_log' && state !== 'axis=y') continue;
        const variant = Array.isArray(value) ? value[0] : value;
        const m = resolveModel((variant as any).model, model);
        for (const t of Object.values(m.textures ?? {})) texture(resolveTexture(t, m.textures ?? {}));
        states.push({block, state, variant});
    }
}
// Native multipart fence pieces retain the exact original variant rotations and UV lock.
const fence=JSON.parse(take('assets/minecraft/blockstates/oak_fence.json').toString());
for(const part of fence.multipart) {
    const state=!part.when?'post':Object.entries(part.when).map(([key,value])=>key+'='+value).join(',');
    const variant=part.apply,m=resolveModel(variant.model,model);
    for(const t of Object.values(m.textures??{}))texture(resolveTexture(t,m.textures??{}));
    states.push({block:'oak_fence',state,variant});
}
for (const t of ['entity/cow/cow_temperate', 'entity/chicken/chicken_temperate', 'colormap/grass', 'colormap/foliage', 'block/water_still', 'item/egg', 'item/wheat', 'item/wheat_seeds']) texture(t);
/** Native adult static geometry transcribed from the hash-locked createBase*Model methods; model space has downward Y. */
const animals = {
    version: '26.3',
    cow: {
        texture: 'minecraft:entity/cow/cow_temperate',
        height: 64,
        parts: [{
            name: 'head',
            pivot: [0, 4, -8],
            boxes: [[-4, -4, -6, 8, 8, 6, 0, 0], [-3, 1, -7, 6, 3, 1, 1, 33], [-5, -5, -5, 1, 3, 1, 22, 0], [4, -5, -5, 1, 3, 1, 22, 0]]
        }, {
            name: 'body',
            pivot: [0, 5, 2],
            rotation: [Math.PI / 2, 0, 0],
            boxes: [[-6, -10, -7, 12, 18, 10, 18, 4], [-2, 2, -8, 4, 6, 1, 52, 0]]
        }, ...[-4, 4].flatMap(x => [-5, 7].map(z => ({
            name: 'leg' + x + ':' + z,
            pivot: [x, 12, z],
            mirror: x > 0,
            boxes: [[-2, 0, -2, 4, 12, 4, 0, 16]]
        })))]
    },
    chicken: {
        texture: 'minecraft:entity/chicken/chicken_temperate',
        height: 32,
        parts: [{
            name: 'head',
            pivot: [0, 15, -4],
            boxes: [[-2, -6, -2, 4, 6, 3, 0, 0], [-2, -4, -4, 4, 2, 2, 14, 0], [-1, -2, -3, 2, 2, 2, 14, 4]]
        }, {
            name: 'body',
            pivot: [0, 16, 0],
            rotation: [Math.PI / 2, 0, 0],
            boxes: [[-3, -4, -3, 6, 8, 6, 0, 9]]
        }, {name: 'right_leg', pivot: [-2, 19, 1], boxes: [[-1, 0, -3, 3, 5, 3, 26, 0]]}, {
            name: 'left_leg',
            pivot: [1, 19, 1],
            boxes: [[-1, 0, -3, 3, 5, 3, 26, 0]]
        }, {name: 'right_wing', pivot: [-4, 13, 0], boxes: [[0, 0, -3, 1, 4, 6, 24, 13]]}, {
            name: 'left_wing',
            pivot: [4, 13, 0],
            boxes: [[-1, 0, -3, 1, 4, 6, 24, 13]]
        }]
    }
};
for(const path of ['data/minecraft/block_transformer/hoe.json','data/minecraft/tags/block/turns_into_farmland.json','data/minecraft/tags/block/maintains_farmland.json','data/minecraft/tags/item/hoes.json'])take(path);
/** Flatten original support tags while retaining every recursive source and digest.
 * @param {string} kind Native registry.
 * @param {string} name Namespaced tag identifier.
 * @return {string[]} Native short identifiers.
 */
function tag(kind:string,name:string):string[]{const [namespace,path]=name.split(':'),doc=JSON.parse(take('data/'+namespace+'/tags/'+kind+'/'+path+'.json').toString());return [...new Set<string>(doc.values.flatMap((id:string)=>id.startsWith('#')?tag(kind,id.slice(1)):[id.split(':')[1]]))];}
writeFileSync(resolve(root,'app/web/src/data/cane-support.json'),JSON.stringify({ground:tag('block','minecraft:supports_sugar_cane'),blocks:tag('block','minecraft:supports_sugar_cane_adjacently'),fluids:tag('fluid','minecraft:supports_sugar_cane_adjacently')},null,2)+'\n');
const classes = Object.fromEntries(['net/minecraft/world/entity/WalkAnimationState.class','net/minecraft/world/entity/LivingEntity.class','net/minecraft/client/model/QuadrupedModel.class','net/minecraft/world/level/block/SugarCaneBlock.class','net/minecraft/world/level/block/FarmlandBlock.class','net/minecraft/world/level/block/CropBlock.class','net/minecraft/world/entity/Mob.class','net/minecraft/world/entity/ai/goal/RandomStrollGoal.class','net/minecraft/world/entity/animal/cow/AbstractCow.class','net/minecraft/world/entity/animal/chicken/Chicken.class','net/minecraft/world/entity/item/ItemEntity.class','net/minecraft/client/renderer/entity/ItemEntityRenderer.class','net/minecraft/client/model/animal/cow/CowModel.class', 'net/minecraft/client/model/animal/chicken/AdultChickenModel.class', 'net/minecraft/world/level/block/entity/HopperBlockEntity.class'].map(p => [p, hash(jar.get(p)!)]));
writeFileSync(resolve(root, 'app/web/src/data/animal-models.json'), JSON.stringify(animals, null, 2) + '\n');

/** Fetch an official asset only after checking its locked SHA1. @param {string} url Official location. @param {string} sha1 Expected digest. @return {Promise<Buffer>} Verified bytes. */
async function official(url: string, sha1: string): Promise<Buffer> {
    const r = await fetch(url);
    if (!r.ok) throw Error('asset-fetch:' + r.status);
    const b = Buffer.from(await r.arrayBuffer());
    if (hash(b, 'sha1') !== sha1) throw Error('asset-sha1');
    return b;
}

const lock = JSON.parse(readFileSync(resolve(root, 'docs/p1/evidence-lock.json'), 'utf8')).officialSources.assetIndex,
    index = JSON.parse((await official(lock.url, lock.sha1)).toString());

/** Fetch a named object from the fixed asset index. @param {string} p Logical object. @return {Promise<Buffer>} Verified exact object. */
async function object(p: string): Promise<Buffer> {
    const o = index.objects[p];
    if (!o) throw Error('missing-asset-object:' + p);
    return official('https://resources.download.minecraft.net/' + o.hash.slice(0, 2) + '/' + o.hash, o.hash);
}

const soundsRaw = await object('minecraft/sounds.json'), sounds = JSON.parse(soundsRaw.toString()),
    events: Record<string, unknown> = {};
inputs['asset-index:' + lock.url] = lock.sha1;
inputs['minecraft/sounds.json'] = hash(soundsRaw);
for (const name of ['block.stone.break', 'block.grass.break', 'block.wood.break', 'block.metal.break', 'block.stone.hit', 'block.wood.hit', 'block.metal.hit', 'block.grass.hit', 'item.crop.plant', 'block.crop.break', 'entity.cow.milk', 'entity.item.pickup', 'item.hoe.till', 'entity.cow.ambient', 'entity.chicken.ambient', 'entity.cow.step', 'entity.chicken.step']) {
    if (!sounds[name]) throw Error('missing-native-sound:' + name);
    events[name] = sounds[name];
    for (const raw of sounds[name].sounds) {
        const sample = typeof raw === 'string' ? raw : raw.name;
        if (typeof raw === 'object' && raw.type === 'event') throw Error('nested-sound-event');
        const p = 'assets/minecraft/sounds/' + sample + '.ogg', b = await object('minecraft/sounds/' + sample + '.ogg');
        files.set(p, b);
        inputs[p] = hash(b);
    }
}
files.set('assets/minecraft/world-sounds.json', Buffer.from(JSON.stringify(events, null, 2) + '\n'));
const existing = new Set<string>();
for (const name of ['manifest', 'presentation-manifest', 'catalogue-manifest', 'player-manifest', 'book-manifest', 'experience-manifest', 'interaction-manifest', 'interface-manifest', 'environment-manifest', 'ambience-manifest', 'startup-manifest', 'advancement-manifest', 'controls-manifest']) for (const e of JSON.parse(readFileSync(resolve(out, name + '.json'), 'utf8')).entries) existing.add(e.entry);
const entries = [...files].filter(([p]) => !existing.has(p)).sort(([a], [b]) => a.localeCompare(b)).map(([entry, b]) => {
    mkdirSync(dirname(resolve(out, entry)), {recursive: true});
    writeFileSync(resolve(out, entry), b);
    return {entry, size: b.length, sha256: hash(b)};
});
writeFileSync(resolve(out, 'world-manifest.json'), JSON.stringify({
    version: '26.3',
    clientSha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
    inputs,
    classes,
    states,
    entries,
    animalModelSha256: hash(readFileSync(resolve(root, 'app/web/src/data/animal-models.json'))),
    exporterSha256: hash(readFileSync(import.meta.filename, 'utf8').replaceAll('\r\n', '\n')),
    scope: 'Authored oak/temperate adult sources; original model variants, textures, colormaps and interaction sounds; bounded native ambient sounds, ground items and farmland states'
}, null, 2) + '\n');
console.log({states: states.length, newResources: entries.length});
