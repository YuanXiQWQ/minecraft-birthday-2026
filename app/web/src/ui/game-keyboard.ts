/** Game-only shortcut cancellation and the browser's fullscreen keyboard ownership. */
interface KeyboardPort {lock(keys: string[]): Promise<void>; unlock(): void}

/** Capture forward movement combinations while keeping editable screens and browser exits available. */
export class GameKeyboard {
    abort = new AbortController();
    epoch = 0;
    locking = false;
    denied = false;
    port: KeyboardPort | undefined;

    /** Bind one document's game gate to native keyboard/fullscreen lifecycle.
     * @param {Function} enabled Whether world input owns the current page.
     */
    constructor(public enabled: () => boolean) {
        const keyboard = (navigator as Navigator & {keyboard?: KeyboardPort}).keyboard;
        this.port = typeof keyboard?.lock === 'function' ? keyboard : undefined;
        window.addEventListener('keydown', e => {
            if (!this.enabled() || document.hidden || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable=true]'))) return;
            if (e.code === 'KeyW' && (e.ctrlKey || e.metaKey)) e.preventDefault();
        }, {capture: true, signal: this.abort.signal});
        document.addEventListener('fullscreenchange', () => this.sync(), {signal: this.abort.signal});
        document.addEventListener('visibilitychange', () => this.sync(), {signal: this.abort.signal});
        window.addEventListener('blur', () => this.release(), {signal: this.abort.signal});
        window.addEventListener('focus', () => this.sync(), {signal: this.abort.signal});
        window.addEventListener('pagehide', () => this.release(), {signal: this.abort.signal});
    }

    /** Lock only W combinations in API fullscreen; no UI edit shortcut or Escape is captured. */
    sync(): void {
        if (!this.port) return;
        if (!this.enabled() || !document.fullscreenElement || document.hidden || !document.hasFocus()) {this.release(); return;}
        if (this.locking || this.denied) return;
        const epoch = ++this.epoch;
        this.locking = true;
        void this.port.lock(['KeyW']).catch(() => {
            if (epoch === this.epoch) {this.locking = false; this.denied = true;}
        }).then(() => {
            if (!this.locking || !this.enabled() || !document.fullscreenElement || document.hidden) this.port?.unlock();
        });
    }

    /** Release browser keyboard capture and invalidate pending acquisitions. */
    release(): void {this.epoch++; this.locking = false; this.denied = false; this.port?.unlock();}

    /** Enter API fullscreen from the user's explicit button, allowing reserved movement combinations.
     * @return {Promise<boolean>} Whether fullscreen was entered or deliberately left successfully.
     */
    async fullscreen(): Promise<boolean> {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
            this.sync();
            return true;
        } catch {return false;}
    }

    /** Remove this document's listeners and release pending keyboard ownership. */
    dispose(): void {this.abort.abort(); this.release();}
}
