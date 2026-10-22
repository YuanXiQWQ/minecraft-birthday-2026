/** Authored P7 source nodes, protected resource lanes and finite three-dimensional build volumes. */
import type{Cell,SceneId,PlacementPolicy}from'./types.ts';
export interface NaturalNode{id:string;block:string;cell:Cell;kind?:'egg'|'cow'}
export interface WorldScene{floor:string;sky:string;eye:Cell;target:Cell;nodes:NaturalNode[];plots:Cell[];build:{min:Cell;max:Cell}}
/** Construct stable native resource identities from authored coordinates. @param {string} block Native block. @param {Cell[]} cells Positions. @return {NaturalNode[]} Stable source nodes. */
function nodes(block:string,cells:Cell[]):NaturalNode[]{return cells.map((cell,i)=>({id:block+':'+i,block,cell}));}
/** The implementation profile remains exactly P4 oak logs, regular eggs and the approved source kinds. */
export const WORLD_SCENES:Record<SceneId,WorldScene>={
 plains:{floor:'grass_block',sky:'#98c8ed',eye:[0,1.62,7],target:[0,1,-5],nodes:[...nodes('oak_log',[[-6,0,-3],[-6,1,-3],[-6,2,-3],[-3,0,-6],[-3,1,-6],[-3,2,-6],[0,0,-9],[0,1,-9],[0,2,-9]]),...nodes('short_grass',Array.from({length:24},(_,i)=>[-6+i%8,0,-1-Math.floor(i/8)*2] as Cell))],plots:[],build:{min:[2,0,-4],max:[7,2,2]}},
 cave:{floor:'stone',sky:'#212329',eye:[0,1.62,7],target:[0,1,-5],nodes:[...nodes('stone',[[-6,0,-3],[-5,0,-3],[-4,0,-3],[-6,1,-4],[-5,1,-4]]),...nodes('coal_ore',[[-4,1,-5],[-3,0,-4],[-3,1,-5]]),...nodes('iron_ore',[[-2,0,-4],[-1,0,-4],[-2,1,-5],[-1,1,-5]])],plots:[],build:{min:[1,0,-3],max:[7,2,2]}},
 farm:{floor:'grass_block',sky:'#a6d3ec',eye:[0,1.62,7],target:[0,.8,-4],nodes:[...nodes('sugar_cane',[[7,0,-3],[7,0,-4],[7,0,-5]]),{id:'cow:0',block:'cow',kind:'cow',cell:[2,0,-5]},{id:'chicken-egg:0',block:'egg',kind:'egg',cell:[4,0,-2]},{id:'chicken-egg:1',block:'egg',kind:'egg',cell:[5,0,-3]}],plots:Array.from({length:9},(_,i)=>[-5+i%3,0,-2-Math.floor(i/3)*2] as Cell),build:{min:[1,0,0],max:[5,2,2]}},
 home:{floor:'oak_planks',sky:'#a8bfd0',eye:[0,1.62,7],target:[0,1,-4],nodes:[],plots:[],build:{min:[3,0,-2],max:[6,1,2]}}
};
/** Admit authored cells without allowing arbitrary decorative blocks or replacing protected resource lanes. */
export const WORLD_REGION:PlacementPolicy={network:true,
/** Test a device against the configured volume; support/occupancy are validated by domain commands. @param {SceneId} scene Scene identity. @param {Station} station Device candidate. @return {boolean} Region admission. */
allows:(scene,station)=>station.cell.every((n,i)=>n>=WORLD_SCENES[scene].build.min[i]&&n<=WORLD_SCENES[scene].build.max[i])};
/** Derive the displayed approved wheat stage from accumulated active ticks. @param {number} ticks Valid active ticks. @return {number} Native age 0/2/5/7. */
export function cropAge(ticks:number):number{return ticks>=240?7:ticks>=160?5:ticks>=80?2:0;}
/** Stable coordinate equality has no dependence on renderer or pixel size. @param {Cell} a First coordinate. @param {Cell} b Second coordinate. @return {boolean} Exact block identity. */
export function sameCell(a:Cell,b:Cell):boolean{return a.every((n,i)=>n===b[i]);}
