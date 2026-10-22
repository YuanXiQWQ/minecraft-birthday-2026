/** GUI-backdrop clicks are staged independently of slot drag so a canceled drag cannot discard its cursor. */
export interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Exclude the whole menu, controls, border and visible tooltip from outside-drop hit testing.
 * @param {number} x Client X.
 * @param {number} y Client Y.
 * @param {Bounds[]} protectedAreas Menu and visible tooltip rectangles.
 * @return {boolean} Whether the point is safely beyond the GUI's two-CSS-pixel edge guard.
 */
export function outsideMenu(x: number, y: number, protectedAreas: Bounds[]): boolean {
    return protectedAreas.every(r => x < r.left - 2 || x >= r.right + 2 || y < r.top - 2 || y >= r.bottom + 2);
}

/** Accept only a matching, stationary outside press/release, with no slot-origin or middle-button discard. */
export class OutsideClick {
    active: { pointer: number; button: number; x: number; y: number } | null = null;

    /** Stage a left/right outside press.
     * @param {number} pointer Pointer identity.
     * @param {number} button DOM mouse button.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     * @param {boolean} outside Whether the protected GUI is excluded.
     */
    begin(pointer: number, button: number, x: number, y: number, outside: boolean): void {
        this.active = outside && (button === 0 || button === 2) ? {pointer, button, x, y} : null;
    }

    /** Cancel movement or an intervening button chord before any discard is committed.
     * @param {number} pointer Pointer identity.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     * @param {number} buttons Currently held DOM buttons.
     */
    move(pointer: number, x: number, y: number, buttons: number): void {
        const a = this.active;
        if (a && (a.pointer !== pointer || Math.hypot(x - a.x, y - a.y) > 4 || buttons !== (a.button === 0 ? 1 : 2))) this.cancel();
    }

    /** Resolve an outside click once; left discards all and right discards one temporary item.
     * @param {number} pointer Pointer identity.
     * @param {number} button Released DOM button.
     * @param {boolean} outside Whether release remains outside the protected GUI.
     * @return {boolean|null} Entire-group flag, or null for no discard.
     */
    end(pointer: number, button: number, outside: boolean): boolean | null {
        const a = this.active;
        this.cancel();
        return a && a.pointer === pointer && a.button === button && outside ? button === 0 : null;
    }

    /** Clear an uncommitted outside gesture on close, blur, cancellation or input ownership changes. */
    cancel(): void {
        this.active = null;
    }
}
