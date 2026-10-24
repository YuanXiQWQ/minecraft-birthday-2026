/** Authored P7 source nodes, protected resource lanes and finite three-dimensional build volumes. */
import {caveFixed, caveNodes, caveLayout, caveClearCells, CAVE_TORCHES} from './cave-shape.ts';
import {retainedPlainsSupports, plainsPlants} from './plains-shape.ts';
import type {Cell, SceneId, PlacementPolicy, Progress} from './types.ts';

export interface NaturalNode {
    id: string;
    block: string;
    cell: Cell;
    kind?: 'egg' | 'cow';
    renderCell?: Cell;
}

export interface WorldScene {
    floor: string;
    sky: string;
    eye: Cell;
    target: Cell;
    nodes: NaturalNode[];
    plots: Cell[];
    build: { min: Cell; max: Cell };
}

/** Construct stable native resource identities from authored coordinates. @param {string} block Native block. @param {Cell[]} cells Positions. @return {NaturalNode[]} Stable source nodes. */
function nodes(block: string, cells: Cell[]): NaturalNode[] {
    return cells.map((cell, i) => ({id: block + ':' + i, block, cell}));
}

/** Shared world-origin spawn reference; every authored view uses the same compass target. */
export const WORLD_COMPASS_TARGET: Cell = [0, 0, 0];

/** Deterministic collectible sources share stable visit identities across the four authored scenes. */
export const WORLD_SCENES: Record<SceneId, WorldScene> = {
    plains: {
        floor: 'grass_block',
        sky: '#98C8ED',
        eye: [0, 1.62, 7],
        target: [0, 1, -5],
        nodes: [...nodes('oak_log', [[-6, 0, -3], [-6, 1, -3], [-6, 2, -3], [-3, 0, -6], [-3, 1, -6], [-3, 2, -6], [0, 0, -9], [0, 1, -9], [0, 2, -9]]), ...nodes('short_grass', Array.from({length: 24}, (_, i) => [i === 8 ? -7 : -6 + i % 8, 0, -1 - Math.floor(i / 8) * 2] as Cell))],
        plots: [],
        build: {min: [2, 0, -4], max: [7, 2, 2]}
    },
    cave: {
        floor: 'stone',
        sky: '#212329',
        eye: [0, 1.62, 7],
        target: [0, 1, -5],
        nodes: caveNodes(),
        plots: [],
        build: {min: [1, 0, -3], max: [7, 2, 2]}
    },
    farm: {
        floor: 'grass_block',
        sky: '#A6D3EC',
        eye: [0, 1.62, 7],
        target: [0, .8, -4],
        nodes: [...nodes('sugar_cane', [[7, 0, -3], [7, 0, -4], [7, 0, -5]]), {
            id: 'cow:0',
            block: 'cow',
            kind: 'cow',
            cell: [2, 0, -5]
        }, {id: 'chicken-egg:0', block: 'egg', kind: 'egg', cell: [4, 0, -2]}, {
            id: 'chicken-egg:1',
            block: 'egg',
            kind: 'egg',
            cell: [5, 0, -3]
        }],
        plots: Array.from({length: 9}, (_, i) => [-5 + i % 3, 0, -2 - Math.floor(i / 3) * 2] as Cell),
        build: {min: [1, 0, 0], max: [5, 2, 2]}
    },
    home: {
        floor: 'oak_planks',
        sky: '#A8BFD0',
        eye: [0, 1.62, 7],
        target: [0, 1, -4],
        nodes: [],
        plots: [],
        build: {min: [3, 0, -2], max: [6, 1, 2]}
    }
};
// Stable meadow sources retain the existing visit schema and all original source identities.
WORLD_SCENES.plains.nodes.push(...plainsPlants(WORLD_SCENES.plains.nodes.map(n=>n.cell)).filter(p=>(p.block==='short_grass'||p.block==='tall_grass'&&p.state==='half=lower') && Math.round(p.cell[0])>=-18 && Math.round(p.cell[0])<=18 && Math.round(p.cell[2])>=-22 && Math.round(p.cell[2])<=10).map(p=>({id:'meadow:'+Math.round(p.cell[0])+':'+Math.round(p.cell[2]),block:p.block,cell:p.cell.map(Math.round) as Cell,renderCell:p.cell})));
/** Admit finite scene cells while protecting actual structure and camera space. */
export const WORLD_REGION: PlacementPolicy = {
    network: true,
    /** Test finite world bounds and real structure/eye collision; support and occupancy belong to domain commands. @param {SceneId} scene Scene identity. @param {Station} station Device candidate. @return {boolean} Region admission. */
    allows: (scene, station) => {
        const [x, y, z] = station.cell;
        return x >= -18 && x <= 18 && z >= -22 && z <= 10 && y >= 0 && y <= 6 && !fixedSolid(scene, station.cell) && !(scene === 'home' && x >= -2 && x <= 1 && z >= -4 && z <= -2 && y <= 1);
    }
};

/** Derive the displayed approved wheat stage from accumulated active ticks. @param {number} ticks Valid active ticks. @return {number} Native age 0/2/5/7. */
export function cropAge(ticks: number): number {
    return ticks >= 240 ? 7 : ticks >= 160 ? 5 : ticks >= 80 ? 2 : 0;
}

/** Stable coordinate equality has no dependence on renderer or pixel size. @param {Cell} a First coordinate. @param {Cell} b Second coordinate. @return {boolean} Exact block identity. */
export function sameCell(a: Cell, b: Cell): boolean {
    return a.every((n, i) => n === b[i]);
}

/** Resolve either occupied half of a paired plant to its single finite source.
 * @param {NaturalNode} node Authored resource.
 * @param {Cell} cell Queried logical cell.
 * @return {boolean} Whether this source occupies the cell.
 */
export function nodeAtCell(node:NaturalNode,cell:Cell):boolean{return sameCell(node.cell,cell)||node.block==='tall_grass'&&sameCell([node.cell[0],node.cell[1]+1,node.cell[2]],cell);}

/** Match actual authored decorative solids rather than excluding whole resource lanes.
 * @param {SceneId} scene Current finite scene.
 * @param {Cell} cell Candidate coordinate.
 * @return {boolean} Whether unbreakable authored structure occupies the cell.
 */
export function fixedSolid(scene: SceneId, cell: Cell): boolean {
    const [x, y, z] = cell;
    if (scene === 'plains') return false;
    if (scene === 'cave') return caveFixed(cell);
    if (scene === 'home') return z === -9 && x >= -11 && x <= 11 && y < 6 && !(Math.abs(x) < 4 && y > 1 && y < 5) || Math.abs(x) === 11 && z >= -8 && z <= 5 && y < 6;
    if (scene === 'farm') return z === -12 && x >= -10 && x <= -7 && y < 4 || [-11, -6].includes(x) && z >= -12 && z <= -8 && y < 4 || y === 4 && x >= -11 && x <= -6 && z >= -12 && z <= -8;
    return false;
}

/** Read occupancy and support from actual persistent, natural and decorative cells.
 * @param {Progress} p Latest shared facts.
 * @param {Cell} cell Candidate coordinate.
 * @return {boolean} Whether an actual solid supports the bottom face.
 */
export function supported(p: Progress, cell: Cell): boolean {
    if(p.scenes[p.scene].blocks?.some(b=>sameCell(b.cell,[cell[0],cell[1]-1,cell[2]])))return true;
    if (cell[1] === 0) return !(p.scene === 'farm' && cell[0] === 8 && cell[2] >= -5 && cell[2] <= 0);
    const below: Cell = [cell[0], cell[1] - 1, cell[2]], scene = p.scene;
    return p.scenes[scene].stations.some(s => sameCell(s.cell, below)) || scene === 'plains' && retainedPlainsSupports(p.scenes.plains.stations.map(s => s.cell)).some(c => sameCell(c, below)) || fixedSolid(scene, below) && !(scene === 'cave' && caveCleared(p).has(below.join(','))) || WORLD_SCENES[scene].nodes.some(n => !n.kind && !['short_grass', 'tall_grass', 'sugar_cane'].includes(n.block) && sameCell(n.cell, below) && !p.world.visits[scene].removed.includes(n.id) && !(scene === 'cave' && caveCleared(p).has(n.cell.join(','))));
}

/** Keep live resource/crop, supported cave decoration and retained support occupancy separate from cleared terrain.
 * @param {Progress} p Latest scene facts.
 * @param {Cell} cell Candidate cell.
 * @return {boolean} Whether a resource, crop, supported decoration or retained support occupies it.
 */
export function sourceOccupied(p: Progress, cell: Cell): boolean {
    if(p.scenes[p.scene].blocks?.some(b=>sameCell(b.cell,cell)))return true;
    if (p.scene === 'cave' && CAVE_TORCHES.some(t => sameCell(t.cell, cell)) && caveLayout(p.scenes.cave.stations.map(s => s.cell), WORLD_SCENES.cave.eye, caveExcavated(p)).torches.some(t => sameCell(t.cell, cell))) return true;
    return p.scene === 'plains' && retainedPlainsSupports(p.scenes.plains.stations.map(s => s.cell)).some(c => sameCell(c, cell)) || p.scenes[p.scene].crops.some(c => sameCell(c.cell, cell)) || WORLD_SCENES[p.scene].nodes.some(n => nodeAtCell(n, cell) && !p.world.visits[p.scene].removed.includes(n.id) && !(p.scene === 'cave' && caveCleared(p).has(n.cell.join(','))));
}

/** Resolve durable cave excavation without encoding geometry or resources into saves.
 * @param {Progress} p Current shared facts.
 * @return {Cell[]} Removed source coordinates.
 */
export function caveExcavated(p: Progress): Cell[] {
    const removed=new Set(p.world.visits.cave.removed);
    return WORLD_SCENES.cave.nodes.filter(n=>removed.has(n.id)).map(n=>n.cell);
}
/** Protect saved device access using the same carved cells as the renderer.
 * @param {Progress} p Current shared facts.
 * @return {Set<string>} Compatibility air, excluding actively excavated station placements.
 */
export function caveCleared(p: Progress): Set<string> {
    return caveClearCells(p.scenes.cave.stations.map(s=>s.cell), WORLD_SCENES.cave.eye, caveExcavated(p));
}
