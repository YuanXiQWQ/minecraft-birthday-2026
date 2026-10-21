/** Verified repository assets served identically by Vite development and emitted static builds. */
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import type {Plugin} from 'vite';
/** Shared versioned asset source; no private cache or environment variable is required. */
export const RESOURCE_ROOT=resolve(import.meta.dirname,'../../../resources/minecraft/26.3');
/** Published namespace stays below Vite's configured base, including GitHub Pages repository paths. */
export const RESOURCE_PREFIX='minecraft/26.3/';
/** Audit all listed bytes before starting the server or emitting a build.
 * @param {string} directory Versioned repository assets or an explicit integrity-test fixture.
 * @return {Map<string,Uint8Array>} Exact manifest and allowlisted source bodies.
 */
export function readVanillaResources(directory=RESOURCE_ROOT):Map<string,Uint8Array>{
  const root=realpathSync(directory),bytes=readFileSync(resolve(root,'manifest.json'));
  const manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(manifest.version!=='26.3'||manifest.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87'||!Array.isArray(manifest.entries))throw new Error('Invalid Java 26.3 resource manifest');
  const result=new Map<string,Uint8Array>([['manifest.json',bytes]]);
  for(const e of manifest.entries){
    if(!/^assets\/minecraft\/(?:(?:blockstates|models|textures|items|font|particles|sounds)\/[a-z0-9_/-]+\.(?:json|png|png\.mcmeta|ogg)|sounds\.json)$/.test(e.entry)||e.entry.includes('..')||result.has(e.entry))throw new Error('Invalid resource entry');
    const path=realpathSync(resolve(root,e.entry));if(!path.toLowerCase().startsWith((root+sep).toLowerCase()))throw new Error('Resource path escape');
    const body=readFileSync(path);if(body.length!==e.size||createHash('sha256').update(body).digest('hex')!==e.sha256)throw new Error('Resource integrity mismatch: '+e.entry);result.set(e.entry,body);
  }return result;
}
/** Include only audited runtime assets in both development and ordinary builds.
 * @return {Plugin} Base-aware static resource integration; development records remain excluded.
 */
export function vanillaResources():Plugin{
  const files=readVanillaResources();
  return {name:'verified-java-26.3-assets',
    /** Serve the same allowlisted namespace used by the static output.
     * @param {import('vite').ViteDevServer} server Vite development server.
     */
    configureServer(server){server.middlewares.use((req,res,next)=>{const prefix=server.config.base+RESOURCE_PREFIX,path=new URL(req.url??'/', 'http://vite.invalid').pathname;if(!path.startsWith(prefix)){next();return;}const name=path.slice(prefix.length),body=files.get(name);if(req.method!=='GET'||!body){res.statusCode=404;res.end('Vanilla resource not found');return;}res.setHeader('Content-Type',name.endsWith('.png')?'image/png':name.endsWith('.ogg')?'audio/ogg':'application/json');res.setHeader('Content-Length',body.length);res.end(body);});},
    /** Emit exact verified bytes instead of copying unrelated repository content. */
    generateBundle(){for(const [name,source]of files)this.emitFile({type:'asset',fileName:RESOURCE_PREFIX+name,source});}
  };
}
