/** Migrate persisted cake identities while preserving quantities, metadata and unrelated user data. */
import {ODD_CAKE,ODD_BLOCK} from '../domain/easter-egg.ts';

/** Persisted upside-down cake items and recipes map to the canonical ekac identity. */
const LEGACY_ITEM='jerrys_farm:upside_down_cake';
/** Persisted placed cake blocks use an unnamespaced block identity. */
const LEGACY_BLOCK='upside_down_cake';

/** Inspect a JSON record without accepting arrays or replacing malformed fields.
 * @param {unknown} value Unvalidated persisted value.
 * @return {Record<string,unknown>|undefined} Object fields when present.
 */
function record(value:unknown):Record<string,unknown>|undefined {
    return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
}

/** Iterate a persisted list without normalizing invalid save structure.
 * @param {unknown} value Unvalidated list.
 * @return {unknown[]} List elements or an empty traversal.
 */
function entries(value:unknown):unknown[]{return Array.isArray(value)?value:[];}

/** Convert recognized identity fields before strict state validation; custom component payloads remain opaque.
 * @param {unknown} state Checksummed persisted state, including supported older carrier versions.
 * @return {boolean} Whether any persisted identity changed.
 */
export function migrateEkac(state:unknown):boolean {
    let changed=false;
    /** Convert one authoritative identity field without touching other fields.
     * @param {Record<string,unknown>|undefined} object Persisted record.
     * @param {string} key Identity field.
     * @param {string} legacy Recognized persisted identity.
     * @param {string} current Canonical identity.
     */
    function rename(object:Record<string,unknown>|undefined,key:string,legacy=LEGACY_ITEM,current=ODD_CAKE):void {
        if(object?.[key]===legacy){object[key]=current;changed=true;}
    }
    /** Convert item identities in an ordered inventory, preserving each stack's components.
     * @param {unknown} value Persisted stack list.
     */
    function stacks(value:unknown):void{for(const stack of entries(value))rename(record(stack),'id');}
    /** Convert acquisition or recipe IDs while retaining order and validation of duplicates.
     * @param {unknown} value Persisted identity list.
     */
    function identities(value:unknown):void {
        if(Array.isArray(value))for(let i=0;i<value.length;i++)if(value[i]===LEGACY_ITEM){value[i]=ODD_CAKE;changed=true;}
    }
    /** Visit the item carriers declared by a saved container version.
     * @param {unknown} value Persistent container contents.
     */
    function container(value:unknown):void {
        const contents=record(value),data=record(contents?.data);
        if(contents?.version===1)stacks(data?.grid);
        else if(contents?.version===2)for(const key of ['input','fuel','output'])rename(record(data?.[key]),'id');
        else if(contents?.version===3||contents?.version===4)stacks(data?.slots);
    }
    const progress=record(record(state)?.progress),player=record(record(progress?.player)?.data),book=record(record(progress?.recipeBook)?.data);
    identities(progress?.unlocked);identities(book?.known);identities(book?.unseen);
    stacks(player?.backpack);stacks(player?.hotbar);
    const equipment=record(player?.equipment);
    for(const key of ['head','chest','legs','feet','offhand'])rename(record(equipment?.[key]),'id');
    for(const preset of entries(player?.presets))stacks(preset);
    const scenes=record(progress?.scenes);
    for(const name of ['plains','cave','farm','home']){
        const scene=record(scenes?.[name]);
        for(const station of entries(scene?.stations))container(record(station)?.contents);
        for(const block of entries(scene?.blocks)){
            const placed=record(block);rename(placed,'block',LEGACY_BLOCK,ODD_BLOCK);container(placed?.contents);
        }
        for(const drop of entries(record(scene?.agriculture)?.drops))rename(record(record(drop)?.stack),'id');
    }
    return changed;
}
