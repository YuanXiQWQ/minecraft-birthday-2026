/** Bounded viewport chat owns text composition and never writes gameplay or persistent history. */
import type {PixelUI} from './pixels.ts';
import {wrap} from './pixels.ts';
import type {TextRun} from './item-style.ts';
export class GameChat {
    root = document.createElement('section');
    canvas = document.createElement('canvas');
    input = document.createElement('input');
    messages: {runs: TextRun[]; time: number}[] = [];
    history: string[] = [];
    historyIndex = 0;
    offset = 0;
    lineCount = 0;
    accessible = document.createElement('div');
    open = false;
    timer = 0;
    abort = new AbortController();
    /** Bind text-only native chat to one game viewport.
     * @param {HTMLElement} viewport Local game view.
     * @param {PixelUI} pixels Native font owner.
     * @param {Function} text Localization lookup.
     * @param {Function} username Latest committed player identity.
     * @param {Function} gate Screen input ownership.
     */
    constructor(public viewport: HTMLElement, public pixels: PixelUI, public text: (key: string) => string, public username: () => string, public gate: (open: boolean) => void) {
        this.root.className = 'game-chat'; this.root.setAttribute('aria-label', text('chat.input'));
        this.canvas.setAttribute('aria-hidden', 'true'); this.input.maxLength = 256;
        this.input.setAttribute('aria-label', text('chat.input')); this.input.hidden = true;
        this.accessible.className = 'sr-only'; this.accessible.setAttribute('role', 'log'); this.accessible.setAttribute('aria-live', 'polite');
        this.root.append(this.canvas, this.input, this.accessible); viewport.append(this.root); pixels.field(this.input);
        this.input.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.isComposing) return;
            if (e.code === 'Escape') {e.preventDefault(); this.hide();}
            else if (e.code === 'Enter') {
                e.preventDefault(); const value = this.input.value.trim();
                if (value) {this.append([{text: '<' + username() + '> ' + value}]); this.history.push(value); if (this.history.length > 100) this.history.shift();}
                this.hide();
            } else if (e.code === 'PageUp' || e.code === 'PageDown') {e.preventDefault(); this.offset = Math.max(0, Math.min(this.lineCount - 1, this.offset + (e.code === 'PageUp' ? 19 : -19))); this.paint();}
            else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
                e.preventDefault(); this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (e.code === 'ArrowUp' ? -1 : 1)));
                this.input.value = this.history[this.historyIndex] ?? ''; this.pixels.updates.get(this.input)?.();
            }
        }, {signal: this.abort.signal});
        this.root.addEventListener('wheel', e => {if (this.open) {e.preventDefault(); e.stopPropagation(); this.offset = Math.max(0, Math.min(this.lineCount - 1, this.offset - Math.sign(e.deltaY))); this.paint();}}, {signal: this.abort.signal, passive: false});
        for (const type of ['pointerdown', 'pointerup', 'contextmenu']) this.root.addEventListener(type, e => e.stopPropagation(), {signal: this.abort.signal});
        this.timer = window.setInterval(() => {if (!document.hidden && (this.open || this.messages.some(m => performance.now() - m.time < 10_000))) this.paint();}, 100);
    }
    /** Append only an actual event, preserving item-name spans and sending identity.
     * @param {TextRun[]} runs Safe text segments.
     */
    append(runs: TextRun[]): void {
        const accessible = document.createElement('p'); accessible.textContent = runs.map(r => r.text).join(''); this.accessible.append(accessible);
        if (this.accessible.children.length > 100) this.accessible.firstElementChild?.remove();
        this.messages.push({runs: structuredClone(runs), time: performance.now()});
        if (this.messages.length > 100) this.messages.shift(); this.offset = 0;
        this.root.dataset.messages = JSON.stringify(this.messages.map(m => m.runs)); this.paint();
    }
    /** Begin an editable chat lifetime, unlocking and pausing world input. */
    show(): void {this.open = true; this.input.hidden = false; this.input.value = ''; this.historyIndex = this.history.length; this.gate(true); this.input.focus(); this.pixels.updates.get(this.input)?.(); this.paint();}
    /** End composition without sending an unfinished draft. */
    hide(): void {this.open = false; this.input.hidden = true; this.input.value = ''; this.gate(false); this.paint();}
    /** Draw recent messages with native nine-pixel lines, 200-tick visibility and squared fade. */
    paint(): void {
        const scale = Math.max(1, Math.min(2, Math.floor(this.viewport.clientWidth / 340))), width = Math.min(320, Math.floor((this.viewport.clientWidth - 12) / scale)), height = this.open ? 180 : 90;
        this.canvas.width = width; this.canvas.height = height; this.canvas.style.width = width * scale + 'px'; this.canvas.style.height = height * scale + 'px';
        const ctx = this.canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
        const rows: {text: string; runs: TextRun[]; start: number; fade: number}[] = [];
        for (const m of this.messages) {
            const age = (performance.now() - m.time) / 50, fade = this.open ? 1 : Math.min(1, Math.max(0, (1 - age / 200) * 10)) ** 2;
            if (!fade) continue;
            const raw = m.runs.map(r => r.text).join(''); let from = 0;
            for (const line of wrap(raw, width - 4, value => this.pixels.font.width(value))) {
                const start = Math.max(from, raw.indexOf(line, from)); rows.push({text: line, runs: m.runs, start, fade}); from = start + line.length;
            }
        }
        this.lineCount = rows.length; this.offset = Math.max(0, Math.min(Math.max(0, rows.length - 1), this.offset));
        let y = height - 9;
        for (const row of rows.slice(0, rows.length - this.offset).reverse()) {
            ctx.globalAlpha = row.fade; ctx.fillStyle = '#00000080'; ctx.fillRect(0, y, width, 9);
            let x = 2, consumed = row.start;
            for (const char of row.text) {
                let position = 0, color = '#FFFFFF';
                for (const run of row.runs) {if (consumed < position + run.text.length) {color = run.color ?? color; break;} position += run.text.length;}
                this.pixels.font.draw(ctx, char, x, y, color, true); x += this.pixels.font.width(char); consumed += char.length;
            }
            y -= 9; if (y < 0) break;
        }
        ctx.globalAlpha = 1; this.root.dataset.open = String(this.open);
    }
    /** Release the bounded timer and all input listeners. */
    dispose(): void {clearInterval(this.timer); this.abort.abort(); this.root.remove();}
}
