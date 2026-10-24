/** VERIFICATION_ONLY: real native alpha/depth rays and motion geometry, separate from formal screenshot evidence. */
import {loadResources} from '../web/src/render/resources.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {initialState} from '../web/src/domain/state.ts';
import {currentFarm,FARM_PLOTS} from '../web/src/domain/farm-shape.ts';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {playerBounds,overlaps} from '../web/src/domain/player-motion.ts';
import {emptyFurnace,inputChanged} from '../web/src/domain/furnace.ts';
import {loadRules} from '../web/src/rules/load.ts';
import {surfaces} from './spatial-access.ts';
import {Vector3,Box3} from 'three';
import type {Object3D} from 'three';
import type {Cell} from '../web/src/domain/types.ts';
if(import.meta.env.MODE!=='verification')throw Error('verification-only');
/** Production renderer and same verified native models; this isolated page has no ordinary save session. */
const pack=await loadResources(true),rules=await loadRules(),view=new SceneView(document.getElementById('scene')!,pack,'Farm geometry verification',true);
let state=initialState();
/** Project a reproducible crop/device sample without modifying resource identities.
 * @param {string} name Fixture condition.
 */
function show(name:string):void{
    state=initialState();const p=state.progress;p.scene='farm';p.environment!.control.frozen=true;
    if(name==='mature'||name==='mixed')p.scenes.farm.crops=FARM_PLOTS.filter((_,i)=>name==='mature'||i<3).map((cell,i)=>({id:'crop-'+i,item:'minecraft:wheat_seeds',cell,growth:{version:1,data:{ticks:240}}}));
    if(name==='legacy')p.scenes.farm.stations=([[3,0,-7],[-6,0,-8],[-6,0,-4],[-8,5,-10]] as Cell[]).map((cell,i)=>{const contents=emptyFurnace();contents.data.input={id:'minecraft:oak_log',count:3};inputChanged(contents.data,null,'furnace',rules);return{id:'retained-farm-'+i,kind:'furnace',cell,facing:'south',contents};});
    view.syncWorld(p);view.camera.position.set(...WORLD_SCENES.farm.eye);view.camera.lookAt(...WORLD_SCENES.farm.target);view.camera.updateMatrixWorld(true);view.requestRender();
}
/** Enumerate ground positions connected to spawn by collision-free native-size player steps.
 * @return {Cell[]} Reachable standing positions, excluding the water trench and solid scenery.
 */
function approaches():Cell[]{
    const ground=currentFarm(state.progress),seen=new Set<string>(),queue:Cell[]=[[0,0,7]],out:Cell[]=[];
    for(let i=0;i<queue.length;i++){
        const [x,,z]=queue[i],key=x+','+z;if(seen.has(key)||x<-18||x>18||z<-22||z>10)continue;seen.add(key);
        const b=ground.cells.get([x,-1,z].join(','));if(!b||b.block==='water')continue;
        const feet:Cell=[x+.5,b.rainTop,z+.5];if(view.collision.some(box=>overlaps(playerBounds(feet),box)))continue;
        out.push(feet);queue.push([x-1,0,z],[x+1,0,z],[x,0,z-1],[x,0,z+1]);
    }return out;
}
/** Find both a centered ray and an off-center pointer ray against unchanged actual geometry from a walkable approach.
 * @param {Object3D} object Actual native target.
 * @param {Cell[]} feet Reachable candidate poses.
 * @return {object|null} Alpha-tested original-model evidence including the ordinary save pose for native-input replay.
 */
function target(object:Object3D,feet:Cell[]):object|null{
    const id=String(object.userData.id),box=new Box3().setFromObject(object),points=surfaces(object),r=view.renderer.domElement.getBoundingClientRect();
    const reach=/cow|chicken/.test(id)?2.99:4.49;
    const candidates=feet.filter(f=>box.distanceToPoint(new Vector3(f[0],f[1]+1.62,f[2]))<reach).sort((a,b)=>Math.hypot(a[0],a[2]-7)-Math.hypot(b[0],b[2]-7));
    for(const foot of candidates){
        view.camera.position.set(foot[0],foot[1]+1.62,foot[2]);
        for(const point of points){
            const d=point.clone().sub(view.camera.position),yaw=Math.atan2(-d.x,-d.z),pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));
            view.camera.rotation.set(pitch,yaw,0,'YXZ');view.camera.updateMatrixWorld(true);
            const center=view.pick(r.left+r.width/2,r.top+r.height/2);if(center?.id!==id)continue;
            view.camera.rotation.y=yaw+.12;view.camera.updateMatrixWorld(true);const ndc=point.clone().project(view.camera);
            if(Math.abs(ndc.x)>=.99||Math.abs(ndc.y)>=.99)continue;
            const x=r.left+(ndc.x+1)*r.width/2,y=r.top+(1-ndc.y)*r.height/2,visible=view.pick(x,y);if(visible?.id!==id)continue;
            return {id,feet:foot,yaw,pitch,center,visible,pointer:[x,y],distance:point.distanceTo(view.camera.position)};
        }
    }return null;
}
/** Audit empty/mature/mixed targets, compatibility, rain heights and growth-driven static ownership.
 * @return {object} Actual native geometry results; does not claim trusted input events.
 */
function audit(){
    const cases=[];
    for(const name of ['empty','mature','mixed','legacy']){
        show(name);const feet=approaches(),targets=[...view.authored!.natural.children,...view.authored!.crops.children,...view.persistent.children];
        if(name==='empty'||name==='mixed')view.authored!.farmRoot!.traverse(o=>{if(String(o.userData.id).startsWith('plot:')&&!state.progress.scenes.farm.crops.some(c=>'plot:'+c.cell.join(',')===o.userData.id))targets.push(o);});
        const rays=targets.map(o=>({id:o.userData.id,result:target(o,feet)}));
        const staticVersion=view.authored!.staticVersion,root=view.authored!.farmRoot!.children[0];state.progress.world.tick+=80;
        for(const crop of state.progress.scenes.farm.crops)crop.growth={version:1,data:{ticks:80}};
        view.syncWorld(state.progress);
        view.precipitation!.rebuild(view.camera,state.progress,view.authored!.staticRoot,false);
        cases.push({name,walkable:feet.length,rays,staticRetained:staticVersion===view.authored!.staticVersion&&root===view.authored!.farmRoot!.children[0],rainHeights:Object.fromEntries(['-9:-9','-12:-8','-6:-4','8:-3'].map(k=>[k,view.precipitation!.heights.get(k)]))});
    }
    const result={viewport:[innerWidth,innerHeight],cases,passed:cases.every(c=>c.staticRetained&&c.rays.every(r=>r.result))};
    show('empty');return result;
}
Object.assign(window,{farmTest:{view,show,audit}});show('empty');document.body.dataset.ready='true';
