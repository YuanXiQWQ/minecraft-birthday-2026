/** EditBox projection preserves native caret timing and browser-owned composition. */
import type {BitmapFont} from './vanilla.ts';
/** Editing metrics are scoped to live semantic controls and never enter saves. */
const metrics = new WeakMap<HTMLInputElement, {font: BitmapFont; width: number; scroll: number; inset: number}>();
/** Each semantic editor binds its native pointer mapping once per DOM lifetime. */
const bound = new WeakSet<HTMLInputElement>();
/** Blink epochs follow focus acquisition rather than the global page clock. */
const focusedAt = new WeakMap<HTMLInputElement, number>();
export interface FieldStyle {hint?: string; italicHint?: boolean; hintColor?: string; shadow?: boolean; color?: string; now?: number; inset?: number}
/** Resolve the active end of a directional HTML selection.
 * @param {HTMLInputElement} input Native editor.
 * @return {number} Active UTF-16 cursor position.
 */
export function activeCursor(input: HTMLInputElement): number {return (input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd) ?? input.value.length;}
/** Apply TextCursorUtils' focus-relative 300ms blink and EditBox's insert/append branch.
 * @param {number} now Monotonic milliseconds.
 * @param {number} focus Focus acquisition time.
 * @param {number} cursor Active cursor position.
 * @param {number} length String length.
 * @param {number} max Native maximum length.
 * @return {object} Native visibility and insertion shape.
 */
export function caretState(now: number, focus: number, cursor: number, length: number, max: number): {visible: boolean; insert: boolean} {
    return {visible: Math.floor(Math.max(0, now - focus) / 300) % 2 === 0, insert: cursor < length || length >= max};
}
/** Paint glyphs, the active caret and then selection using the caller's native field configuration.
 * @param {CanvasRenderingContext2D} ctx GUI plane.
 * @param {BitmapFont} font Original glyph advances.
 * @param {HTMLInputElement} input Browser editing surface.
 * @param {number[]} bounds Text clipping rectangle in logical pixels.
 * @param {string|FieldStyle} style Per-screen EditBox configuration.
 */
export function nativeField(ctx: CanvasRenderingContext2D, font: BitmapFont, input: HTMLInputElement, bounds: number[], style: string | FieldStyle = {}): void {
    const config = typeof style === 'string' ? {hint: style} : style;
    bindFieldPointer(input);
    const [x, y, w, h] = bounds, active = document.activeElement === input, value = input.value,
        start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start, cursor = activeCursor(input), caret = font.width(value.slice(0, cursor));
    let scroll = metrics.get(input)?.scroll ?? 0;
    if (caret < scroll) scroll = caret;
    if (caret > scroll + w - 1) scroll = caret - w + 1;
    scroll = Math.max(0, Math.min(scroll, Math.max(0, font.width(value) - w + 1)));
    metrics.set(input, {font, width: w, scroll, inset: config.inset ?? 0});
    ctx.save(); ctx.beginPath(); ctx.rect(x - 1, y - 1, w + 1, Math.max(11, h + 2)); ctx.clip();
    font.draw(ctx, value, x - scroll, y, config.color ?? '#FFFFFF', config.shadow ?? true);
    if (!value && !active && config.hint) {
        ctx.save(); ctx.translate(x, y);
        if (config.italicHint) {ctx.translate(1, 0); ctx.transform(1, 0, -.25, 1, 0, 0);}
        font.draw(ctx, config.hint, 0, 0, config.hintColor ?? (config.italicHint ? '#AAAAAA' : '#555555'), config.shadow ?? true); ctx.restore();
    }
    if (active) {
        if (!focusedAt.has(input)) focusedAt.set(input, config.now ?? performance.now());
        const caretStyle = caretState(config.now ?? performance.now(), focusedAt.get(input)!, cursor, value.length, input.maxLength < 0 ? 2147483647 : input.maxLength);
        if (caretStyle.visible) {
            if (caretStyle.insert) {ctx.fillStyle = '#D0D0D0'; ctx.fillRect(x + caret - scroll - 1, y - 1, 1, 11);}
            else font.draw(ctx, '_', x + caret - scroll, y, config.color ?? '#FFFFFF', config.shadow ?? true);
        }
        if (start !== end) {
            ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x + font.width(value.slice(0,start)) - scroll - 1, y - 1, font.width(value.slice(start,end)), 11);
            ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#0000FF';
            ctx.fillRect(x + font.width(value.slice(0,start)) - scroll - 1, y - 1, font.width(value.slice(start,end)), 11);
        }
    }
    ctx.restore();
    input.dataset.nativeEdit = JSON.stringify({cursor, start, end, scroll, focusedAt: focusedAt.get(input) ?? null});
}
/** Map pointer selection to actual glyph advances while retaining HTML IME and clipboard semantics.
 * @param {HTMLInputElement} input Browser-owned editor.
 */
function bindFieldPointer(input: HTMLInputElement): void {
    if (bound.has(input)) return; bound.add(input);
    let anchor = 0, pointer: number | null = null;
    input.addEventListener('focus', () => focusedAt.set(input, performance.now()));
    input.addEventListener('blur', () => focusedAt.delete(input));
    /** Resolve the nearest code-point boundary at the painted scroll offset.
     * @param {number} x Client coordinate.
     * @return {number} UTF-16 position.
     */
    function index(x: number): number {
        const m = metrics.get(input), r = input.getBoundingClientRect(); if (!m || !r.width) return 0;
        const target = (x - r.left) * (m.width + 2 * m.inset) / r.width - m.inset + m.scroll;
        let width = 0, position = 0;
        for (const char of input.value) {const advance = m.font.width(char); if (target < width + advance / 2) break; width += advance; position += char.length;}
        return position;
    }
    /** Preserve the anchor and identify the current selection direction.
     * @param {number} end Active selection endpoint.
     */
    function select(end: number): void {input.setSelectionRange(Math.min(anchor,end),Math.max(anchor,end),end<anchor?'backward':'forward');}
    input.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.pointerType === 'touch') return;
        e.preventDefault(); const wasFocused = document.activeElement === input; input.focus();
        anchor = e.shiftKey && wasFocused ? (input.selectionDirection === 'backward' ? input.selectionEnd : input.selectionStart) ?? 0 : index(e.clientX);
        pointer = e.pointerId; input.setPointerCapture(e.pointerId); select(index(e.clientX));
    });
    input.addEventListener('pointermove', e => {if (pointer === e.pointerId && e.buttons & 1) select(index(e.clientX));});
    for (const type of ['pointerup','pointercancel','lostpointercapture','blur']) input.addEventListener(type, () => {pointer = null;});
    input.addEventListener('dblclick', e => {
        e.preventDefault(); let start = index(e.clientX), end = start;
        while (start > 0 && /[\p{L}\p{N}_]/u.test(input.value[start-1])) start--;
        while (end < input.value.length && /[\p{L}\p{N}_]/u.test(input.value[end])) end++;
        input.setSelectionRange(start,end);
    });
}
