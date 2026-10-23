/** Native bitmap text fields retain browser IME, clipboard and selection without exposing browser decoration. */
import type {BitmapFont} from './vanilla.ts';
/** Per-control metrics never become gameplay state and release with their DOM owners. */
const metrics = new WeakMap<HTMLInputElement, {font: BitmapFont; width: number; scroll: number}>();
const bound = new WeakSet<HTMLInputElement>();
/** Paint the visible selection, glyphs and insertion caret in original logical pixels.
 * @param {CanvasRenderingContext2D} ctx GUI plane.
 * @param {BitmapFont} font Original font advances and masks.
 * @param {HTMLInputElement} input Semantic browser editing surface.
 * @param {number[]} bounds Native text rectangle.
 * @param {string} hint Empty inactive label.
 */
export function nativeField(ctx: CanvasRenderingContext2D, font: BitmapFont, input: HTMLInputElement, bounds: number[], hint = ''): void {
    const [x, y, w, h] = bounds, active = document.activeElement === input, value = input.value;
    const start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start, caret = font.width(value.slice(0, end));
    const scroll = Math.max(0, caret - w + 1);
    metrics.set(input, {font, width: w, scroll});
    bindFieldPointer(input);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (active && start !== end) {ctx.fillStyle = '#0000AA'; ctx.fillRect(x + font.width(value.slice(0, start)) - scroll, y, font.width(value.slice(start, end)), h);}
    font.draw(ctx, value || (!active ? hint : ''), x - scroll, y, value ? '#FFFFFF' : '#777777', false);
    if (active && start === end && Math.floor(performance.now() / 500) % 2 === 0) {ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + caret - scroll, y - 1, 1, h);}
    ctx.restore();
}

/** Map native pointer selection to actual bitmap advances while keeping IME and keyboard editing browser-owned.
 * @param {HTMLInputElement} input Original semantic text editor.
 */
function bindFieldPointer(input: HTMLInputElement): void {
    if (bound.has(input)) return; bound.add(input);
    let anchor = 0, pointer: number | null = null;
    /** Resolve the nearest code-point boundary with the same horizontal scroll as the painted text.
     * @param {number} x Client horizontal position.
     * @return {number} UTF-16 editor index.
     */
    function index(x: number): number {
        const m = metrics.get(input)!, r = input.getBoundingClientRect(), target = (x - r.left) * m.width / r.width + m.scroll;
        let width = 0, position = 0;
        for (const char of input.value) {const advance = m.font.width(char); if (target < width + advance / 2) break; width += advance; position += char.length;}
        return position;
    }
    input.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.pointerType === 'touch') return;
        e.preventDefault(); input.focus(); anchor = e.shiftKey ? input.selectionStart ?? 0 : index(e.clientX); pointer = e.pointerId;
        input.setPointerCapture(e.pointerId); const end = index(e.clientX); input.setSelectionRange(Math.min(anchor,end),Math.max(anchor,end));
    });
    input.addEventListener('pointermove', e => {if (pointer !== e.pointerId || !(e.buttons & 1)) return; const end = index(e.clientX);input.setSelectionRange(Math.min(anchor,end),Math.max(anchor,end),end<anchor?'backward':'forward');});
    for (const type of ['pointerup','pointercancel','lostpointercapture','blur']) input.addEventListener(type, () => {pointer = null;});
    input.addEventListener('dblclick', e => {
        e.preventDefault(); let start = index(e.clientX), end = start;
        while (start > 0 && /[\p{L}\p{N}_]/u.test(input.value[start-1])) start--;
        while (end < input.value.length && /[\p{L}\p{N}_]/u.test(input.value[end])) end++;
        input.setSelectionRange(start,end);
    });
}
