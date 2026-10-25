/** Production pointer ownership is exercised with explicit browser-API doubles; this is not a claim of native lock support. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PointerMode} from '../web/src/render/pointer-mode.ts';
import {bindEscapeKey} from '../web/src/ui/escape-key.ts';

/** Send window capture before document capture, as browser keyboard propagation does.
 * @param {ReturnType<typeof fixture>} f Browser ownership fixture.
 * @param {string} type Keyboard phase.
 */
function escape(f:ReturnType<typeof fixture>,type:string):void {
    for(const target of [f.w,f.d])target.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code:'Escape',repeat:false}));
}

for(const delivery of ['before-down','between-keys','after-up'])test(`Escape closes pause once despite delayed native unlock: ${delivery}`,async()=>{
    const f=fixture(),abort=new AbortController();let menu=true,actions=0;
    try {
        f.mode.enter();f.grant();await new Promise(resolve=>setImmediate(resolve));
        f.d.exitPointerLock=()=>{};
        f.mode.pause(true);
        f.mode.onNativeUnlock=bindEscapeKey(()=>true,()=>{actions++;menu=!menu;f.mode.pause(menu);},abort.signal,()=>{if(!menu){actions++;menu=true;f.mode.pause(true);}});
        /** Deliver the queued browser release notification without invoking any native API. */
        const unlock=()=>{f.d.pointerLockElement=null;f.d.dispatchEvent(new Event('pointerlockchange'));};
        if(delivery==='before-down')unlock();
        escape(f,'keydown');
        if(delivery==='between-keys')unlock();
        escape(f,'keyup');
        if(delivery==='after-up')unlock();
        await new Promise(resolve=>setTimeout(resolve,5));
        assert.equal(menu,false);assert.equal(actions,1);assert.equal(f.calls(),2);
        f.grant();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mode.actual,true);
    } finally {abort.abort();f.close();}
});

for(const delivery of ['no-keys','keyup-only','keydown-first'])test(`locked-world Escape opens pause exactly once: ${delivery}`,async()=>{
    const f=fixture(),abort=new AbortController();let menu=false,actions=0;
    try {
        f.mode.enter();f.grant();await new Promise(resolve=>setImmediate(resolve));
        f.mode.onNativeUnlock=bindEscapeKey(()=>true,()=>{actions++;menu=!menu;f.mode.pause(menu);},abort.signal,()=>{if(!menu){actions++;menu=true;f.mode.pause(true);}});
        if(delivery==='keydown-first')escape(f,'keydown');
        f.d.exitPointerLock();assert.equal(menu,true);assert.equal(actions,1);
        if(delivery!=='no-keys')escape(f,'keyup');
        assert.equal(menu,true);assert.equal(actions,1);
        escape(f,'keydown');escape(f,'keyup');
        assert.equal(menu,false);assert.equal(actions,2);
        await new Promise(resolve=>setTimeout(resolve,5));
        if(delivery!=='keydown-first'){
            assert.equal(f.calls(),1,'browser Escape cooldown must not consume the resume attempt');
            await new Promise(resolve=>setTimeout(resolve,1300));
        }
        f.grant();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mode.actual,true);
    } finally {abort.abort();f.close();}
});

test('expired user activation preserves UI-return intent until a real engagement can lock',async()=>{
    const f=fixture(),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),activation={isActive:false};
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userActivation:activation}});
    try {
        f.mode.pause(true);f.mode.nativeUnlockUntil=performance.now()-1;f.mode.pause(false);
        assert.equal(f.calls(),0);assert.equal(f.mode.resumeQueued,true);assert.equal(f.mode.resumeOnGesture,true);
        f.w.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW'}));assert.equal(f.calls(),0,'synthetic input cannot supply activation');
        activation.isActive=true;f.mode.enter();assert.equal(f.calls(),1);
        f.grant();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mode.actual,true);assert.equal(f.mode.resumeOnGesture,false);
    }finally{f.close();if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete(globalThis as any).navigator;}
});

for(const cancel of ['menu','blur','dispose'])test(`pending native Escape cooldown cannot reacquire after ${cancel}`,async()=>{
    const f=fixture();try{
        f.mode.pause(true);f.mode.nativeUnlockUntil=performance.now()+20;f.mode.pause(false);
        assert.notEqual(f.mode.cooldownTask,null);assert.equal(f.calls(),0);
        if(cancel==='menu')f.mode.pause(true);else if(cancel==='blur')f.w.dispatchEvent(new Event('blur'));else f.mode.dispose();
        await new Promise(resolve=>setTimeout(resolve,30));assert.equal(f.calls(),0);assert.equal(f.mode.resumeOnGesture,false);
    }finally{f.close();}
});

/** Own fake browser notifications and deferred native request completion around the real state machine.
 * @return {object} Canvas request and actual document event controls.
 */
function fixture() {
    const oldD=Object.getOwnPropertyDescriptor(globalThis,'document'),oldW=Object.getOwnPropertyDescriptor(globalThis,'window'), d=Object.assign(new EventTarget(),{pointerLockElement:null as unknown,hidden:false,exitPointerLock(){this.pointerLockElement=null;EventTarget.prototype.dispatchEvent.call(this,new Event('pointerlockchange'));}}), w=new EventTarget();
    Object.defineProperty(globalThis,'document',{value:d,configurable:true});Object.defineProperty(globalThis,'window',{value:w,configurable:true});
    let resolve!:()=>void,reject!:(error:Error)=>void,calls=0,changes=0,errors=0;
    const options: unknown[]=[];
    const canvas={dataset:{},requestPointerLock(option?:unknown){calls++;options.push(option);return new Promise<void>((yes,no)=>{resolve=yes;reject=no;});}};
    const mode=new PointerMode(canvas as any,()=>changes++,()=>errors++);
    return {d,w,canvas,mode,options,calls:()=>calls,errors:()=>errors,changes:()=>changes,grant(){d.pointerLockElement=canvas;d.dispatchEvent(new Event('pointerlockchange'));resolve();},deny(name='NotAllowedError',eventFirst=true){if(eventFirst)d.dispatchEvent(new Event('pointerlockerror'));reject(Object.assign(Error('denied'),{name}));},close(){mode.dispose();if(oldD)Object.defineProperty(globalThis,'document',oldD);else delete(globalThis as any).document;if(oldW)Object.defineProperty(globalThis,'window',oldW);else delete(globalThis as any).window;}};
}
for(const eventFirst of [true,false])test('unsupported raw input falls back once with either error-event ordering '+eventFirst,async()=>{const f=fixture();try{f.mode.enter();assert.deepEqual(f.options,[{unadjustedMovement:true}]);f.deny('NotSupportedError',eventFirst);await new Promise(r=>setImmediate(r));assert.deepEqual(f.options,[{unadjustedMovement:true},undefined]);if(!eventFirst)f.d.dispatchEvent(new Event('pointerlockerror'));assert.equal(f.mode.desired,'hidden');assert.equal(f.errors(),0);f.grant();await new Promise(r=>setImmediate(r));f.d.dispatchEvent(new Event('pointerlockerror'));assert.equal(f.mode.actual,true);assert.equal(f.mode.desired,'hidden');assert.equal(f.errors(),0);}finally{f.close();}});
test('fallback denial is reported once without a third request',async()=>{const f=fixture();try{f.mode.enter();f.deny('NotSupportedError');await new Promise(r=>setImmediate(r));f.deny('NotSupportedError');await new Promise(r=>setImmediate(r));assert.equal(f.calls(),2);assert.equal(f.errors(),1);assert.equal(f.mode.desired,'hidden');}finally{f.close();}});
test('raw capability rejection after GUI cancellation cannot start a fallback',async()=>{const f=fixture();try{f.mode.enter();f.mode.pause(true);f.deny('NotSupportedError');await new Promise(r=>setImmediate(r));assert.equal(f.calls(),1);assert.equal(f.errors(),0);assert.equal(f.mode.pending,false);}finally{f.close();}});
test('a fallback grant after GUI cancellation cannot restore mouse ownership',async()=>{const f=fixture();try{f.mode.enter();f.deny('NotSupportedError');await new Promise(r=>setImmediate(r));f.mode.pause(true);f.grant();await new Promise(r=>setImmediate(r));assert.equal(f.mode.actual,false);assert.equal(f.d.pointerLockElement,null);}finally{f.close();}});
for(const grant of [true,false])test('legacy void-returning browser settles through its document event '+grant,()=>{const f=fixture();try{f.canvas.requestPointerLock=(()=>undefined) as any;f.mode.enter();assert.equal(f.mode.pending,true);if(grant){f.d.pointerLockElement=f.canvas;f.d.dispatchEvent(new Event('pointerlockchange'));assert.equal(f.mode.actual,true);assert.equal(f.errors(),0);}else{f.d.dispatchEvent(new Event('pointerlockerror'));assert.equal(f.mode.desired,'hidden');assert.equal(f.errors(),1);}assert.equal(f.mode.pending,false);}finally{f.close();}});
test('first gesture is consumed and actual lock is acknowledged only by a document event',async()=>{const f=fixture();try{assert.equal(f.mode.enter(),true);assert.equal(f.mode.actual,false);assert.equal(f.calls(),1);f.grant();await Promise.resolve();assert.equal(f.mode.actual,true);assert.equal(f.mode.enter(),false);assert.equal(f.mode.desired,'hidden');}finally{f.close();}});
test('denied event plus rejected promise emit only one fallback and leave input recoverable',async()=>{const f=fixture();try{f.mode.enter();f.deny();await new Promise(r=>setImmediate(r));assert.equal(f.errors(),1);assert.equal(f.mode.actual,false);assert.equal(f.mode.desired,'hidden');assert.equal(f.mode.pending,false);assert.equal(f.mode.enter(),true);}finally{f.close();}});
test('GUI cancellation fences late lock and does not issue a second overlapping request',async()=>{const f=fixture();try{f.mode.enter();f.mode.pause(true);f.mode.pause(false);assert.equal(f.mode.enter(),true);assert.equal(f.calls(),1);f.grant();await new Promise(r=>setImmediate(r));assert.equal(f.d.pointerLockElement,null);assert.equal(f.mode.actual,false);assert.equal(f.mode.enter(),true);assert.equal(f.calls(),2);f.deny();await new Promise(r=>setImmediate(r));}finally{f.close();}});
test('native unlock changes pointer ownership without changing the UI gate',async()=>{const f=fixture();try{f.mode.enter();f.grant();await new Promise(r=>setImmediate(r));f.d.exitPointerLock();assert.equal(f.mode.paused,false);f.mode.desired='hidden';f.mode.enter();f.grant();await new Promise(r=>setImmediate(r));f.mode.pause(true);assert.equal(f.mode.paused,true);assert.equal(f.mode.actual,false);}finally{f.close();}});
for(const boundary of ['blur','pagehide','hidden','dispose'])test('late native grants cannot survive '+boundary,async()=>{const f=fixture();try{f.mode.enter();if(boundary==='blur'||boundary==='pagehide')f.w.dispatchEvent(new Event(boundary));else if(boundary==='hidden'){f.d.hidden=true;f.d.dispatchEvent(new Event('visibilitychange'));}else f.mode.dispose();f.grant();await new Promise(r=>setImmediate(r));assert.equal(f.d.pointerLockElement,null);assert.equal(f.mode.actual,false);assert.equal(f.mode.enter(),false);}finally{f.close();}});

test('closing a GUI requests hidden ownership once and unchanged gates do not reacquire', async () => {
 const f=fixture();try {f.mode.pause(true);f.mode.desired='visible';f.mode.pause(false);assert.equal(f.mode.desired,'hidden');assert.equal(f.calls(),1);f.grant();await new Promise(r=>setImmediate(r));f.mode.pause(false);assert.equal(f.calls(),1);assert.equal(f.mode.actual,true);}finally{f.close();}
});

test('UI still cancels a late grant after automatic resume', async () => {
 const f=fixture();try {f.mode.pause(true);f.mode.pause(false);f.mode.pause(true);f.grant();await new Promise(r=>setImmediate(r));assert.equal(f.d.pointerLockElement,null);assert.equal(f.mode.actual,false);}finally{f.close();}
});

test('closing any UI during an obsolete native request resumes automatically after that request settles', async () => {
    const f=fixture();try {
        f.mode.enter();f.mode.pause(true);f.mode.pause(false);
        assert.equal(f.calls(),1);
        f.grant();await new Promise(resolve=>setImmediate(resolve));
        assert.equal(f.calls(),2);assert.equal(f.mode.pending,true);assert.equal(f.mode.paused,false);
        f.grant();await new Promise(resolve=>setImmediate(resolve));
        assert.equal(f.mode.actual,true);
    }finally{f.close();}
});

 test('initial scene synchronization preserves first-click entry, while focus loss disarms it', () => {
    const f=fixture();try {
        f.mode.suspend();assert.equal(f.mode.desired,'hidden');
        f.mode.suspend(true);assert.equal(f.mode.desired,'visible');assert.equal(f.mode.enter(),false);
    } finally {f.close();}
});


test('an explicit world click can reacquire after focus returns without automatic focus capture',async()=>{
    const f=fixture();try {
        f.mode.suspend(true);assert.equal(f.mode.enter(),false);assert.equal(f.calls(),0);
        assert.equal(f.mode.enter(true),true);assert.equal(f.calls(),1);assert.equal(f.mode.actual,false);
        f.grant();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mode.actual,true);
    }finally{f.close();}
});

test('explicit acquisition remains blocked by UI and unfocused documents',()=>{
    const f=fixture();try {
        f.mode.pause(true);assert.equal(f.mode.enter(true),false);assert.equal(f.calls(),0);
        Object.assign(f.d,{hasFocus:()=>false});f.mode.pause(false);assert.equal(f.mode.enter(true),false);assert.equal(f.calls(),0);
    }finally{f.close();}
});

for(const reopen of [false,true])test(`UI return waits for asynchronous native unlock before reacquiring; reopen=${reopen}`,async()=>{
    const f=fixture();try{
        f.mode.enter();f.grant();await new Promise(resolve=>setImmediate(resolve));
        f.d.exitPointerLock=()=>{};
        f.mode.pause(true);f.mode.pause(false);assert.equal(f.calls(),1);assert.equal(f.mode.resumeQueued,true);
        if(reopen)f.mode.pause(true);
        f.d.pointerLockElement=null;f.d.dispatchEvent(new Event('pointerlockchange'));
        assert.equal(f.calls(),reopen?1:2);
        if(!reopen){f.grant();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mode.actual,true);}
    }finally{f.close();}
});

test('closing a UI with Escape requests hidden ownership after keyup, not while Escape remains held',async()=>{
    const f=fixture();try{
        f.mode.pause(true);
        f.w.dispatchEvent(Object.assign(new Event('keydown'),{code:'Escape'}));
        f.mode.pause(false);assert.equal(f.calls(),0);assert.equal(f.mode.resumeQueued,true);
        f.w.dispatchEvent(Object.assign(new Event('keyup'),{code:'Escape'}));assert.equal(f.calls(),0);
        await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.calls(),1);
        f.grant();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mode.actual,true);
        f.w.dispatchEvent(Object.assign(new Event('keyup'),{code:'Escape'}));assert.equal(f.calls(),1);
    }finally{f.close();}
});
