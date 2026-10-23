/** VERIFICATION_ONLY: exercise formal loaders with wait barriers, HTTP failures and a historical manifest cache. */
import {mount} from '../web/src/app.ts';
import {LoadingScreen} from '../web/src/ui/loading-screen.ts';
import previousWorld from './fixtures/world-manifest-971a027.json' with {type: 'json'};
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
const params=new URLSearchParams(location.search),stage=params.get('stage')??'resources',failure=params.has('failure'),page=params.get('page')==='home'?'home':'game';
const original=globalThis.fetch.bind(globalThis),controls=document.createElement('aside'),release=document.createElement('button'),output=document.createElement('pre');
controls.id='startup-verification';controls.style.cssText='position:fixed;right:8px;bottom:8px;z-index:100;color:white;background:#171615';release.textContent='TEST ONLY: release loading';controls.append(release);document.body.append(controls);output.id='startup-evidence';output.hidden=true;document.body.append(output);
let resume:()=>void=()=>{},held=false,catalogues=0,staleHits=0;const barrier=new Promise<void>(r=>resume=r),records:any[]=[];
release.onclick=()=>{resume();release.disabled=true;};
/** Observe the actual mount's DOM, native sprite readiness and first world frame. @param {string} label Initialization checkpoint. */
function record(label:string):void{
 const root=document.getElementById('app')!,nav=root.querySelector<HTMLElement>('.world-navigation'),canvas=root.querySelector<HTMLCanvasElement>('#scene>canvas[role=img]');
 const surface=document.getElementById('native-loading');
 const value={label,loading:surface?{...surface.dataset}:null,boot:root.dataset.boot,caption:root.querySelector('.table-caption')?.textContent??null,status:root.querySelector('.save-status')?.textContent??null,copy:!!root.querySelector('.copy'),navVisible:!!nav&&!nav.hidden&&getComputedStyle(nav).visibility!=='hidden',nativeButtons:nav?[...nav.querySelectorAll('button')].every(b=>!!b.querySelector('.button-sprite')):false,worldVisible:!!canvas&&getComputedStyle(canvas).visibility!=='hidden',frames:Number(canvas?.dataset.frames??0),inventory:root.dataset.inventoryReady??null,chatReady:root.querySelector('#scene')?.getAttribute('data-chat-ready'),error:root.querySelector<HTMLElement>('.startup-error')?.hidden===false?root.querySelector('.startup-error')?.textContent:null};
 const previous=records.at(-1);
 if(label==='pending-mutation'&&previous&&Object.entries(value).every(([key,v])=>key==='label'||key==='frames'||previous[key]===v))return;
 records.push(value);output.textContent=JSON.stringify({stage,failure,page,records});
}
globalThis.fetch=async(input,init)=>{const url=new URL(String(input),location.href),path=url.pathname;
 if(params.has('stale-world')&&path.endsWith('/minecraft/26.3/world-manifest.json')&&(!url.searchParams.has('build')||params.has('legacy-request'))){staleHits++;return Response.json(previousWorld);}
 if(path.endsWith('/minecraft/26.3/catalogue-manifest.json'))catalogues++;const match=stage==='resources'?path.endsWith('/minecraft/26.3/manifest.json'):stage==='icons'?path.endsWith('/minecraft/26.3/catalogue-manifest.json')&&catalogues===2:stage==='rules'&&path.endsWith('/rules/minecraft/26.3/manifest.json');if(!held&&match){held=true;record('held');await barrier;if(failure)return new Response('',{status:503});}return original(input,init);};
const watcher=new MutationObserver(()=>{if(held&&release.disabled===false)record('pending-mutation');});watcher.observe(document.getElementById('app')!,{subtree:true,childList:true,attributes:true,attributeFilter:['data-boot','hidden']});
const loading=page==='game'?new LoadingScreen(document.getElementById('native-loading')!):null;
if(loading){await loading.initialize();loading.update('code',1);}else document.getElementById('native-loading')?.remove();
const animationSamples:object[]=[];const sampler=setInterval(()=>{if(loading&&!loading.progress.ended){if(animationSamples.length>=160)animationSamples.splice(8,1);animationSamples.push({time:performance.now(),spin:loading.progress.spin,target:loading.progress.target,smoothed:loading.progress.smoothed,frames:loading.frames,error:loading.error});output.dataset.animation=JSON.stringify(animationSamples.slice(-80));}},250);
await mount(page,{},loading??undefined);clearInterval(sampler);const cleanup=loading?{ended:loading.progress.ended,target:loading.progress.target,stages:Object.fromEntries(loading.progress.values),images:loading.images.size,scene:loading.scene.children.length,memory:loading.renderer?.info.memory,frames:loading.frames}:null;globalThis.fetch=original;watcher.disconnect();record('settled');
const final=records.at(-1),pending=records.filter(r=>r.boot==='loading');
const assertions=page==='home'?{homeCopyRetained:final.copy,homeCaptionRetained:final.caption!==null}:{realWorkCompleted:failure||cleanup?.target===1,releasedGpuAfterReady:failure||!!cleanup?.ended&&cleanup.images===0&&cleanup.scene===0&&cleanup.memory?.textures===0&&cleanup.memory?.geometries===0,loadingRetiredOrFailed:failure?final.loading?.loading==='failed':final.loading===null,noGameCaptions:records.every(r=>r.caption===null&&r.status===null&&!r.copy),pendingNeverShowsNavigation:pending.every(r=>!r.navVisible),pendingNeverShowsWorld:pending.every(r=>!r.worldVisible),settled:failure?final.boot==='failed'&&!!final.error&&!final.navVisible:final.boot==='ready'&&final.nativeButtons&&final.navVisible&&final.worldVisible&&final.frames>0&&final.inventory==='true'};
output.textContent=JSON.stringify({stage,failure,page,staleHits,resourceError:document.getElementById('app')!.dataset.resourceError??null,cleanup,animationSamples,records,assertions,passed:Object.values(assertions).every(Boolean)});output.dataset.result=Object.values(assertions).every(Boolean)?'passed':'failed';
