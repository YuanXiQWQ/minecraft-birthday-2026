/** Opt-in loopback-only sample transport; original bytes never enter Vite's build graph. */
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/** The official client identity is fixed by P1; extraction verifies the actual JAR. */
export const CLIENT_SHA1='e877b6a07acd633fb3bb475002175cec036e7b87';
export interface Entry { entry: string; size: number; sha256: string }
export interface SampleManifest { version: string; clientSha1: string; textureBytesExported: boolean; entries: Entry[]; textures: {id:string;entry:string;size:number;sha256:string}[] }

/** Validate every whitelisted external file before serving any original bytes.
 * @param {string} directory Absolute external extraction directory.
 * @return {Map<string,Uint8Array>} Hash-verified response bodies, including the manifest.
 */
export function readLocalSamples(directory: string): Map<string,Uint8Array> {
  if(!isAbsolute(directory))throw new Error('sample-directory-must-be-absolute');
  const root=realpathSync(directory), repository=realpathSync(resolve(import.meta.dirname,'../../..'));
  if(root.toLowerCase()===repository.toLowerCase()||root.toLowerCase().startsWith((repository+sep).toLowerCase()))throw new Error('samples-must-stay-outside-repository');
  const bytes=readFileSync(resolve(root,'manifest.json'));
  const manifest:SampleManifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(manifest.version!=='26.3'||manifest.clientSha1!==CLIENT_SHA1||manifest.textureBytesExported!==true)throw new Error('wrong-or-incomplete-sample-manifest');
  const files=new Map<string,Uint8Array>([['manifest.json',bytes]]);
  for(const item of manifest.entries) {
    if(!/^assets\/minecraft\/(blockstates|models|textures|items|font)\/[a-z0-9_/-]+\.(json|png|png\.mcmeta)$/.test(item.entry)||item.entry.includes('..')||files.has(item.entry))throw new Error('invalid-sample-entry');
    const path=realpathSync(resolve(root,item.entry));
    if(!path.toLowerCase().startsWith((root+sep).toLowerCase()))throw new Error('sample-path-escape');
    const body=readFileSync(path);
    if(body.length!==item.size||createHash('sha256').update(body).digest('hex')!==item.sha256)throw new Error('sample-hash-mismatch');
    files.set(item.entry,body);
  }
  for(const texture of manifest.textures)if(!files.has(texture.entry)||createHash('sha256').update(files.get(texture.entry)!).digest('hex')!==texture.sha256)throw new Error('missing-texture');
  return files;
}

/** Return a bounded same-origin middleware; absent resources are an explicit unavailable response.
 * @param {string|undefined} directory Optional external cache, never a public directory.
 * @return {Function} Node HTTP middleware.
 */
export function localResourceMiddleware(directory?:string) {
  const files=directory?readLocalSamples(directory):null;
  return (request:IncomingMessage,response:ServerResponse,next:()=>void):void=>{
    const path=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    if(!path.startsWith('/__local_samples__/')){next();return;}
    const host=request.headers.host??'', origin=request.headers.origin;
    response.setHeader('Cache-Control','no-store'); response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)||(origin&&origin!==`http://${host}`)||request.headers['sec-fetch-site']==='cross-site') {
      response.statusCode=403;response.end('local-only');return;
    }
    const name=path.slice('/__local_samples__/'.length), body=files?.get(name);
    if(request.method!=='GET'||!body){response.statusCode=404;response.end('local-vanilla-samples-unavailable');return;}
    response.setHeader('Content-Type',name.endsWith('.png')?'image/png':'application/json');
    response.setHeader('Content-Length',body.length);response.end(body);
  };
}

/** Enable sample transport only for an explicitly configured local development server.
 * @param {string|undefined} directory External sample path supplied by the operator.
 * @return {Plugin} Development-only Vite plugin; no build or preview asset hook.
 */
export function localResources(directory?:string):Plugin {
  return {name:'local-only-vanilla-samples',apply:'serve',
    /** Attach the explicit sample allowlist to the loopback development server.
     * @param {import('vite').ViteDevServer} server Local Vite server.
     */
    configureServer(server){server.middlewares.use(localResourceMiddleware(directory));}};
}
