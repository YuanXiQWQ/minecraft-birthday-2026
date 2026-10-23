/** Native recipe controls and ToastManager timing are transient and never become save data. */
/** Evaluate RecipeButton/RecipeBookTabButton's fifteen-tick sine pulse.
 * @param {number} elapsed Elapsed milliseconds at twenty ticks per second.
 * @return {number} Scale about the native eight/twelve pixel pivot.
 */
export function recipePulse(elapsed: number): number {const ticks=Math.max(0,15-elapsed/50);return ticks>0?1+.1*Math.sin(ticks/15*Math.PI):1;}
/** One RecipeToast and its ToastInstance retain separate content and visibility clocks. */
export class RecipeToastClock {
    started = -1;
    becameFullyVisibleAt = -1;
    changed = 0;
    contentChanged = false;
    visibility: 'show' | 'hide' = 'hide';
    visible = 0;
    fullyVisibleFor = 0;
    entries: string[] = [];
    active = false;
    /** Merge actual discoveries; RecipeToast processes its changed flag at the next manager update.
     * @param {string[]} entries Newly committed recipes.
     * @param {number} _now Caller timestamp; content insertion does not advance ToastInstance.
     */
    add(entries: string[], _now: number): void {
        if (!this.active) {this.started = this.becameFullyVisibleAt = -1; this.changed = 0; this.visibility = 'hide'; this.visible = this.fullyVisibleFor = 0; this.entries = []; this.active = true;}
        this.entries.push(...entries.filter(id => !this.entries.includes(id)));
        this.contentChanged = true;
    }
    /** Apply ToastInstance.update, RecipeToast.update and the manager's visibility transition in native order.
     * @param {number} now Monotonic manager update milliseconds.
     * @return {object} Actual rendered portion, recipe index, clocks and optional visibility sound transition.
     */
    sample(now: number): {visible: number; index: number; phase: 'show'|'hold'|'hide'|'done'; fullyVisibleFor: number; transition: 'show'|'hide'|null} {
        if (!this.active) return {visible: 0, index: 0, phase: 'done', fullyVisibleFor: 0, transition: null};
        now = Math.trunc(now);
        const previous = this.visibility;
        if (this.started === -1) {this.started = now; this.visibility = 'show';}
        if (this.visibility === 'show' && now - this.started <= 600) this.becameFullyVisibleAt = now;
        this.fullyVisibleFor = now - this.becameFullyVisibleAt;
        const f = Math.fround, elapsed = f(Math.min(1, Math.max(0, f(now - this.started) / 600))), amount = f(elapsed * elapsed);
        this.visible = this.visibility === 'hide' ? f(1 - amount) : amount;
        if (this.contentChanged) {this.changed = this.fullyVisibleFor; this.contentChanged = false;}
        const wanted = this.entries.length && this.fullyVisibleFor - this.changed < 5000 ? 'show' : 'hide';
        if (wanted !== this.visibility) {this.started = now - Math.trunc(f(f(1 - this.visible) * 600)); this.visibility = wanted;}
        const done = this.visibility === 'hide' && now - this.started > 600;
        if (done) this.active = false;
        return {visible: this.visible, index: Math.floor(this.fullyVisibleFor / Math.max(1, 5000 / this.entries.length)) % Math.max(1, this.entries.length), phase: done ? 'done' : this.visibility === 'hide' ? 'hide' : this.visible < 1 ? 'show' : 'hold', fullyVisibleFor: this.fullyVisibleFor, transition: previous === this.visibility ? null : this.visibility};
    }
    /** Cancel generation-owned animation without playing a visibility transition. */
    clear(): void {this.active = false; this.entries = []; this.contentChanged = false;}
}
