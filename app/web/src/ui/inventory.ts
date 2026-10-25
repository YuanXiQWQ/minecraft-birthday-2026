/** Screen-space native catalogue and hotbar share one temporary command model and never send inventory gestures to Three.js. */
import type {CompassView} from './compass.ts';
import {nativeField} from './native-field.ts';
import {itemColor} from './item-style.ts';
import {matchesItem} from '../i18n/items.ts';
import {RecipeBookView} from './recipe-book.ts';
import type {Command} from '../domain/types.ts';
import {reduceHopperInventory} from '../domain/hopper.ts';
import {reduceFurnaceInventory} from '../domain/furnace.ts';
import type {FurnaceTake, FurnaceKind, FurnaceData} from '../domain/furnace.ts';
import {IconMasks} from './icon-mask.ts';
import {PlayerPreview} from './player-preview.ts';
import {emptyInventory, inventoryCommand, directory, tooltipBox} from './inventory-state.ts';
import type {InventoryState, InventoryCommand, EquipmentSlot} from './inventory-state.ts';
import type {CraftTake, CraftReceipt} from '../domain/crafting.ts';
import type {WorkbenchContext} from '../domain/types.ts';
import type {State} from '../domain/types.ts';
import type {Rules, Stack} from '../rules/types.ts';
import type {PixelUI} from './pixels.ts';
import type {CatalogueArt} from './icons.ts';
import {itemName} from '../i18n/items.ts';
import {alignRaster,rasterSize} from './raster.ts';
import {drawSprite} from './vanilla.ts';
import {personalPreview} from './crafting-preview.ts';
import type {CraftingPreview} from './crafting-preview.ts';
import {InventoryInput} from './inventory-input.ts';
import {layout} from '../domain/inventory.ts';
import {reduceInventory} from '../domain/inventory.ts';
import {PersonalCursor} from '../domain/personal-menu.ts';
import type {PlayerLayout, SlotRef} from '../domain/inventory.ts';

/** One logical slot description has no dependency on screen scaling or scene coordinates. */
export interface Slot {
    kind: 'backpack' | 'source' | 'hotbar' | 'equipment' | 'crafting' | 'preset-info' | 'preview' | 'workbench' | 'machine' | 'hopper';
    preset?: number;
    presetCell?: number;
    x: number;
    y: number;
    index?: number;
    item?: string;
    locked?: boolean;
    equipment?: EquipmentSlot;
}

/** Own formal GUI input listeners, semantic buttons, original pixel canvases and runtime temporary carriers. */
export class GameInventory {
    search: HTMLInputElement;
    viewport?: HTMLElement;
    book: RecipeBookView | null = null;
    bookCommand?: (command: Extract<Command, { type: 'book-settings' | 'book-seen' }>) => Promise<unknown>;
    fill?: (recipe: string, max: boolean, cursor: Stack | null, crafting: (Stack | null)[], expected: PlayerLayout, station?: WorkbenchContext) => Promise<InventoryState>;
    acquireOutput?: (take: FurnaceTake, cursor: Stack | null, expected: PlayerLayout, station: WorkbenchContext) => Promise<CraftReceipt>;
    playerPreview: PlayerPreview | null = null;
    masks = new IconMasks();
    mouse = {x: 0, y: 0};
    acquisition: object | null = null;
    closing: Promise<boolean> | null = null;
    returnWorkbench?: (scene: State['progress']['scene'], id: string) => Promise<unknown>;
    station: WorkbenchContext | null = null;
    notice = '';
    value: InventoryState = {...emptyInventory(), crafting: Array(4).fill(null)};
    presetSignature = '';
    previewSignature = '';
    preview: CraftingPreview = {status: 'empty', result: null};
    permanent: State | null = null;
    writable = false;
    onHudPaint: (() => void) | null = null;
    compassView: () => CompassView | null = () => null;
    generation = '';
    factSignature = '';
    sideOffset = 0;
    tab: 'catalogue' | 'equipment' | 'presets' | 'crafting' = 'catalogue';
    scale = 2;
    slots: Slot[] = [];
    hover: Slot | null = null;
    disposed = false;
    modal: HTMLDialogElement;
    panel: HTMLDivElement;
    scrollbar: HTMLInputElement;
    canvas: HTMLCanvasElement;
    controls: HTMLDivElement;
    hud: HTMLDivElement;
    hudCanvas: HTMLCanvasElement;
    offhandCanvas: HTMLCanvasElement;
    tooltip: HTMLDivElement;
    cursor: HTMLCanvasElement;
    feedback: ((key: string) => void) | null = null;
    input: InventoryInput;
    queue: Promise<void> = Promise.resolve();
    queueEpoch = 0;
    pending = 0;
    personal = new PersonalCursor();
    resize: () => void;
    blur: () => void;
    abort = new AbortController();
    animation = 0;
    caretFrame = -1;

    /** Mount game-only GUI after all original art and rules are ready.
     * @param {HTMLElement} host Formal app root.
     * @param {PixelUI} pixels Shared original font.
     * @param {CatalogueArt} art Verified icons and native GUI sprites.
     * @param {Rules} rules Native stack and equipment rules.
     * @param {Function} text Localized screen text.
     * @param {Function} gate Scene input ownership callback.
     * @param {Function} blocked Whether another screen owns input.
     * @param {Function} commit Locked semantic carrier transaction.
     * @param {Function} acquire Locked complete-batch acquisition transaction.
     */
    constructor(public host: HTMLElement, public pixels: PixelUI, public art: CatalogueArt, public rules: Rules, public text: (key: string, values?: Record<string, string | number>) => string, public gate: (open: boolean) => void, public blocked: () => boolean, public commit: (intent: InventoryCommand, cursor: Stack | null, expected: PlayerLayout, crafting?: (Stack | null)[], workbench?: WorkbenchContext) => Promise<InventoryState>, public acquire?: (take: CraftTake, cursor: Stack | null, crafting: (Stack | null)[], expected: PlayerLayout, workbench?: WorkbenchContext) => Promise<CraftReceipt>) {
        this.modal = document.createElement('dialog');
        this.modal.className = 'inventory-dialog';
        this.modal.setAttribute('aria-label', text('inventory.title'));
        this.modal.id = 'inventory';
        const tabs = document.createElement('nav');
        tabs.className = 'inventory-tabs';
        for (const [tab, item] of [['catalogue', 'minecraft:compass'], ['crafting', 'minecraft:chest']] as const) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'inventory-tab';
            button.dataset.tab = tab;
            button.setAttribute('aria-label', text('inventory.' + (tab === 'catalogue' ? 'catalogue' : 'player')));
            button.addEventListener('pointerenter', () => {
                const r = button.getBoundingClientRect();
                this.showTooltipText([button.getAttribute('aria-label')!], r.right, r.top);
            }, {signal: this.abort.signal});
            button.addEventListener('pointerleave', () => this.hideTooltip(), {signal: this.abort.signal});
            button.addEventListener('focus', () => {
                const r = button.getBoundingClientRect();
                this.showTooltipText([button.getAttribute('aria-label')!], r.right, r.top);
            }, {signal: this.abort.signal});
            button.addEventListener('blur', () => this.hideTooltip(), {signal: this.abort.signal});
            const icon = document.createElement('canvas');
            icon.width = 28;
            icon.height = 32;
            const ctx = icon.getContext('2d')!;
            ctx.imageSmoothingEnabled = false;
            const bg = art.images.get('assets/minecraft/textures/gui/sprites/container/creative_inventory/tab_top_unselected_1.png');
            if (bg) ctx.drawImage(bg, 0, 0, 28, 32);
            ctx.drawImage(art.icons.get(item)!, 6, 9, 16, 16);
            button.append(icon);
            button.addEventListener('click', () => {
                if (this.station) return;
                this.input.cancelGesture();
                this.tab = tab;
                this.sideOffset = 0;
                this.hover = null;
                this.draw();
                if (!this.focusCatalogue()) button.focus({preventScroll: true});
            }, {signal: this.abort.signal});
            tabs.append(button);
        }
        this.panel = document.createElement('div');
        this.panel.className = 'inventory-panel';
        this.canvas = document.createElement('canvas');
        this.canvas.width = 195;
        this.canvas.height = 136;
        this.canvas.setAttribute('aria-hidden', 'true');
        this.controls = document.createElement('div');
        this.controls.className = 'inventory-controls';
        this.scrollbar = document.createElement('input');
        this.scrollbar.type = 'range';
        this.scrollbar.className = 'inventory-scrollbar';
        this.scrollbar.min = '0';
        this.scrollbar.max = '4';
        this.scrollbar.step = '1';
        this.scrollbar.setAttribute('aria-label', text('inventory.presetScroll'));
        this.scrollbar.addEventListener('input', () => {
            this.input.cancel();
            this.sideOffset = Number(this.scrollbar.value);
            this.hover = null;
            this.hideTooltip();
            this.draw();
        }, {signal: this.abort.signal});
        for (const type of ['pointerup', 'pointercancel']) this.scrollbar.addEventListener(type, () => this.focusCatalogue(), {signal: this.abort.signal});
        this.search = document.createElement('input');
        // CreativeModeInventoryScreen uses a plain EditBox without a browser search-cancel button.
        this.search.type = 'text'; this.search.maxLength = 50;
        this.search.className = 'catalogue-search';
        this.search.setAttribute('aria-label', text('inventory.nativeSearch'));
        this.search.addEventListener('input', () => {
            this.sideOffset = 0;
            this.draw();
        }, {signal: this.abort.signal});
        for (const event of ['select', 'keyup', 'pointerup', 'focus', 'blur']) this.search.addEventListener(event, () => this.draw(false), {signal: this.abort.signal});
        this.panel.append(this.canvas, this.controls, this.scrollbar, this.search);
        const body = document.createElement('div');
        body.className = 'inventory-body';
        body.append(this.panel);
        this.modal.append(tabs, body);
        this.hud = document.createElement('div');
        this.hud.className = 'hotbar';
        this.hud.setAttribute('aria-label', text('inventory.hotbar'));
        this.hudCanvas = document.createElement('canvas');
        this.hudCanvas.width = 184;
        this.hudCanvas.height = 24;
        this.hudCanvas.setAttribute('aria-hidden', 'true');
        this.hud.append(this.hudCanvas);
        this.offhandCanvas = document.createElement('canvas');
        this.offhandCanvas.width = 29;
        this.offhandCanvas.height = 24;
        this.offhandCanvas.className = 'offhand-hud';
        this.hud.append(this.offhandCanvas);
        for (let i = 0; i < 9; i++) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.hotbar = String(i);
            button.addEventListener('click', () => this.command({
                type: 'select',
                index: i
            }), {signal: this.abort.signal});
            button.addEventListener('pointerenter', () => {
                this.hover = {kind: 'hotbar', x: 0, y: 0, index: i};
            }, {signal: this.abort.signal});
            button.addEventListener('pointerleave', () => this.hideTooltip(), {signal: this.abort.signal});
            button.addEventListener('contextmenu', e => e.preventDefault(), {signal: this.abort.signal});
            this.hud.append(button);
        }
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'item-tooltip';
        this.tooltip.id = 'item-tooltip';
        this.tooltip.setAttribute('role', 'tooltip');
        this.tooltip.hidden = true;
        this.cursor = document.createElement('canvas');
        this.cursor.className = 'item-cursor';
        this.cursor.width = this.cursor.height = 24;
        this.cursor.setAttribute('aria-hidden', 'true');
        this.cursor.hidden = true;
        this.modal.append(this.tooltip, this.cursor);
        host.append(this.hud, this.modal);
        this.modal.addEventListener('pointerdown', e => {
            if (this.tab === 'catalogue' && !this.station && e.target instanceof HTMLElement && !e.target.closest('input')) {
                e.preventDefault();
                this.focusCatalogue();
            }
        }, {capture: true, signal: this.abort.signal});
        for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel']) this.modal.addEventListener(type, event => {
            event.stopPropagation();
            if (['contextmenu', 'auxclick', 'wheel'].includes(type)) event.preventDefault();
        }, {signal: this.abort.signal, passive: false});
        this.modal.addEventListener('cancel', e => {
            e.preventDefault();
            this.close();
        }, {signal: this.abort.signal});
        this.modal.addEventListener('close', () => {
            if (this.modal.open) return;
            this.clearPersonal();
            this.gate(false);
            this.hideTooltip();
            this.cursor.hidden = true;
        }, {signal: this.abort.signal});
        this.input = new InventoryInput(this);
        this.playerPreview = new PlayerPreview(art, rules);
        this.panel.append(this.playerPreview.renderer.domElement);
        this.book = new RecipeBookView(this, body);
        this.resize = () => {
            const width = this.viewport?.clientWidth ?? innerWidth, height = this.viewport?.clientHeight ?? innerHeight,
                ratio = Math.min(devicePixelRatio, 4), limit = Math.min(width / (width < 700 ? 184 : 320), height / 215),
                physical = Math.max(1, Math.min(Math.floor(4 * ratio + 1e-6), Math.floor(limit * ratio + 1e-6)));
            this.scale = physical / ratio;
            this.host.style.setProperty('--gui-scale', String(this.scale));
            this.input.cancel();
            this.hideTooltip();
            this.draw();
        };
        this.blur = () => {
            this.input.cancel();
            this.hover = null;
            this.hideTooltip();
            this.cursor.hidden = true;
        };
        window.addEventListener('resize', this.resize, {signal: this.abort.signal});
        window.addEventListener('blur', this.blur, {signal: this.abort.signal});
        window.addEventListener('focus', () => this.draw(false), {signal: this.abort.signal});
        window.addEventListener('pagehide', () => {
            this.queueEpoch++;
            this.clearPersonal();
        }, {signal: this.abort.signal});
        document.addEventListener('pointermove', e => {
            this.mouse = {x: e.clientX, y: e.clientY};
            if (this.modal.open && (this.tab === 'equipment' || this.tab === 'crafting' && !this.station)) this.draw(false);
            this.positionCursor();
            if (this.hover) this.showTooltip(e.clientX, e.clientY);
        }, {capture: true, signal: this.abort.signal});
        this.resize();
        this.animation = window.setInterval(() => {
            if (document.hidden) return;
            const caret = Math.floor(performance.now() / 50);
            const editing = this.modal.open && (document.activeElement === this.search || document.activeElement === this.book?.search);
            if (this.art.update(performance.now(), this.compassView()) || editing && caret !== this.caretFrame) {this.caretFrame = caret; this.draw(false);}
        }, 50);
    }

    /** Create a localized native-sprite navigation button.
     * @param {string} label External localized text.
     * @param {Function} action Navigation action.
     * @return {HTMLButtonElement} Semantic control.
     */
    button(label: string, action: () => void): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.addEventListener('click', action, {signal: this.abort.signal});
        this.pixels.text(b, label, 2);
        this.pixels.button(b);
        return b;
    }

    /** Synchronize saved layout and language; reset epochs fence queued operations and clear page-owned carriers and recipe-book projections.
     * @param {State} state Permanent facts.
     * @param {boolean} writable Save currently available.
     * @param {string} generation Reset generation fence.
     */
    sync(state: State, writable: boolean, generation: string): void {
        const languageChanged = !!this.permanent && this.permanent.settings.locale !== state.settings.locale;
        const rebuild = languageChanged || this.generation !== generation || JSON.stringify(this.permanent?.progress.unlocked) !== JSON.stringify(state.progress.unlocked);
        if (!this.pending && this.permanent && JSON.stringify(this.permanent.progress.player) !== JSON.stringify(state.progress.player)) this.input.cancelGesture();
        if (this.generation !== generation) {
            this.clearAcquisition();
            this.queueEpoch++;
            this.value = {...emptyInventory(), crafting: Array(4).fill(null)};
            this.personal.close();
            this.generation = generation;
            this.book?.resetTransient(true);
            this.sideOffset = 0;
            this.input.cancel();
        }
        this.permanent = state;
        if (languageChanged) {
            this.book?.localize();
            this.modal.setAttribute('aria-label', this.text('inventory.title'));
            this.hud.setAttribute('aria-label', this.text('inventory.hotbar'));
            this.search.setAttribute('aria-label', this.text('inventory.nativeSearch'));
            this.scrollbar.setAttribute('aria-label', this.text('inventory.presetScroll'));
            for (const button of this.modal.querySelectorAll<HTMLButtonElement>('.inventory-tabs button')) {
                button.setAttribute('aria-label', this.text('inventory.' + (button.dataset.tab === 'catalogue' ? 'catalogue' : 'player')));
            }
            this.hideTooltip();
        }
        this.writable = writable;
        if (this.station) {
            const found = state.progress.scenes[state.progress.scene].stations.find(s => s.id === this.station!.id && ['crafting_table', 'furnace', 'blast_furnace', 'hopper'].includes(s.kind));
            if (!found || this.station.scene !== state.progress.scene) {
                void this.close(true);
                this.station = null;
                delete this.value.workbench;
                delete this.value.machine;
                delete this.value.hopper;
            } else if (!this.pending) this.station = {
                scene: state.progress.scene,
                id: found.id,
                expected: structuredClone(found.contents)
            };
        }
        if (!this.pending) this.value = {
            ...structuredClone(state.progress.player.data),
            cursor: structuredClone(this.personal.value),
            crafting: structuredClone(this.personal.crafting)
        };
        if (!this.pending) this.syncWorkbench();
        const signature = JSON.stringify({
            generation,
            locale: state.settings.locale,
            unlocked: state.progress.unlocked,
            player: state.progress.player,
            station: this.station,
            book: state.progress.recipeBook,
            writable
        });
        if (signature !== this.factSignature) {
            this.factSignature = signature;
            this.draw(rebuild);
        }
    }

    /** Resolve an original item name in this inventory's committed language.
     * @param {string} id Namespaced item identity.
     * @return {string} Localized item name with English fallback.
     */
    name(id: string): string {return itemName(id, this.permanent?.settings.locale);}

    /** Reject unresolved-receipt mutations before capturing carriers; otherwise stage and serialize the semantic intent under the shared lock.
     * @param {InventoryCommand} intent Bounded input intent.
     */
    command(intent: InventoryCommand): void {
        if (this.carrierBusy() || !this.permanent || !this.writable || this.disposed) return;
        const expected = layout(this.value), cursor = structuredClone(this.value.cursor),
            crafting = structuredClone(this.value.crafting), generation = this.generation, epoch = this.queueEpoch,
            cursorEpoch = this.personal.epoch, workbench = this.station ? structuredClone(this.station) : undefined;
        try {
            this.value = this.station?.expected.version === 3 ? reduceHopperInventory(this.value, intent, this.permanent.progress.unlocked, this.rules) : this.station?.expected.version === 2 ? reduceFurnaceInventory(this.value, intent, this.permanent.progress.unlocked, this.rules, this.machineKind()) : inventoryCommand(this.value, intent, this.permanent, this.rules);
            if (this.station?.expected.version === 3) this.station.expected.data.slots = structuredClone(this.value.hopper!); else if (this.station?.expected.version === 2) {
                this.station.expected.data.input = structuredClone(this.value.machine![0]);
                this.station.expected.data.fuel = structuredClone(this.value.machine![1]);
            } else if (this.station) this.station.expected = {
                version: 1,
                data: {grid: structuredClone(this.value.workbench!)}
            };
        } catch (error) {
            this.reportFailure(error instanceof Error && error.message === 'locked-item' ? 'inventory.locked' : 'error.generic');
            return;
        }
        this.pending++;
        this.hideTooltip();
        this.draw(false);
        this.queue = this.queue.then(async () => {
            if (this.disposed || epoch !== this.queueEpoch || generation !== this.generation) return;
            const result = await this.commit(intent, cursor, expected, crafting, workbench);
            if (epoch === this.queueEpoch && generation === this.generation) this.personal.commit(cursorEpoch, result.cursor, result.crafting);
        }).catch(error => {
            if (epoch !== this.queueEpoch || generation !== this.generation || this.disposed) return;
            this.queueEpoch++;
            this.input.cancel();
            if (cursorEpoch === this.personal.epoch) this.reportFailure(error instanceof Error && error.message === 'inventory-conflict' ? 'inventory.conflict' : 'error.generic');
        }).finally(() => {
            this.pending--;
            if (!this.pending && !this.disposed && this.permanent) {
                this.value = {
                    ...structuredClone(this.permanent.progress.player.data),
                    cursor: structuredClone(this.personal.value),
                    crafting: structuredClone(this.personal.crafting)
                };
                this.syncWorkbench();
                this.draw(false);
            }
        });
    }

    /** Equip the held native equippable item after world right-click/drag arbitration has selected Use.
     * @return {boolean} Whether equipment owns this Use action.
     */
    autoEquip(): boolean {
        const s = this.value.hotbar[this.value.selected], gear = s && this.rules.items[s.id].equipment;
        if (!this.modal.open && !this.blocked() && this.writable && gear && ['head', 'chest', 'legs', 'feet'].includes(gear)) {
            this.command({type: 'equip'});
            return true;
        }
        return false;
    }

    /** Open only the screen-space interface, canceling the world's incomplete pointer gesture first. */
    open(): void {
        this.modal.setAttribute('aria-label', this.text('inventory.title'));
        this.station = null;
        delete this.value.workbench;
        delete this.value.machine;
        delete this.value.hopper;
        this.input.cancel();
        if (this.blocked() || !this.permanent) return;
        this.gate(true);
        this.hover = null;
        this.modal.show();
        this.draw();
        if (!this.focusCatalogue()) this.modal.querySelector('button')?.focus();
    }

    /** Keep the creative search editor ready for typing throughout its visible tab lifetime.
     * @return {boolean} Whether catalogue search owns keyboard focus.
     */
    focusCatalogue(): boolean {
        if (!this.modal.open || this.station || this.tab !== 'catalogue' || this.search.hidden) return false;
        if (document.activeElement !== this.search) this.search.focus({preventScroll: true});
        return true;
    }

    /** Clear personal carried items and inputs at close/re-entry, fencing older asynchronous menu results. */
    clearPersonal(): void {
        this.book?.resetTransient();
        this.playerPreview?.hide();
        this.clearAcquisition();
        this.notice = '';
        this.input.cancel();
        this.personal.close();
        this.value.cursor = null;
        this.value.crafting = Array(4).fill(null);
        this.modal.dataset.crafting = JSON.stringify(this.value.crafting);
        this.modal.dataset.cursor = 'null';
        this.refreshPreview();
        this.hover = null;
        this.hideTooltip();
        this.cursor.hidden = true;
    }

    /** Return real workbench inputs atomically before ending a valid menu; failure leaves them visible and recoverable.
     * @param {boolean} invalidated Whether the station lifetime has already ended.
     * @return {Promise<boolean>} Whether navigation may leave this menu.
     */
    async close(invalidated = false): Promise<boolean> {
        if (!this.modal.open) return true;
        if (this.closing && !invalidated) return this.closing;
        const station = this.station, epoch = this.personal.epoch, generation = this.generation;
        this.clearPersonal();
        if (!invalidated && station?.expected.version === 1 && this.returnWorkbench) {
            const ticket = this.queue.then(() => this.returnWorkbench!(station.scene, station.id)).then(() => true).catch(() => {
                if (this.generation === generation && this.modal.open && this.station?.id === station.id) {
                    this.reportFailure('inventory.returnFull'); this.draw(false);
                }
                return false;
            });
            this.closing = ticket;
            const success = await ticket;
            if (this.closing === ticket) this.closing = null;
            if (!success) return false;
            if (this.generation !== generation || this.station?.id !== station.id || this.personal.epoch !== epoch + 1) return false;
        }
        this.modal.close();
        this.station = null;
        delete this.value.workbench;
        delete this.value.machine;
        delete this.value.hopper;
        this.modal.dataset.stationId = '';
        this.modal.dataset.workbench = 'null';
        this.refreshPreview();
        this.gate(false);
        return true;
    }

    /** Fetch an exact original GUI image or fail instead of creating a placeholder.
     * @param {string} path GUI-relative texture.
     * @return {HTMLCanvasElement} Original decoded image.
     */
    image(path: string): HTMLCanvasElement {
        const image = this.art.images.get('assets/minecraft/textures/gui/' + path + '.png');
        if (!image) throw Error('missing-native-gui:' + path);
        return image;
    }

    /** Draw transparent item art and its native-font quantity at logical slot scale.
     * @param {CanvasRenderingContext2D} context Target logical canvas.
     * @param {Stack|null} stack Temporary content.
     * @param {number} x Icon left.
     * @param {number} y Icon top.
     * @param {boolean} locked Cover only final icon alpha; quantity text stays independent.
     */
    stack(context: CanvasRenderingContext2D, stack: Stack | null, x: number, y: number, locked = false): void {
        if (!stack) return;
        const icon = this.art.icons.get(stack.id);
        if (!icon) throw Error('missing-native-icon:' + stack.id);
        context.imageSmoothingEnabled = this.art.kinds?.get(stack.id) === 'model';
        context.imageSmoothingQuality = 'high';
        context.drawImage(locked ? this.masks.get(icon) : icon, x, y, 16, 16);
        context.imageSmoothingEnabled = false;
        if (stack.count > 1) {
            const text = String(stack.count);
            this.pixels.font.draw(context, text, x + 17 - this.pixels.font.width(text), y + 9, '#FFF', true);
        }
    }

    /** Repaint native pixels, preserving semantic controls during texture-only animation.
     * @param {boolean} rebuild Whether input hit surfaces and accessible labels need replacement.
     */
    draw(rebuild = true): void {
        if (this.disposed) return;
        this.refreshPreview();
        const hud = scaledCanvas(this.hudCanvas, 184, 24, this.scale);
        hud.clearRect(0, 0, 184, 24);
        hud.imageSmoothingEnabled = false;
        hud.drawImage(this.image('sprites/hud/hotbar'), 1, 1);
        hud.drawImage(this.image('sprites/hud/hotbar_selection'), this.value.selected * 20, 0);
        this.value.hotbar.forEach((s, i) => this.stack(hud, s, 4 + i * 20, 4));
        for (const button of this.hud.querySelectorAll<HTMLButtonElement>('button')) {
            const i = Number(button.dataset.hotbar), s = this.value.hotbar[i];
            button.setAttribute('aria-label', this.text('inventory.slot', {
                number: i + 1,
                item: s ? this.name(s.id) : this.text('inventory.empty')
            }));
            button.setAttribute('aria-pressed', String(i === this.value.selected));
            button.style.left = (i * 20 + 2) * this.scale + 'px';
            button.style.width = 20 * this.scale + 'px';
            button.style.height = 22 * this.scale + 'px';
        }
        const off = scaledCanvas(this.offhandCanvas, 29, 24, this.scale);
        off.clearRect(0, 0, 29, 24);
        off.imageSmoothingEnabled = false;
        this.offhandCanvas.hidden = !this.value.equipment.offhand;
        if (this.value.equipment.offhand) {
            off.drawImage(this.image('sprites/hud/hotbar_offhand_left'), 0, 0);
            this.stack(off, this.value.equipment.offhand, 3, 4);
        }
        this.offhandCanvas.style.cssText = 'left:' + (-31 * this.scale) + 'px;top:0;width:' + 29 * this.scale + 'px;height:' + 24 * this.scale + 'px';
        this.offhandCanvas.setAttribute('aria-label', this.text('inventory.gear.offhand', {item: this.value.equipment.offhand ? this.name(this.value.equipment.offhand.id) : this.text('inventory.empty')}));
        this.hud.dataset.offhand = JSON.stringify(this.value.equipment.offhand);
        this.hud.dataset.selected = String(this.value.selected);
        this.hud.dataset.contents = JSON.stringify(this.value.hotbar);
        this.hud.style.width = 184 * this.scale + 'px';
        this.hud.style.height = 24 * this.scale + 'px';
        this.hudCanvas.style.width = 184 * this.scale + 'px';
        this.hudCanvas.style.height = 24 * this.scale + 'px';
        this.host.dataset.catalogueIcons = String(Object.keys(this.rules.items).length);
        this.onHudPaint?.();
        if (!this.modal.open || !this.permanent) {
            this.playerPreview?.hide();
            this.book?.render();
            return;
        }
        const signature = JSON.stringify([this.tab, this.sideOffset, this.value.presets]);
        if (signature !== this.presetSignature) {
            rebuild = true;
            this.presetSignature = signature;
        }
        const nav = this.modal.querySelector<HTMLElement>('.inventory-tabs');
        if (nav) nav.hidden = !!this.station;
        this.search.hidden = this.tab !== 'catalogue';
        this.search.style.cssText = 'left:' + 82 * this.scale + 'px;top:' + 6 * this.scale + 'px;width:' + 80 * this.scale + 'px;height:' + 9 * this.scale + 'px;font-size:' + 9 * this.scale + 'px';
        for (const b of this.modal.querySelectorAll<HTMLElement>('.inventory-tab')) {
            b.hidden = !!this.station;
            const selected = b.dataset.tab === this.tab;
            b.setAttribute('aria-pressed', String(selected));
            const tile = b.querySelector('canvas')! as HTMLCanvasElement, tc = scaledCanvas(tile, 26, 32, this.scale),
                edge = b.dataset.tab === 'catalogue' ? '1' : '7';
            tc.clearRect(0, 0, 26, 32);
            tc.imageSmoothingEnabled = false;
            tc.drawImage(this.image('sprites/container/creative_inventory/tab_top_' + (selected ? 'selected' : 'unselected') + '_' + edge), 0, 0, 26, 32);
            this.stack(tc, {id: b.dataset.tab === 'catalogue' ? 'minecraft:compass' : 'minecraft:chest', count: 1}, 5, 9);
        }
        const personal = this.tab === 'crafting', bench = personal && !!this.station,
            hopper = bench && this.station!.expected.version === 3,
            machine = bench && this.station!.expected.version === 2, w = personal ? 176 : 195,
            h = hopper ? 133 : personal ? 166 : 136;
        if (nav) nav.style.width = w * this.scale + 'px';
        this.panel.style.width = w * this.scale + 'px';
        this.panel.style.height = h * this.scale + 'px';
        const density = Math.ceil(this.scale * Math.min(devicePixelRatio, 4) - 1e-6);
        if (this.canvas.width !== w * density || this.canvas.height !== h * density) {
            this.canvas.width = w * density;
            this.canvas.height = h * density;
        }
        const ctx = this.canvas.getContext('2d')!;
        ctx.setTransform(density, 0, 0, density, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.image(personal ? (hopper ? 'container/hopper' : machine ? 'container/' + this.machineKind() : bench ? 'container/crafting_table' : 'container/inventory') : 'container/creative_inventory/' + (this.tab === 'equipment' ? 'tab_inventory' : 'tab_item_search')), 0, 0, w, h, 0, 0, w, h);
        if (rebuild) this.controls.replaceChildren();
        this.slots = [];
        if (!personal) this.pixels.font.draw(ctx, this.text('inventory.nativeSearch'), 8, 6, '#404040', false);
        this.menuSlots(ctx);
        if (this.tab === 'catalogue') nativeField(ctx, this.pixels.font, this.search, [82, 6, 80, 9]);
        if (machine) this.drawFurnace(ctx);
        if (personal && bench) this.pixels.font.draw(ctx, this.text('inventory.nativeInventory'), 8, hopper ? 39 : 72, '#404040', false);
        this.scrollbar.hidden = !['presets', 'catalogue'].includes(this.tab);
        this.scrollbar.setAttribute('aria-label', this.text(this.tab === 'presets' ? 'inventory.presetScroll' : 'inventory.catalogueScroll'));
        this.scrollbar.max = String(this.tab === 'presets' ? 4 : Math.max(0, Math.ceil(Math.max(0, directory(this.permanent).filter(e => matchesItem(e.item, this.search.value)).length - (this.search.value ? 0 : 18)) / 9) - 3));
        this.scrollbar.disabled = Number(this.scrollbar.max) === 0;
        if (!this.scrollbar.hidden) {
            this.scrollbar.value = String(this.sideOffset);
            this.scrollbar.style.cssText = 'left:' + 175 * this.scale + 'px;top:' + 18 * this.scale + 'px;width:' + 12 * this.scale + 'px;height:' + 90 * this.scale + 'px';
            ctx.drawImage(this.image('sprites/container/creative_inventory/' + (this.scrollbar.disabled ? 'scroller_disabled' : 'scroller')), 175, 18 + this.sideOffset * 75 / Math.max(1, Number(this.scrollbar.max)), 12, 15);
        }
        const drag = this.input.gesture.active;
        let projected = this.value;
        if (drag?.drag && drag.slots.size > 1 && this.value.cursor) {
            try {
                projected = reduceInventory(this.value, {
                    type: 'drag',
                    slots: [...drag.slots],
                    mode: drag.button === 0 ? 'left' : drag.button === 1 ? 'middle' : 'right'
                }, this.permanent.progress.unlocked, this.rules);
            } catch {
            }
        }
        this.modal.dataset.dragPreview = JSON.stringify(drag?.drag ? projected : null);
        if (this.hover) this.slotHighlight(ctx, this.hover, 'back');
        for (const [slotIndex, slot] of this.slots.entries()) {
            if (slot.kind !== 'preview') ctx.drawImage(this.image('sprites/container/slot'), slot.x, slot.y);
            if (slot.kind === 'equipment' && !this.value.equipment[slot.equipment!]) {
                const name = ({
                    head: 'helmet',
                    chest: 'chestplate',
                    legs: 'leggings',
                    feet: 'boots',
                    offhand: 'shield'
                })[slot.equipment!];
                ctx.drawImage(this.image('sprites/container/slot/' + name), slot.x + 1, slot.y + 1, 16, 16);
            }
            const stack = this.slotStack(slot, projected), ref = this.reference(slot);
            const selected = !!(drag?.drag && ref && drag.slots.has(ref) && drag.slots.size > 1);
            if (selected) {ctx.fillStyle = '#FFFFFF80'; ctx.fillRect(slot.x + 1, slot.y + 1, 16, 16);}
            this.stack(ctx, drag?.drag && ref && drag.slots.has(ref) && drag.slots.size === 1 ? null : stack, slot.x + 1, slot.y + 1, !!slot.locked);
            if (selected && stack && this.value.cursor) {
                const original = this.slotStack(slot, this.value)?.count ?? 0;
                const raw = original + (drag!.button === 1 ? this.rules.items[stack.id].maxStack : drag!.button === 2 ? 1 : Math.floor(this.value.cursor.count / drag!.slots.size));
                if (raw > this.rules.items[stack.id].maxStack) {
                    const n = String(stack.count);
                    this.pixels.font.draw(ctx, n, slot.x + 18 - this.pixels.font.width(n), slot.y + 10, '#FFFF55', true);
                }
            }
            if (!rebuild) {
                const existing = this.controls.children[slotIndex];
                if (existing) {
                    existing.setAttribute('aria-label', this.slotLabel(slot, stack));
                    existing.setAttribute('aria-disabled', String(!!slot.locked || slot.kind === 'preset-info' || slot.kind === 'preview' && (!this.acquire || !this.preview.result)));
                }
                continue;
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'inventory-slot';
            b.dataset.kind = slot.kind;
            if (slot.item) b.dataset.item = slot.item;
            if (slot.preset !== undefined) b.dataset.preset = String(slot.preset);
            if (slot.presetCell !== undefined) b.dataset.presetCell = String(slot.presetCell);
            if (slot.index !== undefined) b.dataset.index = String(slot.index);
            if (slot.equipment) b.dataset.equipment = slot.equipment;
            b.setAttribute('aria-label', this.slotLabel(slot, stack));
            b.setAttribute('aria-disabled', String(!!slot.locked || slot.kind === 'preset-info' || slot.kind === 'preview' && (!this.acquire || !this.preview.result)));
            b.style.cssText = 'left:' + slot.x * this.scale + 'px;top:' + slot.y * this.scale + 'px;width:' + 18 * this.scale + 'px;height:' + 18 * this.scale + 'px';
            b.addEventListener('pointerenter', () => {
                this.hover = slot; this.draw(false);
            });
            b.addEventListener('pointerleave', () => {
                if (document.activeElement === b) return;
                if (this.hover?.x === slot.x && this.hover?.y === slot.y) this.hover = null;
                this.hideTooltip(); this.draw(false);
            });
            b.addEventListener('focus', () => {
                this.hover = slot;
                const rect = b.getBoundingClientRect();
                this.showTooltip(rect.right, rect.top);
            });
            b.addEventListener('blur', () => {
                if (this.hover?.x === slot.x && this.hover?.y === slot.y) this.hover = null;
                this.hideTooltip(); this.draw(false);
            });
            b.setAttribute('aria-describedby', 'item-tooltip');
            b.addEventListener('click', e => {
                if (e.detail === 0) this.activate(slot, 0, e.shiftKey);
            });
            b.addEventListener('contextmenu', e => e.preventDefault());
            b.addEventListener('auxclick', e => e.preventDefault());
            this.controls.append(b);
        }
        if (this.hover) this.slotHighlight(ctx, this.hover, 'front');
        this.book?.render();
        this.book?.drawGhost(ctx);
        if (this.playerPreview && (this.tab === 'equipment' || personal && !bench)) {
            this.playerPreview.sync(this.permanent.progress.player.data);
            const r = this.panel.getBoundingClientRect();
            this.modal.dataset.player = JSON.stringify(this.playerPreview.draw(this.tab === 'equipment' ? 'equipment' : 'personal', (this.mouse.x - r.left) / this.scale, (this.mouse.y - r.top) / this.scale, this.scale));
        } else {
            this.playerPreview?.hide();
            delete this.modal.dataset.player;
        }
        const cursor = scaledCanvas(this.cursor, 24, 24, this.scale);
        cursor.clearRect(0, 0, 24, 24);
        cursor.imageSmoothingEnabled = false;
        this.stack(cursor, projected.cursor, 0, 0);
        this.cursor.style.width = this.cursor.style.height = 24 * this.scale + 'px';
        this.positionCursor();
        this.modal.dataset.guiScale = String(this.scale);
        this.modal.dataset.dpr = String(devicePixelRatio);
        this.modal.dataset.cursor = JSON.stringify(this.value.cursor);
        this.modal.dataset.backpack = JSON.stringify(this.value.backpack);
        this.modal.dataset.equipment = JSON.stringify(this.value.equipment);
        this.modal.dataset.crafting = JSON.stringify(this.value.crafting);
        this.modal.dataset.tab = this.tab;
        this.modal.dataset.compass = JSON.stringify(this.art.documents.get('$compass-state') ?? null);
        this.modal.dataset.stationId = this.station?.id ?? '';
        this.modal.dataset.workbench = JSON.stringify(this.value.workbench ?? null);
        this.modal.dataset.hopper = JSON.stringify(this.value.hopper ?? null);
        this.modal.dataset.sideOffset = String(this.sideOffset);
        this.modal.dataset.furnace = JSON.stringify(this.station?.expected.version === 2 ? this.station.expected.data : null);
        alignRaster(this.canvas,true);alignRaster(this.hudCanvas,true);alignRaster(this.offhandCanvas,true);
    }

    /** Route genuine operation failures through system chat; slot/ghost/Toast presentation stays independent.
     * @param {string} key Localized failure identity.
     */
    reportFailure(key: string): void {
        if (this.disposed) return;
        this.notice = this.text(key);
        this.feedback?.(key);
    }

    /** Keep carried-item pixels inside their viewport-owned GUI without restricting external page navigation. */
    positionCursor(): void {
        const r = this.viewport?.getBoundingClientRect() ?? {left: 0, top: 0, right: innerWidth, bottom: innerHeight};
        this.cursor.style.left = (this.mouse.x - r.left - 8 * this.scale) + 'px';
        this.cursor.style.top = (this.mouse.y - r.top - 8 * this.scale) + 'px';
        this.cursor.hidden = !this.value.cursor || this.mouse.x < r.left || this.mouse.x >= r.right || this.mouse.y < r.top || this.mouse.y >= r.bottom;
    }

    /** Draw the native hovered-slot layer independently from quick-craft selection fills.
     * @param {CanvasRenderingContext2D} ctx Logical target.
     * @param {Slot} slot Hovered logical content slot.
     * @param {'back'|'front'} layer Native extraction layer.
     */
    slotHighlight(ctx: CanvasRenderingContext2D, slot: Slot, layer: 'back' | 'front'): void {
        const path = 'assets/minecraft/textures/gui/sprites/container/slot_highlight_' + layer + '.png', image = this.art.images.get(path);
        if (image) drawSprite(ctx, image, this.art.documents.get(path + '.mcmeta')?.gui?.scaling, slot.x - 3, slot.y - 3, 24, 24);
    }

    /** Describe a live logical slot without rebuilding its pointer/focus surface.
     * @param {Slot} slot Logical identity.
     * @param {Stack|null} stack Displayed native item/result or source identity.
     * @return {string} Localized accessible label.
     */
    slotLabel(slot: Slot, stack: Stack | null): string {
        if (slot.kind === 'preview') return stack ? this.text('inventory.previewResult', {
            item: this.name(stack.id),
            count: stack.count
        }) : this.text('inventory.empty');
        if (slot.kind === 'preset-info') return this.text('inventory.presetInfo', {number: slot.preset! + 1});
        const name = stack ? this.name(stack.id) : this.text('inventory.empty');
        return slot.kind === 'equipment' ? this.text('inventory.gear.' + slot.equipment, {item: name}) : stack ? (slot.kind === 'source' && slot.preset === undefined ? name : name + (stack.count > 1 ? ' ' + stack.count : '')) + (slot.locked ? ' - ' + this.text('inventory.locked') : '') : name;
    }

    /** Acquire results through the dedicated transaction; transferable inputs retain the shared slot policies.
     * @param {Slot} slot Hovered logical slot.
     * @param {0|1|2} button DOM mouse button.
     * @param {boolean} shift Quick-move modifier.
     */
    activate(slot: Slot, button: 0 | 1 | 2, shift = false): void {
        this.hideTooltip();
        if (slot.kind === 'preset-info') return;
        if (slot.kind === 'preview') {
            if (button !== 1) this.takeResult({mode: shift ? 'shift' : 'cursor', button: button as 0 | 2});
            return;
        }
        if (slot.kind === 'source') this.copySource(slot, shift ? 'shift' : button === 1 ? 'clone' : button === 2 ? 'right' : 'left'); else if (button === 1) this.command({
            type: 'clone',
            slot: this.reference(slot)!
        }); else this.command(slot.kind === 'backpack' ? {
            type: 'backpack-slot',
            index: slot.index!,
            button
        } : slot.kind === 'hopper' ? {
            type: 'hopper-slot',
            index: slot.index!,
            button
        } : slot.kind === 'machine' ? {
            type: 'machine-slot',
            index: slot.index!,
            button
        } : slot.kind === 'workbench' ? {
            type: 'workbench-slot',
            index: slot.index!,
            button
        } : slot.kind === 'crafting' ? {
            type: 'craft-slot',
            index: slot.index!,
            button
        } : slot.kind === 'hotbar' ? {type: 'slot', index: slot.index!, button} : {
            type: 'equipment',
            slot: slot.equipment!,
            button
        });
    }

    /** Project native slot frames and empty directory hit targets; preset rows reference the durable nine-toolbar array.
     * @param {CanvasRenderingContext2D} ctx Native logical pixel layer.
     */
    menuSlots(ctx: CanvasRenderingContext2D): void {
        const list = directory(this.permanent!).filter(e => matchesItem(e.item, this.search.value)),
            main = this.search.value ? [] : list.slice(0, 18), side = this.search.value ? list : list.slice(18);
        if (this.tab === 'presets') {
            for (let row = 0; row < 5; row++) {
                const preset = row + this.sideOffset, data = this.value.presets[preset];
                for (let col = 0; col < 9; col++) {
                    const stack = data?.[col];
                    if (stack) this.slots.push({
                        kind: 'source',
                        item: stack.id,
                        preset,
                        presetCell: col,
                        x: 8 + col * 18,
                        y: 17 + row * 18
                    }); else if ((!data || data.every(s => !s)) && col === preset) this.slots.push({
                        kind: 'preset-info',
                        preset,
                        x: 8 + col * 18,
                        y: 17 + row * 18
                    });
                }
            }
        } else {
            if (this.tab === 'equipment') {
                ctx.fillStyle = '#C6C6C6';
                ctx.fillRect(8, 53, 162, 54);
                for (const [slot, x, y] of [['head', 54, 5], ['chest', 54, 32], ['legs', 108, 5], ['feet', 108, 32], ['offhand', 35, 19]] as [EquipmentSlot, number, number][]) this.slots.push({
                    kind: 'equipment',
                    equipment: slot,
                    x,
                    y
                });
                ctx.fillRect(172, 111, 20, 22);
            }
            if (this.tab === 'crafting') {
                if (this.station?.expected.version === 3) {
                    for (let i = 0; i < 5; i++) this.slots.push({kind: 'hopper', index: i, x: 43 + i * 18, y: 19});
                    this.pixels.font.draw(ctx, this.text('inventory.hopper'), 8, 6, '#404040', false);
                } else if (this.station?.expected.version === 2) {
                    this.slots.push({kind: 'machine', index: 0, x: 55, y: 16}, {
                        kind: 'machine',
                        index: 1,
                        x: 55,
                        y: 52
                    }, {kind: 'preview', x: 115, y: 34});
                    const title = this.text('inventory.' + this.machineKind());
                    this.pixels.font.draw(ctx, title, (176 - this.pixels.font.width(title)) / 2, 6, '#404040', false);
                } else if (this.station) {
                    for (let i = 0; i < 9; i++) this.slots.push({
                        kind: 'workbench',
                        index: i,
                        x: 29 + i % 3 * 18,
                        y: 16 + Math.floor(i / 3) * 18
                    });
                    this.slots.push({kind: 'preview', x: 123, y: 34});
                    this.pixels.font.draw(ctx, this.text('inventory.crafting'), 29, 6, '#404040', false);
                } else {
                    for (const [slot, x, y] of [['head', 7, 7], ['chest', 7, 25], ['legs', 7, 43], ['feet', 7, 61], ['offhand', 76, 61]] as [EquipmentSlot, number, number][]) this.slots.push({
                        kind: 'equipment',
                        equipment: slot,
                        x,
                        y
                    });
                    for (let i = 0; i < 4; i++) this.slots.push({
                        kind: 'crafting',
                        index: i,
                        x: 97 + i % 2 * 18,
                        y: 17 + Math.floor(i / 2) * 18
                    });
                    this.slots.push({kind: 'preview', x: 153, y: 27});
                    this.pixels.font.draw(ctx, this.text('inventory.crafting'), 97, 6, '#404040', false);
                }
            }
            if (this.tab === 'catalogue') {
                const entries = [...main, ...side.slice(this.sideOffset * 9, this.sideOffset * 9 + 27)];
                for (let i = 0; i < 45; i++) this.slots.push({
                    kind: 'source',
                    index: i,
                    item: entries[i]?.item,
                    locked: !!entries[i] && !entries[i].unlocked,
                    x: 8 + i % 9 * 18,
                    y: 17 + Math.floor(i / 9) * 18
                });
            } else {
                const y = this.station?.expected.version === 3 ? 50 : 83;
                for (let i = 0; i < 27; i++) this.slots.push({
                    kind: 'backpack',
                    index: i,
                    x: 7 + i % 9 * 18,
                    y: y + Math.floor(i / 9) * 18
                });
            }
        }
        for (let i = 0; i < 9; i++) this.slots.push({
            kind: 'hotbar',
            index: i,
            x: (this.tab === 'crafting' ? 7 : 8) + i * 18,
            y: this.tab === 'crafting' ? (this.station?.expected.version === 3 ? 108 : 141) : 111
        });
    }

    /** Resolve the displayed group without converting copy-only preset cells to finite inventory.
     * @param {Slot} slot Logical menu cell.
     * @return {Stack|null} Current carrier, read-only result, or informational paper icon.
     */
    slotStack(slot: Slot, value: InventoryState = this.value): Stack | null {
        return slot.kind === 'backpack' ? value.backpack[slot.index!] ?? null : slot.kind === 'hopper' ? value.hopper?.[slot.index!] ?? null : slot.kind === 'machine' ? value.machine?.[slot.index!] ?? null : slot.kind === 'preview' ? this.preview.result : slot.kind === 'preset-info' ? {
            id: 'minecraft:paper',
            count: 1
        } : slot.kind === 'source' ? slot.preset !== undefined ? value.presets[slot.preset]?.[slot.presetCell!] ?? null : slot.item ? {
            id: slot.item!,
            count: 1
        } : null : slot.kind === 'workbench' ? value.workbench?.[slot.index!] ?? null : slot.kind === 'crafting' ? value.crafting?.[slot.index!] ?? null : slot.kind === 'hotbar' ? value.hotbar[slot.index!] : value.equipment[slot.equipment!];
    }

    /** Resolve transferable cells, excluding result previews, copy-only presets and infinite directory entries.
     * @param {Slot|null} slot Logical hit.
     * @return {SlotRef|null} Finite reference.
     */
    reference(slot: Slot | null): SlotRef | null {
        return slot?.kind === 'backpack' ? `backpack:${slot.index!}` : slot?.kind === 'hopper' ? `hopper:${slot.index!}` : slot?.kind === 'machine' ? `machine:${slot.index!}` : slot?.kind === 'workbench' ? `workbench:${slot.index!}` : slot?.kind === 'crafting' ? `crafting:${slot.index!}` : slot?.kind === 'hotbar' ? `hotbar:${slot.index!}` : slot?.kind === 'equipment' ? `equipment:${slot.equipment!}` : null;
    }

    /** Copy from a directory/preset or discard the cursor at an empty directory cell through the shared reducer.
     * @param {Slot} slot Source display identity.
     * @param {'left'|'right'|'clone'|'number'|'shift'|'offhand'} mode Native source operation.
     * @param {number} index Optional numeric-key destination.
     */
    copySource(slot: Slot, mode: 'left' | 'right' | 'clone' | 'number' | 'shift' | 'offhand', index?: number): void {
        if (!slot.item && slot.preset === undefined) {
            if (mode === 'left' || mode === 'right') this.command({type: 'drop', cursor: true, all: true});
            return;
        }
        this.command(slot.preset !== undefined ? {
            type: 'preset-source',
            preset: slot.preset,
            index: slot.presetCell!,
            mode,
            target: index
        } : {type: 'source', item: slot.item!, mode, index});
    }

    /** Render an original tooltip on the screen plane with no pointer hit surface.
     * @param {number} x Client pointer X.
     * @param {number} y Client pointer Y.
     */
    showTooltip(x: number, y: number): void {
        const slot = this.hover;
        if (!slot || this.value.cursor) {
            this.hideTooltip();
            return;
        }
        const stack = this.slotStack(slot) ?? (slot.kind === 'preview' ? this.book?.ghost?.result : null);
        if (!stack && slot.kind !== 'preset-info') {
            this.hideTooltip();
            return;
        }
        const lines = slot.kind === 'preset-info' ? [this.text('inventory.presetInfo', {number: slot.preset! + 1})] : [this.name(stack!.id!), ...(slot.locked ? [this.text('inventory.locked')] : [])];
        this.showTooltipText(lines, x, y);
    }

    /** Paint a native tooltip with cake-family name colors, sufficient Unicode backing pixels and no hit surface.
     * @param {string[]} lines Localized text lines.
     * @param {number} x Client X.
     * @param {number} y Client Y.
     */
    showTooltipText(lines: string[], x: number, y: number): void {
        const {width, height} = tooltipBox(lines.map(s => this.pixels.font.width(s))),
            canvas = document.createElement('canvas'), resolution = Math.max(1,this.scale*Math.min(globalThis.devicePixelRatio??1,4));
        canvas.width = rasterSize(width,resolution);
        canvas.height = rasterSize(height,resolution);
        canvas.style.width = width * this.scale + 'px';
        canvas.style.height = height * this.scale + 'px';
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
        for (const name of ['background', 'frame']) {
            const path = 'assets/minecraft/textures/gui/sprites/tooltip/' + name + '.png',
                image = this.art.images.get(path);
            if (!image) throw Error('missing-native-tooltip');
            drawSprite(ctx, image, this.art.documents.get(path + '.mcmeta')?.gui?.scaling, 0, 0, width, height);
        }
        const cakeId = ['minecraft:cake', 'jerrys_farm:upside_down_cake'].find(id => lines[0] === this.name(id));
        lines.forEach((s, i) => this.pixels.font.draw(ctx, s, 12, 12 + i * 12, i ? '#AAA' : itemColor(cakeId ?? ''), true));
        const accessible = document.createElement('span');
        accessible.className = 'sr-only';
        accessible.textContent = lines.join(' ');
        this.tooltip.replaceChildren(accessible, canvas);
        const r = this.viewport?.getBoundingClientRect() ?? {left: 0, top: 0, right: innerWidth, bottom: innerHeight};
        this.tooltip.style.left = (Math.max(r.left + 4, Math.min(x + 12, r.right - width * this.scale - 4)) - r.left) + 'px';
        this.tooltip.style.top = (Math.max(r.top + 4, Math.min(y + 12, r.bottom - height * this.scale - 4)) - r.top) + 'px';
        this.tooltip.hidden = false;
        alignRaster(canvas,true);
    }

    /** Cache only the read-only output projection; an empty or reset grid always clears the previous result.
     * No inventory command, notification or storage write is sent by this method.
     */
    refreshPreview(): void {
        if (this.station?.expected.version === 3) {
            this.preview = {status: 'empty', result: null};
            this.modal.dataset.preview = JSON.stringify(this.preview);
            return;
        }
        if (this.station?.expected.version === 2) {
            const d = this.station.expected.data;
            this.previewSignature = 'furnace:' + JSON.stringify(d);
            this.preview = d.output ? {
                status: 'matched',
                recipe: d.outputRecipe!,
                result: structuredClone(d.output)
            } : {status: 'empty', result: null};
            this.modal.dataset.preview = JSON.stringify(this.preview);
            return;
        }
        const grid = this.value.workbench ?? this.value.crafting ?? Array(4).fill(null),
            signature = JSON.stringify([!!this.station, grid]);
        if (signature !== this.previewSignature) {
            this.previewSignature = signature;
            this.preview = personalPreview(grid, this.rules, this.value.workbench ? 3 : 2);
            this.hideTooltip();
        }
        this.modal.dataset.preview = JSON.stringify(this.preview);
    }

    /** Project current instance contents, keeping personal carriers separate. */
    syncWorkbench(): void {
        if (!this.station || !this.permanent) {
            delete this.value.workbench;
            delete this.value.machine;
            delete this.value.hopper;
            return;
        }
        const instance = this.permanent.progress.scenes[this.station.scene].stations.find(s => s.id === this.station!.id);
        if (!instance) return;
        this.station.expected = structuredClone(instance.contents);
        if (instance.contents.version === 3) {
            delete this.value.workbench;
            delete this.value.machine;
            this.value.hopper = structuredClone(instance.contents.data.slots);
            return;
        }
        delete this.value.hopper;
        if (instance.contents.version === 2) {
            delete this.value.workbench;
            this.value.machine = [structuredClone(instance.contents.data.input), structuredClone(instance.contents.data.fuel)];
            return;
        }
        delete this.value.machine;
        delete this.value.hopper;
        this.value.workbench = structuredClone(instance.contents.version === 1 ? instance.contents.data.grid : Array(9).fill(null));
    }

    /** Open the native screen for an actual current-scene workbench or furnace instance.
     * @param {string} id Picked persistent station ID.
     */
    openWorkbench(id: string): void {
        if (this.blocked() || !this.permanent || this.pending) return;
        const scene = this.permanent.progress.scene,
            instance = this.permanent.progress.scenes[scene].stations.find(s => s.id === id && ['crafting_table', 'furnace', 'blast_furnace', 'hopper'].includes(s.kind));
        if (!instance) return;
        this.clearPersonal();
        this.station = {scene, id, expected: structuredClone(instance.contents)};
        this.syncWorkbench();
        this.modal.setAttribute('aria-label', this.text(instance.kind === 'crafting_table' ? 'inventory.workbench' : 'inventory.' + instance.kind));
        this.tab = 'crafting';
        this.sideOffset = 0;
        this.notice = '';
        this.gate(true);
        this.hover = null;
        if (!this.modal.open) this.modal.show();
        this.draw();
        this.modal.querySelector('button')?.focus();
    }

    /** Own carrier input until a finite-output or complete-batch receipt resolves, without optimistic grants.
     * @param {CraftTake} take Native result destination operation.
     */
    takeResult(take: FurnaceTake): void {
        if (!this.acquire || !this.permanent || !this.writable || this.carrierBusy() || this.pending || !this.modal.open || !this.preview.result) return;
        const expected = layout(this.value), cursor = structuredClone(this.value.cursor),
            crafting = structuredClone(this.value.crafting ?? Array(4).fill(null)),
            workbench = this.station ? structuredClone(this.station) : undefined, generation = this.generation,
            epoch = this.queueEpoch, personalEpoch = this.personal.epoch, ticket = {};
        this.acquisition = ticket;
        this.modal.dataset.acquiring = 'true';
        this.pending++;
        this.notice = '';
        delete this.modal.dataset.craftError;
        this.input.cancelGesture();
        this.hideTooltip();
        this.queue = this.queue.then(async () => {
            if (this.disposed || epoch !== this.queueEpoch || generation !== this.generation || personalEpoch !== this.personal.epoch) return;
            const receipt = workbench?.expected.version === 2 ? await this.acquireOutput!(take, cursor, expected, workbench) : await this.acquire!(take, cursor, crafting, expected, workbench);
            if (epoch !== this.queueEpoch || generation !== this.generation || this.disposed) return;
            this.personal.commit(personalEpoch, receipt.inventory.cursor, receipt.inventory.crafting);
            this.notice = '';
        }).catch(error => {
            if (epoch !== this.queueEpoch || generation !== this.generation || this.disposed) return;
            this.modal.dataset.craftError = error instanceof Error ? error.message : 'craft-failed';
            if (personalEpoch === this.personal.epoch && !(error instanceof Error && ['craft-target-full', 'craft-remainder-full', 'furnace-output-empty', 'craft-no-match'].includes(error.message))) this.reportFailure(this.station?.expected.version === 2 ? 'inventory.outputFailed' : 'inventory.craftFailed');
        }).finally(() => {
            if (this.acquisition === ticket) {
                this.input.cancelGesture();
                this.clearAcquisition(ticket);
            }
            this.pending--;
            if (!this.pending && !this.disposed && this.permanent) {
                this.value = {
                    ...structuredClone(this.permanent.progress.player.data),
                    cursor: structuredClone(this.personal.value),
                    crafting: structuredClone(this.personal.crafting)
                };
                this.syncWorkbench();
                this.draw();
            }
        });
    }

    /** Fill discovered recipe inputs through the unified carrier gate; close/reset discard only page-owned late receipts.
     * @param {string} recipe Original recipe ID.
     * @param {boolean} max Shift bounded-capacity fill.
     */
    fillInputs(recipe: string, max: boolean): void {
        if (!this.fill || !this.permanent || !this.writable || this.carrierBusy() || this.pending || !this.modal.open || this.tab !== 'crafting' || this.station?.expected.version === 3) return;
        const expected = layout(this.value), cursor = structuredClone(this.value.cursor),
            crafting = structuredClone(this.value.crafting ?? Array(4).fill(null)),
            station = this.station ? structuredClone(this.station) : undefined, generation = this.generation,
            epoch = this.queueEpoch, personalEpoch = this.personal.epoch, ticket = {};
        this.acquisition = ticket;
        this.modal.dataset.acquiring = 'true';
        this.pending++;
        this.input.cancelGesture();
        this.hideTooltip();
        this.notice = '';
        this.queue = this.queue.then(async () => {
            if (this.disposed || epoch !== this.queueEpoch || generation !== this.generation || personalEpoch !== this.personal.epoch) return;
            const result = await this.fill!(recipe, max, cursor, crafting, expected, station);
            if (epoch === this.queueEpoch && generation === this.generation && !this.disposed) this.personal.commit(personalEpoch, result.cursor, result.crafting);
        }).catch(error => {
            if (epoch !== this.queueEpoch || generation !== this.generation || this.disposed) return;
            this.modal.dataset.fillError = error instanceof Error ? error.message : 'recipe-fill-failed';
            if (personalEpoch === this.personal.epoch && !(error instanceof Error && ['recipe-input-conflict', 'recipe-materials-missing'].includes(error.message))) this.reportFailure(error instanceof Error && error.message === 'inventory-full' ? 'inventory.returnFull' : 'book.failed');
        }).finally(() => {
            if (this.acquisition === ticket) {
                this.input.cancelGesture();
                this.clearAcquisition(ticket);
            }
            this.pending--;
            if (!this.pending && !this.disposed && this.permanent) {
                this.value = {
                    ...structuredClone(this.permanent.progress.player.data),
                    cursor: structuredClone(this.personal.value),
                    crafting: structuredClone(this.personal.crafting)
                };
                this.syncWorkbench();
                this.draw();
            }
        });
    }

    /** Keep all carrier mutations outside the interval owned by an unresolved acquisition receipt.
     * @return {boolean} Whether the active receipt owns carrier input.
     */
    carrierBusy(): boolean {
        return !!this.closing || !!this.acquisition;
    }

    /** Resolve the active native device title and texture family.
     * @return {FurnaceKind} Current furnace capability.
     */
    machineKind(): FurnaceKind {
        return this.permanent?.progress.scenes[this.station!.scene].stations.find(s => s.id === this.station!.id)?.kind === 'blast_furnace' ? 'blast_furnace' : 'furnace';
    }

    /** Crop native flame and arrow sprites according to committed processing timers.
     * @param {CanvasRenderingContext2D} ctx Screen-space logical canvas.
     */
    drawFurnace(ctx: CanvasRenderingContext2D): void {
        const d = this.station!.expected.data as FurnaceData, k = this.machineKind();
        if (d.burn > 0) {
            const height = Math.min(14, Math.ceil(d.burn / Math.max(1, d.burnTotal) * 13) + 1);
            ctx.drawImage(this.image('sprites/container/' + k + '/lit_progress'), 0, 14 - height, 14, height, 56, 36 + 14 - height, 14, height);
        }
        const width = Math.min(24, Math.ceil(d.cook / Math.max(1, d.cookTotal) * 24));
        if (width) ctx.drawImage(this.image('sprites/container/' + k + '/burn_progress'), 0, 0, width, 16, 79, 34, width, 16);
    }

    /** Release only the matching receipt, or invalidate ownership at a menu/reset boundary.
     * @param {object} ticket Optional receipt identity; older tasks cannot release newer ownership.
     */
    clearAcquisition(ticket?: object): void {
        if (ticket && this.acquisition !== ticket) return;
        this.acquisition = null;
        this.modal.dataset.acquiring = 'false';
    }

    /** Hide a stale hover projection without changing its carrier. */
    hideTooltip(): void {
        this.tooltip.hidden = true;
    }

    /** Remove every owned listener and runtime canvas; no saved state is written during disposal. */
    dispose(): void {
        this.clearAcquisition();
        this.disposed = true;
        this.queueEpoch++;
        this.input.dispose();
        this.personal.close();
        clearInterval(this.animation);
        void this.close(true);
        this.abort.abort();
        this.hud.remove();
        this.modal.remove();
        this.tooltip.remove();
        this.cursor.remove();
        this.book?.dispose();
        this.playerPreview?.dispose();
        this.art.dispose();
    }
}

/** Keep logical GUI coordinates while rendering text and icons at their actual screen/DPR density.
 * @param {HTMLCanvasElement} canvas Owned GUI layer.
 * @param {number} width Logical width.
 * @param {number} height Logical height.
 * @param {number} scale CSS pixels per logical GUI pixel.
 * @return {CanvasRenderingContext2D} Nearest-sampled scaled context.
 */
export function scaledCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number): CanvasRenderingContext2D {
    const d = scale * Math.min(devicePixelRatio, 4),w=rasterSize(width,d),h=rasterSize(height,d);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.imageSmoothingEnabled = false;
    canvas.style.width=width*scale+'px';canvas.style.height=height*scale+'px';
    alignRaster(canvas,true);
    return ctx;
}
