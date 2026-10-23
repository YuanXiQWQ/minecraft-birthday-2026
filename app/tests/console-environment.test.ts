/** Commands exercise the production parser, shared save transactions, native sky transforms and menu geometry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCommand,completeCommand,TIME_MARKERS} from '../web/src/domain/console.ts';
import {emptyEnvironment,tickEnvironment} from '../web/src/domain/environment.ts';
import {initialState} from '../web/src/domain/state.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {checksum,decode,seal,token} from '../web/src/persistence/codec.ts';
import {TickClock,processingClock} from '../web/src/persistence/processing-clock.ts';
import {NativeSky} from '../web/src/render/native-sky.ts';
import {GameChat} from '../web/src/ui/chat.ts';
import {optionFlow} from '../web/src/ui/native-screens.ts';
import {PerspectiveCamera} from 'three';
import type {Rules} from '../web/src/rules/types.ts';
/** Audited rules are identical to those supplied to the normal application. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
/** Construct independent real sessions over serialized shared storage with controllable write failure.
 * @return {Promise<object>} Real sessions, shared raw bytes and failure switch.
 */
async function owners(){let raw:string|null=null,tail=Promise.resolve<unknown>(null),deny=false;
 const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(deny)throw Error('write-failed');raw=v;}},locks={exclusive<T>(fn:()=>Promise<T>){const work=tail.then(fn);tail=work.catch(()=>{});return work;}};
 const a=new SaveSession(storage,locks),b=new SaveSession(storage,locks);a.rules=b.rules=rules;await a.refresh();await b.refresh();return{a,b,get raw(){return raw;},deny(v:boolean){deny=v;}};
}

for(const source of ['/tick query','/tick rate 10000','/tick freeze','/tick unfreeze','/tick step','/tick step 1s','/tick step stop','/tick sprint 3d','/tick sprint stop','/time set midnight','/time set 1.5d','/time add -1s','/time query gametime','/time query time','/time query minecraft:day repetition','/time query moon','/time of minecraft:overworld pause','/time resume','/time rate 0.00001','/weather clear','/weather rain 40t','/weather thunder 1s','/gamerule advance_time false','/gamerule minecraft:advance_weather true'])test('26.3 registered branch '+source,()=>assert.ok('op'in parseCommand(source)));
for(const source of ['/give @s stone','/time query daytime','/weather snow','/tick rate 0','/tick rate 10001','/tick step 0t','/time set -1','/time rate 0','/gamerule advance_time nope','/weather clear 2minutes','/tick freeze extra'])test('native command rejection '+source,()=>{const result=parseCommand(source);assert.ok('key'in result);assert.equal(result.error,true);assert.equal(typeof result.cursor,'number');});

test('completion shares registration, understands argument position and preserves unavailable command boundaries',()=>{
 assert.equal((parseCommand('/tick rate 0') as {key:string}).key,'argument.float.low');
 assert.equal((parseCommand('/gamerule advance_time nope') as {key:string}).key,'parsing.bool.invalid');
 assert.equal((parseCommand('/weather rain 2minutes') as {key:string}).key,'argument.time.invalid_unit');
 assert.deepEqual(completeCommand('/we'),{start:1,values:['weather']});assert.deepEqual(completeCommand('/weather '),{start:9,values:['clear','rain','thunder']});
 assert.deepEqual(completeCommand('/gamerule advance_weather ' ).values,['false','true']);assert.deepEqual(completeCommand('/time set ni').values,['minecraft:night']);
 assert.deepEqual(completeCommand('/time of minecraft:overworld query ').values,['minecraft:day','minecraft:moon','time']);assert.deepEqual(completeCommand('/give ').values,[]);
 assert.ok(completeCommand('/tick step ').values.includes('stop'));assert.deepEqual(completeCommand('/tick sprint ').values,['1d','3d','60s','stop']);
});

test('real command receipts query without writing; unknown commands cannot alter save or grant materials',async()=>{
 const h=await owners(),before=h.raw;
 assert.equal((await h.a.transact({type:'console',source:'/time query time'})).console![0].values?.v1,'1000');assert.equal(h.raw,before);
 const invalid=await h.a.transact({type:'console',source:'/give @s diamond'});assert.equal(invalid.console![0].key,'command.unknown.command');assert.equal(h.raw,before);assert.deepEqual(h.a.view.envelope!.state.progress.unlocked,[]);
});

test('native clock markers move forward, numeric set resets fraction, signed add clamps at zero and rate uses float accumulation',async()=>{
 const h=await owners();await h.a.transact({type:'console',source:'/time set 18000'});await h.a.transact({type:'console',source:'/time set day'});
 assert.equal((await h.a.transact({type:'console',source:'/time add 0'})).console![0].error,false);
 assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,25000);await h.a.transact({type:'console',source:'/time add -2d'});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,0);
 await h.a.transact({type:'console',source:'/time rate 0.5'});await h.a.dispatch({type:'processing-tick',ticks:3});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,1);assert.equal(h.a.view.envelope!.state.progress.environment!.control.clockFraction,.5);
 await h.a.transact({type:'console',source:'/time set 40'});assert.equal(h.a.view.envelope!.state.progress.environment!.control.clockFraction,0);
});

test('time pause and advance_time stop celestial time but not game tick, crops or weather',async()=>{
 const h=await owners();await h.a.transact({type:'console',source:'/time pause'});await h.a.dispatch({type:'processing-tick',ticks:10});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,1000);assert.equal(h.a.view.envelope!.state.progress.world.tick,10);
 await h.a.transact({type:'console',source:'/time resume'});await h.a.transact({type:'console',source:'/gamerule advance_time false'});await h.a.dispatch({type:'processing-tick',ticks:10});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,1000);
 await h.a.transact({type:'console',source:'/gamerule advance_time true'});await h.a.dispatch({type:'processing-tick',ticks:10});assert.equal(h.a.view.envelope!.state.progress.environment!.dayTicks,1010);
});

test('weather duration units, native countdown transition and disabled weather progression preserve strength easing',async()=>{
 const h=await owners();await h.a.transact({type:'console',source:'/weather thunder 1s'});let e=h.a.view.envelope!.state.progress.environment!;assert.equal(e.rainTime,20);assert.equal(e.thunderTime,20);assert.equal(e.thundering,true);
 await h.a.transact({type:'console',source:'/gamerule advance_weather false'});await h.a.dispatch({type:'processing-tick',ticks:10});e=h.a.view.envelope!.state.progress.environment!;assert.equal(e.rainTime,20);assert.ok(e.rainLevel>0);
 await h.a.transact({type:'console',source:'/weather clear 50t'});await h.a.transact({type:'console',source:'/gamerule advance_weather true'});await h.a.dispatch({type:'processing-tick',ticks:5});e=h.a.view.envelope!.state.progress.environment!;assert.equal(e.clearWeatherTime,45);assert.equal(e.raining,false);assert.equal(e.rainTime,1);
});

test('frozen stepping is finite, sprint restores previous freeze and old clock epochs are fenced',async()=>{
 const h=await owners();assert.equal((await h.a.transact({type:'console',source:'/tick step'})).console![0].error,true);
 await h.a.transact({type:'console',source:'/tick freeze'});const epoch=h.a.view.envelope!.state.progress.environment!.control.epoch;
 await h.a.dispatch({type:'processing-tick',ticks:10});assert.equal(h.a.view.envelope!.state.progress.world.tick,0);
 await h.a.transact({type:'console',source:'/tick step 3t'});await assert.rejects(h.a.transact({type:'processing-tick',ticks:5,controlEpoch:epoch}),/processing-inactive/);assert.equal(h.a.view.writable,true);
 await h.a.dispatch({type:'processing-tick',ticks:10});assert.equal(h.a.view.envelope!.state.progress.world.tick,3);
 await h.a.transact({type:'console',source:'/tick sprint 7t'});await h.a.dispatch({type:'processing-tick',ticks:10});assert.equal(h.a.view.envelope!.state.progress.world.tick,10);assert.equal(h.a.view.envelope!.state.progress.environment!.control.frozen,true);
 await h.a.transact({type:'console',source:'/tick unfreeze'});await h.a.dispatch({type:'processing-tick',ticks:2});assert.equal(h.a.view.envelope!.state.progress.world.tick,12);
 await h.a.transact({type:'console',source:'/tick freeze'});await h.a.transact({type:'console',source:'/tick step 10t'});await h.a.transact({type:'console',source:'/tick sprint 7t'});await h.a.dispatch({type:'processing-tick',ticks:7});
 assert.equal(h.a.view.envelope!.state.progress.environment!.control.stepTicks,3);
 await h.a.transact({type:'console',source:'/tick freeze'});assert.equal(h.a.view.envelope!.state.progress.environment!.control.stepTicks,0);
});

test('commands are locked, write failures are atomic, reset rejects stale commands and restores native defaults',async()=>{
 const h=await owners();const before=h.raw;h.deny(true);await assert.rejects(h.a.transact({type:'console',source:'/weather rain'}),/write-failed/);assert.equal(h.raw,before);
 h.deny(false);await h.a.refresh();await h.a.transact({type:'console',source:'/tick rate 40'});await h.b.transact({type:'console',source:'/time set 4000'});await h.a.refresh();assert.equal(h.a.view.envelope!.state.progress.environment!.control.tickRate,40);
 await h.a.reset(token(h.a.view.envelope!));await assert.rejects(h.b.transact({type:'console',source:'/time set 5000'}),/stale-session/);assert.deepEqual(h.a.view.envelope!.state.progress.environment,emptyEnvironment());
});

test('p9 environment migration preserves every original value and rejects malformed additional fields',async()=>{
 const state=initialState(),env:any={...emptyEnvironment(),version:1};delete env.control;delete env.clearWeatherTime;env.dayTicks=65432;env.raining=true;state.progress.environment=env;
 const body={format:1,contentVersion:'p9-environment-1',vanillaVersion:'26.3',generation:'old-env',revision:20,state},raw=JSON.stringify({...body,checksum:await checksum(body)}),read=await decode(raw);
 assert.equal(read.migrated,true);assert.equal(read.envelope.contentVersion,'p9-commands-1');assert.equal(read.envelope.state.progress.environment!.dayTicks,65432);assert.equal(read.envelope.state.progress.environment!.raining,true);
 const sealed=await seal(read.envelope.state,'old-env',21);assert.equal((await decode(JSON.stringify(sealed))).migrated,false);
 env.extra=true;await assert.rejects(decode(JSON.stringify({...body,checksum:await checksum(body)})),/migration-failed/);
});

test('server rate changes elapsed tick sampling without rounding away fractional ownership time',()=>{
 const c=new TickClock(0);assert.equal(c.sample(125,40),5);assert.equal(c.sample(135,40),0);assert.equal(c.sample(150,40),1);
 const low=new TickClock(0);assert.equal(low.sample(999,1),0);assert.equal(low.sample(1000,1),1);
});

test('formal processing owner rebases on a committed rate change, not on its next polling turn',async()=>{
 const h=await owners(),saved=Object.fromEntries(['performance','document','window','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));let now=0,poll:(()=>void)|undefined;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false})});
 Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{setInterval(fn:()=>void){poll=fn;return 0;},setTimeout:(fn:()=>void)=>setTimeout(fn,0)})});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_name:string,_options:unknown,fn:(lock:object)=>Promise<void>)=>fn({})}}});
 const stop=processingClock(h.a);
 try{
  now=100;await h.a.transact({type:'console',source:'/tick rate 40'});now=250;poll!();
  for(let i=0;i<100&&h.a.view.envelope!.state.progress.world.tick<6;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(h.a.view.envelope!.state.progress.world.tick,6);
  assert.equal(h.a.listeners.size,1);stop();assert.equal(h.a.listeners.size,0);now=500;poll!();assert.equal(h.a.view.envelope!.state.progress.world.tick,6);
 }finally{stop();for(const [key,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});

test('original marker values and periods match the shipped native day data',()=>{
 const day=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/data/minecraft/timeline/day.json',import.meta.url),'utf8'));
 for(const [key,value] of Object.entries(TIME_MARKERS)){const native=day.time_markers['minecraft:'+key];assert.equal(typeof native==='number'?native:native.ticks,value);}assert.equal(day.period_ticks,24000);
});

test('real NativeSky moves clouds and stars, unrelated snapshots do not reset phase, pause freezes stars independently',()=>{
 const perf=Object.getOwnPropertyDescriptor(globalThis,'performance'),doc=Object.getOwnPropertyDescriptor(globalThis,'document');let now=1000;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 const image={width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([255,255,255,255]),width:1,height:1})})};
 const entries=['timeline/day','timeline/moon','dimension_type/overworld'].map(name=>['data/minecraft/'+name+'.json',JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/data/minecraft/'+name+'.json',import.meta.url),'utf8'))] as [string,any]);
 const sky=new NativeSky({documents:new Map(entries),guiImages:{get:()=>image}} as any),renderer={render(){}} as any,camera=new PerspectiveCamera(),env=emptyEnvironment();env.dayTicks=18000;
 try{
  sky.sync(env,{time:'game',weather:'game'},100);sky.render(renderer,camera,1000);const before={...sky.report};
  now=1100;sky.sync(structuredClone(env),{time:'game',weather:'game'},100);sky.render(renderer,camera,now);assert.equal(sky.report.partial,2);assert.notEqual(sky.report.starAngle,before.starAngle);assert.ok((sky.report.cloudWind as number)>(before.cloudWind as number));
  env.control.advanceTime=false;now=1250;sky.sync(env,{time:'game',weather:'game'},105);sky.render(renderer,camera,now);const stars=sky.report.starAngle,wind=sky.report.cloudWind;
  for(let i=0;i<20;i++)tickEnvironment(env);now=2250;sky.sync(env,{time:'game',weather:'game'},125);sky.render(renderer,camera,now);assert.equal(sky.report.starAngle,stars);assert.notEqual(sky.report.cloudWind,wind);
  env.control.frozen=true;now=2500;sky.sync(env,{time:'game',weather:'game'},125);sky.render(renderer,camera,now);const frozen={...sky.report};sky.render(renderer,camera,3500);assert.equal(sky.report.cloudWind,frozen.cloudWind);assert.equal(sky.report.starAngle,frozen.starAngle);
 }finally{sky.dispose();if(perf)Object.defineProperty(globalThis,'performance',perf);if(doc)Object.defineProperty(globalThis,'document',doc);else Reflect.deleteProperty(globalThis,'document');}
});

test('formal chat completion cycles without rebuilding prefixes or passing game keys through the field',()=>{
 const input={value:'/we',selectionStart:3,setSelectionRange(a:number){this.selectionStart=a;}},view=Object.assign(Object.create(GameChat.prototype),{input,completion:null,paint(){}}) as GameChat;
 view.complete();assert.equal(input.value,'/weather');input.value='/weather ';input.selectionStart=9;view.completion=null;view.complete();assert.equal(input.value,'/weather clear');view.complete();assert.equal(input.value,'/weather rain');view.complete(true);assert.equal(input.value,'/weather clear');
});

test('supported native option buttons share a center and leave space for reset and footer at narrow widths',()=>{
 for(const width of [196,320,480]){const flow=optionFlow(width,4);assert.ok(flow.buttonWidth<=width-16);assert.equal(flow.resetY,67+Math.ceil(4/flow.columns)*24);assert.ok(flow.resetY+20<207);}
});
