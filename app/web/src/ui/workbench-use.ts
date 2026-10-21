/** Minimal real-instance crafting-table connection; authored four-scene building and other station businesses remain separate. */
import type {Pick} from '../render/scene.ts';import type {GameInventory} from './inventory.ts';import type {SaveSession} from '../persistence/session.ts';import type {Station} from '../domain/types.ts';import {WORKBENCH_REGION} from '../domain/workbench-region.ts';
/** Route a completed world Use into a live workbench, bounded floor placement or D07 removal.
 * @param {Pick} hit Camera ray result after world gesture arbitration.
 * @param {boolean} shift Whether Use requests dismantling.
 * @param {GameInventory} inventory Shared player carriers and screen owner.
 * @param {SaveSession} session Locked durable command port.
 * @param {Function} notify Localized status-key consumer.
 * @return {boolean} Whether the workbench interaction owns this completed Use.
 */
export function useWorkbench(hit:Pick,shift:boolean,inventory:GameInventory,session:SaveSession,notify:(key:string)=>void):boolean{
  const state=session.view.envelope?.state;if(!state)return false;
  const found=state.progress.scenes[state.progress.scene].stations.find(s=>s.id===hit.id&&s.kind==='crafting_table');
  if(found){if(shift)void session.dispatch({type:'remove-station',scene:state.progress.scene,id:found.id}).then(()=>notify('game.workbenchRemoved')).catch(()=>notify('game.workbenchFailed'));else inventory.openWorkbench(found.id);return true;}
  const held=inventory.value.hotbar[inventory.value.selected];
  if(held?.id!=='minecraft:crafting_table'||hit.id!=='presentation-structure'||hit.normal[1]<=.5||Math.abs(hit.point[1])>=.01)return false;
  const station:Station={id:crypto.randomUUID(),kind:'crafting_table',cell:[Math.floor(hit.point[0]),0,Math.floor(hit.point[2])],facing:'north',contents:{version:1,data:{grid:Array(9).fill(null)}}};
  if(WORKBENCH_REGION.allows(state.progress.scene,station))void session.dispatch({type:'put-station',scene:state.progress.scene,station}).then(()=>notify('game.workbenchPlaced')).catch(()=>notify('game.workbenchFailed'));
  return true;
}
