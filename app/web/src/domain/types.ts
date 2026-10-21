/** Persistent facts and versioned carrier contracts have no DOM or renderer dependency. */
import type {InventoryCommand,PlayerLayout} from './inventory.ts';import type {CraftTake} from './crafting.ts';import type {Stack} from '../rules/types.ts';
export type Cell=[number,number,number];
export type Kind='crafting_table'|'furnace'|'blast_furnace'|'hopper';
export type Facing='north'|'east'|'south'|'west'|'down';
export type SceneId='plains'|'cave'|'farm'|'home';
export interface Reserved {version:0;data:null}
export interface WorkbenchContents {version:1;data:{grid:(Stack|null)[]}}
export interface WorkbenchContext {scene:SceneId;id:string;expected:Reserved|WorkbenchContents}
export interface Station {id:string;kind:Kind;cell:Cell;facing:Facing;contents:Reserved|WorkbenchContents}
export interface Crop {id:string;item:string;cell:Cell;growth:Reserved}
export interface SceneState {layoutVersion:1;stations:Station[];crops:Crop[]}
export interface Settings {locale:string;volume:number;muted:boolean}
export interface Player {version:1;data:PlayerLayout}
export interface Progress {unlocked:string[];scene:SceneId;scenes:Record<SceneId,SceneState>;player:Player;recipeBook:Reserved;cakePlacement:null|{scene:'home';table:'birthday-table'}}
export interface State {progress:Progress;settings:Settings}
export interface RuntimeState {celebration:'idle'|'playing'|'paused';screen:'scene'|'settings'|'inventory';natural:Partial<Record<SceneId,{visit:number;removed:string[]}>>}
export type Command={type:'unlock';item:string}|{type:'select-scene';scene:SceneId}|{type:'put-station';scene:SceneId;station:Station}|{type:'remove-station';scene:SceneId;id:string}|{type:'settings';patch:Partial<Settings>}|{type:'record-cake-placement';scene:'home';table:'birthday-table'}|{type:'craft-take';take:CraftTake;cursor:Stack|null;crafting:(Stack|null)[];expected:PlayerLayout;workbench?:WorkbenchContext}|{type:'inventory';intent:InventoryCommand;cursor:Stack|null;crafting?:(Stack|null)[];expected:PlayerLayout;workbench?:WorkbenchContext};
export interface DomainEvent {type:'item-unlocked'|'cake-placed';item?:string}
export interface PlacementPolicy {allows:(scene:SceneId,station:Station)=>boolean}
