/** Native loading geometry and clocks, with web readiness separated from the decorative chunk indicator. */
export type LoadingStage = 'bootstrap' | 'code' | 'save' | 'resources' | 'icons' | 'rules' | 'frame';
/** Readiness phases own equal portions of the bar; none advances merely because time elapsed. */
export const LOADING_STAGES: LoadingStage[] = ['bootstrap', 'code', 'save', 'resources', 'icons', 'rules', 'frame'];
/** CubeMapTexture's OpenGL +X,-X,+Y,-Y,+Z,-Z suffix order. */
export const PANORAMA_FACES = [1, 3, 5, 4, 0, 2] as const;
/** The native default loading status view uses two-pixel cells without gaps. */
export const LOADING_RADIUS = 17;

/** Advance verified work only; animation follows LevelLoadingScreen's 20 Hz float lerp. */
export class LoadingProgress {
    values = new Map<LoadingStage, number>();
    smoothed = 0;
    remainder = 0;
    spin = 0;
    ended = false;
    /** Record completed work inside one phase, never accepting late callbacks after teardown.
     * @param {LoadingStage} stage Real initialization phase.
     * @param {number} done Completed units.
     * @param {number} total Total units in that phase.
     */
    update(stage: LoadingStage, done: number, total = 1): void {
        if (this.ended || total <= 0) return;
        this.values.set(stage, Math.max(this.values.get(stage) ?? 0, Math.min(1, Math.max(0, done / total))));
    }
    /** Measure completed readiness independently of the animated indicator.
     * @return {number} Fraction of real initialization phases completed.
     */
    get target(): number {return LOADING_STAGES.reduce((sum, key) => sum + (this.values.get(key) ?? 0), 0) / LOADING_STAGES.length;}
    /** Advance native realtime panorama and 20 Hz progress smoothing, independent of game simulation.
     * @param {number} ms Visible animation elapsed milliseconds.
     */
    advance(ms: number): void {
        if (this.ended || !Number.isFinite(ms) || ms < 0) return;
        this.spin = Math.fround(this.spin + Math.fround(Math.fround(ms / 50) * Math.fround(.1))) % 360;
        if (this.spin >= 180) this.spin -= 360;
        if (this.spin < -180) this.spin += 360;
        this.remainder += ms;
        while (this.remainder >= 50) {
            this.smoothed = Math.fround(this.smoothed + Math.fround(Math.fround(this.target - this.smoothed) * Math.fround(.2)));
            this.remainder -= 50;
        }
    }
}

/** Preserve native GUI dimensions at auto scale, including DPR-aligned pixels.
 * @param {number} width CSS viewport width.
 * @param {number} height CSS viewport height.
 * @param {number} dpr Display density.
 * @return {object} Logical text, bar and status-view anchors.
 */
export function loadingLayout(width: number, height: number, dpr = 1) {
    let factor = 1;
    while (factor < 4 * dpr && width * dpr / (factor + 1) >= 320 && height * dpr / (factor + 1) >= 240) factor++;
    const scale = factor / dpr, w = Math.ceil(width / scale), h = Math.ceil(height / scale), cx = Math.floor(w / 2), cy = Math.floor(h / 2), side = (LOADING_RADIUS * 2 + 1) * 2, textY = cy - LOADING_RADIUS * 2 - 27;
    return {scale, w, h, cx, cy, side, textY, barX: cx - 100, barY: textY + 12, chunkX: cx - Math.floor(side / 2), chunkY: cy - Math.floor(side / 2)};
}

/** Animate the native white/gray status pixels as a decorative indicator, without claiming world generation.
 * @param {number} x Indicator cell relative to its center.
 * @param {number} z Indicator cell relative to its center.
 * @param {number} progress Smoothed readiness fraction.
 * @return {number} Native black, initialize-light gray or full white RGB.
 */
export function loadingCell(x: number, z: number, progress: number): number {
    const edge = Math.sqrt(progress) * LOADING_RADIUS, distance = Math.max(Math.abs(x), Math.abs(z));
    return distance < edge - 1 ? 0xffffff : distance < edge ? 0xcccccc : 0;
}
