/** Production-facing real 3D presentation and persistent-instance port, without P2 fixtures or gameplay simulation. */
import {Color,Group,InstancedMesh,Matrix4,Mesh,PerspectiveCamera,Raycaster,Scene,Vector2,Vector3,WebGLRenderer} from 'three';
import type {Intersection,Object3D} from 'three';import type {SceneState} from '../domain/types.ts';import type {Resources} from './resources.ts';import {VanillaModels} from './vanilla-models.ts';
import {Look} from './look.ts';import {PRESENTATION} from './presentation.ts';import type {PresentationSpec} from './presentation.ts';
export interface Pick {id:string;point:[number,number,number];normal:[number,number,number]}
/** Own one event-driven WebGL2 view and its original-resource model instances. */
export class SceneView {
  renderer:WebGLRenderer;scene=new Scene();camera=new PerspectiveCamera(70,1,.1,90);models:VanillaModels;ray=new Raycaster();world=new Group();persistent=new Group();cake:Group|null=null;look=new Look();basePitch=0;rightTarget:string|null=null;onUse:((hit:Pick|null,modifiers?:{shift:boolean})=>void)|null=null;
  config:PresentationSpec;observer:ResizeObserver;queued=0;disposed=false;lost=false;input=true;pointer:number|null=null;onPick:((hit:Pick)=>void)|null=null;onGraphics:((ready:boolean)=>void)|null=null;
  down:(e:PointerEvent)=>void;up:(e:PointerEvent)=>void;move:(e:PointerEvent)=>void;cancel:()=>void;contextMenu:(e:Event)=>void;visibility:()=>void;lostHandler:(e:Event)=>void;restoredHandler:()=>void;
  /** Build an authored table from original slab/post models and preserve an interior eye-height game camera.
   * @param {HTMLElement} host Canvas host.
   * @param {Resources} pack Verified shared original resources.
   * @param {string} label Localized accessible scene description.
   * @param {boolean} game Whether this is the first-person game carrier rather than the home presentation.
   * @param {PresentationSpec} config Authored presentation dimensions, separate from future scene definitions.
   */
  constructor(host:HTMLElement,pack:Resources,label:string,game=false,config:PresentationSpec=PRESENTATION){
    this.config=config;
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:true});if(!gl)throw new Error('webgl-unavailable');
    this.renderer=new WebGLRenderer({canvas,context:gl,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));canvas.setAttribute('aria-label',label);canvas.setAttribute('role','img');canvas.dataset.resourceVersion='26.3';host.append(canvas);
    this.models=new VanillaModels(pack);this.scene.background=new Color(game?'#617c7b':'#9bafa0');this.scene.add(this.world,this.persistent);
    const floorSource=this.model('floor').children[0] as Mesh,wood:Matrix4[]=[],stone:Matrix4[]=[];for(let x=config.xMin;x<=config.xMax;x++)for(let z=config.zMin;z<=config.zMax;z++){wood.push(new Matrix4().makeTranslation(x,-1,z));wood.push(new Matrix4().makeTranslation(x,config.height,z));}for(let x=config.xMin;x<=config.xMax;x++)for(let y=0;y<config.height;y++)stone.push(new Matrix4().makeTranslation(x,y,config.zMin));for(const x of [config.xMin,config.xMax])for(let y=0;y<config.height;y++)for(let z=config.zMin+1;z<=config.zMax;z++)stone.push(new Matrix4().makeTranslation(x,y,z));
    this.batch(floorSource,wood,'presentation-structure');const stoneSample=pack.samples.find(s=>s.block==='stone');if(!stoneSample)throw new Error('missing-original-stone');this.batch(this.models.sample(stoneSample).children[0] as Mesh,stone,'presentation-walls');
    for(let x=-1;x<=1;x++)for(let z=0;z<=1;z++){const top=this.model('tabletop');top.position.set(x-.5,config.tabletopY,z-1);top.userData.id='birthday-table';this.world.add(top);}
    for(const x of [-1.2,1.2])for(const z of [-.75,.75]){const leg=this.model('leg');leg.position.set(x-.5,0,z-.5);leg.userData.id='birthday-table';this.world.add(leg);}
    this.camera.position.set(0,config.eye,game?config.gameZ:config.homeZ);this.camera.lookAt(0,config.targetY,0);this.camera.rotation.order='YXZ';this.basePitch=this.camera.rotation.x;this.camera.updateMatrixWorld(true);
    this.cancel=()=>{this.pointer=null;this.rightTarget=null;const id=this.look.active?.pointer;this.look.cancel();if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);};
    this.down=e=>{if(!this.input||this.lost)return;if(e.button===2){e.preventDefault();this.cancel();this.rightTarget=this.pick(e.clientX,e.clientY)?.id??null;this.look.begin(e.pointerId,e.clientX,e.clientY);canvas.setPointerCapture(e.pointerId);}else if(e.button===0&&!this.look.active)this.pointer=e.pointerId;};
    this.move=e=>{if(!this.input||this.lost||!this.look.active)return;if(!(e.buttons&2)){this.cancel();return;}if(this.look.move(e.pointerId,e.clientX,e.clientY)){if(!game)return;this.camera.rotation.set(this.basePitch+this.look.pitch,this.look.yaw,0,'YXZ');canvas.dataset.look=JSON.stringify({yaw:this.look.yaw,pitch:this.look.pitch,eye:this.camera.position.toArray()});this.requestRender();}};
    this.up=e=>{if(!this.input||this.lost)return;if(e.button===2){const target=this.rightTarget,result=this.look.end(e.pointerId);this.cancel();if(result==='use'){const hit=this.pick(e.clientX,e.clientY);if((hit?.id??null)===target)this.onUse?.(hit,{shift:e.shiftKey});}return;}if(e.button!==0||this.pointer!==e.pointerId)return;this.pointer=null;const hit=this.pick(e.clientX,e.clientY);if(hit)this.onPick?.(hit);};
    this.contextMenu=e=>{if(this.input)e.preventDefault();};this.visibility=()=>{if(document.hidden)this.cancel();};
    this.lostHandler=e=>{e.preventDefault();this.lost=true;this.cancel();this.onGraphics?.(false);};this.restoredHandler=()=>{this.lost=false;this.onGraphics?.(true);this.requestRender();};
    canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('lostpointercapture',this.cancel);canvas.addEventListener('contextmenu',this.contextMenu);window.addEventListener('blur',this.cancel);document.addEventListener('visibilitychange',this.visibility);canvas.addEventListener('webglcontextlost',this.lostHandler);canvas.addEventListener('webglcontextrestored',this.restoredHandler);
    this.observer=new ResizeObserver(()=>{if(this.disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=w/h<.6?105:w/h<1.1?95:70;this.camera.updateProjectionMatrix();this.requestRender();});this.observer.observe(host);this.requestRender();
  }
  /** Batch original block geometry across a real wide presentation room without stretching texture UVs.
   * @param {Mesh} source Owned original cube geometry and material.
   * @param {Matrix4[]} transforms True block coordinates.
   * @param {string} id Static scenery identity.
   */
  batch(source:Mesh,transforms:Matrix4[],id:string):void{const mesh=new InstancedMesh(source.geometry,source.material,transforms.length);transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.userData.id=id;this.world.add(mesh);}
  /** Instantiate a compiled original presentation model, failing if a dependency was not loaded.
   * @param {string} key Presentation profile key.
   * @return {Group} Owned original geometry.
   */
  model(key:string):Group{const sample=this.models.pack.samples.find(s=>s.id===key);if(!sample)throw new Error('missing-presentation-model');return this.models.sample(sample);}
  /** Reflect the shared completion fact without starting a celebration or granting any item.
   * @param {boolean} placed Whether the durable home-table fact exists.
   */
  setCake(placed:boolean):void{if(placed&&!this.cake){this.cake=this.model('cake');this.cake.position.set(-.5,this.config.cakeY,-.5);this.cake.userData.id='birthday-cake';this.world.add(this.cake);}else if(!placed&&this.cake){this.release(this.cake);this.cake=null;}this.renderer.domElement.dataset.cake=String(placed);this.requestRender();}
  /** Bind stable logical instances without serializing GPU objects or admitting a product build region.
   * @param {SceneState} value Persistent current-scene facts.
   */
  sync(value:SceneState):void{for(const child of [...this.persistent.children])this.release(child);for(const station of value.stations){const mesh=this.models.device(station.kind,station.facing,station.contents.version===2&&station.contents.data.burn>0);mesh.position.set(...station.cell);mesh.userData.id=station.id;this.persistent.add(mesh);}this.requestRender();}
  /** Gate scene gestures before any ray access while a screen-space GUI owns input.
   * @param {boolean} enabled Whether world input is currently available.
   */
  setInputEnabled(enabled:boolean):void{this.input=enabled;this.cancel();}
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
  dispose():void{if(this.disposed)return;this.disposed=true;this.cancel();cancelAnimationFrame(this.queued);this.queued=0;this.observer.disconnect();const c=this.renderer.domElement;c.removeEventListener('pointerdown',this.down);c.removeEventListener('pointermove',this.move);c.removeEventListener('pointerup',this.up);c.removeEventListener('pointercancel',this.cancel);c.removeEventListener('lostpointercapture',this.cancel);c.removeEventListener('contextmenu',this.contextMenu);window.removeEventListener('blur',this.cancel);document.removeEventListener('visibilitychange',this.visibility);c.removeEventListener('webglcontextlost',this.lostHandler);c.removeEventListener('webglcontextrestored',this.restoredHandler);for(const child of [...this.world.children,...this.persistent.children])this.release(child);this.models.dispose();this.renderer.dispose();this.renderer.forceContextLoss();c.remove();this.onPick=null;this.onUse=null;this.onGraphics=null;}
}
