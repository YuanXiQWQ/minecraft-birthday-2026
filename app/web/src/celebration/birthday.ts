/** Birthday playback owns transient native effects; durable completion belongs exclusively to the save transaction. */
import {timing} from '../performance.ts';
import {Vector3} from 'three';
import type {State, Settings} from '../domain/types.ts';
import type {SceneView} from '../render/scene.ts';
import type {PixelUI} from '../ui/pixels.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import {loadCelebrationPack} from './celebration-pack.ts';
import {CelebrationAudio} from './celebration-audio.ts';
import {FireworkBatch} from './firework-batch.ts';
import {FireworkSimulation} from './firework-simulation.ts';
import {birthdayPlan, birthdayCues} from './plan.ts';
import type {TimedCue} from './plan.ts';
import settings from './settings.json' with {type: 'json'};

/** A bounded per-play summary distinguishes scheduling/signal evidence from human listening. */
export interface BirthdayRun {
  reason: string;
  seconds: number;
  frames: number;
  p95: number;
  max: number;
  over16: number;
  over33: number;
  over50: number;
  peakParticles: number;
  bursts: string[];
  audioSchedules: number;
  signalPeak: number;
  phases: Record<string, number>;
}

/** One controller reuses the existing scene RAF, native atlas and decoded audio buffers across explicit replays. */
export class BirthdayCelebration {
  audio = new CelebrationAudio();
  batch: FireworkBatch | null = null;
  simulation: FireworkSimulation | null = null;
  root = document.createElement('section');
  message = document.createElement('div');
  status = document.createElement('p');
  toast = document.createElement('canvas');
  replay: HTMLButtonElement;
  skip: HTMLButtonElement;
  ready: Promise<void>;
  ticket = 0;
  generation = '';
  sceneId = '';
  disposed = false;
  paused = false;
  elapsed = 0;
  last = 0;
  lastPublish = 0;
  cueIndex = 0;
  cues: TimedCue[] = [];
  audioReady = false;
  audioState = 'ready';
  gainSignature = '';
  intervals: number[] = [];
  runs: BirthdayRun[] = [];
  phases: Record<string, number> = {};
  abort = new AbortController();

  /** Mount accessible playback controls without creating a second renderer or changing the camera.
   * @param {HTMLElement} host Formal game root.
   * @param {SceneView} view Existing first-person renderer.
   * @param {PixelUI} pixels Original bitmap text renderer.
   * @param {CatalogueArt} art Original toast and GUI resources.
   * @param {Function} text External localized text with configured names.
   * @param {Function} current Latest committed facts and save generation.
   * @param {Function} audioSettings Effective local audio drafts over committed settings.
   */
  constructor(public host: HTMLElement, public view: SceneView, public pixels: PixelUI, public art: CatalogueArt, public text: (key: string) => string, public current: () => {
    state: State;
    generation: string
  } | null, public audioSettings?: () => Settings | null) {
    this.root.className = 'birthday-celebration';
    this.root.setAttribute('aria-label', text('celebration.label'));
    this.message.className = 'birthday-message';
    for (const key of ['celebration.title', 'celebration.body', 'celebration.signature']) {
      const p = document.createElement(key.endsWith('title') ? 'h2' : 'p');
      this.pixels.text(p, this.text(key), key.endsWith('title') ? 3 : 2);
      this.message.append(p);
    }
    this.status.setAttribute('role', 'status');
    this.toast.width = 160;
    this.toast.height = 32;
    this.toast.className = 'birthday-toast';
    this.replay = this.button('celebration.replay', () => {
      void this.start();
    });
    this.skip = this.button('celebration.skip', () => this.cancel('skipped'));
    const controls = document.createElement('div');
    controls.className = 'birthday-controls';
    controls.append(this.replay, this.skip);
    this.root.append(this.message, this.toast, this.status, controls);
    host.append(this.root);
    this.root.addEventListener('pointerdown', e => e.stopPropagation(), {signal: this.abort.signal});
    this.ready = this.load();
    this.view.onFrame = now => this.frame(now);
    document.addEventListener('pointerdown', () => {
      if (this.audio.state !== 'running') void this.audio.enable();
    }, {signal: this.abort.signal, capture: true});
    document.addEventListener('keydown', () => {
      if (this.audio.state !== 'running') void this.audio.enable();
    }, {signal: this.abort.signal, capture: true});
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause(); else if (this.paused) void this.resume();
    }, {signal: this.abort.signal});
    this.sync();
  }

  /** Build one native-sprite localized control. @param {string} key Text key. @param {Function} action User action. @return {HTMLButtonElement} Accessible control. */
  button(key: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    this.pixels.text(b, this.text(key), 2);
    this.pixels.button(b);
    b.addEventListener('click', action, {signal: this.abort.signal});
    return b;
  }

  /** Load verified particles independently from decoder capability so sound failure cannot erase the saved birthday. */
  async load(): Promise<void> {
    try {
      const pack = await loadCelebrationPack();
      if (this.disposed) return;
      this.batch = new FireworkBatch({
        scene: this.view.scene,
        camera: this.view.camera,
        profile: {phases: this.phases}
      }, pack);
      try {
        await this.audio.load(pack);
      } catch {
        this.audioState = 'unavailable';
      }
    } catch (error) {
      this.audioState = 'resources';
      this.root.dataset.error = String(error);
    }
    this.publish();
  }

  /** Project committed completion and effective audio settings; reset or leaving home invalidates asynchronous playback. */
  sync(): void {
    const value = this.current();
    if (!value) return;
    const scope = value.generation, scene = value.state.progress.scene;
    if (this.generation && this.generation !== scope || this.sceneId && this.sceneId !== scene) this.cancel('scope');
    this.generation = scope;
    this.sceneId = scene;
    const preferences = this.audioSettings?.() ?? value.state.settings;
    const signature = JSON.stringify(preferences);
    if (signature !== this.gainSignature) {
      this.gainSignature = signature;
      this.audio.gain(preferences.volume, preferences.muted, preferences);
    }
    if (!value.state.progress.cakePlacement && this.simulation) this.cancel('reset');
    this.replay.hidden = !value.state.progress.cakePlacement || scene !== 'home';
    this.publish();
  }

  /** Begin a finite replay only for a committed home-table completion; this method never writes progress. */
  async start(): Promise<void> {
    this.cancel('replace');
    const ticket = ++this.ticket, value = this.current();
    if (!value?.state.progress.cakePlacement || value.state.progress.scene !== 'home') return;
    const scope = value.generation;
    await this.ready;
    if (this.disposed || ticket !== this.ticket || this.current()?.generation !== scope || this.current()?.state.progress.scene !== 'home') return;
    if (!this.batch) {
      this.publish();
      return;
    }
    this.audioReady = this.audio.ready && await this.audio.enable();
    if (this.disposed || ticket !== this.ticket) return;
    this.audioState = this.audioReady ? 'ready' : this.audio.ready ? 'blocked' : 'unavailable';
    this.audio.records = [];
    this.audio.peak = 0;
    this.simulation = new FireworkSimulation(birthdayPlan(settings.durationSeconds), settings.seed);
    this.cues = birthdayCues(this.simulation.plan, settings.seed, settings.durationSeconds);
    this.cueIndex = 0;
    this.intervals = [];
    this.elapsed = 0;
    this.last = 0;
    this.paused = document.hidden;
    this.batch.begin();
    this.drawToast();
    this.publish();
    this.view.requestRender();
  }

  /** Paint the original advancement toast with a real cake icon and externalized birthday text. */
  drawToast(): void {
    const c = this.toast.getContext('2d')!;
    c.clearRect(0, 0, 160, 32);
    c.imageSmoothingEnabled = false;
    const image = this.art.images.get('assets/minecraft/textures/gui/sprites/toast/advancement.png');
    if (!image) throw Error('missing-advancement-toast');
    c.drawImage(image, 0, 0, 160, 32);
    const icon = this.art.icons.get('minecraft:cake')!;
    c.drawImage(icon, 8, 8, 16, 16);
    this.pixels.font.draw(c, this.text('celebration.toast'), 30, 7, '#FF5', false);
    this.pixels.font.draw(c, this.text('celebration.toastDetail'), 30, 18, '#FFF', false);
  }

  /** Advance a real 20Hz simulation from active elapsed time, scheduling only a short audio horizon and recording late calls.
   * @param {number} now Scene monotonic frame timestamp.
   * @return {boolean} Whether the scene should request another frame.
   */
  frame(now: number): boolean {
    if (!this.simulation || this.paused || this.disposed || document.hidden) return false;
    try {
      const interval = this.last ? now - this.last : 0;
      this.last = now;
      if (interval) {
        this.intervals.push(interval);
        if (this.intervals.length > 12000) this.intervals.shift();
      }
      this.elapsed += interval / 1000;
      const simEnd = timing('particle-simulation'), start = performance.now();
      this.simulation.advance(this.elapsed);
      this.phases.simulation = performance.now() - start;
      simEnd();
      const batchEnd = timing('particle-batch');
      this.batch!.update(this.simulation.particles, this.elapsed * 20 % 1);
      batchEnd();
      const audioEnd = timing('audio-schedule'), schedule = performance.now(), camera = this.view.camera;
      this.audio.listener(camera.position.toArray() as [number, number, number], camera.getWorldDirection(new Vector3()).toArray() as [number, number, number], [0, 1, 0]);
      while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].seconds <= this.elapsed + .08) {
        const entry = this.cues[this.cueIndex++];
        if (!this.audioReady) continue;
        const late = this.elapsed - entry.seconds;
        if (late > .25) {
          this.audio.records.push({kind: 'missed-active-frame', event: entry.cue.event, lateMs: late * 1000});
          continue;
        }
        this.audio.schedule(entry.cue, this.audio.time + Math.max(.01, entry.seconds - this.elapsed), entry.variant);
      }
      this.phases.audio = performance.now() - schedule;
      audioEnd();
      if (now - this.lastPublish > 200) {
        this.audio.sample();
        this.lastPublish = now;
        this.publish();
      }
      if (this.elapsed >= settings.durationSeconds) {
        this.cancel('ended');
        return false;
      }
      return true;
    } catch (error) {
      this.root.dataset.error = String(error);
      this.audioState = 'unavailable';
      this.cancel('effect-error');
      return false;
    }
  }

  /** Freeze transient active time and remove scheduled voices rather than replaying a background backlog. */
  pause(): void {
    if (!this.simulation) return;
    this.paused = true;
    this.last = 0;
    this.audio.cancel('paused');
    const ticket = this.ticket;
    void this.audio.pause().catch(() => {
      if (ticket === this.ticket && !this.disposed) {
        this.audioState = 'unavailable';
        this.publish();
      }
    });
    this.publish();
  }

  /** Resume from the same active position with no hidden elapsed time or voice catch-up. */
  async resume(): Promise<void> {
    if (!this.simulation || this.disposed || document.hidden) return;
    const ticket = this.ticket;
    const ready = await this.audio.enable();
    if (ticket !== this.ticket || !this.simulation || document.hidden) return;
    this.audioReady = this.audio.ready && ready;
    this.audioState = this.audioReady ? 'ready' : 'blocked';
    this.paused = false;
    this.last = 0;
    this.publish();
    this.view.requestRender();
  }

  /** Stop live effects, preserve a bounded evidence summary and fence old load/activation callbacks.
   * @param {string} reason Completion, user skip, reset or navigation reason.
   */
  cancel(reason: string): void {
    this.ticket++;
    if (this.simulation) {
      const sorted = [...this.intervals].sort((a, b) => a - b);
      this.runs.push({
        reason,
        seconds: this.elapsed,
        frames: sorted.length,
        p95: sorted[Math.floor(sorted.length * .95)] ?? 0,
        max: sorted.at(-1) ?? 0,
        over16: sorted.filter(n => n > 16.7).length,
        over33: sorted.filter(n => n > 33.3).length,
        over50: sorted.filter(n => n > 50).length,
        peakParticles: this.simulation.peak,
        bursts: this.simulation.bursts.map(b => b.shape),
        audioSchedules: this.audio.records.filter(r => r.kind === 'schedule').length,
        signalPeak: this.audio.peak,
        phases: {...this.phases}
      });
      this.runs = this.runs.slice(-3);
    }
    this.simulation = null;
    this.batch?.clear();
    this.audio.cancel(reason);
    this.paused = false;
    this.last = 0;
    this.publish();
    this.view.requestRender();
  }

  /** Publish compact visible state and bounded performance evidence without persisting animation frames. */
  publish(): void {
    const playing = !!this.simulation;
    this.message.hidden = !playing;
    this.skip.hidden = !playing;
    const value = this.current();
    this.replay.hidden = (playing && this.audioState !== 'blocked') || !value?.state.progress.cakePlacement || value.state.progress.scene !== 'home';
    this.toast.hidden = !playing || this.elapsed > 5;
    this.root.dataset.playing = String(playing);
    this.root.dataset.celebration = JSON.stringify({
      active: playing,
      paused: this.paused,
      seconds: this.elapsed,
      audio: this.audioState,
      particles: this.simulation?.particles.length ?? 0,
      visible: this.batch?.visible ?? 0,
      bursts: this.simulation?.bursts.map(b => b.shape) ?? [],
      liveVoices: this.audio.sources.size,
      created: this.batch?.created ?? 0,
      released: this.batch?.released ?? 0
    });
    this.root.dataset.runs = JSON.stringify(this.runs);
    this.pixels.text(this.status, this.audioState === 'ready' ? '' : this.text('celebration.audio.' + this.audioState), 1);
    this.status.hidden = this.audioState === 'ready';
  }

  /** Stop transient playback on history navigation without altering the saved table. */
  navigation(): void {
    this.cancel('navigation');
  }

  /** Release the atlas, decoded samples, owned listeners and scene callback once. */
  dispose(): void {
    if (this.disposed) return;
    this.cancel('dispose');
    this.disposed = true;
    this.abort.abort();
    this.batch?.dispose();
    this.audio.dispose();
    this.view.onFrame = null;
    this.root.remove();
  }
}
