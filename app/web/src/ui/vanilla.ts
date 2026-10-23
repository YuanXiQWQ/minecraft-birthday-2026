/** Original bitmap glyph and nine-slice GUI primitives, independent of inventory semantics. */
export interface Scaling {
  type: string;
  width?: number;
  height?: number;
  border?: number | { left: number; right: number; top: number; bottom: number };
  stretch_inner?: boolean;
}

/** Native inclusive source-column overrides for Unicode code point ranges. */
interface UnihexSizeOverride {from:string;to:string;left:number;right:number}

/** Render native bitmap and Unihex providers with their original bounds, advances and shadow offsets. */
export class BitmapFont {
  sheet: HTMLCanvasElement;
  sheets = new Map<string, HTMLCanvasElement>();
  unicode: Record<string, string> = {};
  unicodeTiles = new Map<string, HTMLCanvasElement>();
  unicodeMetrics = new Map<string, {bitmap:string;left:number;right:number;advance:number}>();
  unicodeOverrides: UnihexSizeOverride[] = [];
  glyphs = new Map<string, { x: number; y: number; w: number; h: number; advance: number; provider?:string; height?:number; top?:number }>();
  tints = new Map<string, HTMLCanvasElement>();

  /** Read native bitmap grids, space advances and official Unihex size overrides.
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
    const unicodeDefinition = documents.get('assets/minecraft/font/include/unifont.json') as {providers?:{hex_file?:string;size_overrides?:UnihexSizeOverride[]}[]}|undefined;
    const unicodeProvider = unicodeDefinition?.providers?.find(p => p.hex_file === 'minecraft:font/unifont.zip');
    if(documents.has('assets/minecraft/font/project_unifont.json')&&!unicodeProvider?.size_overrides)throw Error('unsupported-unifont-provider');
    this.unicodeOverrides = unicodeProvider?.size_overrides ?? [];
    for(const provider of definition.providers){
      if(provider.type!=='bitmap'||!provider.file||!provider.chars)continue;
      const image=images.get('assets/minecraft/textures/'+provider.file.split(':')[1]);
      if(!image)throw Error('missing-native-font:'+provider.file);
      this.sheets.set(provider.file,image);
      const w=image.width/[...provider.chars[0]].length,h=image.height/provider.chars.length,height=provider.height??8,
          rgba=image.getContext('2d')!.getImageData(0,0,image.width,image.height).data;
      provider.chars.forEach((row,r)=>[...row].forEach((char,c)=>{
        if(char==='\0'||this.glyphs.has(char))return;
        let actual=0;
        for(let x=0;x<w;x++)for(let y=0;y<h;y++)if(rgba[((r*h+y)*image.width+c*w+x)*4+3])actual=Math.max(actual,x+1);
        this.glyphs.set(char,{x:c*w,y:r*h,w,h,height,top:7-(provider.ascent??7),provider:provider.file,advance:Math.floor(.5+actual*height/h)+1});
      }));
    }
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
   * @param {string} text Original font text.
   * @return {number} Logical GUI width.
   */
  width(text: string): number {
    return [...text].reduce((n, ch) => {
      const g = this.glyphs.get(ch);
      if (!g) return n + this.unicodeGlyph(ch).advance;
      return n + g.advance;
    }, 0);
  }

  /** Resolve original Unihex cropping or explicit range bounds before calculating integer half-size advance.
   * @param {string} char Unicode code point.
   * @return {object} Source bitmap, inclusive source bounds and native advance.
   */
  unicodeGlyph(char:string):{bitmap:string;left:number;right:number;advance:number} {
    this.unicodeMetrics ??= new Map();
    const cached=this.unicodeMetrics.get(char);if(cached)return cached;
    const code=char.codePointAt(0)!,bitmap=this.unicode[code.toString(16).toUpperCase().padStart(4,'0')]??this.unicode['FFFD'];
    if(!bitmap)return{bitmap:'',left:0,right:0,advance:6};
    const width=bitmap.length/4,override=(this.unicodeOverrides??[]).find(v=>code>=v.from.codePointAt(0)!&&code<=v.to.codePointAt(0)!);
    let left=width,right=0;
    if(override){left=override.left;right=override.right;}
    else for(let row=0;row<16;row++){
      const bits=BigInt('0x'+bitmap.slice(row*bitmap.length/16,(row+1)*bitmap.length/16));
      for(let col=0;col<width;col++)if(bits&1n<<BigInt(width-col-1)){left=Math.min(left,col);right=Math.max(right,col);}
    }
    if(left>right){left=0;right=width-1;}
    const glyph={bitmap,left,right,advance:Math.floor((right-left+1)/2)+1};
    this.unicodeMetrics.set(char,glyph);return glyph;
  }

  /** Draw original glyph masks with provider-specific ASCII or Unihex shadow offsets.
   * @param {CanvasRenderingContext2D} context GUI target.
   * @param {string} text Original font text.
   * @param {number} x Logical left.
   * @param {number} y Logical top.
   * @param {string} color CSS color.
   * @param {boolean} shadow Enable text shadow.
   */
  draw(context: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#FFF', shadow = false): void {
    let shade: string | undefined;
    if (shadow) {
      const hex = color.replace('#',''), rgb = parseInt(hex.length === 3 ? [...hex].map(c => c+c).join('') : hex.slice(0,6), 16),
          shadowColor = Number.isFinite(rgb) ? '#' + [rgb >> 16 & 255, rgb >> 8 & 255, rgb & 255].map(c => (c >> 2).toString(16).padStart(2,'0')).join('') : '#3F3F3F';
      shade = shadowColor;
    }
    for (const char of text) {
      const g = this.glyphs.get(char);
      if(shade){const offset=g?1:.5;this.draw(context,char,x+offset,y+offset,shade);}
      if (!g) {
        this.drawUnicode(context, char, x, y, color); x += this.width(char); continue;
      }
      if (g.w) {
        const key=(g.provider??'')+color,source=this.sheets.get(g.provider??'')??this.sheet;
        let tint=this.tints.get(key);
        if(!tint){
          tint=document.createElement('canvas');tint.width=source.width;tint.height=source.height;
          const t=tint.getContext('2d')!;t.drawImage(source,0,0);t.globalCompositeOperation='source-in';t.fillStyle=color;t.fillRect(0,0,tint.width,tint.height);this.tints.set(key,tint);
        }
        context.drawImage(tint,g.x,g.y,g.w,g.h,x,y+(g.top??0),g.w*(g.height??8)/g.h,g.height??8);
      }
      x += g.advance;
    }
  }

  /** Draw native cropped Unihex masks at oversample two, baseline zero and nearest sampling.
   * @param {CanvasRenderingContext2D} context Target font plane.
   * @param {string} char Code point.
   * @param {number} x Logical left.
   * @param {number} y Logical top.
   * @param {string} color Native text tint.
   */
  drawUnicode(context: CanvasRenderingContext2D, char: string, x: number, y: number, color: string): void {
    const {bitmap,left,right} = this.unicodeGlyph(char);
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
    const smoothing = context.imageSmoothingEnabled;
    context.imageSmoothingEnabled = false;
    context.drawImage(tile, left, 0, right-left+1, 16, x, y, (right-left+1)/2, 8);
    context.imageSmoothingEnabled = smoothing;
  }

  /** Release runtime tinted glyph sheets and advance maps. */
  dispose(): void {
    this.tints.clear();
    this.sheets.clear();
    this.unicodeTiles.clear();
    this.unicodeMetrics.clear();
    this.unicodeOverrides=[];
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
