/** Localized author messages enter ordinary chat after a game document becomes ready. */
import type {GameChat} from './chat.ts';

/** Each key is one complete author message, in the author's requested reading order. */
const WELCOME_KEYS = [
    'chat.welcome.materials',
    'chat.welcome.recipes',
    'chat.welcome.features',
    'chat.welcome.commands',
    'chat.welcome.catalogue',
    'chat.welcome.shortcuts',
    'chat.welcome.chat',
    'chat.welcome.scenes'
] as const;

/** Schedule author chat three seconds after readiness, then five seconds after each delivered message.
 * System chat uses its own immediate path. Chained timers never burst overdue messages after a suspended tab.
 * @param {GameChat} chat Current game document's chat.
 * @param {Function} text Lookup using the committed language and birthday names.
 * @param {AbortSignal} signal Document lifetime, including abandoned initialization.
 * @return {Function} Cancel any remaining messages without removing delivered history.
 */
export function scheduleAuthorWelcome(chat: Pick<GameChat, 'append'>, text: (key: string) => string, signal: AbortSignal): () => void {
    let index = 0, stopped = false, timer: ReturnType<typeof setTimeout>;
    /** Cancel pending delivery and detach the document listener. */
    function cancel(): void {
        stopped = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
    }
    /** Resolve the current language at delivery and schedule only the next unread message. */
    function deliver(): void {
        if (stopped || signal.aborted) return;
        chat.append([{text: text(WELCOME_KEYS[index++])}], 'author');
        if (index < WELCOME_KEYS.length && !stopped && !signal.aborted) timer = setTimeout(deliver, 5000);
        else cancel();
    }
    if (!signal.aborted) {
        signal.addEventListener('abort', cancel, {once: true});
        timer = setTimeout(deliver, 3000);
    }
    return cancel;
}
