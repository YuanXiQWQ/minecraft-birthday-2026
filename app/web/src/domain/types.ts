/** Persistent identities and reserved contracts have no DOM, renderer, recipe or temporary-stack dependency. */
export type Cell=[number,number,number];
export type Kind='crafting_table'|'furnace'|'blast_furnace'|'hopper';
export type Facing='north'|'east'|'south'|'west'|'down';
export type SceneId='plains'|'cave'|'farm'|'home';
export interface Reserved {version:0;data:null}
export interface Station {id:string;kind:Kind;cell:Cell;facing:Facing;contents:Reserved}
export interface Crop {id:string;item:string;cell:Cell;growth:Reserved}
export interface SceneState {layoutVersion:1;stations:Station[];crops:Crop[]}
export interface Settings {locale:string;volume:number;muted:boolean}
export interface Progress {unlocked:string[];scene:SceneId;scenes:Record<SceneId,SceneState>;player:Reserved;recipeBook:Reserved;cakePlacement:null|{scene:'home';table:'birthday-table'}}
export interface State {progress:Progress;settings:Settings}
export interface RuntimeState {celebration:'idle'|'playing'|'paused';screen:'scene'|'settings'|'inventory';natural:Partial<Record<SceneId,{visit:number;removed:string[]}>>}
export type Command={type:'unlock';item:string}|{type:'select-scene';scene:SceneId}|{type:'put-station';scene:SceneId;station:Station}|{type:'remove-station';scene:SceneId;id:string}|{type:'settings';patch:Partial<Settings>}|{type:'record-cake-placement';scene:'home';table:'birthday-table'};
export interface DomainEvent {type:'item-unlocked'|'cake-placed';item?:string}
export interface PlacementPolicy {allows:(scene:SceneId,station:Station)=>boolean}
