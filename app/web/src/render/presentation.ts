/** Authored foundation-room dimensions are presentation inputs, not the P7 four-scene layout or build-region specification. */
export interface PresentationSpec {
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
    height: number;
    eye: number;
    homeZ: number;
    gameZ: number;
    targetY: number;
    tabletopY: number;
    cakeY: number;
}

/** A wide real block room and full-size native slab/post prefab preserve frontal perspective and cake contact. */
export const PRESENTATION: Readonly<PresentationSpec> = Object.freeze({
    xMin: -24,
    xMax: 24,
    zMin: -24,
    zMax: 12,
    height: 10,
    eye: 1.62,
    homeZ: 4,
    gameZ: 4.4,
    targetY: 1.3,
    tabletopY: .75,
    cakeY: 1.25
});
