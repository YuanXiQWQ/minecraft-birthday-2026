/** Native recipe controls and ToastManager timing are transient and never become save data. */
/** Evaluate RecipeButton/RecipeBookTabButton's fifteen-tick sine pulse.
 * @param {number} elapsed Elapsed milliseconds at twenty ticks per second.
 * @return {number} Scale about the native eight/twelve pixel pivot.
 */
export function recipePulse(elapsed: number): number {const ticks=Math.max(0,15-elapsed/50);return ticks>0?1+.1*Math.sin(ticks/15*Math.PI):1;}
/** One merged RecipeToast follows ToastInstance's visibility clock. */
export class RecipeToastClock {
    started=0;
    changed=0;
    hiding: number|null=null;
    entries: string[]=[];
    active=false;
    /** Merge native recipe entries, extending fully-visible time without replaying the entrance.
     * @param {string[]} entries Newly committed recipes.
     * @param {number} now Monotonic milliseconds.
     */
    add(entries: string[],now: number): void {
        if(!this.active){this.started=now;this.entries=[];this.active=true;this.hiding=null;}
        if(this.hiding!==null){const visible=this.sample(now).visible;this.started=now-Math.sqrt(visible)*600;this.hiding=null;}
        this.entries.push(...entries.filter(id=>!this.entries.includes(id)));
        this.changed=Math.max(0,now-this.started-600);
    }
    /** Project slide amount and icon cycle using native millisecond parameters.
     * @param {number} now Monotonic milliseconds.
     * @return {object} Native visibility, cycle index and animation status.
     */
    sample(now: number): {visible:number;index:number;phase:'show'|'hold'|'hide'|'done';fullyVisibleFor:number} {
        if(!this.active)return{visible:0,index:0,phase:'done',fullyVisibleFor:0};
        const elapsed=Math.max(0,now-this.started),fullyVisibleFor=Math.max(0,elapsed-600);
        if(this.hiding===null&&fullyVisibleFor-this.changed>=5000)this.hiding=this.started+600+this.changed+5000;
        if(this.hiding!==null){const t=Math.min(1,Math.max(0,(now-this.hiding)/600));return{visible:1-t*t,index:Math.floor(fullyVisibleFor/Math.max(1,5000/this.entries.length))%Math.max(1,this.entries.length),phase:t===1?'done':'hide',fullyVisibleFor};}
        return{visible:Math.min(1,elapsed/600)**2,index:Math.floor(fullyVisibleFor/Math.max(1,5000/this.entries.length))%Math.max(1,this.entries.length),phase:elapsed<600?'show':'hold',fullyVisibleFor};
    }
    /** End a generation-owned notification without scheduling an exit sound. */
    clear(): void {this.active=false;this.entries=[];this.hiding=null;}
}
