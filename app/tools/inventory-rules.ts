/** Generate the small synchronous carrier-policy projection from committed, version-checked P4 runtime rules. */
import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
/** Rule manifest and generated policy have stable repository-relative locations, with no client/cache dependency. */
const root=resolve(import.meta.dirname,'../..'),source=readFileSync(resolve(root,'data/minecraft/26.3/rules.json')),manifest=JSON.parse(readFileSync(resolve(root,'data/minecraft/26.3/runtime-manifest.json'),'utf8'));
/** Native rule identity is verified before selecting per-item temporary stack/equipment constraints. */
const rules=JSON.parse(source.toString()),target=resolve(root,'app/web/src/data/inventory-rules.json');
if(manifest.version!=='26.3'||manifest.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87')throw Error('inventory-rule-version');
if(!manifest.files.some((f:any)=>f.file==='rules.json'&&f.bytes===source.length&&f.sha256===createHash('sha256').update(source).digest('hex')))throw Error('inventory-source-integrity');
/** Keep only fields required synchronously during locked domain validation. */
const output=JSON.stringify({items:Object.fromEntries(Object.entries(rules.items).map(([id,r]:[string,any])=>[id,{maxStack:r.maxStack,...(r.maxDamage?{maxDamage:r.maxDamage}:{}),...(r.equipment?{equipment:r.equipment}:{})}]))},null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(target,'utf8').replaceAll('\r\n','\n')!==output)throw Error('inventory-rule-projection');}else writeFileSync(target,output);
console.log(JSON.stringify({items:Object.keys(rules.items).length,sourceSha256:createHash('sha256').update(source).digest('hex'),outputSha256:createHash('sha256').update(output).digest('hex')}));
