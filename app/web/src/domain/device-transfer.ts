/** Atomic finite device-port plans are independent of spatial adjacency and network scheduling. */
import type {Progress, WorkbenchContext, Station} from './types.ts';
import type {Rules, Stack} from '../rules/types.ts';
import {identity, quickMove} from './slots.ts';
import type {SlotValue} from './slots.ts';
import {extractFurnacePort, insertFurnacePort} from './furnace.ts';
import type {FurnaceKind, FurnaceContents} from './furnace.ts';
import type {HopperContents} from './hopper.ts';

export type PortFace = 'up' | 'side' | 'down';

export interface TransferEnd {
    context: WorkbenchContext;
    face: PortFace;
}

export interface TransferPlan {
    source: TransferEnd & { index: number };
    target: TransferEnd;
    count: number;
}

/** Resolve exact finite cells while excluding autonomous furnace timers from the manual-edit precondition.
 * @param {Progress} p Transaction-local progress.
 * @param {TransferEnd} end Requested existing instance and face.
 * @return {Station} Valid coordinated endpoint.
 */
function endpoint(p: Progress, end: TransferEnd): Station {
    if (!end || !['up', 'side', 'down'].includes(end.face)) throw Error('invalid-device-port');
    const station = p.scenes[end.context.scene]?.stations.find(s => s.id === end.context.id);
    if (!station || !['hopper', 'furnace', 'blast_furnace'].includes(station.kind) || station.contents.version !== end.context.expected.version) throw Error('station-unavailable');
    const a = station.contents, b = end.context.expected;
    if (a.version === 3 && b.version === 3) {
        if (identity(a) !== identity(b)) throw Error('station-content-conflict');
    } else if (a.version === 2 && b.version === 2) {
        if (identity([a.data.input, a.data.fuel, a.data.output]) !== identity([b.data.input, b.data.fuel, b.data.output])) throw Error('station-content-conflict');
    } else throw Error('invalid-device-port');
    return station;
}

/** Extract at most a bounded finite offer, using each native face's permissions.
 * @param {Station} station Source endpoint.
 * @param {PortFace} face Access face.
 * @param {number} index Source slot.
 * @param {number} count Maximum finite units.
 * @param {Rules} rules Native policy.
 * @return {{contents:FurnaceContents|HopperContents,stack:Stack|null}} Independent source plan.
 */
function extract(station: Station, face: PortFace, index: number, count: number, rules: Rules): {
    contents: FurnaceContents | HopperContents;
    stack: Stack | null
} {
    if (station.contents.version === 2) return extractFurnacePort(station.contents, face, index, count, station.kind as FurnaceKind, rules);
    if (station.contents.version !== 3 || index < 0 || index > 4) throw Error('invalid-device-port');
    const contents = structuredClone(station.contents), s = contents.data.slots[index];
    if (!s) return {contents, stack: null};
    const n = Math.min(count, s.count);
    contents.data.slots[index] = n === s.count ? null : {...s, count: s.count - n};
    return {contents, stack: {...s, count: n}};
}

/** Plan and apply one source/destination transaction to already cloned, validated progress; discovery is handled by the caller.
 * @param {Progress} p Transaction-local progress.
 * @param {TransferPlan} plan Bounded intent with observed endpoints.
 * @param {Rules} rules Audited native data.
 * @return {{moved:number,acquired:string[],recipe?:string}} Finite movement and producer acquisition provenance.
 */
export function transferDevices(p: Progress, plan: TransferPlan, rules: Rules): {
    moved: number;
    acquired: string[];
    recipe?: string
} {
    if (!Number.isSafeInteger(plan.count) || plan.count < 1 || plan.count > 64 || !Number.isSafeInteger(plan.source?.index)) throw Error('invalid-transfer-count');
    if (plan.source.context.scene !== plan.target.context.scene || plan.source.context.id === plan.target.context.id) throw Error('invalid-transfer-endpoints');
    const source = endpoint(p, plan.source), target = endpoint(p, plan.target),
        offer = extract(source, plan.source.face, plan.source.index, plan.count, rules);
    if (!offer.stack) return {moved: 0, acquired: []};
    let moved = 0, next: FurnaceContents | HopperContents;
    if (target.contents.version === 2) {
        const inserted = insertFurnacePort(target.contents, target.kind as FurnaceKind, plan.target.face, offer.stack, rules);
        moved = inserted.moved;
        next = inserted.contents;
    } else if (target.contents.version === 3) {
        next = structuredClone(target.contents);
        const carrier: SlotValue = {stack: structuredClone(offer.stack), policy: {take: true, place: false}};
        quickMove(carrier, next.data.slots.map((_, i) => ({
            /** Read target group. @return {Stack|null} Actual finite content. */get stack() {
                return (next as HopperContents).data.slots[i];
            }, /** Set target group. @param {Stack|null} s Accepted group. */set stack(s) {
                (next as HopperContents).data.slots[i] = s;
            }, policy: {take: true, place: true}
        })), rules);
        moved = offer.stack.count - (carrier.stack?.count ?? 0);
    } else throw Error('invalid-device-port');
    if (!moved) return {moved: 0, acquired: []};
    const produced = source.contents.version === 2 && plan.source.index === 2,
        recipe = produced && source.contents.version === 2 ? source.contents.data.outputRecipe ?? undefined : undefined;
    source.contents = extract(source, plan.source.face, plan.source.index, moved, rules).contents;
    target.contents = next;
    return {moved, acquired: produced ? [offer.stack.id] : [], recipe};
}
