/** Real WebGL2 scene projection; domain identity, camera picking and resource ownership stay explicit. */
import { AmbientLight, Box3, Box3Helper, BoxGeometry, Color, DirectionalLight, Group, LineBasicMaterial, LineSegments,
  BufferGeometry, Fog, Mesh, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { setEyeView } from './camera.ts';
import type { View } from './camera.ts';
import { VanillaModels } from './vanilla-models.ts';
import type { VanillaPack } from './vanilla-pack.ts';
export type { View } from './camera.ts';
import { DebugModels } from './debug-models.ts';
import { edges, key } from './domain.ts';
import {FrameProfile} from './frame-profile.ts';
import type { Cell, Facing, Kind, Layout } from './domain.ts';

export interface Pick { id: string; role: 'device' | 'ground' | 'occluder'; point: Cell; normal: Cell; candidate: Cell }
export interface SceneEffect {frame:(time:number,delta:number)=>void;afterFrame:()=>void;dispose:()=>void;pause?:(reason:string)=>Promise<void>}
/** A render-only stone probe stays outside the legal build cells to prevent hidden occupancy conflicts. */
export const STONE_SAMPLE_CELL:Cell=[-5,0,-2];

/** Require an actual WebGL2 context; an unavailable backend never substitutes a two-dimensional scene.
 * @param {HTMLCanvasElement} canvas Native render surface, or an explicit failure-test injection.
 * @return {WebGL2RenderingContext} Actual browser context.
 */
export function requireWebGL2(canvas:HTMLCanvasElement):WebGL2RenderingContext{const gl=canvas.getContext('webgl2',{antialias:true,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL2 unavailable: real 3D rendering is required');return gl;}

/** Convert a visible world-space face hit into its adjacent logical cell, including negatives.
 * @param {Cell} point World-space point.
 * @param {Cell} normal Axis-aligned outward normal.
 * @return {Cell} Candidate cell on the visible side of the face.
 */
export function candidateCell(point: Cell, normal: Cell): Cell { return point.map((v,i) => Math.floor(v + normal[i] * .001)) as Cell; }

/** Read bounded geometry/renderer counters; memory counts are not GPU byte measurements. */
export class SceneAdapter {
  /** Count owned live adapters, independently of browser-internal rendering work. */
  static live=0;
  scene = new Scene();
  camera = new PerspectiveCamera(70, 1, .1, 100);
  raycaster = new Raycaster();
  renderer: WebGLRenderer;
  models = new DebugModels();
  vanilla:VanillaModels|null=null;
  lit=false;
  stoneRoot=new Group();
  sampleRoot=new Group();
  sampleId:string|null=null;
  objects = new Map<string, Group>();
  signatures = new Map<string, string>();
  environment = new Group();
  deviceRoot = new Group();
  preview: Group | null = null;
  previewSignature = '';
  lines: LineSegments | null = null;
  selected = new Box3Helper(new Box3(), 0xffca80);
  observer: ResizeObserver;
  frameHandle = 0;
  disposed = false;
  view: View = 'Front';
  debugVisible = false;
  grid: LineSegments;
  intervals: number[] = [];
  lastFrame = 0;
  sampleSink: ((time: number, delta: number) => void) | null = null;
  onResize: (() => void) | null = null;
  effect:SceneEffect|null=null;
  profile:FrameProfile;
  queuedRaf=0;contextLost=false;contextEvents:object[]=[];onContextChange:((lost:boolean)=>void)|null=null;contextProbeCleanup:(()=>void)|null=null;
  lostHandler:(event:Event)=>void;restoredHandler:(event:Event)=>void;

  /** Allocate one perspective WebGL2 renderer and start the real frame loop.
   * @param {HTMLElement} host Canvas host.
   * @param {string} label Localized canvas label.
   */
  constructor(host: HTMLElement, label: string) {
    const canvas=document.createElement('canvas');this.renderer = new WebGLRenderer({canvas,context:requireWebGL2(canvas),antialias:true,powerPreference:'high-performance'});
    this.profile=new FrameProfile(this.renderer.getContext() as WebGL2RenderingContext);
    this.lostHandler=(event:Event)=>{event.preventDefault();if(this.disposed)return;this.contextLost=true;this.contextEvents.push({type:'lost',trusted:event.isTrusted,time:performance.now(),nativeLost:this.renderer.getContext().isContextLost()});this.profile.lost();void this.effect?.pause?.('webgl-context-lost');this.onContextChange?.(true);};
    this.restoredHandler=(event:Event)=>{if(this.disposed)return;this.contextLost=false;this.profile.restored();this.contextEvents.push({type:'restored',trusted:event.isTrusted,time:performance.now(),nativeLost:this.renderer.getContext().isContextLost()});this.onContextChange?.(false);};
    canvas.addEventListener('webglcontextlost',this.lostHandler);canvas.addEventListener('webglcontextrestored',this.restoredHandler);SceneAdapter.live++;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', label);
    this.renderer.domElement.setAttribute('tabindex', '0');
    host.append(this.renderer.domElement); this.scene.background = new Color(0x9bc7de);
    this.scene.fog = new Fog(0x9bc7de, 22, 48);
    this.scene.add(this.environment, this.deviceRoot, this.selected); this.selected.visible = false;
    this.environment.add(this.stoneRoot,this.sampleRoot);
    this.scene.add(new AmbientLight(0xdbeaf7, 2));
    const light = new DirectionalLight(0xffedca, 3); light.position.set(-4,8,5); this.scene.add(light);
    const floor = this.models.part(this.environment,new BoxGeometry(48,.6,48),this.models.material('floor',0x638447),[.5,-.3,-3]);
    floor.userData = { id: 'ground', role: 'ground' };
    // Authored scenery uses original debug geometry, with no resource or world simulation.
    for (const [x,z,height] of [[-7,-5,3],[-6,-10,4],[7,-6,4],[9,-12,5]]) {
      const trunk=this.models.part(this.environment,new BoxGeometry(1,height,1),this.models.material('wood',0x69503a),[x,height/2,z]);
      const crown=this.models.part(this.environment,new BoxGeometry(3,2,3),this.models.material('leaves',0x3b6744),[x,height+.5,z]);
      for (const mesh of [trunk,crown]) mesh.userData={id:'scenery',role:'occluder'};
    }
    for (let x=-5;x<=5;x++) {
      const height=2+(Math.abs(x)%3);
      const rock=this.models.part(this.environment,new BoxGeometry(1,height,2),this.models.material('rock',0x7c8587),[x,height/2,-11]);
      rock.userData={id:'scenery',role:'occluder'};
    }
    const blocker = this.models.part(this.environment,new BoxGeometry(1,1.8,.45),this.models.material('barrier',0xb77770),[3.5,.9,1.5]);
    blocker.userData = { id: 'barrier', role: 'occluder' };
    for (const pos of [[-3.5,.06,-2.5],[4.5,.06,-2.5]]) {
      const marker = this.models.part(this.environment,new BoxGeometry(.96,.12,.96),this.models.material('protected',0xd0a65b),pos);
      marker.userData = { id: 'protected', role: 'occluder' };
    }
    const gridPoints: Vector3[] = [];
    for(let x=-4;x<=5;x++) gridPoints.push(new Vector3(x,.003,-3),new Vector3(x,.003,4));
    for(let z=-3;z<=4;z++) gridPoints.push(new Vector3(-4,.003,z),new Vector3(5,.003,z));
    this.grid=new LineSegments(new BufferGeometry().setFromPoints(gridPoints),new LineBasicMaterial({color:0x9ca9a4}));
    this.grid.visible=false; this.environment.add(this.grid);
    this.updateStone();
    this.observer = new ResizeObserver(() => this.resize(host.clientWidth, host.clientHeight)); this.observer.observe(host);
    this.resize(host.clientWidth,host.clientHeight); this.animate(0);
  }

  /** Keep projection and backing pixels consistent with actual CSS canvas dimensions.
   * @param {number} width CSS width.
   * @param {number} height CSS height.
   */
  resize(width: number, height: number): void {
    this.renderer.setSize(Math.max(1,width),Math.max(1,height),false); this.camera.aspect = Math.max(1,width)/Math.max(1,height);
    this.setView(this.view); this.onResize?.();
  }

  /** Choose one bounded camera preset; this never changes domain coordinates.
   * @param {View} view Author-controlled viewing preset.
   */
  setView(view: View): void {
    this.view = view;
    setEyeView(this.camera,view);
  }

  /** Reveal diagnostic grid and adjacency overlays without changing pick targets.
   * @param {boolean} visible Whether the developer panel is open.
   */
  setDebugVisible(visible: boolean): void {
    this.debugVisible=visible; this.grid.visible=visible;
    if(this.lines) this.lines.visible=visible;
  }

  /** Change model factories without mutating logical layout or the accepted first-person camera.
   * @param {VanillaPack|null} pack Verified versioned resources or explicit diagnostic fallback.
   */
  setVanilla(pack:VanillaPack|null):void {
    const next=pack?new VanillaModels(pack):null;
    this.showPreview(null,'furnace','north',false);
    for(const object of this.objects.values())this.models.release(object);
    this.objects.clear();this.signatures.clear();
    this.models.release(this.stoneRoot);this.models.release(this.sampleRoot);
    this.stoneRoot=new Group();this.sampleRoot=new Group();this.sampleId=null;this.environment.add(this.stoneRoot,this.sampleRoot);
    this.vanilla?.dispose();this.vanilla=next;this.updateStone();
  }

  /** Keep one unit stone sample separate from the deliberately schematic environment. */
  updateStone():void {
    if(this.vanilla){const stone=this.vanilla.sample(this.vanilla.pack.samples.find(s=>s.block==='stone')!);this.stoneRoot.add(stone);}
    else this.models.part(this.stoneRoot,new BoxGeometry(1,1,1),this.models.material('stone-sample',0x7c8587),[.5,.5,.5]);
    this.stoneRoot.position.set(...STONE_SAMPLE_CELL);this.stoneRoot.traverse(o=>{o.userData={...o.userData,id:'stone-sample',role:'occluder'};});
  }

  /** Display one exact blockstate in the existing view without adding a domain instance.
   * @param {string|null} id Explicit original variant choice or null to hide the gallery sample.
   */
  showSample(id:string|null):void {
    this.models.release(this.sampleRoot);this.sampleRoot=new Group();this.environment.add(this.sampleRoot);this.sampleId=id;
    if(id){const sample=this.vanilla?.pack.samples.find(s=>s.id===id);if(!sample)throw new Error('missing-original-state');
      this.sampleRoot.add(this.vanilla!.sample(sample));this.sampleRoot.position.set(-2,0,2);
      this.sampleRoot.traverse(o=>{o.userData={...o.userData,id:'gallery-sample',role:'occluder'};});}
    this.scene.updateMatrixWorld(true);
  }

  /** Synchronize immutable logical instances without recreating unchanged geometry.
   * @param {Layout} layout Logical state only.
   */
  sync(layout: Layout): void {
    const live = new Set(layout.instances.map(e => e.id));
    for (const [id,object] of this.objects) if (!live.has(id)) { this.models.release(object); this.objects.delete(id); this.signatures.delete(id); }
    for (const e of layout.instances) {
      const signature = `${e.kind}:${key(e.cell)}:${e.facing}:${this.lit}`;
      if (this.signatures.get(e.id) === signature) continue;
      const old = this.objects.get(e.id); if (old) this.models.release(old);
      const model = this.vanilla?this.vanilla.device(e.kind,e.facing,this.lit):this.models.device(e.kind,e.facing); model.position.set(...e.cell);
      model.traverse(o => { o.userData = { ...o.userData,id: e.id, role: 'device' }; });
      this.deviceRoot.add(model); this.objects.set(e.id,model); this.signatures.set(e.id,signature);
    }
    if (this.lines) { this.lines.geometry.dispose(); (this.lines.material as LineBasicMaterial).dispose(); this.lines.removeFromParent(); this.lines = null; }
    const points: Vector3[] = [];
    for (const edge of edges(layout)) for (const id of [edge.from,edge.to]) points.push(new Vector3(...layout.instances.find(e => e.id === id)!.cell).addScalar(.5));
    if (points.length) {
      this.lines = new LineSegments(new BufferGeometry().setFromPoints(points),new LineBasicMaterial({ color: 0xf8c96f, depthTest: true }));
      this.scene.add(this.lines);
      this.lines.visible=this.debugVisible;
    }
    this.selected.visible = false; this.scene.updateMatrixWorld(true);
  }

  /** Pick the closest real surface, including noninteractive occluders and excluding preview/links.
   * @param {number} x Canvas-local CSS X.
   * @param {number} y Canvas-local CSS Y.
   * @return {Pick|null} Visible hit, or null.
   */
  pick(x: number, y: number): Pick | null {
    const canvas = this.renderer.domElement;
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2(x/canvas.clientWidth*2-1,1-y/canvas.clientHeight*2),this.camera);
    const targets: Mesh[] = [];
    for (const root of [this.environment,this.deviceRoot]) root.traverse(o => { if (o instanceof Mesh) targets.push(o); });
    const hit = this.raycaster.intersectObjects(targets,false).find(hit=>!this.vanilla||this.vanilla.accepts(hit)); if (!hit || !hit.face) return null;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const values = normal.toArray(), axis = values.map(Math.abs).indexOf(Math.max(...values.map(Math.abs)));
    const n: Cell = [0,0,0]; n[axis] = Math.sign(values[axis]);
    const point = hit.point.toArray() as Cell;
    const object = this.objects.get(hit.object.userData.id);
    const candidate = object ? object.position.toArray().map((v,i) => v+n[i]) as Cell : candidateCell(point,n);
    return { id: hit.object.userData.id, role: hit.object.userData.role, point, normal: n, candidate };
  }

  /** Project a known world point for visible diagnostics and reproducible pointer tests.
   * @param {Cell} point World position.
   * @return {{x:number,y:number}} Canvas-local CSS position.
   */
  project(point: Cell): { x: number; y: number } {
    const p = new Vector3(...point).project(this.camera), c = this.renderer.domElement;
    return { x: (p.x+1)*c.clientWidth/2, y: (1-p.y)*c.clientHeight/2 };
  }

  /** Show a depth-tested diagnostic 3D model without committing a logical placement.
   * @param {Cell|null} cell Candidate position, or null to cancel.
   * @param {Kind} kind Proposed device.
   * @param {Facing} facing Proposed orientation.
   * @param {boolean} valid Candidate validity.
   */
  showPreview(cell: Cell | null, kind: Kind, facing: Facing, valid: boolean): void {
    if (!cell) { if (this.preview) this.models.release(this.preview); this.preview = null; this.previewSignature = ''; return; }
    const signature = `${kind}:${facing}:${valid}`;
    if (signature !== this.previewSignature || !this.preview) {
      if (this.preview) this.models.release(this.preview);
      this.preview = this.vanilla?this.vanilla.device(kind,facing,this.lit,valid?0x69e7b6:0xff6d78):this.models.device(kind,facing,valid ? 0x69e7b6 : 0xff6d78); this.scene.add(this.preview); this.previewSignature = signature;
    }
    this.preview.position.set(...cell);
  }

  /** Highlight a live instance using its real world bounds.
   * @param {string|null} id Selected instance.
   */
  select(id: string | null): void {
    const object = id ? this.objects.get(id) : null;
    this.selected.visible = Boolean(object); if (object) this.selected.box.setFromObject(object);
  }

  /** Render one real frame and deliver bounded timing samples.
   * @param {number} time RequestAnimationFrame timestamp.
   */
  animate(time: number): void {
    if (this.disposed) return;
    if(this.contextLost){this.queueFrame();return;}
    this.profile.begin(time);
    const delta = this.lastFrame ? time-this.lastFrame : 0; this.lastFrame = time;
    if (delta > 0) { this.intervals.push(delta); if (this.intervals.length > 600) this.intervals.shift(); this.sampleSink?.(time,delta); }
    this.effect?.frame(time,delta);this.renderOnce();this.effect?.afterFrame();this.profile.previousWork=performance.now()-this.profile.frameStart;this.queueFrame();
  }

  /** Maintain exactly one owned animation callback, including while graphics are temporarily lost. */
  queueFrame():void{if(this.disposed)return;if(this.queuedRaf!==0)throw new Error('duplicate-owned-RAF');this.queuedRaf=1;this.frameHandle=requestAnimationFrame(time=>{this.queuedRaf=0;this.animate(time);});}

  /** Exercise the native context-loss extension and actual restoration events on the same canvas.
   * @return {Promise<object>} Explicit unavailable/failure or real event evidence, never a renderer rebuild.
   */
  contextLossProbe():Promise<object>{
    const gl=this.renderer.getContext(),extension=gl.getExtension('WEBGL_lose_context'),canvas=this.renderer.domElement;
    if(!extension)return Promise.resolve({status:'UNAVAILABLE',reason:'WEBGL_lose_context extension unavailable'});
    if(this.contextProbeCleanup)return Promise.resolve({status:'FAIL',reason:'context probe already active'});
    return new Promise(resolve=>{let timeout:ReturnType<typeof setTimeout>,restoreTimer:ReturnType<typeof setTimeout>;const start=this.contextEvents.length;
      const cleanup=()=>{clearTimeout(timeout);clearTimeout(restoreTimer);canvas.removeEventListener('webglcontextrestored',restored);this.contextProbeCleanup=null;};
      const restored=()=>{this.renderOnce();const error=gl.getError(),events=this.contextEvents.slice(start);cleanup();resolve({status:error===gl.NO_ERROR&&events.length===2?'PASS':'FAIL',events,sameCanvas:canvas===this.renderer.domElement,disposed:this.disposed,nativeLost:gl.isContextLost(),glError:error,queuedRaf:this.queuedRaf,liveAdapters:SceneAdapter.live});};
      this.contextProbeCleanup=()=>{cleanup();resolve({status:'CANCELLED',reason:'adapter disposed'});};canvas.addEventListener('webglcontextrestored',restored);timeout=setTimeout(()=>{cleanup();resolve({status:'FAIL',reason:'native restore timeout',events:this.contextEvents.slice(start)});},5000);extension.loseContext();restoreTimer=setTimeout(()=>extension.restoreContext(),750);
    });
  }

  /** Submit a frame with an optional deterministic texture-animation time for browser assertions.
   * @param {number} animationTime Texture clock in milliseconds, defaulting to the live renderer clock.
   */
  renderOnce(animationTime=performance.now()): void {this.vanilla?.animate(animationTime);const start=performance.now();this.profile.beforeSubmit();this.renderer.render(this.scene,this.camera);this.profile.afterSubmit();this.profile.phases.submit=performance.now()-start;}

  /** Return actual browser/WebGL environment and current renderer counters.
   * @return {object} Diagnostic environment, not a performance certification.
   */
  diagnostics() {
    const gl = this.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { backend: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: [this.renderer.domElement.clientWidth,this.renderer.domElement.clientHeight],
      backingPixels: [this.renderer.domElement.width,this.renderer.domElement.height], dpr: window.devicePixelRatio, renderDpr: this.renderer.getPixelRatio(),
      webgl2: gl instanceof WebGL2RenderingContext, camera: this.view, eye: this.camera.position.toArray(), fov: this.camera.fov,
      instances: this.objects.size, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      ownedGeometryCreated: this.models.created, ownedGeometryReleased: this.models.released,
      assetMode:this.vanilla?'vanilla-26.3':'debug-geometry',litSample:this.lit,gallerySample:this.sampleId,
      lifecycle:{liveAdapters:SceneAdapter.live,queuedRaf:this.queuedRaf,contextLost:this.contextLost,contextEvents:this.contextEvents,ownedContextListeners:this.disposed?0:2},
      vanilla:this.vanilla?.diagnostics()??null };
  }

  /** Stop animation/observation and release effects, audio, model, helper, line, material and renderer resources. */
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    SceneAdapter.live--;this.contextProbeCleanup?.();this.renderer.domElement.removeEventListener('webglcontextlost',this.lostHandler);this.renderer.domElement.removeEventListener('webglcontextrestored',this.restoredHandler);this.onContextChange=null;
    this.effect?.dispose();this.effect=null;
    this.profile.dispose();
    cancelAnimationFrame(this.frameHandle);this.queuedRaf=0; this.observer.disconnect(); this.sampleSink = null; this.onResize = null;
    this.showPreview(null,'furnace','north',false);
    for (const o of this.objects.values()) this.models.release(o); this.objects.clear(); this.signatures.clear();
    this.models.release(this.environment);
    this.environment.traverse(o => { if (o instanceof LineSegments) { o.geometry.dispose(); (o.material as LineBasicMaterial).dispose(); } });
    this.selected.geometry.dispose(); (this.selected.material as LineBasicMaterial).dispose();
    if (this.lines) { this.lines.geometry.dispose(); (this.lines.material as LineBasicMaterial).dispose(); }
    this.models.dispose();this.vanilla?.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
