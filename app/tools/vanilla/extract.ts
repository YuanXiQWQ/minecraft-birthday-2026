/** Deterministic official JSON/class evidence extraction; full clients and javap diagnostics stay outside web output. */
import {readClient} from './zip.ts';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

/** Extract only rule evidence, preserving case-sensitive JSON and per-entry source identities.
 * @param {string} jar Official client path with the locked SHA1.
 * @param {string} javap Existing JDK javap executable.
 * @return {object} Parsed evidence and static registration code.
 */
export function extract(jar: string, javap = 'javap'): {
    documents: Record<string, any>;
    hashes: Record<string, string>;
    classes: Record<string, string>
} {
    const files = readClient(jar), documents: Record<string, any> = {}, hashes: Record<string, string> = {},
        classes: Record<string, string> = {};
    for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
        if (/^data\/minecraft\/(recipe|tags\/(item|block)|context_(int|float)_provider|predicate|advancement\/recipes)\/.*\.json$/.test(name) || /^data\/minecraft\/loot_table\/blocks\/(stone|coal_ore|iron_ore|short_grass|wheat|[a-z_]+_log|sugar_cane)\.json$/.test(name)) {
            documents[name] = JSON.parse(bytes.toString());
            hashes[name] = createHash('sha256').update(bytes).digest('hex');
        }
    }
    for (const name of ['world.level.block.Blocks', 'world.entity.animal.cow.AbstractCow', 'tags.BlockTags', 'world.item.Items', 'references.ItemIds', 'references.BlockItemIds', 'world.item.Item$Properties', 'world.item.ToolMaterial', 'world.item.equipment.ArmorMaterials', 'world.item.equipment.ArmorType', 'core.component.DataComponents', 'world.item.crafting.RepairItemRecipe', 'world.item.crafting.ShapedRecipe', 'world.item.crafting.ShapelessRecipe', 'world.item.crafting.CraftingRecipe', 'world.item.crafting.TransmuteRecipe', 'world.item.component.CookingFuel', 'world.level.block.entity.AbstractFurnaceBlockEntity', 'world.level.storage.loot.providers.number.ints.ContextIntProviders']) {
        const full = 'net.minecraft.' + name, entry = full.replaceAll('.', '/') + '.class', bytes = files.get(entry);
        if (!bytes) throw new Error('missing-class:' + full);
        hashes[entry] = createHash('sha256').update(bytes).digest('hex');
        classes[name] = execFileSync(javap, ['-classpath', jar, '-v', '-c', '-p', full], {
            encoding: 'utf8',
            maxBuffer: 16_000_000
        }).replaceAll('\r\n', '\n');
    }
    return {documents, hashes, classes};
}

/** Write stable generated JSON with no clock, local path or archive payload.
 * @param {string} path Output file.
 * @param {unknown} value JSON value.
 */
export function writeJSON(path: string, value: unknown): void {
    mkdirSync(resolve(path, '..'), {recursive: true});
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
