/** Vanilla grid matching is independent of GUI stacks, permanent acquisition and quantity adaptation policy. */
import type {Ingredient, Stack, Recipe, Rules, Match} from './types.ts';

/** Immutable versioned registries can reuse item-only cooking matches without caching counts or component payloads. */
const cookingMatches = new WeakMap<Rules, Map<string, Recipe | null>>();

/** Resolve literal or recursive-expanded tag alternatives, preserving namespaced identity.
 * @param {Ingredient} ingredient Same-version ingredient.
 * @param {Record<string,string[]>} tags Fully expanded item tags.
 * @return {string[]} Accepted item identities.
 */
export function alternatives(ingredient: Ingredient, tags: Record<string, string[]>): string[] {
    if (Array.isArray(ingredient)) return [...new Set(ingredient.flatMap(v => alternatives(v, tags)))];
    if (typeof ingredient !== 'string') throw new Error('unsupported-ingredient');
    if (ingredient.startsWith('#')) {
        const tag = tags[ingredient.slice(1)];
        if (!tag) throw new Error('missing-ingredient-tag:' + ingredient);
        return tag;
    }
    if (!/^[a-z0-9_.-]+:[a-z0-9_/.\-]+$/.test(ingredient)) throw new Error('invalid-ingredient');
    return [ingredient];
}

/** Match an occupied vanilla ingredient slot; unrelated component payloads do not change item-only ingredients.
 * @param {Ingredient} ingredient Ingredient.
 * @param {Stack|null} stack Grid stack.
 * @param {Rules} rules Same-version registry.
 * @return {boolean} Whether the item is accepted.
 */
export function accepts(ingredient: Ingredient, stack: Stack | null, rules: Rules): boolean {
    return !!stack && Number.isSafeInteger(stack.count) && stack.count > 0 && alternatives(ingredient, rules.itemTags).includes(stack.id);
}

/** Check a component predicate independently of ingredient and tool semantics; unsupported predicates fail explicitly.
 * @param {Stack} stack Candidate stack.
 * @param {Record<string,unknown>} expected Exact component values.
 * @param {Rules} rules Optional verified rule-relevant defaults.
 * @return {boolean} Component equality.
 */
export function componentsMatch(stack: Stack, expected: Record<string, unknown>, rules?: Rules): boolean {
    const item = rules?.items[stack.id], defaults: Record<string, unknown> = item ? {
        'minecraft:max_stack_size': item.maxStack, ...(item.maxDamage ? {
            'minecraft:max_damage': item.maxDamage,
            'minecraft:damage': 0
        } : {})
    } : {}, actual = {...defaults, ...stack.components};

    /** Canonicalize JSON component values independently of object property insertion order.
     * @param {unknown} value Component payload.
     * @return {string} Stable semantic JSON comparison key.
     */
    function key(value: unknown): string {
        if (Array.isArray(value)) return '[' + value.map(key).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + key(v)).join(',') + '}';
        return JSON.stringify(value);
    }

    return Object.entries(expected).every(([name, value]) => {
        if (!Object.hasOwn(actual, name)) {
            if (item?.components.includes(name)) throw new Error('unsupported-default-component-value:' + name);
            return false;
        }
        return key(actual[name]) === key(value);
    });
}

/** Construct immutable result/remainder facts without mutating inputs or interpreting D04–D07 acquisition policy.
 * @param {Recipe} recipe Matching recipe.
 * @param {(Stack|null)[]} grid Original input grid.
 * @param {number[]} used Occupied input slot indices.
 * @param {Rules} rules Item defaults.
 * @return {Match} Result and one crafting remainder per consumed ingredient slot.
 */
function outcome(recipe: Recipe, grid: (Stack | null)[], used: number[], rules: Rules): Match {
    if (!recipe.result?.id) throw new Error('dynamic-result-requires-handler');
    return {
        recipe: recipe.id,
        result: {
            id: recipe.result.id,
            count: recipe.result.count ?? 1, ...(recipe.result.components ? {components: structuredClone(recipe.result.components)} : {})
        },
        remainders: grid.map((v, i) => {
            const id = v && used.includes(i) ? rules.items[v.id]?.remainder : null;
            return id ? {id, count: 1} : null;
        }),
        used: [...used]
    };
}

/** Match translated and horizontally mirrored shaped patterns with strict outside/inside empty cells.
 * @param {Recipe} recipe Shaped recipe.
 * @param {(Stack|null)[]} grid Row-major input.
 * @param {number} width Grid width.
 * @param {number} height Grid height.
 * @param {Rules} rules Item and tag rules.
 * @return {Match|null} Matching output facts.
 */
function shaped(recipe: Recipe, grid: (Stack | null)[], width: number, height: number, rules: Rules): Match | null {
    const pattern = recipe.pattern!, keys = recipe.key!;
    if (!pattern?.length || !keys) throw new Error('invalid-shaped-recipe');
    const top = pattern.findIndex(row => row.trim()), last = pattern.findLastIndex(row => row.trim());
    if (top < 0) throw new Error('empty-pattern');
    const rows = pattern.slice(top, last + 1), left = Math.min(...rows.filter(r => r.trim()).map(r => r.search(/\S/))),
        right = Math.max(...rows.map(r => r.trimEnd().length)), trimmed = rows.map(r => r.slice(left, right)),
        pw = right - left, ph = trimmed.length;
    for (let oy = 0; oy <= height - ph; oy++) for (let ox = 0; ox <= width - pw; ox++) for (const mirrored of [false, true]) {
        let valid = true;
        const used: number[] = [];
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const px = x - ox, py = y - oy,
                key = px >= 0 && px < pw && py >= 0 && py < ph ? trimmed[py][mirrored ? pw - 1 - px : px] : ' ',
                index = y * width + x;
            if (key === ' ' || key === undefined) {
                if (grid[index]) valid = false;
            } else {
                if (!Object.hasOwn(keys, key)) throw new Error('missing-pattern-key');
                if (!accepts(keys[key], grid[index], rules)) valid = false;
                used.push(index);
            }
        }
        if (valid) return outcome(recipe, grid, used, rules);
    }
    return null;
}

/** Backtrack distinct occupied slots so overlapping tags and repeated ingredients cannot be greedily misassigned.
 * @param {Ingredient[]} ingredients Recipe multiset.
 * @param {(Stack|null)[]} grid Actual slots.
 * @param {Rules} rules Tag data.
 * @return {number[]|null} One-to-one matching slot assignment.
 */
function multiset(ingredients: Ingredient[], grid: (Stack | null)[], rules: Rules): number[] | null {
    const occupied = grid.flatMap((v, i) => v ? [i] : []);
    if (ingredients.length !== occupied.length) return null;
    const candidates = ingredients.map(v => occupied.filter(i => accepts(v, grid[i], rules))).sort((a, b) => a.length - b.length),
        used = new Set<number>();

    /** Search a bounded 2x2/3x3 bipartite assignment.
     * @param {number} n Ingredient offset.
     * @return {boolean} Whether every ingredient owns a distinct slot.
     */
    function visit(n: number): boolean {
        if (n === candidates.length) return true;
        for (const i of candidates[n]) if (!used.has(i)) {
            used.add(i);
            if (visit(n + 1)) return true;
            used.delete(i);
        }
        return false;
    }

    return visit(0) ? [...used] : null;
}

/** Match the actually reachable repair special case, retaining damage identity without introducing durability consumption.
 * @param {Recipe} recipe Native repair serializer.
 * @param {(Stack|null)[]} grid Input slots.
 * @param {Rules} rules Default components.
 * @return {Match|null} Repair result or rejection.
 */
function repair(recipe: Recipe, grid: (Stack | null)[], rules: Rules): Match | null {
    const used = grid.flatMap((s, i) => s ? [i] : []);
    if (used.length !== 2) return null;
    const [a, b] = used.map(i => grid[i]!);
    if (a.id !== b.id || a.count !== 1 || b.count !== 1) return null;
    const defaults = rules.items[a.id], maxA = a.components?.['minecraft:max_damage'] ?? defaults?.maxDamage,
        maxB = b.components?.['minecraft:max_damage'] ?? defaults?.maxDamage,
        damageA = a.components?.['minecraft:damage'] ?? (defaults?.maxDamage ? 0 : undefined),
        damageB = b.components?.['minecraft:damage'] ?? (defaults?.maxDamage ? 0 : undefined);
    if (![maxA, maxB, damageA, damageB].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
    const max = Math.max(maxA as number, maxB as number),
        damage = Math.max(0, max - ((maxA as number) - (damageA as number) + (maxB as number) - (damageB as number) + Math.floor(max * .05)));
    if (Object.keys(a.components ?? {}).some(k => !['minecraft:damage', 'minecraft:max_damage'].includes(k)) || Object.keys(b.components ?? {}).some(k => !['minecraft:damage', 'minecraft:max_damage'].includes(k))) throw new Error('repair-component-variant-not-supported');
    return {
        recipe: recipe.id,
        result: {id: a.id, count: 1, components: {'minecraft:max_damage': max, 'minecraft:damage': damage}},
        remainders: grid.map(() => null),
        used
    };
}

/** Match one crafting recipe on a supported vanilla grid; unsupported reachable serializers must never silently succeed.
 * @param {Recipe} recipe Recipe data.
 * @param {(Stack|null)[]} grid Input slots.
 * @param {number} width Personal 2 or crafting-table 3.
 * @param {number} height Personal 2 or crafting-table 3.
 * @param {Rules} rules Registry and tags.
 * @return {Match|null} Output facts, never a permanent unlock.
 */
export function matchCrafting(recipe: Recipe, grid: (Stack | null)[], width: number, height: number, rules: Rules): Match | null {
    if (![2, 3].includes(width) || width !== height || grid.length !== width * height) throw new Error('invalid-crafting-grid');
    if (recipe.type === 'minecraft:crafting_shaped') return shaped(recipe, grid, width, height, rules);
    if (recipe.type === 'minecraft:crafting_shapeless') {
        const used = multiset(recipe.ingredients!, grid, rules);
        return used ? outcome(recipe, grid, used, rules) : null;
    }
    if (recipe.type === 'minecraft:crafting_special_repairitem') return repair(recipe, grid, rules);
    throw new Error('unsupported-crafting-type:' + recipe.type);
}

/** Search the bounded runtime crafting registry without consuming inputs, discovering a recipe or granting its output.
 * @param {(Stack|null)[]} grid Actual input slots.
 * @param {number} width Personal 2 or workbench 3.
 * @param {Rules} rules Supported runtime recipe registry.
 * @return {Match|null} Native matching result, with ambiguous different outputs rejected for review.
 */
export function findCrafting(grid: (Stack | null)[], width: number, rules: Rules): Match | null {
    if (![2, 3].includes(width) || grid.length !== width * width) throw new Error('invalid-crafting-grid');
    let found: Match | null = null;
    for (const r of rules.recipes) {
        if (!r.type.startsWith('minecraft:crafting_')) continue;
        const result = matchCrafting(r, grid, width, width, rules);
        if (result) {
            found ??= result;
        }
    }
    return found;
}

/** Find a station-appropriate cooking recipe, independently of manual input-slot acceptance.
 * @param {Stack} input Input stack.
 * @param {'furnace'|'blast_furnace'} station Available processing capability.
 * @param {Rules} rules Recipe registry.
 * @return {Recipe|null} Native recipe or no process.
 */
export function matchCooking(input: Stack, station: 'furnace' | 'blast_furnace', rules: Rules): Recipe | null {
    if (!Number.isSafeInteger(input.count) || input.count <= 0) return null;
    const type = station === 'furnace' ? 'minecraft:smelting' : 'minecraft:blasting',
        immutable = Object.isFrozen(rules) && Object.isFrozen(rules.recipes) && Object.isFrozen(rules.itemTags),
        key = type + ':' + input.id;
    let cache = cookingMatches.get(rules);
    if (immutable && cache?.has(key)) return cache.get(key)!;
    const result = rules.recipes.find(r => r.type === type && r.ingredient && accepts(r.ingredient, input, rules)) ?? null;
    if (immutable) {
        if (!cache) {
            cache = new Map();
            cookingMatches.set(rules, cache);
        }
        cache.set(key, result);
    }
    return result;
}
