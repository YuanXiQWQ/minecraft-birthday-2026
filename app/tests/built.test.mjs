/** Real HTTP root and Pages-subpath checks run against normal static outputs, not the verification server. */
import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {preview} from 'vite';import {resources,RESOURCE_PREFIX} from '../tools/resources.ts';
for(const [folder,base]of [['dist','/'],['dist-pages','/minecraft-birthday-2026/']])test('formal HTTP '+base+' has both entries, original bytes and no internal/test routes',async()=>{
  const root=resolve(import.meta.dirname,'..'),server=await preview({configFile:resolve(root,'vite.config.ts'),base,build:{outDir:resolve(root,folder)},preview:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'silent'}),origin='http://127.0.0.1:'+server.httpServer.address().port;
  try{for(const entry of ['','game/','game/index.html']){const r=await fetch(origin+base+entry);assert.equal(r.status,200);const html=await r.text();assert.ok(!html.includes('__EN_'));for(const ref of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)){const url=new URL(ref[1],origin+base+entry);assert.ok(url.pathname.startsWith(base));assert.equal((await fetch(url)).status,200);}}
    for(const [name,body]of resources()){const r=await fetch(origin+base+RESOURCE_PREFIX+name);assert.equal(r.status,200,name);assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.from(body));}
    for(const path of ['AGENTS.md','docs/project-proposal.md','experiments/scene3d/web/index.html','tests/browser-fixture.ts','__verify__/index.html','client.jar','package.json'])assert.equal((await fetch(origin+base+path)).status,404,path);
  }finally{server.httpServer.closeAllConnections();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
});
