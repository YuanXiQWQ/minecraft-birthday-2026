/** Original blockstate variants and multipart models project persisted player construction. */
import {assetPath,blockStatePath} from './asset-path.ts';
import {nativeShapes} from '../domain/block-shapes.ts';
import {Group,Box3,Vector3} from 'three';
import {entityCube} from '../ui/icons.ts';
import {resolveModel,compileModel} from './model-format.ts';
import type {Variant} from './model-format.ts';
import type {VanillaModels} from './vanilla-models.ts';
import type {Resources} from './resources.ts';
import type {PlacedBlock} from '../domain/placed-blocks.ts';
import type {Bounds} from '../domain/player-motion.ts';
import {BLOCK_PROPERTIES} from '../domain/placed-blocks.ts';

/** Match native multipart AND/OR property predicates.
 * @param {any} when Original blockstate predicate.
 * @param {Record<string,string>} state Persistent properties.
 * @return {boolean} Whether to include this native part.
 */
function matches(when:any,state:Record<string,string>):boolean{return !when||Object.entries(when).every(([k,v])=>k==='OR'?(v as any[]).some(w=>matches(w,state)):k==='AND'?(v as any[]).every(w=>matches(w,state)):String(v).split('|').includes(state[k]??'false'));}
/** Compile precisely selected native block models and retain their local shape bounds.
 * @param {PlacedBlock} block Persistent native state.
 * @param {Resources} pack Verified ordinary-build assets.
 * @param {VanillaModels} models Shared native material owner.
 * @return {Group} World block geometry.
 */
export function placedModel(block:PlacedBlock,pack:Resources,models:VanillaModels):Group{
    const doc=pack.documents.get(blockStatePath(block.block)),root=new Group(),shapes:Bounds[]=[];
    if(!doc)throw Error('world-model:'+block.block);
    let variants:Variant[]=[];
    if(doc.multipart)variants=doc.multipart.filter((p:any)=>matches(p.when,block.state)).map((p:any)=>Array.isArray(p.apply)?p.apply[0]:p.apply);
    else {const entry=Object.entries(doc.variants).find(([key])=>!key||key.split(',').every(term=>{const [k,v]=term.split('=');return block.state[k]===v;}));if(!entry)throw Error('world-state:'+block.block+JSON.stringify(block.state));const raw=entry[1] as Variant|Variant[];variants=[Array.isArray(raw)?raw[0]:raw];}
    if(['chest','trapped_chest'].includes(block.block)){
        const body=new Group();body.position.set(.5,0,.5);body.rotation.y=-['south','west','north','east'].indexOf(block.state.facing)*Math.PI/2;
        for(const box of [[1,0,1,14,10,14,0,19],[1,9,1,14,5,14,0,0],[7,7,15,2,4,1,0,0]]){const part=models.sample({id:block.id,block:block.block,state:'',variant:{model:'chest'},compiled:entityCube(box,'minecraft:entity/chest/'+(block.block==='chest'?'normal':'trapped'))});part.position.set(-.5,0,-.5);body.add(part);}root.add(body);shapes.push([1/16,0,1/16,15/16,14/16,15/16]);
    }
    for(const variant of variants){const source=resolveModel(variant.model,id=>{const m=pack.documents.get(assetPath('models',id));if(!m)throw Error('missing-placement-model:'+id);return m;});
        if(!source.elements?.length)continue;
        root.add(models.sample({id:block.id,block:block.block,state:JSON.stringify(block.state),variant,compiled:compileModel(source,variant)}));
        for(const element of source.elements??[]){const c=compileModel({...source,elements:[element]},variant),box=new Box3();for(let i=0;i<c.positions.length;i+=3)box.expandByPoint(new Vector3(...c.positions.slice(i,i+3) as [number,number,number]));if(!box.isEmpty())shapes.push([...box.min.toArray(),...box.max.toArray()] as Bounds);}
    }
    root.position.set(...block.cell);root.userData={id:block.id,cell:block.cell,block:block.block,state:block.state,shapes:nativeShapes(block.block,block.state)??shapes,collisionShapes:nativeShapes(block.block,block.state,true)??shapes,collision:BLOCK_PROPERTIES[block.block]?.collision??false};return root;
}
