/** Java 26.3 Camera eye-height interpolation and Hud sleep overlay on active ticks. */
import type {Facing,Cell} from '../domain/types.ts';

/** Own transient presentation only; bed occupancy and waking remain transactional. */
export class SleepView {
    eye=1.62;oldEye=1.62;remainder=0;timer=0;sleeping=false;
    /** Enter or leave sleep using Player's native overlay counter transitions.
     * @param {boolean} sleeping Whether a bed is occupied.
     * @param {number} ticks Committed sleep counter for restored saves.
     */
    sync(sleeping:boolean,ticks=0):void{if(sleeping&&!this.sleeping)this.timer=ticks;if(!sleeping&&this.sleeping)this.timer=100;this.sleeping=sleeping;}
    /** Advance the half-distance eye-height filter and the 100/110 sleep counter.
     * @param {number} milliseconds Active elapsed time.
     * @param {number} standingEye Current standing or crouching eye height.
     */
    update(milliseconds:number,standingEye=1.62):void{this.remainder+=milliseconds;while(this.remainder>=50){this.remainder-=50;this.oldEye=this.eye;this.eye+=((this.sleeping?.2:standingEye)-this.eye)*.5;if(this.sleeping)this.timer=Math.min(100,this.timer+1);else if(this.timer>0&&++this.timer>=110)this.timer=0;}}
    /** Read the interpolated native eye height.
     * @return {number} Eye offset in world blocks.
     */
    height():number{return this.oldEye+(this.eye-this.oldEye)*this.remainder/50;}
    /** Read Hud's integer alpha with native RGB 0x101020.
     * @return {number} Opacity in [0,220/255].
     */
    opacity():number{const amount=this.timer<=100?this.timer/100:1-(this.timer-100)/10;return Math.floor(220*amount)/255;}
    /** Place the first-person camera at the occupied head, facing away from the pillow.
     * @param {Cell} head Bed head cell.
     * @param {Facing} facing Bed direction.
     * @param {number} surface Maximum Y of the bed foot's outline shape.
     * @return {{eye:Cell,yaw:number,pitch:number}} Native horizontal sleeping camera pose.
     */
    pose(head:Cell,facing:Facing,surface:number):{eye:Cell;yaw:number;pitch:number}{return {eye:[head[0]+.5,head[1]+surface+.125+this.height()+.15,head[2]+.5],yaw:({north:Math.PI,south:0,east:Math.PI/2,west:-Math.PI/2,down:0})[facing],pitch:0};}
}
