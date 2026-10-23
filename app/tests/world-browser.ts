/** P7_TEST_ONLY: deterministic renderer load fixture; never used as an ordinary-game mainline walkthrough. */
import {loadCatalogueArt} from '../web/src/ui/icons.ts';
import {auditSpace} from './spatial-access.ts';
import {observeTimings} from '../web/src/performance.ts';
import type {Timing} from '../web/src/performance.ts';
import {loadResources} from '../web/src/render/resources.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {WORLD_SCENES, WORLD_REGION} from '../web/src/domain/world-config.ts';
import {emptyFurnace, inputChanged} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';
import {loadRules} from '../web/src/rules/load.ts';
import type {SceneId, Station} from '../web/src/domain/types.ts';

const pack = await loadResources(true), rules = await loadRules(), host = document.getElementById('scene')!,
    output = document.getElementById('evidence')!, nav = document.getElementById('tests')!;
let view = new SceneView(host, pack, 'P7 native authored scene fixture', true), state = initialState(), running = false,
    cycle = 0, lastStepMs = 0;

/** Update the native authored view, with test snapshots kept out of the application save namespace. */
function paint(): void {
    view.syncWorld(state.progress);
    output.textContent = JSON.stringify({
        fixture: true,
        lastStepMs,
        scene: state.progress.scene,
        stations: state.progress.scenes[state.progress.scene].stations.map(s => ({
            id: s.id,
            cell: s.cell,
            facing: s.facing,
            contents: s.contents
        })),
        tick: state.progress.world.tick,
        resources: pack.loading,
        geometries: view.renderer.info.memory.geometries,
        textures: view.renderer.info.memory.textures
    }, null, 2);
}

/** Add one explicitly named test action. @param {string} name Test action label. @param {Function} action Test action. */
function action(name: string, action: () => void): void {
    const button = document.createElement('button');
    button.textContent = name;
    button.onclick = action;
    nav.append(button);
}

for (const scene of Object.keys(WORLD_SCENES) as SceneId[]) action('Scene ' + scene, () => {
    state = transition(state, {type: 'select-scene', scene}, WORLD_REGION, rules).state;
    paint();
});
action('Dense legal layout', () => {
    state = initialState();
    state.progress.unlocked = ['furnace', 'hopper', 'oak_log', 'stick'].map(id => 'minecraft:' + id);
    const box = WORLD_SCENES.plains.build;
    for (let x = box.min[0]; x <= box.max[0]; x++) for (let z = box.min[2]; z <= box.max[2]; z++) for (let y = 0; y <= box.max[1]; y++) {
        const contents = y === 1 ? emptyFurnace() : emptyHopper();
        if (contents.version === 2) {
            contents.data.input = {id: 'minecraft:oak_log', count: 1};
            contents.data.fuel = {id: 'minecraft:stick', count: 1};
            inputChanged(contents.data, null, 'furnace', rules);
        } else if (y === 2) contents.data.slots[0] = {id: 'minecraft:oak_log', count: 16};
        const station: Station = {
            id: 'load-' + x + '-' + y + '-' + (z + 5),
            kind: y === 1 ? 'furnace' : 'hopper',
            cell: [x, y, z],
            facing: y === 1 ? 'south' : y === 0 ? 'east' : 'down',
            contents
        };
        state.progress.scenes.plains.stations.push(station);
    }
    paint();
});
action('Small native connection', () => {
    state = initialState();
    state.progress.unlocked = ['furnace', 'hopper', 'oak_log', 'stick'].map(id => 'minecraft:' + id);
    const f = emptyFurnace();
    f.data.input = {id: 'minecraft:oak_log', count: 1};
    f.data.fuel = {id: 'minecraft:stick', count: 1};
    inputChanged(f.data, null, 'furnace', rules);
    const top = emptyHopper(), side = emptyHopper();
    top.data.slots[0] = {id: 'minecraft:oak_log', count: 8};
    side.data.slots[0] = {id: 'minecraft:stick', count: 8};
    state.progress.scenes.plains.stations = [{
        id: 'bottom',
        kind: 'hopper',
        cell: [3, 0, 0],
        facing: 'east',
        contents: emptyHopper()
    }, {id: 'receiver', kind: 'hopper', cell: [4, 0, 0], facing: 'down', contents: emptyHopper()}, {
        id: 'producer',
        kind: 'furnace',
        cell: [3, 1, 0],
        facing: 'south',
        contents: f
    }, {id: 'top', kind: 'hopper', cell: [3, 2, 0], facing: 'down', contents: top}, {
        id: 'side',
        kind: 'hopper',
        cell: [4, 1, 0],
        facing: 'west',
        contents: side
    }];
    paint();
});
action('Advance 240 ticks', () => {
    const start = performance.now();
    state = transition(state, {type: 'processing-tick', ticks: 240}, WORLD_REGION, rules).state;
    lastStepMs = performance.now() - start;
    paint();
});
action('Wheat stages', () => {
    state = initialState();
    state.progress.scene = 'farm';
    state.progress.unlocked = ['minecraft:wheat_seeds'];
    state.progress.scenes.farm.crops = WORLD_SCENES.farm.plots.slice(0, 4).map((cell, i) => ({
        id: 'stage-' + i,
        item: 'minecraft:wheat_seeds',
        cell,
        growth: {version: 1, data: {ticks: [0, 80, 160, 240][i]}}
    }));
    paint();
});
action('Rebuild adapter', () => {
    view.dispose();
    view = new SceneView(host, pack, 'P7 native authored scene fixture', true);
    cycle++;
    paint();
});
action('Measure 360 frames', () => {
    if (running) return;
    running = true;
    const samples: number[] = [], start = performance.now();
    let last = start;

    /** Measure continuous requested renders independently from the normal idle event cadence. @param {number} now RAF timestamp. */
    function frame(now: number): void {
        if (document.hidden) {
            running = false;
            output.textContent = 'BLOCKED: hidden fixture';
            return;
        }
        samples.push(now - last);
        last = now;
        if (samples.length % 30 === 0) output.dataset.frameCount = String(samples.length);
        view.requestRender();
        if (samples.length < 360) {
            requestAnimationFrame(frame);
            return;
        }
        const sorted = samples.slice(30).sort((a, b) => a - b), cpu = [...view.renderMs].sort((a, b) => a - b),
            result = {
                fixture: true,
                warmupFrames: 30,
                measuredFrames: sorted.length,
                elapsedMs: performance.now() - start,
                viewport: [innerWidth, innerHeight],
                dpr: devicePixelRatio,
                cycle,
                scene: state.progress.scene,
                instances: state.progress.scenes[state.progress.scene].stations.length,
                objects: view.scene.children.reduce((n, g) => n + g.children.length, 0),
                drawCalls: view.renderer.info.render.calls,
                triangles: view.renderer.info.render.triangles,
                geometry: view.renderer.info.memory.geometries,
                textures: view.renderer.info.memory.textures,
                owned: {created: view.models.created, released: view.models.released},
                frameMs: {
                    p50: sorted[Math.floor(sorted.length * .5)],
                    p95: sorted[Math.floor(sorted.length * .95)],
                    max: sorted.at(-1),
                    over16_7: sorted.filter(n => n > 16.7).length,
                    over33_3: sorted.filter(n => n > 33.3).length,
                    over50: sorted.filter(n => n > 50).length
                },
                cpuSubmissionMs: {
                    p50: cpu[Math.floor(cpu.length * .5)],
                    p95: cpu[Math.floor(cpu.length * .95)],
                    max: cpu.at(-1)
                },
                note: 'RAF/request-to-request and CPU submission; no GPU timer query, no low-end or human validation'
            };
        output.textContent = JSON.stringify(result, null, 2);
        output.dataset.measurement = JSON.stringify(result);
        running = false;
    }

    requestAnimationFrame(frame);
});
action('Audit native access', () => {
    const result = auditSpace(view);
    output.textContent = JSON.stringify(result, null, 2);
    output.dataset.access = JSON.stringify(result);
});
action('Original continuous driver 65s DPR1', () => {
    if (running) return;
    running = true;
    view.renderer.setPixelRatio(1);
    const start = performance.now(), frames: { start: number; duration: number }[] = [], timings: Timing[] = [],
        longEntries: unknown[] = [], observers: PerformanceObserver[] = [];
    let last = start;

    /** Keep available native browser script attribution without labeling unobserved GC or external scheduling as a cause.
     * @param {PerformanceObserverEntryList} entries Actual long-task/animation entries.
     */
    function long(entries: PerformanceObserverEntryList): void {
        longEntries.push(...entries.getEntries().map(e => e.toJSON()));
    }

    for (const type of ['longtask', 'long-animation-frame']) if (PerformanceObserver.supportedEntryTypes.includes(type)) {
        const observer = new PerformanceObserver(long);
        observer.observe({type});
        observers.push(observer);
    }
    observeTimings(t => {
        if (t.start >= start + 5000) timings.push(t);
    });

    /** Retain the original every-RAF render request and diagnostic cadence over a five-second warmup and sixty-second sample.
     * @param {number} now Native RAF timestamp.
     */
    function frame(now: number): void {
        if (now >= start + 5000) frames.push({start: last, duration: now - last});
        last = now;
        view.requestRender();
        if (frames.length % 30 === 0) output.dataset.frameCount = String(frames.length);
        if (now - start < 65000) {
            requestAnimationFrame(frame);
            return;
        }
        observeTimings(null);
        observers.forEach(o => o.disconnect());
        const sorted = frames.map(f => f.duration).sort((a, b) => a - b), result = {
            fixture: true,
            originalContinuousDriver: true,
            warmupMs: 5000,
            measurementMs: now - start - 5000,
            viewport: [innerWidth, innerHeight],
            browserDpr: devicePixelRatio,
            rendererDpr: view.renderer.getPixelRatio(),
            backing: [view.renderer.domElement.width, view.renderer.domElement.height],
            instances: state.progress.scenes.plains.stations.length,
            drawCalls: view.renderer.info.render.calls,
            triangles: view.renderer.info.render.triangles,
            geometry: view.renderer.info.memory.geometries,
            frameMs: {
                count: sorted.length,
                p50: sorted[Math.floor(sorted.length * .5)],
                p95: sorted[Math.floor(sorted.length * .95)],
                p99: sorted[Math.floor(sorted.length * .99)],
                max: sorted.at(-1),
                over16_7: sorted.filter(n => n > 16.7).length,
                over33_3: sorted.filter(n => n > 33.3).length,
                over50: sorted.filter(n => n > 50).length
            },
            frames,
            timings,
            longEntries,
            note: 'Original static dense fixture and continuous render driver; original target DPR1 is configured only in this isolated test. Ordinary application DPR and render scheduling are unchanged.'
        };
        output.dataset.continuous = JSON.stringify(result);
        output.textContent = JSON.stringify({
            ...result,
            frames: undefined,
            timings: undefined,
            longEntries: undefined
        }, null, 2);
        running = false;
    }

    requestAnimationFrame(frame);
});
paint();
window.addEventListener('pagehide', () => view.dispose());

/** TEST ONLY: expose the same native compass art and actual camera bridge used by the formal inventory. */
const compassArt = await loadCatalogueArt(), compassCanvas = document.createElement('canvas');
compassCanvas.width = compassCanvas.height = 256; compassCanvas.style.width = compassCanvas.style.height = '128px';
compassCanvas.id = 'test-compass'; nav.append(compassCanvas);
for (const dx of [-180, 0, 180]) action('TEST compass camera ' + dx, () => {
    view.look.yaw = 0; view.look.pitch = 0;
    view.look.begin(991, 640, 350);
    view.movePointer({pointerId: 991, clientX: 640 + dx, clientY: 350, buttons: 2} as PointerEvent, true);
    if (dx === 0) {view.camera.rotation.set(view.basePitch, 0, 0, 'YXZ');view.camera.updateMatrixWorld(true);}
    view.look.cancel(); view.requestRender();
    const owner = view.compassView('fixture');
    for (let t = 0; t < 250; t++) compassArt.update((++cycle) * 50, owner);
    const ctx = compassCanvas.getContext('2d')!;ctx.clearRect(0,0,256,256);ctx.drawImage(compassArt.icons.get('minecraft:compass')!,0,0,256,256);
    output.dataset.compass = JSON.stringify({testOnlyControlledPose:true, viewport:[innerWidth,innerHeight],dpr:devicePixelRatio, ...compassArt.documents.get('$compass-state')});
    output.textContent = output.dataset.compass;
});
window.addEventListener('pagehide',()=>compassArt.dispose(),{once:true});
