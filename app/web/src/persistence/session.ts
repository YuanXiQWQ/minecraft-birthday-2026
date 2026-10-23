/** Cooperative cross-page transactions use a real exclusive lock, reset epochs and lifecycle fencing. */
import type {CommandFeedback} from '../domain/console.ts';
import {timing} from '../performance.ts';
import type {FurnaceTake} from '../domain/furnace.ts';
import {freeze, initialState, resetState, transition} from '../domain/state.ts';
import type {Command, DomainEvent, PlacementPolicy, WorkbenchContext} from '../domain/types.ts';
import type {InventoryState, InventoryCommand, PlayerLayout} from '../domain/inventory.ts';
import type {CraftReceipt, CraftTake} from '../domain/crafting.ts';
import type {Rules, Stack} from '../rules/types.ts';
import {decode, seal, token} from './codec.ts';
import type {Envelope} from './codec.ts';

/** This project namespace is shared by both base paths and never overlaps P2 or other Pages repositories. */
export const SAVE_KEY = 'minecraft-birthday-2026:formal:save';
/** Every conforming page uses this same short-lived transaction lock; revision alone is never a lock. */
export const LOCK_NAME = SAVE_KEY + ':transaction';

export interface StoragePort {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

export interface LockPort {
    exclusive: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface Snapshot {
    status: string;
    envelope: Envelope | null;
    migrated: boolean;
    writable: boolean;
}

/** Rejected input does not invalidate an otherwise valid durable session. */
export class CommandRejected extends Error {
}

/** Own immutable durable snapshots; no renderer, notification replay or natural-resource state is serialized. */
export class SaveSession {
    /** Bounded real synchronous tick-work samples; awaiting a shared lock is excluded. */
    tickSamples:{ticks:number;ms:number}[]=[];
    rules?: Rules;
    storage: StoragePort;
    locks: LockPort | null;
    policy?: PlacementPolicy;
    view: Snapshot = freeze({status: 'loading', envelope: null, migrated: false, writable: false});
    listeners = new Set<(snapshot: Snapshot) => void>();
    eventListeners = new Set<(events: DomainEvent[]) => void>();
    serial = 0;
    suspended = false;
    disposed = false;

    /** Bind injected persistence/coordinator ports for deterministic failures and real browser transactions.
     * @param {StoragePort} storage Single project storage key adapter.
     * @param {LockPort|null} locks Exclusive coordinator, or explicit read-only capability absence.
     * @param {PlacementPolicy} policy Future authored build regions; no region is approved by default.
     */
    constructor(storage: StoragePort, locks: LockPort | null, policy?: PlacementPolicy) {
        this.storage = storage;
        this.locks = locks;
        this.policy = policy;
    }

    /** Subscribe to facts without replaying first-acquisition events.
     * @param {Function} listener Snapshot consumer.
     * @return {Function} Subscription cleanup.
     */
    subscribe(listener: (snapshot: Snapshot) => void): () => void {
        this.listeners.add(listener);
        listener(this.view);
        return () => this.listeners.delete(listener);
    }

    /** Publish immutable, bounded state changes separately from domain events.
     * @param {Snapshot} value New observable snapshot.
     */
    publish(value: Snapshot): void {
        const end = timing('ui-projection');
        try {
            if(this.view.envelope?.generation!==value.envelope?.generation)this.tickSamples.length=0;
            this.view = freeze(value);
            for (const listener of this.listeners) listener(this.view);
        } finally {
            end();
        }
    }

    /** Preserve any last known valid value while exposing an explicit failure and disabling writes.
     * @param {unknown} error Stable diagnostic error.
     */
    fail(error: unknown): void {
        this.publish({
            ...this.view,
            status: error instanceof Error ? error.message : 'storage-unavailable',
            writable: false
        });
    }

    /** Re-read under the coordinator; initialize missing storage and atomically persist the additive advancement synchronization without replaying events.
     * @return {Promise<void>} Snapshot refresh completion.
     */
    async refresh(): Promise<void> {
        if (this.disposed || this.suspended) return;
        const serial = this.serial;
        const work = async () => {
            const raw = this.storage.getItem(SAVE_KEY);
            let value;
            if (raw === null) {
                if (!this.locks) {
                    this.publish({status: 'lock-unavailable', envelope: null, migrated: false, writable: false});
                    return;
                }
                const envelope = await seal(initialState(), crypto.randomUUID(), 0);
                if (serial !== this.serial || this.disposed || this.suspended) return;
                this.storage.setItem(SAVE_KEY, JSON.stringify(envelope));
                value = {envelope, migrated: false};
            } else {
                const decoded=await decode(raw);
                value={envelope:decoded.envelope,migrated:decoded.migrated};
                if(decoded.advancementMigration&&this.locks){
                    const envelope=await seal(decoded.envelope.state,decoded.envelope.generation,decoded.envelope.revision+1);
                    if(serial!==this.serial||this.disposed||this.suspended)return;
                    this.storage.setItem(SAVE_KEY,JSON.stringify(envelope));
                    value={envelope,migrated:true};
                }
            }
            if (serial !== this.serial || this.disposed || this.suspended) return;
            this.publish({...value, status: this.locks ? 'ready' : 'lock-unavailable', writable: !!this.locks});
        };
        try {
            if (this.locks) await this.locks.exclusive(work); else await work();
        } catch (error) {
            if (serial === this.serial && !this.disposed) this.fail(error);
        }
    }

    /** Serialize a command against the latest value and fence any reset or suspended-page action.
     * @param {Command} command Semantic domain operation.
     * @return {Promise<DomainEvent[]>} Only newly committed transient events; none are replayed on refresh.
     */
    async dispatch(command: Command): Promise<DomainEvent[]> {
        return (await this.transact(command)).events;
    }

    /** Commit a slot intent under the shared lock; a changed carrier layout rejects rather than duplicating a pickup.
     * @param {InventoryCommand} intent Bounded slot operation.
     * @param {Stack|null} cursor Page-owned carried stack.
     * @param {PlayerLayout} expected Layout observed before the operation.
     * @param {(Stack|null)[]} crafting Optional page-owned personal input grid, never serialized.
     * @param {WorkbenchContext} workbench Observed instance contents, verified under the lock.
     * @return {Promise<InventoryState>} Committed layout and resulting page-local carriers.
     */
    async editInventory(intent: InventoryCommand, cursor: Stack | null, expected: PlayerLayout, crafting?: (Stack | null)[], workbench?: WorkbenchContext): Promise<InventoryState> {
        const result = await this.transact({type: 'inventory', intent, cursor, expected, crafting, workbench});
        return result.inventory!;
    }

    /** Acquire complete native recipe batches and publish only successfully saved acquisition facts.
     * @param {CraftTake} take Result operation.
     * @param {Stack|null} cursor Page-owned carried group.
     * @param {(Stack|null)[]} crafting Personal inputs, independent of durable workbench inputs.
     * @param {PlayerLayout} expected Observed stable layout.
     * @param {WorkbenchContext} workbench Optional observed real instance.
     * @return {Promise<CraftReceipt>} Successfully committed acquisition receipt.
     */
    async takeCraft(take: CraftTake, cursor: Stack | null, crafting: (Stack | null)[], expected: PlayerLayout, workbench?: WorkbenchContext): Promise<CraftReceipt> {
        const result = await this.transact({type: 'craft-take', take, cursor, crafting, expected, workbench});
        return result.receipt!;
    }

    /** Fill native inputs without acquiring a result, using the same shared transaction and lifecycle fences.
     * @param {string} recipe Discovered native recipe ID.
     * @param {boolean} max Bounded Shift fill.
     * @param {Stack|null} cursor Unchanged page-owned cursor.
     * @param {(Stack|null)[]} crafting Personal input precondition.
     * @param {PlayerLayout} expected Stable layout precondition.
     * @param {WorkbenchContext} workbench Optional observed instance.
     * @return {Promise<InventoryState>} Committed carrier projection.
     */
    async fillRecipe(recipe: string, max: boolean, cursor: Stack | null, crafting: (Stack | null)[], expected: PlayerLayout, workbench?: WorkbenchContext): Promise<InventoryState> {
        return (await this.transact({
            type: 'book-fill',
            recipe,
            max,
            cursor,
            crafting,
            expected,
            workbench
        })).inventory!;
    }

    /** Acquire finite machine output under the same transaction and lifecycle fences as crafting.
     * @param {FurnaceTake} take Finite destination operation.
     * @param {Stack|null} cursor Carried group.
     * @param {PlayerLayout} expected Observed player layout.
     * @param {WorkbenchContext} workbench Observed live device output.
     * @return {Promise<CraftReceipt>} Committed receipt, never a regenerated preview.
     */
    async takeOutput(take: FurnaceTake, cursor: Stack | null, expected: PlayerLayout, workbench: WorkbenchContext): Promise<CraftReceipt> {
        return (await this.transact({type: 'furnace-take', take, cursor, expected, workbench})).receipt!;
    }

    /** Execute semantic work against freshly locked facts and preserve failed-write presentation.
     * @param {Command} command Domain intent with optional carrier precondition.
     * @param {Function} eligible Optional active-clock ownership fence checked inside the transaction.
     * @return {Promise<{events:DomainEvent[],inventory?:InventoryState,receipt?:CraftReceipt;transferred?:number}>} Committed events and optional ephemeral carrier result.
     */
    async transact(command: Command, eligible?: () => boolean): Promise<{
        events: DomainEvent[];
        inventory?: InventoryState;
        receipt?: CraftReceipt;
        transferred?: number;
        console?:CommandFeedback[]
    }> {
        const epoch = this.view.envelope?.generation, serial = this.serial;
        if (!this.locks || !this.view.writable || !epoch || this.disposed || this.suspended) throw new Error('save-read-only');
        const lockWait = timing('lock-wait');
        try {
            return await this.locks.exclusive(async () => {
                lockWait();
                if (eligible && !eligible()) throw new CommandRejected('processing-inactive');
                const raw = this.storage.getItem(SAVE_KEY);
                if (!raw) throw new Error('stale-session');
                const endDecode = timing('decode-validate');
                let decoded;
                try {
                    decoded = await decode(raw);
                } finally {
                    endDecode();
                }
                const current = decoded.envelope;
                if (current.generation !== epoch) throw new Error('stale-session');
                if (serial !== this.serial || this.disposed || this.suspended) throw new Error('session-restored');
                let result, simulationMs=0;
                const cpuStart=performance.now();
                const endSimulation = timing(command.type === 'processing-tick' ? 'tick-simulation:' + command.ticks : 'command:' + command.type);
                try {
                    result = transition(current.state, command, this.policy, this.rules);
                } catch (error) {
                    this.publish({status: 'ready', envelope: current, migrated: decoded.migrated, writable: true});
                    throw new CommandRejected(error instanceof Error ? error.message : 'invalid-command');
                } finally {
                    endSimulation();
                    simulationMs=performance.now()-cpuStart;
                }
                if (JSON.stringify(result.state) === JSON.stringify(current.state)) {
                    this.publish({status: 'ready', envelope: current, migrated: decoded.migrated, writable: true});
                    return {
                        events: result.events,
                        inventory: result.inventory,
                        receipt: result.receipt,
                        transferred: result.transferred,
                        console: result.console
                    };
                }
                const endSeal = timing('seal-serialize');
                let next;
                try {
                    next = await seal(result.state, epoch, current.revision + 1);
                } finally {
                    endSeal();
                }
                if (eligible && !eligible()) throw new CommandRejected('processing-inactive');
                if (serial !== this.serial || this.disposed || this.suspended) throw new Error('session-restored');
                const endStore = timing('storage-write');
                try {
                    this.storage.setItem(SAVE_KEY, JSON.stringify(next));
                } catch {
                    throw new Error('write-failed');
                } finally {
                    endStore();
                }
                this.publish({status: 'ready', envelope: next, migrated: false, writable: true});
                for (const listener of this.eventListeners) listener(result.events);
                if(command.type==='processing-tick'&&result.state.progress.world.tick>current.state.progress.world.tick){this.tickSamples.push({ticks:result.state.progress.world.tick-current.state.progress.world.tick,ms:simulationMs});if(this.tickSamples.length>100)this.tickSamples.shift();}
                return {
                    events: result.events,
                    inventory: result.inventory,
                    receipt: result.receipt,
                    transferred: result.transferred,
                    console: result.console
                };
            });
        } catch (error) {
            if (!(error instanceof CommandRejected) && serial === this.serial && this.view.envelope?.generation === epoch && !this.disposed && !this.suspended) this.fail(error);
            throw error;
        }
    }

    /** Reset valid progress under the same lock, requiring the confirmed progress scope and retaining the latest settings.
     * @param {string} confirmation Progress-scope token captured when confirmation opened.
     * @param {number} confirmationSerial Optional issuing-page lifecycle fence.
     * @return {Promise<void>} Durable new epoch and empty progress.
     */
    async reset(confirmation: string, confirmationSerial = this.serial): Promise<void> {
        const serial = this.serial;
        if (!this.locks || !this.view.writable || this.disposed || this.suspended) throw new Error('save-read-only');
        try {
            if (confirmationSerial !== serial) throw new CommandRejected('confirmation-stale');
            await this.locks.exclusive(async () => {
                if (serial !== this.serial || this.disposed || this.suspended) throw new CommandRejected('confirmation-stale');
                const raw = this.storage.getItem(SAVE_KEY);
                if (!raw) throw new Error('stale-session');
                const current = (await decode(raw)).envelope;
                if (token(current) !== confirmation) {
                    this.publish({status: 'ready', envelope: current, migrated: false, writable: true});
                    throw new CommandRejected('confirmation-stale');
                }
                const next = await seal(resetState(current.state.settings), crypto.randomUUID(), 0);
                if (serial !== this.serial || this.disposed || this.suspended) throw new CommandRejected('confirmation-stale');
                const endStore = timing('storage-write');
                try {
                    this.storage.setItem(SAVE_KEY, JSON.stringify(next));
                } catch {
                    throw new Error('write-failed');
                } finally {
                    endStore();
                }
                this.publish({status: 'ready', envelope: next, migrated: false, writable: true});
            });
        } catch (error) {
            if (!(error instanceof CommandRejected)) this.fail(error);
            throw error;
        }
    }

    /** Fence queued work before page suspension; no pagehide autosave can restore stale progress. */
    suspend(): void {
        this.serial++;
        this.suspended = true;
    }

    /** Reconcile a restored page before accepting another command.
     * @return {Promise<void>} Latest durable view.
     */
    async resume(): Promise<void> {
        this.serial++;
        this.suspended = false;
        this.publish({...this.view, writable: false, status: 'loading'});
        await this.refresh();
    }

    /** Invalidate queued work and release consumers when the owning document is discarded. */
    dispose(): void {
        this.disposed = true;
        this.serial++;
        this.listeners.clear();
        this.eventListeners.clear();
    }
}
