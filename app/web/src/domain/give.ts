/** Java 26.3 GiveCommand delivery over the existing single-player item registry and ground drops. */
import {INTERACTION_ITEMS} from './native-interaction-items.ts';
import registry from '../data/registry.json' with {type:'json'};
import {INVENTORY_RULES,ODD_CAKE} from './easter-egg.ts';
import {cell} from './inventory.ts';
import {quickMove} from './slots.ts';
import {agriculture} from './soil-state.ts';
import {WORLD_SCENES} from './world-config.ts';
import {itemName} from '../i18n/items.ts';
import type {State,DomainEvent,Cell} from './types.ts';
import type {Stack} from '../rules/types.ts';
import type {CommandFeedback} from './console.ts';

/** All implemented vanilla items and the registered authored cake are available without prior acquisition. */
export const GIVE_ITEMS=new Set([...registry,...Object.keys(INTERACTION_ITEMS),ODD_CAKE]);

/** Give at most 100 native stacks, merging selected/offhand groups before ordinary inventory slots.
 * @param {State} state Transaction-local state.
 * @param {string} target Player name or a supported local player selector.
 * @param {string} id Registered namespaced item identity.
 * @param {number} count Positive integer quantity.
 * @param {DomainEvent[]} events Commit-only acquisition notifications.
 * @return {CommandFeedback[]} Native success or failure feedback.
 */
export function giveItems(state:State,target:string,id:string,count:number,events:DomainEvent[]):CommandFeedback[]{
 const username=state.settings.username??'sireoh';
 if(!['@s','@p','@a','@r',username].includes(target))return[{key:'argument.entity.notfound.player',error:true}];
 const max=INVENTORY_RULES.items[id as keyof typeof INVENTORY_RULES.items].maxStack,name='['+itemName(id,state.settings.locale)+']';
 if(count>max*100)return[{key:'commands.give.failed.toomanyitems',values:{v0:max*100,v1:name},error:true}];
 const p=state.progress,carriers={...p.player.data,cursor:null},
  ordinary=[...Array.from({length:9},(_,i)=>cell(carriers,`hotbar:${i}`)),...Array.from({length:27},(_,i)=>cell(carriers,`backpack:${i}`))],
  preferred=[cell(carriers,`hotbar:${carriers.selected}`),cell(carriers,'equipment:offhand')],deposited:Stack[]=[];
 for(let remaining=count;remaining>0;){
  const amount=Math.min(max,remaining),source={stack:{id,count:amount} as Stack|null,policy:{take:true,place:false}};
  quickMove(source,preferred.filter(slot=>slot.stack!==null),INVENTORY_RULES);
  quickMove(source,ordinary,INVENTORY_RULES);
  const delivered=amount-(source.stack?.count??0);if(delivered)deposited.push({id,count:delivered});
  if(source.stack){
   const ground=agriculture(p),feet=p.scenes[p.scene].pose?.feet??WORLD_SCENES[p.scene].eye;
   ground.drops.push({id:'give-drop-'+p.scene+'-'+(++ground.serial),cell:feet.map(Math.floor) as Cell,stack:source.stack});
  }
  remaining-=amount;
 }
 if(deposited.length){
  if(!p.unlocked.includes(id)){p.unlocked.push(id);events.push({type:'item-unlocked',item:id});}
  events.push({type:'items-acquired',stacks:structuredClone(deposited),deposited,overflow:[],pickup:true});
 }
 return[{key:'commands.give.success.single',values:{v0:count,v1:name,v2:username}}];
}
