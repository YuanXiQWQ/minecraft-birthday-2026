/** Java 26.3 Blocks registrations and SoundType parameters for the authored mining profile. */

import properties from '../data/block-properties.json' with {type:'json'};

/** Supported block sound families; stone is the native default property. */
const TYPES: Record<string, string> = {
    oak_log: 'wood', crafting_table: 'wood',
    stone: 'stone', coal_ore: 'stone', iron_ore: 'stone', furnace: 'stone', blast_furnace: 'stone',
    hopper: 'metal', short_grass: 'grass', tall_grass: 'grass', sugar_cane: 'grass', wheat: 'crop', grass_block:'grass',dirt:'gravel',dirt_path:'grass',farmland:'gravel',oak_leaves:'grass'
};

/** Read the native material event and unscaled SoundType parameters.
 * @param {string} block Supported unnamespaced block identity.
 * @return {{hit:string,break:string,place:string,step:string,volume:number,pitch:number}} Original event and material values.
 */
export function blockSounds(block: string): {hit: string; break: string; place:string; step:string; volume: number; pitch: number} {
    block=block==='upside_down_cake'?'cake':block==='wall_torch'?'torch':block==='oak_wall_sign'?'oak_sign':block;
    const type = TYPES[block]??(properties as Record<string,{sound:string}>)[block]?.sound;
    if (!type) throw Error('unsupported-block-sound');
    return {hit: 'block.' + (type === 'crop' ? 'grass' : type) + '.hit', break: 'block.' + type + '.break', place:'block.'+type+'.place',step:'block.'+type+'.step',volume: type==='anvil'?.3:1, pitch: type === 'metal' ? 1.5 : 1};
}
