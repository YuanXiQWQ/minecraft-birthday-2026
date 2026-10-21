/** Original English item names have the same explicit future-language fallback boundary as other user-visible text. */
import english from './items.en.json' with {type:'json'};
/** Resolve a registered item name without generating English from an identifier.
 * @param {string} id Original namespaced item.
 * @param {Record<string,string>} translation Optional future-language names.
 * @return {string} Translated name or authoritative English fallback.
 */
export function itemName(id:string,translation:Record<string,string>={}):string{const base=(english as Record<string,string>)[id];if(!base)throw Error('missing-english-item:'+id);return translation[id]??base;}
