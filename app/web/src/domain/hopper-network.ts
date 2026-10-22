/** Deterministic finite hopper scheduling derives every connection inside the authoritative tick transaction. */
import type {Progress, Station, SceneId, Cell, Facing} from './types.ts';
import type {Rules} from '../rules/types.ts';
import {furnacePortAllows} from './furnace.ts';
import {transferDevices} from './device-transfer.ts';
import type {TransferPlan} from './device-transfer.ts';
import {sameCell} from './world-config.ts';

/** Native destination displacement; hopper has no upward output. */
export const PORT_VECTOR: Record<Facing, Cell> = {
    down: [0, -1, 0],
    north: [0, 0, -1],
    south: [0, 0, 1],
    west: [-1, 0, 0],
    east: [1, 0, 0]
};

/** Verify an explicit legacy port plan when used under the formal world policy. @param {Progress} p Latest facts. @param {TransferPlan} plan Requested endpoints. @return {boolean} Real native neighbor/face relationship and one-item transfer. */
export function adjacentTransfer(p: Progress, plan: TransferPlan): boolean {
    if (plan.count !== 1 || plan.source.context.scene !== plan.target.context.scene) return false;
    const list = p.scenes[plan.source.context.scene].stations, a = list.find(s => s.id === plan.source.context.id),
        b = list.find(s => s.id === plan.target.context.id);
    if (!a || !b) return false;
    if (a.kind === 'hopper') {
        const d = PORT_VECTOR[a.facing];
        if (sameCell(a.cell.map((n, i) => n + d[i]) as Cell, b.cell) && plan.target.face === (d[1] === -1 ? 'up' : 'side')) return true;
    }
    return b.kind === 'hopper' && sameCell([b.cell[0], b.cell[1] + 1, b.cell[2]], a.cell) && plan.source.face === 'down' && plan.target.face === 'up';
}

/** Advance each hopper once in persisted scene order, pushing before pulling and coordinating the native 8/7 tick receive delay.
 * @param {Progress} p Transaction-local state.
 * @param {Rules} rules Native capacities/ports.
 * @param {Function} acquired Successful producer receipt recorder.
 */
export function tickHoppers(p: Progress, rules: Rules, acquired: (ids: string[], recipe?: string) => void): void {
    const world = p.world,
        live = new Set(Object.values(p.scenes).flatMap(s => s.stations.filter(d => d.kind === 'hopper').map(d => d.id)));
    for (const id of Object.keys(world.hoppers)) if (!live.has(id)) delete world.hoppers[id];
    for (const [scene, value] of Object.entries(p.scenes) as [SceneId, Progress['scenes'][SceneId]][]) {
        const list = value.stations, active = new Set(list.filter(s => s.kind === 'hopper').map(s => s.id));

        /** Try the first accessible finite source slot and record only a successful movement. @param {Station} a Actual source. @param {Station} b Actual target. @param {'up'|'side'|'down'} sourceFace Access face. @param {'up'|'side'|'down'} targetFace Access face. @return {boolean} One item moved. */
        function move(a: Station, b: Station, sourceFace: 'up' | 'side' | 'down', targetFace: 'up' | 'side' | 'down'): boolean {
            const slots = a.kind === 'hopper' ? [0, 1, 2, 3, 4] : [2, 1];
            for (const index of slots) {
                const offered = a.contents.version === 3 ? a.contents.data.slots[index] : a.contents.version === 2 ? (index === 2 ? a.contents.data.output : a.contents.data.fuel) : null;
                if (!offered) continue;
                if (a.contents.version === 2 && !furnacePortAllows(a.contents.data, sourceFace, index, offered, 'extract', rules)) continue;
                const wasEmpty = b.contents.version === 3 && b.contents.data.slots.every(s => !s),
                    r = transferDevices(p, {
                        source: {
                            context: {scene, id: a.id, expected: structuredClone(a.contents)},
                            face: sourceFace,
                            index
                        },
                        target: {context: {scene, id: b.id, expected: structuredClone(b.contents)}, face: targetFace},
                        count: 1
                    }, rules);
                if (!r.moved) continue;
                if (b.kind === 'hopper' && wasEmpty) {
                    const meta = world.hoppers[b.id] ??= {cooldown: 0, lastTick: -1}, sourceMeta = world.hoppers[a.id];
                    if (meta.cooldown <= 8) meta.cooldown = 8 - (a.kind === 'hopper' && sourceMeta && meta.lastTick >= sourceMeta.lastTick ? 1 : 0);
                }
                if (r.acquired.length || r.recipe) acquired(r.acquired, r.recipe);
                return true;
            }
            return false;
        }

        for (const h of list) {
            if (!active.has(h.id)) continue;
            const meta = world.hoppers[h.id] ??= {cooldown: 0, lastTick: -1};
            meta.cooldown = Math.max(0, meta.cooldown - 1);
            meta.lastTick = world.tick;
            if (meta.cooldown) continue;
            const d = PORT_VECTOR[h.facing], cell = h.cell.map((n, i) => n + d[i]) as Cell,
                target = list.find(s => sameCell(s.cell, cell));
            let changed = false;
            if (target && ['hopper', 'furnace', 'blast_furnace'].includes(target.kind)) changed = move(h, target, 'side', d[1] === -1 ? 'up' : 'side');
            const above = list.find(s => sameCell(s.cell, [h.cell[0], h.cell[1] + 1, h.cell[2]]));
            if (above && ['hopper', 'furnace', 'blast_furnace'].includes(above.kind)) changed = move(above, h, 'down', 'up') || changed;
            if (changed) meta.cooldown = 8;
        }
    }
}
