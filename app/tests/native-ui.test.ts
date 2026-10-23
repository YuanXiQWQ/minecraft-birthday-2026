/** Native UI regressions exercise production projections and lifecycle objects with independently derived Java 26.3 expectations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {recipePulse,RecipeToastClock} from '../web/src/ui/native-animation.ts';
import {activeCursor,caretState,nativeField} from '../web/src/ui/native-field.ts';
import {GameChat,chatFade,chatScale} from '../web/src/ui/chat.ts';
import {menuLayout} from '../web/src/ui/native-screens.ts';
import {crosshairVisible} from '../web/src/render/native-crosshair.ts';
import {WorldAudio} from '../web/src/render/world-audio.ts';

for(const [ms,expected] of [[0,1],[187.5,1.0707106781186548],[375,1.1],[562.5,1.0707106781186548],[750,1],[900,1]])test('native fifteen-tick sine at '+ms,()=>assert.ok(Math.abs(recipePulse(ms)-expected)<1e-12));

test('native toast square entrance, five-second fully-visible hold and square exit use independent boundaries',()=>{
    const clock=new RecipeToastClock();clock.add(['planks','sticks'],1000);
    for(const [at,visible,phase,index] of [[1000,0,'show',0],[1300,.25,'show',0],[1600,1,'hold',0],[4100,1,'hold',1],[6599,1,'hold',1],[6600,1,'hide',0],[6900,.75,'hide',0],[7200,0,'hide',0],[7201,0,'done',0]] as const){const value=clock.sample(at);assert.equal(value.phase,phase);assert.equal(value.visible,visible);assert.equal(value.index,index);}
});
test('native toast merges while showing, cycles all entries and extends hold without another entrance',()=>{
    const clock=new RecipeToastClock();clock.add(['a'],0);clock.sample(0);clock.sample(600);clock.add(['b','a'],2000);clock.sample(2000);assert.equal(clock.started,0);assert.deepEqual(clock.entries,['a','b']);assert.equal(clock.sample(5600).phase,'hold');assert.equal(clock.sample(7000).phase,'hide');clock.clear();assert.equal(clock.sample(7001).phase,'done');clock.add(['c'],8000);assert.equal(clock.sample(8000).visible,0);
});
for(const [elapsed,visible] of [[0,true],[299,true],[300,false],[599,false],[600,true]])test('focus-relative native cursor blink '+elapsed,()=>assert.equal(caretState(1000+Number(elapsed),1000,0,0,50).visible,visible));
test('EditBox append, insert, maximum and backwards active cursor branches',()=>{
    assert.equal(caretState(0,0,0,0,50).insert,false);assert.equal(caretState(0,0,3,3,50).insert,false);assert.equal(caretState(0,0,2,3,50).insert,true);assert.equal(caretState(0,0,50,50,50).insert,true);
    assert.equal(activeCursor({selectionStart:1,selectionEnd:5,selectionDirection:'backward',value:'abcdef'} as any),1);
});
/** Bind the production EditBox renderer to observable drawing primitives and a semantic editor. @return {object} Explicit draw records and input. */
function fieldHarness(){
    const calls:any[]=[];const input=Object.assign(new EventTarget(),{value:'abc',selectionStart:3,selectionEnd:3,selectionDirection:'none',maxLength:50,dataset:{}});
    Object.defineProperty(globalThis,'document',{value:{activeElement:input},configurable:true});
    const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},transform(){},fillRect(...v:any[]){calls.push(['rect',...v,this.globalCompositeOperation]);},fillStyle:'',globalCompositeOperation:'source-over'};
    const font={width:(s:string)=>s.length*6,draw:(_c:unknown,s:string,...args:any[])=>calls.push(['text',s,...args])};return{input,ctx,font,calls};
}
test('formal native field draws underscore at end, directional insertion caret and post-text inverted additive selection',()=>{
    const h=fieldHarness();nativeField(h.ctx as any,h.font as any,h.input as any,[4,6,30,8],{now:100});assert.ok(h.calls.some(c=>c[0]==='text'&&c[1]==='_'));
    h.calls.length=0;Object.assign(h.input,{selectionStart:0,selectionEnd:2,selectionDirection:'backward'});nativeField(h.ctx as any,h.font as any,h.input as any,[4,6,30,8],{now:101});
    assert.equal(JSON.parse((h.input.dataset as any).nativeEdit).cursor,0);assert.ok(h.calls.some(c=>c[0]==='rect'&&c[3]===1&&c[4]===11));
    assert.ok(h.calls.findIndex(c=>c[0]==='text'&&c[1]==='abc')<h.calls.findIndex(c=>c[5]==='difference'));assert.equal(h.calls.at(-1)[5],'lighter');
    (document as any).activeElement=null;h.input.value='';h.calls.length=0;nativeField(h.ctx as any,h.font as any,h.input as any,[0,0,80,9],{hint:'Search...',italicHint:true});assert.ok(h.calls.some(c=>c[0]==='text'&&c[1]==='Search...'&&c[4]==='#AAAAAA'));
    h.calls.length=0;nativeField(h.ctx as any,h.font as any,h.input as any,[0,0,80,9],{hint:'Default hint'});assert.ok(h.calls.some(c=>c[0]==='text'&&c[1]==='Default hint'&&c[4]==='#555555'));
});
test('formal EditBox keeps valid scroll and reveals the backwards endpoint without changing text',()=>{
    const h=fieldHarness();Object.assign(h.input,{value:'abcdefghij',selectionStart:10,selectionEnd:10});nativeField(h.ctx as any,h.font as any,h.input as any,[0,0,20,8]);assert.equal(JSON.parse((h.input.dataset as any).nativeEdit).scroll,41);
    Object.assign(h.input,{selectionStart:8,selectionEnd:8});nativeField(h.ctx as any,h.font as any,h.input as any,[0,0,20,8]);assert.equal(JSON.parse((h.input.dataset as any).nativeEdit).scroll,41);
    Object.assign(h.input,{selectionStart:1,selectionEnd:9,selectionDirection:'backward'});nativeField(h.ctx as any,h.font as any,h.input as any,[0,0,20,8]);assert.equal(JSON.parse((h.input.dataset as any).nativeEdit).scroll,6);assert.equal(h.input.value,'abcdefghij');
});
test('chat native auto scale and squared age fade have exact logical limits',()=>{
    assert.equal(chatScale(1280,638),2);assert.equal(chatScale(1440,818),3);assert.ok(Math.abs(chatFade(180)-1)<1e-12);assert.ok(Math.abs(chatFade(190)-.25)<1e-12);assert.equal(chatFade(200),0);
});
test('formal chat append freezes actual source identity, keeps old multiline order and preserves a historical scroll anchor',()=>{
    const chat=Object.create(GameChat.prototype) as GameChat;const children:any[]=[];
    Object.defineProperty(globalThis,'document',{value:{createElement:()=>({textContent:''})},configurable:true});
    Object.assign(chat,{messages:[],history:[],offset:7,open:true,viewport:{clientWidth:1280,clientHeight:720},pixels:{font:{width:(s:string)=>s.length*6}},accessible:{append:(v:any)=>children.push(v),children},root:{dataset:{}},paint(){}});
    chat.append([{text:'first line\nsecond line'}]);assert.equal(chat.offset,9);chat.append([{text:'hello'}],'player','Alice');chat.append([{text:'renamed'}],'player','Bob');chat.append([{text:'<not-an-author>'}]);
    assert.deepEqual(chat.messages.map(m=>m.kind),['system','player','player','system']);assert.equal(chat.messages[1].identity,'Alice');assert.equal(chat.messages[2].runs[0].text,'<Bob> ');assert.equal(chat.messages[3].identity,undefined);assert.equal(chat.newWhileScrolled,true);
});
test('native menu anchors separate language list, options header, sound rows and footer',()=>{
    assert.deepEqual(menuLayout(640,319,'sound'),{width:640,height:319,header:33,footer:33,titleY:12,contentY:37,footerY:292});
    assert.equal(menuLayout(640,319,'options').header,61);assert.equal(menuLayout(640,319,'language').header,36);assert.equal(menuLayout(640,319,'language').footer,53);assert.equal(menuLayout(640,319,'pause').titleY,40);
});
test('native crosshair requires every actual input authority predicate, never desired mode alone',()=>{
    const active={actual:true,owned:true,desired:'hidden',pending:false,paused:false,enabled:true,lost:false,disposed:false};assert.equal(crosshairVisible(active),true);
    for(const patch of [{actual:false},{owned:false},{desired:'visible'},{pending:true},{paused:true},{enabled:false},{lost:true},{disposed:true}])assert.equal(crosshairVisible({...active,...patch}),false);
});
test('formal UI audio records autoplay blocking, settings and generation cancellation without claiming audibility',async()=>{
    Object.defineProperty(globalThis,'document',{value:Object.assign(new EventTarget(),{hidden:false}),configurable:true});
    const settings={muted:false,volume:.2} as any,audio=new WorldAudio(new Map(),()=>settings);
    await audio.play('ui.toast.in');assert.equal((audio.records.at(-1) as any).status,'blocked');
    settings.muted=true;await audio.play('ui.toast.out');assert.equal((audio.records.at(-1) as any).status,'suppressed');
    const before=audio.epoch;audio.cancel();assert.equal(audio.epoch,before+1);audio.dispose();assert.equal(audio.disposed,true);
});

/** Native box blur's bilinear sample offsets are an independent shader-equation reference. @param {number[]} pixels Native encoded color row. @param {number} x Center pixel index. @return {number} Radius-five box value. */
function nativeBlurReference(pixels:number[],x:number):number{
    let sum=0;for(let a=-4.5;a<=5;a+=2){const at=x+a,lo=Math.floor(at),mix=at-lo;sum+=pixels[lo]*(1-mix)+pixels[lo+1]*mix;}return(sum+pixels[x+5]/2)/5.5;
}
test('ported native radius-five bilinear shader conserves a constant and covers eleven equal-weight pixels',async()=>{
    const {MENU_BLUR_DIRECTIONS}=await import('../web/src/render/native-menu-blur.ts');
    assert.deepEqual(MENU_BLUR_DIRECTIONS,[[1,0],[0,1],[1,0],[0,1],[1,0],[0,1]]);
    assert.equal(nativeBlurReference(Array(21).fill(.5),10),.5);
    for(let i=5;i<=15;i++){const row=Array(21).fill(0);row[i]=1;assert.ok(Math.abs(nativeBlurReference(row,10)-1/11)<1e-12);}
});

test('formal HUD renderer uses one original quad, the native invert factors and restores clear ownership',async()=>{
    const {NativeCrosshair}=await import('../web/src/render/native-crosshair.ts'),three=await import('three');
    const hud=new NativeCrosshair({width:15,height:15} as any),owner={dataset:{},parentElement:{clientWidth:1280,clientHeight:638}},rendered:any[]=[];
    const renderer={domElement:owner,autoClear:true,getSize:(v:any)=>v.set(1280,638),render:(s:any,c:any)=>rendered.push([s,c])};
    const state={actual:true,owned:true,desired:'hidden',pending:false,paused:false,enabled:true,lost:false,disposed:false};
    hud.render(renderer as any,state);assert.equal(rendered.length,1);assert.equal(renderer.autoClear,true);assert.equal(hud.material.blendSrc,three.OneMinusDstColorFactor);assert.equal(hud.material.blendDst,three.OneMinusSrcColorFactor);
    assert.deepEqual(JSON.parse((owner.dataset as any).crosshair).bounds,[312,152,15,15]);hud.render(renderer as any,{...state,owned:false});assert.equal(rendered.length,1);
    let released=0;hud.texture.addEventListener('dispose',()=>released++);hud.dispose();assert.equal(released,1);
});
test('formal menu renderer reuses two targets, executes encoding plus six native passes and restores GPU state',async()=>{
    const {NativeMenuBlur}=await import('../web/src/render/native-menu-blur.ts'),three=await import('three'),blur=new NativeMenuBlur(),target={name:'prior'},calls:any[]=[];
    let current:any=target,scissor=true;const renderer={autoClear:false,getDrawingBufferSize:(v:any)=>v.set(640,360),getRenderTarget:()=>current,getViewport:(v:any)=>v.set(1,2,300,200),getScissor:(v:any)=>v.set(3,4,200,100),getScissorTest:()=>scissor,setScissorTest:(v:boolean)=>scissor=v,setRenderTarget:(v:any)=>current=v,setViewport(){},setScissor(){},render:(s:any)=>calls.push([current,s])};
    blur.render(renderer as any,new three.Scene(),new three.PerspectiveCamera());assert.equal(calls.length,9);assert.equal(current,target);assert.equal(scissor,true);assert.equal(renderer.autoClear,false);assert.equal(blur.targets[0].width,640);
    const owned=[...blur.targets];blur.render(renderer as any,new three.Scene(),new three.PerspectiveCamera());assert.equal(blur.targets[0],owned[0]);assert.equal(blur.targets[1],owned[1]);blur.dispose();
});
test('formal UI sound decode cannot replay after a generation cancellation or swallow a decoding failure',async()=>{
    Object.defineProperty(globalThis,'document',{value:Object.assign(new EventTarget(),{hidden:false}),configurable:true});
    const bytes=new Uint8Array([1,2,3]),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''),path='assets/minecraft/sounds/ui/toast/in.ogg';
    const docs=new Map<string,any>([['$native-sounds',{'ui.toast.in':{sounds:[{name:'ui/toast/in',volume:.4}]}}],['$native-entries',[{entry:path,sha256:hash}]]]);
    Object.defineProperty(globalThis,'fetch',{value:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer}),configurable:true});
    let resolve!:(v:any)=>void,started=0;
    const audio=new WorldAudio(docs,()=>({muted:false,volume:.2}) as any);audio.context={state:'running',currentTime:1,decodeAudioData:()=>new Promise(r=>resolve=r),createBufferSource:()=>{started++;},close:async()=>{}} as any;
    const work=audio.play('ui.toast.in');while(!resolve)await new Promise(r=>setTimeout(r,0));audio.cancel();resolve({duration:1});assert.equal(await work,'cancelled');assert.equal(started,0);assert.equal(audio.buffers.size,0);
    audio.context!.decodeAudioData=async()=>{throw Error('decode-failed');};assert.equal(await audio.play('ui.toast.in'),'decode-failed');assert.equal((audio.records.at(-1) as any).status,'decode-failed');
    let reject!:(e:Error)=>void;audio.context!.decodeAudioData=()=>new Promise((_,fail)=>reject=fail);const stale=audio.play('ui.toast.in');while(!reject)await new Promise(r=>setTimeout(r,0));audio.cancel();reject(Error('decode-failed'));assert.equal(await stale,'cancelled');assert.equal((audio.records.at(-1) as any).status,'cancelled');audio.dispose();
});

/** Observe Canvas2D affine composition independently of recipe animation mathematics. @return {object} Observable drawing context and recorded matrices. */
function matrixCanvas(){
    let matrix=[1,0,0,1,0,0];const stack:number[][]=[],images:any[]=[];
    const ctx={setTransform:(...m:number[])=>{matrix=m;},save:()=>stack.push([...matrix]),restore:()=>{matrix=stack.pop()!;},clearRect(){},beginPath(){},rect(){},clip(){},fillRect(){},
        translate:(x:number,y:number)=>{matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;},scale:(x:number,y:number)=>{matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y;},
        transform:(a:number,b:number,c:number,d:number,e:number,f:number)=>{const [A,B,C,D,E,F]=matrix;matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];},
        drawImage:(image:any,...bounds:number[])=>images.push({id:image.id,matrix:[...matrix],bounds}),imageSmoothingEnabled:false};
    return{ctx,images,canvas:{width:0,height:0,dataset:{},style:{},getContext:()=>ctx},matrix:()=>[...matrix]};
}
test('actual RecipeBookView.paint transforms button and icon together, tab vertically, and stops its bounded RAF',async()=>{
    const {RecipeBookView}=await import('../web/src/ui/recipe-book.ts'),original=Object.getOwnPropertyDescriptor(globalThis,'performance');let now=1187.5;
    Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});Object.defineProperty(globalThis,'devicePixelRatio',{value:1,configurable:true});
    const callbacks:FrameRequestCallback[]=[];Object.defineProperty(globalThis,'requestAnimationFrame',{value:(f:FrameRequestCallback)=>{callbacks.push(f);return callbacks.length;},configurable:true});
    Object.defineProperty(globalThis,'document',{value:{activeElement:null,hidden:false},configurable:true});
    const main=matrixCanvas(),tab=matrixCanvas(),icons:any[]=[],r={id:'minecraft:oak_planks',type:'minecraft:crafting_shapeless',result:{id:'minecraft:oak_planks',count:4}},search=Object.assign(new EventTarget(),{value:'',selectionStart:0,selectionEnd:0,maxLength:50,dataset:{}}),button={querySelector:()=>tab.canvas,dataset:{}};
    const book=Object.create(RecipeBookView.prototype) as any;
    Object.assign(book,{disposed:false,root:{hidden:false},canvas:main.canvas,search,groups:[{key:'one',recipes:[r]}],page:0,category:'all',hover:'',popup:null,animationFrame:0,pulses:new Map([['recipe:one',1000],['tab:all',1000]]),body:{classList:{contains:()=>false}},controls:{querySelector:()=>button},syncScope(){},craftable:()=>true,categories:()=>['all'],image:(id:string)=>({id,width:25,height:25})});
    book.ui={scale:1,permanent:{progress:{recipeBook:{data:{views:{crafting:{filter:false}}}}}},text:()=>'',art:{documents:new Map()},pixels:{font:{width:(s:string)=>s.length*6,draw(){}}},stack:(ctx:any)=>icons.push(ctx===main.ctx?main.matrix():tab.matrix())};
    try{
        book.paint();const expected=1.0707106781186548,buttonDraw=main.images.find(i=>i.id.includes('slot_')),tabDraw=tab.images[0];
        assert.ok(Math.abs(buttonDraw.matrix[0]-expected)<1e-12);assert.ok(Math.abs(buttonDraw.matrix[3]-expected)<1e-12);
        assert.ok(Math.abs(buttonDraw.matrix[4]-19*(1-expected))<1e-12);assert.ok(Math.abs(buttonDraw.matrix[5]-43*(1-expected))<1e-12);assert.deepEqual(icons[0],buttonDraw.matrix);
        assert.equal(tabDraw.matrix[0],1);assert.ok(Math.abs(tabDraw.matrix[3]-expected)<1e-12);assert.equal(tabDraw.matrix[4],0);assert.ok(Math.abs(tabDraw.matrix[5]-(3+12*(1-expected)))<1e-12);
        now=1375;
        for(const selected of [true,false]){
            book.category=selected?'all':'equipment';tab.images.length=0;book.paint();
            const m=tab.images[0].matrix, top=m[5],bottom=m[5]+27*m[3];
            assert.equal(tab.canvas.height,33);assert.ok(top>0);assert.ok(bottom<tab.canvas.height);
            assert.ok(bottom-top>27);assert.equal(parseFloat((tab.canvas as any).style.top),-3);
            assert.ok(Math.abs(parseFloat((tab.canvas as any).style.top)+top-12*(1-1.1))<1e-12);
        }
        book.animate();assert.equal(callbacks.length,1);now=1900;callbacks.shift()!(1900);assert.equal(callbacks.length,0);assert.equal(book.animationFrame,0);
    }finally{if(original)Object.defineProperty(globalThis,'performance',original);}
});
