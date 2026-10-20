/** Eye-height observation stations for the experiment, independent of placement state. */
import type { PerspectiveCamera } from 'three';

export type View = 'Front' | 'Left' | 'Right';
/** Diagnostic stations are not a product movement or look-control specification. */
export const EYE_STATIONS = {
  Front: [.5, 1.62, 6.5],
  Left: [-4, 1.62, 4],
  Right: [5, 1.62, 4],
} as const;

/** Aim from inside the authored environment without moving the eye on viewport resize.
 * @param {PerspectiveCamera} camera Perspective camera to configure.
 * @param {View} view Diagnostic eye station.
 */
export function setEyeView(camera: PerspectiveCamera, view: View): void {
  const [x,y,z]=EYE_STATIONS[view];
  camera.position.set(x,y,z);
  camera.lookAt(.5, 1.35, .5);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
