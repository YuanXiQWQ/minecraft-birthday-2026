/** Bounded Java 26.3 criteria facts, player-slot triggers and the complete supported progression guide. */
import birthday from '../data/birthday-advancement.json' with {type:'json'};
import profile from '../data/advancements.json' with {type:'json'};
import {INVENTORY_RULES as inventoryRules,ODD_ADVANCEMENT} from './easter-egg.ts';
import oddCake from '../data/odd-cake-advancement.json' with {type:'json'};
import {sameStack} from './slots.ts';
import type {PlayerLayout} from './inventory.ts';
import type {Stack} from '../rules/types.ts';

export interface AdvancementDefinition {
    parent?: string;
    criteria: Record<string,{trigger:string;conditions?:{items?:{items:string}[];location?:{type:string;blocks:string}}}>;
    requirements: string[][];
    display: {title:{translate:string};description:{translate:string};icon:{id:string};background?:string;show_toast?:boolean;announce_to_chat?:boolean;hidden?:boolean;frame?:string};
}
export interface AdvancementFacts {version:1;criteria:Record<string,string[]>}
/** Stable authored challenge identity, independent of the original Minecraft namespace. */
export const BIRTHDAY_ADVANCEMENT = 'jerrys_farm:happy_birthday';
/** Original nodes and the authored birthday challenge share saved criteria and display rules. */
export const ADVANCEMENTS:Record<string,AdvancementDefinition> = {...profile.definitions,[BIRTHDAY_ADVANCEMENT]:birthday,[ODD_ADVANCEMENT]:oddCake};
/** Native farming root completed by any supported completed descendant. */
export const HUSBANDRY_ROOT = 'minecraft:husbandry/root';
/** Create criteria independent of catalogue unlocks and recipes. @return {AdvancementFacts} Empty facts. */
export function emptyAdvancements(): AdvancementFacts {return {version:1,criteria:{}};}
/** Apply native outer-AND / inner-OR requirements without consulting ancestors.
 * @param {AdvancementFacts|undefined} facts Durable criteria.
 * @param {string} id Namespaced advancement.
 * @return {boolean} Whether every requirement group is satisfied.
 */
export function advancementDone(facts:AdvancementFacts|undefined,id:string):boolean {
    const granted=facts?.criteria[id]??[];
    return ADVANCEMENTS[id].requirements.every(group=>group.some(criterion=>granted.includes(criterion)));
}
/** Complete the farming root once a saved descendant is done, preserving every other criterion.
 * @param {AdvancementFacts} facts Transaction-local or validated migration facts.
 * @return {boolean} Whether the root criterion was added.
 */
export function syncHusbandryRoot(facts:AdvancementFacts):boolean {
    if(advancementDone(facts,HUSBANDRY_ROOT))return false;
    for(const id of Object.keys(ADVANCEMENTS)){
        if(id===HUSBANDRY_ROOT||!advancementDone(facts,id))continue;
        let parent=ADVANCEMENTS[id].parent;
        while(parent){
            if(parent===HUSBANDRY_ROOT){facts.criteria[HUSBANDRY_ROOT]=Object.keys(ADVANCEMENTS[HUSBANDRY_ROOT].criteria);return true;}
            parent=ADVANCEMENTS[parent].parent;
        }
    }
    return false;
}
/** Validate registered criterion IDs and the supported fact schema. @param {unknown} value Candidate field. */
export function validateAdvancements(value:unknown):asserts value is AdvancementFacts {
    const v=value as AdvancementFacts;
    if(!v||Object.keys(v).sort().join('|')!=='criteria|version'||v.version!==1||!v.criteria||Array.isArray(v.criteria)||typeof v.criteria!=='object')throw Error('invalid-advancements');
    for(const [id,criteria] of Object.entries(v.criteria))if(!Object.hasOwn(ADVANCEMENTS,id)||!Array.isArray(criteria)||!criteria.length||new Set(criteria).size!==criteria.length||criteria.some(c=>typeof c!=='string'||!Object.hasOwn(ADVANCEMENTS[id].criteria,c)))throw Error('invalid-advancements');
}
/** List only Inventory-owned slots, excluding cursor, crafting, devices and toolbar templates.
 * @param {PlayerLayout} player Durable layout.
 * @return {(Stack|null)[]} Stable 41-slot projection.
 */
export function advancementSlots(player:PlayerLayout):(Stack|null)[] {
    return [...player.backpack,...player.hotbar,player.equipment.feet,player.equipment.legs,player.equipment.chest,player.equipment.head,player.equipment.offhand];
}
/** Evaluate changed slots and successful events, then complete the farming root from its descendants before saving.
 * @param {AdvancementFacts} facts Transaction-local criteria.
 * @param {PlayerLayout|null} before Previous slots; null is explicit old-save inventory synchronization.
 * @param {PlayerLayout} after Resulting slots.
 * @param {boolean} planted Whether the domain successfully placed wheat.
 * @param {boolean} birthdayComplete Whether the birthday table placement committed.
 * @param {boolean} cakeCrafted Whether the local player actually crafted a cake.
 * @param {boolean} oddCakeCrafted Whether the authored upside-down recipe completed.
 * @return {string[]} Newly completed IDs, published only after durable success.
 */
export function updateAdvancements(facts:AdvancementFacts,before:PlayerLayout|null,after:PlayerLayout,planted=false,birthdayComplete=false,cakeCrafted=false,oddCakeCrafted=false):string[] {
    const previous=before?advancementSlots(before):[], changed=advancementSlots(after).filter((stack,i)=>stack&&(!previous[i]||stack.count!==previous[i]!.count||!sameStack(stack,previous[i]!,inventoryRules))) as Stack[], completed:string[]=[];
    for(const [id,node] of Object.entries(ADVANCEMENTS)) {
        const wasDone=advancementDone(facts,id);
        for(const [criterion,condition] of Object.entries(node.criteria)) {
            const matches=condition.trigger==='jerrys_farm:ekac_crafted'?oddCakeCrafted:condition.trigger==='jerrys_farm:cake_crafted'?cakeCrafted:condition.trigger==='jerrys_farm:cake_on_table'?birthdayComplete:condition.trigger==='minecraft:placed_block'?planted&&condition.conditions?.location?.blocks==='minecraft:wheat':condition.trigger==='minecraft:inventory_changed'&&condition.conditions?.items?.length===1&&changed.some(stack=>{
                const predicate=condition.conditions!.items![0].items;
                return predicate.startsWith('#')?(profile.tags as Record<string,string[]>)[predicate.slice(1)]?.includes(stack.id):predicate===stack.id;
            });
            if(matches){const granted=facts.criteria[id]??=[];if(!granted.includes(criterion))granted.push(criterion);}
        }
        if(!wasDone&&advancementDone(facts,id))completed.push(id);
    }
    if(syncHusbandryRoot(facts))completed.push(HUSBANDRY_ROOT);
    return completed;
}
/** Show every supported advancement and its tree ancestors without granting any criteria.
 * @return {Set<string>} Stable guide nodes, independent of saved completion.
 */
export function visibleAdvancements():Set<string> {
    return new Set(Object.keys(ADVANCEMENTS));
}
