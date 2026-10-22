/** Per-field settings drafts isolate live edits from progress snapshots and asynchronous save acknowledgements. */
import type {Settings} from '../domain/types.ts';

export type SettingKey = keyof Settings;

export interface SettingDraft {
    value: Settings[SettingKey];
    ticket: object;
    phase: 'editing' | 'saving';
}

/** Own only transient edits; authoritative settings always arrive from the shared save session. */
export class SettingsEdits {
    authority: Settings | null = null;
    generation = '';
    drafts = new Map<SettingKey, SettingDraft>();

    /** Accept a valid snapshot; a reset invalidates every old draft and pending receipt.
     * @param {Settings} settings Latest committed preferences.
     * @param {string} generation Durable reset epoch.
     */
    sync(settings: Settings, generation: string): void {
        if (this.generation !== generation) {
            this.cancel();
            this.generation = generation;
        }
        this.authority = structuredClone(settings);
    }

    /** Stage one local field without changing durable settings or another field's draft.
     * @param {K} key Preference identity.
     * @param {Settings[K]} value Current control value.
     */
    stage<K extends SettingKey>(key: K, value: Settings[K]): void {
        this.drafts.set(key, {value, ticket: {}, phase: 'editing'});
    }

    /** Mark the current edit as submitted, retaining its display until that receipt resolves.
     * @param {SettingKey} key Preference identity.
     * @return {SettingDraft|null} Ticket and immutable submitted value, or no active edit.
     */
    submit(key: SettingKey): SettingDraft | null {
        const draft = this.drafts.get(key);
        if (!draft || draft.phase !== 'editing') return null;
        draft.phase = 'saving';
        return {...draft};
    }

    /** Release only the matching receipt; older acknowledgements cannot erase a newer gesture.
     * @param {SettingKey} key Preference identity.
     * @param {object} ticket Submitted edit identity.
     * @return {boolean} Whether this receipt still owns that field.
     */
    finish(key: SettingKey, ticket: object): boolean {
        if (this.drafts.get(key)?.ticket !== ticket) return false;
        this.drafts.delete(key);
        return true;
    }

    /** Project each draft over the latest authoritative state without committing it.
     * @return {Settings|null} Current control values, or no initial save yet.
     */
    view(): Settings | null {
        if (!this.authority) return null;
        const value = structuredClone(this.authority);
        for (const [key, draft] of this.drafts) Object.assign(value, {[key]: draft.value});
        return value;
    }

    /** Cancel unfinished gestures on focus/cancel boundaries while retaining already submitted receipt ownership. */
    cancelEditing(): void {
        for (const [key, draft] of this.drafts) if (draft.phase === 'editing') this.drafts.delete(key);
    }

    /** Discard all page-owned drafts at close, reset, navigation or re-entry; submitted durable writes are not rolled back. */
    cancel(): void {
        this.drafts.clear();
    }
}
