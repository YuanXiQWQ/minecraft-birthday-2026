/** Textured vanilla geometry owns its GPU resources separately from diagnostic environment geometry. */
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, FrontSide, Group, Mesh, MeshBasicMaterial, NearestFilter, SRGBColorSpace, Vector3 } from 'three';
import type { Facing, Kind } from '../domain/types.ts';
import type { Pixels, Sample, VanillaPack } from './resources.ts';
import type { Intersection, Object3D } from 'three';

/** Local PNG animation descriptors use Minecraft's 20 ticks/second asset timing. */
export interface AnimationFrame {index:number;time:number}

/** Sample nearest texel alpha with the same vertical UV convention as CanvasTexture.
 * @param {Uint8ClampedArray} rgba Current texture frame pixels.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} u Texture U coordinate.
 * @param {number} v Texture V coordinate, increasing upward.
 * @return {number} Alpha in the inclusive 0–255 range.
 */
export function alphaAt(rgba:Uint8ClampedArray,width:number,height:number,u:number,v:number):number {
  const x=Math.max(0,Math.min(width-1,Math.floor(u*width))),y=Math.max(0,Math.min(height-1,Math.floor((1-v)*height)));
  return rgba[(y*width+x)*4+3];
}

/** Validate a vertical texture strip and its explicitly supported animation features.
 * @param {Pixels} source Decoded original pixels and metadata.
 * @return {AnimationFrame[]} Bounded animation sequence.
 */
export function textureFrames(source:Pixels):AnimationFrame[] {
  if(source.static)return[{index:0,time:1}];
  if(source.animation&&('width' in source.animation||'height' in source.animation))throw new Error('unsupported-animation-layout');
  if(source.height%source.width!==0||source.width<1)throw new Error('unsupported-texture-layout');
  const count=source.height/source.width;
  if(count>1&&!source.animation)throw new Error('missing-animation-metadata');
  const duration=source.animation?.frametime??1;
  const frames=(source.animation?.frames??Array.from({length:count},(_,i)=>i)).map(frame=>typeof frame==='number'?{index:frame,time:duration}:{index:frame.index,time:frame.time??duration});
  if(!frames.length||frames.some(f=>!Number.isInteger(f.index)||f.index<0||f.index>=count||!Number.isInteger(f.time)||f.time<=0))throw new Error('invalid-animation-frames');
  return frames;
}

/** Calculate an asset frame and interpolation weight without changing logical workstation time.
 * @param {AnimationFrame[]} frames Metadata sequence.
 * @param {number} milliseconds Renderer clock.
 * @return {{current:number,next:number,mix:number}} Frame indices and fractional progress.
 */
export function animationAt(frames:AnimationFrame[],milliseconds:number) {
  const total=frames.reduce((n,f)=>n+f.time,0);let tick=milliseconds/50%total;
  for(let i=0;i<frames.length;i++){if(tick<frames[i].time)return {current:frames[i].index,next:frames[(i+1)%frames.length].index,mix:tick/frames[i].time};tick-=frames[i].time;}
  return {current:frames[0].index,next:frames[0].index,mix:0};
}

/** Own original-texture materials; no lighting/AO parity or asset distribution permission is implied. */
export class VanillaModels {
  created=0;released=0;
  pack:VanillaPack;
  materials=new Map<string,MeshBasicMaterial>();
  textures=new Map<string,{map:CanvasTexture;source:Pixels;frames:AnimationFrame[];context:CanvasRenderingContext2D;data:ImageData;last:string}>();

  /** Allocate nearest-filtered sRGB maps from already hash-verified local pixels.
   * @param {VanillaPack} pack Verified versioned model and texture resources.
   */
  constructor(pack:VanillaPack) {
    this.pack=pack;
    try {
      for(const [id,source] of pack.images) {
        if(!source.blend&&source.rgba.some((v,i)=>i%4===3&&v!==0&&v!==255))throw new Error('translucent-texture-not-supported');
        const frames=textureFrames(source), canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.static?source.height:source.width;
        const context=canvas.getContext('2d')!, data=context.createImageData(canvas.width,canvas.height);
        const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.generateMipmaps=false;
        this.textures.set(id,{map,source,frames,context,data,last:''});
        this.materials.set(id,new MeshBasicMaterial({map,side:FrontSide,alphaTest:.1,transparent:!!source.blend,opacity:1,depthWrite:!source.blend,vertexColors:!!pack.tints,toneMapped:false}));
      }
      this.animate(0);
    } catch(error){this.dispose();throw error;}
  }

  /** Update original PNG animation frames, including explicit interpolation for opaque sample pixels.
   * @param {number} time Millisecond renderer clock, independent from gameplay processing.
   */
  animate(time:number):void {
    for(const record of this.textures.values()) {
      const {source,frames,data}=record, state=animationAt(frames,time), mix=source.animation?.interpolate?state.mix:0;
      const signature=`${state.current}:${state.next}:${mix}`;if(signature===record.last)continue;
      const size=data.data.length;
      for(let i=0;i<size;i++)data.data[i]=Math.round(source.rgba[state.current*size+i]*(1-mix)+source.rgba[state.next*size+i]*mix);
      record.context.putImageData(data,0,0);record.map.needsUpdate=true;record.last=signature;
    }
  }

  /** Build one selected original state with one material group per texture, retaining each original quad UV and alpha.
   * @param {Sample} sample Exact compiled blockstate choice.
   * @param {number|undefined} tint Optional preview validity tint.
   * @return {Group} Unit cell at local minimum corner with owned geometry.
   */
  sample(sample:Sample,tint?:number):Group {
    const root=new Group(), compiled=sample.compiled, geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(compiled.positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(compiled.normals,3));
    geometry.setAttribute('uv',new Float32BufferAttribute(compiled.uvs,2));geometry.setIndex(compiled.indices);
    const ids=compiled.textures, materials=ids.map(id=>{
      const key=tint===undefined?id:`${id}:${tint}`;
      if(!this.materials.has(key)){const mat=this.materials.get(id)!.clone();mat.color.setHex(tint!);mat.transparent=true;mat.opacity=.55;mat.depthWrite=false;this.materials.set(key,mat);}
      return this.materials.get(key)!;
    });
    const ordered:number[]=[];for(const [materialIndex,id]of ids.entries()){const start=ordered.length;compiled.faces.forEach((face,index)=>{if(face.texture===id)ordered.push(...compiled.indices.slice(index*6,index*6+6));});if(ordered.length>start)geometry.addGroup(start,ordered.length-start,materialIndex);}geometry.setIndex(ordered);
    if(this.pack.tints){const colors:number[]=[];compiled.faces.forEach((face,i)=>{const n=compiled.normals.slice(i*12,i*12+3),shade=face.shadeDirection==='up'||n[1]>.5?1:n[1]<-.5?.55:Math.abs(n[0])>.5?.82:.72,color=face.texture.includes('water_')?this.pack.tints!.water:face.tintindex===undefined?0xffffff:face.texture.includes('leaves')?this.pack.tints!.foliage:this.pack.tints!.grass;for(let k=0;k<4;k++)colors.push(((color>>16)&255)/255*shade,((color>>8)&255)/255*shade,(color&255)/255*shade);});geometry.setAttribute('color',new Float32BufferAttribute(colors,3));}
    this.created++;geometry.addEventListener('dispose',()=>{this.released++;});
    const mesh=new Mesh(geometry,materials);mesh.userData={sampleId:sample.id};root.add(mesh);
    const front=compiled.faces.findIndex(f=>f.texture.includes('_front'));
    if(front>=0){const marker=new Group();marker.name='front';const p=new Vector3();for(let i=0;i<4;i++)p.add(new Vector3(...compiled.positions.slice(front*12+i*3,front*12+i*3+3) as [number,number,number]));marker.position.copy(p.multiplyScalar(.25));root.add(marker);}
    return root;
  }

  /** Select an exact native furnace/hopper state and project the persisted table orientation.
   * @param {Kind} kind Logical device family.
   * @param {Facing} facing Logical orientation.
   * @param {boolean} lit Whether the producer has remaining fire; timing stays in the domain.
   * @param {number|undefined} tint Optional placement preview tint.
   * @return {Group} Actual converted model.
   */
  device(kind:Kind,facing:Facing,lit:boolean,tint?:number):Group {
    const sample=this.pack.samples.find(s=>s.block===kind&&(kind==='crafting_table'||s.state.includes(`facing=${facing}`))&&(!['furnace','blast_furnace'].includes(kind)||s.state.includes(`lit=${lit}`)));
    if(!sample)throw new Error('missing-original-state');const root=this.sample(sample,tint);
    if(kind==='crafting_table'){const pivot=new Group();pivot.add(root);root.position.set(-.5,0,-.5);pivot.position.set(.5,0,.5);pivot.rotation.y=-['north','east','south','west'].indexOf(facing)*Math.PI/2;return pivot;}
    return root;
  }

  /** Reject ray hits on discarded alpha texels instead of allowing invisible faces to block picking.
   * @param {Intersection<Object3D>} hit Real triangle intersection.
   * @return {boolean} Whether the nearest material texel is visible.
   */
  accepts(hit:Intersection<Object3D>):boolean {
    if(!(hit.object instanceof Mesh)||!hit.uv)return true;
    const material=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;
    if(!(material instanceof MeshBasicMaterial)||!material.map)return true;
    const record=[...this.textures.values()].find(r=>r.map===material.map);if(!record)return true;
    return alphaAt(record.data.data,record.source.width,record.data.height,hit.uv.x,hit.uv.y)>=128;
  }

  /** Report counts and source hashes without exporting texture pixels or model vertices.
   * @return {object} Local sample inventory and resource ownership counters.
   */
  diagnostics() {return {mode:'vanilla-26.3',states:this.pack.samples.length,ownedCreated:this.created,ownedReleased:this.released,
    materials:this.materials.size,textures:[...this.textures].map(([id,r])=>({id,width:r.source.width,height:r.source.height,frames:r.frames.length,interpolate:r.source.animation?.interpolate??false,
      alphaPixels:r.source.rgba.filter((v,i)=>i%4===3&&v<255).length,sha256:r.source.sha256})),loading:this.pack.loading};}

  /** Release shared GPU textures and materials after all owned model geometry has been released. */
  dispose():void {for(const r of this.textures.values())r.map.dispose();this.textures.clear();for(const m of this.materials.values())m.dispose();this.materials.clear();}
}
