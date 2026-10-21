/** Accessible original bitmap text and sprite-backed buttons reuse P2 GUI primitives without container semantics. */
import {BitmapFont,drawSprite} from './vanilla.ts';import type {Resources} from '../render/resources.ts';
/** Wrap at words and then characters, retaining every character even for long localized tokens.
 * @param {string} text Visible copy.
 * @param {number} width Logical pixel width.
 * @param {Function} measure Original font advance measurement.
 * @return {string[]} Wrapped lines.
 */
export function wrap(text:string,width:number,measure:(value:string)=>number):string[]{const lines:string[]=[];let current='';for(const paragraph of text.split('\n')){for(const word of paragraph.split(' ')){const proposed=current?current+' '+word:word;if(measure(proposed)<=width){current=proposed;continue;}if(current){lines.push(current);current='';}for(const c of word){if(current&&measure(current+c)>width){lines.push(current);current='';}current+=c;}}lines.push(current);current='';}return lines;}
/** Own font and resize observation lifetimes for one document's localized UI. */
export class PixelUI {
  font:BitmapFont;resources:Resources;observers:ResizeObserver[]=[];updates=new Map<HTMLElement,()=>void>();texts=new Map<HTMLElement,{text:string;scale:number;color:string}>();pending=new Set<()=>void>();frame=0;
  /** Bind already verified original GUI and font bytes.
   * @param {Resources} resources Shared resource owner.
   */
  constructor(resources:Resources){this.resources=resources;this.font=new BitmapFont(resources.documents,resources.guiImages);}
  /** Attach searchable, accessible text and a wrapping original-font canvas.
   * @param {HTMLElement} host Existing semantic heading, paragraph, label or button.
   * @param {string} text Localized copy.
   * @param {number} scale Integer GUI pixel scale.
   * @param {string} color Text tint.
   */
  text(host:HTMLElement,text:string,scale=2,color='#fff7de'):void{
    if(this.texts.has(host)){const value=this.texts.get(host)!;value.text=text;this.updates.get(host)?.();return;}
    this.texts.set(host,{text,scale,color});host.classList.add('pixel-text');const canvas=document.createElement('canvas'),accessible=document.createElement('span');canvas.setAttribute('aria-hidden','true');accessible.className='sr-only';host.append(accessible,canvas);
    const draw=()=>{const value=this.texts.get(host)!,style=getComputedStyle(host);accessible.textContent=value.text;if(host.clientWidth<=0)return;const w=Math.max(16,host.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2),logical=Math.max(8,Math.floor(w/value.scale)),lines=wrap(value.text,logical-1,t=>this.font.width(t)),height=lines.length*12;canvas.width=logical;canvas.height=height;canvas.style.width=logical*value.scale+'px';canvas.style.height=height*value.scale+'px';const context=canvas.getContext('2d')!;context.imageSmoothingEnabled=false;lines.forEach((line,i)=>this.font.draw(context,line,0,i*12,value.color,true));};
    this.updates.set(host,draw);let lastWidth=-1;const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width===lastWidth)return;lastWidth=width;this.queue(draw);});observer.observe(host);this.observers.push(observer);draw();
  }
  /** Paint original nine-slice button states behind localized, accessible text.
   * @param {HTMLButtonElement|HTMLAnchorElement} button Interactive DOM control.
   */
  button(button:HTMLButtonElement|HTMLAnchorElement):void{
    button.classList.add('mc-button');const canvas=document.createElement('canvas');canvas.className='button-sprite';canvas.setAttribute('aria-hidden','true');button.prepend(canvas);let highlighted=false;
    const draw=()=>{const disabled=button instanceof HTMLButtonElement&&button.disabled,name='button'+(disabled?'_disabled':highlighted?'_highlighted':'')+'.png',path='assets/minecraft/textures/gui/sprites/widget/'+name,image=this.resources.guiImages.get(path);if(!image)return;canvas.width=Math.max(16,Math.ceil(button.clientWidth/2));canvas.height=Math.max(20,Math.ceil(button.clientHeight/2));const context=canvas.getContext('2d')!;context.imageSmoothingEnabled=false;drawSprite(context,image,this.resources.documents.get(path+'.mcmeta')?.gui?.scaling,0,0,canvas.width,canvas.height);};
    for(const type of ['pointerenter','focus'])button.addEventListener(type,()=>{highlighted=true;draw();});for(const type of ['pointerleave','blur'])button.addEventListener(type,()=>{highlighted=false;draw();});const observer=new ResizeObserver(()=>this.queue(draw));observer.observe(button);this.observers.push(observer);draw();
  }
  /** Move dimension-changing canvas writes out of ResizeObserver delivery and coalesce each redraw.
   * @param {Function} draw Current text or button painting operation.
   */
  queue(draw:()=>void):void{this.pending.add(draw);if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;const tasks=[...this.pending];this.pending.clear();for(const paint of tasks)paint();});}
  /** Disconnect observers and release runtime font tints when the document is discarded. */
  dispose():void{cancelAnimationFrame(this.frame);this.frame=0;this.pending.clear();for(const o of this.observers)o.disconnect();this.observers=[];this.updates.clear();this.texts.clear();this.font.dispose();}
}
