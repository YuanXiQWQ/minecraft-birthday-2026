/** Root/Pages production regression with legacy HTTP caches and test-only Pointer Lock simulation. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {ODD_CAKE,ODD_BLOCK,ODD_ADVANCEMENT} from '../web/src/domain/easter-egg.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Test-only browser dependencies, isolated storage key and cache request records. */
const root=resolve(import.meta.dirname,'..'),pw=createRequire(resolve(process.argv[2],'package.json'))('playwright'),key='minecraft-birthday-2026:formal:save',requests=[];
/** Exact previous authored definition and manifest prime real fresh HTTP cache entries. */
const oldAssets=new Map(await Promise.all([['easter-egg-manifest.json','easter-egg-manifest-before-item-icon.json'],['assets/jerrys_farm/items/upside_down_cake.json','odd-cake-item-before-icon.json']].map(async([path,file])=>[path,await readFile(resolve(root,'tests/fixtures',file))])));
let primeOld=false;
/** Serve exact ordinary build bytes with long-lived resource caching.
 * @param {import('node:http').IncomingMessage} req Browser request.
 * @param {import('node:http').ServerResponse} res Static response.
 */
async function serve(req,res){try{const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let path=url.pathname.slice(base.length);if(path==='prime'){res.setHeader('Content-Type','text/html');res.end('<title>Cache fixture</title>');return;}if(!path||path.endsWith('/'))path+='index.html';const bytes=primeOld&&oldAssets.has(path.replace('minecraft/26.3/',''))?oldAssets.get(path.replace('minecraft/26.3/','')):await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');res.setHeader('Cache-Control',path.startsWith('minecraft/')?'public, max-age=31536000':'no-cache');requests.push(req.url);res.end(bytes);}catch{res.statusCode=404;res.end('not found');}}
/** Wait for the real world/HUD handoff and report concrete boot failures.
 * @param {import('playwright').Page} page Isolated page.
 */
async function ready(page){await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});const data=await page.locator('#app').evaluate(n=>({...n.dataset}));assert.equal(data.boot,'ready',JSON.stringify(data));}
/** Read the real committed browser save.
 * @param {import('playwright').Page} page Isolated page.
 * @return {Promise<object>} Durable state.
 */
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,key);}
const server=createServer(serve);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
try{
    for(const base of ['/','/minecraft-birthday-2026/'])for(const cached of [false,true]){
        const context=await browser.newContext({viewport:{width:1280,height:720}});await installPointerSimulation(context);const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
        await page.goto(origin+base+'prime');
        if(cached){primeOld=true;await page.evaluate(async base=>{for(const name of ['easter-egg-manifest.json','assets/jerrys_farm/items/upside_down_cake.json','world-manifest.json','catalogue-manifest.json','controls-manifest.json','assets/minecraft/models/block/cake_slice1.json','assets/minecraft/textures/block/cake_inner.png'])await fetch(base+'minecraft/26.3/'+name);},base);primeOld=false;}
        const state=initialState();state.settings.locale='zh-CN';state.progress.scene='home';delete state.progress.advancements;
        const grid=['wheat','wheat','wheat','sugar','egg','sugar','milk_bucket','milk_bucket','milk_bucket'].map(id=>({id:'minecraft:'+id,count:1}));
        state.progress.recipeBook.data.known.push('minecraft:cake');
        state.progress.unlocked=[...new Set(['minecraft:crafting_table','minecraft:bucket',...grid.map(s=>s.id)])];
        state.progress.scenes.home.pose={feet:[4.5,0,4.5],yaw:0,pitch:-.45};
        state.progress.scenes.home.stations.push({id:'odd-bench',kind:'crafting_table',cell:[4,0,2],facing:'north',contents:{version:1,data:{grid}}});
        const raw=JSON.stringify(await seal(state,'odd-browser-'+cached,0));await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
        await page.goto(origin+base+'game/');await ready(page);console.log('ready',base,cached);
        await page.mouse.click(640,360,{button:'right'});await page.locator('#inventory').waitFor({state:'visible',timeout:15000});
        await page.locator('.recipe-book-toggle').click();await page.locator('.recipe-book-search').fill('糕蛋');
        await page.locator('[data-book-control="tab:misc"]').click();
        await page.waitForFunction(()=>JSON.parse(document.querySelector('#inventory').dataset.book).recipes.includes('jerrys_farm:ekac'));
        assert.equal((await saved(page)).progress.advancements.criteria[ODD_ADVANCEMENT],undefined);
        const result=page.locator('.inventory-slot[data-kind="preview"]');await result.waitFor();assert.equal(JSON.parse(await page.locator('#inventory').getAttribute('data-preview')).result?.id,ODD_CAKE);
        await result.click({modifiers:['Shift']});console.log('clicked',await page.locator('#inventory').getAttribute('data-craft-error'));
        await page.waitForFunction(({key,id})=>!!JSON.parse(localStorage.getItem(key)).state.progress.advancements.criteria[id],{key,id:ODD_ADVANCEMENT});
        assert.ok((await saved(page)).progress.player.data.hotbar.some(s=>s?.id===ODD_CAKE));
        await page.locator('.advancement-toast[data-advancement="'+ODD_ADVANCEMENT+'"]').waitFor({state:'attached'});
        await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).some(m=>m.kind==='author'&&m.runs.some(r=>r.text==='hmmm,你确定吗 (ﾉ∀)`')));
        await page.keyboard.press('Escape');
        const current=await saved(page);current.progress.scenes.home.blocks=Array.from({length:7},(_,bites)=>({id:'odd-'+bites,block:ODD_BLOCK,cell:[bites-3,0,3],state:{bites:String(bites)}}));
        current.progress.scenes.home.pose={feet:[0,0,0],yaw:0,pitch:-.14};
        current.progress.player.data.selected=current.progress.player.data.hotbar.findIndex(s=>s?.id===ODD_CAKE);
        const withModels=JSON.stringify(await seal(current,'odd-models',1));await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:withModels});
        console.log('reloading models',base,cached);await page.reload();await ready(page);console.log('models ready',base,cached);assert.equal((await saved(page)).progress.scenes.home.blocks.length,7);
        assert.equal(await page.locator('.advancement-toast[data-advancement="'+ODD_ADVANCEMENT+'"]').count(),0);
        assert.equal((await saved(page)).progress.cakePlacement,null);assert.deepEqual(errors,[]);
        if(cached){
            await page.mouse.click(640,360,{button:'right'});
            console.log('table target',await page.locator('canvas[data-scene]').getAttribute('data-hover'));
            await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.oddCakeTableTried===true,key);
            await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).some(m=>m.kind==='author'&&m.runs.some(r=>r.text==='拜托 (｡•ˇ_ˇ•｡)')));
            await page.mouse.click(640,360,{button:'right'});await page.waitForTimeout(250);
            assert.equal(await page.evaluate(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).filter(m=>m.runs.some(r=>r.text==='拜托 (｡•ˇ_ˇ•｡)')).length),1);
            await page.reload();await ready(page);await page.mouse.click(640,360,{button:'right'});await page.waitForTimeout(250);
            assert.equal(await page.evaluate(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).filter(m=>m.runs.some(r=>r.text==='拜托 (｡•ˇ_ˇ•｡)')).length),0);
            assert.ok((await saved(page)).progress.player.data.hotbar.some(s=>s?.id===ODD_CAKE));
        }
        if(cached){
            const refill=await saved(page);refill.progress.cakePlacement={scene:'home',table:'birthday-table',bites:7};
            if(!refill.progress.unlocked.includes('minecraft:cake'))refill.progress.unlocked.push('minecraft:cake');
            refill.progress.advancements.criteria['jerrys_farm:happy_birthday']=['cake_on_table'];
            refill.progress.player.data.selected=0;refill.progress.player.data.hotbar[0]={id:'minecraft:cake',count:1};
            refill.progress.scenes.home.pose={feet:[0,0,0],yaw:0,pitch:-.8};
            const initialRefill=JSON.stringify(await seal(refill,'refill-fixture',0));await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:initialRefill});await page.reload();await ready(page);
            await page.mouse.click(640,360,{button:'right'});
            await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).some(m=>m.kind==='author'&&m.runs.some(r=>r.text==='别着急，我们把它放到桌子上吧！')));
            assert.equal((await saved(page)).progress.player.data.hotbar[0].id,'minecraft:cake');assert.equal((await saved(page)).progress.cakePlacement.bites,7);
            const table=await saved(page);table.progress.scenes.home.pose.pitch=-.14;
            const tableRaw=JSON.stringify(await seal(table,'refill-table',0));await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:tableRaw});await page.reload();await ready(page);
            await page.mouse.click(640,360,{button:'right'});await page.waitForFunction(()=>document.querySelector('.birthday-celebration')?.dataset.playing==='true');
            assert.equal((await saved(page)).progress.player.data.hotbar[0],null);assert.equal((await saved(page)).progress.cakePlacement.bites??0,0);
            assert.equal(await page.locator('.advancement-toast[data-advancement="jerrys_farm:happy_birthday"]').count(),0);
            await page.reload();await ready(page);assert.equal(await page.locator('.birthday-celebration').getAttribute('data-playing'),'false');
        }
        assert.ok(requests.some(url=>url.startsWith(base+'minecraft/26.3/easter-egg-manifest.json?build=')));
        console.log(JSON.stringify({base,cached,pointer:'simulated',craft:true,challenge:true,sevenModels:true,restore:true,errors}));await context.close();
    }
}finally{await browser.close();await new Promise(r=>server.close(r));}
