/** Bounded Minecraft-style model conversion; no Minecraft data or textures are bundled here. */
import {Matrix4, Vector3} from 'three';
import type {Cell} from '../domain/types.ts';

export type Face = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';

export interface ModelFace {
    texture: string;
    uv?: [number, number, number, number];
    rotation?: number;
    cullface?: Face;
    tintindex?: number;
}

export interface ModelElement {
    from: Cell;
    to: Cell;
    faces: Partial<Record<Face, ModelFace>>;
    rotation?: unknown;
    shade_direction_override?: Face;
}

export interface ModelSource {
    parent?: string;
    textures?: Record<string, string>;
    elements?: ModelElement[];
    display?: Record<string, { rotation?: Cell; translation?: Cell; scale?: Cell }>;
}

export interface Variant {
    model: string;
    x?: number;
    y?: number;
    uvlock?: boolean;
    weight?: number;
}

export interface CompiledModel {
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
    faces: { direction: Face; texture: string; cullface?: Face; tintindex?: number; shadeDirection?: Face }[];
    textures: string[];
}

/** Normalize namespaced model/texture identifiers without treating them as filesystem paths.
 * @param {string} id Resource identifier.
 * @return {string} Valid namespaced identifier.
 */
export function resourceId(id: string): string {
    const full = id.includes(':') ? id : `minecraft:${id}`;
    if (!/^[a-z0-9_.-]+:[a-z0-9_/-]+$/.test(full) || full.includes('..')) throw new Error('invalid-resource-id');
    return full;
}

/** Resolve a bounded parent chain, preserving child texture/display overrides and element replacement.
 * @param {string} id Root model.
 * @param {Function} load Read-only model loader.
 * @param {string[]} chain Ancestors for cycle rejection.
 * @return {ModelSource} Inherited model description.
 */
export function resolveModel(id: string, load: (id: string) => ModelSource, chain: string[] = []): ModelSource {
    id = resourceId(id);
    if (chain.includes(id) || chain.length >= 32) throw new Error('model-parent-cycle');
    const own = load(id);
    const parent = own.parent ? resolveModel(own.parent, load, [...chain, id]) : {};
    return {
        ...parent, ...own,
        textures: {...parent.textures, ...own.textures},
        display: {...parent.display, ...own.display},
        elements: own.elements ?? parent.elements
    };
}

/** Resolve texture-variable indirection with explicit cycle and missing-reference errors.
 * @param {string} ref Texture variable or resource ID.
 * @param {Record<string,string>} textures Merged texture dictionary.
 * @return {string} Resolved namespaced texture.
 */
export function resolveTexture(ref: string, textures: Record<string, string>): string {
    const visited = new Set<string>();
    while (ref.startsWith('#')) {
        if (visited.has(ref) || !textures[ref.slice(1)]) throw new Error('texture-reference-cycle-or-missing');
        visited.add(ref);
        ref = textures[ref.slice(1)];
    }
    return resourceId(ref);
}

/** Emit an outward-wound quad for one element face.
 * @param {Cell} a Minimum corner in model pixels.
 * @param {Cell} b Maximum corner in model pixels.
 * @param {Face} face Face direction.
 * @return {Cell[]} Four outward-wound positions.
 */
function corners(a: Cell, b: Cell, face: Face): Cell[] {
    const [x, y, z] = a, [X, Y, Z] = b;
    return {
        east: [[X, y, Z], [X, y, z], [X, Y, z], [X, Y, Z]], west: [[x, y, z], [x, y, Z], [x, Y, Z], [x, Y, z]],
        up: [[x, Y, Z], [X, Y, Z], [X, Y, z], [x, Y, z]], down: [[x, y, z], [X, y, z], [X, y, Z], [x, y, Z]],
        north: [[X, y, z], [x, y, z], [x, Y, z], [X, Y, z]], south: [[x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]]
    }[face] as Cell[];
}

/** Calculate implicit per-face UV bounds; visual parity still requires textured client comparison.
 * @param {ModelElement} e Model element.
 * @param {Face} face Face direction.
 * @return {number[]} Pixel UV rectangle.
 */
function defaultUV(e: ModelElement, face: Face): number[] {
    const [x, y, z] = e.from, [X, Y, Z] = e.to;
    return {
        down: [x, 16 - Z, X, 16 - z], up: [x, z, X, Z], north: [16 - X, 16 - Y, 16 - x, 16 - y],
        south: [x, 16 - Y, X, 16 - y], west: [z, 16 - Y, Z, 16 - y], east: [16 - Z, 16 - Y, 16 - z, 16 - y]
    }[face];
}

/** Convert supported element quads and blockstate rotations into unit-sized indexed geometry.
 * @param {ModelSource} model Inherited model.
 * @param {Variant} variant Blockstate rotation; UV-lock remains explicitly unsupported.
 * @return {CompiledModel} Geometry data plus resolved material dependencies.
 */
export function compileModel(model: ModelSource, variant: Variant = {model: 'debug:fixture'}): CompiledModel {
    if (!model.elements || model.elements.length > 512 || variant.uvlock) throw new Error('unsupported-model-or-uvlock');
    if (![0, 90, 180, 270].includes(variant.x ?? 0) || ![0, 90, 180, 270].includes(variant.y ?? 0)) throw new Error('unsupported-blockstate-rotation');
    const result: CompiledModel = {positions: [], normals: [], uvs: [], indices: [], faces: [], textures: []};
    const rotate = new Matrix4().makeRotationY(-(variant.y ?? 0) * Math.PI / 180)
        .multiply(new Matrix4().makeRotationX(-(variant.x ?? 0) * Math.PI / 180));
    for (const e of model.elements) {
        let element = new Matrix4();
        if (e.rotation) {
            const r = e.rotation as { origin: Cell; axis: string; angle: number; rescale?: boolean };
            if (!Array.isArray(r.origin) || r.origin.length !== 3 || !r.origin.every(Number.isFinite) || !['x', 'y', 'z'].includes(r.axis) || ![-45, -22.5, 0, 22.5, 45].includes(r.angle)) throw new Error('unsupported-element-rotation');
            const axis = new Vector3(r.axis === 'x' ? 1 : 0, r.axis === 'y' ? 1 : 0, r.axis === 'z' ? 1 : 0),
                origin = new Vector3(...r.origin).multiplyScalar(1 / 16), scale = new Vector3(1, 1, 1);
            if (r.rescale) {
                const n = 1 / Math.cos(r.angle * Math.PI / 180);
                scale.set(r.axis === 'x' ? 1 : n, r.axis === 'y' ? 1 : n, r.axis === 'z' ? 1 : n);
            }
            element = new Matrix4().makeTranslation(...origin.toArray()).multiply(new Matrix4().makeRotationAxis(axis, r.angle * Math.PI / 180)).multiply(new Matrix4().makeScale(...scale.toArray())).multiply(new Matrix4().makeTranslation(...origin.clone().negate().toArray()));
        }
        if (![...e.from, ...e.to].every(Number.isFinite) || e.from.some((v, i) => v > e.to[i])) throw new Error('invalid-element');
        for (const [name, f] of Object.entries(e.faces) as [Face, ModelFace][]) {
            if (!['up', 'down', 'north', 'south', 'east', 'west'].includes(name)) throw new Error('invalid-face');
            const points = corners(e.from, e.to, name).map(p => new Vector3(...p).multiplyScalar(1 / 16).applyMatrix4(element).subScalar(.5).applyMatrix4(rotate).addScalar(.5));
            const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
            const [u, v, U, V] = f.uv ?? defaultUV(e, name), turn = (f.rotation ?? 0) / 90;
            if (!Number.isInteger(turn) || turn < 0 || turn > 3) throw new Error('unsupported-face-rotation');
            const uv = [[u, V], [U, V], [U, v], [u, v]];
            const start = result.positions.length / 3;
            points.forEach((p, i) => {
                result.positions.push(...p.toArray());
                result.normals.push(...normal.toArray());
                result.uvs.push(uv[(i + turn) % 4][0] / 16, 1 - uv[(i + turn) % 4][1] / 16);
            });
            result.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
            result.faces.push({
                direction: name,
                texture: resolveTexture(f.texture, model.textures ?? {}),
                cullface: f.cullface,
                tintindex: f.tintindex,
                shadeDirection: e.shade_direction_override
            });
        }
    }
    result.textures = [...new Set(result.faces.map(f => f.texture))];
    return result;
}
