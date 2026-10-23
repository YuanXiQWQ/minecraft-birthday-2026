/** Original bitmap glyph and nine-slice GUI primitives, independent of inventory semantics. */
export interface Scaling {
  type: string;
  width?: number;
  height?: number;
  border?: number | { left: number; right: number; top: number; bottom: number };
  stretch_inner?: boolean;
}

/** Render the original ASCII provider, deriving advances at runtime rather than storing converted font data. */
export class BitmapFont {
  sheet: HTMLCanvasElement;
  unicode: Record<string, string> = {};
  unicodeTiles = new Map<string, HTMLCanvasElement>();
  glyphs = new Map<string, { x: number; y: number; w: number; h: number; advance: number }>();
  tints = new Map<string, HTMLCanvasElement>();

  /** Read the provider's actual codepoint grid, image cells and space advances.
   * @param {Map<string,unknown>} documents External original JSON.
   * @param {Map<string,HTMLCanvasElement>} images External decoded original PNGs.
   */
  constructor(documents: Map<string, unknown>, images: Map<string, HTMLCanvasElement>) {
    const definition = documents.get('assets/minecraft/font/include/default.json') as {
      providers: { type: string; file?: string; height?: number; ascent?: number; chars?: string[] }[]
    };
    const p = definition?.providers.find(p => p.type === 'bitmap' && p.file === 'minecraft:font/ascii.png');
    const sheet = images.get('assets/minecraft/textures/font/ascii.png');
    if (!p?.chars || !sheet || (p.height ?? 8) !== 8 || p.ascent !== 7) throw new Error('unsupported-font-provider');
    this.sheet = sheet;
    this.unicode = (documents.get('assets/minecraft/font/project_unifont.json') ?? {}) as Record<string, string>;
    const w = sheet.width / [...p.chars[0]].length, h = sheet.height / p.chars.length,
        rgba = sheet.getContext('2d')!.getImageData(0, 0, sheet.width, sheet.height).data;
    p.chars.forEach((row, r) => [...row].forEach((char, c) => {
      if (char === '\0') return;
      let actual = 0;
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (rgba[((r * h + y) * sheet.width + c * w + x) * 4 + 3]) actual = Math.max(actual, x + 1);
      this.glyphs.set(char, {x: c * w, y: r * h, w, h, advance: Math.floor(.5 + actual * 8 / h) + 1});
    }));
    const space = documents.get('assets/minecraft/font/include/space.json') as {
      providers: { advances: Record<string, number> }[]
    };
    for (const [char, advance] of Object.entries(space.providers[0].advances)) this.glyphs.set(char, {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      advance
    });
  }

  /** Measure actual provider advances, failing for unsupported text instead of substituting a browser font.
   * @param {string} text ASCII sample text.
   * @return {number} Logical GUI width.
   */
  width(text: string): number {
    return [...text].reduce((n, ch) => {
      const g = this.glyphs.get(ch);
      if (!g) {const bitmap = this.unicode[ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')]; return n + (bitmap ? bitmap.length / 8 + 1 : 6);}
      return n + g.advance;
    }, 0);
  }

  /** Draw tintable original glyph masks with optional one-pixel Minecraft-style shadow.
   * @param {CanvasRenderingContext2D} context GUI target.
   * @param {string} text ASCII text.
   * @param {number} x Logical left.
   * @param {number} y Logical top.
   * @param {string} color CSS color.
   * @param {boolean} shadow Enable text shadow.
   */
  draw(context: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#FFF', shadow = false): void {
    if (shadow) this.draw(context, text, x + 1, y + 1, '#3F3F3F');
    let tint = this.tints.get(color);
    if (!tint) {
      tint = document.createElement('canvas');
      tint.width = this.sheet.width;
      tint.height = this.sheet.height;
      const t = tint.getContext('2d')!;
      t.drawImage(this.sheet, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = color;
      t.fillRect(0, 0, tint.width, tint.height);
      this.tints.set(color, tint);
    }
    for (const char of text) {
      const g = this.glyphs.get(char);
      if (!g) {
        this.drawUnicode(context, char, x, y, color); x += this.width(char); continue;
      }
      if (g.w) context.drawImage(tint, g.x, g.y, g.w, g.h, x, y, g.w * 8 / g.h, 8);
      x += g.advance;
    }
  }

  /** Draw an original Unihex bitmap, with a bounded cache independent of user message count.
   * @param {CanvasRenderingContext2D} context Target font plane.
   * @param {string} char Code point.
   * @param {number} x Logical left.
   * @param {number} y Logical top.
   * @param {string} color Native text tint.
   */
  drawUnicode(context: CanvasRenderingContext2D, char: string, x: number, y: number, color: string): void {
    const bitmap = this.unicode[char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')] ?? this.unicode['FFFD'];
    if (!bitmap) return;
    const key = char + color;
    let tile = this.unicodeTiles.get(key);
    if (!tile) {
      tile = document.createElement('canvas'); tile.width = bitmap.length / 4; tile.height = 16;
      const c = tile.getContext('2d')!; c.fillStyle = color;
      for (let row = 0; row < 16; row++) {
        const bits = BigInt('0x' + bitmap.slice(row * bitmap.length / 16, (row + 1) * bitmap.length / 16));
        for (let col = 0; col < tile.width; col++) if (bits & 1n << BigInt(tile.width - col - 1)) c.fillRect(col, row, 1, 1);
      }
      if (this.unicodeTiles.size >= 256) this.unicodeTiles.delete(this.unicodeTiles.keys().next().value!);
      this.unicodeTiles.set(key, tile);
    }
    context.drawImage(tile, x, y - 1, tile.width / 2, 8);
  }

  /** Release runtime tinted glyph sheets and advance maps. */
  dispose(): void {
    this.tints.clear();
    this.unicodeTiles.clear();
    this.unicode = {};
    this.glyphs.clear();
  }
}

/** Draw metadata-defined nine-slices, retaining border pixels and tiling the inner region by default.
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {HTMLCanvasElement} image Original sprite.
 * @param {Scaling|undefined} scaling Original gui.scaling metadata.
 * @param {number} x Target left.
 * @param {number} y Target top.
 * @param {number} width Logical target width.
 * @param {number} height Logical target height.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, scaling: Scaling | undefined, x: number, y: number, width: number, height: number): void {
  if (!scaling || scaling.type === 'stretch') {
    ctx.drawImage(image, x, y, width, height);
    return;
  }
  if (scaling.type !== 'nine_slice') throw new Error('unsupported-gui-scaling');
  const b = scaling.border ?? 0, l = typeof b === 'number' ? b : b.left, r = typeof b === 'number' ? b : b.right,
      t = typeof b === 'number' ? b : b.top, d = typeof b === 'number' ? b : b.bottom;
  const sw = scaling.width ?? image.width, sh = scaling.height ?? image.height;
  const sx = [0, l, sw - r], sy = [0, t, sh - d], swidth = [l, sw - l - r, r], sheight = [t, sh - t - d, d],
      dx = [x, x + l, x + width - r], dy = [y, y + t, y + height - d], dw = [l, width - l - r, r],
      dh = [t, height - t - d, d];
  if (dw[1] < 0 || dh[1] < 0) throw new Error('gui-slice-target-too-small');
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    if (!swidth[col] || !sheight[row]) continue;
    if ((row === 1 || col === 1) && !scaling.stretch_inner) {
      for (let oy = 0; oy < dh[row]; oy += sheight[row]) for (let ox = 0; ox < dw[col]; ox += swidth[col]) {
        const w = Math.min(swidth[col], dw[col] - ox), h = Math.min(sheight[row], dh[row] - oy);
        ctx.drawImage(image, sx[col] * image.width / sw, sy[row] * image.height / sh, w * image.width / sw, h * image.height / sh, dx[col] + ox, dy[row] + oy, w, h);
      }
    } else ctx.drawImage(image, sx[col] * image.width / sw, sy[row] * image.height / sh, swidth[col] * image.width / sw, sheight[row] * image.height / sh, dx[col], dy[row], dw[col], dh[row]);
  }
}
