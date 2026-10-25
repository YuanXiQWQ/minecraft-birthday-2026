/** Ordinary-build search editing regression; browser Pointer Lock is simulated before navigation. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Production roots, save identity and explicitly supplied browser installation. */
const root=resolve(import.meta.dirname,'..'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js');
/** Serve the two ordinary builds without application instrumentation. */
const server=createServer(async(req,res)=>{
    try{
        const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
        let file=url.pathname.slice(base.length);if(!file||file.endsWith('/'))file+='index.html';
        const bytes=await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.end(bytes);
    }catch{res.statusCode=404;res.end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),results=[];
try{
    for(const base of ['/','/minecraft-birthday-2026/'])for(const locale of ['en','zh-CN']){
        const state=initialState();state.settings.locale=locale;
        const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:locale==='en'?1:1.5});
        await installPointerSimulation(context);
        await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:JSON.stringify(await seal(state,'catalogue-search',0))});
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
        await page.goto('http://127.0.0.1:'+server.address().port+base+'game/');
        await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});
        assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',await page.locator('#app').getAttribute('data-resource-error'));
        await page.keyboard.press('e');
        const search=page.locator('.catalogue-search'),slots=page.locator('.inventory-slot[data-kind="source"][data-item]');
        assert.equal(await search.evaluate(n=>document.activeElement===n),true);
        assert.equal(await search.getAttribute('type'),'text','Java EditBox must not expose a browser-owned cancel button');
        const initial=await slots.evaluateAll(nodes=>nodes.map(n=>n.dataset.item));
        const held=await page.locator('#inventory').getAttribute('data-cursor');
        for(const width of [1280,390]){
            await page.setViewportSize({width,height:width===390?844:720});
            await search.fill(locale==='en'?'oak':'橡木');
            assert.ok(await slots.count()>0);assert.notDeepEqual(await slots.evaluateAll(nodes=>nodes.map(n=>n.dataset.item)),initial);
            const box=await search.boundingBox();
            await search.click({position:{x:box.width-2,y:box.height/2}});
            assert.equal(await search.evaluate(n=>n.selectionStart),locale==='en'?3:2,'right edge positions the caret at the end');
            await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
            assert.equal(await search.inputValue(),'');assert.equal(await search.evaluate(n=>document.activeElement===n),true);
            assert.deepEqual(await slots.evaluateAll(nodes=>nodes.map(n=>n.dataset.item)),initial);
            assert.equal(await page.locator('#inventory').getAttribute('data-cursor'),held);
            await search.fill('x'.repeat(50));await page.keyboard.press('End');await page.keyboard.type('y');assert.equal((await search.inputValue()).length,50);
            await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
            await page.keyboard.type('oak');await page.keyboard.press('Home');await page.keyboard.press('Delete');assert.equal(await search.inputValue(),'ak');
            await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
        }
        await page.locator('[data-tab="crafting"]').click();assert.equal(await search.isVisible(),false);
        await page.locator('[data-tab="catalogue"]').click();assert.equal(await search.evaluate(n=>document.activeElement===n),true);
        await page.keyboard.press('Escape');assert.equal(await page.locator('#inventory').evaluate(n=>n.open),false);
        assert.deepEqual(errors,[]);results.push({base,locale,widths:[1280,390],pointer:'simulation only',editing:'passed'});await context.close();
    }
    console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(r=>server.close(r));}
