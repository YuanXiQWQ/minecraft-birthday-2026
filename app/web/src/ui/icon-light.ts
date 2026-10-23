/** Java 26.3 Lighting.ITEMS_3D and light.glsl parameters in the screen model coordinate space. */
import {Matrix4, Euler, Vector3} from 'three';
/** Transform the native two diffuse directions through the exact GUI light matrix.
 * @return {Vector3[]} Directions converted from downward GUI Y into the upward orthographic icon camera.
 */
export function guiLights(): Vector3[] {
    const m = new Matrix4().makeScale(1, -1, 1)
        .multiply(new Matrix4().makeRotationFromEuler(new Euler(3.2375858, 1.0821041, 0, 'YXZ')))
        .multiply(new Matrix4().makeRotationFromEuler(new Euler(2.3561945, -.3926991, 0, 'YXZ')));
    const screenToCamera = new Matrix4().makeScale(1, -1, 1);
    return [[.2, 1, -.7], [-.2, 1, .7]].map(v => new Vector3(...v as [number, number, number]).normalize().transformDirection(m).transformDirection(screenToCamera));
}
/** Evaluate the original clamped diffuse sum independently from output pixel density.
 * @param {Vector3} normal Transformed unit face normal.
 * @return {number} Native light multiplier, with preserved top/side differences.
 */
export function guiLight(normal: Vector3): number {return Math.min(1, .4 + .6 * guiLights().reduce((n, l) => n + Math.max(0, l.dot(normal)), 0));}
