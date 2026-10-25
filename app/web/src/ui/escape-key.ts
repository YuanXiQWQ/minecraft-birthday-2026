/** Keyboard dismissal and browser-reserved unlock share one Escape owner without toggling on key release. */

/** Capture screen dismissal before focused editors and container handlers consume the same key.
 * @param {Function} enabled Whether this document currently accepts screen navigation.
 * @param {Function} dismiss Close the current screen, or open pause when no screen owns input.
 * @param {AbortSignal} signal Page lifetime used to remove listeners.
 * @param {Function} nativePause Open pause only if no screen currently owns input.
 * @return {Function} Handle an unrequested native unlock when the browser withholds Escape key events.
 */
export function bindEscapeKey(enabled: () => boolean, dismiss: () => void, signal: AbortSignal, nativePause: () => void = () => {}): () => void {
    let held = false;
    document.addEventListener('keydown', event => {
        if (event.code !== 'Escape') return;
        const first = !held && !event.repeat;
        held = true;
        if (!enabled()) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (first) dismiss();
    }, {capture: true, signal});
    document.addEventListener('keyup', event => {
        if (event.code !== 'Escape') return;
        held = false;
        if (!enabled()) return;
        event.preventDefault(); event.stopImmediatePropagation();
    }, {capture: true, signal});
    window.addEventListener('blur', () => {held = false;}, {signal});
    window.addEventListener('pagehide', () => {held = false;}, {signal});
    return () => {if (!signal.aborted && !held && enabled()) nativePause();};
}
