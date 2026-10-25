/** Profile/perspective integration against ordinary builds; Pointer Lock is simulated and profile faults are explicitly injected. */
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
 for(const base of ['/','/minecraft-birthday-2026/']){
    const state=initialState();state.settings.locale='zh-CN';
    const context=await browser.newContext({viewport:{width:1280,height:720}});await installPointerSimulation(context);
    const manifest=JSON.parse(await readFile(resolve(root,'../resources/minecraft/26.3/profile-manifest.json'),'utf8'));
    let requested=[],mode='fixture';
    await context.route('https://playerdb.co/**',async route=>{const name=decodeURIComponent(route.request().url().split('/').at(-1));requested.push(name);if(name==='MissingTest')return route.fulfill({json:{success:false}});if(name==='BrokenTest')return route.fulfill({status:503,body:'unavailable'});if(name==='SlowTest')await new Promise(r=>setTimeout(r,1200));
       const data=JSON.parse(Buffer.from(manifest.properties[0].value,'base64').toString());data.profileName=name;
       if(name==='WideTest'){delete data.textures.CAPE;delete data.textures.SKIN.metadata;}
       await route.fulfill({json:{success:true,data:{player:{username:name==='SIREOH'?'sireoh':name,raw_id:manifest.profile.id,properties:[{name:'textures',value:Buffer.from(JSON.stringify(data)).toString('base64')}]}}}});
    });
    await context.route('https://textures.minecraft.net/**',async route=>{const e=manifest.entries.find(e=>e.source===route.request().url());if(e)await route.fulfill({contentType:'image/png',body:await readFile(resolve(root,'../resources/minecraft/26.3',e.entry))});else await route.abort();});
    await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:JSON.stringify(await seal(state,'profile-test',0))});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);console.log('start',base);page.on('pageerror',e=>{errors.push(String(e));console.error('PAGE ERROR',String(e));});
    const url='http://127.0.0.1:'+server.address().port+base+'game/';await page.goto(url);console.log('navigated',base);
    await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000}).catch(async e=>{console.error('BOOT STATE',await page.locator('#app').evaluate(n=>({data:{...n.dataset},text:n.textContent?.slice(-1200)})));throw e;});
    console.log('boot',await page.locator('#app').getAttribute('data-boot'),errors);assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',await page.locator('#app').getAttribute('data-resource-error'));
    const canvas=page.locator('canvas[data-perspective]');await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-avatar]')?.dataset.avatar??'{}').name==='sireoh');
    let avatar=JSON.parse(await canvas.getAttribute('data-avatar'));assert.equal(avatar.slim,true);assert.equal(avatar.cape,true);
    for(const n of [1,2,0]){await page.keyboard.press('F5');await page.waitForFunction(n=>document.querySelector('canvas[data-perspective]')?.dataset.perspective===String(n),n);avatar=JSON.parse(await canvas.getAttribute('data-avatar'));assert.equal(avatar.visible,n!==0);assert.ok(avatar.distance<=4);}
    console.log('perspective passed');
    const downloadEvent=page.waitForEvent('download');await page.keyboard.press('F2');const download=await downloadEvent;assert.match(download.suggestedFilename(),/^\d{4}-\d{2}-\d{2}_.*\.png$/);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const png=Buffer.concat(chunks);assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.ok(png.length>10000);assert.equal(png.readUInt32BE(16),await canvas.evaluate(c=>c.width));assert.equal(png.readUInt32BE(20),await canvas.evaluate(c=>c.height));
    console.log('F2 download passed',png.length);await page.keyboard.press('Escape');await page.getByRole('button',{name:'选项…',exact:true}).click();await page.getByRole('button',{name:'玩家设置…',exact:true}).click();
    const input=page.locator('#username'),card=page.locator('.player-profile-match');await page.waitForFunction(()=>document.querySelector('.player-profile-match')?.dataset.state==='ready');assert.equal(await card.innerText(),'sireoh');
    const bounds=await card.boundingBox(),field=await input.boundingBox(),save=page.getByRole('button',{name:'保存',exact:true});assert.ok(bounds.y>=field.y+field.height);assert.ok((await save.boundingBox()).y>=bounds.y+bounds.height);
    await input.fill('MissingTest');await page.waitForFunction(()=>document.querySelector('.player-profile-match')?.dataset.state==='profile.missing');assert.equal(await save.isDisabled(),true);
    await input.fill('BrokenTest');await page.waitForFunction(()=>document.querySelector('.player-profile-match')?.dataset.state==='profile.unavailable');
    await input.fill('SlowTest');await page.waitForTimeout(400);await input.fill('WideTest');await page.waitForFunction(()=>document.querySelector('.player-profile-match')?.textContent.includes('WideTest'));await page.waitForTimeout(1300);assert.equal(await card.innerText(),'WideTest');assert.equal(JSON.parse(await canvas.getAttribute('data-avatar')).name,'sireoh');
    if(base==='/'){
        await page.evaluate(key=>{window.profileOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('injected quota','QuotaExceededError');return window.profileOriginalSet.call(this,k,v);};},key);
        await save.click();await page.waitForTimeout(1000);assert.equal(JSON.parse(await canvas.getAttribute('data-avatar')).name,'sireoh');
        await page.evaluate(()=>{Storage.prototype.setItem=window.profileOriginalSet;delete window.profileOriginalSet;});await page.locator('#retry-save').evaluate(b=>b.click());await page.waitForFunction(()=>document.querySelector('#app')?.dataset.saveStatus==='ready');
    }
    await save.click();await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-avatar]')?.dataset.avatar??'{}').name==='WideTest');avatar=JSON.parse(await canvas.getAttribute('data-avatar'));assert.equal(avatar.slim,false);assert.equal(avatar.cape,false);
    for(const width of [390,1280]){await page.setViewportSize({width,height:width===390?844:720});const a=await card.boundingBox(),b=await save.boundingBox();assert.ok(b.y>=a.y+a.height);}
    await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready',null,{timeout:90000});await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-avatar]')?.dataset.avatar??'{}').name==='WideTest');
    await page.keyboard.press('e');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);results.push({base,pointer:'simulated',profiles:mode,requested,perspectives:[0,1,2],screenshot:'browser PNG download',reload:true,errors});await context.close();
 }
 console.log(JSON.stringify(results,null,2));
}catch(e){console.error(e);throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
