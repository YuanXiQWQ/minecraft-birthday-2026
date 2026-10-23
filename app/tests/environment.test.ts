/** Native environment, opt-in location and panel lifetimes exercise production code and real save coordination. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NativeRandom,emptyEnvironment,tickEnvironment,validateEnvironment,realDayTicks} from '../web/src/domain/environment.ts';
import {trackAt,bezier} from '../web/src/render/sky-tracks.ts';
import {cloudGeometry} from '../web/src/render/cloud-geometry.ts';
import {NativePrecipitation} from '../web/src/render/native-precipitation.ts';
import {NativeMenuBlur} from '../web/src/render/native-menu-blur.ts';
import {Scene,Group,PerspectiveCamera} from 'three';
import {NativeSky,starGeometry,weatherLighting,weatherTint} from '../web/src/render/native-sky.ts';
import {LocalWeather,wmoWeather} from '../web/src/render/local-weather.ts';
import {optionFlow} from '../web/src/ui/native-screens.ts';
import {NavigationPanel} from '../web/src/ui/navigation-panel.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {decode,checksum,seal,token} from '../web/src/persistence/codec.ts';
import {initialState} from '../web/src/domain/state.ts';
import type {Rules} from '../web/src/rules/types.ts';
/** Exact official day timeline, compared against independently known noon/midnight/day/night boundaries. */
const day=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/data/minecraft/timeline/day.json',import.meta.url),'utf8'));
/** Same audited rule provider used by the formal producer clock. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;

test('native 48-bit stream and accepted star count match the isolated Java reference',()=>{
 const random=new NativeRandom(60426);assert.deepEqual(Array.from({length:6},()=>random.integer(12000,180000)),[135568,128552,107872,98085,25303,83764]);
 const stars=starGeometry();assert.equal(stars.index!.count/6,780);assert.ok([...stars.getAttribute('position').array].every(Number.isFinite));stars.dispose();
});

test('native countdown chooses clear intervals before toggling and retains float-rate easing',()=>{
 const s=emptyEnvironment();tickEnvironment(s);assert.equal(s.thunderTime,135568);assert.equal(s.rainTime,128552);assert.equal(s.raining,false);
 s.rainTime=1;s.thunderTime=1;tickEnvironment(s);assert.equal(s.rainTime,0);assert.equal(s.thunderTime,0);assert.equal(s.raining,true);assert.equal(s.thundering,true);assert.equal(s.rainLevel,Math.fround(.01));
 tickEnvironment(s);assert.ok(s.rainTime>=12000&&s.rainTime<=24000);assert.ok(s.thunderTime>=3600&&s.thunderTime<=15600);
 for(let i=0;i<110;i++)tickEnvironment(s);assert.equal(s.rainLevel,1);s.rainTime=1;tickEnvironment(s);assert.equal(s.raining,false);assert.ok(s.rainLevel<1);validateEnvironment(s);
});

test('native day/moon interpolation uses real keyframes and cubic X inversion, including circular discontinuity',()=>{
 const sun=day.tracks['minecraft:visual/sun_angle'];assert.equal(trackAt(sun,6000,24000),0);assert.ok(Math.abs(trackAt(sun,18000,24000)-180)<1e-6);assert.ok(trackAt(sun,5999,24000)>359);
 assert.deepEqual(trackAt(day.tracks['minecraft:visual/sky_color'],18000,24000),[0,0,0,1]);
 assert.ok(Math.abs(bezier(.5,[.362,.241,.638,.759])-.5)<1e-8);
 assert.equal(realDayTicks(new Date(2026,9,23,6,0,0)),0);assert.equal(realDayTicks(new Date(2026,9,23,12,0,0)),6000);assert.equal(realDayTicks(new Date(2026,9,23,0,0,0)),18000);
});

/** Create two real save sessions without browser storage or a copied transaction implementation.
 * @return {Promise<object>} Shared serialized ports, real owners and injected failure control.
 */
async function sessions(){let raw:string|null=null,tail=Promise.resolve<unknown>(null),deny=false;
 const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(deny)throw Error('write-failed');raw=v;}},locks={exclusive<T>(work:()=>Promise<T>){const p=tail.then(work);tail=p.catch(()=>{});return p;}};
 const a=new SaveSession(storage,locks),b=new SaveSession(storage,locks);a.rules=b.rules=rules;await a.refresh();await b.refresh();return{a,b,get raw(){return raw;},deny:(v:boolean)=>deny=v};}

test('real save ticks, unrelated settings and reset preserve current environment preferences without stale progress',async()=>{
 const h=await sessions();const confirmation=token(h.a.view.envelope!);await h.b.dispatch({type:'processing-tick',ticks:80});await h.a.dispatch({type:'sky-settings',patch:{time:'real'}});await h.b.dispatch({type:'sky-settings',patch:{weather:'real'}});await h.a.refresh();
 assert.deepEqual(h.a.view.envelope!.state.settings.sky,{time:'real',weather:'real'});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,1080);assert.equal(token(h.a.view.envelope!),confirmation);
 await h.a.reset(confirmation);await h.b.refresh();assert.equal(h.b.view.envelope!.state.progress.environment!.dayTicks,1000);assert.deepEqual(h.b.view.envelope!.state.settings.sky,{time:'real',weather:'real'});
});

test('environment migration preserves old bytes and facts; read/write failures cannot publish partial weather updates',async()=>{
 const state=initialState();delete state.progress.environment;state.progress.unlocked=['minecraft:oak_log'];state.settings.volume=.65;
 const current=await seal(state,'old',2),{checksum:_hash,...body}=current,old={...body,contentVersion:'p8-experience-2'},raw=JSON.stringify({...old,checksum:await checksum(old)}),read=await decode(raw);
 assert.equal(read.migrated,true);assert.equal(read.envelope.contentVersion,'p9-commands-1');assert.deepEqual(read.envelope.state.progress.unlocked,['minecraft:oak_log']);assert.equal(read.envelope.state.settings.volume,.65);assert.equal(read.envelope.state.progress.environment!.dayTicks,1000);assert.equal(JSON.parse(raw).contentVersion,'p8-experience-2');
 const h=await sessions(),before=h.raw;h.deny(true);await assert.rejects(h.a.dispatch({type:'processing-tick',ticks:20}));assert.equal(h.raw,before);h.deny(false);await h.a.refresh();await h.a.dispatch({type:'processing-tick',ticks:20});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,1020);
 assert.throws(()=>validateEnvironment({...emptyEnvironment(),random:NaN}));assert.throws(()=>validateEnvironment({...emptyEnvironment(),latitude:1}));
});

test('location construction is passive; explicit request rounds coordinates, failures and cancellation never resurrect observations',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldFetch=globalThis.fetch;
 let requests=0,success:((p:any)=>void)|null=null,deny:((e:any)=>void)|null=null,release:((r:any)=>void)|null=null,url='';const updates:any[]=[],statuses:string[]=[];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition:(a:any,b:any)=>{requests++;success=a;deny=b;}}}});
 globalThis.fetch=async input=>{url=String(input);return new Promise<any>(r=>release=r);};
 const weather=new LocalWeather(v=>updates.push(v),k=>statuses.push(k));
 try{
  assert.equal(requests,0);assert.equal(url,'');weather.request();assert.equal(requests,1);success!({coords:{latitude:49.123456,longitude:-123.654321}});assert.match(url,/latitude=49.12/);assert.match(url,/longitude=-123.65/);
  weather.stop();release!({ok:true,json:async()=>({current:{weather_code:95}})});await new Promise(r=>setImmediate(r));assert.equal(weather.observation,null);assert.ok(!statuses.includes('weather.localReady'));
  weather.request();deny!({code:1});assert.equal(statuses.at(-1),'weather.locationDenied');assert.equal(weather.coordinates,null);
 }finally{weather.dispose();globalThis.fetch=oldFetch;if(previous)Object.defineProperty(globalThis,'navigator',previous);else Reflect.deleteProperty(globalThis,'navigator');}
});

for(const [code,rain,thunder,snow] of [[0,0,0,false],[61,1,0,false],[75,1,0,true],[95,1,1,false]] as const)test('documented WMO projection '+code,()=>assert.deepEqual(wmoWeather(code),{rain,thunder,snow}));

test('production panel initially retracts after five seconds, holds under hover, and restarts each departure timer',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 const edge=Object.assign(new EventTarget(),{className:'',type:'',hidden:false,setAttribute(){},remove(){}}),panel=Object.assign(new EventTarget(),{id:'nav',dataset:{} as Record<string,string>,inert:false,after(){},querySelector:()=>null});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>edge}});
 const controller=new NavigationPanel(panel as unknown as HTMLElement,'Show scenes');
 try{
  t.mock.timers.tick(4999);assert.equal(panel.dataset.expanded,'true');t.mock.timers.tick(1);assert.equal(panel.dataset.expanded,'false');assert.equal(edge.hidden,false);
  edge.dispatchEvent(new Event('pointerenter'));panel.dispatchEvent(new Event('pointerenter'));t.mock.timers.tick(9000);assert.equal(panel.dataset.expanded,'true');assert.equal(edge.hidden,true);
  panel.dispatchEvent(new Event('pointerleave'));t.mock.timers.tick(4000);assert.equal(panel.dataset.expanded,'true');panel.dispatchEvent(new Event('pointerenter'));t.mock.timers.tick(2000);assert.equal(panel.dataset.expanded,'true');
  panel.dispatchEvent(new Event('pointerleave'));t.mock.timers.tick(4999);assert.equal(panel.dataset.expanded,'true');t.mock.timers.tick(1);assert.equal(panel.dataset.expanded,'false');controller.dispose();edge.dispatchEvent(new Event('pointerenter'));assert.equal(panel.dataset.expanded,'false');
 }finally{controller.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});


test('original cloud alpha threshold, wrap neighbors, normals and native cell dimensions are preserved',()=>{
 const rgba=new Uint8ClampedArray(3*3*4);rgba[(1*3+1)*4+3]=255;rgba[3]=9;
 const mesh=cloudGeometry(rgba,3,3);assert.equal(mesh.quads,5);assert.equal(mesh.positions.length,60);assert.ok([...mesh.positions].every(Number.isFinite));
 const points=Array.from(mesh.positions);assert.equal(Math.min(...points.filter((_,i)=>i%3===1)),0);assert.equal(Math.max(...points.filter((_,i)=>i%3===1)),4);
 assert.deepEqual([...new Set(mesh.colors)].map(n=>Math.round(n*10)).sort(),[7,8,9]);
 const full=cloudGeometry(new Uint8ClampedArray([255,255,255,255]),1,1);assert.equal(full.quads,1,'wrapped neighbors have no internal walls');
});

test('precipitation clips against actual authored roof cells and reuses geometry until layout changes',()=>{
 const canvas={width:16,height:16},pack={guiImages:new Map([['assets/minecraft/textures/environment/rain.png',canvas],['assets/minecraft/textures/environment/snow.png',canvas]])};
 const rain=new NativePrecipitation(pack as any),p=initialState().progress,scenery=new Group(),roof=new Group(),camera=new PerspectiveCamera();camera.position.set(.5,2,.5);
 roof.userData.cells=[[1,5,0]];scenery.add(roof);rain.update(camera,p,scenery,20,1,false);
 const pos=rain.mesh.geometry.getAttribute('position');let found=false;
 for(let i=0;i<pos.count;i+=4){const cx=(pos.getX(i)+pos.getX(i+2))/2,cz=(pos.getZ(i)+pos.getZ(i+2))/2;if(Math.abs(cx-1.5)<.001&&Math.abs(cz-.5)<.001){found=true;assert.equal(pos.getY(i),6);}}
 assert.equal(found,true);const geometry=rain.mesh.geometry;rain.update(camera,p,scenery,40,1,false);assert.equal(rain.mesh.geometry,geometry);rain.update(camera,p,scenery,60,0,false);assert.equal(rain.root.visible,false);rain.dispose();
});


test('native sky disposal terminates pending cloud worker and rejects late geometry installation',()=>{
 const oldWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker');let worker:any;
 class PendingWorker {onmessage:any;onerror:any;stopped=false;constructor(){worker=this;}postMessage(){}terminate(){this.stopped=true;}}
 Object.defineProperty(globalThis,'Worker',{configurable:true,value:PendingWorker});
 const image={width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([255,255,255,255]),width:1,height:1})})};
 const dimension=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/data/minecraft/dimension_type/overworld.json',import.meta.url),'utf8'));
 const moon=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/data/minecraft/timeline/moon.json',import.meta.url),'utf8'));
 const sky=new NativeSky({documents:new Map([['data/minecraft/timeline/day.json',day],['data/minecraft/timeline/moon.json',moon],['data/minecraft/dimension_type/overworld.json',dimension]]),guiImages:{get:()=>image}} as any);
 try{let disposed=0;sky.clouds.addEventListener('dispose',()=>disposed++);sky.dispose();assert.equal(worker.stopped,true);assert.equal(disposed,1);assert.equal(sky.scene.children.length,0);worker.onmessage({data:cloudGeometry(new Uint8ClampedArray([255,255,255,255]),1,1)});assert.equal(sky.cloudQuads,0);assert.equal(sky.clouds.visible,false);}
 finally{if(oldWorker)Object.defineProperty(globalThis,'Worker',oldWorker);else Reflect.deleteProperty(globalThis,'Worker');}
});


test('native rain/thunder light and sunrise tint preserve layer order and original alpha',()=>{
 const rain=weatherLighting(1,[1,1,1,1],1,0);assert.equal(rain.factor,.7625);assert.equal(rain.color[2],1);assert.ok(rain.color[0]<1);
 assert.equal(weatherLighting(1,[1,1,1,1],1,1).factor,1+(0.24-1)*.52734375);
 assert.deepEqual(weatherTint([1,1,1,.4],1,0),[127/255,127/255,153/255,.4]);assert.deepEqual(weatherTint([1,1,1,.4],1,1).slice(0,3).map(v=>Math.round(v*255)),[63,63,76]);assert.equal(weatherTint([1,1,1,.4],1,1)[3],.4);
});


test('four options fit a narrow native logical plane without warning intercepting the weather button',()=>{
 const narrow=optionFlow(196,4);assert.equal(narrow.buttonWidth,180);assert.equal(narrow.resetY,67+4*24);assert.ok(narrow.resetY>=67+3*24+24);
 const desktop=optionFlow(400,4);assert.equal(desktop.columns,2);assert.equal(desktop.buttonWidth,150);assert.equal(desktop.resetY,115);
});


test('weather decode, HTTP and synchronous geolocation failures expose fallback without retaining observations',async()=>{
 const oldFetch=globalThis.fetch,previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let kind='valid';const statuses:string[]=[],updates:any[]=[];
 const weather=new LocalWeather(v=>updates.push(v),s=>statuses.push(s));
 globalThis.fetch=async()=>({ok:kind!=='http',json:async()=>({current:{weather_code:kind==='valid'?95:4}})}) as Response;
 try{weather.coordinates=[0,0];await weather.refresh(0);assert.equal(weather.observation?.thunder,1);kind='bad';await weather.refresh(0);assert.equal(weather.observation,null);assert.equal(statuses.at(-1),'weather.fetchFailed');kind='http';await weather.refresh(0);assert.equal(statuses.at(-1),'weather.fetchFailed');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(){throw Error('unavailable');}}}});weather.request();assert.equal(statuses.at(-1),'weather.locationUnavailable');assert.equal(weather.coordinates,null);
 }finally{weather.dispose();globalThis.fetch=oldFetch;if(previous)Object.defineProperty(globalThis,'navigator',previous);else Reflect.deleteProperty(globalThis,'navigator');}
});


test('sky and world share the menu target without clearing the sky, including thrown-backdrop restoration',()=>{
 const blur=new NativeMenuBlur(),world=new Scene(),sky=new Scene(),camera=new PerspectiveCamera(),saved={name:'outside'},draws:any[]=[];let target:any=saved,scissor=true;
 const renderer={autoClear:false,getDrawingBufferSize:(v:any)=>v.set(1280,720),getRenderTarget:()=>target,getViewport:(v:any)=>v.set(2,3,400,200),getScissor:(v:any)=>v.set(1,2,200,100),getScissorTest:()=>scissor,setScissorTest:(v:boolean)=>scissor=v,setRenderTarget:(v:any)=>target=v,setViewport(){},setScissor(){},render:(scene:any)=>draws.push({scene,target,clear:renderer.autoClear})};
 blur.render(renderer as any,world,camera,[],()=>renderer.render(sky));assert.equal(draws[0].scene,sky);assert.equal(draws[0].clear,true);assert.equal(draws[1].scene,world);assert.equal(draws[1].clear,false);assert.equal(draws[0].target,draws[1].target);assert.equal(target,saved);assert.equal(scissor,true);assert.equal(renderer.autoClear,false);
 assert.throws(()=>blur.render(renderer as any,world,camera,[],()=>{throw Error('sky-failed');}));assert.equal(target,saved);assert.equal(scissor,true);assert.equal(renderer.autoClear,false);blur.dispose();
});
