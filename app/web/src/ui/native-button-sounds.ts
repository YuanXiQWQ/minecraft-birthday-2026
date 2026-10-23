/** Native button activations share the audited UI sound category without making inventory slots noisy. */
import type {WorldAudio} from '../render/world-audio.ts';

/** Own one delegated listener for existing mouse and keyboard button activations. */
export class NativeButtonSounds {
    abort=new AbortController();
    /** Bind supported native controls without intercepting their actions.
     * @param {HTMLElement} root Formal page owner.
     * @param {WorldAudio} audio Gesture-activated original sound owner.
     */
    constructor(public root:HTMLElement,public audio:WorldAudio){root.addEventListener('click',e=>{void this.click(e);},{capture:true,signal:this.abort.signal});}
    /** Schedule the native quarter-volume, unit-pitch UI click only for a real enabled button activation.
     * @param {MouseEvent} event Trusted click including keyboard-generated activation.
     * @return {Promise<void>} Current activation attempt.
     */
    async click(event:MouseEvent):Promise<void>{
        if(!event.isTrusted||!(event.target instanceof Element))return;
        const button=event.target.closest<HTMLElement>('button.mc-button,button.inventory-tab,button.recipe-book-toggle,button.recipe-book-hit,a.invite');
        if(!button||!this.root.contains(button)||button.hasAttribute('disabled')||button.getAttribute('aria-disabled')==='true')return;
        this.audio.activate();const owner=this.audio.epoch,context=this.audio.context;if(!context)return;
        try{await context.resume();if(!this.abort.signal.aborted&&owner===this.audio.epoch)await this.audio.play('ui.button.click',{volume:.25,pitch:1});}catch{}
    }
    /** Remove the listener and fence an activation waiting for audio unlock. */
    dispose():void{this.abort.abort();}
}
