/** Accessible original bitmap text and sprite-backed buttons reuse P2 GUI primitives without container semantics. */
import {nativeField} from './native-field.ts';
import {BitmapFont, drawSprite} from './vanilla.ts';
import type {Resources} from '../render/resources.ts';

/** Wrap at words and then characters, retaining every character even for long localized tokens.
 * @param {string} text Visible copy.
 * @param {number} width Logical pixel width.
 * @param {Function} measure Original font advance measurement.
 * @return {string[]} Wrapped lines.
 */
export function wrap(text: string, width: number, measure: (value: string) => number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const paragraph of text.split('\n')) {
        for (const word of paragraph.split(' ')) {
            const proposed = current ? current + ' ' + word : word;
            if (measure(proposed) <= width) {
                current = proposed;
                continue;
            }
            if (current) {
                lines.push(current);
                current = '';
            }
            for (const c of word) {
                if (current && measure(current + c) > width) {
                    lines.push(current);
                    current = '';
                }
                current += c;
            }
        }
        lines.push(current);
        current = '';
    }
    return lines;
}

/** Own font and resize observation lifetimes for one document's localized UI. */
export class PixelUI {
    font: BitmapFont;
    resources: Resources;
    observers: ResizeObserver[] = [];
    mutations: MutationObserver[] = [];
    updates = new Map<HTMLElement, () => void>();
    buttonPaints = new Map<HTMLElement, () => void>();
    texts = new Map<HTMLElement, { text: string; scale: number; color: string }>();
    pending = new Set<() => void>();
    frame = 0;
    editingTimer = 0;

    /** Bind already verified original GUI and font bytes.
     * @param {Resources} resources Shared resource owner.
     */
    constructor(resources: Resources) {
        this.resources = resources;
        this.font = new BitmapFont(resources.documents, resources.guiImages);
    }

    /** Attach searchable, accessible text and a wrapping original-font canvas.
     * @param {HTMLElement} host Existing semantic heading, paragraph, label or button.
     * @param {string} text Localized copy.
     * @param {number} scale Integer GUI pixel scale.
     * @param {string} color Text tint, defaulting to neutral native white.
     */
    text(host: HTMLElement, text: string, scale = 2, color = '#FFFFFF'): void {
        if (this.texts.has(host)) {
            const value = this.texts.get(host)!;
            if (value.text === text && value.scale === scale && value.color === color) return;
            value.text = text;
            value.scale = scale;
            value.color = color;
            this.updates.get(host)?.();
            return;
        }
        this.texts.set(host, {text, scale, color});
        host.classList.add('pixel-text');
        const canvas = document.createElement('canvas'), accessible = document.createElement('span');
        canvas.setAttribute('aria-hidden', 'true');
        accessible.className = 'sr-only';
        host.append(accessible, canvas);
        const draw = () => {
            const value = this.texts.get(host)!, style = getComputedStyle(host);
            accessible.textContent = value.text;
            if (host.clientWidth <= 0) return;
            const w = Math.max(16, host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2),
                logical = Math.max(8, Math.floor(w / value.scale)),
                lines = wrap(value.text, logical - 1, t => this.font.width(t)), height = lines.length * 12;
            canvas.width = logical;
            canvas.height = height;
            canvas.style.width = logical * value.scale + 'px';
            canvas.style.height = height * value.scale + 'px';
            const context = canvas.getContext('2d')!;
            context.imageSmoothingEnabled = false;
            lines.forEach((line, i) => this.font.draw(context, line, style.textAlign === 'center' ? Math.max(0, Math.floor((logical - this.font.width(line)) / 2)) : 0, i * 12, value.color, true));
        };
        this.updates.set(host, draw);
        let lastWidth = -1;
        const observer = new ResizeObserver(entries => {
            const width = entries[0].contentRect.width;
            if (width === lastWidth) return;
            lastWidth = width;
            this.queue(draw);
        });
        observer.observe(host);
        this.observers.push(observer);
        draw();
    }

    /** Paint original nine-slice button states behind localized, accessible text.
     * @param {HTMLButtonElement|HTMLAnchorElement} button Interactive DOM control.
     */
    button(button: HTMLButtonElement | HTMLAnchorElement): void {
        if(this.buttonPaints.has(button)){this.refreshButton(button);return;}
        button.classList.add('mc-button');
        const canvas = document.createElement('canvas');
        canvas.className = 'button-sprite';
        canvas.setAttribute('aria-hidden', 'true');
        button.prepend(canvas);
        let highlighted = false;
        const draw = () => {
            const disabled = button instanceof HTMLButtonElement && button.disabled,
                name = 'button' + (disabled ? '_disabled' : highlighted || button.getAttribute('aria-current') === 'true' ? '_highlighted' : '') + '.png',
                path = 'assets/minecraft/textures/gui/sprites/widget/' + name,
                image = this.resources.guiImages.get(path);
            if (!image) return;
            const label = this.texts.get(button); if (label) {label.color = disabled ? '#A0A0A0' : '#FFFFFF'; this.updates.get(button)?.();}
            canvas.width = Math.max(16, Math.ceil(button.clientWidth / 2));
            canvas.height = Math.max(20, Math.ceil(button.clientHeight / 2));
            const context = canvas.getContext('2d')!;
            context.imageSmoothingEnabled = false;
            drawSprite(context, image, this.resources.documents.get(path + '.mcmeta')?.gui?.scaling, 0, 0, canvas.width, canvas.height);
        };
        this.buttonPaints.set(button,draw);
        for (const type of ['pointerenter', 'focus']) button.addEventListener(type, () => {
            highlighted = true;
            draw();
        });
        for (const type of ['pointerleave', 'blur']) button.addEventListener(type, () => {
            highlighted = false;
            draw();
        });
        const mutation = new MutationObserver(draw); mutation.observe(button, {attributes: true, attributeFilter: ['disabled', 'aria-current']}); this.mutations.push(mutation);
        const observer = new ResizeObserver(() => this.queue(draw));
        observer.observe(button);
        this.observers.push(observer);
        draw();
    }

    /** Paint both text and sprite at committed widget bounds before the screen is exposed.
     * @param {HTMLElement} button Existing sprite-backed control.
     */
    refreshButton(button:HTMLElement):void{this.updates.get(button)?.();this.buttonPaints.get(button)?.();}

    /** Preserve browser editing semantics under the original text-field sprites and bitmap text.
     * @param {HTMLInputElement} input Existing semantic text field.
     */
    field(input: HTMLInputElement): void {
        const host = document.createElement('div'), canvas = document.createElement('canvas'); host.className = 'native-text-field';
        input.replaceWith(host); host.append(canvas, input);
        const draw = () => {
            const logical = Math.max(40, Math.floor(host.clientWidth / 2));
            const height = Number(input.dataset.nativeHeight) || 20;
            canvas.width = logical; canvas.height = height; canvas.style.height = '100%';
            const ctx = canvas.getContext('2d')!, path = 'assets/minecraft/textures/gui/sprites/widget/text_field' + (document.activeElement === input ? '_highlighted' : '') + '.png', image = this.resources.guiImages.get(path);
            ctx.imageSmoothingEnabled = false;
            if (image) drawSprite(ctx, image, this.resources.documents.get(path + '.mcmeta')?.gui?.scaling, 0, 0, logical, height);
            nativeField(ctx, this.font, input, [4, Math.floor((height - 8) / 2), logical - 8, 8], {hint: input.dataset.nativeHint, italicHint: input.dataset.italicHint === 'true', inset: 4});
        };
        for (const type of ['input', 'select', 'keyup', 'pointerup', 'focus', 'blur']) input.addEventListener(type, draw);
        const observer = new ResizeObserver(() => this.queue(draw)); observer.observe(host); this.observers.push(observer);
        this.updates.set(input, draw);
        if (!this.editingTimer) this.editingTimer = window.setInterval(() => {if (!document.hidden && document.activeElement instanceof HTMLInputElement) this.updates.get(document.activeElement)?.();}, 50);
        draw();
    }

    /** Map native Java slider coordinates and key steps onto HTML range accessibility and the existing settings edit lifecycle.
     * @param {HTMLInputElement} input Real bounded range control.
     */
    slider(input: HTMLInputElement): void {
        const host = document.createElement('div'), canvas = document.createElement('canvas');
        host.className = 'native-slider'; input.replaceWith(host); host.append(canvas, input);
        let highlighted = false, changing = true, pointer: number | null = null;
        input.step = 'any';
        const draw = () => {
            const width = Math.max(40, Math.floor(host.clientWidth / 2));
            canvas.width = width; canvas.height = 20;
            const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
            for (const handle of [false, true]) {
                const name = 'slider' + (handle ? '_handle' : '') + (highlighted ? '_highlighted' : ''), path = 'assets/minecraft/textures/gui/sprites/widget/' + name + '.png', image = this.resources.guiImages.get(path);
                if (!image) continue;
                const fraction = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
                drawSprite(ctx, image, this.resources.documents.get(path + '.mcmeta')?.gui?.scaling, handle ? Math.floor((width - 8) * fraction) : 0, 0, handle ? 8 : width, 20);
            }
            const label = input.dataset.nativeLabel ?? '';
            this.font.draw(ctx, label, Math.floor((width - this.font.width(label)) / 2), 6, '#FFFFFF', true);
        };
        /** Apply the native bounded slider value through the existing semantic input/change contract.
         * @param {number} fraction Native zero-to-one position.
         * @param {boolean} commit Whether this completed interaction submits its preference draft.
         */
        function setValue(fraction: number, commit = false): void {
            input.value = String(Math.max(0, Math.min(1, fraction)));
            input.dispatchEvent(new Event('input', {bubbles: true}));
            if (commit) input.dispatchEvent(new Event('change', {bubbles: true}));
        }
        /** Map an actual pointer to AbstractSliderButton's four-pixel inset and width-minus-eight range.
         * @param {number} x Pointer client position.
         * @return {number} Native clamped interval coordinate.
         */
        function fraction(x: number): number {const r = host.getBoundingClientRect(), width = Math.max(40, Math.floor(host.clientWidth / 2)); return ((x - r.left) * width / r.width - 4) / (width - 8);}
        input.addEventListener('pointerdown', e => {if (e.button !== 0 || input.disabled) return; e.preventDefault(); changing = true; input.focus(); pointer = e.pointerId; input.setPointerCapture(e.pointerId); setValue(fraction(e.clientX));});
        input.addEventListener('pointermove', e => {if (pointer === e.pointerId && e.buttons & 1) setValue(fraction(e.clientX));});
        input.addEventListener('pointerup', e => {if (pointer !== e.pointerId) return; pointer = null; input.dispatchEvent(new Event('change', {bubbles: true}));});
        for (const type of ['pointercancel','lostpointercapture','blur']) input.addEventListener(type, () => {pointer = null;});
        input.addEventListener('keydown', e => {
            if (e.code === 'Space' || e.code === 'Enter') {e.preventDefault(); changing = !changing; draw();}
            else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {e.preventDefault(); if (changing) setValue(Number(input.value) + (e.code === 'ArrowLeft' ? -1 : 1) / (Math.max(40, Math.floor(host.clientWidth / 2)) - 8), true);}
        });
        const observer = new ResizeObserver(() => this.queue(draw)); observer.observe(host); this.observers.push(observer);
        for (const type of ['input', 'change']) input.addEventListener(type, draw);
        for (const type of ['pointerenter', 'focus']) input.addEventListener(type, () => {highlighted = true; changing = true; draw();});
        for (const type of ['pointerleave', 'blur']) input.addEventListener(type, () => {highlighted = false; draw();});
        this.updates.set(input, draw); draw();
    }

    /** Move dimension-changing canvas writes out of ResizeObserver delivery and coalesce each redraw.
     * @param {Function} draw Current text or button painting operation.
     */
    queue(draw: () => void): void {
        this.pending.add(draw);
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            const tasks = [...this.pending];
            this.pending.clear();
            for (const paint of tasks) paint();
        });
    }

    /** Disconnect observers and release runtime font tints when the document is discarded. */
    dispose(): void {
        clearInterval(this.editingTimer); this.editingTimer = 0;
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.pending.clear();
        this.buttonPaints.clear();
        for (const o of this.observers) o.disconnect();
        this.observers = [];
        for (const observer of this.mutations) observer.disconnect();
        this.mutations = [];
        this.updates.clear();
        this.texts.clear();
        this.font.dispose();
    }
}
