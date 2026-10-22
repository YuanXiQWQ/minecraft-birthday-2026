/** One sorted camera-facing quad batch; particle positions stay in real world coordinates with depth testing. */
import {
    BufferGeometry,
    BufferAttribute,
    DynamicDrawUsage,
    CanvasTexture,
    Color,
    Float32BufferAttribute,
    Mesh,
    MeshBasicMaterial,
    NearestFilter,
    SRGBColorSpace,
    Vector3
} from 'three';
import type {EffectScene as SceneAdapter} from './effect-scene.ts';
import type {CelebrationPack} from './celebration-pack.ts';
import {spriteFrame, visibleSpark} from './firework-simulation.ts';
import type {Spark} from './firework-simulation.ts';

/** Own a per-play batch and shared original-sprite atlas; this class never creates an animation loop. */
export class FireworkBatch {
    adapter: SceneAdapter;
    pack: CelebrationPack;
    atlas: CanvasTexture;
    mesh: Mesh | null = null;
    created = 0;
    released = 0;
    visible = 0;
    disposed = false;
    mode: 'reference' | 'pooled' = 'pooled';
    rows: { p: Spark | null; x: number; y: number; z: number; depth: number }[] = [];
    ordered: typeof this.rows = [];
    buffers = {
        position: new Float32Array(20000 * 6 * 3),
        uv: new Float32Array(20000 * 6 * 2),
        color: new Float32Array(20000 * 6 * 4)
    };
    right = new Vector3();
    up = new Vector3();
    forward = new Vector3();
    color = new Color();

    /** Build a nearest-filtered runtime atlas from verified sprite bytes, without generating a repository asset.
     * @param {SceneAdapter} adapter Existing camera and renderer owner.
     * @param {CelebrationPack} pack Original particle samples.
     */
    constructor(adapter: SceneAdapter, pack: CelebrationPack) {
        this.adapter = adapter;
        this.pack = pack;
        const canvas = document.createElement('canvas');
        canvas.width = 9 * 34;
        canvas.height = 34;
        const ctx = canvas.getContext('2d')!;
        [...pack.frames, 'flash'].forEach((id, i) => ctx.drawImage(pack.images.get(id)!, i * 34 + 1, 1));
        this.atlas = new CanvasTexture(canvas);
        this.atlas.colorSpace = SRGBColorSpace;
        this.atlas.magFilter = this.atlas.minFilter = NearestFilter;
        this.atlas.generateMipmaps = false;
    }

    /** Allocate one bounded batch for a live run; geometry capacity does not grow every frame. */
    begin(): void {
        this.clear();
        const g = new BufferGeometry(), capacity = 20000;
        for (const [name, size] of [['position', 3], ['uv', 2], ['color', 4]] as const) g.setAttribute(name, this.mode === 'reference' ? new Float32BufferAttribute(new Float32Array(capacity * 6 * size), size) : new BufferAttribute(this.buffers[name], size).setUsage(DynamicDrawUsage));
        const material = new MeshBasicMaterial({
            map: this.atlas,
            vertexColors: true,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            alphaTest: .001,
            toneMapped: false,
            fog: false
        });
        this.mesh = new Mesh(g, material);
        this.mesh.frustumCulled = false;
        this.mesh.name = 'original-firework-batch';
        this.adapter.scene.add(this.mesh);
        this.created++;
    }

    /** Sort translucent quads back-to-front, interpolate motion, and apply the original age frames/flash equations.
     * @param {Spark[]} particles Fixed-tick particle state.
     * @param {number} partial Fractional tick for original-style interpolation.
     */
    update(particles: Spark[], partial: number): void {
        if (this.mode === 'reference') this.reference(particles, partial); else this.pooled(particles, partial);
    }

    /** Retain the measured reference algorithm solely for reproducible P2 before/after comparisons.
     * @param {Spark[]} particles Existing fixed-tick state.
     * @param {number} partial Fractional tick.
     */
    reference(particles: Spark[], partial: number): void {
        if (!this.mesh) return;
        const camera = this.adapter.camera, right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
            up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
            forward = camera.getWorldDirection(new Vector3());
        const phases = this.adapter.profile.phases, start = performance.now();
        const visible = particles.filter(visibleSpark).map(p => ({
            p,
            center: new Vector3(...p.previous).lerp(new Vector3(...p.p), partial)
        }));
        phases.filter = performance.now() - start;
        const sortStart = performance.now();
        visible.sort((a, b) => b.center.clone().sub(camera.position).dot(forward) - a.center.clone().sub(camera.position).dot(forward));
        phases.sort = performance.now() - sortStart;
        const verticesStart = performance.now();
        if (visible.length > 20000) throw new Error('particle-capacity-exceeded-not-silently-truncated');
        this.visible = visible.length;
        const g = this.mesh.geometry, positions = g.getAttribute('position'), uvs = g.getAttribute('uv'),
            colors = g.getAttribute('color');
        visible.forEach(({p, center}, i) => {
            const size = p.flash ? 7.1 * Math.sin((p.age + partial - 1) * .25 * Math.PI) : p.size,
                alpha = p.flash ? .6 - (p.age + partial - 1) * .25 * .5 : p.alpha;
            const frame = p.flash ? 8 : spriteFrame(p.age, p.life),
                image = this.pack.images.get(p.flash ? 'flash' : this.pack.frames[frame])!;
            const u0 = (frame * 34 + 1) / 306, u1 = (frame * 34 + 1 + image.width) / 306,
                v0 = 1 - (1 + image.height) / 34, v1 = 1 - 1 / 34;
            const color = new Color(...p.color).convertSRGBToLinear();
            for (const [j, [x, y, u, v]] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, -1, u0, v0], [1, 1, u1, v1], [-1, 1, u0, v1]].entries()) {
                const point = center.clone().addScaledVector(right, x * size).addScaledVector(up, y * size),
                    index = i * 6 + j;
                positions.setXYZ(index, point.x, point.y, point.z);
                uvs.setXY(index, u, v);
                colors.setXYZW(index, color.r, color.g, color.b, Math.max(0, alpha));
            }
        });
        g.setDrawRange(0, visible.length * 6);
        positions.needsUpdate = uvs.needsUpdate = colors.needsUpdate = true;
        phases.vertices = performance.now() - verticesStart;
    }

    /** Reuse interpolation rows and vectors, precompute depth once and upload only the used attribute ranges.
     * @param {Spark[]} particles Unmodified original simulation state.
     * @param {number} partial Fractional tick, identical to the reference path.
     */
    pooled(particles: Spark[], partial: number): void {
        if (!this.mesh) return;
        const camera = this.adapter.camera, phases = this.adapter.profile.phases, start = performance.now();
        this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        camera.getWorldDirection(this.forward);
        this.ordered.length = 0;
        let used = 0;
        for (const p of particles) {
            if (!visibleSpark(p)) continue;
            if (used >= 20000) throw new Error('particle-capacity-exceeded-not-silently-truncated');
            const row = this.rows[used] ?? {p: null, x: 0, y: 0, z: 0, depth: 0};
            this.rows[used++] = row;
            row.p = p;
            row.x = p.previous[0] + (p.p[0] - p.previous[0]) * partial;
            row.y = p.previous[1] + (p.p[1] - p.previous[1]) * partial;
            row.z = p.previous[2] + (p.p[2] - p.previous[2]) * partial;
            row.depth = (row.x - camera.position.x) * this.forward.x + (row.y - camera.position.y) * this.forward.y + (row.z - camera.position.z) * this.forward.z;
            this.ordered.push(row);
        }
        phases.filter = performance.now() - start;
        const sortStart = performance.now();
        this.ordered.sort((a, b) => b.depth - a.depth);
        phases.sort = performance.now() - sortStart;
        const verticesStart = performance.now(), g = this.mesh.geometry, positions = this.buffers.position,
            uvs = this.buffers.uv, colors = this.buffers.color;
        for (let i = 0; i < used; i++) {
            const row = this.ordered[i], p = row.p!,
                size = p.flash ? 7.1 * Math.sin((p.age + partial - 1) * .25 * Math.PI) : p.size,
                alpha = p.flash ? .6 - (p.age + partial - 1) * .25 * .5 : p.alpha,
                frame = p.flash ? 8 : spriteFrame(p.age, p.life),
                image = this.pack.images.get(p.flash ? 'flash' : this.pack.frames[frame])!;
            const u0 = (frame * 34 + 1) / 306, u1 = (frame * 34 + 1 + image.width) / 306,
                v0 = 1 - (1 + image.height) / 34, v1 = 1 - 1 / 34,
                color = this.color.setRGB(...p.color).convertSRGBToLinear();
            for (let j = 0; j < 6; j++) {
                const sx = ((j === 0 || j === 3 || j === 5) ? -1 : 1) * size,
                    sy = ((j === 0 || j === 1 || j === 3) ? -1 : 1) * size, index = i * 6 + j;
                positions[index * 3] = row.x + this.right.x * sx + this.up.x * sy;
                positions[index * 3 + 1] = row.y + this.right.y * sx + this.up.y * sy;
                positions[index * 3 + 2] = row.z + this.right.z * sx + this.up.z * sy;
                uvs[index * 2] = (j === 0 || j === 3 || j === 5) ? u0 : u1;
                uvs[index * 2 + 1] = (j === 0 || j === 1 || j === 3) ? v0 : v1;
                colors[index * 4] = color.r;
                colors[index * 4 + 1] = color.g;
                colors[index * 4 + 2] = color.b;
                colors[index * 4 + 3] = Math.max(0, alpha);
            }
        }
        this.visible = used;
        g.setDrawRange(0, used * 6);
        for (const name of ['position', 'uv', 'color'] as const) {
            const attribute = g.getAttribute(name) as BufferAttribute;
            attribute.clearUpdateRanges();
            attribute.addUpdateRange(0, used * 6 * attribute.itemSize);
            attribute.needsUpdate = true;
        }
        phases.vertices = performance.now() - verticesStart;
    }

    /** Release per-play geometry and material while retaining the bounded sample atlas cache. */
    clear(): void {
        if (this.mesh) {
            this.mesh.removeFromParent();
            this.mesh.geometry.dispose();
            (this.mesh.material as MeshBasicMaterial).dispose();
            this.mesh = null;
            this.released++;
        }
        for (const row of this.rows) row.p = null;
        this.ordered.length = 0;
        this.visible = 0;
    }

    /** Release the shared atlas when the controller or scene adapter is destroyed. */
    dispose(): void {
        if (this.disposed) return;
        this.clear();
        this.atlas.dispose();
        this.disposed = true;
    }
}
