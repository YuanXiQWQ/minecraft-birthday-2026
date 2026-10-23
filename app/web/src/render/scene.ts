/** Production-facing real 3D presentation and persistent-instance port, without P2 fixtures or gameplay simulation. */
import {timing, gpuTiming} from '../performance.ts';
import {
    Color,
    Group,
    MeshBasicMaterial,
    PlaneGeometry,
    CanvasTexture,
    NearestFilter,
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
import {WORLD_SCENES} from '../domain/world-config.ts';
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
}

/** Own one event-driven WebGL2 view and its original-resource model instances. */
export class SceneView {
    renderer: WebGLRenderer;
    scene = new Scene();
    camera = new PerspectiveCamera(70, 1, .1, 90);
    models: VanillaModels;
    ray = new Raycaster();
    world = new Group();
    persistent = new Group();
    cake: Group | null = null;
    look = new Look();
    mode: PointerMode | null = null;
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
    onMineStart: ((hit: Pick) => void) | null = null;
    onMineCancel: (() => void) | null = null;
    debris: { mesh: Mesh; velocity: Vector3; start: number; origin: Vector3 }[] = [];
    crackSignature = '';
    crackImages = new Map<string, HTMLCanvasElement>();
    crack: Group | null = null;
    crackTexture: CanvasTexture | null = null;
    onHover: ((hit: Pick | null) => void) | null = null;
    pointerPosition: [number, number] | null = null;
    config: PresentationSpec;
    observer: ResizeObserver;
    queued = 0;
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
        this.crackImages = pack.guiImages;
        const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2', {antialias: true});
        if (!gl) throw new Error('webgl-unavailable');
        this.renderer = new WebGLRenderer({canvas, context: gl, antialias: true});
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        canvas.setAttribute('aria-label', label);
        canvas.setAttribute('role', 'img');
        canvas.dataset.resourceVersion = '26.3';
        host.append(canvas);
        this.models = new VanillaModels(pack);
        this.scene.background = new Color(game ? '#617C7B' : '#9BAFA0');
        this.scene.add(this.world, this.persistent);
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
            this.authored = new AuthoredWorld(this.models, pack);
            this.scene.add(this.authored.staticRoot, this.authored.natural, this.authored.crops);
        }
        this.camera.position.set(0, config.eye, game ? config.gameZ : config.homeZ);
        this.camera.lookAt(0, config.targetY, 0);
        this.camera.rotation.order = 'YXZ';
        this.basePitch = this.camera.rotation.x;
        this.camera.updateMatrixWorld(true);
        this.cancel = () => this.cancelInput();
        if (game) this.mode = new PointerMode(canvas, () => {this.cancelInput(); this.refreshHover();}, () => this.onEscape?.(), () => this.onPointerFailure?.());
        this.down = e => {
            if (!this.input || this.lost) return;
            if (this.mode?.enter()) {e.preventDefault(); return;}
            this.pointerPosition = [e.clientX, e.clientY];
            if (e.button === 2) {
                e.preventDefault();
                this.cancel();
                this.pointerPosition = [e.clientX, e.clientY];
                this.rightTarget = this.refreshHover()?.id ?? null;
                this.rightMotion = 0;
                this.look.begin(e.pointerId, e.clientX, e.clientY);
                this.onHover?.(null);
                canvas.setPointerCapture(e.pointerId);
            } else if (e.button === 0 && !this.look.active) {
                this.pointer = e.pointerId;
                const hit = this.refreshHover();
                if (hit) this.onMineStart?.(hit);
            }
        };
        this.move = e => this.movePointer(e, game);
        this.up = e => this.releasePointer(e);
        this.captureLost = () => {
            if (this.look.active) this.cancel(); else this.refreshHover();
        };
        this.leave = () => {
            if (!this.look.active) this.cancel();
        };
        this.contextMenu = e => {
            e.preventDefault();
        };
        this.visibility = () => {
            if (document.hidden) this.cancel();
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
            this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h;
            this.camera.fov = w / h < .6 ? 105 : w / h < 1.1 ? 95 : 70;
            this.camera.updateProjectionMatrix();
            this.refreshHover();
            this.requestRender();
        });
        this.observer.observe(host);
        if (game) this.animation = window.setInterval(() => {
            if (!document.hidden) this.requestRender();
        }, 50);
        this.requestRender();
    }

    /** Resolve the current pointer against the current camera and geometry, excluding all active look gestures.
     * @return {Pick|null} A fresh visible hit or no actionable pointer.
     */
    refreshHover(): Pick | null {
        const r = this.renderer.domElement.getBoundingClientRect(), position = this.mode?.actual ? [r.left + r.width / 2, r.top + r.height / 2] : this.pointerPosition;
        const hit = position && !this.look.active && position[0] >= r.left && position[0] < r.right && position[1] >= r.top && position[1] < r.bottom ? this.pick(position[0], position[1]) : null;
        this.renderer.domElement.dataset.hover = JSON.stringify(hit);
        this.onHover?.(hit);
        return hit;
    }

    /** Invalidate gestures and ray identity on GUI, lifecycle and capture boundaries. */
    cancelInput(): void {
        this.onMineCancel?.();
        this.pointer = null;
        this.pointerPosition = null;
        this.rightTarget = null;
        const id = this.look.active?.pointer;
        this.look.cancel();
        this.renderer.domElement.dataset.hover = 'null';
        this.onHover?.(null);
        if (id !== undefined && this.renderer.domElement.hasPointerCapture(id)) this.renderer.domElement.releasePointerCapture(id);
    }

    /** Update a scene gesture without retaining an actionable hit while the camera rotates.
     * @param {PointerEvent} e Native pointer movement.
     * @param {boolean} game Whether bounded first-person look is enabled.
     */
    movePointer(e: PointerEvent, game: boolean): void {
        if (!this.input || this.lost) return;
        if (this.mode?.actual) {
            if (this.look.active) {this.rightMotion += Math.hypot(e.movementX, e.movementY); if (this.rightMotion >= this.look.threshold) this.look.active.dragging = true;}
            this.look.relative(e.movementX, e.movementY);
            this.camera.rotation.set(this.basePitch + this.look.pitch, this.look.yaw, 0, 'YXZ');
            this.camera.updateMatrixWorld(true); this.refreshHover(); this.requestRender(); return;
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
            this.camera.rotation.set(this.basePitch + this.look.pitch, this.look.yaw, 0, 'YXZ');
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
            if (result === 'use' && (hit?.id ?? null) === target && this.canUse && !this.canUse(hit)) {this.mode?.toggle(); return;}
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
            mesh.userData.id = station.id;
            this.persistent.add(mesh);
        }
        this.requestRender();
    }

    /** Project the selected authored scene and durable natural/crop layers. @param {Progress} p Current authoritative progress. */
    syncWorld(p: Progress): void {
        if (!this.authored) return;
        if (this.worldId === null) this.renderer.domElement.dataset.recoveredWorld = JSON.stringify({
            tick: p.world.tick,
            scene: p.scene,
            crops: p.scenes.farm.crops
        });
        if (this.worldId !== p.scene) {
            this.mode?.suspend();
            this.updateDebris(Infinity);
            this.worldId = p.scene;
            this.authored.build(p.scene);
            const spec = WORLD_SCENES[p.scene];
            this.scene.background = new Color(spec.sky);
            this.camera.position.set(...spec.eye);
            this.camera.lookAt(...spec.target);
            this.camera.rotation.order = 'YXZ';
            this.basePitch = this.camera.rotation.x;
            this.look.yaw = 0;
            this.look.pitch = 0;
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
        this.refreshHover();
        this.requestRender();
        end();
    }

    /** Render an original device as a validity-tinted preview excluded from ray hits. @param {object|null} value Candidate state or no preview. */
    showPreview(value: { kind: Kind; facing: Facing; cell: Cell; valid: boolean } | null): void {
        const signature = JSON.stringify(value);
        this.renderer.domElement.dataset.placementPreview = signature;
        if (this.preview?.userData.signature === signature) return;
        if (this.preview) {
            this.release(this.preview);
            this.preview = null;
        }
        if (value) {
            this.preview = this.models.device(value.kind, value.facing, false, value.valid ? 0x80ff80 : 0xff5555);
            this.preview.position.set(...value.cell);
            this.preview.userData.signature = signature;
            this.scene.add(this.preview);
        }
        this.requestRender();
    }

    /** Emit small native-texture fragments after a successful break without creating collectible world entities.
     * @param {string} block Native short block name.
     * @param {Cell} point Actual broken surface.
     */
    breakEffect(block: string, point: Cell): void {
        const name = block === 'crafting_table' ? 'crafting_table_top' : block === 'hopper' ? 'hopper_outside' : ['furnace', 'blast_furnace'].includes(block) ? block + '_side' : block,
            image = this.crackImages.get('assets/minecraft/textures/block/' + name + '.png');
        if (!image) return;
        for (let i = 0; i < 12; i++) {
            const texture = new CanvasTexture(image);
            texture.minFilter = texture.magFilter = NearestFilter;
            const geometry = new PlaneGeometry(.08, .08), uv = geometry.getAttribute('uv'), u = (i % 4) / 4,
                v = (Math.floor(i / 4) % 4) / 4;
            for (let n = 0; n < uv.count; n++) uv.setXY(n, u + uv.getX(n) / 4, v + uv.getY(n) / 4);
            const mesh = new Mesh(geometry, new MeshBasicMaterial({map: texture, transparent: true, alphaTest: .1})),
                origin = new Vector3(...point);
            mesh.position.copy(origin);
            mesh.quaternion.copy(this.camera.quaternion);
            this.scene.add(mesh);
            const angle = i * 2.399963;
            this.debris.push({
                mesh,
                origin,
                start: performance.now(),
                velocity: new Vector3(Math.sin(angle) * .7, .8 + i % 3 * .15, Math.cos(angle) * .7)
            });
        }
        this.requestRender();
    }

    /** Advance only transient native-texture feedback and release every owned fragment allocation.
     * @param {number} now Monotonic frame time.
     */
    updateDebris(now: number): void {
        this.debris = this.debris.filter(p => {
            const t = (now - p.start) / 1000;
            if (t >= .75) {
                p.mesh.removeFromParent();
                p.mesh.geometry.dispose();
                const material = p.mesh.material as MeshBasicMaterial;
                material.map?.dispose();
                material.dispose();
                return false;
            }
            p.mesh.position.copy(p.origin).addScaledVector(p.velocity, t);
            p.mesh.position.y -= 2 * t * t;
            p.mesh.quaternion.copy(this.camera.quaternion);
            return true;
        });
    }

    /** Project the current destruction stage onto the real target geometry without modifying shared model materials.
     * @param {string|null} id Stable target identity, or null to cancel.
     * @param {number} stage Native crack stage zero through nine.
     */
    showCrack(id: string | null, stage = 0): void {
        const signature = JSON.stringify([id, stage]);
        if (this.crackSignature === signature) return;
        this.crackSignature = signature;
        if (this.crack) {
            this.crack.removeFromParent();
            this.crack.traverse(o => {
                if (o instanceof Mesh) (o.material as MeshBasicMaterial).dispose();
            });
            this.crack = null;
        }
        this.crackTexture?.dispose();
        this.crackTexture = null;
        if (id) {
            const candidates = [...this.persistent.children, ...(this.authored ? [...this.authored.natural.children, ...this.authored.crops.children] : [])],
                target = candidates.find(o => o.userData.id === id),
                image = this.crackImages.get('assets/minecraft/textures/block/destroy_stage_' + Math.max(0, Math.min(9, stage)) + '.png');
            if (target && image) {
                const texture = new CanvasTexture(image);
                texture.magFilter = texture.minFilter = NearestFilter;
                this.crackTexture = texture;
                const overlay = new Group();
                target.updateMatrixWorld(true);
                target.traverse(o => {
                    if (o instanceof Mesh) {
                        const m = new Mesh(o.geometry, new MeshBasicMaterial({
                            map: texture,
                            transparent: true,
                            depthWrite: false,
                            polygonOffset: true,
                            polygonOffsetFactor: -2
                        }));
                        m.matrixAutoUpdate = false;
                        m.matrix.copy(o.matrixWorld);
                        overlay.add(m);
                    }
                });
                this.crack = overlay;
                this.scene.add(overlay);
            }
        }
        this.requestRender();
    }

    /** Gate scene gestures before any ray access while a screen-space GUI owns input.
     * @param {boolean} enabled Whether world input is currently available.
     */
    setInputEnabled(enabled: boolean): void {
        this.mode?.pause(!enabled);
        this.input = enabled;
        this.cancel();
        if (!enabled) this.showPreview(null);
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
        this.ray.setFromCamera(new Vector2((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2), this.camera);
        const hit = this.ray.intersectObjects([this.world, this.persistent, ...(this.authored ? [this.authored.staticRoot, this.authored.natural, this.authored.crops] : [])], true).find(h => this.models.accepts(h));
        return hit ? this.hit(hit) : null;
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
            support: root?.userData.support
        };
    }

    /** Coalesce real-time rendering requests without installing duplicate perpetual animation loops. */
    requestRender(): void {
        if (this.disposed || this.lost || this.queued) return;
        this.queued = requestAnimationFrame(() => {
            this.queued = 0;
            if (this.disposed || this.lost) return;
            const start = performance.now(), continuing = this.onFrame?.(start) ?? false;
            this.models.animate(start);
            this.updateDebris(start);
            const end = timing('cpu-render-submit'),
                gpuEnd = gpuTiming(this.renderer.getContext() as WebGL2RenderingContext);
            this.renderer.render(this.scene, this.camera);
            gpuEnd();
            end();
            this.frames++;
            this.renderer.domElement.dataset.renderedScene = this.worldId ?? 'presentation';
            this.renderer.domElement.dataset.frames = String(this.frames);
            this.renderMs.push(performance.now() - start);
            if (this.renderMs.length > 240) this.renderMs.shift();
            this.renderer.domElement.dataset.drawCalls = String(this.renderer.info.render.calls);
            this.renderer.domElement.dataset.geometry = String(this.renderer.info.memory.geometries);
            this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
            if (continuing || this.debris.length) this.requestRender();
        });
    }

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
        this.mode?.dispose();
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
        for (const child of [...this.world.children, ...this.persistent.children]) this.release(child);
        this.showPreview(null);
        this.showCrack(null);
        this.updateDebris(Infinity);
        this.authored?.dispose();
        this.models.dispose();
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
