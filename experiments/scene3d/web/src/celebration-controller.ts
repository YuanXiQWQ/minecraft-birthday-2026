/** Fixed-seed developer celebration orchestration, driven exclusively by the existing scene frame loop. */
import { Vector3 } from 'three';
import { celebrationDepthProbe } from './celebration-checks.ts';
import type { SceneAdapter,SceneEffect } from './scene-adapter.ts';
import { loadCelebrationPack } from './celebration-pack.ts';
import type { CelebrationPack } from './celebration-pack.ts';
import { CelebrationAudio } from './celebration-audio.ts';
import { FireworkBatch } from './firework-batch.ts';
import { FireworkSimulation,SeedRandom,SHAPES,fireworkSound,starterLifetime } from './firework-simulation.ts';
import type { Shape,Explosion,Cue,Vec } from './firework-simulation.ts';
import { FX_TEXT as F } from './celebration-labels.ts';
/** One isolated run never grants progress, places cake or writes the save namespace. */
export class CelebrationController implements SceneEffect {
  adapter:SceneAdapter;audio=new CelebrationAudio();pack:CelebrationPack|null=null;batch:FireworkBatch|null=null;simulation:FireworkSimulation|null=null;
  root=document.createElement('section');status=document.createElement('output');diagnostic=document.createElement('pre');exportBox=document.createElement('pre');
  seed=document.createElement('input');trail=document.createElement('input');twinkle=document.createElement('input');far=document.createElement('input');sound=document.createElement('select');
  runs:object[]=[];lastRun:object|null=null;errors:string[]=[];visibility:object[]=[];checks:object|null=null;policy:object|null=null;
  active=false;paused=false;hold=false;disposed=false;generation=0;anchor=0;lastWall=0;delta=0;elapsed=0;audioOffset=0;runName='';runSeed=0;
  frames:{t:number;frameMs:number;particles:number;visible:number;calls:number;triangles:number;geometries:number;textures:number}[]=[];
  timeline:object[]=[];seenBursts=0;lastPublish=0;visibilityHandler:(event:Event)=>void;iframes=new Set<HTMLIFrameElement>();policyCleanups=new Set<()=>void>();
  /** Attach diagnostics and one owned scene callback without adding another RAF or changing camera controls.
   * @param {SceneAdapter} adapter Existing first-person scene.
   * @param {HTMLElement} host Existing hidden developer panel.
   */
  constructor(adapter:SceneAdapter,host:HTMLElement){
    this.adapter=adapter;adapter.effect=this;this.root.className='card';const title=document.createElement('h2');title.textContent=F.title;const note=document.createElement('p');note.className='help';note.textContent=F.note;this.root.append(title,note);this.status.textContent=F.blocked;
    this.diagnostic.id='celebration-evidence';this.exportBox.id='celebration-record';this.exportBox.hidden=true;this.seed.type='number';this.seed.value='2632026';this.seed.setAttribute('aria-label',F.seed);
    const controls=document.createElement('div');controls.className='toolbar';controls.append(this.makeButton(F.load,()=>{void this.load();}),this.makeButton(F.enable,()=>{void this.audio.enable().then(ok=>{this.status.textContent=ok?F.ready:F.activation;this.publish();});}),this.seed);
    for(const [input,label,checked]of [[this.trail,F.trail,true],[this.twinkle,F.twinkle,true],[this.far,F.far,false]] as const){input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',label);const l=document.createElement('label');l.append(input,document.createTextNode(label));controls.append(l);}
    for(const shape of SHAPES)controls.append(this.makeButton(F.names[shape],()=>{void this.play(shape);}));
    controls.append(this.makeButton(F.combo,()=>{void this.play('combined');}),this.makeButton(F.cancel,()=>this.cancel('developer')),this.makeButton(F.pause,()=>{void this.pause('manual');}),this.makeButton(F.resume,()=>{void this.resume();}),this.makeButton(F.freeze,()=>{this.hold=!this.hold;this.publish();}));
    const mute=document.createElement('input');mute.type='checkbox';mute.setAttribute('aria-label',F.mute);const muteLabel=document.createElement('label');muteLabel.append(mute,document.createTextNode(F.mute));
    const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.value='.2';volume.setAttribute('aria-label',F.volume);
    for(const input of [mute,volume])input.addEventListener('input',()=>{this.audio.gain(Number(volume.value),mute.checked);this.publish();});
    this.sound.setAttribute('aria-label',F.sound);controls.append(muteLabel,volume,this.sound,this.makeButton(F.playSound,()=>{void this.soundProbe();}),this.makeButton(F.failure,()=>{void this.audio.decodeFailureProbe().then(()=>this.publish());}),this.makeButton(F.autoplay,()=>this.autoplayProbe()),this.makeButton(F.checks,()=>this.verify()),this.makeButton(F.export,()=>{this.exportBox.hidden=false;this.exportBox.textContent=JSON.stringify(this.lastRun??this.snapshot(),null,2);this.status.textContent=F.exported;}));
    this.root.append(controls,this.status,this.diagnostic,this.exportBox);host.append(this.root);
    this.visibilityHandler=(event:Event)=>{this.visibility.push({state:document.visibilityState,trusted:event.isTrusted,audioTime:this.audio.context.currentTime,simTime:this.elapsed});if(document.hidden&&(this.active||this.audio.sources.size>0))void this.pause('visibility');this.publish();};document.addEventListener('visibilitychange',this.visibilityHandler);this.publish();
  }
  /** Construct one localized developer button.
   * @param {string} label Externalized label.
   * @param {Function} action Diagnostic command.
   * @return {HTMLButtonElement} Native debug control.
   */
  makeButton(label:string,action:()=>void):HTMLButtonElement{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b;}
  /** Load actual original resources atomically; absent samples never instantiate a replacement visual.
   * @return {Promise<void>} Sample loading attempt.
   */
  async load():Promise<void>{
    this.cancel('reload');const generation=++this.generation;try{const pack=await loadCelebrationPack();if(this.disposed||generation!==this.generation)return;await this.audio.load(pack);if(this.disposed||generation!==this.generation)return;this.batch?.dispose();this.pack=pack;this.batch=new FireworkBatch(this.adapter,pack);this.sound.replaceChildren();for(const id of Object.keys(pack.events)){const o=document.createElement('option');o.value=o.textContent=id;this.sound.append(o);}this.status.textContent=F.ready;}
    catch(error){this.errors.push(String(error));this.status.textContent=F.blocked;}this.publish();
  }
  /** Create an author-selected finite air fixture; launch lead-in is an engineering timeline, not a rocket entity model.
   * @param {Shape|'combined'} shape Requested sample.
   * @return {Explosion[]} Original explosion parameters at bounded world coordinates.
   */
  plan(shape:Shape|'combined'):Explosion[]{return (shape==='combined'?SHAPES:[shape]).map((s,i)=>({shape:s,tick:24+i*10,position:[shape==='combined'?(i%3-1)*3+.5:.5,shape==='combined'?4.7+(i%2)*1.2:5.2,this.far.checked?-27:-7] as Vec,velocity:[.1,.2,-.1],colors:[0xff3300,0xffff00,0x66ccff],fade:[0xffffff,0x7733ff],trail:this.trail.checked,twinkle:this.twinkle.checked}));}
  /** Begin an explicitly triggered sample on the audio clock, with original cue delays and pitch ranges.
   * @param {Shape|'combined'} shape One shape or a staggered five-shape fixture.
   * @return {Promise<void>} Activation and scheduling completion.
   */
  async play(shape:Shape|'combined'):Promise<void>{
    this.cancel('replace');const generation=++this.generation;if(!this.pack||!this.batch||!this.audio.ready){this.status.textContent=F.blocked;return;}
    if(!await this.audio.enable()||this.disposed||generation!==this.generation){this.status.textContent=F.activation;return;}
    const plan=this.plan(shape);this.runSeed=Number(this.seed.value)>>>0;this.simulation=new FireworkSimulation(plan,this.runSeed);this.batch.begin();this.frames=[];this.timeline=[];this.seenBursts=0;this.elapsed=0;this.runName=shape;this.active=true;this.paused=false;this.hold=false;this.audioOffset=this.audio.records.length;this.audio.peak=0;this.anchor=this.audio.context.currentTime+.15;
    this.updateListener();const rng=new SeedRandom(this.runSeed^0x263),eye=this.adapter.camera.position;
    for(const e of plan){this.schedule({event:'entity.firework_rocket.launch',tick:e.tick-24,volume:3,pitch:1,position:[e.position[0],.5,e.position[2]],distanceDelay:false},0,rng.next());
      const distance=eye.distanceTo(new Vector3(...e.position)),blast=fireworkSound(e.shape==='large_ball',false,distance,rng.next());this.schedule({event:blast.event,tick:e.tick,volume:blast.volume,pitch:blast.pitch,position:e.position,distanceDelay:true},blast.delay,rng.next());
      if(e.twinkle){const twinkle=fireworkSound(false,true,distance,rng.next());this.schedule({event:twinkle.event,tick:e.tick+starterLifetime(1,true),volume:twinkle.volume,pitch:twinkle.pitch,position:e.position,distanceDelay:true},twinkle.delay,rng.next());}
    }this.status.textContent=F.playing;this.publish();
  }
  /** Record a shared visual/audio time coordinate before scheduling the original event.
   * @param {Cue} cue Source parameters.
   * @param {number} delay Quantized original propagation delay.
   * @param {number} variant Uniform selection sample.
   */
  schedule(cue:Cue,delay:number,variant:number):void{const when=this.anchor+cue.tick/20+delay;this.timeline.push({kind:'cue',...cue,delay,when,simSeconds:cue.tick/20});this.audio.schedule(cue,when,variant);}
  /** Play a selected original event for human listening without creating a gameplay Toast or XP system.
   * @return {Promise<void>} Explicit sound activation attempt.
   */
  async soundProbe():Promise<void>{
    if(!this.pack||!this.audio.ready){this.status.textContent=F.blocked;return;}if(!await this.audio.enable()){this.status.textContent=F.activation;return;}
    const id=this.sound.value,rng=new SeedRandom(Number(this.seed.value)),cue:Cue={event:id,tick:0,volume:id.includes('launch')?3:id.includes('firework')?20:id.includes('experience_orb')?.1:id.includes('levelup')?.75:1,pitch:id.includes('experience_orb')?(rng.next()-rng.next())*.35+.9:id.includes('twinkle')?.9+rng.next()*.15:id.includes('blast')?.95+rng.next()*.1:1,position:this.adapter.camera.position.toArray() as Vec,distanceDelay:false};
    this.updateListener();this.audio.peak=0;this.audio.schedule(cue,this.audio.context.currentTime+.05,rng.next());this.publish();
  }
  /** Align spatial sound with the existing eye station before scheduling and while any source remains active. */
  updateListener():void{const camera=this.adapter.camera;this.audio.listener(camera.position.toArray() as Vec,camera.getWorldDirection(new Vector3()).toArray() as Vec,new Vector3(0,1,0).applyQuaternion(camera.quaternion).toArray() as Vec);}
  /** Advance only from the shared AudioContext clock; hold pauses rendering state for developer screenshots only.
   * @param {number} time Existing RAF timestamp.
   * @param {number} delta Actual display interval.
   */
  frame(time:number,delta:number):void{
    this.lastWall=time;this.delta=delta;
    if(this.active||this.audio.sources.size)this.updateListener();
    if(this.audio.sources.size)this.audio.sample();if(!this.active||!this.simulation||!this.batch||this.paused)return;
    this.elapsed=Math.max(0,this.audio.context.currentTime-this.anchor);
    if(!this.hold){this.simulation.advance(this.elapsed);this.batch.update(this.simulation.particles,this.elapsed*20%1);}
    this.audio.sample();for(const burst of this.simulation.bursts.slice(this.seenBursts))this.timeline.push({kind:'visual-burst',...burst,targetAudio:this.anchor+burst.tick/20,observedAudio:this.audio.context.currentTime,observedWall:time});this.seenBursts=this.simulation.bursts.length;
    if(this.simulation.done()){this.batch.clear();if(this.audio.sources.size===0)this.finish('ended');}
  }
  /** Sample real submitted draw counters, keeping raw frames out of the frequently updated diagnostic DOM. */
  afterFrame():void{
    if(this.active&&!this.paused&&!this.hold){const r=this.adapter.renderer.info;this.frames.push({t:this.elapsed,frameMs:this.delta,particles:this.simulation?.particles.length??0,visible:this.batch?.visible??0,calls:r.render.calls,triangles:r.render.triangles,geometries:r.memory.geometries,textures:r.memory.textures});if(this.frames.length>6000)throw new Error('frame-evidence-capacity');}
    if(this.lastWall-this.lastPublish>250){this.lastPublish=this.lastWall;this.publish();}
  }
  /** Suspend both clocks for an explicit experiment pause or a real visibility transition.
   * @param {string} reason Background/manual cause.
   * @return {Promise<void>} Audio suspension completion.
   */
  async pause(reason:string):Promise<void>{this.paused=true;this.timeline.push({kind:'pause',reason,simTime:this.elapsed,audioTime:this.audio.context.currentTime});await this.audio.pause();this.status.textContent=F.paused;this.publish();}
  /** Resume the same clock and sample offsets through an explicit user gesture.
   * @return {Promise<void>} Resume attempt.
   */
  async resume():Promise<void>{if(await this.audio.enable()){this.paused=false;this.timeline.push({kind:'resume',simTime:this.elapsed,audioTime:this.audio.context.currentTime});this.status.textContent=F.playing;}this.publish();}
  /** Finalize immutable run evidence and release every per-play particle object.
   * @param {string} reason Normal ending or cancellation label.
   */
  finish(reason:string):void{
    if(!this.active)return;this.active=false;this.batch?.clear();const values=this.frames.map(f=>f.frameMs).filter(v=>v>0).sort((a,b)=>a-b);
    const summary={shape:this.runName,seed:this.runSeed,reason,elapsed:this.elapsed,spawned:this.simulation?.spawned,children:this.simulation?.children,peakParticles:this.simulation?.peak,frames:values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1),peakCalls:Math.max(0,...this.frames.map(f=>f.calls)),signalPeak:this.audio.peak,activeSources:this.audio.sources.size,batchCreated:this.batch?.created,batchReleased:this.batch?.released};
    this.lastRun={summary,environment:this.adapter.diagnostics(),plan:this.simulation?.plan,bursts:this.simulation?.bursts,frames:this.frames,timeline:this.timeline,audio:this.audio.records.slice(this.audioOffset),heard:'UNVERIFIED: hardware listening requires a person',limitations:['free-air only; no voxel collision','seeded distributions, not Java RNG/float bit parity','normal-alpha Three pipeline, no Java visual comparison']};this.simulation=null;this.runs.push(summary);this.runs=this.runs.slice(-15);this.status.textContent=reason==='ended'?F.finished:F.cancelled;this.publish();
  }
  /** Cancel pending activation, queued sounds and finite particles without changing any scene/game state.
   * @param {string} reason Cancellation source.
   */
  cancel(reason:string):void{this.generation++;this.audio.cancel(reason);this.finish(reason);if(this.audio.records.length>1000)this.audio.records.splice(0,this.audio.records.length-1000);this.batch?.clear();this.paused=false;this.hold=false;if(!this.disposed)this.publish();}
  /** Verify all shapes/effects deterministically and exercise the actual batch lifecycle without claiming human perception. */
  verify():void{
    if(!this.pack||!this.batch){this.checks={status:'BLOCKED',passed:0};this.publish();return;}if(this.active)this.cancel('checks');
    const rows:object[]=[];for(const shape of SHAPES)for(const [trail,twinkle]of [[false,false],[true,false],[false,true],[true,true]]){
      const plan=this.plan(shape).map(e=>({...e,tick:0,trail,twinkle})),sim=new FireworkSimulation(plan,263);sim.step();const initial=sim.particles.filter(p=>!p.flash).length;
      for(let i=0;i<110;i++)sim.step();rows.push({shape,trail,twinkle,initial,children:sim.children,ended:sim.done(),pass:initial>0&&sim.done()&&(trail?sim.children>0:sim.children===0)});
    }for(let i=0;i<6;i++){this.batch.begin();this.batch.update([],0);this.batch.clear();}
    const depth=celebrationDepthProbe(this.adapter,this.batch) as {passed:boolean};
    this.checks={depth,status:rows.every((r:any)=>r.pass)&&depth.passed?'PASS':'FAIL',passed:rows.filter((r:any)=>r.pass).length,rows,batchBalanced:this.batch.created===this.batch.released,singleSceneLoop:true,source:'actual browser simulation/batch; perceptual parity unverified'};this.publish();
  }
  /** Probe a browser-denied autoplay policy in an isolated opaque-origin iframe using a silent buffer.
   * No generated sound is used as a replacement for an original event.
   */
  autoplayProbe():void{
    const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.allow="autoplay 'none'";frame.title=F.probe;frame.hidden=true;this.iframes.add(frame);
    const token=`p2-policy-${performance.now()}`;let timer:ReturnType<typeof setTimeout>;
    const receive=(event:MessageEvent)=>{if(event.source!==frame.contentWindow||event.data?.token!==token)return;this.policy=event.data;this.status.textContent=F.probe;cleanup();this.publish();};
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();this.iframes.delete(frame);this.policyCleanups.delete(cleanup);};this.policyCleanups.add(cleanup);window.addEventListener('message',receive);
    frame.srcdoc=`<script>const c=new AudioContext();c.resume().catch(()=>{});const s=c.createBufferSource();s.buffer=c.createBuffer(1,128,c.sampleRate);s.connect(c.destination);s.start();setTimeout(()=>{parent.postMessage({token:${JSON.stringify(token)},state:c.state,userActive:navigator.userActivation.isActive,policyAllowed:(document.permissionsPolicy||document.featurePolicy)?.allowsFeature('autoplay'),silentProbe:true},'*');s.stop();s.disconnect();c.close();},250)<\/script>`;
    document.body.append(frame);timer=setTimeout(()=>{this.policy={status:'UNVERIFIED: iframe did not reply'};cleanup();this.publish();},2500);
  }
  /** Return a compact auditable live state, never raw textures, buffers or full frame arrays.
   * @return {object} Metadata for browser assertions and manual review.
   */
  snapshot():object{return {resourceStatus:this.pack?'original-local':'BLOCKED',active:this.active,paused:this.paused,hold:this.hold,elapsed:this.elapsed,particles:this.simulation?.particles.length??0,visible:this.batch?.visible??0,batch:{created:this.batch?.created,released:this.batch?.released,attached:!!this.batch?.mesh},audio:{state:this.audio.context.state,initial:this.audio.initial,decoded:this.audio.buffers.size,activeSources:this.audio.sources.size,nodeChains:this.audio.chains.size,volume:this.audio.volume,muted:this.audio.muted,gain:this.audio.master.gain.value,peak:this.audio.peak,records:this.audio.records.slice(-25)},runs:this.runs,checks:this.checks,policy:this.policy,visibility:this.visibility,loading:this.pack?.loading,errors:this.errors,heard:'UNVERIFIED',clock:'AudioContext; fixed simulation 20Hz',frameLoop:'existing scene adapter only'};}
  /** Publish only compact bounded diagnostics while animation continues. */
  publish():void {if(this.disposed)return;this.diagnostic.textContent=JSON.stringify(this.snapshot(),null,2);}
  /** Remove the owned scene hook/listeners, cancel sound and release atlas/geometry/context resources. */
  dispose():void {if(this.disposed)return;this.cancel('scene-dispose');this.disposed=true;document.removeEventListener('visibilitychange',this.visibilityHandler);for(const cleanup of [...this.policyCleanups])cleanup();this.batch?.dispose();this.audio.dispose();if(this.adapter.effect===this)this.adapter.effect=null;this.root.remove();}
}
