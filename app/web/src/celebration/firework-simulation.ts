/** Deterministic 20 Hz reconstruction of inspected Java 26.3 firework paths; no world or rocket entity engine. */
export type Vec = [number, number, number];
export type Shape = 'small_ball' | 'large_ball' | 'star' | 'creeper' | 'burst';
/** Authorized five explosion types; these are trajectories, never shape images. */
export const SHAPES: Shape[] = ['small_ball', 'large_ball', 'star', 'creeper', 'burst'];
/** Half-path coordinates read from the verified Starter class initializer. */
export const PATHS = {
    star: [[0, 1], [.3455, .309], [.9511, .309], [.3795918367346939, -.12653061224489795], [.6122448979591837, -.8040816326530612], [0, -.35918367346938773]],
    creeper: [[0, .2], [.2, .2], [.2, .6], [.6, .6], [.6, .2], [.2, .2], [.2, 0], [.4, 0], [.4, -.6], [.2, -.6], [.2, -.4], [0, -.4]]
};

export interface Explosion {
    shape: Shape;
    trail: boolean;
    twinkle: boolean;
    colors: number[];
    fade: number[];
    position: Vec;
    velocity: Vec;
    tick: number;
}

export interface Spark {
    id: number;
    p: Vec;
    previous: Vec;
    v: Vec;
    age: number;
    life: number;
    size: number;
    color: Vec;
    fade?: Vec;
    alpha: number;
    trail: boolean;
    twinkle: boolean;
    child: boolean;
    flash: boolean;
}

export interface Cue {
    tick: number;
    event: string;
    volume: number;
    pitch: number;
    position: Vec;
    distanceDelay: boolean;
}

/** Seeded uniform/Marsaglia Gaussian sampling; distributions follow the inspected rules, not Java seed equivalence. */
export class SeedRandom {
    state: number;
    spare: number | null = null;

    /** Set an explicit nonzero reproducible seed.
     * @param {number} seed Experiment seed.
     */
    constructor(seed: number) {
        this.state = (seed >>> 0) || 1;
    }

    /** Produce one uniform sample in [0,1).
     * @return {number} Reproducible uniform value.
     */
    next(): number {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x >>> 0;
        return this.state / 4294967296;
    }

    /** Sample a centered unit Gaussian with a cached symmetric companion.
     * @return {number} Gaussian sample.
     */
    gaussian(): number {
        if (this.spare !== null) {
            const v = this.spare;
            this.spare = null;
            return v;
        }
        let u = 0, v = 0, r = 0;
        do {
            u = 2 * this.next() - 1;
            v = 2 * this.next() - 1;
            r = u * u + v * v;
        } while (r >= 1 || r === 0);
        const k = Math.sqrt(-2 * Math.log(r) / r);
        this.spare = v * k;
        return u * k;
    }
}

/** Decode original RGB integers without introducing a replacement color palette.
 * @param {number} color Selected original-style firework RGB value.
 * @return {Vec} Normalized RGB channels.
 */
export function rgb(color: number): Vec {
    return [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255];
}

/** Select the inspected reverse spark list by age; SpriteSet uses floor(age*(count-1)/lifetime).
 * @param {number} age Particle age.
 * @param {number} life Particle lifetime.
 * @return {number} Frame-list index 0–7, not the filename suffix.
 */
export function spriteFrame(age: number, life: number): number {
    return Math.max(0, Math.min(7, Math.floor(age * 7 / life)));
}

/** Apply the original twinkle render gate without deleting hidden particles.
 * @param {Spark} p Live particle.
 * @return {boolean} Whether this particle draws in the current tick.
 */
export function visibleSpark(p: Spark): boolean {
    return !p.twinkle || p.age < Math.floor(p.life / 3) || Math.floor((p.age + p.life) / 3) % 2 === 0;
}

/** Choose the original near/far sound, raw volume, pitch and quantized distance delay.
 * @param {boolean} large Whether any explosion is large or a starter contains at least three explosions.
 * @param {boolean} twinkle Whether this is the delayed twinkle cue.
 * @param {number} distance Camera distance in blocks.
 * @param {number} random Uniform pitch sample.
 * @return {{event:string,volume:number,pitch:number,delay:number}} Inspected sound parameters.
 */
export function fireworkSound(large: boolean, twinkle: boolean, distance: number, random: number) {
    return {
        event: `entity.firework_rocket.${twinkle ? 'twinkle' : large ? 'large_blast' : 'blast'}${distance >= 16 ? '_far' : ''}`,
        volume: 20,
        pitch: twinkle ? .9 + random * .15 : .95 + random * .1,
        delay: distance > 10 ? Math.floor(distance / 40 * 20) / 20 : 0
    };
}

/** Calculate the Starter final tick; its twinkle cue runs when the post-increment exceeds this lifetime.
 * @param {number} explosionCount Number of explosions belonging to one rocket.
 * @param {boolean} hasTwinkle Whether any explosion requests twinkle.
 * @return {number} Zero-based final processing tick relative to the first explosion.
 */
export function starterLifetime(explosionCount: number, hasTwinkle: boolean): number {
    return explosionCount * 2 - 1 + (hasTwinkle ? 15 : 0);
}

/** Own finite spark state and fixed ticks; arbitrary refresh intervals cannot alter a seeded simulation. */
export class FireworkSimulation {
    rng: SeedRandom;
    particles: Spark[] = [];
    tick = 0;
    spawned = 0;
    children = 0;
    peak = 0;
    id = 0;
    bursts: { tick: number; shape: Shape; count: number }[] = [];
    plan: Explosion[];

    /** Copy a bounded fixture plan without creating a progression or cake trigger.
     * @param {Explosion[]} plan Explicit diagnostic explosions.
     * @param {number} seed Fixed experiment seed.
     */
    constructor(plan: Explosion[], seed: number) {
        this.plan = structuredClone(plan);
        this.rng = new SeedRandom(seed);
    }

    /** Create one full-bright spark with source lifetime/size ranges and color selection.
     * @param {Vec} position World coordinates.
     * @param {Vec} velocity Per-tick motion.
     * @param {Explosion} e Explosion settings.
     * @return {Spark} New finite particle.
     */
    spark(position: Vec, velocity: Vec, e: Explosion): Spark {
        const size = (.1 * (this.rng.next() * .5 + .5) * 2) * .75, life = 48 + Math.floor(this.rng.next() * 12);
        const color = e.colors.length ? e.colors[Math.floor(this.rng.next() * e.colors.length)] : 1973019;
        const p: Spark = {
            id: ++this.id,
            p: [...position],
            previous: [...position],
            v: [...velocity],
            age: 0,
            life,
            size,
            color: rgb(color),
            fade: e.fade.length ? rgb(e.fade[Math.floor(this.rng.next() * e.fade.length)]) : undefined,
            alpha: .99,
            trail: e.trail,
            twinkle: e.twinkle,
            child: false,
            flash: false
        };
        this.particles.push(p);
        this.spawned++;
        return p;
    }

    /** Emit a shell, mirrored rotated path or velocity-biased Gaussian burst using inspected loop bounds.
     * @param {Explosion} e One original explosion type.
     */
    explode(e: Explosion): void {
        const before = this.spawned;
        if (e.shape === 'small_ball' || e.shape === 'large_ball') {
            const n = e.shape === 'large_ball' ? 4 : 2, speed = e.shape === 'large_ball' ? .5 : .25;
            for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
                const v: Vec = [x + (this.rng.next() - this.rng.next()) * .5, y + (this.rng.next() - this.rng.next()) * .5, z + (this.rng.next() - this.rng.next()) * .5];
                const length = Math.hypot(...v) / speed + this.rng.gaussian() * .05;
                this.spark(e.position, v.map(k => k / length) as Vec, e);
                if (y !== -n && y !== n && x !== -n && x !== n) z += 2 * n - 1;
            }
        } else if (e.shape === 'burst') {
            const dx = this.rng.gaussian() * .05, dz = this.rng.gaussian() * .05;
            for (let i = 0; i < 70; i++) this.spark(e.position, [e.velocity[0] * .5 + this.rng.gaussian() * .15 + dx, e.velocity[1] * .5 + this.rng.next() * .5, e.velocity[2] * .5 + this.rng.gaussian() * .15 + dz], e);
        } else {
            const path = PATHS[e.shape], first = path[0], base = this.rng.next() * Math.PI,
                spread = e.shape === 'creeper' ? .034 : .34;
            this.spark(e.position, [first[0] * .5, first[1] * .5, 0], e);
            for (let plane = 0; plane < 3; plane++) {
                const angle = base + plane * Math.PI * spread;
                let last = first;
                for (const next of path.slice(1)) {
                    for (let t = .25; t <= 1; t += .25) {
                        const x = (last[0] + (next[0] - last[0]) * t) * .5,
                            y = (last[1] + (next[1] - last[1]) * t) * .5;
                        for (const sign of [-1, 1]) this.spark(e.position, [x * Math.cos(angle) * sign, y, x * Math.sin(angle) * sign], e);
                    }
                    last = next;
                }
            }
        }
        const flash: Spark = {
            id: ++this.id,
            p: [...e.position],
            previous: [...e.position],
            v: [0, 0, 0],
            age: 0,
            life: 4,
            size: 0,
            color: rgb(e.colors[0] ?? 1973019),
            alpha: .6,
            trail: false,
            twinkle: false,
            child: false,
            flash: true
        };
        this.particles.push(flash);
        this.bursts.push({tick: this.tick, shape: e.shape, count: this.spawned - before});
        this.peak = Math.max(this.peak, this.particles.length);
    }

    /** Advance one 50 ms tick, retaining old positions for interpolated camera-facing quads.
     * World collision/bounce is intentionally outside this free-air trajectory probe.
     */
    step(): void {
        const old = [...this.particles];
        this.particles = [];
        for (const p of old) {
            p.previous = [...p.p];
            if (p.age++ >= p.life) continue;
            if (!p.flash) {
                p.v[1] -= .04 * .1;
                for (let i = 0; i < 3; i++) {
                    p.p[i] += p.v[i];
                    p.v[i] *= .91;
                }
                if (p.age > Math.floor(p.life / 2)) {
                    p.alpha = 1 - (p.age - Math.floor(p.life / 2)) / p.life;
                    if (p.fade) for (let i = 0; i < 3; i++) p.color[i] += (p.fade[i] - p.color[i]) * .2;
                }
            }
            this.particles.push(p);
            if (p.trail && p.age < Math.floor(p.life / 2) && (p.age + p.life) % 2 === 0) {
                const e: Explosion = {
                    shape: 'small_ball',
                    tick: 0,
                    position: p.p,
                    velocity: [0, 0, 0],
                    trail: false,
                    twinkle: p.twinkle,
                    colors: [0],
                    fade: []
                };
                const child = this.spark(p.p, [0, 0, 0], e);
                child.age = Math.floor(child.life / 2);
                child.child = true;
                child.color = [...p.color];
                this.children++;
            }
        }
        for (const e of this.plan) if (e.tick === this.tick) this.explode(e);
        this.peak = Math.max(this.peak, this.particles.length);
        this.tick++;
    }

    /** Run an exact fixed-time target without dropping ticks or depending on the display frame rate.
     * @param {number} seconds Simulation elapsed seconds.
     */
    advance(seconds: number): void {
        const target = Math.floor((seconds + 1e-9) * 20);
        while (this.tick <= target) this.step();
    }

    /** Report completion after every scheduled explosion and all children expire.
     * @return {boolean} Whether the finite plan has completely ended.
     */
    done(): boolean {
        return this.tick > Math.max(...this.plan.map(e => e.tick)) && this.particles.length === 0;
    }
}
