/** P3_TEST_ONLY: bounded real-event recorder mounts the formal application; synthetic lifecycle checks are separately labeled. */
import {checkVisualPixels,checkHeldModels} from './visual-browser.ts';
import {GameInventory} from '../web/src/ui/inventory.ts';import type {CatalogueArt} from '../web/src/ui/icons.ts';
import {mount} from '../web/src/app.ts';import {SaveSession,SAVE_KEY} from '../web/src/persistence/session.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
/** Observe the actual final icon cache rather than independently rerasterizing GPU edges for pixel comparisons. */
let visualArt:CatalogueArt|undefined;const nativeDraw=GameInventory.prototype.draw;
/** Forward every production draw unchanged while retaining its read-only art reference for verification.
 * @param {Parameters<GameInventory['draw']>} args Original draw arguments.
 */
GameInventory.prototype.draw=function(...args){visualArt=this.art;return nativeDraw.apply(this,args);};
/** Verification-only receipt latch wraps the real transaction after it has committed. */
const receiptChannel=new BroadcastChannel('minecraft-birthday-2026:verify:craft-receipt'),receiptDelay:{phase:string;receipt?:unknown}={phase:'idle'};let visualChecks:unknown=null;let armed=false,releaseReceipt:(()=>void)|null=null;
receiptChannel.addEventListener('message',event=>{if(event.data==='held'){visualChecks={phase:'running-held'};void checkHeldModels().then(result=>visualChecks=result).catch(error=>visualChecks={error:String(error)});}if(event.data==='visual'){visualChecks={phase:'running'};void checkVisualPixels(visualArt).then(result=>visualChecks=result).catch(error=>visualChecks={error:String(error)});}if(event.data==='arm'){armed=true;receiptDelay.phase='armed';delete receiptDelay.receipt;}if(event.data==='release'){armed=false;releaseReceipt?.();releaseReceipt=null;}});
/** Retain the original class method instead of reimplementing any transaction. */
const nativeTake=SaveSession.prototype.takeCraft,nativeOutputTake=SaveSession.prototype.takeOutput;
/** Hold only the verification page's next successful receipt; normal app modules contain no delay.
 * @param {Parameters<SaveSession['takeCraft']>} args Actual acquisition arguments.
 * @return {ReturnType<SaveSession['takeCraft']>} Original committed receipt after explicit fixture release.
 */
SaveSession.prototype.takeCraft=async function(...args){const hold=armed;armed=false;try{const receipt=await nativeTake.apply(this,args);if(hold){receiptDelay.phase='waiting';receiptDelay.receipt={cursor:receipt.inventory.cursor,batches:receipt.batches};await new Promise<void>(resolve=>releaseReceipt=resolve);receiptDelay.phase='released';}return receipt;}catch(error){receiptDelay.phase='failed';throw error;}};
/** Delay only an actual committed device receipt on the isolated verification route.
 * @param {Parameters<SaveSession['takeOutput']>} args Original output acquisition.
 * @return {ReturnType<SaveSession['takeOutput']>} Actual receipt after explicit release.
 */
SaveSession.prototype.takeOutput=async function(...args){const hold=armed;armed=false;try{const receipt=await nativeOutputTake.apply(this,args);if(hold){receiptDelay.phase='waiting';receiptDelay.receipt={cursor:receipt.inventory.cursor,batches:receipt.batches};await new Promise<void>(resolve=>releaseReceipt=resolve);receiptDelay.phase='released';}return receipt;}catch(error){receiptDelay.phase='failed';throw error;}};
window.addEventListener('pagehide',()=>{releaseReceipt?.();receiptChannel.close();});
/** Count actual committed processing commands per document to observe real browser lease ownership. */
const processingEvidence={ticks:0,commits:0,rejected:0},nativeTransact=SaveSession.prototype.transact;
/** Forward real transactions unchanged and observe only successful tick ownership.
 * @param {Parameters<SaveSession['transact']>} args Original command and ownership guard.
 * @return {ReturnType<SaveSession['transact']>} Original transaction result.
 */
SaveSession.prototype.transact=async function(...args){try{const r=await nativeTransact.apply(this,args);if(args[0].type==='processing-tick'){processingEvidence.ticks+=args[0].ticks;processingEvidence.commits++;}return r;}catch(error){if(args[0].type==='processing-tick')processingEvidence.rejected++;throw error;}};
await mount('game');
/** Records remain on the isolated test origin and never enter the production bundle. */
const records:object[]=[],settingsSamples:object[]=[];let volumeGesture=false;const output=document.createElement('pre');output.id='input-evidence';output.hidden=true;document.body.append(output);
/** Project observable UI state and event records without modifying application state.
 * @return {object} Inspectable bounded evidence.
 */
function snapshot():object{const modal=document.querySelector<HTMLElement>('#inventory'),hud=document.querySelector<HTMLElement>('.hotbar'),canvas=document.querySelector<HTMLCanvasElement>('#scene>canvas');return{settingsSamples,settings:settingsSnapshot(),processingEvidence,visibility:document.visibilityState,time:performance.now(),visualChecks,receiptDelay,saved:JSON.parse(localStorage.getItem(SAVE_KEY)??'null'),environment:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio},modal:{open:modal?.hasAttribute('open'),...modal?.dataset},hud:hud?.dataset,look:canvas?.dataset.look??null,selection:document.querySelector('.selection')?.textContent,records};}
/** Observe actual controls and progress publications without dispatching synthetic input.
 * @return {object} Screen projection for comparison with durable preferences.
 */
function settingsSnapshot():object{return{open:document.querySelector<HTMLDialogElement>('#settings')?.open,volume:document.querySelector<HTMLInputElement>('#volume')?.value,label:document.querySelector('.volume-label')?.textContent,feedback:document.querySelector('#preference-feedback')?.textContent,resetFeedback:document.querySelector('#reset-feedback')?.textContent,confirmation:!document.querySelector<HTMLElement>('#reset-confirmation')?.hidden,revision:document.querySelector<HTMLElement>('#app')?.dataset.revision};}
/** Publish inspectable screen state and the bounded event history. */
function publish():void{output.textContent=JSON.stringify(snapshot());}
for(const type of ['input','change','pointerdown','pointerup','pointermove','pointercancel','lostpointercapture','keydown','keyup','contextmenu','wheel','blur','focus'])document.addEventListener(type,e=>{const p=e as PointerEvent,k=e as KeyboardEvent,w=e as WheelEvent,target=e.target instanceof HTMLElement?e.target:null;if(target?.id==='volume'&&type==='pointerdown')volumeGesture=true;if(type==='pointerup'||type==='pointercancel'||type==='blur'&&target?.id==='volume')volumeGesture=false;if(type==='pointermove'&&!p.buttons)return;const inputValue=target instanceof HTMLInputElement?target.value:undefined;setTimeout(()=>{records.push({type,trusted:e.isTrusted,time:performance.now(),target:target?.id||target?.className,inputValue,settings:settingsSnapshot(),slot:target?.dataset,button:p.button,buttons:p.buttons,x:p.clientX,y:p.clientY,code:k.code,ctrl:k.ctrlKey,shift:k.shiftKey,deltaY:w.deltaY,prevented:e.defaultPrevented});if(records.length>800)records.shift();publish();},0);},{capture:true});
/** Keep async save outcomes readable without injecting actions through browser evaluation. */
const timer=setInterval(()=>{if(volumeGesture){const saved=JSON.parse(localStorage.getItem(SAVE_KEY)??'null');settingsSamples.push({time:performance.now(),settings:settingsSnapshot(),savedSettings:saved?.state.settings,revision:saved?.revision});if(settingsSamples.length>200)settingsSamples.shift();}publish();},100);window.addEventListener('pagehide',()=>clearInterval(timer));
