/** Screenshot receipts, native localized links and preview ownership use browser API doubles without disk or pointer access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadScreenshot} from '../web/src/ui/game-screenshot.ts';
import {GameChat} from '../web/src/ui/chat.ts';
import {translate,localeDictionary} from '../web/src/i18n/index.ts';

test('successful PNG download returns the exact filename and retains its preview; encoding and dispatch failures never return success',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),revoked:string[]=[],links:any[]=[];let deny=false;
 t.mock.method(URL,'createObjectURL',()=> 'blob:screenshot');t.mock.method(URL,'revokeObjectURL',(url:string)=>{revoked.push(url);});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{append(){}},createElement:()=>{const link={href:'',download:'',hidden:false,removed:false,click(){if(deny)throw Error('blocked');},remove(){this.removed=true;}};links.push(link);return link;}}});
 try{
  const canvas={toBlob(fn:(blob:Blob|null)=>void){fn(new Blob(['png']));}} as HTMLCanvasElement;
  const result=await downloadScreenshot(canvas);assert.equal(result.name,links[0].download);assert.equal(result.url,links[0].href);assert.equal(links[0].removed,true);assert.deepEqual(revoked,[]);
  await assert.rejects(downloadScreenshot({toBlob(fn:(blob:null)=>void){fn(null);}} as HTMLCanvasElement),/screenshot-encode/);assert.equal(links.length,1);
  deny=true;await assert.rejects(downloadScreenshot(canvas),/blocked/);assert.deepEqual(revoked,['blob:screenshot']);assert.equal(links[1].removed,true);
 }finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');}
});

for(const locale of ['en','zh-CN'])test(`screenshot ${locale} message has native system text, an underlined filename and a bounded owned preview`,t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),revoked:string[]=[],lines:any[]=[];
 t.mock.method(URL,'revokeObjectURL',(url:string)=>{revoked.push(url);});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({textContent:'',append(){},remove(){}})}});
 const chat=Object.assign(Object.create(GameChat.prototype),{messages:[],screenshotUrls:new Set(),open:false,root:{dataset:{},remove(){}},accessible:{children:lines,append:(line:unknown)=>lines.push(line)},paint(){},lifetime:0,abort:new AbortController(),rowRasters:new Map(),text:(key:string)=>translate(key,{},localeDictionary(locale))}) as GameChat;
 try{
  chat.screenshotSaved({name:'2026-10-24_12.34.56.123.png',url:'blob:screenshot'});
  assert.equal(chat.messages[0].kind,'system');assert.equal(chat.messages[0].runs.map(run=>run.text).join(''),(locale==='en'?'Saved screenshot as ':'已将截图保存为')+'2026-10-24_12.34.56.123.png');
  assert.deepEqual(chat.messages[0].runs.at(-1),{text:'2026-10-24_12.34.56.123.png',underline:true,screenshot:'blob:screenshot'});
  for(let i=0;i<100;i++)chat.append([{text:'next'}]);assert.deepEqual(revoked,['blob:screenshot']);assert.equal(chat.screenshotUrls.size,0);
 }finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');}
});

test('screenshot hit testing follows wrapped rows and scroll position and rejects closed chat or expired URLs',()=>{
 const rows=[{id:0},{id:1},{id:2}],chat=Object.assign(Object.create(GameChat.prototype),{open:true,viewport:{clientWidth:640,clientHeight:480},offset:0,screenshotUrls:new Set(['blob:0','blob:1']),layoutRows:()=>rows,rasterRow:(row:{id:number})=>({hits:[{left:4,right:16,screenshot:'blob:'+row.id}]})}) as GameChat;
 // Native scale is two: the last row lies at logical y=191..200.
 assert.equal(chat.screenshotAt(12,390),null);chat.offset=1;assert.equal(chat.screenshotAt(12,390),'blob:1');assert.equal(chat.screenshotAt(12,382),'blob:1');assert.equal(chat.screenshotAt(12,380),'blob:0');
 assert.equal(chat.screenshotAt(60,390),null);chat.open=false;assert.equal(chat.screenshotAt(12,390),null);
});
