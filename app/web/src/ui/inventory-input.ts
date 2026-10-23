/** Screen-space keyboard and pointer ownership, including staged quick-craft and browser shortcut boundaries. */
import type {GameInventory, Slot} from './inventory.ts';
import type {SlotRef} from '../domain/inventory.ts';
import type {Stack} from '../rules/types.ts';
import {OutsideClick, outsideMenu} from './outside-click.ts';
import {cell} from '../domain/inventory.ts';
import {capacity, sameStack} from '../domain/slots.ts';
import {SlotGesture} from './slot-gesture.ts';
import {inventoryKey, directory} from './inventory-state.ts';

/** Resolve a finite logical reference without giving catalogue entries finite inventory semantics.
 * @param {Slot|null} slot GUI cell.
 * @return {SlotRef|null} Finite identity or null.
 */
export function slotRef(slot: Slot | null): SlotRef | null {
    return slot?.kind === 'backpack' ? `backpack:${slot.index!}` : slot?.kind === 'hopper' ? `hopper:${slot.index!}` : slot?.kind === 'machine' ? `machine:${slot.index!}` : slot?.kind === 'workbench' ? `workbench:${slot.index!}` : slot?.kind === 'crafting' ? `crafting:${slot.index!}` : slot?.kind === 'hotbar' ? `hotbar:${slot.index!}` : slot?.kind === 'equipment' ? `equipment:${slot.equipment!}` : null;
}

/** Keep GUI drag ownership separate from world look and from asynchronous durable commits. */
export class InventoryInput {
    gesture = new SlotGesture();
    outside = new OutsideClick();
    keys = new Set<string>();
    abort = new AbortController();
    start: Slot | null = null;
    quickMatch: Stack | null = null;

    /** Bind one screen's listeners; no document-wide context menu or browser shortcut suppression is installed.
     * @param {GameInventory} ui Owning formal screen.
     */
    constructor(public ui: GameInventory) {
        const opt = {signal: this.abort.signal};
        document.addEventListener('keydown', e => this.key(e), {...opt, capture: true});
        document.addEventListener('keyup', e => this.keys.delete(e.code), {...opt, capture: true});
        window.addEventListener('wheel', e => this.wheel(e), {...opt, capture: true, passive: false});
        ui.panel.addEventListener('pointerdown', e => this.down(e), opt);
        ui.panel.addEventListener('pointermove', e => this.move(e), opt);
        ui.panel.addEventListener('pointerup', e => this.up(e), opt);
        ui.modal.addEventListener('pointerdown', e => {
            if (ui.carrierBusy()) {
                e.preventDefault();
                this.cancelGesture();
                return;
            }
            if (!ui.modal.open || !ui.writable || !ui.value.cursor) return;
            this.outside.begin(e.pointerId, e.button, e.clientX, e.clientY, this.isOutside(e.clientX, e.clientY));
            if (this.outside.active) {
                e.preventDefault();
                ui.modal.setPointerCapture(e.pointerId);
            }
        }, opt);
        ui.modal.addEventListener('pointermove', e => this.outside.move(e.pointerId, e.clientX, e.clientY, e.buttons), opt);
        ui.modal.addEventListener('pointerup', e => {
            if (ui.carrierBusy()) {
                e.preventDefault();
                this.cancelGesture();
                return;
            }
            const all = this.outside.end(e.pointerId, e.button, this.isOutside(e.clientX, e.clientY));
            if (all !== null && ui.modal.open) {
                e.preventDefault();
                ui.command({type: 'drop', cursor: true, all});
            }
        }, opt);
        ui.modal.addEventListener('pointercancel', () => this.cancel(), opt);
        ui.modal.addEventListener('lostpointercapture', () => this.outside.cancel(), opt);
        ui.panel.addEventListener('pointercancel', () => this.cancel(), opt);
        ui.panel.addEventListener('lostpointercapture', () => {
            if (this.gesture.active) this.cancel();
        }, opt);
        window.addEventListener('blur', () => this.cancel(), opt);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.cancel();
        }, opt);
    }

    /** Ignore editable widgets and modifier chords reserved for browser/OS functions.
     * @param {EventTarget|null} target Event focus.
     * @return {boolean} Whether text input owns the key.
     */
    editing(target: EventTarget | null): boolean {
        return target instanceof HTMLElement && !!target.closest('input:not([type="range"]),textarea,select,[contenteditable]:not([contenteditable="false"])');
    }

    /** Route creative search numeric hover actions before text capture; other editors retain their own key ownership.
     * @param {KeyboardEvent} e Browser key event.
     */
    key(e: KeyboardEvent): void {
        const u = this.ui;
        if (u.blocked()) return;
        if (e.code === 'Escape' && u.modal.open) {
            e.preventDefault();
            e.stopPropagation();
            this.cancel();
            u.close();
            return;
        }
        const catalogueNumber = e.target === u.search && u.modal.open && u.tab === 'catalogue' && !u.station && !e.isComposing && !e.ctrlKey && !!u.hover && (u.hover.kind === 'source' || !!slotRef(u.hover)) && /^Digit[1-9]$/.test(e.code);
        if (this.editing(e.target) && !catalogueNumber || e.altKey || e.metaKey || e.isComposing) return;
        if (e.ctrlKey && e.code !== 'KeyQ') return;
        if (u.carrierBusy() && e.code !== 'KeyE' && e.code !== 'Escape') {
            if (/^(Digit[1-9]|Key[FQCX])$/.test(e.code)) e.preventDefault();
            this.cancel();
            return;
        }
        if (!e.ctrlKey && (e.code === 'KeyC' || e.code === 'KeyX')) {
            this.keys.add(e.code);
            return;
        }
        const n = /^Digit[1-9]$/.test(e.code) ? Number(e.code.at(-1)) - 1 : null;
        if (n !== null && (this.keys.has('KeyC') || this.keys.has('KeyX'))) {
            e.preventDefault();
            if (!e.repeat) u.command({type: 'preset', index: n, mode: this.keys.has('KeyC') ? 'save' : 'load'});
            return;
        }
        const intent = inventoryKey(e.code, false, e.ctrlKey);
        if (intent === 'inventory') {
            e.preventDefault();
            if (!e.repeat) {
                this.cancel();
                u.modal.open ? u.close() : u.open();
            }
            return;
        }
        if (intent === 'escape' && u.modal.open) {
            e.preventDefault();
            e.stopPropagation();
            this.cancel();
            u.close();
            return;
        }
        if (n !== null && !e.ctrlKey) {
            e.preventDefault();
            if (u.modal.open) {
                if (e.repeat) return;
                this.cancelGesture();
                const s = u.hover, ref = slotRef(s);
                if (s?.kind === 'preview') u.takeResult({
                    mode: 'hotbar',
                    index: n
                }); else if (s?.kind === 'source') u.copySource(s, 'number', n); else if (ref) u.command({
                    type: 'swap',
                    slot: ref,
                    target: `hotbar:${n}`
                });
            } else u.command({type: 'select', index: n});
            return;
        }
        if (e.code === 'KeyF' && !e.ctrlKey) {
            e.preventDefault();
            if (e.repeat) return;
            this.cancelGesture();
            const s = u.hover, ref = slotRef(s);
            if (u.modal.open && s?.kind === 'preview') u.takeResult({mode: 'offhand'}); else if (u.modal.open && s?.kind === 'source') u.copySource(s, 'offhand'); else if (!u.modal.open || ref) u.command({
                type: 'swap',
                slot: ref ?? `hotbar:${u.value.selected}`,
                target: 'equipment:offhand'
            });
            return;
        }
        if (e.code === 'KeyQ') {
            e.preventDefault();
            if (e.repeat) return;
            this.cancelGesture();
            if (!u.modal.open) u.command({type: 'drop', all: e.ctrlKey}); else {
                const ref = slotRef(u.hover);
                if (ref) u.command({type: 'drop', slot: ref, all: e.ctrlKey});
            }
            return;
        }
    }

    /** Route wheel only to the active GUI or world hotbar, preserving text and browser zoom gestures.
     * @param {WheelEvent} e Wheel event.
     */
    wheel(e: WheelEvent): void {
        const u = this.ui;
        if (u.blocked() || e.ctrlKey || e.metaKey || e.altKey || e.deltaY === 0 || this.editing(e.target)) return;
        if (u.carrierBusy()) {
            e.preventDefault();
            this.cancelGesture();
            return;
        }
        if (u.modal.open) {
            e.preventDefault();
            this.cancelGesture();
            if (e.target instanceof HTMLElement && e.target.closest('.recipe-book')) return;
            if (u.tab === 'presets') {
                u.sideOffset = Math.max(0, Math.min(4, u.sideOffset + Math.sign(e.deltaY)));
                u.hover = null;
                u.hideTooltip();
                u.draw();
                return;
            }
            const total = Math.max(0, directory(u.permanent!).length - 18), rows = u.tab === 'catalogue' ? 3 : 1;
            u.sideOffset = Math.max(0, Math.min(Math.max(0, Math.ceil(total / 9) - rows), u.sideOffset + Math.sign(e.deltaY)));
            u.hover = null;
            u.hideTooltip();
            u.draw();
        } else if (e.target instanceof HTMLElement && e.target.closest('.scene-panel,.hotbar')) {
            e.preventDefault();
            u.command({type: 'wheel', direction: e.deltaY});
        }
    }

    /** Find the visible logical slot beneath a captured pointer without relying on the captured event target.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     * @return {Slot|null} Current rendered cell.
     */
    at(x: number, y: number): Slot | null {
        const b = document.elementFromPoint(x, y)?.closest<HTMLElement>('.inventory-slot');
        if (!b || !this.ui.panel.contains(b)) return null;
        return this.ui.slots.find(s => s.kind === b.dataset.kind && (s.item ?? '') === (b.dataset.item ?? '') && String(s.index ?? '') === (b.dataset.index ?? '') && (s.equipment ?? '') === (b.dataset.equipment ?? '') && String(s.preset ?? '') === (b.dataset.preset ?? '') && String(s.presetCell ?? '') === (b.dataset.presetCell ?? '')) ?? null;
    }

    /** Filter drag destinations through the same original slot policy as commit-time validation.
     * @param {Slot|null} slot Hovered slot.
     * @return {SlotRef|null} Legal finite destination.
     */
    eligible(slot: Slot | null): SlotRef | null {
        const ref = slotRef(slot), u = this.ui, c = u.value.cursor;
        if (!ref || !c) return null;
        const s = cell(u.value, ref);
        if (capacity(s, c, u.rules) <= 0 || s.stack && !sameStack(s.stack, c, u.rules)) return null;
        const a = this.gesture.active;
        if (a && a.button !== 1 && !a.slots.has(ref) && a.slots.size >= c.count) return null;
        return ref;
    }

    /** Reject presses during receipt ownership; otherwise stage until a matching release commits the gesture.
     * @param {PointerEvent} e Browser pointer press.
     */
    down(e: PointerEvent): void {
        if (this.ui.carrierBusy()) {
            e.preventDefault();
            this.cancelGesture();
            return;
        }
        if (!this.ui.modal.open || !this.ui.writable || (e.button < 0 || e.button > 2)) return;
        const s = this.at(e.clientX, e.clientY);
        if (!s || s.kind === 'preset-info') return;
        e.preventDefault();
        if (!this.ui.focusCatalogue() && typeof HTMLElement !== 'undefined' && e.target instanceof HTMLElement) e.target.closest<HTMLElement>('.inventory-slot')?.focus({preventScroll: true});
        this.start = s;
        const ref = slotRef(s);
        if (!e.shiftKey) this.quickMatch = null; else if (!this.gesture.last) this.quickMatch = ref ? structuredClone(cell(this.ui.value, ref).stack) : null;
        this.gesture.begin(e.pointerId, e.button as 0 | 1 | 2, s.kind === 'preview' ? 'result' : s.kind === 'source' ? 'source:' + s.item + ':' + s.preset + ':' + s.presetCell : ref!, e.clientX, e.clientY, e.shiftKey, this.eligible(s));
        this.ui.panel.setPointerCapture(e.pointerId);
        this.ui.hideTooltip();
    }

    /** Track unique eligible cells and cancel when leaving the interface bounds.
     * @param {PointerEvent} e Browser pointer move.
     */
    move(e: PointerEvent): void {
        if (this.ui.carrierBusy()) {
            this.cancelGesture();
            return;
        }
        const a = this.gesture.active;
        if (a && e.buttons !== (a.button === 0 ? 1 : a.button === 1 ? 4 : 2)) {
            this.cancel();
            return;
        }
        const r = this.ui.panel.getBoundingClientRect();
        this.gesture.move(e.pointerId, e.clientX, e.clientY, this.eligible(this.at(e.clientX, e.clientY)), e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom);
        this.ui.modal.dataset.drag = String(!!this.gesture.active?.drag);
        if (a) this.ui.draw(false);
    }

    /** Commit only a valid staged gesture outside receipt ownership; canceled presses cannot activate after receipt release.
     * @param {PointerEvent} e Browser release.
     */
    up(e: PointerEvent): void {
        if (this.ui.carrierBusy()) {
            e.preventDefault();
            this.cancelGesture();
            return;
        }
        const u = this.ui, g = this.gesture.end(e.pointerId, e.button, e.timeStamp), s = this.start;
        this.start = null;
        u.modal.dataset.drag = 'false';
        if (!g || !s) return;
        e.preventDefault();
        if (g.drag) {
            if (s.kind === 'preview') return;
            if (u.value.cursor && !g.shift) u.command({
                type: 'drag',
                slots: g.slots,
                mode: g.button === 0 ? 'left' : g.button === 1 ? 'middle' : 'right'
            });
            return;
        }
        const ref = slotRef(s);
        if (g.shift && ref && g.button === 0) {
            u.command(g.double ? {type: 'quick-all', slot: ref, match: this.quickMatch ?? undefined} : {
                type: 'quick',
                slot: ref
            });
            return;
        }
        if (g.double && g.button === 0 && ref && u.value.cursor) {
            u.command({type: 'collect', slot: ref});
            return;
        }
        u.activate(s, g.button, g.shift);
    }

    /** Exclude controls, the full GUI border and any visible tooltip from backdrop discard.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     * @return {boolean} Whether an outside click may own the point.
     */
    isOutside(x: number, y: number): boolean {
        const u = this.ui, areas = [...u.modal.querySelectorAll<HTMLElement>('.inventory-body,.inventory-tabs')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect());
        if (!u.tooltip.hidden) areas.push(u.tooltip.getBoundingClientRect());
        return outsideMenu(x, y, areas);
    }

    /** Cancel uncommitted drag without discarding already committed carriers. */
    cancelGesture(): void {
        const outsidePointer = this.outside.active?.pointer;
        this.outside.cancel();
        if (outsidePointer !== undefined && this.ui.modal.hasPointerCapture(outsidePointer)) this.ui.modal.releasePointerCapture(outsidePointer);
        const pointer = this.gesture.active?.pointer;
        this.gesture.cancel();
        this.start = null;
        if (pointer !== undefined && this.ui.panel.hasPointerCapture(pointer)) this.ui.panel.releasePointerCapture(pointer);
        this.ui.modal.dataset.drag = 'false';
        if (this.ui.modal.open) this.ui.draw(false);
    }

    /** Cancel all GUI gesture/chord state on ownership, focus or lifecycle changes. */
    cancel(): void {
        this.cancelGesture();
        this.quickMatch = null;
        this.keys.clear();
    }

    /** Release every listener and pending gesture when the UI is disposed. */
    dispose(): void {
        this.cancel();
        this.abort.abort();
    }
}
