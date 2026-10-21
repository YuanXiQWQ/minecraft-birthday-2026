/** P2 debug controller: immutable placement commands, real scene input and a minimal screen-space panel. */
import { SceneAdapter } from './scene-adapter.ts';
import { change, edges, fixture, KINDS, place, placementError, restore } from './domain.ts';
import type { Cell, Facing, Kind, Layout } from './domain.ts';
import type { Pick, View } from './scene-adapter.ts';
import { browserChecks } from './browser-checks.ts';
import { loadVanillaPack } from './vanilla-pack.ts';
import type { VanillaPack } from './vanilla-pack.ts';
import { vanillaBrowserChecks } from './vanilla-checks.ts';
import { loadGuiPack } from './gui-pack.ts';
import { GuiView } from './gui-view.ts';
import { GUI_TEXT as G } from './gui-labels.ts';
import { CelebrationController } from './celebration-controller.ts';
import { measure } from './metrics.ts';
import { TEXT as T } from './labels.ts';
import {resourceFailureChecks} from './resource-checks.ts';
import './style.css';

/** This experiment's save never reads or writes the future product namespace. */
const STORAGE_KEY = 'minecraft-birthday:p2-scene3d:layout-v1';
/** Debug controller state is ephemeral except an explicitly saved logical layout. */
let layout: Layout = fixture(), selected: string | null = null, mode = 'inspect', facing: Facing = 'north',
  lastPick: Pick | null = null, candidate: Cell | null = null, panelOpen = false, busy = false, actions = 0, pointerEvents = 0,
  worldPointer: number | null = null;
/** Browser evidence is deliberately exposed in the diagnostic DOM for inspection/export. */
const evidence: { checks?: object; vanillaChecks?:object; guiChecks?:object; contextLoss?:object; resourceFailures?:object; resourceLoad?:object; guiLoad?:object; measurements: object[]; rendererRestarts: object[]; errors: string[] } = { measurements: [], rendererRestarts: [], errors: [] };
/** Modal key releases remain consumed even if their key-down closed the screen. */
const modalKeys=new Set<string>();
/** No world wheel behavior is added; this counter verifies modal event ownership. */
let worldWheels=0;
/** Loaded original resources are shared independently of serialized logical layout. */
let localPack:VanillaPack|null=null;
/** Celebration research owns no product trigger and shares the existing scene frame loop. */
let celebration:CelebrationController;

/** Build DOM safely without evaluating labels or state as markup.
 * @param {string} tag HTML tag.
 * @param {string} text Text content.
 * @param {string} className Optional CSS class.
 * @return {HTMLElement} Detached node.
 */
function el(tag: string, text = '', className = ''): HTMLElement { const n = document.createElement(tag); n.textContent=text; n.className=className; return n; }

/** Create a real diagnostic button with an explicit action.
 * @param {string} text Localized text.
 * @param {Function} action Click callback.
 * @return {HTMLButtonElement} Button element.
 */
function button(text: string, action: () => void): HTMLButtonElement { const b = el('button',text) as HTMLButtonElement; b.type='button'; b.addEventListener('click',action); return b; }

/** Convert internal diagnostic errors into externalized feedback and a separate raw evidence record.
 * @param {unknown} error Caught error.
 */
function fail(error: unknown): void { const code = error instanceof Error ? error.message : String(error); status.textContent=T.errors[code] ?? T.failed; evidence.errors.push(code); showEvidence(); }

/** Publish the experiment evidence without accessing or leaking Minecraft source files. */
function showEvidence(): void { results.textContent=JSON.stringify(evidence,null,2); }

/** Apply a validated layout, invalidate removed GUI bindings and refresh the rendering adapter.
 * @param {Layout} next Validated new layout.
 */
function commit(next: Layout): void { layout=next; actions++; if(gui.activeId&&gui.activeId!=='player'&&!layout.instances.some(e=>e.id===gui.activeId))openPanel(null); adapter.sync(layout); adapter.select(selected); status.textContent=T.success; updateDiagnostics(); }

/** Update visible state and projected test targets from the actual camera/canvas. */
function updateDiagnostics(): void {
  stateBox.textContent=JSON.stringify({ mode, facing, selected, panelOpen, activeGuiId:gui.activeId,worldWheels,busy, actions, pointerEvents, lastPick, candidate, debugOpen: !developer.hidden,
    instances: layout.instances, environment: adapter.diagnostics() },null,2);
  links.textContent=JSON.stringify(edges(layout),null,2);
  targets.textContent=JSON.stringify({ ground_2_0_2: adapter.project([2.5,.005,2.5]), furnace_w2: adapter.project([.5,1.5,.5]),
    table_w1: adapter.project([-1.5,.5,.5]), devices:layout.instances.map(e=>({id:e.id,kind:e.kind,point:adapter.project([e.cell[0]+.5,e.cell[1]+.5,e.cell[2]+.5]),upperPoint:adapter.project([e.cell[0]+.88,e.cell[1]+.9,e.cell[2]+.88])})), note: 'canvas-local CSS coordinates; these are diagnostics, not click hotspots' },null,2);
  direction.textContent=facing;
  modeHint.textContent=`${T[mode as 'inspect'|'place'|'remove']} · ${type.value} · ${facing}`;
}

/** Cancel transient placement without changing saved instances. */
function clearPreview(): void { candidate=null; worldPointer=null; adapter.showPreview(null,type.value as Kind,facing,false); }

/** Select the next valid diagnostic orientation.
 * @param {Kind} kind Device kind.
 * @param {Facing} current Existing direction.
 * @return {Facing} Next orientation.
 */
function nextFacing(kind: Kind, current: Facing): Facing { const choices: Facing[] = kind==='hopper' ? ['north','east','south','west','down'] : ['north','east','south','west']; return choices[(choices.indexOf(current)+1)%choices.length]; }

/** Set a tool mode and clear stale preselection.
 * @param {string} next Inspect, place or remove mode.
 */
function setMode(next: string): void { if (panelOpen||busy) return; mode=next; clearPreview(); for (const b of tools.querySelectorAll('button[data-mode]')) b.classList.toggle('active',b.getAttribute('data-mode')===next); updateDiagnostics(); }

/** Recompute a visible target from real pointer coordinates instead of trusting a cached hover.
 * @param {PointerEvent} event Canvas pointer.
 * @return {Pick|null} Real surface hit.
 */
function fromPointer(event: PointerEvent): Pick | null { const r=adapter.renderer.domElement.getBoundingClientRect(); return adapter.pick(event.clientX-r.left,event.clientY-r.top); }

/** Draw only a validly targeted 3D preview; noninteractive walls block placement behind them.
 * @param {PointerEvent} event Canvas pointer.
 */
function hover(event: PointerEvent): void {
  if (panelOpen||busy) return; lastPick=fromPointer(event);
  candidate=mode==='place' && lastPick && lastPick.role!=='occluder' ? lastPick.candidate : null;
  adapter.showPreview(candidate,type.value as Kind,facing,Boolean(candidate && !placementError(layout,candidate))); updateDiagnostics();
}

/** Open or close a screen-space GUI and cancel pending world gestures.
 * @param {string|null} id Live device ID, player sentinel or null to close.
 */
function openPanel(id: string | null): void {
  const instance=layout.instances.find(e=>e.id===id);
  if(id&&id!=='player'&&!instance)return;
  panelOpen=Boolean(id); overlay.hidden=!panelOpen; clearPreview();
  developer.inert=panelOpen; header.inert=panelOpen;
  if(id)gui.show(instance?.kind??'inventory',id);else gui.close();
  updateDiagnostics();
}

/** Route one physical pointer action; the modal gate precedes all world access.
 * @param {PointerEvent} event Canvas pointer-up.
 */
function act(event: PointerEvent): void {
  if (panelOpen||busy||event.button!==0||worldPointer!==event.pointerId) return;
  worldPointer=null;
  pointerEvents++; lastPick=fromPointer(event);
  if (!lastPick) { fail(new Error('no-target')); return; }
  try {
    if (mode==='place') {
      if (lastPick.role==='occluder') throw new Error('occluded');
      const next=place(layout,type.value as Kind,lastPick.candidate,facing); selected=next.instances.at(-1)!.id; commit(next); clearPreview();
    } else if (lastPick.role==='device') {
      selected=lastPick.id;
      if (mode==='remove') { commit(change(layout,selected,null)); selected=null; adapter.select(null); }
      else { adapter.select(selected); openPanel(selected); }
    } else status.textContent=T.errors.occluded;
    updateDiagnostics();
  } catch (error) { fail(error); }
}

/** Assert that even a direct canvas event is rejected while the 2D sample panel is open.
 * @return {boolean} Whether logical state and pointer counters were preserved.
 */
function panelProbe(): boolean {
  const before=JSON.stringify(layout), count=pointerEvents, oldMode=mode; mode='place'; openPanel(layout.instances[0]?.id??'player');
  const r=adapter.renderer.domElement.getBoundingClientRect(), p=adapter.project([2.5,.005,2.5]);
  for(const name of ['pointerdown','pointerup']) adapter.renderer.domElement.dispatchEvent(new PointerEvent(name,{ clientX:r.left+p.x,clientY:r.top+p.y,button:0,pointerId:99,bubbles:true }));
  openPanel(null); mode=oldMode;
  return JSON.stringify(layout)===before && pointerEvents===count;
}

/** Attach listeners to this renderer's canvas only; disposal removes that canvas entirely. */
function bindCanvas(): void {
  const canvas=adapter.renderer.domElement;
  adapter.onResize=updateDiagnostics;
  adapter.onContextChange=lost=>{if(lost){openPanel(null);clearPreview();busy=true;status.textContent=T.contextLost;}else{busy=false;status.textContent=T.contextRestored;updateDiagnostics();}};
  canvas.addEventListener('pointermove',hover); canvas.addEventListener('pointerup',act);
  canvas.addEventListener('pointerdown',event=>{ if(!panelOpen&&!busy&&event.button===0)worldPointer=event.pointerId; });
  canvas.addEventListener('pointercancel',()=>{ worldPointer=null; });
  canvas.addEventListener('pointerleave',() => { if (!busy) clearPreview(); });
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel',()=>{if(!panelOpen&&!busy){worldWheels++;updateDiagnostics();}});
}

/** Replace the renderer while preserving logical state and the diagnostic eye station. */
function restart(): void {
  if (busy||panelOpen) return;
  clearPreview(); const old=adapter, vanilla=old.vanilla; const oldEffect=celebration;old.dispose();
  evidence.rendererRestarts.push({ celebration:{disposed:oldEffect.disposed,activeSources:oldEffect.audio.sources.size,nodeChains:oldEffect.audio.chains.size,geometryBalanced:oldEffect.batch?.created===oldEffect.batch?.released,atlasDisposed:oldEffect.batch?.disposed},disposed: old.disposed, created: old.models.created, released: old.models.released,
    sharedMaterials: old.models.materials.size, retainedDeviceMappings: old.objects.size, canvasConnected: old.renderer.domElement.isConnected,
    vanilla:vanilla?{created:vanilla.created,released:vanilla.released,textures:vanilla.textures.size,materials:vanilla.materials.size}:null });
  adapter=new SceneAdapter(viewport,T.canvas); adapter.setView(old.view); adapter.setDebugVisible(!developer.hidden);
  if(vanilla&&localPack)adapter.setVanilla(localPack);adapter.lit=old.lit;sampleSelect.value='';
  adapter.sync(layout); adapter.select(selected); bindCanvas(); adapter.renderOnce(); updateDiagnostics(); showEvidence();
  celebration=new CelebrationController(adapter,developer);
  void celebration.load();
}

/** Activate repository originals; failure is reported rather than accepting diagnostic geometry as original.
 * @return {Promise<void>} Completion of the ordinary resource loading attempt.
 */
async function activateVanilla():Promise<void> {
  if(busy||panelOpen)return;busy=true;clearPreview();status.textContent=T.loading;
  try {
    localPack??=await loadVanillaPack();adapter.setVanilla(localPack);adapter.sync(layout);adapter.deviceRoot.visible=true;adapter.stoneRoot.visible=true;adapter.renderOnce();
    warning.textContent=T.vanillaWarning;sampleSelect.replaceChildren();const empty=el('option',T.noSample) as HTMLOptionElement;empty.value='';sampleSelect.append(empty);
    for(const sample of localPack.samples){const option=el('option',sample.id) as HTMLOptionElement;option.value=sample.id;sampleSelect.append(option);}
    evidence.resourceLoad={status:'loaded',...localPack.loading};status.textContent=T.success;
  } catch(error){evidence.resourceLoad={...localPack?.loading,status:'blocked',reason:String(error)};status.textContent=T.blocked;}
  finally{busy=false;updateDiagnostics();showEvidence();}
}

/** Load an independently audited GUI cohort without changing the camera, layout or renderer mode.
 * @return {Promise<void>} Resource attempt with explicit unavailable evidence.
 */
async function activateGui():Promise<void> {
  if(busy||panelOpen)return;busy=true;clearPreview();
  try{localPack??=await loadVanillaPack();const next=await loadGuiPack(localPack);gui.pack?.dispose();gui.pack=next;gui.publish();evidence.guiLoad={status:'loaded',...next.loading};status.textContent=T.success;}
  catch(error){evidence.guiLoad={status:'BLOCKED',reason:String(error)};status.textContent=G.unavailable;}
  finally{busy=false;updateDiagnostics();showEvidence();}
}

/** Verify screen ownership and stale-instance invalidation without persisting any finite GUI groups. */
function guiFoundationChecks():void {
  if(busy||panelOpen)return;const original=layout,oldSelected=selected;
  try {
    commit(fixture());openPanel('w2');const raster=gui.verify(),r=adapter.renderer.domElement.getBoundingClientRect(),before=worldWheels;
    adapter.renderer.domElement.dispatchEvent(new WheelEvent('wheel',{bubbles:true,clientX:r.left+100,clientY:r.top+100}));
    commit(change(layout,'w2',null));const invalidated=!panelOpen&&gui.activeId===null;
    const recreated=place(layout,'furnace',[0,1,0],'north'),freshId=recreated.instances.at(-1)!.id;commit(recreated);openPanel(freshId);
    const rebound=gui.activeId===freshId&&freshId!=='w2';openPanel(null);
    evidence.guiChecks={raster,invalidated,rebound,worldWheelBlocked:before===worldWheels,pointerGate:panelProbe(),scope:'synthetic integration; physical input records are separate'};
  } catch(error){evidence.guiChecks={status:'FAIL',reason:String(error)};}
  finally{openPanel(null);selected=oldSelected;commit(original);showEvidence();}
}

/** Generate a bounded stress fixture without adding world simulation or product dimensions. */
function denseFixture(): void {
  if (panelOpen||busy) return; let next=fixture();
  for(let x=-3;x<=3;x++) for(let z=-2;z<=2;z++) if(!placementError(next,[x,0,z])) next=place(next,(x+z)%2 ? 'hopper':'furnace',[x,0,z],'east');
  selected=null; clearPreview(); commit(next);
}

/** Freeze interactions during each preliminary timing run so its workload stays fixed. */
async function collectMetrics(): Promise<void> {
  if(busy||panelOpen) return; clearPreview(); busy=true; updateDiagnostics();
  try { const sample=await measure(adapter,run=>{ status.textContent=T.measuring.replace('{run}',String(run)); }); evidence.measurements.push(sample); status.textContent=T.complete; }
  catch(error) { fail(error); }
  finally { busy=false; updateDiagnostics(); showEvidence(); }
}

/** Profile the existing seeded celebration with original GUI and devices throughout every measured run.
 * @return {Promise<void>} Bounded continuous warm-up and measurement sequence.
 */
async function profileJoint():Promise<void>{
  if(busy||panelOpen)return;clearPreview();developer.hidden=true;adapter.setDebugVisible(false);toggleDeveloper.textContent=T.developer;toggleDeveloper.setAttribute('aria-expanded','false');openPanel('player');busy=true;
  try{await celebration.measureContinuous(2,10);}catch(error){fail(error);}finally{busy=false;openPanel(null);updateDiagnostics();}
}

/** Test native graphics loss with a live combined effect and GUI, preserving the same renderer and logical layout.
 * @return {Promise<void>} Auditable native event and modal cancellation evidence.
 */
async function probeContext():Promise<void>{
  if(busy||panelOpen)return;const before=JSON.stringify(layout),renderer=adapter,number=evidence.rendererRestarts.length;
  await celebration.play('combined');openPanel('w2');busy=true;
  try{await new Promise(resolve=>setTimeout(resolve,1800));const result=await adapter.contextLossProbe();evidence.contextLoss={result,sameAdapter:renderer===adapter,unchangedLayout:before===JSON.stringify(layout),rendererRebuilds:evidence.rendererRestarts.length-number,guiClosed:!panelOpen,effect:celebration.snapshot(),environment:adapter.diagnostics()};}
  catch(error){evidence.contextLoss={status:'FAIL',reason:String(error)};}
  finally{busy=false;updateDiagnostics();showEvidence();}
}

/** Diagnostic DOM nodes do not become part of any game save. */
const app=document.getElementById('app')!, header=el('header'), toolbar=el('section','','toolbar'), tools=el('div','','tools');
const developer=el('aside','','developer'), footer=el('footer'), modeHint=el('span','','mode-hint');
const warning=el('p',T.warning,'warning'), sampleSelect=el('select') as HTMLSelectElement;
sampleSelect.setAttribute('aria-label',T.sample);
developer.id='developer-panel'; developer.hidden=true; developer.setAttribute('aria-label',T.developerTitle);
const toggleDeveloper=button(T.developer,()=>{
  if(panelOpen)return; developer.hidden=!developer.hidden; adapter.setDebugVisible(!developer.hidden);
  toggleDeveloper.textContent=developer.hidden?T.developer:T.hideDeveloper;
  toggleDeveloper.setAttribute('aria-expanded',String(!developer.hidden)); clearPreview(); updateDiagnostics();
});
toggleDeveloper.setAttribute('aria-expanded','false'); toggleDeveloper.setAttribute('aria-controls',developer.id);
const status=el('output',T.ready,'status'), viewport=el('div','','viewport'), overlay=el('div','','modal-mask');
const gui=new GuiView(overlay,()=>openPanel(null),()=>{if(typeof adapter!=='undefined')updateDiagnostics();});
const type=el('select') as HTMLSelectElement, direction=el('span',facing,'badge'), camera=el('select') as HTMLSelectElement;
const stateBox=el('pre'), links=el('pre'), results=el('pre'), targets=el('pre');
stateBox.id='state'; links.id='links'; results.id='evidence'; targets.id='targets'; status.id='status';
status.setAttribute('aria-live','polite'); type.setAttribute('aria-label',T.device); camera.setAttribute('aria-label',T.view);
for(const kind of KINDS) { const option=el('option',kind) as HTMLOptionElement; option.value=kind; type.append(option); } type.value='furnace';
for(const view of ['Front','Left','Right'] as View[]) { const option=el('option',T.views[view]) as HTMLOptionElement; option.value=view; camera.append(option); }
header.append(el('h1',T.title));
const back=el('a',T.back) as HTMLAnchorElement; back.href='../'; header.append(back);
header.append(toggleDeveloper);
for(const [label,value] of [[T.inspect,'inspect'],[T.place,'place'],[T.remove,'remove']]) {
  const b=button(label,()=>setMode(value)); b.dataset.mode=value; if(value==='inspect') b.className='active'; tools.append(b);
}
toolbar.append(tools,type,direction,button(T.rotatePreview,()=>{ if(panelOpen||busy)return; facing=nextFacing(type.value as Kind,facing); clearPreview(); updateDiagnostics(); }),camera);
overlay.hidden=true; overlay.id='device-panel'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label',T.panel);
for(const name of ['pointerdown','pointermove','pointerup','click','dblclick','wheel','contextmenu']) overlay.addEventListener(name,event=>event.stopPropagation());
viewport.append(overlay); footer.append(modeHint,status,warning);
app.append(viewport,header,footer);
let adapter: SceneAdapter;
try { adapter=new SceneAdapter(viewport,T.canvas); }
catch(error) { status.textContent=T.unsupported; evidence.errors.push(String(error)); throw error; }
adapter.sync(layout);adapter.deviceRoot.visible=false;adapter.stoneRoot.visible=false;bindCanvas(); adapter.renderOnce();
type.addEventListener('change',()=>{ facing=type.value==='hopper'?'down':'north'; clearPreview(); updateDiagnostics(); });
camera.addEventListener('change',()=>{ if(panelOpen||busy)return; clearPreview(); adapter.setView(camera.value as View); updateDiagnostics(); });
sampleSelect.addEventListener('change',()=>{if(panelOpen||busy||!adapter.vanilla)return;clearPreview();adapter.showSample(sampleSelect.value||null);adapter.renderOnce();status.textContent=sampleSelect.value?`${T.sample}: ${sampleSelect.value}`:T.noSample;updateDiagnostics();});
for(const name of ['keydown','keyup'] as const)document.addEventListener(name,event=>{
  if(name==='keyup'&&modalKeys.has(event.code)){modalKeys.delete(event.code);if(panelOpen)gui.key(event);else gui.record(event,null);event.stopPropagation();event.preventDefault();return;}
  if(panelOpen){if(name==='keydown')modalKeys.add(event.code);gui.key(event);return;}
  const editable=event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement;
  if(name==='keydown'&&event.code==='KeyE'&&!event.repeat&&!editable&&!busy){event.preventDefault();modalKeys.add(event.code);openPanel('player');}
},{capture:true});
window.addEventListener('blur',()=>{ worldPointer=null; });
const actionsBar=el('div','','toolbar');
const assetTools=el('div','','toolbar');
assetTools.append(button(G.load,()=>{void activateGui();}),button(G.inventory,()=>{if(!busy&&!panelOpen)openPanel('player');}),button(G.checks,guiFoundationChecks));
assetTools.append(button(T.localVanilla,()=>{void activateVanilla();}),button(T.debugMode,()=>{
  if(panelOpen||busy)return;clearPreview();adapter.setVanilla(null);adapter.sync(layout);adapter.deviceRoot.visible=true;adapter.stoneRoot.visible=true;warning.textContent=T.warning;sampleSelect.value='';updateDiagnostics();
}),sampleSelect,button(T.toggleLit,()=>{if(panelOpen||busy)return;clearPreview();adapter.lit=!adapter.lit;adapter.sync(layout);updateDiagnostics();}),
button(T.vanillaChecks,()=>{if(panelOpen||busy)return;clearPreview();adapter.showSample(null);evidence.vanillaChecks=vanillaBrowserChecks(adapter,layout);updateDiagnostics();showEvidence();}));
actionsBar.append(button(T.rotateSelected,()=>{ if(panelOpen||busy||!selected)return; try { const e=layout.instances.find(v=>v.id===selected)!; commit(change(layout,e.id,nextFacing(e.kind,e.facing))); } catch(error){fail(error);} }),
  button(T.reset,()=>{ if(panelOpen||busy)return; selected=null; clearPreview(); commit(fixture()); }),button(T.dense,denseFixture),
  button(T.save,()=>{ if(panelOpen||busy)return; try { localStorage.setItem(STORAGE_KEY,JSON.stringify(layout)); status.textContent=T.saved; } catch(error){fail(error);} }),
  button(T.restore,()=>{ if(panelOpen||busy)return; try { const raw=localStorage.getItem(STORAGE_KEY); if(!raw)throw new Error('no-save'); selected=null; clearPreview(); commit(restore(raw)); status.textContent=T.restored; } catch(error){fail(error);} }),
  button(T.checks,()=>{ if(panelOpen||busy)return; clearPreview(); evidence.checks=browserChecks(adapter,layout,panelProbe); updateDiagnostics(); showEvidence(); status.textContent=T.complete; }),
  button(T.measure,()=>{ void collectMetrics(); }),button(T.profileJoint,()=>{void profileJoint();}),button(T.contextProbe,()=>{void probeContext();}),button(T.resourceFailures,()=>{if(busy||panelOpen)return;busy=true;void resourceFailureChecks().then(result=>{evidence.resourceFailures=result;}).catch(fail).finally(()=>{busy=false;showEvidence();updateDiagnostics();});}),button(T.restart,restart));
const diagnostics=el('div','','diagnostics');
for(const [label,body] of [[T.state,stateBox],[T.links,links],[T.targets,targets],[T.results,results]] as [string,HTMLElement][]) {
  const section=el('section','','card'); section.append(el('h2',label),body); diagnostics.append(section);
}
developer.append(el('h2',T.developerTitle),el('p',T.help,'help'),assetTools,toolbar,actionsBar,diagnostics);
app.append(developer); updateDiagnostics(); showEvidence();
celebration=new CelebrationController(adapter,developer);
/** Initialize all implemented original features without requiring developer controls or a private cache.
 * @return {Promise<void>} Original model, GUI and celebration resource readiness.
 */
async function initializeOriginals():Promise<void>{await activateVanilla();await activateGui();await celebration.load();updateDiagnostics();showEvidence();}
void initializeOriginals();
window.addEventListener('pagehide',()=>{adapter.dispose();gui.pack?.dispose();});
