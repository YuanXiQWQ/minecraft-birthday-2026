/** Native lever/button weak signals and one-block strong conduction for the reachable world. */
import type {Cell,Progress,SceneId,DomainEvent} from './types.ts';
import {blockAt,direction} from './placed-blocks.ts';
import type {PlacedBlock} from './placed-blocks.ts';

/** Six face neighbors used by SignalGetter.hasNeighborSignal. */
const NEIGHBORS:Cell[]=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
/** Reachable full collision cubes with the default Blocks redstone conductor predicate. */
const CONDUCTORS=new Set(['stone','smooth_stone','cobblestone','stone_bricks','cracked_stone_bricks','chiseled_stone_bricks','dirt','grass_block','sand','gravel','granite','diorite','andesite','deepslate','coal_ore','iron_ore','coal_block','iron_block','raw_iron_block','hay_block','lodestone','bookshelf','chiseled_bookshelf','crafting_table','cartography_table','smithing_table','barrel','furnace','blast_furnace','smoker']);

/** Test the native conductor predicate for supported solid blocks and double slabs.
 * @param {string} block Native block path.
 * @param {Record<string,string>} state Block properties.
 * @return {boolean} Whether a strong input can power adjacent receivers.
 */
export function conductsRedstone(block:string,state:Record<string,string>):boolean{
    return CONDUCTORS.has(block)||/_(planks|log|wood)$/.test(block)||block.endsWith('_slab')&&state.type==='double';
}

/** Derive receivers from active sources, with strong power only through their attached support.
 * @param {Progress} p Current transaction.
 * @param {SceneId} scene Independently simulated world scene.
 * @return {Set<string>} Cell keys receiving a signal; conduction never chains through solid cubes.
 */
export function poweredCells(p:Progress,scene:SceneId):Set<string>{
    const result=new Set<string>();
    for(const b of p.scenes[scene].blocks??[]){
        if(!['lever','oak_button','stone_button'].includes(b.block)||b.state.powered!=='true')continue;
        for(const d of NEIGHBORS)result.add(b.cell.map((n,i)=>n+d[i]).join(','));
        const outward=direction(b.state.face==='floor'?'up':b.state.face==='ceiling'?'down':b.state.facing);
        if(!outward)continue;
        const support=b.cell.map((n,i)=>n-outward[i]) as Cell,solid=blockAt({...p,scene},support);
        if(solid&&conductsRedstone(solid.block,solid.state))for(const d of NEIGHBORS)result.add(support.map((n,i)=>n+d[i]).join(','));
    }
    return result;
}

/** Emit committed native switch audio; button event definitions own their sample volume and pitch.
 * @param {SceneId} scene Source scene.
 * @param {PlacedBlock} block Changed switch.
 * @return {DomainEvent} Transient positional sound, never replayed from saves.
 */
export function switchSound(scene:SceneId,block:PlacedBlock):DomainEvent{
    const on=block.state.powered==='true',lever=block.block==='lever';
    return {type:'world-sound',scene,sound:lever?'block.lever.click':`block.${block.block==='oak_button'?'wooden':'stone'}_button.click_${on?'on':'off'}`,position:block.cell.map(n=>n+.5) as Cell,volume:lever?.3:1,pitch:lever?(on?.6:.5):1};
}

/** Run scheduled button releases before block entities, including every tick of a batched transaction.
 * @param {Progress} p Mutable world state.
 * @param {DomainEvent[]} events Commit-only notifications.
 */
export function tickButtons(p:Progress,events:DomainEvent[]):void{
    for(const scene of Object.keys(p.scenes) as SceneId[])for(const b of p.scenes[scene].blocks??[]){
        if(!b.block.endsWith('_button')||!b.state.releaseTick||p.world.tick<Number(b.state.releaseTick))continue;
        b.state.powered='false';delete b.state.releaseTick;events.push(switchSound(scene,b));
    }
}
