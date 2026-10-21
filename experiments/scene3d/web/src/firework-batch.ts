/** One sorted camera-facing quad batch; particle positions stay in real world coordinates with depth testing. */
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, NearestFilter, SRGBColorSpace, Vector3 } from 'three';
import type { SceneAdapter } from './scene-adapter.ts';
import type { CelebrationPack } from './celebration-pack.ts';
import { spriteFrame, visibleSpark } from './firework-simulation.ts';
import type { Spark } from './firework-simulation.ts';

/** Own a per-play batch and shared original-sprite atlas; this class never creates an animation loop. */
export class FireworkBatch {
  adapter:SceneAdapter;pack:CelebrationPack;atlas:CanvasTexture;mesh:Mesh|null=null;created=0;released=0;visible=0;disposed=false;
  /** Build a nearest-filtered runtime atlas from verified sprite bytes, without generating a repository asset.
   * @param {SceneAdapter} adapter Existing camera and renderer owner.
   * @param {CelebrationPack} pack Original particle samples.
   */
  constructor(adapter:SceneAdapter,pack:CelebrationPack){
    this.adapter=adapter;this.pack=pack;const canvas=document.createElement('canvas');canvas.width=9*34;canvas.height=34;const ctx=canvas.getContext('2d')!;
    [...pack.frames,'flash'].forEach((id,i)=>ctx.drawImage(pack.images.get(id)!,i*34+1,1));
    this.atlas=new CanvasTexture(canvas);this.atlas.colorSpace=SRGBColorSpace;this.atlas.magFilter=this.atlas.minFilter=NearestFilter;this.atlas.generateMipmaps=false;
  }
  /** Allocate one bounded batch for a live run; geometry capacity does not grow every frame. */
  begin():void {
    this.clear();const g=new BufferGeometry(),capacity=20000;
    for(const [name,size]of [['position',3],['uv',2],['color',4]] as const)g.setAttribute(name,new Float32BufferAttribute(new Float32Array(capacity*6*size),size));
    const material=new MeshBasicMaterial({map:this.atlas,vertexColors:true,transparent:true,depthTest:true,depthWrite:false,alphaTest:.001,toneMapped:false,fog:false});
    this.mesh=new Mesh(g,material);this.mesh.frustumCulled=false;this.mesh.name='p2-original-firework-batch';this.adapter.scene.add(this.mesh);this.created++;
  }
  /** Sort translucent quads back-to-front, interpolate motion, and apply the original age frames/flash equations.
   * @param {Spark[]} particles Fixed-tick particle state.
   * @param {number} partial Fractional tick for original-style interpolation.
   */
  update(particles:Spark[],partial:number):void {
    if(!this.mesh)return;const camera=this.adapter.camera,right=new Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new Vector3(0,1,0).applyQuaternion(camera.quaternion),forward=camera.getWorldDirection(new Vector3());
    const visible=particles.filter(visibleSpark).map(p=>({p,center:new Vector3(...p.previous).lerp(new Vector3(...p.p),partial)}));
    visible.sort((a,b)=>b.center.clone().sub(camera.position).dot(forward)-a.center.clone().sub(camera.position).dot(forward));
    if(visible.length>20000)throw new Error('particle-capacity-exceeded-not-silently-truncated');this.visible=visible.length;
    const g=this.mesh.geometry,positions=g.getAttribute('position'),uvs=g.getAttribute('uv'),colors=g.getAttribute('color');
    visible.forEach(({p,center},i)=>{
      const size=p.flash?7.1*Math.sin((p.age+partial-1)*.25*Math.PI):p.size,alpha=p.flash?.6-(p.age+partial-1)*.25*.5:p.alpha;
      const frame=p.flash?8:spriteFrame(p.age,p.life),image=this.pack.images.get(p.flash?'flash':this.pack.frames[frame])!;
      const u0=(frame*34+1)/306,u1=(frame*34+1+image.width)/306,v0=1-(1+image.height)/34,v1=1-1/34;
      const color=new Color(...p.color).convertSRGBToLinear();
      for(const [j,[x,y,u,v]]of [[-1,-1,u0,v0],[1,-1,u1,v0],[1,1,u1,v1],[-1,-1,u0,v0],[1,1,u1,v1],[-1,1,u0,v1]].entries()){
        const point=center.clone().addScaledVector(right,x*size).addScaledVector(up,y*size),index=i*6+j;
        positions.setXYZ(index,point.x,point.y,point.z);uvs.setXY(index,u,v);colors.setXYZW(index,color.r,color.g,color.b,Math.max(0,alpha));
      }
    });g.setDrawRange(0,visible.length*6);positions.needsUpdate=uvs.needsUpdate=colors.needsUpdate=true;
  }
  /** Release per-play geometry and material while retaining the bounded sample atlas cache. */
  clear():void {if(this.mesh){this.mesh.removeFromParent();this.mesh.geometry.dispose();(this.mesh.material as MeshBasicMaterial).dispose();this.mesh=null;this.released++;}this.visible=0;}
  /** Release the shared atlas when the controller or scene adapter is destroyed. */
  dispose():void{if(this.disposed)return;this.clear();this.atlas.dispose();this.disposed=true;}
}
