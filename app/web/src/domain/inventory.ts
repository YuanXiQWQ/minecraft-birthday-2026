/** Infinite catalogue and shared finite 27+9 player carriers; no recipes, processing or world drops are created here. */
import native from '../data/inventory-rules.json' with {type: 'json'};
import type {Stack} from '../rules/types.ts';
import {capacity, pickup, distribute, quickMove, collect, sameStack, identity} from './slots.ts';
import type {ItemRules, SlotValue} from './slots.ts';

export type EquipmentSlot = 'head' | 'chest' | 'legs' | 'feet' | 'offhand';
export type SlotRef =
    `backpack:${number}`
    | `hotbar:${number}`
    | `equipment:${EquipmentSlot}`
    | `crafting:${number}`
    | `workbench:${number}`
    | `machine:${number}`
    | `hopper:${number}`;

export interface PlayerLayout {
    backpack: (Stack | null)[];
    selected: number;
    hotbar: (Stack | null)[];
    equipment: Record<EquipmentSlot, Stack | null>;
    presets: ((Stack | null)[] | null)[];
}

export interface InventoryState extends PlayerLayout {
    cursor: Stack | null;
    crafting?: (Stack | null)[];
    workbench?: (Stack | null)[];
    machine?: (Stack | null)[];
    hopper?: (Stack | null)[];
}

export type InventoryCommand = { type: 'backpack-slot'; index: number; button: 0 | 2 } | {
    type: 'hopper-slot';
    index: number;
    button: 0 | 2
} | { type: 'select'; index: number } | { type: 'wheel'; direction: number } | {
    type: 'source';
    item: string;
    mode: 'left' | 'right' | 'clone' | 'number' | 'shift' | 'offhand';
    index?: number
} | { type: 'machine-slot'; index: number; button: 0 | 2 } | { type: 'craft-slot'; index: number; button: 0 | 2 } | {
    type: 'workbench-slot';
    index: number;
    button: 0 | 2
} | {
    type: 'preset-source';
    preset: number;
    index: number;
    mode: 'left' | 'right' | 'clone' | 'number' | 'shift' | 'offhand';
    target?: number
} | { type: 'slot'; index: number; button: 0 | 2 } | { type: 'equipment'; slot: EquipmentSlot; button: 0 | 2 } | {
    type: 'clone' | 'collect' | 'quick' | 'quick-all';
    slot: SlotRef;
    match?: Stack
} | { type: 'drag'; slots: SlotRef[]; mode: 'left' | 'right' | 'middle' } | {
    type: 'swap';
    slot: SlotRef;
    target: SlotRef
} | { type: 'drop'; slot?: SlotRef; all: boolean; cursor?: boolean } | { type: 'equip' } | {
    type: 'preset';
    index: number;
    mode: 'save' | 'load'
};

/** Allocate 27 main inventory cells, nine hotbar cells, five equipment cells and nine optional toolbar presets.
 * @return {InventoryState} Empty carriers, independent of permanent unlocks.
 */
export function emptyInventory(): InventoryState {
    return {
        backpack: Array(27).fill(null),
        selected: 0,
        hotbar: Array(9).fill(null),
        cursor: null,
        equipment: {head: null, chest: null, legs: null, feet: null, offhand: null},
        presets: Array(9).fill(null)
    };
}

/** Project player-owned durable carriers; personal inputs/cursor are transient and workbench inputs belong to their instance.
 * @param {InventoryState} state Runtime carriers.
 * @return {PlayerLayout} Durable layout data.
 */
export function layout(state: InventoryState): PlayerLayout {
    const {cursor: _, crafting: __, workbench: ___, machine: ____, hopper: _____, ...value} = state;
    return structuredClone(value);
}

/** Validate bounded supported components and native limits; unsupported component behavior is never guessed.
 * @param {Stack|null} s Candidate temporary group.
 * @param {string[]} unlocked Authoritative permanent identities.
 * @param {ItemRules} rules Original count/equipment components.
 */
export function validateStack(s: Stack | null, unlocked: string[], rules: ItemRules): void {
    if (s === null) return;
    const r = s && rules.items[s.id];
    if (!r || !unlocked.includes(s.id) || !Number.isSafeInteger(s.count) || s.count < 1 || s.count > r.maxStack || Object.keys(s).some(k => !['id', 'count', 'components'].includes(k))) throw Error('invalid-temporary-stack');
    if (s.components !== undefined) {
        if (!s.components || Array.isArray(s.components) || identity(s.components).length > 4096) throw Error('unsupported-stack-components');
        for (const [k, v] of Object.entries(s.components)) {
            if (k === 'minecraft:damage') {
                if (!r.maxDamage || !Number.isInteger(v) || Number(v) < 0 || Number(v) > r.maxDamage) throw Error('unsupported-stack-components');
            } else if (k !== 'minecraft:custom_data') throw Error('unsupported-stack-components');
        }
    }
}

/** Reject locked, malformed or incompatible stable carriers and saved presets before every input path.
 * @param {InventoryState} value Temporary carriers.
 * @param {string[]} unlocked Permanent acquisition identities.
 * @param {ItemRules} rules Original policies.
 */
export function validateCarriers(value: InventoryState, unlocked: string[], rules: ItemRules): void {
    if (!value || Object.keys(value).filter(k => k !== 'crafting' && k !== 'workbench' && k !== 'machine' && k !== 'hopper').sort().join('|') !== 'backpack|cursor|equipment|hotbar|presets|selected' || !Array.isArray(value.backpack) || value.backpack.length !== 27 || !Number.isInteger(value.selected) || value.selected < 0 || value.selected > 8 || !Array.isArray(value.hotbar) || value.hotbar.length !== 9 || !Array.isArray(value.presets) || value.presets.length !== 9) throw Error('invalid-hotbar');
    if (!value.equipment || Object.keys(value.equipment).sort().join('|') !== 'chest|feet|head|legs|offhand') throw Error('invalid-equipment');
    if (value.crafting !== undefined && (!Array.isArray(value.crafting) || value.crafting.length !== 4)) throw Error('invalid-personal-grid');
    if (value.workbench !== undefined && (!Array.isArray(value.workbench) || value.workbench.length !== 9)) throw Error('invalid-workbench-grid');
    if (value.machine !== undefined && (!Array.isArray(value.machine) || value.machine.length !== 2)) throw Error('invalid-machine-grid');
    if (value.hopper !== undefined && (!Array.isArray(value.hopper) || value.hopper.length !== 5)) throw Error('invalid-hopper-grid');
    for (const s of [...value.backpack, ...value.hotbar, value.cursor, ...Object.values(value.equipment), ...(value.crafting ?? []), ...(value.workbench ?? []), ...(value.machine ?? []), ...(value.hopper ?? [])]) validateStack(s, unlocked, rules);
    for (const [key, s] of Object.entries(value.equipment)) if (s && key !== 'offhand' && (s.count !== 1 || rules.items[s.id].equipment !== key)) throw Error('invalid-equipment');
    for (const preset of value.presets) {
        if (preset === null) continue;
        if (!Array.isArray(preset) || preset.length !== 9) throw Error('invalid-preset');
        preset.forEach(s => validateStack(s, unlocked, rules));
    }
}

/** Access transaction-local cells with explicit take/place/capacity policies, ready for container adapters.
 * @param {InventoryState} value Transaction-local inventory.
 * @param {SlotRef} ref Stable logical cell identity.
 * @return {SlotValue} Live policy-bearing slot.
 */
export function cell(value: InventoryState, ref: SlotRef): SlotValue {
    const [kind, key] = ref.split(':');
    if (kind === 'backpack' && /^(?:[0-9]|1[0-9]|2[0-6])$/.test(key)) return {
        /** Read owned main inventory. @return {Stack|null} Finite group. */get stack() {
            return value.backpack[Number(key)];
        }, /** Write owned main inventory. @param {Stack|null} s Validated group. */set stack(s) {
            value.backpack[Number(key)] = s;
        }, policy: {take: true, place: true}
    };
    if (kind === 'hopper' && /^[0-4]$/.test(key) && value.hopper) return {
        /** Read instance cell. @return {Stack|null} Current finite group. */get stack() {
            return value.hopper![Number(key)];
        }, /** Write instance cell. @param {Stack|null} s Accepted finite group. */set stack(s) {
            value.hopper![Number(key)] = s;
        }, policy: {take: true, place: true}
    };
    if (kind === 'machine' && /^[01]$/.test(key) && value.machine) return {
        /** Read device input. @return {Stack|null} Finite reference. */get stack() {
            return value.machine![Number(key)];
        },
        /** Write device input. @param {Stack|null} s Accepted stack. */set stack(s) {
            value.machine![Number(key)] = s;
        },
        policy: {
            take: true,
            place: true, ...(key === '1' ? {
                accepts: (s: Stack) => !!(nativeFuel(s.id) || s.id === 'minecraft:bucket'),
                limitFor: (s: Stack) => s.id === 'minecraft:bucket' ? 1 : 64
            } : {})
        }
    };
    if (kind === 'workbench' && /^[0-8]$/.test(key) && value.workbench) return {
        /** Read one instance input. @return {Stack|null} Current content. */get stack() {
            return value.workbench![Number(key)];
        }, /** Replace one instance input. @param {Stack|null} s Accepted group. */set stack(s) {
            value.workbench![Number(key)] = s;
        }, policy: {take: true, place: true}
    };
    if (kind === 'crafting' && /^[0-3]$/.test(key) && value.crafting) return {
        /** Read one personal input. @return {Stack|null} Current content. */get stack() {
            return value.crafting![Number(key)];
        }, /** Replace one personal input. @param {Stack|null} s Accepted group. */set stack(s) {
            value.crafting![Number(key)] = s;
        }, policy: {take: true, place: true}
    };
    if (kind === 'hotbar' && /^[0-8]$/.test(key)) return {
        /** Read the transaction-local group. @return {Stack|null} Current content. */get stack() {
            return value.hotbar[Number(key)];
        }, /** Replace the transaction-local group. @param {Stack|null} s Accepted content. */set stack(s) {
            value.hotbar[Number(key)] = s;
        }, policy: {take: true, place: true}
    };
    if (kind === 'equipment' && ['head', 'chest', 'legs', 'feet', 'offhand'].includes(key)) return {
        /** Read the transaction-local group. @return {Stack|null} Current content. */get stack() {
            return value.equipment[key as EquipmentSlot];
        }, /** Replace the transaction-local group. @param {Stack|null} s Accepted content. */set stack(s) {
            value.equipment[key as EquipmentSlot] = s;
        }, policy: {take: true, place: true, ...(key === 'offhand' ? {} : {limit: 1, equipment: key})}
    };
    throw Error('invalid-slot');
}

/** List only finite owned cells; directory entries can never enter a collection/transfer loop.
 * @param {boolean} personal Whether this menu owns personal inputs.
 * @param {boolean} workbench Whether instance inputs are present.
 * @param {boolean} machine Whether two finite device inputs are present.
 * @param {boolean} hopper Whether five instance-owned cells are present.
 * @return {SlotRef[]} Stable pickup/transfer order.
 */
export function finiteSlots(personal = false, workbench = false, machine = false, hopper = false): SlotRef[] {
    return [...Array.from({length: 27}, (_, i) => `backpack:${i}` as SlotRef), ...(hopper ? Array.from({length: 5}, (_, i) => `hopper:${i}` as SlotRef) : []), ...(machine ? ['machine:0', 'machine:1'] as SlotRef[] : []), ...(workbench ? Array.from({length: 9}, (_, i) => `workbench:${i}` as SlotRef) : []), ...(personal ? Array.from({length: 4}, (_, i) => `crafting:${i}` as SlotRef) : []), ...Array.from({length: 9}, (_, i) => `hotbar:${i}` as SlotRef), ...(['head', 'chest', 'legs', 'feet', 'offhand'] as const).map(k => `equipment:${k}` as SlotRef)];
}

/** Route hotbar armor to empty equipment, and equipment/personal inputs to hotbar; other container routes stay unavailable.
 * @param {InventoryState} v Mutable transaction.
 * @param {SlotRef} ref Source identity.
 * @param {ItemRules} rules Native equipment components.
 * @return {SlotValue[]} Bounded destinations in priority order.
 */
function targets(v: InventoryState, ref: SlotRef, rules: ItemRules): SlotValue[] {
    const s = cell(v, ref).stack, gear = s && rules.items[s.id].equipment,
        player = ref.startsWith('backpack:') || ref.startsWith('hotbar:');
    if (player && !v.workbench && !v.machine && !v.hopper && gear && ['head', 'chest', 'legs', 'feet'].includes(gear) && !v.equipment[gear as EquipmentSlot]) return [cell(v, `equipment:${gear}` as SlotRef)];
    return player ? ref.startsWith('hotbar:') ? Array.from({length: 27}, (_, i) => cell(v, `backpack:${i}`)) : Array.from({length: 9}, (_, i) => cell(v, `hotbar:${i}`)) : [...Array.from({length: 27}, (_, i) => cell(v, `backpack:${i}`)), ...Array.from({length: 9}, (_, i) => cell(v, `hotbar:${i}`))];
}

/** Execute bounded native-style temporary operations; every source/clone/preset path rechecks permanent unlocks.
 * @param {InventoryState} current Valid carriers.
 * @param {InventoryCommand} command Semantic input.
 * @param {string[]} unlocked Permanent identities; never changed.
 * @param {ItemRules} rules Original limits and equipment components.
 * @return {InventoryState} Independent next carriers.
 */
export function reduceInventory(current: InventoryState, command: InventoryCommand, unlocked: string[], rules: ItemRules): InventoryState {
    validateCarriers(current, unlocked, rules);
    const v = structuredClone(current);
    switch (command.type) {
        case'select':
            if (!Number.isInteger(command.index) || command.index < 0 || command.index > 8) throw Error('invalid-hotbar-index');
            v.selected = command.index;
            break;
        case'wheel':
            if (!Number.isFinite(command.direction)) throw Error('invalid-wheel');
            v.selected = (v.selected + Math.sign(command.direction) + 9) % 9;
            break;
        case'source': {
            if (!['left', 'right', 'clone', 'number', 'shift', 'offhand'].includes(command.mode)) throw Error('invalid-source-mode');
            if (!rules.items[command.item]) throw Error('locked-item');
            if (!unlocked.includes(command.item)) {
                if (v.cursor && (command.mode === 'left' || command.mode === 'right')) {
                    v.cursor = null;
                    break;
                }
                throw Error('locked-item');
            }
            const max = rules.items[command.item].maxStack, s = {id: command.item, count: max};
            if (command.mode === 'number') {
                if (!Number.isInteger(command.index) || command.index! < 0 || command.index! > 8) throw Error('invalid-hotbar-index');
                v.hotbar[command.index!] = s;
            } else if (command.mode === 'offhand') v.equipment.offhand = s; else if (command.mode === 'shift') {
                if (!v.cursor) v.cursor = s;
            } else if (command.mode === 'clone') {
                if (!v.cursor) v.cursor = s;
            } else if (!v.cursor) v.cursor = {
                ...s,
                count: 1
            }; else if (command.mode === 'left' && sameStack(v.cursor, s, rules)) v.cursor = {
                ...v.cursor,
                count: Math.min(max, v.cursor.count + 1)
            }; else v.cursor = null;
            break;
        }
        case'hopper-slot':
            if (![0, 2].includes(command.button)) throw Error('invalid-button');
            v.cursor = pickup(cell(v, `hopper:${command.index}`), v.cursor, command.button, rules);
            break;
        case'machine-slot':
            if (![0, 2].includes(command.button)) throw Error('invalid-button');
            v.cursor = pickup(cell(v, `machine:${command.index}`), v.cursor, command.button, rules);
            break;
        case'workbench-slot':
            if (![0, 2].includes(command.button)) throw Error('invalid-button');
            v.cursor = pickup(cell(v, `workbench:${command.index}`), v.cursor, command.button, rules);
            break;
        case'craft-slot':
            if (![0, 2].includes(command.button)) throw Error('invalid-button');
            v.cursor = pickup(cell(v, `crafting:${command.index}`), v.cursor, command.button, rules);
            break;
        case'preset-source': {
            if (!['left', 'right', 'clone', 'number', 'shift', 'offhand'].includes(command.mode)) throw Error('invalid-source-mode');
            if (!Number.isInteger(command.preset) || command.preset < 0 || command.preset > 8 || !Number.isInteger(command.index) || command.index < 0 || command.index > 8) throw Error('invalid-preset');
            const s = v.presets[command.preset]?.[command.index];
            if (!s) break;
            const next = reduceInventory(v, {
                type: 'source',
                item: s.id,
                mode: command.mode,
                index: command.target
            }, unlocked, rules), copied = {...structuredClone(s), count: rules.items[s.id].maxStack};
            if (command.mode === 'number') next.hotbar[command.target!] = copied; else if (command.mode === 'offhand') next.equipment.offhand = copied; else if (command.mode === 'clone' && !v.cursor) next.cursor = copied; else if (command.mode === 'left' || command.mode === 'right') {
                next.cursor = structuredClone(v.cursor);
                if (!v.cursor) next.cursor = structuredClone(s); else if (sameStack(v.cursor, s, rules)) {
                    const n = Math.min(rules.items[s.id].maxStack, v.cursor.count + (command.mode === 'left' ? 1 : -1));
                    next.cursor = n ? {...v.cursor, count: n} : null;
                }
            } else if (command.mode === 'shift') {
                const source: SlotValue = {stack: copied, policy: {take: true, place: false}};
                next.hotbar = structuredClone(v.hotbar);
                quickMove(source, Array.from({length: 9}, (_, i) => cell(next, `hotbar:${i}`)), rules);
            }
            validateCarriers(next, unlocked, rules);
            return next;
        }
        case'backpack-slot':
            v.cursor = pickup(cell(v, `backpack:${command.index}`), v.cursor, command.button, rules);
            break;
        case'slot':
            if (![0, 2].includes(command.button)) throw Error('invalid-button');
            v.cursor = pickup(cell(v, `hotbar:${command.index}`), v.cursor, command.button, rules);
            break;
        case'equipment':
            if (![0, 2].includes(command.button)) throw Error('invalid-button');
            v.cursor = pickup(cell(v, `equipment:${command.slot}`), v.cursor, command.button, rules);
            break;
        case'drag': {
            if (!Array.isArray(command.slots) || command.slots.length > 256 || !['left', 'right', 'middle'].includes(command.mode)) throw Error('invalid-drag');
            const slots = [...new Set(command.slots)].map(r => cell(v, r));
            v.cursor = distribute(slots, v.cursor, command.mode, rules);
            break;
        }
        case'clone': {
            const s = cell(v, command.slot).stack;
            if (!v.cursor && s) v.cursor = {...s, count: rules.items[s.id].maxStack};
            break;
        }
        case'collect':
            v.cursor = collect(finiteSlots(!!v.crafting, !!v.workbench, !!v.machine, !!v.hopper).map(r => cell(v, r)), v.cursor, rules);
            break;
        case'quick':
            quickMove(cell(v, command.slot), targets(v, command.slot, rules), rules);
            break;
        case'quick-all': {
            const selected = command.match ?? cell(v, command.slot).stack;
            if (selected) {
                validateStack(selected, unlocked, rules);
                const refs = finiteSlots(!!v.crafting, !!v.workbench).filter(r => r.startsWith(command.slot.split(':')[0] + ':') && cell(v, r).stack && sameStack(cell(v, r).stack!, selected, rules));
                for (const r of refs) {
                    const dest = targets(v, r, rules).filter(d => !refs.some(other => cell(v, other).stack === d.stack && d.stack !== null));
                    quickMove(cell(v, r), dest, rules);
                }
            }
            break;
        }
        case'swap': {
            const a = cell(v, command.slot), b = cell(v, command.target), x = a.stack, y = b.stack;
            if (a.policy.take && b.policy.take && (!x || x.count <= capacity(b, x, rules)) && (!y || y.count <= capacity(a, y, rules))) {
                a.stack = y;
                b.stack = x;
            }
            break;
        }
        case'drop': {
            if (typeof command.all !== 'boolean' || command.cursor !== undefined && typeof command.cursor !== 'boolean') throw Error('invalid-drop');
            if (command.cursor) {
                if (v.cursor) v.cursor = command.all || v.cursor.count === 1 ? null : {
                    ...v.cursor,
                    count: v.cursor.count - 1
                };
            } else {
                const s = cell(v, command.slot ?? `hotbar:${v.selected}`);
                if (s.policy.take && s.stack) s.stack = command.all || s.stack.count === 1 ? null : {
                    ...s.stack,
                    count: s.stack.count - 1
                };
            }
            break;
        }
        case'equip': {
            const hand = cell(v, `hotbar:${v.selected}`), s = hand.stack, gear = s && rules.items[s.id].equipment;
            if (gear && ['head', 'chest', 'legs', 'feet'].includes(gear)) {
                const target = cell(v, `equipment:${gear}` as SlotRef), old = target.stack;
                if (s && s.count <= capacity(target, s, rules) && (!old || !sameStack(old, s, rules))) {
                    target.stack = s;
                    hand.stack = old;
                }
            }
            break;
        }
        case'preset': {
            if (!['save', 'load'].includes(command.mode)) throw Error('invalid-preset');
            if (!Number.isInteger(command.index) || command.index < 0 || command.index > 8) throw Error('invalid-preset');
            if (command.mode === 'save') v.presets[command.index] = structuredClone(v.hotbar); else if (v.presets[command.index]) v.hotbar = structuredClone(v.presets[command.index]!);
            break;
        }
        default:
            throw Error('unknown-inventory-command');
    }
    validateCarriers(v, unlocked, rules);
    return v;
}

/** Query the generated native fuel component. @param {string} id Item identity. @return {boolean} Fuel component presence. */
function nativeFuel(id: string): boolean {
    return !!(native.items[id as keyof typeof native.items] as { fuel?: string })?.fuel;
}

/** List all 36 actual player destinations in original menu order, optionally reversed for container extraction.
 * @param {InventoryState} value Transaction-local carriers.
 * @param {boolean} reverse Native reverse move direction.
 * @return {SlotValue[]} Finite main inventory and hotbar cells.
 */
export function playerTargets(value: InventoryState, reverse = false): SlotValue[] {
    const refs: SlotRef[] = [...Array.from({length: 27}, (_, i) => `backpack:${i}` as SlotRef), ...Array.from({length: 9}, (_, i) => `hotbar:${i}` as SlotRef)];
    return (reverse ? refs.reverse() : refs).map(ref => cell(value, ref));
}

/** Merge acquired items into existing groups, then prefer hotbar vacancies over backpack vacancies.
 * @param {SlotValue} source Actual finite acquisition, retaining any overflow.
 * @param {InventoryState} value Transaction-local player carriers.
 * @param {ItemRules} rules Original capacities and component identities.
 * @param {boolean} reverse Preserve a result menu's right-to-left order within each carrier band.
 */
export function storeAcquired(source: SlotValue, value: InventoryState, rules: ItemRules, reverse = false): void {
    const hotbar = Array.from({length: 9}, (_, i) => cell(value, `hotbar:${i}`)),
        backpack = Array.from({length: 27}, (_, i) => cell(value, `backpack:${i}`));
    quickMove(source, [...(reverse ? hotbar.reverse() : hotbar), ...(reverse ? backpack.reverse() : backpack)], rules);
}
