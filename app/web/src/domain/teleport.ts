/** Scene teleportation shares visit transitions between navigation and console commands. */
import type {Progress, SceneId} from './types.ts';
import aliases from './scene-destinations.json' with {type:'json'};

/** Resolve command destination tokens independently of the current display language.
 * @param {string} name Scene ID or localized alias.
 * @return {SceneId|null} Valid authored destination.
 */
export function sceneDestination(name:string):SceneId|null {return Object.hasOwn(aliases,name)?aliases[name as keyof typeof aliases] as SceneId:null;}
/** Complete both canonical and localized scene tokens. @return {string[]} Available destination tokens. */
export function sceneDestinations():string[] {return Object.keys(aliases);}
/** Move to a finite scene and refresh its visit only when the destination changes.
 * @param {Progress} progress Transaction-local world progress.
 * @param {SceneId} scene Validated destination.
 */
export function teleportScene(progress:Progress,scene:SceneId):void {
    if(progress.scene===scene)return;
    progress.scene=scene;progress.world.visits[scene].epoch++;progress.world.visits[scene].removed=[];
}
