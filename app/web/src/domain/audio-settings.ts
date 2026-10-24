/** Native sound sources expose only implemented channels; omitted legacy fields resolve to full category volume. */
import type {Settings} from './types.ts';
/** Original SoundSource ordering restricted to actual application voices. */
export const SOUND_CHANNELS=[['musicVolume','music'],['weatherVolume','weather'],['blocksVolume','block'],['neutralVolume','neutral'],['playersVolume','player'],['uiVolume','ui']] as const;
export type SoundKey=typeof SOUND_CHANNELS[number][0];
/** Resolve the actual source used by a native event, separately from master volume.
 * @param {string} event Native sound ID.
 * @return {SoundKey} Implemented source channel.
 */
export function soundChannel(event:string):SoundKey{if(event.startsWith('music.'))return 'musicVolume';if(event.startsWith('weather.')||event.startsWith('entity.lightning_bolt.'))return 'weatherVolume';if(event.startsWith('ui.'))return 'uiVolume';if(event.startsWith('block.')||event==='item.crop.plant'||event==='item.hoe.till')return 'blocksVolume';if(event.startsWith('entity.cow.')||event.startsWith('entity.chicken.')||event.startsWith('entity.firework_rocket.'))return 'neutralVolume';return 'playersVolume';}
/** Apply legacy mute, master and category in one place for all runtime voices.
 * @param {Settings} settings Latest authoritative or actively edited preferences.
 * @param {string} event Native sound event.
 * @param {SoundKey} channel Optional native caller source, such as player footsteps using a block sample.
 * @return {number} Effective normalized gain.
 */
export function soundGain(settings:Settings,event:string,channel=soundChannel(event)):number{return settings.muted?0:settings.volume*(settings[channel]??1);}
