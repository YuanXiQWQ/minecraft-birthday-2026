/** Approved D06 native discovery predicates and finite recipe placement have no DOM or rendering dependency. */
import source from '../data/recipe-book.json' with {type: 'json'};
import type {Recipe, Rules, Stack, Ingredient} from '../rules/types.ts';
import {alternatives, matchCrafting} from '../rules/matcher.ts';
import {sameStack} from './slots.ts';

export type BookMode = 'crafting' | 'furnace' | 'blast_furnace';

export interface BookSetting {
    open: boolean;
    filter: boolean;
}

export interface RecipeBook {
    version: 1;
    data: { known: string[]; unseen: string[]; views: Record<BookMode, BookSetting> };
}

/** Audited ordinary native recipes exclude dynamic special repair displays. */
export const BOOK_RECIPES = source.recipes as Recipe[];

/** Define a new book; native tick discovery is evaluated once during initialization.
 * @param {string[]} unlocked Existing acquired facts for silent migration.
 * @return {RecipeBook} Valid initialized discovery and default native view settings.
 */
export function initialBook(unlocked: string[] = []): RecipeBook {
    const book: RecipeBook = {
        version: 1,
        data: {
            known: [],
            unseen: [],
            views: {
                crafting: {open: false, filter: false},
                furnace: {open: false, filter: false},
                blast_furnace: {open: false, filter: false}
            }
        }
    };
    discover(book, unlocked, [], true);
    return book;
}

/** Validate the precise persistent discovery schema without accepting arbitrary reserved payloads.
 * @param {RecipeBook} book Candidate native book state.
 */
export function validateBook(book: RecipeBook): void {
    const d = book?.data, ids = new Set(BOOK_RECIPES.map(r => r.id));
    if (book?.version !== 1 || Object.keys(book).sort().join('|') !== 'data|version' || !d || Object.keys(d).sort().join('|') !== 'known|unseen|views') throw Error('invalid-recipe-book');
    for (const values of [d.known, d.unseen]) if (!Array.isArray(values) || values.length > ids.size || new Set(values).size !== values.length || values.some(id => !ids.has(id))) throw Error('invalid-recipe-book');
    if (d.unseen.some(id => !d.known.includes(id)) || !d.views || Object.keys(d.views).sort().join('|') !== 'blast_furnace|crafting|furnace') throw Error('invalid-recipe-book');
    for (const v of Object.values(d.views)) if (!v || Object.keys(v).sort().join('|') !== 'filter|open' || typeof v.open !== 'boolean' || typeof v.filter !== 'boolean') throw Error('invalid-recipe-book');
}

/** Interpret only the native predicate shapes present in the audited reachable cohort.
 * @param {any} criterion Raw advancement criterion.
 * @param {Set<string>} unlocked Permanent acquired facts.
 * @param {Set<string>} known Already discovered recipes.
 * @return {boolean} Approved D06 criterion result.
 */
function criterionMet(criterion: any, unlocked: Set<string>, known: Set<string>): boolean {
    const c = criterion.conditions;
    if (criterion.trigger === 'minecraft:tick') return true;
    if (criterion.trigger === 'minecraft:enter_block' || criterion.trigger === 'minecraft:impossible') return false;
    if (criterion.trigger === 'minecraft:recipe_unlocked') return known.has(c.recipes);
    if (criterion.trigger !== 'minecraft:inventory_changed') throw Error('unsupported-discovery-trigger');
    if (c.slots) return unlocked.size >= (c.slots.occupied?.min ?? Infinity);
    return c.items.every((p: any) => alternatives(p.items, source.tags).some(id => unlocked.has(id)));
}

/** Derive monotonic native discovery from permanent facts and successfully acquired recipe provenance.
 * @param {RecipeBook} book Mutable transaction-local discovery state.
 * @param {string[]} unlocked Permanent acquisitions.
 * @param {string[]} acquiredRecipes Successful actual recipe IDs.
 * @param {boolean} silent Whether initialization must suppress historical unseen markers and notifications.
 * @return {string[]} Only genuinely new discoveries for this transaction.
 */
export function discover(book: RecipeBook, unlocked: string[], acquiredRecipes: string[] = [], silent = false): string[] {
    const before = new Set(book.data.known), known = new Set(before), eligible = new Set(BOOK_RECIPES.map(r => r.id)),
        items = new Set(unlocked);
    for (const id of acquiredRecipes) if (eligible.has(id)) known.add(id);
    for (let pass = 0; pass <= eligible.size; pass++) {
        const size = known.size;
        for (const a of Object.values(source.advances) as any[]) if (a.requirements.every((group: string[]) => group.some(key => criterionMet(a.criteria[key], items, known)))) for (const id of a.rewards.recipes) if (eligible.has(id)) known.add(id);
        if (known.size === size) break;
    }
    const added = [...known].filter(id => !before.has(id));
    book.data.known = [...known];
    if (!silent) book.data.unseen.push(...added);
    return added;
}

/** Filter only the matching native processing context and input dimensions.
 * @param {Recipe} recipe Native ordinary recipe.
 * @param {BookMode} mode Current workstation capability.
 * @param {number} width Personal or table grid width.
 * @return {boolean} Whether this menu can display and place the recipe.
 */
export function bookApplicable(recipe: Recipe, mode: BookMode, width: number): boolean {
    if (mode !== 'crafting') return recipe.type === (mode === 'furnace' ? 'minecraft:smelting' : 'minecraft:blasting');
    if (![2, 3].includes(width)) return false;
    return recipe.type === 'minecraft:crafting_shaped' ? recipe.pattern!.length <= width && recipe.pattern!.every(row => row.length <= width) : recipe.type === 'minecraft:crafting_shapeless' && recipe.ingredients!.length <= width * width;
}

/** Compute native centered shaped cells or row-major shapeless cells, leaving all unused cells empty.
 * @param {Recipe} recipe Applicable native recipe.
 * @param {BookMode} mode Menu capability.
 * @param {number} width Crafting grid width.
 * @return {(Ingredient|null)[]} Native placement with alternative material definitions.
 */
export function recipeCells(recipe: Recipe, mode: BookMode, width: number): (Ingredient | null)[] {
    if (!bookApplicable(recipe, mode, width)) throw Error('recipe-menu-mismatch');
    if (mode !== 'crafting') return [recipe.ingredient!];
    const cells: (Ingredient | null)[] = Array(width * width).fill(null);
    if (recipe.type === 'minecraft:crafting_shapeless') {
        recipe.ingredients!.forEach((v, i) => cells[i] = v);
        return cells;
    }
    const h = recipe.pattern!.length, w = recipe.pattern![0].length,
        ox = w < width / 2 ? Math.floor(width / 2 - w / 2) : 0, oy = h < width / 2 ? Math.floor(width / 2 - h / 2) : 0;
    recipe.pattern!.forEach((row, y) => [...row].forEach((key, x) => cells[(y + oy) * width + x + ox] = key === ' ' ? null : recipe.key![key]));
    return cells;
}

/** Project genuine missing materials as ghosts without manufacturing any carrier or source quantity.
 * @param {Recipe} recipe Applicable recipe.
 * @param {BookMode} mode Menu capability.
 * @param {number} width Native crafting dimension.
 * @param {string[]} unlocked Acquired identities.
 * @param {Rules} rules Native capacities and ingredient tags.
 * @param {number} frame Display-only alternative cycle.
 * @return {{grid:(Stack|null)[],missing:boolean[]}} Display-only ghost cells.
 */
export function recipeGhost(recipe: Recipe, mode: BookMode, width: number, unlocked: string[], rules: Rules, frame = 0): {
    grid: (Stack | null)[];
    missing: boolean[]
} {
    const missing: boolean[] = [];
    const grid = recipeCells(recipe, mode, width).map((ingredient, i) => {
        if (!ingredient) {
            missing[i] = false;
            return null;
        }
        const all = alternatives(ingredient, rules.itemTags).filter(id => rules.items[id]);
        missing[i] = !all.some(id => unlocked.includes(id));
        return all.length ? {id: all[Math.abs(frame) % all.length], count: 1} : null;
    });
    return {grid, missing};
}

/** Plan bounded fills without overwriting existing finite groups or borrowing a carried cursor.
 * @param {Recipe} recipe Applicable ordinary recipe.
 * @param {BookMode} mode Menu capability.
 * @param {number} width Native grid width.
 * @param {(Stack|null)[]} current Actual existing inputs.
 * @param {string[]} unlocked Acquired identities.
 * @param {Rules} rules Original capacities and tags.
 * @param {boolean} max Whether Shift requests a native-capacity bounded fill.
 * @return {(Stack|null)[]} Actual input plan, never an acquisition or result grant.
 */
export function fillRecipe(recipe: Recipe, mode: BookMode, width: number, current: (Stack | null)[], unlocked: string[], rules: Rules, max = false): (Stack | null)[] {
    const cells = recipeCells(recipe, mode, width);
    if (cells.length !== current.length) throw Error('recipe-menu-mismatch');
    const selected = cells.map((ingredient, i) => {
        const old = current[i];
        if (!ingredient) {
            if (old) throw Error('recipe-input-conflict');
            return null;
        }
        const choices = alternatives(ingredient, rules.itemTags).filter(id => rules.items[id] && unlocked.includes(id));
        if (!choices.length) throw Error('recipe-materials-missing');
        if (old) {
            if (!choices.includes(old.id) || !sameStack(old, {
                id: old.id,
                count: 1
            }, rules)) throw Error('recipe-input-conflict');
            return structuredClone(old);
        }
        return {id: choices[0], count: 1};
    });
    const used = selected.filter((s): s is Stack => !!s),
        limit = Math.min(64, ...used.map(s => rules.items[s.id].maxStack));
    if (!used.length) throw Error('recipe-input-empty');
    for (const s of used) s.count = max ? Math.max(s.count, limit) : s.count;
    if (mode === 'crafting' && !matchCrafting(recipe, selected, width, width, rules)) throw Error('recipe-fill-mismatch');
    return selected;
}

/** One quantity-aware allocation keeps material absence separate from incompatible occupied inputs. */
export interface OwnedRecipeAnalysis {
    grid: (Stack | null)[];
    pool: (Stack | null)[];
    missing: boolean[];
    conflicts: boolean[];
    complete: boolean;
}

/** Allocate real groups globally across overlapping ingredients without counting input groups twice.
 * @param {Recipe} recipe Native recipe.
 * @param {BookMode} mode Menu capability.
 * @param {number} width Input dimension.
 * @param {(Stack|null)[]} current Actual inputs pinned to their cells.
 * @param {(Stack|null)[]} owned Actual player inventory, excluding cursor and input cells.
 * @param {Rules} rules Native capacities, identities and tags.
 * @param {number} amount Requested fill level.
 * @param {boolean} partial Whether a maximum satisfied subset is useful for display.
 * @return {OwnedRecipeAnalysis} Immutable allocation and explicit failure categories.
 */
export function analyzeOwnedRecipe(recipe: Recipe, mode: BookMode, width: number, current: (Stack | null)[], owned: (Stack | null)[], rules: Rules, amount = 1, partial = true): OwnedRecipeAnalysis {
    const cells = recipeCells(recipe, mode, width);
    if (cells.length !== current.length) throw Error('recipe-menu-mismatch');
    const conflicts = cells.map((ingredient, i) => !!current[i] && (!ingredient || !alternatives(ingredient, rules.itemTags).includes(current[i]!.id)));
    const total = cells.filter(Boolean).length;
    let best: { grid: (Stack | null)[]; pool: (Stack | null)[]; missing: boolean[]; score: number } | null = null;

    /** Search complete identities with a bounded maximum-subset fallback for missing-material projections.
     * @param {number} index Next logical cell.
     * @param {(Stack|null)[]} pool Remaining finite groups.
     * @param {(Stack|null)[]} grid Candidate inputs.
     * @param {boolean[]} missing Unsatisfied requirements.
     * @param {number} score Satisfied cells.
     */
    function assign(index: number, pool: (Stack | null)[], grid: (Stack | null)[], missing: boolean[], score: number): void {
        if (best?.score === total || best && score + cells.slice(index).filter(Boolean).length <= best.score) return;
        if (index === cells.length) {
            best = {grid, pool, missing, score};
            return;
        }
        const ingredient = cells[index], old = current[index];
        if (!ingredient || conflicts[index]) {
            assign(index + 1, pool, grid, missing, score);
            return;
        }
        const ids = alternatives(ingredient, rules.itemTags), choices: Stack[] = [];
        if (old) choices.push(old); else for (const s of pool) if (s && ids.includes(s.id) && !choices.some(c => sameStack(c, s, rules))) choices.push(s);
        for (const chosen of choices) {
            if (amount > rules.items[chosen.id].maxStack) continue;
            let needed = Math.max(0, amount - (old?.count ?? 0));
            if (pool.reduce((n, s) => n + (s && sameStack(s, chosen, rules) ? s.count : 0), 0) < needed) continue;
            const next = structuredClone(pool), filled = structuredClone(grid);
            for (let n = 0; n < next.length && needed; n++) {
                const s = next[n];
                if (!s || !sameStack(s, chosen, rules)) continue;
                const take = Math.min(needed, s.count);
                needed -= take;
                next[n] = s.count === take ? null : {...s, count: s.count - take};
            }
            filled[index] = {...chosen, count: Math.max(amount, old?.count ?? 0)};
            assign(index + 1, next, filled, [...missing], score + 1);
        }
        if (partial) {
            const absent = [...missing];
            absent[index] = true;
            assign(index + 1, pool, grid, absent, score);
        }
    }

    assign(0, structuredClone(owned), structuredClone(current), cells.map(Boolean).map(() => false), 0);
    const result = best as { grid: (Stack | null)[]; pool: (Stack | null)[]; missing: boolean[]; score: number } | null;
    return {
        ...(result ?? {
            grid: structuredClone(current),
            pool: structuredClone(owned),
            missing: cells.map((v, i) => !!v && !conflicts[i])
        }), conflicts, complete: !!result && result.score === total && !conflicts.some(Boolean)
    };
}

/** Project finite availability using the exact fill allocator; alternatives cycle only where no group was reserved.
 * @param {Recipe} recipe Displayed recipe.
 * @param {BookMode} mode Menu capability.
 * @param {number} width Input dimension.
 * @param {(Stack|null)[]} current Actual inputs.
 * @param {(Stack|null)[]} owned Actual 27+9 inventory without cursor.
 * @param {Rules} rules Native rules.
 * @param {number} frame Alternative animation frame.
 * @return {OwnedRecipeAnalysis} Display-only cells and quantity-aware missing/conflict masks.
 */
export function ownedRecipeGhost(recipe: Recipe, mode: BookMode, width: number, current: (Stack | null)[], owned: (Stack | null)[], rules: Rules, frame = 0): OwnedRecipeAnalysis {
    const analysis = analyzeOwnedRecipe(recipe, mode, width, current, owned, rules),
        cells = recipeCells(recipe, mode, width);
    analysis.grid = cells.map((ingredient, i) => {
        if (!ingredient) return null;
        if (!analysis.missing[i] && !analysis.conflicts[i] && analysis.grid[i]) return analysis.grid[i];
        const ids = alternatives(ingredient, rules.itemTags).filter(id => rules.items[id]);
        return ids.length ? {id: ids[Math.abs(frame) % ids.length], count: 1} : null;
    });
    return analysis;
}

/** Move actual player groups into compatible inputs; failed allocations never mutate the supplied inventory.
 * @param {Recipe} recipe Native recipe.
 * @param {BookMode} mode Menu capability.
 * @param {number} width Input dimension.
 * @param {(Stack|null)[]} current Current input groups.
 * @param {(Stack|null)[]} owned Mutable transaction-local 27+9 inventory.
 * @param {Rules} rules Native capacities and tags.
 * @param {boolean} max Fill the greatest bounded set supported by quantities.
 * @return {(Stack|null)[]} Finite filled inputs.
 */
export function fillOwnedRecipe(recipe: Recipe, mode: BookMode, width: number, current: (Stack | null)[], owned: (Stack | null)[], rules: Rules, max = false): (Stack | null)[] {
    let best: OwnedRecipeAnalysis | null = null;
    for (let amount = 1; amount <= 64; amount++) {
        const result = analyzeOwnedRecipe(recipe, mode, width, current, owned, rules, amount, false);
        if (result.conflicts.some(Boolean)) throw Error('recipe-input-conflict');
        if (!result.complete) break;
        best = result;
        if (!max) break;
    }
    if (!best) throw Error('recipe-materials-missing');
    owned.splice(0, owned.length, ...best.pool);
    return best.grid;
}
