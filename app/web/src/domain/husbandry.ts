/** Native food tags, love windows, breeding cooldown and baby growth are durable world facts. */
import foods from '../data/animal-foods.json' with {type:'json'};
import type {Cell,Progress} from './types.ts';
import {handStack,setHandStack,type InteractionHand} from './hands.ts';
export interface AnimalCare {loveUntil:number;readyAt:number;grownAt:number;forcedAge:number}
export interface Offspring {id:string;kind:'cow'|'chicken';feet:Cell;born:number}
/** Resolve authored and born animal identities. @param {Progress} p World. @param {string} id Entity. @return {'cow'|'chicken'|null} Live species. */
export function animalKind(p:Progress,id:string):'cow'|'chicken'|null{
    const s=p.scenes[p.scene];if(s.animalVitals?.[id]?.health===0)return null;
    if(p.scene==='farm'){if(id==='node:cow:0')return 'cow';if(['animal:chicken:0','animal:chicken:1'].includes(id))return 'chicken';}
    return s.offspring?.find(c=>'bred:'+c.id===id)?.kind??(s.chickens?.some(c=>'hatched:'+c.id===id)?'chicken':null);
}
/** Match original animal food tags in either hand. @param {'cow'|'chicken'} kind Species. @param {string|undefined} item Held ID. @return {boolean} Food eligibility. */
export function animalFood(kind:'cow'|'chicken',item:string|undefined):boolean{return !!item&&foods[kind].includes(item);}
/** Read age and cooldown defaults without changing a save. @param {Progress} p World. @param {string} id Entity. @return {AnimalCare} Current care state. */
export function animalCare(p:Progress,id:string):AnimalCare{
    const s=p.scenes[p.scene],born=id.startsWith('hatched:')?s.chickens?.find(c=>'hatched:'+c.id===id)?.born:s.offspring?.find(c=>'bred:'+c.id===id)?.born;
    return s.animalCare?.[id]??{loveUntil:0,readyAt:0,grownAt:born===undefined?0:born+24000,forcedAge:0};
}
/** Check server-side feeding eligibility. @param {Progress} p World. @param {string} id Entity. @param {string|undefined} item Food. @return {boolean} Whether feeding consumes one item. */
export function canFeed(p:Progress,id:string,item:string|undefined):boolean{const kind=animalKind(p,id),care=animalCare(p,id);return !!kind&&animalFood(kind,item)&&(care.grownAt>p.world.tick||care.readyAt<=p.world.tick&&care.loveUntil<=p.world.tick);}
/** Feed one animal, accelerating baby age by ten percent or entering a 600-tick love window. @param {Progress} p World. @param {string} id Entity. @param {InteractionHand} hand Food carrier. */
export function feedAnimal(p:Progress,id:string,hand:InteractionHand='mainhand'):void{
    const held=handStack(p.player.data,hand);if(!canFeed(p,id,held?.id))throw Error('animal-cannot-feed');
    const care={...animalCare(p,id)},tick=p.world.tick;
    if(care.grownAt>tick){const growth=Math.floor((care.grownAt-tick)/20*.1)*20;care.grownAt-=growth;care.forcedAge+=growth;if(care.grownAt<=tick)care.readyAt=tick+care.forcedAge;}
    else care.loveUntil=tick+600;
    (p.scenes[p.scene].animalCare??={})[id]=care;
    setHandStack(p.player.data,hand,held!.count>1?{...held!,count:held!.count-1}:null);
}
/** Commit a nearby same-species pair after native courtship and reset both parent cooldowns. @param {Progress} p World. @param {string[]} parents Pair identities. @param {Cell[]} feet Observed positions. @param {string} id New lifetime. */
export function breedAnimals(p:Progress,parents:[string,string],feet:[Cell,Cell],id:string):void{
    const kind=animalKind(p,parents[0]),tick=p.world.tick;
    if(!kind||parents[0]===parents[1]||animalKind(p,parents[1])!==kind||feet.some(c=>c.length!==3||c.some(v=>!Number.isFinite(v)||Math.abs(v)>=64))||Math.hypot(...feet[0].map((v,i)=>v-feet[1][i]))>=3)throw Error('invalid-breed');
    for(const parent of parents){const care=animalCare(p,parent);if(care.grownAt>tick||care.readyAt>tick||care.loveUntil<=tick||tick<care.loveUntil-540)throw Error('animal-not-in-love');}
    const s=p.scenes[p.scene];s.animalCare??={};for(const parent of parents)s.animalCare[parent]={...animalCare(p,parent),loveUntil:0,readyAt:tick+6000};
    (s.offspring??=[]).push({id,kind,feet:[...feet[0]],born:tick});
}
