/** A single disposable worker compiles original cloud cells without stalling the game render thread. */
import {cloudGeometry} from './cloud-geometry.ts';
/** Return transferable geometry; this worker has no storage, location or network access.
 * @param {MessageEvent} event Original decoded texture pixels and dimensions.
 */
self.onmessage=(event:MessageEvent)=>{const {pixels,width,height}=event.data,mesh=cloudGeometry(pixels,width,height);self.postMessage(mesh,{transfer:[mesh.positions.buffer,mesh.colors.buffer,mesh.indices.buffer]});};
