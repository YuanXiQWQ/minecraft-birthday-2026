/** Browser resource loader verifies original bytes before decoding shared model, texture and GUI primitives. */
import {compileModel, resolveModel} from './model-format.ts';
import type {CompiledModel, ModelSource, Variant} from './model-format.ts';

/** Vite owns all deployment-prefix resolution, including repository Pages paths. */
export const RESOURCE_BASE = (import.meta.env?.BASE_URL ?? '/') + 'minecraft/26.3/';

export interface Pixels {
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
    static?: boolean;
    blend?: boolean;
    animation?: { frametime?: number; interpolate?: boolean; frames?: (number | { index: number; time?: number })[] };
    sha256: string;
}

export interface Sample {
    id: string;
    block: string;
    state: string;
    variant: Variant;
    compiled: CompiledModel;
}

export interface VanillaPack {
    tints?: { grass: number; foliage: number; water: number };
    samples: Sample[];
    images: Map<string, Pixels>;
    loading: object;
}

export interface Resources extends VanillaPack {
    documents: Map<string, any>;
    guiImages: Map<string, HTMLCanvasElement>;
    models: Record<string, string>;
}

/** Verify and load only models, required material pixels and the GUI/font primitives actually used by P3.
 * @param {boolean} world Whether authored game scenery and entity dependencies are required.
 * @return {Promise<Resources>} Audited resource ownership; no debug substitute is provided.
 */
export async function loadResources(world = false): Promise<Resources> {
    const start = performance.now(),
        manifests = await Promise.all((world ? ['manifest.json', 'presentation-manifest.json', 'catalogue-manifest.json', 'player-manifest.json', 'book-manifest.json', 'experience-manifest.json', 'interaction-manifest.json', 'world-manifest.json'] : ['manifest.json', 'presentation-manifest.json', 'experience-manifest.json']).map(async name => {
            const r = await fetch(RESOURCE_BASE + name);
            if (!r.ok) throw new Error('resource-unavailable');
            const m = await r.json();
            if (m.version !== '26.3' || m.clientSha1 !== 'e877b6a07acd633fb3bb475002175cec036e7b87') throw new Error('resource-version');
            return m;
        }));
    const [base, home] = manifests, worldPack = world ? manifests.at(-1) : null,
        all = [...new Map(manifests.flatMap(m => m.entries).map(e => [e.entry, e])).values()] as {
            entry: string;
            size: number;
            sha256: string
        }[], documents = new Map<string, any>(), canvases = new Map<string, HTMLCanvasElement>(),
        images = new Map<string, Pixels>(), requests: object[] = [];
    const wanted = new Set<string>([...base.entries, ...home.entries, ...(manifests.find(m => m.derivedFont)?.entries ?? []), ...(worldPack?.entries ?? []), ...(world ? manifests.find(m => m.language)?.entries ?? [] : [])].map(e => e.entry));
    for (const p of Object.keys(worldPack?.inputs ?? {})) if (p.startsWith('assets/')) wanted.add(p);
    const entries = all.filter(e => /\.(json|png|mcmeta)$/.test(e.entry) && wanted.has(e.entry) && !e.entry.endsWith('.ogg') && (e.entry.startsWith('assets/minecraft/models/block/') || e.entry.startsWith('assets/minecraft/blockstates/') || e.entry.startsWith('assets/minecraft/textures/block/') || e.entry.startsWith('assets/minecraft/font/') || e.entry === 'assets/minecraft/textures/font/ascii.png' || /textures\/gui\/sprites\/widget\/button(?:_highlighted|_disabled)?\.png(?:\.mcmeta)?$/.test(e.entry) || world && wanted.has(e.entry)));
    await Promise.all(entries.map(async e => {
        if (e.entry.includes('..') || !/^assets\/minecraft\/[a-z0-9_/.\/-]+$/.test(e.entry)) throw new Error('resource-path');
        const response = await fetch(RESOURCE_BASE + e.entry);
        if (!response.ok) throw new Error('resource-unavailable');
        const bytes = await response.arrayBuffer(),
            hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== e.size || hash !== e.sha256) throw new Error('resource-integrity');
        requests.push({path: e.entry, bytes: e.size, sha256: hash});
        if (e.entry.endsWith('.png')) {
            const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'})),
                c = document.createElement('canvas');
            c.width = bitmap.width;
            c.height = bitmap.height;
            c.getContext('2d', {willReadFrequently: true})!.drawImage(bitmap, 0, 0);
            bitmap.close();
            canvases.set(e.entry, c);
            if (e.entry.includes('/textures/block/') || world && /textures\/(entity\/(cow|chicken)|item\/egg)/.test(e.entry)) images.set('minecraft:' + e.entry.split('/textures/')[1].slice(0, -4), {
                width: c.width,
                height: c.height,
                rgba: c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data,
                static: e.entry.includes('/entity/') || e.entry.includes('/item/'),
                blend: e.entry.includes('/water_') || e.entry.includes('/destroy_stage_'),
                sha256: hash
            });
        } else documents.set(e.entry, JSON.parse(new TextDecoder().decode(bytes)));
    }));
    for (const [id, image] of images) {
        const metadata = documents.get('assets/minecraft/textures/' + id.split(':')[1] + '.png.mcmeta');
        if (metadata?.animation) image.animation = metadata.animation;
    }
    const samples: Sample[] = [];
    for (const [path, doc] of documents) if (path.includes('/blockstates/')) {
        if (!doc.variants || doc.multipart) throw new Error('unsupported-blockstate');
        const authored = worldPack?.states.filter((v: any) => path.endsWith('/' + v.block + '.json'));
        for (const [state, raw] of (authored?.length ? authored.map((v: any) => [v.state, v.variant]) : Object.entries(doc.variants))) for (const [i, variant] of (Array.isArray(raw) ? raw : [raw]).entries()) {
            const v = variant as Variant;
            const compiled = compileModel(resolveModel(v.model, id => {
                const m = documents.get('assets/minecraft/models/' + id.split(':')[1] + '.json');
                if (!m) throw new Error('missing-model');
                return m as ModelSource;
            }), v);
            samples.push({
                id: path + ':' + state + ':' + i,
                block: path.split('/').at(-1)!.slice(0, -5),
                state,
                variant: v,
                compiled
            });
        }
    }
    for (const [key, id] of Object.entries(home.models) as [string, string][]) {
        const model = resolveModel(id, n => {
            const m = documents.get('assets/minecraft/models/' + n.split(':')[1] + '.json');
            if (!m) throw new Error('missing-model');
            return m;
        });
        samples.push({
            id: key,
            block: key,
            state: '',
            variant: {model: id},
            compiled: compileModel(model, {model: id})
        });
    }
    for (const sample of samples) for (const id of sample.compiled.textures) if (!images.has(id)) throw new Error('missing-texture');
    const color = (name: string) => {
        const c = canvases.get('assets/minecraft/textures/colormap/' + name + '.png')!,
            p = c.getContext('2d')!.getImageData(50, 173, 1, 1).data;
        return (p[0] << 16) | (p[1] << 8) | p[2];
    };
    return {
        tints: world ? {grass: color('grass'), foliage: color('foliage'), water: 0x3f76e4} : undefined,
        samples,
        images,
        documents,
        guiImages: canvases,
        models: home.models,
        loading: {
            version: '26.3',
            requests,
            elapsedMs: performance.now() - start,
            states: samples.length,
            textures: images.size,
            source: 'versioned-repository'
        }
    };
}
