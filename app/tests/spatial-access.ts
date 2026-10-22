/** P7_TEST_ONLY: native geometry rays and bounded-camera dismantling analysis, separate from player-input evidence. */
import {Box3, Mesh, Vector3} from 'three';
import type {Object3D} from 'three';
import type {SceneView} from '../web/src/render/scene.ts';
import {initialState} from '../web/src/domain/state.ts';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import type {SceneId} from '../web/src/domain/types.ts';

/** Sample actual triangle interiors and geometry bounds, retaining native alpha/depth filtering in SceneView.pick.
 * @param {Object3D} root Native object.
 * @return {Vector3[]} World-space candidate surfaces.
 */
function surfaces(root: Object3D): Vector3[] {
    root.updateWorldMatrix(true, true);
    const points = [new Box3().setFromObject(root).getCenter(new Vector3())];
    root.traverse(o => {
        if (!(o instanceof Mesh)) return;
        const p = o.geometry.getAttribute('position'), index = o.geometry.index;
        for (let i = 0; i < (index?.count ?? p.count); i += 3) {
            const a = new Vector3().fromBufferAttribute(p, index ? index.getX(i) : i),
                b = new Vector3().fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1),
                c = new Vector3().fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
            points.push(a.add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld));
        }
    });
    return points;
}

/** Find a visible native surface using only admitted yaw/pitch and an unchanged first-person eye.
 * @param {SceneView} view Real renderer adapter.
 * @param {Object3D} object Expected native object.
 * @return {object|null} Actual visible ray and camera observation.
 */
function reachable(view: SceneView, object: Object3D): object | null {
    const rect = view.renderer.domElement.getBoundingClientRect(), id = String(object.userData.id);
    for (const point of surfaces(object)) {
        const d = point.clone().sub(view.camera.position),
            yaw = Math.max(-view.look.maxYaw, Math.min(view.look.maxYaw, Math.atan2(-d.x, -d.z))),
            pitch = Math.max(-view.look.maxPitch, Math.min(view.look.maxPitch, Math.atan2(d.y, Math.hypot(d.x, d.z)) - view.basePitch));
        view.camera.rotation.set(view.basePitch + pitch, yaw, 0, 'YXZ');
        view.camera.updateMatrixWorld(true);
        const ndc = point.clone().project(view.camera);
        if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) >= .995 || Math.abs(ndc.y) >= .995) continue;
        const x = rect.left + (ndc.x + 1) * rect.width / 2, y = rect.top + (1 - ndc.y) * rect.height / 2,
            hit = view.pick(x, y);
        if (hit?.id === id) return {id, yaw, pitch, pointer: [x, y], hit};
    }
    return null;
}

/** Audit authored sources and peel a fully occupied legal build volume using real nearest visible surfaces.
 * @param {SceneView} view Verified native scene adapter belonging only to the isolated fixture.
 * @return {object[]} Per-scene actual geometry results, with failures preserved.
 */
export function auditSpace(view: SceneView): object[] {
    const reports: object[] = [];
    for (const id of Object.keys(WORLD_SCENES) as SceneId[]) {
        const state = initialState(), spec = WORLD_SCENES[id];
        state.progress.scene = id;
        view.syncWorld(state.progress);
        const sources = [...view.authored!.natural.children], found: unknown[] = [], failed: string[] = [];
        let work = [...sources];
        while (work.length) {
            let progress = false;
            for (const object of [...work]) {
                const result = reachable(view, object);
                if (!result) continue;
                found.push(result);
                work = work.filter(o => o !== object);
                if (object.userData.id !== 'node:cow:0') object.removeFromParent();
                progress = true;
            }
            if (!progress) {
                failed.push(...work.map(o => String(o.userData.id)));
                break;
            }
        }
        for (const object of view.authored!.staticRoot.children.filter(o => String(o.userData.id).startsWith('plot:') || o.userData.id === 'birthday-table')) {
            const result = reachable(view, object);
            if (result) found.push(result); else failed.push(String(object.userData.id));
        }
        const box = spec.build;
        for (let x = box.min[0]; x <= box.max[0]; x++) for (let z = box.min[2]; z <= box.max[2]; z++) for (let y = box.min[1]; y <= box.max[1]; y++) state.progress.scenes[id].stations.push({
            id: 'peel-' + x + '-' + y + '-' + (z + 10),
            kind: 'furnace',
            cell: [x, y, z],
            facing: 'south',
            contents: emptyFurnace()
        });
        view.sync(state.progress.scenes[id]);
        let remaining = [...view.persistent.children], peeled = 0;
        const unreachable: string[] = [];
        while (remaining.length) {
            remaining.sort((a, b) => a.position.distanceToSquared(view.camera.position) - b.position.distanceToSquared(view.camera.position));
            const next = remaining.find(o => reachable(view, o));
            if (!next) {
                unreachable.push(...remaining.map(o => String(o.userData.id)));
                break;
            }
            next.removeFromParent();
            remaining = remaining.filter(o => o !== next);
            view.release(next);
            peeled++;
        }
        reports.push({
            scene: id,
            viewport: [innerWidth, innerHeight],
            eye: view.camera.position.toArray(),
            sources: found,
            sourceFailures: failed,
            fullLegalDevices: state.progress.scenes[id].stations.length,
            peeled,
            deviceFailures: unreachable,
            note: 'Native ray/depth/alpha and fixed-eye bounds; fixture geometry peeling is not trusted Shift input or a proof over every heterogeneous arrangement.'
        });
        for (const object of sources) if (!object.parent) view.release(object);
    }
    return reports;
}
