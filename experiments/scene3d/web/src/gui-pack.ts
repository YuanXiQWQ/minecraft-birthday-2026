/** Hash-verified external GUI samples and runtime-only font/icon conversion. */
import { Group, OrthographicCamera, Scene, WebGLRenderer } from 'three';
import { resolveModel, resourceId } from './model-format.ts';
import type { ModelSource } from './model-format.ts';
import { VanillaModels } from './vanilla-models.ts';
import type { VanillaPack } from './vanilla-pack.ts';

export interface GuiPack {images:Map<string,HTMLCanvasElement>;documents:Map<string,unknown>;icons:Map<string,HTMLCanvasElement>;font:BitmapFont;loading:object;dispose:()=>void}
export interface Scaling {type:string;width?:number;height?:number;border?:number|{left:number;right:number;top:number;bottom:number};stretch_inner?:boolean}

/** Load only the audited GUI cohort plus original model JSON needed for a block item.
 * @param {VanillaPack} models Verified original block material pack.
 * @return {Promise<GuiPack>} Browser-memory GUI resources; absence is a hard block, never a debug substitute.
 */
export async function loadGuiPack(models:VanillaPack):Promise<GuiPack>{
  const start=performance.now(), base='/__local_samples__/', response=await fetch(base+'manifest.json',{cache:'no-store'});
  if(!response.ok)throw new Error('local-gui-unavailable');
  const manifest=await response.json() as {version:string;clientSha1:string;gui?:{entries:string[]};entries:{entry:string;size:number;sha256:string}[]};
  if(manifest.version!=='26.3'||manifest.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87'||!manifest.gui)throw new Error('local-gui-unavailable');
  const images=new Map<string,HTMLCanvasElement>(), documents=new Map<string,unknown>(), requests:object[]=[];
  await Promise.all(manifest.entries.filter(e=>manifest.gui!.entries.includes(e.entry)||e.entry.startsWith('assets/minecraft/models/')).map(async entry=>{
    if(!/^assets\/minecraft\/(textures|font|models|items)\/[a-z0-9_/-]+\.(json|png|png\.mcmeta)$/.test(entry.entry)||entry.entry.includes('..'))throw new Error('invalid-gui-entry');
    const tick=performance.now(), r=await fetch(base+entry.entry,{cache:'no-store'});if(!r.ok)throw new Error('missing-gui-dependency');
    const bytes=await r.arrayBuffer(), hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==entry.size||hash!==entry.sha256)throw new Error('gui-hash-mismatch');
    if(entry.entry.endsWith('.png')){const b=await createImageBitmap(new Blob([bytes],{type:'image/png'})),c=document.createElement('canvas');c.width=b.width;c.height=b.height;c.getContext('2d')!.drawImage(b,0,0);b.close();images.set(entry.entry,c);}
    else documents.set(entry.entry,JSON.parse(new TextDecoder().decode(bytes)));
    requests.push({path:entry.entry,bytes:bytes.byteLength,sha256:hash,ms:performance.now()-tick});
  }));
  const font=new BitmapFont(documents,images), icons=new Map<string,HTMLCanvasElement>();
  const definition=documents.get('assets/minecraft/items/egg.json') as {model:{type:string;model:string}};
  if(definition?.model.type!=='minecraft:model')throw new Error('unsupported-flat-item-definition');
  const egg=documents.get(`assets/minecraft/models/${definition.model.model.split(':')[1]}.json`) as ModelSource;
  const generated=documents.get('assets/minecraft/models/item/generated.json') as ModelSource;
  if(egg?.parent!=='minecraft:item/generated'||generated.parent!=='builtin/generated'||!egg.textures?.layer0)throw new Error('unsupported-generated-item');
  const eggImage=images.get(`assets/minecraft/textures/${resourceId(egg.textures.layer0).split(':')[1]}.png`);if(!eggImage)throw new Error('missing-flat-item');icons.set('egg',eggImage);
  const furnaceDefinition=documents.get('assets/minecraft/items/furnace.json') as {model:{type:string;model:string}};
  if(furnaceDefinition?.model.type!=='minecraft:model')throw new Error('unsupported-block-item-definition');
  const model=resolveModel(furnaceDefinition.model.model,id=>{const source=documents.get(`assets/minecraft/models/${id.split(':')[1]}.json`);if(!source)throw new Error('missing-item-parent');return source as ModelSource;});
  if(!model.display?.gui)throw new Error('missing-item-gui-transform');
  const factory=new VanillaModels(models), sample=models.samples.find(s=>s.block==='furnace'&&s.state==='facing=north,lit=false');
  if(!sample)throw new Error('missing-block-item-state');
  const renderer=new WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true}), scene=new Scene(), camera=new OrthographicCamera(-.5,.5,.5,-.5,.1,10);
  renderer.setSize(64,64,false);renderer.setClearColor(0,0);camera.position.z=3;
  const root=new Group(), geometry=factory.sample(sample), transform=model.display.gui;
  geometry.position.set(-.5,-.5,-.5);root.add(geometry);
  const rotation=transform.rotation??[0,0,0], translation=transform.translation??[0,0,0], scale=transform.scale??[1,1,1];
  root.rotation.set(...rotation.map(v=>v*Math.PI/180) as [number,number,number]);root.position.set(...translation.map(v=>v/16) as [number,number,number]);root.scale.set(...scale);scene.add(root);
  renderer.render(scene,camera);const icon=document.createElement('canvas');icon.width=icon.height=64;icon.getContext('2d')!.drawImage(renderer.domElement,0,0);icons.set('furnace',icon);
  geometry.traverse(o=>{if('geometry' in o)(o.geometry as {dispose:()=>void}).dispose();});factory.dispose();renderer.dispose();renderer.forceContextLoss();
  return {images,documents,icons,font,loading:{version:manifest.version,clientSha1:manifest.clientSha1,requests,elapsedMs:performance.now()-start,
    imageInfo:[...images].map(([path,c])=>({path,width:c.width,height:c.height})),icons:[{item:'egg',route:'item definition -> generated/layer0',width:eggImage.width,height:eggImage.height},{item:'furnace',route:'item definition -> original block model -> inherited display.gui -> offscreen WebGL',width:64,height:64,transform}],
    font:'ASCII only; advance scanned from original alpha, no Unicode fallback',limitations:['block item lighting is MeshBasic, not Java lighting parity','no generated side extrusion, layered/tinted/special items','no Java client comparison'],iconGpuDisposed:factory.created===factory.released&&factory.textures.size===0},
    /** Clear runtime-only originals and generated icons when this sample owner is released. */
    dispose(){for(const c of new Set([...images.values(),...icons.values()])){c.width=c.height=0;}images.clear();documents.clear();icons.clear();font.dispose();}};
}

/** Render the original ASCII provider, deriving advances at runtime rather than storing converted font data. */
export class BitmapFont {
  sheet:HTMLCanvasElement;glyphs=new Map<string,{x:number;y:number;w:number;h:number;advance:number}>();tints=new Map<string,HTMLCanvasElement>();
  /** Read the provider's actual codepoint grid, image cells and space advances.
   * @param {Map<string,unknown>} documents External original JSON.
   * @param {Map<string,HTMLCanvasElement>} images External decoded original PNGs.
   */
  constructor(documents:Map<string,unknown>,images:Map<string,HTMLCanvasElement>){
    const definition=documents.get('assets/minecraft/font/include/default.json') as {providers:{type:string;file?:string;height?:number;ascent?:number;chars?:string[]}[]};
    const p=definition?.providers.find(p=>p.type==='bitmap'&&p.file==='minecraft:font/ascii.png');
    const sheet=images.get('assets/minecraft/textures/font/ascii.png');if(!p?.chars||!sheet||(p.height??8)!==8||p.ascent!==7)throw new Error('unsupported-font-provider');this.sheet=sheet;
    const w=sheet.width/[...p.chars[0]].length,h=sheet.height/p.chars.length,rgba=sheet.getContext('2d')!.getImageData(0,0,sheet.width,sheet.height).data;
    p.chars.forEach((row,r)=>[...row].forEach((char,c)=>{if(char==='\0')return;let actual=0;for(let x=0;x<w;x++)for(let y=0;y<h;y++)if(rgba[((r*h+y)*sheet.width+c*w+x)*4+3])actual=Math.max(actual,x+1);this.glyphs.set(char,{x:c*w,y:r*h,w,h,advance:Math.floor(.5+actual*8/h)+1});}));
    const space=documents.get('assets/minecraft/font/include/space.json') as {providers:{advances:Record<string,number>}[]};
    for(const [char,advance] of Object.entries(space.providers[0].advances))this.glyphs.set(char,{x:0,y:0,w:0,h:0,advance});
  }
  /** Measure actual provider advances, failing for unsupported text instead of substituting a browser font.
   * @param {string} text ASCII sample text.
   * @return {number} Logical GUI width.
   */
  width(text:string):number{return [...text].reduce((n,ch)=>{const g=this.glyphs.get(ch);if(!g)throw new Error('unsupported-font-character');return n+g.advance;},0);}
  /** Draw tintable original glyph masks with optional one-pixel Minecraft-style shadow.
   * @param {CanvasRenderingContext2D} context GUI target.
   * @param {string} text ASCII text.
   * @param {number} x Logical left.
   * @param {number} y Logical top.
   * @param {string} color CSS color.
   * @param {boolean} shadow Enable text shadow.
   */
  draw(context:CanvasRenderingContext2D,text:string,x:number,y:number,color='#ffffff',shadow=false):void{
    if(shadow)this.draw(context,text,x+1,y+1,'#3f3f3f');
    let tint=this.tints.get(color);if(!tint){tint=document.createElement('canvas');tint.width=this.sheet.width;tint.height=this.sheet.height;const t=tint.getContext('2d')!;t.drawImage(this.sheet,0,0);t.globalCompositeOperation='source-in';t.fillStyle=color;t.fillRect(0,0,tint.width,tint.height);this.tints.set(color,tint);}
    for(const char of text){const g=this.glyphs.get(char);if(!g)throw new Error('unsupported-font-character');if(g.w)context.drawImage(tint,g.x,g.y,g.w,g.h,x,y,g.w*8/g.h,8);x+=g.advance;}
  }
  /** Release runtime tinted glyph sheets and advance maps. */
  dispose():void {this.tints.clear();this.glyphs.clear();}
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
export function drawSprite(ctx:CanvasRenderingContext2D,image:HTMLCanvasElement,scaling:Scaling|undefined,x:number,y:number,width:number,height:number):void{
  if(!scaling||scaling.type==='stretch'){ctx.drawImage(image,x,y,width,height);return;}
  if(scaling.type!=='nine_slice')throw new Error('unsupported-gui-scaling');
  const b=scaling.border??0,l=typeof b==='number'?b:b.left,r=typeof b==='number'?b:b.right,t=typeof b==='number'?b:b.top,d=typeof b==='number'?b:b.bottom;
  const sw=scaling.width??image.width,sh=scaling.height??image.height;
  const sx=[0,l,sw-r],sy=[0,t,sh-d],swidth=[l,sw-l-r,r],sheight=[t,sh-t-d,d],dx=[x,x+l,x+width-r],dy=[y,y+t,y+height-d],dw=[l,width-l-r,r],dh=[t,height-t-d,d];
  if(dw[1]<0||dh[1]<0)throw new Error('gui-slice-target-too-small');
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
    if(!swidth[col]||!sheight[row])continue;
    if((row===1||col===1)&&!scaling.stretch_inner){for(let oy=0;oy<dh[row];oy+=sheight[row])for(let ox=0;ox<dw[col];ox+=swidth[col]){const w=Math.min(swidth[col],dw[col]-ox),h=Math.min(sheight[row],dh[row]-oy);ctx.drawImage(image,sx[col]*image.width/sw,sy[row]*image.height/sh,w*image.width/sw,h*image.height/sh,dx[col]+ox,dy[row]+oy,w,h);}}
    else ctx.drawImage(image,sx[col]*image.width/sw,sy[row]*image.height/sh,swidth[col]*image.width/sw,sheight[row]*image.height/sh,dx[col],dy[row],dw[col],dh[row]);
  }
}
