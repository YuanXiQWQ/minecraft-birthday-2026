/** Real HTTP checks against Vite's built static preview, including the repository deployment prefix. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preview } from 'vite';

for(const [folder,prefix] of [['dist','/'],['dist-subpath','/minecraft-birthday-2026/']]) {
  test(`HTTP ${prefix} dual entries and emitted assets load; private inputs stay unavailable`,async()=>{
    const root=resolve(import.meta.dirname,'..'), server=await preview({configFile:resolve(root,'vite.config.ts'),
      base:prefix,build:{outDir:resolve(root,folder)},preview:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'silent'});
    const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
    try {
      for(const entry of ['','game/','game/index.html']) {
        const response=await fetch(origin+prefix+entry); assert.equal(response.status,200);
        const html=await response.text(); assert.ok(html.includes('type="module"'));
        assert.ok(!html.includes('docs/')); for(const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
          const url=new URL(match[1],origin+prefix+entry); assert.ok(url.pathname.startsWith(prefix)); assert.equal((await fetch(url)).status,200);
        }
      }
      const manifest=JSON.parse(readFileSync(resolve(root,folder,'.vite/manifest.json'),'utf8'));
      for(const chunk of Object.values(manifest)) { assert.equal((await fetch(origin+prefix+chunk.file)).status,200); }
      const license=await fetch(origin+prefix+'THIRD_PARTY_LICENSES.md'); assert.equal(license.status,200);
      assert.ok((await license.text()).includes('three.js authors'));
      for(const path of ['AGENTS.md','docs/project-proposal.md','client.jar','experiments/placement/ui.mjs','package.json','src/scene-adapter.ts']) {
        assert.equal((await fetch(origin+prefix+path)).status,404,`private path ${path}`);
      }
    } finally { server.httpServer.closeAllConnections(); await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve())); }
  });
}
