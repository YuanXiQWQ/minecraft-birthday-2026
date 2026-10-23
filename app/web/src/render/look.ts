/** Right-button click/drag arbitration keeps free-pointer use separate from first-person camera rotation. */
export interface Gesture {
    pointer: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    dragging: boolean;
}

/** Both pointer modes share unrestricted yaw and native vertical look limits. */
export class Look {
    active: Gesture | null = null;
    yaw = 0;
    pitch = 0;
    threshold = 6;
    sensitivity = .003;
    maxYaw = Infinity;
    maxPitch = Math.PI / 2;

    /** Begin an exclusive scene right-button gesture.
     * @param {number} pointer Pointer identity.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     */
    begin(pointer: number, x: number, y: number): void {
        this.active = {pointer, x, y, lastX: x, lastY: y, dragging: false};
    }

    /** Consume movement after a CSS-pixel threshold, clamping pitch while leaving yaw unrestricted.
     * @param {number} pointer Pointer identity.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     * @return {boolean} Whether orientation should redraw.
     */
    move(pointer: number, x: number, y: number): boolean {
        const a = this.active;
        if (!a || a.pointer !== pointer) return false;
        if (!a.dragging && Math.hypot(x - a.x, y - a.y) < this.threshold) return false;
        const dx = x - (a.dragging ? a.lastX : a.x), dy = y - (a.dragging ? a.lastY : a.y);
        a.dragging = true;
        a.lastX = x;
        a.lastY = y;
        this.yaw = Math.max(-this.maxYaw, Math.min(this.maxYaw, this.yaw - dx * this.sensitivity));
        this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch - dy * this.sensitivity));
        return true;
    }

    /** Consume relative browser movement within the same bounds as right-drag observation.
     * @param {number} dx Relative horizontal pixels.
     * @param {number} dy Relative vertical pixels.
     */
    relative(dx: number, dy: number): void {
        this.yaw = Math.max(-this.maxYaw, Math.min(this.maxYaw, this.yaw - dx * this.sensitivity));
        this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch - dy * this.sensitivity));
    }

    /** Finish once: a drag can never also emit the right-click interaction.
     * @param {number} pointer Pointer identity.
     * @return {'use'|'drag'|null} Semantic outcome.
     */
    end(pointer: number): 'use' | 'drag' | null {
        if (this.active?.pointer !== pointer) return null;
        const result = this.active.dragging ? 'drag' : 'use';
        this.active = null;
        return result;
    }

    /** Cancel incomplete scene gestures when GUI, blur, context loss or visibility owns input. */
    cancel(): void {
        this.active = null;
    }
}
