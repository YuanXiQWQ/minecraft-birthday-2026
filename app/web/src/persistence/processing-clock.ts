/** One visible game document owns processing time; home pages and offline intervals never drive production. */
import type {SaveSession} from './session.ts';
import {LOCK_NAME} from './session.ts';

/** A catch-up commit covers at most one ordinary 250ms sampling interval. */
export const ACTIVE_BATCH_TICKS = 5;

/** Drain all earned visible-owner ticks with a browser turn between bounded atomic commits.
 * @param {number} ticks Earned native ticks.
 * @param {Function} commit Real persistence transaction.
 * @param {Function} eligible Current owner/generation/visibility fence.
 * @param {Function} yieldTurn Injectable browser task boundary.
 * @return {Promise<number>} Count committed before ownership ends.
 */
export async function advanceActiveTicks(ticks: number, commit: (ticks: number) => Promise<unknown>, eligible: () => boolean, yieldTurn: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))): Promise<number> {
    let committed = 0;
    while (committed < ticks && eligible()) {
        const count = Math.min(ACTIVE_BATCH_TICKS, ticks - committed);
        await commit(count);
        committed += count;
        if (committed < ticks) await yieldTurn();
    }
    return committed;
}

/** Convert measured active elapsed time into deterministic native ticks, retaining fractional ticks only within one ownership interval. */
export class TickClock {
    last: number;
    remainder = 0;

    /** Initialize an ownership interval. @param {number} now Monotonic active time. */
    constructor(now: number) {
        this.last = now;
    }

    /** Measure active time without reference to rendering frames. @param {number} now Monotonic time. @return {number} Complete 50ms ticks. */
    sample(now: number): number {
        const elapsed = Math.max(0, now - this.last) + this.remainder;
        this.last = now;
        const ticks = Math.floor(elapsed / 50);
        this.remainder = elapsed - ticks * 50;
        return ticks;
    }
}

/** Coordinate a visible-page simulation lease independently of short save transaction locks.
 * @param {SaveSession} session Shared semantic persistence port.
 * @return {Function} Idempotent cleanup, including current ownership and pending intervals.
 */
export function processingClock(session: SaveSession): () => void {
    let disposed = false, lease: object | null = null, release: (() => void) | null = null, busy = false,
        ticking = false, clock: TickClock | null = null, generation = '', timer = 0;

    /** Relinquish ownership and discard any hidden/offline/handoff interval. */
    function stop(): void {
        lease = null;
        clock = null;
        release?.();
        release = null;
    }

    /** Advance only while the same visible owner and save generation remain valid.
     * @return {Promise<void>} Bounded locked tick updates.
     */
    async function step(): Promise<void> {
        if (ticking || !lease || !clock) return;
        const ticket = lease, epoch = session.view.envelope?.generation;
        if (document.hidden || disposed || !session.view.writable || session.suspended) {
            stop();
            return;
        }
        if (epoch !== generation) {
            generation = epoch ?? '';
            clock = new TickClock(performance.now());
            return;
        }
        const ticks = clock.sample(performance.now());
        if (!ticks) return;
        ticking = true;
        const eligible = () => !disposed && !document.hidden && lease === ticket && session.view.envelope?.generation === epoch;
        try {
            await advanceActiveTicks(ticks, n => session.transact({
                type: 'processing-tick',
                ticks: n
            }, eligible), eligible);
        } catch {
            if (lease === ticket) stop();
        } finally {
            ticking = false;
        }
    }

    /** Acquire an available lease without waiting behind another active document.
     * @return {Promise<void>} Ownership attempt completion.
     */
    async function attempt(): Promise<void> {
        if (busy || disposed || document.hidden || !navigator.locks || !session.view.writable) return;
        busy = true;
        try {
            await navigator.locks.request(LOCK_NAME + ':processing', {ifAvailable: true}, async lock => {
                if (!lock || disposed || document.hidden) return;
                lease = {};
                generation = session.view.envelope?.generation ?? '';
                clock = new TickClock(performance.now());
                await new Promise<void>(resolve => {
                    release = resolve;
                });
            });
        } finally {
            busy = false;
        }
    }

    /** Update ownership on real visibility and page lifecycle boundaries. */
    function visibility(): void {
        if (document.hidden) stop(); else void attempt();
    }

    timer = window.setInterval(() => {
        if (lease) void step(); else void attempt();
    }, 250);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    void attempt();
    return () => {
        if (disposed) return;
        disposed = true;
        stop();
        clearInterval(timer);
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('pagehide', stop);
    };
}
