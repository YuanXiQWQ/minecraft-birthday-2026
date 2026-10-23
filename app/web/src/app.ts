/** Formal page composition connects localized screen UI, domain transactions, persistence and independent 3D presentation. */
import {NativeScreens} from './ui/native-screens.ts';
import {GameChat} from './ui/chat.ts';
import {systemFeedback, FAILURE_COLOR} from './ui/system-feedback.ts';
import {harvestFeedback} from './ui/harvest-feedback.ts';
import {itemColor} from './ui/item-style.ts';
import {BirthdayCelebration} from './celebration/birthday.ts';
import {itemName} from './i18n/items.ts';
import {WorldUse} from './ui/world-use.ts';
import {WorldAudio} from './render/world-audio.ts';
import {WORLD_REGION, WORLD_SCENES} from './domain/world-config.ts';
import type {SceneId} from './domain/types.ts';
import {SettingsEdits} from './ui/settings-edits.ts';
import type {SettingKey} from './ui/settings-edits.ts';
import {processingClock} from './persistence/processing-clock.ts';
import birthday from './birthday.json' with {type: 'json'};
import {translate, loadLocale, ENGLISH} from './i18n/index.ts';
import type {Dictionary} from './i18n/index.ts';
import {browserSession} from './persistence/browser.ts';
import {token} from './persistence/codec.ts';
import type {Snapshot} from './persistence/session.ts';
import {hasCake, initialRuntime} from './domain/state.ts';
import {loadResources} from './render/resources.ts';
import {SceneView} from './render/scene.ts';
import {PixelUI} from './ui/pixels.ts';
import './style.css';
import {freeze} from './domain/state.ts';
import {GameInventory} from './ui/inventory.ts';
import {loadCatalogueArt} from './ui/icons.ts';
import {loadRules} from './rules/load.ts';

/** Mount one formal entry; language overrides are ordinary localization inputs, not gameplay or completion hooks.
 * @param {'home'|'game'} page Independent entry identity.
 * @param {Dictionary} locale Optional loaded locale catalogue.
 * @return {Promise<void>} Page initialization, with visible localized capability/resource failures.
 */
export async function mount(page: 'home' | 'game', locale: Dictionary = {}): Promise<void> {
    const root = document.getElementById('app')!, base = import.meta.env.BASE_URL;
    let dictionary = locale, pixels: PixelUI | null = null, scene: SceneView | null = null, disposed = false,
        confirmation: string | null = null, confirmationSerial = 0, resetting = false, localeGeneration = 0;
    const appAbort = new AbortController();
    const edits = new SettingsEdits(), runtime = initialRuntime(), connection = browserSession(),
        session = connection.session,
        bindings = new Map<HTMLElement, { key: string; values: Record<string, string | number> }>();
    let celebration: BirthdayCelebration | null = null, chat: GameChat | null = null;
    let menu: HTMLDialogElement | null = null, optionsPage = 'options', lastPointerEscape = -Infinity;
    let languageChoice: HTMLButtonElement | null = null;
    const nativeScreens: NativeScreens[] = [];
    let lastSaveStatus = '', lastFeedbackGeneration = '', taught = false;
    const pendingMessages: {key: string; values: Record<string,string|number>}[] = [];
    const feedbackStates = new Map<string,string>();
    const inputBlocked = () => dialog.open || !!menu?.open || !!chat?.open;
    const updateGate = (inventoryOpen = !!inventory?.modal.open) => {const open = inputBlocked() || inventoryOpen; host.dataset.overlay = String(open); host.dataset.effect = dialog.open || menu?.open ? 'menu' : inventoryOpen ? 'container' : 'none'; scene?.setInputEnabled(!open);};
    let worldUse: WorldUse | null = null, worldAudio: WorldAudio | null = null, lastWorldScene: SceneId | null = null;
    let runtimeGeneration: string | null = null, inventory: GameInventory | null = null,
        stopProcessing: (() => void) | null = null;
    const t = (key: string, values: Record<string, string | number> = {}) => translate(key, {...birthday, ...values}, dictionary);

    /** Build a semantic localized element, retaining its key for future language changes.
     * @param {string} tag Semantic HTML tag.
     * @param {string} key Locale key.
     * @param {string} className Styling hook.
     * @param {Record<string,string|number>} values Named text parameters.
     * @return {HTMLElement} Localized node.
     */
    function node(tag: string, key: string, className = '', values: Record<string, string | number> = {}): HTMLElement {
        const n = document.createElement(tag);
        n.className = className;
        setText(n, key, values);
        return n;
    }

    /** Update text through the localization boundary, never accepting business strings as visible copy.
     * @param {HTMLElement} target Semantic element.
     * @param {string} key Locale key.
     * @param {Record<string,string|number>} values Interpolation values.
     */
    function setText(target: HTMLElement, key: string, values: Record<string, string | number> = {}): void {
        if (page === 'game' && (target.classList.contains('selection') || target.classList.contains('table-caption') && key.startsWith('error.'))) feedback(key, values, target.classList.contains('selection') ? 'selection' : 'graphics');
        bindings.set(target, {key, values});
        if (pixels) pixels.text(target, t(key, values), target.tagName === 'H1' ? 3 : 2); else target.textContent = t(key, values);
    }

    /** Route actual feedback transitions to chat, retaining a visible pre-initialization fallback.
     * @param {string} key Localized event message.
     * @param {Record<string,string|number>} values Message parameters.
     * @param {string} boundary Optional state-transition deduplication boundary.
     */
    function feedback(key: string, values: Record<string,string|number> = {}, boundary = ''): void {
        const disposition = systemFeedback(key);
        if (disposition === 'omit') return;
        const signature = JSON.stringify([key,values]);
        if (boundary && feedbackStates.get(boundary) === signature) return;
        if (boundary) feedbackStates.set(boundary, signature);
        if (chat) chat.append([{text: t(key,values), ...(disposition === 'failure' ? {color: FAILURE_COLOR} : {})}], 'system');
        else {pendingMessages.push({key,values}); if (pendingMessages.length > 20) pendingMessages.shift();}
    }

    /** Create an accessible original-sprite action without embedding any test or completion control.
     * @param {string} key Locale key.
     * @param {Function} action User action.
     * @return {HTMLButtonElement} Bound button.
     */
    function button(key: string, action: () => void): HTMLButtonElement {
        const b = node('button', key) as HTMLButtonElement;
        b.type = 'button';
        b.addEventListener('click', action);
        if (pixels) pixels.button(b);
        return b;
    }

    document.title = t(page === 'home' ? 'html.homeTitle' : 'html.gameTitle');
    document.documentElement.lang = 'en';
    root.className = page;
    root.dataset.build = import.meta.env.BUILD_ID;
    const header = document.createElement('header'),
        brand = node('p', page === 'home' ? 'home.eyebrow' : 'game.eyebrow', 'brand'),
        main = document.createElement('main'), copy = document.createElement('article'),
        host = document.createElement('section'), caption = node('p', 'common.loading', 'table-caption'),
        saveStatus = node('p', 'common.loading', 'save-status'), selection = document.createElement('p');
    main.className = page + '-layout';
    copy.className = 'copy';
    host.className = 'scene-panel';
    host.id = 'scene';
    selection.className = 'selection';
    selection.setAttribute('aria-live', 'polite');
    saveStatus.setAttribute('aria-label', t('a11y.save'));
    saveStatus.setAttribute('role', 'status');
    caption.id = 'table-caption';
    const title = node('h1', page === 'home' ? 'home.title' : 'game.title'),
        story = node('p', page === 'home' ? 'home.story' : 'game.note', 'story');
    copy.append(title, story);
    host.append(caption);
    header.append(brand);
    const link = node('a', page === 'home' ? 'home.invite' : 'game.back', 'invite') as HTMLAnchorElement;
    link.href = page === 'home' ? base + 'game/' : base;
    link.id = 'invitation';
    copy.append(link);
    main.append(copy, host);
    root.append(header, main, selection, saveStatus);
    const dialog = document.createElement('dialog');
    dialog.className = 'settings';
    dialog.setAttribute('aria-label', t('settings.title'));
    dialog.id = 'settings';
    const dialogTitle = node('h2', 'settings.title'), languageLabel = node('label', 'settings.language'),
        language = document.createElement('select'), option = document.createElement('option');
    option.value = 'en';
    option.textContent = t('settings.english');
    language.id = 'language';
    languageLabel.setAttribute('for', language.id);
    language.append(option);
    const volumeLabel = node('label', 'settings.volume', 'volume-label', {percent: 20});
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '.05';
    volume.id = 'volume';
    volumeLabel.setAttribute('for', volume.id);
    const muteLabel = node('label', 'settings.muted'), mute = document.createElement('input');
    mute.type = 'checkbox';
    mute.id = 'mute';
    muteLabel.setAttribute('for', mute.id);
    const warning = node('p', 'settings.resetNote', 'reset-note'), confirmSection = document.createElement('section');
    confirmSection.hidden = true;
    confirmSection.id = 'reset-confirmation';
    confirmSection.append(node('h3', 'settings.resetTitle'), node('p', 'settings.resetNote'));
    const preferenceFeedback = document.createElement('p'), resetFeedback = document.createElement('p');
    preferenceFeedback.id = 'preference-feedback';
    resetFeedback.id = 'reset-feedback';
    for (const n of [preferenceFeedback, resetFeedback]) n.setAttribute('role', 'status');
    const confirmReset = button('settings.confirm', () => {
        if (!confirmation || resetting) return;
        const confirmed = confirmation, serial = confirmationSerial;
        resetting = true;
        confirmReset.disabled = cancelReset.disabled = true;
        edits.cancel();
        paintSettings();
        void session.reset(confirmed, serial).then(() => {
            confirmation = null;
            confirmSection.hidden = true;
            setText(resetFeedback, 'settings.resetDone');
        }).catch(error => {
            confirmation = null;
            confirmSection.hidden = true;
            setText(resetFeedback, error instanceof Error && error.message === 'confirmation-stale' ? 'error.confirmation-stale' : 'settings.resetFailed');
        }).finally(() => {
            if (disposed) return;
            resetting = false;
            confirmReset.disabled = cancelReset.disabled = false;
            paintSettings();
        });
    });
    const cancelReset = button('settings.cancel', () => {
        confirmation = null;
        confirmSection.hidden = true;
        reset.focus();
    });
    confirmSection.append(confirmReset, cancelReset);
    const reset = button('settings.reset', () => {
        const value = session.view;
        if (!value.writable || !value.envelope || resetting) return;
        confirmation = token(value.envelope);
        confirmationSerial = session.serial;
        clearText(resetFeedback);
        confirmSection.hidden = false;
        confirmReset.focus();
    });
    const close = button('menu.done', () => {if (optionsPage !== 'options') showOptions('options'); else {dialog.close(); if (page === 'game') openMenu();}}), retry = button('common.retry', () => {
        void session.refresh();
    });
    retry.id = 'retry-save';
    dialog.append(dialogTitle, languageLabel, language, volumeLabel, volume, mute, muteLabel, preferenceFeedback, warning, reset, confirmSection, resetFeedback, close);
    (page === 'game' ? host : root).append(dialog); root.append(retry);
    const settings = button('common.settings', () => {
        inventory?.input.cancel();
        runtime.screen = 'settings';
        scene?.setInputEnabled(false);
        edits.cancel();
        paintSettings();
        clearText(preferenceFeedback);
        clearText(resetFeedback);
        confirmation = null;
        confirmSection.hidden = true;
        if (page === 'game') {showOptions('options'); dialog.show();} else {showOptions('options'); dialog.showModal();}
        updateGate();
        close.focus();
    });
    if (page === 'home') header.append(settings);
    dialog.addEventListener('close', () => {
        runtime.screen = inventory?.modal.open ? 'inventory' : 'scene';
        updateGate();
        edits.cancel();
        paintSettings();
        clearText(preferenceFeedback);
        confirmation = null;
        confirmSection.hidden = true;
        if (page === 'home') settings.focus();
    });
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'contextmenu']) dialog.addEventListener(type, event => {
        if (type === 'contextmenu') event.preventDefault();
        event.stopPropagation();
    });

    /** Remove transient feedback together with its localization binding.
     * @param {HTMLElement} target Feedback node.
     */
    function clearText(target: HTMLElement): void {
        bindings.delete(target);
        if (pixels) pixels.text(target, ''); else target.replaceChildren();
    }

    /** Project active drafts over authoritative preferences; progress snapshots never become edits. */
    function paintSettings(): void {
        const value = edits.view();
        if (value) {
            volume.value = String(value.volume);
            volume.dataset.nativeLabel = value.volume === 0 ? t('menu.volumeOff') : t('menu.volumeNative', {percent: Math.floor(value.volume * 100)});
            volume.setAttribute('aria-label', volume.dataset.nativeLabel);
            pixels?.updates.get(volume)?.();
            mute.checked = value.muted;
            setText(muteButton, value.muted ? 'settings.soundOff' : 'settings.soundOn');
            language.value = Array.from(language.options).some(option => option.value === value.locale) ? value.locale : 'en';
            setText(volumeLabel, 'settings.volume', {percent: Math.floor(value.volume * 100)});
        }
        language.disabled = volume.disabled = mute.disabled = muteButton.disabled = reset.disabled = !session.view.writable || resetting;
        if (languageChoice) languageChoice.disabled = language.disabled;
        worldAudio?.sync();
    }

    /** Submit one field against freshly locked settings and settle only this edit's receipt.
     * @param {SettingKey} key Changed preference.
     */
    function preferences(key: SettingKey): void {
        const draft = edits.submit(key);
        if (!draft) return;
        setText(preferenceFeedback, 'settings.saving');
        void session.dispatch({type: 'settings', patch: {[key]: draft.value}}).then(() => {
            if (disposed || !edits.finish(key, draft.ticket)) return;
            paintSettings();
            setText(preferenceFeedback, 'settings.saved');
        }).catch(() => {
            if (disposed || !edits.finish(key, draft.ticket)) return;
            paintSettings();
            setText(preferenceFeedback, 'settings.saveFailed');
        });
    }

    language.addEventListener('change', () => {
        edits.stage('locale', language.value);
        preferences('locale');
    });
    volume.addEventListener('input', () => {
        edits.stage('volume', Number(volume.value));
        clearText(preferenceFeedback);
        paintSettings();
    });
    volume.addEventListener('change', () => preferences('volume'));
    mute.addEventListener('change', () => {
        edits.stage('muted', mute.checked);
        preferences('muted');
    });

    /** Abandon only unfinished gestures on focus/cancel boundaries, leaving submitted commits intact. */
    function cancelSettingsGesture(): void {
        edits.cancelEditing();
        paintSettings();
    }

    dialog.addEventListener('pointercancel', cancelSettingsGesture);
    volume.addEventListener('blur', cancelSettingsGesture);
    window.addEventListener('blur', cancelSettingsGesture);

    /** Reflect one durable snapshot on either page, with no event replay or completion-trigger side effect.
     * @param {Snapshot} value Latest coordinated facts.
     */
    function reflect(value: Snapshot): void {
        if (inventory) inventory.writable = value.writable;
        if (value.envelope && runtimeGeneration !== value.envelope.generation) {
            runtimeGeneration = value.envelope.generation;
            worldAudio?.cancel();
            if (page === 'game' && lastFeedbackGeneration !== runtimeGeneration) {
                lastFeedbackGeneration = runtimeGeneration; taught = !!value.envelope.state.progress.unlocked.length; feedbackStates.clear();
                feedback('game.worldHint', {}, 'tutorial-controls');
            }
            scene?.mode?.suspend();
            scene?.cancel();
            scene?.showPreview(null);
            runtime.natural = {};
            runtime.celebration = 'idle';
        }
        root.dataset.saveStatus = value.status;
        root.dataset.hasCake = String(!!value.envelope && hasCake(value.envelope.state));
        root.dataset.generation = value.envelope?.generation ?? '';
        root.dataset.revision = String(value.envelope?.revision ?? '');
        if (value.envelope) {
            const s = value.envelope.state, placed = hasCake(s);
            root.dataset.completed = String(placed);
            celebration?.sync();
            if (page === 'game' && lastWorldScene !== s.progress.scene) {
                void inventory?.close(true);
                lastWorldScene = s.progress.scene;
            }
            inventory?.sync(s, value.writable, value.envelope.generation);
            if (page === 'home') scene?.setCake(placed);
            setText(caption, placed ? 'home.complete' : 'home.empty');
            if (page === 'home') setText(link, placed ? 'home.return' : 'home.invite');
            if (edits.generation && edits.generation !== value.envelope.generation) clearText(preferenceFeedback);
            edits.sync(s.settings, value.envelope.generation);
            paintSettings(); worldAudio?.sync();
            if (page === 'game' && scene) {
                scene.syncWorld(s.progress);
                scene.refreshHover();
                worldUse?.preview();
                for (const b of navigation.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-current', String(b.dataset.scene === s.progress.scene));
                feedback('scene.' + s.progress.scene, {}, 'scene');
                setText(caption, 'scene.' + s.progress.scene);
            }
            const generation = ++localeGeneration;
            void loadLocale(s.settings.locale).then(next => {
                if (disposed || generation !== localeGeneration) return;
                dictionary = {...next, ...locale};
                for (const [element, binding] of bindings) setText(element, binding.key, binding.values);
                document.title = t(page === 'home' ? 'html.homeTitle' : 'html.gameTitle');
                document.documentElement.lang = s.settings.locale === 'en' ? 'en' : Object.keys(next).length ? s.settings.locale : 'en';
            });
        } else if (value.status !== 'loading') setText(caption, 'status.unknown');
        paintSettings();
        saveStatus.dataset.ready = String(value.status === 'ready');
        retry.hidden = value.status === 'ready';
        const statusKey = value.status === 'ready' ? (value.migrated ? 'status.migrated' : 'status.ready') : value.status === 'loading' ? 'common.loading' : Object.hasOwn(ENGLISH, 'error.' + value.status) ? 'error.' + value.status : 'error.generic';
        setText(saveStatus, statusKey);
        if (page === 'game' && value.status !== lastSaveStatus && value.status !== 'loading') {feedback(statusKey, {}, 'storage'); lastSaveStatus = value.status;}
    }

    /** End an active inventory transaction before navigating to the independent birthday title. */
    async function quitToTitle(): Promise<void> {
        if (inventory && !await inventory.close()) return;
        if (inventory) await inventory.queue;
        dialog.close(); menu?.close(); chat?.hide();
        scene?.mode?.suspend(); scene?.cancel();
        if (!session.view.writable) {feedback('game.actionFailed'); return;}
        location.assign(base);
    }
    link.addEventListener('click', e => {if (page === 'game') {e.preventDefault(); void quitToTitle();}});
    const optionNavigation = document.createElement('div'), optionSections = new Map<string, HTMLElement>();
    const languageSection = document.createElement('section'), soundSection = document.createElement('section'), playerSection = document.createElement('section');
    const muteButton = button('settings.soundOn', () => {edits.stage('muted', !edits.view()?.muted); preferences('muted');});
    languageSection.append(languageLabel, language); soundSection.append(volumeLabel, volume, muteButton, mute, muteLabel);
    language.hidden = mute.hidden = muteLabel.hidden = true;
    const usernameLabel = node('label', 'menu.username'), username = document.createElement('input');
    username.id = 'username'; username.maxLength = 16; usernameLabel.setAttribute('for', username.id);
    const usernameFeedback = document.createElement('p'); usernameFeedback.setAttribute('role', 'status');
    playerSection.append(usernameLabel, username, usernameFeedback, button('menu.save', () => {
        if (!/^[A-Za-z0-9_]{3,16}$/.test(username.value)) {setText(usernameFeedback, 'menu.usernameInvalid'); return;}
        edits.stage('username', username.value); preferences('username');
    }), button('menu.cancel', () => showOptions('options')));
    optionSections.set('language', languageSection); optionSections.set('sound', soundSection); optionSections.set('player', playerSection);
    for (const id of ['language', 'sound', 'player']) optionNavigation.append(button('menu.' + id, () => showOptions(id)));
    /** Show only supported preference categories, preserving the existing settings draft and reset transactions.
     * @param {string} id Native option hierarchy node.
     */
    function showOptions(id: string): void {
        optionsPage = id; optionNavigation.hidden = id !== 'options';
        for (const [key, section] of optionSections) section.hidden = key !== id;
        for (const element of [warning, reset, confirmSection]) element.hidden = id !== 'options' || element === confirmSection && !confirmation;
        setText(dialogTitle, id === 'options' ? 'menu.options' : 'menu.' + id);
        if (id === 'player') {username.value = session.view.envelope?.state.settings.username ?? 'sireoh'; clearText(usernameFeedback); pixels?.updates.get(username)?.();}
        nativeScreens.forEach(view => view.layout());
        updateGate();
    }
    if (page === 'home') dialog.replaceChildren(dialogTitle, optionNavigation, languageSection, soundSection, playerSection, preferenceFeedback, warning, reset, confirmSection, resetFeedback, close);
    if (page === 'game') {
        dialog.replaceChildren(dialogTitle, optionNavigation, languageSection, soundSection, playerSection, preferenceFeedback, warning, reset, confirmSection, resetFeedback, close);

        menu = document.createElement('dialog'); menu.className = 'game-menu'; menu.id = 'game-menu';
        menu.append(node('h2', 'menu.title'), button('menu.back', () => {menu!.close(); updateGate();}), button('menu.options', () => {menu!.close(); settings.click();}), button('menu.quit', () => {void quitToTitle();}));
        host.append(menu);
        menu.addEventListener('close', () => updateGate());
        for (const view of [menu, dialog]) {
            view.addEventListener('cancel', e => e.preventDefault());
            for (const type of ['pointerdown', 'pointerup', 'wheel', 'contextmenu']) view.addEventListener(type, e => {e.stopPropagation(); if (type === 'contextmenu') e.preventDefault();});
        }
        document.addEventListener('keydown', e => {
            if (e.defaultPrevented || e.repeat) return;
            if (e.code === 'Escape') {
                if (performance.now() - lastPointerEscape < 150) {e.preventDefault(); return;}
                e.preventDefault(); e.stopImmediatePropagation();
                if (chat?.open) chat.hide();
                else if (inventory?.modal.open) void inventory.close();
                else if (dialog.open) {if (optionsPage !== 'options') showOptions('options'); else {dialog.close(); openMenu();}}
                else if (menu!.open) {menu!.close(); updateGate();}
                else openMenu();
            } else if (e.code === 'KeyT' && !inputBlocked() && !inventory?.modal.open && !(e.target instanceof HTMLInputElement)) {e.preventDefault(); chat?.show();}
        }, {signal: appAbort.signal});
    }
    /** Open the local pause interface without pausing the approved active simulation. */
    function openMenu(): void {if (page !== 'game' || menu?.open || inventory?.modal.open || dialog.open || chat?.open) return; menu!.show(); updateGate();}

    const navigation = document.createElement('nav');
    navigation.className = 'world-navigation';
    if (page === 'game') {
        for (const id of Object.keys(WORLD_SCENES) as SceneId[]) {
            const b = button('scene.' + id, () => {
                void navigateScene(id);
            });
            /* Navigation always settles the active menu before changing its domain scene. */
            b.dataset.scene = id;
            navigation.append(b);
        }
        root.insertBefore(navigation, main);
    }

    /** Finish visible carrier return before selecting another authored scene. @param {SceneId} id Target scene. */
    async function navigateScene(id: SceneId): Promise<void> {
                if (inventory && !await inventory.close()) return;
        if (inventory) await inventory.queue;
                dialog.close(); menu?.close(); chat?.hide();
                scene?.mode?.suspend(); scene?.cancel(); worldAudio?.cancel(); inventory?.book?.clearToast();
                void session.dispatch({
                    type: 'select-scene',
                    scene: id
                }).catch(() => feedback('game.actionFailed'));
    }
    const unsubscribe = session.subscribe(reflect);
    await session.refresh();
    try {
        const resources = await loadResources(page === 'game');
        if (disposed) return;
        pixels = new PixelUI(resources);
        for (const [element, binding] of bindings) {
            element.replaceChildren();
            setText(element, binding.key, binding.values);
        }
        for (const b of root.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button,a.invite')) pixels.button(b);
        pixels.slider(volume);
        pixels.field(username);
        const languages = document.createElement('div'); languages.className = 'native-language-list'; languages.setAttribute('role', 'listbox'); languages.setAttribute('aria-label', t('settings.language'));
        languageChoice = document.createElement('button'); languageChoice.type = 'button'; languageChoice.setAttribute('role', 'option'); languageChoice.setAttribute('aria-selected', 'true');
        languageChoice.className = 'native-language-row'; languageChoice.disabled = language.disabled; pixels.text(languageChoice, t('settings.englishNative'), 2, '#FFFFFF');
        languageChoice.addEventListener('click', () => {language.value = 'en'; edits.stage('locale','en'); preferences('locale');});
        languages.append(languageChoice);
        const languageSearch = document.createElement('input'); languageSearch.type = 'text'; languageSearch.className = 'language-search'; languageSearch.maxLength = 256; languageSearch.dataset.nativeHeight = '15'; languageSearch.dataset.nativeHint = t('book.searchHint'); languageSearch.dataset.italicHint = 'true'; languageSearch.setAttribute('aria-label', t('menu.languageSearch'));
        languageSection.append(languageSearch, languages); pixels.field(languageSearch);
        languageSearch.addEventListener('input', () => {languageChoice!.hidden = !t('settings.englishNative').toLowerCase().includes(languageSearch.value.toLowerCase());});
        nativeScreens.push(new NativeScreens(dialog, page === 'game' ? host : document.documentElement, pixels, () => optionsPage, {title: dialogTitle, navigation: optionNavigation, sections: optionSections, volume, volumeLabel, mute: muteButton, languageLabel, language, username, usernameLabel, warning, reset, confirmation: confirmSection, feedback: [preferenceFeedback,resetFeedback], done: close}));
        if (menu) nativeScreens.push(new NativeScreens(menu, host, pixels, () => 'pause', null));
        showOptions('options');
        scene = new SceneView(host, resources, t(page === 'home' ? 'home.tableLabel' : 'game.sceneLabel'), page === 'game');
        scene.onEscape = () => {lastPointerEscape = performance.now(); openMenu();};
        scene.onPointerFailure = () => feedback('game.pointerFailed');
        scene.setInputEnabled(page === 'home' && !dialog.open);
        scene.onPick = hit => {
            if (hit.id === 'birthday-table') setText(selection, 'table.selected');
        };
        scene.onUse = hit => {
            if (inventory?.autoEquip()) return;
            if (hit) scene?.onPick?.(hit);
        };
        scene.onGraphics = ready => {
            setText(selection, ready ? 'error.contextRestored' : 'error.contextLost');
            if (ready) void celebration?.resume(); else celebration?.pause();
        };
        reflect(session.view);
        root.dataset.resources = '26.3';
        if (page === 'game') {
            const [art, rules] = await Promise.all([loadCatalogueArt(), loadRules()]);
            if (disposed) {
                art.dispose();
                return;
            }
            session.rules = freeze(rules);
            session.policy = WORLD_REGION;
            setText(story, 'game.worldHint');
            inventory = new GameInventory(root, pixels, art, rules, t, open => {
                runtime.screen = open ? 'inventory' : dialog.open ? 'settings' : 'scene';
                updateGate(open);
            }, inputBlocked, (intent, cursor, expected, crafting, workbench) => session.editInventory(intent, cursor, expected, crafting, workbench), (take, cursor, crafting, expected, workbench) => session.takeCraft(take, cursor, crafting, expected, workbench));
            host.append(inventory.hud, inventory.modal);
            inventory.compassView = () => scene && session.view.envelope ? scene.compassView(session.view.envelope.generation) : null;
            inventory.viewport = host; if (inventory.book) host.append(inventory.book.toast); inventory.resize();
            inventory.returnWorkbench = (scene, id) => session.dispatch({type: 'close-workbench', scene, id});
            inventory.acquireOutput = (take, cursor, expected, station) => session.takeOutput(take, cursor, expected, station);
            inventory.fill = (...args) => session.fillRecipe(...args);
            inventory.bookCommand = command => session.dispatch(command);
            chat = new GameChat(host, pixels, t, () => session.view.envelope?.state.settings.username ?? 'sireoh', () => updateGate());
            for (const message of pendingMessages.splice(0)) feedback(message.key,message.values);
            host.dataset.chatReady = 'true';
            session.eventListeners.add(events => {
                for (const event of events) {
                    if (event.type === 'recipes-discovered') inventory?.book?.notify(event.recipes ?? []);
                    else if (event.type === 'items-acquired') {
                        for (const line of harvestFeedback(event, t)) chat?.append(line);
                    } else if (event.type === 'item-unlocked') {
                        chat?.append([{text: t('game.acquired', {item: ''})}, {text: itemName(event.item!), color: itemColor(event.item!)}]);
                        if (!taught) {taught = true; chat?.append([{text: t('chat.tutorial')}]);}
                    }
                }
            });
            worldAudio = new WorldAudio(resources.documents, () => edits.view() ?? session.view.envelope!.state.settings);
            inventory.book!.sound = id => {const owner = runtimeGeneration; void worldAudio?.play(id).then(status => {if (disposed || owner !== runtimeGeneration) return; host.dataset.uiAudio = JSON.stringify(worldAudio?.records); if (!['scheduled','suppressed','cancelled'].includes(status)) feedback(status === 'blocked' ? 'audio.uiBlocked' : 'audio.uiFailed', {}, 'ui-audio');});};
            host.addEventListener('pointerdown', () => worldAudio?.activate(), {capture: true, signal: appAbort.signal});
            host.addEventListener('keydown', () => worldAudio?.activate(), {capture: true, signal: appAbort.signal});
            worldUse = new WorldUse(scene!, inventory, session, key => feedback(key), id => void worldAudio?.play(id));
            scene.setInputEnabled(!dialog.open && !inventory.modal.open);
            celebration = new BirthdayCelebration(root, scene!, pixels, art, key => t(key), () => session.view.envelope ? {
                state: session.view.envelope.state,
                generation: session.view.envelope.generation
            } : null);
            session.eventListeners.add(events => {
                if (events.some(e => e.type === 'cake-placed')) void celebration?.start();
            });
            stopProcessing = processingClock(session);
            const value = session.view;
            if (value.envelope) reflect(value);

            root.dataset.inventoryReady = 'true';
        }
    } catch (error) {
        root.dataset.resourceError = error instanceof Error ? error.message : 'unknown';
        setText(caption, error instanceof Error && error.message === 'webgl-unavailable' ? 'error.webgl' : 'error.resource');
        root.dataset.resources = 'failed'; host.dataset.chatReady = 'failed';
    }
    const show = (event: PageTransitionEvent) => {
        root.dataset.pageshowPersisted = String(event.persisted);
        scene?.requestRender();
    };
    window.addEventListener('pageshow', show);
    window.addEventListener('pagehide', event => {
        edits.cancel();
        scene?.cancel();
        celebration?.navigation();
        confirmation = null;
        confirmSection.hidden = true;
        clearText(preferenceFeedback);
        if (event.persisted) return;
        disposed = true;
        appAbort.abort();
        window.removeEventListener('blur', cancelSettingsGesture);
        stopProcessing?.();
        chat?.dispose();
        celebration?.dispose();
        worldUse?.dispose();
        worldAudio?.dispose();
        nativeScreens.forEach(view => view.dispose());
        unsubscribe();
        connection.dispose();
        inventory?.dispose();
        scene?.dispose();
        pixels?.dispose();
        window.removeEventListener('pageshow', show);
    }, {once: false});
}
