/** D07 page-owned cursor lifetime is separate from persisted hotbar/equipment and world container contents. */
import type {Stack} from '../rules/types.ts';
/** Prevent asynchronous slot results from restoring a cursor after its personal menu has closed. */
export class PersonalCursor {
  epoch=0;value:Stack|null=null;
  /** Accept a committed transaction only within the personal menu lifetime that submitted it.
   * @param {number} epoch Captured cursor lifetime.
   * @param {Stack|null} cursor Successfully committed carried group.
   */
  commit(epoch:number,cursor:Stack|null):void{if(epoch===this.epoch)this.value=structuredClone(cursor);}
  /** Clear carried items without returns, world drops or changes to permanent unlocks and stable slots. */
  close():void{this.epoch++;this.value=null;}
}
