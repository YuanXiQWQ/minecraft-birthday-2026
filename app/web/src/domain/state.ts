/** Pure commands, identity validation and projections; versioned player carriers remain separate from validated producer-owned output. */
import {agriculture,soilAt,till,trample,tickAgriculture,cropStage,canPickup} from './agriculture.ts';
import {rolledDrops} from '../rules/harvest.ts';
import {placementBlocks,PLACEABLE,placedDrops,connectBlocks,survives} from './placed-blocks.ts';
import {SOUND_CHANNELS} from './audio-settings.ts';
import {emptyAdvancements,updateAdvancements,validateAdvancements} from './advancements.ts';
import {executeCommand,type CommandFeedback} from './console.ts';
import {NativeRandom} from './environment.ts';
import {emptyEnvironment,tickEnvironment,validateEnvironment,validateSkySettings} from './environment.ts';
import {quickMove} from './slots.ts';
import {correctTool} from '../rules/process.ts';
import type {
    Command,
    DomainEvent,
    PlacementPolicy,
    Progress,
    RuntimeState,
    SceneId,
    Settings,
    State,
    WorkbenchContext,
    Station
} from './types.ts';
import {emptyWorld, validateWorld, harvestNode, plantCrop, harvestCrop} from './world-state.ts';
import {WORLD_SCENES, sameCell, nodeAtCell, sourceOccupied} from './world-config.ts';
import {tickHoppers, adjacentTransfer} from './hopper-network.ts';
import {initialBook, validateBook, discover, BOOK_RECIPES, bookApplicable, fillOwnedRecipe} from './recipe-book.ts';
import type {BookMode} from './recipe-book.ts';
import {emptyHopper, validateHopper, reduceHopperInventory} from './hopper.ts';
import {transferDevices} from './device-transfer.ts';
import processing from '../data/processing-rules.json' with {type: 'json'};
import {
    validateFurnace,
    emptyFurnace,
    advanceFurnace,
    takeFurnace,
    reduceFurnaceInventory,
    inputChanged
} from './furnace.ts';
import type {FurnaceKind} from './furnace.ts';
import reachable from '../data/registry.json' with {type: 'json'};
import nativeInventory from '../data/inventory-rules.json' with {type: 'json'};
import {emptyInventory, layout, reduceInventory, validateStack, validateCarriers, playerTargets, storeAcquired} from './inventory.ts';
import {takeCraft} from './crafting.ts';
import type {CraftReceipt} from './crafting.ts';
import type {Rules, Stack} from '../rules/types.ts';
import type {InventoryState} from './inventory.ts';
import {identity} from './slots.ts';

/** Stable identities bind authored scenery, natural visits and persistent scene layers. */
export const SCENES: SceneId[] = ['plains', 'cave', 'farm', 'home'];
/** Presentation ordering follows the proposed main path without constraining acquisition order or recipe reachability. */
export const MAINLINE = ['oak_log', 'oak_planks', 'stick', 'crafting_table', 'wooden_pickaxe', 'cobblestone', 'stone_pickaxe', 'furnace', 'raw_iron', 'iron_ingot', 'bucket', 'milk_bucket', 'wheat_seeds', 'wheat', 'sugar_cane', 'sugar', 'egg', 'cake'].map(id => 'minecraft:' + id);
/** Generated P4 fixed-point identities expand validation without changing unlock, discovery or temporary-stack semantics. */
export const KNOWN_ITEMS = new Set(reachable);


/** Publish one effective acquisition separately from its physical delivery and uncarried remainder.
 * @param {Progress} p Transaction-local progress.
 * @param {Stack[]} drops Effective native drops.
 * @param {Stack[]} deposited Groups actually put into visible carriers.
 * @param {Stack[]} overflow Groups available through permanent facts but not stored elsewhere.
 * @param {DomainEvent[]} events Commit-only notifications.
 * @param {boolean} pickup Whether delivery represents collecting world drops.
 */
function acquisition(p: Progress, drops: Stack[], deposited: Stack[], overflow: Stack[], events: DomainEvent[], pickup = true): void {
    for (const drop of drops) if (!p.unlocked.includes(drop.id)) {
        item(drop.id); p.unlocked.push(drop.id); events.push({type: 'item-unlocked', item: drop.id});
    }
    if (drops.length) events.push({type: 'items-acquired', stacks: structuredClone(drops), deposited: structuredClone(deposited), overflow: structuredClone(overflow), pickup});
}

/** Deliver harvest with hotbar-first vacancies, retaining compatible merges, overflow facts and one settlement.
 * @param {Progress} p Transaction-local resource and player facts.
 * @param {Stack[]} drops Native loot already rolled for this resource lifetime.
 * @param {Rules} rules Same-version limits and identity comparison.
 * @param {DomainEvent[]} events Notifications published only after a successful save.
 */
function depositHarvest(p: Progress, drops: Stack[], rules: Rules, events: DomainEvent[]): void {
    const deposited: Stack[] = [], overflow: Stack[] = [], carriers = {...p.player.data, cursor: null};
    for (const drop of drops) {
        const source = {stack: structuredClone(drop) as Stack | null, policy: {take: true, place: false}};
        storeAcquired(source, carriers, rules);
        const count = drop.count - (source.stack?.count ?? 0);
        if (count) deposited.push({...structuredClone(drop), count});
        if (source.stack) overflow.push(structuredClone(source.stack));
    }
    acquisition(p, drops, deposited, overflow, events);
}

/** Keep trampled wheat drops on the ground until actual pickup fits the finite bag.
 * @param {Progress} p Mutable scene facts.
 * @param {import('./types.ts').Crop} crop Removed crop lifetime.
 * @param {Rules} rules Original loot tables.
 */
function dropCrop(p:Progress,crop:import('./types.ts').Crop,rules:Rules):void {
    const a=agriculture(p),rng=new NativeRandom(a.random,true);for(const stack of rolledDrops('minecraft:wheat',null,rules,()=>rng.float(),cropStage(crop)))a.drops.push({id:'soil-drop-'+p.scene+'-'+(++a.serial),cell:[...crop.cell],stack});a.random=Number(rng.state);
}

/** Create independent empty progress, with no natural-resource visits or offline timestamps.
 * @return {Progress} Initial persistent facts.
 */
export function initialProgress(): Progress {
    return {
        advancements: emptyAdvancements(),
        world: emptyWorld(),
        environment: emptyEnvironment(),
        unlocked: [],
        scene: 'plains',
        scenes: Object.fromEntries(SCENES.map(id => [id, {
            layoutVersion: 1,
            stations: [],
            crops: []
        }])) as unknown as Progress['scenes'],
        player: {version: 1, data: layout(emptyInventory())},
        recipeBook: initialBook(),
        cakePlacement: null
    };
}

/** Create the initial documented settings and empty progress.
 * @return {State} Independent state value.
 */
export function initialState(): State {
    return {progress: initialProgress(), settings: {locale: 'en', volume: .2, muted: false, username: 'sireoh'}};
}

/** Construct ephemeral presentation state without replaying persisted completion or notifications.
 * @return {RuntimeState} Empty runtime-only state.
 */
export function initialRuntime(): RuntimeState {
    return {celebration: 'idle', screen: 'scene', natural: {}};
}

/** Recursively freeze snapshots so consumers cannot mutate the durable value through selectors.
 * @param {T} value Plain domain value.
 * @return {T} Same recursively frozen object.
 */
export function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}

/** Assert a structural condition with a stable nonlocalized diagnostic code.
 * @param {unknown} condition Domain invariant.
 * @param {string} code Error identity.
 */
export function ensure(condition: unknown, code = 'invalid-save'): asserts condition {
    if (!condition) throw new Error(code);
}

/** Accept only the expected own fields, rejecting unknown data instead of silently dropping it.
 * @param {unknown} value Candidate record.
 * @param {string[]} keys Exact supported fields.
 */
function fields(value: unknown, keys: string[]): asserts value is Record<string, any> {
    ensure(value && typeof value === 'object' && !Array.isArray(value));
    ensure(Object.keys(value).sort().join('|') === [...keys].sort().join('|'));
}

/** Validate an explicitly deferred contract without guessing its future semantics.
 * @param {unknown} value Serialized reserved field.
 */
function reserved(value: unknown): void {
    fields(value, ['version', 'data']);
    ensure(value.version === 0 && value.data === null, 'pending-contract-version');
}

/** Validate known stable item identities independently of quantities or recipes.
 * @param {unknown} item Candidate original ID.
 */
function item(item: unknown): void {
    ensure(typeof item === 'string' && KNOWN_ITEMS.has(item), 'unknown-item');
}

/** Validate safe integer coordinates without approving an authored build region.
 * @param {unknown} cell Persistent logical position.
 */
function cell(cell: unknown): void {
    ensure(Array.isArray(cell) && cell.length === 3 && cell.every(v => Number.isSafeInteger(v) && Math.abs(v) <= 32767));
}

/** Validate a station identity, supported orientation and versioned workbench inputs.
 * @param {unknown} value Candidate station.
 */
function station(value: unknown, unlocked: string[]): void {
    fields(value, ['id', 'kind', 'cell', 'facing', 'contents']);
    ensure(typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.id));
    ensure(['crafting_table', 'furnace', 'blast_furnace', 'hopper'].includes(value.kind));
    ensure(['north', 'east', 'south', 'west', ...(value.kind === 'hopper' ? ['down'] : [])].includes(value.facing));
    cell(value.cell);
    if (value.kind === 'crafting_table' && value.contents?.version === 1) {
        fields(value.contents, ['version', 'data']);
        fields(value.contents.data, ['grid']);
        ensure(Array.isArray(value.contents.data.grid) && value.contents.data.grid.length === 9);
        for (const s of value.contents.data.grid) validateStack(s, unlocked, nativeInventory);
    } else if (['furnace', 'blast_furnace'].includes(value.kind) && value.contents?.version === 2) validateFurnace(value.contents, value.kind as FurnaceKind, unlocked, processing as Rules); else if (value.kind === 'hopper' && value.contents?.version === 3) validateHopper(value.contents, unlocked, processing as Rules); else reserved(value.contents);
}

/** Validate durable structure, bounded collections and completion consistency without filling deferred contracts.
 * @param {unknown} value Decoded state.
 */
export function validateState(value: unknown): asserts value is State {
    fields(value, ['progress', 'settings']);
    const p = value.progress, s = value.settings;
    fields(p, ['world', 'unlocked', 'scene', 'scenes', 'player', 'recipeBook', 'cakePlacement', ...(Object.hasOwn(p,'environment')?['environment']:[]), ...(Object.hasOwn(p,'advancements')?['advancements']:[])]);
    if(p.advancements!==undefined)validateAdvancements(p.advancements);
    if(p.environment!==undefined)validateEnvironment(p.environment);
    validateWorld(p.world);
    fields(s, ['locale', 'volume', 'muted', ...(Object.hasOwn(s, 'username') ? ['username'] : []), ...(Object.hasOwn(s,'sky')?['sky']:[]),...(Object.hasOwn(s,'audioVersion')?['audioVersion']:[]),...SOUND_CHANNELS.map(([k])=>k).filter(k=>Object.hasOwn(s,k))]);
    if(s.sky!==undefined)validateSkySettings(s.sky);
    if(s.audioVersion!==undefined)ensure(s.audioVersion===1);
    if(SOUND_CHANNELS.some(([key])=>s[key]!==undefined))ensure(s.audioVersion===1);
    for(const [key] of SOUND_CHANNELS)if(s[key]!==undefined)ensure(Number.isFinite(s[key])&&s[key]!>=0&&s[key]!<=1);
    ensure(s.username === undefined || typeof s.username === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(s.username), 'invalid-username');
    ensure(typeof s.locale === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(s.locale));
    ensure(typeof s.volume === 'number' && Number.isFinite(s.volume) && s.volume >= 0 && s.volume <= 1);
    ensure(typeof s.muted === 'boolean');
    ensure(Array.isArray(p.unlocked) && p.unlocked.length <= 5000 && new Set(p.unlocked).size === p.unlocked.length);
    p.unlocked.forEach(item);
    ensure(SCENES.includes(p.scene));
    fields(p.scenes, SCENES);
    fields(p.player, ['version', 'data']);
    ensure(p.player.version === 1, 'pending-contract-version');
    fields(p.player.data, ['backpack', 'selected', 'hotbar', 'equipment', 'presets']);
    validateCarriers({...p.player.data, cursor: null} as InventoryState, p.unlocked, nativeInventory);
    validateBook(p.recipeBook);
    const ids = new Set<string>();
    for (const id of SCENES) {
        const scene = p.scenes[id];
        fields(scene, ['layoutVersion', 'stations', 'crops',...(Object.hasOwn(scene,'blocks')?['blocks']:[]),...(Object.hasOwn(scene,'pose')?['pose']:[]),...(Object.hasOwn(scene,'agriculture')?['agriculture']:[])]);
        ensure(scene.blocks===undefined||Array.isArray(scene.blocks)&&scene.blocks.length<=16384);
        if(scene.pose){fields(scene.pose,['feet','yaw','pitch']);ensure(Array.isArray(scene.pose.feet)&&scene.pose.feet.length===3&&scene.pose.feet.every(v=>Number.isFinite(v)&&Math.abs(v)<64)&&Number.isFinite(scene.pose.yaw)&&Number.isFinite(scene.pose.pitch)&&Math.abs(scene.pose.pitch)<=Math.PI/2);}
        if(scene.agriculture){
            const a=scene.agriculture;fields(a,['version','random','soils','drops','serial',...(a.caneAges===undefined?[]:['caneAges'])]);
            if(a.caneAges!==undefined)ensure(a.caneAges!==null&&typeof a.caneAges==='object'&&!Array.isArray(a.caneAges)&&Object.entries(a.caneAges).every(([key,age])=>WORLD_SCENES[id].nodes.some(n=>n.id===key&&n.block==='sugar_cane')&&typeof age==='number'&&Number.isInteger(age)&&age>=0&&age<=15));
            ensure(a.version===1&&Number.isSafeInteger(a.random)&&a.random>=0&&a.random<281474976710656&&Number.isSafeInteger(a.serial)&&a.serial>=0);
            ensure(Array.isArray(a.soils)&&a.soils.length<=16384&&new Set(a.soils.map(s=>s.cell.join(','))).size===a.soils.length&&Array.isArray(a.drops)&&a.drops.length<=4096);
            for(const soil of a.soils){fields(soil,['cell','moisture']);cell(soil.cell);ensure(soil.cell[0]>=-18&&soil.cell[0]<=18&&soil.cell[2]>=-22&&soil.cell[2]<=10&&soil.cell[1]>=-4&&soil.cell[1]<=6&&(soil.moisture===null||Number.isInteger(soil.moisture)&&soil.moisture>=0&&soil.moisture<=7));}
            for(const drop of a.drops){fields(drop,['id','cell','stack']);cell(drop.cell);ensure(typeof drop.id==='string'&&!ids.has(drop.id));ids.add(drop.id);ensure(KNOWN_ITEMS.has(drop.stack.id)&&Number.isInteger(drop.stack.count)&&drop.stack.count>0&&drop.stack.count<=64);}
        }
        const blockCells=new Set<string>();
        for(const b of scene.blocks??[])if(b.block==='sugar_cane')ensure(b.state.age===undefined||/^(?:[0-9]|1[0-5])$/.test(b.state.age),'invalid-cane-age');
        for(const b of scene.blocks??[]){fields(b,['id','block','cell','state',...(b.pair?['pair']:[])]);ensure(typeof b.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(b.id)&&!ids.has(b.id)&&!blockCells.has(b.cell.join(','))&&(PLACEABLE.has(b.block)||['wall_torch','oak_wall_sign'].includes(b.block)));cell(b.cell);ensure(b.state&&Object.values(b.state).every(v=>typeof v==='string')&&(!b.pair||typeof b.pair==='string'));ids.add(b.id);blockCells.add(b.cell.join(','));}
        ensure(scene.layoutVersion === 1 && Array.isArray(scene.stations) && scene.stations.length <= 512 && Array.isArray(scene.crops) && scene.crops.length <= 512);
        const occupied = new Set<string>();
        for (const v of scene.stations) {
            station(v, p.unlocked);
            ensure(!ids.has(v.id) && !occupied.has(v.cell.join(','))&&!blockCells.has(v.cell.join(',')));
            ids.add(v.id);
            occupied.add(v.cell.join(','));
        }
        for (const c of scene.crops) {
            fields(c, ['id', 'item', 'cell', 'growth']);
            ensure(typeof c.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(c.id) && !ids.has(c.id));
            ids.add(c.id);
            item(c.item);
            cell(c.cell);
            ensure(!blockCells.has(c.cell.join(',')));
            if (c.growth?.version === 1) {
                fields(c.growth, ['version', 'data']);
                fields(c.growth.data, ['ticks',...(c.growth.data.age===undefined?[]:['age'])]);
                ensure(c.growth.data.age===undefined||Number.isInteger(c.growth.data.age)&&c.growth.data.age>=0&&c.growth.data.age<=7);
                ensure(c.item === 'minecraft:wheat_seeds' && soilAt({...p,scene:id} as Progress,[c.cell[0],c.cell[1]-1,c.cell[2]])?.moisture != null, 'invalid-crop-location');
                ensure(Number.isInteger(c.growth.data.ticks) && c.growth.data.ticks >= 0 && c.growth.data.ticks <= 240);
            } else reserved(c.growth);
            ensure(!occupied.has(c.cell.join(',')));
            occupied.add(c.cell.join(','));
        }
    }
    if (p.cakePlacement !== null) {
        fields(p.cakePlacement, ['scene', 'table']);
        ensure(p.cakePlacement.scene === 'home' && p.cakePlacement.table === 'birthday-table' && p.unlocked.includes('minecraft:cake'));
    }
}

/** Apply a semantic command atomically; returned events describe only newly acquired facts.
 * @param {State} state Valid immutable snapshot.
 * @param {Command} command Requested operation.
 * @param {PlacementPolicy} policy Authored region policy, required before station changes can be admitted.
 * @param {Rules} rules Verified crafting rules, required only for result acquisition.
 * @return {{state:State,events:DomainEvent[],inventory?:InventoryState,receipt?:CraftReceipt;transferred?:number}} Valid new snapshot, transient events and optional transaction-local carriers.
 */
export function transition(state: State, command: Command, policy?: PlacementPolicy, rules?: Rules): {
    state: State;
    events: DomainEvent[];
    inventory?: InventoryState;
    receipt?: CraftReceipt;
    transferred?: number;
    console?: CommandFeedback[]
} {
    validateState(state);
    const next = structuredClone(state), p = next.progress, events: DomainEvent[] = [];
    let inventory: InventoryState | undefined, receipt: CraftReceipt | undefined, transferred: number | undefined;
    let console:CommandFeedback[]|undefined;
    const acquiredRecipes: string[] = [];
    switch (command.type) {
        case 'till-soil': {
            ensure(command.scene===p.scene&&identity(command.expected)===identity(p.player.data),'inventory-conflict');
            till(p,command.cell,command.normal,p.player.data.hotbar[p.player.data.selected]);break;
        }
        case 'land-on-soil': {
            ensure(command.scene===p.scene&&rules,'wrong-scene');
            const crop=trample(p,command.feet,command.distance);if(crop)dropCrop(p,crop,rules);
            break;
        }
        case 'pickup-ground': {
            ensure(command.scene===p.scene&&command.visit===p.world.visits[p.scene].epoch&&rules,'resource-visit-conflict');
            const a=agriculture(p),visit=p.world.visits[p.scene];
            const candidates=[...a.drops,...WORLD_SCENES[p.scene].nodes.filter(n=>n.kind==='egg'&&!visit.removed.includes(n.id)).map(n=>({id:n.id,cell:n.cell,stack:{id:'minecraft:egg',count:1}}))];
            for(const drop of candidates){if(!canPickup(command.feet,drop.cell))continue;
                const source={stack:structuredClone(drop.stack) as Stack|null,policy:{take:true,place:false}};
                storeAcquired(source,{...p.player.data,cursor:null},rules);const count=drop.stack.count-(source.stack?.count??0);
                if(!count)continue;const delivered={...drop.stack,count};acquisition(p,[delivered],[delivered],[],events);
                if(WORLD_SCENES[p.scene].nodes.some(n=>n.kind==='egg'&&n.id===drop.id))visit.removed.push(drop.id);
                else if(source.stack)drop.stack=source.stack;else a.drops=a.drops.filter(d=>d.id!==drop.id);
            }break;
        }
        case 'save-pose':ensure(command.scene===p.scene,'wrong-scene');p.scenes[p.scene].pose=structuredClone(command.pose);break;
        case 'place-block': {
            ensure(command.scene===p.scene&&identity(command.expected)===identity(p.player.data),'inventory-conflict');
            const stack=p.player.data.hotbar[p.player.data.selected];ensure(stack?.id==='minecraft:'+command.item,'inventory-conflict');
            const blocks=placementBlocks(p,command.item,command.hit,command.id),scene=p.scenes[p.scene];scene.blocks??=[];
            for(const block of blocks){scene.blocks=scene.blocks.filter(b=>!sameCell(b.cell,block.cell));const node=WORLD_SCENES[p.scene].nodes.find(n=>nodeAtCell(n,block.cell));if(node&&!p.world.visits[p.scene].removed.includes(node.id))p.world.visits[p.scene].removed.push(node.id);scene.blocks.push(block);}
            p.player.data.hotbar[p.player.data.selected]=stack!.count>1?{...stack!,count:stack!.count-1}:null;break;
        }
        case 'use-block': {
            ensure(command.scene===p.scene,'wrong-scene');const blocks=p.scenes[p.scene].blocks??[],b=blocks.find(b=>b.id===command.id);ensure(b,'block-unavailable');
            if(['oak_door','oak_trapdoor','oak_fence_gate'].includes(b!.block)){const root=b!.pair??b!.id,value=String(b!.state.open!=='true');for(const part of blocks.filter(v=>v.id===root||v.pair===root))part.state.open=value;}
            else if(b!.block==='lever')b!.state.powered=String(b!.state.powered!=='true');
            else if(b!.block.endsWith('_button')){b!.state.powered='true';b!.state.releaseTick=String(p.world.tick+(b!.block==='oak_button'?30:20));}
            break;
        }
        case 'break-block': {
            ensure(command.scene===p.scene&&identity(command.expected)===identity(p.player.data),'inventory-conflict');
            const scene=p.scenes[p.scene],block=scene.blocks?.find(b=>b.id===command.id);ensure(block,'block-unavailable');
            const primary=block!.pair?scene.blocks!.find(b=>b.id===block!.pair)??block!:block!;
            if(rules)depositHarvest(p,placedDrops(primary,p.player.data.hotbar[p.player.data.selected],rules),rules,events);
            scene.blocks=scene.blocks!.filter(b=>b.id!==primary.id&&b.pair!==primary.id);break;
        }

        case 'console': console=executeCommand(next,command.source); break;
        case 'book-settings': {
            ensure(['crafting', 'furnace', 'blast_furnace'].includes(command.mode), 'invalid-recipe-book');
            ensure(Object.keys(command.patch).length > 0 && Object.entries(command.patch).every(([k, v]) => ['open', 'filter'].includes(k) && typeof v === 'boolean'), 'invalid-recipe-book');
            Object.assign(p.recipeBook.data.views[command.mode], command.patch);
            break;
        }
        case 'book-seen': {
            ensure(Array.isArray(command.recipes) && command.recipes.length <= 111 && command.recipes.every(id => p.recipeBook.data.known.includes(id)), 'invalid-recipe-book');
            p.recipeBook.data.unseen = p.recipeBook.data.unseen.filter(id => !command.recipes.includes(id));
            break;
        }
        case 'book-fill': {
            ensure(rules, 'native-rules-unavailable');
            ensure(typeof command.max === 'boolean' && p.recipeBook.data.known.includes(command.recipe), 'recipe-not-discovered');
            ensure(identity(command.expected) === identity(p.player.data), 'inventory-conflict');
            const device = command.workbench ? currentContainer(next, command.workbench) : null;
            ensure(!device || device.kind !== 'hopper', 'recipe-menu-mismatch');
            const mode: BookMode = device?.kind === 'furnace' || device?.kind === 'blast_furnace' ? device.kind : 'crafting',
                recipe = BOOK_RECIPES.find(r => r.id === command.recipe);
            ensure(recipe && bookApplicable(recipe, mode, device?.kind === 'crafting_table' ? 3 : 2), 'recipe-menu-mismatch');
            inventory = {
                ...structuredClone(p.player.data),
                cursor: structuredClone(command.cursor),
                crafting: structuredClone(command.crafting)
            };
            validateCarriers(inventory, p.unlocked, nativeInventory);
            const owned = [...inventory.backpack, ...inventory.hotbar];
            if (device?.contents.version === 2) {
                const before = device.contents.data.input;
                const grid = fillOwnedRecipe(recipe, mode, 1, [before], owned, rules, command.max);
                device.contents.data.input = grid[0];
                inputChanged(device.contents.data, before, device.kind as FurnaceKind, rules);
                inventory.machine = [structuredClone(device.contents.data.input), structuredClone(device.contents.data.fuel)];
            } else if (device) {
                ensure(device.contents.version === 1, 'invalid-crafting-device');
                device.contents.data.grid = fillOwnedRecipe(recipe, mode, 3, device.contents.data.grid, owned, rules, command.max);
                inventory.workbench = structuredClone(device.contents.data.grid);
            } else inventory.crafting = fillOwnedRecipe(recipe, mode, 2, inventory.crafting!, owned, rules, command.max);
            inventory.backpack = owned.slice(0, 27);
            inventory.hotbar = owned.slice(27);
            p.player = {version: 1, data: layout(inventory)};
            validateCarriers(inventory, p.unlocked, nativeInventory);
            break;
        }
        case 'device-transfer': {
            if (policy?.network) ensure(adjacentTransfer(p, command.plan), 'nonadjacent-device-transfer');
            ensure(rules, 'native-rules-unavailable');
            const result = transferDevices(p, command.plan, rules);
            transferred = result.moved;
            if (result.recipe && result.moved) acquiredRecipes.push(result.recipe);
            for (const id of result.acquired) if (!p.unlocked.includes(id)) {
                p.unlocked.push(id);
                events.push({type: 'item-unlocked', item: id});
            }
            break;
        }
        case 'furnace-take': {
            ensure(rules, 'native-rules-unavailable');
            ensure(identity(command.expected) === identity(p.player.data), 'inventory-conflict');
            const device = currentDevice(next, command.workbench);
            ensure(device.contents.version === 2, 'invalid-furnace');
            const taken = takeFurnace({
                ...p.player.data,
                cursor: command.cursor
            }, device.contents, command.take, p.unlocked, rules);
            if (device.contents.data.outputRecipe) acquiredRecipes.push(device.contents.data.outputRecipe);
            device.contents = taken.contents;
            receipt = taken.receipt;
            inventory = receipt.inventory;
            p.player = {version: 1, data: layout(inventory)};
            for (const id of receipt.acquired) if (!p.unlocked.includes(id)) {
                p.unlocked.push(id);
                events.push({type: 'item-unlocked', item: id});
            }
            break;
        }
        case 'processing-tick': {
            ensure(rules, 'native-rules-unavailable');
            ensure(Number.isInteger(command.ticks) && command.ticks >= 0 && command.ticks <= 1200, 'invalid-ticks');
            p.environment??=emptyEnvironment();
            const control=p.environment.control;
            if(command.controlEpoch!==undefined)ensure(command.controlEpoch===control.epoch,'processing-inactive');
            const requested=command.ticks;
            const ticks=control.sprintTicks?Math.min(requested,control.sprintTicks):control.frozen?Math.min(requested,control.stepTicks):requested;
            const ready = discover(p.recipeBook, p.unlocked);
            if (ready.length) events.push({type: 'recipes-discovered', recipes: ready});
            for (let t = 0; t < ticks; t++) {
                if(control.sprintTicks){if(--control.sprintTicks===0)control.frozen=control.sprintRestore;}
                if(control.stepTicks)control.stepTicks--;
                p.world.tick++;
                p.environment??=emptyEnvironment(); tickEnvironment(p.environment);
                for(const {scene,crop} of tickAgriculture(p))dropCrop({...p,scene},crop,rules);
                for (const scene of Object.values(p.scenes)) {
                    for (const device of scene.stations) if (device.kind === 'furnace' || device.kind === 'blast_furnace') {
                        if (device.contents.version !== 2) device.contents = emptyFurnace();
                        const returned = advanceFurnace(device.contents as ReturnType<typeof emptyFurnace>, device.kind, 1, rules);
                        for (const id of returned) if (!p.unlocked.includes(id)) {
                            p.unlocked.push(id);
                            events.push({type: 'item-unlocked', item: id});
                        }
                    }
                }
                if (policy?.network) tickHoppers(p, rules, (ids, recipe) => {
                    const acquired = recipe ? [recipe] : [];
                    let dirty = !!recipe && !p.recipeBook.data.known.includes(recipe);
                    for (const id of ids) if (!p.unlocked.includes(id)) {
                        dirty = true;
                        p.unlocked.push(id);
                        events.push({type: 'item-unlocked', item: id});
                    }
                    if (dirty) {
                        const found = discover(p.recipeBook, p.unlocked, acquired);
                        if (found.length) events.push({type: 'recipes-discovered', recipes: found});
                    }
                });
            }
            break;
        }
        case 'harvest-node':
        case 'plant-crop':
        case 'harvest-crop': {
            ensure(rules, 'native-rules-unavailable');
            ensure(identity(command.expected) === identity(p.player.data), 'inventory-conflict');
            const held = p.player.data.hotbar[p.player.data.selected];
            let drops: Stack[] = [];
            if (command.type === 'harvest-node') drops = harvestNode(p, command.scene, command.node, command.visit, held, rules);
            else if (command.type === 'plant-crop') plantCrop(p, command.cell, command.id, held);
            else drops = harvestCrop(p, command.id, rules);
            if (command.type === 'harvest-node' && command.node === 'cow:0') {
                const converted = structuredClone(drops);
                ensure(held?.id === rules.interactions.milk.input, 'milk-requires-bucket');
                if (held.count === 1) {p.player.data.hotbar[p.player.data.selected] = structuredClone(drops[0]); drops = [];}
                else p.player.data.hotbar[p.player.data.selected] = {...held, count: held.count - 1};
                const carriers = {...p.player.data, cursor: null};
                for (const drop of drops) {
                    const source = {stack: structuredClone(drop) as Stack | null, policy: {take: true, place: false}};
                    storeAcquired(source, carriers, rules);
                    ensure(!source.stack, 'inventory-full');
                }
                acquisition(p, converted, converted, [], events, false);
            } else depositHarvest(p, drops, rules, events);
            break;
        }
        case 'rotate-station': {
            ensure(command.scene === p.scene);
            const d = p.scenes[p.scene].stations.find(d => d.id === command.id);
            ensure(d && d.facing === command.expected, 'station-content-conflict');
            const faces = d.kind === 'hopper' ? ['down', 'north', 'east', 'south', 'west'] as const : ['north', 'east', 'south', 'west'] as const;
            d.facing = faces[(faces.indexOf(d.facing as never) + 1) % faces.length];
            break;
        }
        case 'inventory':
        case 'craft-take': {
            ensure(identity(command.expected) === identity(p.player.data), 'inventory-conflict');
            const device = command.workbench ? currentContainer(next, command.workbench) : null;
            const carriers: InventoryState = {
                ...p.player.data,
                cursor: command.cursor, ...(command.crafting ? {crafting: command.crafting} : {}), ...(device?.kind === 'crafting_table' ? {workbench: structuredClone(device.contents.version === 1 ? device.contents.data.grid : Array(9).fill(null))} : {}), ...(device?.contents.version === 3 ? {hopper: structuredClone(device.contents.data.slots)} : {}), ...(device?.contents.version === 2 ? {machine: [structuredClone(device.contents.data.input), structuredClone(device.contents.data.fuel)]} : {})
            };
            if (command.type === 'craft-take') {
                ensure(!device || device.kind === 'crafting_table', 'invalid-crafting-device');
                ensure(rules, 'native-rules-unavailable');
                receipt = takeCraft(carriers, command.take, p.unlocked, rules);
                if (receipt.recipe) acquiredRecipes.push(receipt.recipe);
                inventory = receipt.inventory;
                for (const id of receipt.acquired) {
                    item(id);
                    if (!p.unlocked.includes(id)) {
                        p.unlocked.push(id);
                        events.push({type: 'item-unlocked', item: id});
                    }
                }
            } else inventory = device?.contents.version === 3 ? reduceHopperInventory(carriers, command.intent, p.unlocked, processing as Rules) : device?.contents.version === 2 ? reduceFurnaceInventory(carriers, command.intent, p.unlocked, processing as Rules, device.kind as FurnaceKind) : reduceInventory(carriers, command.intent, p.unlocked, nativeInventory);
            p.player = {version: 1, data: layout(inventory)};
            if (device?.contents.version === 3) device.contents.data.slots = structuredClone(inventory.hopper!); else if (device?.contents.version === 2) {
                const before = device.contents.data.input;
                device.contents.data.input = inventory.machine![0];
                device.contents.data.fuel = inventory.machine![1];
                inputChanged(device.contents.data, before, device.kind as FurnaceKind, processing as Rules);
            } else if (device) device.contents = {version: 1, data: {grid: structuredClone(inventory.workbench!)}};
            break;
        }
        case 'close-workbench': {
            const station = p.scenes[command.scene].stations.find(s => s.id === command.id);
            if (!station) break;
            ensure(station.kind === 'crafting_table' && station.contents.version === 1, 'invalid-crafting-device');
            const carriers = {...structuredClone(p.player.data), cursor: null};
            for (const stack of station.contents.data.grid) if (stack) {
                const source = {stack: structuredClone(stack) as Stack | null, policy: {take: true, place: false}};
                quickMove(source, playerTargets(carriers), rules ?? nativeInventory);
                ensure(!source.stack, 'workbench-return-full');
            }
            p.player.data = layout(carriers);
            station.contents.data.grid = Array(9).fill(null);
            break;
        }
        case 'unlock':
            item(command.item);
            if (!p.unlocked.includes(command.item)) {
                p.unlocked.push(command.item);
                events.push({type: 'item-unlocked', item: command.item});
            }
            break;
        case 'select-scene':
            ensure(SCENES.includes(command.scene));
            if (p.scene !== command.scene) {
                p.scene = command.scene;
                p.world.visits[p.scene].epoch++;
                p.world.visits[p.scene].removed = [];
            }
            break;
        case 'put-station':
            if (command.expected) ensure(command.scene === p.scene && identity(command.expected) === identity(p.player.data) && p.player.data.hotbar[p.player.data.selected]?.id === 'minecraft:' + command.station.kind, 'inventory-conflict');
            ensure(SCENES.includes(command.scene));
            station(command.station, p.unlocked);
            ensure(policy?.allows(command.scene, command.station), 'placement-policy-pending');
            ensure(p.unlocked.includes('minecraft:' + command.station.kind), 'locked-item');
        {
            const list = p.scenes[command.scene].stations, index = list.findIndex(s => s.id === command.station.id);
            if (index < 0) {
                if (command.station.kind === 'hopper') ensure(identity(command.station.contents) === identity(emptyHopper()), 'nonempty-new-device');
                if (command.station.kind === 'furnace' || command.station.kind === 'blast_furnace') ensure(identity(command.station.contents) === identity(emptyFurnace()), 'nonempty-new-device');
                if (policy?.network) {

                    ensure(!sourceOccupied({...p, scene: command.scene}, command.station.cell), 'occupied-resource');
                }
                if (command.expected) {
                    const stack = p.player.data.hotbar[p.player.data.selected]!;
                    p.player.data.hotbar[p.player.data.selected] = stack.count > 1 ? {...stack, count: stack.count - 1} : null;
                }
                list.push(structuredClone(command.station));
            } else {
                ensure(list[index].kind === command.station.kind && identity(list[index].contents) === identity(command.station.contents), 'station-content-conflict');
                list[index] = structuredClone(command.station);
            }
        }
            break;
        case 'remove-station':
            ensure(p.scenes[command.scene].stations.some(s => s.id === command.id), 'station-unavailable');
            if (command.expected) ensure(command.scene === p.scene && identity(command.expected) === identity(p.player.data), 'inventory-conflict');
            const removed = p.scenes[command.scene].stations.find(s => s.id === command.id)!;
            if (command.expected && rules) {
                const held = p.player.data.hotbar[p.player.data.selected];
                if (removed.kind === 'crafting_table' || held && correctTool(held.id, 'minecraft:' + removed.kind, rules)) {
                    depositHarvest(p, [{id: 'minecraft:' + removed.kind, count: 1}], rules, events);
                }
            }
            delete p.world.hoppers[command.id];
            ensure(SCENES.includes(command.scene));
            p.scenes[command.scene].stations = p.scenes[command.scene].stations.filter(s => s.id !== command.id);
            break;
        case 'sky-settings': {
            ensure(Object.keys(command.patch).length>0&&Object.entries(command.patch).every(([key,v])=>['time','weather'].includes(key)&&['game','real'].includes(v!)),'invalid-sky-settings');
            next.settings.sky={time:'game',weather:'game',...next.settings.sky,...command.patch};break;
        }
        case 'settings':
            ensure(Object.keys(command.patch).every(k => ['locale', 'volume', 'muted', 'username', 'sky',...SOUND_CHANNELS.map(([key])=>key)].includes(k)));
            next.settings = {...next.settings, ...command.patch};
            if(SOUND_CHANNELS.some(([key])=>Object.hasOwn(command.patch,key)))next.settings.audioVersion=1;
            break;
        case 'record-cake-placement':
            if (command.expected) ensure(identity(command.expected) === identity(p.player.data), 'inventory-conflict');
            ensure(command.scene === 'home' && command.table === 'birthday-table' && p.scene === 'home' && p.unlocked.includes('minecraft:cake'), 'invalid-cake-placement');
            if (!p.cakePlacement) {
                const held = p.player.data.hotbar[p.player.data.selected];
                ensure(held?.id === 'minecraft:cake' && held.count > 0, 'cake-not-held');
                p.player.data.hotbar[p.player.data.selected] = held.count > 1 ? {...held, count: held.count - 1} : null;
                p.cakePlacement = {scene: 'home', table: 'birthday-table'};
                events.push({type: 'cake-placed'});
            }
            break;
        default:
            throw new Error('unknown-command');
    }
    p.advancements??=emptyAdvancements();
    const completed=updateAdvancements(p.advancements,state.progress.player.data,p.player.data,command.type==='plant-crop');
    if(completed.length)events.push({type:'advancements-completed',advancements:completed});
    if (!['processing-tick','settings','save-pose'].includes(command.type) && JSON.stringify(p) !== JSON.stringify(state.progress)) p.world.manual++;
    const discovered = discover(p.recipeBook, p.unlocked, acquiredRecipes);
    if (discovered.length) events.push({type: 'recipes-discovered', recipes: discovered});
    for(const scene of Object.values(p.scenes))for(const b of scene.blocks??[])if(b.state.releaseTick&&p.world.tick>=Number(b.state.releaseTick)){b.state.powered='false';delete b.state.releaseTick;}
    if(['place-block','break-block','harvest-node','remove-station','put-station'].includes(command.type)){
        let removed=true;while(removed){removed=false;for(const b of [...(p.scenes[p.scene].blocks??[])])if(!b.pair&&!survives(p,b)){
            if(rules)depositHarvest(p,placedDrops(b,null,rules,false),rules,events);
            p.scenes[p.scene].blocks=p.scenes[p.scene].blocks!.filter(v=>v.id!==b.id&&v.pair!==b.id);removed=true;
        }}
    }
    connectBlocks(p);
    validateState(next);
    return {state: freeze(next), events, inventory, receipt, transferred, console};
}

/** Reset only progress, retaining the user's language, volume and mute choice.
 * @param {Settings} settings Previously validated preferences.
 * @return {State} Fresh progress with retained settings.
 */
export function resetState(settings: Settings): State {
    const value = {progress: initialProgress(), settings: structuredClone(settings)};
    validateState(value);
    return freeze(value);
}

/** Project fixed mainline cells and stable first-acquired side items without changing permanent facts.
 * @param {State} state Current snapshot.
 * @return {{item:string,unlocked:boolean}[]} Read-only display ordering.
 */
export function catalogue(state: State): { item: string; unlocked: boolean }[] {
    return [...MAINLINE, ...state.progress.unlocked.filter(id => !MAINLINE.includes(id))].map(item => ({
        item,
        unlocked: state.progress.unlocked.includes(item)
    }));
}

/** Project the sole persistent completion fact for either page.
 * @param {State} state Current snapshot.
 * @return {boolean} Whether the table should display a cake.
 */
export function hasCake(state: State): boolean {
    return state.progress.cakePlacement !== null;
}

/** Resolve a live same-scene workbench and compare its complete content before a container transaction.
 * @param {State} state Latest locked state.
 * @param {WorkbenchContext} context Observed instance and versioned content.
 * @return {Station} Valid workbench owned by the current scene.
 */
export function currentWorkbench(state: State, context: WorkbenchContext): Station {
    ensure(context.scene === state.progress.scene, 'station-scene-changed');
    const value = state.progress.scenes[context.scene].stations.find(s => s.id === context.id);
    ensure(value && value.kind === 'crafting_table', 'station-unavailable');
    ensure(identity(value.contents) === identity(context.expected), 'station-content-conflict');
    return value;
}

/** Resolve a live device and fence changed output, without confusing producer output with an unlocked carrier.
 * @param {State} state Latest locked facts.
 * @param {WorkbenchContext} context Observed contents.
 * @return {Station} Valid exact device.
 */
export function currentDevice(state: State, context: WorkbenchContext): Station {
    ensure(context.scene === state.progress.scene, 'station-scene-changed');
    const value = state.progress.scenes[context.scene].stations.find(s => s.id === context.id);
    ensure(value && (value.kind === 'furnace' || value.kind === 'blast_furnace') && value.contents.version === 2 && context.expected.version === 2, 'station-unavailable');
    ensure(identity(value.contents.data.output) === identity(context.expected.data.output), 'station-content-conflict');
    return value;
}

/** Compare only manually editable references, allowing timer updates while an ordinary slot transaction is queued.
 * @param {State} state Latest locked state.
 * @param {WorkbenchContext} context Observed input ownership.
 * @return {Station} Valid current container.
 */
function currentContainer(state: State, context: WorkbenchContext): Station {
    if (context.expected.version === 3) {
        ensure(context.scene === state.progress.scene, 'station-scene-changed');
        const value = state.progress.scenes[context.scene].stations.find(s => s.id === context.id);
        ensure(value && value.kind === 'hopper' && value.contents.version === 3, 'station-unavailable');
        ensure(identity(value.contents) === identity(context.expected), 'station-content-conflict');
        return value;
    }
    if (context.expected.version !== 2) return currentWorkbench(state, context);
    ensure(context.scene === state.progress.scene, 'station-scene-changed');
    const value = state.progress.scenes[context.scene].stations.find(s => s.id === context.id);
    ensure(value && (value.kind === 'furnace' || value.kind === 'blast_furnace') && value.contents.version === 2, 'station-unavailable');
    ensure(identity([value.contents.data.input, value.contents.data.fuel]) === identity([context.expected.data.input, context.expected.data.fuel]), 'station-content-conflict');
    return value;
}
