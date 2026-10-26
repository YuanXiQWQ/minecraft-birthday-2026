/** Formal page composition connects localized screen UI, domain transactions, persistence and independent 3D presentation. */
import {captureGame,downloadScreenshot} from './ui/game-screenshot.ts';
import {defaultAppearance,lookupAppearance} from './ui/player-profile.ts';
import type {PlayerAppearance} from './ui/player-profile.ts';
import {parseCommand} from './domain/console.ts';
import {Vector3} from 'three';
import type {SkySettings} from './domain/environment.ts';
import {LocalWeather} from './render/local-weather.ts';
import type {LoadingPort} from './ui/loading-screen.ts';
import {GameStartup} from './ui/game-startup.ts';
import {NavigationPanel} from './ui/navigation-panel.ts';
import {NativeScreens} from './ui/native-screens.ts';
import {GameChat, nativeScale} from './ui/chat.ts';
import {AuthorWelcome} from './ui/author-welcome.ts';
import {bindOddCakeRemarks} from './ui/odd-cake-chat.ts';
import {GameKeyboard} from './ui/game-keyboard.ts';
import {bindEscapeKey} from './ui/escape-key.ts';
import {pickupSoundOptions} from './ui/pickup-feedback.ts';
import {AdvancementView} from './ui/advancements.ts';
import {advancementChat} from './ui/advancement-chat.ts';
import {feedbackTransition, FAILURE_COLOR} from './ui/system-feedback.ts';
import {harvestFeedback} from './ui/harvest-feedback.ts';
import {BirthdayCelebration} from './celebration/birthday.ts';
import {WorldUse} from './ui/world-use.ts';
import {ActionBar,actionBarMessage} from './ui/action-bar.ts';
import {SOUND_CHANNELS,type SoundKey} from './domain/audio-settings.ts';
import {GameMusic} from './render/game-music.ts';
import {NativeButtonSounds} from './ui/native-button-sounds.ts';
import {WorldAudio} from './render/world-audio.ts';
import {CampfireAudio} from './render/campfire-audio.ts';
import {WORLD_REGION, WORLD_SCENES} from './domain/world-config.ts';
import type {SceneId} from './domain/types.ts';
import {ControlSettingsUI} from './ui/control-settings.ts';
import {controlSettings,matchesBinding} from './domain/control-settings.ts';
import {SettingsEdits} from './ui/settings-edits.ts';
import type {SettingKey} from './ui/settings-edits.ts';
import {processingClock} from './persistence/processing-clock.ts';
import birthday from './birthday.json' with {type: 'json'};
import {translate, localeDictionary, displayLocale, LANGUAGES, ENGLISH} from './i18n/index.ts';
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

/** Mount one formal entry, exposing homepage controls only after native text and widgets are painted.
 * @param {'home'|'game'} page Independent entry identity.
 * @param {Dictionary} locale Optional loaded locale catalogue.
 * @param {LoadingPort} loading Optional independent native loading presentation.
 * @return {Promise<void>} Page initialization, with visible localized capability/resource failures.
 */
export async function mount(page: 'home' | 'game', locale: Dictionary = {}, loading?: LoadingPort): Promise<void> {
    const root = document.getElementById('app')!, base = import.meta.env.BASE_URL;
    let dictionary = locale, pixels: PixelUI | null = null, scene: SceneView | null = null, disposed = false,
        confirmation: string | null = null, confirmationSerial = 0, resetting = false, activeLocale = '';
    const appAbort = new AbortController();
    const edits = new SettingsEdits(), runtime = initialRuntime(), connection = browserSession(),
        session = connection.session,
        bindings = new Map<HTMLElement, { key: string; values: Record<string, string | number> }>();
    let celebration: BirthdayCelebration | null = null, chat: GameChat | null = null, advancements:AdvancementView|null=null;
    let authorWelcome: AuthorWelcome | null = null;
    let sleepOverlay:HTMLDivElement|null=null;
    let actionBar:ActionBar|null=null;
    const soundSliders=new Map<SoundKey,HTMLInputElement>();
    let menu: HTMLDialogElement | null = null, optionsPage = 'options';
    const languageChoices = new Map<string, HTMLButtonElement>();
    const nativeScreens: NativeScreens[] = [];
    let navigationPanel: NavigationPanel | null = null, startup: GameStartup | null = null;
    let gameKeyboard: GameKeyboard | null = null;
    let homeButtonObserver: ResizeObserver | null = null;
    let localWeather: LocalWeather | null = null, weatherTimeControl: HTMLButtonElement | null = null, weatherModeControl: HTMLButtonElement | null = null, weatherGeneration='', weatherMode='game';
    let lastSaveStatus = '', lastFeedbackGeneration = '', taught = false;
    const pendingMessages: {key: string; values: Record<string,string|number>}[] = [];
    const feedbackStates = new Map<string,string>();
    const inputBlocked = () => page === 'game' && (!startup?.ready || !!session.view.envelope?.state.progress.sleep) || dialog.open || !!menu?.open || !!chat?.open || !!advancements?.modal.open;
    /** Update compositor and input ownership only across actual UI transitions, independently of autosave. */
    const updateGate = (inventoryOpen = !!inventory?.modal.open) => {
        const open = inputBlocked() || inventoryOpen, effect = dialog.open || menu?.open || advancements?.modal.open ? 'menu' : inventoryOpen ? 'container' : 'none';
        if (host.dataset.overlay !== String(open)) host.dataset.overlay = String(open);
        if (host.dataset.effect !== effect) {delete host.dataset.menuComposited; host.dataset.effect = effect; scene?.requestRender();}
        scene?.setInputEnabled(!open);
        scene?.setSimulationPaused(page === 'game' && (!startup?.ready || dialog.open || !!menu?.open));
    };
    const listenerDirection=new Vector3();
    let music:GameMusic|null=null,lastAudioReport=0;
    let buttonSounds:NativeButtonSounds|null=null;
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

    /** Localize interface labels and route game operation messages through the shared chat policy.
     * @param {HTMLElement} target Semantic element.
     * @param {string} key Locale key.
     * @param {Record<string,string|number>} values Interpolation values.
     */
    function setText(target: HTMLElement, key: string, values: Record<string, string | number> = {}): void {
        if (page === 'game' && (['preference-feedback', 'reset-feedback'].includes(target.id) || target.classList.contains('weather-status'))) {
            clearText(target); target.hidden = true;
            feedback(key, values, target.id || 'weather');
            return;
        }
        bindings.set(target, {key, values});
        if (pixels) pixels.text(target, t(key, values), target.tagName === 'H1' ? 3 : 2, target.classList.contains('startup-error') ? FAILURE_COLOR : '#FFFFFF'); else target.textContent = t(key, values);
    }

    /** Route native bed notifications to the action bar and approved system messages to chat.
     * @param {string} key Localized event message.
     * @param {Record<string,string|number>} values Message parameters.
     * @param {string} boundary Optional state-transition deduplication boundary.
     */
    function feedback(key: string, values: Record<string,string|number> = {}, boundary = ''): void {
        if(actionBarMessage(key)){actionBar?.show(key);return;}
        const disposition = feedbackTransition(feedbackStates, key, values, boundary);
        if (disposition === 'omit') return;
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

    /** Keep homepage controls at the same DPI-aligned GUI scale as native game menus. */
    function layoutHomeButtons(): void {
        root.style.setProperty('--home-gui-scale', String(nativeScale(document.documentElement)));
        for (const b of root.querySelectorAll<HTMLElement>('header .mc-button, .copy .mc-button')) pixels?.refreshButton(b);
    }

    document.title = t(page === 'home' ? 'html.homeTitle' : 'html.gameTitle');
    document.documentElement.lang = 'en';
    root.className = page;
    root.dataset.build = import.meta.env.BUILD_ID;
    const header = document.createElement('header'),
        main = document.createElement('main'), copy = document.createElement('article'),
        host = document.createElement('section'), startupError = document.createElement('p');
    main.className = page + '-layout';
    copy.className = 'copy';
    host.className = 'scene-panel';
    host.id = 'scene';
    if (page === 'home') copy.append(node('h1', 'home.title'), node('p', 'home.story', 'story'));
    const link = node('a', page === 'home' ? 'home.invite' : 'game.back', 'invite') as HTMLAnchorElement;
    link.href = page === 'home' ? base + 'game/' : base;
    link.id = 'invitation';
    if (page === 'home') copy.append(link);
    if (page === 'home') main.append(copy);
    main.append(host);
    if (page === 'home') root.append(header);
    root.append(main);
    startupError.className = 'startup-error'; startupError.hidden = true; startupError.setAttribute('role', 'alert'); root.append(startupError);
    const dialog = document.createElement('dialog');
    dialog.className = 'settings';
    dialog.setAttribute('aria-label', t('settings.title'));
    dialog.id = 'settings';
    const dialogTitle = node('h2', 'settings.title'), languageLabel = node('label', 'settings.language'),
        language = document.createElement('select');
    for (const entry of LANGUAGES) {
        const option = document.createElement('option');
        option.value = entry.id; option.textContent = entry.name; language.append(option);
    }
    language.id = 'language';
    languageLabel.setAttribute('for', language.id);
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
            if (disposed || serial !== session.serial || session.suspended) return;
            confirmation = null;
            confirmSection.hidden = true;
            clearText(resetFeedback);
            clearText(preferenceFeedback);
            dialog.close();
            menu?.close();
            updateGate();
        }).catch(error => {
            if (disposed || serial !== session.serial || session.suspended) return;
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
        nativeScreens.forEach(view => view.layout());
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
    const close = button('menu.done', () => {if (optionsPage !== 'options') showOptions(['mouse','keybinds'].includes(optionsPage)?'controls':'options'); else {dialog.close(); if (page === 'game') openMenu();}}), retry = button('common.retry', () => {
        void session.refresh();
    });
    retry.id = 'retry-save'; retry.hidden = true;
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
            volume.value = String(value.muted?0:value.volume);
            volume.dataset.nativeLabel = value.muted||value.volume === 0 ? t('menu.volumeOff') : t('menu.volumeNative', {percent: Math.floor(value.volume * 100)});
            volume.setAttribute('aria-label', volume.dataset.nativeLabel);
            pixels?.updates.get(volume)?.();
            for(const [key,input] of soundSliders){input.value=String(value[key]??1);const name=t('soundCategory.'+SOUND_CHANNELS.find(([k])=>k===key)![1]);input.dataset.nativeLabel=(value[key]??1)===0?t('menu.soundOff',{name}):t('menu.soundVolume',{name,percent:Math.floor((value[key]??1)*100)});input.setAttribute('aria-label',input.dataset.nativeLabel);input.disabled=!session.view.writable||resetting;pixels?.updates.get(input)?.();}
            mute.checked = value.muted;
            language.value = displayLocale(value.locale);
            setText(volumeLabel, 'settings.volume', {percent: Math.floor(value.volume * 100)});
            if(weatherTimeControl)setText(weatherTimeControl,value.sky?.time==='real'?'weather.timeReal':'weather.timeGame');
            if(weatherModeControl)setText(weatherModeControl,value.sky?.weather==='real'?'weather.modeReal':'weather.modeGame');
            const nextMode=value.sky?.weather??'game';if(weatherMode==='real'&&nextMode!=='real')localWeather?.stop();weatherMode=nextMode;
        }
        language.disabled = volume.disabled = mute.disabled = reset.disabled = !session.view.writable || resetting;
        for (const [id, choice] of languageChoices) {
            choice.disabled = language.disabled;
            choice.setAttribute('aria-selected', String(id === language.value));
        }
        for(const control of [weatherTimeControl,weatherModeControl])if(control)control.disabled=!session.view.writable||resetting;
        worldAudio?.sync();
        music?.sync();
        celebration?.sync();
    }

    /** Submit one field against freshly locked settings and settle only this edit's receipt.
     * @param {SettingKey} key Changed preference.
     * @param {Partial<SkySettings>} skyPatch Only the explicitly edited environment field.
     */
    function preferences(key: SettingKey, skyPatch?: Partial<SkySettings>): void {
        const draft = edits.submit(key);
        if (!draft) return;
        clearText(preferenceFeedback);
        void session.dispatch(skyPatch?{type:'sky-settings',patch:skyPatch}:{type: 'settings', patch: {[key]: draft.value}}).then(() => {
            if (disposed || !edits.finish(key, draft.ticket)) return;
            paintSettings();
            clearText(preferenceFeedback);
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
        edits.stage('muted',false);
        clearText(preferenceFeedback);
        paintSettings();
    });
    volume.addEventListener('change', () => {preferences('volume');preferences('muted');});
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

    /** Reflect durable facts and restart author delivery only for a new ready save generation.
     * @param {Snapshot} value Latest coordinated facts.
     */
    function reflect(value: Snapshot): void {
        actionBar?.sync((value.envelope?.generation??'')+':'+(value.envelope?.state.progress.scene??''));
        if (inventory) inventory.writable = value.writable;
        if (value.envelope && runtimeGeneration !== value.envelope.generation) {
            runtimeGeneration = value.envelope.generation;
            worldAudio?.cancel();music?.cancel();scene?.weather?.clear();
            if (page === 'game' && lastFeedbackGeneration !== runtimeGeneration) {
                lastFeedbackGeneration = runtimeGeneration; taught = !!value.envelope.state.progress.unlocked.length; feedbackStates.clear();
                feedback('game.worldHint', {}, 'tutorial-controls');
            }
            scene?.mode?.suspend();
            scene?.cancel();
            if(scene)scene.worldId=null;
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
            syncAppearance(s.settings.username??'sireoh',value.envelope.generation);
            root.dataset.completed = String(placed);
            if (page === 'game' && lastWorldScene !== s.progress.scene) {
                void inventory?.close(true);
                lastWorldScene = s.progress.scene;
            }
            const nextLocale = displayLocale(s.settings.locale);
            if (activeLocale !== nextLocale) {
                activeLocale = nextLocale;
                dictionary = {...localeDictionary(nextLocale), ...locale};
                for (const [element, binding] of bindings) setText(element, binding.key, binding.values);
                document.title = t(page === 'home' ? 'html.homeTitle' : 'html.gameTitle');
                document.documentElement.lang = nextLocale;
                dialog.setAttribute('aria-label', t('settings.title'));
                host.querySelector('canvas[data-scene]')?.setAttribute('aria-label', t(page === 'home' ? 'home.tableLabel' : 'game.sceneLabel'));
                const search = languageSection.querySelector<HTMLInputElement>('.language-search');
                if (search) {
                    search.dataset.nativeHint = t('book.searchHint'); search.setAttribute('aria-label', t('menu.languageSearch'));
                    pixels?.updates.get(search)?.();
                }
                languageSection.querySelector('[role=listbox]')?.setAttribute('aria-label', t('settings.language'));
                if (chat) {
                    chat.root.setAttribute('aria-label', t('chat.input')); chat.input.setAttribute('aria-label', t('chat.input')); chat.paint();
                }
                const loadingHost = document.getElementById('native-loading');
                if (loadingHost) {
                    loadingHost.dataset.label = t('loading.terrain'); loadingHost.dataset.failure = t('error.resource');
                    loadingHost.setAttribute('aria-label', t('loading.terrain'));
                }
                navigationPanel?.edge.setAttribute('aria-label', t('a11y.showScenes'));
                celebration?.localize();
                for (const screen of nativeScreens) screen.layout();
            }
            celebration?.sync();
            inventory?.sync(s, value.writable, value.envelope.generation);
            advancements?.sync(s.progress.advancements,value.envelope.generation);
            if (page === 'home' && scene) {
                scene.skySettings=s.settings.sky??{time:'game',weather:'game'};
                scene.syncWorld(s.progress);
            }
            if (edits.generation && edits.generation !== value.envelope.generation) clearText(preferenceFeedback);
            if(weatherGeneration&&weatherGeneration!==value.envelope.generation){localWeather?.stop();localWeather?.status('weather.locationNeeded');}
            weatherGeneration=value.envelope.generation;
            edits.sync(s.settings, value.envelope.generation);
            controlsUI.sync(s.settings.controls,displayLocale(s.settings.locale),value.writable&&!resetting,value.envelope.generation);
            document.documentElement.dataset.cursorChanges=String(controlSettings(s.settings.controls).allowCursorChanges);
            scene?.setControls(controlSettings(s.settings.controls));
            if(inventory)inventory.input.controls=controlSettings(s.settings.controls);
            if(chat)chat.inputControls=controlSettings(s.settings.controls);
            paintSettings(); worldAudio?.sync();
            if (page === 'game' && scene) {
                if(sleepOverlay){sleepOverlay.hidden=!s.progress.sleep&&!scene.sleepView.timer;sleepOverlay.style.pointerEvents=s.progress.sleep?'auto':'none';sleepOverlay.querySelector('button')!.hidden=!s.progress.sleep;}
                updateGate();
                scene.skySettings=s.settings.sky??{time:'game',weather:'game'};
                scene.syncWorld(s.progress);
                scene.refreshHover();
                worldUse?.preview();
                for (const b of navigation.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-current', String(b.dataset.scene === s.progress.scene));
                feedback('scene.' + s.progress.scene, {}, 'scene');
            }
        }
        paintSettings();
        retry.hidden = value.status === 'ready' || value.status === 'loading';
        const statusKey = value.status === 'ready' ? (value.migrated ? 'status.migrated' : 'status.ready') : value.status === 'loading' ? 'common.loading' : Object.hasOwn(ENGLISH, 'error.' + value.status) ? 'error.' + value.status : 'error.generic';
        if ((page === 'home' || !chat) && value.status !== 'ready' && value.status !== 'loading' && value.status !== 'lock-busy') {setText(startupError, statusKey); startupError.hidden = false;}
        else if (page === 'home' && scene?.lost) {setText(startupError, 'error.contextLost'); startupError.hidden = false;}
        else if ((value.status === 'ready' || value.status === 'lock-busy') && root.dataset.resources !== 'failed') {clearText(startupError); startupError.hidden = true;}
        if (page === 'game' && value.status !== lastSaveStatus && value.status !== 'loading') {feedback(statusKey, {}, 'storage'); lastSaveStatus = value.status;}
        authorWelcome?.sync(runtimeGeneration ?? '', !!startup?.ready);
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
    const controlsUI=new ControlSettingsUI(dialog,showOptions,async patch=>{const generation=session.view.envelope?.generation,serial=session.serial;clearText(preferenceFeedback);try{await session.dispatch({type:'control-settings',patch});}catch(error){if(!disposed&&generation===session.view.envelope?.generation&&serial===session.serial)setText(preferenceFeedback,'settings.saveFailed');throw error;}},appAbort.signal);
    for(const [key,section] of controlsUI.sections)optionSections.set(key,section);
    const languageSection = document.createElement('section'), soundSection = document.createElement('section'), playerSection = document.createElement('section');
    soundSection.className='sound-section';
    languageSection.append(languageLabel, language); soundSection.append(volumeLabel, volume, mute, muteLabel);
    language.hidden = mute.hidden = muteLabel.hidden = true;
    for(const [key] of SOUND_CHANNELS){const input=document.createElement('input');input.type='range';input.min='0';input.max='1';input.step='any';input.id=key;soundSliders.set(key,input);soundSection.append(input);input.addEventListener('input',()=>{edits.stage(key,Number(input.value));clearText(preferenceFeedback);paintSettings();});input.addEventListener('change',()=>preferences(key));input.addEventListener('blur',cancelSettingsGesture);}
    const usernameLabel = node('label', 'menu.username'), username = document.createElement('input');
    username.id = 'username'; username.maxLength = 16; usernameLabel.setAttribute('for', username.id);
    const usernameFeedback = document.createElement('p'); usernameFeedback.setAttribute('role', 'status');usernameFeedback.className='profile-feedback';
    const profileCard=document.createElement('div'),profileFace=document.createElement('canvas'),profileName=document.createElement('span');
    profileCard.className='player-profile-match';profileCard.setAttribute('role','status');profileFace.width=profileFace.height=8;profileFace.setAttribute('aria-hidden','true');profileCard.append(profileFace,profileName);
    let profileMatch:PlayerAppearance|null=null,profileQuery=0,profileTimer=0,appearanceName='',appearanceOwner=0,currentAppearance:PlayerAppearance|null=null;
    const savePlayer=button('menu.save',()=>{if(!profileMatch||profileMatch.profile.name.toLowerCase()!==username.value.toLowerCase())return;edits.stage('username',profileMatch.profile.name);preferences('username');});
    /** Redraw the exact match row without changing the saved identity.
     * @param {PlayerAppearance|null} match One complete public profile.
     * @param {string} status Localized pending/failure key.
     */
    function drawProfileMatch(match:PlayerAppearance|null,status='profile.lookup'):void{
        profileMatch=match;savePlayer.disabled=!match;profileCard.dataset.state=match?'ready':status;
        profileFace.hidden=!match;clearText(profileName);
        if(match){if(pixels)pixels.text(profileName,match.profile.name,2);else profileName.textContent=match.profile.name;const c=profileFace.getContext('2d')!;c.clearRect(0,0,8,8);c.drawImage(match.skin,8,8,8,8,0,0,8,8);c.drawImage(match.skin,40,8,8,8,0,0,8,8);profileCard.dataset.uuid=match.profile.id;}
        else {delete profileCard.dataset.uuid;setText(profileName,status);}
        nativeScreens.forEach(view=>view.layout());
    }
    /** Debounce typed names and discard every stale response before it can become a selectable match. */
    function searchProfile():void{
        const ticket=++profileQuery,name=username.value;clearTimeout(profileTimer);clearText(usernameFeedback);
        if(!/^[A-Za-z0-9_]{3,16}$/.test(name)){drawProfileMatch(null,'profile.invalid');return;}
        drawProfileMatch(null);
        profileTimer=window.setTimeout(()=>{void lookupAppearance(name).then(match=>{if(!disposed&&ticket===profileQuery&&username.value===name)drawProfileMatch(match);}).catch(error=>{if(!disposed&&ticket===profileQuery)drawProfileMatch(null,error instanceof Error&&error.message==='profile-not-found'?'profile.missing':'profile.unavailable');});},300);
    }
    /** Project only a committed username, guarding asynchronous completion across saves/reset/disposal.
     * @param {string} name Saved player name.
     * @param {string} generation Save generation.
     */
    function syncAppearance(name:string,generation:string):void{
        const owner=generation+':'+name.toLowerCase();if(appearanceName===owner)return;appearanceName=owner;const ticket=++appearanceOwner;
        currentAppearance=null;scene?.setAppearance(null);inventory?.playerPreview?.setAppearance(null);
        /** Apply a complete appearance to every current rendering surface. @param {PlayerAppearance} value Validated pixels. */
        const apply=(value:PlayerAppearance):void=>{if(disposed||ticket!==appearanceOwner)return;currentAppearance=value;scene?.setAppearance(value);inventory?.playerPreview?.setAppearance(value);if(inventory?.modal.open)inventory.draw();root.dataset.playerProfile=value.profile.name;delete root.dataset.profileError;};
        const initial=name.toLowerCase()==='sireoh'?defaultAppearance():lookupAppearance(name);
        void initial.then(apply).then(()=>{if(name.toLowerCase()==='sireoh')void lookupAppearance(name).then(apply).catch(()=>{});}).catch(()=>{if(!disposed&&ticket===appearanceOwner){root.dataset.profileError='unavailable';if(optionsPage==='player')setText(usernameFeedback,'profile.unavailable');}});
    }
    username.addEventListener('input',searchProfile);
    playerSection.append(usernameLabel,username,profileCard,usernameFeedback,savePlayer,button('menu.cancel',()=>showOptions('options')));
    const weatherSection=document.createElement('section');weatherSection.className='weather-section';
    localWeather=new LocalWeather(value=>{if(scene?.sky){scene.sky.weatherOverride=value;scene.requestRender();}},key=>{weatherModeControl!.title=t('weather.privacy')+' '+t(key);if(['weather.locationDenied','weather.locationUnavailable','weather.fetchFailed'].includes(key))setText(preferenceFeedback,'error.'+key);});
    weatherTimeControl=button('weather.timeGame',()=>{const current=edits.view()?.sky??{time:'game' as const,weather:'game' as const};const time=current.time==='game'?'real':'game';edits.stage('sky',{...current,time});preferences('sky',{time});paintSettings();});
    weatherModeControl=button('weather.modeGame',()=>{const current=edits.view()?.sky??{time:'game' as const,weather:'game' as const},mode=current.weather==='game'?'real':'game';edits.stage('sky',{...current,weather:mode});preferences('sky',{weather:mode});if(mode==='real')localWeather!.request();else localWeather!.stop();paintSettings();});
    const attribution=node('a','weather.credit','weather-attribution') as HTMLAnchorElement;attribution.href='https://open-meteo.com/';attribution.target='_blank';attribution.rel='noopener noreferrer';
    weatherModeControl.title=t('weather.privacy');attribution.title=t('weather.attribution');weatherSection.append(weatherTimeControl,weatherModeControl,attribution);
    optionSections.set('weather',weatherSection);
    optionSections.set('language', languageSection); optionSections.set('sound', soundSection); optionSections.set('player', playerSection);
    for (const id of ['player', 'sound', 'controls', 'language', 'weather']) optionNavigation.append(button('menu.' + id, () => showOptions(id)));
    optionNavigation.append(reset);
    /** Show only supported preference categories, preserving the existing settings draft and reset transactions.
     * @param {string} id Native option hierarchy node.
     */
    function showOptions(id: string): void {
        controlsUI.cancel();
        optionsPage = id; optionNavigation.hidden = id !== 'options';
        for (const [key, section] of optionSections) section.hidden = key !== id;
        warning.hidden=true;
        for (const element of [reset, confirmSection]) element.hidden = id !== 'options' || element === confirmSection && !confirmation;
        setText(dialogTitle, id === 'options' ? 'menu.options' : id==='controls'?'menu.controlsTitle':'menu.' + id);
        if (id === 'player') {username.value = session.view.envelope?.state.settings.username ?? 'sireoh'; clearText(usernameFeedback); pixels?.updates.get(username)?.();searchProfile();}
        nativeScreens.forEach(view => view.layout());
        if(id==='language')languageSection.querySelector<HTMLInputElement>('.language-search')?.focus();
        updateGate();
    }
    if (page === 'home') dialog.replaceChildren(dialogTitle, optionNavigation, languageSection, soundSection, playerSection, weatherSection, ...controlsUI.sections.values(), preferenceFeedback, warning, confirmSection, resetFeedback, close);
    if (page === 'game') {
        dialog.replaceChildren(dialogTitle, optionNavigation, languageSection, soundSection, playerSection, weatherSection, ...controlsUI.sections.values(), preferenceFeedback, warning, confirmSection, resetFeedback, close);

        menu = document.createElement('dialog'); menu.className = 'game-menu'; menu.id = 'game-menu';
        menu.append(node('h2', 'menu.title'), button('menu.back', () => {menu!.close(); updateGate();}), button('menu.advancements', () => {advancements?.open(()=>openMenu());menu!.close();}), button('menu.options', () => {menu!.close(); settings.click();}), button('menu.quit', () => {void quitToTitle();}));
        host.append(menu);
        menu.addEventListener('close', () => updateGate());
        for (const view of [menu, dialog]) {
            view.addEventListener('cancel', e => e.preventDefault());
            for (const type of ['pointerdown', 'pointerup', 'wheel', 'contextmenu']) view.addEventListener(type, e => {e.stopPropagation(); if (type === 'contextmenu') e.preventDefault();});
        }
        /** Route configured screenshot, advancement and chat keys through the current GUI gate. @param {KeyboardEvent} e Physical key-shaped input. */
        const screenAction = (e:KeyboardEvent) => {
            if (e.defaultPrevented || e.repeat || !startup?.ready) return;
            const plain=(!e.ctrlKey||e.code.startsWith('Control'))&&(!e.altKey||e.code.startsWith('Alt'))&&(!e.metaKey||e.code.startsWith('Meta'));
            if(matchesBinding(session.view.envelope?.state.settings.controls,'screenshot',e.code)&&plain){
                e.preventDefault();if(scene&&!scene.captureFrame){scene.captureFrame=canvas=>{void saveScreenshot(canvas);};scene.requestRender();}return;
            }
            if(matchesBinding(session.view.envelope?.state.settings.controls,'advancements',e.code)&&!(e.target instanceof HTMLInputElement)&&!dialog.open&&!menu?.open&&!chat?.open&&!inventory?.modal.open){
                e.preventDefault();if(advancements?.modal.open)advancements.close();else advancements?.open();
            } else if ((matchesBinding(session.view.envelope?.state.settings.controls,'chat',e.code)||matchesBinding(session.view.envelope?.state.settings.controls,'command',e.code)&&plain) && !inputBlocked() && !inventory?.modal.open && !(e.target instanceof HTMLInputElement)) {e.preventDefault(); chat?.show(matchesBinding(session.view.envelope?.state.settings.controls,'chat',e.code)?'':'/');}
        };
        document.addEventListener('keydown',screenAction,{signal:appAbort.signal});
        document.addEventListener('pointerdown',e=>{if(!scene?.input||e.target!==scene.renderer.domElement)return;screenAction({code:'Mouse'+e.button,repeat:false,defaultPrevented:e.defaultPrevented,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey,target:e.target,preventDefault:()=>e.preventDefault()} as KeyboardEvent);},{capture:true,signal:appAbort.signal});
    }
    const nativeEscape=bindEscapeKey(()=>!disposed&&(page==='game'?!!startup?.ready:dialog.open),closeCurrentScreen,appAbort.signal,()=>{
        if(!inputBlocked()&&!inventory?.modal.open)openMenu();
    });
    /** Close one active screen without opening pause, preserving container transactions and settings subpage navigation. */
    function closeCurrentScreen():void {
        if(session.view.envelope?.state.progress.sleep)void session.dispatch({type:'leave-bed'}).catch(()=>feedback('game.actionFailed'));
        else if(chat?.open)chat.hide();
        else if(advancements?.modal.open)advancements.close(false);
        else if(inventory?.modal.open)void inventory.close();
        else if(dialog.open){
            if(!confirmSection.hidden)cancelReset.click();
            else if(optionsPage!=='options')showOptions(['mouse','keybinds'].includes(optionsPage)?'controls':'options');
            else{dialog.close();updateGate();}
        }
        else if(menu?.open){menu.close();updateGate();}
        else openMenu();
    }
    /** Capture before appending feedback, and discard asynchronous replies belonging to an abandoned game lifetime.
     * @param {HTMLCanvasElement} canvas Just-rendered world framebuffer.
     * @return {Promise<void>} Download dispatch and native chat notification.
     */
    async function saveScreenshot(canvas:HTMLCanvasElement):Promise<void>{
        const owner=chat,generation=session.view.envelope?.generation;
        try{
            const screenshot=await downloadScreenshot(captureGame(root,canvas));
            if(disposed||!owner||owner.abort.signal.aborted||session.view.envelope?.generation!==generation){URL.revokeObjectURL(screenshot.url);return;}
            owner.screenshotSaved(screenshot);
        }catch{if(!disposed&&!owner?.abort.signal.aborted&&session.view.envelope?.generation===generation)feedback('error.screenshot');}
    }
    /** Open pause only when the world is ready and no other screen owns input. */
    function openMenu(): void {if (page !== 'game' || !startup?.ready || menu?.open || inventory?.modal.open || dialog.open || chat?.open) return; menu!.show(); updateGate();}

    const navigation = document.createElement('nav');
    navigation.className = 'world-navigation'; navigation.id='world-navigation';
    if (page === 'game') {
        sleepOverlay=document.createElement('div');sleepOverlay.className='sleep-overlay';sleepOverlay.hidden=true;
        sleepOverlay.append(button('bed.leave',()=>{void session.dispatch({type:'leave-bed'}).catch(()=>feedback('game.actionFailed'));}));host.append(sleepOverlay);
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

    if (page === 'game') startup = new GameStartup(root, host, navigation);
    /** Fence late initialization when leaving an unfinished game document.
     * @param {PageTransitionEvent} event Browser page lifecycle event.
     */
    function abandonStartup(event: PageTransitionEvent): void {
        if (!event.persisted && startup && !startup.ready) {disposed = true; loading?.dispose(); startup.dispose();}
    }
    window.addEventListener('pagehide', abandonStartup, {signal: appAbort.signal});

    /** Return visible carriers before teleporting to a scene and announcing the committed destination. @param {SceneId} id Target scene. */
    async function navigateScene(id: SceneId): Promise<void> {
        advancements?.close(false);
        const owner = session.view.envelope?.generation, from = session.view.envelope?.state.progress.scene;
        if (inventory && !await inventory.close()) return;
        if (inventory) await inventory.queue;
        if (disposed || owner !== session.view.envelope?.generation || from !== session.view.envelope?.state.progress.scene) return;
        dialog.close(); menu?.close(); chat?.hide();
        scene?.mode?.suspend(); scene?.cancel(); worldAudio?.cancel(); inventory?.book?.clearToast();
        const serial = session.serial;
        void session.transact({type: 'console', source: '/tp '+id}).then(result=>{
            if(disposed||session.suspended||session.serial!==serial||session.view.envelope?.generation!==owner||session.view.envelope?.state.progress.scene!==id)return;
            for(const message of result.console??[])chat?.commandMessage(message);
        }).catch(() => {
            if (!disposed && !session.suspended && !session.disposed && serial === session.serial && owner === session.view.envelope?.generation && from === session.view.envelope?.state.progress.scene) feedback('game.actionFailed');
        });
    }
    const unsubscribe = session.subscribe(reflect);
    await session.refresh();
    loading?.update('save', 1);
    try {
        const resources = await loadResources(true, (done, total) => loading?.update('resources', done, total));
        if (disposed) return;
        worldAudio = new WorldAudio(resources.documents, () => edits.view() ?? session.view.envelope!.state.settings);
        buttonSounds = new NativeButtonSounds(root,worldAudio);
        pixels = new PixelUI(resources);
        for (const [element, binding] of bindings) {
            element.replaceChildren();
            setText(element, binding.key, binding.values);
        }
        for (const b of root.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button,a.invite')) pixels.button(b);
        if (page === 'home') {
            homeButtonObserver = new ResizeObserver(layoutHomeButtons);
            homeButtonObserver.observe(document.documentElement);
            layoutHomeButtons();
        }
        controlsUI.attach(pixels);
        pixels.slider(volume);
        for(const input of soundSliders.values())pixels.slider(input);
        pixels.field(username);
        const languages = document.createElement('div'); languages.className = 'native-language-list'; languages.setAttribute('role', 'listbox'); languages.setAttribute('aria-label', t('settings.language'));
        for (const entry of LANGUAGES) {
            const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role', 'option');
            choice.setAttribute('aria-selected', String(entry.id === language.value)); choice.dataset.locale = entry.id;
            choice.className = 'native-language-row'; choice.disabled = language.disabled; pixels.text(choice, entry.name, 2, '#FFFFFF');
            choice.addEventListener('click', () => {language.value = entry.id; edits.stage('locale', entry.id); preferences('locale');});
            languageChoices.set(entry.id, choice); languages.append(choice);
        }
        const languageSearch = document.createElement('input'); languageSearch.type = 'text'; languageSearch.className = 'language-search'; languageSearch.maxLength = 256; languageSearch.dataset.nativeHeight = '15'; languageSearch.dataset.nativeHint = t('book.searchHint'); languageSearch.dataset.italicHint = 'true'; languageSearch.setAttribute('aria-label', t('menu.languageSearch'));
        languageSection.append(languageSearch, languages, node('p','menu.languageAccuracy','language-accuracy')); pixels.field(languageSearch);
        languageSearch.addEventListener('input', () => {
            const query = languageSearch.value.trim().toLowerCase();
            for (const entry of LANGUAGES) languageChoices.get(entry.id)!.hidden = !(entry.name + ' ' + entry.search).toLowerCase().includes(query);
        });
        nativeScreens.push(new NativeScreens(dialog, page === 'game' ? host : document.documentElement, pixels, () => optionsPage, {controlsUI,title: dialogTitle, navigation: optionNavigation, sections: optionSections, volume, volumeLabel, languageLabel, language, username, usernameLabel, warning, reset, confirmation: confirmSection, feedback: [preferenceFeedback,resetFeedback], done: close}));
        if (menu) nativeScreens.push(new NativeScreens(menu, host, pixels, () => 'pause', null));
        showOptions('options');
        if (page === 'home') root.dataset.homeUi = 'ready';
        scene = new SceneView(host, resources, t(page === 'home' ? 'home.tableLabel' : 'game.sceneLabel'), page === 'game');
        scene.onNativeUnlock=nativeEscape;
        scene.setInputEnabled(page === 'home' && !dialog.open);
        scene.onGraphics = ready => {
            if (!ready) delete host.dataset.menuComposited;
            if (page === 'game') feedback(ready ? 'error.contextRestored' : 'error.contextLost', {}, 'graphics');
            else reflect(session.view);
            if (ready) void celebration?.resume(); else celebration?.pause();
        };
        reflect(session.view);
        root.dataset.resources = '26.3';
        if (page === 'game') {
            const [art, rules] = await Promise.all([loadCatalogueArt(loading ? (done, total) => loading.update('icons', done, total) : undefined), loadRules().then(rules => {loading?.update('rules', 1); return rules;})]);
            if (disposed) {
                art.dispose();
                return;
            }
            session.rules = freeze(rules);
            session.policy = WORLD_REGION;
            inventory = new GameInventory(root, pixels, art, rules, t, open => {
                runtime.screen = open ? 'inventory' : dialog.open ? 'settings' : 'scene';
                updateGate(open);
            }, inputBlocked, (intent, cursor, expected, crafting, workbench) => session.editInventory(intent, cursor, expected, crafting, workbench), (take, cursor, crafting, expected, workbench) => session.takeCraft(take, cursor, crafting, expected, workbench));
            inventory.input.controls=controlSettings(session.view.envelope?.state.settings.controls);
            inventory.feedback = key => feedback(key);
            inventory.storageView=ids=>scene?.setStorageOpen(ids);
            inventory.sound = (id, options) => {void worldAudio?.play(id, options);};
            host.append(inventory.hud, inventory.modal);
            inventory.onHudPaint = () => scene?.backgroundChanged();
            inventory.compassView = () => scene && session.view.envelope ? scene.compassView(session.view.envelope.generation) : null;
            inventory.viewport = host; if (inventory.book) host.append(inventory.book.toast); inventory.resize();
            inventory.returnWorkbench = (scene, id) => session.dispatch({type: 'close-workbench', scene, id});
            inventory.acquireOutput = (take, cursor, expected, station) => session.takeOutput(take, cursor, expected, station);
            inventory.fill = (...args) => session.fillRecipe(...args);
            advancements=new AdvancementView(inventory,host,()=>updateGate(),id=>inventory?.book?.sound?.(id));
            inventory.bookCommand = command => session.dispatch(command);
            chat = new GameChat(host, pixels, t, () => session.view.envelope?.state.settings.username ?? 'sireoh', () => updateGate());
            actionBar=new ActionBar(host,pixels,t);
            actionBar.sync((session.view.envelope?.generation??'')+':'+(session.view.envelope?.state.progress.scene??''));
            chat.inputControls=controlSettings(session.view.envelope?.state.settings.controls);
            authorWelcome = new AuthorWelcome(chat, t, appAbort.signal);
            bindOddCakeRemarks(host,chat,t,appAbort.signal,()=>runtimeGeneration??'');
            /** Run native commands against locked facts and exclude replies from discarded game lifetimes.
             * @param {string} source Slash-prefixed player input.
             * @return {Promise<import('./domain/console.ts').CommandFeedback[]>} Committed native feedback or a current-lifetime failure.
             */
            chat.command=async source=>{
                const generation=session.view.envelope?.generation,serial=session.serial,sceneId=session.view.envelope?.state.progress.scene,parsed=parseCommand(source);
                const destination='op'in parsed&&parsed.op==='teleport'?parsed.args.at(-1):sceneId;
                try{
                    const result=await session.transact({type:'console',source});
                    if(disposed||session.serial!==serial||session.view.envelope?.generation!==generation||session.view.envelope?.state.progress.scene!==(result.console?.some(m=>m.error)?sceneId:destination))return[];
                    const messages=result.console??[];
                    if(source.trim()==='/tick query'&&session.tickSamples.length){const samples=session.tickSamples,count=samples.reduce((n,s)=>n+s.ticks,0),ms=samples.reduce((n,s)=>n+s.ms,0),control=session.view.envelope!.state.progress.environment!.control;
                        messages.push({key:control.sprintTicks?'commands.tick.query.rate.sprinting':'commands.tick.query.rate.running',values:{v0:control.tickRate.toFixed(1),v1:(ms/count).toFixed(3),v2:(1000/control.tickRate).toFixed(1)}});
                    }return messages;
                }catch{return !disposed&&session.serial===serial&&session.view.envelope?.generation===generation&&session.view.envelope?.state.progress.scene===sceneId?[{key:'game.actionFailed',error:true}]:[];}
            };
            chat.onPaint = () => scene?.backgroundChanged();
            for (const message of pendingMessages.splice(0)) feedback(message.key,message.values);
            host.dataset.chatReady = 'true';
            session.eventListeners.add(events => {
                for (const event of events) {
                    if(event.type==='world-sound'&&event.scene===session.view.envelope?.state.progress.scene){
                        const owner=runtimeGeneration,serial=session.serial,sceneId=event.scene;
                        void worldAudio?.play(event.sound!,{volume:event.volume,pitch:event.pitch,position:event.position,valid:()=>!disposed&&!session.suspended&&runtimeGeneration===owner&&session.serial===serial&&session.view.envelope?.state.progress.scene===sceneId});
                    }
                    if(event.type==='advancements-completed'){
                        advancements?.notify(event.advancements??[],runtimeGeneration??'');
                        const saved=session.view.envelope?.state;
                        if(saved)for(const line of advancementChat(event,saved))chat?.append(line);
                    }
                    if(event.type==='odd-cake-table-tried')chat?.append([{text:t('chat.oddCakeTable')}],'author');
                    if (event.type === 'cake-crafted') chat?.append([{text:t('chat.cakeReady')}], 'author');
                    if (event.type === 'recipes-discovered') inventory?.book?.notify(event.recipes ?? []);
                    else if (event.type === 'items-acquired') {
                        const pickup=pickupSoundOptions(event),owner=runtimeGeneration,serial=session.serial,sceneId=session.view.envelope?.state.progress.scene;
                        if(pickup)void worldAudio?.play('entity.item.pickup',{...pickup,valid:()=>!disposed&&!session.suspended&&runtimeGeneration===owner&&session.serial===serial&&session.view.envelope?.state.progress.scene===sceneId});
                        for (const line of harvestFeedback(event, t, session.view.envelope?.state.settings.locale)) chat?.append(line);
                    } else if (event.type === 'item-unlocked') {
                        if (!taught) {taught = true; chat?.append([{text: t('chat.tutorial')}]);}
                    }
                }
            });
            music=new GameMusic(worldAudio);
            const campfireAudio=new CampfireAudio(worldAudio,()=>!disposed&&!session.suspended&&scene&&!scene.disposed&&!scene.lost&&!scene.simulationPaused&&!document.hidden?scene.environmentProgress:null);
            scene.movementSound=(id,options)=>{void worldAudio?.play(id,options);};
            if(scene.weather)scene.weather.sound=(id,options)=>{void worldAudio?.play(id,options);};
            scene.onEnvironmentFrame=now=>{if(sleepOverlay){const sleeping=!!session.view.envelope?.state.progress.sleep;sleepOverlay.hidden=!sleeping&&!scene!.sleepView.timer;sleepOverlay.style.pointerEvents=sleeping?'auto':'none';sleepOverlay.style.setProperty('--sleep-shade',String(scene!.sleepView.opacity()));sleepOverlay.querySelector('button')!.hidden=!sleeping;}worldAudio?.listener(scene!.camera.position.toArray(),scene!.camera.getWorldDirection(listenerDirection).toArray());music?.update(now);campfireAudio.update(now,scene!.camera.position.toArray());if(now-lastAudioReport>250){lastAudioReport=now;host.dataset.environmentAudio=JSON.stringify(worldAudio?.records);host.dataset.audioLoad=JSON.stringify({voices:worldAudio?.voices.size,decoding:worldAudio?.loading.size});host.dataset.music=JSON.stringify({pending:music?.pending,playing:!!music?.media&&!music.media.paused,time:music?.media?.currentTime??0,delay:music?.delay,track:music?.track,gain:music?.gain?.gain.value??0,context:worldAudio?.context?.state});}};
            inventory.book!.sound = id => {const owner = runtimeGeneration; void worldAudio?.play(id).then(status => {if (disposed || owner !== runtimeGeneration) return; host.dataset.uiAudio = JSON.stringify(worldAudio?.records); if (!['scheduled','suppressed','cancelled'].includes(status)) feedback(status === 'blocked' ? 'audio.uiBlocked' : 'audio.uiFailed', {}, 'ui-audio');});};
            host.addEventListener('pointerdown', () => worldAudio?.activate(), {capture: true, signal: appAbort.signal});
            host.addEventListener('keydown', () => worldAudio?.activate(), {capture: true, signal: appAbort.signal});
            window.addEventListener('keydown',e=>{if(e.isTrusted&&scene?.input&&['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code))worldAudio?.activate();},{signal:appAbort.signal});
            scene!.enableHands(art,rules);
            if((session.view.envelope?.state.settings.username??'sireoh').toLowerCase()==='sireoh'&&!currentAppearance){const owner=appearanceOwner,initial=await defaultAppearance();if(owner===appearanceOwner&&!currentAppearance)currentAppearance=initial;}
            if(disposed)return;
            if(currentAppearance){scene!.setAppearance(currentAppearance);inventory.playerPreview?.setAppearance(currentAppearance);}
            worldUse = new WorldUse(scene!, inventory, session, key => feedback(key), (id, options) => void worldAudio?.play(id, options),key=>chat?.append([{text:t(key)}],'author'));
            updateGate();
            celebration = new BirthdayCelebration(root, scene!, pixels, art, key => t(key), () => session.view.envelope ? {
                state: session.view.envelope.state,
                generation: session.view.envelope.generation
            } : null, () => edits.view());
            session.eventListeners.add(events => {
                if (events.some(e => e.type === 'cake-placed'||e.type==='cake-replaced')) void celebration?.start();
            });
            stopProcessing = processingClock(session,message=>chat?.commandMessage(message));
            const value = session.view;
            if (value.envelope) reflect(value);

            root.dataset.inventoryReady = 'true';
            // The world render requested by reflect precedes this frame boundary.
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            if (disposed) return;
            if (scene.lost) throw new Error('webgl-unavailable');
            loading?.update('frame', 1);
            loading?.finish();
            if (startup!.finish()) {
                navigationPanel = new NavigationPanel(navigation, t('a11y.showScenes'));
                gameKeyboard = new GameKeyboard(() => !!scene?.input && !disposed);
                authorWelcome.sync(session.view.envelope?.generation ?? '', true);
            }
            startupError.hidden = true;
            updateGate();
        }
    } catch (error) {
        root.dataset.resourceError = error instanceof Error ? error.message : 'unknown';
        const key = error instanceof Error && error.message === 'webgl-unavailable' ? 'error.webgl' : 'error.resource';
        loading?.fail(t(key)); startup?.fail(); scene?.setInputEnabled(false); setText(startupError, key); startupError.hidden = false;
        root.dataset.resources = 'failed'; host.dataset.chatReady = 'failed';
    }
    const show = (event: PageTransitionEvent) => {
        root.dataset.pageshowPersisted = String(event.persisted);
        scene?.requestRender();
    };
    window.addEventListener('pageshow', show);
    window.addEventListener('pagehide', event => {
        advancements?.close(false);advancements?.clearToasts();
        edits.cancel();
        music?.cancel();
        scene?.cancel();
        celebration?.navigation();
        confirmation = null;
        confirmSection.hidden = true;
        clearText(preferenceFeedback);
        if (event.persisted) return;
        disposed = true;clearTimeout(profileTimer);profileQuery++;appearanceOwner++;
        appAbort.abort(); loading?.dispose(); startup?.dispose(); navigationPanel?.dispose(); homeButtonObserver?.disconnect(); localWeather?.dispose();
        window.removeEventListener('blur', cancelSettingsGesture);
        stopProcessing?.();
        chat?.dispose();actionBar?.dispose();gameKeyboard?.dispose();
        advancements?.dispose();
        celebration?.dispose();
        worldUse?.dispose();
        buttonSounds?.dispose();music?.dispose();worldAudio?.dispose();
        nativeScreens.forEach(view => view.dispose());
        unsubscribe();
        connection.dispose();
        inventory?.dispose();
        scene?.dispose();
        pixels?.dispose();
        window.removeEventListener('pageshow', show);
    }, {once: false});
}
