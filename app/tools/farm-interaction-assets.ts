/** Export the locked client's animal food, bucket, particle and interaction sound dependencies. */
import {readClient} from './vanilla/zip.ts';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
/** Exact official inputs and tracked output roots. */
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'resources/minecraft/26.3'),jar=readClient(process.argv[2]),files=new Map<string,Buffer>();
/** Hash original bytes. @param {Uint8Array|string} bytes Source. @return {string} SHA256. */
function hash(bytes:Uint8Array|string):string{return createHash('sha256').update(bytes).digest('hex');}
/** Preserve an archive resource. @param {string} path Archive entry. @return {Buffer} Original bytes. */
function take(path:string):Buffer{const bytes=jar.get(path);if(!bytes)throw Error(path);files.set(path,bytes);return bytes;}
for(const path of ['items/water_bucket.json','models/item/water_bucket.json','textures/item/water_bucket.png','particles/heart.json','textures/particle/heart.png','textures/block/water_flow.png','textures/block/water_flow.png.mcmeta'])take('assets/minecraft/'+path);
/** Official food tags and transformer define supported interactions without guessed item names. */
const foods=Object.fromEntries(['cow','chicken'].map(kind=>[kind,JSON.parse(take('data/minecraft/tags/item/'+kind+'_food.json').toString()).values]));
take('data/minecraft/block_transformer/shovel.json');
take('data/minecraft/tags/item/douses_campfires.json');
take('data/minecraft/tags/item/shovels.json');
writeFileSync(resolve(root,'app/web/src/data/animal-foods.json'),JSON.stringify(foods,null,2)+'\n');
/** Verify remote official sound objects against the pinned asset index. @param {string} url Source. @param {string} sha1 Identity. @return {Promise<Buffer>} Verified bytes. */
async function official(url:string,sha1:string):Promise<Buffer>{const r=await fetch(url),b=Buffer.from(await r.arrayBuffer());if(!r.ok||createHash('sha1').update(b).digest('hex')!==sha1)throw Error('asset-integrity');return b;}
const lock=JSON.parse(readFileSync(resolve(root,'data/minecraft/26.3/source-lock.json'),'utf8')).officialSources.assetIndex,index=JSON.parse((await official(lock.url,lock.sha1)).toString());
/** Fetch an official sound-index entry. @param {string} key Asset key. @return {Promise<Buffer>} Original bytes. */
async function object(key:string):Promise<Buffer>{const o=index.objects[key];return official('https://resources.download.minecraft.net/'+o.hash.slice(0,2)+'/'+o.hash,o.hash);}
const sounds=JSON.parse((await object('minecraft/sounds.json')).toString()),events:Record<string,unknown>={},paths=new Set<string>();
/** Collect sound dependencies recursively. @param {string} id Native event. */
function event(id:string):void{if(events[id])return;const def=sounds[id];if(!def)throw Error(id);events[id]=def;for(const raw of def.sounds)if(typeof raw==='object'&&raw.type==='event')event(raw.name.replace('minecraft:',''));else paths.add('minecraft/sounds/'+(typeof raw==='string'?raw:raw.name).replace('minecraft:','')+'.ogg');}
for(const id of ['item.bucket.fill','item.bucket.empty','block.fire.extinguish','entity.generic.eat'])event(id);
await Promise.all([...paths].map(async path=>files.set('assets/'+path,await object(path))));
files.set('assets/minecraft/farm-interaction-sounds.json',Buffer.from(JSON.stringify(events,null,2)+'\n'));
const existing=new Set(readdirSync(out).filter(name=>name.endsWith('manifest.json')&&name!=='farm-interaction-manifest.json').flatMap(name=>JSON.parse(readFileSync(resolve(out,name),'utf8')).entries.map((e:{entry:string})=>e.entry)));
const entries=[...files].filter(([entry])=>!existing.has(entry)).map(([entry,b])=>{mkdirSync(dirname(resolve(out,entry)),{recursive:true});writeFileSync(resolve(out,entry),b);return {entry,size:b.length,sha256:hash(b)};});
/** Bytecode witnesses for interaction timing, food targeting, growth and water propagation. */
const classes=Object.fromEntries(['world/entity/animal/Animal','world/entity/AgeableMob','world/entity/animal/chicken/Chicken','world/entity/animal/cow/AbstractCow','world/entity/ai/goal/TemptGoal','world/entity/ai/goal/BreedGoal','world/item/BucketItem','world/item/Items','world/level/block/CampfireBlock','world/level/material/WaterFluid','world/level/material/FlowingFluid'].map(name=>{const entry='net/minecraft/'+name+'.class';return [entry,hash(jar.get(entry)!)];}));
writeFileSync(resolve(out,'farm-interaction-manifest.json'),JSON.stringify({version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',source:'bounded native farm interactions',classes,entries,inputs:Object.fromEntries([...files].map(([p,b])=>[p,hash(b)])),exporterSha256:hash(readFileSync(import.meta.filename,'utf8').replaceAll('\r\n','\n'))},null,2)+'\n');
