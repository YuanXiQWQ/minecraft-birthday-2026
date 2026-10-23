/** VERIFICATION_ONLY: delay real formal loaders without changing game state, resource bytes or production entry behavior. */
import {mount} from '../web/src/app.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
const params=new URLSearchParams(location.search),stage=params.get('stage')??'resources',failure=params.has('failure'),page=params.get('page')==='home'?'home':'game';
const original=globalThis.fetch.bind(globalThis),controls=document.createElement('aside'),release=document.createElement('button'),output=document.createElement('pre');
controls.id='startup-verification';controls.style.cssText='position:fixed;right:8px;bottom:8px;z-index:100;color:white;background:#171615';release.textContent='TEST ONLY: release loading';controls.append(release);document.body.append(controls);output.id='startup-evidence';output.hidden=true;document.body.append(output);
let resume:()=>void=()=>{},held=false,catalogues=0;const barrier=new Promise<void>(r=>resume=r),records:any[]=[];
release.onclick=()=>{resume();release.disabled=true;};
/** Observe the actual mount's DOM, native sprite readiness and first world frame. @param {string} label Initialization checkpoint. */
function record(label:string):void{
 const root=document.getElementById('app')!,nav=root.querySelector<HTMLElement>('.world-navigation'),canvas=root.querySelector<HTMLCanvasElement>('#scene>canvas[role=img]');
 const value={label,boot:root.dataset.boot,caption:root.querySelector('.table-caption')?.textContent??null,status:root.querySelector('.save-status')?.textContent??null,copy:!!root.querySelector('.copy'),navVisible:!!nav&&!nav.hidden&&getComputedStyle(nav).visibility!=='hidden',nativeButtons:nav?[...nav.querySelectorAll('button')].every(b=>!!b.querySelector('.button-sprite')):false,worldVisible:!!canvas&&getComputedStyle(canvas).visibility!=='hidden',frames:Number(canvas?.dataset.frames??0),inventory:root.dataset.inventoryReady??null,chatReady:root.querySelector('#scene')?.getAttribute('data-chat-ready'),error:root.querySelector<HTMLElement>('.startup-error')?.hidden===false?root.querySelector('.startup-error')?.textContent:null};
 const previous=records.at(-1);
 if(label==='pending-mutation'&&previous&&Object.entries(value).every(([key,v])=>key==='label'||key==='frames'||previous[key]===v))return;
 records.push(value);output.textContent=JSON.stringify({stage,failure,page,records});
}
globalThis.fetch=async(input,init)=>{const url=String(input);if(url.endsWith('/minecraft/26.3/catalogue-manifest.json'))catalogues++;const match=stage==='resources'?url.endsWith('/minecraft/26.3/manifest.json'):stage==='icons'?url.endsWith('/minecraft/26.3/catalogue-manifest.json')&&catalogues===2:url.endsWith('/rules/minecraft/26.3/manifest.json');if(!held&&match){held=true;record('held');await barrier;if(failure)return new Response('',{status:503});}return original(input,init);};
const watcher=new MutationObserver(()=>{if(held&&release.disabled===false)record('pending-mutation');});watcher.observe(document.getElementById('app')!,{subtree:true,childList:true,attributes:true,attributeFilter:['data-boot','hidden']});
await mount(page);globalThis.fetch=original;watcher.disconnect();record('settled');
const final=records.at(-1),pending=records.filter(r=>r.boot==='loading');
const assertions=page==='home'?{homeCopyRetained:final.copy,homeCaptionRetained:final.caption!==null}:{noGameCaptions:records.every(r=>r.caption===null&&r.status===null&&!r.copy),pendingNeverShowsNavigation:pending.every(r=>!r.navVisible),pendingNeverShowsWorld:pending.every(r=>!r.worldVisible),settled:failure?final.boot==='failed'&&!!final.error&&!final.navVisible:final.boot==='ready'&&final.nativeButtons&&final.navVisible&&final.worldVisible&&final.frames>0&&final.inventory==='true'};
output.textContent=JSON.stringify({stage,failure,page,records,assertions,passed:Object.values(assertions).every(Boolean)});output.dataset.result=Object.values(assertions).every(Boolean)?'passed':'failed';
