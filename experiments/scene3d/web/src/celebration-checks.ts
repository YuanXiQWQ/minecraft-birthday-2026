/** Actual framebuffer depth probe for the original-sprite batch, without moving the approved camera. */
import {Mesh,MeshBasicMaterial,PlaneGeometry,Vector3} from 'three';
import type {SceneAdapter} from './scene-adapter.ts';
import type {FireworkBatch} from './firework-batch.ts';
import type {Spark,Vec} from './firework-simulation.ts';
/** Compare real GPU pixels for an original spark behind and in front of a temporary opaque plane.
 * @param {SceneAdapter} adapter Existing camera/render owner.
 * @param {FireworkBatch} batch Loaded original particle batch.
 * @return {object} Nonpixel depth evidence; probe geometry is removed in all cases.
 */
export function celebrationDepthProbe(adapter:SceneAdapter,batch:FireworkBatch):object {
  const forward=adapter.camera.getWorldDirection(new Vector3()),center=adapter.camera.position.clone().addScaledVector(forward,3);
  const plane=new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial({color:0x102030,toneMapped:false}));plane.position.copy(center);plane.quaternion.copy(adapter.camera.quaternion);adapter.scene.add(plane);
  /** Hash a center framebuffer patch immediately after drawing at a fixed animation time.
   * @return {string} Nonreversible comparison checksum.
   */
  function hash():string {adapter.renderOnce(0);const gl=adapter.renderer.getContext(),w=adapter.renderer.domElement.width,h=adapter.renderer.domElement.height,pixels=new Uint8Array(64*64*4);gl.readPixels(Math.floor(w/2)-32,Math.floor(h/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let n=2166136261;for(const b of pixels)n=Math.imul(n^b,16777619);return (n>>>0).toString(16);}
  /** Construct one enlarged original-textured spark for an isolated visibility assertion.
   * @param {number} distance Camera distance along the actual look direction.
   * @return {Spark} Deterministic diagnostic particle.
   */
  function spark(distance:number):Spark {const p=adapter.camera.position.clone().addScaledVector(forward,distance).toArray() as Vec;return {id:1,p,previous:[...p],v:[0,0,0],age:0,life:48,size:.2,color:[1,0,0],alpha:.99,trail:false,twinkle:false,child:false,flash:false};}
  try {batch.clear();const baseline=hash();batch.begin();batch.update([spark(4)],0);const behind=hash();batch.update([spark(2)],0);const front=hash();return {baseline,behind,front,passed:baseline===behind&&front!==baseline,source:'real WebGL readPixels; original spark_7; explicit opaque test plane'};}
  finally {batch.clear();plane.removeFromParent();plane.geometry.dispose();plane.material.dispose();adapter.renderOnce();}
}
