/** Preserve the exact native GUI tabs, damage overlays and search-language provenance. */
import {readClient} from './vanilla/zip.ts';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
/** Locked extraction input and the bounded tracked output profile. */
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'resources/minecraft/26.3'),jar=readClient(process.argv[2]),inputs:Record<string,string>={},entries:object[]=[];
/** Hash exact source bytes. @param {Buffer} b Source bytes. @return {string} SHA256. */
function hash(b:Buffer):string{return createHash('sha256').update(b).digest('hex');}
for(const [entry,b]of jar)if(/textures\/block\/destroy_stage_[0-9]\.png$/.test(entry)||/creative_inventory\/tab_top_(?:unselected|selected)_[17]\.png$/.test(entry)||/textures\/gui\/sprites\/toast\/advancement\.png(?:\.mcmeta)?$/.test(entry)){mkdirSync(dirname(resolve(out,entry)),{recursive:true});writeFileSync(resolve(out,entry),b);inputs[entry]=hash(b);entries.push({entry,size:b.length,sha256:hash(b)});}
/** Official index 34 identifies the exact native simplified Chinese vocabulary. */
const zhSha1='561ed7800004b882b8eeb032ffbe2bf03895bb44',response=await fetch('https://resources.download.minecraft.net/56/'+zhSha1),raw=Buffer.from(await response.arrayBuffer());
if(!response.ok||createHash('sha1').update(raw).digest('hex')!==zhSha1)throw Error('language-integrity');
/** Preserve source bytes alongside the filtered runtime aliases. */
const entry='assets/minecraft/lang/zh_cn.json';mkdirSync(dirname(resolve(out,entry)),{recursive:true});writeFileSync(resolve(out,entry),raw);inputs[entry]=hash(raw);entries.push({entry,size:raw.length,sha256:hash(raw)});
/** Only currently reachable names become runtime aliases. */
const language=JSON.parse(raw.toString()),ids=JSON.parse(readFileSync(resolve(root,'app/web/src/data/registry.json'),'utf8')),names=Object.fromEntries(ids.map((id:string)=>{const short=id.split(':')[1],name=language['item.minecraft.'+short]??language['block.minecraft.'+short];if(!name)throw Error('missing-native-alias:'+id);return[id,name];}));
writeFileSync(resolve(root,'app/web/src/i18n/items.zh_cn.json'),JSON.stringify(names,null,2)+'\n');
writeFileSync(resolve(out,'interaction-manifest.json'),JSON.stringify({classes:Object.fromEntries(['net/minecraft/world/level/block/Blocks.class','net/minecraft/world/level/block/state/BlockBehaviour.class','net/minecraft/world/entity/player/Player.class','net/minecraft/client/gui/screens/inventory/InventoryScreen.class'].map(p=>[p,hash(jar.get(p)!)])),version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',inputs,entries,language:{index:'34',sha1:zhSha1,aliasesSha256:hash(Buffer.from(JSON.stringify(names,null,2)+'\n'))}},null,2)+'\n');
