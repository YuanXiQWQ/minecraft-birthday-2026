/** Official same-version advancement text is shared by the screen, Toast and system announcements. */
import {translate,localeDictionary,ENGLISH} from './index.ts';
import english from './advancements.en_us.json' with {type:'json'};
import chinese from './advancements.zh_cn.json' with {type:'json'};

/** Resolve original translated copy with an English fallback.
 * @param {string} key Original language key.
 * @param {string} locale Saved project language.
 * @return {string} Unmodified native text or translation template.
 */
export function advancementText(key:string,locale='en'):string {
    if(Object.hasOwn(ENGLISH,key))return translate(key,{},localeDictionary(locale));
    const language=locale==='zh-CN'||locale==='zh_cn'?chinese:english;
    const text=language[key as keyof typeof english]??english[key as keyof typeof english];
    if(typeof text!=='string')throw Error('missing-advancement-language:'+key);
    return text;
}
