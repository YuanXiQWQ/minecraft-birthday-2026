/** Render the shared farm layout with exact native states and explicit roof metadata; fluid meshes have independent ownership. */
import {Group} from 'three';
import type {AuthoredWorld} from './authored-world.ts';
import {currentFarm} from '../domain/farm-shape.ts';
import type {Cell, Progress} from '../domain/types.ts';
import type {Face} from './model-format.ts';
import {exposedModel} from './plains-terrain.ts';
import {placedModel} from './placed-world.ts';

/** Rebuild only geometry-changing farm snapshots; native crop meshes remain independently owned.
 * @param {AuthoredWorld} world Shared model/material owner.
 * @param {Group} parent Farm static layer.
 * @param {Progress} p Durable positions.
 * @return {Cell[]} Effective lantern emitters.
 */
export function buildFarm(world: AuthoredWorld, parent: Group, p: Progress): Cell[] {
    const layout = currentFarm(p), batches = new Map<string, {block: string; state: string; faces: Face[]; cells: Cell[]}>();
    for (const b of layout.cells.values()) {
        const [x, y, z] = b.cell;
        if (b.block === 'farmland') {
            const root = world.block('farmland', 'moisture='+b.state.moisture); root.position.set(...b.cell);
            root.userData = {id: 'plot:' + [x, y+1, z].join(','), cell: b.cell, cells: [b.cell], rainTops: [b.rainTop], block: b.block, state: b.state};
            parent.add(root); continue;
        }
        if (y < 0 || b.block === 'grass_block' || b.block === 'dirt') {
            if (b.block === 'water') continue;
            const faces: Face[] = [];
            for (const [face, dx, dy, dz] of [['up', 0, 1, 0], ['west', -1, 0, 0], ['east', 1, 0, 0], ['north', 0, 0, -1], ['south', 0, 0, 1]] as const) {
                const n = layout.cells.get([x + dx, y + dy, z + dz].join(','));
                if (!n || n.block === 'water' || n.rainTop < y + 1 || !['grass_block', 'dirt', 'dirt_path', 'farmland'].includes(n.block)) faces.push(face);
            }
            if (!faces.length) continue;
            const state = b.block === 'grass_block' ? 'snowy=false' : '', key = b.block + state + faces.join(',');
            if (!batches.has(key)) batches.set(key, {block: b.block, state, faces, cells: []});
            batches.get(key)!.cells.push(b.cell); continue;
        }
        // The existing native construction compiler evaluates multipart predicates and native collision shapes.
        const root = placedModel({id: 'scenery', block: b.block, cell: b.cell, state: b.state}, world.resources, world.models);
        root.userData.support = b.support; root.userData.cells = [b.cell]; root.userData.rainTops = [b.rainTop];
        root.userData.collision = b.block !== 'lantern' && x >= -18 && x <= 18 && z >= -22 && z <= 10;
        if (x < -18 || x > 18 || z < -22 || z > 10) root.traverse(o => o.layers.set(1));
        parent.add(root);
    }
    for (const b of batches.values()) {
        const sample = world.resources.samples.find(s => s.block === b.block && s.state === b.state);
        if (!sample) throw Error('farm-state:' + b.block + b.state);
        for (const reachable of [true, false]) {
            const cells = b.cells.filter(([x,,z]) => (x >= -18 && x <= 18 && z >= -22 && z <= 10) === reachable);
            if (!cells.length) continue;
            world.batch(b.block, cells, parent, reachable ? 'ground' : 'decoration', b.state, {...sample, compiled: exposedModel(sample.compiled, b.faces)});
            const mesh = parent.children.at(-1)!;
            mesh.userData.collision = reachable;
            mesh.userData.rainTops = cells.map(c => layout.cells.get(c.join(','))!.rainTop);
        }
    }
    return layout.lights;
}
