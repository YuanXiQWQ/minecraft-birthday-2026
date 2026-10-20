/** Synthetic independent fixtures test conversion and transport without distributing vanilla source data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { compileModel } from '../web/src/model-format.ts';
import { compileSamples } from '../web/src/vanilla-pack.ts';
import { alphaAt, animationAt, textureFrames } from '../web/src/vanilla-models.ts';
import { CLIENT_SHA1, localResourceMiddleware, readLocalSamples } from '../tools/local-resources.ts';
import { STONE_SAMPLE_CELL } from '../web/src/scene-adapter.ts';
import { fixture, placementError } from '../web/src/domain.ts';

test('S01 render-only stone sample cannot occupy a legal build cell',()=>{
  assert.equal(placementError(fixture(),STONE_SAMPLE_CELL),'outside-zone');
});

test('U01 explicit asymmetric UVs rotate with their quad and remain texture-relative',()=>{
  const model={textures:{a:'debug:asymmetric'},elements:[{from:[0,0,0] as [number,number,number],to:[16,16,16] as [number,number,number],faces:{south:{texture:'#a',uv:[2,3,10,14] as [number,number,number,number],rotation:90}}}]};
  const geometry=compileModel(model);
  assert.deepEqual(geometry.uvs,[10/16,1-14/16,10/16,1-3/16,2/16,1-3/16,2/16,1-14/16]);
  assert.throws(()=>compileModel(model,{model:'debug:test',y:45}),/unsupported/);
});
test('U02 model state loader rejects multipart and missing originals rather than substituting debug',()=>{
  assert.throws(()=>compileSamples(new Map()),/missing/);
  assert.throws(()=>compileSamples(new Map([['assets/minecraft/blockstates/stone.json',{multipart:[]}]])),/unsupported/);
});
test('A01 original-style animation duration, explicit frames and wrap are deterministic',()=>{
  const frames=textureFrames({width:2,height:6,rgba:new Uint8ClampedArray(48),sha256:'synthetic',animation:{frametime:10,interpolate:true}});
  assert.equal(frames.length,3);assert.deepEqual(animationAt(frames,250),{current:0,next:1,mix:.5});
  assert.deepEqual(animationAt(frames,550),{current:1,next:2,mix:.1});assert.deepEqual(animationAt(frames,1500),{current:0,next:1,mix:0});
  assert.throws(()=>textureFrames({width:2,height:6,rgba:new Uint8ClampedArray(),sha256:'synthetic'}),/metadata/);
  assert.throws(()=>textureFrames({width:2,height:4,rgba:new Uint8ClampedArray(),sha256:'synthetic',animation:{frames:[9]}}),/invalid/);
});
test('A02 nearest alpha sampling flips vertical UVs and clamps edge coordinates',()=>{
  const rgba=new Uint8ClampedArray(16);rgba[3]=0;rgba[7]=255;rgba[11]=255;rgba[15]=0;
  assert.equal(alphaAt(rgba,2,2,0,1),0);assert.equal(alphaAt(rgba,2,2,1,1),255);
  assert.equal(alphaAt(rgba,2,2,0,0),255);assert.equal(alphaAt(rgba,2,2,1,0),0);
});
test('L01 loopback sample transport rejects absent files, tampering, cross-origin and path escapes',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'mc-local-transport-')), path='assets/minecraft/models/debug.json', body=Buffer.from('{"synthetic":true}');
  mkdirSync(join(directory,'assets/minecraft/models'),{recursive:true});writeFileSync(join(directory,path),body);
  const manifest={version:'26.3',clientSha1:CLIENT_SHA1,textureBytesExported:true,textures:[],entries:[{entry:path,size:body.length,sha256:createHash('sha256').update(body).digest('hex')}]};
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
  const middleware=localResourceMiddleware(directory),server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}/__local_samples__/`;
  try {
    assert.equal((await fetch(base+'manifest.json')).status,200);assert.equal((await fetch(base+path)).status,200);
    assert.equal((await fetch(base+'client.jar')).status,404);assert.equal((await fetch(base+'manifest.json',{headers:{origin:'https://example.com'}})).status,403);
    const hostStatus=await new Promise<number|undefined>((resolve,reject)=>{
      const query=request(base+'manifest.json',{headers:{host:'external.example'}},response=>{response.resume();resolve(response.statusCode);});query.on('error',reject);query.end();
    });assert.equal(hostStatus,403);
    writeFileSync(join(directory,path),'tampered');assert.throws(()=>readLocalSamples(directory),/mismatch/);
    manifest.entries[0].entry='../secret.json';writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>readLocalSamples(directory),/invalid/);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));assert.ok(directory.startsWith(join(tmpdir(),'mc-local-transport-')));rmSync(directory,{recursive:true,force:true});}
});
test('L02 optional original sample integrity check is explicitly skipped without external resources',{skip:!process.env.MC_LOCAL_SAMPLES?'BLOCKED: MC_LOCAL_SAMPLES not configured; no vanilla pass claimed':false},()=>{
  const files=readLocalSamples(process.env.MC_LOCAL_SAMPLES!);const docs=new Map<string,object>();
  for(const [path,bytes] of files)if(path.endsWith('.json')&&path!=='manifest.json')docs.set(path,JSON.parse(new TextDecoder().decode(bytes)));
  assert.equal(compileSamples(docs).length,26);
  assert.equal(JSON.parse(readFileSync(join(process.env.MC_LOCAL_SAMPLES!,'manifest.json'),'utf8')).textures.length,16);
});
