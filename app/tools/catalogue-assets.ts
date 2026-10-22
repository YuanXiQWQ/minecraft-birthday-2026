/** Extract the current reachable catalogue's exact GUI dependencies from the locked official client, without launching Minecraft. */
import {readClient} from './vanilla/zip.ts';
import {iconParts, iconModel} from '../web/src/ui/icon-model.ts';
import {resourceId, resolveTexture} from '../web/src/render/model-format.ts';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

/** Project source and committed original-resource root. */
const root = resolve(import.meta.dirname, '../..'), out = resolve(root, 'resources/minecraft/26.3'),
    jar = readClient(process.argv[process.argv.indexOf('--client') + 1]), files = new Set<string>(),
    inputs: Record<string, string> = {},
    ids = JSON.parse(readFileSync(resolve(root, 'app/web/src/data/registry.json'), 'utf8')) as string[];

/** Keep one original byte sequence and hash every dependency, including already committed resources.
 * @param {string} path Exact archive entry.
 * @return {Buffer} Original bytes.
 */
function take(path: string): Buffer {
    const b = jar.get(path);
    if (!b) throw Error('missing-client-resource:' + path);
    files.add(path);
    inputs[path] = createHash('sha256').update(b).digest('hex');
    return b;
}

/** Read an original model and recursively preserve its actual parent/texture dependencies.
 * @param {string} id Namespaced model.
 * @return {any} Original JSON model.
 */
function model(id: string): any {
    id = resourceId(id);
    if (id.startsWith('minecraft:builtin/')) return {};
    const m = JSON.parse(take('assets/minecraft/models/' + id.split(':')[1] + '.json').toString());
    if (m.parent) model(m.parent);
    return m;
}

/** Preserve original PNG plus any animation metadata without flattening it into a substitute texture.
 * @param {string} id Texture identity.
 */
function texture(id: string): void {
    const p = 'assets/minecraft/textures/' + resourceId(id).split(':')[1] + '.png';
    take(p);
    if (jar.has(p + '.mcmeta')) take(p + '.mcmeta');
}

const coverage: Record<string, unknown> = {}, names: Record<string, string> = {},
    language = JSON.parse(jar.get('assets/minecraft/lang/en_us.json')!.toString());
inputs['assets/minecraft/lang/en_us.json'] = createHash('sha256').update(jar.get('assets/minecraft/lang/en_us.json')!).digest('hex');
for (const id of ids) {
    const path = id.split(':')[1], definition = JSON.parse(take('assets/minecraft/items/' + path + '.json').toString()),
        parts = iconParts(definition.model, '10-21');
    for (const date of ['10-21', '12-25']) for (const part of iconParts(definition.model, date)) {
        model(part.model);
        const resolved = iconModel(part.model, model);
        for (const ref of Object.values(resolved.textures ?? {}) as string[]) texture(resolveTexture(ref, resolved.textures));
        if (part.special?.type === 'minecraft:chest') texture('minecraft:entity/chest/' + part.special.texture!.split(':')[1]);
        if (part.special?.type === 'minecraft:shield') texture('minecraft:entity/shield/shield_base_nopattern');
        if (part.tints?.length) texture('minecraft:colormap/grass');
    }
    coverage[id] = {
        parts: parts.map(p => ({
            model: p.model,
            special: p.special?.type,
            tints: p.tints ?? [],
            transforms: p.transforms
        })), scope: 'default-untrimmed-stack-gui'
    };
    const name = language['item.minecraft.' + path] ?? language['block.minecraft.' + path];
    if (!name) throw Error('missing-native-name:' + id);
    names[id] = name;
}
take('assets/minecraft/textures/gui/container/inventory.png');
take('assets/minecraft/textures/gui/container/crafting_table.png');
for (const p of [...jar.keys()].filter(p => /textures\/gui\/container\/(furnace|blast_furnace)\.png$/.test(p) || /textures\/gui\/sprites\/container\/(furnace|blast_furnace)\/.*\.png(?:\.mcmeta)?$/.test(p))) take(p);
for (const name of ['scroller', 'scroller_disabled']) take('assets/minecraft/textures/gui/sprites/container/creative_inventory/' + name + '.png');
for (const path of [...jar.keys()].filter(p => /textures\/gui\/container\/creative_inventory\/(tab_items|tab_inventory)\.png$/.test(p) || /textures\/gui\/sprites\/hud\/hotbar(?:_selection|_offhand_left|_offhand_right)?\.png$/.test(p) || /textures\/gui\/sprites\/container\/(slot(?:_highlight_(?:back|front))?|slot\/(helmet|chestplate|leggings|boots|shield))\.png(?:\.mcmeta)?$/.test(p))) take(path);
for (const path of [...jar.keys()].filter(p => /textures\/gui\/sprites\/tooltip\/(background|frame)\.png(?:\.mcmeta)?$/.test(p))) take(path);
for (const name of ['ChestModel', 'ShieldModel', 'ColorMapColorUtil', 'ItemTransform', 'Lighting', 'TooltipRenderUtil', 'ModelPart$Cube', 'ModelPart$Polygon']) {
    const path = [...jar.keys()].find(p => p.endsWith('/' + name + '.class'))!;
    inputs[path] = createHash('sha256').update(jar.get(path)!).digest('hex');
}
inputs['assets/minecraft/shaders/include/light.glsl'] = createHash('sha256').update(jar.get('assets/minecraft/shaders/include/light.glsl')!).digest('hex');
const existing = new Set<string>();
for (const manifest of ['manifest.json', 'presentation-manifest.json']) for (const e of JSON.parse(readFileSync(resolve(out, manifest), 'utf8')).entries) existing.add(e.entry);
const entries = [...files].sort().filter(p => !existing.has(p)).map(entry => {
    const b = jar.get(entry)!;
    mkdirSync(dirname(resolve(out, entry)), {recursive: true});
    if (existsSync(resolve(out, entry)) && !readFileSync(resolve(out, entry)).equals(b)) throw Error('conflicting-original:' + entry);
    writeFileSync(resolve(out, entry), b);
    return {entry, size: b.length, sha256: inputs[entry]};
});
writeFileSync(resolve(out, 'catalogue-manifest.json'), JSON.stringify({
    version: '26.3',
    exporter: 'p5-catalogue-1',
    adapterSources: Object.fromEntries(['ui/icon-model.ts', 'render/model-format.ts'].map(file => [file, createHash('sha256').update(readFileSync(resolve(root, 'app/web/src', file), 'utf8').replaceAll('\r\n', '\n')).digest('hex')])),
    exporterSha256: createHash('sha256').update(readFileSync(import.meta.filename, 'utf8').replaceAll('\r\n', '\n')).digest('hex'),
    namesSha256: createHash('sha256').update(JSON.stringify(names, null, 2) + '\n').digest('hex'),
    clientSha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
    inputs,
    entries,
    items: ids,
    coverage,
    unsupported: ['nondefault trimmed or decorated stacks', 'non-GUI held/entity render contexts', 'full Java shader/AO parity']
}, null, 2) + '\n');
writeFileSync(resolve(root, 'app/web/src/i18n/items.en.json'), JSON.stringify(names, null, 2) + '\n');
console.log(JSON.stringify({
    items: ids.length,
    newOriginalFiles: entries.length,
    originalDependencies: files.size
}, null, 2));
