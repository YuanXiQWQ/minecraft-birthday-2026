/** Normal builds serve the bounded generated rules, while full extraction evidence and coverage stay outside web output. */
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';import type {Plugin} from 'vite';
/** Stable public namespace follows Vite's root or repository base. */
export const RULE_PREFIX='rules/minecraft/26.3/';
/** Verify normalized data against its reproducible export manifest before exposing any runtime bytes.
 * @return {Map<string,Buffer>} Runtime data and its small audit manifest.
 */
export function ruleData():Map<string,Buffer>{const root=resolve(import.meta.dirname,'../../data/minecraft/26.3'),manifest=readFileSync(resolve(root,'runtime-manifest.json')),m=JSON.parse(manifest.toString()),files=new Map([['manifest.json',manifest]]);if(m.version!=='26.3'||m.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87'||m.files.length!==1||m.files[0].file!=='rules.json')throw new Error('invalid-rule-manifest');for(const entry of m.files){const bytes=readFileSync(resolve(root,entry.file));if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('rule-integrity');files.set(entry.file,bytes);}const registry=readFileSync(resolve(import.meta.dirname,'../web/src/data/registry.json'));if(createHash('sha256').update(registry).digest('hex')!==m.registrySha256)throw new Error('registry-integrity');return files;}
/** Integrate the same validated subset into ordinary dev/build/preview.
 * @return {Plugin} Base-aware generated-rule adapter.
 */
export function rulePlugin():Plugin{const files=ruleData();return{name:'vanilla-26.3-rules',
 /** Serve only explicit runtime files.
  * @param {import('vite').ViteDevServer} server Vite server.
  */
 configureServer(server){server.middlewares.use((req,res,next)=>{const prefix=server.config.base+RULE_PREFIX,path=new URL(req.url??'/','http://vite.invalid').pathname;if(!path.startsWith(prefix)){next();return;}const bytes=files.get(path.slice(prefix.length));if(!bytes||req.method!=='GET'){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','application/json');res.end(bytes);});},
 /** Emit normalized rules without exposing the full catalog or internal coverage report. */
 generateBundle(){for(const [name,source]of files)this.emitFile({type:'asset',fileName:RULE_PREFIX+name,source});}};}
