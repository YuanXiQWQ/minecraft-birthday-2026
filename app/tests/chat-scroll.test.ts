/** Chat history layout, frame coalescing and silent storage transitions protect responsive local input. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameChat} from '../web/src/ui/chat.ts';
import {feedbackTransition,systemFeedback} from '../web/src/ui/system-feedback.ts';

/** Bind real layout methods to a measured font and immutable message fixtures.
 * @return {object} Chat owner and measurement counter.
 */
function history(){
    const chat=Object.create(GameChat.prototype) as GameChat;let measured=0;
    Object.assign(chat,{messages:Array.from({length:100},(_,i)=>({runs:[{text:`Message ${i}: `+'长中文消息'.repeat(20)}],time:i,kind:'player'})),wrapping:new WeakMap(),rowLayout:null,pixels:{font:{width:(text:string)=>{measured++;return[...text].length*6;}}}});
    return{chat,measured:()=>measured};
}

test('wheel and hover layout reuse history without measuring or wrapping old messages again',()=>{
    const h=history(),rows=h.chat.layoutRows(120),count=h.measured();assert.equal(rows.length,100);assert.ok(count>100);
    for(let i=0;i<100;i++)assert.equal(h.chat.layoutRows(120),rows);
    assert.equal(h.measured(),count);
    const before=h.chat.messages[99];h.chat.messages.push({runs:[{text:'新消息'}],time:100,kind:'system'});h.chat.messages.shift();
    const appended=h.chat.layoutRows(120);assert.notEqual(appended,rows);assert.equal(appended.at(-1)?.text,'新消息');assert.ok(appended.some(row=>row.message===before));assert.ok(h.measured()-count<20,'only the new message needs font measurement');
    const current=h.measured();assert.notEqual(h.chat.layoutRows(60),appended);assert.ok(h.measured()>current,'a width change recalculates wrapping');
});

test('cached lines retain styled component offsets and explicit multiline order',()=>{
    const h=history(),message={kind:'system' as const,time:0,runs:[{text:'abc ',color:'#FFFFFF'},{text:'def\nghi',hover:[{text:'native hover'}]}]};
    const rows=h.chat.messageRows(message,24);assert.deepEqual(rows.map(row=>[row.text,row.start]),[['abc',0],['def',4],['ghi',8]]);assert.ok(rows.every(row=>row.message===message));assert.equal(h.chat.messageRows(message,24),rows);
});

test('a wheel burst updates every offset immediately and paints only once on the next frame',()=>{
    const oldRequest=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame,callbacks=new Map<number,FrameRequestCallback>();let serial=0,paints=0;
    globalThis.requestAnimationFrame=callback=>{callbacks.set(++serial,callback);return serial;};globalThis.cancelAnimationFrame=id=>{callbacks.delete(id);};
    const chat=Object.create(GameChat.prototype) as GameChat;
    Object.assign(chat,{offset:0,lineCount:100,paintFrame:0,abort:new AbortController(),paint(){paints++;}});
    try{
        for(let i=0;i<6;i++)chat.scroll(7);assert.equal(chat.offset,42);assert.equal(paints,0);assert.equal(callbacks.size,1);
        const next=callbacks.values().next().value!;callbacks.clear();next(0);assert.equal(paints,1);assert.equal(chat.paintFrame,0);
        chat.scroll(100);assert.equal(chat.offset,80);chat.scroll(-100);assert.equal(chat.offset,0);assert.equal(chat.newWhileScrolled,false);
        chat.abort.abort();callbacks.values().next().value!(1);assert.equal(paints,1,'discarded owner cannot paint later');chat.requestPaint();assert.equal(chat.paintFrame,0);
    }finally{globalThis.requestAnimationFrame=oldRequest;globalThis.cancelAnimationFrame=oldCancel;}
});

test('ready and lock contention are silent while a later genuine failure remains observable',()=>{
    const states=new Map<string,string>();assert.equal(systemFeedback('status.ready'),'omit');assert.equal(systemFeedback('error.lock-busy'),'omit');
    assert.equal(feedbackTransition(states,'error.write',{},'storage'),'failure');assert.equal(feedbackTransition(states,'status.ready',{},'storage'),'omit');assert.equal(feedbackTransition(states,'error.write',{},'storage'),'failure');
    assert.equal(feedbackTransition(states,'error.lock-busy',{},'storage'),'omit');assert.equal(systemFeedback('error.corrupt'),'failure');assert.equal(systemFeedback('settings.saveFailed'),'failure');
});
