/** Game-only cancellation of delivered movement shortcuts, without requesting browser fullscreen or permissions. */
/** Keep world Ctrl + W cancellation separate from editable GUI shortcuts. */
export class GameKeyboard {
    abort = new AbortController();

    /** Bind one document's world input gate to browser keyboard events.
     * @param {Function} enabled Whether world input owns the current page.
     */
    constructor(public enabled: () => boolean) {
        window.addEventListener('keydown', event => {
            if (!this.enabled() || document.hidden || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true]'))) return;
            if (event.code === 'KeyW' && (event.ctrlKey || event.metaKey)) event.preventDefault();
        }, {capture: true, signal: this.abort.signal});
    }

    /** Remove the document's game shortcut listener. */
    dispose(): void {this.abort.abort();}
}
