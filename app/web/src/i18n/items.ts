/** Original item names follow the saved display language and share bilingual search aliases. */
import {ODD_CAKE} from '../domain/easter-egg.ts';
import authored from './authored-items.json' with {type:'json'};
import aliases from './items.zh_cn.json' with {type: 'json'};
import english from './items.en.json' with {type: 'json'};
import {displayLocale} from './index.ts';

/** Resolve a registered item name without generating English from an identifier.
 * @param {string} id Original namespaced item.
 * @param {string|Record<string,string>} translation Saved language or explicit translated names.
 * @return {string} Translated name or authoritative English fallback.
 */
export function itemName(id: string, translation: string | Record<string, string> = 'en'): string {
    if(id==='minecraft:water_bucket')return typeof translation==='string'&&displayLocale(translation)==='zh-CN'?'姘存《':'Water Bucket';
    const base = id===ODD_CAKE?authored[ODD_CAKE].en:(english as Record<string, string>)[id];
    if (!base) throw Error('missing-english-item:' + id);
    const names = typeof translation === 'string' ? displayLocale(translation) === 'zh-CN' ? aliases : {} : translation;
    return id===ODD_CAKE&&typeof translation==='string'&&displayLocale(translation)==='zh-CN'?authored[ODD_CAKE]['zh-CN']:(names as Record<string, string>)[id] ?? base;
}

/** Search original supported-language aliases without changing display language or permanent order.
 * @param {string} id Native identity.
 * @param {string} query User text.
 * @return {boolean} Whether any indexed name or ID matches.
 */
export function matchesItem(id: string, query: string): boolean {
    return (id + ' ' + itemName(id) + ' ' + (id===ODD_CAKE?authored[ODD_CAKE]['zh-CN']:(aliases as Record<string, string>)[id] ?? '')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
