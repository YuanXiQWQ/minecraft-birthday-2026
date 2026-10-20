/** Offline geometry feasibility on externally extracted Java 26.3 samples; never emits source/model bytes. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from 'three';
import { compileModel, resolveModel } from '../web/src/model-format.ts';
import type { CompiledModel, ModelSource, Variant } from '../web/src/model-format.ts';

/** External extraction directory is mandatory; there is no bundled vanilla fixture fallback. */
const directory = process.argv[2];
if (!directory) throw new Error('Pass an external analysis directory created by extract-model-samples.ps1');
/** Source manifest contains hashes and dependency checks, not a permission to publish the samples. */
const manifest = JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'));
assert.equal(manifest.clientSha1,'e877b6a07acd633fb3bb475002175cec036e7b87');
for (const entry of manifest.entries) assert.equal(createHash('sha256').update(readFileSync(resolve(directory,entry.entry))).digest('hex'),entry.sha256);

/** Read one external model by normalized resource identifier.
 * @param {string} id Namespaced model reference.
 * @return {ModelSource} Original parsed model, retained outside the repository.
 */
function load(id: string): ModelSource { const [namespace,path]=id.split(':'); return JSON.parse(readFileSync(resolve(directory,`assets/${namespace}/models/${path}.json`),'utf8')); }

/** Instantiate converted geometry for CPU-side ray feasibility, not textured browser validation.
 * @param {CompiledModel} model Compiled sample.
 * @return {BufferGeometry} Owned indexed geometry.
 */
function geometry(model: CompiledModel): BufferGeometry {
  const g=new BufferGeometry(); g.setAttribute('position',new Float32BufferAttribute(model.positions,3));
  g.setAttribute('normal',new Float32BufferAttribute(model.normals,3)); g.setAttribute('uv',new Float32BufferAttribute(model.uvs,2)); g.setIndex(model.indices); g.computeBoundingBox(); return g;
}

/** Only counts, source hashes and assertion outcomes are emitted; never converted vertex arrays. */
const samples: object[]=[];
for (const name of ['stone','furnace','hopper','crafting_table','blast_furnace']) {
  const state=JSON.parse(readFileSync(resolve(directory,`assets/minecraft/blockstates/${name}.json`),'utf8'));
  for (const [variantKey, raw] of Object.entries(state.variants)) for (const variant of (Array.isArray(raw)?raw:[raw]) as Variant[]) {
    const inherited=resolveModel(variant.model,load), compiled=compileModel(inherited,variant), g=geometry(compiled);
    assert.ok(compiled.positions.every(Number.isFinite)); assert.ok(compiled.uvs.every(v=>v>=0&&v<=1));
    assert.ok(compiled.textures.every(id=>manifest.textures.some((t:{id:string})=>t.id===id)));
    if (name!=='hopper') { assert.equal(compiled.faces.length,6); assert.equal(compiled.indices.length,36); }
    if (name==='furnace'||name==='blast_furnace') {
      const index=compiled.faces.findIndex(f=>f.texture.includes('_front'));
      assert.ok(index>=0);
      const actual=compiled.normals.slice(index*12,index*12+3).map(v=>Math.round(v)||0);
      const facing=variantKey.match(/facing=(north|east|south|west)/)![1];
      const expected: Record<string,number[]>={ north:[0,0,-1], east:[1,0,0], south:[0,0,1], west:[-1,0,0] };
      assert.deepEqual(actual,expected[facing]);
    }
    const material=new MeshBasicMaterial({side:DoubleSide}), mesh=new Mesh(g,material); mesh.updateMatrixWorld(true);
    let aperture: number | null=null;
    if (name==='hopper') {
      assert.ok(inherited.elements!.length>1);
      const ray=new Raycaster(new Vector3(.5,2,.5),new Vector3(0,-1,0));
      aperture=ray.intersectObject(mesh)[0]?.point.y ?? null;
      assert.ok(aperture!==null && aperture<.9 && aperture>.5);
    }
    samples.push({ name, variant:variantKey, model:variant.model, x:variant.x??0, y:variant.y??0,
      elements:inherited.elements!.length, faces:compiled.faces.length, triangles:compiled.indices.length/3,
      textures:compiled.textures, bounds:{min:g.boundingBox!.min.toArray(),max:g.boundingBox!.max.toArray()}, apertureHitY:aperture });
    g.dispose(); material.dispose();
  }
}
process.stdout.write(JSON.stringify({ gameVersion:'26.3',clientSha1:manifest.clientSha1,sourceEntries:manifest.entries,
  textureDependencies:manifest.textures, sampleVariants:samples.length, samples,
  outcome:'bounded JSON inheritance / geometry / furnace orientation / hopper aperture assertions passed',
  notVerified:['textured browser rendering','UV visual parity','lighting/AO','animated/transparent textures','element rotations / UV-lock / multipart','distribution permission'],
  originalBytesInBrowserBuild:false },null,2)+'\n');
