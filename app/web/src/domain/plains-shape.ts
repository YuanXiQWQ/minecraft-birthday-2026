/** Deterministic authored plains: intact saved build ground, low terraces and sparse native vegetation. */
import type {Cell} from './types.ts';

/** Finite scenery extends beyond the fog endpoint in every allowed viewing direction. */
export const PLAINS_RADIUS = 144;
/** The established collectible trunks keep their coordinates and nine source identities. */
export const PLAINS_OAKS: Cell[] = [[-6, 0, -3], [-3, 0, -6], [0, 0, -9]];
/** Sparse distant trees frame the meadow without becoming resource nodes. */
export const DISTANT_OAKS = [[-25, -31, 4], [24, -39, 5], [-47, -56, 5], [49, -66, 4], [-59, -19, 4], [9, -78, 5]];
/** Hand-placed broad hill lobes: center, horizontal radii and elevation. */
const HILLS = [[25, -17, 21, 16, 3.7], [-30, -29, 23, 19, 3.8], [-3, -45, 30, 18, 3.3], [38, -58, 27, 24, 3.9], [-49, -69, 31, 24, 3.6], [0, -92, 42, 22, 3.5], [60, 1, 32, 34, 3.3], [-66, 10, 30, 32, 3.4]];

/** Stable coordinate mixing supplies repeatable scatter without mutable random state.
 * @param {number} x World X.
 * @param {number} z World Z.
 * @param {number} salt Independent distribution channel.
 * @return {number} Fraction in [0,1).
 */
export function scatter(x: number, z: number, salt = 0): number {
    let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt + 1, 1274126177);
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

/** Preserve every existing legal floor cell, blending outward into shallow authored hills.
 * @param {number} x Integer block X.
 * @param {number} z Integer block Z.
 * @return {number} Surface elevation in blocks, never above three.
 */
export function plainsHeight(x: number, z: number): number {
    const outside = Math.max(Math.abs(x) - 19, -23 - z, z - 11, 0);
    const blend = Math.min(1, outside / 7);
    let height = 0;
    for (const [cx, cz, rx, rz, peak] of HILLS) {
        const distance = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
        height = Math.max(height, peak * Math.max(0, 1 - distance));
    }
    const surface = Math.max(0, Math.min(3, Math.floor(blend * (height + .22 * Math.sin(x * .31 + z * .19)))));
    const hollow = ((x - 28) / 4) ** 2 + ((z + 17) / 6) ** 2 < 1;
    return hollow ? Math.max(0, surface - 2) : surface;
}

/** Build different layered oak crowns, with clipped corners and offset upper lobes.
 * @param {Cell} base Trunk foot.
 * @param {number} height First leaf level above the foot.
 * @param {number} variant Stable tree identity.
 * @return {Cell[]} Native unit leaf blocks, excluding trunk interiors.
 */
export function oakCrown(base: Cell, height: number, variant: number): Cell[] {
    const cells: Cell[] = [];
    for (let y = 0; y < 3; y++) {
        const radius = y === 2 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) === radius && Math.abs(dz) === radius && (y === 2 || scatter(dx, dz, variant) < .76)) continue;
            if (y === 1 && scatter(dx, dz, variant + 8) < .13) continue;
            const shift = y === 2 && variant % 2 === 1 ? -1 : 0;
            cells.push([base[0] + dx + shift, base[1] + height + y, base[2] + dz]);
        }
    }
    return cells;
}

export interface Plant {block: string; state: string; cell: Cell;}

/** Retain physical supports for saved devices resting on the former authored tree solids.
 * Only persisted elevated devices request these non-collectible native log columns.
 * @param {Cell[]} stations Saved device coordinates.
 * @return {Cell[]} Occupied support cells, omitting devices and original source trunks.
 */
export function retainedPlainsSupports(stations: Cell[]): Cell[] {
    const cells = new Map<string, Cell>();
    for (const [x, y, z] of stations) {
        const oldSolid = [[-6, -3], [-3, -6], [0, -9], [-10, -13], [7, -14], [12, -8]].some(([a, b]) =>
            y - 1 >= 3 && y - 1 <= 5 && Math.abs(x - a) <= 2 && Math.abs(z - b) <= 2 && Math.abs(x - a) + Math.abs(z - b) < (y - 1 === 5 ? 3 : 5) || (b < -10 || a > 5) && x === a && z === b && y > 0 && y <= 4);
        if (!oldSolid) continue;
        for (let h = 0; h < y; h++) {
            if (stations.some(c => c[0] === x && c[1] === h && c[2] === z) || h < 3 && PLAINS_OAKS.some(c => c[0] === x && c[2] === z)) continue;
            const c: Cell = [x, h, z]; cells.set(c.join(','), c);
        }
    }
    return [...cells.values()];
}

/** Scatter native plants in broad uneven patches, protecting sources, eye space and device pads.
 * @param {Cell[]} excluded Natural source cells and persisted device footprints.
 * @return {Plant[]} Pure decoration, including matching tall-grass halves.
 */
export function plainsPlants(excluded: Cell[]): Plant[] {
    const plants: Plant[] = [], flowers = ['dandelion', 'poppy', 'oxeye_daisy', 'cornflower', 'azure_bluet'];
    for (let x = -64; x <= 64; x++) for (let z = -76; z <= 20; z++) {
        if (Math.hypot(x, z - 7) > 78 || x >= 2 && x <= 8 && z >= -5 && z <= 3 || Math.hypot(x, z - 7) < 3) continue;
        if (excluded.some(c => Math.abs(c[0] - x) <= 1 && Math.abs(c[2] - z) <= 1)) continue;
        if (DISTANT_OAKS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 2)) continue;
        const patch = (Math.sin(x * .23 + z * .14) + Math.cos(z * .27 - x * .11) + 2) / 4;
        const density = z > -12 && Math.abs(x) < 12 ? .09 : .04 + patch * .19;
        if (scatter(x, z) > density) continue;
        const y = plainsHeight(x, z), offsetX = (scatter(x, z, 1) - .5) * .45, offsetZ = (scatter(x, z, 2) - .5) * .45;
        const flower = scatter(x, z, 3) < .075, tall = !flower && z < -12 && scatter(x, z, 4) < .12;
        const block = flower ? flowers[Math.floor(scatter(Math.floor(x / 6), Math.floor(z / 5), 5) * flowers.length)] : tall ? 'tall_grass' : 'short_grass';
        plants.push({block, state: tall ? 'half=lower' : '', cell: [x + offsetX, y, z + offsetZ]});
        if (tall) plants.push({block, state: 'half=upper', cell: [x + offsetX, y + 1, z + offsetZ]});
    }
    return plants;
}
