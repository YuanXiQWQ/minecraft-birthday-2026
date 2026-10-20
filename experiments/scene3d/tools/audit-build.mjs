/** Reject unexpected artifacts and verify the home entry does not import the heavy 3D game chunk. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

/** This auditor only accepts the two known experiment output directories. */
const name=process.argv[2]??'dist';
assert.ok(['dist','dist-subpath'].includes(name));
/** Resolved experiment build directory; no repository-root traversal is accepted. */
const root=resolve(import.meta.dirname,'..',name);
/** Bundled Three.js attribution must survive minification as a standalone static artifact. */
const licenses=readFileSync(resolve(root,'THIRD_PARTY_LICENSES.md'),'utf8');
assert.ok(licenses.includes('three.js authors')&&licenses.includes('Permission is hereby granted'));

/** Enumerate generated files for an auditable content allowlist.
 * @param {string} dir Absolute directory.
 * @return {string[]} Absolute files.
 */
function walk(dir) { return readdirSync(dir).flatMap(n=>{ const p=resolve(dir,n); return statSync(p).isDirectory()?walk(p):[p]; }); }

/** Compiled manifest is used for dependency-graph isolation, not for publishing development records. */
const manifest=JSON.parse(readFileSync(resolve(root,'.vite/manifest.json'),'utf8'));
/** Reachable home JavaScript chunks contain labels/entry utilities, never the game adapter. */
const visited=new Set();
/** Walk only explicit manifest imports of an entry.
 * @param {string} id Manifest chunk ID.
 */
function visit(id) { if(visited.has(id))return; visited.add(id); for(const child of manifest[id].imports??[])visit(child); }
visit('index.html');
const gameFile=manifest['game/index.html'].file;
assert.ok(![...visited].some(id=>manifest[id].file===gameFile));
const homeBytes=[...visited].reduce((n,id)=>n+statSync(resolve(root,manifest[id].file)).size,0);
assert.ok(homeBytes<25000,'home unexpectedly imports heavy game code');
const files=walk(root).map(path=>{
  const file=relative(root,path).replaceAll('\\','/'), body=readFileSync(path);
  assert.ok(file==='index.html'||file==='game/index.html'||file==='.vite/manifest.json'||file==='THIRD_PARTY_LICENSES.md'||/^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(file),`unexpected build artifact ${file}`);
  const text=body.toString('utf8');
  for(const forbidden of ['AGENTS.md','docs/context/','client.jar','server.jar','experiments/placement/','minecraft:block/','furnace_front','hopper_outside'])assert.ok(!text.includes(forbidden),`forbidden content ${forbidden} in ${file}`);
  return {file,bytes:body.length,gzipBytes:gzipSync(body).length,sha256:createHash('sha256').update(body).digest('hex')};
});
process.stdout.write(JSON.stringify({build:name,homeJsBytes:homeBytes,originalAssets:false,internalRecords:false,files},null,2)+'\n');
