/** Root/Pages animal resource-cache and optional live-renderer regression with simulated Pointer Lock. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Ordinary build roots and isolated browser storage identity. */
const root=resolve(import.meta.dirname,'..'),key='minecraft-birthday-2026:formal:save',
    pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),requests=[];
/** Serve historical cache fixtures and current builds on a fresh local origin. */
const server=createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
    let file=url.pathname.slice(base.length);if(!file||file.endsWith('/'))file+='index.html';
    if(file==='fixture'){res.setHeader('Content-Type','text/html');res.end('<title>Animal cache fixture</title>');return;}
    const old=file==='minecraft/26.3/world-manifest.json'&&!url.search,
        bytes=await readFile(old?resolve(root,'tests/fixtures/world-manifest-971a027.json'):resolve(root,base==='/'?'dist':'dist-pages',file));
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');
    res.setHeader('Cache-Control',file.startsWith('minecraft/')?'public,max-age=31536000':'no-cache');requests.push({url:req.url,cache:req.headers['cache-control']});res.end(bytes);
}catch{res.statusCode=404;res.end('missing');}});
/** Wait for the actual farm frame and inventory HUD, retaining concrete load errors.
 * @param {import('playwright').Page} page Isolated browser page.
 */
async function ready(page){
    await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});
    assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',await page.locator('#app').evaluate(n=>JSON.stringify(n.dataset)));
    assert.equal(await page.locator('#app').getAttribute('data-inventory-ready'),'true');
    assert.equal(await page.locator('canvas[data-scene]').getAttribute('data-rendered-scene'),'farm');
}
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),results=[];
try{
    for(const base of ['/','/minecraft-birthday-2026/'])for(const cached of [false,true]){
        const context=await browser.newContext();await installPointerSimulation(context);const page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+base+'fixture');
        const state=initialState();state.progress.scene='farm';state.progress.environment.control.frozen=true;
        state.progress.unlocked.push('minecraft:wheat');state.progress.player.data.hotbar[0]={id:'minecraft:wheat',count:7};
        await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:JSON.stringify(await seal(state,'animal-cache',0))});
        if(cached)await page.evaluate(async base=>{
            await fetch(base+'minecraft/26.3/world-manifest.json');
            for(const kind of ['cow','chicken'])await fetch(base+'minecraft/26.3/assets/minecraft/textures/entity/'+kind+'/'+kind+'_temperate.png');
        },base);
        await page.goto(origin+base+'game/');await ready(page);await page.reload();await ready(page);
        const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
        assert.equal(saved.generation,'animal-cache');assert.deepEqual(saved.state.progress.player.data.hotbar[0],{id:'minecraft:wheat',count:7});assert.deepEqual(errors,[]);
        results.push({base,cached,reload:true,farmAndHudReady:true,pointer:'simulated'});await context.close();
    }
    assert.ok(requests.some(r=>r.url.includes('world-manifest.json?build=')&&['no-cache','max-age=0'].includes(r.cache)));
    if(process.argv[4]){
        const context=await browser.newContext();await installPointerSimulation(context);const page=await context.newPage();
        await page.goto(process.argv[4]+'/__verify__/farm.html');await page.waitForFunction(()=>window.farmTest,null,{timeout:90000});
        const result=await page.evaluate(()=>{
            const view=window.farmTest.view,world=view.authored,p=view.environmentProgress;
            world.tickLife(p,view.collision,[],null);const cow=world.animals.get('node:cow:0'),start=[...cow.feet];
            view.motion.feet=[start[0]+.6,start[1],start[2]];world.tickLife(p,view.collision,[],null,view.motion);
            const pushed=cow.feet[0]<start[0],reciprocal=view.motion.velocity[0]>0;
            world.animateLife(1);const mesh=world.natural.children.find(o=>o.userData.id==='node:cow:0');
            const projected=Math.abs(mesh.position.x-cow.feet[0])<1e-8;
            cow.feet=[cow.origin[0]-2.25,cow.origin[1],cow.origin[2]];cow.velocity=[0,0,0];cow.path=[];
            for(let i=0;i<80;i++)world.tickLife(p,view.collision,[],null);
            return {pushed,reciprocal,projected,returned:Math.hypot(cow.feet[0]-cow.origin[0],cow.feet[2]-cow.origin[2])<=2+1e-8,animals:world.animals.size};
        });assert.equal(result.pushed,true);assert.equal(result.reciprocal,true);assert.equal(result.projected,true);assert.equal(result.returned,true);results.push({renderer:result});await context.close();
    }
    console.log(JSON.stringify(results));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
