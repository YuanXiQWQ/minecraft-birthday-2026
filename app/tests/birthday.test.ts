/** Formal birthday transactions and transient native playback never use a test-only completion implementation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveSession} from '../web/src/persistence/session.ts';
import {token, decode} from '../web/src/persistence/codec.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {BIRTHDAY_ADVANCEMENT,ADVANCEMENTS,advancementDone} from '../web/src/domain/advancements.ts';
import {advancementChat} from '../web/src/ui/advancement-chat.ts';
import {birthdayPlan, birthdayCues} from '../web/src/celebration/plan.ts';
import {FireworkSimulation, SHAPES} from '../web/src/celebration/firework-simulation.ts';
import {BirthdayCelebration} from '../web/src/celebration/birthday.ts';
import {CelebrationAudio} from '../web/src/celebration/celebration-audio.ts';
import type {CelebrationPack} from '../web/src/celebration/celebration-pack.ts';

/** Bind two real sessions to the same atomic storage and exclusive transaction coordinator.
 * @return {Promise<object>} Sessions, write-failure control and exact bytes.
 */
async function setup() {
    let raw: string | null = null, deny = false, tail: Promise<unknown> = Promise.resolve();
    const storage = {
        getItem: () => raw, setItem: (_k: string, v: string) => {
            if (deny) throw Error('write-failed');
            raw = v;
        }
    }, locks = {
        exclusive<T>(fn: () => Promise<T>): Promise<T> {
            const p = tail.then(fn);
            tail = p.catch(() => {
            });
            return p;
        }
    }, a = new SaveSession(storage, locks), b = new SaveSession(storage, locks);
    await a.refresh();
    await a.dispatch({type: 'unlock', item: 'minecraft:cake'});
    await a.editInventory({
        type: 'source',
        item: 'minecraft:cake',
        mode: 'number',
        index: 0
    }, null, a.view.envelope!.state.progress.player.data);
    await a.dispatch({type: 'select-scene', scene: 'home'});
    await b.refresh();
    return {a, b, raw: () => raw!, deny: (v: boolean) => deny = v};
}

/** Use the latest committed player identity exactly as the formal world Use command does.
 * @param {SaveSession} s Submitting session.
 * @return {object} Guarded table command.
 */
function placement(s: SaveSession) {
    return {
        type: 'record-cake-placement' as const,
        scene: 'home' as const,
        table: 'birthday-table' as const,
        expected: s.view.envelope!.state.progress.player.data
    };
}

test('cake acquisition/preview is not completion; placement requires held cake and current home table', () => {
    let s = transition(initialState(), {type: 'unlock', item: 'minecraft:cake'}).state;
    assert.equal(s.progress.cakePlacement, null);
    assert.throws(() => transition(s, {
        type: 'record-cake-placement',
        scene: 'home',
        table: 'birthday-table'
    }), /invalid-cake-placement/);
    s = transition(s, {type: 'select-scene', scene: 'home'}).state;
    assert.throws(() => transition(s, {
        type: 'record-cake-placement',
        scene: 'home',
        table: 'birthday-table'
    }), /cake-not-held/);
});
test('one successful table transaction consumes one held cake and emits one local event; repeat and hydration never replay', async () => {
    const h = await setup();
    let events = 0;
    h.a.eventListeners.add(e => events += e.filter(v => v.type === 'cake-placed').length);
    await h.a.dispatch(placement(h.a));
    assert.equal(events, 1);
    assert.equal(h.a.view.envelope!.state.progress.player.data.hotbar[0], null);
    await h.a.dispatch(placement(h.a));
    await h.a.refresh();
    let other = 0;
    h.b.eventListeners.add(e => other += e.length);
    await h.b.refresh();
    assert.equal(events, 1);
    assert.equal(other, 0);
    assert.ok(h.b.view.envelope!.state.progress.cakePlacement);
});
test('concurrent table uses have one winner; stale layout does not consume or duplicate cake', async () => {
    const h = await setup(),
        results = await Promise.allSettled([h.a.dispatch(placement(h.a)), h.b.dispatch(placement(h.b))]);
    assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
    const state = (await decode(h.raw())).envelope.state;
    assert.ok(state.progress.cakePlacement);
    assert.equal(state.progress.player.data.hotbar.filter(Boolean).length, 0);
});

test('table placement grants one persistent purple birthday challenge, with localized title and hover description',async()=>{
 const h=await setup(),events:any[]=[];h.a.eventListeners.add(e=>events.push(...e));
 assert.equal(advancementDone(h.a.view.envelope!.state.progress.advancements,BIRTHDAY_ADVANCEMENT),false);
 await h.a.dispatch(placement(h.a));await h.a.dispatch(placement(h.a));await h.a.refresh();await h.b.refresh();
 const awards=events.filter(e=>e.type==='advancements-completed');assert.equal(awards.length,1);assert.deepEqual(awards[0].advancements,[BIRTHDAY_ADVANCEMENT]);
 assert.equal(ADVANCEMENTS[BIRTHDAY_ADVANCEMENT].display.frame,'challenge');assert.equal(advancementDone(h.b.view.envelope!.state.progress.advancements,BIRTHDAY_ADVANCEMENT),true);
 for(const locale of ['en','zh-CN']){
  const state=structuredClone(h.a.view.envelope!.state);state.settings.locale=locale;
  const line=advancementChat(awards[0],state)[0],hover=line.find(r=>r.hover)?.hover;
  assert.equal(line.map(r=>r.text).join(''),locale==='en'?'sireoh has completed the challenge [Happy Birthday!]':'sireoh完成了挑战[生日快乐！]');
  assert.equal(hover?.[1].text,locale==='en'?'Make a cyber cake':'做好一个赛博蛋糕');assert.equal(hover?.[0].color,'#AA00AA');
 }
});
test('failed durable write gives no false completion/event and supports a deliberate retry', async () => {
    const h = await setup(), before = h.raw();
    let events = 0;
    h.a.eventListeners.add(e => events += e.length);
    h.deny(true);
    await assert.rejects(() => h.a.dispatch(placement(h.a)), /write-failed/);
    assert.equal(h.raw(), before);
    assert.equal(h.a.view.envelope!.state.progress.cakePlacement, null);
    assert.equal(events, 0);
    h.deny(false);
    await h.a.refresh();
    await h.a.dispatch(placement(h.a));
    assert.ok(h.a.view.envelope!.state.progress.cakePlacement);
});
test('reset retains latest audio preferences and fences an old table command from another generation', async () => {
    const h = await setup(), old = placement(h.b);
    await h.a.dispatch(placement(h.a));
    await h.a.dispatch({type: 'settings', patch: {locale: 'en', volume: .35, muted: true}});
    await h.a.reset(token(h.a.view.envelope!));
    await assert.rejects(() => h.b.dispatch(old), /stale-session/);
    const state = h.a.view.envelope!.state;
    assert.equal(state.progress.cakePlacement, null);
    assert.equal(state.progress.player.data.backpack.filter(Boolean).length, 0);
    assert.equal(state.settings.volume, .35);
    assert.equal(state.settings.muted, true);
});
test('complete seeded twenty-second plan contains all five native shapes twice with trail/twinkle and finishes without particles', () => {
    const plan = birthdayPlan(), a = new FireworkSimulation(plan, 2632026), b = new FireworkSimulation(plan, 2632026);
    assert.deepEqual([...new Set(plan.map(e => e.shape))], SHAPES);
    assert.ok(plan.every(e => e.trail && e.twinkle));
    for (let t = 0; t <= 20; t += .05) a.advance(t);
    b.advance(20);
    assert.deepEqual(a.bursts, b.bursts);
    assert.equal(a.bursts.length, 10);
    assert.equal(a.particles.length, 0);
    assert.ok(a.peak > 1000);
    const cues = birthdayCues(plan, 2632026);
    assert.equal(cues.length, 33);
    for (const name of ['launch', 'blast', 'twinkle']) assert.ok(cues.some(c => c.cue.event.includes(name)));
    assert.ok(cues.every((c, i) => !i || c.seconds >= cues[i - 1].seconds));
    assert.throws(() => birthdayPlan(2));
    assert.equal(birthdayCues(birthdayPlan(30), 2632026, 30).find(c => c.cue.event === 'entity.player.levelup')?.seconds, 28);
    assert.ok(cues.every(c=>!['ui.toast.in','ui.toast.out'].includes(c.cue.event)));
});

/** Bind the real controller methods to deterministic audio/scene ports; this is not an auditory or WebGL test.
 * @return {object} Real controller and committed-fact setter.
 */
function playback() {
    let state = structuredClone(initialState()), generation = 'epoch';
    state.progress.scene = 'home';
    state.progress.cakePlacement = {scene: 'home', table: 'birthday-table'};
    const c = Object.create(BirthdayCelebration.prototype) as BirthdayCelebration;
    Object.assign(c, {
        ticket: 0,
        disposed: false,
        paused: false,
        elapsed: 0,
        last: 0,
        lastPublish: 0,
        cueIndex: 0,
        cues: [],
        intervals: [],
        runs: [],
        phases: {},
        ready: Promise.resolve(),
        generation: 'epoch',
        sceneId: 'home',
        gainSignature: '',
        audioReady: true,
        audioState: 'ready',
        current: () => ({state, generation}),
        view: {
            requestRender() {
            }, camera: {position: {toArray: () => [0, 1.62, 7]}, getWorldDirection: () => ({toArray: () => [0, 0, -1]})}
        },
        audio: {
            ready: true,
            state: 'running',
            records: [] as { kind: string; event: string }[],
            peak: 0,
            sources: new Set(),
            time: 1,
            async enable() {
                return true;
            },
            gain() {
            },
            cancel() {
            },
            async pause() {
            },
            listener() {
            },
            sample() {
            },
            schedule(cue: any) {
                this.records.push({kind: 'schedule', event: cue.event});
            }
        },
        batch: {
            created: 0, released: 0, begin() {
                this.created++;
            }, clear() {
                this.released = this.created;
            }, update() {
            }
        },
        replay: {hidden: false},
        publish() {
        },
        drawToast() {
        }
    });
    return {
        c, set: (s: typeof state, g: string) => {
            state = s;
            generation = g;
        }, state
    };
}

test('real controller pauses active time, resumes without background backlog and cancels native batch on skip', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {value: {hidden: false}, configurable: true});
    try {
        const {c} = playback();
        await c.start();
        c.frame(1000);
        c.frame(2000);
        assert.equal(c.elapsed, 1);
        c.pause();
        c.frame(100000);
        assert.equal(c.elapsed, 1);
        await c.resume();
        c.frame(200000);
        assert.equal(c.elapsed, 1);
        c.frame(200100);
        assert.ok(c.elapsed < 1.11);
        c.cancel('skipped');
        assert.equal(c.simulation, null);
        assert.equal(c.batch!.created, c.batch!.released);
        assert.equal(c.runs.at(-1)!.reason, 'skipped');
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else Reflect.deleteProperty(globalThis, 'document');
    }
});
test('real controller generation/reset/navigation invalidate transient replay without changing persistent cake facts', async () => {
    Object.defineProperty(globalThis, 'document', {value: {hidden: false}, configurable: true});
    try {
        const h = playback();
        await h.c.start();
        const ticket = h.c.ticket;
        h.set(h.state, 'next-generation');
        h.c.sync();
        assert.ok(h.c.ticket > ticket);
        assert.equal(h.c.simulation, null);
        assert.ok(h.state.progress.cakePlacement);
        await h.c.start();
        h.c.navigation();
        assert.equal(h.c.simulation, null);
        assert.ok(h.state.progress.cakePlacement);
    } finally {
        Reflect.deleteProperty(globalThis, 'document');
    }
});

test('blocked sound activation preserves committed cake and visual playback; explicit retry replaces the run safely', async () => {
    Object.defineProperty(globalThis, 'document', {value: {hidden: false}, configurable: true});
    try {
        const h = playback();
        h.c.audio.enable = async () => false;
        await h.c.start();
        assert.equal(h.c.audioState, 'blocked');
        assert.ok(h.c.simulation);
        assert.ok(h.state.progress.cakePlacement);
        h.c.audio.enable = async () => true;
        await h.c.start();
        assert.equal(h.c.audioState, 'ready');
        assert.equal(h.c.batch!.created, 2);
        assert.equal(h.c.batch!.released, 1);
        h.c.cancel('skipped');
        assert.equal(h.c.batch!.created, h.c.batch!.released);
    } finally {
        Reflect.deleteProperty(globalThis, 'document');
    }
});
test('real audio adapter capability absence reports unavailable and cannot silently claim activation or decoding', async () => {
    const audio = new CelebrationAudio(() => {
        throw Error('unsupported-audio');
    });
    assert.equal(audio.state, 'unavailable');
    assert.equal(await audio.enable(), false);
    await assert.rejects(() => audio.load({sounds: new Map()} as CelebrationPack), /Web Audio unavailable/);
    assert.equal(audio.ready, false);
    audio.dispose();
    assert.equal(audio.sources.size, 0);
});
test('real audio decode rejection is atomic; mute and rejected activation have inspectable results', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
        value: {userActivation: {isActive: true, hasBeenActive: true}},
        configurable: true
    });
    try {
        const gain = {
            value: .2, setValueAtTime(v: number) {
                this.value = v;
            }
        }, node = {
            gain, connect() {
            }, disconnect() {
            }
        }, context = {
            state: 'suspended',
            currentTime: 0,
            destination: {},
            createGain: () => node,
            createAnalyser: () => ({...node, fftSize: 0}),
            decodeAudioData: async () => {
                throw Error('decode-failed');
            },
            resume: async () => {
                throw Error('autoplay-denied');
            },
            close: async () => {
            }
        };
        const audio = new CelebrationAudio(() => context as unknown as AudioContext);
        await assert.rejects(() => audio.load({sounds: new Map([['sample', new ArrayBuffer(4)]])} as CelebrationPack), /decode-failed/);
        assert.equal(audio.ready, false);
        assert.equal(audio.buffers.size, 0);
        audio.gain(.75, true);
        assert.equal(audio.effectiveGain, 0);
        audio.gain(.35, false);
        assert.equal(audio.effectiveGain, .35);
        assert.equal(await audio.enable(), false);
        assert.ok(audio.records.some(e => e.kind === 'activation-error'));
        audio.dispose();
    } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original); else Reflect.deleteProperty(globalThis, 'navigator');
    }
});
