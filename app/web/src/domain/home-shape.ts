/** Walkable home architecture and furnishings share saved-object occupancy with the domain. */
import type {Cell, Progress} from './types.ts';
import type {Bounds} from './player-motion.ts';

/** Room-aligned collision boundaries keep saved construction clearances from becoming outdoor exits. */
export const HOME_BARRIERS: Bounds[] = [
    [-19,-8,-23,-10,32,12], [11,-8,-23,20,32,12],
    [-10,-8,-23,11,32,-8], [-10,-8,10,11,32,12],
    [-10,7,-8,11,32,10]
];

/** Native emission anchors occupy existing wall cells or the roof above the build ceiling. */
export const HOME_LIGHTS: Cell[] = [[-5,3,-9],[5,3,-9],[-4,7,-2],[4,7,-2],[-4,7,5],[4,7,5],[-6,3,10],[6,3,10]];

export interface HomeBlock { block: string; cell: Cell; state: string; }
/** Shared immutable layout cache changes only when actual player construction coordinates change. */
let cached: {key:string; cells:Map<string,HomeBlock>} | undefined;

/** Raise only the distant garden beyond legal construction, so its lawn is visible above the retained windowsill.
 * @param {number} z South coordinate outside the build volume.
 * @return {number} Full-block ground surface height.
 */
export function homeGardenHeight(z:number):number {return Math.max(0,Math.min(3,-z-23));}

/** Identify original full wall cells and the roof, without narrowing any previously legal construction cell.
 * @param {Cell} cell Logical block coordinate.
 * @return {boolean} Fixed home structure occupancy.
 */
export function homeFixed([x,y,z]:Cell):boolean {
    return y >= 0 && (z === -9 && x >= -11 && x <= 11 && y < 6 && !(Math.abs(x)<4 && y>1 && y<5)
        || Math.abs(x)===11 && z>=-8 && z<=5 && y<6
        || y===7 && x>=-15 && x<=15 && z>=-13 && z<=10);
}

/** Select flush floor inlays while preserving every original ground height and support cell.
 * @param {number} x East coordinate.
 * @param {number} z South coordinate.
 * @return {string} Native full-block material.
 */
export function homeFloor(x:number,z:number):string {
    if (x < -10 || x > 10 || z < -8) return 'grass_block';
    if(x>=-3 && x<=2 && z>=3 && z<=7)return x===-3||x===2||z===3||z===7?'spruce_planks':'red_wool';
    if ((x===-3 || x===2) && z>=-5 && z<=0 || (z===-5 || z===0) && x>=-3 && x<=2) return 'spruce_planks';
    return 'oak_planks';
}

/** Assemble the complete room, glass windows and furniture without overlapping saved construction.
 * @param {Cell[]} occupied Existing player devices and blocks.
 * @return {HomeBlock[]} Nonoverlapping fixed cells with original native axis states.
 */
export function homeStructure(occupied:Cell[]=[]):HomeBlock[] {
    const blocks:HomeBlock[]=[];
    for(let x=-15;x<=15;x++)for(let z=-13;z<=10;z++)for(let y=0;y<=7;y++) {
        if(!homeFixed([x,y,z]))continue;
        let block='birch_planks',state='';
        if(y===0)block='stone_bricks';
        if(y===1)block='spruce_planks';
        const post=z===-9?[-11,-8,-4,4,8,11].includes(x):[-6,0,5].includes(z);
        if(post){block='spruce_log';state='axis=y';}
        if(y===5){block='spruce_log';state=z===-9?'axis=x':'axis=z';}
        if(y===7){block=[-8,-2,5,10].includes(z)?'spruce_log':'spruce_planks';state=block==='spruce_log'?'axis=x':'';}
        if(HOME_LIGHTS.some(c=>c[0]===x&&c[1]===y&&c[2]===z)){block='glowstone';state='';}
        blocks.push({block,cell:[x,y,z],state});
    }
    const cells=new Map(blocks.map(b=>[b.cell.join(','),b]));
    /** Keep fixed architecture unless a saved object actually occupies the same cell.
     * @param {string} block Native block name.
     * @param {Cell} cell Logical position.
     * @param {string} state Native model state.
     */
    const put=(block:string,cell:Cell,state=''):void=>{
        if(occupied.some(c=>c.every((n,i)=>n===cell[i])))return;
        cells.set(cell.join(','),{block,cell,state});
    };
    for(let x=-11;x<=11;x++)for(let y=0;y<=6;y++){
        const post=[-11,-6,0,6,11].includes(x),window=Math.abs(x)>=2&&Math.abs(x)<=4&&y>=2&&y<=3;
        put(window?'glass':post||y===5||y===6?'spruce_log':y===0?'stone_bricks':y===1?'spruce_planks':'birch_planks',[x,y,10],post?'axis=y':y>=5?'axis=x':'');
        if(y===6)put('spruce_log',[x,y,-9],'axis=x');
    }
    for(const x of [-11,11])for(let z=-8;z<=9;z++)for(let y=0;y<=6;y++){
        if(z<=5&&y<6)continue;
        const block=z===6||z===9||y>=5?'spruce_log':y===0?'stone_bricks':y===1?'spruce_planks':'birch_planks';
        put(block,[x,y,z],block==='spruce_log'?(y>=5?'axis=z':'axis=y'):'');
    }
    for(let x=-3;x<=3;x++)for(let y=2;y<=4;y++)put('glass',[x,y,-9]);
    for(let x=-10;x<=10;x++)for(const z of [1,6])put('spruce_log',[x,5,z],'axis=x');
    for(let x=-9;x<=-7;x++)for(let y=1;y<=3;y++)put('bookshelf',[x,y,10]);
    for(let z=4;z<=7;z++){
        put('oak_stairs',[-8,0,z],'facing=west,half=bottom,shape=straight');
        put('spruce_planks',[-9,0,z]);put('spruce_planks',[-9,1,z]);
    }
    for(const z of [5,6])put('oak_slab',[-6,0,z],'type=top');
    for(let x=7;x<=9;x++)for(const z of [4,5]){
        put('spruce_planks',[x,0,z]);put('oak_slab',[x,1,z],'type=bottom');
    }
    for(let x=7;x<=9;x++)for(let y=1;y<=2;y++)put('bookshelf',[x,y,10]);
    for(const cell of HOME_LIGHTS)if(cell[2]===10)put('glowstone',cell);
    return [...cells.values()];
}

/** Resolve the effective home layout once per saved construction change for rendering and placement.
 * @param {Progress} p Current shared world facts.
 * @return {Map<string,HomeBlock>} Authoritative fixed cells after compatibility clearance.
 */
export function currentHome(p:Progress):Map<string,HomeBlock>{
    const occupied=[...p.scenes.home.stations,...(p.scenes.home.blocks??[])].map(b=>b.cell),key=JSON.stringify(occupied);
    if(cached?.key!==key)cached={key,cells:new Map(homeStructure(occupied).map(b=>[b.cell.join(','),b]))};
    return cached.cells;
}
