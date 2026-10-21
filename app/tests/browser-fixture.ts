/** P3_TEST_ONLY: explicit command fixtures and real browser coordination, excluded from every normal build. */
import {browserSession} from '../web/src/persistence/browser.ts';import {SAVE_KEY,LOCK_NAME,SaveSession} from '../web/src/persistence/session.ts';import {token} from '../web/src/persistence/codec.ts';
if(import.meta.env.MODE!=='verification')throw new Error('verification-only');
/** Test origin owns no real user's ordinary-server save. */
const connection=browserSession(),session=connection.session,output=document.getElementById('verification')!,controls=document.getElementById('controls')!;
/** Explicit browser action records are separate from domain events and durable facts. */
const records:object[]=[];
/** Publish inspectable test evidence without accessing renderer internals.
 * @param {object} record Optional new evidence row.
 */
function publish(record?:object):void{if(record)records.push(record);output.textContent=JSON.stringify({origin:location.origin,mode:import.meta.env.MODE,environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio},nativeLocks:!!navigator.locks,snapshot:session.view,records},null,2);}
/** Add a test-only button whose completion or rejection is recorded for real browser inspection.
 * @param {string} label Explicit fixture operation.
 * @param {Function} action Test action.
 */
function action(label:string,action:()=>Promise<unknown>):void{const b=document.createElement('button');b.textContent=label;b.addEventListener('click',()=>{const start=Date.now();publish({label,phase:'start',start});void action().then(result=>publish({label,phase:'done',start,end:Date.now(),result})).catch(error=>publish({label,phase:'rejected',start,end:Date.now(),reason:String(error)}));});controls.append(b);}
session.subscribe(()=>publish());await session.refresh();
action('Read current save',()=>session.refresh());
action('Fixture: unlock log',()=>session.dispatch({type:'unlock',item:'minecraft:oak_log'}));
action('Fixture: unlock charcoal',()=>session.dispatch({type:'unlock',item:'minecraft:charcoal'}));
action('Fixture: place cake',async()=>{await session.dispatch({type:'unlock',item:'minecraft:cake'});await session.dispatch({type:'select-scene',scene:'home'});await session.dispatch({type:'record-cake-placement',scene:'home',table:'birthday-table'});return session.view;});
action('Fixture: reset progress',async()=>{await session.refresh();return session.reset(token(session.view.envelope!));});
action('Slow transaction: unlock log',async()=>{let calls=0;const slow=new SaveSession(localStorage,{exclusive:work=>navigator.locks.request(LOCK_NAME,async()=>{calls++;if(calls>1){publish({phase:'real-lock-held',at:Date.now()});await new Promise(r=>setTimeout(r,1500));}return work();})});await slow.refresh();const events=await slow.dispatch({type:'unlock',item:'minecraft:oak_log'});await session.refresh();slow.dispose();return events;});
action('Run reset-before-stale-write check',async()=>{await session.refresh();const other=browserSession();await other.session.refresh();let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),held=navigator.locks.request(LOCK_NAME,async()=>{entered();await new Promise<void>(r=>release=r);});await ready;const reset=session.reset(token(session.view.envelope!)),stale=other.session.dispatch({type:'unlock',item:'minecraft:charcoal'}),both=Promise.allSettled([reset,stale]);release();await held;const results=await both;await session.refresh();other.dispose();return{results:results.map(r=>r.status==='rejected'?{status:r.status,reason:String(r.reason)}:r),passed:results[0].status==='fulfilled'&&results[1].status==='rejected'&&String(results[1].reason).includes('stale-session')&&!session.view.envelope!.state.progress.unlocked.length};});
action('Checkpoint then write future fixture',async()=>{await navigator.locks.request(LOCK_NAME,()=>{const raw=localStorage.getItem(SAVE_KEY)!;sessionStorage.setItem('p3-verification-backup',raw);localStorage.setItem(SAVE_KEY,JSON.stringify({format:99}));});await session.refresh();return {status:session.view.status,raw:localStorage.getItem(SAVE_KEY)};});
action('Restore checkpoint',async()=>{await navigator.locks.request(LOCK_NAME,()=>{const raw=sessionStorage.getItem('p3-verification-backup');if(!raw)throw new Error('missing-test-checkpoint');localStorage.setItem(SAVE_KEY,raw);});await session.refresh();});
action('Run missing-capability checks',async()=>{const readonly=new SaveSession(localStorage,null);await readonly.refresh();const storageFailure=new SaveSession({getItem:()=>{throw new Error('storage-unavailable');},setItem:()=>{throw new Error('write-failed');}},null);await storageFailure.refresh();return{scope:'explicit injected unsupported capabilities, not a real private-browser claim',lockUnavailable:readonly.view.status,storageUnavailable:storageFailure.view.status};});
window.addEventListener('pagehide',()=>connection.dispose());
