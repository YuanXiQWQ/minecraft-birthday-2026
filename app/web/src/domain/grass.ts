/** Java 26.3 SpreadingSnowyBlock random ticks on the finite authored world and durable placed blocks. */
import type {Cell, Progress, SceneId} from './types.ts';
import {NativeRandom} from './environment.ts';
import {agriculture, soils} from './soil-state.ts';
import {blockAt, BLOCK_PROPERTIES} from './placed-blocks.ts';
import {nativeShapes, FULL_BLOCK} from './block-shapes.ts';
import {currentFarm} from './farm-shape.ts';
import {currentHome,HOME_LIGHTS} from './home-shape.ts';
import {caveLayout} from './cave-shape.ts';
import {caveExcavated,WORLD_SCENES} from './world-config.ts';
import {trackAt, type Track} from '../render/sky-tracks.ts';
import day from '../../../../resources/minecraft/26.3/data/minecraft/timeline/day.json' with {type:'json'};

type Block=ReturnType<typeof blockAt>;
/** Axis neighbors retain native one-level light attenuation and face occlusion. */
const DIRECTIONS:Cell[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
/** Cached world queries are invalidated by durable geometry, never by inventory or crop age. */
const worlds=new Map<SceneId,{key:string;world:GrassWorld}>();

/** Restrict simulation writes to the same finite editable volume as soil persistence.
 * @param {Cell} c Candidate cell.
 * @return {boolean} Cell belongs to the authored simulation.
 */
function inside(c:Cell):boolean{return c[0]>=-18&&c[0]<=18&&c[2]>=-22&&c[2]<=10&&c[1]>=-4&&c[1]<=6;}

/** Native translucent and non-occluding blocks do not supply solid light-blocking faces.
 * @param {Block} b Native state or air.
 * @return {Bounds[]} Occlusion boxes for supported block shapes.
 */
function occlusion(b:Block):import('./player-motion.ts').Bounds[]{
    if(!b||b.block==='water'||b.block.includes('glass')||b.block.endsWith('_leaves')||BLOCK_PROPERTIES[b.block]?.collision===false||['lantern','wall_torch','torch','campfire','soul_campfire'].includes(b.block))return [];
    return nativeShapes(b.block,b.state,true)??[FULL_BLOCK];
}

/** Test the union of touching native faces, including stairs and slabs.
 * @param {Block} from Source state.
 * @param {Block} to Destination state.
 * @param {Cell} step Axis direction from source to destination.
 * @return {boolean} Entire shared face prevents light propagation.
 */
function closedFace(from:Block,to:Block,step:Cell):boolean{
    const axis=step.findIndex(v=>v!==0),positive=step[axis]>0,other=[0,1,2].filter(a=>a!==axis);
    const boxes=[...occlusion(from).filter(b=>b[axis+(positive?3:0)]===(positive?1:0)),...occlusion(to).filter(b=>b[axis+(positive?0:3)]===(positive?0:1))];
    if(!boxes.length)return false;
    const [u,v]=other,us=[...new Set([0,1,...boxes.flatMap(b=>[b[u],b[u+3]])])].sort((a,b)=>a-b),vs=[...new Set([0,1,...boxes.flatMap(b=>[b[v],b[v+3]])])].sort((a,b)=>a-b);
    for(let i=1;i<us.length;i++)for(let j=1;j<vs.length;j++){const x=(us[i-1]+us[i])/2,z=(vs[j-1]+vs[j])/2;if(!boxes.some(b=>x>=b[u]&&x<=b[u+3]&&z>=b[v]&&z<=b[v+3]))return false;}
    return true;
}

/** Read supported native light sources, including opaque emitters whose light exits their own faces.
 * @param {Block} b Effective block state.
 * @return {number} Native block light emission.
 */
function emission(b:Block):number{
    const name=b?.block;
    return name==='torch'||name==='wall_torch'?14:['lantern','glowstone'].includes(name??'')||name==='campfire'&&b?.state.lit!=='false'?15:['soul_torch','soul_lantern'].includes(name??'')||name==='soul_campfire'&&b?.state.lit!=='false'?10:b?.state.lit==='true'&&['furnace','blast_furnace','smoker'].includes(name??'')?13:0;
}

/** Memoize local native states and direct skylight for random samples between terrain edits. */
class GrassWorld {
    blocks=new Map<string,Block>();sky=new Map<string,number>();
    brightness=new Map<string,boolean>();lights:{cell:Cell;level:number}[]=[];
    torches=new Set<string>();
    /** Bind current scene facts. @param {Progress} p Scene-local committed facts. */
    constructor(public p:Progress){
        const scene=p.scenes[p.scene];
        if(p.scene==='farm')this.lights=currentFarm(p).lights.map(cell=>({cell,level:15}));
        if(p.scene==='home')this.lights=HOME_LIGHTS.filter(cell=>currentHome(p).get(cell.join(','))?.block==='glowstone').map(cell=>({cell,level:15}));
        if(p.scene==='cave')for(const torch of caveLayout(scene.stations.map(s=>s.cell),WORLD_SCENES.cave.eye,caveExcavated(p)).torches){
            if(scene.blocks?.some(b=>b.cell.every((v,i)=>v===torch.cell[i])))continue;
            this.torches.add(torch.cell.join(','));this.lights.push({cell:torch.cell,level:14});
        }
        for(const b of scene.blocks??[])if(emission(b))this.lights.push({cell:b.cell,level:emission(b)});
        for(const station of scene.stations)if(station.contents.version===2&&station.contents.data.burn>0)this.lights.push({cell:station.cell,level:13});
    }
    /** Query authored and placed state once per geometry snapshot. @param {Cell} c World cell. @return {Block} Effective block or air. */
    at(c:Cell):Block{
        const key=c.join(',');
        if(!this.blocks.has(key)){
            let b:Block=this.torches.has(key)?{block:'wall_torch',state:{}}:blockAt(this.p,c);
            if(b&&['furnace','blast_furnace','smoker'].includes(b.block)){
                const device=this.p.scenes[this.p.scene].stations.find(s=>s.id===b!.id);
                if(device)b={...b,state:{...b.state,lit:String(device.contents.version===2&&device.contents.data.burn>0)}};
            }
            this.blocks.set(key,b);
        }
        return this.blocks.get(key)!;
    }
    /** Read directly descending sky, retaining zero attenuation in open air.
     * @param {Cell} c World cell.
     * @return {number} Unmodified sky light from 0 to 15.
     */
    directSky(c:Cell):number{
        if(c[1]>16)return 15;
        if(c[1]<-4)return 0;
        const key=c.join(',');if(this.sky.has(key))return this.sky.get(key)!;
        const above:Cell=[c[0],c[1]+1,c[2]],a=this.at(above),b=this.at(c);
        const value=closedFace(a,b,[0,-1,0])?0:Math.max(0,this.directSky(above)-(b?.block==='water'||b?.block.endsWith('_leaves')?1:0));
        this.sky.set(key,value);return value;
    }
    /** Resolve the native spread threshold through sky openings and placed/authored light emitters.
     * @param {Cell} origin Cell above a grass source.
     * @return {boolean} Maximum local raw brightness reaches nine.
     */
    bright(origin:Cell):boolean{
        const env=this.p.environment,track=day.tracks['minecraft:gameplay/sky_light_level'] as Track;
        let level=15*trackAt(track,env?.dayTicks??1000,24000);
        const rain=env?.rainLevel??0,thunder=(env?.thunderLevel??0)*rain;
        level+=(4-level)*.3125*(rain-thunder);level+=(4-level)*.52734375*thunder;
        const dark=Math.trunc(15-level),key=origin.join(',')+':'+dark;
        if(!this.brightness.has(key))this.brightness.set(key,this.trace(origin,dark));
        return this.brightness.get(key)!;
    }
    /** Search only the light paths capable of meeting the spread threshold.
     * @param {Cell} origin Cell above grass.
     * @param {number} dark Native sky subtraction.
     * @return {boolean} A sky opening or emitter supplies at least nine light.
     */
    trace(origin:Cell,dark:number):boolean{
        if(this.directSky(origin)-dark>=9)return true;
        if(dark>6&&!this.lights.some(e=>e.level-origin.reduce((d,v,i)=>d+Math.abs(v-e.cell[i]),0)>=9))return false;
        const queue:{cell:Cell;cost:number}[]=[{cell:origin,cost:0}],seen=new Map<string,number>([[origin.join(','),0]]);
        for(let i=0;i<queue.length;i++){
            const {cell,cost}=queue[i],b=this.at(cell);
            if(emission(b)-cost>=9||this.directSky(cell)-dark-cost>=9)return true;
            if(cost>=6)continue;
            for(const step of DIRECTIONS){
                const next=cell.map((v,j)=>v+step[j]) as Cell,target=this.at(next),nextCost=cost+1,key=next.join(',');
                if(emission(target)-nextCost>=9)return true;
                if(next[1]<-4||next[1]>17||(seen.get(key)??Infinity)<=nextCost||closedFace(b,target,step))continue;
                seen.set(key,nextCost);queue.push({cell:next,cost:nextCost});
            }
        }
        return false;
    }
    /** Update the actual placed lifetime or durable authored soil without granting an item.
     * @param {Cell} cell Changed cell.
     * @param {boolean} grass Grass conversion rather than dirt decay.
     */
    set(cell:Cell,grass:boolean):void{
        const a=agriculture(this.p),soil=a.soils.find(s=>s.cell.every((v,i)=>v===cell[i])),placed=this.p.scenes[this.p.scene].blocks?.find(b=>b.cell.every((v,i)=>v===cell[i]));
        if(placed&&!soil){placed.block=grass?'grass_block':'dirt';placed.state=grass?{snowy:'false'}:{};}
        else if(soil){soil.moisture=null;if(grass)soil.grass=true;else delete soil.grass;}
        else a.soils.push({cell:[...cell],moisture:null,...(grass?{grass:true}:{})});
        this.blocks.set(cell.join(','),{block:grass?'grass_block':'dirt',state:grass?{snowy:'false'}:{}});
    }
}

/** Resolve cached sparse queries without retaining mutable save objects from another transaction.
 * @param {Progress} p Scene-local facts.
 * @return {GrassWorld} Query context for this geometry.
 */
function context(p:Progress):GrassWorld{
    const s=p.scenes[p.scene],key=JSON.stringify([soils(p),s.blocks,s.stations.map(v=>[v.cell,v.kind,v.contents.version===2&&v.contents.data.burn>0]),p.world.visits[p.scene].removed,s.crops.map(c=>c.cell)]),old=worlds.get(p.scene);
    if(old?.key===key){old.world.p=p;return old.world;}
    const world=new GrassWorld(p);worlds.set(p.scene,{key,world});return world;
}

/** Apply one selected native grass random tick, including cover decay and four spread attempts.
 * @param {Progress} p Mutable scene facts.
 * @param {Cell} cell Randomly selected source cell.
 * @param {NativeRandom} rng Scene random stream.
 */
export function randomTickGrass(p:Progress,cell:Cell,rng:NativeRandom):void{
    tickSource(context(p),cell,rng);
}

/** Execute source rules using a shared query context for the whole section sampling pass.
 * @param {GrassWorld} world Cached scene queries.
 * @param {Cell} cell Selected source.
 * @param {NativeRandom} rng Native random stream.
 */
function tickSource(world:GrassWorld,cell:Cell,rng:NativeRandom):void{
    if(!inside(cell)||world.at(cell)?.block!=='grass_block')return;
    /** Test native survival under one-layer snow, source fluids and occluding bottom faces.
     * @param {Cell} c Candidate grass cell.
     * @param {boolean} spread Whether even non-full water must reject propagation.
     * @return {boolean} Grass survives or can enter this cell.
     */
    const alive=(c:Cell,spread:boolean):boolean=>{
        const above=world.at([c[0],c[1]+1,c[2]]);
        if(above?.block==='snow'&&above.state.layers==='1')return true;
        if(above?.state.waterlogged==='true'||above?.block==='water'&&(spread||!above.state.level||above.state.level==='0'))return false;
        return !closedFace(null,above,[0,1,0]);
    };
    if(!alive(cell,false)){world.set(cell,false);return;}
    if(!world.bright([cell[0],cell[1]+1,cell[2]]))return;
    for(let i=0;i<4;i++){
        const target:Cell=[cell[0]+rng.integer(-1,1),cell[1]+rng.integer(-3,1),cell[2]+rng.integer(-1,1)];
        if(inside(target)&&world.at(target)?.block==='dirt'&&alive(target,true))world.set(target,true);
    }
}

/** Sample three uniformly random cells per 16-cube section on the existing active clock.
 * @param {Progress} p Mutable scene facts; no wall-clock or offline catch-up.
 */
export function tickGrass(p:Progress):void{
    const a=agriculture(p),rng=new NativeRandom(a.grassRandom??Number(new NativeRandom(926303+['plains','cave','farm','home'].indexOf(p.scene)).state),true),sections=new Set<string>();
    if(p.scene!=='cave')for(let x=-2;x<=1;x++)for(let z=-2;z<=0;z++)for(let y=-1;y<=0;y++)sections.add([x,y,z].join(','));
    for(const soil of a.soils)if(soil.grass)sections.add(soil.cell.map(v=>Math.floor(v/16)).join(','));
    for(const b of p.scenes[p.scene].blocks??[])if(b.block==='grass_block')sections.add(b.cell.map(v=>Math.floor(v/16)).join(','));
    if(!sections.size)return;
    const world=context(p);
    for(const section of sections){const base=section.split(',').map(v=>Number(v)*16);for(let i=0;i<3;i++)tickSource(world,base.map(v=>v+rng.integer(0,15)) as Cell,rng);}
    a.grassRandom=Number(rng.state);
}
