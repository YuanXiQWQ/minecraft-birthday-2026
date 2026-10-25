/** Native held item geometry shares model inheritance and item-definition selection with the catalogue, without reusing GUI screenshots. */
import {assetPath} from '../render/asset-path.ts';
import {textureFrames, animationAt} from '../render/vanilla-models.ts';
import type {AnimationFrame} from '../render/vanilla-models.ts';
import {
    BufferGeometry,
    Float32BufferAttribute,
    CanvasTexture,
    NearestFilter,
    SRGBColorSpace,
    Mesh,
    MeshLambertMaterial,
    DoubleSide,
    Group,
    Matrix4,
    Quaternion
} from 'three';
import type {CompiledModel} from '../render/model-format.ts';
import {resolveTexture} from '../render/model-format.ts';
import {iconParts, iconModel, iconGeometry} from './icon-model.ts';
import {entityCube} from './icons.ts';
import type {CatalogueArt} from './icons.ts';

/** One preview owns bounded material/texture caches; temporary model instances own only their geometry. */
export class PlayerItems {
    animations = new Map<string, {
        raw: HTMLCanvasElement;
        frames: AnimationFrame[];
        last: number;
        map: CanvasTexture
    }>();
    textures = new Map<string, CanvasTexture>();
    materials = new Map<string, MeshLambertMaterial>();

    /** Reference verified CPU originals without mutating them.
     * @param {CatalogueArt} art Hash-verified original documents and pixels.
     */
    constructor(public art: CatalogueArt) {
    }

    /** Get a native nearest-filtered atlas, optionally with the verified grass tint.
     * @param {string} id Original texture identifier.
     * @param {any} tint Native tint descriptor.
     * @return {MeshLambertMaterial} Shared preview material.
     */
    material(id: string, tint?: any): MeshLambertMaterial {
        const key = id + JSON.stringify(tint ?? null);
        if (this.materials.has(key)) return this.materials.get(key)!;
        const raw = this.art.images.get('assets/minecraft/textures/' + id.split(':').at(-1) + '.png');
        if (!raw) throw Error('missing-player-texture:' + id);
        const canvas = document.createElement('canvas');
        canvas.width = raw.width;
        canvas.height = Math.min(raw.width, raw.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(raw, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        if (tint) {
            if (tint.type !== 'minecraft:grass') throw Error('unsupported-held-tint');
            const color = this.art.images.get('assets/minecraft/textures/colormap/grass.png')!.getContext('2d')!.getImageData(Math.trunc((1 - tint.temperature) * 255), Math.trunc((1 - tint.downfall * tint.temperature) * 255), 1, 1).data,
                p = ctx.getImageData(0, 0, raw.width, raw.width);
            for (let i = 0; i < p.data.length; i += 4) for (let k = 0; k < 3; k++) p.data[i + k] = Math.round(p.data[i + k] * color[k] / 255);
            ctx.putImageData(p, 0, 0);
        }
        const map = new CanvasTexture(canvas);
        map.colorSpace = SRGBColorSpace;
        map.minFilter = map.magFilter = NearestFilter;
        map.generateMipmaps = false;
        this.textures.set(key, map);
        const meta = this.art.documents.get('assets/minecraft/textures/' + id.split(':').at(-1) + '.png.mcmeta')?.animation;
        if (meta) {
            if (meta.interpolate || tint) throw Error('unsupported-held-texture-animation');
            const frames = textureFrames({
                width: raw.width,
                height: raw.height,
                rgba: raw.getContext('2d')!.getImageData(0, 0, raw.width, raw.height).data,
                animation: meta,
                sha256: ''
            });
            this.animations.set(key, {raw, frames, last: -1, map});
        }
        const material = new MeshLambertMaterial({map, alphaTest: .1, side: DoubleSide, toneMapped: false});
        this.materials.set(key, material);
        return material;
    }

    /** Instantiate compiled quads and keep all UV and per-layer tint information.
     * @param {CompiledModel} c Original compiled geometry.
     * @param {any[]} tints Native tint providers.
     * @return {Mesh} Independently disposable mesh with shared materials.
     */
    mesh(c: CompiledModel, tints: any[] = []): Mesh {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(c.positions, 3));
        g.setAttribute('normal', new Float32BufferAttribute(c.normals, 3));
        g.setAttribute('uv', new Float32BufferAttribute(c.uvs, 2));
        g.setIndex(c.indices);
        const m = c.faces.map((f, i) => {
            g.addGroup(i * 6, 6, i);
            return this.material(f.texture, f.tintindex === undefined ? undefined : tints[f.tintindex]);
        });
        return new Mesh(g, m);
    }

    /** Generate original sprite front/back and alpha-edge extrusion for an actual handheld model, not a GUI billboard.
     * @param {string} texture Original sprite identifier.
     * @return {CompiledModel} Native generated-item geometry with one-model-pixel thickness.
     */
    generated(texture: string): CompiledModel {
        const raw = this.art.images.get('assets/minecraft/textures/' + texture.split(':').at(-1) + '.png')!,
            w = raw.width, h = raw.width, p = raw.getContext('2d')!.getImageData(0, 0, w, h).data,
            c: CompiledModel = {positions: [], normals: [], uvs: [], indices: [], faces: [], textures: [texture]};

        /** Append a textured quad with explicit normal.
         * @param {number[]} ps Four XYZ vertices.
         * @param {number[]} uv Four UV pairs.
         * @param {number[]} normal Outward normal.
         */
        function quad(ps: number[], uv: number[], normal: number[]): void {
            const i = c.positions.length / 3;
            c.positions.push(...ps);
            c.uvs.push(...uv);
            for (let n = 0; n < 4; n++) c.normals.push(...normal);
            c.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
            c.faces.push({direction: 'north', texture, tintindex: 0});
        }

        quad([0, 0, 8.5 / 16, 1, 0, 8.5 / 16, 1, 1, 8.5 / 16, 0, 1, 8.5 / 16], [0, 0, 1, 0, 1, 1, 0, 1], [0, 0, 1]);
        quad([1, 0, 7.5 / 16, 0, 0, 7.5 / 16, 0, 1, 7.5 / 16, 1, 1, 7.5 / 16], [1, 0, 0, 0, 0, 1, 1, 1], [0, 0, -1]);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p[(y * w + x) * 4 + 3]) {
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const X = x + dx, Y = y + dy;
                if (X >= 0 && X < w && Y >= 0 && Y < h && p[(Y * w + X) * 4 + 3]) continue;
                const l = x / w, r = (x + 1) / w, b = 1 - (y + 1) / h, t = 1 - y / h, z = 7.5 / 16, Z = 8.5 / 16,
                    uv = Array(4).fill([(x + .5) / w, 1 - (y + .5) / h]).flat();
                quad(dx ? [dx < 0 ? l : r, b, z, dx < 0 ? l : r, b, Z, dx < 0 ? l : r, t, Z, dx < 0 ? l : r, t, z] : [l, dy < 0 ? t : b, z, r, dy < 0 ? t : b, z, r, dy < 0 ? t : b, Z, l, dy < 0 ? t : b, Z], uv, [dx, -dy, 0]);
            }
        }
        return c;
    }

    /** Build the selected default item in its original hand display context and native special model.
     * @param {string} id Held stack item identity.
     * @param {boolean} left Left-hand context and mirroring.
     * @param {boolean} first First-person display transforms.
     * @return {Group} Held model centered for ItemInHandLayer attachment.
     */
    held(id: string, left = false, first = false): Group {
        const out = new Group(), date = new Date(),
            stamp = String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'),
            context = (first ? 'firstperson_' : 'thirdperson_') + (left ? 'lefthand' : 'righthand'),
            definition = this.art.documents.get(assetPath('items',id));
        for (const part of iconParts(definition.model, stamp, [], context)) {
            const model = iconModel(part.model, id => this.art.documents.get(assetPath('models',id))),
                root = new Group(), body = new Group();
            root.add(body);
            if (part.special?.type === 'minecraft:shield') {
                for (const b of [[-6, -11, -2, 12, 22, 1, 0, 0], [-1, -3, -1, 2, 6, 6, 26, 0]]) body.add(this.mesh(entityCube(b, 'minecraft:entity/shield/shield_base_nopattern')));
            } else if (part.special?.type === 'minecraft:chest') {
                for (const b of [[1, 0, 1, 14, 10, 14, 0, 19], [1, 9, 1, 14, 5, 14, 0, 0], [7, 7, 15, 2, 4, 1, 0, 0]]) body.add(this.mesh(entityCube(b, 'minecraft:entity/chest/' + part.special.texture!.split(':')[1])));
                body.position.set(-.5, -.5, -.5);
            } else if (model.builtin === 'minecraft:builtin/generated') {
                for (const [index, k] of Object.keys(model.textures).filter(k => /^layer\d+$/.test(k)).sort().entries()) {
                    const c = this.generated(resolveTexture(model.textures[k], model.textures));
                    for (const f of c.faces) f.tintindex = index;
                    body.add(this.mesh(c, part.tints));
                }
                body.position.set(-.5, -.5, -.5);
            } else {
                body.add(this.mesh(iconGeometry(model), part.tints));
                body.position.set(-.5, -.5, -.5);
            }
            const t = model.display?.[context] ?? (left ? model.display?.[first ? 'firstperson_righthand' : 'thirdperson_righthand'] : undefined) ?? {},
                rotation = t.rotation ?? [0, 0, 0], translation = t.translation ?? [0, 0, 0], sign = left ? -1 : 1;
            root.rotation.set(rotation[0] * Math.PI / 180, rotation[1] * sign * Math.PI / 180, rotation[2] * sign * Math.PI / 180);
            root.scale.set(...(t.scale ?? [1, 1, 1]) as [number, number, number]);
            root.position.set(translation[0] * sign / 16, translation[1] / 16, translation[2] / 16);
            body.applyMatrix4(definitionTransform(part.transforms, part.special?.type !== 'minecraft:shield'));
            out.add(root);
        }
        return out;
    }

    /** Advance original texture metadata on the existing render clock, without a second timer or shared-icon mutation.
     * @param {number} milliseconds Current presentation time, independent of save or crafting simulation.
     */
    update(milliseconds: number): void {
        for (const a of this.animations.values()) {
            const frame = animationAt(a.frames, milliseconds).current;
            if (frame === a.last) continue;
            a.last = frame;
            const canvas = a.map.image as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(a.raw, 0, frame * a.raw.width, a.raw.width, a.raw.width, 0, 0, canvas.width, canvas.height);
            a.map.needsUpdate = true;
        }
    }

    /** Dispose instance geometry while retaining bounded shared material/texture caches.
     * @param {Group} root Model instance to release.
     */
    release(root: Group): void {
        root.removeFromParent();
        root.traverse(o => {
            if (o instanceof Mesh) o.geometry.dispose();
        });
    }

    /** Release all preview-owned GPU cache entries. */
    dispose(): void {
        for (const m of this.materials.values()) m.dispose();
        for (const t of this.textures.values()) t.dispose();
        this.materials.clear();
        this.textures.clear();
        this.animations.clear();
    }
}

/** Compose definition transforms in their original model space before hand-centered coordinates.
 * @param {any[]} transforms Native ancestor transforms in order.
 * @param {boolean} centered Whether the leaf geometry was centered from 0..1 coordinates.
 * @return {Matrix4} Equivalent transform in the leaf's current coordinate system.
 */
export function definitionTransform(transforms: any[], centered = true): Matrix4 {
    const m = new Matrix4();
    for (const t of transforms) m.multiply(new Matrix4().makeTranslation(...(t.translation ?? [0, 0, 0]) as [number, number, number]).multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion(...(t.left_rotation ?? [0, 0, 0, 1]) as [number, number, number, number]))).multiply(new Matrix4().makeScale(...(t.scale ?? [1, 1, 1]) as [number, number, number])).multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion(...(t.right_rotation ?? [0, 0, 0, 1]) as [number, number, number, number]))));
    return centered ? new Matrix4().makeTranslation(-.5, -.5, -.5).multiply(m).multiply(new Matrix4().makeTranslation(.5, .5, .5)) : m;
}
