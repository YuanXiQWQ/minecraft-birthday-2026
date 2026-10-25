/** Cow leg surfaces retain outward winding, native mirrored UVs and exterior visibility while walking. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry, Float32BufferAttribute, FrontSide, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
import animals from '../web/src/data/animal-models.json' with {type: 'json'};
import {playerCube} from '../web/src/ui/player-model.ts';

for (const leg of animals.cow.parts.filter(part => part.name.startsWith('leg'))) {
    test('cow ' + leg.name + ' exposes all six exterior faces at rest and mid-stride', () => {
        const box = leg.boxes[0], mirror = 'mirror' in leg && leg.mirror,
            compiled = playerCube(box, animals.cow.texture, animals.cow.height, 0, mirror),
            original = playerCube(box, animals.cow.texture, animals.cow.height),
            center = new Vector3(...box.slice(0, 3) as [number, number, number])
                .add(new Vector3(...box.slice(3, 6) as [number, number, number]).multiplyScalar(.5)).divideScalar(16),
            geometry = new BufferGeometry(), material = new MeshBasicMaterial({side: FrontSide});
        assert.deepEqual(compiled.uvs, original.uvs);
        geometry.setAttribute('position', new Float32BufferAttribute(compiled.positions, 3));
        geometry.setIndex(compiled.indices);
        const mesh = new Mesh(geometry, material);
        mesh.scale.y = -1;
        mesh.position.set(...leg.pivot.map(n => n / 16) as [number, number, number]);
        try {
            for (let face = 0; face < 6; face++) {
                const vertices = compiled.indices.slice(face * 6, face * 6 + 3)
                    .map(i => new Vector3().fromArray(compiled.positions, i * 3)),
                    normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize(),
                    midpoint = new Vector3();
                for (let vertex = 0; vertex < 4; vertex++) midpoint.add(new Vector3().fromArray(compiled.positions, face * 12 + vertex * 3));
                midpoint.multiplyScalar(.25);
                assert.ok(normal.dot(midpoint.clone().sub(center)) > 0, 'face ' + face + ' must point outward');
                assert.ok(normal.distanceTo(new Vector3().fromArray(compiled.normals, face * 12)) < 1e-6);
                for (const angle of [0, -.7, .7]) {
                    mesh.rotation.x = angle;
                    mesh.updateMatrixWorld(true);
                    const target = midpoint.clone().applyMatrix4(mesh.matrixWorld),
                        direction = normal.clone().transformDirection(mesh.matrixWorld),
                        ray = new Raycaster(target.clone().addScaledVector(direction, .1), direction.negate()),
                        hit = ray.intersectObject(mesh)[0];
                    assert.ok(hit, 'face ' + face + ' must remain visible at angle ' + angle);
                    assert.ok(Math.abs(hit.distance - .1) < 1e-6, 'ray must hit the near exterior, not the inside of the far face');
                }
            }
        } finally {
            geometry.dispose();
            material.dispose();
        }
    });
}
