/** Editable locale lookup, English fallback and strict placeholder matching are independent of application state. */
import english from './en.json' with {type: 'json'};
import chinese from './locales/zh-CN.json' with {type: 'json'};

export type Key = keyof typeof english;
export type Dictionary = Partial<Record<Key, string>>;
/** Public English fallback is also validated by source-usage tests. */
export const ENGLISH = english;
/** Native language names remain readable regardless of the active display language. */
export const LANGUAGES = [
    {id: 'en', name: 'English (US)', search: 'english 英语 en en_us'},
    {id: 'zh-CN', name: '简体中文 (中国大陆)', search: '简体中文 中国大陆 chinese simplified zhongwen zh-CN zh_cn'}
] as const;

/** Resolve supported saved language identifiers, retaining English for unavailable languages.
 * @param {string} locale Saved language identifier.
 * @return {'en'|'zh-CN'} Supported display language.
 */
export function displayLocale(locale: string): 'en' | 'zh-CN' {
    return locale === 'zh-CN' || locale === 'zh_cn' ? 'zh-CN' : 'en';
}

/** Resolve the bundled dictionary synchronously so saved language applies before rendering.
 * @param {string} locale Saved language identifier.
 * @return {Dictionary} Available translations with per-key English fallback.
 */
export function localeDictionary(locale: string): Dictionary {
    return displayLocale(locale) === 'zh-CN' ? chinese : {};
}

/** Resolve a locale field, fall back to English, and reject a missing English contract or argument.
 * @param {string} key Locale key.
 * @param {Record<string,string|number>} values Named interpolation values.
 * @param {Dictionary} translation Optional active language dictionary.
 * @param {Record<string,string>} fallback English catalogue, injectable for validation tests.
 * @return {string} Fully resolved visible text.
 */
export function translate(key: string, values: Record<string, string | number> = {}, translation: Dictionary = {}, fallback: Record<string, string> = english): string {
    const base = fallback[key];
    if (typeof base !== 'string') throw new Error('missing-english-key:' + key);
    const candidate = translation[key as Key],
        fields = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(v => v[1]).sort().join('|');
    const text = typeof candidate === 'string' && fields(candidate) === fields(base) ? candidate : base;
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
        if (values[name] === undefined) throw new Error('missing-locale-argument:' + name);
        return String(values[name]);
    });
}

/** Load a bundled locale, retaining per-key English fallback for unavailable languages.
 * @param {string} locale Saved language preference.
 * @return {Promise<Dictionary>} Optional locale fields.
 */
export async function loadLocale(locale: string): Promise<Dictionary> {
    return localeDictionary(locale);
}
