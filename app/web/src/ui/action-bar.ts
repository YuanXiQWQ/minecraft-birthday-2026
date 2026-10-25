/** Native lower-center transient feedback is independent of chat history and its allowlist. */
import type {PixelUI} from './pixels.ts';
import {nativeScale} from './chat.ts';

/** Bed use failures delivered by AbstractBedBlock through Player.sendOverlayMessage. */
const BED_MESSAGES=new Set(['bed.noSleep','bed.tooFar','bed.obstructed','bed.occupied','bed.incomplete']);
/** Hud.setOverlayMessage retains text for sixty client ticks and fades over the last twenty. */
const LIFETIME_MS=3000,FADE_MS=1000;

/** Select bed feedback before automatic-chat filtering.
 * @param {string} key Localized event identity.
 * @return {boolean} Whether the native action bar owns this notification.
 */
export function actionBarMessage(key:string):boolean{return BED_MESSAGES.has(key);}

/** Calculate the native overlay's final twenty-tick fade.
 * @param {number} elapsed Milliseconds since the latest message.
 * @return {number} Opacity between zero and one.
 */
export function actionBarOpacity(elapsed:number):number{return Math.min(1,Math.max(0,(LIFETIME_MS-elapsed)/FADE_MS));}

/** Own one replaceable bitmap message above the hotbar, scoped to the current save and scene. */
export class ActionBar {
    root=document.createElement('div');
    canvas=document.createElement('canvas');
    accessible=document.createElement('span');
    key='';scope='';started=0;frame=0;disposed=false;signature='';

    /** Attach an accessible native-font overlay without taking input ownership.
     * @param {HTMLElement} host Game viewport.
     * @param {PixelUI} pixels Loaded original bitmap font.
     * @param {Function} text Current locale lookup.
     */
    constructor(public host:HTMLElement,public pixels:PixelUI,public text:(key:string)=>string){
        this.root.className='action-bar';this.root.hidden=true;this.root.setAttribute('role','status');this.root.setAttribute('aria-live','polite');
        this.canvas.setAttribute('aria-hidden','true');this.accessible.className='sr-only';this.root.append(this.accessible,this.canvas);host.append(this.root);
    }

    /** Discard messages when a save generation or scene changes, and refresh active localized text.
     * @param {string} scope Current save generation and scene.
     */
    sync(scope:string):void{if(scope!==this.scope){this.scope=scope;this.clear();}else if(this.key)this.paint(performance.now());}

    /** Replace the current notification and restart its full native lifetime, including identical repeats.
     * @param {string} key Localized message identity.
     */
    show(key:string):void{if(this.disposed)return;this.key=key;this.started=performance.now();this.signature='';cancelAnimationFrame(this.frame);this.paint(this.started);this.frame=requestAnimationFrame(now=>this.animate(now));}

    /** Advance only the active message's opacity and geometry.
     * @param {number} now Browser animation timestamp.
     */
    animate(now:number):void{this.paint(now);if(this.key&&!this.disposed)this.frame=requestAnimationFrame(time=>this.animate(time));}

    /** Rasterize white shadowed text at Hud.extractOverlayMessage's centered height minus 72 GUI pixels.
     * @param {number} now Browser animation timestamp.
     */
    paint(now:number):void{
        if(!this.key||this.disposed)return;
        const alpha=actionBarOpacity(now-this.started);if(!alpha){this.clear();return;}
        const text=this.text(this.key),scale=nativeScale(this.host),density=Math.max(1,scale*(globalThis.devicePixelRatio??1)),width=this.pixels.font.width(text)+1;
        this.root.hidden=false;this.root.style.opacity=String(alpha);this.root.style.top=`${this.host.clientHeight-72*scale}px`;
        const signature=JSON.stringify([text,scale,density]);if(signature===this.signature)return;this.signature=signature;
        this.accessible.textContent=text;this.root.dataset.message=this.key;
        this.canvas.width=Math.ceil(width*density);this.canvas.height=Math.ceil(12*density);this.canvas.style.width=width*scale+'px';this.canvas.style.height=12*scale+'px';
        const c=this.canvas.getContext('2d')!;c.setTransform(density,0,0,density,0,0);c.imageSmoothingEnabled=false;this.pixels.font.draw(c,text,0,0,'#FFFFFF',true);
    }

    /** Clear pending frames and presentation without retaining a chat-history entry. */
    clear():void{cancelAnimationFrame(this.frame);this.frame=0;this.key='';this.signature='';this.root.hidden=true;this.accessible.textContent='';delete this.root.dataset.message;}

    /** Release the overlay and its animation callback. */
    dispose():void{this.disposed=true;this.clear();this.root.remove();}
}
