/** Java 26.3 command registration, argument parsing and completion for the authored overworld. */
import {sceneDestination,sceneDestinations,teleportScene} from './teleport.ts';
import type {SceneId} from './types.ts';
import type {State} from './types.ts';
import {emptyEnvironment, NativeRandom, WEATHER_TIMERS} from './environment.ts';
import {GIVE_ITEMS,giveItems} from './give.ts';
import type {DomainEvent} from './types.ts';

export interface CommandFeedback {key:string; values?:Record<string,string|number>; error?:boolean; cursor?:number; destination?:SceneId}
export interface ParsedCommand {op:string; args:(string|number|boolean)[]}
/** Registered clock markers and timeline periods come from the audited 26.3 timeline resources. */
export const TIME_MARKERS:Record<string,number>={day:1000,noon:6000,night:13000,midnight:18000,roll_village_siege:18000,wake_up_from_sleep:0};
/** Each executable branch is shared by parsing and completion; unrelated server commands are absent. */
const BRANCHES:[string,string[]][]=[
 ['give',['give','<players>','<item>']],['give',['give','<players>','<item>','<count>']],
 ...['tp','teleport'].flatMap(root=>[['teleport',[root,'<scene>']],['teleport',[root,'<target>','<scene>']]] as [string,string[]][]),
 ['tick.query',['tick','query']],['tick.rate',['tick','rate','<tickrate>']],['tick.freeze',['tick','freeze']],['tick.unfreeze',['tick','unfreeze']],
 ['tick.step',['tick','step']],['tick.step',['tick','step','<duration>']],['tick.step.stop',['tick','step','stop']],
 ['tick.sprint',['tick','sprint','<duration>']],['tick.sprint.stop',['tick','sprint','stop']],
 ...['clear','rain','thunder'].flatMap(w=>[[`weather.${w}`,['weather',w]],[`weather.${w}`,['weather',w,'<duration>']]] as [string,string[]][]),
 ...['advance_time','advance_weather'].flatMap(r=>[[`rule.${r}`,['gamerule',r]],[`rule.${r}`,['gamerule',r,'<boolean>']]] as [string,string[]][]),
 ['time.gametime',['time','query','gametime']],
 ...['', 'of <clock> '].flatMap(prefix=>[
  ['time.set',`time ${prefix}set <time>`],['time.marker',`time ${prefix}set <marker>`],['time.add',`time ${prefix}add <signedtime>`],
  ['time.pause',`time ${prefix}pause`],['time.resume',`time ${prefix}resume`],['time.rate',`time ${prefix}rate <clockrate>`],
  ['time.query',`time ${prefix}query time`],['time.timeline',`time ${prefix}query <timeline>`],['time.repetition',`time ${prefix}query <timeline> repetition`]
 ].map(([op,path])=>[op,path.split(' ')] as [string,string[]]))
];
/** Parse native integer, float, time, resource and player arguments without evaluating command text.
 * @param {string} name Registered argument identity.
 * @param {string} raw One Brigadier-style word.
 * @return {string|number|boolean|null} Validated argument or null.
 */
function argument(name:string,raw:string):string|number|boolean|null{
 const id=raw.replace(/^minecraft:/,'');
 if(name==='<players>')return /^(@[spar]|[A-Za-z0-9_]{1,16})$/.test(raw)?raw:null;
 if(name==='<item>'){const item=raw.includes(':')?raw:'minecraft:'+raw;return GIVE_ITEMS.has(item)?item:null;}
 if(name==='<count>')return /^-?\d+$/.test(raw)&&Number(raw)>=1&&Number(raw)<=2147483647?Number(raw):null;
 if(name==='<scene>')return sceneDestination(raw);
 if(name==='<target>')return /^(@[spa]|[A-Za-z0-9_]{1,16})$/.test(raw)?raw:null;
 if(name==='<boolean>')return raw==='true'?true:raw==='false'?false:null;
 if(name==='<clock>')return id==='overworld'?'overworld':null;
 if(name==='<timeline>')return ['day','moon'].includes(id)?id:null;
 if(name==='<marker>')return Object.hasOwn(TIME_MARKERS,id)?id:null;
 if(name==='<tickrate>'||name==='<clockrate>'){
  if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw))return null;
  const n=Math.fround(Number(raw)),low=name==='<tickrate>'?1:.00001,high=name==='<tickrate>'?10000:1000;
  return Number.isFinite(n)&&n>=Math.fround(low)&&n<=high?n:null;
 }
 const match=/^(-?(?:\d+\.?\d*|\.\d+))([dst]?)$/.exec(raw);if(!match)return null;
 const n=Math.fround(Number(match[1])),factor=match[2]==='d'?24000:match[2]==='s'?20:1,
  value=Math.max(-2147483648,Math.min(2147483647,Math.floor(Math.fround(n*factor)+.5))),min=name==='<signedtime>'?-2147483648:name==='<duration>'?1:0;
 return Number.isFinite(value)&&value>=min&&value<=2147483647?value:null;
}
/** Preserve native numeric/unit/boolean diagnostics when one registered argument owns the failure.
 * @param {string} name Registered argument identity.
 * @param {string} raw Rejected text.
 * @return {CommandFeedback|null} Native argument error, or a resource/literal fallback.
 */
function argumentError(name:string,raw:string):CommandFeedback|null{
 if(name==='<players>')return null;
 if(name==='<item>')return{key:'argument.item.id.invalid',values:{v0:raw.includes(':')?raw:'minecraft:'+raw},error:true};
 if(name==='<count>'){
  const n=Number(raw);
  if(/^-?\d+$/.test(raw)&&n>=-2147483648&&n<1)return{key:'argument.integer.low',values:{v0:1,v1:n},error:true};
  return{key:'parsing.int.invalid',values:{v0:raw},error:true};
 }
 if(name==='<boolean>')return{key:'parsing.bool.invalid',values:{v0:raw},error:true};
 if(['<clock>','<timeline>','<marker>','<scene>','<target>'].includes(name))return null;
 if(name==='<tickrate>'||name==='<clockrate>'){
  const n=Number(raw),min=name==='<tickrate>'?1:.00001,max=name==='<tickrate>'?10000:1000;
  if(Number.isFinite(n)&&n<min)return{key:'argument.float.low',values:{v0:min,v1:n},error:true};
  if(Number.isFinite(n)&&n>max)return{key:'argument.float.big',values:{v0:max,v1:n},error:true};
  return{key:'parsing.float.invalid',values:{v0:raw},error:true};
 }
 const match=/^(-?(?:\d+\.?\d*|\.\d+))(.*)$/.exec(raw);
 if(!match)return{key:'parsing.float.expected',error:true};
 if(!['','d','s','t'].includes(match[2]))return{key:'argument.time.invalid_unit',error:true};
 const count=Math.floor(Math.fround(Math.fround(Number(match[1]))*(match[2]==='d'?24000:match[2]==='s'?20:1))+.5),min=name==='<duration>'?1:0;
 return{key:'argument.time.tick_count_too_low',values:{v0:min,v1:count},error:true};
}
/** Read one registered branch and retain the exact failing input position for native error context.
 * @param {string} source Slash-prefixed console input.
 * @return {ParsedCommand|CommandFeedback} Parsed intent or localized red error.
 */
export function parseCommand(source:string):ParsedCommand|CommandFeedback{
 const words=[...source.matchAll(/\S+/g)],tokens=words.map((w,i)=>i===0?w[0].replace(/^\//,''):w[0]);let best=0;
 const failures:{at:number;message:CommandFeedback|null}[]=[];
 if(source.length>256)return{key:'command.unknown.argument',error:true,cursor:256};
 for(const [op,path] of BRANCHES){const args:(string|number|boolean)[]=[];let at=0;
  for(;at<tokens.length&&at<path.length;at++){
   const expected=path[at],actual=tokens[at];
   if(expected.startsWith('<')){const value=argument(expected,actual);if(value===null){failures.push({at,message:argumentError(expected,actual)});break;}if(expected!=='<clock>')args.push(value);}
   else if(expected!==actual&&!((at===0||at===1&&tokens[0].replace(/^minecraft:/,'')==='gamerule')&&actual==='minecraft:'+expected))break;
  }
  best=Math.max(best,at);
  if(at===tokens.length&&at===path.length)return{op,args};
 }
 const messages=failures.filter(f=>f.at===best),cursor=Math.max(best===0&&source.startsWith('/')?1:0,words[best]?.index??source.length);
 if(messages.length&&messages.every(f=>f.message&&JSON.stringify(f.message)===JSON.stringify(messages[0].message)))return{...messages[0].message!,cursor};
 return{key:best===0||best===tokens.length?'command.unknown.command':'command.unknown.argument',error:true,cursor};
}
/** Produce native-prefix suggestions from the executable tree and full item registry, including Shift-Tab cycling.
 * @param {string} source Text before the caret.
 * @param {string} username Current local player name for target completion.
 * @return {{start:number,values:string[]}} Replacement range and sorted candidates.
 */
export function completeCommand(source:string,username=''):{start:number;values:string[]}{
 const start=Math.max(source.lastIndexOf(' ')+1,source.startsWith('/')?1:0),prefix=source.slice(start),before=source.slice(0,start).trim().replace(/^\//,'').split(/\s+/).filter(Boolean),out=new Set<string>();
 for(const [,path] of BRANCHES){if(before.length>=path.length)continue;
  if(!before.every((value,i)=>path[i].startsWith('<')?argument(path[i],value)!==null:value===path[i]||value==='minecraft:'+path[i]))continue;
  const next=path[before.length],choices=next==='<item>'?[...GIVE_ITEMS]:next==='<players>'?['@s','@p','@a','@r',...(username?[username]:[])]:next==='<scene>'?sceneDestinations():next==='<target>'?['@s','@p','@a',...(username?[username]:[])]:next==='<boolean>'?['true','false']:next==='<clock>'?['minecraft:overworld']:next==='<timeline>'?['minecraft:day','minecraft:moon']:next==='<marker>'?['minecraft:day','minecraft:noon','minecraft:night','minecraft:midnight']:next==='<duration>'?(before[1]==='sprint'?['60s','1d','3d']:['1t','1s']):next==='<tickrate>'?['20']:next==='<clockrate>'?['1']:next.startsWith('<')?[]:[next];
  for(const value of choices)if(value.startsWith(prefix)||value.replace(/^minecraft:/,'').startsWith(prefix))out.add(value);
 }
 return{start,values:[...out].sort()};
}
/** Apply command semantics only to a transaction-local state; query and rejected commands do not mutate it.
 * @param {State} state Fresh locked state.
 * @param {string} source User console input.
 * @param {DomainEvent[]} events Notifications published after the transaction commits.
 * @return {CommandFeedback[]} Native localized result messages.
 */
export function executeCommand(state:State,source:string,events:DomainEvent[]=[]):CommandFeedback[]{
 const parsed=parseCommand(source);if('key'in parsed)return[parsed];
 const {op,args}=parsed;
 if(op==='give')return giveItems(state,String(args[0]),String(args[1]),args[2]===undefined?1:Number(args[2]),events);
 if(op==='teleport'){
  const username=state.settings.username??'sireoh',target=args.length===2?args[0]:username;
  if(!['@s','@p','@a',username].includes(String(target)))return[{key:'argument.entity.notfound.player',error:true}];
  const destination=args.at(-1) as SceneId;teleportScene(state.progress,destination);
  return[{key:'commands.teleport.success.entity.single',values:{v0:username},destination}];
 }
 const e=state.progress.environment??=emptyEnvironment(),c=e.control,value=args[0];
 /** Create a native command response with numbered translation arguments.
  * @param {string} key Original translation key.
  * @param {(string|number|boolean)[]} values Ordered native message parameters.
  * @param {boolean} error Whether this is a red semantic failure.
  * @return {CommandFeedback[]} One response.
  */
 const say=(key:string,values:(string|number|boolean)[]=[],error=false):CommandFeedback[]=>[{key,values:Object.fromEntries(values.map((v,i)=>['v'+i,String(v)])),error}];
 if(op.startsWith('rule.')){
  const name=op.slice(5),field=name==='advance_time'?'advanceTime':'advanceWeather',previous=c[field];
  if(value===undefined)return say('commands.gamerule.query',['minecraft:'+name,previous]);
  if(previous===value)return say('commands.gamerule.not_set',['minecraft:'+name,value],true);
  c[field]=value as boolean;state.settings.sky={...(state.settings.sky??{time:'game',weather:'game'}),[field==='advanceTime'?'time':'weather']:'game'};return say('commands.gamerule.set',['minecraft:'+name,value]);
 }
 if(op==='tick.query')return say('commands.tick.status.'+(c.sprintTicks?'sprinting':c.frozen?'frozen':'running'));
 if(op==='tick.rate'){c.tickRate=value as number;c.epoch++;return say('commands.tick.rate.success',[c.tickRate]);}
 if(op==='tick.freeze'||op==='tick.unfreeze'){c.frozen=op==='tick.freeze';if(c.frozen){c.sprintTicks=0;c.stepTicks=0;}c.epoch++;return say('commands.tick.status.'+(c.frozen?'frozen':'running'));}
 if(op==='tick.step'){
  if(!c.frozen)return say('commands.tick.step.fail',[],true);
  c.stepTicks=value===undefined?1:value as number;c.epoch++;return say('commands.tick.step.success',[c.stepTicks]);
 }
 if(op==='tick.step.stop'){if(!c.stepTicks)return say('commands.tick.step.stop.fail',[],true);c.stepTicks=0;c.epoch++;return say('commands.tick.step.stop.success');}
 if(op==='tick.sprint'){const replacing=!!c.sprintTicks;c.sprintRestore=c.frozen;c.frozen=false;c.sprintTicks=value as number;c.epoch++;return [...(replacing?say('commands.tick.sprint.stop.success'):[]),...say('commands.tick.status.sprinting')];}
 if(op==='tick.sprint.stop'){if(!c.sprintTicks)return say('commands.tick.sprint.stop.fail',[],true);c.sprintTicks=0;c.frozen=c.sprintRestore;c.epoch++;return say('commands.tick.sprint.stop.success');}
 if(op.startsWith('weather.')){
  const mode=op.slice(8),range=mode==='clear'?WEATHER_TIMERS.rainDelay:mode==='rain'?WEATHER_TIMERS.rainDuration:WEATHER_TIMERS.thunderDuration,rng=new NativeRandom(e.random,true),duration=value===undefined?rng.integer(range[0],range[1]):value as number;
  e.random=Number(rng.state);e.clearWeatherTime=mode==='clear'?duration:0;e.rainTime=e.thunderTime=mode==='clear'?0:duration;e.raining=mode!=='clear';e.thundering=mode==='thunder';
  state.settings.sky={time:state.settings.sky?.time??'game',weather:'game'};
  return say('commands.weather.set.'+mode);
 }
 if(op==='time.gametime')return say('commands.time.query.gametime',[state.progress.world.tick]);
 if(op==='time.query')return say('commands.time.query.absolute',['minecraft:overworld',e.dayTicks]);
 if(op==='time.timeline'||op==='time.repetition'){const period=value==='moon'?192000:24000;return say('commands.time.query.timeline'+(op==='time.repetition'?'.repetitions':''),['minecraft:'+value,op==='time.repetition'?Math.floor(e.dayTicks/period):e.dayTicks%period]);}
 if(op==='time.pause'||op==='time.resume'){
  const paused=op==='time.pause';if(c.clockPaused===paused)return say('commands.time.pause.already_'+(paused?'paused':'running'),['minecraft:overworld'],true);
  c.clockPaused=paused;state.settings.sky={time:'game',weather:state.settings.sky?.weather??'game'};return say('commands.time.'+(paused?'pause':'resume'),['minecraft:overworld']);
 }
 if(op==='time.rate'){if(c.clockRate===value)return say('commands.time.rate.already_same',['minecraft:overworld',value],true);c.clockRate=value as number;state.settings.sky={time:'game',weather:state.settings.sky?.weather??'game'};return say('commands.time.rate',['minecraft:overworld',value]);}
 const target=op==='time.marker'?e.dayTicks+(TIME_MARKERS[value as string]-e.dayTicks%24000+24000)%24000:op==='time.add'?Math.max(0,e.dayTicks+(value as number)):value as number;
 if(!Number.isSafeInteger(target))return[{key:'command.unknown.argument',error:true,cursor:source.length}];
 if(op!=='time.add'&&target===e.dayTicks)return say(op==='time.marker'?'commands.time.set.already_at_time_marker':'commands.time.set.already_at_time',['minecraft:overworld',op==='time.marker'?'minecraft:'+value:target],true);
 e.dayTicks=target;if(op!=='time.add')c.clockFraction=0;state.settings.sky={time:'game',weather:state.settings.sky?.weather??'game'};
 return say(op==='time.marker'?'commands.time.set.time_marker':'commands.time.set.absolute',['minecraft:overworld',op==='time.marker'?'minecraft:'+value:target]);
}
