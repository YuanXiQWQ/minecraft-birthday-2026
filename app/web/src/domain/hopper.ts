/** Five finite hopper cells share the player slot reducer while retaining instance ownership. */
import type {Stack,Rules} from '../rules/types.ts';
import {validateStack,playerTargets,validateCarriers,reduceInventory,cell} from './inventory.ts';
import type {InventoryState,InventoryCommand,SlotRef} from './inventory.ts';
import {quickMove,sameStack} from './slots.ts';

export interface HopperContents {version:3;data:{slots:(Stack|null)[]}}
/** Allocate an empty, explicitly versioned instance. @return {HopperContents} Independent five-cell contents. */
export function emptyHopper():HopperContents{return{version:3,data:{slots:Array(5).fill(null)}};}
/** Validate finite hopper identities without relaxing the permanent acquisition gate.
 * @param {HopperContents} contents Candidate instance.
 * @param {string[]} unlocked Acquired identities.
 * @param {Rules} rules Same-version capacity and components.
 */
export function validateHopper(contents:HopperContents,unlocked:string[],rules:Rules):void{if(!contents||contents.version!==3||Object.keys(contents).sort().join('|')!=='data|version'||!contents.data||Object.keys(contents.data).join('|')!=='slots'||!Array.isArray(contents.data.slots)||contents.data.slots.length!==5)throw Error('invalid-hopper');for(const s of contents.data.slots)validateStack(s,unlocked,rules);}
/** Route native hopper quick moves through five inputs and the existing bounded hotbar.
 * @param {InventoryState} current Player carriers and instance cells.
 * @param {InventoryCommand} command Shared semantic gesture.
 * @param {string[]} unlocked Acquired identities.
 * @param {Rules} rules Native limits.
 * @return {InventoryState} Independent finite transfer result.
 */
export function reduceHopperInventory(current:InventoryState,command:InventoryCommand,unlocked:string[],rules:Rules):InventoryState{validateCarriers(current,unlocked,rules);if(command.type!=='quick'&&command.type!=='quick-all')return reduceInventory(current,command,unlocked,rules);const next=structuredClone(current),selected=command.type==='quick-all'?command.match??cell(next,command.slot).stack:cell(next,command.slot).stack;if(!selected)return next;validateStack(selected,unlocked,rules);const fromHopper=command.slot.startsWith('hopper:'),refs:SlotRef[]=command.type==='quick'?[command.slot]:fromHopper?Array.from({length:5},(_,i)=>`hopper:${i}` as SlotRef):[...Array.from({length:27},(_,i)=>`backpack:${i}` as SlotRef),...Array.from({length:9},(_,i)=>`hotbar:${i}` as SlotRef)];for(const ref of refs){const source=cell(next,ref);if(!source.stack||!sameStack(source.stack,selected,rules))continue;quickMove(source,fromHopper?playerTargets(next,true):Array.from({length:5},(_,i)=>cell(next,`hopper:${i}`)),rules);}validateCarriers(next,unlocked,rules);return next;}
