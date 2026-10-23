/** VERIFICATION_ONLY: native UI observation records actual canvas frames and production input outcomes without running in builds. */
import {mount} from '../web/src/app.ts';
import {browserSession} from '../web/src/persistence/browser.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
await mount('game');
const connection=browserSession();await connection.session.refresh();
const prepare=document.querySelector<HTMLButtonElement>('#prepare')!,observe=document.querySelector<HTMLButtonElement>('#observe')!,output=document.querySelector<HTMLElement>('#native-evidence')!;
/** Prepare a clearly labelled finite material sample through real save commands; all UI actions remain real browser input. */
prepare.onclick=async()=>{
    const s=connection.session;await s.refresh();await s.dispatch({type:'unlock',item:'minecraft:oak_log'});
    const receipt=await s.editInventory({type:'source',item:'minecraft:oak_log',mode:'clone'},null,s.view.envelope!.state.progress.player.data);
    await s.editInventory({type:'backpack-slot',index:0,button:0},receipt.cursor,s.view.envelope!.state.progress.player.data);prepare.dataset.done='true';
};
/** Observe bounded DOM/canvas animation outputs; this fixture cannot manufacture a native scale or toast phase. */
observe.onclick=()=>{
    const start=performance.now(),records:object[]=[],frames:object[]=[],seen=new Set<string>();let frame=0;
    /** Sample the actual production projection until the fixed observation window ends. */
    function sample():void{
        const toast=document.querySelector<HTMLCanvasElement>('.recipe-toast'),book=document.querySelector<HTMLCanvasElement>('.recipe-book>canvas'),chat=document.querySelector<HTMLElement>('.game-chat'),timeline=toast?.dataset.timeline?JSON.parse(toast.dataset.timeline):null,pulses=book?.dataset.pulses?JSON.parse(book.dataset.pulses):[];
        records.push({at:performance.now(),elapsed:performance.now()-start,toast:toast&&!toast.hidden?timeline:null,pulses,chat:chat?.dataset.layout,audio:document.querySelector('#scene')?.getAttribute('data-ui-audio'),effect:document.querySelector('#scene')?.getAttribute('data-effect'),tabs:[...document.querySelectorAll<HTMLElement>('[data-book-control^="tab:"]')].map(t=>({key:t.dataset.bookControl,scale:t.dataset.pulse}))});
        if(toast&&!toast.hidden&&timeline){const elapsed=timeline.at-timeline.started,bucket=Math.floor(elapsed/150),key='toast:'+bucket;if(!seen.has(key)&&bucket<43){seen.add(key);frames.push({kind:'toast',at:timeline.at,elapsed,timeline,png:toast.toDataURL()});}}
        if(book&&!book.parentElement?.hidden&&pulses.some((p:any)=>p.scale>1)){const started=Math.max(...pulses.map((p:any)=>p.started??-Infinity)),bucket=Math.floor((performance.now()-started)/100),key='pulse:'+started+':'+bucket;if(!seen.has(key)){seen.add(key);frames.push({kind:'pulse',at:performance.now(),pulses,png:book.toDataURL(),tabs:[...document.querySelectorAll<HTMLElement>('[data-book-control^="tab:"]')].map(t=>({key:t.dataset.bookControl,scale:t.dataset.pulse,png:t.querySelector('canvas')?.toDataURL()}))});}}
        if(performance.now()-start<12000)frame=requestAnimationFrame(sample);else{output.textContent=JSON.stringify({environment:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio},records,frames});observe.dataset.done='true';}
    }
    observe.dataset.done='false';frame=requestAnimationFrame(sample);
    window.addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
};
