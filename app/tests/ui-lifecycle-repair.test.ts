/** Formal UI lifetime regressions use native-derived boundaries and actual SaveSession transactions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RecipeToastClock} from '../web/src/ui/native-animation.ts';
import {RecipeBookView} from '../web/src/ui/recipe-book.ts';
import {feedbackTransition,FAILURE_COLOR} from '../web/src/ui/system-feedback.ts';
import {NativeMenuBlur} from '../web/src/render/native-menu-blur.ts';
import {Scene,PerspectiveCamera} from 'three';
import {WorldUse} from '../web/src/ui/world-use.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {token} from '../web/src/persistence/codec.ts';
import {WORLD_REGION} from '../web/src/domain/world-config.ts';
import type {Rules} from '../web/src/rules/types.ts';
import type {SceneView} from '../web/src/render/scene.ts';
import type {GameInventory} from '../web/src/ui/inventory.ts';

/** Same-version rule providers used by real world commands. */
const rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;

test('graphics fault, repeated fault, silent recovery and second fault produce exactly two red system failures',()=>{
    const states=new Map<string,string>(),sent:object[]=[];
    for(const key of ['error.contextLost','error.contextLost','error.contextLost','error.contextRestored','error.contextRestored','error.contextLost','error.contextLost']){
        const result=feedbackTransition(states,key,{},'selection');
        if(result!=='omit')sent.push({key,kind:'system',color:result==='failure'?FAILURE_COLOR:undefined});
    }
    assert.deepEqual(sent,Array(2).fill({key:'error.contextLost',kind:'system',color:'#FF5555'}));
    states.clear();assert.equal(feedbackTransition(states,'error.contextLost',{},'selection'),'failure');
});

test('native entering merge changes content at update time, not insertion time, and does not restart entrance',()=>{
    const clock=new RecipeToastClock();clock.add(['a'],0);assert.equal(clock.started,-1);
    assert.equal(clock.sample(0).transition,'show');assert.equal(clock.sample(300).visible,.25);
    clock.add(['b'],301);assert.equal(clock.started,0);assert.equal(clock.contentChanged,true);
    const updated=clock.sample(350);assert.equal(updated.transition,null);assert.equal(clock.changed,0);assert.equal(updated.fullyVisibleFor,0);
    clock.sample(600);assert.equal(clock.sample(5600).transition,'hide');
});

test('native fully-visible merge retains the animation clock and rotates icons by fully-visible time',()=>{
    const clock=new RecipeToastClock();clock.add(['a'],0);clock.sample(0);clock.sample(600);
    clock.add(['b'],2000);const added=clock.sample(2000);assert.equal(added.transition,null);assert.equal(clock.changed,1400);
    assert.equal(clock.sample(3100).index,1);assert.equal(clock.sample(6999).phase,'hold');assert.equal(clock.sample(7000).transition,'hide');
});

test('native HIDE to SHOW uses linear portion restart, preserves content clock and emits the re-entry transition',()=>{
    const clock=new RecipeToastClock();clock.add(['a'],0);clock.sample(0);clock.sample(600);
    assert.equal(clock.sample(5600).transition,'hide');clock.add(['b'],5900);
    const revived=clock.sample(5900);assert.equal(revived.visible,.75);assert.equal(revived.transition,'show');assert.equal(clock.started,5750);assert.equal(clock.changed,5300);assert.equal(revived.fullyVisibleFor,5300);
    const next=clock.sample(5950);assert.equal(next.visible,0.111111119389534);assert.equal(next.fullyVisibleFor,0);assert.equal(clock.changed,5300);
    for(let now=6000;now<=6350;now+=50)clock.sample(now);
    assert.equal(clock.sample(16649).phase,'hold');assert.equal(clock.sample(16650).transition,'hide');assert.equal(clock.sample(17250).phase,'hide');assert.equal(clock.sample(17251).phase,'done');
    clock.add(['c'],17300);assert.deepEqual(clock.entries,['c']);assert.equal(clock.sample(17300).transition,'show');
});

test('formal RecipeBook notify and paint schedule IN, OUT, IN on the native exit interruption, with silent cancellation',()=>{
    let now=0;const previous=Object.getOwnPropertyDescriptor(globalThis,'performance'),sounds:object[]=[];
    Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});Object.defineProperty(globalThis,'devicePixelRatio',{value:1,configurable:true});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{},configurable:true});
    const ctx={setTransform(){},clearRect(){},drawImage(){},save(){},restore(){},scale(){}},book=Object.create(RecipeBookView.prototype) as any;
    Object.assign(book,{ui:{generation:'g',disposed:false,scale:1,permanent:{progress:{recipeBook:{data:{known:['minecraft:oak_planks','minecraft:stick']}}}},pixels:{font:{draw(){}}},text:(k:string)=>k,stack(){}},toast:{style:{},dataset:{},hidden:true,getContext:()=>ctx,setAttribute(){},removeAttribute(){}},toastClock:new RecipeToastClock(),toastEpoch:0,animationFrame:0,animationEpoch:0,disposed:false,syncScope(){},image:()=>({}),render(){},publish(){},animate(){},sound:(id:string)=>sounds.push({id,at:now})});
    try{
        book.notify(['minecraft:oak_planks']);now=600;book.paintToast();now=5600;book.paintToast();now=5900;book.notify(['minecraft:stick']);
        assert.deepEqual(sounds,[{id:'ui.toast.in',at:0},{id:'ui.toast.out',at:5600},{id:'ui.toast.in',at:5900}]);
        assert.equal(JSON.parse(book.toast.dataset.timeline).visible,.75);book.clearToast();assert.equal(sounds.length,3);assert.equal(book.toast.hidden,true);
        book.notify(['minecraft:stick'],'stale-generation');assert.equal(sounds.length,3);
    }finally{if(previous)Object.defineProperty(globalThis,'performance',previous);}
});

test('native menu composites world, HUD and recent chat before all six passes and releases bounded textures',()=>{
    const blur=new NativeMenuBlur(),target={},world=new Scene(),calls:object[]=[];let current:any=target;
    const renderer={autoClear:true,getDrawingBufferSize:(v:any)=>v.set(1280,720),getRenderTarget:()=>current,getViewport:(v:any)=>v.set(0,0,1280,720),getScissor:(v:any)=>v.set(0,0,1280,720),getScissorTest:()=>false,setScissorTest(){},setRenderTarget:(t:any)=>current=t,setViewport(){},setScissor(){},render:(scene:any)=>calls.push({scene,target:current,clear:renderer.autoClear})};
    const sources=['hotbar','recent-chat'].map((key,i)=>({key,canvas:{width:1280,height:720} as HTMLCanvasElement,x:0,y:i?0:650,width:1280,height:i?720:50,viewportWidth:1280,viewportHeight:720}));
    blur.render(renderer as any,world,new PerspectiveCamera(),sources);assert.equal((calls[0] as any).scene,world);assert.equal((calls[2] as any).scene,blur.hud);assert.equal((calls[2] as any).clear,false);assert.equal(calls.length,9);assert.equal(blur.layers.size,2);
    const owned=[...blur.layers.values()];blur.render(renderer as any,world,new PerspectiveCamera(),sources);assert.deepEqual([...blur.layers.values()],owned);
    let released=0;for(const l of owned)l.texture.addEventListener('dispose',()=>released++);
    blur.render(renderer as any,world,new PerspectiveCamera(),[sources[0]]);assert.equal(released,1);blur.dispose();assert.equal(released,2);
});

/** Create two real cooperating save owners and a real WorldUse with only render/sound ports controlled.
 * @return {Promise<object>} Formal sessions, locked queue and observable notifications.
 */
async function worldHarness(){
    let raw:string|null=null,tail=Promise.resolve<unknown>(null),deny=false;
    const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(deny)throw Error('write-failed');raw=v;}},locks={exclusive<T>(work:()=>Promise<T>){const p=tail.then(work);tail=p.catch(()=>{});return p;}};
    const a=new SaveSession(storage,locks,WORLD_REGION),b=new SaveSession(storage,locks,WORLD_REGION);a.rules=b.rules=rules;await a.refresh();await b.refresh();
    const previous=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{value:Object.assign(new EventTarget(),{clearInterval,setInterval}),configurable:true});
    const messages:string[]=[],scene={renderer:{domElement:{dataset:{},style:{}}},showPreview(){},showCrack(){},cancel(){},look:{active:null}} as unknown as SceneView;
    const use=new WorldUse(scene,{rules} as GameInventory,b,k=>messages.push(k),()=>{});
    return {a,b,use,messages,hold:()=>{let release!:()=>void;void locks.exclusive(()=>new Promise<void>(r=>release=r));return async()=>{while(!release)await new Promise(r=>setTimeout(r,0));release();};},deny:(v:boolean)=>deny=v,dispose:()=>{use.dispose();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}};
}

/** Capture a genuine current player's harvest intent before an asynchronous lock wait.
 * @param {SaveSession} session Issuing page.
 * @param {string} node Natural source identity.
 * @return {object} Formal generation-bound command.
 */
function harvest(session:SaveSession,node:string){const p=session.view.envelope!.state.progress;return{type:'harvest-node' as const,node,scene:'plains' as const,visit:p.world.visits.plains.epoch,expected:structuredClone(p.player.data)};}

test('real reset then refresh then old harvest rejection cannot enter new-generation chat',async()=>{
    const h=await worldHarness();try{
        const generation=h.b.view.envelope!.generation,release=h.hold(),reset=h.a.reset(token(h.a.view.envelope!)),refresh=h.b.refresh();
        const harvestJob=h.use.run(harvest(h.b,'oak_log:0'),null);
        await release();await Promise.all([reset,refresh,harvestJob]);assert.notEqual(h.b.view.envelope!.generation,generation);assert.deepEqual(h.messages,[]);assert.deepEqual(h.b.view.envelope!.state.progress.unlocked,[]);assert.deepEqual(h.b.view.envelope!.state.progress.world.visits.plains.removed,[]);
        await h.use.run(harvest(h.b,'missing'),null);assert.deepEqual(h.messages,['game.actionFailed']);
    }finally{h.dispose();}
});

for(const boundary of ['scene','dispose','suspend','resume'] as const)test('queued world failure is scoped to its original '+boundary,async()=>{
    const h=await worldHarness();try{
        const release=h.hold(),navigate=boundary==='scene'?h.b.dispatch({type:'select-scene',scene:'farm'}):Promise.resolve();
        const old=h.use.run(harvest(h.b,'missing'),null);if(boundary==='dispose')h.use.dispose();if(boundary==='suspend'||boundary==='resume')h.b.suspend();const resumed=boundary==='resume'?h.b.resume():Promise.resolve();await release();await Promise.all([navigate,old,resumed]);assert.deepEqual(h.messages,[]);
    }finally{h.dispose();}
});

test('current-generation storage failure still reports once and does not grant or remove the source',async()=>{
    const h=await worldHarness();try{h.deny(true);await h.use.run(harvest(h.b,'oak_log:0'),null);assert.deepEqual(h.messages,['game.actionFailed']);assert.deepEqual(h.b.view.envelope!.state.progress.unlocked,[]);assert.deepEqual(h.b.view.envelope!.state.progress.world.visits.plains.removed,[]);}finally{h.dispose();}
});
