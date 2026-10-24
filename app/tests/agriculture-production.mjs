/** Formal root/Pages input and old-cache regression; Pointer Lock is simulated before any page code. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';
/** Isolated test runtime, durable key and historical manifest bytes. */
const root=resolve(import.meta.dirname,'..'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),old=await readFile(resolve(root,'tests/fixtures/world-manifest-before-agriculture.json'));
let legacy=false;
const requests=[];
/** Serve ordinary build bytes; only the cache-priming document is test-owned. */
const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname,base=path.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let file=path.slice(base.length);if(!file||file.endsWith('/'))file+='index.html';
    if(file==='cache-prime'){res.setHeader('Content-Type','text/html');res.end('<title>Cache priming</title>');return;}
    const body=legacy&&file==='minecraft/26.3/world-manifest.json'?old:await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));
    requests.push({url:req.url,legacy});res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control',file.startsWith('minecraft/')?'public,max-age=31536000':'no-cache');res.end(body);
}catch{res.statusCode=404;res.end('missing');}});
/** Seal owned test carriers and a real approach pose without altering production commands.
 * @param {'hoe'|'egg'|'jump'} kind Scenario.
 * @return {Promise<string>} Valid save bytes.
 */
async function fixture(kind){const s=initialState(),p=s.progress;p.scene='farm';p.environment.control.advanceWeather=false;p.environment.control.advanceTime=false;p.environment.dayTicks=6000;
    p.unlocked=['minecraft:wooden_hoe','minecraft:wheat_seeds'];p.player.data.hotbar[0]={id:'minecraft:wooden_hoe',count:1};p.player.data.hotbar[1]={id:'minecraft:wheat_seeds',count:8};
    p.scenes.farm.pose=kind==='hoe'?{feet:[14.5,0,7.5],yaw:0,pitch:-Math.atan2(1.62+.02,2)}:kind==='egg'?{feet:[4.5,0,1.5],yaw:0,pitch:0}:{feet:[-4.5,-.0625,-1.5],yaw:0,pitch:-.5};
    if(kind==='jump')p.scenes.farm.crops=[{id:'trample-crop',cell:[-5,0,-2],item:'minecraft:wheat_seeds',growth:{version:1,data:{ticks:240}}}];
    return JSON.stringify(await seal(s,'agriculture-'+kind,0));
}
/** Read the real saved result, independent of DOM diagnostics. @param {import('playwright').Page} page Browser page. @return {Promise<object>} Durable progress. */
async function progress(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress,key);}
/** Wait for formal boot with concrete errors. @param {import('playwright').Page} page Browser page. */
async function ready(page){await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:90000});const status=await page.locator('#app').getAttribute('data-boot');assert.equal(status,'ready',await page.locator('#app').evaluate(e=>JSON.stringify(e.dataset)));await page.waitForFunction(()=>document.querySelector('canvas[data-scene]')?.dataset.renderedScene==='farm');}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
const results=[];
try{
    for(const base of ['/','/minecraft-birthday-2026/']){
        const context=await browser.newContext({viewport:{width:1100,height:760}});await installPointerSimulation(context);const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(String(e))));
        const page=await context.newPage();await page.goto(origin+base+'cache-prime');legacy=true;
        await page.evaluate(async base=>{const manifest=await(await fetch(base+'minecraft/26.3/world-manifest.json?build=old-agriculture')).json();await Promise.all(manifest.entries.filter(e=>/farmland|world-sounds/.test(e.entry)).map(e=>fetch(base+'minecraft/26.3/'+e.entry)));},base);legacy=false;
        await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture('hoe')});await page.goto(origin+base+'game/');await ready(page);
        const canvas=page.locator('canvas[data-scene]');await canvas.click({button:'right'});
        await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.agriculture?.soils.some(s=>s.cell.join(',')==='14,-1,5'&&s.moisture===0),key,{timeout:15000});
        await page.keyboard.press('Digit2');await canvas.click({button:'right'});
        await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.crops.some(c=>c.cell.join(',')==='14,0,5'),key,{timeout:15000});
        let p=await progress(page);assert.equal(p.player.data.hotbar[1].count,7);assert.equal(p.scenes.farm.crops[0].growth.data.ticks,0);
        await page.reload();await ready(page);p=await progress(page);assert.equal(p.scenes.farm.crops[0].cell.join(','),'14,0,5');assert.ok(p.scenes.farm.agriculture.soils.some(s=>s.cell.join(',')==='14,-1,5'));
        await page.goto(origin+base+'cache-prime');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture('egg')});await page.goto(origin+base+'game/');await ready(page);
        await canvas.click();
        await page.waitForFunction(()=>{const records=JSON.parse(document.querySelector('[data-environment-audio]')?.dataset.environmentAudio??'[]');return ['entity.cow.ambient','entity.chicken.ambient'].every(event=>records.some(r=>r.event===event&&r.status==='scheduled'&&r.category==='neutralVolume'&&r.spatial));},{},{timeout:30000});
        assert.equal((await progress(page)).world.visits.farm.removed.length,0);await page.keyboard.down('KeyW');
        try{await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.world.visits.farm.removed.includes('chicken-egg:0'),key,{timeout:15000});}finally{await page.keyboard.up('KeyW');}
        p=await progress(page);assert.ok(p.player.data.hotbar.some(s=>s?.id==='minecraft:egg'));
        await page.goto(origin+base+'cache-prime');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture('jump')});await page.goto(origin+base+'game/');await ready(page);
        await page.keyboard.down('Space');try{await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.crops.length===0,key,{timeout:15000});}finally{await page.keyboard.up('Space');}
        p=await progress(page);assert.equal(p.scenes.farm.agriculture.soils.find(s=>s.cell.join(',')==='-5,-1,-2').moisture,null);assert.ok(p.player.data.hotbar.some(s=>s?.id==='minecraft:wheat')||p.scenes.farm.agriculture.drops.some(d=>d.stack.id==='minecraft:wheat'));
        assert.deepEqual(errors,[]);results.push({base,boot:true,till:true,drySeed:true,refresh:true,walkPickup:true,jumpTrample:true,animalAudio:'scheduled, not manually listened',pointer:'simulated',errors});await context.close();
    }
    assert.ok(requests.some(r=>r.legacy&&r.url.includes('world-manifest')));assert.ok(requests.some(r=>!r.legacy&&/world-manifest\.json\?build=/.test(r.url)));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(r=>server.close(r));}
