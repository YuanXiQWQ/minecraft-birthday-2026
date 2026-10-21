/** Record exact same-version read-only furnace code/tag evidence without launching the client. */
import {readClient} from './vanilla/zip.ts';import {createHash} from 'node:crypto';import {writeFileSync} from 'node:fs';import {resolve} from 'node:path';
/** Only the locked official input is accepted; no archive is included in runtime output. */
const jar=readClient(process.argv[process.argv.indexOf('--client')+1]),names=['AbstractFurnaceBlockEntity','AbstractFurnaceMenu','AbstractContainerMenu','FurnaceFuelSlot','FurnaceResultSlot','AbstractFurnaceScreen','FurnaceScreen','BlastFurnaceScreen'],entries:Record<string,{size:number;sha256:string}>={};
for(const name of names){const path=[...jar.keys()].find(p=>p.endsWith('/'+name+'.class'));if(!path)throw Error('missing-native-class:'+name);const bytes=jar.get(path)!;entries[path]={size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
/** Keep the original extraction tag alongside its hash for audit and generated port-policy checks. */
const tagPath='data/minecraft/tags/item/furnace_fuel_bottom_takeable.json',tag=jar.get(tagPath)!;
entries[tagPath]={size:tag.length,sha256:createHash('sha256').update(tag).digest('hex')};
writeFileSync(resolve(import.meta.dirname,'../../data/minecraft/26.3/furnace-evidence.json'),JSON.stringify({version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',method:'readClient locked hash; existing javap -c -p; no Java client execution',entries,bottomTakeable:JSON.parse(tag.toString())},null,2)+'\n');
