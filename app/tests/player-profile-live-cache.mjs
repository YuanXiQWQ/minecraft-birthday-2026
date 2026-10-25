/** Existing HTTP-cache upgrade and live profile smoke test; Pointer Lock is simulated before navigation. */
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
        if(url.pathname.endsWith('/__prime__')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Cache priming</title>');return;}
        if(url.pathname.endsWith('/world-manifest.json')&&!url.search){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','public,max-age=31536000');res.end(await readFile(resolve(root,'tests/fixtures/world-manifest-971a027.json')));return;}
        if(url.pathname.endsWith('/profile-manifest.json')&&!url.search){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','public,max-age=31536000');res.end('{}');return;}
        let file=url.pathname.slice(base.length);if(!file||file.endsWith('/'))file+='index.html';
        const bytes=await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.end(bytes);
    }catch{res.statusCode=404;res.end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),results=[];


try{
 for(const base of ['/','/minecraft-birthday-2026/']){
    const context=await browser.newContext({viewport:{width:1280,height:720}});await installPointerSimulation(context);
    const state=initialState();delete state.settings.username;
    await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:JSON.stringify(await seal(state,'old-profile-cache',0))});
    const page=await context.newPage(),errors=[],network=[],manifests=[];page.on('pageerror',e=>{errors.push(String(e));console.error('PAGE ERROR',String(e));});page.on('response',r=>{if(r.url().includes('playerdb.co')||r.url().includes('textures.minecraft.net'))network.push({url:r.url(),status:r.status()});if(r.url().includes('-manifest.json?build='))manifests.push(r.url());});
    const origin='http://127.0.0.1:'+server.address().port;await page.goto(origin+base+'__prime__');
    await page.evaluate(async base=>{await fetch(base+'minecraft/26.3/world-manifest.json');await fetch(base+'minecraft/26.3/profile-manifest.json');},base);
    console.log('Primed old HTTP manifests',base);await page.goto(origin+base+'game/');await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000}).catch(async e=>{console.error('BOOT STATE',await page.locator('#app').evaluate(n=>({data:{...n.dataset},text:n.textContent?.slice(-1200)})));throw e;});assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',await page.locator('#app').getAttribute('data-resource-error'));
    await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-avatar]')?.dataset.avatar??'{}').name==='sireoh');assert.ok(manifests.some(u=>u.includes('profile-manifest.json?build=')));assert.ok(manifests.some(u=>u.includes('world-manifest.json?build=')));
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Options...',exact:true}).click();await page.getByRole('button',{name:'Player Settings...',exact:true}).click();
    await page.locator('#username').fill('Notch');await page.waitForFunction(()=>document.querySelector('.player-profile-match')?.dataset.state==='ready',null,{timeout:45000});assert.equal(await page.locator('.player-profile-match').innerText(),'Notch');
    assert.ok(network.some(n=>n.url.endsWith('/Notch')&&n.status===200));assert.ok(network.some(n=>n.url.includes('textures.minecraft.net')&&n.status===200));
    assert.deepEqual(errors,[]);results.push({base,pointer:'simulated',cache:'primed stale HTTP manifests',liveProfile:'Notch',network,errors});await context.close();
 }
 console.log(JSON.stringify(results,null,2));
}catch(e){console.error(e);throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
