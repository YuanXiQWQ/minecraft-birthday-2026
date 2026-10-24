/** Runtime regressions cover native history, finite menu alignment, audio channels and weather presentation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GameChat} from '../web/src/ui/chat.ts';
import {optionFlow} from '../web/src/ui/native-screens.ts';
import {NativeWeather,lightningGeometry} from '../web/src/render/native-weather.ts';
import {NativeRandom,emptyEnvironment} from '../web/src/domain/environment.ts';
import {soundGain,soundChannel} from '../web/src/domain/audio-settings.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {token} from '../web/src/persistence/codec.ts';
import {SettingsEdits} from '../web/src/ui/settings-edits.ts';
import {GameMusic} from '../web/src/render/game-music.ts';
import {WorldAudio,soundSample} from '../web/src/render/world-audio.ts';
import {NativeSky} from '../web/src/render/native-sky.ts';
import {PixelUI} from '../web/src/ui/pixels.ts';
import {nativeField} from '../web/src/ui/native-field.ts';
import {BirthdayCelebration} from '../web/src/celebration/birthday.ts';

test('celebration production sync follows local channel drafts without committing them or reverting on unrelated snapshots',async()=>{
 let raw:string|null=null;const session=new SaveSession({getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}},{exclusive:async fn=>fn()});await session.refresh();
 const edits=new SettingsEdits();edits.sync(session.view.envelope!.state.settings,session.view.envelope!.generation);const gains:any[]=[];
 const celebration=Object.assign(Object.create(BirthdayCelebration.prototype),{current:()=>({state:session.view.envelope!.state,generation:session.view.envelope!.generation}),audioSettings:()=>edits.view(),generation:'',sceneId:'',gainSignature:'',simulation:null,replay:{hidden:false},audio:{gain:(...args:any[])=>gains.push(args)},publish(){}});
 celebration.sync();edits.stage('neutralVolume',0);celebration.sync();assert.equal(gains.at(-1)[2].neutralVolume,0);assert.equal(session.view.envelope!.state.settings.neutralVolume,undefined);
 await session.dispatch({type:'settings',patch:{musicVolume:.3}});edits.sync(session.view.envelope!.state.settings,session.view.envelope!.generation);celebration.sync();assert.equal(gains.at(-1)[2].neutralVolume,0);const count=gains.length;celebration.sync();assert.equal(gains.length,count);session.dispose();
});

/** Register native keyboard code and count prevention without synthesizing browser proof.
 * @param {string} code Semantic keyboard code.
 * @return {KeyboardEvent} Unit-test input only.
 */
function key(code:string):KeyboardEvent{return{code,stopPropagation(){},preventDefault(){}} as KeyboardEvent;}

test('actual chat history Up/Down wins over automatic command offers and restores the unsent draft',()=>{
 const input={value:'/we',selectionStart:3,setSelectionRange(a:number){this.selectionStart=a;}},chat=Object.assign(Object.create(GameChat.prototype),{input,username:()=> 'sireoh',history:['/time set noon','/weather rain'],historyIndex:2,historyDraft:'',completion:null,paint(){}}) as GameChat;
 chat.key(key('ArrowUp'));assert.equal(input.value,'/weather rain');chat.key(key('ArrowUp'));assert.equal(input.value,'/time set noon');chat.key(key('ArrowDown'));assert.equal(input.value,'/weather rain');chat.key(key('ArrowDown'));assert.equal(input.value,'/we');
 chat.key(key('Tab'));assert.equal(input.value,'/weather');assert.ok(chat.completion);chat.key(key('ArrowDown'));assert.equal(input.value,'/weather');
});

test('odd menu controls use the same full-row width and boundaries as native paired buttons',()=>{
 for(const width of [196,320,400,640]){const flow=optionFlow(width,5),left=(width-flow.groupWidth)/2;assert.ok(flow.groupWidth<=width-16);assert.equal(flow.groupWidth,flow.columns*flow.buttonWidth+(flow.columns-1)*8);assert.equal(left+flow.groupWidth,width-left);assert.equal(flow.resetY,67+Math.ceil(5/flow.columns)*24);}
});

for(const [event,keyName] of [['music.game','musicVolume'],['weather.rain','weatherVolume'],['entity.lightning_bolt.thunder','weatherVolume'],['block.stone.break','blocksVolume'],['entity.cow.milk','neutralVolume'],['entity.firework_rocket.blast','neutralVolume'],['entity.item.pickup','playersVolume'],['ui.toast.in','uiVolume']] as const)test('native channel gain '+event,()=>{
 const settings={volume:.4,muted:false,[keyName]:.25} as any;assert.equal(soundChannel(event),keyName);assert.equal(soundGain(settings,event),.1);settings[keyName]=0;assert.equal(soundGain(settings,event),0);settings[keyName]=1;settings.muted=true;assert.equal(soundGain(settings,event),0);
});

test('real SaveSession preserves legacy settings, independently coordinates channel edits and keeps them through reset',async()=>{
 let raw:string|null=null,tail=Promise.resolve<unknown>(null);const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}},locks={exclusive<T>(fn:()=>Promise<T>){const p=tail.then(fn);tail=p.catch(()=>{});return p;}};
 const a=new SaveSession(storage,locks),b=new SaveSession(storage,locks);await a.refresh();await b.refresh();assert.equal(soundGain(a.view.envelope!.state.settings,'weather.rain'),.2);const edits=new SettingsEdits();a.subscribe(v=>{if(v.envelope)edits.sync(v.envelope.state.settings,v.envelope.generation);});edits.sync(a.view.envelope!.state.settings,a.view.envelope!.generation);
 edits.stage('weatherVolume',.15);await b.dispatch({type:'settings',patch:{musicVolume:.7}});await a.refresh();assert.equal(edits.view()!.weatherVolume,.15);assert.equal(edits.view()!.musicVolume,.7);
 await a.dispatch({type:'settings',patch:{weatherVolume:.15}});const confirmation=token(a.view.envelope!);await b.refresh();await b.dispatch({type:'settings',patch:{uiVolume:0}});await a.reset(confirmation);assert.equal(a.view.envelope!.state.settings.musicVolume,.7);assert.equal(a.view.envelope!.state.settings.weatherVolume,.15);assert.equal(a.view.envelope!.state.settings.uiVolume,0);
 await assert.rejects(a.dispatch({type:'settings',patch:{weatherVolume:1.5}}));a.dispose();b.dispose();
});

test('all original music and weather choices resolve to versioned, hashed ordinary-build resources',()=>{
 const root=new URL('../../resources/minecraft/26.3/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('ambience-manifest.json',root),'utf8')),events=JSON.parse(readFileSync(new URL('assets/minecraft/ambience-sounds.json',root),'utf8'));
 assert.equal(manifest.clientSha1,'e877b6a07acd633fb3bb475002175cec036e7b87');assert.equal(events['music.game'].sounds.length,32);for(const entry of manifest.entries){const bytes=readFileSync(new URL(entry.entry,root));assert.equal(bytes.length,entry.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
 assert.equal(soundSample([{name:'a',weight:2},{name:'b'}],.5).name,'a');assert.equal(soundSample([{name:'a',weight:2},{name:'b'}],.9).name,'b');
});

test('visual tick interpolation advances rain between 250ms commits and freezes with the native tick state',()=>{
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});const sky=Object.assign(Object.create(NativeSky.prototype),{state:emptyEnvironment(),gameTick:100,received:1000});assert.equal(sky.ticksAt(1000),100);assert.equal(sky.ticksAt(1016),100.32);assert.equal(sky.ticksAt(1050),101);assert.equal(sky.ticksAt(1250),105);assert.equal(sky.ticksAt(2000),105);sky.state.control.frozen=true;assert.equal(sky.ticksAt(1100),100);
});

test('native lightning geometry has all four layers and three branches, with the original 128-block main height',()=>{
 const geometry=lightningGeometry(12345),positions=geometry.getAttribute('position');assert.equal(positions.count,4*(8+3+3)*4*6);let min=Infinity,max=-Infinity;for(let i=0;i<positions.count;i++){min=Math.min(min,positions.getY(i));max=Math.max(max,positions.getY(i));}assert.equal(min,0);assert.equal(max,128);const other=lightningGeometry(12345);assert.deepEqual(positions.array,other.getAttribute('position').array);geometry.dispose();other.dispose();
});

test('native rain schedules weather-category calls and uses heightmaps to choose the quieter roof variant',()=>{
 const weather=new NativeWeather(1),records:any[]=[],heights=new Map<string,number>();for(let x=-10;x<=10;x++)for(let z=-10;z<=10;z++)heights.set(x+':'+z,5);weather.sound=(id,options)=>records.push({id,...options});for(let tick=0;tick<30;tick++)weather.update(tick,'home',[0,1.62,0],heights,{rain:1,thunder:0,snow:false});assert.ok(records.length>1);assert.ok(records.every(r=>r.id==='weather.rain.above'&&r.volume===.1&&r.pitch===.5));assert.equal(weather.bolts.length,0);weather.dispose();
});

test('native thunder tests each actual chunk at 1/100000, emits initial sounds once and clears transient state',()=>{
 const weather=new NativeWeather(1,0),records:any[]=[],bounds:any[]=[],heights=new Map([['0:0',0]]);weather.sound=(id,options)=>records.push({id,...options});weather.random.integer=(lo,hi)=>{bounds.push([lo,hi]);return 0;};weather.update(0,'plains',[0,1.62,0],heights,{rain:1,thunder:1,snow:false});weather.update(1,'plains',[0,1.62,0],heights,{rain:1,thunder:1,snow:false});assert.ok(bounds.some(b=>b[0]===0&&b[1]===99999));assert.equal(weather.bolts.length,1);assert.equal(weather.bolts[0].life,1);assert.equal(weather.flashUntil,3);assert.equal(records.filter(r=>r.id==='entity.lightning_bolt.thunder').length,1);assert.equal(records.find(r=>r.id==='entity.lightning_bolt.thunder').volume,10000);assert.equal(records.find(r=>r.id==='entity.lightning_bolt.impact').volume,2);
 weather.random=new NativeRandom(2);weather.update(2,'plains',[0,1.62,0],heights,{rain:0,thunder:0,snow:false});assert.equal(records.filter(r=>r.id==='entity.lightning_bolt.thunder').length,1);weather.clear();assert.equal(weather.root.children.length,0);assert.equal(weather.bolts.length,0);assert.equal(weather.flashUntil,-1);
});

test('native thunder does not generate in clear weather or before full thunder strength',()=>{
 const weather=new NativeWeather(1);weather.random.integer=()=>0;const heights=new Map([['0:0',0]]);weather.update(0,'plains',[0,1,0],heights,{rain:0,thunder:1,snow:false});weather.update(1,'plains',[0,1,0],heights,{rain:0,thunder:1,snow:false});assert.equal(weather.bolts.length,0);weather.update(2,'plains',[0,1,0],heights,{rain:1,thunder:.8,snow:false});assert.equal(weather.bolts.length,0);weather.dispose();
});

test('music uses native 100 client tick initial delay, retains category Off and does not require a second context',()=>{
 const doc=Object.assign(new EventTarget(),{hidden:false});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});const settings={volume:.2,muted:false,musicVolume:1} as any,audio=new WorldAudio(new Map(),()=>settings);audio.context={state:'running'} as any;const music=new GameMusic(audio,1);let starts=0;music.start=async()=>{starts++;music.pending=true;};music.update(1000);music.update(5950);assert.equal(starts,0);music.update(6000);assert.equal(starts,1);settings.musicVolume=0;music.update(6010);assert.equal(music.pending,false);assert.equal(music.delay,100);music.dispose();
});

test('language empty field shows only caret when focused and Search hint only after blur',()=>{
 const input=Object.assign(new EventTarget(),{value:'',selectionStart:0,selectionEnd:0,selectionDirection:'none',dataset:{},maxLength:256});const doc={activeElement:input};Object.defineProperty(globalThis,'document',{configurable:true,value:doc});const draws:string[]=[],ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},transform(){},fillRect(){}} as any,font={width:(s:string)=>s.length*6,draw:(_ctx:unknown,s:string)=>draws.push(s)} as any;
 nativeField(ctx,font,input as any,[4,3,192,8],{hint:'Search...',italicHint:true,now:1});assert.ok(draws.includes('_'));assert.ok(!draws.includes('Search...'));(doc as any).activeElement=null;draws.length=0;nativeField(ctx,font,input as any,[4,3,192,8],{hint:'Search...',italicHint:true,now:2});assert.ok(draws.includes('Search...'));assert.ok(!draws.includes('_'));
});

test('real music loader verifies bytes, streams through the existing context, applies its channel and schedules a native post-song delay',async()=>{
 const doc=new EventTarget();Object.assign(doc,{hidden:false});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const root=new URL('../../resources/minecraft/26.3/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('ambience-manifest.json',root),'utf8')),events=JSON.parse(readFileSync(new URL('assets/minecraft/ambience-sounds.json',root),'utf8')),audio=new WorldAudio(new Map([['assets/minecraft/ambience-sounds.json',events],['$native-entries',manifest.entries]]),()=>({volume:.5,muted:false,musicVolume:.4}) as any);
 const originalFetch=globalThis.fetch,oldAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio');let media:any,connections=0,disconnections=0;
 class FakeMedia {paused=true;currentTime=1;onended:any=null;onerror:any=null;src='';preload='';constructor(){media=this;}async play(){this.paused=false;}pause(){this.paused=true;}load(){}removeAttribute(){this.src='';}}
 Object.defineProperty(globalThis,'Audio',{configurable:true,value:FakeMedia});
 const gain={gain:{value:0},connect(){connections++;return this;},disconnect(){disconnections++;}},node={connect(){connections++;return gain;},disconnect(){disconnections++;}};
 audio.context={state:'running',currentTime:10,destination:{},createMediaElementSource:()=>node,createGain:()=>gain} as any;
 globalThis.fetch=async(path:any)=>{const relative=String(path).split('/minecraft/26.3/')[1];return new Response(readFileSync(new URL(relative,root)));};
 const music=new GameMusic(audio,1);
 try{(doc as any).hidden=true;await music.start();assert.equal(media.paused,false);assert.ok(music.track?.startsWith('music/game/'));assert.equal(connections,2);assert.ok(gain.gain.value>0&&gain.gain.value<=.2);assert.equal((audio.records.at(-1) as any).status,'scheduled');media.onended();assert.equal(music.media,null);assert.equal(music.url,null);assert.ok(music.delay>=12000&&music.delay<=24000);assert.equal(disconnections,2);}
 finally{music.dispose();globalThis.fetch=originalFetch;if(oldAudio)Object.defineProperty(globalThis,'Audio',oldAudio);else Reflect.deleteProperty(globalThis,'Audio');}
});

test('music cancelled during an actual resource fetch cannot resurrect a stream in a new lifetime',async()=>{
 const doc=new EventTarget();Object.assign(doc,{hidden:false});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const root=new URL('../../resources/minecraft/26.3/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('ambience-manifest.json',root),'utf8')),events=JSON.parse(readFileSync(new URL('assets/minecraft/ambience-sounds.json',root),'utf8')),audio=new WorldAudio(new Map([['assets/minecraft/ambience-sounds.json',events],['$native-entries',manifest.entries]]),()=>({volume:.2,muted:false}) as any);
 audio.context={state:'running',currentTime:0,createMediaElementSource(){throw Error('stale-stream');}} as any;const original=globalThis.fetch;let release!:(value:Response)=>void,path='';globalThis.fetch=async(url:any)=>{path=String(url).split('/minecraft/26.3/')[1];return new Promise<Response>(resolve=>release=resolve);};
 const music=new GameMusic(audio,1);try{const work=music.start();assert.equal(music.pending,true);music.cancel();release(new Response(readFileSync(new URL(path,root))));await work;assert.equal(music.pending,false);assert.equal(music.media,null);assert.equal(music.url,null);assert.equal(audio.records.length,0);}finally{music.dispose();globalThis.fetch=original;}
});


test('a clock receipt re-anchor preserves an active flash without replaying its first-tick audio',()=>{
 const weather=new NativeWeather(4),heights=new Map([['0:0',0]]),sounds:string[]=[];weather.sound=id=>sounds.push(id);weather.update(10,'plains',[0,1,0],heights,{rain:0,thunder:0,snow:false});weather.strike([0,0,0]);weather.update(11,'plains',[0,1,0],heights,{rain:0,thunder:0,snow:false});assert.equal(sounds.filter(s=>s==='entity.lightning_bolt.thunder').length,1);const bolt=weather.bolts[0];weather.update(10,'plains',[0,1,0],heights,{rain:0,thunder:0,snow:false});assert.equal(weather.bolts[0],bolt);weather.update(11,'plains',[0,1,0],heights,{rain:0,thunder:0,snow:false});assert.equal(sounds.filter(s=>s==='entity.lightning_bolt.thunder').length,1);weather.dispose();
});


test('actual PixelUI field paints italic hints at displayed framebuffer density instead of shearing a low-resolution enlarged bitmap',()=>{
 const transforms:any[]=[],draws:string[]=[],canvas={width:0,height:0,style:{},getContext:()=>ctx},ctx={setTransform(...v:number[]){transforms.push(v);},save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},transform(){},fillRect(){}} as any;
 const host={className:'',clientWidth:400,append(){},getBoundingClientRect:()=>({width:640})},input=Object.assign(new EventTarget(),{dataset:{nativeHeight:'15',nativeHint:'Search...',italicHint:'true'},value:'',maxLength:256,selectionStart:0,selectionEnd:0,selectionDirection:'none',replaceWith(){}});
 const doc={activeElement:input,createElement:(name:string)=>name==='canvas'?canvas:host};Object.defineProperty(globalThis,'document',{configurable:true,value:doc});Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1.25});const oldResize=Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver');Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{observe(){}}});
 const pixels=Object.assign(Object.create(PixelUI.prototype),{font:{width:(s:string)=>s.length*6,draw:(_ctx:unknown,s:string)=>draws.push(s)},resources:{guiImages:new Map()},updates:new Map(),observers:[],editingTimer:1});
 try{pixels.field(input as any);assert.equal(canvas.width,800);assert.equal(canvas.height,60);assert.deepEqual(transforms[0],[4,0,0,4,0,0]);assert.ok(!draws.includes('Search...'));(doc as any).activeElement=null;input.dispatchEvent(new Event('blur'));assert.ok(draws.includes('Search...'));}finally{if(oldResize)Object.defineProperty(globalThis,'ResizeObserver',oldResize);else Reflect.deleteProperty(globalThis,'ResizeObserver');}
});
