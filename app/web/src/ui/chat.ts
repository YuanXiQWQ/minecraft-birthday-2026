/** Native local chat keeps message identity, wrapped-line history and screen input separate from world effects. */
import {completeCommand,parseCommand,type CommandFeedback} from '../domain/console.ts';
import {type BitmapFont,drawSprite} from './vanilla.ts';
import {tooltipBox} from './inventory-state.ts';
import type {PixelUI} from './pixels.ts';
import {wrap} from './pixels.ts';
import {nativeField} from './native-field.ts';
import {alignRaster,rasterSize} from './raster.ts';
import type {TextRun} from './item-style.ts';
export type ChatKind = 'system' | 'player' | 'author';
export interface ChatMessage {runs: TextRun[]; time: number; kind: ChatKind; identity?: string}
/** A wrapped line retains its message and component offset for native styling and hover text. */
interface ChatRow {text:string;message:ChatMessage;start:number;indent:boolean}
/** A physical-resolution text row retains native glyph hit areas independently of its scroll position. */
interface ChatRaster {canvas:HTMLCanvasElement;density:number;width:number;font:BitmapFont;hits:{left:number;right:number;hover:TextRun['hover']}[]}
/** Split native chat components without collapsing spaces or losing source offsets; soft wraps receive one display-only space.
 * @param {string} raw Joined component text.
 * @param {number} width Native wrapping width before continuation indentation.
 * @param {Function} measure Font advance measurement.
 * @return {object[]} Lines with UTF-16 source offsets and native continuation flags.
 */
export function wrapChat(raw:string,width:number,measure:(text:string)=>number):{text:string;start:number;indent:boolean}[]{
    const rows:{text:string;start:number;indent:boolean}[]=[];let start=0,indent=false;
    while(start<raw.length){
        let at=start,lastSpace=-1,used=0,hasWidth=false,split=raw.length;
        for(const ch of raw.slice(start)){
            if(ch==='\n'){split=at;break;}
            if(ch===' ')lastSpace=at;
            const advance=measure(ch);used+=advance;
            if(hasWidth&&used>Math.max(1,width)){split=lastSpace>=start?lastSpace:at;break;}
            hasWidth ||= advance!==0;at+=ch.length;
        }
        rows.push({text:raw.slice(start,split),start,indent});
        if(split===raw.length)return rows;
        const newline=raw[split]==='\n';start=split+((newline||raw[split]===' ')?1:0);indent=!newline;
        if(newline&&start===raw.length)rows.push({text:'',start,indent:false});
    }
    return rows.length?rows:[{text:'',start:0,indent:false}];
}
/** Normalize outgoing ChatScreen input using Java whitespace rules and the native 256-unit limit.
 * @param {string} value Editor contents.
 * @return {string} Message stored in history and sent to the command or player channel.
 */
export function normalizeChat(value:string):string{
    return value.replace(/[\u0000-\u0020]+$/g,'').replace(/^[\u0000-\u0020]+/g,'')
        .replace(/[\u0009-\u000D\u001C-\u0020\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+/g,' ')
        .replace(/\u00A0/g,' ').replace(/^ +| +$/g,'').slice(0,256);
}
/** Native auto GUI sizing leaves at least 320 by 240 logical pixels. @param {number} w View width. @param {number} h View height. @param {number} dpr Framebuffer pixel density. @return {number} CSS size of one native GUI pixel. */
export function chatScale(w: number, h: number, dpr=1): number {let s=1; while(s<4*dpr && w*dpr/(s+1)>=320 && h*dpr/(s+1)>=240)s++; return s/dpr;}
/** Reuse the approved DPI-aligned inventory GUI scale for every screen and HUD surface.
 * @param {HTMLElement} viewport Current local game viewport.
 * @return {number} CSS size of one native GUI pixel.
 */
export function nativeScale(viewport: HTMLElement): number {const configured=typeof getComputedStyle === 'function'?parseFloat(getComputedStyle(viewport).getPropertyValue('--gui-scale')):0;return configured>0?configured:chatScale(viewport.clientWidth,viewport.clientHeight,globalThis.devicePixelRatio??1);}
/** ChatComponent's age alpha is squared after the final twenty-tick fade. @param {number} age Age in ticks. @return {number} Opacity. */
export function chatFade(age: number): number {return Math.min(1,Math.max(0,(1-age/200)*10))**2;}
/** Build Brigadier's client exception context before submission, retaining the slash cursor offset.
 * @param {string} source Complete editor text.
 * @param {CommandFeedback} error Parsed exception.
 * @param {Function} text Localized message lookup.
 * @return {string} White usage-box text including native position and preceding context.
 */
export function commandHint(source:string,error:CommandFeedback,text:(key:string,values?:Record<string,string|number>)=>string):string{
    const raw=text(error.key,error.values);if(error.cursor===undefined)return raw;
    const at=Math.min(source.length,error.cursor),context=(at>10?'...':'')+source.slice(Math.max(0,at-10),at)+'<--[HERE]';
    return text('command.context.parse_error',{v0:raw,v1:error.cursor,v2:context});
}
/** Draw native styled chat glyphs without changing their advance or surrounding run styles.
 * @param {CanvasRenderingContext2D} c Chat drawing plane.
 * @param {BitmapFont} font Original bitmap font.
 * @param {string} ch One Unicode codepoint.
 * @param {number} x Logical left.
 * @param {number} y Logical top.
 * @param {TextRun} run Native style inherited by this glyph.
 */
export function chatGlyph(c:CanvasRenderingContext2D,font:BitmapFont,ch:string,x:number,y:number,run:TextRun):void{
    const color=run.color??'#FFFFFF';c.save();
    if(run.italic){c.translate(x+1,y);c.transform(1,0,-.25,1,0,0);font.draw(c,ch,0,0,color,true);}else font.draw(c,ch,x,y,color,true);
    c.restore();
    if(run.underline){const hex=parseInt(color.slice(1),16);c.fillStyle='#'+[hex>>16&255,hex>>8&255,hex&255].map(v=>(v>>2).toString(16).padStart(2,'0')).join('');c.fillRect(x+1,y+9,font.width(ch),1);c.fillStyle=color;c.fillRect(x,y+8,font.width(ch),1);}
}
/** Own one local single-player chat surface without persistent message history or networking. */
export class GameChat {
    root = document.createElement('section');
    canvas = document.createElement('canvas');
    input = document.createElement('input');
    onPaint: (() => void) | null = null;
    messages: ChatMessage[] = [];
    history: string[] = [];
    historyIndex = 0;
    historyDraft = '';
    offset = 0;
    lineCount = 0;
    newWhileScrolled = false;
    accessible = document.createElement('div');
    open = false;
    command:((source:string)=>Promise<CommandFeedback[]>)|null=null;
    completion:{start:number;values:string[];index:number;source:string}|null=null;
    lifetime=0;
    timer = 0;
    paintFrame = 0;
    wrapping = new WeakMap<ChatMessage,{width:number;rows:ChatRow[]}>();
    rowLayout: {width:number;messages:ChatMessage[];rows:ChatRow[]}|null = null;
    rowRasters = new Map<ChatRow,ChatRaster>();
    geometry = '';
    timerState = '';
    tagHover: [number, number] | null = null;
    abort = new AbortController();
    /** Bind the native ChatScreen editor and ChatComponent projection to one viewport.
     * @param {HTMLElement} viewport Game view.
     * @param {PixelUI} pixels Native font owner.
     * @param {Function} text Localization lookup.
     * @param {Function} username Latest committed identity.
     * @param {Function} gate Input ownership callback.
     */
    constructor(public viewport: HTMLElement, public pixels: PixelUI, public text: (key: string,values?:Record<string,string|number>) => string, public username: () => string, public gate: (open: boolean) => void) {
        this.root.className='game-chat'; this.root.setAttribute('aria-label',text('chat.input'));
        this.canvas.setAttribute('aria-hidden','true'); this.input.maxLength=256; this.input.hidden=true;
        this.input.setAttribute('aria-label',text('chat.input')); this.input.autocomplete='off';
        this.accessible.className='sr-only';this.accessible.setAttribute('role','log');this.accessible.setAttribute('aria-live','polite');
        this.root.append(this.canvas,this.input,this.accessible);viewport.append(this.root);
        this.input.addEventListener('keydown', e=>this.key(e),{signal:this.abort.signal});
        this.input.addEventListener('input',()=>{this.completion=null;},{signal:this.abort.signal});
        for(const type of ['input','select','keyup','pointerup','focus','blur'])this.input.addEventListener(type,()=>this.requestPaint(),{signal:this.abort.signal});
        this.root.addEventListener('wheel',e=>{if(this.open){e.preventDefault();e.stopPropagation();if(e.deltaY)this.scroll(-Math.sign(e.deltaY)*(e.shiftKey?1:7));}},{signal:this.abort.signal,passive:false});
        this.root.addEventListener('pointermove',e=>{const r=viewport.getBoundingClientRect();this.tagHover=[e.clientX-r.left,e.clientY-r.top];this.requestPaint();},{signal:this.abort.signal});
        this.root.addEventListener('pointerleave',()=>{this.tagHover=null;this.requestPaint();},{signal:this.abort.signal});
        for(const type of ['pointerdown','pointerup','contextmenu'])this.root.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu'&&e.target!==this.input)e.preventDefault();},{signal:this.abort.signal});
        window.addEventListener('resize',()=>this.paint(),{signal:this.abort.signal});
        this.timer=window.setInterval(()=>this.tickPaint(),50);
        this.paint();
    }
    /** Normalize sent chat and route history independently of offered completions; Tab owns suggestion cycling.
     * @param {KeyboardEvent} e Actual editor keyboard input.
     */
    key(e:KeyboardEvent):void{
            e.stopPropagation(); if(e.isComposing)return;
            if(e.code==='Escape'){e.preventDefault();this.hide();}
            else if(e.code==='Enter'){
                e.preventDefault();const value=normalizeChat(this.input.value);
                if(value){
                    if(value.startsWith('/'))void this.submitCommand(value);else this.append([{text:value}],'player',this.username());
                    this.history.push(value);if(this.history.length>100)this.history.shift();
                }
                this.hide();
            }else if(e.code==='Tab'){e.preventDefault();if(this.input.value.startsWith('/'))this.complete(e.shiftKey);}
            else if(e.code==='PageUp'||e.code==='PageDown'){e.preventDefault();this.scroll(e.code==='PageUp'?19:-19);}
            else if(e.code==='ArrowUp'||e.code==='ArrowDown'){
                e.preventDefault();if(this.completion){this.complete(e.code==='ArrowUp');return;} if(this.historyIndex===this.history.length)this.historyDraft=this.input.value;
                this.historyIndex=Math.max(0,Math.min(this.history.length,this.historyIndex+(e.code==='ArrowUp'?-1:1)));
                this.input.value=this.historyIndex===this.history.length?this.historyDraft:this.history[this.historyIndex];this.input.setSelectionRange(this.input.value.length,this.input.value.length);this.paint();
            }
    }
    /** Retain a bounded native scroll position when inspecting historical lines.
     * @param {number} lines Signed wrapped-line delta.
     */
    scroll(lines: number): void {this.offset=Math.max(0,Math.min(Math.max(0,this.lineCount-20),this.offset+lines));if(!this.offset)this.newWhileScrolled=false;this.requestPaint();}
    /** Coalesce hover, wheel and caret-timer updates into the next browser frame without delaying input state.
     */
    requestPaint():void {
        if(this.paintFrame||this.abort.signal.aborted)return;
        this.paintFrame=requestAnimationFrame(()=>{this.paintFrame=0;if(!this.abort.signal.aborted)this.paint();});
    }
    /** Repaint timers only when the native caret phase or a message's fading opacity changes.
     */
    tickPaint():void {
        if(document.hidden)return;
        const now=performance.now(),focus=this.input.dataset.nativeEdit?JSON.parse(this.input.dataset.nativeEdit).focusedAt:null;
        const state=this.open?'open:'+String(document.activeElement===this.input&&focus!==null?Math.floor((now-focus)/300)%2:'blur'):
            this.messages.map(message=>{const age=(now-message.time)/50;return age<180?'shown':age>=200?'hidden':String(Math.floor(age));}).join(',');
        if(state===this.timerState)return;
        this.timerState=state;this.requestPaint();
    }
    /** Rasterize each immutable line once at the current physical resolution, preserving source styles and hover positions.
     * @param {ChatRow} row Native wrapped line.
     * @param {number} width Available logical line width.
     * @param {number} density Physical pixels per logical pixel.
     * @return {ChatRaster} Bounded reusable line image and component hit areas.
     */
    rasterRow(row:ChatRow,width:number,density:number):ChatRaster {
        this.rowRasters??=new Map();
        const cached=this.rowRasters.get(row),font=this.pixels.font;
        if(cached?.density===density&&cached.width===width&&cached.font===font)return cached;
        const canvas=document.createElement('canvas');canvas.width=rasterSize(width+12,density);canvas.height=rasterSize(11,density);
        const c=canvas.getContext('2d')!;c.setTransform(density,0,0,density,0,0);c.imageSmoothingEnabled=false;
        const hits:ChatRaster['hits']=[];let x=4+(row.indent?font.width(' '):0),consumed=row.start;
        for(const ch of row.text){
            let at=0,style:TextRun={text:''};for(const run of row.message.runs){if(consumed<at+run.text.length){style=run;break;}at+=run.text.length;}
            const advance=font.width(ch);chatGlyph(c,font,ch,x,1,style);
            if(style.hover)hits.push({left:x,right:x+advance,hover:style.hover});
            x+=advance;consumed+=ch.length;
        }
        const raster={canvas,density,width,font,hits};this.rowRasters.set(row,raster);return raster;
    }
    /** Cache native component wrapping and continuation indentation by message identity and logical width.
     * @param {ChatMessage} message Immutable appended message.
     * @param {number} width Logical line width.
     * @return {ChatRow[]} Cached native lines and component offsets.
     */
    messageRows(message:ChatMessage,width:number):ChatRow[]{
        this.wrapping??=new WeakMap();
        const cached=this.wrapping.get(message);if(cached?.width===width)return cached.rows;
        const raw=message.runs.map(run=>run.text).join('');
        const rows=wrapChat(raw,width,text=>this.pixels.font.width(text)).map(row=>({...row,message}));
        this.wrapping.set(message,{width,rows});return rows;
    }
    /** Reuse bounded history layout across scrolling, fading, editing and hover-only paints.
     * @param {number} width Current logical line width.
     * @return {ChatRow[]} Last one hundred native wrapped lines.
     */
    layoutRows(width:number):ChatRow[]{
        const cached=this.rowLayout;
        if(cached?.width===width&&cached.messages.length===this.messages.length&&cached.messages.every((message,index)=>message===this.messages[index]))return cached.rows;
        const rows=this.messages.flatMap(message=>this.messageRows(message,width)).slice(-100);
        if(this.rowRasters){const retained=new Set(rows);for(const row of this.rowRasters.keys())if(!retained.has(row))this.rowRasters.delete(row);}
        this.rowLayout={width,messages:[...this.messages],rows};return rows;
    }
    /** Append an event with explicit source identity, freezing the username at send time.
     * @param {TextRun[]} runs Safe text segments.
     * @param {ChatKind} kind Actual local message source.
     * @param {string} identity Snapshot of an actual sender.
     */
    append(runs: TextRun[], kind: ChatKind = 'system', identity?: string): void {
        const sender=kind==='author'?'YuanXiQWQ':kind==='player'?(identity??this.username()):undefined;
        const body=sender?[{text:'<'+sender+'> '},...runs]:runs;
        const m: ChatMessage={runs:structuredClone(body),time:performance.now(),kind,identity:sender};
        if(this.open&&this.offset>0){const s=nativeScale(this.viewport);this.offset+=this.messageRows(m,Math.min(320,Math.ceil(this.viewport.clientWidth/s)-8)).length;this.newWhileScrolled=true;}
        this.messages.push(m);if(this.messages.length>100)this.messages.shift();
        const line=document.createElement('p');line.textContent=body.map(r=>r.text).join('');this.accessible.append(line);if(this.accessible.children.length>100)this.accessible.firstElementChild?.remove();
        this.root.dataset.messages=JSON.stringify(this.messages);this.paint();
    }
    /** Begin an unbordered ChatScreen edit lifetime without blurring the world. @param {string} initial Native initial input, including slash-command entry. */
    show(initial=''): void {this.open=true;this.completion=null;this.input.hidden=false;this.input.value=initial;this.historyDraft='';this.historyIndex=this.history.length;this.gate(true);this.input.focus();this.paint();}
    /** Cancel an unsent message and restore world input ownership. */
    hide(): void {this.completion=null;this.root.dataset.commandHint=JSON.stringify({suggestions:[],error:null});this.root.dataset.completion='null';this.open=false;this.input.hidden=true;this.input.value='';this.offset=0;this.newWhileScrolled=false;this.tagHover=null;this.gate(false);this.paint();}
    /** Submit a command through its authoritative semantic transaction and suppress discarded page replies.
     * @param {string} source Original slash command.
     * @return {Promise<void>} Native success or red syntax feedback.
     */
    async submitCommand(source:string):Promise<void>{
        const ticket=this.lifetime,handler=this.command;if(!handler)return;
        const messages=await handler(source);if(ticket!==this.lifetime||this.abort.signal.aborted)return;
        for(const message of messages)this.commandMessage(message,source);
    }
    /** Draw native command feedback without the generic action-save warning, independently of player identity.
     * @param {CommandFeedback} message Localized command result.
     * @param {string} source Original text for Brigadier's error context.
     */
    commandMessage(message:CommandFeedback,source=''):void{
        if(message.key==='game.actionFailed')return;
        for(const line of this.text(message.key,{...message.values,...(message.destination?{v1:this.text('scene.'+message.destination)}:{})}).split('\n'))this.append([{text:line,color:message.error?'#FF5555':'#FFFFFF'}]);
        if(message.cursor!==undefined){const offset=source.startsWith('/')?1:0,input=source.slice(offset),at=Math.min(input.length,Math.max(0,message.cursor-offset)),start=Math.max(0,at-10);this.append([
            {text:(start?'...':'')+input.slice(start,at),color:'#AAAAAA'},
            {text:input.slice(at),color:'#FF5555',underline:true}, {text:this.text('command.context.here'),color:'#FF5555',italic:true}
        ]);}
    }
    /** Complete at the caret, retaining the original prefix while Tab/Shift-Tab cycles one native suggestion set.
     * @param {boolean} backwards Whether to select the previous suggestion.
     */
    complete(backwards=false):void{
        if(!this.completion){const source=this.input.value.slice(0,this.input.selectionStart??this.input.value.length),suggest=completeCommand(source,this.username());if(!suggest.values.length)return;this.completion={...suggest,index:backwards?0:-1,source:this.input.value};}
        const c=this.completion;c.index=(c.index+(backwards?-1:1)+c.values.length)%c.values.length;
        const end=c.source.indexOf(' ',c.start),tail=end<0?'':c.source.slice(end);this.input.value=c.source.slice(0,c.start)+c.values[c.index]+tail;
        const caret=c.start+c.values[c.index].length;this.input.setSelectionRange(caret,caret);this.paint();
    }
    /** Composite cached native text rows with independent input, caret, hover, fading and system source tags. */
    paint(): void {
        if(this.paintFrame){cancelAnimationFrame(this.paintFrame);this.paintFrame=0;}
        const scale=nativeScale(this.viewport),w=Math.ceil(this.viewport.clientWidth/scale),h=Math.ceil(this.viewport.clientHeight/scale),dpr=Math.min(devicePixelRatio||1,4),width=Math.min(320,w-8),base=h-40,height=this.open?180:90;
        const pixelWidth=rasterSize(this.viewport.clientWidth,dpr),pixelHeight=rasterSize(this.viewport.clientHeight,dpr);
        const geometry=[scale,dpr,this.viewport.clientWidth,this.viewport.clientHeight].join(':');
        if(this.geometry!==geometry){
            this.geometry=geometry;this.root.style.setProperty('--chat-scale',String(scale));
            if(this.canvas.width!==pixelWidth)this.canvas.width=pixelWidth;if(this.canvas.height!==pixelHeight)this.canvas.height=pixelHeight;
            this.canvas.style.width=this.viewport.clientWidth+'px';this.canvas.style.height=this.viewport.clientHeight+'px';
            this.input.style.cssText=`left:${4*scale}px;bottom:0;width:calc(100% - ${4*scale}px);height:${12*scale}px`;
            alignRaster(this.canvas,true);
        }
        const c=this.canvas.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pixelWidth,pixelHeight);c.setTransform(scale*dpr,0,0,scale*dpr,0,0);c.imageSmoothingEnabled=false;
        const bounded=this.layoutRows(width);this.lineCount=bounded.length;this.offset=Math.max(0,Math.min(Math.max(0,bounded.length-Math.floor(height/9)),this.offset));
        let y=base,tag:string|null=null,hover:TextRun['hover'];
        for(const row of bounded.slice(0,bounded.length-this.offset).reverse().slice(0,Math.floor(height/9))){
            const fade=this.open?1:chatFade((performance.now()-row.message.time)/50);
            if(fade){c.globalAlpha=fade;c.fillStyle='#00000080';c.fillRect(0,y-9,width+12,9);
                const tagged=row.message.kind!=='player';
                if(tagged){c.fillStyle='#D0D0D0';c.fillRect(0,y-9,2,9);}
                const raster=this.rasterRow(row,width,scale*dpr);
                c.drawImage(raster.canvas,0,y-9,raster.canvas.width/(scale*dpr),raster.canvas.height/(scale*dpr));
                if(this.open&&this.tagHover&&this.tagHover[1]/scale>=y-9&&this.tagHover[1]/scale<y)hover=raster.hits.find(hit=>this.tagHover![0]/scale>=hit.left&&this.tagHover![0]/scale<hit.right)?.hover;
                if(tagged&&this.open&&this.tagHover&&this.tagHover[0]/scale>=0&&this.tagHover[0]/scale<2&&this.tagHover[1]/scale>=y-9&&this.tagHover[1]/scale<y)tag=this.text('chat.tag.system');
            }y-=9;
        }
        c.globalAlpha=1;
        if(this.open){
            if(this.lineCount>20){const total=this.lineCount*9,visible=Math.min(180,total),bar=Math.floor(visible*visible/total),by=base-Math.floor(this.offset*visible/this.lineCount)-bar,alpha=this.offset>0?'AA':'60';c.fillStyle=(this.newWhileScrolled?'#CC3333':'#3333AA')+alpha;c.fillRect(8+width,by,2,bar);c.fillStyle='#CCCCCC'+alpha;c.fillRect(9+width,by,1,bar);}
            const source=this.input.value,parsed=source.startsWith('/')?parseCommand(source):null,offered=source.startsWith('/')?completeCommand(source.slice(0,this.input.selectionStart??source.length),this.username()):null,
                suggestion=this.completion??(offered?.values.length?{...offered,index:0,source}:null),error=parsed&&'key'in parsed&&!suggestion?parsed:null;
            c.fillStyle='#00000080';c.fillRect(2,h-14,w-4,12);nativeField(c,this.pixels.font,this.input,[4,h-12,w-4,12],{shadow:true,color:source.startsWith('/')?'#AAAAAA':'#FFFFFF',invalidFrom:error?.cursor});
            if(suggestion){const list=suggestion.values,from=Math.max(0,suggestion.index-9),shown=list.slice(from,from+10),sw=Math.max(...shown.map(v=>this.pixels.font.width(v)))+2,sx=Math.max(0,Math.min(w-sw,4+this.pixels.font.width(suggestion.source.slice(0,suggestion.start)))),sy=h-15-shown.length*12;
                c.fillStyle='#000000E0';c.fillRect(sx,sy,sw,shown.length*12);shown.forEach((v,i)=>this.pixels.font.draw(c,v,sx+1,sy+i*12+2,from+i===suggestion.index?'#FFFF00':'#AAAAAA',false));}
            else if(error){const hint=commandHint(source,error,this.text),sy=h-27;c.fillStyle='#000000E0';c.fillRect(2,sy,this.pixels.font.width(hint)+2,12);this.pixels.font.draw(c,hint,3,sy+2,'#FFFFFF',true);}
            this.root.dataset.commandHint=JSON.stringify({suggestions:suggestion?.values??[],error,hint:error?commandHint(source,error,this.text):null});
            this.root.dataset.completion=JSON.stringify(this.completion);
        }
        if((tag||hover)&&this.tagHover){
            const lines=tag?wrap(tag,210,v=>this.pixels.font.width(v)).map(text=>({text,color:'#FFFFFF'})):hover!.flatMap(line=>wrap(line.text,200,v=>this.pixels.font.width(v)).map(text=>({text,color:line.color??'#FFFFFF'}))),box=tooltipBox(lines.map(v=>this.pixels.font.width(v.text))),tx=Math.max(0,Math.min(w-box.width,this.tagHover[0]/scale+12)),ty=Math.max(0,this.tagHover[1]/scale-box.height);
            for(const name of ['background','frame']){const path='assets/minecraft/textures/gui/sprites/tooltip/'+name+'.png';drawSprite(c,this.pixels.resources.guiImages.get(path)!,this.pixels.resources.documents.get(path+'.mcmeta')?.gui?.scaling,tx,ty,box.width,box.height);}
            lines.forEach((line,i)=>this.pixels.font.draw(c,line.text,tx+12,ty+12+i*12,line.color,true));
        }
        this.root.dataset.hover=JSON.stringify(hover??null);
        this.root.dataset.open=String(this.open);this.root.dataset.layout=JSON.stringify({scale,width,base,height,input:[4,h-12,w-4,12],lines:bounded.map(r=>r.text),offset:this.offset});
        this.onPaint?.();
    }
    /** Cancel pending paint, the update timer and all owned listeners. */
    dispose(): void {this.lifetime++;this.command=null;clearInterval(this.timer);cancelAnimationFrame(this.paintFrame);this.paintFrame=0;this.rowLayout=null;this.rowRasters.clear();this.wrapping=new WeakMap();this.abort.abort();this.root.remove();}
}
