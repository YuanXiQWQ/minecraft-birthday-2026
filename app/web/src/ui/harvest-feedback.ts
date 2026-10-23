/** Harvest chat reports capacity shortfalls while normal pickup stays silent. */
import {FAILURE_COLOR} from './system-feedback.ts';
import type {DomainEvent} from '../domain/types.ts';
import {itemName} from '../i18n/items.ts';
import type {TextRun} from './item-style.ts';

/** Format only capacity shortfalls; committed pickup quantities remain in domain receipts.
 * @param {DomainEvent} event Commit-only quantity receipt.
 * @param {Function} text Localized message lookup.
 * @return {TextRun[][]} Capacity-warning lines without ordinary pickup notifications.
 */
export function harvestFeedback(event: DomainEvent, text: (key: string, values: Record<string, string | number>) => string): TextRun[][] {
    if (event.type !== 'items-acquired') return [];
    return [
        ...(event.overflow ?? []).map(stack => [{text: text('game.harvestOverflow', {count: stack.count, item: itemName(stack.id)}), color: FAILURE_COLOR}])
    ];
}
