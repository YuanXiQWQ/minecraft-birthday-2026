/** Ordinary-build Chromium keyboard/pointer and real HTTP-cache upgrade evidence; isolated profiles only. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {ADVANCEMENTS} from '../web/src/domain/advancements.ts';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';
import {PerspectiveCamera,Vector3} from 'three';

/** Production files and controlled preconditions are never exposed through a debug route. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../.test-results/advancements/evidence'),key='minecraft-birthday-2026:formal:save',playwright=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),records=[],requests=[];
let oldCache=false;
const oldWorld=await readFile(resolve(root,'tests/fixtures/world-manifest-before-cave.json'));
/** Serve audited files while allowing real old-manifest cache priming on the same origin. */
const server=createServer(async(req,res)=>{
    try{const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let path=url.pathname.slice(base.length);if(!path||path.endsWith('/'))path+='index.html';
        if(path==='cache-prime'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>TEST previous cache</title>Previous cache');return;}
        const bytes=oldCache&&path==='minecraft/26.3/world-manifest.json'?oldWorld:await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');res.setHeader('Cache-Control',path.startsWith('minecraft/')?'public, max-age=31536000':'no-cache');requests.push({url:req.url,revalidate:req.headers['cache-control']??null,old:oldCache});res.end(bytes);
    }catch{res.statusCode=404;res.end('not found');}
});
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await playwright.chromium.launch({executablePath:process.argv[3],headless:true});
/** Read actual application-owned saved facts, not an observer's alternative state. @param {import('playwright').Page} page Page. @return {Promise<object>} Saved progress. */
async function progress(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress,key);}
/** Wait for formal world/HUD handoff, preserving concrete loader failures. @param {import('playwright').Page} page Page. */
async function ready(page){await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:60000});const data=await page.locator('#app').evaluate(n=>({...n.dataset}));assert.equal(data.boot,'ready',JSON.stringify(data));}
/** Await one actual new criterion saved through the ordinary UI. @param {import('playwright').Page} page Page. @param {string} id Advancement path. */
async function completed(page,id){try{await page.waitForFunction(({key,id})=>!!JSON.parse(localStorage.getItem(key)).state.progress.advancements.criteria['minecraft:'+id],{key,id},{timeout:10000});}catch(e){await page.screenshot({path:resolve(out,'failure.png')});console.log('FAILED',id,JSON.stringify(await progress(page)),await page.locator('canvas[data-scene]').getAttribute('data-hover'));throw e;}}
/** Obtain a source on the cursor, assert no premature grant, then click a real player hotbar slot.
 * @param {import('playwright').Page} page Page.
 * @param {string} item Short item ID.
 * @param {string|null} advancement Expected new advancement.
 * @param {number} index Hotbar target.
 */
async function acquire(page,item,advancement=null,index=0){
    await page.locator('.catalogue-search').fill('minecraft:'+item);
    const source=page.locator('.inventory-slot[data-kind="source"][data-item="minecraft:'+item+'"]');await source.click();
    await page.waitForFunction(()=>{const value=document.querySelector('#inventory')?.getAttribute('data-cursor');return value&&value!=='null';},{},{timeout:10000});
    if(advancement)assert.equal((await progress(page)).advancements.criteria['minecraft:'+advancement],undefined,'cursor must not grant '+advancement);
    await page.locator('.inventory-slot[data-kind="hotbar"][data-index="'+index+'"]').click();
    await page.waitForFunction(({key,item,index})=>JSON.parse(localStorage.getItem(key)).state.progress.player.data.hotbar[index]?.id==='minecraft:'+item&&document.querySelector('#inventory').getAttribute('data-cursor')==='null',{key,item,index},{timeout:10000});
    if(advancement)await completed(page,advancement);
}
try{
    for(const [label,base] of [['root','/'],['pages','/minecraft-birthday-2026/']]){
        const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);
        page.on('pageerror',e=>errors.push(e.message));
        const state=initialState();state.progress.scene='farm';state.progress.unlocked=['crafting_table','wooden_pickaxe','cobblestone','stone','stone_pickaxe','raw_iron','iron_ingot','iron_helmet','iron_pickaxe','wheat_seeds'].map(id=>'minecraft:'+id);
        await page.goto(origin+base+'cache-prime');
        if(label==='pages'){
            oldCache=true;await page.evaluate(async base=>{await fetch(base+'minecraft/26.3/world-manifest.json');await fetch(base+'minecraft/26.3/catalogue-manifest.json');await fetch(base+'minecraft/26.3/assets/minecraft/textures/gui/sprites/toast/advancement.png');},base);oldCache=false;
            delete state.progress.advancements;
        }
        const raw=JSON.stringify(await seal(state,'adv-browser-'+label,0));await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
        await page.goto(origin+base+'game/');await ready(page);assert.deepEqual((await progress(page)).advancements.criteria,{});
        await page.keyboard.press('l');await page.locator('#advancements').waitFor({state:'visible'});assert.deepEqual(JSON.parse(await page.locator('#advancements').getAttribute('data-visible')).sort(),Object.keys(ADVANCEMENTS).sort());
        await page.screenshot({path:resolve(out,label+'-empty.png')});await page.keyboard.press('Escape');
        await page.evaluate(()=>{window.__advSamples=[];window.__advObserved=[];new MutationObserver(()=>{for(const n of document.querySelectorAll('.advancement-toast'))if(!window.__advObserved.includes(n.dataset.advancement))window.__advObserved.push(n.dataset.advancement);}).observe(document.body,{childList:true,subtree:true});setInterval(()=>{const items=[...document.querySelectorAll('.advancement-toast,.recipe-toast')].filter(n=>!n.hidden).map(n=>({id:n.dataset.advancement??'recipes',top:n.style.top,phase:n.dataset.timeline,rect:n.getBoundingClientRect().toJSON()}));if(items.length)window.__advSamples.push({time:performance.now(),items});},100);});
        await page.keyboard.press('e');await page.locator('#inventory').waitFor({state:'visible'});
        await acquire(page,'wooden_pickaxe');assert.equal((await progress(page)).advancements.criteria['minecraft:story/mine_stone'],undefined);
        await acquire(page,'crafting_table','story/root',1);assert.equal(await page.locator('.advancement-toast[data-advancement="minecraft:story/root"]').count(),0);
        await acquire(page,'cobblestone','story/mine_stone',2);await page.waitForTimeout(750);await page.screenshot({path:resolve(out,label+'-toast.png')});await acquire(page,'stone_pickaxe','story/upgrade_tools',3);
        await acquire(page,'raw_iron',null,4);assert.equal((await progress(page)).advancements.criteria['minecraft:story/smelt_iron'],undefined);
        await acquire(page,'iron_ingot','story/smelt_iron',5);await acquire(page,'iron_helmet','story/obtain_armor',6);await acquire(page,'iron_pickaxe','story/iron_tools',7);
        assert.ok(Object.values((await progress(page)).player.data.equipment).every(v=>v===null));
        await acquire(page,'wheat_seeds',null,8);
        await page.keyboard.press('Escape');await page.locator('#inventory').waitFor({state:'hidden'});await page.locator('.hotbar button[data-hotbar="8"]').click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.player.data.selected===8,key,{timeout:10000});
        const canvas=page.locator('canvas[data-scene]'),bounds=await canvas.boundingBox(),definition=WORLD_SCENES.farm,camera=new PerspectiveCamera(70,bounds.width/bounds.height,.1,512);camera.position.set(...definition.eye);camera.lookAt(...definition.target);camera.updateMatrixWorld();
        // Ordinary trusted canvas gestures enter the default hidden mode, then empty-ground Use returns to visible-pointer mode.
        await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{button:'right'});
        await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-scene]').dataset.pointerMode).actual,{},{timeout:10000});
        await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{button:'right'});
        await page.waitForFunction(()=>!JSON.parse(document.querySelector('canvas[data-scene]').dataset.pointerMode).actual,{},{timeout:10000});
        const hits=[];let planted=false;
        for(const plot of definition.plots){
            const point=new Vector3(plot[0]+.5,plot[1]-.0625,plot[2]+.5).project(camera),x=bounds.x+(point.x+1)*bounds.width/2,y=bounds.y+(1-point.y)*bounds.height/2;
            if(x<bounds.x||x>bounds.x+bounds.width||y<bounds.y||y>bounds.y+bounds.height)continue;
            await page.mouse.move(x,y);await page.waitForTimeout(50);const hit=JSON.parse(await canvas.getAttribute('data-hover')??'null');hits.push({plot,x,y,hit});
            if(hit?.id?.startsWith('plot:')){await page.mouse.click(x,y,{button:'right'});await completed(page,'husbandry/plant_seed');planted=true;break;}
        }
        assert.ok(planted,'native ray must reach a real authored plot: '+JSON.stringify(hits));
        const after=await progress(page);assert.deepEqual(after.advancements.criteria['minecraft:husbandry/root'],['consumed_item']);assert.equal(after.scenes.farm.crops.length,1);assert.equal(after.player.data.hotbar[8],null);
        await page.waitForFunction(()=>new Set(window.__advSamples.flatMap(s=>s.items.filter(i=>i.id!=='recipes'&&JSON.parse(i.phase).visible>.9).map(i=>i.id))).size===6,{},{timeout:16000});
        await page.waitForFunction(()=>document.querySelectorAll('.advancement-toast').length===0,{},{timeout:16000});
        await page.keyboard.press('l');await page.locator('#advancements').waitFor({state:'visible'});await page.mouse.move(20,650);await page.screenshot({path:resolve(out,label+'-story.png')});
        await page.locator('.advancement-controls button[data-advancement="minecraft:husbandry/root"]').click();assert.equal(await page.locator('#advancements').getAttribute('data-selected'),'minecraft:husbandry/root');
        await page.mouse.move(20,700);await page.screenshot({path:resolve(out,label+'-husbandry.png')});
        const visible=JSON.parse(await page.locator('#advancements').getAttribute('data-visible'));assert.ok(visible.includes('minecraft:husbandry/root'));
        const toastRecords=await page.evaluate(()=>({observed:window.__advObserved,samples:window.__advSamples,audio:document.querySelector('#scene').dataset.uiAudio}));assert.equal(toastRecords.observed.length,6);records.push({label,build:await page.locator('#app').getAttribute('data-build'),boot:await page.locator('#app').getAttribute('data-boot'),criteria:after.advancements.criteria,oldCache:label==='pages',toasts:toastRecords,hits,errors});assert.deepEqual(errors,[]);
        await page.locator('.advancement-done').click();await page.locator('#advancements').waitFor({state:'hidden'});
        await page.reload();await ready(page);assert.deepEqual((await progress(page)).advancements.criteria,after.advancements.criteria);assert.equal(await page.locator('.advancement-toast').count(),0);
        await page.keyboard.press('l');await page.locator('#advancements').waitFor({state:'visible'});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:resolve(out,label+'-390.png')});
        const rect=await page.locator('#advancements>canvas').first().boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=390&&rect.y+rect.height<=844);
        await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(300);await page.screenshot({path:resolve(out,label+'-1920.png')});
        await context.close();
        const alternate=await browser.newContext({viewport:{width:1280,height:720}}),alternatePage=await alternate.newPage();
        if(label==='root'){
            const legacy=initialState();delete legacy.progress.advancements;legacy.progress.unlocked=['minecraft:iron_helmet'];legacy.progress.player.data.backpack[0]={id:'minecraft:iron_helmet',count:1};
            await alternatePage.goto(origin+base+'cache-prime');oldCache=true;await alternatePage.evaluate(async base=>{await fetch(base+'minecraft/26.3/world-manifest.json');await fetch(base+'minecraft/26.3/catalogue-manifest.json');},base);oldCache=false;
            await alternatePage.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:JSON.stringify(await seal(legacy,'legacy-inventory-sync',0))});
        }
        await alternatePage.goto(origin+base+'game/');await ready(alternatePage);const restored=await progress(alternatePage);assert.equal(await alternatePage.locator('.advancement-toast').count(),0);
        if(label==='root')assert.deepEqual(restored.advancements.criteria,{'minecraft:story/obtain_armor':['iron_helmet']});else assert.deepEqual(restored.advancements.criteria,{});
        records.push({label:label+'-'+(label==='root'?'old-cache-inventory-migration':'clean-first-open'),build:await alternatePage.locator('#app').getAttribute('data-build'),criteria:restored.advancements.criteria,oldCache:label==='root',notifications:0});await alternate.close();
    }
    assert.ok(requests.some(r=>r.url.includes('advancement-manifest.json?build=')&&!r.old));
    await writeFile(resolve(out,'browser-results.json'),JSON.stringify({kind:'ordinary audited builds; isolated saved unlock preconditions; browser keyboard and mouse; real HTTP cache priming',records,requests:requests.filter(r=>r.url.includes('manifest.json')),screenshots:'Unedited Chromium screenshots, exact viewport dimensions'},null,2));
    console.log(JSON.stringify(records.map(({label,build,criteria,errors})=>({label,build,completed:Object.keys(criteria).length,errors})),null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
