/** Production-facing real 3D presentation and persistent-instance port, without P2 fixtures or gameplay simulation. */
import {Color,Group,InstancedMesh,Matrix4,Mesh,PerspectiveCamera,Raycaster,Scene,Vector2,Vector3,WebGLRenderer} from 'three';
import type {Intersection,Object3D} from 'three';import type {SceneState} from '../domain/types.ts';import type {Resources} from './resources.ts';import {VanillaModels} from './vanilla-models.ts';
export interface Pick {id:string;point:[number,number,number];normal:[number,number,number]}
/** Own one event-driven WebGL2 view and its original-resource model instances. */
export class SceneView {
  renderer:WebGLRenderer;scene=new Scene();camera=new PerspectiveCamera(70,1,.1,60);models:VanillaModels;ray=new Raycaster();world=new Group();persistent=new Group();cake:Group|null=null;
  observer:ResizeObserver;queued=0;disposed=false;lost=false;input=true;pointer:number|null=null;onPick:((hit:Pick)=>void)|null=null;onGraphics:((ready:boolean)=>void)|null=null;
  down:(e:PointerEvent)=>void;up:(e:PointerEvent)=>void;lostHandler:(e:Event)=>void;restoredHandler:()=>void;
  /** Build an authored table from original slab/post models and preserve an interior eye-height game camera.
   * @param {HTMLElement} host Canvas host.
   * @param {Resources} pack Verified shared original resources.
   * @param {string} label Localized accessible scene description.
   * @param {boolean} game Whether this is the first-person game carrier rather than the home presentation.
   */
  constructor(host:HTMLElement,pack:Resources,label:string,game=false){
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:true});if(!gl)throw new Error('webgl-unavailable');
    this.renderer=new WebGLRenderer({canvas,context:gl,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));canvas.setAttribute('aria-label',label);canvas.setAttribute('role','img');canvas.dataset.resourceVersion='26.3';host.append(canvas);
    this.models=new VanillaModels(pack);this.scene.background=new Color(game?'#617c7b':'#9bafa0');this.scene.add(this.world,this.persistent);
    const floorSource=this.model('floor').children[0] as Mesh,floor=new InstancedMesh(floorSource.geometry,floorSource.material,63),matrix=new Matrix4();let index=0;for(let x=-4;x<=4;x++)for(let z=-3;z<=3;z++)floor.setMatrixAt(index++,matrix.makeTranslation(x,-1,z));floor.userData.id='floor';this.world.add(floor);
    for(let x=-1;x<=1;x++)for(let z=0;z<=1;z++){const top=this.model('tabletop');top.position.set(x-.5,.875,z-1);top.scale.y=.25;top.userData.id='birthday-table';this.world.add(top);}
    for(const x of [-1.2,1.2])for(const z of [-.75,.75]){const leg=this.model('leg');leg.position.set(x-.5,0,z-.5);leg.scale.y=.875;leg.userData.id='birthday-table';this.world.add(leg);}
    this.camera.position.set(game?.5:3.5,1.62,game?5:4.5);this.camera.lookAt(0,game?1.2:.85,0);this.camera.updateMatrixWorld(true);
    this.down=e=>{if(this.input&&!this.lost&&e.button===0)this.pointer=e.pointerId;};this.up=e=>{if(!this.input||this.lost||e.button!==0||this.pointer!==e.pointerId)return;this.pointer=null;const hit=this.pick(e.clientX,e.clientY);if(hit)this.onPick?.(hit);};
    this.lostHandler=e=>{e.preventDefault();this.lost=true;this.pointer=null;this.onGraphics?.(false);};this.restoredHandler=()=>{this.lost=false;this.onGraphics?.(true);this.requestRender();};
    canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('webglcontextlost',this.lostHandler);canvas.addEventListener('webglcontextrestored',this.restoredHandler);
    this.observer=new ResizeObserver(()=>{if(this.disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.requestRender();});this.observer.observe(host);this.requestRender();
  }
  /** Instantiate a compiled original presentation model, failing if a dependency was not loaded.
   * @param {string} key Presentation profile key.
   * @return {Group} Owned original geometry.
   */
  model(key:string):Group{const sample=this.models.pack.samples.find(s=>s.id===key);if(!sample)throw new Error('missing-presentation-model');return this.models.sample(sample);}
  /** Reflect the shared completion fact without starting a celebration or granting any item.
   * @param {boolean} placed Whether the durable home-table fact exists.
   */
  setCake(placed:boolean):void{if(placed&&!this.cake){this.cake=this.model('cake');this.cake.position.set(-.5,1,-.5);this.cake.userData.id='birthday-cake';this.world.add(this.cake);}else if(!placed&&this.cake){this.release(this.cake);this.cake=null;}this.renderer.domElement.dataset.cake=String(placed);this.requestRender();}
  /** Bind stable logical instances without serializing GPU objects or admitting a product build region.
   * @param {SceneState} value Persistent current-scene facts.
   */
  sync(value:SceneState):void{for(const child of [...this.persistent.children])this.release(child);for(const station of value.stations){const mesh=this.models.device(station.kind,station.facing,false);mesh.position.set(...station.cell);mesh.userData.id=station.id;this.persistent.add(mesh);}this.requestRender();}
  /** Gate scene gestures before any ray access while a screen-space GUI owns input.
   * @param {boolean} enabled Whether world input is currently available.
   */
  setInputEnabled(enabled:boolean):void{this.input=enabled;this.pointer=null;}
  /** Ray-pick actual geometry, respecting depth, opaque scenery and original alpha cutouts.
   * @param {number} x Pointer client X.
   * @param {number} y Pointer client Y.
   * @return {Pick|null} Nearest visible object and transformed face normal.
   */
  pick(x:number,y:number):Pick|null{if(!this.input||this.lost||this.disposed)return null;const r=this.renderer.domElement.getBoundingClientRect();this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);this.ray.setFromCamera(new Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),this.camera);const hit=this.ray.intersectObjects(this.scene.children,true).find(h=>this.models.accepts(h));return hit?this.hit(hit):null;}
  /** Resolve an original mesh's domain identity and world-space face.
   * @param {Intersection<Object3D>} hit Actual ray intersection.
   * @return {Pick} Metadata independent of view pixels.
   */
  hit(hit:Intersection<Object3D>):Pick{let root: Object3D|null=hit.object;while(root&&!root.userData.id)root=root.parent;const normal=hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)??new Vector3();return{id:String(root?.userData.id??'scenery'),point:hit.point.toArray() as [number,number,number],normal:normal.toArray() as [number,number,number]};}
  /** Coalesce real-time rendering requests without installing duplicate perpetual animation loops. */
  requestRender():void{if(this.disposed||this.lost||this.queued)return;this.queued=requestAnimationFrame(()=>{this.queued=0;if(this.disposed||this.lost)return;this.models.animate(performance.now());this.renderer.render(this.scene,this.camera);this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);});}
  /** Release owned per-instance geometry; shared original materials belong to the model factory.
   * @param {Object3D} object Scene instance.
   */
  release(object:Object3D):void{object.removeFromParent();object.traverse(child=>{if(child instanceof Mesh)child.geometry.dispose();});}
  /** Remove renderer callbacks, resize observation, input listeners and all owned GPU resources. */
  dispose():void{if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.queued);this.queued=0;this.observer.disconnect();const c=this.renderer.domElement;c.removeEventListener('pointerdown',this.down);c.removeEventListener('pointerup',this.up);c.removeEventListener('webglcontextlost',this.lostHandler);c.removeEventListener('webglcontextrestored',this.restoredHandler);for(const child of [...this.world.children,...this.persistent.children])this.release(child);this.models.dispose();this.renderer.dispose();this.renderer.forceContextLoss();c.remove();this.onPick=null;this.onGraphics=null;}
}
