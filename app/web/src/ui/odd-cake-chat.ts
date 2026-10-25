/** Author reactions follow visible cake challenge toasts and the owning document lifetime. */
import {ODD_ADVANCEMENT} from '../domain/easter-egg.ts';
import type {GameChat} from './chat.ts';

/** Deliver the author's reaction two seconds after a visible challenge notification.
 * @param {GameChat} chat Current chat destination.
 * @param {Function} text Lookup using the language at delivery.
 * @param {AbortSignal} signal Document cancellation boundary.
 * @param {Function} valid Whether the originating save generation is still current.
 * @return {Function} Cancel pending delivery.
 */
export function scheduleOddCakeRemark(chat:Pick<GameChat,'append'>,text:(key:string)=>string,signal:AbortSignal,valid:()=>boolean):()=>void{
    let timer:ReturnType<typeof setTimeout>;
    /** Release the pending timer and document listener. */
    function cancel():void{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
    if(!signal.aborted){signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{cancel();if(!signal.aborted&&valid())chat.append([{text:text('chat.oddCakeCrafted')}],'author');},2000);}
    return cancel;
}

/** Observe first visibility so queued toast rows cannot start the author's delay prematurely.
 * @param {HTMLElement} host Game viewport containing native toast canvases.
 * @param {GameChat} chat Current author channel.
 * @param {Function} text Current localization lookup.
 * @param {AbortSignal} signal Document lifetime.
 * @param {Function} generation Current committed reset generation.
 */
export function bindOddCakeRemarks(host:HTMLElement,chat:Pick<GameChat,'append'>,text:(key:string)=>string,signal:AbortSignal,generation:()=>string):void{
    const seen=new WeakSet<Element>();
    /** Schedule each actually shown toast once and fence delivery across resets or hidden pages. */
    function inspect():void{for(const toast of host.querySelectorAll<HTMLElement>('.advancement-toast'))if(toast.dataset.advancement===ODD_ADVANCEMENT&&!toast.hidden&&!seen.has(toast)){seen.add(toast);const owner=generation();scheduleOddCakeRemark(chat,text,signal,()=>!!owner&&generation()===owner&&!document.hidden);}}
    const observer=new MutationObserver(inspect);if(signal.aborted)return;
    observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});signal.addEventListener('abort',()=>observer.disconnect(),{once:true});inspect();
}
