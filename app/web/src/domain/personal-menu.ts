/** D07 page-owned cursor and input lifetime is separate from persisted hotbar/equipment and world container contents. */
import type {Stack} from '../rules/types.ts';
/** Prevent asynchronous slot results from restoring personal carriers after their menu has closed. */
export class PersonalCursor {
  epoch=0;value:Stack|null=null;crafting:(Stack|null)[]=Array(4).fill(null);
  /** Accept a committed transaction only within the personal menu lifetime that submitted it.
   * @param {number} epoch Captured cursor lifetime.
   * @param {Stack|null} cursor Successfully committed carried group.
   * @param {(Stack|null)[]} crafting Successfully committed personal inputs.
   */
  commit(epoch:number,cursor:Stack|null,crafting:(Stack|null)[]=this.crafting):void{if(epoch===this.epoch){this.value=structuredClone(cursor);this.crafting=structuredClone(crafting);}}
  /** Clear the personal cursor and input grid without returns, world drops or changes to permanent unlocks and stable slots. */
  close():void{this.epoch++;this.value=null;this.crafting=Array(4).fill(null);}
}
