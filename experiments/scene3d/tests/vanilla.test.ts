/** Synthetic independent fixtures test conversion and transport without distributing vanilla source data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compileModel } from '../web/src/model-format.ts';
import { compileSamples } from '../web/src/vanilla-pack.ts';
import { alphaAt, animationAt, textureFrames } from '../web/src/vanilla-models.ts';
import { readVanillaResources } from '../tools/vanilla-resources.ts';
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
test('L01 resource reader rejects missing files, tampering and path escapes',()=>{
  const directory=mkdtempSync(join(tmpdir(),'mc-resource-check-')), path='assets/minecraft/models/debug.json', body=Buffer.from('{"synthetic":true}');
  mkdirSync(join(directory,'assets/minecraft/models'),{recursive:true});writeFileSync(join(directory,path),body);
  const manifest={version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',entries:[{entry:path,size:body.length,sha256:createHash('sha256').update(body).digest('hex')}]};
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
  try {assert.equal(readVanillaResources(directory).size,2);writeFileSync(join(directory,path),'tampered');assert.throws(()=>readVanillaResources(directory),/mismatch/);
    manifest.entries[0].entry='../secret.json';writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>readVanillaResources(directory),/Invalid/);
    manifest.entries[0].entry='assets/minecraft/models/missing.json';writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>readVanillaResources(directory),/ENOENT/);
  }finally{assert.ok(directory.startsWith(join(tmpdir(),'mc-resource-check-')));rmSync(directory,{recursive:true,force:true});}
});

test('L02 committed originals are complete without an external environment variable',()=>{
  const files=readVanillaResources(),docs=new Map<string,object>();for(const [path,bytes]of files)if(path.endsWith('.json')&&path!=='manifest.json')docs.set(path,JSON.parse(new TextDecoder().decode(bytes)));
  assert.equal(compileSamples(docs).length,26);const manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));assert.equal(manifest.textures.length,16);assert.equal(files.size,96);
});
