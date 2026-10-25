/** Actual browser wheel/keyboard input verifies chat scrolling and silent lock contention on both production paths. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';

/** Explicit browser runtime and an isolated save namespace never reuse the user's actual profile. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.argv[4]??'../.test-results/chat-scroll/evidence'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),records=[];
/** Serve the ordinary audited outputs without application instrumentation or special build modes. */
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname,base=path.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
 if(path.endsWith('/lock-holder')){res.setHeader('Content-Type','text/html');res.end('<title>Isolated lock holder</title>');return;}
 let file=path.slice(base.length)||'index.html';if(file.endsWith('/'))file+='index.html';
 const body=await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.end(body);
 }catch{res.statusCode=404;res.end();}});

/** Read the rendered wrapped-line scroll position without accessing the chat instance.
 * @param {import('playwright').Page} page Isolated production page.
 * @return {Promise<number>} Displayed line offset.
 */
async function offset(page){return page.locator('.game-chat').evaluate(node=>JSON.parse(node.dataset.layout).offset);}

/** Assert the two deleted notifications never appear in the actual accessible chat log or startup alert.
 * @param {import('playwright').Page} page Isolated production page.
 * @return {Promise<void>} Silent success and lock-contention presentation.
 */
async function silent(page){const messages=await page.locator('.game-chat').evaluate(node=>JSON.parse(node.dataset.messages??'[]').map(message=>message.runs.map(run=>run.text).join('')).join('\n'));assert.doesNotMatch(messages,/Progress is saved on this browser|Another page is saving|进度已保存在此浏览器中|其他页面正在保存/);assert.doesNotMatch(await page.locator('.startup-error').textContent(),/Another page is saving|其他页面正在保存/);}

await mkdir(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [label,base,locale] of [['root','/','en'],['pages','/minecraft-birthday-2026/','zh-CN']]){
  const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   const state=structuredClone(initialState());state.settings.locale=locale;
   await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:JSON.stringify(await seal(state,'scroll-'+label,0))});
   await page.goto(origin+base+'game/');await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready');await silent(page);
   const player=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress.player,key);
   for(let i=0;i<32;i++){await page.keyboard.press('t');await page.keyboard.insertText(`历史记录 ${i}：`+'鼠标滚轮应及时显示聊天中的上一页和下一页。'.repeat(8));await page.keyboard.press('Enter');}
   await page.keyboard.press('t');await page.mouse.move(200,600);
   await page.evaluate(()=>{
    const root=document.querySelector('.game-chat');window.wheelSamples=[];
    root.addEventListener('wheel',event=>{window.wheelSamples.push({queue:performance.now()-event.timeStamp,received:performance.now(),expected:window.wheelExpected});},{capture:true,passive:true});
    new MutationObserver(()=>{const position=JSON.parse(root.dataset.layout).offset;for(const sample of window.wheelSamples)if(sample.response===undefined&&position===sample.expected){sample.response=performance.now()-sample.received;sample.offset=position;}}).observe(root,{attributes:true,attributeFilter:['data-layout']});
   });
   for(const [delta,shift,expected] of [[-100,false,7],[-100,false,14],[100,false,7],[-100,true,8],[100,true,7],[100,false,0]]){
    await page.evaluate(expected=>window.wheelExpected=expected,expected);if(shift)await page.keyboard.down('Shift');await page.mouse.wheel(0,delta);if(shift)await page.keyboard.up('Shift');
    await page.waitForFunction(expected=>JSON.parse(document.querySelector('.game-chat').dataset.layout).offset===expected,expected,{timeout:2000});
   }
   await page.keyboard.press('PageUp');await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.layout).offset===19);assert.equal(await offset(page),19);await page.keyboard.press('PageDown');await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.layout).offset===0);assert.equal(await offset(page),0);
   const wheel=await page.evaluate(()=>window.wheelSamples);assert.equal(wheel.length,6);assert.ok(wheel.every(sample=>sample.response!==undefined&&sample.response<500),'wheel changes must paint within 500ms in software-rendered Chromium');
   await page.screenshot({path:resolve(out,label+'-chat.png')});await page.keyboard.press('Escape');
   const sibling=await context.newPage();await sibling.goto(origin+base+'lock-holder');await sibling.evaluate(key=>{void navigator.locks.request(key+':transaction',async()=>{window.lockHeld=true;await new Promise(resolve=>window.releaseLock=resolve);});},key);await sibling.waitForFunction(()=>window.lockHeld);await page.bringToFront();
   await page.locator('#retry-save').waitFor({state:'visible',timeout:15000});await silent(page);await sibling.evaluate(()=>window.releaseLock());await sibling.close();await page.bringToFront();await page.locator('#retry-save').click();await page.locator('#retry-save').waitFor({state:'hidden'});await silent(page);
   assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress.player,key),player);
   await page.evaluate(()=>{window.originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('isolated-storage-failure');};});
   await page.keyboard.press('t');await page.keyboard.insertText('/time add 1');await page.keyboard.press('Enter');await page.locator('#retry-save').waitFor({state:'visible'});
   await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).some(message=>message.runs.some(run=>run.color==='#FF5555')));await silent(page);
   await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageWrite;});await page.locator('#retry-save').click();await page.locator('#retry-save').waitFor({state:'hidden'});await silent(page);assert.deepEqual(errors,[]);
   records.push({label,locale,wheel,lockContentionSilent:true,recoverySilent:true,genuineWriteFailureRed:true,inventoryPreserved:true,errors});console.log(label+' chat scroll passed');
  }finally{await context.close();await browser.close();}
 }
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify(records,null,2)+'\n');
}finally{server.close();}
