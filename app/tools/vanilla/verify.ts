/** Independent execution of each reachable native recipe and a topological cake witness catches closure/matcher integration gaps. */
import {alternatives,matchCrafting,matchCooking} from '../../web/src/rules/matcher.ts';import type {Recipe,Rules,Stack} from '../../web/src/rules/types.ts';import type {Proof,Coverage} from './closure.ts';
/** Materialize one vanilla grid from the ingredient predicates and already proven identities.
 * @param {Recipe} r Native crafting recipe.
 * @param {Rules} rules Versioned rules.
 * @param {Set<string>} available Proven item identities.
 * @return {{grid:(Stack|null)[],width:number}} Executable grid.
 */
export function gridFor(r:Recipe,rules:Rules,available:Set<string>):{grid:(Stack|null)[];width:number}{const width=r.type==='minecraft:crafting_shaped'?(r.pattern!.length>2||r.pattern!.some(row=>row.length>2)?3:2):r.ingredients!.length>4?3:2,grid:(Stack|null)[]=Array(width*width).fill(null);
 /** Choose one actual proven item; repeated predicates still occupy separate slots.
  * @param {any} ingredient Native ingredient.
  * @return {Stack} Singleton input.
  */
 function choose(ingredient:any):Stack{const id=alternatives(ingredient,rules.itemTags).find(i=>available.has(i));if(!id)throw new Error('unproven-grid-ingredient');return{id,count:1};}
 if(r.type==='minecraft:crafting_shaped')r.pattern!.forEach((row,y)=>[...row].forEach((key,x)=>{if(key!==' ')grid[y*width+x]=choose(r.key![key]);}));else r.ingredients!.forEach((v,i)=>grid[i]=choose(v));return{grid,width};}
/** Execute the classified ordinary recipes, then traverse the cake proof with prerequisites available before every step.
 * @param {Rules} rules Full original rules.
 * @param {Record<string,Proof>} proofs Closure witnesses.
 * @param {Coverage[]} coverage Every parsed recipe's classification.
 * @return {{checked:number,chain:object[]}} Actual native-match verification and cake steps.
 */
export function verify(rules:Rules,proofs:Record<string,Proof>,coverage:Coverage[]):{checked:number;chain:object[]}{const all=new Set(Object.keys(proofs));let checked=0;for(const c of coverage.filter(v=>v.status==='reachable')){const r=rules.recipes.find(v=>v.id===c.recipe)!;if(r.type==='minecraft:crafting_special_repairitem'){for(const id of c.witness!){const result=matchCrafting(r,[{id,count:1},{id,count:1},null,null],2,2,rules);if(result?.result.id!==id)throw new Error('repair-coverage-mismatch:'+id);}}else if(r.type==='minecraft:smelting'||r.type==='minecraft:blasting'){for(const id of alternatives(r.ingredient!,rules.itemTags).filter(i=>all.has(i))){const result=matchCooking({id,count:1},r.type==='minecraft:smelting'?'furnace':'blast_furnace',rules);if(result?.result?.id!==r.result?.id)throw new Error('cooking-coverage-mismatch');}}else{const {grid,width}=gridFor(r,rules,all),result=matchCrafting(r,grid,width,width,rules);if(result?.result.id!==r.result?.id||result?.result.count!==(r.result?.count??1))throw new Error('crafting-coverage-mismatch:'+r.id);}checked++;}
 const chain:object[]=[],available=new Set<string>(),active=new Set<string>();
 /** Visit prerequisites before the consumer, rejecting cycles and checking actual recipe outputs at execution time.
  * @param {string} id Required result.
  */
 function visit(id:string):void{if(available.has(id))return;if(active.has(id)||!proofs[id])throw new Error('invalid-cake-proof');active.add(id);const p=proofs[id];for(const required of p.requires)visit(required);let execution:unknown=p.details;if(p.kind==='recipe'){const r=rules.recipes.find(v=>v.id===p.recipe)!;if(r.type==='minecraft:smelting'||r.type==='minecraft:blasting'){const input=alternatives(r.ingredient!,rules.itemTags).find(i=>available.has(i))!;if(matchCooking({id:input,count:1},r.type==='minecraft:smelting'?'furnace':'blast_furnace',rules)?.result?.id!==id)throw new Error('cake-cooking-mismatch');execution={input,result:r.result,station:r.type};}else{const {grid,width}=gridFor(r,rules,available),result=matchCrafting(r,grid,width,width,rules);if(result?.result.id!==id)throw new Error('cake-crafting-mismatch');execution={width,grid,...result};}}chain.push({item:id,...p,execution});available.add(id);active.delete(id);}
 visit('minecraft:cake');return{checked,chain};}
