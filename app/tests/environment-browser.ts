/** VERIFICATION_ONLY: render production sky/weather at controlled clocks without writing samples into a save. */
import {observeTimings} from '../web/src/performance.ts';
import type {Timing} from '../web/src/performance.ts';
import {Vector3} from 'three';
import {SceneView} from '../web/src/render/scene.ts';
import {mount} from '../web/src/app.ts';
import {emptyEnvironment} from '../web/src/domain/environment.ts';
import type {Progress} from '../web/src/domain/types.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
/** Retained renderer identity is observed from the actual formal mount. */
let actual:SceneView|null=null,latest:Progress|null=null,sample:{time:number;rain:boolean;thunder:boolean;snow:boolean;lightning?:boolean;fixedTick?:number}|null=null;
const sync=SceneView.prototype.syncWorld;
SceneView.prototype.syncWorld=function(p){actual=this;latest=p;sync.call(this,p);apply();};
/** Apply a labelled display-only sample; no domain/save API is called. */
function apply():void{if(!actual?.sky||!latest||!sample)return;const e={...emptyEnvironment(),dayTicks:sample.time,raining:sample.rain,thundering:sample.thunder,rainLevel:sample.rain?1:0,thunderLevel:sample.thunder?1:0};if(sample.lightning)e.control.frozen=true;actual.sky.state=e;actual.sky.preferences=actual.skySettings={time:'game',weather:sample.snow?'real':'game'};actual.sky.realRain=e.rainLevel;actual.sky.realThunder=e.thunderLevel;actual.sky.weatherOverride=sample.snow?{rain:1,thunder:0,snow:true}:null;actual.environmentProgress={...latest,environment:e};if(sample.lightning)actual.sky.sync(e,actual.skySettings,sample.fixedTick!);actual.requestRender();}
await mount('game');
const controls=document.createElement('div');controls.id='environment-fixture';controls.style.cssText='position:fixed;bottom:80px;right:0;z-index:99;display:flex;gap:4px;flex-wrap:wrap';document.body.append(controls);
for(const [name,time,rain,thunder,snow] of [['Dawn',0,false,false,false],['Noon',6000,false,false,false],['Moonrise',13000,false,false,false],['Night',18000,false,false,false],['Rain',6000,true,false,false],['Thunder',6000,true,true,false],['Snow',6000,true,false,true]] as const){const b=document.createElement('button');b.textContent='TEST '+name;b.onclick=()=>{sample={time,rain,thunder,snow};apply();};controls.append(b);}
const clear=document.createElement('button');clear.textContent='TEST ordinary clock';clear.onclick=()=>{sample=null;if(actual&&latest){actual.weather?.clear();sync.call(actual,latest);}};controls.append(clear);
const view=document.createElement('button');view.textContent='TEST look toward sky';view.onclick=()=>{if(actual){actual.camera.rotation.set(.5,Math.PI/2-.2,0,'YXZ');actual.camera.updateMatrixWorld(true);actual.requestRender();}};controls.append(view);
const output=document.createElement('pre');output.id='environment-evidence';output.hidden=true;document.body.append(output);
/** Observe production render diagnostics without altering any clock or DOM input path. */
const timer=setInterval(()=>{output.textContent=JSON.stringify({at:performance.now(),size:[innerWidth,innerHeight],dpr:devicePixelRatio,sample,environment:actual?.sky?.report,columns:actual?.precipitation?.columns,geometry:actual?.renderer.info.memory.geometries,drawCalls:actual?.renderer.info.render.calls,panel:document.querySelector('.world-navigation')?.getAttribute('data-expanded')});},100);
window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});

/** Exercise the existing plains look limits through labelled display controls, not synthetic mouse claims. */
for (const [label, yaw] of [['Default', 0], ['Left limit', 1], ['Right limit', -1]] as const) {
    const button = document.createElement('button'); button.textContent = 'TEST Plains ' + label;
    /** Set a bounded fixture pose without moving the eye or modifying the save. */
    button.onclick = () => {
        if (!actual || actual.worldId !== 'plains') return;
        actual.look.yaw = yaw * actual.look.maxYaw; actual.look.pitch = 0;
        actual.camera.rotation.set(actual.basePitch, actual.look.yaw, 0, 'YXZ');
        actual.camera.updateMatrixWorld(true); actual.requestRender();
        output.dataset.pose = JSON.stringify({fixture: true, label, eye: actual.camera.position.toArray(), yaw: actual.look.yaw, pitch: actual.basePitch});
    };
    controls.append(button);
}

/** VERIFICATION_ONLY: collect browser cadence and existing phase timings, without changing game simulation. */
let measuring=false,previous=0,started=0,raf=0,intervals:number[]=[],spans:Timing[]=[];
const performanceButton=document.createElement('button');performanceButton.textContent='TEST measure 60 seconds';controls.append(performanceButton);
const results=document.createElement('pre');results.id='environment-performance';results.hidden=true;document.body.append(results);
/** Summarize independently observed frame intervals or execution spans. @param {number[]} values Actual samples. @return {object} Bounded distribution. */
function distribution(values:number[]){const v=values.toSorted((a,b)=>a-b);return{count:v.length,mean:v.reduce((a,b)=>a+b,0)/(v.length||1),p50:v[Math.floor(v.length*.5)]??0,p95:v[Math.floor(v.length*.95)]??0,p99:v[Math.floor(v.length*.99)]??0,max:v.at(-1)??0,over16_7:v.filter(x=>x>16.7).length,over33_3:v.filter(x=>x>33.3).length,over50:v.filter(x=>x>50).length};}
/** End one labelled timed cohort, leaving raw timing arrays for audit. */
function finishMeasurement():void{measuring=false;observeTimings(null);const phases=Object.fromEntries([...new Set(spans.map(s=>s.name))].map(name=>[name,distribution(spans.filter(s=>s.name===name).map(s=>s.duration))]));results.textContent=JSON.stringify({duration:performance.now()-started,size:[innerWidth,innerHeight],dpr:devicePixelRatio,hidden:document.hidden,sample,frames:distribution(intervals),phases,intervals,spans,environment:actual?.sky?.report,triangles:actual?.renderer.info.render.triangles,drawCalls:actual?.renderer.info.render.calls,memory:actual?.renderer.info.memory});performanceButton.textContent='TEST measure 60 seconds';}
/** Observe cadence without triggering a second scene render loop. @param {number} now Browser frame timestamp. */
function frame(now:number):void{if(!measuring)return;if(previous)intervals.push(now-previous);previous=now;if(now-started>=60000){finishMeasurement();return;}raf=requestAnimationFrame(frame);}
performanceButton.onclick=()=>{if(measuring)return;intervals=[];spans=[];previous=0;started=performance.now();measuring=true;results.textContent='';performanceButton.textContent='TEST measuring';observeTimings(span=>spans.push(span),true);raf=requestAnimationFrame(frame);};
window.addEventListener('pagehide',()=>{measuring=false;cancelAnimationFrame(raf);observeTimings(null);},{once:true});

for(const [name,body] of [['sun','sun'],['moon','moon']] as const){const b=document.createElement('button');b.textContent='TEST look at '+name;b.onclick=()=>{if(actual?.sky){actual.sky.scene.updateMatrixWorld(true);const direction=actual.sky[body].getWorldPosition(new Vector3());actual.camera.lookAt(actual.camera.position.clone().add(direction));actual.camera.updateMatrixWorld(true);actual.requestRender();}};controls.append(b);}

/** VERIFICATION_ONLY: hold a real native entity frame for browser geometry inspection; no saved state is changed. */
const lightning=document.createElement('button');lightning.textContent='TEST native lightning frame';lightning.onclick=()=>{if(!actual?.weather||!latest)return;const tick=latest.world.tick;sample={time:6000,rain:true,thunder:true,snow:false,lightning:true,fixedTick:tick};apply();actual.weather.clear();actual.weather.update(tick,latest.scene,actual.camera.position.toArray(),actual.precipitation!.heights,{rain:1,thunder:1,snow:false});actual.weather.strike([4,0,-16]);actual.weather.update(tick+1,latest.scene,actual.camera.position.toArray(),actual.precipitation!.heights,{rain:1,thunder:1,snow:false});actual.requestRender();};controls.append(lightning);
