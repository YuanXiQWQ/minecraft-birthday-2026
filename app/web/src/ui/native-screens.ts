/** Native menu pages use HeaderAndFooterLayout coordinates and existing semantic settings controls. */
import type {PixelUI} from './pixels.ts';
import {nativeScale} from './chat.ts';
/** Compute native header/list/footer boundaries without depending on CSS card widths.
 * @param {number} width Logical screen width.
 * @param {number} height Logical screen height.
 * @param {string} page Native supported page identity.
 * @return {object} Native screen anchors.
 */
export function menuLayout(width:number,height:number,page:string){const header=page==='language'?36:page==='options'?61:33,footer=page==='language'?53:33;return{width,height,header,footer,titleY:page==='pause'?40:page==='language'?4:Math.floor((header-9)/2),contentY:header+4,footerY:height-footer+Math.floor((footer-20)/2)};}
export interface ScreenControls {title:HTMLElement;navigation:HTMLElement;sections:Map<string,HTMLElement>;volume:HTMLInputElement;volumeLabel:HTMLElement;mute:HTMLButtonElement;languageLabel:HTMLElement;language:HTMLSelectElement;username:HTMLInputElement;usernameLabel:HTMLElement;warning:HTMLElement;reset:HTMLButtonElement;confirmation:HTMLElement;feedback:HTMLElement[];done:HTMLButtonElement}
/** Position one supported native screen; transaction callbacks remain owned by app/settings. */
export class NativeScreens {
    observer:ResizeObserver;
    mutation:MutationObserver;
    plane:HTMLDivElement;
    background:HTMLCanvasElement;
    /** Wrap existing controls in a logical-pixel screen without duplicating preference state.
     * @param {HTMLDialogElement} dialog Existing screen/input owner.
     * @param {HTMLElement} viewport Bounded drawing viewport.
     * @param {PixelUI} pixels Native renderer.
     * @param {Function} page Current navigation page.
     * @param {ScreenControls|null} controls Null for the limited pause screen.
     */
    constructor(public dialog:HTMLDialogElement,public viewport:HTMLElement,public pixels:PixelUI,public page:()=>string,public controls:ScreenControls|null){
        this.plane=document.createElement('div');this.plane.className='native-screen-plane';this.plane.append(...dialog.childNodes);
        this.background=document.createElement('canvas');this.background.className='native-screen-background';this.background.setAttribute('aria-hidden','true');dialog.replaceChildren(this.background,this.plane);dialog.classList.add('native-screen');
        this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(viewport);
        this.mutation=new MutationObserver(()=>this.layout());this.mutation.observe(dialog,{subtree:true,attributes:true,attributeFilter:['hidden','open']});this.layout();
    }
    /** Place an existing widget at native bounds in the plane's two-pixel drawing units.
     * @param {HTMLElement} element Semantic control.
     * @param {number} x Left logical coordinate.
     * @param {number} y Top logical coordinate.
     * @param {number} w Logical width.
     * @param {number} h Logical height.
     */
    place(element:HTMLElement,x:number,y:number,w:number,h=20):void{element.style.cssText=`position:absolute;left:${x*2}px;top:${y*2}px;width:${w*2}px;height:${h*2}px;min-width:0;min-height:0;margin:0;padding:0`;}
    /** Render the native section textures, header separators, title and supported widget grid. */
    layout():void{
        for (const element of this.plane.querySelectorAll<HTMLElement>('.pixel-text:not(.mc-button)')) {const value=this.pixels.texts.get(element); if(value) this.pixels.text(element,value.text,value.scale,'#FFFFFF');}
        const width=this.viewport.clientWidth,height=this.viewport.clientHeight;if(!width||!height)return;
        const scale=nativeScale(this.viewport),w=Math.ceil(width/scale),h=Math.ceil(height/scale),page=this.page(),layout=menuLayout(w,h,page),u=this.controls,narrow=w<310,wide=Math.min(310,w-16);
        this.dialog.dataset.nativePage=page;this.dialog.dataset.layout=JSON.stringify({...layout,scale});
        this.plane.style.cssText=`width:${w*2}px;height:${h*2}px;transform:scale(${scale/2});transform-origin:top left`;
        const dpr=Math.min(devicePixelRatio||1,4),canvas=this.background;canvas.width=Math.ceil(w*scale*dpr);canvas.height=Math.ceil(h*scale*dpr);const c=canvas.getContext('2d')!;c.setTransform(scale*dpr,0,0,scale*dpr,0,0);c.imageSmoothingEnabled=false;
        const background=this.pixels.resources.guiImages.get('assets/minecraft/textures/gui/inworld_menu_background.png');
        if(background){const pattern=c.createPattern(background,'repeat')!;pattern.setTransform(new DOMMatrix().scale(2));c.fillStyle=pattern;c.fillRect(0,0,w,h);}
        if(page==='pause'){
            const title=this.plane.querySelector('h2')!,buttons=[...this.plane.querySelectorAll('button')];this.place(title,0,40,w,9);
            const gridHeight=buttons.length*24,top=Math.floor((h-gridHeight)*.25)+4;
            buttons.forEach((b,i)=>this.place(b,(w-204)/2,top+i*24,204));return;
        }
        if (page === 'language' || page === 'sound') {
            const image=this.pixels.resources.guiImages.get('assets/minecraft/textures/gui/inworld_menu_list_background.png');
            if(image){const pattern=c.createPattern(image,'repeat')!;pattern.setTransform(new DOMMatrix().scale(2));c.fillStyle=pattern;c.fillRect(0,layout.header,w,h-layout.header-layout.footer);}
            for(const [name,y] of [['header_separator',layout.header-2],['footer_separator',h-layout.footer]] as const){const image=this.pixels.resources.guiImages.get('assets/minecraft/textures/gui/inworld_'+name+'.png');if(image){const pattern=c.createPattern(image,'repeat');c.save();c.translate(0,y);c.fillStyle=pattern!;c.fillRect(0,0,w,2);c.restore();}}
        }
        if(!u)return;this.place(u.title,0,layout.titleY,w,9);this.place(u.done,(w-200)/2,layout.footerY,200);
        this.place(u.navigation,0,0,w,h);[...u.navigation.querySelectorAll('button')].forEach((b,i)=>this.place(b,narrow?(w-200)/2:w/2-154+(i%2)*158,91+(narrow?i:Math.floor(i/2))*24,narrow?200:150));
        for(const section of u.sections.values())this.place(section,0,0,w,h);
        this.place(u.volumeLabel,0,0,0,0);u.volumeLabel.classList.add('sr-only');
        const slider=u.volume.parentElement!;this.place(slider,(w-wide)/2,layout.contentY,wide);
        this.place(u.mute,narrow?(w-200)/2:w/2-154,layout.contentY+24,narrow?200:150);
        u.languageLabel.classList.add('sr-only');
        const list=u.sections.get('language')!.querySelector<HTMLElement>('[role=listbox]');
        if(list){this.place(list,(w-Math.min(308,w-16))/2,layout.header+4,Math.min(308,w-16),h-layout.header-layout.footer-8);}
        const search=u.sections.get('language')!.querySelector<HTMLInputElement>('.language-search');
        if(search)this.place(search.parentElement!, (w-200)/2,17,200,15);
        this.place(u.usernameLabel,(w-200)/2,layout.contentY,200,9);this.place(u.username.parentElement!,(w-200)/2,layout.contentY+12,200);
        [...u.sections.get('player')!.querySelectorAll('button')].forEach((b,i)=>this.place(b,narrow?(w-200)/2:w/2-154+i*158,layout.contentY+40+(narrow?i*24:0),narrow?200:150));
        this.place(u.warning,(w-wide)/2,narrow?169:145,wide,narrow?36:24);this.place(u.reset,(w-200)/2,narrow?209:176,200);
        this.place(u.confirmation,(w-wide)/2,Math.min(105,h-120),wide,95);
        u.feedback.forEach((f,i)=>this.place(f,(w-wide)/2,h-layout.footer-28-i*18,wide,18));
        this.dialog.querySelectorAll<HTMLElement>('.mc-button').forEach(b=>this.pixels.updates.get(b)?.());
    }
    /** Disconnect dimension and page observers when the document ends. */
    dispose():void{this.observer.disconnect();this.mutation.disconnect();}
}
