/** VERIFICATION_ONLY: finite samples and read-only observations wrap the real game; no synthetic input drives mining or recipe selection. */
import {Vector3} from 'three';
import {mount} from '../web/src/app.ts';
import {WorldUse} from '../web/src/ui/world-use.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {token} from '../web/src/persistence/codec.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
let actual:WorldUse|null=null;
const preview=WorldUse.prototype.preview;
WorldUse.prototype.preview=function(){actual=this;return preview.apply(this);};
await mount('game');
const use=actual as WorldUse|null;if(!use)throw Error('missing-real-world');
const world=use,s=world.session,u=world.inventory,output=document.querySelector<HTMLElement>('#interaction-evidence')!,records:any[]=[],events:any[]=[],transitions:any[]=[];
/** Publish real state and projected ray coordinates without changing the camera or gesture.
 * @param {string} label Observation identity.
 */
function record(label:string):void{
 const p=s.view.envelope!.state.progress,canvas=world.scene.renderer.domElement,r=canvas.getBoundingClientRect(),v=new Vector3(2.5,.85,.5).project(world.scene.camera),point=[r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];
 const sample={label,at:performance.now(),generation:s.view.envelope!.generation,revision:s.view.envelope!.revision,holding:world.holding,mining:world.mining,pending:!!world.miningTicket,pointer:world.scene.pointer,unlocked:p.unlocked,removed:p.world.visits[p.scene].removed,stations:p.scenes[p.scene].stations.map(x=>({id:x.id,cell:x.cell})),backpack:p.player.data.backpack,hotbar:p.player.data.hotbar,gui:u.modal.open,ghost:u.modal.dataset.ghostAvailability??null,preview:u.preview,noticeElements:document.querySelectorAll('.inventory-hint').length,tooltip:{visible:!u.tooltip.hidden,text:u.tooltip.textContent},point,hit:world.scene.pick(point[0],point[1])?.id??null};
 records.push(sample);if(records.length>160)records.shift();const signature=JSON.stringify([sample.generation,sample.holding,sample.mining?.id,sample.pending,sample.stations,sample.backpack,sample.gui,sample.ghost]);if(transitions.at(-1)?.signature!==signature)transitions.push({signature,sample});output.textContent=JSON.stringify({records,events,transitions});
}
/** Reset only this isolated verification origin and prepare a bounded actual finite sample.
 * @param {'missing'|'chain'|'table'} mode Named fixture with no production entry.
 */
async function prepare(mode:'missing'|'chain'|'table'):Promise<void>{
 await u.close(true);await s.reset(token(s.view.envelope!));
 const items=mode==='missing'?['oak_planks']:mode==='table'?['crafting_table','cobblestone','stick']:['wooden_pickaxe','furnace'];
 for(const id of items)await s.dispatch({type:'unlock',item:'minecraft:'+id});
 for(const [index,id] of items.entries()){const v=await s.editInventory({type:'source',item:'minecraft:'+id,mode:id==='furnace'?'clone':'left'},null,s.view.envelope!.state.progress.player.data);await s.editInventory(id==='wooden_pickaxe'?{type:'slot',index:0,button:0}:{type:'backpack-slot',index,button:0},v.cursor,s.view.envelope!.state.progress.player.data);}
 if(mode==='chain')for(const [id,cell] of [['front',[2,0,0]],['rear',[3,0,-3]]] as const)await s.dispatch({type:'put-station',scene:'plains',station:{id,kind:'furnace',cell:[...cell],facing:'south',contents:emptyFurnace()}});
 if(mode==='table')await s.dispatch({type:'put-station',scene:'plains',station:{id:'table',kind:'crafting_table',cell:[2,0,0],facing:'south',contents:{version:1,data:{grid:Array(9).fill(null)}}}});
 if(world.scene.mode?.desired==='hidden')world.scene.mode.toggle();
 records.length=0;events.length=0;transitions.length=0;record('prepared:'+mode);
}
document.querySelector('#missing')!.addEventListener('click',()=>void prepare('missing').catch(e=>{output.textContent=JSON.stringify({error:String(e)});}));
document.querySelector('#chain')!.addEventListener('click',()=>void prepare('chain').catch(e=>{output.textContent=JSON.stringify({error:String(e)});}));
document.querySelector('#table')!.addEventListener('click',()=>void prepare('table').catch(e=>{output.textContent=JSON.stringify({error:String(e)});}));
for(const type of ['pointerdown','pointerup','pointermove'])world.scene.renderer.domElement.addEventListener(type,e=>{const p=e as PointerEvent;events.push({type,trusted:e.isTrusted,button:p.button,buttons:p.buttons,x:p.clientX,y:p.clientY,at:performance.now()});record(type);});
s.subscribe(()=>record('save'));
setInterval(()=>record('observe'),100);
record('ready');
