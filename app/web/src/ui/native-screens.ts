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
/** Arrange option categories in native two-column rows, retaining one column only below the readable width.
 * @param {number} width Logical viewport width.
 * @param {number} count Visible option-category count.
 * @return {object} Nonoverlapping logical widget bounds.
 */
export function optionFlow(width:number,count:number){const columns=width>=310?2:1,buttonWidth=Math.min(columns===2?150:200,columns===2?Math.floor((width-24)/2):width-16),groupWidth=columns*buttonWidth+(columns-1)*8,warningY=67+Math.ceil(count/columns)*24;return{columns,buttonWidth,groupWidth,warningY,resetY:warningY};}
/** Reproduce LanguageSelectionList rows and the centered 37-pixel content of its 53-pixel footer.
 * @param {number} width Logical screen width.
 * @param {number} height Logical screen height.
 * @return {object} Native list and footer anchors.
 */
export function languageLayout(width:number,height:number){const rowWidth=Math.min(270,width-16);return{rowWidth,rowLeft:(width-rowWidth)/2,rowHeight:18,listTop:36,firstRow:2,textTop:5,warningY:height-45,doneY:height-28};}
export interface ScreenControls {title:HTMLElement;navigation:HTMLElement;sections:Map<string,HTMLElement>;volume:HTMLInputElement;volumeLabel:HTMLElement;languageLabel:HTMLElement;language:HTMLSelectElement;username:HTMLInputElement;usernameLabel:HTMLElement;warning:HTMLElement;reset:HTMLButtonElement;confirmation:HTMLElement;feedback:HTMLElement[];done:HTMLButtonElement}
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
    /** Place and synchronously measure wrapped bitmap text in logical screen units.
     * @param {HTMLElement} element Existing localized text owner.
     * @param {number} x Logical left.
     * @param {number} y Logical top.
     * @param {number} width Available logical width.
     * @return {number} Actual line height for the next text block.
     */
    placeText(element:HTMLElement,x:number,y:number,width:number):number{this.place(element,x,y,width,12);this.pixels.updates.get(element)?.();const value=this.pixels.texts.get(element),canvas=element.querySelector('canvas'),height=Math.max(12,Number(canvas?.dataset.logicalHeight??canvas?.height??12)*(value?.scale??2)/2);this.place(element,x,y,width,height);return height;}
    /** Render native section textures and aligned full-span or left-column controls within the viewport. */
    layout():void{
        for (const element of this.plane.querySelectorAll<HTMLElement>('.pixel-text:not(.mc-button)')) {const value=this.pixels.texts.get(element); if(value) this.pixels.text(element,value.text,value.scale,'#FFFFFF');}
        const width=this.viewport.clientWidth,height=this.viewport.clientHeight;if(!width||!height)return;
        const scale=nativeScale(this.viewport),w=Math.ceil(width/scale),h=Math.ceil(height/scale),page=this.page(),layout=menuLayout(w,h,page),u=this.controls,narrow=w<310,wide=Math.min(310,w-16),flow=optionFlow(w,u?.navigation.querySelectorAll('button').length??0),pw=Math.min(200,w-16);
        this.dialog.dataset.nativePage=page;this.dialog.dataset.layout=JSON.stringify({...layout,scale});
        this.plane.style.cssText=`width:${w*2}px;height:${h*2}px;transform:scale(${scale/2});transform-origin:top left`;
        const dpr=Math.min(devicePixelRatio||1,4),canvas=this.background;canvas.width=Math.ceil(w*scale*dpr);canvas.height=Math.ceil(h*scale*dpr);const c=canvas.getContext('2d')!;c.setTransform(scale*dpr,0,0,scale*dpr,0,0);c.imageSmoothingEnabled=false;
        const background=this.pixels.resources.guiImages.get('assets/minecraft/textures/gui/inworld_menu_background.png');
        if(background){const pattern=c.createPattern(background,'repeat')!;pattern.setTransform(new DOMMatrix().scale(2));c.fillStyle=pattern;c.fillRect(0,0,w,h);}
        if(page==='pause'){
            const title=this.plane.querySelector('h2')!,buttons=[...this.plane.querySelectorAll('button')];this.place(title,0,40,w,9);
            const groupWidth=Math.min(204,w-16),left=(w-groupWidth)/2,columnWidth=(groupWidth-8)/2,
                gridHeight=50+44,
                top=Math.max(layout.titleY+14,Math.floor((h-gridHeight)*.25)+50);
            buttons.forEach((b,i)=>{this.place(b,left+(i===1?columnWidth+8:0),top+(i<2?0:24),i<2?columnWidth:groupWidth);this.pixels.refreshButton(b);});return;
        }
        if (['language','sound','player','weather'].includes(page)) {
            const image=this.pixels.resources.guiImages.get('assets/minecraft/textures/gui/inworld_menu_list_background.png');
            if(image){const pattern=c.createPattern(image,'repeat')!;pattern.setTransform(new DOMMatrix().scale(2));c.fillStyle=pattern;c.fillRect(0,layout.header,w,h-layout.header-layout.footer);}
            for(const [name,y] of [['header_separator',layout.header-2],['footer_separator',h-layout.footer]] as const){const image=this.pixels.resources.guiImages.get('assets/minecraft/textures/gui/inworld_'+name+'.png');if(image){const pattern=c.createPattern(image,'repeat');c.save();c.translate(0,y);c.fillStyle=pattern!;c.fillRect(0,0,w,2);c.restore();}}
        }
        if(!u)return;this.place(u.title,0,layout.titleY,w,9);this.place(u.done,(w-pw)/2,layout.footerY,pw);
        this.place(u.navigation,0,0,w,h);[...u.navigation.querySelectorAll('button')].forEach((b,i)=>this.place(b,(w-(flow.columns*flow.buttonWidth+(flow.columns-1)*8))/2+(i%flow.columns)*(flow.buttonWidth+8),67+Math.floor(i/flow.columns)*24,flow.buttonWidth));
        for(const section of u.sections.values())this.place(section,0,0,w,h);
        this.place(u.volumeLabel,0,0,0,0);u.volumeLabel.classList.add('sr-only');
        this.place(u.sections.get('sound')!,0,layout.header,w,h-layout.header-layout.footer);
        const slider=u.volume.parentElement!;this.place(slider,(w-flow.groupWidth)/2,4,flow.groupWidth);
        const channelSliders=[...u.sections.get('sound')!.querySelectorAll<HTMLInputElement>('input[type=range]')].filter(input=>input!==u.volume);
        channelSliders.forEach((input,i)=>this.place(input.parentElement!,narrow?(w-flow.groupWidth)/2:(w-flow.groupWidth)/2+(i%2)*(flow.buttonWidth+8),28+Math.floor(i/(narrow?1:2))*24,narrow?flow.groupWidth:flow.buttonWidth));
        u.languageLabel.classList.add('sr-only');
        const language=languageLayout(w,h),list=u.sections.get('language')!.querySelector<HTMLElement>('[role=listbox]');
        if(list){this.place(list,language.rowLeft,language.listTop,language.rowWidth,h-language.listTop-layout.footer);list.style.paddingTop=language.firstRow*2+'px';}
        const search=u.sections.get('language')!.querySelector<HTMLInputElement>('.language-search');
        if(search)this.place(search.parentElement!, (w-pw)/2,17,pw,15);
        const accuracy=u.sections.get('language')!.querySelector<HTMLElement>('.language-accuracy');
        if(accuracy){this.place(accuracy,0,language.warningY,w,9);this.pixels.text(accuracy,this.pixels.texts.get(accuracy)?.text??'',2,'#BABABA');}
        if(page==='language')this.place(u.done,(w-pw)/2,language.doneY,pw);
        this.place(u.usernameLabel,(w-pw)/2,layout.contentY,pw,9);this.place(u.username.parentElement!,(w-pw)/2,layout.contentY+12,pw);
        [...u.sections.get('player')!.querySelectorAll('button')].forEach((b,i)=>this.place(b,narrow?(w-pw)/2:(w-flow.groupWidth)/2+i*(flow.buttonWidth+8),layout.contentY+40+(narrow?i*24:0),narrow?pw:flow.buttonWidth));
        const weather=u.sections.get('weather');
        if(weather){
            [...weather.querySelectorAll<HTMLElement>('button')].forEach((b,i)=>this.place(b,narrow?(w-flow.groupWidth)/2:(w-flow.groupWidth)/2+i*(flow.buttonWidth+8),layout.contentY+(narrow?i*24:0),narrow?flow.groupWidth:flow.buttonWidth));
            const credit=weather.querySelector<HTMLElement>('.weather-attribution');
            if(credit)this.place(credit,Math.max(4,w-70),h-13,66,9);
        }
        this.place(u.warning,(w-wide)/2,flow.warningY,wide,narrow?36:24);this.place(u.reset,(w-flow.groupWidth)/2,flow.resetY,flow.groupWidth);
        this.place(u.confirmation,(w-wide)/2,Math.min(105,h-120),wide,95);
        u.feedback.forEach((f,i)=>this.place(f,(w-wide)/2,h-layout.footer-(page==='weather'?12:28)-i*18,wide,page==='weather'?12:18));
        this.dialog.dataset.confirming=String(page==='options'&&!u.confirmation.hidden);
        if(page==='options'&&!u.confirmation.hidden){
            this.place(u.confirmation,0,0,w,h);
            const title=u.confirmation.querySelector<HTMLElement>('h3')!,note=u.confirmation.querySelector<HTMLElement>('p')!,y=Math.max(20,Math.floor(h/2)-50);
            this.placeText(title,(w-wide)/2,y,wide);const textHeight=this.placeText(note,(w-wide)/2,y+20,wide);
            [...u.confirmation.querySelectorAll<HTMLElement>('button')].forEach((b,i)=>this.place(b,narrow?(w-pw)/2:(w-flow.groupWidth)/2+i*(flow.buttonWidth+8),y+28+textHeight+(narrow?i*24:0),narrow?pw:flow.buttonWidth));
        }
        this.dialog.querySelectorAll<HTMLElement>('.mc-button').forEach(b=>this.pixels.refreshButton(b));
        this.plane.querySelectorAll<HTMLElement>('.pixel-text:not(.mc-button)').forEach(element=>this.pixels.updates.get(element)?.());
        this.dialog.querySelectorAll<HTMLInputElement>('.native-text-field>input,.native-slider>input').forEach(input=>this.pixels.updates.get(input)?.());
    }
    /** Disconnect dimension and page observers when the document ends. */
    dispose():void{this.observer.disconnect();this.mutation.disconnect();}
}
