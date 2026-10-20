/** Explicit preliminary frame sampling; no fixed FPS or target-device certification is inferred. */
import type { SceneAdapter } from './scene-adapter.ts';

/** Calculate repeatable frame interval statistics from actual requestAnimationFrame samples.
 * @param {number[]} frames Actual millisecond intervals.
 * @return {object} Bounded timing summary.
 */
export function summarize(frames: number[]) {
  if (!frames.length || frames.some(v => !Number.isFinite(v) || v <= 0)) throw new Error('invalid-frame-sample');
  const sorted = [...frames].sort((a,b) => a-b), sum = frames.reduce((a,b) => a+b,0);
  return { samples: frames.length, elapsedMs: sum, fps: 1000*frames.length/sum,
    p50Ms: sorted[Math.floor((sorted.length-1)*.5)], p95Ms: sorted[Math.floor((sorted.length-1)*.95)], maxMs: sorted.at(-1)!, over33ms: frames.filter(v => v > 33.33).length };
}

/** Collect three short browser repetitions; the first round intentionally excludes full celebration load.
 * @param {SceneAdapter} adapter Live renderer.
 * @param {Function} progress Visible progress callback.
 * @return {Promise<object>} Raw intervals, summaries and real environment information.
 */
export async function measure(adapter: SceneAdapter, progress: (run: number) => void): Promise<object> {
  if (adapter.sampleSink) throw new Error('measurement-already-running');
  const runs: { frames: number[]; summary: ReturnType<typeof summarize> }[] = [];
  for (let run = 0; run < 3; run++) {
    progress(run+1);
    const frames: number[] = [];
    await new Promise<void>((resolve,reject) => {
      let start: number | null = null;
      const timeout = window.setTimeout(() => { adapter.sampleSink = null; reject(new Error('measurement-stalled-or-background')); },20000);
      adapter.sampleSink = (time,delta) => {
        start ??= time;
        if (time-start >= 2000) frames.push(delta);
        if (time-start >= 12000) { adapter.sampleSink = null; clearTimeout(timeout); resolve(); }
      };
    });
    runs.push({ frames, summary: summarize(frames) });
  }
  return { capturedAt: new Date().toISOString(), workload: 'debug geometry only; no vanilla textures, particles or audio',
    protocol: '3 repetitions, 2s warm-up + 10s sample; preliminary, not full P2 budget',
    environment: adapter.diagnostics(), runs };
}
