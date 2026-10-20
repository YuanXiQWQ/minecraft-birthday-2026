/** Browser-only vanilla assertions never substitute schematic geometry when resources are absent. */
import { Group, Mesh, PlaneGeometry, Raycaster, Vector3, NearestFilter, SRGBColorSpace } from 'three';
import type { SceneAdapter } from './scene-adapter.ts';
import type { Layout } from './domain.ts';
import { alphaAt, animationAt } from './vanilla-models.ts';

/** Exercise original state geometry, uploaded texture maps and actual framebuffer output.
 * @param {SceneAdapter} adapter Real WebGL2 renderer with an optional local vanilla factory.
 * @param {Layout} layout Logical state to preserve.
 * @return {object} Explicit blocked outcome or named assertions and nonpixel evidence.
 */
export function vanillaBrowserChecks(adapter:SceneAdapter,layout:Layout):object {
  if(!adapter.vanilla)return {status:'blocked',reason:'local vanilla resources not loaded; debug geometry is not vanilla evidence',passed:0,failed:0,skipped:1};
  const factory=adapter.vanilla, oldSample=adapter.sampleId, camera=adapter.view, before=JSON.stringify(layout);
  const results:{name:string;passed:boolean}[]=[], states:{id:string;passed:boolean;hit:string|undefined;face:unknown;framebufferPatchHash:string;faces:number;triangles:number}[]=[];
  const alphaProbe=new Group();
  /** Record one browser assertion with independent expected values.
   * @param {string} name Assertion name.
   * @param {boolean} passed Actual outcome.
   */
  function check(name:string,passed:boolean):void {results.push({name,passed});}
  /** Hash an actual foreground sample rectangle without exporting framebuffer pixels.
   * @return {string} Nonpixel checksum used only to compare rendering outcomes.
   */
  function framebufferHash():string {
    const ratio=adapter.renderer.getPixelRatio(),a=adapter.project([-2,0,3]),b=adapter.project([-1,1,3]);
    const width=Math.ceil(Math.abs(b.x-a.x)*ratio),height=Math.ceil(Math.abs(b.y-a.y)*ratio),pixel=new Uint8Array(width*height*4);
    const gl=adapter.renderer.getContext();
    gl.readPixels(Math.floor(Math.min(a.x,b.x)*ratio),Math.floor(adapter.renderer.domElement.height-Math.max(a.y,b.y)*ratio),width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    let hash=2166136261;for(const value of pixel)hash=Math.imul(hash^value,16777619);return (hash>>>0).toString(16);
  }
  try {
    adapter.setView('Front');
    check('V01 all original maps use nearest filtering and sRGB',factory.textures.size===16&&[...factory.textures.values()].every(r=>r.map.colorSpace===SRGBColorSpace&&r.map.minFilter===NearestFilter&&r.map.magFilter===NearestFilter));
    let allRendered=true;
    for(const sample of factory.pack.samples) {
      adapter.showSample(sample.id);adapter.renderOnce();
      const p=adapter.project([-1.5,.5,2.5]), hit=adapter.pick(p.x,p.y), gl=adapter.renderer.getContext();
      const hash=framebufferHash();
      let mesh:Mesh|undefined;adapter.sampleRoot.traverse(o=>{if(o instanceof Mesh)mesh=o;});
      const materials=mesh?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):[];
      const passed=hit?.id==='gallery-sample'&&materials.length>0&&materials.every(m=>'map' in m&&Boolean(m.map))&&gl.getError()===gl.NO_ERROR;
      allRendered&&=passed;states.push({id:sample.id,passed,hit:hit?.id,face:hit?.normal,framebufferPatchHash:hash,faces:sample.compiled.faces.length,triangles:sample.compiled.indices.length/3});
    }
    check('V02 every one of 26 original states draws textured geometry and is camera-picked',states.length===26&&allRendered);
    const normals:Record<string,number[]>={north:[0,0,-1],east:[1,0,0],south:[0,0,1],west:[-1,0,0]};
    check('V03 furnace and blast furnace front normals match all four directions and lit states',factory.pack.samples.filter(s=>['furnace','blast_furnace'].includes(s.block)).every(s=>{
      const face=s.compiled.faces.findIndex(f=>f.texture.includes('_front')), direction=s.state.match(/facing=(north|east|south|west)/)![1];
      return face>=0&&JSON.stringify(s.compiled.normals.slice(face*12,face*12+3).map(v=>Math.round(v)||0))===JSON.stringify(normals[direction]);
    }));
    const hopper=factory.pack.samples.find(s=>s.block==='hopper'&&s.state==='facing=down')!;
    adapter.showSample(hopper.id);adapter.renderOnce();
    const ray=new Raycaster(new Vector3(-1.5,3,2.5),new Vector3(0,-1,0)), aperture=ray.intersectObject(adapter.sampleRoot,true)[0];
    check('V04 actual hopper opening reaches interior at 11/16 instead of a cube top',Boolean(aperture)&&Math.abs(aperture.point.y-11/16)<.00001&&hopper.compiled.faces.length>6);
    const animated=[...factory.textures.values()].find(r=>r.frames.length>1);
    check('V05 original blast lit strip has interpolation and advances at asset time',Boolean(animated?.source.animation?.interpolate)&&Boolean(animated)&&animationAt(animated!.frames,0).current!==animationAt(animated!.frames,550).current);
    const cutout=[...factory.textures.values()].find(r=>r.source.rgba.some((v,i)=>i%4===3&&v===0));
    check('V06 hopper top binary alpha uses matching nearest visible-texel sampling',Boolean(cutout)&&cutout!.source.rgba.filter((v,i)=>i%4===3&&v===0).length===100
      &&alphaAt(cutout!.data.data,16,16,.5,.5)===0&&alphaAt(cutout!.data.data,16,16,0,0)===255);
    adapter.showSample(null);adapter.sync(layout);adapter.renderOnce();const baseline=adapter.diagnostics().geometries;
    for(let i=0;i<8;i++){adapter.showSample(hopper.id);adapter.renderOnce();adapter.showSample(null);adapter.renderOnce();}
    check('V07 original sample geometry churn returns to GPU baseline',adapter.diagnostics().geometries===baseline);
    check('V08 model experiments preserve domain layout',JSON.stringify(layout)===before);
    adapter.showSample(null);adapter.environment.add(alphaProbe);
    const transparentMaterial=[...factory.materials].find(([id])=>factory.pack.images.get(id)?.rgba.some((v,i)=>i%4===3&&v===0))![1];
    const opaqueMaterial=factory.materials.get(factory.pack.samples.find(s=>s.block==='stone')!.compiled.textures[0])!;
    const front=adapter.models.part(alphaProbe,new PlaneGeometry(1,1),transparentMaterial,[-1.5,.5,3]);front.userData={id:'cutout-front',role:'occluder'};
    const rear=adapter.models.part(alphaProbe,new PlaneGeometry(1,1),opaqueMaterial,[-1.5,.5,2.9]);rear.userData={id:'cutout-rear',role:'occluder'};
    adapter.renderOnce();const center=adapter.project([-1.5,.5,3]),edge=adapter.project([-1.95,.95,3]);
    check('V09 actual camera ray passes alpha hole and keeps opaque rim (explicit material probe planes)',adapter.pick(center.x,center.y)?.id==='cutout-rear'&&adapter.pick(edge.x,edge.y)?.id==='cutout-front');
    check('V10 visible furnace and blast lit states change actual framebuffer output', ['furnace','blast_furnace'].every(block=>
      states.find(s=>s.id===`${block}/facing=south,lit=false/0`)?.framebufferPatchHash!==states.find(s=>s.id===`${block}/facing=south,lit=true/0`)?.framebufferPatchHash));
    adapter.models.release(alphaProbe);adapter.showSample('blast_furnace/facing=south,lit=true/0');
    const animationHashes=[0,250,500].map(time=>{adapter.renderOnce(time);return framebufferHash();});
    check('V11 original interpolated blast texture produces distinct actual frames at 0/250/500 ms',new Set(animationHashes).size===3);
  } finally {if(alphaProbe.parent)adapter.models.release(alphaProbe);adapter.showSample(oldSample);adapter.setView(camera);adapter.sync(layout);adapter.renderOnce();}
  return {status:'executed',capturedAt:new Date().toISOString(),passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,skipped:0,
    results,states,environment:adapter.diagnostics(),notVerified:['Java client screenshot parity','general alpha/cutout texture pipeline','AO and Minecraft lighting','UV-lock, element rotation, multipart','asset redistribution permission']};
}
