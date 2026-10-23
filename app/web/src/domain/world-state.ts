/** Source acquisition and approved crop stages operate only on transaction-local persistent facts. */
import type {Progress, SceneId, Cell} from './types.ts';
import type {Rules, Stack} from '../rules/types.ts';
import {rolledDrops} from '../rules/harvest.ts';
import {WORLD_SCENES, cropAge, sameCell, caveCleared} from './world-config.ts';

export interface WorldState {
    version: 1;
    tick: number;
    manual: number;
    visits: Record<SceneId, { epoch: number; removed: string[]; roll: number }>;
    hoppers: Record<string, { cooldown: number; lastTick: number }>;
}

/** Initialize independent shared visit identities and scheduler state. @return {WorldState} Explicit world contract. */
export function emptyWorld(): WorldState {
    return {
        version: 1,
        tick: 0,
        manual: 0,
        visits: Object.fromEntries(['plains', 'cave', 'farm', 'home'].map(s => [s, {
            epoch: 0,
            removed: [],
            roll: 0
        }])) as unknown as WorldState['visits'],
        hoppers: {}
    };
}

/** Sample deterministic, reproducible native drop chance using a shared visit counter. @param {WorldState} w World facts. @param {SceneId} scene Current scene. @return {number} Uniform 32-bit fraction. */
function random(w: WorldState, scene: SceneId): number {
    const v = w.visits[scene];
    let n = (++v.roll + v.epoch * 9973 + ['plains', 'cave', 'farm', 'home'].indexOf(scene) * 31337 + 174761) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** Validate the bounded versioned world state and source IDs. @param {WorldState} w Candidate world. */
export function validateWorld(w: WorldState): void {
    if (!w || w.version !== 1 || Object.keys(w).sort().join('|') !== 'hoppers|manual|tick|version|visits' || ![w.tick, w.manual].every(n => Number.isSafeInteger(n) && n >= 0) || !w.visits || Object.keys(w.visits).sort().join('|') !== 'cave|farm|home|plains' || !w.hoppers || Array.isArray(w.hoppers)) throw Error('invalid-world');
    for (const [scene, v] of Object.entries(w.visits) as [SceneId, WorldState['visits'][SceneId]][]) if (Object.keys(v).sort().join('|') !== 'epoch|removed|roll' || ![v.epoch, v.roll].every(n => Number.isSafeInteger(n) && n >= 0) || !Array.isArray(v.removed) || new Set(v.removed).size !== v.removed.length || v.removed.some(id => !WORLD_SCENES[scene].nodes.some(n => n.id === id && n.kind !== 'cow'))) throw Error('invalid-world-visit');
    for (const [id, m] of Object.entries(w.hoppers)) if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || Object.keys(m).sort().join('|') !== 'cooldown|lastTick' || !Number.isInteger(m.cooldown) || m.cooldown < 0 || m.cooldown > 8 || !Number.isSafeInteger(m.lastTick) || m.lastTick < -1 || m.lastTick > w.tick) throw Error('invalid-network-state');
}

/** Harvest the current authored node with the held tool and native chance; cave device cells and compatibility air cannot yield hidden rock.
 * @param {Progress} p Latest progress.
 * @param {SceneId} scene Requested scene.
 * @param {string} node Stable node identity.
 * @param {number} visit Observed visit epoch.
 * @param {Stack|null} held Actual selected carrier.
 * @param {Rules} rules Verified native loot/tool facts.
 * @return {Stack[]} Actual finite loot, possibly empty after destruction with a wrong tool.
 */
export function harvestNode(p: Progress, scene: SceneId, node: string, visit: number, held: Stack | null, rules: Rules): Stack[] {
    if (scene !== p.scene || visit !== p.world.visits[scene].epoch) throw Error('resource-visit-conflict');
    const n = WORLD_SCENES[scene].nodes.find(n => n.id === node), v = p.world.visits[scene];
    if (!n || v.removed.includes(node) || scene === 'cave' && (p.scenes.cave.stations.some(s=>sameCell(s.cell,n.cell)) || caveCleared(p).has(n.cell.join(',')))) throw Error('resource-unavailable');
    if (n.kind === 'cow') {
        if (held?.id !== rules.interactions.milk.input) throw Error('milk-requires-bucket');
        return [{id: rules.interactions.milk.output, count: 1}];
    }
    v.removed.push(node);
    if (n.kind === 'egg') return [{id: 'minecraft:egg', count: 1}];
    return rolledDrops('minecraft:' + n.block, held, rules, () => random(p.world, scene));
}

/** Create one crop only on an empty authored pretilled plot. @param {Progress} p Current progress. @param {Cell} cell Authored plot. @param {string} id Unique crop lifetime. @param {Stack|null} held Actual selected reference. */
export function plantCrop(p: Progress, cell: Cell, id: string, held: Stack | null): void {
    if (p.scene !== 'farm' || held?.id !== 'minecraft:wheat_seeds' || !WORLD_SCENES.farm.plots.some(c => sameCell(c, cell)) || p.scenes.farm.crops.some(c => sameCell(c.cell, cell)) || p.scenes.farm.stations.some(s => sameCell(s.cell, cell)) || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw Error('invalid-plant');
    const selected = p.player.data.selected, seed = p.player.data.hotbar[selected]!;
    p.player.data.hotbar[selected] = seed.count > 1 ? {...seed, count: seed.count - 1} : null;
    p.scenes.farm.crops.push({id, item: 'minecraft:wheat_seeds', cell, growth: {version: 1, data: {ticks: 0}}});
}

/** Harvest the observed crop lifetime and clear its plot atomically. @param {Progress} p Current facts. @param {string} id Actual crop identity. @param {Rules} rules Native drops. @return {Stack[]} Actual mature or immature native loot. */
export function harvestCrop(p: Progress, id: string, rules: Rules): Stack[] {
    if (p.scene !== 'farm') throw Error('wrong-crop-scene');
    const c = p.scenes.farm.crops.find(c => c.id === id);
    if (!c || c.growth.version !== 1) throw Error('crop-unavailable');
    const age = cropAge(c.growth.data.ticks);
    p.scenes.farm.crops = p.scenes.farm.crops.filter(c => c.id !== id);
    return rolledDrops('minecraft:wheat', null, rules, () => random(p.world, 'farm'), age);
}
