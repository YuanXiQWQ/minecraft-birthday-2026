/** Pointer gesture staging commits at release and never mutates temporary stacks during a canceled drag. */
import type {SlotRef} from '../domain/inventory.ts';
export interface GestureResult {button:0|1|2;start:string;slots:SlotRef[];drag:boolean;shift:boolean;double:boolean}
/** Own one GUI pointer independently of world look, browser clicks and the durable command queue. */
export class SlotGesture {
active:{pointer:number;button:0|1|2;start:string;x:number;y:number;slots:Set<SlotRef>;drag:boolean;shift:boolean}|null=null;
last:{start:string;button:number;shift:boolean;time:number}|null=null;
/** Start a staged gesture without consuming any stack.
 * @param {number} pointer Pointer identity.
 * @param {0|1|2} button DOM button.
 * @param {string} start Logical source identity.
 * @param {number} x Client X.
 * @param {number} y Client Y.
 * @param {boolean} shift Quick-move modifier at press.
 * @param {SlotRef|null} slot Initial eligible drag destination.
 */
begin(pointer:number,button:0|1|2,start:string,x:number,y:number,shift:boolean,slot:SlotRef|null):void{if(this.active){this.cancel();return;}this.active={pointer,button,start,x,y,shift,slots:new Set(slot?[slot]:[]),drag:false};}
/** Add each accepted cell only once; crossing the GUI boundary cancels the staged gesture.
 * @param {number} pointer Pointer identity.
 * @param {number} x Client X.
 * @param {number} y Client Y.
 * @param {SlotRef|null} slot Accepted finite destination, or null.
 * @param {boolean} inside Whether pointer remains within the GUI panel.
 */
move(pointer:number,x:number,y:number,slot:SlotRef|null,inside:boolean):void{const a=this.active;if(!a||a.pointer!==pointer)return;if(!inside){this.cancel();return;}if(Math.hypot(x-a.x,y-a.y)>4)a.drag=true;if(slot)a.slots.add(slot);}
/** Resolve a matching release exactly once; canceled gestures cannot produce a later click.
 * @param {number} pointer Pointer identity.
 * @param {number} button Released DOM button.
 * @param {number} time Monotonic timestamp.
 * @return {GestureResult|null} Bounded semantic gesture.
 */
end(pointer:number,button:number,time:number):GestureResult|null{const a=this.active;this.active=null;if(!a||a.pointer!==pointer||a.button!==button)return null;const double=!a.drag&&this.last?.start===a.start&&this.last.button===button&&this.last.shift===a.shift&&time-this.last.time<250;if(a.drag)this.last=null;else this.last=double?null:{start:a.start,button,shift:a.shift,time};return{button:a.button,start:a.start,slots:[...a.slots],drag:a.drag,shift:a.shift,double:!!double};}
/** Cancel uncommitted distribution and double-click history on ownership or lifecycle changes. */
cancel():void{this.active=null;this.last=null;}
}
