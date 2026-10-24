/** Fixed homepage framing of the same authored home used by the playable world. */
import type {Cell} from '../domain/types.ts';

export interface PresentationSpec {
    eye: Cell;
    target: Cell;
    back: number;
}

/** Move the fixed viewer closer to the birthday table and omit unseen geometry behind the camera. */
export const PRESENTATION: Readonly<PresentationSpec> = Object.freeze({
    eye: [0, 1.62, 4] as Cell,
    target: [0, 1, -4] as Cell,
    back: 6
});
