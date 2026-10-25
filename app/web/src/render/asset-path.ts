/** Resolve authored and original model documents without discarding their namespace. */
import {blockItem} from '../domain/easter-egg.ts';

/** Resolve a namespaced asset reference within the verified resource pack.
 * @param {string} kind Asset directory.
 * @param {string} id Namespaced or default-Minecraft asset identity.
 * @return {string} Pack-relative JSON path.
 */
export function assetPath(kind:string,id:string):string{const [namespace,path]=id.includes(':')?id.split(':'):['minecraft',id];return `assets/${namespace}/${kind}/${path}.json`;}

/** Resolve the namespace of a persisted blockstate document.
 * @param {string} block Saved short block name.
 * @return {string} Pack-relative blockstate path.
 */
export function blockStatePath(block:string):string{return assetPath('blockstates',blockItem(block));}
