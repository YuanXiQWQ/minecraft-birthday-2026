/** Extract bounded Steve, reachable armor and held-item dependencies from the hash-locked official client without executing it. */
import {readClient} from './vanilla/zip.ts';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {dirname,resolve} from 'node:path';import {createHash} from 'node:crypto';import {iconParts,iconModel} from '../web/src/ui/icon-model.ts';import {resourceId,resolveTexture} from '../web/src/render/model-format.ts';
/** Archive input is needed only for extraction, never normal browser execution. */
const jar=readClient(process.argv[process.argv.indexOf('--client')+1]),root=resolve(import.meta.dirname,'../../resources/minecraft/26.3'),files=new Set<string>(),inputs:Record<string,string>={};
/** Retain exact original bytes and source hashes.
 * @param {string} path Archive resource path.
 * @return {Buffer} Original bytes.
 */
function take(path:string):Buffer{const b=jar.get(path);if(!b)throw Error('missing-player-resource:'+path);files.add(path);inputs[path]=createHash('sha256').update(b).digest('hex');return b;}
/** Resolve the original parent chain for every held display context.
 * @param {string} id Original model identifier.
 * @return {any} Native model document.
 */
function model(id:string):any{id=resourceId(id);if(id.startsWith('minecraft:builtin/'))return{};const m=JSON.parse(take('assets/minecraft/models/'+id.split(':')[1]+'.json').toString());if(m.parent)model(m.parent);return m;}
/** Preserve optional animation metadata alongside each original texture.
 * @param {string} id Original texture identifier.
 */
function texture(id:string):void{const p='assets/minecraft/textures/'+resourceId(id).split(':')[1]+'.png';take(p);if(jar.has(p+'.mcmeta'))take(p+'.mcmeta');}
texture('entity/player/wide/steve');take('assets/minecraft/equipment/iron.json');texture('entity/equipment/humanoid/iron');texture('entity/equipment/humanoid_leggings/iron');
const ids=JSON.parse(readFileSync(resolve(import.meta.dirname,'../web/src/data/registry.json'),'utf8')) as string[];
for(const id of ids){const def=JSON.parse(take('assets/minecraft/items/'+id.split(':')[1]+'.json').toString());for(const context of ['thirdperson_righthand','thirdperson_lefthand'])for(const date of ['10-21','12-25'])for(const p of iconParts(def.model,date,[],context)){const m=iconModel(p.model,model);for(const ref of Object.values(m.textures) as string[])texture(resolveTexture(ref,m.textures));if(p.special?.type==='minecraft:chest')texture('entity/chest/'+p.special.texture!.split(':')[1]);if(p.special?.type==='minecraft:shield')texture('entity/shield/shield_base_nopattern');}}
for(const name of ['InventoryScreen','CreativeModeInventoryScreen','PlayerModel','HumanoidModel','ItemInHandLayer','HumanoidArmorLayer','ModelPart$Cube','ItemModelGenerator','ItemTransform','ShieldSpecialRenderer','ChestSpecialRenderer','LayerDefinitions','AvatarRenderer']){const path=[...jar.keys()].find(p=>p.endsWith('/'+name+'.class'));if(!path)throw Error('missing-source-class:'+name);inputs[path]=createHash('sha256').update(jar.get(path)!).digest('hex');}
const existing=new Set<string>();for(const name of ['manifest.json','presentation-manifest.json','catalogue-manifest.json'])for(const e of JSON.parse(readFileSync(resolve(root,name),'utf8')).entries)existing.add(e.entry);
const entries=[...files].sort().filter(p=>!existing.has(p)).map(entry=>{const b=jar.get(entry)!;mkdirSync(dirname(resolve(root,entry)),{recursive:true});writeFileSync(resolve(root,entry),b);return{entry,size:b.length,sha256:inputs[entry]};});
writeFileSync(resolve(root,'player-manifest.json'),JSON.stringify({version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',profile:'steve-wide-reachable-iron-held-v1',exporterSha256:createHash('sha256').update(readFileSync(import.meta.filename,'utf8').replaceAll('\r\n','\n')).digest('hex'),inputs,entries,equipment:Object.fromEntries(['helmet','chestplate','leggings','boots'].map(s=>['minecraft:iron_'+s,'minecraft:iron'])),scope:'Default Steve wide skin; current reachable untrimmed iron armor; idle held contexts; no online skin service'},null,2)+'\n');console.log(JSON.stringify({newFiles:entries.length,dependencies:files.size,sourceClasses:13}));
