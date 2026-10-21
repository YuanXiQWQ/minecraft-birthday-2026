/** Browser fault injection exercises the ordinary resource verifier and native image decoder without changing assets. */
import {loadVanillaPack} from './vanilla-pack.ts';
import {VANILLA_RESOURCE_BASE} from './resource-url.ts';

/** Reject missing, corrupt and undecodable resources through the same adapter used by normal startup.
 * @return {Promise<object>} Explicit per-case failures, successful rejection and unchanged ordinary resource availability.
 */
export async function resourceFailureChecks():Promise<object>{
  const rows:object[]=[];
  for(const mode of ['missing','hash','decode','uvlock']){
    const target='assets/minecraft/textures/block/stone.png',state='assets/minecraft/blockstates/stone.json';
    const broken=new Uint8Array([0,1,2,3]),unsupported=new TextEncoder().encode(JSON.stringify({variants:{'':{model:'minecraft:block/stone',uvlock:true}}}));
    const bytes=mode==='uvlock'?unsupported:broken;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    const transport:typeof fetch=async(input,init)=>{
      const url=String(input);
      if(url.endsWith('manifest.json')){
        if(mode==='missing')return new Response('injected missing manifest',{status:404});
        const response=await fetch(input,init),manifest=await response.json();
        if(mode==='decode'||mode==='uvlock'){const entry=manifest.entries.find((e:{entry:string})=>e.entry===(mode==='uvlock'?state:target));entry.size=bytes.length;entry.sha256=digest;}
        return Response.json(manifest);
      }
      if(url===VANILLA_RESOURCE_BASE+(mode==='uvlock'?state:target))return new Response(bytes);
      return fetch(input,init);
    };
    try{await loadVanillaPack(transport);rows.push({mode,passed:false,error:'invalid resource accepted'});}
    catch(error){const reason=String(error),expected=mode==='missing'?'vanilla-manifest-request-failed':mode==='hash'?'sample-hash-mismatch':mode==='uvlock'?'unsupported-model-or-uvlock':'source image';rows.push({mode,passed:reason.toLowerCase().includes(expected),reason});}
  }
  const normal=await loadVanillaPack();return{scope:'injected HTTP bodies; real verifier, compiler and browser PNG decoder',rows,normal:{states:normal.samples.length,textures:normal.images.size}};
}
