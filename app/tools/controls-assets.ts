/** Export native reachable block states and first-person HUD dependencies from the hash-locked client. */
import {readClient} from './vanilla/zip.ts';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {resourceId,resolveModel,resolveTexture} from '../web/src/render/model-format.ts';
/** Exact official source, ordinary tracked output, and reachable finite catalogue. */
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'resources/minecraft/26.3'),jar=readClient(process.argv[2]),files=new Map<string,Buffer>(),ids:string[]=JSON.parse(readFileSync(resolve(root,'app/web/src/data/registry.json'),'utf8'));
/** Digest exact bytes. @param {Uint8Array|string} bytes Source data. @return {string} SHA256. */
function hash(bytes:Uint8Array|string):string{return createHash('sha256').update(bytes).digest('hex');}
/** Retain exact archive entry. @param {string} path Archive key. @return {Buffer} Native bytes. */
function take(path:string):Buffer{const b=jar.get(path);if(!b)throw Error('missing-controls-asset:'+path);files.set(path,b);return b;}
/** Resolve model inheritance and texture references. @param {string} id Native model. @return {any} Model document. */
function model(id:string):any{const p='assets/minecraft/models/'+resourceId(id).split(':')[1]+'.json',m=JSON.parse(take(p).toString());if(m.parent&&!m.parent.includes('builtin/'))model(m.parent);return m;}
/** Preserve native pixels and optional animation metadata. @param {string} id Texture reference. */
function texture(id:string):void{const p='assets/minecraft/textures/'+resourceId(id).split(':')[1]+'.png';take(p);if(jar.has(p+'.mcmeta'))take(p+'.mcmeta');}
const blocks=ids.map(id=>id.split(':')[1]).filter(id=>id!=='wheat'&&jar.has('assets/minecraft/blockstates/'+id+'.json'));
for(const block of [...blocks,'wall_torch','oak_wall_sign']){
    const d=JSON.parse(take('assets/minecraft/blockstates/'+block+'.json').toString()),variants=d.variants?Object.values(d.variants):d.multipart.map((p:any)=>p.apply);
    for(const v of variants.flat() as any[]){const m=resolveModel(v.model,model);for(const t of Object.values(m.textures??{}) as string[])texture(resolveTexture(t,m.textures??{}));}
    const loot='data/minecraft/loot_table/blocks/'+block+'.json';if(jar.has(loot))take(loot);
}
for(const id of ['entity/chest/normal','entity/chest/trapped'])texture(id);
for(const id of ['crosshair_attack_indicator_background','crosshair_attack_indicator_progress','crosshair_attack_indicator_full'])texture('gui/sprites/hud/'+id);
for(const id of ['mineable/axe','mineable/pickaxe','mineable/shovel','mineable/hoe'])take('data/minecraft/tags/block/'+id+'.json');
/** Fetch one locked official asset object. @param {string} url Source URL. @param {string} sha1 Expected SHA1. @return {Promise<Buffer>} Verified bytes. */
async function official(url:string,sha1:string):Promise<Buffer>{const r=await fetch(url);if(!r.ok)throw Error('native-asset:'+r.status);const b=Buffer.from(await r.arrayBuffer());if(createHash('sha1').update(b).digest('hex')!==sha1)throw Error('native-asset-integrity');return b;}
const lock=JSON.parse(readFileSync(resolve(root,'docs/p1/evidence-lock.json'),'utf8')).officialSources.assetIndex,index=JSON.parse((await official(lock.url,lock.sha1)).toString());
/** Fetch an exact asset-index entry. @param {string} key Logical key. @return {Promise<Buffer>} Original bytes. */
async function object(key:string):Promise<Buffer>{const o=index.objects[key];if(!o)throw Error('native-asset-key:'+key);return official('https://resources.download.minecraft.net/'+o.hash.slice(0,2)+'/'+o.hash,o.hash);}
const soundSource=await object('minecraft/sounds.json'),sounds=JSON.parse(soundSource.toString()),soundEvents:Record<string,any>={},soundPaths=new Set<string>(),properties=JSON.parse(readFileSync(resolve(root,'app/web/src/data/block-properties.json'),'utf8'));
/** Preserve original event references recursively. @param {string} id Sound event. */
function event(id:string):void{if(soundEvents[id])return;const def=sounds[id];if(!def)throw Error('native-event:'+id);soundEvents[id]=def;for(const raw of def.sounds){if(typeof raw==='object'&&raw.type==='event')event(raw.name.replace('minecraft:',''));else soundPaths.add('minecraft/sounds/'+(typeof raw==='string'?raw:raw.name).replace('minecraft:','')+'.ogg');}}
for(const family of new Set([...Object.values(properties).map((p:any)=>p.sound),'gravel']))for(const action of ['hit','break','place','step','fall'])event('block.'+family+'.'+action);
await Promise.all([...soundPaths].map(async p=>files.set('assets/'+p,await object(p))));files.set('assets/minecraft/controls-sounds.json',Buffer.from(JSON.stringify(soundEvents,null,2)+'\n'));
const loots=Object.fromEntries(blocks.map(b=>[b,JSON.parse(jar.get('data/minecraft/loot_table/blocks/'+b+'.json')!.toString())]));writeFileSync(resolve(root,'app/web/src/data/placed-loot.json'),JSON.stringify(loots,null,2)+'\n');
/** Expand native mineable tags. @param {string} id Block tag. @return {string[]} Native members. */
function tag(id:string):string[]{return JSON.parse(jar.get('data/minecraft/tags/block/'+id+'.json')!.toString()).values.flatMap((v:string)=>v.startsWith('#')?tag(v.split(':')[1]):[v]);}
writeFileSync(resolve(root,'app/web/src/data/mining-tags.json'),JSON.stringify(Object.fromEntries(['axe','pickaxe','shovel','hoe'].map(role=>[role,tag('mineable/'+role)])),null,2)+'\n');
const existing=new Set<string>();for(const name of ['manifest','presentation-manifest','catalogue-manifest','player-manifest','book-manifest','experience-manifest','world-manifest','interaction-manifest','interface-manifest','environment-manifest','ambience-manifest','startup-manifest','advancement-manifest'])for(const e of JSON.parse(readFileSync(resolve(out,name+'.json'),'utf8')).entries)existing.add(e.entry);
const entries=[...files].filter(([p])=>!existing.has(p)).sort(([a],[b])=>a.localeCompare(b)).map(([entry,b])=>{mkdirSync(dirname(resolve(out,entry)),{recursive:true});writeFileSync(resolve(out,entry),b);return {entry,size:b.length,sha256:hash(b)};});
const classes=['client/player/FirstPersonHandsAndItems','client/renderer/FirstPersonHandsAndItemsRenderer','client/model/effects/SpearAnimations','client/multiplayer/ClientLevel','world/entity/player/Player','world/entity/LivingEntity','world/entity/ai/attributes/Attributes','world/item/Items','world/item/Item$Properties','world/item/BlockItem','world/level/block/Blocks','world/level/block/BarrierBlock','world/level/block/SlabBlock','world/level/block/StairBlock','world/level/block/DoorBlock','world/level/block/TrapDoorBlock','world/level/block/AbstractBedBlock','world/level/block/LadderBlock','world/level/block/LanternBlock','world/level/block/HopperBlock','world/level/block/SoundType','client/gui/Hud','client/renderer/LevelRenderer'];
writeFileSync(resolve(out,'controls-manifest.json'),JSON.stringify({version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',source:'bounded native controls and reachable block placement',blocks,assetIndex:lock,soundsSha256:hash(soundSource),propertiesSha256:hash(readFileSync(resolve(root,'app/web/src/data/block-properties.json'),'utf8').replaceAll('\r\n','\n')),inputs:Object.fromEntries([...files].map(([p,b])=>[p,hash(b)])),entries,classes:Object.fromEntries(classes.map(p=>['net/minecraft/'+p+'.class',hash(jar.get('net/minecraft/'+p+'.class')!)])),exporterSha256:hash(readFileSync(import.meta.filename,'utf8').replaceAll('\r\n','\n'))},null,2)+'\n');
writeFileSync(resolve(root,'app/web/src/data/placeable-blocks.json'),JSON.stringify(blocks,null,2)+'\n');
console.log({blocks:blocks.length,entries:entries.length});
