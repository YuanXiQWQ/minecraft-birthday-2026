/** Local-only, hash-verified model/texture loading; no source assets are embedded in this module. */
import { compileModel, resolveModel } from './model-format.ts';
import type { CompiledModel, ModelSource, Variant } from './model-format.ts';

/** Only the five user-authorized block families are exposed by the sample gallery. */
export const SAMPLE_BLOCKS=['stone','furnace','hopper','crafting_table','blast_furnace'] as const;
export interface Sample { id:string; block:string; state:string; variant:Variant; compiled:CompiledModel }
export interface Pixels { width:number; height:number; rgba:Uint8ClampedArray; animation?:{frametime?:number;interpolate?:boolean;frames?:(number|{index:number;time?:number})[]}; sha256:string }
export interface VanillaPack { samples:Sample[]; images:Map<string,Pixels>; loading:object }
interface Entry {entry:string;size:number;sha256:string}

/** Expand every variant explicitly; multipart and unsupported geometry fail instead of approximating.
 * @param {Map<string,object>} documents Parsed externally supplied JSON documents.
 * @return {Sample[]} Compiled states retaining their exact source rotations.
 */
export function compileSamples(documents:Map<string,object>):Sample[] {
  const samples:Sample[]=[];
  for(const block of SAMPLE_BLOCKS) {
    const state=documents.get(`assets/minecraft/blockstates/${block}.json`) as {variants?:Record<string,Variant|Variant[]>;multipart?:unknown};
    if(!state?.variants||state.multipart)throw new Error('unsupported-or-missing-blockstates');
    for(const [key,raw] of Object.entries(state.variants))for(const [index,variant] of (Array.isArray(raw)?raw:[raw]).entries()) {
      const model=resolveModel(variant.model,id=>{
        const [namespace,path]=id.split(':');const source=documents.get(`assets/${namespace}/models/${path}.json`);
        if(!source)throw new Error('missing-model-dependency');return source as ModelSource;
      });
      samples.push({id:`${block}/${key}/${index}`,block,state:key,variant,compiled:compileModel(model,variant)});
    }
  }
  return samples;
}

/** Fetch, verify, decode and inventory the externally configured local samples atomically.
 * @return {Promise<VanillaPack>} Complete local pack; missing resources reject without a debug success fallback.
 */
export async function loadVanillaPack():Promise<VanillaPack> {
  const start=performance.now(), base='/__local_samples__/';
  const response=await fetch(base+'manifest.json',{cache:'no-store'});
  if(!response.ok)throw new Error('local-vanilla-samples-unavailable');
  const manifest=await response.json() as {version:string;clientSha1:string;textureBytesExported:boolean;entries:Entry[];textures:{id:string;entry:string}[];gui?:{entries:string[]};celebration?:{entries:string[]}};
  if(manifest.version!=='26.3'||manifest.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87'||!manifest.textureBytesExported)throw new Error('wrong-or-incomplete-sample-manifest');
  const bodies=new Map<string,ArrayBuffer>(), requests:{path:string;bytes:number;ms:number;sha256:string}[]=[];
  await Promise.all(manifest.entries.filter(entry=>!manifest.gui?.entries.includes(entry.entry)&&!manifest.celebration?.entries.includes(entry.entry)).map(async entry=>{
    if(!/^assets\/minecraft\/(blockstates|models|textures)\/[a-z0-9_/-]+\.(json|png|png\.mcmeta)$/.test(entry.entry)||entry.entry.includes('..'))throw new Error('invalid-sample-entry');
    const tick=performance.now(), resource=await fetch(base+entry.entry,{cache:'no-store'});
    if(!resource.ok)throw new Error('sample-request-failed');const bytes=await resource.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==entry.size||hash!==entry.sha256)throw new Error('sample-hash-mismatch');
    bodies.set(entry.entry,bytes);requests.push({path:entry.entry,bytes:bytes.byteLength,ms:performance.now()-tick,sha256:hash});
  }));
  const documents=new Map<string,object>();
  for(const [path,body] of bodies)if(!path.endsWith('.png'))documents.set(path,JSON.parse(new TextDecoder().decode(body)));
  const samples=compileSamples(documents), images=new Map<string,Pixels>();
  for(const item of manifest.textures) {
    const body=bodies.get(item.entry);if(!body)throw new Error('missing-texture');
    const bitmap=await createImageBitmap(new Blob([body],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(bitmap,0,0);bitmap.close();
    const metadata=documents.get(item.entry+'.mcmeta') as {animation?:Pixels['animation']}|undefined;
    images.set(item.id,{width:canvas.width,height:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data,
      animation:metadata?.animation,sha256:manifest.entries.find(e=>e.entry===item.entry)!.sha256});
  }
  for(const sample of samples)for(const id of sample.compiled.textures)if(!images.has(id))throw new Error('missing-texture');
  return {samples,images,loading:{version:manifest.version,clientSha1:manifest.clientSha1,source:'external loopback cache; no distribution permission inferred',
    elapsedMs:performance.now()-start,bytes:requests.reduce((n,r)=>n+r.bytes,0),requests,modelStates:samples.length,textures:images.size,
    imageInfo:[...images].map(([id,image])=>({id,width:image.width,height:image.height,alphaZero:image.rgba.filter((v,i)=>i%4===3&&v===0).length,alphaPartial:image.rgba.filter((v,i)=>i%4===3&&v>0&&v<255).length}))}};
}
