/** Cooperative cross-page transactions use a real exclusive lock, reset epochs and lifecycle fencing. */
import {freeze,initialState,resetState,transition} from '../domain/state.ts';
import type {Command,DomainEvent,PlacementPolicy} from '../domain/types.ts';
import type {InventoryState,InventoryCommand,PlayerLayout} from '../domain/inventory.ts';import type {Stack} from '../rules/types.ts';
import {decode,seal,token} from './codec.ts';
import type {Envelope} from './codec.ts';
/** This project namespace is shared by both base paths and never overlaps P2 or other Pages repositories. */
export const SAVE_KEY='minecraft-birthday-2026:formal:save';
/** Every conforming page uses this same short-lived transaction lock; revision alone is never a lock. */
export const LOCK_NAME=SAVE_KEY+':transaction';
export interface StoragePort {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
export interface LockPort {exclusive:<T>(work:()=>Promise<T>)=>Promise<T>}
export interface Snapshot {status:string;envelope:Envelope|null;migrated:boolean;writable:boolean}
/** Rejected input does not invalidate an otherwise valid durable session. */
export class CommandRejected extends Error {}
/** Own immutable durable snapshots; no renderer, notification replay or natural-resource state is serialized. */
export class SaveSession {
  storage:StoragePort;locks:LockPort|null;policy?:PlacementPolicy;view:Snapshot=freeze({status:'loading',envelope:null,migrated:false,writable:false});
  listeners=new Set<(snapshot:Snapshot)=>void>();eventListeners=new Set<(events:DomainEvent[])=>void>();serial=0;suspended=false;disposed=false;
  /** Bind injected persistence/coordinator ports for deterministic failures and real browser transactions.
   * @param {StoragePort} storage Single project storage key adapter.
   * @param {LockPort|null} locks Exclusive coordinator, or explicit read-only capability absence.
   * @param {PlacementPolicy} policy Future authored build regions; no region is approved by default.
   */
  constructor(storage:StoragePort,locks:LockPort|null,policy?:PlacementPolicy){this.storage=storage;this.locks=locks;this.policy=policy;}
  /** Subscribe to facts without replaying first-acquisition events.
   * @param {Function} listener Snapshot consumer.
   * @return {Function} Subscription cleanup.
   */
  subscribe(listener:(snapshot:Snapshot)=>void):()=>void{this.listeners.add(listener);listener(this.view);return()=>this.listeners.delete(listener);}
  /** Publish immutable, bounded state changes separately from domain events.
   * @param {Snapshot} value New observable snapshot.
   */
  publish(value:Snapshot):void{this.view=freeze(value);for(const listener of this.listeners)listener(this.view);}
  /** Preserve any last known valid value while exposing an explicit failure and disabling writes.
   * @param {unknown} error Stable diagnostic error.
   */
  fail(error:unknown):void{this.publish({...this.view,status:error instanceof Error?error.message:'storage-unavailable',writable:false});}
  /** Re-read under the coordinator; initialize only missing storage, never invalid or future data.
   * @return {Promise<void>} Snapshot refresh completion.
   */
  async refresh():Promise<void>{
    if(this.disposed||this.suspended)return;const serial=this.serial;
    const work=async()=>{const raw=this.storage.getItem(SAVE_KEY);let value;if(raw===null){if(!this.locks){this.publish({status:'lock-unavailable',envelope:null,migrated:false,writable:false});return;}const envelope=await seal(initialState(),crypto.randomUUID(),0);if(serial!==this.serial||this.disposed||this.suspended)return;this.storage.setItem(SAVE_KEY,JSON.stringify(envelope));value={envelope,migrated:false};}else value=await decode(raw);if(serial!==this.serial||this.disposed||this.suspended)return;this.publish({...value,status:this.locks?'ready':'lock-unavailable',writable:!!this.locks});};
    try{if(this.locks)await this.locks.exclusive(work);else await work();}catch(error){if(serial===this.serial&&!this.disposed)this.fail(error);}
  }
  /** Serialize a command against the latest value and fence any reset or suspended-page action.
   * @param {Command} command Semantic domain operation.
   * @return {Promise<DomainEvent[]>} Only newly committed transient events; none are replayed on refresh.
   */
  async dispatch(command:Command):Promise<DomainEvent[]>{return (await this.transact(command)).events;}
  /** Commit a slot intent under the shared lock; a changed carrier layout rejects rather than duplicating a pickup.
   * @param {InventoryCommand} intent Bounded slot operation.
   * @param {Stack|null} cursor Page-owned carried stack.
   * @param {PlayerLayout} expected Layout observed before the operation.
   * @return {Promise<InventoryState>} Committed layout and resulting page-local cursor.
   */
  async editInventory(intent:InventoryCommand,cursor:Stack|null,expected:PlayerLayout):Promise<InventoryState>{const result=await this.transact({type:'inventory',intent,cursor,expected});return result.inventory!;}
  /** Execute semantic work against freshly locked facts and preserve failed-write presentation.
   * @param {Command} command Domain intent with optional carrier precondition.
   * @return {Promise<{events:DomainEvent[],inventory?:InventoryState}>} Committed events and optional ephemeral carrier result.
   */
  async transact(command:Command):Promise<{events:DomainEvent[];inventory?:InventoryState}>{
    const epoch=this.view.envelope?.generation,serial=this.serial;if(!this.locks||!this.view.writable||!epoch||this.disposed||this.suspended)throw new Error('save-read-only');
    try{return await this.locks.exclusive(async()=>{const raw=this.storage.getItem(SAVE_KEY);if(!raw)throw new Error('stale-session');const decoded=await decode(raw),current=decoded.envelope;if(current.generation!==epoch)throw new Error('stale-session');if(serial!==this.serial||this.disposed||this.suspended)throw new Error('session-restored');let result;try{result=transition(current.state,command,this.policy);}catch(error){this.publish({status:'ready',envelope:current,migrated:decoded.migrated,writable:true});throw new CommandRejected(error instanceof Error?error.message:'invalid-command');}if(JSON.stringify(result.state)===JSON.stringify(current.state)){this.publish({status:'ready',envelope:current,migrated:decoded.migrated,writable:true});return {events:result.events,inventory:result.inventory};}
      const next=await seal(result.state,epoch,current.revision+1);if(serial!==this.serial||this.disposed||this.suspended)throw new Error('session-restored');try{this.storage.setItem(SAVE_KEY,JSON.stringify(next));}catch{throw new Error('write-failed');}this.publish({status:'ready',envelope:next,migrated:false,writable:true});for(const listener of this.eventListeners)listener(result.events);return {events:result.events,inventory:result.inventory};});}
    catch(error){if(!(error instanceof CommandRejected))this.fail(error);throw error;}
  }
  /** Reset valid progress under the same lock, requiring the exact confirmed value and retaining settings.
   * @param {string} confirmation Snapshot token displayed when confirmation opened.
   * @return {Promise<void>} Durable new epoch and empty progress.
   */
  async reset(confirmation:string):Promise<void>{
    const serial=this.serial;if(!this.locks||!this.view.writable||this.disposed||this.suspended)throw new Error('save-read-only');
    try{await this.locks.exclusive(async()=>{const raw=this.storage.getItem(SAVE_KEY);if(!raw)throw new Error('stale-session');const current=(await decode(raw)).envelope;if(token(current)!==confirmation)throw new Error('confirmation-stale');const next=await seal(resetState(current.state.settings),crypto.randomUUID(),0);if(serial!==this.serial||this.disposed||this.suspended)throw new Error('session-restored');try{this.storage.setItem(SAVE_KEY,JSON.stringify(next));}catch{throw new Error('write-failed');}this.publish({status:'ready',envelope:next,migrated:false,writable:true});});}catch(error){this.fail(error);throw error;}
  }
  /** Fence queued work before page suspension; no pagehide autosave can restore stale progress. */
  suspend():void{this.serial++;this.suspended=true;}
  /** Reconcile a restored page before accepting another command.
   * @return {Promise<void>} Latest durable view.
   */
  async resume():Promise<void>{this.serial++;this.suspended=false;this.publish({...this.view,writable:false,status:'loading'});await this.refresh();}
  /** Invalidate queued work and release consumers when the owning document is discarded. */
  dispose():void{this.disposed=true;this.serial++;this.listeners.clear();this.eventListeners.clear();}
}
