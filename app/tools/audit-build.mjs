/** Enforce formal build scope, original-resource integrity, entry separation and test-fixture exclusion. */
import assert from 'node:assert/strict';import {readFileSync,readdirSync,statSync} from 'node:fs';import {resolve,relative} from 'node:path';import {createHash} from 'node:crypto';import {resources,RESOURCE_PREFIX} from './resources.ts';
import {ruleData,RULE_PREFIX} from './rule-data.ts';
/** Only the two named formal output directories are accepted by this audit. */
const name=process.argv[2]??'dist';assert.ok(['dist','dist-pages'].includes(name));
/** Explicit web-only output, never the repository root. */
const root=resolve(import.meta.dirname,'..',name),originals=resources();
/** Generated runtime facts are audited separately from original resource bytes. */
const generated=ruleData();
/** Enumerate static output files without following arbitrary input roots.
 * @param {string} dir Output directory.
 * @return {string[]} Generated file paths.
 */
function walk(dir){return readdirSync(dir).flatMap(n=>{const p=resolve(dir,n);return statSync(p).isDirectory()?walk(p):[p];});}
/** Audit entry chunks as separate HTML routes even though both share renderer, localization and persistence primitives. */
const manifest=JSON.parse(readFileSync(resolve(root,'.vite/manifest.json'),'utf8'));assert.ok(manifest['index.html']&&manifest['game/index.html']);assert.notEqual(manifest['index.html'].file,manifest['game/index.html'].file);
/** Inventory is emitted as test output, not as a developer record copied into the site. */
const files=walk(root).map(p=>{const file=relative(root,p).replaceAll('\\','/'),bytes=readFileSync(p);if(file.startsWith(RESOURCE_PREFIX)){const source=originals.get(file.slice(RESOURCE_PREFIX.length));assert.ok(source,file);assert.deepEqual(bytes,Buffer.from(source));}else if(file.startsWith(RULE_PREFIX)){assert.deepEqual(bytes,generated.get(file.slice(RULE_PREFIX.length)));}else{assert.ok(['index.html','game/index.html','.vite/manifest.json','THIRD_PARTY_LICENSES.md'].includes(file)||/^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(file),file);const text=bytes.toString();for(const denied of ['experiments/','AGENTS.md','docs/context/','client.jar','SlotExperiment','Fixture: place cake','P3_TEST_ONLY','P7_TEST_ONLY','__verify__/','MC_LOCAL_SAMPLES','F:/JerryCode/','AppData/Local/Temp'])assert.ok(!text.includes(denied),denied+' in '+file);}return{file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
assert.equal(files.filter(f=>f.file.startsWith(RESOURCE_PREFIX)).length,originals.size);assert.equal(files.filter(f=>f.file.startsWith(RULE_PREFIX)).length,generated.size);assert.ok(readFileSync(resolve(root,'THIRD_PARTY_LICENSES.md'),'utf8').includes('three.js authors'));process.stdout.write(JSON.stringify({build:name,originalFiles:originals.size,ruleFiles:generated.size,internalRecords:false,testFixture:false,files},null,2)+'\n');
