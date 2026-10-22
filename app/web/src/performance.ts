/** Opt-in bounded timing instrumentation separates application work without changing domain or clock semantics. */
export interface Timing {
    name: string;
    start: number;
    duration: number;
}

let sink: ((timing: Timing) => void) | null = null, gpuEnabled = false;
/** Inactive instrumentation has no timing allocation. */
const inactive = () => {
};
/** Optional GPU queries are owned per context and never installed in ordinary unobserved rendering. */
const gpuQueries = new WeakMap<WebGL2RenderingContext, { busy: boolean; extension: any }>();

/** Attach one test observer; ordinary pages leave measurement disabled.
 * @param {Function|null} observer Timing receiver or no receiver.
 * @param {boolean} gpu Whether to collect asynchronous GPU queries in this measurement cohort.
 */
export function observeTimings(observer: ((timing: Timing) => void) | null, gpu = false): void {
    sink = observer;
    gpuEnabled = gpu;
}

/** Start an optional measured application span.
 * @param {string} name Pipeline stage.
 * @return {Function} Completion callback.
 */
export function timing(name: string): () => void {
    if (!sink) return inactive;
    const start = performance.now(), observer = sink;
    return () => observer({name, start, duration: performance.now() - start});
}

/** Measure an available non-disjoint GPU submission asynchronously, without waiting on the main thread.
 * @param {WebGL2RenderingContext} gl Actual current renderer context.
 * @return {Function} End-query callback.
 */
export function gpuTiming(gl: WebGL2RenderingContext): () => void {
    if (!sink || !gpuEnabled || gl.isContextLost()) return inactive;
    let context = gpuQueries.get(gl);
    if (!context) {
        context = {busy: false, extension: gl.getExtension('EXT_disjoint_timer_query_webgl2')};
        gpuQueries.set(gl, context);
    }
    if (context.busy || !context.extension) return inactive;
    const q = gl.createQuery();
    if (!q) return inactive;
    context.busy = true;
    const start = performance.now(), observer = sink, owned = context;
    let attempts = 0;
    gl.beginQuery(owned.extension.TIME_ELAPSED_EXT, q);

    /** Resolve only a ready non-disjoint result, releasing the query even after observation or context ends. */
    function poll(): void {
        if (gl.isContextLost() || observer !== sink || ++attempts > 100) {
            gl.deleteQuery(q);
            owned.busy = false;
            return;
        }
        if (!gl.getQueryParameter(q!, gl.QUERY_RESULT_AVAILABLE)) {
            setTimeout(poll, 5);
            return;
        }
        if (!gl.getParameter(owned.extension.GPU_DISJOINT_EXT)) observer({
            name: 'gpu-render',
            start,
            duration: Number(gl.getQueryParameter(q!, gl.QUERY_RESULT)) / 1e6
        });
        gl.deleteQuery(q);
        owned.busy = false;
    }

    return () => {
        gl.endQuery(owned.extension.TIME_ELAPSED_EXT);
        setTimeout(poll, 5);
    };
}
