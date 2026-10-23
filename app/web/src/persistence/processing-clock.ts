/** One visible game document owns processing time; home pages and offline intervals never drive production. */
import type {SaveSession} from './session.ts';
import type {CommandFeedback} from '../domain/console.ts';
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
    sample(now: number, rate=20): number {
        const elapsed = Math.max(0, now - this.last) + this.remainder;
        this.last = now;
        const ticks = Math.floor(elapsed / (1000/rate));
        this.remainder = elapsed - ticks * (1000/rate);
        return ticks;
    }
}

/** Coordinate a visible-page simulation lease independently of short save transaction locks.
 * @param {SaveSession} session Shared semantic persistence port.
 * @param {Function} feedback Native sprint completion messages.
 * @return {Function} Idempotent cleanup, including current ownership and pending intervals.
 */
export function processingClock(session: SaveSession, feedback: (message:CommandFeedback)=>void = ()=>{}): () => void {
    let disposed = false, lease: object | null = null, release: (() => void) | null = null, busy = false,
        ticking = false, clock: TickClock | null = null, generation = '', timer = 0, schedule = '', sprintStart=0, sprintCount=0, quick=0;

    /** Relinquish ownership and discard any hidden/offline/handoff interval. */
    function stop(): void {
        lease = null;
        clock = null;
        clearTimeout(quick);sprintStart=0;sprintCount=0;
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
            sprintStart=0;sprintCount=0;schedule='';
            clock = new TickClock(performance.now());
            return;
        }
        const control=session.view.envelope?.state.progress.environment?.control;
        const signature=JSON.stringify([control?.epoch,!!control?.sprintTicks,control?.frozen]);
        if(signature!==schedule){schedule=signature;clock=new TickClock(performance.now());}
        const ticks=control?.sprintTicks?Math.min(ACTIVE_BATCH_TICKS,control.sprintTicks):clock.sample(performance.now(),control?.tickRate??20);
        if(control?.frozen&&!control.stepTicks&&!control.sprintTicks)return;
        if(control?.sprintTicks&&!sprintStart){sprintStart=performance.now();sprintCount=0;}
        if (!ticks) return;
        ticking = true;
        const eligible = () => !disposed && !document.hidden && lease === ticket && session.view.envelope?.generation === epoch && session.view.envelope?.state.progress.environment?.control.epoch === control?.epoch;
        try {
            await advanceActiveTicks(ticks, n => session.transact({
                type: 'processing-tick',
                ticks: n, controlEpoch:control?.epoch
            }, eligible), eligible);
            if(sprintStart&&eligible()){sprintCount+=ticks;if(!session.view.envelope?.state.progress.environment?.control.sprintTicks){
                const elapsed=Math.max(.001,performance.now()-sprintStart);
                feedback({key:'commands.tick.sprint.report',values:{v0:Math.floor(sprintCount*1000/elapsed),v1:(elapsed/sprintCount).toFixed(2)}});sprintStart=0;sprintCount=0;
            }}else if(sprintStart){sprintStart=0;sprintCount=0;}
        } catch {
            if (lease === ticket) stop();
        } finally {
            ticking = false;
            if(lease&&!disposed&&!document.hidden&&session.view.envelope?.state.progress.environment?.control.sprintTicks)quick=window.setTimeout(()=>void step(),0);
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
