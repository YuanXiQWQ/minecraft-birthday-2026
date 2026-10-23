/** Export bounded native recipe-book evidence and original GUI dependencies without running Minecraft. */
import {readClient} from './vanilla/zip.ts';
import {writeJSON} from './vanilla/extract.ts';
import {iconParts, iconModel} from '../web/src/ui/icon-model.ts';
import {resolveTexture, resourceId} from '../web/src/render/model-format.ts';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

/** Locked archive input is extraction-only; normal builds consume committed files. */
const jar = readClient(process.argv[process.argv.indexOf('--client') + 1]),
    root = resolve(import.meta.dirname, '../..'), out = resolve(root, 'resources/minecraft/26.3'),
    catalog = JSON.parse(readFileSync(resolve(root, 'data/minecraft/26.3/catalog.json'), 'utf8')),
    rules = JSON.parse(readFileSync(resolve(root, 'data/minecraft/26.3/rules.json'), 'utf8')),
    inputs: Record<string, string> = {}, files = new Set<string>();

/** Record an exact native asset or document. @param {string} path Original archive entry. @return {Buffer} Original bytes. */
function take(path: string): Buffer {
    const b = jar.get(path);
    if (!b) throw Error('missing-book-resource:' + path);
    inputs[path] = createHash('sha256').update(b).digest('hex');
    files.add(path);
    return b;
}

/** Resolve a native model parent chain. @param {string} id Original model. @return {any} JSON definition. */
function model(id: string): any {
    id = resourceId(id);
    if (id.startsWith('minecraft:builtin/')) return {};
    const value = JSON.parse(take('assets/minecraft/models/' + id.split(':')[1] + '.json').toString());
    if (value.parent) model(value.parent);
    return value;
}

/** Preserve texture and any animation metadata. @param {string} id Namespaced texture. */
function texture(id: string): void {
    const path = 'assets/minecraft/textures/' + id.split(':')[1] + '.png';
    take(path);
    if (jar.has(path + '.mcmeta')) take(path + '.mcmeta');
}

for (const path of jar.keys()) if (/^assets\/minecraft\/textures\/gui\/(recipe_book\.png|container\/hopper\.png|sprites\/recipe_book\/.*|sprites\/toast\/(recipe|recipe_book)\.png(?:\.mcmeta)?)$/.test(path)) take(path);
/** UI-only tab symbols never become registered or obtainable catalogue items. */
const icons = ['compass', 'golden_sword', 'bricks', 'lava_bucket', 'apple', 'redstone', 'cooked_porkchop'],
    uiDefinitions: Record<string, any> = {};
for (const id of icons) {
    const definition = JSON.parse(take('assets/minecraft/items/' + id + '.json').toString());
    const node = id === 'compass' ? definition.model.on_false.entries[0].model : definition.model;
    if (id === 'compass') for (const entry of definition.model.on_false.entries) {
        const native = model(entry.model.model);
        for (const ref of Object.values(native.textures) as string[]) texture(resolveTexture(ref, native.textures));
    }
    if (!node) throw Error('missing-native-ui-compass');
    uiDefinitions['minecraft:' + id] = node;
    for (const part of iconParts(node, '10-21')) {
        model(part.model);
        const m = iconModel(part.model, model);
        for (const ref of Object.values(m.textures) as string[]) texture(resolveTexture(ref, m.textures));
    }
}
const existing = new Set<string>();
for (const manifest of ['manifest.json', 'presentation-manifest.json', 'catalogue-manifest.json', 'player-manifest.json']) for (const e of JSON.parse(readFileSync(resolve(out, manifest), 'utf8')).entries) existing.add(e.entry);
const entries = [...files].sort().filter(p => !existing.has(p)).map(entry => {
    const b = jar.get(entry)!;
    mkdirSync(dirname(resolve(out, entry)), {recursive: true});
    if (existsSync(resolve(out, entry)) && !readFileSync(resolve(out, entry)).equals(b)) throw Error('conflicting-book-resource');
    writeFileSync(resolve(out, entry), b);
    return {entry, size: b.length, sha256: inputs[entry]};
});
const advances = Object.fromEntries(Object.entries(catalog.discovery as Record<string, any>).filter(([, a]) => a.rewards?.recipes?.some((id: string) => rules.recipes.some((r: any) => r.id === id))).map(([p, a]) => {
    take(p);
    return [p, a];
}));
const tags = Object.fromEntries(Object.entries(catalog.itemTags as Record<string, string[]>).map(([id, list]) => [id, list.filter(id => rules.items[id])]));
writeJSON(resolve(root, 'app/web/src/data/recipe-book.json'), {
    version: '26.3',
    recipes: rules.recipes.filter((r: any) => !r.type.includes('special')),
    advances,
    tags
});
writeJSON(resolve(out, 'book-manifest.json'), {
    version: '26.3',
    clientSha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
    inputs: Object.fromEntries(Object.entries(inputs).filter(([p]) => p.startsWith('assets/'))),
    entries,
    uiDefinitions,
    compassModels: [...new Set(JSON.parse(jar.get('assets/minecraft/items/compass.json')!.toString()).model.on_false.entries.map((entry: any) => entry.model.model))],
    limitations: ['Compass uses a shared authored world reference and the actual camera owner; no additional world generation']
});
const classes = Object.fromEntries([...jar].filter(([p]) => /(RecipeBookComponent|RecipeBookPage|RecipeButton|RecipeCraftingHolder|HopperMenu|HopperScreen|RecipeToast|GhostSlots|ServerPlaceRecipe|PlaceRecipeHelper)\.class$/.test(p)).map(([p, b]) => [p, createHash('sha256').update(b).digest('hex')]));
writeJSON(resolve(root, 'data/minecraft/26.3/book-evidence.json'), {
    version: '26.3',
    clientSha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
    classes,
    advances: Object.fromEntries(Object.entries(inputs).filter(([p]) => p.startsWith('data/'))),
    runtimeSha256: createHash('sha256').update(readFileSync(resolve(root, 'app/web/src/data/recipe-book.json'))).digest('hex'),
    exporterSha256: createHash('sha256').update(readFileSync(import.meta.filename, 'utf8').replaceAll('\r\n', '\n')).digest('hex')
});
console.log({
    ordinaryRecipes: rules.recipes.length - 1,
    advances: Object.keys(advances).length,
    newResources: entries.length
});
