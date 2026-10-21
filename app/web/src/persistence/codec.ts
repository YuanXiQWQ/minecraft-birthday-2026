/** Versioned, checksum-protected durable values; failed reads retain their original bytes. */
import {ensure,freeze,validateState} from '../domain/state.ts';
import type {State} from '../domain/types.ts';
import {emptyInventory,layout} from '../domain/inventory.ts';
export interface Envelope {format:1;contentVersion:'p6-crafting-1';vanillaVersion:'26.3';generation:string;revision:number;state:State;checksum:string}
export interface Decoded {envelope:Envelope;migrated:boolean}
/** Canonical encoding includes every own field in a stable order; arrays keep semantic acquisition order.
 * @param {unknown} value Plain JSON value.
 * @return {string} Stable JSON representation.
 */
export function canonical(value:unknown):string{
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){ensure(Number.isFinite(value));return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  ensure(value&&typeof value==='object');const record=value as Record<string,unknown>;return '{'+Object.keys(record).sort().map(k=>JSON.stringify(k)+':'+canonical(record[k])).join(',')+'}';
}
/** Compute an integrity checksum rather than an authentication or encryption claim.
 * @param {unknown} value JSON payload.
 * @return {Promise<string>} SHA-256 of canonical UTF-8 bytes.
 */
export async function checksum(value:unknown):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),v=>v.toString(16).padStart(2,'0')).join('');}
/** Seal validated facts and coordination metadata into a new immutable envelope.
 * @param {State} state Durable facts only.
 * @param {string} generation Reset epoch.
 * @param {number} revision Revision within this epoch.
 * @return {Promise<Envelope>} Valid checksummed value.
 */
export async function seal(state:State,generation:string,revision:number):Promise<Envelope>{validateState(state);ensure(/^[a-zA-Z0-9_-]{1,80}$/.test(generation)&&Number.isSafeInteger(revision)&&revision>=0);const body={format:1 as const,contentVersion:'p6-crafting-1' as const,vanillaVersion:'26.3' as const,generation,revision,state:structuredClone(state)};return freeze({...body,checksum:await checksum(body)});}
/** Decode checksummed versions; P3 player reservations and P5 empty workbenches migrate without rewriting storage.
 * @param {string} raw Stored original bytes.
 * @return {Promise<Decoded>} Valid snapshot and explicit migration status.
 */
export async function decode(raw:string):Promise<Decoded>{
  ensure(raw.length<=1_000_000,'save-too-large');let value:any;try{value=JSON.parse(raw);}catch{throw new Error('corrupt-save');}
  ensure(value&&typeof value==='object'&&!Array.isArray(value),'corrupt-save');ensure(Number.isInteger(value.format),'corrupt-save');ensure(value.format<=1,'future-save');ensure(value.format>=0,'unsupported-save');
  ensure(Object.keys(value).sort().join('|')==='checksum|contentVersion|format|generation|revision|state|vanillaVersion','unsupported-save');
  const {checksum:stored,...body}=value;ensure(typeof stored==='string'&&stored===await checksum(body),'checksum-mismatch');
  ensure(value.vanillaVersion==='26.3'&&(value.format===0?value.contentVersion==='p3-development-0':['p3-foundation-1','p5-layout-1','p6-crafting-1'].includes(value.contentVersion)),'unsupported-content');
  const migrated=value.contentVersion!=='p6-crafting-1',oldPlayer=value.contentVersion!=='p5-layout-1'&&value.contentVersion!=='p6-crafting-1';
  try{if(oldPlayer){ensure(identityReserved(value.state?.progress?.player),'pending-contract-version');value.state.progress.player={version:1,data:layout(emptyInventory())};}if(migrated){validateState(value.state);for(const scene of Object.values(value.state.progress.scenes) as State['progress']['scenes'][keyof State['progress']['scenes']][])for(const station of scene.stations){ensure(identityReserved(station.contents),'pending-contract-version');if(station.kind==='crafting_table')station.contents={version:1,data:{grid:Array(9).fill(null)}};}}validateState(value.state);const envelope=await seal(value.state,value.generation,value.revision);return {envelope,migrated};}catch(error){throw new Error(migrated?'migration-failed':error instanceof Error?error.message:'invalid-save');}
}
/** Recognize only the unpopulated P3 player contract; arbitrary old payloads cannot be silently dropped.
 * @param {unknown} value Old player payload.
 * @return {boolean} Exact supported reservation.
 */
function identityReserved(value:unknown):boolean{return !!value&&typeof value==='object'&&canonical(value)==='{"data":null,"version":0}';}
/** Identify the exact value shown in a reset confirmation, including concurrent same-epoch updates.
 * @param {Envelope} envelope Visible valid snapshot.
 * @return {string} Confirmation token.
 */
export function token(envelope:Envelope):string{return envelope.generation+':'+envelope.revision+':'+envelope.checksum;}
