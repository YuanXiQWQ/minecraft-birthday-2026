/** Java26.3 CompassAngleState and NeedleDirectionHelper use world bearings and a tick-limited wobbler. */
export interface CompassView {position: readonly number[]; yaw: number; target: readonly number[]; scope: string}
/** Apply Java float arithmetic at the same public property boundaries. */
const f = Math.fround;
/** Wrap a native float rotation into one full turn.
 * @param {number} value Signed turns.
 * @return {number} Positive native float turns.
 */
export function compassModulo(value: number): number {return f(f(f(value) % 1 + 1) % 1);}
/** Retain transient compass inertia, never a hardcoded screen direction or saved inventory fact. */
export class NativeCompass {
    rotation = 0;
    velocity = 0;
    tick = -1;
    scope = '';
    /** Evaluate the same valid-world-target branch as a local player compass.
     * @param {CompassView} view Actual camera/world reference.
     * @param {number} tick Monotonic twenty-Hz UI tick.
     * @return {number} Native compass range-property value.
     */
    angle(view: CompassView, tick: number): number {
        if (this.scope !== view.scope) {this.scope = view.scope; this.rotation = this.velocity = 0; this.tick = -1;}
        const bearing = f(Math.atan2(view.target[2] + .5 - view.position[2], view.target[0] + .5 - view.position[0]) / 6.2831854820251465);
        const yaw = compassModulo(f(f(view.yaw) / 360));
        if (this.tick !== tick) {
            this.tick = tick;
            const target = f(.5 - f(yaw - .25)), delta = f(compassModulo(f(f(target - this.rotation) + .5)) - .5);
            this.velocity = f(f(this.velocity + f(delta * f(.1))) * f(.8));
            this.rotation = compassModulo(f(this.rotation + this.velocity));
        }
        return compassModulo(f(bearing + this.rotation));
    }
}
/** Resolve the original range_dispatch thresholds, including half-frame wrapping.
 * @param {any} definition Original compass item definition.
 * @param {number} angle Native property turns.
 * @return {string} Original selected model identifier.
 */
export function compassModel(definition: any, angle: number): string {
    const range = definition.model.on_false, value = f(angle * range.scale);
    let selected = range.fallback;
    for (const entry of range.entries) if (value >= entry.threshold) selected = entry.model;
    if (!selected || selected.type !== 'minecraft:model') throw Error('native-compass-range');
    return selected.model;
}
