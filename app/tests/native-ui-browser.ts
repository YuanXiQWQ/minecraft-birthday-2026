/** VERIFICATION_ONLY: native UI observation records actual canvas frames and production input outcomes without running in builds. */
import {RecipeBookView} from '../web/src/ui/recipe-book.ts';
import {BOOK_RECIPES} from '../web/src/domain/recipe-book.ts';
import {mount} from '../web/src/app.ts';
import {browserSession} from '../web/src/persistence/browser.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
/** Observe the actual mounted book without changing any notification implementation. */
let actualBook: RecipeBookView | null = null;
const nativeNotify=RecipeBookView.prototype.notify;
RecipeBookView.prototype.notify=function(...args){actualBook=this;return nativeNotify.apply(this,args);};
const nativeRender=RecipeBookView.prototype.render;
RecipeBookView.prototype.render=function(...args){actualBook=this;return nativeRender.apply(this,args);};
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

/** Add an explicitly isolated regression action, excluded from ordinary development and static builds.
 * @param {string} id Test identity.
 * @param {string} text Fixture action label.
 * @param {Function} run Native action or controlled lifetime experiment.
 */
function testAction(id:string,text:string,run:()=>void):void{const b=document.createElement('button');b.id=id;b.textContent=text;b.onclick=run;document.body.prepend(b);}
const regression=document.createElement('pre');regression.id='five-evidence';regression.hidden=true;regression.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';document.body.append(regression);
/** Prepare known recipes through real save commands; no effect enters an ordinary game build. */
testAction('five-prepare','TEST prepare known recipes',()=>{void(async()=>{for(const item of ['oak_log','oak_planks','stick'])await connection.session.dispatch({type:'unlock',item:'minecraft:'+item});regression.dataset.prepared='true';})();});
/** Run a real-time exit interruption and retain actual production pixels and audio scheduling. */
testAction('five-toast','TEST toast HIDE to SHOW',()=>{
    const book=actualBook;if(!book){regression.textContent='BLOCKED: prepare first';return;}
    const recipes=BOOK_RECIPES.filter(r=>book.ui.permanent!.progress.recipeBook.data.known.includes(r.id));
    if(recipes.length<2){regression.textContent='BLOCKED: two known recipes required';return;}
    book.clearToast();const start=performance.now(),frames:object[]=[],records:object[]=[],seen=new Set<number>();let added=false;
    book.notify([recipes[0].id]);regression.dataset.toastDone='false';
    /** Observe wall-time-driven native frames, including the discontinuity prescribed by ToastInstance.update. */
    function sample():void{
        const now=performance.now(),elapsed=now-start;
        if(!added&&elapsed>=5900){added=true;book!.notify([recipes[1].id]);}
        const timeline=book!.toast.dataset.timeline?JSON.parse(book!.toast.dataset.timeline):null;
        records.push({elapsed,hidden:book!.toast.hidden,timeline});
        const bucket=Math.floor(elapsed/50);
        if(!seen.has(bucket)&&!book!.toast.hidden&&(elapsed<700||elapsed>=5400&&elapsed<6800)){seen.add(bucket);frames.push({elapsed,timeline,png:book!.toast.toDataURL()});}
        if(elapsed<18000){requestAnimationFrame(sample);return;}
        regression.dataset.toastDone='true';regression.textContent=JSON.stringify({kind:'actual production notify/paint; controlled committed recipe IDs',environment:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},recipes:recipes.slice(0,2).map(r=>r.id),records,frames,audio:document.querySelector('#scene')?.getAttribute('data-ui-audio')});
    }
    requestAnimationFrame(sample);
});
/** Exercise actual WebGL context loss/restore; no direct graphics callbacks are invoked. */
testAction('five-graphics','TEST real context fault recovery fault',()=>{
    const canvas=document.querySelector<HTMLCanvasElement>('#scene>canvas[role=img]')!,gl=canvas.getContext('webgl2'),ext=gl?.getExtension('WEBGL_lose_context');
    if(!ext){regression.textContent='BLOCKED: WEBGL_lose_context unavailable';return;}
    let lost=0,restored=0;const events:object[]=[];
    /** Record actual context loss and ask the extension to recover once the driver permits it. */
    function onLost():void{events.push({event:'lost',at:performance.now()});lost++;setTimeout(()=>ext!.restoreContext(),700);}
    /** Repeat one real loss after recovery, then publish the production chat sequence. */
    function onRestored():void{events.push({event:'restored',at:performance.now()});restored++;if(restored===1)setTimeout(()=>ext!.loseContext(),700);else{canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);regression.dataset.graphicsDone='true';regression.textContent=JSON.stringify({events,lost,restored,chat:JSON.parse(document.querySelector<HTMLElement>('.game-chat')!.dataset.messages!),generation:connection.session.view.envelope?.generation});}}
    canvas.addEventListener('webglcontextlost',onLost);canvas.addEventListener('webglcontextrestored',onRestored);regression.dataset.graphicsDone='false';ext.loseContext();
});
/** Capture actual selected/unselected native tab pixels over a complete vertical pulse. */
testAction('five-tabs','TEST category continuous edge frames',()=>{
    const book=actualBook;if(!book||book.root.hidden){regression.textContent='BLOCKED: open recipe book first';return;}
    const start=performance.now(),frames:object[]=[],seen=new Set<number>();
    book.category='all';book.pulses.set('tab:all',start);book.pulses.set('tab:building',start);book.paint();book.animate();regression.dataset.tabsDone='false';
    /** Measure actual alpha bounds instead of inferring correctness from a scale field. */
    function sample():void{
        const elapsed=performance.now()-start,bucket=Math.floor(elapsed/25);
        if(!seen.has(bucket)){seen.add(bucket);frames.push({elapsed,tabs:['all','building'].map(category=>{
            const b=book!.controls.querySelector<HTMLElement>('[data-book-control="tab:'+category+'"]')!,c=b.querySelector('canvas')!,pixels=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let minY=c.height,maxY=-1;
            for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4+3]){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
            return{category,selected:category===book!.category,scale:Number(b.dataset.pulse),width:c.width,height:c.height,minY,maxY,style:c.getAttribute('style'),button:b.getBoundingClientRect().toJSON(),png:c.toDataURL()};
        })});}
        if(elapsed<850){requestAnimationFrame(sample);return;}
        regression.dataset.tabsDone='true';regression.textContent=JSON.stringify({environment:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:book!.ui.scale},frames});
    }
    requestAnimationFrame(sample);
});
