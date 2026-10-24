/** Pointer ownership distinguishes desired observation from actual browser lock and fences late callbacks. */
export class PointerMode {
    desired: 'hidden' | 'visible' = 'hidden';
    actual = false;
    pending = false;
    paused = false;
    disposed = false;
    epoch = 0;
    requested = -1;
    intentional = false;
    warned = false;
    inFlight: object | null = null;
    abort = new AbortController();
    /** Bind actual browser notifications to one world input canvas.
     * @param {HTMLCanvasElement} canvas Lock owner.
     * @param {Function} change Cancel gestures and refresh selection.
     * @param {Function} escaped Open exactly one menu on browser Escape.
     * @param {Function} failure Accessible capability feedback.
     */
    constructor(public canvas: HTMLCanvasElement, public change: () => void, public escaped: () => void, public failure: () => void) {
        document.addEventListener('pointerlockchange', () => {
            const locked = document.pointerLockElement === canvas, before = this.actual;
            this.actual = locked; this.pending = false;
            if (locked && (this.disposed || this.paused || this.requested !== this.epoch || this.desired !== 'hidden')) {this.release(); return;}
            this.change(); this.publish();
            if (before && !locked && !this.intentional && !this.paused && !this.disposed) {this.desired = 'visible'; this.escaped();}
            this.intentional = false;
        }, {signal: this.abort.signal});
        document.addEventListener('pointerlockerror', () => {
            // Promise requests classify unsupported raw input before deciding whether acquisition failed.
            if (this.inFlight || !this.pending) return;
            this.fail(this.requested);
        }, {signal: this.abort.signal});
        window.addEventListener('blur', () => this.suspend(true), {signal: this.abort.signal});
        window.addEventListener('pagehide', () => this.suspend(true), {signal: this.abort.signal});
        document.addEventListener('visibilitychange', () => {if (document.hidden) this.suspend(true);}, {signal: this.abort.signal});
        this.publish();
    }
    /** Coalesce the error event and promise rejection for the same denied browser capability. */
    warn(): void {if (!this.warned) {this.warned = true; this.failure();}}
    /** Report a current acquisition failure without reviving suspended input.
     * @param {number} epoch Acquisition generation.
     */
    fail(epoch: number): void {
        if (epoch !== this.epoch || this.paused || this.disposed) return;
        this.pending = false;
        this.desired = typeof this.canvas.requestPointerLock === 'function' ? 'hidden' : 'visible';
        this.change(); this.publish();
        if (globalThis.navigator?.userActivation?.hasBeenActive !== false) this.warn();
    }
    /** Prefer raw relative input and retry only an explicitly unsupported capability.
     * @param {number} epoch Acquisition generation.
     * @param {boolean} raw Whether to request OS raw movement.
     * @return {Promise<void>|undefined} Completion, or undefined for legacy event-only browsers.
     */
    request(epoch: number, raw: boolean): Promise<void> | undefined {
        const options = {unadjustedMovement: true};
        const result = raw ? this.canvas.requestPointerLock(options) : this.canvas.requestPointerLock();
        if (!result) return;
        return result.catch((error: unknown) => {
            if (raw && error instanceof Error && error.name === 'NotSupportedError' && epoch === this.epoch && !this.paused && !this.disposed && this.desired === 'hidden') {
                return this.request(epoch, false);
            }
            throw error;
        });
    }
    /** Publish real lock diagnostics independently of persistence. */
    publish(): void {this.canvas.dataset.pointerMode = JSON.stringify({desired: this.desired, actual: this.actual, pending: this.pending, paused: this.paused, epoch: this.epoch});}
    /** Request only inside a trusted canvas gesture; consume that gesture even if acquisition fails.
     * @return {boolean} Whether this gesture is reserved for acquiring pointer ownership.
     */
    enter(): boolean {
        if (this.paused || this.disposed || this.desired !== 'hidden' || this.actual) return false;
        if (this.pending || this.inFlight) return true;
        this.warned = false; this.pending = true; this.requested = this.epoch;
        const epoch = this.epoch, ticket = {}; this.inFlight = ticket;
        try {
            const pending = this.request(epoch, true);
            if (pending) void pending.then(() => {if (epoch !== this.epoch && document.pointerLockElement === this.canvas) this.release();}).catch(() => this.fail(epoch)).finally(() => {if (this.inFlight === ticket) this.inFlight = null;});
            else this.inFlight = null;
        } catch {this.inFlight = null; this.fail(epoch);}
        this.publish(); return true;
    }
    /** Invalidate in-flight acquisition and release this canvas without affecting another owner. */
    release(): void {
        this.epoch++; this.pending = false; this.intentional = true;
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        this.actual = false; this.change(); this.publish();
    }
    /** Release ownership, optionally disarming ordinary click acquisition when the browser loses focus.
     * @param {boolean} visible Whether the lifecycle boundary should leave the cursor explicitly visible.
     */
    suspend(visible = false): void {if (visible) this.desired = 'visible'; this.release();}
    /** Transfer ownership to a GUI; closing it requests hidden observation once, independent of save snapshots.
     * @param {boolean} paused Whether a GUI owns input.
     */
    pause(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        if (paused) this.release();
        else {
            this.desired = 'hidden';
            this.canvas.focus?.({preventScroll: true});
            this.enter();
        }
        this.publish();
    }
    /** Remove global listeners and reject late browser completions. */
    dispose(): void {this.disposed = true; this.release(); this.abort.abort();}
}
