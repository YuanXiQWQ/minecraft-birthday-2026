/** Native control pages share committed preferences with the game and isolate in-flight edits by field. */
import {CONTROL_DEFAULTS,KEY_BINDINGS,boundKey,controlSettings,patchControls,scrollDelta,type ControlSettings,type ControlPatch} from '../domain/control-settings.ts';
import en from '../i18n/controls.en_us.json' with {type:'json'};
import zh from '../i18n/controls.zh_cn.json' with {type:'json'};
import type {PixelUI} from './pixels.ts';
import type {NativeScreens} from './native-screens.ts';
import {wrap} from './pixels.ts';
import {drawSprite} from './vanilla.ts';
import {rasterSize,alignRaster} from './raster.ts';
/** Native option order is ControlsScreen.options and MouseSettingsScreen.options. */
const OPTION_ROWS:Record<string,readonly string[]>={controls:['toggleCrouch','toggleSprint','toggleAttack','toggleUse','autoJump','sprintWindow'],mouse:['sensitivity','mouseWheelSensitivity','discreteMouseScroll','invertMouseX','invertMouseY','allowCursorChanges']};
/** Toggle labels use the action name rather than internal option identity. */
const LABELS:Record<string,string>={toggleCrouch:'key.sneak',toggleSprint:'key.sprint',toggleAttack:'key.attack',toggleUse:'key.use',discreteMouseScroll:'options.discrete_mouse_scroll'};
/** Stable native category creation order. */
const CATEGORIES=['movement','misc','multiplayer','gameplay','inventory','creative'];
/** Translate exported original strings with English fallback.
 * @param {string} key Original translation key.
 * @param {string} locale Saved locale.
 * @return {string} Native copy.
 */
export function controlText(key:string,locale:string):string{return (locale==='zh-CN'?zh as Record<string,string>:{} as Record<string,string>)[key]??(en as Record<string,string>)[key]??key;}
/** Use the native localized punctuation between an option name and its value.
 * @param {string} name Native caption.
 * @param {string} value Formatted value.
 * @param {string} locale Display locale.
 * @return {string} Native combined label.
 */
export function controlCaption(name:string,value:string,locale:string):string{return controlText('options.generic_value',locale).replace('%s',name).replace('%s',value);}
/** Resolve a browser physical code to the corresponding native key name.
 * @param {string} code Physical code or unbound empty string.
 * @param {string} locale Display locale.
 * @return {string} Native key label.
 */
export function keyLabel(code:string,locale:string):string{
    if(!code)return controlText('key.keyboard.unknown',locale);
    if(/^Key[A-Z]$/.test(code))return code.slice(3);
    if(/^Digit[0-9]$/.test(code))return code.slice(5);
    if(/^Mouse/.test(code)){const n=Number(code.slice(5));return n===0?controlText('key.mouse.left',locale):n===1?controlText('key.mouse.middle',locale):n===2?controlText('key.mouse.right',locale):controlText('key.mouse',locale).replace(/%1\$s|%s/g,String(n+1));}
    const special:Record<string,string>={ControlLeft:'left.control',ControlRight:'right.control',ShiftLeft:'left.shift',ShiftRight:'right.shift',AltLeft:'left.alt',AltRight:'right.alt',MetaLeft:'left.win',MetaRight:'right.win',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Backquote:'grave.accent',Equal:'equal',BracketLeft:'left.bracket',BracketRight:'right.bracket',Backslash:'backslash',Quote:'apostrophe',PageUp:'page.up',PageDown:'page.down',CapsLock:'caps.lock',NumLock:'num.lock',ScrollLock:'scroll.lock',PrintScreen:'print.screen',ContextMenu:'menu'};
    const name=special[code]??code.replace(/^Key|^Digit/,'').replace(/^Numpad/,'keypad.').toLowerCase(),key='key.keyboard.'+name,label=controlText(key,locale);return label===key?code:label;
}
/** Own three native subpages and the binding capture lifetime. */
export class ControlSettingsUI {
    sections=new Map<string,HTMLElement>(); widgets=new Map<string,HTMLButtonElement|HTMLInputElement>();
    rows=new Map<string,{row:HTMLElement;label:HTMLElement;change:HTMLButtonElement;reset:HTMLButtonElement}>();
    pixels:PixelUI|null=null; value=controlSettings(); locale='en'; writable=false; selected:string|null=null; generation='';
    drafts=new Map<string,{patch:ControlPatch;ticket:object}>(); resetAll:HTMLButtonElement; list:HTMLElement; suppressClick=false;
    tooltip=document.createElement('div');
    content=document.createElement('div');scrollbar=document.createElement('canvas');scrollScale=2;contentHeight=0;scrollDrag:{id:number;y:number}|null=null;
    /** Build controls once; storage and navigation remain with the application.
     * @param {HTMLDialogElement} dialog Settings owner.
     * @param {Function} navigate Show one settings subpage.
     * @param {Function} save Commit a granular patch under the shared lock.
     * @param {AbortSignal} signal Document lifetime.
     */
    constructor(public dialog:HTMLDialogElement,public navigate:(page:string)=>void,public save:(patch:ControlPatch)=>Promise<void>,signal:AbortSignal){
        for(const page of ['controls','mouse','keybinds']){const section=document.createElement('section');section.className='control-section';section.hidden=true;this.sections.set(page,section);}
        const controls=this.sections.get('controls')!;
        for(const [page,key] of [['mouse','options.mouse_settings'],['keybinds','controls.keybinds']]){const b=this.button(()=>navigate(page));b.dataset.nativeText=key;controls.append(b);}
        for(const [page,options] of Object.entries(OPTION_ROWS))for(const key of options){
            const def=CONTROL_DEFAULTS[key as keyof ControlSettings];let widget:HTMLButtonElement|HTMLInputElement;
            if(typeof def==='boolean')widget=this.button(()=>this.edit(key,{[key]:!this.view()[key as keyof ControlSettings]}));
            else {const input=document.createElement('input');input.type='range';input.min=key==='mouseWheelSensitivity'?'-200':'0';input.max=key==='sprintWindow'?'10':key==='mouseWheelSensitivity'?'100':'1';input.step=key==='sensitivity'?'any':'1';if(key!=='sensitivity')input.dataset.nativeInteger='true';
                input.addEventListener('input',()=>{input.dataset.editing='true';this.paintSlider(key,input);});
                input.addEventListener('change',()=>{delete input.dataset.editing;this.edit(key,{[key]:key==='mouseWheelSensitivity'?10**(Number(input.value)/100):Number(input.value)});});
                input.addEventListener('blur',()=>{delete input.dataset.editing;this.paint();});widget=input;}
            widget.dataset.control=key;this.widgets.set(key,widget);this.sections.get(page)!.append(widget);
        }
        this.list=document.createElement('div');this.list.className='keybind-list';this.list.tabIndex=0;this.list.id='keybind-list';this.list.append(this.content);this.scrollbar.className='keybind-scrollbar';this.scrollbar.tabIndex=0;this.scrollbar.setAttribute('role','scrollbar');this.scrollbar.setAttribute('aria-controls',this.list.id);this.scrollbar.setAttribute('aria-orientation','vertical');this.sections.get('keybinds')!.append(this.list,this.scrollbar);
        this.list.addEventListener('scroll',()=>this.paintScrollbar(),{signal});
        this.scrollbar.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();this.scrollDrag={id:e.pointerId,y:e.clientY};this.scrollbar.setPointerCapture(e.pointerId);},{signal});
        this.scrollbar.addEventListener('pointermove',e=>this.dragScrollbar(e),{signal});
        for(const event of ['pointerup','pointercancel','lostpointercapture'])this.scrollbar.addEventListener(event,()=>{this.scrollDrag=null;},{signal});
        this.scrollbar.addEventListener('keydown',e=>{const step={ArrowUp:-10,ArrowDown:10,PageUp:-this.list.clientHeight/this.scrollScale,PageDown:this.list.clientHeight/this.scrollScale,Home:-Infinity,End:Infinity}[e.code];if(step===undefined)return;e.preventDefault();this.list.scrollTop=Math.max(0,Math.min(this.list.scrollHeight-this.list.clientHeight,this.list.scrollTop+step*this.scrollScale));},{signal});
        for(const category of CATEGORIES){const title=document.createElement('div');title.className='keybind-category';title.tabIndex=0;title.dataset.nativeText='key.category.minecraft.'+category;this.content.append(title);
            for(const [id] of KEY_BINDINGS.filter(([, ,group])=>group===category)){const row=document.createElement('div'),label=document.createElement('span'),change=this.button(()=>{this.selected=id;this.paint();}),reset=this.button(()=>this.edit('binding:'+id,{bindings:{[id]:boundKey(undefined,id)}}));
                row.className='keybind-row';row.dataset.binding=id;label.dataset.nativeText='key.'+id;reset.dataset.nativeText='controls.reset';change.dataset.keyChange=id;row.append(label,change,reset);this.content.append(row);this.rows.set(id,{row,label,change,reset});}
        }
        this.resetAll=this.button(()=>this.edit('bindings',{bindings:Object.fromEntries(KEY_BINDINGS.map(([id,code])=>[id,code]))}));this.resetAll.dataset.nativeText='controls.resetAll';this.resetAll.className='keybind-reset-all';this.sections.get('keybinds')!.append(this.resetAll);
        document.addEventListener('keydown',e=>{if(!this.capturing()||e.isComposing)return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)this.capture(e.code==='Escape'?'':e.code);},{capture:true,signal});
        document.addEventListener('keyup',e=>{if(this.dialog.open&&this.sections.get('keybinds')?.hidden===false){e.stopImmediatePropagation();e.preventDefault();}},{capture:true,signal});
        document.addEventListener('pointerdown',e=>{if(!this.capturing())return;e.preventDefault();e.stopImmediatePropagation();this.suppressClick=e.button===0;this.capture('Mouse'+e.button);},{capture:true,signal});
        document.addEventListener('click',e=>{if(this.suppressClick){this.suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal});
        window.addEventListener('blur',()=>this.cancel(),{signal});dialog.addEventListener('close',()=>this.cancel(),{signal});
        this.tooltip.hidden=true;this.tooltip.className='control-tooltip';this.tooltip.setAttribute('role','tooltip');
        dialog.addEventListener('pointermove',e=>{const target=(e.target as Element).closest<HTMLElement>('[data-native-tooltip]');this.showTooltip(target?.dataset.nativeTooltip??'',e.clientX,e.clientY);},{signal});
        dialog.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;const list=this.sections.get('keybinds')!.hidden?(e.target as Element).closest<HTMLElement>('.control-section,.native-language-list,.sound-section'):this.list;if(!list)return;e.preventDefault();const scale=parseFloat(getComputedStyle(this.dialog.querySelector('.native-screen-plane')!).getPropertyValue('--native-screen-scale'))||2;list.scrollTop+=scrollDelta(e.deltaY,e.deltaMode,this.value)*(list.classList.contains('keybind-list')?10:list.classList.contains('native-language-list')?9:12.5)*scale;},{passive:false,signal});
        dialog.addEventListener('pointerleave',()=>this.showTooltip('',0,0),{signal});
    }
    /** Create a semantic button with native painting attached later.
     * @param {Function} action Click action.
     * @return {HTMLButtonElement} New control.
     */
    button(action:()=>void):HTMLButtonElement{const b=document.createElement('button');b.type='button';b.addEventListener('click',action);return b;}
    /** Attach already loaded native pixels to static controls.
     * @param {PixelUI} pixels Shared native UI.
     */
    attach(pixels:PixelUI):void{this.pixels=pixels;this.dialog.append(this.tooltip);for(const section of this.sections.values()){section.querySelectorAll('button').forEach(b=>pixels.button(b));section.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(input=>pixels.slider(input));}this.paint();}
    /** Accept committed authority, preserving only this generation's pending user edits.
     * @param {ControlSettings|undefined} value Saved controls.
     * @param {string} locale Current language.
     * @param {boolean} writable Storage availability.
     * @param {string} generation Save reset identity.
     */
    sync(value:ControlSettings|undefined,locale:string,writable:boolean,generation:string):void{const next=controlSettings(value);if(generation===this.generation&&locale===this.locale&&writable===this.writable&&JSON.stringify(next)===JSON.stringify(this.value))return;if(generation!==this.generation){this.drafts.clear();this.cancel();}this.generation=generation;this.value=next;this.locale=locale;this.writable=writable;this.paint();}
    /** Project independent in-flight changes over committed state.
     * @return {ControlSettings} Visible control values.
     */
    view():ControlSettings{let value=this.value;for(const d of this.drafts.values())value=patchControls(value,d.patch);return value;}
    /** Submit a field edit without letting an older receipt erase a newer one.
     * @param {string} key Draft identity.
     * @param {ControlPatch} patch Explicit fields only.
     */
    edit(key:string,patch:ControlPatch):void{if(!this.writable)return;const ticket={};this.drafts.set(key,{patch,ticket});this.paint();void this.save(patch).catch(()=>{}).finally(()=>{if(this.drafts.get(key)?.ticket===ticket){this.drafts.delete(key);this.paint();}});}
    /** Whether the next physical input belongs exclusively to a binding row.
     * @return {boolean} Active capture.
     */
    capturing():boolean{return this.selected!==null&&this.dialog.open&&!this.sections.get('keybinds')!.hidden&&this.writable;}
    /** Store a supported physical binding and end capture.
     * @param {string} code Physical key or mouse code.
     */
    capture(code:string):void{const id=this.selected;if(!id)return;try{patchControls(this.view(),{bindings:{[id]:code}});}catch{return;}this.selected=null;this.edit('binding:'+id,{bindings:{[id]:code}});}
    /** Cancel capture and unsubmitted slider gestures on navigation or focus loss. */
    cancel():void{this.selected=null;this.suppressClick=false;this.showTooltip('',0,0);for(const w of this.widgets.values())delete w.dataset.editing;this.paint();}
    /** Render native tooltip sprites with direct physical-pixel glyphs inside the settings viewport.
     * @param {string} text Native localized tooltip, or empty to hide.
     * @param {number} x Client mouse X.
     * @param {number} y Client mouse Y.
     */
    showTooltip(text:string,x:number,y:number):void{
        if(!text||!this.pixels||this.selected){if(!this.tooltip.hidden)this.tooltip.hidden=true;return;}
        const pixels=this.pixels,scale=parseFloat(getComputedStyle(this.dialog.querySelector('.native-screen-plane')!).getPropertyValue('--native-screen-scale'))||2,bounds=this.dialog.getBoundingClientRect(),lines=wrap(text,Math.min(170,bounds.width/scale-32),s=>pixels.font.width(s)),width=Math.max(...lines.map(s=>pixels.font.width(s)))+24,height=24+lines.length*12,resolution=scale*Math.min(devicePixelRatio||1,4),canvas=document.createElement('canvas');
        canvas.width=rasterSize(width,resolution);canvas.height=rasterSize(height,resolution);canvas.style.width=width*scale+'px';canvas.style.height=height*scale+'px';const c=canvas.getContext('2d')!;c.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);c.imageSmoothingEnabled=false;
        for(const name of ['background','frame']){const path='assets/minecraft/textures/gui/sprites/tooltip/'+name+'.png',image=pixels.resources.guiImages.get(path);if(image)drawSprite(c,image,pixels.resources.documents.get(path+'.mcmeta')?.gui?.scaling,0,0,width,height);}
        lines.forEach((line,i)=>pixels.font.draw(c,line,12,12+i*12,'#FFFFFF',true));this.tooltip.replaceChildren(canvas);this.tooltip.setAttribute('aria-label',text);this.tooltip.style.cssText='position:fixed;z-index:40;pointer-events:none;left:'+Math.max(bounds.left+4,Math.min(x+12,bounds.right-width*scale-4))+'px;top:'+Math.max(bounds.top+4,Math.min(y+12,bounds.bottom-height*scale-4))+'px';if(this.tooltip.hidden)this.tooltip.hidden=false;alignRaster(canvas,true);
    }
    /** Apply native OptionsList and KeyBindsList geometry at the final GUI scale.
     * @param {NativeScreens} screen Shared layout owner.
     * @param {number} w Logical viewport width.
     * @param {number} h Logical viewport height.
     * @param {HTMLButtonElement} done Shared parent-navigation button.
     * @param {string} page Active page.
     */
    layout(screen:NativeScreens,w:number,h:number,done:HTMLButtonElement,page:string):void{
        if(!this.sections.has(page))return;
        const scale=screen.placementScale,narrow=w<310,bw=narrow?Math.min(200,w-16):150,group=narrow?bw:310;
        for(const id of ['controls','mouse']){const section=this.sections.get(id)!;screen.place(section,0,33,w,h-66);section.style.overflowY='auto';[...section.children].forEach((child,i)=>screen.place(child as HTMLElement,(w-group)/2+(i%(narrow?1:2))*(bw+10),4+Math.floor(i/(narrow?1:2))*25,bw));}
        const rowWidth=Math.min(340,w-32),left=Math.floor(w/2)-Math.floor(rowWidth/2),scrollbar=left+rowWidth+8;
        this.scrollScale=scale;screen.place(this.list,0,33,w,h-66);
        for(const category of CATEGORIES){const heading=this.content.querySelector<HTMLElement>('[data-native-text="key.category.minecraft.'+category+'"]')!;this.content.append(heading);const entries=KEY_BINDINGS.filter(([, ,group])=>group===category).map(([id])=>id).sort((a,b)=>{const x=controlText('key.'+a,this.locale),y=controlText('key.'+b,this.locale);return x<y?-1:x>y?1:0;});for(const id of entries)this.content.append(this.rows.get(id)!.row);}
        let y=2;for(const child of this.content.children){const row=child as HTMLElement,compact=w<340;screen.place(row,0,y,rowWidth,compact?36:20);if(row.classList.contains('keybind-category')){const title=controlText(row.dataset.nativeText!,this.locale),width=(this.pixels?.font.width(title)??0)+[...title].length+8;screen.place(row,Math.floor(w/2)-Math.floor(width/2)-left,y+1,width,17);y+=20;}else{const r=this.rows.get(row.dataset.binding!)!,resetX=scrollbar-left-60,changeX=resetX-80;screen.place(r.label,2,compact?0:6,compact?rowWidth-4:Math.max(40,changeX-10),9);screen.place(r.change,changeX,compact?12:0,75);screen.place(r.reset,resetX,compact?12:0,50);y+=compact?36:20;}}
        this.contentHeight=y+2;screen.place(this.content,left,0,rowWidth,this.contentHeight);screen.place(this.scrollbar,scrollbar,33,6,h-66);this.paintScrollbar();
        const footerWidth=Math.min(308,w-16),footerButton=(footerWidth-8)/2;
        screen.place(this.resetAll,(w-footerWidth)/2,h-26,footerButton);
        if(page==='keybinds')screen.place(done,(w-footerWidth)/2+footerButton+8,h-26,footerButton);
        else screen.place(done,(w-Math.min(200,w-16))/2,h-26,Math.min(200,w-16));
        this.paint();
    }
    /** Paint the original six-pixel scrollbar sprites using AbstractScrollArea's clamped thumb geometry. */
    paintScrollbar():void{
        if(!this.pixels||!this.list.clientHeight)return;const h=this.list.clientHeight/this.scrollScale,max=Math.max(0,this.contentHeight-h),thumb=Math.max(32,Math.min(h-8,Math.floor(h*h/this.contentHeight))),y=max?Math.floor(Math.trunc(this.list.scrollTop/this.scrollScale)*(h-thumb)/max):0,canvas=this.scrollbar;
        canvas.style.visibility=max?'visible':'hidden';canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax',String(max));canvas.setAttribute('aria-valuenow',String(Math.trunc(this.list.scrollTop/this.scrollScale)));canvas.setAttribute('aria-label',controlText('controls.keybinds',this.locale));
        const resolution=this.scrollScale*Math.min(devicePixelRatio||1,4);canvas.width=rasterSize(6,resolution);canvas.height=rasterSize(h,resolution);const c=canvas.getContext('2d')!;c.setTransform(canvas.width/6,0,0,canvas.height/h,0,0);c.imageSmoothingEnabled=false;
        for(const [name,top,height] of [['scroller_background',0,h],['scroller',y,thumb]] as const){const path='assets/minecraft/textures/gui/sprites/widget/'+name+'.png',image=this.pixels.resources.guiImages.get(path);if(!image)throw Error('missing-native-scrollbar:'+path);drawSprite(c,image,this.pixels.resources.documents.get(path+'.mcmeta')?.gui?.scaling,0,top,6,height);}
    }
    /** Drag at the native scroll-to-thumb ratio without warping the user's pointer.
     * @param {PointerEvent} event Captured browser drag.
     */
    dragScrollbar(event:PointerEvent):void{if(!this.scrollDrag||this.scrollDrag.id!==event.pointerId)return;const rect=this.scrollbar.getBoundingClientRect(),h=rect.height/this.scrollScale,max=Math.max(0,this.contentHeight-h),thumb=Math.max(32,Math.min(h-8,Math.floor(h*h/this.contentHeight))),delta=event.clientY-this.scrollDrag.y;this.scrollDrag.y=event.clientY;this.list.scrollTop=event.clientY<rect.top?0:event.clientY>rect.bottom?max*this.scrollScale:this.list.scrollTop+delta*Math.max(1,max/(h-thumb));event.preventDefault();}
    /** Paint one slider's original native value label.
     * @param {string} key Option identity.
     * @param {HTMLInputElement} input Range control.
     */
    paintSlider(key:string,input:HTMLInputElement):void{const t=(k:string)=>controlText(k,this.locale),n=Number(input.value),value=key==='sensitivity'?(n===0?t('options.sensitivity.min'):n===1?t('options.sensitivity.max'):Math.floor(n*200)+'%'):key==='mouseWheelSensitivity'?(10**(n/100)).toFixed(2):n===0?t('options.off'):String(n);input.dataset.nativeLabel=controlCaption(t(LABELS[key]??'options.'+key),value,this.locale);input.setAttribute('aria-label',input.dataset.nativeLabel);this.pixels?.updates.get(input)?.();}
    /** Redraw labels, native selection/conflict styling and reset availability. */
    paint():void{
        const value=this.view(),t=(key:string)=>controlText(key,this.locale),text=(el:HTMLElement,label:string,color='#FFFFFF')=>{if(this.pixels){if(!this.pixels.texts.has(el))for(const child of [...el.childNodes])if(child.nodeType===Node.TEXT_NODE)child.remove();this.pixels.text(el,label,2,color);}else el.textContent=label;};
        for(const section of this.sections.values())section.querySelectorAll<HTMLElement>('[data-native-text]').forEach(el=>text(el,t(el.dataset.nativeText!)));
        for(const [key,w] of this.widgets){w.disabled=!this.writable;if(['sprintWindow','allowCursorChanges'].includes(key))w.dataset.nativeTooltip=t('options.'+key+'.tooltip');const v=value[key as keyof ControlSettings];if(w instanceof HTMLInputElement){if(!w.dataset.editing)w.value=String(key==='mouseWheelSensitivity'?Math.round(Math.log10(v as number)*100):v);this.paintSlider(key,w);}else text(w,controlCaption(t(LABELS[key]??'options.'+key),t(key.startsWith('toggle')?(v?'options.key.toggle':'options.key.hold'):(v?'options.on':'options.off')),this.locale));}
        for(const [id,r] of this.rows){const code=boundKey(value,id),duplicates=KEY_BINDINGS.filter(([other])=>other!==id&&code&&boundKey(value,other)===code).map(([other])=>t('key.'+other)),selected=this.selected===id;let label=keyLabel(code,this.locale);if(duplicates.length)label='['+label+' ]';if(selected)label='> '+label+' <';r.change.dataset.bindingSelected=String(selected);r.change.dataset.conflict=String(duplicates.length>0);text(r.change,label);r.change.dataset.nativeTooltip=duplicates.length?t('controls.keybinds.duplicateKeybinds').replace('%s',duplicates.join('\n')):'';r.change.disabled=!this.writable;r.reset.disabled=!this.writable||code===boundKey(undefined,id);}
        this.resetAll.disabled=!this.writable||KEY_BINDINGS.every(([id,code])=>boundKey(value,id)===code);
        if(this.pixels)for(const section of this.sections.values())section.querySelectorAll('button').forEach(b=>this.pixels!.refreshButton(b));
    }
}
