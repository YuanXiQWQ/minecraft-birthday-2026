/** Native screen-plane recipe book renders original sprites, grouped recipes, search and display-only ghosts. */
import {recipePulse, RecipeToastClock} from './native-animation.ts';
import type {ToastSlots} from './toast-slots.ts';
import {nativeField} from './native-field.ts';
import {alignRaster} from './raster.ts';
import {scaledCanvas} from './inventory.ts';
import type {GameInventory} from './inventory.ts';
import type {Recipe} from '../rules/types.ts';
import {
  BOOK_RECIPES,
  bookApplicable,
  recipeGhost,
  analyzeOwnedRecipe,
  ownedRecipeGhost
} from '../domain/recipe-book.ts';
import type {BookMode} from '../domain/recipe-book.ts';
import {matchesItem} from '../i18n/items.ts';
import {drawSprite} from './vanilla.ts';

/** One persistent discovery group can contain several native recipes. */
interface RecipeGroup {
  key: string;
  recipes: Recipe[];
}

/** Own one book per formal menu; temporary ghosts never become domain stacks. */
export class RecipeBookView {
  toastSlots?:ToastSlots;
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  controls: HTMLDivElement;
  search: HTMLInputElement;
  toggle: HTMLButtonElement;
  toast: HTMLCanvasElement;
  query = '';
  category = 'all';
  page = 0;
  popup: RecipeGroup | null = null;
  ghost: Recipe | null = null;
  ghostInputs = '';
  identity = '';
  signature = '';
  hover = '';
  groups: RecipeGroup[] = [];
  clock = 0;
  toastTimer = 0;
  toastExitTimer = 0;
  displayEpoch = 0;
  toastEpoch = 0;
  generation = '';
  disposed = false;
  pulses = new Map<string, number>();
  pulseStarted = new Set<string>();
  animationFrame = 0;
  animationEpoch = 0;
  seenRequests = new Set<string>();
  toastClock = new RecipeToastClock();
  toastPhase = '';
  sound: ((id: string) => void) | null = null;
  abort = new AbortController();

  /** Attach original pixel surfaces without adding a WebGL context or taking ownership of slot events.
   * @param {GameInventory} ui Existing native screen owner.
   * @param {HTMLElement} body Menu body containing the native container.
   */
  constructor(public ui: GameInventory, public body: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'recipe-book';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 147;
    this.canvas.height = 166;
    this.controls = document.createElement('div');
    this.controls.className = 'recipe-book-controls';
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.maxLength = 50;
    this.search.className = 'recipe-book-search';
    this.search.setAttribute('aria-label', ui.text('book.search'));
    this.search.addEventListener('input', () => {
      this.query = this.search.value;
      this.page = 0;
      this.popup = null;
      this.render();
    }, {signal: this.abort.signal});
    for (const event of ['select', 'keyup', 'pointerup', 'focus', 'blur']) this.search.addEventListener(event, () => this.paint(), {signal: this.abort.signal});
    this.root.append(this.canvas, this.controls, this.search);
    body.prepend(this.root);
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'recipe-book-toggle';
    this.toggle.setAttribute('aria-label', ui.text('book.toggle'));
    this.toggle.addEventListener('click', () => {
      ui.input.cancelGesture();
      this.change({open: !this.isOpen()});
    }, {signal: this.abort.signal});
    ui.panel.append(this.toggle);
    this.toast = document.createElement('canvas');
    this.toast.width = 160;
    this.toast.height = 32;
    this.toast.className = 'recipe-toast';
    this.toast.setAttribute('role', 'status');
    this.toast.hidden = true;
    document.addEventListener('visibilitychange', () => {if (document.hidden) this.clearToast();}, {signal: this.abort.signal});
    ui.host.append(this.toast);
    this.root.addEventListener('pointerenter', () => {
      ui.hover = null;
      ui.hideTooltip();
    }, {signal: this.abort.signal});
    this.root.addEventListener('contextmenu', e => e.preventDefault(), {signal: this.abort.signal});
    this.clock = window.setInterval(() => {
      if (ui.modal.open && !document.hidden) {
        this.paint();
        if (this.ghost) ui.draw(false);
      }
    }, 1000);
  }

  /** Identify a temporary display by save generation, personal lifetime and actual menu capability.
   * @return {string} Stable scope independent of book visibility, processing timers and settings.
   */
  scope(): string {
    return JSON.stringify([this.ui.generation, this.ui.personal.epoch, this.ui.permanent?.progress.scene, this.ui.modal.open && this.ui.tab === 'crafting' && this.ui.station?.expected.version !== 3 ? [this.ui.station?.id ?? 'personal', this.mode(), this.width()] : null]);
  }

  /** Publish temporary display diagnostics separately from all real item carriers. */
  publish(): void {
    this.ui.modal.dataset.book = JSON.stringify({
      generation: this.ui.generation,
      identity: this.identity,
      mode: this.mode(),
      width: this.width(),
      open: !this.root.hidden,
      query: this.query,
      category: this.category,
      page: this.page,
      groups: this.groups.length,
      recipes: this.groups.flatMap(g => g.recipes.map(r => r.id)),
      ghost: this.ghost?.id ?? null,
      popup: this.popup?.key ?? null,
      overlay: this.body.classList.contains('book-only'),
      toast: !this.toast.hidden,
      toastRecipes: this.toast.dataset.recipes ?? null
    });
  }

  /** Clear a notification and fence its pending animation without touching permanent discovery. */
  clearToast(): void {
    this.toastSlots?.release(this);
    this.toastEpoch++;
    this.animationEpoch = (this.animationEpoch ?? 0) + 1;
    cancelAnimationFrame(this.animationFrame); this.animationFrame = 0;
    this.toastClock?.clear(); this.toastPhase = '';
    clearTimeout(this.toastTimer); clearTimeout(this.toastExitTimer);
    this.toastTimer = 0;
    this.toast.hidden = true;
    this.toast.getContext('2d')!.clearRect(0, 0, 160, 32);
    delete this.toast.dataset.recipes;
    this.toast.removeAttribute('aria-label');
    this.publish();
  }

  /** Invalidate menu-owned projections and callbacks; a save replacement also clears the global discovery toast.
   * @param {boolean} notification Whether the save generation or owner is ending.
   */
  resetTransient(notification = false): void {
    this.displayEpoch++;
    this.generation = this.ui.generation;
    this.identity = '';
    this.ghost = null;
    this.ghostInputs = '';
    delete this.ui.modal.dataset.ghostAvailability;
    this.popup = null;
    this.query = '';
    this.search.value = '';
    this.page = 0;
    this.category = 'all';
    this.hover = '';
    this.signature = '';
    this.groups = [];
    this.root.hidden = true;
    this.body.classList.toggle('book-only', false);
    this.controls.replaceChildren();
    this.canvas.getContext('2d')!.clearRect(0, 0, 147, 166);
    this.ui.notice = '';
    this.ui.hideTooltip();
    if (notification) {this.clearToast(); this.pulseStarted?.clear(); this.pulses?.clear(); this.seenRequests?.clear();}
    this.publish();
  }

  /** Validate both discovered identity and current container dimensions.
   * @param {Recipe} recipe Candidate display recipe.
   * @return {boolean} Whether this save and menu can still show the recipe.
   */
  validRecipe(recipe: Recipe): boolean {
    return !!this.ui.permanent?.progress.recipeBook.data.known.includes(recipe.id) && bookApplicable(recipe, this.mode(), this.width());
  }

  /** Reconcile lifecycle before any timer, menu or ghost draw; closing only the book keeps the same scope. */
  syncScope(): void {
    if (this.disposed) return;
    if (this.generation !== this.ui.generation) this.resetTransient(true);
    const scope = this.scope();
    if (this.identity !== scope) {
      this.resetTransient();
      this.identity = scope;
    }
    if (this.ghost && (!this.validRecipe(this.ghost) || this.ghostInputs !== this.inputsSignature())) {
      this.ghost = null;
      this.ghostInputs = '';
    }
    if (this.popup && this.popup.recipes.some(r => !this.validRecipe(r))) this.popup = null;
  }

  /** Reject detached controls and asynchronous errors belonging to a previous menu or save.
   * @param {number} epoch Captured temporary display epoch.
   * @param {string} scope Captured menu identity.
   * @return {boolean} Whether a callback still owns the active screen.
   */
  current(epoch: number, scope: string): boolean {
    return !this.disposed && !this.ui.disposed && epoch === this.displayEpoch && scope === this.identity && scope === this.scope();
  }

  /** Resolve capability without confusing a hopper with a crafting station. @return {BookMode} Applicable processing family. */
  mode(): BookMode {
    return this.ui.station?.expected.version === 2 ? this.ui.machineKind() : 'crafting';
  }

  /** Resolve actual crafting dimensions. @return {number} Personal two, table three, processor one. */
  width(): number {
    return this.ui.station?.expected.version === 2 ? 1 : this.ui.station ? 3 : 2;
  }

  /** Read persisted open state. @return {boolean} Whether this capability's book is open. */
  isOpen(): boolean {
    return !!this.ui.permanent?.progress.recipeBook.data.views[this.mode()].open;
  }

  /** Persist only native open/filter settings through the semantic save port.
   * @param {object} patch User book preference.
   */
  change(patch: { open?: boolean; filter?: boolean }): void {
    const epoch = this.displayEpoch, scope = this.identity;
    this.popup = null;
    void this.ui.bookCommand?.({type: 'book-settings', mode: this.mode(), patch}).catch(() => {
      if (!this.current(epoch, scope)) return;
      this.ui.reportFailure('book.failed');
      this.ui.draw(false);
    });
  }

  /** Resolve original GUI-relative images. @param {string} path Sprite path. @return {HTMLCanvasElement} Verified native pixels. */
  image(path: string): HTMLCanvasElement {
    return this.ui.image(path);
  }

  /** Position and localize one book without recreating active search or slot controls on timer snapshots. */
  render(): void {
    if (this.disposed) return;
    this.syncScope();
    const u = this.ui,
        available = u.modal.open && u.tab === 'crafting' && (!u.station || u.station.expected.version === 1 || u.station.expected.version === 0),
        id = this.identity;
    this.toggle.hidden = !available;
    const open = available && this.isOpen();
    this.root.hidden = !open;
    const overlay = open && (u.viewport?.clientWidth ?? innerWidth) < 379 * u.scale;
    this.body.classList.toggle('book-only', overlay);
    const ratio = Math.min(globalThis.devicePixelRatio ?? 1, 4),
        width = open ? (overlay ? 147 + 28 : 147 + 28 + 4 + 176) : u.tab === 'crafting' ? 176 : 195,
        viewport = Math.round((u.viewport?.clientWidth ?? innerWidth) * ratio),
        physical = Math.round(width * u.scale * ratio),
        snap = Math.abs((viewport - physical) % 2) ? -.5 / ratio : 0,
        tabs = u.modal.querySelector?.<HTMLElement>('.inventory-tabs');
    this.body.style.transform = `translateX(${snap}px)`;
    if (tabs) {
      tabs.hidden = !!u.station || overlay;
      // Relative positioning keeps selected tabs in the container's shared stacking context.
      tabs.style.left = `${(open && !overlay ? (147 + 28 + 4) * u.scale / 2 : 0) + snap}px`;
    }
    const tx = u.station?.expected.version === 2 ? 20 : u.station ? 5 : 104,
        ty = u.station?.expected.version === 2 ? 35 : u.station ? 35 : 60;
    this.toggle.style.cssText = `left:${tx * u.scale}px;top:${ty * u.scale}px;width:${20 * u.scale}px;height:${18 * u.scale}px`;
    this.toggle.style.setProperty('--native-book-highlight', `url(${(import.meta.env?.BASE_URL ?? '/')}minecraft/26.3/assets/minecraft/textures/gui/sprites/recipe_book/button_highlighted.png)`);
    this.toggle.style.backgroundImage = `url(${(import.meta.env?.BASE_URL ?? '/')}minecraft/26.3/assets/minecraft/textures/gui/sprites/recipe_book/button.png)`;
    this.root.style.cssText = `width:${147 * u.scale}px;height:${166 * u.scale}px;margin-left:${28 * u.scale}px`;
    this.canvas.style.width = 147 * u.scale + 'px';
    this.canvas.style.height = 166 * u.scale + 'px';
    this.search.style.cssText = `left:${25 * u.scale}px;top:${13 * u.scale}px;width:${81 * u.scale}px;height:${14 * u.scale}px;font-size:${9 * u.scale}px`;
    if (!open) {
      this.publish();
      return;
    }
    const settings = u.permanent!.progress.recipeBook.data.views[this.mode()],
        known = new Set(u.permanent!.progress.recipeBook.data.known), query = this.query.trim().toLowerCase(),
        groups = new Map<string, RecipeGroup>();
    for (const recipe of BOOK_RECIPES) {
      if (!known.has(recipe.id) || !bookApplicable(recipe, this.mode(), this.width()) || this.category !== 'all' && (recipe.category ?? 'misc') !== this.category || query && !matchesItem(recipe.result!.id!, query) && !recipe.id.toLowerCase().includes(query) || settings.filter && !this.craftable(recipe)) continue;
      const key = recipe.type + ':' + (recipe.category ?? 'misc') + ':' + (recipe.group || recipe.id);
      if (!groups.has(key)) groups.set(key, {key, recipes: []});
      groups.get(key)!.recipes.push(recipe);
    }
    this.groups = [...groups.values()];
    this.page = Math.min(this.page, Math.max(0, Math.ceil(this.groups.length / 20) - 1));
    const signature = JSON.stringify([id, u.permanent?.settings.locale, u.scale, this.page, this.category, this.query, this.groups.map(g => g.key), settings.filter, this.popup?.key, overlay]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.buildControls();
    }
    this.startPulses();
    this.acknowledgeVisible();
    this.paint();
    this.publish();
  }

  /** Refresh semantic book controls after a committed display-language change. */
  localize(): void {
    this.search.setAttribute('aria-label', this.ui.text('book.search'));
    this.toggle.setAttribute('aria-label', this.ui.text('book.toggle'));
  }

  /** Determine material qualification separately from current grid conflicts and product acquisition.
   * @param {Recipe} recipe Applicable discovered recipe.
   * @return {boolean} Whether finite owned groups fit all requirements and current inputs.
   */
  craftable(recipe: Recipe): boolean {
    return analyzeOwnedRecipe(recipe, this.mode(), this.width(), this.ui.value.workbench ?? this.ui.value.crafting ?? Array(4).fill(null), [...this.ui.value.backpack, ...this.ui.value.hotbar], this.ui.rules, 1, false).complete;
  }

  /** Capture actual inputs only; a ghost cannot participate in this signature. @return {string} Stable real-input identity. */
  inputsSignature(): string {
    return JSON.stringify(this.ui.station?.expected.version === 2 ? [this.ui.station.expected.data.input] : this.ui.value.workbench ?? this.ui.value.crafting);
  }

  /** Add a semantic original-pixel hit target; a press begun during a receipt cannot become a later fill.
   * @param {string} label External localized accessibility text.
   * @param {number[]} box Logical native bounds.
   * @param {string} key Hover identity.
   * @param {Function} action Completed activation.
   * @param {Function} alternate Optional original right-click group expansion.
   * @param {string[]} tooltip Native item name and optional group hint.
   */
  hit(label: string, box: number[], key: string, action: (event: MouseEvent) => void, alternate?: () => void, tooltip: string[] = [label]): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recipe-book-hit';
    b.setAttribute('aria-label', label);
    b.dataset.bookControl = key;
    b.style.cssText = `left:${box[0] * this.ui.scale}px;top:${box[1] * this.ui.scale}px;width:${box[2] * this.ui.scale}px;height:${box[3] * this.ui.scale}px`;
    const epoch = this.displayEpoch, scope = this.identity;
    let blockedPress = false, rightPress = false;
    b.addEventListener('pointerdown', e => {
      rightPress = e.button === 2;
      blockedPress = !this.current(epoch, scope) || this.ui.carrierBusy();
    });
    b.addEventListener('click', e => {
      if (blockedPress || !this.current(epoch, scope)) {
        blockedPress = false;
        return;
      }
      action(e);
    });
    b.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (rightPress && !blockedPress && this.current(epoch, scope) && !this.ui.carrierBusy()) alternate?.();
      rightPress = false;
    });
    b.addEventListener('pointerenter', e => {
      if (!this.current(epoch, scope)) return;
      this.ui.hover = null;
      this.hover = key;
      this.paint();
      this.ui.showTooltipText(tooltip, e.clientX, e.clientY);
    });
    b.addEventListener('focus', () => {
      if (!this.current(epoch, scope)) return;
      this.hover = key; this.paint();
      const rect = b.getBoundingClientRect(); this.ui.showTooltipText(tooltip, rect.right, rect.top);
    });
    b.addEventListener('blur', () => {if (this.current(epoch, scope)) {this.hover = ''; this.ui.hideTooltip(); this.paint();}});
    b.addEventListener('pointerleave', () => {
      if (!this.current(epoch, scope)) return;
      this.hover = '';
      this.ui.hideTooltip();
      this.paint();
    });
    this.controls.append(b);
  }

  /** List native category tab identities for the current processing family. @return {string[]} Original category order. */
  categories(): string[] {
    return this.mode() === 'crafting' ? ['all', 'equipment', 'building', 'misc', 'redstone'] : this.mode() === 'furnace' ? ['all', 'food', 'blocks', 'misc'] : ['all', 'blocks', 'misc'];
  }

  /** Rebuild hit targets only when geometry or the filtered page changes. */
  buildControls(): void {
    this.controls.replaceChildren();
    const pageGroups = this.groups.slice(this.page * 20, this.page * 20 + 20);
    this.categories().forEach((category, i) => this.hit(this.ui.text('book.category.' + category), [-28, 3 + i * 27, 35, 27], 'tab:' + category, () => {
      this.category = category;
      this.page = 0;
      this.popup = null;
      this.render();
    }));
    this.hit(this.ui.text('book.filter'), [110, 12, 26, 16], 'filter', () => this.change({filter: !this.ui.permanent!.progress.recipeBook.data.views[this.mode()].filter}));
    pageGroups.forEach((group, i) => this.hit(this.ui.text('book.recipe', {
      item: this.ui.name(group.recipes[0].result!.id!),
      variants: group.recipes.length
    }), [11 + i % 5 * 25, 31 + Math.floor(i / 5) * 25, 25, 25], 'recipe:' + i, e => this.choose(group.recipes[Math.floor(performance.now() / 1000) % group.recipes.length], e.shiftKey), () => {
      if (group.recipes.length < 2) return;
      this.popup = group;
      this.render();
    }, [this.ui.name(group.recipes[0].result!.id!), ...(group.recipes.length > 1 ? [this.ui.text('book.more')] : [])]));
    if (this.page > 0) this.hit(this.ui.text('book.previous'), [38, 137, 12, 17], 'previous', () => {
      this.page--;
      this.popup = null;
      this.render();
    });
    if ((this.page + 1) * 20 < this.groups.length) this.hit(this.ui.text('book.next'), [93, 137, 12, 17], 'next', () => {
      this.page++;
      this.popup = null;
      this.render();
    });
    if (this.body.classList.contains('book-only')) this.hit(this.ui.text('book.toggle'), [126, 146, 20, 18], 'close', () => this.change({open: false}));
    if (this.popup) {
      const cols = Math.min(4, this.popup.recipes.length);
      this.popup.recipes.forEach((recipe, i) => this.hit(this.ui.name(recipe.result!.id!), [7 + i % cols * 25, 37 + Math.floor(i / cols) * 25, 24, 24], 'variant:' + i, e => this.choose(recipe, e.shiftKey)));
    }
    this.startPulses();

  }

  /** Draw original layout, result icons and small native ingredient overlays without changing any slot. */
  paint(): void {
    if (this.disposed) return;
    this.syncScope();
    if (this.root.hidden) return;
    const u = this.ui, c = scaledCanvas(this.canvas, 147, 166, u.scale), frame = Math.floor(performance.now() / 1000);
    c.clearRect(-28, 0, 175, 166);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.image('recipe_book'), 0, 0, 147, 166, 0, 0, 147, 166);
    const filter = u.permanent!.progress.recipeBook.data.views[this.mode()].filter;
    this.sprite(c, (this.mode() === 'crafting' ? 'filter' : 'furnace_filter') + '_' + (filter ? 'enabled' : 'disabled') + (this.hover === 'filter' ? '_highlighted' : ''), 110, 12, 26, 16);
    const fieldPath = 'assets/minecraft/textures/gui/sprites/widget/text_field' + (document.activeElement === this.search ? '_highlighted' : '') + '.png';
    drawSprite(c, this.image('sprites/widget/text_field' + (document.activeElement === this.search ? '_highlighted' : '')), u.art.documents.get(fieldPath + '.mcmeta')?.gui?.scaling, 25, 13, 81, 14);
    nativeField(c, u.pixels.font, this.search, [29, 16, 73, 9], {hint: u.text('book.searchHint'), italicHint: true, inset: 4});
    this.groups.slice(this.page * 20, this.page * 20 + 20).forEach((group, i) => {
      const r = group.recipes[frame % group.recipes.length], x = 11 + i % 5 * 25, y = 31 + Math.floor(i / 5) * 25,
          pulse = recipePulse(performance.now() - (this.pulses?.get('recipe:' + group.key) ?? -Infinity));
      c.save(); c.translate(x + 8, y + 12); c.scale(pulse, pulse); c.translate(-x - 8, -y - 12);
      this.sprite(c, 'slot_' + (group.recipes.length > 1 ? 'many_' : '') + (this.craftable(r) ? 'craftable' : 'uncraftable'), x, y, 25, 25);
      if (group.recipes.length > 1) u.stack(c, {id: r.result!.id!, count: 1}, x + 5, y + 5);
      u.stack(c, {id: r.result!.id!, count: 1}, x + 4, y + 4);
      c.restore();
    });
    this.canvas.dataset.pulses = JSON.stringify(this.groups.slice(this.page * 20, this.page * 20 + 20).map(group => ({key: group.key, scale: recipePulse(performance.now() - (this.pulses?.get('recipe:' + group.key) ?? -Infinity)), started: this.pulses?.get('recipe:' + group.key) ?? null, pivot: [8,12]})));
    const pages = Math.max(1, Math.ceil(this.groups.length / 20)),
        counter = u.text('book.page', {page: this.page + 1, pages});
    u.pixels.font.draw(c, counter, 73 - u.pixels.font.width(counter) / 2, 141, '#FFF', false);
    if (this.page > 0) this.sprite(c, 'page_backward' + (this.hover === 'previous' ? '_highlighted' : ''), 38, 137, 12, 17);
    if (this.page + 1 < pages) this.sprite(c, 'page_forward' + (this.hover === 'next' ? '_highlighted' : ''), 93, 137, 12, 17);
    if (this.body.classList.contains('book-only')) this.sprite(c, 'button', 126, 146, 20, 18);
    for (const [i, category] of this.categories().entries()) {
      const b = this.controls.querySelector<HTMLButtonElement>('[data-book-control="tab:' + category + '"]');
      if (!b) continue;
      let tile = b.querySelector('canvas');
      if (!tile) {tile = document.createElement('canvas'); b.append(tile);}
      const tc = scaledCanvas(tile, 37, 33, u.scale);
      tc.clearRect(0, 0, 37, 33);
      tile.style.position = 'absolute'; tile.style.left = -2 * u.scale + 'px';
      tile.style.top = -3 * u.scale + 'px'; tile.style.width = 37 * u.scale + 'px'; tile.style.height = 33 * u.scale + 'px'; tile.style.pointerEvents = 'none';
      tc.imageSmoothingEnabled = false;
      const pulse = recipePulse(performance.now() - (this.pulses?.get('tab:' + category) ?? -Infinity));
      tc.save(); tc.translate(0, 3); tc.translate(8, 12); tc.scale(1, pulse); tc.translate(-8, -12);
      tc.drawImage(this.image('sprites/recipe_book/tab' + (category === this.category ? '_selected' : '')), category === this.category ? 0 : 2, 0);
      const icons: Record<string, string[]> = {
        all: ['compass'],
        equipment: ['iron_axe', 'golden_sword'],
        building: ['bricks'],
        misc: this.mode() === 'crafting' ? ['lava_bucket', 'apple'] : ['iron_ingot'],
        redstone: ['redstone'],
        food: ['cooked_porkchop'],
        blocks: ['stone']
      };
      icons[category].forEach((id, k) => u.stack(tc, {
        id: 'minecraft:' + id,
        count: 1
      }, icons[category].length > 1 ? 5 + k * 12 : 11, 5));

      tc.restore();
      b.dataset.pulse = String(pulse);
      b.dataset.tabIndex = String(i);
    }
    if (this.popup) {
      const cols = Math.min(4, this.popup.recipes.length), w = cols * 25 + 8,
          h = Math.ceil(this.popup.recipes.length / cols) * 25 + 8,
          path = 'assets/minecraft/textures/gui/sprites/recipe_book/overlay_recipe.png';
      drawSprite(c, this.image('sprites/recipe_book/overlay_recipe'), u.art.documents.get(path + '.mcmeta')?.gui?.scaling, 3, 33, Math.max(32, w), Math.max(32, h));
      this.popup.recipes.forEach((recipe, i) => {
        const x = 7 + i % cols * 25, y = 37 + Math.floor(i / cols) * 25;
        this.sprite(c, (this.mode() === 'crafting' ? 'crafting' : 'furnace') + '_overlay' + (this.craftable(recipe) ? '' : '_disabled') + (this.hover === 'variant:' + i ? '_highlighted' : ''), x, y, 24, 24);
        recipeGhost(recipe, this.mode(), this.width(), u.permanent!.progress.unlocked, u.rules, frame).grid.forEach((s, n) => {
          if (!s) return;
          const icon = u.art.icons.get(s.id);
          if (icon) c.drawImage(icon, x + 3 + n % this.width() * 7, y + 3 + Math.floor(n / this.width()) * 7, 6, 6);
        });
      });
    }
  }

  /** Draw one original sprite at its exact logical bounds.
   * @param {CanvasRenderingContext2D} ctx Book plane.
   * @param {string} name Native sprite name.
   * @param {number} x Left coordinate.
   * @param {number} y Top coordinate.
   * @param {number} w Logical width.
   * @param {number} h Logical height.
   */
  sprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number): void {
    ctx.drawImage(this.image('sprites/recipe_book/' + name), x, y, w, h);
  }

  /** Select an actual native recipe; missing ingredients produce only a display projection.
   * @param {Recipe} recipe Applicable discovered recipe.
   * @param {boolean} max Shift bounded fill intent.
   */
  choose(recipe: Recipe, max: boolean): void {
    if (this.disposed || this.identity !== this.scope() || !this.validRecipe(recipe) || this.ui.carrierBusy() || this.ui.pending || !this.ui.writable) return;
    this.popup = null;
    if (!this.craftable(recipe)) {
      this.ghost = recipe;
      this.ghostInputs = this.inputsSignature();
      this.ui.notice = '';
      this.ui.draw();
    } else {
      this.ghost = null;
      this.ui.fillInputs(recipe.id, max);
    }
    if (this.body.classList.contains('book-only')) this.change({open: false});
  }

  /** Overlay genuine missing-material ghosts in the existing native inputs, never in carriers or persistence.
   * @param {CanvasRenderingContext2D} ctx Original container canvas.
   */
  drawGhost(ctx: CanvasRenderingContext2D): void {
    if (this.disposed) return;
    this.syncScope();
    this.publish();
    if (!this.ghost) {
      delete this.ui.modal.dataset.ghostAvailability;
      return;
    }
    const display = ownedRecipeGhost(this.ghost, this.mode(), this.width(), this.ui.value.workbench ?? this.ui.value.crafting ?? Array(4).fill(null), [...this.ui.value.backpack, ...this.ui.value.hotbar], this.ui.rules, Math.floor(performance.now() / 1000)),
        slots = this.ui.slots.filter(s => ['crafting', 'workbench', 'machine'].includes(s.kind));
    this.ui.modal.dataset.ghostAvailability = JSON.stringify({
      missing: display.missing,
      conflicts: display.conflicts,
      complete: display.complete,
      grid: display.grid
    });
    for (const [i, s] of display.grid.entries()) {
      const slot = slots[i];
      if (!s || !slot || this.ui.slotStack(slot)) continue;
      ctx.fillStyle = display.missing[i] ? '#FF000060' : '#FFFFFF30';
      ctx.fillRect(slot.x + 1, slot.y + 1, 16, 16);
      ctx.save();
      ctx.globalAlpha = .55;
      this.ui.stack(ctx, s, slot.x + 1, slot.y + 1);
      ctx.restore();
    }
    const output = this.ui.slots.find(slot => slot.kind === 'preview');
    if (output && !this.ui.preview.result && !(this.ui.station?.expected.version === 2 && this.ui.station.expected.data.output)) {
      ctx.save();
      ctx.globalAlpha = .55;
      this.ui.stack(ctx, {
        id: this.ghost.result!.id!,
        count: this.ghost.result!.count ?? 1
      }, output.x + 1, output.y + 1);
      ctx.restore();
    }
  }

  /** Acknowledge highlighted variants once they have actually entered the visible native page. */
  acknowledgeVisible(): void {
    if (!this.seenRequests || this.root.hidden) return;
    const viewed = this.groups.slice(this.page * 20, this.page * 20 + 20).flatMap(g => g.recipes.map(r => r.id)).filter(id => this.ui.permanent!.progress.recipeBook.data.unseen.includes(id) && !this.seenRequests.has(id));
    if (!viewed.length) return;
    viewed.forEach(id => this.seenRequests.add(id));
    const epoch = this.displayEpoch, scope = this.identity;
    void this.ui.bookCommand?.({type: 'book-seen', recipes: viewed}).catch(() => {if (this.current(epoch, scope)) viewed.forEach(id => this.seenRequests.delete(id));});
  }

  /** Start native pulses once per newly highlighted recipe, independently of the seen acknowledgement. */
  startPulses(): void {
    if (!this.pulses || this.root.hidden) return;
    const unseen = new Set(this.ui.permanent!.progress.recipeBook.data.unseen), now = performance.now(), recipes = BOOK_RECIPES.filter(r => unseen.has(r.id) && bookApplicable(r, this.mode(), this.width()));
    for (const category of this.categories()) {
      const fresh = recipes.filter(r => (category === 'all' || r.category === category) && !this.pulseStarted.has('tab:' + category + ':' + r.id));
      if (fresh.length) {this.pulses.set('tab:' + category, now); for (const r of fresh) this.pulseStarted.add('tab:' + category + ':' + r.id);}
    }
    for (const group of this.groups.slice(this.page * 20, this.page * 20 + 20)) {
      const fresh = group.recipes.filter(r => unseen.has(r.id) && !this.pulseStarted.has('recipe:' + r.id));
      if (fresh.length) {this.pulses.set('recipe:' + group.key, now); for (const r of fresh) this.pulseStarted.add('recipe:' + r.id);}
    }
    this.animate();
  }

  /** Coalesce bounded native control and toast animation; idle screens own no animation RAF. */
  animate(): void {
    if (this.animationFrame || this.disposed || document.hidden) return;
    const pending = this.toastClock?.active || !this.root.hidden && [...(this.pulses?.values() ?? [])].some(start => performance.now() - start < 750);
    if (!pending) return;
    const owner = this.animationEpoch;
    this.animationFrame = requestAnimationFrame(() => {
      if (owner !== this.animationEpoch) return;
      this.animationFrame = 0;
      if (this.disposed || document.hidden) return;
      this.paint(); this.paintToast(); this.animate();
    });
  }

  /** Merge newly committed discoveries into RecipeToast's single native notification.
   * @param {string[]} recipes Actual newly discovered recipe IDs.
   * @param {string} generation Source save generation.
   */
  notify(recipes: string[], generation = this.ui.generation): void {
    if (this.disposed || this.ui.disposed || generation !== this.ui.generation || document.hidden) return;
    this.syncScope(); recipes = recipes.filter(id => this.ui.permanent?.progress.recipeBook.data.known.includes(id));
    if (!recipes.length) return;
    this.toastClock ??= new RecipeToastClock();
    this.toastClock.add(recipes, performance.now());
    this.toast.dataset.recipes = JSON.stringify(this.toastClock.entries);
    this.toast.setAttribute('aria-label', this.ui.text('book.newTitle') + ' ' + this.ui.text('book.newDescription'));
    this.toastEpoch++; clearTimeout(this.toastTimer); clearTimeout(this.toastExitTimer);
    this.paintToast(); this.animate(); this.render(); this.publish();
  }

  /** Draw RecipeToast at ToastInstance's squared slide offset and native icon-cycle time. */
  paintToast(): void {
    if (!this.toastClock?.active || this.disposed) return;
    const row=this.toastSlots?.claim(this)??0;
    if(row<0)return;
    const sample = this.toastClock.sample(performance.now());
    if (sample.transition) this.sound?.(sample.transition === 'show' ? 'ui.toast.in' : 'ui.toast.out');
    this.toastPhase = sample.phase;
    if (sample.phase === 'done') {this.clearToast(); return;}
    const scale = this.ui.scale, c = scaledCanvas(this.toast, 160, 32, scale), r = BOOK_RECIPES.find(r => r.id === this.toastClock.entries[sample.index]);
    c.clearRect(0, 0, 160, 32); c.drawImage(this.image('sprites/toast/recipe'), 0, 0);
    this.ui.pixels.font.draw(c, this.ui.text('book.newTitle'), 30, 7, '#500050', false);
    this.ui.pixels.font.draw(c, this.ui.text('book.newDescription'), 30, 18, '#000000', false);
    c.save(); c.scale(.6, .6); this.ui.stack(c, {id: r?.type === 'minecraft:blasting' ? 'minecraft:blast_furnace' : r?.type === 'minecraft:smelting' ? 'minecraft:furnace' : 'minecraft:crafting_table', count: 1}, 3, 3); c.restore();
    if (r) this.ui.stack(c, {id: r.result!.id!, count: 1}, 8, 8);
    this.toast.style.width = 160 * scale + 'px'; this.toast.style.height = 32 * scale + 'px';
    this.toast.style.top = row * 32 * scale + 'px';
    this.toast.style.transform = `translateX(${160 * scale * (1 - sample.visible)}px)`;
    alignRaster(this.toast,true);
    this.toast.dataset.timeline = JSON.stringify({...sample, started: this.toastClock.started, changed: this.toastClock.changed, at: performance.now(), recipes: this.toastClock.entries});
    this.toast.hidden = false;
  }

  /** Release book-only timers, hit targets and notifications with the owning formal screen. */
  dispose(): void {
    this.disposed = true;
    this.resetTransient(true);
    this.abort.abort();
    clearInterval(this.clock);
    cancelAnimationFrame(this.animationFrame); this.animationFrame = 0;
    this.root.remove();
    this.toggle.remove();
    this.toast.remove();
  }
}
