/** Browser ports coordinate every write with Web Locks and reconcile storage, visibility and restored-page events. */
import {SAVE_KEY, LOCK_NAME, SaveSession} from './session.ts';
import type {LockPort, StoragePort} from './session.ts';

/** Create a browser session with explicit unsupported-capability behavior and removable lifecycle listeners.
 * @return {{session:SaveSession,dispose:()=>void}} Formal persistence and cleanup ownership.
 */
export function browserSession(): { session: SaveSession; dispose: () => void } {
    const storage: StoragePort = {
        /** Read only this namespace, translating storage policy failures into a stable UI key.
         * @param {string} key Project key.
         * @return {string|null} Original durable bytes.
         */
        getItem(key) {
            try {
                return localStorage.getItem(key);
            } catch {
                throw new Error('storage-unavailable');
            }
        },
        /** Write one complete validated envelope atomically at the native storage-key level.
         * @param {string} key Project key.
         * @param {string} value Sealed value.
         */
        setItem(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch {
                throw new Error('write-failed');
            }
        }
    };
    const locks: LockPort | null = navigator.locks ? {
        /** Bound waiting time without stealing another writer's lock or using revision as a compare-and-swap.
         * @param {Function} work Transaction callback.
         * @return {Promise<T>} Result after exclusive ownership is released.
         */
        async exclusive<T>(work: () => Promise<T>): Promise<T> {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
            try {
                return await navigator.locks.request(LOCK_NAME, {mode: 'exclusive', signal: controller.signal}, work);
            } catch (error) {
                if (controller.signal.aborted) throw new Error('lock-busy');
                throw error;
            } finally {
                clearTimeout(timer);
            }
        }
    } : null;
    const session = new SaveSession(storage, locks);
    const storageChanged = (event: StorageEvent) => {
        if (event.key === SAVE_KEY || event.key === null) void session.refresh();
    };
    const show = () => {
        void session.resume();
    }, hide = () => session.suspend(), focus = () => {
        void session.refresh();
    }, visibility = () => {
        if (!document.hidden) void session.refresh();
    };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('pageshow', show);
    window.addEventListener('pagehide', hide);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return {
        session,
        /** Dispose the document's listeners without writing any last-known snapshot. */
        dispose() {
            session.dispose();
            window.removeEventListener('storage', storageChanged);
            window.removeEventListener('pageshow', show);
            window.removeEventListener('pagehide', hide);
            window.removeEventListener('focus', focus);
            document.removeEventListener('visibilitychange', visibility);
        }
    };
}
