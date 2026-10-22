/** Minimal original-event Web Audio adapter with bounded source ownership and explicit activation/cancellation. */
import type {CelebrationPack} from './celebration-pack.ts';
import type {Cue, Vec} from './firework-simulation.ts';

export interface AudioRecord {
    kind: string;

    [key: string]: unknown;
}

/** Translate original sound definitions and raw call parameters into an auditable browser schedule. */
export class CelebrationAudio {
    context!: AudioContext;
    master!: GainNode;
    analyser!: AnalyserNode;
    buffers = new Map<string, AudioBuffer>();
    sources = new Set<AudioBufferSourceNode>();
    records: AudioRecord[] = [];
    volume = .2;
    muted = false;
    ready = false;
    disposed = false;
    peak = 0;
    initial: object = {state: 'unavailable'};
    pack: CelebrationPack | null = null;
    generation = 0;
    unavailable: string | null = null;
    chains = new Map<AudioBufferSourceNode, { gain: GainNode; panner: PannerNode | null }>();

    /** Create a silent context, preserving a readable capability failure instead of aborting 3D/GUI startup.
     * @param {Function} factory Native constructor or an explicit capability-failure test injection.
     */
    constructor(factory: () => AudioContext = () => new AudioContext()) {
        try {
            this.context = factory();
            this.master = this.context.createGain();
            this.master.gain.value = this.volume;
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 256;
            this.master.connect(this.analyser);
            this.analyser.connect(this.context.destination);
            this.initial = {
                state: this.context.state,
                userActive: navigator.userActivation.isActive,
                hasBeenActive: navigator.userActivation.hasBeenActive
            };
        } catch (error) {
            this.unavailable = String(error);
            this.records.push({kind: 'capability-unavailable', reason: this.unavailable});
        }
    }

    /** Return capability state without constructing a substitute audio engine.
     * @return {string} Native context state or explicit unavailable state.
     */
    get state(): string {
        return this.unavailable ? 'unavailable' : this.context?.state ?? 'unavailable';
    }

    /** Read the native clock only when a context exists.
     * @return {number} Native seconds; zero is diagnostic only when unavailable.
     */
    get time(): number {
        return this.context?.currentTime ?? 0;
    }

    /** Read the effective master signal gain, without pretending an unavailable graph exists.
     * @return {number} Native gain or zero for unavailable audio.
     */
    get effectiveGain(): number {
        return this.master?.gain.value ?? 0;
    }

    /** Decode all original Ogg samples atomically, including real browser format failures.
     * @param {CelebrationPack} pack Hash-verified compressed samples.
     * @return {Promise<void>} Completion or an explicit decode failure.
     */
    async load(pack: CelebrationPack): Promise<void> {
        if (this.unavailable || !this.context) throw new Error('Web Audio unavailable: ' + this.unavailable);
        this.pack = pack;
        const generation = this.generation,
            decoded = await Promise.all([...pack.sounds].map(async ([id, bytes]) => [id, await this.context.decodeAudioData(bytes.slice(0))] as const));
        if (this.disposed || generation !== this.generation) return;
        this.buffers = new Map(decoded);
        this.ready = true;
        this.records.push({
            kind: 'decoded',
            samples: decoded.map(([id, b]) => ({
                id,
                seconds: b.duration,
                sampleRate: b.sampleRate,
                channels: b.numberOfChannels,
                length: b.length
            }))
        });
    }

    /** Request context activation without hanging indefinitely when autoplay is denied.
     * @return {Promise<boolean>} Whether real AudioContext state is running.
     */
    async enable(): Promise<boolean> {
        if (this.disposed || this.unavailable || !this.context) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([this.context.resume(), new Promise<void>(resolve => {
                timer = setTimeout(resolve, 350);
            })]);
        } catch (error) {
            this.records.push({kind: 'activation-error', reason: String(error)});
        } finally {
            if (timer) clearTimeout(timer);
        }
        const running = this.context.state === 'running';
        this.records.push({
            kind: 'activation',
            state: this.context.state,
            running,
            userActive: navigator.userActivation.isActive
        });
        return running;
    }

    /** Set bounded master gain while retaining active sample schedules and the simulation clock.
     * @param {number} volume Normalized experiment volume.
     * @param {boolean} muted Explicit mute state.
     */
    gain(volume: number, muted: boolean): void {
        this.volume = Math.max(0, Math.min(1, volume));
        this.muted = muted;
        this.master?.gain.setValueAtTime(muted ? 0 : this.volume, this.time);
        this.records.push({kind: 'gain', volume: this.volume, muted, gain: this.effectiveGain, time: this.time});
    }

    /** Set the listener to the existing first-person camera without changing that camera.
     * @param {Vec} position Eye position.
     * @param {Vec} forward Camera look vector.
     * @param {Vec} up Camera up vector.
     */
    listener(position: Vec, forward: Vec, up: Vec): void {
        if (!this.context) return;
        const l = this.context.listener;
        if (l.positionX) {
            for (const [param, value] of [[l.positionX, position[0]], [l.positionY, position[1]], [l.positionZ, position[2]], [l.forwardX, forward[0]], [l.forwardY, forward[1]], [l.forwardZ, forward[2]], [l.upX, up[0]], [l.upY, up[1]], [l.upZ, up[2]]] as const) param.value = value;
        } else {
            l.setPosition(...position);
            l.setOrientation(...forward, ...up);
        }
    }

    /** Schedule an original event with source volume/pitch and spatial falloff, retaining every start/end timestamp.
     * @param {Cue} cue Simulation-time event.
     * @param {number} when Absolute Web Audio start time.
     * @param {number} variant Uniform weighted-variant selection value.
     */
    schedule(cue: Cue, when: number, variant = 0): void {
        if (!this.ready || !this.pack) throw new Error('audio-samples-BLOCKED');
        const definition = this.pack.events[cue.event];
        if (!definition) throw new Error('unknown-original-event');
        const list = definition.sounds.map(s => typeof s === 'string' ? {name: s} : s),
            total = list.reduce((n, s) => n + (s.weight ?? 1), 0);
        let pick = variant * total, raw = list[0];
        for (const s of list) {
            raw = s;
            pick -= s.weight ?? 1;
            if (pick < 0) break;
        }
        const buffer = this.buffers.get(raw.name);
        if (!buffer) throw new Error('missing-decoded-sample');
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer;
        const pitch = Math.max(.5, Math.min(2, cue.pitch * (raw.pitch ?? 1))),
            rawVolume = cue.volume * (raw.volume ?? 1), volume = Math.max(0, Math.min(1, rawVolume));
        source.playbackRate.value = pitch;
        gain.gain.value = volume;
        const spatial = !cue.event.startsWith('ui.'), panner = spatial ? this.context.createPanner() : null;
        if (panner) {
            panner.panningModel = 'equalpower';
            panner.distanceModel = 'linear';
            panner.refDistance = 0;
            panner.maxDistance = Math.max(1, rawVolume) * 16;
            panner.rolloffFactor = 1;
            panner.positionX.value = cue.position[0];
            panner.positionY.value = cue.position[1];
            panner.positionZ.value = cue.position[2];
            source.connect(gain);
            gain.connect(panner);
            panner.connect(this.master);
        } else {
            source.connect(gain);
            gain.connect(this.master);
        }
        this.sources.add(source);
        this.chains.set(source, {gain, panner});
        const scheduled = Math.max(when, this.context.currentTime), record: AudioRecord = {
            kind: 'schedule',
            event: cue.event,
            sample: raw.name,
            tick: cue.tick,
            requested: when,
            scheduled,
            lateMs: Math.max(0, this.context.currentTime - when) * 1000,
            rawVolume,
            volume,
            pitch,
            position: cue.position,
            spatial,
            radius: panner?.maxDistance,
            contextState: this.context.state
        };
        this.records.push(record);
        source.onended = () => {
            this.sources.delete(source);
            this.chains.delete(source);
            source.disconnect();
            gain.disconnect();
            panner?.disconnect();
            this.records.push({kind: 'ended', event: cue.event, time: this.context.currentTime});
        };
        source.start(scheduled);
    }

    /** Measure post-master sample energy as a signal-path check, never as proof of audible hardware output. */
    sample(): void {
        if (!this.analyser) return;
        const data = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(data);
        this.peak = Math.max(this.peak, ...data.map(Math.abs));
    }

    /** Suspend scheduled audio at the context clock so background time cannot create a catch-up sound burst.
     * @return {Promise<void>} Browser suspension completion.
     */
    async pause(): Promise<void> {
        if (!this.disposed && this.context) {
            await this.context.suspend();
            this.records.push({kind: 'suspend', state: this.context.state, time: this.context.currentTime});
        }
    }

    /** Stop and disconnect all live/future sources, including muted and suspended schedules.
     * @param {string} reason Research cancellation reason.
     */
    cancel(reason: string): void {
        for (const s of this.sources) {
            s.onended = null;
            try {
                s.stop();
            } catch {
            }
            s.disconnect();
            const chain = this.chains.get(s);
            chain?.gain.disconnect();
            chain?.panner?.disconnect();
        }
        this.sources.clear();
        this.chains.clear();
        this.records.push({kind: 'cancel', reason, time: this.time, activeSources: 0});
    }

    /** Exercise the real decoder with invalid data, leaving successfully decoded originals unchanged.
     * @return {Promise<boolean>} Whether the browser rejected corrupt compressed bytes.
     */
    async decodeFailureProbe(): Promise<boolean> {
        try {
            await this.context.decodeAudioData(new Uint8Array([0, 1, 2, 3]).buffer);
            this.records.push({kind: 'decode-failure-probe', rejected: false});
            return false;
        } catch (error) {
            this.records.push({kind: 'decode-failure-probe', rejected: true, reason: String(error)});
            return true;
        }
    }

    /** Close audio ownership and release decoded sample references on scene/controller disposal. */
    dispose(): void {
        if (this.disposed) return;
        this.cancel('dispose');
        this.disposed = true;
        this.generation++;
        this.buffers.clear();
        this.master?.disconnect();
        this.analyser?.disconnect();
        if (this.context) void this.context.close();
    }
}
