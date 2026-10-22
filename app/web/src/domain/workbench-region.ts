/** Minimal P6 carrier-room workbench area; final four-scene regions are authored separately in P7. */
import type {PlacementPolicy} from './types.ts';

/** Keep workbenches on visible room floor, outside the birthday table footprint; only approved device capabilities are enabled. */
export const WORKBENCH_REGION: PlacementPolicy = {
    /** Check only the integration room floor, without declaring P7 resource or soft-lock policies.
     * @param {SceneId} _scene Current carrier scene identity.
     * @param {Station} station Requested workbench.
     * @return {boolean} Whether this carrier area admits the instance.
     */
    allows: (_scene, station) => ['crafting_table', 'furnace', 'blast_furnace', 'hopper'].includes(station.kind) && station.cell[1] === 0 && station.cell[0] >= -4 && station.cell[0] <= 3 && station.cell[2] >= -5 && station.cell[2] <= 2 && !(station.cell[0] >= -2 && station.cell[0] <= 1 && station.cell[2] >= -1 && station.cell[2] <= 0)
};
