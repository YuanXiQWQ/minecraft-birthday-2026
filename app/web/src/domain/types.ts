/** Persistent facts and versioned carrier contracts have no DOM or renderer dependency. */
import type {WorldState} from './world-state.ts';
import type {RecipeBook, BookMode, BookSetting} from './recipe-book.ts';
import type {TransferPlan} from './device-transfer.ts';
import type {HopperContents} from './hopper.ts';
import type {FurnaceContents, FurnaceTake} from './furnace.ts';
import type {InventoryCommand, PlayerLayout} from './inventory.ts';
import type {CraftTake} from './crafting.ts';
import type {Stack} from '../rules/types.ts';

export type Cell = [number, number, number];
export type Kind = 'crafting_table' | 'furnace' | 'blast_furnace' | 'hopper';
export type Facing = 'north' | 'east' | 'south' | 'west' | 'down';
export type SceneId = 'plains' | 'cave' | 'farm' | 'home';

export interface Reserved {
    version: 0;
    data: null;
}

export interface WorkbenchContents {
    version: 1;
    data: { grid: (Stack | null)[] };
}

export interface WorkbenchContext {
    scene: SceneId;
    id: string;
    expected: Reserved | WorkbenchContents | FurnaceContents | HopperContents;
}

export interface Station {
    id: string;
    kind: Kind;
    cell: Cell;
    facing: Facing;
    contents: Reserved | WorkbenchContents | FurnaceContents | HopperContents;
}

export interface Crop {
    id: string;
    item: string;
    cell: Cell;
    growth: Reserved | { version: 1; data: { ticks: number } };
}

export interface SceneState {
    layoutVersion: 1;
    stations: Station[];
    crops: Crop[];
}

export interface Settings {
    username?: string;
    locale: string;
    volume: number;
    muted: boolean;
}

export interface Player {
    version: 1;
    data: PlayerLayout;
}

export interface Progress {
    world: WorldState;
    unlocked: string[];
    scene: SceneId;
    scenes: Record<SceneId, SceneState>;
    player: Player;
    recipeBook: RecipeBook;
    cakePlacement: null | { scene: 'home'; table: 'birthday-table' };
}

export interface State {
    progress: Progress;
    settings: Settings;
}

export interface RuntimeState {
    celebration: 'idle' | 'playing' | 'paused';
    screen: 'scene' | 'settings' | 'inventory';
    natural: Partial<Record<SceneId, { visit: number; removed: string[] }>>;
}

export type Command =
    { type: 'harvest-node'; scene: SceneId; node: string; visit: number; expected: PlayerLayout }
    | {
    type: 'plant-crop';
    cell: Cell;
    id: string;
    expected: PlayerLayout
}
    | { type: 'harvest-crop'; id: string; expected: PlayerLayout }
    | {
    type: 'rotate-station';
    scene: SceneId;
    id: string;
    expected: Facing
}
    | {
    type: 'book-fill';
    recipe: string;
    max: boolean;
    cursor: Stack | null;
    crafting: (Stack | null)[];
    expected: PlayerLayout;
    workbench?: WorkbenchContext
}
    | { type: 'book-settings'; mode: BookMode; patch: Partial<BookSetting> }
    | { type: 'book-seen'; recipes: string[] }
    | { type: 'device-transfer'; plan: TransferPlan }
    | { type: 'processing-tick'; ticks: number }
    | {
    type: 'furnace-take';
    take: FurnaceTake;
    cursor: Stack | null;
    expected: PlayerLayout;
    workbench: WorkbenchContext
}
    | { type: 'close-workbench'; scene: SceneId; id: string }
    | { type: 'unlock'; item: string }
    | { type: 'select-scene'; scene: SceneId }
    | { type: 'put-station'; scene: SceneId; station: Station; expected?: PlayerLayout }
    | { type: 'remove-station'; scene: SceneId; id: string; expected?: PlayerLayout }
    | { type: 'settings'; patch: Partial<Settings> }
    | { type: 'record-cake-placement'; scene: 'home'; table: 'birthday-table'; expected?: PlayerLayout }
    | {
    type: 'craft-take';
    take: CraftTake;
    cursor: Stack | null;
    crafting: (Stack | null)[];
    expected: PlayerLayout;
    workbench?: WorkbenchContext
}
    | {
    type: 'inventory';
    intent: InventoryCommand;
    cursor: Stack | null;
    crafting?: (Stack | null)[];
    expected: PlayerLayout;
    workbench?: WorkbenchContext
};

export interface DomainEvent {
    type: 'item-unlocked' | 'items-acquired' | 'cake-placed' | 'recipes-discovered';
    stacks?: Stack[];
    item?: string;
    recipes?: string[];
}

export interface PlacementPolicy {
    network?: boolean;
    allows: (scene: SceneId, station: Station) => boolean;
}
