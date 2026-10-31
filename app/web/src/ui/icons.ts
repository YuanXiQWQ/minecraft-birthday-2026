/** Hash-verified original item definitions become cached transparent GUI icons, without importing experimental entry points. */
import {assetPath} from '../render/asset-path.ts';
import {
    BufferGeometry,
    Float32BufferAttribute,
    Mesh,
    CanvasTexture,
    NearestFilter,
    NoColorSpace,
    ShaderMaterial,
    DoubleSide,
    Group,
    Scene,
    OrthographicCamera,
    WebGLRenderer,
    Matrix4,
    Quaternion,
    Vector3
} from 'three';
import {NativeCompass, compassModel} from './compass.ts';
import type {CompassView} from './compass.ts';
import {guiLights} from './icon-light.ts';
import {fetchAsset,fetchManifest} from '../render/resource-fetch.ts';
import {resourceId, resolveTexture} from '../render/model-format.ts';
import {iconParts, iconModel, iconGeometry} from './icon-model.ts';
import type {IconPart} from './icon-model.ts';
import type {CompiledModel} from '../render/model-format.ts';

export interface CatalogueArt {
    icons: Map<string, HTMLCanvasElement>;
    images: Map<string, HTMLCanvasElement>;
    documents: Map<string, any>;
    coverage: object[];
    kinds?: Map<string, 'sprite' | 'model'>;
    update: (time: number, compass?: CompassView | null) => boolean;
    dispose: () => void;
}

/** Build entity-model cuboids with the native Cube face layout, texture offsets and 64x64 UV atlas.
 * @param {number[]} box Native x,y,z,width,height,depth,u,v tuple.
 * @param {string} texture Original atlas ID.
 * @param {'east'|'west'} omitSide Internal face omitted by a native double-chest half.
 * @return {CompiledModel} Native cube quads.
 */
export function entityCube(box: number[], texture: string, omitSide?:'east'|'west'): CompiledModel {
    const [x, y, z, w, h, d, u, v] = box, X = x + w, Y = y + h, Z = z + d,
        vertices = [[x, y, z], [X, y, z], [X, Y, z], [x, Y, z], [x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]],
        faces = [[5, 4, 0, 1], [2, 3, 7, 6], [0, 4, 7, 3], [1, 0, 3, 2], [5, 1, 2, 6], [4, 5, 6, 7]],
        rects = [[u + d, v, u + d + w, v + d], [u + d + w, v + d, u + d + 2 * w, v], [u, v + d, u + d, v + d + h], [u + d, v + d, u + d + w, v + d + h], [u + d + w, v + d, u + 2 * d + w, v + d + h], [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h]],
        out: CompiledModel = {positions: [], normals: [], uvs: [], indices: [], faces: [], textures: [texture]};
    for (let f = 0; f < 6; f++) {
        const ps = faces[f].map(i => new Vector3(...vertices[i] as [number, number, number]).multiplyScalar(1 / 16)),
            n = ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).normalize(), [a, b, A, B] = rects[f],
            uv = [[A, b], [a, b], [a, B], [A, B]];
        if(omitSide==='east'&&n.x>.5||omitSide==='west'&&n.x<-.5)continue;
        const start = out.positions.length/3;
        for (let i = 0; i < 4; i++) {
            out.positions.push(...ps[i].toArray());
            out.normals.push(...n.toArray());
            out.uvs.push(uv[i][0] / 64, 1 - uv[i][1] / 64);
        }
        out.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        out.faces.push({direction: 'north', texture});
    }
    return out;
}

/** Draw a native icon with its original GUI scale, including special-model overhang outside a slot.
 * @param {CanvasRenderingContext2D} context Target canvas.
 * @param {HTMLCanvasElement} icon Cached icon and its logical transparent margin.
 * @param {number} x Slot's icon origin.
 * @param {number} y Slot's icon origin.
 * @param {number} size Logical icon size.
 * @param {HTMLCanvasElement} source Optional alpha-preserving tinted copy.
 */
export function drawIcon(context:CanvasRenderingContext2D,icon:HTMLCanvasElement,x:number,y:number,size=16,source=icon):void{
    const padding=Number(icon.dataset?.nativePadding??0)*size/16;context.drawImage(source,x-padding,y-padding,size+padding*2,size+padding*2);
}

/** Load audited GUI/player dependencies and cache default-stack icons; failed resources remain explicit errors.
 * @param {Function} progress Optional actual dependency and rendered-model completion observer.
 * @return {Promise<CatalogueArt>} CPU caches with bounded GPU resources already released.
 */
export async function loadCatalogueArt(progress?: (done: number, total: number) => void): Promise<CatalogueArt> {
    const response = await fetchManifest('catalogue-manifest.json');
    if (!response.ok) throw Error('catalogue-manifest-unavailable');
    const manifest = await response.json();
    if (manifest.version !== '26.3' || manifest.clientSha1 !== 'e877b6a07acd633fb3bb475002175cec036e7b87') throw Error('catalogue-version');
    const playerResponse = await fetchManifest('player-manifest.json');
    if (!playerResponse.ok) throw Error('player-manifest-unavailable');
    const player = await playerResponse.json();
    if (player.version !== '26.3' || player.clientSha1 !== manifest.clientSha1) throw Error('player-version');
    const bookResponse = await fetchManifest('book-manifest.json');
    if (!bookResponse.ok) throw Error('book-resource-unavailable');
    const book = await bookResponse.json();
    if (book.version !== '26.3' || book.clientSha1 !== manifest.clientSha1) throw Error('book-version');
    const extraResponse = await fetchManifest('interaction-manifest.json');
    if (!extraResponse.ok) throw Error('interaction-resource-unavailable');
    const extra = await extraResponse.json();
    const experience = await (await fetchManifest('experience-manifest.json')).json();
    if (experience.version !== '26.3' || experience.clientSha1 !== manifest.clientSha1) throw Error('experience-version');
    const authored=await (await fetchManifest('easter-egg-manifest.json')).json();
    if(authored.version!=='26.3'||authored.clientSha1!==manifest.clientSha1)throw Error('authored-resource-version');
    const farm=await (await fetchManifest('farm-interaction-manifest.json')).json();
    if(farm.version!=='26.3'||farm.clientSha1!==manifest.clientSha1)throw Error('farm-interaction-version');
    manifest.items.push('minecraft:water_bucket');Object.assign(manifest.inputs,farm.inputs);
    manifest.items.push(...authored.items);
    Object.assign(manifest.inputs,authored.inputs);
    const images = new Map<string, HTMLCanvasElement>(), documents = new Map<string, any>();
    const advancementResponse=await fetchManifest('advancement-manifest.json');
    if(!advancementResponse.ok)throw Error('advancement-resource-unavailable');
    const advancement=await advancementResponse.json();
    if(advancement.version!=='26.3'||advancement.clientSha1!==manifest.clientSha1)throw Error('advancement-version');
    Object.assign(book.uiDefinitions,advancement.uiDefinitions);
    Object.assign(extra.inputs,advancement.inputs);
    const controls=await (await fetchManifest('controls-manifest.json')).json();
    if(controls.version!=='26.3'||controls.clientSha1!==manifest.clientSha1)throw Error('controls-version');
    const storageGui='assets/minecraft/textures/gui/container/generic_54.png';
    extra.inputs[storageGui]=controls.inputs[storageGui];
    documents.set('player-equipment-bindings', player.equipment);
    const dependencies = Object.entries({...manifest.inputs, ...player.inputs, ...book.inputs, ...extra.inputs, ...experience.inputs} as Record<string, string>).filter(([p]) => p.startsWith('assets/') && !p.includes('/lang/') && !p.includes('/font/') && /\.(json|png|mcmeta)$/.test(p));
    const total = dependencies.length + manifest.items.length + Object.keys(book.uiDefinitions).length + book.compassModels.length;
    let completed = 0;
    progress?.(0, total);
    await Promise.all(dependencies.map(async ([p, hash]) => {
        const r = await fetchAsset(p);
        if (!r.ok) throw Error('catalogue-resource-missing:' + p);
        const b = await r.arrayBuffer(),
            actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), n => n.toString(16).padStart(2, '0')).join('');
        if (actual !== hash) throw Error('catalogue-resource-integrity:' + p);
        if (p.endsWith('.png')) {
            const bitmap = await createImageBitmap(new Blob([b], {type: 'image/png'})),
                c = document.createElement('canvas');
            c.width = bitmap.width;
            c.height = bitmap.height;
            c.getContext('2d', {willReadFrequently: true})!.drawImage(bitmap, 0, 0);
            bitmap.close();
            images.set(p, c);
        } else documents.set(p, JSON.parse(new TextDecoder().decode(b)));
        progress?.(++completed, total);
    }));
    const animations = new Map<string, {
            frames: HTMLCanvasElement[];
            sequence: { index: number; time: number }[];
            last: number
        }>(), icons = new Map<string, HTMLCanvasElement>(), kinds = new Map<string, 'sprite' | 'model'>(), coverage: object[] = [],
        renderer = new WebGLRenderer({alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true}), scene = new Scene(),
        camera = new OrthographicCamera(-.5, .5, .5, -.5, .1, 10), textures = new Map<string, CanvasTexture>(),
        materials = new Map<string, ShaderMaterial & {map: CanvasTexture}>();
    renderer.setSize(256, 256, false);
    renderer.setClearColor(0, 0);
    camera.position.z = 3;
    /** Resolve a texture frame with nearest sampling and its optional native grass tint.
     * @param {string} id Original texture ID.
     * @param {any} tint Native tint provider.
     * @return {CanvasTexture} Cached texture.
     */
    function texture(id: string, tint?: any): CanvasTexture {
        const key = id + JSON.stringify(tint ?? null);
        if (textures.has(key)) return textures.get(key)!;
        const path = 'assets/minecraft/textures/' + resourceId(id).split(':')[1] + '.png', raw = images.get(path);
        if (!raw) throw Error('missing-icon-texture:' + id);
        const c = document.createElement('canvas');
        c.width = c.height = raw.width;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(raw, 0, 0, raw.width, raw.width, 0, 0, c.width, c.height);
        if (tint) {
            if (tint.type !== 'minecraft:grass') throw Error('unsupported-icon-tint');
            const cmap = images.get('assets/minecraft/textures/colormap/grass.png')!,
                x = Math.trunc((1 - tint.temperature) * 255),
                y = Math.trunc((1 - tint.downfall * tint.temperature) * 255),
                color = cmap.getContext('2d')!.getImageData(x, y, 1, 1).data,
                pixels = ctx.getImageData(0, 0, c.width, c.height);
            for (let i = 0; i < pixels.data.length; i += 4) for (let k = 0; k < 3; k++) pixels.data[i + k] = Math.round(pixels.data[i + k] * color[k] / 255);
            ctx.putImageData(pixels, 0, 0);
        }
        const map = new CanvasTexture(c);
        map.colorSpace = NoColorSpace;
        map.minFilter = map.magFilter = NearestFilter;
        map.generateMipmaps = false;
        textures.set(key, map);
        return map;
    }

    /** Instantiate original quads with actual UVs and a GUI-appropriate light/material family.
     * @param {CompiledModel} compiled Original geometry.
     * @param {boolean} front Flat GUI light.
     * @param {any[]} tints Native per-index tints.
     * @return {Mesh} Owned geometry, cached materials.
     */
    function mesh(compiled: CompiledModel, front: boolean, tints: any[] = []): Mesh {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(compiled.positions, 3));
        geometry.setAttribute('normal', new Float32BufferAttribute(compiled.normals, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(compiled.uvs, 2));
        geometry.setIndex(compiled.indices);
        const mats = compiled.faces.map((f, i) => {
            const tint = f.tintindex === undefined ? undefined : tints[f.tintindex],
                key = f.texture + front + JSON.stringify(tint ?? null);
            if (!materials.has(key)) {
                const map = texture(f.texture, tint), lights = guiLights();
                const material = new ShaderMaterial({
                    uniforms: {map: {value: map}, light0: {value: lights[0]}, light1: {value: lights[1]}, front: {value: front ? 1 : 0}},
                    vertexShader: `varying vec2 texCoord; varying vec3 faceNormal; void main(){texCoord=uv; faceNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                    fragmentShader: `uniform sampler2D map; uniform vec3 light0; uniform vec3 light1; uniform float front; varying vec2 texCoord; varying vec3 faceNormal; void main(){vec4 texel=texture2D(map,texCoord); if(texel.a<0.1)discard; float diffuse=min(1.0,0.4+0.6*(max(0.0,dot(light0,normalize(faceNormal)))+max(0.0,dot(light1,normalize(faceNormal))))); gl_FragColor=vec4(texel.rgb*mix(diffuse,1.0,front),texel.a);}`,
                    side: DoubleSide, toneMapped: false
                }) as ShaderMaterial & {map: CanvasTexture};
                material.map = map; materials.set(key, material);
            }
            geometry.addGroup(i * 6, 6, i);
            return materials.get(key)!;
        });
        return new Mesh(geometry, mats);
    }

    /** Convert one native GUI model leaf, preserving special geometry rather than substituting a PNG of another item.
     * @param {IconPart} part Selected native leaf.
     * @return {Group} Transformed model.
     */
    function partGroup(part: IconPart): Group {
        const model = iconModel(part.model, id => documents.get(assetPath('models',id))),
            root = new Group(), body = new Group();
        root.add(body);
        if (part.special?.type === 'minecraft:chest') {
            const tex = 'minecraft:entity/chest/' + part.special.texture!.split(':')[1];
            for (const box of [[1, 0, 1, 14, 10, 14, 0, 19], [1, 9, 1, 14, 5, 14, 0, 0], [7, 7, 15, 2, 4, 1, 0, 0]]) body.add(mesh(entityCube(box, tex), false));
            body.position.set(-.5, -.5, -.5);
        } else if (part.special?.type === 'minecraft:shield') {
            for (const box of [[-6, -11, -2, 12, 22, 1, 0, 0], [-1, -3, -1, 2, 6, 6, 26, 0]]) body.add(mesh(entityCube(box, 'minecraft:entity/shield/shield_base_nopattern'), true));
            body.position.set(-.5, -.5, -.5);
        } else if (model.builtin === 'minecraft:builtin/generated') {
            const layers = Object.keys(model.textures).filter(k => /^layer\d+$/.test(k)).sort();
            for (const [index, key] of layers.entries()) {
                const tex = resolveTexture(model.textures[key], model.textures), p: CompiledModel = {
                    positions: [0, 0, .5, 1, 0, .5, 1, 1, .5, 0, 1, .5],
                    normals: Array(4).fill([0, 0, 1]).flat(),
                    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                    indices: [0, 1, 2, 0, 2, 3],
                    faces: [{direction: 'south', texture: tex, tintindex: index}],
                    textures: [tex]
                }, flat = mesh(p, true, part.tints);
                flat.position.z = index * .0001;
                body.add(flat);
            }
            body.position.set(-.5, -.5, -.5);
        } else {
            body.add(mesh(iconGeometry(model), model.gui_light === 'front', part.tints));
            body.position.set(-.5, -.5, -.5);
        }
        const t = model.display?.gui ?? {}, rotation = t.rotation ?? [0, 0, 0];
        root.rotation.set(...rotation.map((n: number) => n * Math.PI / 180) as [number, number, number]);
        root.scale.set(...(t.scale ?? [1, 1, 1]) as [number, number, number]);
        root.position.set(...(t.translation ?? [0, 0, 0]).map((n: number) => n / 16) as [number, number, number]);
        const transforms = new Matrix4();
        for (const transform of part.transforms) {
            const left = new Matrix4().makeRotationFromQuaternion(new Quaternion(...(transform.left_rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
                right = new Matrix4().makeRotationFromQuaternion(new Quaternion(...(transform.right_rotation ?? [0, 0, 0, 1]) as [number, number, number, number]));
            transforms.multiply(new Matrix4().makeTranslation(...(transform.translation ?? [0, 0, 0]) as [number, number, number]).multiply(left).multiply(new Matrix4().makeScale(...(transform.scale ?? [1, 1, 1]) as [number, number, number])).multiply(right));
        }
        body.applyMatrix4(new Matrix4().makeTranslation(-.5, -.5, -.5).multiply(transforms).multiply(new Matrix4().makeTranslation(.5, .5, .5)));
        return root;
    }

    const compassFrames = new Map<string, HTMLCanvasElement>(), compass = new NativeCompass();
    let compassFrame = '';
    try {
        const now = new Date(),
            date = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const tasks = [...manifest.items, ...Object.keys(book.uiDefinitions)].map((id: string) => ({id, node: book.uiDefinitions[id] ?? documents.get(assetPath('items',id)).model}));
        for (const model of book.compassModels) tasks.push({id: model, node: {type: 'minecraft:model', model}});
        for (const {id, node} of tasks) {
            const parts = iconParts(node, date), group = new Group();
            try {
                const padding=parts.some(p=>p.special?.type==='minecraft:shield')?4:0,extent=.5+padding/16,resolution=(16+padding*2)*16;
                camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.updateProjectionMatrix();renderer.setSize(resolution,resolution,false);
                for (const p of parts) group.add(partGroup(p));
                scene.add(group);
                renderer.clear();
                renderer.render(scene, camera);
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = resolution;
                if(padding)canvas.dataset.nativePadding=String(padding);
                const context = canvas.getContext('2d', {willReadFrequently: true})!;
                context.drawImage(renderer.domElement, 0, 0);
                const count = context.getImageData(0, 0, resolution, resolution).data.filter((v, i) => i % 4 === 3 && v > 0).length;
                if (!count) throw Error('empty-native-icon:' + id);
                if (book.compassModels.includes(id)) {compassFrames.set(id, canvas); continue;}
                icons.set(id, canvas);
                const usedMaps = new Set<CanvasTexture>();
                group.traverse(o => {
                    if (o instanceof Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.map) usedMaps.add(m.map);
                });
                for (const map of usedMaps) {
                    const key = [...textures].find(([, m]) => m === map)![0],
                        textureId = key.slice(0, key.indexOf('null') >= 0 ? key.indexOf('null') : key.length),
                        path = 'assets/minecraft/textures/' + textureId.split(':')[1] + '.png', raw = images.get(path),
                        meta = documents.get(path + '.mcmeta')?.animation;
                    if (!meta) continue;
                    if (!raw || raw.height % raw.width || meta.interpolate || meta.width || meta.height) throw Error('unsupported-icon-animation');
                    const count = raw.height / raw.width, frames = [canvas],
                        sequence = (meta.frames ?? Array.from({length: count}, (_, i) => i)).map((f: any) => typeof f === 'number' ? {
                            index: f,
                            time: meta.frametime ?? 1
                        } : {index: f.index, time: f.time ?? meta.frametime ?? 1});
                    for (let frame = 1; frame < count; frame++) {
                        const c = map.image as HTMLCanvasElement;
                        c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
                        c.getContext('2d')!.drawImage(raw, 0, raw.width * frame, raw.width, raw.width, 0, 0, c.width, c.height);
                        map.needsUpdate = true;
                        renderer.clear();
                        renderer.render(scene, camera);
                        const cached = document.createElement('canvas');
                        cached.width = cached.height = 256;
                        cached.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
                        frames.push(cached);
                    }
                    animations.set(id, {frames, sequence, last: 0});
                }
                kinds.set(id, parts.every(p => !p.special && !!iconModel(p.model, n => documents.get(assetPath('models',n))).builtin) ? 'sprite' : 'model');
                coverage.push({
                    id,
                    parts: parts.map(p => p.model),
                    pixels: count,
                    route: parts.some(p => p.special) ? 'native-special' : parts.length > 1 ? 'native-composite' : iconModel(parts[0].model, n => documents.get(assetPath('models',n))).builtin ? 'native-generated' : 'native-elements'
                });
            } finally {
                progress?.(++completed, total);
                if (progress && completed % 8 === 0) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                group.removeFromParent();
                group.traverse(o => {
                    if (o instanceof Mesh) o.geometry.dispose();
                });
            }
        }
    } finally {
        for (const material of materials.values()) material.dispose();
        for (const map of textures.values()) map.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
    }
    return {
        icons, images, documents, coverage, kinds, update: (time: number, view?: CompassView | null) => {
            let changed = false;
            const model = compassModel(documents.get('assets/minecraft/items/compass.json'), view ? compass.angle(view, Math.floor(time / 50)) : 0);
            if (model !== compassFrame) {
                const icon = compassFrames.get(model); if (!icon) throw Error('missing-native-compass-frame');
                compassFrame = model; icons.set('minecraft:compass', icon); changed = true;
            }
            documents.set('$compass-state', {model, target: view?.target ?? null, position: view?.position ?? null, yaw: view?.yaw ?? null, rotation: compass.rotation});
            for (const [id, a] of animations) {
                let tick = Math.floor(time / 50) % a.sequence.reduce((n, f) => n + f.time, 0), frame = 0;
                for (const f of a.sequence) {
                    if (tick < f.time) {
                        frame = f.index;
                        break;
                    }
                    tick -= f.time;
                }
                if (frame !== a.last) {
                    a.last = frame;
                    icons.set(id, a.frames[frame]);
                    changed = true;
                }
            }
            return changed;
        }, dispose: () => {
            compassFrames.clear();
            animations.clear();
            icons.clear();
            kinds.clear();
            images.clear();
            documents.clear();
        }
    };
}
