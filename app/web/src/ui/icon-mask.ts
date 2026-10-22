/** Alpha silhouettes are isolated from GUI backgrounds and shared original icon pixels. */
/** Preserve holes and fractional alpha while covering only the item's rendered shape.
 * @param {Uint8ClampedArray} source Final icon RGBA, including composite and model output.
 * @return {Uint8ClampedArray} Independent black silhouette with identical alpha.
 */
export function silhouette(source: Uint8ClampedArray): Uint8ClampedArray {
    if (source.length % 4) throw Error('invalid-icon-rgba');
    const out = new Uint8ClampedArray(source.length);
    for (let i = 3; i < source.length; i += 4) out[i] = source[i];
    return out;
}

/** Cache by immutable final frame identity, so animated frames and unlocked originals cannot pollute one another. */
export class IconMasks {
    frames = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

    /** Resolve an isolated silhouette without ever compositing against a populated GUI canvas.
     * @param {HTMLCanvasElement} icon Original cached final frame.
     * @return {HTMLCanvasElement} Transparent black frame of the same dimensions.
     */
    get(icon: HTMLCanvasElement): HTMLCanvasElement {
        let out = this.frames.get(icon);
        if (!out) {
            out = document.createElement('canvas');
            out.width = icon.width;
            out.height = icon.height;
            const source = icon.getContext('2d')!.getImageData(0, 0, icon.width, icon.height);
            const ctx = out.getContext('2d')!, pixels = ctx.createImageData(icon.width, icon.height);
            pixels.data.set(silhouette(source.data));
            ctx.putImageData(pixels, 0, 0);
            this.frames.set(icon, out);
        }
        return out;
    }
}
