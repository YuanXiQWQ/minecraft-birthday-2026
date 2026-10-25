/** Formal advancement screen regression; pointer ownership is simulated before any navigation. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {ADVANCEMENTS,BIRTHDAY_ADVANCEMENT} from '../web/src/domain/advancements.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Built documents, storage identity and the explicitly supplied browser runtime. */
const root=resolve(import.meta.dirname,'..'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),requests=[];
/** Serve ordinary builds and a cache-priming page without app instrumentation. */
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let file=url.pathname.slice(base.length);if(!file||file.endsWith('/'))file+='index.html';if(file==='fixture'){res.setHeader('Content-Type','text/html');res.end('<title>Fixture</title>');return;}const bytes=await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control',file.startsWith('minecraft/')?'public,max-age=31536000':'no-cache');requests.push({url:req.url,cache:req.headers['cache-control']});res.end(bytes);}catch{res.statusCode=404;res.end('missing');}});
/** Prepare existing saved completions; these are test preconditions, not UI-earned advancement claims.
 * @param {string} locale Stored language.
 * @param {boolean} completed Whether to include completed trees.
 * @return {Promise<string>} Sealed save bytes.
 */
async function fixture(locale,completed){const state=initialState();state.settings.locale=locale;state.progress.environment.control.advanceTime=false;state.progress.environment.control.advanceWeather=false;if(completed)for(const [id,node] of Object.entries(ADVANCEMENTS))if(id!=='minecraft:husbandry/root')state.progress.advancements.criteria[id]=Object.keys(node.criteria);return JSON.stringify(await seal(state,'advancement-panel',0));}
/** Await the formal world and HUD, reporting actual resource loader errors.
 * @param {import('playwright').Page} page Test page.
 */
async function ready(page){await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:90000});assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',await page.locator('#app').evaluate(n=>JSON.stringify(n.dataset)));}

await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),results=[];
try{for(const base of ['/','/minecraft-birthday-2026/']){
 const context=await browser.newContext({viewport:{width:1280,height:720}});await installPointerSimulation(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin+base+'fixture');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture('en',false)});await page.goto(origin+base+'game/');await ready(page);await page.keyboard.press('l');assert.deepEqual(JSON.parse(await page.locator('#advancements').getAttribute('data-visible')),[]);await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.goto(origin+base+'fixture');await page.evaluate(async base=>{const m=await(await fetch(base+'minecraft/26.3/advancement-manifest.json?build=previous-panel')).json();await Promise.all(m.entries.filter(e=>e.entry.endsWith('.png')).map(e=>fetch(base+'minecraft/26.3/'+e.entry)));},base);
 for(const locale of ['en','zh-CN']){
  await page.goto(origin+base+'fixture');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture(locale,true)});await page.goto(origin+base+'game/');await ready(page);
  await page.keyboard.press('Escape');const buttons=page.locator('#game-menu button'),labels=await buttons.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')??n.textContent));assert.equal(labels.length,4);assert.ok(labels[1].includes(locale==='en'?'Advancements':'进度'));
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width};}));assert.equal(boxes[1].y,boxes[2].y);assert.ok(boxes[1].x<boxes[2].x);assert.equal(boxes[0].w,boxes[3].w);assert.ok(boxes[0].w>boxes[1].w);assert.ok(boxes[0].y<boxes[1].y&&boxes[1].y<boxes[3].y);
  await buttons.nth(1).click();assert.equal(await page.locator('#advancements').evaluate(n=>n.open),true);assert.equal(await page.locator('#game-menu').evaluate(n=>n.open),false);
  const tab=page.locator('[data-tab][data-advancement="minecraft:husbandry/root"]');await tab.click();assert.equal(await page.locator('#advancements').getAttribute('data-selected'),'minecraft:husbandry/root');assert.equal(await page.locator('[data-advancement="'+BIRTHDAY_ADVANCEMENT+'"]:not([data-tab])').getAttribute('data-done'),'true');assert.equal(await page.locator('[data-advancement="minecraft:husbandry/root"]:not([data-tab])').getAttribute('data-done'),'false');
  for(const size of [{width:1280,height:720},{width:390,height:844},{width:1920,height:1080}]){await page.setViewportSize(size);await page.waitForTimeout(150);const window=JSON.parse(await page.locator('#advancements').getAttribute('data-window'));assert.equal(window.width,252);assert.equal(window.height,140);const node=page.locator('[data-advancement="'+BIRTHDAY_ADVANCEMENT+'"]:not([data-tab])');await node.hover();await page.waitForTimeout(300);assert.ok(await page.locator('#advancements>canvas').first().evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v!==0)));}
  await page.getByRole('button',{name:locale==='en'?'Done':'完成',exact:true}).click();assert.equal(await page.locator('#game-menu').evaluate(n=>n.open),true);await page.keyboard.press('Escape');await page.keyboard.press('l');await page.keyboard.press('Escape');assert.equal(await page.locator('#game-menu').evaluate(n=>n.open),false);
  await page.reload();await ready(page);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress.advancements.criteria['minecraft:husbandry/plant_seed'].includes('wheat'),key),true);
 }
 assert.deepEqual(errors,[]);assert.ok(requests.some(r=>r.url.includes('advancement-manifest.json?build=')&&['no-cache','max-age=0'].includes(r.cache)));results.push({base,locales:['en','zh-CN'],sizes:[390,1280,1920],pointer:'simulation only',restored:true,cachedResources:true});await context.close();
}console.log(JSON.stringify(results));}finally{await browser.close();await new Promise(r=>server.close(r));}
