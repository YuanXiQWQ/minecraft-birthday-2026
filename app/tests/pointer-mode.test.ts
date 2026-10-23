/** Production pointer ownership is exercised with explicit browser-API doubles; this is not a claim of native lock support. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PointerMode} from '../web/src/render/pointer-mode.ts';

/** Own fake browser notifications and deferred native request completion around the real state machine.
 * @return {object} Canvas request and actual document event controls.
 */
function fixture() {
    const oldD=Object.getOwnPropertyDescriptor(globalThis,'document'),oldW=Object.getOwnPropertyDescriptor(globalThis,'window'), d=Object.assign(new EventTarget(),{pointerLockElement:null as unknown,hidden:false,exitPointerLock(){this.pointerLockElement=null;EventTarget.prototype.dispatchEvent.call(this,new Event('pointerlockchange'));}}), w=new EventTarget();
    Object.defineProperty(globalThis,'document',{value:d,configurable:true});Object.defineProperty(globalThis,'window',{value:w,configurable:true});
    let resolve!:()=>void,reject!:(error:Error)=>void,calls=0,changes=0,escapes=0,errors=0;
    const canvas={dataset:{},requestPointerLock(){calls++;return new Promise<void>((yes,no)=>{resolve=yes;reject=no;});}};
    const mode=new PointerMode(canvas as any,()=>changes++,()=>escapes++,()=>errors++);
    return {d,w,canvas,mode,calls:()=>calls,errors:()=>errors,escapes:()=>escapes,changes:()=>changes,grant(){d.pointerLockElement=canvas;d.dispatchEvent(new Event('pointerlockchange'));resolve();},deny(){d.dispatchEvent(new Event('pointerlockerror'));reject(Error('denied'));},close(){mode.dispose();if(oldD)Object.defineProperty(globalThis,'document',oldD);else delete(globalThis as any).document;if(oldW)Object.defineProperty(globalThis,'window',oldW);else delete(globalThis as any).window;}};
}
test('first gesture is consumed and actual lock is acknowledged only by a document event',async()=>{const f=fixture();try{assert.equal(f.mode.enter(),true);assert.equal(f.mode.actual,false);assert.equal(f.calls(),1);f.grant();await Promise.resolve();assert.equal(f.mode.actual,true);assert.equal(f.mode.enter(),false);assert.equal(f.mode.desired,'hidden');}finally{f.close();}});
test('denied event plus rejected promise emit only one fallback and leave input recoverable',async()=>{const f=fixture();try{f.mode.enter();f.deny();await new Promise(r=>setImmediate(r));assert.equal(f.errors(),1);assert.equal(f.mode.actual,false);assert.equal(f.mode.desired,'visible');assert.equal(f.mode.pending,false);assert.equal(f.mode.enter(),false);}finally{f.close();}});
test('GUI cancellation fences late lock and does not issue a second overlapping request',async()=>{const f=fixture();try{f.mode.enter();f.mode.pause(true);f.mode.pause(false);assert.equal(f.mode.enter(),true);assert.equal(f.calls(),1);f.grant();await new Promise(r=>setImmediate(r));assert.equal(f.d.pointerLockElement,null);assert.equal(f.mode.actual,false);assert.equal(f.escapes(),0);assert.equal(f.mode.enter(),true);assert.equal(f.calls(),2);f.deny();await new Promise(r=>setImmediate(r));}finally{f.close();}});
test('browser Escape opens one menu and an intentional GUI release opens none',async()=>{const f=fixture();try{f.mode.enter();f.grant();await new Promise(r=>setImmediate(r));f.d.exitPointerLock();assert.equal(f.escapes(),1);f.mode.desired='hidden';f.mode.enter();f.grant();await new Promise(r=>setImmediate(r));f.mode.pause(true);assert.equal(f.escapes(),1);assert.equal(f.mode.actual,false);}finally{f.close();}});
for(const boundary of ['blur','hidden','dispose'])test('late native grants cannot survive '+boundary,async()=>{const f=fixture();try{f.mode.enter();if(boundary==='blur')f.w.dispatchEvent(new Event('blur'));else if(boundary==='hidden'){f.d.hidden=true;f.d.dispatchEvent(new Event('visibilitychange'));}else f.mode.dispose();f.grant();await new Promise(r=>setImmediate(r));assert.equal(f.d.pointerLockElement,null);assert.equal(f.mode.actual,false);assert.equal(f.escapes(),0);}finally{f.close();}});
