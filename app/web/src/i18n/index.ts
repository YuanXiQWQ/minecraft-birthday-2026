/** Editable locale lookup, English fallback and strict placeholder matching are independent of application state. */
import english from './en.json' with {type: 'json'};

export type Key = keyof typeof english;
export type Dictionary = Partial<Record<Key, string>>;
/** Public English fallback is also validated by source-usage tests. */
export const ENGLISH = english;

/** Resolve a locale field, fall back to English, and reject a missing English contract or argument.
 * @param {string} key Locale key.
 * @param {Record<string,string|number>} values Named interpolation values.
 * @param {Dictionary} translation Optional future language dictionary.
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

/** Load only an available future locale, retaining per-key English fallback when a file or translation is missing.
 * @param {string} locale Saved language preference.
 * @return {Promise<Dictionary>} Optional locale fields.
 */
export async function loadLocale(locale: string): Promise<Dictionary> {
    if (locale === 'en') return {};
    const files = import.meta.glob('./locales/*.json', {import: 'default'}),
        load = files['./locales/' + locale + '.json'];
    if (!load) return {};
    try {
        return await load() as Dictionary;
    } catch {
        return {};
    }
}
