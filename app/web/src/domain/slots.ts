/** Bounded vanilla-style temporary slots; policies and stack identity are independent of menus and rendering. */
import type {Stack, ItemRule} from '../rules/types.ts';

export type ItemRules = { items: Record<string, Pick<ItemRule, 'maxStack' | 'maxDamage' | 'equipment'>> };

export interface SlotPolicy {
    take: boolean;
    place: boolean;
    limit?: number;
    limitFor?: (stack: Stack) => number;
    equipment?: string;
    accepts?: (stack: Stack) => boolean;
}

export interface SlotValue {
    stack: Stack | null;
    policy: SlotPolicy;
}

/** Normalize JSON component identity without treating key order as a stack difference.
 * @param {unknown} value JSON component payload.
 * @return {string} Canonical identity.
 */
export function identity(value: unknown): string {
    if (value === undefined) return '{}';
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) return '[' + value.map(identity).join(',') + ']';
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + identity((value as Record<string, unknown>)[k])).join(',') + '}';
    throw Error('unsupported-component-value');
}

/** Compare both native item and complete explicit component payloads.
 * @param {Stack} a First stack.
 * @param {Stack} b Second stack.
 * @param {ItemRules} rules Optional native defaults for damageable identities.
 * @return {boolean} Whether quantities may merge.
 */
export function sameStack(a: Stack, b: Stack, rules?: ItemRules): boolean {
    if (a.id !== b.id) return false;
    const x = {...a.components}, y = {...b.components};
    if (rules?.items[a.id]?.maxDamage) {
        if (x['minecraft:damage'] === 0) delete x['minecraft:damage'];
        if (y['minecraft:damage'] === 0) delete y['minecraft:damage'];
    }
    return identity(x) === identity(y);
}

/** Resolve capacity only after the destination's placement and equipment predicates accept the item.
 * @param {SlotValue} slot Destination.
 * @param {Stack} stack Incoming stack.
 * @param {ItemRules} rules Original limits, including an item-dependent native slot limit when present.
 * @return {number} Accepted maximum, or zero.
 */
export function capacity(slot: SlotValue, stack: Stack, rules: ItemRules): number {
    const p = slot.policy, r = rules.items[stack.id];
    return !r || !p.place || p.equipment && r.equipment !== p.equipment || p.accepts && !p.accepts(stack) ? 0 : Math.min(r.maxStack, p.limitFor?.(stack) ?? p.limit ?? r.maxStack);
}

/** Apply pickup, split, merge or a permitted whole-stack exchange in a single slot.
 * @param {SlotValue} slot Mutable transaction-local slot.
 * @param {Stack|null} cursor Carried stack.
 * @param {0|2} button Left or right mouse button.
 * @param {ItemRules} rules Original limits.
 * @return {Stack|null} Resulting carried stack.
 */
export function pickup(slot: SlotValue, cursor: Stack | null, button: 0 | 2, rules: ItemRules): Stack | null {
    const target = slot.stack;
    if (!cursor) {
        if (!target || !slot.policy.take) return null;
        const n = button === 2 ? Math.ceil(target.count / 2) : target.count;
        slot.stack = n === target.count ? null : {...target, count: target.count - n};
        return {...target, count: n};
    }
    const cap = capacity(slot, cursor, rules);
    if (!cap) return cursor;
    if (!target || sameStack(cursor, target, rules)) {
        const n = Math.max(0, Math.min(button === 2 ? 1 : cursor.count, cap - (target?.count ?? 0)));
        if (n) slot.stack = {...cursor, count: (target?.count ?? 0) + n};
        return n === cursor.count ? null : {...cursor, count: cursor.count - n};
    }
    if (slot.policy.take && cursor.count <= cap) {
        slot.stack = cursor;
        return target;
    }
    return cursor;
}

/** Distribute once per accepted slot; never replenish a finite cursor from the infinite catalogue.
 * @param {SlotValue[]} slots Unique visited destinations in visit order.
 * @param {Stack|null} cursor Original carried stack.
 * @param {'left'|'right'|'middle'} mode Distribution kind.
 * @param {ItemRules} rules Original limits.
 * @return {Stack|null} Unallocated remainder; creative middle drag retains its cursor.
 */
export function distribute(slots: SlotValue[], cursor: Stack | null, mode: 'left' | 'right' | 'middle', rules: ItemRules): Stack | null {
    if (!cursor) return null;
    const accepted = slots.filter(s => capacity(s, cursor, rules) > (s.stack?.count ?? 0) && (!s.stack || sameStack(s.stack, cursor, rules))),
        valid = mode === 'middle' ? accepted : accepted.slice(0, cursor.count);
    const each = mode === 'left' ? Math.floor(cursor.count / valid.length) : 1;
    let remaining = cursor.count;
    for (const slot of valid) {
        const cap = capacity(slot, cursor, rules), before = slot.stack?.count ?? 0,
            n = mode === 'middle' ? cap - before : Math.min(remaining, cap - before, each);
        if (n > 0) slot.stack = {...cursor, count: before + n};
        if (mode !== 'middle') remaining -= n;
    }
    return mode === 'middle' ? cursor : remaining ? {...cursor, count: remaining} : null;
}

/** Move into ordered finite destinations, merging existing groups before empty cells.
 * @param {SlotValue} source Finite source with pickup permission.
 * @param {SlotValue[]} targets Finite destination snapshot, excluding source.
 * @param {ItemRules} rules Original limits.
 */
export function quickMove(source: SlotValue, targets: SlotValue[], rules: ItemRules): void {
    if (!source.policy.take || !source.stack) return;
    for (const empty of [false, true]) for (const slot of targets) {
        const held: Stack | null = source.stack;
        if (!held) return;
        if ((slot.stack === null) !== empty || slot.stack && !sameStack(slot.stack, held, rules)) continue;
        const n = Math.max(0, Math.min(held.count, capacity(slot, held, rules) - (slot.stack?.count ?? 0)));
        if (n) {
            slot.stack = {...held, count: (slot.stack?.count ?? 0) + n};
            source.stack = n === held.count ? null : {...held, count: held.count - n};
        }
    }
}

/** Collect matching finite groups to one native maximum, preferring partial groups before full ones.
 * @param {SlotValue[]} slots Finite ordered sources.
 * @param {Stack|null} cursor Carried identity.
 * @param {ItemRules} rules Original limits.
 * @return {Stack|null} Collected carried stack.
 */
export function collect(slots: SlotValue[], cursor: Stack | null, rules: ItemRules): Stack | null {
    if (!cursor) return null;
    const result = {...cursor}, max = rules.items[cursor.id].maxStack;
    for (const partial of [true, false]) for (const slot of slots) {
        const s = slot.stack;
        if (!s || !slot.policy.take || !sameStack(s, result, rules) || (s.count < max) !== partial) continue;
        const n = Math.min(max - result.count, s.count);
        if (n) {
            result.count += n;
            slot.stack = n === s.count ? null : {...s, count: s.count - n};
        }
    }
    return result;
}
