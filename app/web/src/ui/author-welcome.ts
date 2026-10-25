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

/** Schedule author chat five seconds after readiness and after each delivered message.
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
        timer = setTimeout(deliver, 5000);
    }
    return cancel;
}

/** Own one welcome sequence per ready save generation, including progress resets in the same document. */
export class AuthorWelcome {
    generation = '';
    started = false;
    cancel: (() => void) | null = null;

    /** Bind delivery to the current chat, committed language lookup and document lifetime.
     * @param {GameChat} chat Author channel destination.
     * @param {Function} text Current localization lookup.
     * @param {AbortSignal} signal Document cancellation boundary.
     */
    constructor(public chat: Pick<GameChat, 'append'>, public text: (key: string) => string, public signal: AbortSignal) {}

    /** Cancel an obsolete queue and start once after the new generation is ready.
     * @param {string} generation Current successfully committed save generation.
     * @param {boolean} ready Whether the game and chat are ready for delivery.
     */
    sync(generation: string, ready: boolean): void {
        if (generation !== this.generation) {
            this.cancel?.();
            this.generation = generation;
            this.started = false;
        }
        if (!generation || !ready || this.started || this.signal.aborted) return;
        this.started = true;
        this.cancel = scheduleAuthorWelcome(this.chat, this.text, this.signal);
    }
}
