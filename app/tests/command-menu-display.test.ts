/** Native command presentation and settings layout exercise the production painters independently of game state. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameChat,commandHint,chatGlyph} from '../web/src/ui/chat.ts';
import {parseCommand,type CommandFeedback} from '../web/src/domain/console.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {NativeScreens,optionFlow} from '../web/src/ui/native-screens.ts';
import {PixelUI} from '../web/src/ui/pixels.ts';
/** Current English messages use the same external catalog as the application. */
const english=JSON.parse(readFileSync(new URL('../web/src/i18n/en.json',import.meta.url),'utf8'));
/** Resolve native message arguments without substituting expected rendering behavior.
 * @param {string} key Catalog key.
 * @param {object} values Message parameters.
 * @return {string} Localized copy.
 */
function text(key:string,values:Record<string,string|number>={}){return (english[key]??key).replace(/\{([^}]+)\}/g,(_:string,k:string)=>String(values[k]??''));}
/** Connect actual chat paint/submit methods to observable canvas calls and real semantic input events.
 * @param {string} source Initial command.
 * @return {object} Production instance, draw records and editor.
 */
function chatHarness(source='/unknown'){
 const draws:any[]=[],rects:any[]=[],transforms:any[]=[],input=Object.assign(new EventTarget(),{value:source,selectionStart:source.length,selectionEnd:source.length,selectionDirection:'none',maxLength:256,dataset:{},style:{}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:input,createElement:()=>({textContent:''})}});
 Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1});
 const ctx={globalAlpha:1,fillStyle:'',setTransform(){},save(){},restore(){},beginPath(){},rect(){},clip(){},translate(...v:number[]){transforms.push(['translate',...v]);},transform(...v:number[]){transforms.push(['transform',...v]);},fillRect(...v:number[]){rects.push([this.fillStyle,...v]);}};
 const font={width:(s:string)=>[...s].length*6,draw:(_c:unknown,...v:any[])=>draws.push(v)};
 const chat=Object.create(GameChat.prototype);Object.assign(chat,{viewport:{clientWidth:1280,clientHeight:720},pixels:{font},root:{dataset:{},style:{setProperty(){}}},canvas:{style:{},getContext:()=>ctx},input,text,messages:[],open:true,completion:null,offset:0,lineCount:0,tagHover:null,lifetime:0,abort:new AbortController(),accessible:{children:[],append(){}},username:()=> 'sireoh'});
 return{chat,input,draws,rects,transforms,ctx,font};
}

test('native root error starts after slash; white client hint retains cursor and Brigadier context',()=>{
 const error=parseCommand('/unknown') as CommandFeedback;assert.equal(error.cursor,1);
 assert.equal(commandHint('/unknown',error,text),'Unknown or incomplete command. See below for error at position 1: /<--[HERE]');
 const h=chatHarness();h.chat.paint();const hint=JSON.parse(h.chat.root.dataset.commandHint);
 assert.equal(hint.error.cursor,1);assert.equal(h.chat.messages.length,0);
 assert.ok(h.draws.some(d=>d[0]===hint.hint&&d[3]==='#FFFFFF'));
 assert.ok(h.draws.some(d=>d[0]==='/'&&d[3]==='#AAAAAA'));assert.ok(h.draws.some(d=>d[0]==='unknown'&&d[3]==='#FF5555'));
});

test('actual SaveSession receipt produces red chat with slashless underlined error and italic HERE',async()=>{
 let raw:string|null=null;const session=new SaveSession({getItem:()=>raw,setItem:(_k,v)=>{raw=v;}},{exclusive:async work=>work()});await session.refresh();const before=raw,h=chatHarness();
 h.chat.command=async(source:string)=>(await session.transact({type:'console',source})).console!;
 await h.chat.submitCommand('/unknown');assert.equal(raw,before);assert.equal(h.chat.messages.length,2);
 assert.deepEqual(h.chat.messages[0].runs,[{text:english['command.unknown.command'],color:'#FF5555'}]);
 assert.deepEqual(h.chat.messages[1].runs,[{text:'',color:'#AAAAAA'},{text:'unknown',color:'#FF5555',underline:true},{text:'<--[HERE]',color:'#FF5555',italic:true}]);
 h.chat.open=false;h.draws.length=0;h.rects.length=0;h.chat.paint();
 assert.ok(h.rects.some(r=>r[0]==='#FF5555'&&r[4]===1));assert.ok(h.transforms.some(t=>t[0]==='transform'&&t[3]===-.25));
 assert.ok(!JSON.parse(h.chat.root.dataset.layout).lines.some((s:string)=>s.includes('/unknown')));
 session.dispose();
});

test('argument context has client slash offset; sent response shows previous ten chars and styles only invalid suffix',()=>{
 const source='/gamerule advance_time nope',error=parseCommand(source) as CommandFeedback,h=chatHarness(source);
 assert.equal(error.cursor,23);assert.equal(commandHint(source,error,text),"Invalid boolean: expected 'true' or 'false' but found 'nope' at position 23: ...ance_time <--[HERE]");
 h.chat.commandMessage(error,source);const runs=h.chat.messages[1].runs;assert.equal(runs[0].text,'...ance_time ');assert.equal(runs[1].text,'nope');assert.equal(runs[1].underline,true);assert.equal(runs[2].italic,true);
});

test('valid editing and completion remove only the preview error, without creating system chat',()=>{
 const h=chatHarness();h.chat.paint();h.input.value='/time query time';h.input.selectionStart=h.input.selectionEnd=h.input.value.length;h.chat.paint();assert.equal(JSON.parse(h.chat.root.dataset.commandHint).error,null);
 h.input.value='/we';h.input.selectionStart=h.input.selectionEnd=3;h.chat.paint();assert.deepEqual(JSON.parse(h.chat.root.dataset.commandHint).suggestions,['weather']);assert.equal(h.chat.messages.length,0);
 h.chat.commandMessage({key:'commands.tick.step.fail',error:true});assert.equal(h.chat.messages.length,1);
});

test('native glyph underline occupies y+8 and italic shear leaves advance independent of styling',()=>{
 const h=chatHarness();chatGlyph(h.ctx as any,h.font as any,'x',10,20,{text:'x',color:'#FF5555',underline:true});assert.deepEqual(h.rects,[['#3f1515',11,29,6,1],['#FF5555',10,28,6,1]]);
 h.transforms.length=0;chatGlyph(h.ctx as any,h.font as any,'H',40,20,{text:'H',italic:true});assert.deepEqual(h.transforms,[['translate',41,20],['transform',1,0,-.25,1,0,0]]);
});

/** Create actual screen layout owners, including hidden sections and reset-confirmation hierarchy.
 * @param {number} width Logical viewport width.
 * @return {object} Production screen with measurable widget placements and sprite refreshes.
 */
function screenHarness(width=400){
 const element=():any=>({style:{cssText:''},classList:{add(){}},querySelector:()=>null,querySelectorAll:()=>[],hidden:true});
 const buttons=Array.from({length:4},element),title=element(),done=element(),reset=element(),confirmation=element(),confirmTitle=element(),confirmNote=element(),confirmButtons=[element(),element()],refresh:any[]=[];
 confirmation.querySelector=(q:string)=>q==='h3'?confirmTitle:confirmNote;confirmation.querySelectorAll=()=>confirmButtons as any;
 const language=element(),sound=element(),player=element(),weather=element();weather.querySelectorAll=()=>Array.from({length:3},element) as any;
 const sections=new Map([['language',language],['sound',sound],['player',player],['weather',weather]]);
 const screen=Object.create(NativeScreens.prototype);Object.assign(screen,{viewport:{clientWidth:width,clientHeight:240},page:()=> 'options',dialog:{dataset:{},querySelectorAll:()=>buttons},plane:{style:{},querySelectorAll:()=>[]},pixels:{texts:new Map(),updates:new Map(),resources:{guiImages:new Map()},refreshButton:(b:any)=>refresh.push(b)},background:{getContext:()=>({setTransform(){}})},controls:{title,done,reset,confirmation,navigation:{...element(),querySelectorAll:()=>buttons},sections,volume:{parentElement:element()},volumeLabel:element(),mute:element(),languageLabel:element(),username:{parentElement:element()},usernameLabel:element(),warning:element(),feedback:[]}});
 return{screen,buttons,confirmation,confirmButtons,refresh};
}

test('formal settings layout uses two native columns and refreshes every button sprite synchronously',()=>{
 Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({getPropertyValue:()=> '1'})});
 const h=screenHarness();h.screen.layout();assert.match(h.buttons[0].style.cssText,/left:92px;top:134px;width:300px/);assert.match(h.buttons[1].style.cssText,/left:408px;top:134px;width:300px/);assert.match(h.buttons[2].style.cssText,/left:92px;top:182px/);assert.equal(h.refresh.length,4);
 assert.equal(optionFlow(400,4).resetY,115);assert.equal(optionFlow(196,4).columns,1);
 h.confirmation.hidden=false;h.screen.layout();assert.equal(h.screen.dialog.dataset.confirming,'true');assert.match(h.confirmButtons[0].style.cssText,/width:300px/);h.confirmation.hidden=true;h.screen.layout();assert.equal(h.screen.dialog.dataset.confirming,'false');
});

test('PixelUI refresh paints both existing label and existing sprite without creating another canvas',()=>{
 const ui=Object.create(PixelUI.prototype),b={} as HTMLElement,calls:string[]=[];Object.assign(ui,{updates:new Map([[b,()=>calls.push('label')]]),buttonPaints:new Map([[b,()=>calls.push('sprite')]])});ui.refreshButton(b);assert.deepEqual(calls,['label','sprite']);
});

for(const page of ['language','sound','player','weather'])test('formal '+page+' settings paint native list background and both separators',()=>{
 Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({getPropertyValue:()=> '1'})});
 Object.defineProperty(globalThis,'DOMMatrix',{configurable:true,value:class{scale(){return this;}}});
 const h=screenHarness(),patterns:string[]=[],fills:any[]=[];
 const images=new Map(['menu_background','menu_list_background','header_separator','footer_separator'].map(name=>['assets/minecraft/textures/gui/inworld_'+name+'.png',{name}]));
 h.screen.pixels.resources.guiImages=images;h.screen.page=()=>page;
 h.screen.background.getContext=()=>({setTransform(){},save(){},restore(){},translate(){},createPattern(image:any){patterns.push(image.name);return{setTransform(){}};},fillRect(...v:number[]){fills.push(v);}});
 h.screen.layout();assert.deepEqual(patterns,['menu_background','menu_list_background','header_separator','footer_separator']);assert.deepEqual(fills[0],[0,0,400,240]);assert.equal(fills[1][1],page==='language'?36:33);assert.equal(fills[2][3],2);assert.equal(fills[3][3],2);
});
