/** Development-only profiling of real chat input and wheel events; pointer ownership is simulated. */
import {createRequire,stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Explicit installed browser runtime and ordinary development URL. */
const pw=createRequire(process.argv[2]+'/package.json')('./index.js'),url=process.argv[4]??'http://127.0.0.1:4193/game/';
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});await installPointerSimulation(context);
 await context.route('**/@vite/client',route=>route.fulfill({contentType:'text/javascript',body:'export const createHotContext=()=>({accept(){},dispose(){},prune(){},on(){},invalidate(){}});export const injectQuery=url=>url;const styles=new Map();export const updateStyle=(id,css)=>{let style=styles.get(id);if(!style){style=document.createElement("style");document.head.append(style);styles.set(id,style);}style.textContent=css;};export const removeStyle=id=>{styles.get(id)?.remove();styles.delete(id);};'}));
 if(process.argv.includes('--baseline')){
  for(const file of ['chat','vanilla']){
   const source=execFileSync('git',['show',`9932d5c:app/web/src/ui/${file}.ts`],{encoding:'utf8'}),body=stripTypeScriptTypes(source,{mode:'transform'});
   await context.route(`**/src/ui/${file}.ts*`,route=>route.fulfill({contentType:'text/javascript',body}));
  }
 }
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});
 assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',JSON.stringify(errors));
 await page.evaluate(async()=>{
  const moduleUrl=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname==='/src/ui/chat.ts').name;
  const {GameChat}=await import(moduleUrl),original=GameChat.prototype.paint;
  window.chatStats={paint:[],inputs:[],wheels:[],draws:0};
  const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){window.chatStats.draws++;return draw.apply(this,args);};
  GameChat.prototype.paint=function(...args){
   window.profileChat=this;const start=performance.now(),before=window.chatStats.draws;const result=original.apply(this,args);
   window.chatStats.paint.push({ms:performance.now()-start,draws:window.chatStats.draws-before});
   for(const pending of [...window.chatStats.inputs,...window.chatStats.wheels])if(pending.painted===undefined){pending.painted=performance.now()-pending.at;requestAnimationFrame(()=>pending.frame=performance.now()-pending.at);}
   return result;
  };
 });
 await page.keyboard.press('t');await page.waitForFunction(()=>window.profileChat);
 await page.evaluate(async()=>{
  const chinese=(await import('/src/i18n/locales/zh-CN.json')).default;
  const chars=[...new Set(Object.values(chinese).join('').match(/[\u4e00-\u9fff]/g))].slice(0,180).join('');
  const chat=window.profileChat;chat.messages=Array.from({length:30},(_,i)=>({kind:'player',time:performance.now(),runs:[{text:`<Player${i}> ${chars}`}]}));chat.rowLayout=null;chat.paint();
  chat.input.addEventListener('input',e=>window.chatStats.inputs.push({at:performance.now(),queue:performance.now()-e.timeStamp}),{capture:true});
  chat.root.addEventListener('wheel',e=>window.chatStats.wheels.push({at:performance.now(),queue:performance.now()-e.timeStamp}),{capture:true});
  window.chatStats.paint=[];window.chatStats.draws=0;
 });
 const cdp=await context.newCDPSession(page);if(process.argv.includes('--profile')){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
 await page.keyboard.type('typing latency test',{delay:35});
 const typingPaint=await page.evaluate(()=>window.chatStats.paint.slice());
 const bounds=await page.locator('.game-chat').boundingBox();await page.mouse.move(bounds.x+100,bounds.y+bounds.height-70);
 for(let i=0;i<12;i++){await page.mouse.wheel(0,i<6?-100:100);await page.waitForTimeout(45);}
 await page.waitForTimeout(300);
 const report=await page.evaluate(()=>{
  const stats=window.chatStats,p95=values=>values.sort((a,b)=>a-b)[Math.floor(values.length*.95)]??0;
  return{pointerMode:'simulated',inputs:stats.inputs.length,wheels:stats.wheels.length,paints:stats.paint.length,paintP95:p95(stats.paint.map(v=>v.ms)),drawsP95:p95(stats.paint.map(v=>v.draws)),inputP95:p95(stats.inputs.map(v=>v.painted)),inputFrameP95:p95(stats.inputs.map(v=>v.frame)),inputQueueP95:p95(stats.inputs.map(v=>v.queue)),wheelP95:p95(stats.wheels.map(v=>v.painted)),wheelFrameP95:p95(stats.wheels.map(v=>v.frame)),wheelQueueP95:p95(stats.wheels.map(v=>v.queue)),value:window.profileChat.input.value,offset:window.profileChat.offset,open:window.profileChat.open};
 });
 if(process.argv.includes('--profile')){const {profile}=await cdp.send('Profiler.stop');console.log(JSON.stringify(profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,15).map(n=>({fn:n.callFrame.functionName,url:n.callFrame.url,hits:n.hitCount}))));}
 const typingP95=typingPaint.map(v=>v.ms).sort((a,b)=>a-b)[Math.floor(typingPaint.length*.95)],typingDrawsP95=typingPaint.map(v=>v.draws).sort((a,b)=>a-b)[Math.floor(typingPaint.length*.95)];
 assert.equal(report.value,'typing latency test');assert.equal(report.wheels,12);assert.deepEqual(errors,[]);
 if(!process.argv.includes('--baseline'))assert.ok(typingDrawsP95<100,'typing must reuse historical glyphs');
 console.log(JSON.stringify({...report,typingP95,typingDrawsP95}));
}finally{await browser.close();}
