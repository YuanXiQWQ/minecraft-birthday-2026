/** P7_TEST_ONLY: fixed-layout timing through the actual formal app, SaveSession, clock, GUI and renderer. */
import {mount} from '../web/src/app.ts';
import {initialBook} from '../web/src/domain/recipe-book.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {emptyFurnace, inputChanged} from '../web/src/domain/furnace.ts';
import {WORLD_SCENES, WORLD_REGION} from '../web/src/domain/world-config.ts';
import {loadRules} from '../web/src/rules/load.ts';
import {seal, decode} from '../web/src/persistence/codec.ts';
import {SAVE_KEY} from '../web/src/persistence/session.ts';
import {observeTimings} from '../web/src/performance.ts';
import type {Timing} from '../web/src/performance.ts';
import type {Station, Cell} from '../web/src/domain/types.ts';

const layout = new URLSearchParams(location.search).get('layout') ?? 'normal', state = initialState(),
    rules = await loadRules(), evidence = document.getElementById('evidence')!,
    startButton = document.getElementById('measure') as HTMLButtonElement;

/** Build one explicit benchmark instance, never an ordinary-page walkthrough step.
 * @param {string} id Instance ID.
 * @param {Cell} cell Legal location.
 * @param {boolean} furnace Whether this is a real running producer.
 * @param {Station['facing']} facing Real endpoint direction.
 * @return {Station} Isolated starting data.
 */
function device(id: string, cell: Cell, furnace: boolean, facing: Station['facing'] = 'down'): Station {
    if (furnace) {
        const contents = emptyFurnace();
        contents.data.input = {id: 'minecraft:oak_log', count: 1};
        contents.data.fuel = {id: 'minecraft:stick', count: 1};
        inputChanged(contents.data, null, 'furnace', rules);
        return {id, cell, kind: 'furnace', facing: 'south', contents};
    }
    const contents = emptyHopper();
    if (cell[1] === 2) contents.data.slots[0] = {id: 'minecraft:oak_log', count: 64};
    return {id, cell, kind: 'hopper', facing, contents};
}

state.progress.unlocked = ['furnace', 'hopper', 'oak_log', 'stick'].map(id => 'minecraft:' + id);
/** Explicit finite-device fixture for native mouse checks, separate from ordinary acquisition evidence. */
if (layout === 'plains-review') {
    state.progress.unlocked.push('minecraft:iron_pickaxe');
    state.progress.player.data.hotbar[0] = {id: 'minecraft:furnace', count: 1};
    state.progress.player.data.hotbar[1] = {id: 'minecraft:hopper', count: 1};
    state.progress.player.data.hotbar[2] = {id: 'minecraft:iron_pickaxe', count: 1};
}
if (layout === 'chain') {
    const list = [device('bottom', [3, 0, 0], false, 'east'), device('receiver', [4, 0, 0], false), device('producer', [3, 1, 0], true), device('top', [3, 2, 0], false), device('side', [4, 1, 0], false, 'west')];
    if (list[4].contents.version === 3) list[4].contents.data.slots[0] = {id: 'minecraft:stick', count: 64};
    state.progress.scenes.plains.stations = list;
}
if (layout === 'dense') {
    const b = WORLD_SCENES.plains.build;
    for (let x = b.min[0]; x <= b.max[0]; x++) for (let z = b.min[2]; z <= b.max[2]; z++) for (let y = 0; y <= 2; y++) state.progress.scenes.plains.stations.push(device('dense-' + x + '-' + y + '-' + (z + 4), [x, y, z], y === 1, y === 0 ? 'east' : 'down'));
}
/** Joint fixture is isolated from ordinary play and uses the actual finite producer/network and completed replay UI. */
const joint = new URLSearchParams(location.search).has('joint');
if (joint) {
    state.progress.scene = 'home'; state.progress.cakePlacement = {scene: 'home', table: 'birthday-table'};
    state.progress.scenes.home.stations = state.progress.scenes.plains.stations; state.progress.scenes.plains.stations = [];
    state.progress.unlocked = Object.keys(rules.items); state.progress.recipeBook = initialBook(state.progress.unlocked);
    state.progress.player.data.backpack = Object.keys(rules.items).slice(0,27).map(id => ({id,count:1}));
}
localStorage.setItem(SAVE_KEY, JSON.stringify(await seal(state, 'p7-performance-' + layout, 0)));
await mount('game');
startButton.disabled = false;
evidence.textContent = JSON.stringify({fixture: true, layout, ready: true});
const stallButton = document.createElement('button');
stallButton.textContent = 'Test 1500ms active stall';
startButton.after(stallButton);
/** Inject one explicitly marked main-thread stall and compare all resulting facts with the same native tick count.
 * @return {Promise<void>} Real-clock catch-up observation, without an artificial processing command.
 */
stallButton.onclick = async () => {
    stallButton.disabled = startButton.disabled = true;
    const before = (await decode(localStorage.getItem(SAVE_KEY)!)).envelope, timings: Timing[] = [];
    observeTimings(t => timings.push(t));
    const start = performance.now();
    while (performance.now() - start < 1500) {/* Deliberate verification-only main-thread stall. */
    }
    await new Promise(r => setTimeout(r, 1500));
    observeTimings(null);
    const after = (await decode(localStorage.getItem(SAVE_KEY)!)).envelope,
        ticks = after.state.progress.world.tick - before.state.progress.world.tick,
        expected = transition(before.state, {type: 'processing-tick', ticks}, WORLD_REGION, rules).state,
        commits = timings.filter(t => t.name.startsWith('tick-simulation:')).map(t => ({
            ticks: Number(t.name.split(':')[1]),
            duration: t.duration
        }));
    evidence.dataset.stall = JSON.stringify({
        fixture: true,
        injectedStallMs: 1500,
        elapsedMs: performance.now() - start,
        advancedTicks: ticks,
        maximumBatch: Math.max(...commits.map(t => t.ticks)),
        commits,
        completeStateEqualsNativeTicks: JSON.stringify(after.state) === JSON.stringify(expected),
        generationBefore: before.generation,
        generationAfter: after.generation
    });
    stallButton.disabled = startButton.disabled = false;
};

/** Summarize a distribution without assigning a pass/fail threshold chosen by the test.
 * @param {number[]} values Millisecond durations.
 * @return {object} Observed distribution.
 */
function distribution(values: number[]): object {
    const a = [...values].sort((x, y) => x - y);
    return {
        count: a.length,
        p50: a[Math.floor(a.length * .5)] ?? 0,
        p95: a[Math.floor(a.length * .95)] ?? 0,
        p99: a[Math.floor(a.length * .99)] ?? 0,
        max: a.at(-1) ?? 0,
        over16_7: a.filter(n => n > 16.7).length,
        over33_3: a.filter(n => n > 33.3).length,
        over50: a.filter(n => n > 50).length
    };
}

/** Collect five seconds of continuous warmup followed by sixty seconds without test, build or HMR activity. */
startButton.onclick = async () => {
    startButton.disabled = true;
    localStorage.setItem(SAVE_KEY, JSON.stringify(await seal(state, 'p7-performance-' + layout, 0)));
    const start = performance.now(), warm = 5000, duration = 60000, timings: Timing[] = [],
        frames: { start: number; duration: number }[] = [], longEntries: unknown[] = [],
        visibility: { at: number; hidden: boolean }[] = [], observers: PerformanceObserver[] = [];
    let last = start;

    /** Preserve available browser attribution, including actual script durations rather than guessing a GC or automation cause.
     * @param {PerformanceObserverEntryList} list Browser performance entries.
     */
    function entries(list: PerformanceObserverEntryList): void {
        for (const e of list.getEntries()) if (e.startTime >= start) longEntries.push(e.toJSON());
    }

    for (const type of ['longtask', 'long-animation-frame']) if (PerformanceObserver.supportedEntryTypes.includes(type)) {
        const o = new PerformanceObserver(entries);
        o.observe({type, buffered: false});
        observers.push(o);
    }
    observeTimings(t => {
        if (t.start >= start + warm) timings.push(t);
    }, new URLSearchParams(location.search).get('gpu') === '1');

    /** Record actual visibility without synthesizing page lifecycle events. */
    function visible(): void {
        visibility.push({at: performance.now(), hidden: document.hidden});
    }

    document.addEventListener('visibilitychange', visible);

    /** Sample the browser presentation clock alongside the event-driven formal renderer's submission spans.
     * @param {number} now Native RAF timestamp.
     */
    function frame(now: number): void {
        if (now >= start + warm) frames.push({start: last, duration: now - last});
        last = now;
        if (now < start + warm + duration) {
            requestAnimationFrame(frame);
            return;
        }
        observeTimings(null);
        observers.forEach(o => o.disconnect());
        document.removeEventListener('visibilitychange', visible);
        const grouped: Record<string, number[]> = {};
        for (const t of timings) (grouped[t.name] ??= []).push(t.duration);
        const canvas = document.querySelector<HTMLCanvasElement>('#scene > canvas[role="img"]')!,
            gl = canvas.getContext('webgl2')!, result = {
                fixture: true,
                layout,
                baseline: import.meta.env.VITE_P7_BASELINE === '1',
                resetAtMeasurement: true,
                viewport: [innerWidth, innerHeight],
                dpr: devicePixelRatio,
                userAgent: navigator.userAgent,
                warmupMs: warm,
                measurementMs: now - start - warm,
                visibility,
                frameMs: distribution(frames.map(f => f.duration)),
                stages: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, distribution(v)])),
                render: canvas.dataset,
                graphics: {
                    renderer: gl.getParameter(gl.RENDERER),
                    vendor: gl.getParameter(gl.VENDOR),
                    gpuTimerExtension: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
                    gpuTimeMeasured: !!grouped['gpu-render']
                },
                longEntries,
                frames,
                timings,
                note: 'Formal app and real localStorage/Web Locks; isolated initial fixtures only. RAF presentation intervals are separate from the event-driven renderer cadence. No automated audio hearing or cross-engine claim.'
            };
        evidence.textContent = JSON.stringify(result, null, 2);
        evidence.dataset.result = 'ready';
        startButton.disabled = false;
    }

    requestAnimationFrame(frame);
};
