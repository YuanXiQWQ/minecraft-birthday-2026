/** Accessible original bitmap text and sprite-backed buttons reuse P2 GUI primitives without container semantics. */
import {nativeField} from './native-field.ts';
import {alignRaster,rasterSize} from './raster.ts';
import {BitmapFont, drawSprite} from './vanilla.ts';
import type {Resources} from '../render/resources.ts';

/** Resolve the logical GUI scale of directly laid-out native widgets.
 * @param {HTMLElement} host Widget host.
 * @return {number} CSS pixels per logical widget pixel.
 */
function widgetScale(host:HTMLElement):number{return typeof getComputedStyle==='function'?parseFloat(getComputedStyle(host).getPropertyValue('--native-screen-scale'))||2:2;}

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

    /** Attach accessible original text at displayed framebuffer resolution and its widget or explicit GUI scale.
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
            const scale = parseFloat(style.getPropertyValue('--button-scale')) || value.scale,
                w = Math.max(16, host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (host.matches('.native-language-row,.language-accuracy,.keybind-category')?0:2)),
                logical = Math.max(8, Math.floor(w / scale)),
                lines = wrap(value.text, logical - 1, t => this.font.width(t)), height = host.classList.contains('keybind-category')?17:lines.length * 12,
                resolution = Math.max(1,(parseFloat(style.getPropertyValue('--button-scale'))||value.scale)*host.getBoundingClientRect().width/host.clientWidth*Math.min(globalThis.devicePixelRatio??1,4));
            canvas.width = rasterSize(logical,resolution);
            canvas.height = rasterSize(height,resolution);
            canvas.dataset.logicalHeight = String(height);
            canvas.style.width = logical * scale + 'px';
            canvas.style.height = height * scale + 'px';
            const context = canvas.getContext('2d')!;
            context.setTransform(canvas.width/logical, 0, 0, canvas.height/height, 0, 0);
            context.imageSmoothingEnabled = false;
            lines.forEach((line,i)=>{
                let x=style.textAlign==='center'?Math.max(0,Math.floor((logical-this.font.width(line))/2)):0;const y=i*12;
                if(host.classList.contains('keybind-category')){
                    x=4;const width=this.font.width(line)+[...line].length;
                    for(const ch of line){const offset=this.font.glyphs.has(ch)?1:.5;this.font.draw(context,ch,x+offset,4+offset,'#3F3F3F');this.font.draw(context,ch,x+1+offset,4+offset,'#3F3F3F');this.font.draw(context,ch,x,4,'#FFFFFF');this.font.draw(context,ch,x+1,4,'#FFFFFF');x+=this.font.width(ch)+1;}
                    context.fillStyle='#3F3F3F';context.fillRect(4,13,width+1,1);context.fillStyle='#FFFFFF';context.fillRect(3,12,width+1,1);
                }else if(host.dataset.keyChange&&(host.dataset.bindingSelected==='true'||host.dataset.conflict==='true')){
                    const selected=host.dataset.bindingSelected==='true',prefix=selected?'> ':'[',suffix=selected?' <':' ]',inner=line.slice(prefix.length,-suffix.length);
                    this.font.draw(context,prefix,x,y,'#FFFF55',true);x+=this.font.width(prefix);this.font.draw(context,inner,x,y,'#FFFFFF',true);
                    if(selected){context.fillStyle='#FFFFFF';context.fillRect(x,y+9,this.font.width(inner),1);}x+=this.font.width(inner);this.font.draw(context,suffix,x,y,'#FFFF55',true);
                }else this.font.draw(context,line,x,y,value.color,true);
            });
            alignRaster(canvas,true);
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

    /** Paint original nine-slice button states at the widget's GUI scale behind accessible text.
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
            const scale = parseFloat(getComputedStyle(button).getPropertyValue('--button-scale')) || 2;
            canvas.width = Math.max(16, Math.round(button.clientWidth / scale));
            canvas.height = Math.max(20, Math.round(button.clientHeight / scale));
            const context = canvas.getContext('2d')!;
            context.imageSmoothingEnabled = false;
            drawSprite(context, image, this.resources.documents.get(path + '.mcmeta')?.gui?.scaling, 0, 0, canvas.width, canvas.height);
            alignRaster(canvas);
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

    /** Preserve browser editing semantics with native field pixels rendered at their displayed framebuffer resolution.
     * @param {HTMLInputElement} input Existing semantic text field.
     */
    field(input: HTMLInputElement): void {
        const host = document.createElement('div'), canvas = document.createElement('canvas'); host.className = 'native-text-field';
        input.replaceWith(host); host.append(canvas, input);
        const draw = () => {
            const logical = Math.max(40, Math.floor(host.clientWidth / widgetScale(host)));
            const height = Number(input.dataset.nativeHeight) || 20;
            const resolution=Math.max(1,host.getBoundingClientRect().width/logical*Math.min(globalThis.devicePixelRatio??1,4));
            canvas.width = rasterSize(logical,resolution); canvas.height = rasterSize(height,resolution); canvas.style.width='100%';canvas.style.height = '100%';
            const ctx = canvas.getContext('2d')!, path = 'assets/minecraft/textures/gui/sprites/widget/text_field' + (document.activeElement === input ? '_highlighted' : '') + '.png', image = this.resources.guiImages.get(path);
            ctx.setTransform(resolution,0,0,resolution,0,0);ctx.imageSmoothingEnabled = false;
            if (image) drawSprite(ctx, image, this.resources.documents.get(path + '.mcmeta')?.gui?.scaling, 0, 0, logical, height);
            nativeField(ctx, this.font, input, [4, Math.floor((height - 8) / 2), logical - 8, 8], {hint: input.dataset.nativeHint, italicHint: input.dataset.italicHint === 'true', inset: 4});
            alignRaster(canvas,true);
        };
        for (const type of ['input', 'select', 'keyup', 'pointerup', 'focus', 'blur']) input.addEventListener(type, draw);
        const observer = new ResizeObserver(() => this.queue(draw)); observer.observe(host); this.observers.push(observer);
        this.updates.set(input, draw);
        if (!this.editingTimer) this.editingTimer = window.setInterval(() => {if (!document.hidden && document.activeElement instanceof HTMLInputElement) this.updates.get(document.activeElement)?.();}, 50);
        draw();
    }

    /** Render native slider labels at Unicode resolution and retain HTML range accessibility and edit lifecycle.
     * @param {HTMLInputElement} input Real bounded range control.
     */
    slider(input: HTMLInputElement): void {
        const host = document.createElement('div'), canvas = document.createElement('canvas');
        host.className = 'native-slider'; input.replaceWith(host); host.append(canvas, input);
        let highlighted = false, changing = true, pointer: number | null = null;
        input.step = 'any';
        const draw = () => {
            const width = Math.max(40, Math.floor(host.clientWidth / widgetScale(host))), label = input.dataset.nativeLabel ?? '',
                resolution = Math.max(1,host.getBoundingClientRect().width/width*Math.min(globalThis.devicePixelRatio??1,4));
            canvas.style.width='100%';canvas.style.height='100%';
            canvas.width = rasterSize(width,resolution); canvas.height = rasterSize(20,resolution);
            const ctx = canvas.getContext('2d')!; ctx.setTransform(canvas.width/width,0,0,canvas.height/20,0,0); ctx.imageSmoothingEnabled = false;
            for (const handle of [false, true]) {
                const name = 'slider' + (handle ? '_handle' : '') + (highlighted ? '_highlighted' : ''), path = 'assets/minecraft/textures/gui/sprites/widget/' + name + '.png', image = this.resources.guiImages.get(path);
                if (!image) continue;
                const fraction = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)+(input.dataset.nativeInteger==='true'?1:0));
                drawSprite(ctx, image, this.resources.documents.get(path + '.mcmeta')?.gui?.scaling, handle ? Math.floor((width - 8) * fraction) : 0, 0, handle ? 8 : width, 20);
            }
            this.font.draw(ctx, label, Math.floor((width - this.font.width(label)) / 2), 6, '#FFFFFF', true);
            alignRaster(canvas,true);
        };
        /** Apply the native bounded slider value through the existing semantic input/change contract.
         * @param {number} fraction Native zero-to-one position.
         * @param {boolean} commit Whether this completed interaction submits its preference draft.
         */
        function setValue(fraction: number, commit = false): void {
            const min=Number(input.min),max=Number(input.max),f=Math.max(0,Math.min(1,fraction));
            input.value=String(input.dataset.nativeInteger==='true'?Math.min(max,Math.floor(min+f*(max-min+1))):min+f*(max-min));
            input.dispatchEvent(new Event('input', {bubbles: true}));
            if (commit) input.dispatchEvent(new Event('change', {bubbles: true}));
        }
        /** Map an actual pointer to AbstractSliderButton's four-pixel inset and width-minus-eight range.
         * @param {number} x Pointer client position.
         * @return {number} Native clamped interval coordinate.
         */
        function fraction(x: number): number {const r = host.getBoundingClientRect(), width = Math.max(40, Math.floor(host.clientWidth / widgetScale(host))); return ((x - r.left) * width / r.width - 4) / (width - 8);}
        input.addEventListener('pointerdown', e => {if (e.button !== 0 || input.disabled) return; e.preventDefault(); changing = true; input.focus(); pointer = e.pointerId; input.setPointerCapture(e.pointerId); setValue(fraction(e.clientX));});
        input.addEventListener('pointermove', e => {if (pointer === e.pointerId && e.buttons & 1) setValue(fraction(e.clientX));});
        input.addEventListener('pointerup', e => {if (pointer !== e.pointerId) return; pointer = null; input.dispatchEvent(new Event('change', {bubbles: true}));});
        for (const type of ['pointercancel','lostpointercapture','blur']) input.addEventListener(type, () => {pointer = null;});
        input.addEventListener('keydown', e => {
            if (e.code === 'Space' || e.code === 'Enter') {e.preventDefault(); changing = !changing; draw();}
            else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {e.preventDefault();if(changing){const span=Number(input.max)-Number(input.min)+(input.dataset.nativeInteger==='true'?1:0),step=input.dataset.nativeInteger==='true'?Math.max(1/span,1/(Math.max(40,Math.floor(host.clientWidth/widgetScale(host)))-8)):1/(Math.max(40,Math.floor(host.clientWidth/widgetScale(host)))-8);setValue((Number(input.value)-Number(input.min))/span+(e.code==='ArrowLeft'?-1:1)*step+(input.dataset.nativeInteger==='true'?1e-10:0),true);}}
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
