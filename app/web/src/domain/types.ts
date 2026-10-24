/** Persistent facts and versioned carrier contracts have no DOM or renderer dependency. */
import type {Agriculture} from './agriculture.ts';
import type {EnvironmentState,SkySettings} from './environment.ts';
import type {AdvancementFacts} from './advancements.ts';
import type {WorldState} from './world-state.ts';
import type {PlacedBlock,BlockHit} from './placed-blocks.ts';
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
    growth: Reserved | { version: 1; data: { ticks: number; age?: number } };
}

export interface SceneState {
    agriculture?: Agriculture;
    pose?: {feet:Cell;yaw:number;pitch:number};
    blocks?: PlacedBlock[];
    layoutVersion: 1;
    stations: Station[];
    crops: Crop[];
}

export interface Settings {
    audioVersion?: 1;
    musicVolume?: number;
    weatherVolume?: number;
    blocksVolume?: number;
    neutralVolume?: number;
    playersVolume?: number;
    uiVolume?: number;
    sky?: SkySettings;
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
    advancements?: AdvancementFacts;
    environment?: EnvironmentState;
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
    {type:'till-soil';scene:SceneId;cell:Cell;normal:Cell;expected:PlayerLayout}
    | {type:'land-on-soil';scene:SceneId;feet:Cell;distance:number}
    | {type:'pickup-ground';scene:SceneId;feet:Cell;visit:number}
    |
    {type:'save-pose';scene:SceneId;pose:{feet:Cell;yaw:number;pitch:number}}
    | {type:'place-block';scene:SceneId;item:string;hit:BlockHit;id:string;expected:PlayerLayout}
    | {type:'break-block';scene:SceneId;id:string;expected:PlayerLayout}
    | {type:'use-block';scene:SceneId;id:string}
    | { type: 'harvest-node'; scene: SceneId; node: string; visit: number; expected: PlayerLayout }
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
    | { type: 'processing-tick'; controlEpoch?:number; ticks: number }
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
    | { type: 'console'; source: string }
    | { type: 'sky-settings'; patch: Partial<SkySettings> }
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
    type: 'item-unlocked' | 'items-acquired' | 'cake-placed' | 'recipes-discovered' | 'advancements-completed';
    advancements?: string[];
    /** Effective native drops, independent of bag capacity. */
    stacks?: Stack[];
    /** Finite groups actually delivered to visible player carriers. */
    deposited?: Stack[];
    /** World-drop pickup, as opposed to a direct bucket-use conversion. */
    pickup?: boolean;
    /** Effective drops that did not fit; no hidden carrier is created. */
    overflow?: Stack[];
    item?: string;
    recipes?: string[];
}

export interface PlacementPolicy {
    network?: boolean;
    allows: (scene: SceneId, station: Station) => boolean;
}
