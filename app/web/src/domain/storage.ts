/** Native chest/barrel ownership, compound inventories and finite menu transfers. */
import type {Cell, Progress, SceneId, Station} from './types.ts';
import type {PlacedBlock, BlockHit} from './placed-blocks.ts';
import {blockAt, direction} from './placed-blocks.ts';
import {conductsRedstone} from './redstone.ts';
import {sameCell} from './world-config.ts';
import type {Rules, Stack} from '../rules/types.ts';
import {cell, playerTargets, reduceInventory, validateCarriers, validateStack} from './inventory.ts';
import type {InventoryCommand, InventoryState, SlotRef} from './inventory.ts';
import {quickMove, sameStack} from './slots.ts';

export interface StorageContents {version: 4; data: {slots: (Stack | null)[]}}
export interface StorageDevice {id:string; kind:'chest'|'barrel'; cell:Cell; facing:string; contents:StorageContents}
export type ContainerDevice = Station | StorageDevice;
/** Native horizontal rotation order for chest pairing. */
const HORIZONTAL = ['north', 'east', 'south', 'west'];

/** Identify supported persistent storage blocks.
 * @param {string} block Native block path.
 * @return {boolean} Whether this block owns 27 durable cells.
 */
export function isStorage(block:string):boolean {return block==='chest'||block==='barrel';}

/** Allocate one independently owned native storage inventory.
 * @return {StorageContents} Empty single-block contents.
 */
export function emptyStorage():StorageContents {return {version:4,data:{slots:Array(27).fill(null)}};}

/** Validate single-block storage without accepting a compound menu as a saved block.
 * @param {StorageContents} contents Candidate saved inventory.
 * @param {string[]} unlocked Acquired identities.
 * @param {Rules} rules Native stack limits.
 */
export function validateStorage(contents:StorageContents,unlocked:string[],rules:Rules):void {
    if(!contents||contents.version!==4||Object.keys(contents).sort().join('|')!=='data|version'||!contents.data||Object.keys(contents.data).join('|')!=='slots'||!Array.isArray(contents.data.slots)||contents.data.slots.length!==27)throw Error('invalid-storage');
    for(const stack of contents.data.slots)validateStack(stack,unlocked,rules);
}

/** Find the reciprocal chest half, excluding mismatched facing and triple chests.
 * @param {PlacedBlock[]} blocks Scene constructions.
 * @param {PlacedBlock} block Selected chest.
 * @return {PlacedBlock|undefined} Connected half, if present.
 */
export function chestPartner(blocks:PlacedBlock[],block:PlacedBlock):PlacedBlock|undefined {
    if(block.block!=='chest'||!['left','right'].includes(block.state.type))return;
    const i=HORIZONTAL.indexOf(block.state.facing),d=direction(HORIZONTAL[(i+(block.state.type==='left'?1:3))%4]);
    return blocks.find(b=>b.block===block.block&&b.state.facing===block.state.facing&&b.state.type===(block.state.type==='left'?'right':'left')&&sameCell(b.cell,block.cell.map((n,j)=>n+d[j]) as Cell));
}

/** Select the original placement-time chest connection without joining crouched adjacent singles.
 * @param {Progress} p Current world.
 * @param {PlacedBlock} block New single chest.
 * @param {BlockHit} hit Original clicked face and secondary-use flag.
 */
export function pairChest(p:Progress,block:PlacedBlock,hit:BlockHit):void {
    if(block.block!=='chest')return;
    const blocks=p.scenes[p.scene].blocks??[];
    const candidates=hit.crouch?(hit.normal[1]?[]:[hit.normal.map(n=>-n) as Cell]):[1,3].map(turn=>direction(HORIZONTAL[(HORIZONTAL.indexOf(block.state.facing)+turn)%4]));
    for(const d of candidates){
        const other=blocks.find(b=>b.id!==block.id&&b.block===block.block&&b.state.type==='single'&&sameCell(b.cell,block.cell.map((n,i)=>n+d[i]) as Cell));
        if(!other||(!hit.crouch&&other.state.facing!==block.state.facing))continue;
        const facing=direction(other.state.facing);
        if(facing[0]*d[0]+facing[2]*d[2]!==0)continue;
        block.state.facing=other.state.facing;
        const clockwise=direction(HORIZONTAL[(HORIZONTAL.indexOf(block.state.facing)+1)%4]);
        block.state.type=sameCell(d,clockwise)?'left':'right';
        other.state.type=block.state.type==='left'?'right':'left';
        return;
    }
}

/** Detach a surviving half when its partner is removed; contents stay with their physical block.
 * @param {PlacedBlock[]} blocks Remaining scene constructions.
 */
export function reconcileChests(blocks:PlacedBlock[]):void {
    for(const block of blocks)if(block.block==='chest'&&block.state.type!=='single'&&!chestPartner(blocks,block))block.state.type='single';
}

/** Resolve native compound slot order: right half first, left half second.
 * @param {Progress} p World facts.
 * @param {SceneId} scene Owning scene.
 * @param {string} id Selected block identity.
 * @return {PlacedBlock[]} One or two physical storage owners.
 */
export function storageParts(p:Progress,scene:SceneId,id:string):PlacedBlock[] {
    const blocks=p.scenes[scene].blocks??[],block=blocks.find(b=>b.id===id&&isStorage(b.block));
    if(!block)return [];
    const partner=chestPartner(blocks,block);
    return partner?(block.state.type==='right'?[block,partner]:[partner,block]):[block];
}

/** Check the native redstone-conductor obstruction above either chest half; barrels ignore it.
 * @param {Progress} p World facts.
 * @param {SceneId} scene Owning scene.
 * @param {string} id Selected storage identity.
 * @return {boolean} Whether a player may open this container.
 */
export function canOpenStorage(p:Progress,scene:SceneId,id:string):boolean {
    const parts=storageParts(p,scene,id);
    return !!parts.length&&parts.every(b=>{const above=blockAt({...p,scene},[b.cell[0],b.cell[1]+1,b.cell[2]]);return b.block==='barrel'||!above||!conductsRedstone(above.block,above.state);});
}

/** Adapt physical storage owners to the shared device interface without mutating read-only snapshots.
 * @param {Progress} p World facts, mutable only inside a transaction.
 * @param {SceneId} scene Owning scene.
 * @param {string} id Selected station or storage identity.
 * @return {ContainerDevice|undefined} Existing device with live compound slot setters.
 */
export function containerDevice(p:Progress,scene:SceneId,id:string):ContainerDevice|undefined {
    const station=p.scenes[scene].stations.find(s=>s.id===id);if(station)return station;
    const parts=storageParts(p,scene,id);if(!parts.length)return;
    const selected=parts.find(b=>b.id===id)!;
    const data={
        /** Read both native halves in stable menu order. @return {(Stack|null)[]} Finite groups. */
        get slots():(Stack|null)[]{return parts.flatMap(b=>b.contents?.data.slots??Array(27).fill(null));},
        /** Commit a compound edit back to its physical owners. @param {(Stack|null)[]} slots Accepted groups. */
        set slots(slots:(Stack|null)[]){if(slots.length!==parts.length*27)throw Error('storage-size-conflict');parts.forEach((b,i)=>{b.contents={version:4,data:{slots:structuredClone(slots.slice(i*27,i*27+27))}};});}
    };
    return {id,kind:selected.block as 'chest'|'barrel',cell:selected.cell,facing:selected.state.facing,
        /** Read the live shared carrier. @return {StorageContents} Compound view. */
        get contents():StorageContents{return {version:4,data};},
        /** Commit a planned transfer to both owners. @param {StorageContents} contents Accepted carrier. */
        set contents(contents:StorageContents){data.slots=contents.data.slots;}
    };
}

/** Enumerate native hopper endpoints, including either physical half of a compound chest.
 * @param {Progress} p Current world.
 * @param {SceneId} scene Owning scene.
 * @return {ContainerDevice[]} Existing devices and storage adapters.
 */
export function containerDevices(p:Progress,scene:SceneId):ContainerDevice[] {
    return [...p.scenes[scene].stations,...(p.scenes[scene].blocks??[]).filter(b=>isStorage(b.block)).map(b=>containerDevice(p,scene,b.id)!)];
}

/** Apply native chest-menu quick moves; all other gestures use the shared finite slot reducer.
 * @param {InventoryState} current Player and storage carriers.
 * @param {InventoryCommand} command Semantic gesture.
 * @param {string[]} unlocked Acquired identities.
 * @param {Rules} rules Native limits.
 * @return {InventoryState} Independent accepted carrier state.
 */
export function reduceStorageInventory(current:InventoryState,command:InventoryCommand,unlocked:string[],rules:Rules):InventoryState {
    validateCarriers(current,unlocked,rules);
    if(!current.storage)throw Error('storage-unavailable');
    if(command.type!=='quick'&&command.type!=='quick-all')return reduceInventory(current,command,unlocked,rules);
    const next=structuredClone(current),selected=command.type==='quick-all'?command.match??cell(next,command.slot).stack:cell(next,command.slot).stack;
    if(!selected)return next;
    validateStack(selected,unlocked,rules);
    const fromStorage=command.slot.startsWith('storage:'),refs:SlotRef[]=command.type==='quick'?[command.slot]:fromStorage?next.storage!.map((_,i)=>`storage:${i}` as SlotRef):[...Array.from({length:27},(_,i)=>`backpack:${i}` as SlotRef),...Array.from({length:9},(_,i)=>`hotbar:${i}` as SlotRef)];
    for(const ref of refs){const source=cell(next,ref);if(source.stack&&sameStack(source.stack,selected,rules))quickMove(source,fromStorage?playerTargets(next,true):next.storage!.map((_,i)=>cell(next,`storage:${i}`)),rules);}
    validateCarriers(next,unlocked,rules);return next;
}

/** Calculate native positional open/close sound location for one menu, including double-chest center.
 * @param {PlacedBlock[]} parts Native slot-ordered storage owners.
 * @return {Cell} World-space sound source.
 */
export function storageSoundPosition(parts:PlacedBlock[]):Cell {
    const b=parts[0],d=b.block==='barrel'?direction(b.state.facing):[0,0,0];
    return b.cell.map((n,i)=>n+.5+(parts.length===2?(parts[1].cell[i]-n)/2:d[i]/2)) as Cell;
}
