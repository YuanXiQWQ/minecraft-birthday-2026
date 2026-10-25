/** Public Java profiles share one bounded lookup/texture cache across settings, inventory and world rendering. */
import {fetchManifest,RESOURCE_BASE} from '../render/resource-fetch.ts';

export interface PlayerProfile {name:string;id:string;slim:boolean;skin:string;cape?:string}
export interface PlayerAppearance {profile:PlayerProfile;skin:HTMLCanvasElement;cape?:HTMLCanvasElement}
/** Successful lookups are reused for ten minutes; failed requests never poison the cache. */
const cache=new Map<string,{at:number;value:Promise<PlayerAppearance>}>();
/** Immutable bundled default remains available without third-party services. */
let bundled:Promise<PlayerAppearance>|undefined;

/** Accept only Mojang's immutable texture origin, upgrading its legacy HTTP URLs.
 * @param {unknown} value Profile texture URL.
 * @return {string} HTTPS URL restricted to Minecraft's texture CDN.
 */
export function textureUrl(value:unknown):string{if(typeof value!=='string'||!/^https?:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]{32,64}$/.test(value))throw Error('profile-invalid');return value.replace('http:','https:');}
/** Resolve the exact current Java account, never another player's similarly spelled or historical name.
 * @param {any} data PlayerDB response containing the original textures property.
 * @param {string} query Requested name, case insensitive.
 * @return {PlayerProfile} Validated current skin/cape and model width.
 */
export function parseProfile(data:any,query:string):PlayerProfile{
    const p=data?.data?.player;
    if(!data?.success||!p)throw Error('profile-not-found');
    if(typeof p.username!=='string'||p.username.toLowerCase()!==query.toLowerCase()||!/^\w{3,16}$/.test(p.username))throw Error('profile-not-found');
    const id=String(p.raw_id??p.id).replaceAll('-','');if(!/^[a-f0-9]{32}$/i.test(id))throw Error('profile-invalid');
    const property=p.properties?.find((p:any)=>p.name==='textures');
    const original=JSON.parse(atob(property?.value??''));
    if(original.profileId?.replaceAll('-','').toLowerCase()!==id.toLowerCase())throw Error('profile-invalid');
    const textures=original.textures;
    return{name:p.username,id,slim:textures?.SKIN?.metadata?.model==='slim',skin:textureUrl(textures?.SKIN?.url),...(textures?.CAPE?{cape:textureUrl(textures.CAPE.url)}:{})};
}
/** Decode an atlas and normalize old 64x32 skins using the native mirrored limb layout.
 * @param {ArrayBuffer} bytes PNG bytes.
 * @param {boolean} cape Whether the atlas is a cape.
 * @return {Promise<HTMLCanvasElement>} Nearest-sampled normalized pixels.
 */
export async function decodeSkin(bytes:ArrayBuffer,cape=false):Promise<HTMLCanvasElement>{
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    try{
        if(bitmap.width!==64||![32,64].includes(bitmap.height)||cape&&bitmap.height!==32)throw Error('profile-texture-size');
        const c=document.createElement('canvas');c.width=64;c.height=cape?32:64;
        const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,0,0);
        if(!cape&&bitmap.height===32){
            // Native legacy skin upload mirrors each face independently into the left limbs.
            for(const [sx,sy,w,h,dx,dy] of [[4,16,4,4,20,48],[8,16,4,4,24,48],[8,20,4,12,16,52],[4,20,4,12,20,52],[0,20,4,12,24,52],[12,20,4,12,28,52],[44,16,4,4,36,48],[48,16,4,4,40,48],[48,20,4,12,32,52],[44,20,4,12,36,52],[40,20,4,12,40,52],[52,20,4,12,44,52]]){ctx.save();ctx.translate(dx+w,dy);ctx.scale(-1,1);ctx.drawImage(bitmap,sx,sy,w,h,0,0,w,h);ctx.restore();}
            const p=ctx.getImageData(32,0,32,32);if(!p.data.some((n,i)=>i%4===3&&n<128))ctx.clearRect(32,0,32,32);
        }
        if(!cape)for(const [x,y,w,h] of [[0,0,32,16],[0,16,64,16],[16,48,32,16]]){const p=ctx.getImageData(x,y,w,h);for(let i=3;i<p.data.length;i+=4)p.data[i]=255;ctx.putImageData(p,x,y);}
        return c;
    }finally{bitmap.close();}
}
/** Read an atlas with bounded size/time and optional source integrity enforcement.
 * @param {string} url HTTPS CDN or bundled resource URL.
 * @param {boolean} cape Cape atlas flag.
 * @param {{size:number;sha256:string}} expected Bundled source integrity.
 * @return {Promise<HTMLCanvasElement>} Decoded validated atlas.
 */
async function atlas(url:string,cape=false,expected?:{size:number;sha256:string}):Promise<HTMLCanvasElement>{
    const r=await fetch(url,{signal:AbortSignal.timeout(12000),credentials:'omit'});if(!r.ok)throw Error('profile-unavailable');
    const bytes=await r.arrayBuffer();if(bytes.byteLength>1024*1024)throw Error('profile-texture-size');
    if(expected){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==expected.size||hash!==expected.sha256)throw Error('profile-integrity');}
    return decodeSkin(bytes,cape);
}
/** Load the hash-verified sireoh snapshot from the current deployment base.
 * @return {Promise<PlayerAppearance>} Bundled real default skin and cape.
 */
export function defaultAppearance():Promise<PlayerAppearance>{
    return bundled??= (async()=>{const r=await fetchManifest('profile-manifest.json');if(!r.ok)throw Error('profile-resource');const m=await r.json();if(m.version!=='26.3'||m.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87')throw Error('profile-version');
        const skin=m.entries.find((e:any)=>e.kind==='SKIN'),cape=m.entries.find((e:any)=>e.kind==='CAPE');
        for(const e of [skin,cape].filter(Boolean))if(!/^assets\/jerrys_farm\/textures\/player\/[a-f0-9]+\.png$/.test(e.entry))throw Error('profile-resource');
        const [s,c]=await Promise.all([atlas(RESOURCE_BASE+skin.entry,false,skin),cape?atlas(RESOURCE_BASE+cape.entry,true,cape):undefined]);
        return{profile:{...m.profile,skin:skin.source,...(cape?{cape:cape.source}:{})},skin:s,...(c?{cape:c}:{})};
    })().catch(e=>{bundled=undefined;throw e;});
}
/** Fetch one exact profile; debounce and stale-result ownership belong to the requesting view.
 * @param {string} name Current username.
 * @return {Promise<PlayerAppearance>} Complete skin/cape pair for atomic display.
 */
export function lookupAppearance(name:string):Promise<PlayerAppearance>{
    if(!/^[A-Za-z0-9_]{3,16}$/.test(name))return Promise.reject(Error('profile-not-found'));
    const key=name.toLowerCase(),existing=cache.get(key);if(existing&&Date.now()-existing.at<600000)return existing.value;
    const value=(async()=>{try{const r=await fetch('https://playerdb.co/api/player/minecraft/'+encodeURIComponent(name),{signal:AbortSignal.timeout(12000),credentials:'omit'});if(!r.ok)throw Error(r.status===404||r.status===400?'profile-not-found':'profile-unavailable');const p=parseProfile(await r.json(),name);
        const [skin,cape]=await Promise.all([atlas(p.skin),p.cape?atlas(p.cape,true):undefined]);return{profile:p,skin,...(cape?{cape}:{})};
        }catch(e){if(key==='sireoh')return defaultAppearance();throw e;}})();
    cache.set(key,{at:Date.now(),value});while(cache.size>16)cache.delete(cache.keys().next().value!);
    void value.catch(()=>{if(cache.get(key)?.value===value)cache.delete(key);});return value;
}
