/** VERIFICATION_ONLY: actual native geometry, alpha rays and fixture saves; never part of published builds. */
import {loadResources} from '../web/src/render/resources.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {initialState, transition} from '../web/src/domain/state.ts';
import {WORLD_REGION, WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {emptyFurnace, inputChanged} from '../web/src/domain/furnace.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {SAVE_KEY} from '../web/src/persistence/session.ts';
import {reachable} from './spatial-access.ts';
import {loadRules} from '../web/src/rules/load.ts';
import type {State} from '../web/src/domain/types.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');

/** Native resources, rules and canvas are the ordinary production implementations. */
const pack=await loadResources(true),rules=await loadRules(),view=new SceneView(document.getElementById('scene')!,pack,'Cave verification',true);
let state=initialState();
/** Build a named, explicitly controlled sample without editing any existing user save.
 * @param {string} name Sample variant.
 * @return {State} Finite test facts.
 */
function sample(name:string):State {
    const s=initialState();s.progress.scene='cave';
    s.progress.unlocked=['iron_pickaxe','crafting_table','furnace','blast_furnace','hopper','oak_log'].map(i=>'minecraft:'+i);
    s.progress.player.data.hotbar=[{id:'minecraft:iron_pickaxe',count:1},{id:'minecraft:crafting_table',count:1},{id:'minecraft:furnace',count:1},{id:'minecraft:blast_furnace',count:1},{id:'minecraft:hopper',count:1},null,null,null,null];
    if(name==='partial')s.progress.world.visits.cave.removed=['stone:0','stone:1','stone:2','coal_ore:1','iron_ore:0','iron_ore:1'];
    if(name==='empty'||name==='occupied')s.progress.world.visits.cave.removed=WORLD_SCENES.cave.nodes.map(n=>n.id);
    if(name==='legacy'||name==='occupied'||name==='devices'||name==='torch-conflict') {
        const contents=emptyFurnace();contents.data.input={id:'minecraft:oak_log',count:3};inputChanged(contents.data,null,'furnace',rules);
        s.progress.scenes.cave.stations=[{id:'saved-cave-furnace',kind:'furnace',cell:name==='legacy'?[-5,0,1]:name==='occupied'?[-1,0,-4]:name==='torch-conflict'?[5,1,-1]:[3,0,0],facing:'south',contents}];
    }
    return s;
}
/** Restore approved camera direction after controlled reachability measurements. */
function center():void {view.look.yaw=view.look.pitch=0;view.camera.lookAt(...WORLD_SCENES.cave.target);view.camera.updateMatrixWorld(true);view.requestRender();}
/** Project the named sample through the production scene lifecycle.
 * @param {string} name Controlled sample name.
 */
function show(name:string):void {state=sample(name);view.syncWorld(state.progress);center();}
/** Compare source peeling, device protection, color stability and restored-source occupancy.
 * @return {object} Actual viewport, production rays and lifecycle evidence.
 */
function audit() {
    show('default');
    const sources=[]; const remaining=[...view.authored!.natural.children];
    while(remaining.length){const i=remaining.findIndex(o=>reachable(view,o));if(i<0)break;const [o]=remaining.splice(i,1);sources.push(reachable(view,o));view.release(o);}
    const failures=remaining.map(o=>o.userData.id);
    show('partial');const partial=view.authored!.natural.children.map(o=>o.userData.id);
    show('empty');const empty=view.authored!.natural.children.length;
    const devices=[];
    for(const name of ['legacy','occupied','devices','torch-conflict']) {
        show(name);const saved=JSON.stringify(state.progress.scenes.cave.stations);
        const ray=reachable(view,view.persistent.children[0]);
        const lights=structuredClone(view.authored!.caveLights);
        for(const scene of ['home','plains','farm','cave'] as const){state=transition(state,{type:'select-scene',scene},WORLD_REGION,rules).state;view.syncWorld(state.progress);}
        devices.push({name,ray,lights,unchanged:JSON.stringify(state.progress.scenes.cave.stations)===saved,overlap:view.authored!.natural.children.some(o=>o.position.equals(view.persistent.children[0].position))});
    }
    show('default');
    const memory: {created:number;released:number;live:number}[]=[];for(let i=0;i<6;i++){for(const scene of ['home','cave'] as const){state=transition(state,{type:'select-scene',scene},WORLD_REGION,rules).state;view.syncWorld(state.progress);} memory.push({created:view.models.created,released:view.models.released,live:view.models.created-view.models.released});}
    center();
    const result={viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,sources,failures,partial,empty,devices,memory,passed:!failures.length&&sources.length===12&&partial.length===6&&empty===0&&devices.every(d=>d.ray&&d.unchanged&&!d.overlap)&&memory.every(m=>m.live===memory[0].live)};
    document.getElementById('evidence')!.textContent=JSON.stringify(result);return result;
}
/** Seed only the browser automation's isolated origin with an auditable valid fixture envelope.
 * @param {string} name Controlled sample name.
 * @return {Promise<void>} Storage completion before navigating to the ordinary application.
 */
async function seed(name:string):Promise<void>{localStorage.setItem(SAVE_KEY,JSON.stringify(await seal(sample(name),'cave-browser-fixture',0)));}
Object.assign(window,{caveTest:{view,show,audit,seed}});show('default');document.body.dataset.ready='true';
