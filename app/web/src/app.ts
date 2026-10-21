/** Formal page composition connects localized screen UI, domain transactions, persistence and independent 3D presentation. */
import birthday from './birthday.json' with {type:'json'};import {translate,loadLocale,ENGLISH} from './i18n/index.ts';import type {Dictionary} from './i18n/index.ts';
import {browserSession} from './persistence/browser.ts';import {token} from './persistence/codec.ts';import type {Snapshot} from './persistence/session.ts';import {hasCake,initialRuntime} from './domain/state.ts';
import {loadResources} from './render/resources.ts';import {SceneView} from './render/scene.ts';import {PixelUI} from './ui/pixels.ts';import './style.css';
import {useWorkbench} from './ui/workbench-use.ts';import {WORKBENCH_REGION} from './domain/workbench-region.ts';import {freeze} from './domain/state.ts';import {GameInventory} from './ui/inventory.ts';import {loadCatalogueArt} from './ui/icons.ts';import {loadRules} from './rules/load.ts';

/** Mount one formal entry; language overrides are ordinary localization inputs, not gameplay or completion hooks.
 * @param {'home'|'game'} page Independent entry identity.
 * @param {Dictionary} locale Optional loaded locale catalogue.
 * @return {Promise<void>} Page initialization, with visible localized capability/resource failures.
 */
export async function mount(page:'home'|'game',locale:Dictionary={}):Promise<void>{
  const root=document.getElementById('app')!,base=import.meta.env.BASE_URL;let dictionary=locale,pixels:PixelUI|null=null,scene:SceneView|null=null,disposed=false,confirmation:string|null=null,lastScene='',localeGeneration=0;
  const runtime=initialRuntime(),connection=browserSession(),session=connection.session,bindings=new Map<HTMLElement,{key:string;values:Record<string,string|number>}>();let runtimeGeneration:string|null=null,inventory:GameInventory|null=null;
  const t=(key:string,values:Record<string,string|number>={})=>translate(key,{...birthday,...values},dictionary);
  /** Build a semantic localized element, retaining its key for future language changes.
   * @param {string} tag Semantic HTML tag.
   * @param {string} key Locale key.
   * @param {string} className Styling hook.
   * @param {Record<string,string|number>} values Named text parameters.
   * @return {HTMLElement} Localized node.
   */
  function node(tag:string,key:string,className='',values:Record<string,string|number>={}):HTMLElement{const n=document.createElement(tag);n.className=className;setText(n,key,values);return n;}
  /** Update text through the localization boundary, never accepting business strings as visible copy.
   * @param {HTMLElement} target Semantic element.
   * @param {string} key Locale key.
   * @param {Record<string,string|number>} values Interpolation values.
   */
  function setText(target:HTMLElement,key:string,values:Record<string,string|number>={}):void{bindings.set(target,{key,values});if(pixels)pixels.text(target,t(key,values),target.tagName==='H1'?3:2);else target.textContent=t(key,values);}
  /** Create an accessible original-sprite action without embedding any test or completion control.
   * @param {string} key Locale key.
   * @param {Function} action User action.
   * @return {HTMLButtonElement} Bound button.
   */
  function button(key:string,action:()=>void):HTMLButtonElement{const b=node('button',key) as HTMLButtonElement;b.type='button';b.addEventListener('click',action);if(pixels)pixels.button(b);return b;}
  document.title=t(page==='home'?'html.homeTitle':'html.gameTitle');document.documentElement.lang='en';root.className=page;
  const header=document.createElement('header'),brand=node('p',page==='home'?'home.eyebrow':'game.eyebrow','brand'),main=document.createElement('main'),copy=document.createElement('article'),host=document.createElement('section'),caption=node('p','common.loading','table-caption'),saveStatus=node('p','common.loading','save-status'),selection=document.createElement('p');
  main.className=page+'-layout';copy.className='copy';host.className='scene-panel';host.id='scene';selection.className='selection';selection.setAttribute('aria-live','polite');saveStatus.setAttribute('aria-label',t('a11y.save'));saveStatus.setAttribute('role','status');caption.id='table-caption';
  const title=node('h1',page==='home'?'home.title':'game.title'),story=node('p',page==='home'?'home.story':'game.note','story');copy.append(title,story);host.append(caption);header.append(brand);
  const link=node('a',page==='home'?'home.invite':'game.back','invite') as HTMLAnchorElement;link.href=page==='home'?base+'game/':base;link.id='invitation';copy.append(link);main.append(copy,host);root.append(header,main,selection,saveStatus);
  const dialog=document.createElement('dialog');dialog.className='settings';dialog.setAttribute('aria-label',t('settings.title'));dialog.id='settings';
  const dialogTitle=node('h2','settings.title'),languageLabel=node('label','settings.language'),language=document.createElement('select'),option=document.createElement('option');option.value='en';option.textContent=t('settings.english');language.id='language';languageLabel.setAttribute('for',language.id);language.append(option);
  const volumeLabel=node('label','settings.volume','volume-label',{percent:20});const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.id='volume';volumeLabel.setAttribute('for',volume.id);
  const muteLabel=node('label','settings.muted'),mute=document.createElement('input');mute.type='checkbox';mute.id='mute';muteLabel.setAttribute('for',mute.id);
  const warning=node('p','settings.resetNote','reset-note'),confirmSection=document.createElement('section');confirmSection.hidden=true;confirmSection.id='reset-confirmation';confirmSection.append(node('h3','settings.resetTitle'),node('p','settings.resetNote'));
  const confirmReset=button('settings.confirm',()=>{if(!confirmation)return;confirmReset.disabled=true;void session.reset(confirmation).then(()=>{confirmation=null;confirmSection.hidden=true;setText(saveStatus,'settings.resetDone');}).catch(()=>{}).finally(()=>{confirmReset.disabled=false;});});
  const cancelReset=button('settings.cancel',()=>{confirmation=null;confirmSection.hidden=true;reset.focus();});confirmSection.append(confirmReset,cancelReset);
  const reset=button('settings.reset',()=>{const value=session.view;if(!value.writable||!value.envelope)return;confirmation=token(value.envelope);confirmSection.hidden=false;confirmReset.focus();});
  const close=button('common.close',()=>dialog.close()),retry=button('common.retry',()=>{void session.refresh();});retry.id='retry-save';
  dialog.append(dialogTitle,languageLabel,language,volumeLabel,volume,mute,muteLabel,warning,reset,confirmSection,close);root.append(dialog,retry);
  const settings=button('common.settings',()=>{inventory?.input.cancel();runtime.screen='settings';scene?.setInputEnabled(false);confirmation=null;confirmSection.hidden=true;dialog.showModal();close.focus();});header.append(settings);
  dialog.addEventListener('close',()=>{runtime.screen=inventory?.modal.open?'inventory':'scene';scene?.setInputEnabled(!inventory?.modal.open);confirmation=null;confirmSection.hidden=true;settings.focus();});
  for(const type of ['pointerdown','pointerup','pointermove','click','wheel','contextmenu'])dialog.addEventListener(type,event=>{if(type==='contextmenu')event.preventDefault();event.stopPropagation();});
  /** Persist a preference through the same durable command layer as future gameplay facts.
   * @param {Partial<import('./domain/types.ts').Settings>} patch Requested preference values.
   */
  function preferences(patch:Partial<import('./domain/types.ts').Settings>):void{void session.dispatch({type:'settings',patch}).catch(()=>{});}
  language.addEventListener('change',()=>preferences({locale:language.value}));volume.addEventListener('input',()=>setText(volumeLabel,'settings.volume',{percent:Math.round(Number(volume.value)*100)}));volume.addEventListener('change',()=>preferences({volume:Number(volume.value)}));mute.addEventListener('change',()=>preferences({muted:mute.checked}));
  /** Reflect one durable snapshot on either page, with no event replay or completion-trigger side effect.
   * @param {Snapshot} value Latest coordinated facts.
   */
  function reflect(value:Snapshot):void{
    if(inventory)inventory.writable=value.writable;
    if(value.envelope&&runtimeGeneration!==value.envelope.generation){runtimeGeneration=value.envelope.generation;runtime.natural={};runtime.celebration='idle';}
    root.dataset.saveStatus=value.status;root.dataset.hasCake=String(!!value.envelope&&hasCake(value.envelope.state));root.dataset.generation=value.envelope?.generation??'';root.dataset.revision=String(value.envelope?.revision??'');
    if(value.envelope){const s=value.envelope.state,placed=hasCake(s);inventory?.sync(s,value.writable,value.envelope.generation);scene?.setCake(placed);setText(caption,placed?'home.complete':'home.empty');if(page==='home')setText(link,placed?'home.return':'home.invite');volume.value=String(s.settings.volume);mute.checked=s.settings.muted;language.value='en';setText(volumeLabel,'settings.volume',{percent:Math.round(s.settings.volume*100)});const signature=JSON.stringify(s.progress.scenes[s.progress.scene]);if(page==='game'&&scene&&signature!==lastScene){scene.sync(s.progress.scenes[s.progress.scene]);lastScene=signature;}
      const generation=++localeGeneration;void loadLocale(s.settings.locale).then(next=>{if(disposed||generation!==localeGeneration)return;dictionary={...next,...locale};for(const [element,binding]of bindings)setText(element,binding.key,binding.values);document.title=t(page==='home'?'html.homeTitle':'html.gameTitle');document.documentElement.lang=s.settings.locale==='en'?'en':Object.keys(next).length?s.settings.locale:'en';});
    }else if(value.status!=='loading')setText(caption,'status.unknown');
    language.disabled=volume.disabled=mute.disabled=reset.disabled=!value.writable;retry.hidden=value.status==='ready';setText(saveStatus,value.status==='ready'?(value.migrated?'status.migrated':'status.ready'):value.status==='loading'?'common.loading':Object.hasOwn(ENGLISH,'error.'+value.status)?'error.'+value.status:'error.generic');
  }
  const unsubscribe=session.subscribe(reflect);await session.refresh();
  try{const resources=await loadResources();if(disposed)return;pixels=new PixelUI(resources);for(const [element,binding]of bindings){element.replaceChildren();setText(element,binding.key,binding.values);}for(const b of root.querySelectorAll<HTMLButtonElement|HTMLAnchorElement>('button,a.invite'))pixels.button(b);scene=new SceneView(host,resources,t(page==='home'?'home.tableLabel':'game.sceneLabel'),page==='game');scene.setInputEnabled(!dialog.open);scene.onPick=hit=>{if(hit.id==='birthday-table')setText(selection,'table.selected');};scene.onUse=(hit,modifiers)=>{if(page==='game'&&hit&&inventory&&useWorkbench(hit,!!modifiers?.shift,inventory,session,key=>setText(selection,key)))return;if(inventory?.autoEquip())return;if(hit)scene?.onPick?.(hit);};scene.onGraphics=ready=>setText(selection,ready?'error.contextRestored':'error.contextLost');reflect(session.view);root.dataset.resources='26.3';if(page==='game'){const [art,rules]=await Promise.all([loadCatalogueArt(),loadRules()]);if(disposed){art.dispose();return;}session.rules=freeze(rules);session.policy=WORKBENCH_REGION;setText(story,'game.workbenchHint');inventory=new GameInventory(root,pixels,art,rules,t,open=>{runtime.screen=open?'inventory':dialog.open?'settings':'scene';scene?.setInputEnabled(!open&&!dialog.open);},()=>dialog.open,(intent,cursor,expected,crafting,workbench)=>session.editInventory(intent,cursor,expected,crafting,workbench),(take,cursor,crafting,expected,workbench)=>session.takeCraft(take,cursor,crafting,expected,workbench));const value=session.view;if(value.envelope)inventory.sync(value.envelope.state,value.writable,value.envelope.generation);header.append(button('inventory.open',()=>inventory?.open()));root.dataset.inventoryReady='true';}}
  catch(error){setText(caption,error instanceof Error&&error.message==='webgl-unavailable'?'error.webgl':'error.resource');root.dataset.resources='failed';}
  const show=(event:PageTransitionEvent)=>{root.dataset.pageshowPersisted=String(event.persisted);scene?.requestRender();};window.addEventListener('pageshow',show);
  window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;unsubscribe();connection.dispose();inventory?.dispose();scene?.dispose();pixels?.dispose();window.removeEventListener('pageshow',show);},{once:false});
}
