/** Java 26.3 Blocks registrations and SoundType parameters for the authored mining profile. */

/** Supported block sound families; stone is the native default property. */
const TYPES: Record<string, string> = {
    oak_log: 'wood', crafting_table: 'wood',
    stone: 'stone', coal_ore: 'stone', iron_ore: 'stone', furnace: 'stone', blast_furnace: 'stone',
    hopper: 'metal', short_grass: 'grass', sugar_cane: 'grass', wheat: 'crop'
};

/** Read the native material event and unscaled SoundType parameters.
 * @param {string} block Supported unnamespaced block identity.
 * @return {{hit:string,break:string,volume:number,pitch:number}} Original event and material values.
 */
export function blockSounds(block: string): {hit: string; break: string; volume: number; pitch: number} {
    const type = TYPES[block];
    if (!type) throw Error('unsupported-block-sound');
    return {hit: 'block.' + (type === 'crop' ? 'grass' : type) + '.hit', break: 'block.' + type + '.break', volume: 1, pitch: type === 'metal' ? 1.5 : 1};
}
