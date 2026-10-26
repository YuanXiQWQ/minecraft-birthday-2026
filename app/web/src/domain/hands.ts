/** Java interaction hands address real carriers without swapping the selected hotbar slot. */
import type {PlayerLayout,SlotRef} from './inventory.ts';
import type {Stack} from '../rules/types.ts';

export type InteractionHand = 'mainhand' | 'offhand';

/** Resolve a validated interaction hand to its finite inventory slot.
 * @param {PlayerLayout} player Current carriers.
 * @param {InteractionHand} hand Used hand; omitted commands retain main-hand semantics.
 * @return {SlotRef} Authoritative carrier reference.
 */
export function handSlot(player:PlayerLayout,hand:InteractionHand='mainhand'):SlotRef {
    if(hand!=='mainhand'&&hand!=='offhand')throw Error('invalid-interaction-hand');
    return hand==='offhand'?'equipment:offhand':`hotbar:${player.selected}`;
}

/** Read the actual stack in an interaction hand.
 * @param {PlayerLayout} player Current carriers.
 * @param {InteractionHand} hand Used hand.
 * @return {Stack|null} Held stack.
 */
export function handStack(player:PlayerLayout,hand:InteractionHand='mainhand'):Stack|null {
    handSlot(player,hand);
    return hand==='offhand'?player.equipment.offhand:player.hotbar[player.selected];
}

/** Replace only the carrier that performed the action.
 * @param {PlayerLayout} player Mutable transaction carriers.
 * @param {InteractionHand} hand Used hand.
 * @param {Stack|null} stack Converted, depleted or damaged stack.
 */
export function setHandStack(player:PlayerLayout,hand:InteractionHand='mainhand',stack:Stack|null):void {
    handSlot(player,hand);
    if(hand==='offhand')player.equipment.offhand=stack;else player.hotbar[player.selected]=stack;
}
