/** P8_TEST_ONLY: read-only measurement of the ordinary app; no save seed, state edit or alternate player path. */
import {SAVE_KEY} from '../web/src/persistence/session.ts';
import {observeTimings} from '../web/src/performance.ts';
import type {Timing} from '../web/src/performance.ts';

if (new URLSearchParams(location.search).has('measure')) {
    const button = document.createElement('button'), output = document.createElement('output');
    button.id = 'measure-run';
    button.textContent = 'Measure 60 seconds';
    button.style.cssText = 'position:fixed;right:8px;bottom:4px;z-index:100;font:12px monospace;padding:2px';
    output.id = 'measurement';
    output.hidden = true;
    document.addEventListener('DOMContentLoaded', () => document.body.append(button, output), {once: true});

    /** Summarize actual durations without inventing a user-approved pass threshold.
     * @param {number[]} samples Milliseconds.
     * @return {object} Counts and quantiles.
     */
    function distribution(samples: number[]) {
        const a = [...samples].sort((a, b) => a - b);
        return {
            count: a.length,
            p50: a[Math.floor(a.length * .5)] ?? 0,
            p95: a[Math.floor(a.length * .95)] ?? 0,
            p99: a[Math.floor(a.length * .99)] ?? 0,
            max: a.at(-1) ?? 0,
            over16_7: a.filter(v => v > 16.7).length,
            over33_3: a.filter(v => v > 33.3).length,
            over50: a.filter(v => v > 50).length
        };
    }

    /** Observe native RAF, actual application spans, GPU queries and browser long-task attribution. */
    button.onclick = () => {
        button.disabled = true;
        output.dataset.result = 'running';
        const timings: Timing[] = [], frames: number[] = [], longEntries: unknown[] = [], visibility: unknown[] = [],
            start = performance.now(), warm = 5000, duration = 60000, observers: PerformanceObserver[] = [];
        let last = start;
        for (const type of ['longtask', 'long-animation-frame']) if (PerformanceObserver.supportedEntryTypes.includes(type)) {
            const o = new PerformanceObserver(list => {
                for (const e of list.getEntries()) longEntries.push(e.toJSON());
            });
            o.observe({type, buffered: false});
            observers.push(o);
        }
        observeTimings(t => {
            if (t.start >= start + warm) timings.push(t);
        }, true);

        /** Record actual visibility; no artificial event is injected. */
        function hidden(): void {
            visibility.push({at: performance.now(), hidden: document.hidden});
        }

        document.addEventListener('visibilitychange', hidden);

        /** Finish a bounded observation without any persistent state mutation.
         * @param {number} now Native presentation timestamp.
         */
        function frame(now: number): void {
            if (now >= start + warm) frames.push(now - last);
            last = now;
            if (now < start + warm + duration) {
                requestAnimationFrame(frame);
                return;
            }
            observeTimings(null);
            observers.forEach(o => o.disconnect());
            document.removeEventListener('visibilitychange', hidden);
            const grouped: Record<string, number[]> = {};
            for (const t of timings) (grouped[t.name] ??= []).push(t.duration);
            const canvas = document.querySelector<HTMLCanvasElement>('#scene > canvas[role="img"]')!,
                gl = canvas.getContext('webgl2')!;
            output.textContent = JSON.stringify({
                testObservationOnly: true,
                warmupMs: warm,
                measurementMs: now - start - warm,
                viewport: [innerWidth, innerHeight],
                dpr: devicePixelRatio,
                visibility,
                userAgent: navigator.userAgent,
                graphics: {
                    renderer: gl.getParameter(gl.RENDERER),
                    vendor: gl.getParameter(gl.VENDOR),
                    gpuTimer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2')
                },
                frameMs: distribution(frames),
                stages: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, distribution(v)])),
                render: canvas.dataset,
                celebration: document.querySelector<HTMLElement>('.birthday-celebration')?.dataset,
                longEntries,
                timings,
                frames
            });
            output.dataset.result = 'ready';
            button.disabled = false;
        }

        requestAnimationFrame(frame);
    };
}

if (new URLSearchParams(location.search).has('capture-drag')) {
    const output = document.createElement('output');
    output.id = 'drag-capture';
    output.hidden = true;
    document.addEventListener('DOMContentLoaded', () => document.body.append(output), {once: true});
    let samples = 0, lastTrusted = false;
    /** Observe trusted input identity before the GUI prevents propagation.
     * @param {PointerEvent} event Actual browser input.
     */
    document.addEventListener('pointermove', event => {
        lastTrusted = event.isTrusted;
    }, {capture: true});
    /** Copy the GUI canvas after the production draw completes, without synthesizing a gesture or altering state. */
    const observer = new MutationObserver(() => {
        const modal = document.querySelector<HTMLElement>('#inventory'), raw = modal?.dataset.dragPreview;
        if (!lastTrusted || !raw || raw === 'null' || samples >= 16) return;
        const canvas = modal!.querySelector<HTMLCanvasElement>('.inventory-panel>canvas')!,
            cursor = document.querySelector<HTMLCanvasElement>('.item-cursor');
        output.dataset.capture = JSON.stringify({
            trusted: lastTrusted,
            at: performance.now(),
            preview: JSON.parse(raw),
            committedBackpack: JSON.parse(modal!.dataset.backpack ?? '[]'),
            canvas: canvas.toDataURL('image/png'),
            cursor: cursor?.toDataURL('image/png'),
            viewport: [innerWidth, innerHeight],
            canvasBacking: [canvas.width, canvas.height]
        });
        samples++;
    });
    observer.observe(document.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-drag-preview']
    });
}
// Capture-only observer remains separate from ordinary builds and never edits player state.
if (new URLSearchParams(location.search).has('capture-native')) {
    const button = document.createElement('button'), output = document.createElement('output');
    button.textContent = 'Capture GUI evidence'; button.id = 'capture-native'; output.id = 'native-evidence'; output.hidden = true;
    button.style.cssText = 'position:fixed;right:8px;bottom:34px;z-index:100;font:12px monospace;padding:2px';
    document.addEventListener('DOMContentLoaded', () => document.body.append(button, output), {once:true});
    /** Capture actual rendered surfaces and read committed state without a game command or synthetic player event. */
    button.onclick = () => {
        const surfaces = [...document.querySelectorAll<HTMLCanvasElement>('#inventory canvas,.hotbar canvas,.recipe-toast,.game-chat canvas')].map((canvas,index) => ({index,className:canvas.className,rect:canvas.getBoundingClientRect().toJSON(),backing:[canvas.width,canvas.height],png:canvas.toDataURL('image/png')}));
        output.textContent = JSON.stringify({testObservationOnly:true,at:performance.now(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,scene:document.getElementById('scene')!.getBoundingClientRect().toJSON(),build:document.getElementById('app')!.dataset.build,surfaces,save:localStorage.getItem(SAVE_KEY),inventory:document.getElementById('inventory')?.dataset,world:document.querySelector<HTMLCanvasElement>('#scene>canvas')?.dataset,chat:document.querySelector<HTMLElement>('.game-chat')?.dataset});
        output.dataset.ready = 'true';
    };
}


if (new URLSearchParams(location.search).has('pointer-evidence')) {
    const output = document.createElement('output'); output.id = 'pointer-evidence'; output.style.cssText = 'position:fixed;bottom:2px;left:2px;z-index:100;max-width:100%;background:#fff;color:#000;font:12px monospace;pointer-events:none;';
    const events: unknown[] = [];
    document.addEventListener('DOMContentLoaded', () => document.body.append(output), {once:true});
    /** Observe actual browser notifications and trusted input, without changing pointer ownership. @param {Event} event Native event. */
    function record(event: Event): void {
        const canvas = document.querySelector<HTMLCanvasElement>('#scene>canvas'), mouse = event as MouseEvent;
        events.push({type:event.type,trusted:event.isTrusted,locked:document.pointerLockElement===canvas,dx:mouse.movementX,dy:mouse.movementY,button:mouse.button});
        if (events.length > 20) events.shift();
        output.textContent = JSON.stringify({mode:canvas?.dataset.pointerMode,look:canvas?.dataset.look,hover:canvas?.dataset.hover,events});
    }
    for (const type of ['pointerlockchange','pointerlockerror','pointermove','pointerdown','pointerup','visibilitychange']) document.addEventListener(type, record, {capture:true});
}


// These controls are emitted only by the verification transform, never by normal builds.
if (new URLSearchParams(location.search).has('settings-audit')) {
    const output=document.createElement('output'); output.id='settings-audit'; output.hidden=true;
    document.addEventListener('DOMContentLoaded',()=>document.body.append(output),{once:true});
    const events:object[]=[];
    for(const type of ['input','change']) document.addEventListener(type,event=>{const target=event.target as HTMLInputElement;if(target.id==='volume'||target.id==='mute'){events.push({type,trusted:event.isTrusted,value:target.value,checked:target.checked});if(events.length>30)events.shift();}},true);
    /** Observe actual mounted settings and durable facts without bypassing the production input route. */
    function snapshotSettings():void {
        const dialog=document.getElementById('settings') as HTMLDialogElement|null;
        output.textContent=JSON.stringify({page:document.getElementById('app')?.className,open:dialog?.open,controls:['language','volume','mute'].map(id=>{const e=document.getElementById(id) as HTMLInputElement|null;return{id,connected:!!e?.isConnected,value:e?.value,checked:e?.checked,hidden:e?.hidden,rect:e?.getBoundingClientRect().toJSON(),nativeWrapper:e?.parentElement?.className};}),buttons:dialog?[...dialog.querySelectorAll('button')].filter(e=>e.getClientRects().length>0).map(e=>({text:e.innerText,disabled:e.disabled})):[],volumeLabel:dialog?.querySelector('.volume-label')?.textContent,feedback:document.getElementById('preference-feedback')?.textContent,save:localStorage.getItem(SAVE_KEY),events});
    }
    const timer=setInterval(snapshotSettings,200);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
if(new URLSearchParams(location.search).has('capacity-fixtures')) void import('./capacity-browser.ts');
