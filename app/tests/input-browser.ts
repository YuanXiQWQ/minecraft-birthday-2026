/** P3_TEST_ONLY: bounded real-event recorder mounts the formal application; synthetic lifecycle checks are separately labeled. */
import {mount} from '../web/src/app.ts';import {SaveSession,SAVE_KEY} from '../web/src/persistence/session.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
/** Verification-only receipt latch wraps the real transaction after it has committed. */
const receiptChannel=new BroadcastChannel('minecraft-birthday-2026:verify:craft-receipt'),receiptDelay:{phase:string;receipt?:unknown}={phase:'idle'};let armed=false,releaseReceipt:(()=>void)|null=null;
receiptChannel.addEventListener('message',event=>{if(event.data==='arm'){armed=true;receiptDelay.phase='armed';delete receiptDelay.receipt;}if(event.data==='release'){armed=false;releaseReceipt?.();releaseReceipt=null;}});
/** Retain the original class method instead of reimplementing any transaction. */
const nativeTake=SaveSession.prototype.takeCraft;
/** Hold only the verification page's next successful receipt; normal app modules contain no delay.
 * @param {Parameters<SaveSession['takeCraft']>} args Actual acquisition arguments.
 * @return {ReturnType<SaveSession['takeCraft']>} Original committed receipt after explicit fixture release.
 */
SaveSession.prototype.takeCraft=async function(...args){const hold=armed;armed=false;try{const receipt=await nativeTake.apply(this,args);if(hold){receiptDelay.phase='waiting';receiptDelay.receipt={cursor:receipt.inventory.cursor,batches:receipt.batches};await new Promise<void>(resolve=>releaseReceipt=resolve);receiptDelay.phase='released';}return receipt;}catch(error){receiptDelay.phase='failed';throw error;}};
window.addEventListener('pagehide',()=>{releaseReceipt?.();receiptChannel.close();});
await mount('game');
/** Records remain on the isolated test origin and never enter the production bundle. */
const records:object[]=[],output=document.createElement('pre');output.id='input-evidence';output.hidden=true;document.body.append(output);
/** Project observable UI state and event records without modifying application state.
 * @return {object} Inspectable bounded evidence.
 */
function snapshot():object{const modal=document.querySelector<HTMLElement>('#inventory'),hud=document.querySelector<HTMLElement>('.hotbar'),canvas=document.querySelector<HTMLCanvasElement>('#scene>canvas');return{receiptDelay,saved:JSON.parse(localStorage.getItem(SAVE_KEY)??'null'),environment:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio},modal:{open:modal?.hasAttribute('open'),...modal?.dataset},hud:hud?.dataset,look:canvas?.dataset.look??null,selection:document.querySelector('.selection')?.textContent,records};}
/** Publish inspectable screen state and the bounded event history. */
function publish():void{output.textContent=JSON.stringify(snapshot());}
for(const type of ['pointerdown','pointerup','pointermove','pointercancel','lostpointercapture','keydown','keyup','contextmenu','wheel','blur','focus'])document.addEventListener(type,e=>{const p=e as PointerEvent,k=e as KeyboardEvent,w=e as WheelEvent,target=e.target instanceof HTMLElement?e.target:null;if(type==='pointermove'&&!p.buttons)return;setTimeout(()=>{records.push({type,trusted:e.isTrusted,time:performance.now(),target:target?.className,slot:target?.dataset,button:p.button,buttons:p.buttons,x:p.clientX,y:p.clientY,code:k.code,ctrl:k.ctrlKey,shift:k.shiftKey,deltaY:w.deltaY,prevented:e.defaultPrevented});if(records.length>800)records.shift();publish();},0);},{capture:true});
/** Keep async save outcomes readable without injecting actions through browser evaluation. */
const timer=setInterval(publish,100);window.addEventListener('pagehide',()=>clearInterval(timer));
