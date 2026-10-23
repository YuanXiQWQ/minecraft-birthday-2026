/** Native advancement screen and commit-only task toasts share verified resources, icons, font and toast rows. */
import {ADVANCEMENTS,advancementDone,visibleAdvancements} from '../domain/advancements.ts';
import type {AdvancementFacts} from '../domain/advancements.ts';
import english from '../i18n/advancements.en_us.json' with {type:'json'};
import chinese from '../i18n/advancements.zh_cn.json' with {type:'json'};
import {scaledCanvas} from './inventory.ts';
import type {GameInventory} from './inventory.ts';
import {wrap} from './pixels.ts';
import {drawSprite} from './vanilla.ts';
import {RecipeToastClock} from './native-animation.ts';
import {ToastSlots} from './toast-slots.ts';

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
        this.modal.addEventListener('pointerdown',e=>{if(e.button!==0||(e.target as Element).closest('button'))return;this.drag={x:e.clientX,y:e.clientY};this.modal.setPointerCapture(e.pointerId);},{signal});
        this.modal.addEventListener('pointermove',e=>{if(!this.drag||!this.selected)return;const s=this.scroll.get(this.selected);if(s){s.x+=(e.clientX-this.drag.x)/this.scale;s.y+=(e.clientY-this.drag.y)/this.scale;this.clampScroll(s);this.paint();}this.drag={x:e.clientX,y:e.clientY};},{signal});
        for(const event of ['pointerup','pointercancel'])this.modal.addEventListener(event,()=>{this.drag=null;},{signal});
        this.modal.addEventListener('wheel',e=>{e.preventDefault();const s=this.scroll.get(this.selected);if(s){s.x-=e.deltaX/Math.max(1,Math.abs(e.deltaX))*16||0;s.y-=e.deltaY/Math.max(1,Math.abs(e.deltaY))*16||0;this.clampScroll(s);this.paint();}},{signal,passive:false});
        window.addEventListener('blur',()=>this.close(),{signal});
        document.addEventListener('visibilitychange',()=>{if(document.hidden){this.close();this.clearToasts();}},{signal});
        this.resize=new ResizeObserver(()=>{this.paint();});this.resize.observe(host);
        if(ui.book)ui.book.toastSlots=this.slots;
    }
    /** Resolve official translated copy with English fallback. @param {string} key Native language key. @return {string} Localized copy. */
    text(key:string):string {return ((this.ui.permanent?.settings.locale==='zh-CN'||this.ui.permanent?.settings.locale==='zh_cn')?chinese:english)[key as keyof typeof english]??english[key as keyof typeof english]??key;}
    /** Replace projections without replaying notifications; new generations invalidate all old rows.
     * @param {AdvancementFacts|undefined} facts Authoritative criteria.
     * @param {string} generation Save epoch.
     */
    sync(facts:AdvancementFacts|undefined,generation:string):void {
        if(generation!==this.generation){this.close();this.clearToasts();this.notified.clear();this.generation=generation;this.scroll.clear();}
        const locale=this.ui.permanent?.settings.locale??'en',changed=JSON.stringify(this.facts)!==JSON.stringify(facts)||this.locale!==locale;
        this.facts=facts;this.locale=locale;this.modal.setAttribute('aria-label',this.text('gui.advancements'));if(this.modal.open)this.paint(changed);
    }
    /** Open the native L-key screen without changing the activity clock. */
    open():void {if(this.disposed||this.modal.open)return;this.hover='';this.modal.show();this.paint();this.gate();this.done.focus({preventScroll:true});}
    /** Close and cancel screen gestures without changing durable facts. */
    close():void {this.drag=null;if(this.modal.open){this.modal.close();this.gate();}}
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
        let leaf=0;const result=new Map<string,{x:number;y:number}>();
        /** Position a node between its children. @param {string} id Node. @param {number} depth Native depth. @return {number} Vertical midpoint. */
        function place(id:string,depth:number):number {
            const children=Object.keys(ADVANCEMENTS).filter(k=>ADVANCEMENTS[k].parent===id),ys=children.map(k=>place(k,depth+1)),y=ys.length?(ys[0]+ys.at(-1)!)/2:leaf++*27;
            result.set(id,{x:depth*28,y});return y;
        }
        place(root,0);return result;
    }
    /** Restrict scrolling to the same native graph bounds. @param {{x:number;y:number}} scroll Current native offset. */
    clampScroll(scroll:{x:number;y:number}):void {
        const positions=[...this.positions(this.selected).values()],maxX=Math.max(...positions.map(p=>p.x))+28,maxY=Math.max(...positions.map(p=>p.y))+27;
        scroll.x=maxX>234?Math.min(0,Math.max(234-maxX,scroll.x)):(234-maxX)/2;
        scroll.y=maxY>113?Math.min(0,Math.max(113-maxY,scroll.y)):(113-maxY)/2;
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
        b.style.cssText=`left:${x*this.scale}px;top:${y*this.scale}px;width:${26*this.scale}px;height:${26*this.scale}px`;
        b.addEventListener('pointerenter',()=>{this.hover=id;this.paint(false);});b.addEventListener('focus',()=>{this.hover=id;this.paint(false);});
        b.addEventListener('pointerleave',()=>{this.hover='';this.paint(false);});b.addEventListener('blur',()=>{this.hover='';this.paint(false);});
        if(tab)b.addEventListener('click',()=>{this.selected=id;this.hover='';this.paint();});
        this.controls.append(b);
    }
    /** Render native window, backgrounds, graph connectors, task frames and translated hover descriptions.
     * @param {boolean} rebuild Whether graph hit surfaces changed.
     */
    paint(rebuild=true):void {
        if(!this.modal.open||this.disposed)return;
        const visible=visibleAdvancements(this.facts),roots=Object.keys(ADVANCEMENTS).filter(id=>!ADVANCEMENTS[id].parent&&visible.has(id)),font=this.ui.pixels.font;
        if(!roots.includes(this.selected))this.selected=roots[0]??'';
        this.scale=Math.max(1,Math.min(this.ui.scale,Math.floor(this.host.clientWidth/252),Math.floor(this.host.clientHeight/196)));
        const title=this.text('gui.advancements'),done=this.text('gui.done'),tc=scaledCanvas(this.title,Math.max(1,font.width(title)),9,this.scale),dc=scaledCanvas(this.doneCanvas,200,20,this.scale);
        const nav=this.ui.host.querySelector('.world-navigation')?.getBoundingClientRect(),top=Math.max(12*this.scale,nav?nav.bottom-this.host.getBoundingClientRect().top+6:0);
        tc.clearRect(0,0,font.width(title),9);font.draw(tc,title,0,0,'#FFF',true);this.title.style.cssText=`width:${font.width(title)*this.scale}px;height:${9*this.scale}px;top:${top}px`;
        this.sprite(dc,'sprites/widget/button'+(this.doneHovered?'_highlighted':''),0,0,200,20);font.draw(dc,done,100-font.width(done)/2,6,'#FFF',true);this.done.setAttribute('aria-label',done);this.done.style.cssText=`width:${200*this.scale}px;height:${20*this.scale}px;bottom:${7*this.scale}px`;
        const c=scaledCanvas(this.canvas,252,196,this.scale);c.clearRect(0,0,252,196);
        this.canvas.style.width=252*this.scale+'px';this.canvas.style.height=196*this.scale+'px';this.controls.style.width=252*this.scale+'px';this.controls.style.height=196*this.scale+'px';
        if(rebuild)this.controls.replaceChildren();
        c.save();c.translate(0,28);c.save();c.beginPath();c.rect(9,18,234,113);c.clip();c.fillStyle='#000';c.fillRect(9,18,234,113);
        if(this.selected){
            const positions=this.positions(this.selected),xs=[...positions.values()].map(v=>v.x),ys=[...positions.values()].map(v=>v.y);
            if(!this.scroll.has(this.selected))this.scroll.set(this.selected,{x:117-(Math.min(...xs)+Math.max(...xs)+28)/2,y:56-(Math.min(...ys)+Math.max(...ys)+27)/2});
            const offset=this.scroll.get(this.selected)!,background=ADVANCEMENTS[this.selected].display.background!.split(':')[1].replace('gui/',''),tile=this.image(background);
            for(let x=9+Math.floor(offset.x)%16-16;x<243;x+=16)for(let y=18+Math.floor(offset.y)%16-16;y<131;y+=16)c.drawImage(tile,x,y,16,16);
            for(const lineWidth of [3,1]){c.strokeStyle=lineWidth===3?'#000':'#FFF';c.lineWidth=lineWidth;
                for(const [id,p] of positions){const parent=ADVANCEMENTS[id].parent,q=parent?positions.get(parent):null;if(!q||!visible.has(id))continue;
                    const x=9+Math.floor(offset.x)+p.x+13,y=18+Math.floor(offset.y+p.y)+13,X=9+Math.floor(offset.x)+q.x+13,Y=18+Math.floor(offset.y+q.y)+13;
                    c.beginPath();c.moveTo(X,Y);c.lineTo(X+14,Y);c.lineTo(X+14,y);c.lineTo(x,y);c.stroke();}}
            for(const [id,p] of positions)if(visible.has(id)){
                const x=9+Math.floor(offset.x+p.x),y=18+Math.floor(offset.y+p.y),done=advancementDone(this.facts,id);
                this.sprite(c,'sprites/advancements/task_frame_'+(done?'obtained':'unobtained'),x,y,26,26);this.ui.stack(c,{id:ADVANCEMENTS[id].display.icon.id,count:1},x+5,y+5);
                if(rebuild&&x>=9&&x+26<=243&&y>=18&&y+26<=131)this.hit(id,x,y+28);
            }
        }else{const a=this.text('advancements.empty'),b=this.text('advancements.sad_label');font.draw(c,a,126-font.width(a)/2,68,'#FFF',true);font.draw(c,b,126-font.width(b)/2,86,'#FFF',true);}
        c.restore();c.drawImage(this.image('advancements/window'),0,0,252,140,0,0,252,140);font.draw(c,this.text(this.selected?ADVANCEMENTS[this.selected].display.title.translate:'gui.advancements'),8,6,'#404040',false);c.restore();
        if(roots.length>1)roots.forEach((id,i)=>{const x=i*32;this.sprite(c,'sprites/advancements/tab_above_'+(i===0?'left':'middle')+(id===this.selected?'_selected':''),x,0,28,32);this.ui.stack(c,{id:ADVANCEMENTS[id].display.icon.id,count:1},x+6,9);if(rebuild)this.hit(id,x,0,true);});
        if(this.hover&&visible.has(this.hover))this.tooltip(c,this.hover);
        this.modal.dataset.visible=JSON.stringify([...visible]);this.modal.dataset.selected=this.selected;
    }
    /** Draw native title and description boxes within the game viewport.
     * @param {CanvasRenderingContext2D} c Native screen target.
     * @param {string} id Hovered node.
     */
    tooltip(c:CanvasRenderingContext2D,id:string):void {
        const d=ADVANCEMENTS[id],font=this.ui.pixels.font,title=this.text(d.display.title.translate),lines=wrap(this.text(d.display.description.translate),180,s=>font.width(s)),w=Math.min(234,Math.max(80,font.width(title)+38,...lines.map(s=>font.width(s)+12))),h=lines.length*9+6,position=this.positions(this.selected).get(id),offset=this.scroll.get(this.selected)!;
        const nodeX=9+Math.floor(offset.x+(position?.x??0)),nodeY=46+Math.floor(offset.y+(position?.y??0)),flip=nodeX+w>243,x=Math.max(9,Math.min(243-w,flip?nodeX-w+32:nodeX)),y=Math.max(28,Math.min(142,nodeY)),above=y+26+h>159,top=above?y-h:y;
        this.sprite(c,'sprites/advancements/title_box',x,top,w,h+26);
        this.sprite(c,'sprites/advancements/box_'+(advancementDone(this.facts,id)?'obtained':'unobtained'),x,y,w,26);
        font.draw(c,title,x+(flip?5:32),y+9,'#FFF',true);lines.forEach((line,i)=>font.draw(c,line,x+5,(above?top+4:y+30)+i*9,'#55FF55',false));
        this.sprite(c,'sprites/advancements/task_frame_'+(advancementDone(this.facts,id)?'obtained':'unobtained'),nodeX,y,26,26);this.ui.stack(c,{id:d.display.icon.id,count:1},nodeX+5,y+5);
    }
    /** Queue native task notifications once per generation, after the save has published its facts.
     * @param {string[]} ids Newly completed original IDs.
     * @param {string} generation Source reset epoch.
     */
    notify(ids:string[],generation:string):void {
        if(this.disposed||generation!==this.generation||document.hidden)return;
        for(const id of ids)if(ADVANCEMENTS[id]?.display.show_toast!==false&&advancementDone(this.facts,id)&&!this.notified.has(id)){
            this.notified.add(id);const canvas=document.createElement('canvas'),clock=new RecipeToastClock();canvas.className='advancement-toast';canvas.setAttribute('role','status');canvas.setAttribute('aria-label',this.text('advancements.toast.task')+' '+this.text(ADVANCEMENTS[id].display.title.translate));canvas.dataset.advancement=id;canvas.hidden=true;this.host.append(canvas);clock.add([id],performance.now());this.tasks.push({id,canvas,clock});
        }
        this.animate();
    }
    /** Repaint five native rows and leave excess notifications queued without advancing their clocks. */
    animate():void {
        if(this.frame||this.disposed||!this.tasks.length)return;
        this.frame=requestAnimationFrame(()=>{this.frame=0;
            for(const task of [...this.tasks]){
                const row=this.slots.claim(task);if(row<0)continue;
                const sample=task.clock.sample(performance.now());if(sample.transition)this.sound(sample.transition==='show'?'ui.toast.in':'ui.toast.out');
                if(sample.phase==='done'){this.slots.release(task);task.canvas.remove();this.tasks.splice(this.tasks.indexOf(task),1);continue;}
                const scale=this.ui.scale,c=scaledCanvas(task.canvas,160,32,scale),font=this.ui.pixels.font,title=this.text(ADVANCEMENTS[task.id].display.title.translate),lines=wrap(title,125,s=>font.width(s)),time=sample.fullyVisibleFor;
                c.clearRect(0,0,160,32);c.drawImage(this.image('sprites/toast/advancement'),0,0);this.ui.stack(c,{id:ADVANCEMENTS[task.id].display.icon.id,count:1},8,8);
                if(lines.length===1){font.draw(c,this.text('advancements.toast.task'),30,7,'#FFFF00',false);font.draw(c,title,30,18,'#FFF',false);}
                else{c.save();c.globalAlpha=Math.min(1,Math.max(0,(time<1500?1500-time:time-1500)/300));if(time<1500)font.draw(c,this.text('advancements.toast.task'),30,11,'#FFFF00',false);else lines.forEach((line,i)=>font.draw(c,line,30,Math.floor(16-lines.length*9/2)+i*9,'#FFF',false));c.restore();}
                task.canvas.style.cssText=`width:${160*scale}px;height:${32*scale}px;top:${row*32*scale}px;transform:translateX(${160*scale*(1-sample.visible)}px)`;task.canvas.hidden=false;task.canvas.dataset.timeline=JSON.stringify(sample);
            }
            this.animate();
        });
    }
    /** Discard every old-generation queued or visible notification without playing exit sounds. */
    clearToasts():void {cancelAnimationFrame(this.frame);this.frame=0;for(const task of this.tasks){this.slots.release(task);task.clock.clear();task.canvas.remove();}this.tasks=[];}
    /** Release all screen and notification resources with the owning game page. */
    dispose():void {this.disposed=true;this.clearToasts();this.close();this.abort.abort();this.resize.disconnect();this.modal.remove();}
}
