/** Native unit terrain batches retain only exposed original faces, including grass side overlays. */
import type {Cell} from '../domain/types.ts';
import type {CompiledModel, Face} from './model-format.ts';
import {PLAINS_RADIUS, plainsHeight} from '../domain/plains-shape.ts';

export interface TerrainBatch {block: string; faces: Face[]; cells: Cell[];}

/** Enumerate finite terrain surfaces; hidden interiors remain logically filled by the height field.
 * @return {TerrainBatch[]} Groups sharing native material and exposed-face masks.
 */
export function plainsTerrain(): TerrainBatch[] {
    const batches = new Map<string, TerrainBatch>();
    for (let x = -PLAINS_RADIUS; x <= PLAINS_RADIUS; x++) for (let z = -PLAINS_RADIUS; z <= PLAINS_RADIUS; z++) {
        if (Math.hypot(x, z) > PLAINS_RADIUS + 3 * Math.sin(x * .17)) continue;
        const h = plainsHeight(x, z), neighbors: [Face, number][] = [['west', plainsHeight(x - 1, z)], ['east', plainsHeight(x + 1, z)], ['north', plainsHeight(x, z - 1)], ['south', plainsHeight(x, z + 1)]];
        for (let y = -1; y < h; y++) {
            const top = y === h - 1, faces: Face[] = top ? ['up'] : [];
            for (const [face, height] of neighbors) if (height <= y) faces.push(face);
            if (!faces.length) continue;
            const block = top ? 'grass_block' : 'dirt', key = block + ':' + faces.join(',');
            if (!batches.has(key)) batches.set(key, {block, faces, cells: []});
            batches.get(key)!.cells.push([x, y, z]);
        }
    }
    return [...batches.values()];
}

/** Select whole native quads without changing UVs, material groups, tint or alpha.
 * @param {CompiledModel} source Complete same-version model.
 * @param {Face[]} faces Exposed directions.
 * @return {CompiledModel} Owned compact compiled geometry.
 */
export function exposedModel(source: CompiledModel, faces: Face[]): CompiledModel {
    const result: CompiledModel = {positions: [], normals: [], uvs: [], indices: [], faces: [], textures: [...source.textures]};
    source.faces.forEach((face, index) => {
        if (!faces.includes(face.cullface ?? face.direction)) return;
        const vertex = result.positions.length / 3;
        result.positions.push(...source.positions.slice(index * 12, index * 12 + 12));
        result.normals.push(...source.normals.slice(index * 12, index * 12 + 12));
        result.uvs.push(...source.uvs.slice(index * 8, index * 8 + 8));
        result.indices.push(...source.indices.slice(index * 6, index * 6 + 6).map(i => i - index * 4 + vertex));
        result.faces.push({...face});
    });
    return result;
}
