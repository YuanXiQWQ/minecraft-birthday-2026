/** Static cave illumination multiplies owned vertex or instance colors, never shared materials. */
import {Color, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, Vector3} from 'three';
import type {Object3D} from 'three';
import type {Cell} from '../domain/types.ts';

/** Evaluate restrained warm torch falloff and a dim, readable deep-passage ambient term.
 * @param {Cell} point World position of a vertex or block center.
 * @param {Cell[]} lights Active supported torch anchors.
 * @return {Color} Linear multiplier for original native face shading.
 */
export function caveLight(point: Cell, lights: Cell[]): Color {
    const ambient = .045 + .10 * Math.max(0, Math.min(1, (point[2] + 12) / 15));
    const energy = lights.reduce((sum, p) => sum + .9 * Math.exp(-p.reduce((d,n,i) => d + (n-point[i])**2, 0) / 28), 0);
    const height = point[1] > 2.8 ? .78 : 1;
    return new Color().setRGB(Math.min(1, ambient + energy) * height, Math.min(1, ambient + energy * .91) * height, Math.min(1, ambient + energy * .77) * height);
}

/** Apply deterministic light once per geometry/layout revision, retaining pristine native colors.
 * @param {Object3D} root Owned cave geometry layer.
 * @param {Cell[]} lights Active torch anchors.
 */
export function lightCave(root: Object3D, lights: Cell[]): void {
    const signature = JSON.stringify(lights), matrix = new Matrix4(), point = new Vector3();
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
        if (!(object instanceof Mesh) || object.userData.caveLight === signature) return;
        object.userData.caveLight = signature;
        if (object.userData.block === 'wall_torch') return;
        if (object instanceof InstancedMesh) {
            for (let i = 0; i < object.count; i++) {
                object.getMatrixAt(i, matrix);
                point.set(.5,.5,.5).applyMatrix4(matrix).applyMatrix4(object.matrixWorld);
                object.setColorAt(i, caveLight(point.toArray(), lights));
            }
            object.instanceColor!.needsUpdate = true;
        } else {
            const geometry = object.geometry, position = geometry.getAttribute('position');
            const base = object.userData.caveBase ??= geometry.getAttribute('color')?.array.slice() ?? new Float32Array(position.count * 3).fill(1);
            const colors = new Float32Array(base.length);
            for (let i = 0; i < position.count; i++) {
                point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
                const color = caveLight(point.toArray(), lights);
                colors[i*3] = base[i*3] * color.r; colors[i*3+1] = base[i*3+1] * color.g; colors[i*3+2] = base[i*3+2] * color.b;
            }
            geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
    });
}
