/** Java 26.3 panorama and loading screen, isolated from unfinished game controls and simulation. */
import {BoxGeometry, CubeTexture, DoubleSide, LinearFilter, Matrix4, Mesh, NoColorSpace, PerspectiveCamera, Scene, ShaderMaterial, WebGLRenderer} from 'three';
import {NativeMenuBlur} from '../render/native-menu-blur.ts';
import {BitmapFont} from './vanilla.ts';
import {LoadingProgress, loadingCell, loadingLayout, LOADING_RADIUS, PANORAMA_FACES} from './loading-progress.ts';
import type {LoadingStage} from './loading-progress.ts';
import {RESOURCE_BASE as BASE, fetchManifest} from '../render/resource-fetch.ts';

/** The formal mount reports real work; the screen owns only temporary presentation. */
export interface LoadingPort {
    update(stage: LoadingStage, done: number, total?: number): void;
    finish(): void;
    fail(message: string): void;
    dispose(): void;
}
/** Every bootstrap byte is verified before it can become a font or panorama texture. */
interface Entry {entry: string; size: number; sha256: string}

/** Own a bounded startup renderer, one RAF and native bitmap overlay until the first usable game frame. */
export class LoadingScreen implements LoadingPort {
    progress = new LoadingProgress();
    renderer: WebGLRenderer | null = null;
    blur: NativeMenuBlur | null = null;
    texture: CubeTexture | null = null;
    mesh: Mesh<BoxGeometry, ShaderMaterial> | null = null;
    scene = new Scene();
    camera = new PerspectiveCamera(85, 1, .05, 10);
    overlay = document.createElement('canvas');
    font: BitmapFont | null = null;
    images = new Map<string, HTMLCanvasElement>();
    frame = 0;
    last = 0;
    frames = 0;
    error = '';
    abort = new AbortController();
    /** Keep early HTML visible while original assets and the application's dynamic import load.
     * @param {HTMLElement} host Independent loading sibling, outside the application's mount root.
     */
    constructor(public host: HTMLElement) {
        host.dataset.loading = 'active';
        host.append(this.overlay);
        this.overlay.setAttribute('aria-hidden', 'true');
        window.addEventListener('pagehide', event => {if (!event.persisted) this.dispose();}, {signal: this.abort.signal});
        document.addEventListener('visibilitychange', () => {this.last = 0;}, {signal: this.abort.signal});
    }
    /** Decode the small original startup profile and shared font without waiting for the main game's dependencies.
     * @return {Promise<void>} Panorama and native text readiness.
     */
    async initialize(): Promise<void> {
        const response = await fetchManifest('startup-manifest.json');
        if (!response.ok) throw Error('startup-resource-unavailable');
        const manifest = await response.json();
        if (manifest.version !== '26.3' || manifest.clientSha1 !== 'e877b6a07acd633fb3bb475002175cec036e7b87') throw Error('startup-resource-version');
        const documents = new Map<string, unknown>(), entries: Entry[] = [...manifest.entries, ...Object.entries(manifest.inputs).map(([entry, metadata]) => ({entry, ...metadata as Omit<Entry, 'entry'>}))];
        let done = 0;
        await Promise.all(entries.map(async entry => {
            if (!/^assets\/minecraft\/[a-z0-9_/.]+$/.test(entry.entry) || entry.entry.includes('..')) throw Error('startup-resource-path');
            const result = await fetch(BASE + entry.entry);
            if (!result.ok) throw Error('startup-resource-unavailable');
            const bytes = await result.arrayBuffer(), hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
            if (bytes.byteLength !== entry.size || hash !== entry.sha256) throw Error('startup-resource-integrity');
            if (this.progress.ended) return;
            if (entry.entry.endsWith('.png')) {
                const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'})), canvas = document.createElement('canvas');
                canvas.width = bitmap.width; canvas.height = bitmap.height;
                canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
                if (!this.progress.ended) this.images.set(entry.entry, canvas);
            } else documents.set(entry.entry, JSON.parse(new TextDecoder().decode(bytes)));
            this.update('bootstrap', ++done, entries.length);
        }));
        if (this.progress.ended) return;
        this.font = new BitmapFont(documents, this.images);
        this.renderer = new WebGLRenderer({antialias: false, alpha: false});
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.host.prepend(this.renderer.domElement);
        const faces = PANORAMA_FACES.map(index => {
            const original = this.image(`title/background/panorama_${index}.png`), flipped = document.createElement('canvas');
            flipped.width = original.width; flipped.height = original.height;
            const c = flipped.getContext('2d')!; c.translate(0, original.height); c.scale(1, -1); c.drawImage(original, 0, 0);
            return flipped;
        });
        this.texture = new CubeTexture(faces); this.texture.colorSpace = NoColorSpace; this.texture.minFilter = this.texture.magFilter = LinearFilter; this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
        const material = new ShaderMaterial({side: DoubleSide, depthTest: false, depthWrite: false, toneMapped: false, uniforms: {panorama: {value: this.texture}}, vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform samplerCube panorama;varying vec3 direction;vec3 linear(vec3 v){return mix(pow((v+.055)/1.055,vec3(2.4)),v/12.92,lessThanEqual(v,vec3(.04045)));}void main(){gl_FragColor=vec4(linear(textureCube(panorama,direction).rgb),1.);}'});
        this.mesh = new Mesh(new BoxGeometry(2, 2, 2), material); this.mesh.matrixAutoUpdate = false; this.scene.add(this.mesh);
        this.blur = new NativeMenuBlur();
        this.host.querySelector('.loading-fallback')?.remove();
        this.render(performance.now());
    }
    /** Resolve an already verified GUI texture.
     * @param {string} path Original GUI-relative name.
     * @return {HTMLCanvasElement} Shared startup image.
     */
    image(path: string): HTMLCanvasElement {return this.images.get('assets/minecraft/textures/gui/' + path)!;}
    /** Record real initialization work without coupling it to the indicator animation.
     * @param {LoadingStage} stage Work owner.
     * @param {number} done Completed units.
     * @param {number} total Planned units for this owner.
     */
    update(stage: LoadingStage, done: number, total = 1): void {this.progress.update(stage, done, total);}
    /** Paint native panorama and progress at current DPR, keeping wrapped labels above the bar.
     * @param {number} now RAF realtime milliseconds.
     */
    render(now: number): void {
        if (this.progress.ended || !this.renderer || !this.mesh || !this.font) return;
        if (!document.hidden) {
            const delta = this.last ? now - this.last : 0; this.progress.advance(delta);
            const width = this.host.clientWidth, height = this.host.clientHeight, dpr = devicePixelRatio || 1, layout = loadingLayout(width, height, dpr);
            this.renderer.setPixelRatio(dpr); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
            this.mesh.matrix.makeRotationX(Math.PI).multiply(new Matrix4().makeRotationX(10 * Math.PI / 180)).multiply(new Matrix4().makeRotationY(-this.progress.spin * Math.PI / 180));
            this.blur!.render(this.renderer, this.scene, this.camera, [{canvas: this.image('title/background/panorama_overlay.png'), key: 'panorama-overlay', x: 0, y: 0, width, height, viewportWidth: width, viewportHeight: height}]);
            const c = this.overlay.getContext('2d')!;
            this.overlay.width = Math.round(width * dpr); this.overlay.height = Math.round(height * dpr);
            c.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, 0, 0);
            const pattern = c.createPattern(this.image('menu_background.png'), 'repeat')!; pattern.setTransform(new DOMMatrix().scale(2)); c.fillStyle = pattern; c.fillRect(0, 0, layout.w, layout.h);
            c.imageSmoothingEnabled = false;
            const text = this.error || this.host.dataset.label || '', lines: string[] = [];
            let line = '';
            for (const word of text.split(' ')) {
                const candidate = line ? line + ' ' + word : word;
                if (line && this.font.width(candidate) > layout.w - 16) {lines.push(line); line = word;} else line = candidate;
            }
            if (line) lines.push(line);
            lines.forEach((value, index) => this.font!.draw(c, value, layout.cx - Math.floor(this.font!.width(value) / 2), layout.textY - (lines.length - 1 - index) * 12, '#FFFFFF', true));
            if (!this.error) {
                c.fillStyle = '#000000'; c.fillRect(layout.barX, layout.barY, 200, 2);
                c.fillStyle = '#00FF00'; c.fillRect(layout.barX, layout.barY, Math.round(this.progress.smoothed * 200), 2);
                for (let z = -LOADING_RADIUS; z <= LOADING_RADIUS; z++) for (let x = -LOADING_RADIUS; x <= LOADING_RADIUS; x++) {
                    c.fillStyle = '#' + loadingCell(x, z, this.progress.smoothed).toString(16).padStart(6, '0');
                    c.fillRect(layout.chunkX + (x + LOADING_RADIUS) * 2, layout.chunkY + (z + LOADING_RADIUS) * 2, 2, 2);
                }
            }
            this.host.dataset.progress = String(this.progress.target); this.host.dataset.smoothed = String(this.progress.smoothed); this.host.dataset.spin = String(this.progress.spin); this.host.dataset.frames = String(++this.frames); this.host.dataset.layout = JSON.stringify({...layout, dpr});
        }
        this.last = document.hidden ? 0 : now;
        this.frame = requestAnimationFrame(time => this.render(time));
    }
    /** Remove loading presentation only after the formal game has painted its first usable frame. */
    finish(): void {this.dispose();}
    /** Keep a native-text error instead of obscuring an initialization failure with endless progress.
     * @param {string} message Localized actual failure.
     */
    fail(message: string): void {
        if (this.progress.ended) return;
        this.error = message; this.host.dataset.loading = 'failed';
        this.host.setAttribute('role', 'alert'); this.host.setAttribute('aria-label', message);
        if (!this.renderer || !this.mesh || !this.blur) {const fallback = this.host.querySelector('.loading-fallback'); if (fallback) fallback.textContent = message;}
    }
    /** Fence late decodes and release every bounded startup GPU object and animation callback. */
    dispose(): void {
        if (this.progress.ended) return;
        this.progress.ended = true; cancelAnimationFrame(this.frame); this.abort.abort();
        this.blur?.dispose(); this.mesh?.geometry.dispose(); this.mesh?.material.dispose(); this.texture?.dispose(); this.scene.clear();
        this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.images.clear(); this.host.remove();
    }
}
