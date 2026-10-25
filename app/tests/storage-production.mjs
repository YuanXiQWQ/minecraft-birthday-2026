/** Isolated production-browser storage checks use simulated pointer ownership and real save transactions. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {emptyStorage} from '../web/src/domain/storage.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Explicit runtime dependencies, isolated output and formal save key. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../.test-results/storage/browser'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),report=[];
/** Serve the exact production artifacts under their root or Pages prefix. */
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,base=pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let path=pathname.slice(base.length);if(!path||path.endsWith('/'))path+='index.html';const bytes=await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end('missing');}});
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
try{for(const base of process.argv.includes('--root-only')?['/']:['/','/minecraft-birthday-2026/'])for(const kind of ['chest','barrel']){
    const context=await browser.newContext({viewport:{width:1280,height:720}});await installPointerSimulation(context);
    const state=structuredClone(initialState()),p=state.progress;p.scene='home';state.settings.locale='zh-CN';
    p.unlocked=['minecraft:chest','minecraft:barrel','minecraft:oak_planks'];p.environment.dayTicks=6000;p.environment.control.advanceTime=false;p.environment.control.advanceWeather=false;
    p.scenes.home.pose={feet:[6.5,0,6.5],yaw:0,pitch:Math.atan2(.5-1.62,3)};
    p.scenes.home.blocks=[{id:'box',block:kind,cell:[6,0,3],state:{facing:kind==='barrel'?'up':'south',type:kind==='barrel'?'single':'right',open:'false'},contents:emptyStorage()}];
    p.scenes.home.blocks[0].contents.data.slots[0]={id:'minecraft:oak_planks',count:12};
    if(kind==='chest')p.scenes.home.blocks.push({id:'other',block:'chest',cell:[7,0,3],state:{facing:'south',type:'left'},contents:emptyStorage()});
    await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:JSON.stringify(await seal(state,'storage-browser',0))});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
    await page.goto('http://127.0.0.1:'+server.address().port+base+'game/');
    await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});
    assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready');
    const canvas=page.locator('canvas[data-scene]');
    await canvas.click({position:{x:640,y:360}});await page.mouse.click(640,360,{button:'right'});
    try{await page.waitForSelector('[data-kind=storage]');}catch(error){await page.screenshot({path:resolve(out,kind+'-open-failure.png')});console.log(await page.evaluate(()=>({app:{...document.querySelector('#app').dataset},canvases:[...document.querySelectorAll('canvas[data-scene]')].map(c=>({...c.dataset})),dialogs:[...document.querySelectorAll('dialog')].map(d=>({class:d.className,open:d.open}))})));throw error;}
    const active=page.locator('dialog[open][data-storage]');
    assert.equal(await page.locator('[data-kind=storage]').count(),kind==='chest'?54:27);
    assert.equal(await active.getAttribute('aria-label'),kind==='chest'?'大型箱子':'木桶');
    assert.equal(await page.locator('.world-navigation').isVisible(),false);
    if(kind==='chest')await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-scene]').dataset.storageAnimation??'[]').filter(r=>r.open&&r.openness>.99).length===2);
    await page.screenshot({path:resolve(out,(base==='/'?'root':'pages')+'-'+kind+'.png')});
    await page.locator('[data-kind=storage][data-index="0"]').click({modifiers:['Shift']});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.player.data.hotbar[8]?.count===12,key);
    await page.locator('[data-kind=hotbar][data-index="8"]').click({modifiers:['Shift']});
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.home.blocks[0].contents.data.slots[0]?.count===12,key);
    await page.locator('[data-kind=storage][data-index="0"]').click({button:'right'});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('dialog[open][data-storage]').dataset.cursor??'null')?.count===6);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open][data-storage]'));
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.player.data.hotbar.some(s=>s?.count===6),key);
    await page.waitForFunction(kind=>{const audio=JSON.parse(document.querySelector('[data-environment-audio]')?.dataset.environmentAudio??'[]');return ['open','close'].every(action=>audio.some(r=>r.event==='block.'+kind+'.'+action&&r.status==='scheduled'));},kind);
    const evidence=await page.evaluate(key=>({save:JSON.parse(localStorage.getItem(key)).state.progress.scenes.home.blocks,audio:JSON.parse(document.querySelector('[data-environment-audio]').dataset.environmentAudio),animation:JSON.parse(document.querySelector('canvas[data-scene]').dataset.storageAnimation??'[]')}),key);
    assert.deepEqual(errors,[]);report.push({base,kind,evidence});
    await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready',null,{timeout:90000});
    const persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress,key);assert.equal(persisted.scenes.home.blocks[0].contents.data.slots[0].count,6);assert.equal(persisted.player.data.hotbar.find(s=>s?.id==='minecraft:oak_planks')?.count,6);
    await context.close();console.log(base,kind,'passed');
}}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
