/** Real WebGL2 scene projection; domain identity, camera picking and resource ownership stay explicit. */
import { AmbientLight, Box3, Box3Helper, BoxGeometry, Color, DirectionalLight, Group, LineBasicMaterial, LineSegments,
  BufferGeometry, Fog, Mesh, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { setEyeView } from './camera.ts';
import type { View } from './camera.ts';
export type { View } from './camera.ts';
import { DebugModels } from './debug-models.ts';
import { edges, key } from './domain.ts';
import type { Cell, Facing, Kind, Layout } from './domain.ts';

export interface Pick { id: string; role: 'device' | 'ground' | 'occluder'; point: Cell; normal: Cell; candidate: Cell }

/** Convert a visible world-space face hit into its adjacent logical cell, including negatives.
 * @param {Cell} point World-space point.
 * @param {Cell} normal Axis-aligned outward normal.
 * @return {Cell} Candidate cell on the visible side of the face.
 */
export function candidateCell(point: Cell, normal: Cell): Cell { return point.map((v,i) => Math.floor(v + normal[i] * .001)) as Cell; }

/** Read bounded geometry/renderer counters; memory counts are not GPU byte measurements. */
export class SceneAdapter {
  scene = new Scene();
  camera = new PerspectiveCamera(70, 1, .1, 100);
  raycaster = new Raycaster();
  renderer: WebGLRenderer;
  models = new DebugModels();
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

  /** Allocate one perspective WebGL2 renderer and start the real frame loop.
   * @param {HTMLElement} host Canvas host.
   * @param {string} label Localized canvas label.
   */
  constructor(host: HTMLElement, label: string) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', label);
    this.renderer.domElement.setAttribute('tabindex', '0');
    host.append(this.renderer.domElement); this.scene.background = new Color(0x9bc7de);
    this.scene.fog = new Fog(0x9bc7de, 22, 48);
    this.scene.add(this.environment, this.deviceRoot, this.selected); this.selected.visible = false;
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

  /** Synchronize immutable logical instances without recreating unchanged geometry.
   * @param {Layout} layout Logical state only.
   */
  sync(layout: Layout): void {
    const live = new Set(layout.instances.map(e => e.id));
    for (const [id,object] of this.objects) if (!live.has(id)) { this.models.release(object); this.objects.delete(id); this.signatures.delete(id); }
    for (const e of layout.instances) {
      const signature = `${e.kind}:${key(e.cell)}:${e.facing}`;
      if (this.signatures.get(e.id) === signature) continue;
      const old = this.objects.get(e.id); if (old) this.models.release(old);
      const model = this.models.device(e.kind,e.facing); model.position.set(...e.cell);
      model.traverse(o => { o.userData = { id: e.id, role: 'device' }; });
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
    const hit = this.raycaster.intersectObjects(targets,false)[0]; if (!hit || !hit.face) return null;
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
      this.preview = this.models.device(kind,facing,valid ? 0x69e7b6 : 0xff6d78); this.scene.add(this.preview); this.previewSignature = signature;
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
    const delta = this.lastFrame ? time-this.lastFrame : 0; this.lastFrame = time;
    if (delta > 0) { this.intervals.push(delta); if (this.intervals.length > 600) this.intervals.shift(); this.sampleSink?.(time,delta); }
    this.renderOnce(); this.frameHandle = requestAnimationFrame(t => this.animate(t));
  }

  /** Submit one scene frame; also used after deterministic test mutations. */
  renderOnce(): void { this.renderer.render(this.scene,this.camera); }

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
      ownedGeometryCreated: this.models.created, ownedGeometryReleased: this.models.released };
  }

  /** Stop animation/observation and release model, helper, line, material and renderer resources. */
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.frameHandle); this.observer.disconnect(); this.sampleSink = null; this.onResize = null;
    this.showPreview(null,'furnace','north',false);
    for (const o of this.objects.values()) this.models.release(o); this.objects.clear(); this.signatures.clear();
    this.models.release(this.environment);
    this.environment.traverse(o => { if (o instanceof LineSegments) { o.geometry.dispose(); (o.material as LineBasicMaterial).dispose(); } });
    this.selected.geometry.dispose(); (this.selected.material as LineBasicMaterial).dispose();
    if (this.lines) { this.lines.geometry.dispose(); (this.lines.material as LineBasicMaterial).dispose(); }
    this.models.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
