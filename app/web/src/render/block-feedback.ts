/** Original terrain sprites, volume particles and SheetedDecalTextureGenerator crack projection for Java 26.3. */
import {assetPath,blockStatePath} from './asset-path.ts';
import {AddEquation,BufferGeometry,Color,CustomBlending,DstColorFactor,Euler,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,OneFactor,Quaternion,RepeatWrapping,SrcColorFactor,Vector3,ZeroFactor} from 'three';
import type {Object3D,PerspectiveCamera,Scene} from 'three';
import {NativeRandom} from '../domain/environment.ts';
import {FULL_BLOCK,nativeShapes} from '../domain/block-shapes.ts';
import type {Bounds} from '../domain/player-motion.ts';
import type {Cell} from '../domain/types.ts';
import {resolveModel,resolveTexture} from './model-format.ts';
import {terrainBurst,terrainFragment,tickTerrainFragment} from './terrain-fragments.ts';
import type {TerrainFragment} from './terrain-fragments.ts';
import type {Resources} from './resources.ts';
import type {VanillaModels} from './vanilla-models.ts';
import type {BlockLight} from './block-light.ts';

/** Direction.getRotation, in native DOWN/UP/NORTH/SOUTH/WEST/EAST order. */
const ROTATIONS=[new Euler(Math.PI,0,0),new Euler(),new Euler(Math.PI/2,0,Math.PI),new Euler(Math.PI/2,0,0),new Euler(Math.PI/2,0,Math.PI/2),new Euler(Math.PI/2,0,-Math.PI/2)].map(e=>new Quaternion().setFromEuler(e));
/** Native face normals use the same nearest-direction order as the decal generator. */
const NORMALS=[new Vector3(0,-1,0),new Vector3(0,1,0),new Vector3(0,0,-1),new Vector3(0,0,1),new Vector3(-1,0,0),new Vector3(1,0,0)];
/** Shared face-projection axes and billboard corner winding. */
const Y_AXIS=new Vector3(0,1,0),X_AXIS=new Vector3(1,0,0),CORNERS=[[-1,-1],[1,-1],[1,1],[-1,1]];

/** Calculate native crack UV from block-local position and actual transformed face normal.
 * @param {Vector3} position Block-local vertex, independent of the block's base texture UV.
 * @param {Vector3} normal Transformed face normal.
 * @return {number[]} Repeating sheeted decal coordinates.
 */
export function crackUv(position:Vector3,normal:Vector3):number[] {
    let direction=0,largest=-Infinity;
    NORMALS.forEach((axis,i)=>{const dot=axis.dot(normal);if(dot>largest){largest=dot;direction=i;}});
    const p=position.clone().applyAxisAngle(Y_AXIS,Math.PI).applyAxisAngle(X_AXIS,-Math.PI/2).applyQuaternion(ROTATIONS[direction]);
    return[-p.x,-p.y];
}

/** Resolve the declared native particle sprite through the model parent chain, without texture-name guesses.
 * @param {Resources} pack Audited native documents.
 * @param {string} block Native block name.
 * @param {Record<string,string>} state Current native properties.
 * @return {object} Original particle texture and whether its model material is biome tinted.
 */
export function particleSprite(pack:Resources,block:string,state:Record<string,string>={}) {
    const doc=pack.documents.get(blockStatePath(block));
    const raw=doc?.variants?Object.entries(doc.variants).find(([key])=>!key||key.split(',').every(term=>{const[k,v]=term.split('=');return state[k]===v;}))?.[1]??Object.values(doc.variants)[0]:doc?.multipart?.[0]?.apply;
    const variant=Array.isArray(raw)?raw[0]:raw;
    if(!variant?.model)throw Error('world-particle-model:'+block);
    const model=resolveModel(variant.model,id=>{const source=pack.documents.get(assetPath('models',id));if(!source)throw Error('missing-particle-model:'+id);return source;});
    const texture=resolveTexture('#particle',model.textures??{});
    const tinted=model.elements?.some(element=>Object.values(element.faces).some(face=>face?.tintindex!==undefined&&resolveTexture(face.texture,model.textures??{})===texture))??false;
    return {texture,tinted};
}

interface FragmentBatch {mesh:Mesh<BufferGeometry,MeshBasicMaterial>;particles:TerrainFragment[];start:number;tick:number;solids:Bounds[]}

/** Own transient particles and crack meshes while reusing already loaded native texture allocations. */
export class BlockFeedback {
    batches:FragmentBatch[]=[];
    materials=new Map<string,MeshBasicMaterial>();
    sprites=new Map<string,ReturnType<typeof particleSprite>>();
    random=new NativeRandom(Date.now()%2147483647);
    crack:Group|null=null;
    target:Object3D|null=null;
    stage=-1;
    right=new Vector3();
    up=new Vector3();

    /** Retain one live world's native resource and render owners.
     * @param {Resources} pack Verified original resource set.
     * @param {VanillaModels} models Shared animated block sprite owner.
     * @param {Scene} scene Real world scene.
     * @param {PerspectiveCamera} camera Actual observer for billboarding.
     * @param {BlockLight|null} light Existing finite light field.
     */
    constructor(public pack:Resources,public models:VanillaModels,public scene:Scene,public camera:PerspectiveCamera,public light:BlockLight|null) {}

    /** Reuse one material per original particle texture and model tint.
     * @param {string} block Native short block identity.
     * @param {Record<string,string>} state Native block properties.
     * @return {MeshBasicMaterial} Shared, correctly darkened terrain-particle material.
     */
    material(block:string,state:Record<string,string>):MeshBasicMaterial {
        const key=block+JSON.stringify(state);
        let sprite=this.sprites.get(key);if(!sprite){sprite=particleSprite(this.pack,block,state);this.sprites.set(key,sprite);}
        const id=sprite.texture+':'+sprite.tinted;
        let material=this.materials.get(id);
        if(!material){
            const map=this.models.textures.get(sprite.texture)?.map;if(!map)throw Error('world-particle-texture:'+sprite.texture);
            const tint=sprite.tinted?(sprite.texture.includes('leaves')?this.pack.tints?.foliage:this.pack.tints?.grass)??0xffffff:0xffffff;
            material=new MeshBasicMaterial({map,color:new Color().setRGB(((tint>>16)&255)/255*.6,((tint>>8)&255)/255*.6,(tint&255)/255*.6),transparent:true,alphaTest:.1,depthWrite:true,toneMapped:false});
            this.light?.bind(material);this.materials.set(id,material);
        }
        return material;
    }

    /** Submit volume-distributed break particles only after the associated transaction succeeds.
     * @param {string} block Broken native block.
     * @param {Cell} cell Actual integer block origin.
     * @param {Record<string,string>} state Committed source properties.
     * @param {Bounds[]} solids Current world collisions after removal.
     * @param {Bounds[]|undefined} shapes Actual selection shape if provided by a native model.
     */
    burst(block:string,cell:Cell,state:Record<string,string>,solids:Bounds[],shapes?:Bounds[]):void {
        this.add(block,state,terrainBurst(shapes??nativeShapes(block,state)??[FULL_BLOCK],cell,()=>this.random.float()),cell,solids);
    }

    /** Submit one original hit fragment outside the struck voxel face, scaled by native power and size.
     * @param {string} block Struck block.
     * @param {Cell} cell Native block origin.
     * @param {Cell} normal Actual selected face.
     * @param {Record<string,string>} state Native block properties.
     * @param {Bounds[]} solids Current collision field.
     */
    hit(block:string,cell:Cell,normal:Cell,state:Record<string,string>,solids:Bounds[]):void {
        const direction=new Vector3(...normal);
        normal=NORMALS.reduce((best,candidate)=>candidate.dot(direction)>best.dot(direction)?candidate:best,NORMALS[0]).toArray() as Cell;
        const boxes=nativeShapes(block,state)??[FULL_BLOCK];if(!boxes.length)return;
        const bounds:Bounds=[0,1,2].map(i=>Math.min(...boxes.map(b=>b[i]))).concat([0,1,2].map(i=>Math.max(...boxes.map(b=>b[i+3])))) as Bounds;
        const point=cell.map((n,i)=>n+(normal[i]?(normal[i]>0?bounds[i+3]+Math.fround(.1):bounds[i]-Math.fround(.1)):bounds[i]+Math.fround(.1)+this.random.float()*(bounds[i+3]-bounds[i]-Math.fround(.2)))) as Cell;
        const p=terrainFragment(point,[0,0,0],()=>this.random.float());
        p.velocity=[p.velocity[0]*Math.fround(.2),(p.velocity[1]-Math.fround(.1))*Math.fround(.2)+Math.fround(.1),p.velocity[2]*Math.fround(.2)];
        p.halfSize*=Math.fround(.6);p.body=Math.fround(.2)*Math.fround(.6);
        this.add(block,state,[p],cell,solids);
    }

    /** Batch a native particle event into one draw and shared texture instead of allocating a texture per fragment.
     * @param {string} block Native block.
     * @param {Record<string,string>} state Native properties.
     * @param {TerrainFragment[]} particles New event fragments.
     * @param {Cell} cell Source origin for bounded collision selection.
     * @param {Bounds[]} solids Current world collisions.
     */
    add(block:string,state:Record<string,string>,particles:TerrainFragment[],cell:Cell,solids:Bounds[]):void {
        if(!particles.length)return;
        const geometry=new BufferGeometry(),positions=new Float32Array(particles.length*12),uvs:number[]=[],normals:number[]=[],indices:number[]=[];
        particles.forEach((p,i)=>{uvs.push(p.u/4,1-(p.v+1)/4,(p.u+1)/4,1-(p.v+1)/4,(p.u+1)/4,1-p.v/4,p.u/4,1-p.v/4);for(let n=0;n<4;n++)normals.push(0,1,0);indices.push(i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3);});
        geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
        const mesh=new Mesh(geometry,this.material(block,state));mesh.frustumCulled=false;this.scene.add(mesh);
        this.batches.push({mesh,particles,start:performance.now(),tick:0,solids:solids.filter(b=>b[0]<cell[0]+8&&b[3]>cell[0]-8&&b[1]<cell[1]+4&&b[4]>cell[1]-16&&b[2]<cell[2]+8&&b[5]>cell[2]-8)});
        this.update(performance.now());
    }

    /** Advance native 20 Hz particles and interpolate billboards at the actual rendered frame rate.
     * @param {number} now Monotonic frame time; Infinity clears all transient particles.
     */
    update(now:number):void {
        const right=this.right.set(1,0,0).applyQuaternion(this.camera.quaternion),up=this.up.set(0,1,0).applyQuaternion(this.camera.quaternion);
        this.batches=this.batches.filter(batch=>{
            if(!Number.isFinite(now)){batch.mesh.removeFromParent();batch.mesh.geometry.dispose();return false;}
            const time=Math.max(0,(now-batch.start)/50),tick=Math.floor(time);
            while(batch.tick<tick){batch.tick++;for(const p of batch.particles)if(p.age<=p.lifetime)tickTerrainFragment(p,batch.solids);}
            if(batch.particles.every(p=>p.age>p.lifetime)){batch.mesh.removeFromParent();batch.mesh.geometry.dispose();return false;}
            const positions=batch.mesh.geometry.getAttribute('position'),alpha=time-tick;
            batch.particles.forEach((p,i)=>{const x=p.previous[0]+(p.position[0]-p.previous[0])*alpha,y=p.previous[1]+(p.position[1]-p.previous[1])*alpha,z=p.previous[2]+(p.position[2]-p.previous[2])*alpha,size=p.age>p.lifetime?0:p.halfSize;
                CORNERS.forEach(([cx,cy],j)=>positions.setXYZ(i*4+j,x+(right.x*cx+up.x*cy)*size,y+(right.y*cx+up.y*cy)*size,z+(right.z*cx+up.z*cy)*size));});
            positions.needsUpdate=true;return true;
        });
    }

    /** Apply repeating native crack projection with the original DST_COLOR/SRC_COLOR blend and depth bias.
     * @param {Object3D|null} target Actual block geometry, or null to clear.
     * @param {number} stage Native zero-based destruction stage.
     * @param {Cell} cell Block-local projection origin.
     */
    showCrack(target:Object3D|null,stage:number,cell:Cell=[0,0,0]):void {
        if(target===this.target&&stage===this.stage)return;
        const map=this.models.textures.get('minecraft:block/destroy_stage_'+Math.max(0,Math.min(9,stage)))?.map;
        if(target!==this.target){
            this.clearCrack();this.target=target;
            if(target&&map){
                const overlay=new Group();target.updateMatrixWorld(true);
                target.traverse(object=>{if(!(object instanceof Mesh))return;
                    const geometry=object.geometry.clone(),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uvs:number[]=[];
                    for(let i=0;i<positions.count;i++){const p=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).sub(new Vector3(...cell)),normal=new Vector3().fromBufferAttribute(normals,i).transformDirection(object.matrixWorld);const [u,v]=crackUv(p,normal);uvs.push(u,1-v);}
                    geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
                    const material=new MeshBasicMaterial({map,transparent:true,alphaTest:.1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-10,blending:CustomBlending,blendSrc:DstColorFactor,blendDst:SrcColorFactor,blendEquation:AddEquation,blendSrcAlpha:OneFactor,blendDstAlpha:ZeroFactor,toneMapped:false});
                    const mesh=new Mesh(geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(object.matrixWorld);overlay.add(mesh);
                });this.crack=overlay;this.scene.add(overlay);
            }
        }
        this.stage=stage;
        if(map){if(map.wrapS!==RepeatWrapping||map.wrapT!==RepeatWrapping){map.wrapS=map.wrapT=RepeatWrapping;map.needsUpdate=true;}this.crack?.traverse(object=>{if(object instanceof Mesh)(object.material as MeshBasicMaterial).map=map;});}
    }

    /** Release only owned overlay geometry and materials, retaining shared native sprite textures. */
    clearCrack():void {this.crack?.removeFromParent();this.crack?.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();(object.material as MeshBasicMaterial).dispose();}});this.crack=null;this.target=null;this.stage=-1;}
    /** Release every transient allocation before the shared native model owner is disposed. */
    dispose():void {this.update(Infinity);this.clearCrack();for(const material of this.materials.values())material.dispose();this.materials.clear();}
}
