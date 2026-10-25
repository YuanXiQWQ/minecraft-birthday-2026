/** Finite, persistent native block placement uses actual held groups and adjacent world faces. */
import type {StorageContents} from './storage.ts';
import {ODD_BLOCK,isCake} from './easter-egg.ts';
import {soilAt} from './soil-state.ts';
import names from '../data/placeable-blocks.json' with {type:'json'};
import facts from '../data/block-properties.json' with {type:'json'};
import caneSupport from '../data/cane-support.json' with {type:'json'};
import type {Cell,Progress} from './types.ts';
import {WORLD_SCENES,fixedSolid,sameCell,nodeAtCell,caveCleared} from './world-config.ts';
import {plainsHeight} from './plains-shape.ts';
import {currentFarm} from './farm-shape.ts';
import {currentHome,homeFloor} from './home-shape.ts';
import {overlaps,playerBounds} from './player-motion.ts';
import loot from '../data/placed-loot.json' with {type:'json'};
import type {Rules,Stack} from '../rules/types.ts';
import {correctTool} from '../rules/process.ts';
import {nativeShapes,FULL_BLOCK} from './block-shapes.ts';

export interface PlacedBlock {id:string;block:string;cell:Cell;state:Record<string,string>;pair?:string;contents?:StorageContents}
export interface BlockHit {cell:Cell;normal:Cell;point:Cell;eye:Cell;yaw:number;pitch?:number;crouch?:boolean}
/** Original reachable BlockItem identities; ordinary wheat is an item, not a placeable block. */
export const PLACEABLE=new Set([...names,ODD_BLOCK]);
/** Native registered strength and collision facts. */
export const BLOCK_PROPERTIES:Record<string,{hardness:number;requires:boolean;collision:boolean;source:string}>= {...facts,[ODD_BLOCK]:facts.cake};
/** Evaluate the original block loot for an unenchanted finite placed block.
 * @param {PlacedBlock} block Broken primary state.
 * @param {Stack|null} tool Actual held stack.
 * @param {Rules} rules Native tool eligibility.
 * @param {boolean} requireTool Whether player harvesting requires the correct tool.
 * @return {Stack[]} Actual native drops, including empty cake drops.
 */
export function placedDrops(block:PlacedBlock,tool:Stack|null,rules:Rules,requireTool=true):Stack[]{
    if(block.block===ODD_BLOCK)return [];
    const name=block.block==='wall_torch'?'torch':block.block==='oak_wall_sign'?'oak_sign':block.block;
    if(requireTool&&BLOCK_PROPERTIES[name].requires&&(!tool||!correctTool(tool.id,'minecraft:'+name,rules)))return [];
    const table=(loot as Record<string,any>)[name],out:Stack[]=[];
    /** Evaluate the finite original loot predicates. @param {any} c Predicate. @return {boolean} Eligibility. */
    function condition(c:any):boolean{if(!c)return true;if(typeof c==='string'){if(c==='minecraft:tool/can_silk_touch')return Number((tool?.components?.['minecraft:enchantments'] as any)?.['minecraft:silk_touch']??0)>0;if(c==='minecraft:tool/can_shear')return tool?.id==='minecraft:shears';throw Error('unsupported-placement-predicate');}if(c.type==='minecraft:survives_explosion')return true;if(c.type==='minecraft:match_block')return c.blocks==='minecraft:'+name&&Object.entries(c.state??{}).every(([k,v])=>block.state[k]===v);if(c.type==='minecraft:random_chance')return Math.random()<c.chance;throw Error('unsupported-placement-predicate');}
    /** Visit native alternatives and count modifiers. @param {any} entry Loot entry. @return {boolean} Whether this alternative qualified. */
    function visit(entry:any):boolean{if(!condition(entry.condition))return false;if(entry.type==='minecraft:alternatives')return entry.children.some(visit);if(entry.type!=='minecraft:item')throw Error('unsupported-placement-loot');let count=1;for(const m of [entry.modifier??[]].flat()){if(!condition(m.condition))continue;if(m.type==='minecraft:set_count')count=m.count;else if(!['minecraft:copy_components','minecraft:explosion_decay','minecraft:apply_bonus'].includes(m.type))throw Error('unsupported-placement-modifier');}out.push({id:entry.name,count});return true;}
    for(const pool of table.pools??[])if(condition(pool.condition))for(const entry of pool.entries)visit(entry);return out;
}
/** Resolve persistent, natural, terrain and authored solid occupancy.
 * @param {Progress} p Current scene facts.
 * @param {Cell} cell Queried world cell.
 * @return {{block:string,state:Record<string,string>,id?:string}|null} Native state or air.
 */
export function blockAt(p:Progress,cell:Cell):{block:string;state:Record<string,string>;id?:string}|null{
    const soil=soilAt(p,cell);if(soil)return {block:soil.grass?'grass_block':soil.moisture===null?'dirt':'farmland',state:soil.grass?{snowy:'false'}:soil.moisture===null?{}:{moisture:String(soil.moisture)}};
    const scene=p.scenes[p.scene],placed=scene.blocks?.find(b=>sameCell(b.cell,cell));if(placed)return placed;
    const device=scene.stations.find(s=>sameCell(s.cell,cell));if(device)return {block:device.kind,state:{facing:device.facing},id:device.id};
    const crop=scene.crops.find(c=>sameCell(c.cell,cell));if(crop)return {block:'wheat',state:{},id:crop.id};
    if(p.scene==='home'&&cell[0]>=-2&&cell[0]<=1&&cell[2]>=-4&&cell[2]<=-2&&cell[1]>=0&&cell[1]<=1)return {block:'oak_planks',state:{}};
    const node=WORLD_SCENES[p.scene].nodes.find(n=>!n.kind&&nodeAtCell(n,cell)&&!p.world.visits[p.scene].removed.includes(n.id));
    if(node&&!(p.scene==='cave'&&caveCleared(p).has(cell.join(','))))return {block:node.block,state:{},id:'node:'+node.id};
    if(cell[0]<-18||cell[0]>18||cell[2]<-22||cell[2]>10)return null;
    if(p.scene==='home'){
        const b=currentHome(p).get(cell.join(','));
        if(b)return {block:b.block,state:Object.fromEntries(b.state.split(',').filter(Boolean).map(s=>s.split('=')))};
        return cell[1]>=-4&&cell[1]<0?{block:cell[1]===-1?homeFloor(cell[0],cell[2]):'dirt',state:{}}:null;
    }
    if(p.scene==='farm'){const b=currentFarm(p).cells.get(cell.join(','));return b?{block:b.block,state:b.state}:cell[1]<-1&&cell[1]>=-4?{block:'dirt',state:{}}:null;}
    if(fixedSolid(p.scene,cell))return {block:p.scene==='cave'?'stone':'oak_planks',state:{}};
    const ground=p.scene==='plains'?plainsHeight(cell[0],cell[2]):0;
    if(cell[1]<ground&&cell[1]>=-4){return {block:cell[1]===ground-1?WORLD_SCENES[p.scene].floor:'dirt',state:{}};}
    return null;
}
/** Read native horizontal facing from the player's view.
 * @param {number} yaw Three camera yaw.
 * @return {string} Cardinal look direction.
 */
export function lookFacing(yaw:number):string{return ['north','west','south','east'][((Math.round(yaw/(Math.PI/2))%4)+4)%4];}
/** Opposite native horizontal face. @param {string} face Direction. @return {string} Opposite direction. */
export function opposite(face:string):string{return ({north:'south',south:'north',east:'west',west:'east',up:'down',down:'up'} as Record<string,string>)[face];}
/** Unit step toward a native block face. @param {string} face Direction. @return {Cell} Integer offset. */
export function direction(face:string):Cell{return ({north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0],up:[0,1,0],down:[0,-1,0]} as Record<string,Cell>)[face];}
/** Decide replaceable cells using the native BlockPlaceContext plant behavior.
 * @param {string|undefined} block Target block.
 * @return {boolean} Air or replaceable vegetation.
 */
export function replaceable(block:string|undefined):boolean{return !block||['short_grass','tall_grass','water'].includes(block);}
/** Compute native state and multipart footprint before consuming inventory; ordinary cake requires the birthday-table transaction.
 * @param {Progress} p Latest world facts.
 * @param {string} item Held BlockItem short name.
 * @param {BlockHit} hit In-range ray and actual player pose.
 * @param {string} id Unique placement lifetime.
 * @return {PlacedBlock[]} Atomic block footprint.
 */
export function placementBlocks(p:Progress,item:string,hit:BlockHit,id:string):PlacedBlock[]{
    if(item==='cake')throw Error('birthday-table-required');
    if(!PLACEABLE.has(item)||!hit.eye.every(Number.isFinite)||Math.hypot(...hit.point.map((v,i)=>v-hit.eye[i]))>4.50001)throw Error('invalid-block-placement');
    const target=blockAt(p,hit.cell),face=hit.normal[1]>0?'up':hit.normal[1]<0?'down':hit.normal[0]>0?'east':hit.normal[0]<0?'west':hit.normal[2]>0?'south':'north';
    let cell=(replaceable(target?.block)?hit.cell:hit.cell.map((n,i)=>n+hit.normal[i])) as Cell,block=item;
    const facing=lookFacing(hit.yaw),state:Record<string,string>={waterlogged:'false'};
    const slab=item.endsWith('_slab');
    if(slab&&target?.block===item&&target.state.type!=='double'&&(face==='up'&&target.state.type==='bottom'||face==='down'&&target.state.type==='top'||!['up','down'].includes(face)&&(target.state.type==='bottom'?hit.point[1]-hit.cell[1]>.5:hit.point[1]-hit.cell[1]<=.5))){cell=hit.cell;state.type='double';}
    else if(slab){const existing=blockAt(p,cell);if(existing?.block===item&&existing.state.type!=='double')state.type='double';else state.type=face==='down'||face!=='up'&&hit.point[1]-Math.floor(hit.point[1])>.5?'top':'bottom';}
    if(/_log$|_wood$|^hay_block$|^iron_chain$/.test(item))state.axis=Math.abs(hit.normal[0])?'x':Math.abs(hit.normal[2])?'z':'y';
    if(item.endsWith('_stairs'))Object.assign(state,{facing,half:face==='down'||face!=='up'&&hit.point[1]%1>.5?'top':'bottom',shape:'straight'});
    if(/_fence$|_wall$|iron_bars/.test(item)){for(const d of ['north','east','south','west'])state[d]=item.endsWith('_wall')?'none':'false';if(item.endsWith('_wall'))state.up='true';}
    if(/_door$/.test(item))Object.assign(state,{facing,half:'lower',hinge:'left',open:'false',powered:'false'});
    if(item.endsWith('_door')){
        const d=direction(facing),left:Cell=[d[2],0,-d[0]],right:Cell=[-d[2],0,d[0]],l=blockAt(p,cell.map((n,i)=>n+left[i]) as Cell),r=blockAt(p,cell.map((n,i)=>n+right[i]) as Cell);
        let balance=0;for(const y of [0,1])for(const [offset,sign] of [[left,-1],[right,1]] as const){const b=blockAt(p,[cell[0]+offset[0],cell[1]+y,cell[2]+offset[2]]);if(b&&fullBlock(b.block,b.state))balance+=sign;}
        const doorLeft=l?.block.endsWith('_door')&&l.state.half==='lower',doorRight=r?.block.endsWith('_door')&&r.state.half==='lower';
        const x=hit.point[0]-cell[0],z=hit.point[2]-cell[2];state.hinge=doorLeft&&!doorRight||balance>0?'right':doorRight&&!doorLeft||balance<0?'left':d[0]<0&&z<.5||d[0]>0&&z>.5||d[2]<0&&x>.5||d[2]>0&&x<.5?'right':'left';
    }
    if(item.endsWith('_trapdoor'))Object.assign(state,{facing:face==='up'||face==='down'?opposite(facing):face,half:face==='down'||face!=='up'&&hit.point[1]%1>.5?'top':'bottom',open:'false',powered:'false'});
    if(item.endsWith('_fence_gate'))Object.assign(state,{facing,open:'false',powered:'false',in_wall:'false'});
    if(item==='torch'){if(face==='down')throw Error('unsupported-placement');if(face!=='up'){block='wall_torch';state.facing=face;}}
    if(item==='ladder'||item==='tripwire_hook'){if(face==='up'||face==='down')throw Error('unsupported-placement');state.facing=face;Object.assign(state,{powered:'false',attached:'false'});}
    if(item==='lantern')state.hanging=String(face==='down');
    if(item.endsWith('_button')||item==='lever'||item==='grindstone')Object.assign(state,{face:face==='up'?'floor':face==='down'?'ceiling':'wall',facing:face==='up'||face==='down'?facing:face,powered:'false'});
    if(item.includes('pressure_plate'))Object.assign(state,{powered:'false',power:'0'});
    if(item==='rail')state.shape=['east','west'].includes(facing)?'east_west':'north_south';
    if(['chest','trapped_chest'].includes(item))Object.assign(state,{facing:opposite(facing),type:'single'});
    if(['smoker','stonecutter','chiseled_bookshelf','anvil','barrel','campfire'].includes(item))state.facing=item==='anvil'?(['north','south'].includes(facing)?'east':'north'):opposite(facing);
    if(item==='barrel'){
        state.open='false';
        const dx=hit.pitch===undefined?hit.point[0]-hit.eye[0]:-Math.sin(hit.yaw)*Math.cos(hit.pitch),dy=hit.pitch===undefined?hit.point[1]-hit.eye[1]:Math.sin(hit.pitch),dz=hit.pitch===undefined?hit.point[2]-hit.eye[2]:-Math.cos(hit.yaw)*Math.cos(hit.pitch);
        if(Math.abs(dy)>Math.max(Math.abs(dx),Math.abs(dz)))state.facing=dy<0?'up':'down';
    }if(['campfire','smoker'].includes(item))state.lit=String(item==='campfire');if(item==='campfire')state.signal_fire='false';
    if(isCake(item))state.bites='0';if(item==='composter')state.level='0';if(item==='sugar_cane')state.age='0';
    if(item==='chiseled_bookshelf')for(let i=0;i<6;i++)state['slot_'+i+'_occupied']='false';
    if(item==='oak_sign'){if(face==='down')throw Error('unsupported-placement');if(face==='up')state.rotation=String((Math.floor((180-hit.yaw*180/Math.PI)*16/360+.5)&15));else {block='oak_wall_sign';state.facing=face;}}
    if(item==='straw_bed')Object.assign(state,{facing,part:'foot',occupied:'false'});
    const result:PlacedBlock[]=[{id,block,cell:[...cell],state}];
    if(item.endsWith('_door'))result.push({id:id+'-upper',block,cell:[cell[0],cell[1]+1,cell[2]],state:{...state,half:'upper'},pair:id});
    if(item==='straw_bed'){const d=direction(facing);result.push({id:id+'-head',block,cell:cell.map((n,i)=>n+d[i]) as Cell,state:{...state,part:'head'},pair:id});}
    for(const b of result){const at=blockAt(p,b.cell);if(b.cell[0]<-18||b.cell[0]>18||b.cell[2]<-22||b.cell[2]>10||b.cell[1]<0||b.cell[1]>15||!replaceable(at?.block)&&!(slab&&at?.block===item&&state.type==='double'&&at.state.type!=='double'))throw Error('occupied-placement');
        if(BLOCK_PROPERTIES[item].collision&&(nativeShapes(b.block,b.state,true)??[FULL_BLOCK]).some(shape=>overlaps(playerBounds([hit.eye[0],hit.eye[1]-(hit.crouch?1.27:1.62),hit.eye[2]],hit.crouch),shape.map((n,i)=>n+b.cell[i%3]) as typeof FULL_BLOCK)))throw Error('player-collision');}
    if(!survives(p,result[0]))throw Error('unsupported-placement');
    return result;
}

/** Test native face support against the union of collision boxes.
 * @param {Progress} p Current world.
 * @param {Cell} cell Support cell.
 * @param {string} face Outward support face.
 * @param {boolean} center Whether only the central support square is required.
 * @return {boolean} Covered support face.
 */
export function sturdy(p:Progress,cell:Cell,face:string,center=false):boolean{
    const b=blockAt(p,cell);if(!b||replaceable(b.block))return false;const shapes=nativeShapes(b.block,b.state,true)??(fullBlock(b.block,b.state)?[FULL_BLOCK]:[]),axis=['east','west'].includes(face)?0:['up','down'].includes(face)?1:2,plane=['up','east','south'].includes(face)?1:0,other=[0,1,2].filter(a=>a!==axis),lo=center?7/16:0,hi=center?9/16:1;
    const faces=shapes.filter(s=>Math.abs(s[axis+(plane?3:0)]-plane)<1e-6),grid=other.map(a=>[...new Set([lo,hi,...faces.flatMap(s=>[s[a],s[a+3]]).filter(v=>v>lo&&v<hi)])].sort((a,b)=>a-b));
    for(let x=0;x<grid[0].length-1;x++)for(let y=0;y<grid[1].length-1;y++){const u=(grid[0][x]+grid[0][x+1])/2,v=(grid[1][y]+grid[1][y+1])/2;if(!faces.some(s=>u>s[other[0]]&&u<s[other[0]+3]&&v>s[other[1]]&&v<s[other[1]+3]))return false;}return true;
}
/** Evaluate native attachment and plant survival without consuming another item.
 * @param {Progress} p Current world.
 * @param {PlacedBlock} b Placed state.
 * @return {boolean} Whether its supporting neighbors remain suitable.
 */
export function survives(p:Progress,b:PlacedBlock):boolean{
    const {block,cell,state}=b,below:Cell=[cell[0],cell[1]-1,cell[2]],base=blockAt(p,below);
    if(b.pair)return true;
    if(block==='short_grass')return ['grass_block','dirt','farmland'].includes(base?.block??'');
    if(block==='sugar_cane')return base?.block==='sugar_cane'||caneSupport.ground.includes(base?.block??'')&&['north','south','east','west'].some(d=>{const n=direction(d),adjacent=blockAt(p,[cell[0]+n[0],cell[1]-1,cell[2]+n[2]]);return !!adjacent&&(caneSupport.blocks.includes(adjacent.block)||caneSupport.fluids.includes(adjacent.block)||adjacent.state.waterlogged==='true');});
    if(isCake(block))return !!base&&!replaceable(base.block)&&!(block===ODD_BLOCK&&p.scene==='home'&&cell[0]>=-2&&cell[0]<=1&&cell[2]>=-4&&cell[2]<=-2&&cell[1]===2);
    let toward:string|undefined,center=false;
    if(block==='torch'||block==='oak_sign'||/_door$|pressure_plate|^rail$/.test(block)){toward='down';center=block==='torch'||block.includes('pressure_plate');}
    if(['wall_torch','ladder','tripwire_hook','oak_wall_sign'].includes(block))toward=opposite(state.facing);
    if(block==='lantern'){toward=state.hanging==='true'?'up':'down';center=true;}
    if(block.endsWith('_button')||block==='lever')toward=state.face==='floor'?'down':state.face==='ceiling'?'up':opposite(state.facing);
    if(!toward)return true;const d=direction(toward);return sturdy(p,cell.map((n,i)=>n+d[i]) as Cell,opposite(toward),center);
}

/** Test the full-block connection predicate for ordinary authored and placed solids.
 * @param {string} block Native block.
 * @param {Record<string,string>} state Native properties.
 * @return {boolean} Whether all full block faces are sturdy.
 */
export function fullBlock(block:string,state:Record<string,string>):boolean{return block.endsWith('_slab')?state.type==='double':!/_stairs$|_wall$|_fence|_door$|_trapdoor$|pressure_plate|_button$|sign|rail|torch|lantern|ladder|bars|chain|cake|campfire|cauldron|composter|hopper|anvil|grindstone|stonecutter|bed|grass$|sugar_cane|water/.test(block);}
/** Project native neighbor connections and stair corners after atomic block edits.
 * @param {Progress} p Current scene's transaction-local state.
 */
export function connectBlocks(p:Progress):void{
    for(const b of p.scenes[p.scene].blocks??[]){
        /** Query a cardinal neighbor. @param {string} d Direction. @return {ReturnType<typeof blockAt>} Neighbor state. */
        const neighbor=(d:string)=>{const v=direction(d);return blockAt(p,b.cell.map((n,i)=>n+v[i]) as Cell);};
        if(b.block==='campfire'){b.state.signal_fire=String(neighbor('down')?.block==='hay_block');if(b.state.waterlogged==='true')b.state.lit='false';}
        if(/_wall$|_fence$|^iron_bars$/.test(b.block)){
            for(const d of ['north','east','south','west']){const n=neighbor(d),connected=!!n&&(fullBlock(n.block,n.state)||b.block.endsWith('_wall')&&n.block.endsWith('_wall')||b.block==='iron_bars'&&n.block==='iron_bars'||b.block.endsWith('_fence')&&n.block.endsWith('_fence')||n.block==='oak_fence_gate'&&(['north','south'].includes(n.state.facing)!==['north','south'].includes(d)));b.state[d]=b.block.endsWith('_wall')?(connected?'low':'none'):String(connected);}
            if(b.block.endsWith('_wall')){const n=b.state.north!=='none',s=b.state.south!=='none',e=b.state.east!=='none',w=b.state.west!=='none';b.state.up=String(!(n&&s&&!e&&!w||e&&w&&!n&&!s));}
        }
        if(b.block.endsWith('_stairs')){
            const facing=b.state.facing,axis=['north','south'].includes(facing),left=({north:'west',west:'south',south:'east',east:'north'} as Record<string,string>)[facing];b.state.shape='straight';
            for(const [dir,type] of [[facing,'outer'],[opposite(facing),'inner']]){const n=neighbor(dir);if(!n?.block.endsWith('_stairs')||n.state.half!==b.state.half||['north','south'].includes(n.state.facing)===axis)continue;const other=neighbor(type==='outer'?opposite(n.state.facing):n.state.facing);if(other?.block.endsWith('_stairs')&&other.state.half===b.state.half&&other.state.facing===facing)continue;b.state.shape=type+'_'+(n.state.facing===left?'left':'right');break;}
        }
    }
}
