/** Screen navigation consumes one Escape press even when native lock release suppresses its keydown. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {bindEscapeKey} from '../web/src/ui/escape-key.ts';

/** Install document/window event targets around production Escape routing.
 * @return {object} Key dispatch, screen ownership, and cleanup controls.
 */
function fixture() {
    const oldD=Object.getOwnPropertyDescriptor(globalThis,'document'),oldW=Object.getOwnPropertyDescriptor(globalThis,'window');
    const d=new EventTarget(),w=new EventTarget(),abort=new AbortController();
    Object.defineProperty(globalThis,'document',{value:d,configurable:true});
    Object.defineProperty(globalThis,'window',{value:w,configurable:true});
    const state={enabled:true,screen:'menu',actions:0};
    const unlock=bindEscapeKey(()=>state.enabled,()=>{state.actions++;state.screen=state.screen?'':'menu';},abort.signal,()=>{if(!state.screen){state.actions++;state.screen='menu';}});
    return {state,w,unlock,
        /** Dispatch a keyboard event with configurable repeat and composition state.
         * @param {string} type Keyboard event phase.
         * @param {object} options Additional keyboard fields.
         * @return {Event} Cancelable event after routing.
         */
        key(type:string,options:Record<string,unknown>={}) {const event=Object.assign(new Event(type,{cancelable:true}),{code:'Escape',repeat:false,...options});d.dispatchEvent(event);return event;},
        /** Remove page listeners and restore the test process globals. */
        close(){abort.abort();if(oldD)Object.defineProperty(globalThis,'document',oldD);else delete(globalThis as any).document;if(oldW)Object.defineProperty(globalThis,'window',oldW);else delete(globalThis as any).window;}
    };
}

for(const screen of ['menu','chat','inventory','advancements','settings'])test(`Escape closes ${screen} once, including auto-repeat and composition`,()=>{
    const f=fixture();try{
        f.state.screen=screen;
        assert.equal(f.key('keydown',{isComposing:true}).defaultPrevented,true);
        f.key('keydown',{repeat:true});f.key('keydown',{repeat:true});
        assert.equal(f.key('keyup').defaultPrevented,true);
        assert.equal(f.state.screen,'');assert.equal(f.state.actions,1);
        f.key('keydown');f.key('keyup');assert.equal(f.state.screen,'menu');assert.equal(f.state.actions,2);
    }finally{f.close();}
});

test('native unlock opens pause without either key event; a trailing keyup never closes it',()=>{
    const f=fixture();try{
        f.state.screen='';f.unlock();assert.equal(f.state.screen,'menu');
        f.key('keyup');assert.equal(f.state.screen,'menu');assert.equal(f.state.actions,1);
        f.key('keydown');f.key('keyup');assert.equal(f.state.screen,'');assert.equal(f.state.actions,2);
    }finally{f.close();}
});

test('orphan keyup cannot open pause or dismiss a screen',()=>{
    const f=fixture();try{
        f.key('keyup');assert.equal(f.state.screen,'menu');
        f.state.screen='';f.key('keyup');assert.equal(f.state.screen,'');assert.equal(f.state.actions,0);
    }finally{f.close();}
});

test('a press during loading is not replayed when the world becomes ready before keyup',()=>{
    const f=fixture();try{
        f.state.enabled=false;f.key('keydown');f.state.enabled=true;f.key('keyup');assert.equal(f.state.actions,0);
    }finally{f.close();}
});

test('focus loss cancels an orphan release but permits a new press immediately',()=>{
    const f=fixture();try{
        f.w.dispatchEvent(new Event('blur'));f.key('keyup');assert.equal(f.state.actions,0);
        f.w.dispatchEvent(new Event('blur'));f.key('keydown');f.key('keyup');assert.equal(f.state.actions,1);
    }finally{f.close();}
});
