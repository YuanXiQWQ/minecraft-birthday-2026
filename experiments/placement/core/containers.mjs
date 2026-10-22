/** Shared finite carriers and side-aware ports for the isolated A/B experiment. */
import {ITEMS, recipeFor} from './definitions.mjs';

/** Validate a sample finite stack, independently of permanent unlock state.
 * @param {object|null} stack Temporary stack.
 * @return {boolean} Whether the stack is valid.
 */
export function validStack(stack) {
  return stack === null || (stack && Object.hasOwn(ITEMS, stack.item)
      && Number.isInteger(stack.count) && stack.count > 0 && stack.count <= ITEMS[stack.item].max);
}

/** Calculate capacity before modifying either participant in a transfer.
 * @param {object|null} target Target stack.
 * @param {object} source Source stack.
 * @return {number} Available item count.
 */
export function capacity(target, source) {
  return target && target.item !== source.item ? 0 : ITEMS[source.item].max - (target?.count ?? 0);
}

/** Return slots exposed through a device face, using the P1 static evidence.
 * @param {object} entity Device instance.
 * @param {string} face Incoming or extraction face.
 * @return {number[]} Ordered exposed slots.
 */
export function faceSlots(entity, face) {
  if (entity.type === 'hopper') return [0, 1, 2, 3, 4];
  if (entity.type === 'crafting_table') return [];
  return face === 'up' ? [0] : face === 'down' ? [2, 1] : [1];
}

/** Distinguish slot acceptance from whether the input can actually cook.
 * @param {object} entity Target device.
 * @param {number} slot Target slot.
 * @param {object} stack Proposed stack.
 * @return {boolean} Whether insertion is permitted.
 */
export function canInsert(entity, slot, stack) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= entity.slots.length) return false;
  if (entity.type === 'hopper' || entity.type === 'crafting_table') return true;
  if (slot === 2) return false;
  if (slot === 0) return true;
  return Boolean(ITEMS[stack.item].fuel)
      || (stack.item === 'bucket' && entity.slots[1]?.item !== 'bucket');
}

/** Enforce the bottom-only restriction for furnace fuel-slot extraction.
 * @param {object} entity Source device.
 * @param {number} slot Source slot.
 * @param {string} face Extraction face.
 * @return {boolean} Whether extraction is allowed.
 */
export function canExtract(entity, slot, face) {
  if (!entity.slots[slot]) return false;
  return !(['furnace', 'blast_furnace'].includes(entity.type) && slot === 1 && face === 'down')
      || ['bucket', 'water_bucket'].includes(entity.slots[slot].item);
}

/** Move finite groups atomically; an insertion failure leaves the source intact.
 * @param {object} source Source device.
 * @param {number} sourceSlot Source slot.
 * @param {object} target Target device.
 * @param {number} targetSlot Target slot.
 * @param {number} requested Maximum number of items.
 * @return {number} Number actually moved.
 */
export function moveFinite(source, sourceSlot, target, targetSlot, requested = 1) {
  if (source === target && sourceSlot === targetSlot) return 0;
  const stack = source.slots[sourceSlot];
  if (!stack || !canInsert(target, targetSlot, stack)) return 0;
  const amount = Math.min(stack.count, capacity(target.slots[targetSlot], stack), requested);
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  target.slots[targetSlot] = {item: stack.item, count: (target.slots[targetSlot]?.count ?? 0) + amount};
  stack.count -= amount;
  if (!stack.count) source.slots[sourceSlot] = null;
  return amount;
}

/** Choose the original-style input-before-fuel route for a finite cursor group.
 * @param {object} entity Target device.
 * @param {object} stack Cursor stack.
 * @return {number[]} Preferred slots, without fallback when the preferred slot is full.
 */
export function quickRoute(entity, stack) {
  if (entity.type === 'hopper' || entity.type === 'crafting_table') return entity.slots.map((_, i) => i);
  const probe = {...entity, slots: [stack, null, null]};
  if (recipeFor(probe)) return [0];
  return ITEMS[stack.item].fuel ? [1] : [];
}
