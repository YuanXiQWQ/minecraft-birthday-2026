/** Configurable twenty-second celebration uses the five inspected native trajectories and fixed seeded motion. */
import {SHAPES, SeedRandom, fireworkSound, starterLifetime} from './firework-simulation.ts';
import type {Explosion, Cue} from './firework-simulation.ts';

export interface TimedCue {
    seconds: number;
    cue: Cue;
    variant: number;
}

/** Build a finite complete performance in front of the home structure, with a five-shape final volley.
 * @param {number} seconds Configured active duration.
 * @return {Explosion[]} Reproducible native explosions, independent of frame rate.
 */
export function birthdayPlan(seconds = 20): Explosion[] {
    if (seconds < 18 || seconds > 60) throw Error('invalid-celebration-duration');
    return [...SHAPES, ...SHAPES].map((shape, i) => ({
        shape,
        tick: i < 5 ? 25 + i * 43 : Math.round((seconds - 6) * 20) + (i - 5) * 3,
        position: [i < 5 ? (i % 3 - 1) * 3 : (i - 7) * 2, 4.5 + (i % 2) * 1.1, -2 - (i % 2)] as [number, number, number],
        velocity: [.1, .2, -.1],
        colors: i % 2 ? [0xff55ff, 0x55ffff, 0xffff55] : [0xff3333, 0xffdd55, 0x66ccff],
        fade: [0xffffff, 0x7733ff],
        trail: true,
        twinkle: true
    }));
}

/** Derive original event/variant/pitch parameters on the same active timeline as the visual bursts.
 * @param {Explosion[]} plan Native plan.
 * @param {number} seed Shared reproducible seed.
 * @param {number} duration Configured active duration.
 * @return {TimedCue[]} Stable time-ordered audio calls.
 */
export function birthdayCues(plan: Explosion[], seed: number, duration = 20): TimedCue[] {
    const rng = new SeedRandom(seed ^ 0x263), cues: TimedCue[] = [];
    for (const e of plan) {
        const distance = Math.hypot(e.position[0], e.position[1] - 1.62, e.position[2] - 7);
        for (const [tick, event] of [[e.tick - 24, {
            event: 'entity.firework_rocket.launch',
            volume: 3,
            pitch: 1,
            delay: 0
        }], [e.tick, fireworkSound(e.shape === 'large_ball', false, distance, rng.next())], [e.tick + starterLifetime(1, true), fireworkSound(false, true, distance, rng.next())]] as const) cues.push({
            seconds: tick / 20 + event.delay,
            variant: rng.next(),
            cue: {
                tick,
                event: event.event,
                volume: event.volume,
                pitch: event.pitch,
                position: e.position,
                distanceDelay: tick !== e.tick - 24
            }
        });
    }
    for (const [seconds, event, volume, pitch] of [[.1, 'ui.toast.in', 1, 1], [.2, 'ui.toast.challenge_complete', 1, 1], [duration - 3, 'entity.experience_orb.pickup', .2, 1], [duration - 2, 'entity.player.levelup', .75, 1], [duration - .5, 'ui.toast.out', 1, 1]] as const) cues.push({
        seconds,
        variant: rng.next(),
        cue: {tick: Math.round(seconds * 20), event, volume, pitch, position: [0, 1.62, 6], distanceDelay: false}
    });
    return cues.sort((a, b) => a.seconds - b.seconds);
}
