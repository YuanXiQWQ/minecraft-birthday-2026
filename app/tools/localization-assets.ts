/** Reproduce native Simplified Chinese UI and command templates from the locked Java 26.3 language asset. */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

/** Tracked source language, authored application copy and English placeholder contracts. */
const root = resolve(import.meta.dirname, '../..'), asset = resolve(root, 'resources/minecraft/26.3'),
    raw = readFileSync(resolve(asset, 'assets/minecraft/lang/zh_cn.json')),
    manifest = JSON.parse(readFileSync(resolve(asset, 'interaction-manifest.json'), 'utf8')),
    native = JSON.parse(raw.toString()), path = resolve(root, 'app/web/src/i18n/locales/zh-CN.json'),
    chinese = JSON.parse(readFileSync(path, 'utf8')),
    english = JSON.parse(readFileSync(resolve(root, 'app/web/src/i18n/en.json'), 'utf8'));
if (createHash('sha1').update(raw).digest('hex') !== manifest.language.sha1) throw Error('language-integrity');

/** Original keys whose meaning is shared with the application's visible UI. */
const keys: Record<string, string> = {
    'common.close': 'gui.done', 'menu.title': 'menu.game', 'menu.back': 'menu.returnToGame',
    'menu.options': 'menu.options', 'menu.quit': 'menu.returnToMenu', 'menu.language': 'options.language',
    'menu.sound': 'options.sounds', 'menu.cancel': 'gui.cancel', 'menu.done': 'gui.done',
    'settings.language': 'options.language.title', 'inventory.nativeInventory': 'container.inventory',
    'inventory.crafting': 'container.crafting', 'inventory.nativeSearch': 'itemGroup.search',
    'inventory.hopper': 'container.hopper', 'inventory.furnace': 'container.furnace', 'inventory.blast_furnace': 'container.blast_furnace',
    'book.newTitle': 'recipe.toast.title', 'book.newDescription': 'recipe.toast.description',
    'book.searchHint': 'gui.recipebook.search_hint', 'book.more': 'gui.recipebook.moreRecipes'
};

/** Adapt Java positional substitutions without changing argument order or literal percent signs.
 * @param {string} text Original Java language template.
 * @return {string} Named interpolation template used by the application.
 */
function template(text: string): string {
    let index = 0;
    return text.replace(/%%|%(?:(\d+)\$)?s/g, (token, position) => token === '%%' ? '%' : '{v' + (position ? Number(position) - 1 : index++) + '}');
}
for (const key of Object.keys(english)) {
    const nativeKey = keys[key] ?? (/^(?:commands?\.|parsing\.|argument\.|soundCategory\.)/.test(key) ? key : undefined);
    if (nativeKey) {
        if (typeof native[nativeKey] !== 'string') throw Error('missing-native-translation:' + nativeKey);
        chinese[key] = template(native[nativeKey]);
    }
    if (typeof chinese[key] !== 'string') throw Error('missing-chinese-key:' + key);
    const fields = (value: string) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(v => v[1]).sort().join('|');
    if (fields(chinese[key]) !== fields(english[key])) throw Error('locale-placeholder:' + key);
}
const output = JSON.stringify(Object.fromEntries(Object.keys(english).map(key => [key, chinese[key]])), null, 2) + '\n';
if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== output) throw Error('stale-chinese-catalogue');
} else writeFileSync(path, output);
