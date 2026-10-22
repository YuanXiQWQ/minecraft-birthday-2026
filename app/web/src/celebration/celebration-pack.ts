/** Versioned original particle and sound acquisition; images and compressed audio remain runtime resources. */
import {RESOURCE_BASE as VANILLA_RESOURCE_BASE} from '../render/resources.ts';

export interface SoundDefinition {
    sounds: (string | { name: string; volume?: number; pitch?: number; weight?: number })[];
}

export interface CelebrationPack {
    images: Map<string, HTMLCanvasElement>;
    frames: string[];
    sounds: Map<string, ArrayBuffer>;
    events: Record<string, SoundDefinition>;
    loading: object;
}

/** Verify the complete explicit cohort before decoding any visual or audio sample.
 * @return {Promise<CelebrationPack>} Actual original resources or an explicit blocking error.
 */
export async function loadCelebrationPack(): Promise<CelebrationPack> {
    const start = performance.now(), base = VANILLA_RESOURCE_BASE,
        response = await fetch(base + 'manifest.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('celebration-resources-BLOCKED');
    const manifest = await response.json() as {
        version: string;
        clientSha1: string;
        celebration?: { entries: string[]; events: Record<string, SoundDefinition> };
        entries: { entry: string; size: number; sha256: string }[]
    };
    if (manifest.version !== '26.3' || manifest.clientSha1 !== 'e877b6a07acd633fb3bb475002175cec036e7b87' || !manifest.celebration) throw new Error('celebration-cohort-BLOCKED');
    const images = new Map<string, HTMLCanvasElement>(), sounds = new Map<string, ArrayBuffer>(),
        documents = new Map<string, unknown>(), requests: object[] = [];
    await Promise.all(manifest.entries.filter(e => manifest.celebration!.entries.includes(e.entry)).map(async e => {
        if (!/^assets\/minecraft\/(?:(particles|textures\/particle|sounds)\/[a-z0-9_/-]+\.(json|png|ogg)|sounds\.json)$/.test(e.entry) || e.entry.includes('..')) throw new Error('invalid-celebration-entry');
        const r = await fetch(base + e.entry, {cache: 'no-store'});
        if (!r.ok) throw new Error('missing-celebration-entry');
        const bytes = await r.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
        if (hash !== e.sha256 || bytes.byteLength !== e.size) throw new Error('celebration-hash-mismatch');
        if (e.entry.endsWith('.png')) {
            const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'})),
                c = document.createElement('canvas');
            c.width = bitmap.width;
            c.height = bitmap.height;
            c.getContext('2d')!.drawImage(bitmap, 0, 0);
            bitmap.close();
            images.set(e.entry.split('/').at(-1)!.slice(0, -4), c);
        } else if (e.entry.endsWith('.ogg')) sounds.set(e.entry.slice('assets/minecraft/sounds/'.length, -4), bytes); else documents.set(e.entry, JSON.parse(new TextDecoder().decode(bytes)));
        requests.push({entry: e.entry, bytes: bytes.byteLength, sha256: hash});
    }));
    const firework = documents.get('assets/minecraft/particles/firework.json') as { textures: string[] },
        flash = documents.get('assets/minecraft/particles/flash.json') as { textures: string[] };
    if (firework?.textures.length !== 8 || flash?.textures[0] !== 'minecraft:flash') throw new Error('unsupported-particle-frames');
    const frames = firework.textures.map(id => id.split(':')[1]);
    if ([...frames, 'flash'].some(id => !images.has(id))) throw new Error('missing-particle-sprite');
    const originalEvents = documents.get('assets/minecraft/sounds.json') as Record<string, SoundDefinition>;
    for (const [id, definition] of Object.entries(manifest.celebration.events)) {
        if (JSON.stringify(originalEvents[id]) !== JSON.stringify(definition)) throw new Error('sound-definition-mismatch');
        for (const raw of definition.sounds) if (!sounds.has(typeof raw === 'string' ? raw : raw.name)) throw new Error('missing-sound-variant');
    }
    return {
        images,
        frames,
        sounds,
        events: manifest.celebration.events,
        loading: {
            version: '26.3',
            clientSha1: manifest.clientSha1,
            elapsedMs: performance.now() - start,
            requests,
            frames,
            images: [...images].map(([id, c]) => ({id, width: c.width, height: c.height})),
            events: Object.keys(manifest.celebration.events),
            audioFiles: sounds.size
        }
    };
}
