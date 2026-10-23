/** Native local chat keeps message identity, wrapped-line history and screen input separate from world effects. */
import {drawSprite} from './vanilla.ts';
import {tooltipBox} from './inventory-state.ts';
import type {PixelUI} from './pixels.ts';
import {wrap} from './pixels.ts';
import {nativeField} from './native-field.ts';
import type {TextRun} from './item-style.ts';
export type ChatKind = 'system' | 'player' | 'author';
export interface ChatMessage {runs: TextRun[]; time: number; kind: ChatKind; identity?: string}
/** Native auto GUI sizing leaves at least 320 by 240 logical pixels. @param {number} w View width. @param {number} h View height. @param {number} dpr Framebuffer pixel density. @return {number} CSS size of one native GUI pixel. */
export function chatScale(w: number, h: number, dpr=1): number {let s=1; while(s<4*dpr && w*dpr/(s+1)>=320 && h*dpr/(s+1)>=240)s++; return s/dpr;}
/** Reuse the approved DPI-aligned inventory GUI scale for every screen and HUD surface.
 * @param {HTMLElement} viewport Current local game viewport.
 * @return {number} CSS size of one native GUI pixel.
 */
export function nativeScale(viewport: HTMLElement): number {const configured=typeof getComputedStyle === 'function'?parseFloat(getComputedStyle(viewport).getPropertyValue('--gui-scale')):0;return configured>0?configured:chatScale(viewport.clientWidth,viewport.clientHeight,globalThis.devicePixelRatio??1);}
/** ChatComponent's age alpha is squared after the final twenty-tick fade. @param {number} age Age in ticks. @return {number} Opacity. */
export function chatFade(age: number): number {return Math.min(1,Math.max(0,(1-age/200)*10))**2;}
/** Own one local single-player chat surface without persistent message history or networking. */
export class GameChat {
    root = document.createElement('section');
    canvas = document.createElement('canvas');
    input = document.createElement('input');
    messages: ChatMessage[] = [];
    history: string[] = [];
    historyIndex = 0;
    historyDraft = '';
    offset = 0;
    lineCount = 0;
    newWhileScrolled = false;
    accessible = document.createElement('div');
    open = false;
    timer = 0;
    tagHover: [number, number] | null = null;
    abort = new AbortController();
    /** Bind the native ChatScreen editor and ChatComponent projection to one viewport.
     * @param {HTMLElement} viewport Game view.
     * @param {PixelUI} pixels Native font owner.
     * @param {Function} text Localization lookup.
     * @param {Function} username Latest committed identity.
     * @param {Function} gate Input ownership callback.
     */
    constructor(public viewport: HTMLElement, public pixels: PixelUI, public text: (key: string) => string, public username: () => string, public gate: (open: boolean) => void) {
        this.root.className='game-chat'; this.root.setAttribute('aria-label',text('chat.input'));
        this.canvas.setAttribute('aria-hidden','true'); this.input.maxLength=256; this.input.hidden=true;
        this.input.setAttribute('aria-label',text('chat.input')); this.input.autocomplete='off';
        this.accessible.className='sr-only';this.accessible.setAttribute('role','log');this.accessible.setAttribute('aria-live','polite');
        this.root.append(this.canvas,this.input,this.accessible);viewport.append(this.root);
        this.input.addEventListener('keydown', e=>{
            e.stopPropagation(); if(e.isComposing)return;
            if(e.code==='Escape'){e.preventDefault();this.hide();}
            else if(e.code==='Enter'){
                e.preventDefault();const value=this.input.value.trim();
                if(value){this.append([{text:value}],'player',username());this.history.push(value);if(this.history.length>100)this.history.shift();}
                this.hide();
            }else if(e.code==='PageUp'||e.code==='PageDown'){e.preventDefault();this.scroll(e.code==='PageUp'?19:-19);}
            else if(e.code==='ArrowUp'||e.code==='ArrowDown'){
                e.preventDefault(); if(this.historyIndex===this.history.length)this.historyDraft=this.input.value;
                this.historyIndex=Math.max(0,Math.min(this.history.length,this.historyIndex+(e.code==='ArrowUp'?-1:1)));
                this.input.value=this.historyIndex===this.history.length?this.historyDraft:this.history[this.historyIndex];this.input.setSelectionRange(this.input.value.length,this.input.value.length);this.paint();
            }
        },{signal:this.abort.signal});
        for(const type of ['input','select','keyup','pointerup','focus','blur'])this.input.addEventListener(type,()=>this.paint(),{signal:this.abort.signal});
        this.root.addEventListener('wheel',e=>{if(this.open){e.preventDefault();e.stopPropagation();this.scroll(-Math.sign(e.deltaY)*(e.shiftKey?1:7));}},{signal:this.abort.signal,passive:false});
        this.root.addEventListener('pointermove',e=>{const r=viewport.getBoundingClientRect();this.tagHover=[e.clientX-r.left,e.clientY-r.top];this.paint();},{signal:this.abort.signal});
        this.root.addEventListener('pointerleave',()=>{this.tagHover=null;this.paint();},{signal:this.abort.signal});
        for(const type of ['pointerdown','pointerup','contextmenu'])this.root.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu'&&e.target!==this.input)e.preventDefault();},{signal:this.abort.signal});
        window.addEventListener('resize',()=>this.paint(),{signal:this.abort.signal});
        this.timer=window.setInterval(()=>{if(!document.hidden&&(this.open||this.messages.some(m=>performance.now()-m.time<10_050)))this.paint();},50);
        this.paint();
    }
    /** Retain a bounded native scroll position when inspecting historical lines.
     * @param {number} lines Signed wrapped-line delta.
     */
    scroll(lines: number): void {this.offset=Math.max(0,Math.min(Math.max(0,this.lineCount-20),this.offset+lines));if(!this.offset)this.newWhileScrolled=false;this.paint();}
    /** Append an event with explicit source identity, freezing the username at send time.
     * @param {TextRun[]} runs Safe text segments.
     * @param {ChatKind} kind Actual local message source.
     * @param {string} identity Snapshot of an actual sender.
     */
    append(runs: TextRun[], kind: ChatKind = 'system', identity?: string): void {
        const sender=kind==='author'?'YuanXiQWQ':kind==='player'?(identity??this.username()):undefined;
        const body=sender?[{text:'<'+sender+'> '},...runs]:runs;
        const m: ChatMessage={runs:structuredClone(body),time:performance.now(),kind,identity:sender};
        if(this.open&&this.offset>0){const s=nativeScale(this.viewport);this.offset+=wrap(body.map(r=>r.text).join(''),Math.min(320,Math.floor(this.viewport.clientWidth/s)-8),v=>this.pixels.font.width(v)).length;this.newWhileScrolled=true;}
        this.messages.push(m);if(this.messages.length>100)this.messages.shift();
        const line=document.createElement('p');line.textContent=body.map(r=>r.text).join('');this.accessible.append(line);if(this.accessible.children.length>100)this.accessible.firstElementChild?.remove();
        this.root.dataset.messages=JSON.stringify(this.messages);this.paint();
    }
    /** Begin an unbordered ChatScreen edit lifetime without blurring the world. */
    show(): void {this.open=true;this.input.hidden=false;this.input.value='';this.historyDraft='';this.historyIndex=this.history.length;this.gate(true);this.input.focus();this.paint();}
    /** Cancel an unsent message and restore world input ownership. */
    hide(): void {this.open=false;this.input.hidden=true;this.input.value='';this.offset=0;this.newWhileScrolled=false;this.tagHover=null;this.gate(false);this.paint();}
    /** Draw native logical margins, nine-pixel lines, message tags, fading, scrollbar and the unbordered editor. */
    paint(): void {
        const scale=nativeScale(this.viewport),w=Math.ceil(this.viewport.clientWidth/scale),h=Math.ceil(this.viewport.clientHeight/scale),dpr=Math.min(devicePixelRatio||1,4),width=Math.min(320,w-8),base=h-40,height=this.open?180:90;
        this.root.style.setProperty('--chat-scale',String(scale));
        this.canvas.width=Math.ceil(w*scale*dpr);this.canvas.height=Math.ceil(h*scale*dpr);this.canvas.style.width=this.viewport.clientWidth+'px';this.canvas.style.height=this.viewport.clientHeight+'px';
        const c=this.canvas.getContext('2d')!;c.setTransform(scale*dpr,0,0,scale*dpr,0,0);c.imageSmoothingEnabled=false;
        const rows:{text:string;message:ChatMessage;start:number;fade:number}[]=[];
        for(const message of this.messages){const fade=this.open?1:chatFade((performance.now()-message.time)/50);const raw=message.runs.map(r=>r.text).join('');let from=0;
            for(const text of wrap(raw,width,v=>this.pixels.font.width(v))){const start=Math.max(from,raw.indexOf(text,from));rows.push({text,message,start,fade});from=start+text.length;}}
        const bounded=rows.slice(-100);this.lineCount=bounded.length;this.offset=Math.max(0,Math.min(Math.max(0,bounded.length-Math.floor(height/9)),this.offset));
        let y=base,tag:string|null=null;
        for(const row of bounded.slice(0,bounded.length-this.offset).reverse().slice(0,Math.floor(height/9))){
            if(row.fade){c.globalAlpha=row.fade;c.fillStyle='#00000080';c.fillRect(4,y-9,width+4,9);c.fillStyle='#D0D0D0';c.fillRect(0,y-9,2,9);
                let x=4,consumed=row.start;for(const ch of row.text){let at=0,color='#FFFFFF';for(const run of row.message.runs){if(consumed<at+run.text.length){color=run.color??color;break;}at+=run.text.length;}this.pixels.font.draw(c,ch,x,y-8,color,true);x+=this.pixels.font.width(ch);consumed+=ch.length;}
                if(this.open&&this.tagHover&&this.tagHover[0]/scale<4&&this.tagHover[1]/scale>=y-9&&this.tagHover[1]/scale<y)tag=this.text(row.message.kind==='system'?'chat.tag.system':'chat.tag.local');
            }y-=9;
        }
        c.globalAlpha=1;
        if(this.open){
            if(this.lineCount>20){const total=this.lineCount*9,visible=Math.min(180,total),bar=Math.floor(visible*visible/total),by=base-Math.floor(this.offset*visible/this.lineCount)-bar,alpha=this.offset>0?'AA':'60';c.fillStyle=(this.newWhileScrolled?'#CC3333':'#3333AA')+alpha;c.fillRect(8+width,by,2,bar);c.fillStyle='#CCCCCC'+alpha;c.fillRect(9+width,by,1,bar);}
            c.fillStyle='#00000080';c.fillRect(2,h-14,w-4,12);nativeField(c,this.pixels.font,this.input,[4,h-12,w-4,12],{shadow:true});
            this.input.style.cssText=`left:${4*scale}px;bottom:0;width:calc(100% - ${4*scale}px);height:${12*scale}px`;
        }
        if(tag&&this.tagHover){
            const lines=wrap(tag,200,v=>this.pixels.font.width(v)),box=tooltipBox(lines.map(v=>this.pixels.font.width(v))),tx=Math.max(0,Math.min(w-box.width,this.tagHover[0]/scale+12)),ty=Math.max(0,this.tagHover[1]/scale-box.height);
            for(const name of ['background','frame']){const path='assets/minecraft/textures/gui/sprites/tooltip/'+name+'.png';drawSprite(c,this.pixels.resources.guiImages.get(path)!,this.pixels.resources.documents.get(path+'.mcmeta')?.gui?.scaling,tx,ty,box.width,box.height);}
            lines.forEach((line,i)=>this.pixels.font.draw(c,line,tx+12,ty+12+i*12,'#FFFFFF',true));
        }
        this.root.dataset.open=String(this.open);this.root.dataset.layout=JSON.stringify({scale,width,base,height,input:[4,h-12,w-4,12],lines:bounded.map(r=>r.text),offset:this.offset});
    }
    /** Cancel the single bounded update timer and all owned listeners. */
    dispose(): void {clearInterval(this.timer);this.abort.abort();this.root.remove();}
}
