/** Production-facing real 3D presentation and persistent-instance port, without P2 fixtures or gameplay simulation. */
import {BlockFeedback} from './block-feedback.ts';
import {blockAt} from '../domain/placed-blocks.ts';
import {attackProfile} from '../domain/attack.ts';
import {nativeShapes,shapeEdges,FULL_BLOCK} from '../domain/block-shapes.ts';
import {placedModel} from './placed-world.ts';
import {FirstPersonHand} from './first-person-hand.ts';
import {viewBob} from './view-bob.ts';
import {blockSounds} from '../domain/block-sounds.ts';
import type {SoundOptions} from './world-audio.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import {PlayerMotion,playerBounds,overlaps,PLAYER_PHYSICS} from '../domain/player-motion.ts';
import type {Bounds} from '../domain/player-motion.ts';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {NativeWeather} from './native-weather.ts';
import {NativePrecipitation} from './native-precipitation.ts';
import {NativeSky} from './native-sky.ts';
import {emptyEnvironment} from '../domain/environment.ts';
import type {SkySettings} from '../domain/environment.ts';
import {NativeMenuBlur, menuLayers} from './native-menu-blur.ts';
import {NativeCrosshair} from './native-crosshair.ts';
import {timing, gpuTiming} from '../performance.ts';
import {
    Color,
    Fog,
    Group,
    ShaderMaterial,
    InstancedMesh,
    Matrix4,
    Mesh,
    PerspectiveCamera,
    Raycaster,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer
} from 'three';
import type {Intersection, Object3D} from 'three';
import type {SceneState} from '../domain/types.ts';
import type {Resources} from './resources.ts';
import {VanillaModels} from './vanilla-models.ts';
import {AuthoredWorld} from './authored-world.ts';
import {BlockLight} from './block-light.ts';
import {WORLD_SCENES, WORLD_COMPASS_TARGET, cropAge} from '../domain/world-config.ts';
import type {CompassView} from '../ui/compass.ts';
import type {Progress, SceneId, Kind, Facing, Cell} from '../domain/types.ts';
import {Look} from './look.ts';
import {PointerMode} from './pointer-mode.ts';
import {PRESENTATION} from './presentation.ts';
import type {PresentationSpec} from './presentation.ts';

export interface Pick {
    id: string;
    point: [number, number, number];
    normal: [number, number, number];
    cell?: Cell;
    support?: boolean;
    block?: string;
}

/** Own one event-driven WebGL2 view and its original-resource model instances. */
export class SceneView {
    /** Project the actual stationary camera into the native compass owner's position and yaw.
     * @param {string} scope Current save generation.
     * @return {CompassView} World reference shared by every authored scene.
     */
    compassView(scope: string): CompassView {
        return {position: this.camera.position.toArray(), yaw: 180 - this.camera.rotation.y * 180 / Math.PI, target: WORLD_COMPASS_TARGET, scope};
    }
    motion=new PlayerMotion();
    movementSound:((id:string,options:SoundOptions)=>void)|null=null;
    movementEpoch=0;
    blockLight:BlockLight|null=null;lightSignature='';
    keys=new Set<string>();
    /** Preserve a physical jump press until one simulation tick has observed it. */
    jumpQueued = false;
    controlsAbort=new AbortController();
    motionClock=0; motionRemainder=0;previousFeet:Cell=[0,0,7];
    collision:Bounds[]=[]; collisionSignature='';
    /** Static terrain bounds survive ordinary source removals and inventory saves. */
    staticCollisionVersion = -1;
    staticCollisions: Bounds[] = [];
    hand:FirstPersonHand|null=null;
    outline:LineSegments2|null=null;
    renderer: WebGLRenderer;
    scene = new Scene();
    camera = new PerspectiveCamera(70, 1, .1, 512);
    models: VanillaModels;
    sky: NativeSky | null = null;
    precipitation: NativePrecipitation | null = null;
    weather:NativeWeather|null=null;
    onEnvironmentFrame:((now:number)=>void)|null=null;
    environmentProgress: Progress | null = null;
    skyBaseColors = new WeakMap<object, Color>();
    skySettings: SkySettings = {time:'game',weather:'game'};
    ray = new Raycaster();
    world = new Group();
    persistent = new Group();
    placed=new Group();placedSignature='';
    cake: Group | null = null;
    look = new Look();
    mode: PointerMode | null = null;
    crosshair: NativeCrosshair | null = null;
    menuBlur = new NativeMenuBlur();
    onEscape: (() => void) | null = null;
    onPointerFailure: (() => void) | null = null;
    canUse: ((hit: Pick | null) => boolean) | null = null;
    basePitch = 0;
    rightTarget: string | null = null;
    rightMotion = 0;
    onUse: ((hit: Pick | null, modifiers?: { shift: boolean; alt?: boolean; ctrl?: boolean }) => void) | null = null;
    authored: AuthoredWorld | null = null;
    worldId: SceneId | null = null;
    stationSignature = '';
    animation = 0;
    frames = 0;
    renderMs: number[] = [];
    preview: Group | null = null;
    onFrame: ((now: number) => boolean) | null = null;
    onMineStart: ((hit: Pick | null) => void) | null = null;
    onMineCancel: (() => void) | null = null;
    debris: BlockFeedback['batches'] = [];
    feedbackEffects: BlockFeedback | null = null;
    crackSignature = '';
    crackImages = new Map<string, HTMLCanvasElement>();
    crack: Group | null = null;

    onHover: ((hit: Pick | null) => void) | null = null;
    pointerPosition: [number, number] | null = null;
    config: PresentationSpec;
    observer: ResizeObserver;
    queued = 0;
    /** Pending CSS viewport is applied inside the frame that paints it, never between painted frames. */
    viewport: {width: number; height: number; ratio: number} | null = null;
    disposed = false;
    lost = false;
    input = true;
    pointer: number | null = null;
    onPick: ((hit: Pick) => void) | null = null;
    onGraphics: ((ready: boolean) => void) | null = null;
    down: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    cancel: () => void;
    captureLost: () => void;
    leave: () => void;
    contextMenu: (e: Event) => void;
    visibility: () => void;
    lostHandler: (e: Event) => void;
    restoredHandler: () => void;

    /** Create an independent native home presentation or authored first-person game view.
     * @param {HTMLElement} host Canvas host.
     * @param {Resources} pack Verified shared original resources.
     * @param {string} label Localized accessible scene description.
     * @param {boolean} game Whether this is the first-person game carrier rather than the home presentation.
     * @param {PresentationSpec} config Home presentation dimensions; the game uses its authored WorldScene definitions.
     */
    constructor(host: HTMLElement, pack: Resources, label: string, game = false, config: PresentationSpec = PRESENTATION) {
        this.config = config;
        if(game){
            window.addEventListener('keydown', e => this.pressMovementKey(e), {signal:this.controlsAbort.signal});
            window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal:this.controlsAbort.signal});
        }
        this.crackImages = pack.guiImages;
        const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2', {antialias: true});
        if (!gl) throw new Error('webgl-unavailable');
        this.renderer = new WebGLRenderer({canvas, context: gl, antialias: true});
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        if (game) this.crosshair = new NativeCrosshair(pack.guiImages.get('assets/minecraft/textures/gui/sprites/hud/crosshair.png')!,pack.guiImages);
        canvas.setAttribute('aria-label', label);
        canvas.setAttribute('role', 'img');
        canvas.tabIndex = -1;
        canvas.dataset.resourceVersion = '26.3';
        host.append(canvas);
        this.models = new VanillaModels(pack);
        if(game){this.blockLight=new BlockLight();for(const material of this.models.materials.values())this.blockLight.bind(material);}
        if (game) this.feedbackEffects = new BlockFeedback(pack, this.models, this.scene, this.camera, this.blockLight);
        this.scene.background = new Color(game ? '#617C7B' : '#9BAFA0');
        this.scene.add(this.world, this.persistent,this.placed);
        if (!game) {
            const floorSource = this.model('floor').children[0] as Mesh, wood: Matrix4[] = [], stone: Matrix4[] = [];
            for (let x = config.xMin; x <= config.xMax; x++) for (let z = config.zMin; z <= config.zMax; z++) {
                wood.push(new Matrix4().makeTranslation(x, -1, z));
                wood.push(new Matrix4().makeTranslation(x, config.height, z));
            }
            for (let x = config.xMin; x <= config.xMax; x++) for (let y = 0; y < config.height; y++) stone.push(new Matrix4().makeTranslation(x, y, config.zMin));
            for (const x of [config.xMin, config.xMax]) for (let y = 0; y < config.height; y++) for (let z = config.zMin + 1; z <= config.zMax; z++) stone.push(new Matrix4().makeTranslation(x, y, z));
            this.batch(floorSource, wood, 'presentation-structure');
            const stoneSample = pack.samples.find(s => s.block === 'stone');
            if (!stoneSample) throw new Error('missing-original-stone');
            this.batch(this.models.sample(stoneSample).children[0] as Mesh, stone, 'presentation-walls');
            for (let x = -1; x <= 1; x++) for (let z = 0; z <= 1; z++) {
                const top = this.model('tabletop');
                top.position.set(x - .5, config.tabletopY, z - 1);
                top.userData.id = 'birthday-table';
                this.world.add(top);
            }
            for (const x of [-1.2, 1.2]) for (const z of [-.75, .75]) {
                const leg = this.model('leg');
                leg.position.set(x - .5, 0, z - .5);
                leg.userData.id = 'birthday-table';
                this.world.add(leg);
            }
        } else {
            this.camera.layers.enable(1);
            this.sky=new NativeSky(pack); this.precipitation=new NativePrecipitation(pack);this.scene.add(this.precipitation.root);this.weather=new NativeWeather();this.scene.add(this.weather.root);this.scene.background=null;
            this.blockLight?.bindWeather(this.precipitation.mesh.material as ShaderMaterial);
            this.authored = new AuthoredWorld(this.models, pack);
            this.scene.add(this.authored.staticRoot, this.authored.natural, this.authored.crops);
        }
        this.camera.position.set(0, config.eye, game ? config.gameZ : config.homeZ);
        this.camera.lookAt(0, config.targetY, 0);
        this.camera.rotation.order = 'YXZ';
        this.basePitch = this.camera.rotation.x;
        this.camera.updateMatrixWorld(true);
        this.cancel = () => this.cancelInput();
        if (game) this.mode = new PointerMode(canvas, () => {this.cancelInput(); this.refreshHover(); this.requestRender();}, () => this.onEscape?.(), () => this.onPointerFailure?.());
        this.down = e => this.beginPointer(e);
        this.move = e => this.movePointer(e, game);
        this.up = e => this.releasePointer(e);
        this.captureLost = () => {
            if (this.look.active || this.pointer !== null) this.cancel(); else this.refreshHover();
        };
        this.leave = () => {
            if (!this.look.active) this.cancel();
        };
        this.contextMenu = e => {
            e.preventDefault();
        };
        this.visibility = () => {
            if (document.hidden) this.cancel();else this.requestRender();
        };
        this.lostHandler = e => {
            e.preventDefault();
            this.mode?.suspend();
            this.lost = true;
            this.cancel();
            this.onGraphics?.(false);
        };
        this.restoredHandler = () => {
            this.lost = false;
            this.onGraphics?.(true);
            this.requestRender();
        };
        canvas.addEventListener('pointerdown', this.down);
        canvas.addEventListener('pointermove', this.move);
        canvas.addEventListener('mousemove', e => this.moveLockedMouse(e), {signal: this.controlsAbort.signal});
        canvas.addEventListener('pointerup', this.up);
        canvas.addEventListener('pointercancel', this.cancel);
        canvas.addEventListener('lostpointercapture', this.captureLost);
        canvas.addEventListener('pointerleave', this.leave);
        canvas.addEventListener('contextmenu', this.contextMenu);
        window.addEventListener('blur', this.cancel);
        document.addEventListener('visibilitychange', this.visibility);
        canvas.addEventListener('webglcontextlost', this.lostHandler);
        canvas.addEventListener('webglcontextrestored', this.restoredHandler);
        this.observer = new ResizeObserver(() => {
            if (this.disposed) return;
            const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
            this.viewport = {width: w, height: h, ratio: Math.min(devicePixelRatio, 2)};
            this.requestRender();
        });
        this.observer.observe(host);

        this.requestRender();
    }

    /** Route world presses to acquisition, mining or Use; visible mouse ownership belongs to open GUIs.
     * @param {PointerEvent} e Native canvas press, gated out while any UI owns input.
     */
    beginPointer(e: PointerEvent): void {
        if (!this.input || this.lost || this.disposed) return;
        if (e.button === 0 && this.mode?.enter()) {e.preventDefault(); return;}
        this.pointerPosition = [e.clientX, e.clientY];
        if (e.button === 2) {
            e.preventDefault();
            this.cancel();
            this.pointerPosition = [e.clientX, e.clientY];
            this.rightTarget = this.refreshHover()?.id ?? null;
            this.rightMotion = 0;
            this.look.begin(e.pointerId, e.clientX, e.clientY);
            this.onHover?.(null);
            this.capturePointer(e.pointerId);
        } else if (e.button === 0 && !this.look.active) {
            this.pointer = e.pointerId;
            this.capturePointer(e.pointerId);
            const hit = this.refreshHover();
            this.onMineStart?.(hit);
        }
    }

    /** Resolve the current pointer against the current camera and geometry, excluding all active look gestures.
     * @return {Pick|null} A fresh visible hit or no actionable pointer.
     */
    refreshHover(): Pick | null {
        const r = this.renderer.domElement.getBoundingClientRect(), position = this.mode?.actual ? [r.left + r.width / 2, r.top + r.height / 2] : this.pointerPosition;
        const hit = position && !this.look.active && position[0] >= r.left && position[0] < r.right && position[1] >= r.top && position[1] < r.bottom ? this.pick(position[0], position[1]) : null;
        this.renderer.domElement.dataset.hover = JSON.stringify(hit);
        this.onHover?.(hit);
        this.showOutline(hit);
        return hit;
    }

    /** Capture visible-pointer gestures without violating the browser's exclusive pointer-lock ownership.
     * @param {number} id Active pressed pointer identity.
     */
    capturePointer(id: number): void {
        const canvas = this.renderer.domElement;
        if (!this.mode?.actual && !canvas.ownerDocument.pointerLockElement) canvas.setPointerCapture(id);
    }

    /** Invalidate gestures and ray identity on GUI, lifecycle and capture boundaries. */
    cancelInput(): void {
        this.movementEpoch++;this.motion.sprinting=false;this.motion.forwardDown=false;this.motion.sprintWindow=0;
        this.keys.clear();
        this.jumpQueued = false;
        this.motionRemainder=0;
        const left = this.pointer;
        this.onMineCancel?.();
        this.pointer = null;
        this.pointerPosition = null;
        this.rightTarget = null;
        const id = this.look.active?.pointer;
        this.look.cancel();
        this.renderer.domElement.dataset.hover = 'null';
        this.onHover?.(null);
        if (left !== null && this.renderer.domElement.hasPointerCapture(left)) this.renderer.domElement.releasePointerCapture(left);
        if (id !== undefined && this.renderer.domElement.hasPointerCapture(id)) this.renderer.domElement.releasePointerCapture(id);
    }

    /** Consume the Pointer Lock MouseEvent stream once, independently of visible-pointer coordinates.
     * @param {MouseEvent} e Browser relative mouse movement.
     */
    moveLockedMouse(e: MouseEvent): void {
        if (!this.input || this.lost || !this.mode?.actual) return;
        if (this.pointer !== null && !(e.buttons & 1)) {this.cancel(); return;}
        if (this.look.active) {this.rightMotion += Math.hypot(e.movementX, e.movementY); if (this.rightMotion >= this.look.threshold) this.look.active.dragging = true;}
        this.look.relative(e.movementX, e.movementY);
        this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
        this.camera.updateMatrixWorld(true); this.refreshHover(); this.requestRender();
    }

    /** Update a visible-pointer scene gesture without retaining an actionable hit while the camera rotates.
     * @param {PointerEvent} e Native pointer movement.
     * @param {boolean} game Whether first-person look is enabled.
     */
    movePointer(e: PointerEvent, game: boolean): void {
        if (!this.input || this.lost || this.mode?.actual) return;
        if (this.pointer !== null && !(e.buttons & 1)) {this.cancel(); return;}
        if (this.pointer !== null && !this.mode?.actual) {
            const bounds = this.renderer.domElement.getBoundingClientRect();
            if (e.clientX < bounds.left || e.clientX >= bounds.right || e.clientY < bounds.top || e.clientY >= bounds.bottom) {this.cancel(); return;}
        }
        this.pointerPosition = [e.clientX, e.clientY];
        if (!this.look.active) {
            this.refreshHover();
            return;
        }
        this.onHover?.(null);
        if (!(e.buttons & 2)) {
            this.cancel();
            return;
        }
        if (this.look.move(e.pointerId, e.clientX, e.clientY) && game) {
            this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
            this.renderer.domElement.dataset.look = JSON.stringify({
                yaw: this.look.yaw,
                pitch: this.look.pitch,
                eye: this.camera.position.toArray()
            });
            this.requestRender();
        }
    }

    /** Finish exactly one gesture and refresh its ray without turning a completed drag into Use.
     * @param {PointerEvent} e Native pointer release.
     */
    releasePointer(e: PointerEvent): void {
        if (!this.input || this.lost) return;
        if (e.button === 2) {
            const target = this.rightTarget, result = this.look.end(e.pointerId);
            this.cancel();
            this.pointerPosition = [e.clientX, e.clientY];
            const hit = this.refreshHover();
            if (result === 'use' && (hit?.id ?? null) === target) this.onUse?.(hit, {
                shift: e.shiftKey,
                alt: e.altKey,
                ctrl: e.ctrlKey
            });
            return;
        }
        if (e.button !== 0 || this.pointer !== e.pointerId) return;
        this.pointer = null;
        this.onMineCancel?.();
        this.pointerPosition = [e.clientX, e.clientY];
        this.refreshHover();
    }

    /** Batch original block geometry across a real wide presentation room without stretching texture UVs.
     * @param {Mesh} source Owned original cube geometry and material.
     * @param {Matrix4[]} transforms True block coordinates.
     * @param {string} id Static scenery identity.
     */
    batch(source: Mesh, transforms: Matrix4[], id: string): void {
        const mesh = new InstancedMesh(source.geometry, source.material, transforms.length);
        transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.userData.id = id;
        this.world.add(mesh);
    }

    /** Instantiate a compiled original presentation model, failing if a dependency was not loaded.
     * @param {string} key Presentation profile key.
     * @return {Group} Owned original geometry.
     */
    model(key: string): Group {
        const sample = this.models.pack.samples.find(s => s.id === key);
        if (!sample) throw new Error('missing-presentation-model');
        return this.models.sample(sample);
    }

    /** Reflect a changed completion fact without redrawing an unchanged home on unrelated processing snapshots.
     * @param {boolean} placed Whether the durable home-table fact exists.
     */
    setCake(placed: boolean): void {
        if (placed === !!this.cake && this.renderer.domElement.dataset.cake === String(placed)) return;
        if (placed && !this.cake) {
            this.cake = this.model('cake');
            this.cake.position.set(-.5, this.authored ? 1.5 : this.config.cakeY, this.authored ? -3.5 : -.5);
            this.cake.userData.id = 'birthday-cake';
            this.world.add(this.cake);
        } else if (!placed && this.cake) {
            this.release(this.cake);
            this.cake = null;
        }
        this.renderer.domElement.dataset.cake = String(placed);
        this.requestRender();
    }

    /** Bind stable logical instances without serializing GPU objects; domain commands own placement admission.
     * @param {SceneState} value Persistent current-scene facts.
     */
    sync(value: SceneState): void {
        const signature = JSON.stringify(value.stations.map(s => [s.id, s.kind, s.cell, s.facing, s.contents.version === 2 && s.contents.data.burn > 0]));
        if (signature === this.stationSignature) return;
        this.stationSignature = signature;
        this.renderer.domElement.dataset.instances = signature;
        for (const child of [...this.persistent.children]) this.release(child);
        for (const station of value.stations) {
            const mesh = this.models.device(station.kind, station.facing, station.contents.version === 2 && station.contents.data.burn > 0);
            mesh.position.set(...station.cell);
            mesh.userData.id = station.id;mesh.userData.cell=station.cell;mesh.userData.block=station.kind;mesh.userData.shapes=nativeShapes(station.kind,{facing:station.facing});mesh.userData.collisionShapes=mesh.userData.shapes;
            this.persistent.add(mesh);
        }
        this.requestRender();
    }

    /** Project the selected authored scene and durable natural/crop layers. @param {Progress} p Current authoritative progress. */
    syncWorld(p: Progress): void {
        if (!this.authored) return;
        this.sky?.sync(p.environment??emptyEnvironment(),this.skySettings,p.world.tick);this.environmentProgress=p;
        if (this.worldId === null) this.renderer.domElement.dataset.recoveredWorld = JSON.stringify({
            tick: p.world.tick,
            scene: p.scene,
            crops: p.scenes.farm.crops
        });
        const entering=this.worldId!==p.scene;
        if (entering) {
            this.mode?.suspend();
            this.updateDebris(Infinity);
            this.worldId = p.scene;
            this.authored.build(p.scene);
            this.scene.fog = p.scene === 'plains' ? new Fog('#c0d8ff', 44, 68) : null;
            const spec = WORLD_SCENES[p.scene];
            this.scene.background = this.sky ? null : new Color(spec.sky);
            this.camera.position.set(...spec.eye);
            this.camera.lookAt(...spec.target);
            this.camera.rotation.order = 'YXZ';
            this.basePitch = this.camera.rotation.x;
            this.look.yaw = 0;
            this.look.pitch = this.basePitch;
            this.motion.reset(spec.eye);const pose=p.scenes[p.scene].pose;if(pose){this.motion.feet=[...pose.feet];this.look.yaw=pose.yaw;this.look.pitch=pose.pitch;this.camera.rotation.set(pose.pitch,pose.yaw,0,'YXZ');}this.previousFeet=[...this.motion.feet];
            this.cancel();
            this.showPreview(null);
            this.stationSignature = '';
            this.renderer.domElement.dataset.scene = p.scene;
        }
        const end = timing('scene-update');
        const data = this.renderer.domElement.dataset;
        data.natural = JSON.stringify(p.world.visits[p.scene]);
        data.crops = JSON.stringify(p.scenes[p.scene].crops);
        this.authored.sync(p);
        this.setCake(p.scene === 'home' && p.cakePlacement !== null);
        this.sync(p.scenes[p.scene]);
        const placedSignature=JSON.stringify([p.scene,p.scenes[p.scene].blocks]);
        if(placedSignature!==this.placedSignature){this.placedSignature=placedSignature;for(const child of [...this.placed.children])this.release(child);for(const b of p.scenes[p.scene].blocks??[])this.placed.add(placedModel(b,this.models.pack as Resources,this.models));}
        this.rebuildCollision();
        if(this.blockLight&&this.lightSignature!==this.collisionSignature){
            this.lightSignature=this.collisionSignature;
            const emitters=(p.scene==='cave'?this.authored.caveLights:[]).map(cell=>({cell:cell.map(Math.floor) as Cell,level:14}));
            for(const b of p.scenes[p.scene].blocks??[])if(['torch','wall_torch','lantern','campfire'].includes(b.block)&&b.state.lit!=='false')emitters.push({cell:b.cell,level:b.block.includes('torch')?14:15});
            this.blockLight.rebuild(emitters,this.collision);this.renderer.domElement.dataset.blockLight=JSON.stringify({emitters,maximum:Math.max(...this.blockLight.values)});
        }
        if(entering&&this.collision.some(b=>overlaps(playerBounds(this.motion.feet),b))){this.motion.reset(WORLD_SCENES[p.scene].eye);this.previousFeet=[...this.motion.feet];}
        this.hand?.select(p.player.data.hotbar[p.player.data.selected]?.id??null);
        this.refreshHover();
        this.requestRender();
        end();
    }

    /** Keep placement admission available to diagnostics without drawing a ghost model.
     * @param {object|null} value Candidate placement.
     */
    showPreview(value:{kind:Kind;facing:Facing;cell:Cell;valid:boolean}|null):void{this.renderer.domElement.dataset.placementPreview=JSON.stringify(value);}

    /** Attach verified native first-person item and skin resources.
     * @param {CatalogueArt} art Shared catalogue artwork.
     */
    enableHands(art:CatalogueArt):void{this.hand=new FirstPersonHand(art);this.hand.select(this.environmentProgress?.player.data.hotbar[this.environmentProgress.player.data.selected]?.id??null);}

    /** Build nearby block collision boxes from authored native geometry, excluding non-solid vegetation and entities. */
    rebuildCollision():void{
        if(!this.authored)return;const signature=JSON.stringify([this.worldId,this.authored.signature,this.stationSignature,this.placedSignature]);if(signature===this.collisionSignature)return;this.collisionSignature=signature;
        this.scene.updateMatrixWorld(true);const result:Bounds[]=[],matrix=new Matrix4(),seen=new Set<Object3D>();
        for(const owner of [this.authored.staticRoot,this.authored.natural,this.persistent,this.placed]) {
        if (owner === this.authored.staticRoot && this.staticCollisionVersion === this.authored.staticVersion) {result.push(...this.staticCollisions); continue;}
        const start = result.length;
        owner.traverse(o=>{
            if(!(o instanceof Mesh))return;let root:Object3D|null=o;while(root&&!root.userData.id)root=root.parent;
            if(root?.userData.collision===false)return;
            if(root?.userData.collisionShapes){if(seen.has(root))return;seen.add(root);for(const b of root.userData.collisionShapes as Bounds[])result.push(b.map((n,i)=>n+root!.position.getComponent(i%3)) as Bounds);return;}
            const id=String(root?.userData.id??''),block=String(root?.userData.block??'');
            if(/cow|chicken|egg|crop:|^water$/.test(id)||/grass|flower|poppy|dandelion|daisy|bluet|torch|sugar_cane|water/.test(block)&&!['grass_block'].includes(block)||/short_grass|sugar_cane/.test(id))return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();const box=o.geometry.boundingBox!;
            if(o instanceof InstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);const b=box.clone().applyMatrix4(new Matrix4().multiplyMatrices(o.matrixWorld,matrix));result.push([...b.min.toArray(),...b.max.toArray()] as Bounds);}}
            else {const b=box.clone().applyMatrix4(o.matrixWorld);result.push([...b.min.toArray(),...b.max.toArray()] as Bounds);}
        });
        if (owner === this.authored.staticRoot) {this.staticCollisionVersion = this.authored.staticVersion; this.staticCollisions = result.slice(start);}
        }
        // Invisible full collision barriers bound the authored finite region in survival.
        result.push([-19,-8,-23,-18,32,12],[19,-8,-23,20,32,12],[-19,-8,-23,20,32,-22],[-19,-8,11,20,32,12],[-19,16,-23,20,17,12],[-19,-5,-23,20,-4,12]);if(this.worldId==='farm')result.push([8,-2,-5,9,-1,1]);this.collision=result;
    }

    /** Reject placement intersecting the player's current physical body.
     * @param {Cell} cell Candidate full block.
     * @return {boolean} Whether the player would be enclosed.
     */
    playerIntersects(cell:Cell):boolean{return overlaps(playerBounds(this.motion.feet,this.motion.crouching),[...cell,cell[0]+1,cell[1]+1,cell[2]+1]);}

    /** Collect world movement, retaining short Space presses even if released before the next physics tick.
     * @param {KeyboardEvent} event Browser key press outside editable screens.
     */
    pressMovementKey(event: KeyboardEvent): void {
        if (!this.input || this.lost || this.disposed || globalThis.document?.hidden || event.metaKey || event.altKey) return;
        if (typeof Element !== 'undefined' && event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true]')) return;
        if (!['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight'].includes(event.code)) return;
        event.preventDefault();
        this.keys.add(event.code);
        if (event.code === 'Space' && !event.repeat) this.jumpQueued = true;
        this.requestRender();
    }

    /** Consume one pending jump edge without turning a released key into a permanently held jump.
     * @return {Set<string>} Held movement keys and any unobserved jump press for this tick only.
     */
    movementKeys(): Set<string> {
        const keys = this.jumpQueued && !this.keys.has('Space') ? new Set([...this.keys, 'Space']) : this.keys;
        this.jumpQueued = false;
        return keys;
    }

    /** Advance native physics using held input plus one-shot presses, keeping the ray tied to the moving eye.
     * @param {number} now Monotonic frame time.
     */
    advancePlayer(now:number):void{
        const dt=this.motionClock?Math.min(100,now-this.motionClock):0;this.motionClock=now;
        if(!this.authored||!this.input||document.hidden||this.lost){this.motionRemainder=0;return;}
        this.hand?.update(dt);this.motionRemainder+=dt;let changed=false;
        while(this.motionRemainder>=50){this.motionRemainder-=50;const f=this.motion.feet,near=this.collision.filter(b=>b[0]<f[0]+2&&b[3]>f[0]-2&&b[1]<f[1]+3&&b[4]>f[1]-2&&b[2]<f[2]+2&&b[5]>f[2]-2);this.previousFeet=[...this.motion.feet];const p=this.environmentProgress!,fluid=p.scene==='farm'&&f[0]+.3>8&&f[0]-.3<9&&f[2]+.3>-5&&f[2]-.3<1&&f[1]<-.001,climb=blockAt(p,f.map(Math.floor) as Cell)?.block==='ladder';this.motion.tick(this.movementKeys(),this.look.yaw,near,{water:fluid,climb});this.playMovement();changed=true;}
        const alpha=this.motionRemainder/50,eye=this.motion.feet.map((n,i)=>this.previousFeet[i]+(n-this.previousFeet[i])*alpha) as Cell;this.camera.position.set(eye[0],eye[1]+(this.motion.crouching?PLAYER_PHYSICS.crouchEye:PLAYER_PHYSICS.eye),eye[2]);this.camera.updateMatrixWorld(true);if(changed||this.keys.size)this.refreshHover();
        this.renderer.domElement.dataset.player=JSON.stringify({feet:this.motion.feet,velocity:this.motion.velocity,grounded:this.motion.grounded,crouching:this.motion.crouching,sprinting:this.motion.sprinting,bob:this.motion.bob,walk:this.motion.walk,eye:this.camera.position.toArray(),yaw:this.look.yaw});
    }

    /** Emit native material footsteps and qualifying block-fall sounds in the local player channel. */
    playMovement():void{
        const p=this.environmentProgress;if(!p||!this.movementSound||!this.motion.step&&this.motion.landedDistance<=3)return;
        const feet=this.motion.feet,cell:Cell=[Math.floor(feet[0]),Math.floor(feet[1]-.2),Math.floor(feet[2])],block=blockAt(p,cell)?.block;
        if(!block)return;const sound=blockSounds(block),epoch=this.movementEpoch,fall=this.motion.landedDistance>3;
        this.movementSound(fall?sound.step.replace(/step$/,'fall'):sound.step,{volume:sound.volume*(fall?.5:.15),pitch:sound.pitch*(fall?.75:1),category:'playersVolume',valid:()=>this.movementEpoch===epoch&&this.input&&!this.disposed&&!this.lost&&!document.hidden});
    }

    /** Draw a black selection outline around the targeted native block shape.
     * @param {Pick|null} hit Current in-range target.
     */
    showOutline(hit:Pick|null):void{
        const key=JSON.stringify(hit?[hit.id,hit.cell,this.placedSignature,this.stationSignature]:null);if(this.outline?.userData.key===key)return;
        if(this.outline){this.outline.removeFromParent();this.outline.geometry.dispose();this.outline.material.dispose();this.outline=null;}
        if(!hit||!hit.cell||/cow|chicken|egg/.test(hit.id))return;
        const root=[...this.placed.children,...this.persistent.children,...(this.authored?.natural.children??[]),...(this.authored?.crops.children??[])].find(o=>o.userData.id===hit.id),shapes:Bounds[]=root?.userData.shapes??nativeShapes(hit.block??'',root?.userData.state??{})??[FULL_BLOCK];
        const geometry=new LineSegmentsGeometry();geometry.setPositions(shapeEdges(shapes));
        this.outline=new LineSegments2(geometry,new LineMaterial({color:0,transparent:true,opacity:.4,depthWrite:false,linewidth:2.5}));this.outline.position.set(...hit.cell);this.outline.userData.key=key;this.scene.add(this.outline);
    }

    /** Emit original volume fragments after a successful transaction using the real block origin.
     * @param {string} block Native short block name.
     * @param {Cell} point Observed hit point, retained for legacy callers.
     * @param {Cell} cell Native block origin.
     * @param {Record<string,string>} state Broken block properties.
     */
    breakEffect(block:string,point:Cell,cell:Cell=point.map(Math.floor) as Cell,state:Record<string,string>={}):void {
        this.feedbackEffects?.burst(block,cell,state,this.collision??[]);
        this.debris=this.feedbackEffects?.batches??[];
        this.renderer.domElement.dataset.breakParticles=JSON.stringify({block,cell,count:this.debris.at(-1)?.particles.length??0,texture:this.feedbackEffects?.sprites.get(block+JSON.stringify(state))?.texture});
        this.requestRender();
    }

    /** Submit the original small face fragment at native four-tick mining feedback boundaries.
     * @param {Pick} hit Current selected block face.
     * @param {string} block Native block identity.
     */
    hitEffect(hit:Pick,block:string):void {
        if(!hit.cell)return;
        const progress=this.environmentProgress,scene=progress?.scenes[this.worldId!],crop=scene?.crops.find(c=>'crop:'+c.id===hit.id),station=scene?.stations.find(s=>s.id===hit.id),cell=[...hit.cell] as Cell;
        const state={...(scene?.blocks?.find(b=>b.id===hit.id)?.state??(crop?{age:String(cropAge(crop.growth.version===1?crop.growth.data.ticks:0))}:station?{facing:station.facing}:{}))};
        if(block==='tall_grass'&&hit.id.startsWith('node:')){cell[1]=Math.max(cell[1],Math.floor(hit.point[1]-hit.normal[1]*.00001));state.half=cell[1]>hit.cell[1]?'upper':'lower';}
        this.feedbackEffects?.hit(block,cell,hit.normal,state,this.collision??[]);
        this.debris=this.feedbackEffects?.batches??[];
        this.requestRender();
    }

    /** Advance native particle ticks, interpolate current billboards and release expired batches.
     * @param {number} now Monotonic frame time; Infinity clears the current scene's transient effects.
     */
    updateDebris(now:number):void {this.feedbackEffects?.update(now);this.debris=this.feedbackEffects?.batches??[];}

    /** Project original crack stages onto actual geometry with native sheet UV and blend state.
     * @param {string|null} id Stable observed target identity, or null to clear.
     * @param {number} stage Native zero-based crack stage.
     */
    showCrack(id:string|null,stage=0):void {
        const candidates=[...this.persistent.children,...this.placed.children,...(this.authored?[...this.authored.natural.children,...this.authored.crops.children]:[])],target=id?candidates.find(o=>o.userData.id===id)??null:null;
        this.feedbackEffects?.showCrack(target,stage,target?.userData.cell??[0,0,0]);
        this.crack=this.feedbackEffects?.crack??null;
        const signature=JSON.stringify([id,stage]);
        if(this.crackSignature!==signature)this.renderer.domElement.dataset.crack=JSON.stringify({id,stage,projected:true,blend:['DST_COLOR','SRC_COLOR']});
        this.crackSignature=signature;
        this.requestRender();
    }

    /** Gate scene gestures before any ray access while a screen-space GUI owns input.
     * @param {boolean} enabled Whether world input is currently available.
     */
    setInputEnabled(enabled: boolean): void {
        if(this.input===enabled)return;
        this.input = enabled;
        this.mode?.pause(!enabled);
        this.cancel();
        if (!enabled) this.showPreview(null);
        this.requestRender();
    }

    /** Ray-pick actual geometry, respecting depth, opaque scenery and original alpha cutouts.
     * @param {number} x Pointer client X.
     * @param {number} y Pointer client Y.
     * @return {Pick|null} Nearest visible object and transformed face normal.
     */
    pick(x: number, y: number): Pick | null {
        if (!this.input || this.lost || this.disposed) return null;
        const r = this.renderer.domElement.getBoundingClientRect();
        this.scene.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        this.ray.far=this.authored?PLAYER_PHYSICS.blockReach:Infinity;
        this.ray.setFromCamera(new Vector2((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2), this.camera);
        const hit = this.ray.intersectObjects([this.world, this.persistent,this.placed, ...(this.authored ? [this.authored.staticRoot, this.authored.natural, this.authored.crops] : [])], true).find(h => this.models.accepts(h));
        return hit && (!/cow|chicken/.test(this.hit(hit).id)||hit.distance<=PLAYER_PHYSICS.entityReach) ? this.hit(hit) : null;
    }

    /** Resolve an original mesh's domain identity and world-space face.
     * @param {Intersection<Object3D>} hit Actual ray intersection.
     * @return {Pick} Metadata independent of view pixels.
     */
    hit(hit: Intersection<Object3D>): Pick {
        let root: Object3D | null = hit.object;
        while (root && !root.userData.id) root = root.parent;
        const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? new Vector3();
        return {
            id: String(root?.userData.id ?? 'scenery'),
            point: hit.point.toArray() as [number, number, number],
            normal: normal.toArray() as [number, number, number],
            cell: root?.userData.cells?.[hit.instanceId ?? -1] ?? root?.userData.cell,
            block: root?.userData.block,
            support: root?.userData.support
        };
    }

    /** Apply a changed framebuffer only immediately before drawing its complete replacement frame. */
    resizeViewport(): void {
        const size = this.viewport;
        if (!size) return;
        this.viewport = null;
        const canvas = this.renderer.domElement;
        if (canvas.width === Math.floor(size.width * size.ratio) && canvas.height === Math.floor(size.height * size.ratio) && this.renderer.getPixelRatio() === size.ratio) return;
        if (this.renderer.getPixelRatio() !== size.ratio) this.renderer.setPixelRatio(size.ratio);
        this.renderer.setSize(size.width, size.height, false);
        this.camera.aspect = size.width / size.height;
        this.camera.fov = this.camera.aspect < .6 ? 105 : this.camera.aspect < 1.1 ? 95 : 70;
        this.camera.updateProjectionMatrix();
        this.refreshHover();
    }

    /** Coalesce real-time rendering and viewport replacement in the same browser animation frame. */
    requestRender(): void {
        if (this.disposed || this.lost || this.queued) return;
        this.queued = requestAnimationFrame(() => {
            this.queued = 0;
            if (this.disposed || this.lost) return;
            this.resizeViewport();
            const start = performance.now();this.advancePlayer(start);const continuing = this.onFrame?.(start) ?? false;
            this.models.animate(start);
            this.blockLight?.update(start);
            if(this.sky&&this.precipitation&&this.environmentProgress&&this.authored){
                const p=this.environmentProgress,weather=this.sky.weatherAt(start);
                const weatherEnd=timing('weather-update'),ticks=this.sky.ticksAt(start);this.precipitation.update(this.camera,p,this.authored.staticRoot,ticks,weather.rain,weather.snow);
                this.weather?.update(ticks,p.scene,this.camera.position.toArray(),this.precipitation.heights,weather);this.sky.flash=!!this.weather&&this.weather.flashUntil>=Math.floor(ticks);this.onEnvironmentFrame?.(start);weatherEnd();
            }
            this.updateDebris(start);
            const end = timing('cpu-render-submit'),
                gpuEnd = gpuTiming(this.renderer.getContext() as WebGL2RenderingContext);
            const resetInfo = this.renderer.info.autoReset;
            this.renderer.info.autoReset = false; this.renderer.info.reset();
            const projection=this.camera.projectionMatrix.clone(),bob=this.authored?viewBob(this.motion,this.motionRemainder/50):new Matrix4();
            this.camera.projectionMatrix.multiply(bob);
            try {
                const host = this.renderer.domElement.parentElement;
                if (host?.dataset.effect === 'menu') {
                    const layers=menuLayers(host);this.menuBlur.render(this.renderer, this.scene, this.camera, layers,this.sky?()=>{this.sky!.render(this.renderer,this.camera,start);this.applySkyLighting();}:undefined);
                    host.dataset.menuComposited='true';this.renderer.domElement.dataset.menuComposite=JSON.stringify(layers.map(({canvas,...layout})=>layout));
                } else {if(host)delete host.dataset.menuComposited;const clear=this.renderer.autoClear;try{if(this.sky){this.sky.render(this.renderer,this.camera,start);this.applySkyLighting();this.renderer.autoClear=false;}this.renderer.render(this.scene,this.camera);}finally{this.renderer.autoClear=clear;}}
                if(this.outline){const w=this.renderer.domElement.width,ratio=this.renderer.getPixelRatio();this.outline.material.linewidth=Math.max(2.5,w/1920*2.5)/ratio;}
                if(this.input)this.hand?.render(this.renderer,bob);
                if(this.crosshair&&this.hand){this.crosshair.attackProgress=this.hand.charge();const target=JSON.parse(this.renderer.domElement.dataset.hover??'null');this.crosshair.attackFull=this.hand.charge()>=1&&20/attackProfile(this.hand.pending).speed>5&&/cow|chicken/.test(target?.id??'');}
                this.crosshair?.render(this.renderer, {actual: this.mode?.actual ?? false, owned: document.pointerLockElement === this.renderer.domElement, desired: this.mode?.desired ?? 'visible', pending: this.mode?.pending ?? false, paused: this.mode?.paused ?? true, enabled: this.input && !document.hidden, lost: this.lost, disposed: this.disposed});
            } finally {this.renderer.info.autoReset = resetInfo;this.camera.projectionMatrix.copy(projection);}
            gpuEnd();
            end();
            this.frames++;
            this.renderer.domElement.dataset.renderedScene = this.worldId ?? 'presentation';
            this.renderer.domElement.dataset.frames = String(this.frames);
            this.renderMs.push(performance.now() - start);
            if (this.renderMs.length > 240) this.renderMs.shift();
            if(this.sky)this.renderer.domElement.dataset.environment=JSON.stringify({...this.sky.report,rainTick:this.sky.ticksAt(start),rainCenter:this.precipitation?.center,rainColumns:this.precipitation?.columns,lightning:this.weather?.records,activeLightning:this.weather?.bolts.length,lightningChunks:this.weather?.chunks.length});
            this.renderer.domElement.dataset.drawCalls = String(this.renderer.info.render.calls);
            this.renderer.domElement.dataset.geometry = String(this.renderer.info.memory.geometries);
            this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
            if (!globalThis.document?.hidden&&(continuing || this.debris.length || this.sky)) this.requestRender();
        });
    }

    /** Combine native sky intensity with the finite block-light field, independently of GUI materials. */
    applySkyLighting():void{
        if(!this.sky)return;
        if(this.scene.fog && this.sky.scene.background instanceof Color) this.scene.fog.color.copy(this.sky.scene.background);
        const factor=this.worldId==='cave'?0:Number(this.sky.report.skyLightFactor??1),rgb=this.sky.report.skyLightColor as number[]??[1,1,1],tint=new Color().setRGB(rgb[0],rgb[1],rgb[2]);
        if(this.blockLight){this.blockLight.sky.value.copy(tint).multiplyScalar(factor);return;}
        for(const material of this.models.materials.values()){
            let base=this.skyBaseColors.get(material);if(!base){base=material.color.clone();this.skyBaseColors.set(material,base);}
            material.color.copy(base).multiply(tint).multiplyScalar(factor);
        }
    }

    /** Refresh the menu's pre-blur HUD only when its native source canvas has changed. */
    backgroundChanged(): void {if (this.renderer.domElement.parentElement?.dataset.effect === 'menu') this.requestRender();}

    /** Release owned per-instance geometry; shared original materials belong to the model factory.
     * @param {Object3D} object Scene instance.
     */
    release(object: Object3D): void {
        object.removeFromParent();
        object.traverse(child => {
            if (child instanceof Mesh) child.geometry.dispose();
        });
    }

    /** Remove renderer callbacks, resize observation, input listeners and all owned GPU resources. */
    dispose(): void {
        if (this.disposed) return;
        this.controlsAbort.abort();this.hand?.dispose();this.showOutline(null);
        this.blockLight?.dispose();this.movementSound=null;
        this.mode?.dispose();
        this.sky?.dispose(); this.precipitation?.dispose();this.weather?.dispose();this.onEnvironmentFrame=null;
        this.disposed = true;
        clearInterval(this.animation);
        this.cancel();
        cancelAnimationFrame(this.queued);
        this.queued = 0;
        this.observer.disconnect();
        const c = this.renderer.domElement;
        c.removeEventListener('pointerdown', this.down);
        c.removeEventListener('pointermove', this.move);
        c.removeEventListener('pointerup', this.up);
        c.removeEventListener('pointercancel', this.cancel);
        c.removeEventListener('lostpointercapture', this.captureLost);
        c.removeEventListener('pointerleave', this.leave);
        c.removeEventListener('contextmenu', this.contextMenu);
        window.removeEventListener('blur', this.cancel);
        document.removeEventListener('visibilitychange', this.visibility);
        c.removeEventListener('webglcontextlost', this.lostHandler);
        c.removeEventListener('webglcontextrestored', this.restoredHandler);
        for (const child of [...this.world.children, ...this.persistent.children,...this.placed.children]) this.release(child);
        this.showPreview(null);
        this.showCrack(null);
        this.updateDebris(Infinity);
        this.authored?.dispose();
        this.feedbackEffects?.dispose();
        this.models.dispose();
        this.crosshair?.dispose(); this.menuBlur.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        c.remove();
        this.onFrame = null;
        this.onPick = null;
        this.onUse = null;
        this.onHover = null;
        this.onGraphics = null;
    }
}
