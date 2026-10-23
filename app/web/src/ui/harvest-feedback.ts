/** Harvest chat distinguishes actual carrier delivery from permanently acquired but uncarried loot. */
import type {DomainEvent} from '../domain/types.ts';
import {itemName} from '../i18n/items.ts';
import {itemColor} from './item-style.ts';
import type {TextRun} from './item-style.ts';

/** Format committed physical pickup and capacity feedback without calling overflow an inventory deposit.
 * @param {DomainEvent} event Commit-only quantity receipt.
 * @param {Function} text Localized message lookup.
 * @return {TextRun[][]} Separate chat lines preserving native item name colors.
 */
export function harvestFeedback(event: DomainEvent, text: (key: string, values: Record<string, string | number>) => string): TextRun[][] {
    if (event.type !== 'items-acquired') return [];
    return [
        ...(event.deposited ?? []).map(stack => [{text: '+' + stack.count + ' '}, {text: itemName(stack.id), color: itemColor(stack.id)}]),
        ...(event.overflow ?? []).map(stack => [{text: text('game.harvestOverflow', {count: stack.count, item: itemName(stack.id)})}])
    ];
}
