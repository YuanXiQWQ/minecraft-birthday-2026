/** Native advancement screen and commit-only task toasts share verified resources, icons, font and toast rows. */
import {ADVANCEMENTS,advancementDone,visibleAdvancements} from '../domain/advancements.ts';
import type {AdvancementFacts} from '../domain/advancements.ts';
import {advancementText} from '../i18n/advancements.ts';
import {scaledCanvas} from './inventory.ts';
import type {GameInventory} from './inventory.ts';
import {wrap} from './pixels.ts';
import {alignRaster} from './raster.ts';
import {drawSprite} from './vanilla.ts';
import {RecipeToastClock} from './native-animation.ts';
import {ToastSlots} from './toast-slots.ts';
import {advancementPositions,advancementTooltipLayout} from './advancement-layout.ts';
import {tooltipBox} from './inventory-state.ts';

/** Each task has its own ToastInstance timing and stable native row. */
interface TaskToast {id:string;canvas:HTMLCanvasElement;clock:RecipeToastClock}

/** Project only saved facts; notification input accepts committed new completion events. */
export class AdvancementView {
    modal=document.createElement('dialog');
    canvas=document.createElement('canvas');
    controls=document.createElement('div');
    title=document.createElement('canvas');
    done=document.createElement('button');
    doneCanvas=document.createElement('canvas');
    doneHovered=false;
    slots=new ToastSlots();
    facts:AdvancementFacts|undefined;
    locale='';
    generation='';
    selected='';
    hover='';
    hoverTab='';
    returnTo:(()=>void)|undefined;
    windowX=0;windowY=0;
    fade=0;fadeFrame=0;fadeTime=0;
    scale=1;
    scroll=new Map<string,{x:number;y:number}>();
    tasks:TaskToast[]=[];
    notified=new Set<string>();
    frame=0;
    abort=new AbortController();
    resize:ResizeObserver;
    disposed=false;
    drag:{x:number;y:number}|null=null;
    /** Bind the formal inventory's verified rendering resources and world input gate.
     * @param {GameInventory} ui Existing icon/font authority.
     * @param {HTMLElement} host Game viewport.
     * @param {Function} gate Recompute world input availability.
     * @param {Function} sound Existing categorized UI audio.
     */
    constructor(public ui:GameInventory,public host:HTMLElement,public gate:()=>void,public sound:(id:string)=>void) {
        this.modal.className='advancements-screen';this.modal.id='advancements';this.modal.setAttribute('aria-label',this.text('gui.advancements'));
        this.controls.className='advancement-controls';this.title.className='advancement-screen-title';this.done.className='advancement-done mc-button';this.done.type='button';this.done.append(this.doneCanvas);this.done.addEventListener('click',()=>this.close());
        for(const event of ['pointerenter','focus'])this.done.addEventListener(event,()=>{this.doneHovered=true;this.paint(false);});
        for(const event of ['pointerleave','blur'])this.done.addEventListener(event,()=>{this.doneHovered=false;this.paint(false);});
        this.modal.append(this.canvas,this.controls,this.title,this.done);host.append(this.modal);
        const signal=this.abort.signal;
        this.modal.addEventListener('close',()=>this.gate(),{signal});
        this.modal.addEventListener('cancel',e=>{e.preventDefault();this.close();},{signal});
        for(const event of ['pointerdown','pointerup','wheel','contextmenu'])this.modal.addEventListener(event,e=>{e.stopPropagation();if(event==='contextmenu')e.preventDefault();},{signal});
        this.modal.addEventListener('pointerdown',e=>{if(e.button!==0||(e.target as Element).closest('.advancement-done,[data-tab]'))return;this.drag={x:e.clientX,y:e.clientY};this.modal.setPointerCapture(e.pointerId);},{signal});
        this.modal.addEventListener('pointermove',e=>{if(!this.drag||!this.selected)return;const s=this.scroll.get(this.selected);if(s){s.x+=(e.clientX-this.drag.x)/this.scale;s.y+=(e.clientY-this.drag.y)/this.scale;this.clampScroll(s);this.paint();}this.drag={x:e.clientX,y:e.clientY};},{signal});
        for(const event of ['pointerup','pointercancel'])this.modal.addEventListener(event,()=>{this.drag=null;},{signal});
        this.modal.addEventListener('wheel',e=>{e.preventDefault();const s=this.scroll.get(this.selected);if(s){s.x-=e.deltaX/Math.max(1,Math.abs(e.deltaX))*16||0;s.y-=e.deltaY/Math.max(1,Math.abs(e.deltaY))*16||0;this.clampScroll(s);this.paint();}},{signal,passive:false});
        window.addEventListener('blur',()=>this.close(false),{signal});
        document.addEventListener('visibilitychange',()=>{if(document.hidden){this.close(false);this.clearToasts();}},{signal});
        this.resize=new ResizeObserver(()=>{this.paint();});this.resize.observe(host);
        if(ui.book)ui.book.toastSlots=this.slots;
    }
    /** Resolve official translated copy with English fallback. @param {string} key Native language key. @return {string} Localized copy. */
    text(key:string):string {return advancementText(key,this.ui.permanent?.settings.locale);}
    /** Replace projections without replaying notifications; new generations invalidate all old rows.
     * @param {AdvancementFacts|undefined} facts Authoritative criteria.
     * @param {string} generation Save epoch.
     */
    sync(facts:AdvancementFacts|undefined,generation:string):void {
        if(generation!==this.generation){this.close(false);this.clearToasts();this.notified.clear();this.generation=generation;this.scroll.clear();}
        const locale=this.ui.permanent?.settings.locale??'en',changed=JSON.stringify(this.facts)!==JSON.stringify(facts)||this.locale!==locale;
        this.facts=facts;this.locale=locale;this.modal.setAttribute('aria-label',this.text('gui.advancements'));if(this.modal.open)this.paint(changed);
    }
    /** Open the native screen without changing the activity clock. @param {Function} returnTo Optional invoking screen. */
    open(returnTo?:()=>void):void {if(this.disposed||this.modal.open)return;this.returnTo=returnTo;this.hover='';this.hoverTab='';this.fade=0;this.scroll.clear();this.modal.show();this.paint();this.gate();this.done.focus({preventScroll:true});}
    /** Close and cancel gestures, returning to the invoking screen only for an explicit dismissal. @param {boolean} restore Whether to restore the parent screen. */
    close(restore=true):void {this.drag=null;cancelAnimationFrame(this.fadeFrame);this.fadeFrame=0;const parent=this.returnTo;this.returnTo=undefined;if(this.modal.open){if(restore)parent?.();this.modal.close();this.gate();}}
    /** Fetch one already hash-verified native texture. @param {string} name GUI-relative path. @return {HTMLCanvasElement} Exact original image. */
    image(name:string):HTMLCanvasElement {
        const image=this.ui.pixels.resources.guiImages.get('assets/minecraft/textures/gui/'+name+'.png');if(!image)throw Error('missing-advancement-texture:'+name);return image;
    }
    /** Draw a native metadata-sized sprite. @param {CanvasRenderingContext2D} c Target. @param {string} name Sprite path. @param {number} x Left. @param {number} y Top. @param {number} w Width. @param {number} h Height. */
    sprite(c:CanvasRenderingContext2D,name:string,x:number,y:number,w:number,h:number):void {
        const path='assets/minecraft/textures/gui/'+name+'.png';drawSprite(c,this.image(name),this.ui.pixels.resources.documents.get(path+'.mcmeta')?.gui?.scaling,x,y,w,h);
    }
    /** Lay out the bounded native tree at 28 by 27 logical pixels.
     * @param {string} root Native tree root.
     * @return {Map<string,{x:number;y:number}>} Full node positions, independent of completion.
     */
    positions(root:string):Map<string,{x:number;y:number}> {
        return advancementPositions(root);
    }
    /** Restrict scrolling to the same native graph bounds. @param {{x:number;y:number}} scroll Current native offset. */
    clampScroll(scroll:{x:number;y:number}):void {
        const visible=visibleAdvancements(this.facts),positions=[...this.positions(this.selected)].filter(([id])=>visible.has(id)).map(([,p])=>p),maxX=Math.max(...positions.map(p=>p.x))+28,maxY=Math.max(...positions.map(p=>p.y))+27,minX=Math.min(...positions.map(p=>p.x)),minY=Math.min(...positions.map(p=>p.y));
        if(maxX-minX>234)scroll.x=Math.min(0,Math.max(234-maxX,scroll.x));
        if(maxY-minY>113)scroll.y=Math.min(0,Math.max(113-maxY,scroll.y));
    }
    /** Add an accessible hit surface without replacing native visible pixels.
     * @param {string} id Namespaced node.
     * @param {number} x Logical left in the window.
     * @param {number} y Logical top.
     * @param {boolean} tab Whether this selects a tree.
     */
    hit(id:string,x:number,y:number,tab=false):void {
        const d=ADVANCEMENTS[id],b=document.createElement('button');b.type='button';b.dataset.advancement=id;b.dataset.done=String(advancementDone(this.facts,id));
        b.setAttribute('aria-label',this.text(d.display.title.translate)+': '+this.text(d.display.description.translate));
        const left=tab?x:Math.max(x,this.windowX+9),top=tab?y:Math.max(y,this.windowY+18),right=tab?x+28:Math.min(x+26,this.windowX+243),bottom=tab?y+32:Math.min(y+26,this.windowY+131);
        if(right<=left||bottom<=top)return;
        b.style.cssText=`left:${left*this.scale}px;top:${top*this.scale}px;width:${(right-left)*this.scale}px;height:${(bottom-top)*this.scale}px`;
        if(tab)b.dataset.tab='true';
        for(const event of ['pointerenter','focus'])b.addEventListener(event,()=>{if(tab)this.hoverTab=id;else this.hover=id;this.paint(false);this.animateHover();});
        for(const event of ['pointerleave','blur'])b.addEventListener(event,()=>{if(tab)this.hoverTab='';else this.hover='';this.paint(false);this.animateHover();});
        if(tab)b.addEventListener('click',()=>{this.selected=id;this.hover='';this.fade=0;this.paint();});
        this.controls.append(b);
    }
    /** Advance the native hover dimming by 0.06 / -0.12 per visible 50ms tick. */
    animateHover():void {
        if(this.fadeFrame||!this.modal.open)return;this.fadeTime=performance.now();
        /** Paint only while the native hover fade is changing. @param {number} now Visible frame time. */
        const tick=(now:number)=>{this.fadeFrame=0;if(!this.modal.open)return;if(now-this.fadeTime>=50){this.fade=Math.max(0,Math.min(.3,this.fade+(this.hover ? .06 : -.12)));this.fadeTime=now;this.paint(false);}if(this.hover?this.fade<.3:this.fade>0)this.fadeFrame=requestAnimationFrame(tick);};
        this.fadeFrame=requestAnimationFrame(tick);
    }
    /** Render native window, backgrounds, graph connectors, task frames and translated hover descriptions.
     * @param {boolean} rebuild Whether graph hit surfaces changed.
     */
    paint(rebuild=true):void {
        if(!this.modal.open||this.disposed)return;
        const visible=visibleAdvancements(this.facts),roots=Object.keys(ADVANCEMENTS).filter(id=>!ADVANCEMENTS[id].parent&&visible.has(id)),font=this.ui.pixels.font;
        if(!roots.includes(this.selected))this.selected=roots[0]??'';
        this.scale=Math.max(1,Math.min(this.ui.scale,Math.floor(this.host.clientWidth/252),Math.floor(this.host.clientHeight/196)));
        const width=Math.ceil(this.host.clientWidth/this.scale),height=Math.ceil(this.host.clientHeight/this.scale),wx=this.windowX=Math.floor((width-252)/2),wy=this.windowY=Math.floor((height-140)/2);
        const title=this.text('gui.advancements'),done=this.text('gui.done'),tc=scaledCanvas(this.title,Math.max(1,font.width(title)),9,this.scale),dc=scaledCanvas(this.doneCanvas,200,20,this.scale);
        tc.clearRect(0,0,font.width(title),9);font.draw(tc,title,0,0,'#FFF',true);this.title.style.cssText=`width:${font.width(title)*this.scale}px;height:${9*this.scale}px;left:${Math.floor((width-font.width(title))/2)*this.scale}px;top:${12*this.scale}px`;
        this.sprite(dc,'sprites/widget/button'+(this.doneHovered?'_highlighted':''),0,0,200,20);font.draw(dc,done,100-font.width(done)/2,6,'#FFF',true);this.done.setAttribute('aria-label',done);this.done.style.cssText=`width:${200*this.scale}px;height:${20*this.scale}px;left:${Math.floor((width-200)/2)*this.scale}px;top:${(height-27)*this.scale}px`;
        const c=scaledCanvas(this.canvas,width,height,this.scale);c.clearRect(0,0,width,height);
        const background=this.image('inworld_menu_background'),pattern=c.createPattern(background,'repeat')!;pattern.setTransform(new DOMMatrix().scale(2));c.fillStyle=pattern;c.fillRect(0,0,width,height);
        this.controls.style.width=width*this.scale+'px';this.controls.style.height=height*this.scale+'px';
        if(rebuild)this.controls.replaceChildren();
        c.save();c.translate(wx,wy);c.save();c.beginPath();c.rect(9,18,234,113);c.clip();c.fillStyle='#000';c.fillRect(9,18,234,113);
        if(this.selected){
            const positions=this.positions(this.selected),shown=[...positions].filter(([id])=>visible.has(id)).map(([,p])=>p),xs=shown.map(v=>v.x),ys=shown.map(v=>v.y);
            if(!this.scroll.has(this.selected))this.scroll.set(this.selected,{x:117-Math.trunc((Math.min(...xs)+Math.max(...xs)+28)/2),y:56-Math.trunc((Math.min(...ys)+Math.max(...ys)+27)/2)});
            const offset=this.scroll.get(this.selected)!,background=ADVANCEMENTS[this.selected].display.background!.split(':')[1].replace('gui/',''),tile=this.image(background);
            for(let x=9+Math.floor(offset.x)%16-16;x<243;x+=16)for(let y=18+Math.floor(offset.y)%16-16;y<131;y+=16)c.drawImage(tile,x,y,16,16);
            /** Draw an inclusive horizontal native GUI line without canvas stroke antialiasing. @param {number} a First X. @param {number} b Last X. @param {number} y Row. */
            const horizontal=(a:number,b:number,y:number)=>c.fillRect(Math.min(a,b),y,Math.abs(a-b)+1,1);
            /** Draw a vertical native GUI line excluding its endpoint rows. @param {number} x Column. @param {number} a First Y. @param {number} b Last Y. */
            const vertical=(x:number,a:number,b:number)=>{if(Math.abs(a-b)>1)c.fillRect(x,Math.min(a,b)+1,1,Math.abs(a-b)-1);};
            for(const border of [true,false]){c.fillStyle=border?'#000':'#FFF';
                for(const [id,p] of positions){const parent=ADVANCEMENTS[id].parent,q=parent?positions.get(parent):null;if(!q||!visible.has(id))continue;
                    const x=9+Math.floor(offset.x)+p.x+13,y=18+Math.floor(offset.y)+p.y+13,X=9+Math.floor(offset.x)+q.x+13,Y=18+Math.floor(offset.y)+q.y+13,split=X+17;
                    if(border){horizontal(split,X,Y-1);horizontal(split+1,X,Y);horizontal(split,X,Y+1);for(const dy of [-1,0,1])horizontal(x,split-1,y+dy);vertical(split-1,y,Y);vertical(split+1,y,Y);}
                    else{horizontal(split,X,Y);horizontal(x,split,y);vertical(split,y,Y);}}}
            for(const [id,p] of positions)if(visible.has(id)){
                const x=9+Math.floor(offset.x+p.x),y=18+Math.floor(offset.y+p.y),done=advancementDone(this.facts,id);
                if(ADVANCEMENTS[id].display.hidden&&!done)continue;
                this.sprite(c,'sprites/advancements/'+(ADVANCEMENTS[id].display.frame??'task')+'_frame_'+(done?'obtained':'unobtained'),x+3,y,26,26);this.ui.stack(c,{id:ADVANCEMENTS[id].display.icon.id,count:1},x+8,y+5);
                if(rebuild)this.hit(id,x+wx,y+wy);
            }
        }else{const a=this.text('advancements.empty'),b=this.text('advancements.sad_label');font.draw(c,a,126-Math.floor(font.width(a)/2),70,'#FFF',true);font.draw(c,b,126-Math.floor(font.width(b)/2),122,'#FFF',true);}
        c.restore();c.drawImage(this.image('advancements/window'),0,0,252,140,0,0,252,140);
        if(roots.length>1)roots.forEach((id,i)=>{const x=i*32;this.sprite(c,'sprites/advancements/tab_above_'+(i===0?'left':'middle')+(id===this.selected?'_selected':''),x,-28,28,32);this.ui.stack(c,{id:ADVANCEMENTS[id].display.icon.id,count:1},x+6,-19);if(rebuild)this.hit(id,x+wx,wy-28,true);});
        font.draw(c,this.text(this.selected?ADVANCEMENTS[this.selected].display.title.translate:'gui.advancements'),8,6,'#404040',false);
        c.fillStyle=`rgba(0,0,0,${this.fade})`;c.fillRect(9,18,234,113);
        if(this.hover&&visible.has(this.hover)&&this.positions(this.selected).has(this.hover))this.tooltip(c,this.hover);
        if(this.hoverTab&&roots.includes(this.hoverTab)){
            const text=this.text(ADVANCEMENTS[this.hoverTab].display.title.translate),box=tooltipBox([font.width(text)]),x=Math.min(roots.indexOf(this.hoverTab)*32+12,width-wx-box.width),y=-37;
            for(const part of ['background','frame'])this.sprite(c,'sprites/tooltip/'+part,x,y,box.width,box.height);
            font.draw(c,text,x+12,y+12,'#FFF',true);
        }
        c.restore();
        this.modal.dataset.visible=JSON.stringify([...visible]);this.modal.dataset.selected=this.selected;
        this.modal.dataset.window=JSON.stringify({x:wx,y:wy,width:252,height:140,scale:this.scale});
        for(const canvas of [this.title,this.doneCanvas,this.canvas])alignRaster(canvas,true);
    }
    /** Draw native title and description boxes within the game viewport.
     * @param {CanvasRenderingContext2D} c Native screen target.
     * @param {string} id Hovered node.
     */
    tooltip(c:CanvasRenderingContext2D,id:string):void {
        const d=ADVANCEMENTS[id],font=this.ui.pixels.font,total=d.requirements.length,completed=d.requirements.filter(group=>group.some(key=>this.facts?.criteria[id]?.includes(key))).length,progress=total>1?`${completed}/${total}`:'',layout=advancementTooltipLayout(this.text(d.display.title.translate),this.text(d.display.description.translate),s=>font.width(s),total>1?font.width(`${total}/${total}`)+8:0),{width:w,titleHeight,descriptionHeight,lines,titles}=layout,position=this.positions(this.selected).get(id)!,offset=this.scroll.get(this.selected)!;
        const nodeX=9+Math.floor(offset.x)+position.x,nodeY=18+Math.floor(offset.y)+position.y,flip=this.windowX+nodeX-9+w+26>=Math.ceil(this.host.clientWidth/this.scale),x=flip?nodeX-w+32:nodeX,y=nodeY+Math.trunc((26-titleHeight)/2),above=y-18+titleHeight+descriptionHeight>=113,top=above?y-descriptionHeight:y,done=advancementDone(this.facts,id);
        this.sprite(c,'sprites/advancements/title_box',x,top,w,titleHeight+descriptionHeight);
        const fraction=total?completed/total:0,part=Math.floor(fraction*w),partial=part>=2&&part<=w-2;
        this.sprite(c,'sprites/advancements/box_'+(done||part>w-2?'obtained':'unobtained'),x,y,w,titleHeight);
        if(!done&&partial){c.save();c.beginPath();c.rect(x,y,part,titleHeight);c.clip();this.sprite(c,'sprites/advancements/box_obtained',x,y,200,titleHeight);c.restore();c.save();c.beginPath();c.rect(x+part,y,w-part,titleHeight);c.clip();this.sprite(c,'sprites/advancements/box_unobtained',x+w-200,y,200,titleHeight);c.restore();}
        this.sprite(c,'sprites/advancements/'+(d.display.frame??'task')+'_frame_'+(done?'obtained':'unobtained'),nodeX+3,nodeY,26,26);
        titles.forEach((line,i)=>font.draw(c,line,flip?x+5:nodeX+32,y+9+i*9,'#FFF',true));
        if(progress)font.draw(c,progress,flip?nodeX-font.width(progress):nodeX+w-font.width(progress)-5,y+9,'#FFF',true);
        lines.forEach((line,i)=>font.draw(c,line,x+5,(above?y-lines.length*9+1:y+titleHeight)+i*9,d.display.frame==='challenge'?'#AA00AA':'#55FF55',true));
        this.ui.stack(c,{id:d.display.icon.id,count:1},nodeX+8,nodeY+5);
    }
    /** Queue task or challenge notifications once per generation, after the save has published its facts.
     * @param {string[]} ids Newly completed advancement IDs.
     * @param {string} generation Source reset epoch.
     */
    notify(ids:string[],generation:string):void {
        if(this.disposed||generation!==this.generation||document.hidden)return;
        for(const id of ids)if(ADVANCEMENTS[id]?.display.show_toast!==false&&advancementDone(this.facts,id)&&!this.notified.has(id)){
            this.notified.add(id);const canvas=document.createElement('canvas'),clock=new RecipeToastClock();canvas.className='advancement-toast';canvas.setAttribute('role','status');canvas.setAttribute('aria-label',this.text('advancements.toast.'+(ADVANCEMENTS[id].display.frame??'task'))+' '+this.text(ADVANCEMENTS[id].display.title.translate));canvas.dataset.advancement=id;canvas.hidden=true;this.host.append(canvas);clock.add([id],performance.now());this.tasks.push({id,canvas,clock});
        }
        this.animate();
    }
    /** Repaint five shared upper-right toast rows and leave excess notifications queued without advancing their clocks. */
    animate():void {
        if(this.frame||this.disposed||!this.tasks.length)return;
        this.frame=requestAnimationFrame(()=>{this.frame=0;
            for(const task of [...this.tasks]){
                const row=this.slots.claim(task);if(row<0)continue;
                const sample=task.clock.sample(performance.now());if(sample.transition)this.sound(sample.transition==='show'?'ui.toast.in':'ui.toast.out');
                if(sample.phase==='done'){this.slots.release(task);task.canvas.remove();this.tasks.splice(this.tasks.indexOf(task),1);continue;}
                const frame=ADVANCEMENTS[task.id].display.frame??'task',label=this.text('advancements.toast.'+frame),color=frame==='challenge'?'#FF88FF':'#FFFF00';
                const scale=this.ui.scale,height=32,c=scaledCanvas(task.canvas,160,height,scale),font=this.ui.pixels.font,title=this.text(ADVANCEMENTS[task.id].display.title.translate),lines=wrap(title,125,s=>font.width(s)),time=sample.fullyVisibleFor;
                c.clearRect(0,0,160,height);this.sprite(c,'sprites/toast/advancement',0,0,160,height);this.ui.stack(c,{id:ADVANCEMENTS[task.id].display.icon.id,count:1},8,8);
                if(lines.length===1){font.draw(c,label,30,7,color,false);font.draw(c,title,30,18,'#FFF',false);}
                else{c.save();c.globalAlpha=Math.min(1,Math.max(0,(time<1500?1500-time:time-1500)/300));if(time<1500)font.draw(c,label,30,11,color,false);else lines.forEach((line,i)=>font.draw(c,line,30,Math.floor(16-lines.length*9/2)+i*9,'#FFF',false));c.restore();}
                task.canvas.style.cssText=`width:${160*scale}px;height:${height*scale}px;top:${row*32*scale}px;transform:translateX(${160*scale*(1-sample.visible)}px)`;task.canvas.hidden=false;task.canvas.dataset.timeline=JSON.stringify(sample);
                alignRaster(task.canvas,true);
            }
            this.animate();
        });
    }
    /** Discard every old-generation queued or visible notification without playing exit sounds. */
    clearToasts():void {cancelAnimationFrame(this.frame);this.frame=0;for(const task of this.tasks){this.slots.release(task);task.clock.clear();task.canvas.remove();}this.tasks=[];}
    /** Release all screen and notification resources with the owning game page. */
    dispose():void {this.disposed=true;this.clearToasts();this.close(false);this.abort.abort();this.resize.disconnect();this.modal.remove();}
}
