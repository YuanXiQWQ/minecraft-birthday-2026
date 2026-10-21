/** P3_TEST_ONLY: bounded real-event recorder mounts the formal application; synthetic lifecycle checks are separately labeled. */
import {mount} from '../web/src/app.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
await mount('game');
/** Records remain on the isolated test origin and never enter the production bundle. */
const records:object[]=[],output=document.createElement('pre');output.id='input-evidence';output.hidden=true;document.body.append(output);
/** Project observable UI state and event records without modifying application state.
 * @return {object} Inspectable bounded evidence.
 */
function snapshot():object{const modal=document.querySelector<HTMLElement>('#inventory'),hud=document.querySelector<HTMLElement>('.hotbar'),canvas=document.querySelector<HTMLCanvasElement>('#scene>canvas');return{environment:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio},modal:{open:modal?.hasAttribute('open'),...modal?.dataset},hud:hud?.dataset,look:canvas?.dataset.look??null,selection:document.querySelector('.selection')?.textContent,records};}
/** Publish inspectable screen state and the bounded event history. */
function publish():void{output.textContent=JSON.stringify(snapshot());}
for(const type of ['pointerdown','pointerup','pointermove','pointercancel','lostpointercapture','keydown','keyup','contextmenu','wheel','blur','focus'])document.addEventListener(type,e=>{const p=e as PointerEvent,k=e as KeyboardEvent,w=e as WheelEvent,target=e.target instanceof HTMLElement?e.target:null;if(type==='pointermove'&&!p.buttons)return;setTimeout(()=>{records.push({type,trusted:e.isTrusted,time:performance.now(),target:target?.className,slot:target?.dataset,button:p.button,buttons:p.buttons,x:p.clientX,y:p.clientY,code:k.code,ctrl:k.ctrlKey,shift:k.shiftKey,deltaY:w.deltaY,prevented:e.defaultPrevented});if(records.length>800)records.shift();publish();},0);},{capture:true});
/** Keep async save outcomes readable without injecting actions through browser evaluation. */
const timer=setInterval(publish,100);window.addEventListener('pagehide',()=>clearInterval(timer));
