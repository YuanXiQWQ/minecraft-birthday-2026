/** Reproducible P4 export from one hash-locked client, with no client launch and no runtime private-cache dependency. */
import {sourceRules} from './vanilla/sources.ts';
import {verify} from './vanilla/verify.ts';
import {extract, writeJSON} from './vanilla/extract.ts';
import {itemRules} from './vanilla/items.ts';
import {tags, closure} from './vanilla/closure.ts';
import type {Recipe, Rules} from '../web/src/rules/types.ts';
import {readFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';

/** Exporter identity changes when extraction or rule normalization changes. */
const VERSION = 'p4-export-1';

/** Run locked extraction on every export; generated facts never embed the input's local path.
 * @param {string[]} args CLI flags.
 */
async function main(args: string[]): Promise<void> {
    const root = resolve(import.meta.dirname, '../..'), input = args[args.indexOf('--client') + 1];
    if (!args.includes('--client')) throw new Error('usage: --client <verified-jar> [--javap <existing-javap>]');
    const e = extract(input, args.includes('--javap') ? args[args.indexOf('--javap') + 1] : 'javap');
    const d = e.documents as Record<string, any>,
        recipes: Recipe[] = Object.entries(d).filter(([p]) => p.startsWith('data/minecraft/recipe/')).map(([p, r]) => ({id: 'minecraft:' + p.slice('data/minecraft/recipe/'.length, -5), ...r})),
        items = itemRules(e.classes, d), itemTags = tags(d, 'item'), blockTags = tags(d, 'block');
    /** Project a registry while retaining its exact namespaced reference keys.
     * @param {string} kind Original registry directory.
     * @return {Record<string,any>} Native values.
     */
    const registry = (kind: string): Record<string, any> => Object.fromEntries(Object.entries(d).filter(([p]) => p.startsWith('data/minecraft/' + kind + '/')).map(([p, v]) => ['minecraft:' + p.slice(('data/minecraft/' + kind + '/').length, -5), v]));
    const source = sourceRules(e.classes),
        loot = Object.fromEntries(Object.entries(d).filter(([p]) => p.includes('/loot_table/') || p.includes('/predicate/'))),
        rules: Rules = {
            ...source,
            loot,
            recipes,
            items,
            itemTags,
            blockTags,
            intProviders: registry('context_int_provider'),
            floatProviders: registry('context_float_provider')
        }, analysis = closure(rules, d), ids = Object.keys(analysis.proofs).sort(),
        reachable = new Set(analysis.coverage.filter(c => c.status === 'reachable').map(c => c.recipe)),
        runtime: Rules = {
            ...rules,
            recipes: recipes.filter(r => reachable.has(r.id)),
            items: Object.fromEntries(ids.map(id => [id, items[id]]))
        };
    const neededTags = new Set<string>();

    /** Collect namespaced ingredient tags while leaving pattern characters and identifiers unchanged.
     * @param {unknown} value Original JSON tree.
     */
    function collectTags(value: unknown): void {
        if (typeof value === 'string' && /^#[a-z0-9_.-]+:/.test(value)) neededTags.add(value.slice(1)); else if (Array.isArray(value)) value.forEach(collectTags); else if (value && typeof value === 'object') Object.values(value).forEach(collectTags);
    }

    runtime.recipes.forEach(collectTags);
    runtime.itemTags = Object.fromEntries([...neededTags].sort().map(id => [id, itemTags[id]]));
    runtime.blockTags = Object.fromEntries([...new Set(['minecraft:mineable/pickaxe', ...Object.values(runtime.items).flatMap(i => i.tool ? [i.tool.incorrect] : [])])].sort().map(id => [id, blockTags[id]]));
    const types: Record<string, number> = {};
    for (const r of recipes) types[r.type] = (types[r.type] ?? 0) + 1;
    const ordinary = recipes.filter(r => r.type !== 'minecraft:brewing');
    if (ordinary.length !== 1763 || Object.keys(types).length !== 22 || types['minecraft:brewing'] !== 279) throw new Error('recipe-census-changed');
    const out = join(root, 'data/minecraft/26.3'), runtimePath = join(root, 'app/web/src/data');
    mkdirSync(runtimePath, {recursive: true});
    writeJSON(join(out, 'catalog.json'), {
        version: '26.3', ...source,
        recipes,
        items,
        itemTags,
        blockTags,
        providers: {int: rules.intProviders, float: rules.floatProviders},
        rawTags: Object.fromEntries(Object.entries(d).filter(([p]) => p.includes('/tags/'))),
        loot: Object.fromEntries(Object.entries(d).filter(([p]) => p.includes('/loot_table/') || p.includes('/predicate/'))),
        discovery: Object.fromEntries(Object.entries(d).filter(([p]) => p.includes('/advancement/recipes/')))
    });
    writeJSON(join(out, 'coverage.json'), {
        profile: {
            status: 'candidate-analysis-not-P7-layout',
            tree: 'minecraft:oak_log',
            egg: 'minecraft:egg',
            sources: ['tree', 'short_grass', 'sugar_cane', 'stone', 'coal_ore', 'iron_ore', 'egg', 'cow', 'pretilled-wheat'],
            excluded: ['combat', 'leaves', 'stripping', 'background dirt/water', 'stonecutter', 'smoker', 'campfire', 'brewing', 'smithing']
        },
        counts: {
            base: 1763,
            baseTypes: 21,
            additionalBrewing: 279,
            total: recipes.length,
            types,
            reachableItems: ids.length,
            reachableRecipes: reachable.size,
            blocked: analysis.coverage.filter(c => c.status === 'blocked').length
        }, ...analysis
    });
    writeJSON(join(runtimePath, 'registry.json'), ids);
    writeJSON(join(out, 'rules.json'), runtime);
    writeJSON(join(out, 'cake-chain.json'), verify(rules, analysis.proofs, analysis.coverage));
    const scenarios = [...itemTags['minecraft:logs_that_burn'].filter(id => /:(?!stripped_)[a-z_]+_log$/.test(id)).map(tree => ({
        tree,
        egg: 'minecraft:egg'
    })), ...itemTags['minecraft:eggs'].filter(egg => egg !== 'minecraft:egg').map(egg => ({
        tree: 'minecraft:oak_log',
        egg
    }))].map(profile => {
        const result = closure(rules, d, profile.tree, profile.egg);
        return {
            ...profile,
            status: 'candidate-not-approved-P7-source',
            proofs: result.proofs,
            reachableRecipes: result.coverage.filter(c => c.status === 'reachable').map(c => c.recipe),
            blocked: result.coverage.filter(c => c.status === 'blocked')
        };
    });
    writeJSON(join(out, 'source-profiles.json'), scenarios);
    const files = ['catalog.json', 'coverage.json', 'rules.json', 'cake-chain.json', 'source-profiles.json'].map(file => {
        const raw = readFileSync(join(out, file));
        return {file, bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex')};
    });
    const registrySha256 = createHash('sha256').update(readFileSync(join(runtimePath, 'registry.json'))).digest('hex'),
        exporterSources = Object.fromEntries(['tools/export-vanilla.ts', 'tools/vanilla/zip.ts', 'tools/vanilla/extract.ts', 'tools/vanilla/items.ts', 'tools/vanilla/sources.ts', 'tools/vanilla/closure.ts', 'tools/vanilla/verify.ts', 'web/src/rules/matcher.ts', 'web/src/rules/process.ts', 'web/src/rules/harvest.ts'].map(file => [file, createHash('sha256').update(readFileSync(join(root, 'app', file), 'utf8').replaceAll('\r\n', '\n')).digest('hex')]));
    writeJSON(join(out, 'manifest.json'), {
        version: '26.3',
        exporter: VERSION,
        toolchain: 'existing JDK 25 javap -v -c -p; Node 25; no Minecraft classes executed',
        exporterSources,
        client: {
            sha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
            url: 'https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar'
        },
        inputs: e.hashes,
        files,
        runtime: ['rules.json'],
        registrySha256
    });
    writeJSON(join(out, 'runtime-manifest.json'), {
        version: '26.3',
        exporter: VERSION,
        clientSha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
        registrySha256,
        files: files.filter(f => f.file === 'rules.json')
    });
    console.log(JSON.stringify({
        types,
        total: recipes.length,
        reachableItems: ids.length,
        reachableRecipes: reachable.size,
        candidateProfiles: scenarios.length,
        blocked: analysis.coverage.filter(c => c.status === 'blocked')
    }, null, 2));
}

await main(process.argv.slice(2));
