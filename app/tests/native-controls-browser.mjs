/** Ordinary-build Chromium regression with actual input, old HTTP cache, and unedited screenshots. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
/** Isolated browser origins never touch the user's profile or saved progress. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../.test-results/native-controls/evidence'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),old=await readFile(resolve(root,'tests/fixtures/world-manifest-before-cave.json')),previous=JSON.parse(old),requests=[],report={cache:[],scenes:[],inputs:[]};
let legacy=false;
/** Serve exact production artifacts and controlled historical cache priming responses. */
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let path=url.pathname.slice(base.length);if(path==='cache-prime'){res.setHeader('Content-Type','text/html');res.end('<title>Cache fixture</title>');return;}if(!path||path.endsWith('/'))path+='index.html';const bytes=legacy&&path==='minecraft/26.3/world-manifest.json'?old:await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');res.setHeader('Cache-Control',path.startsWith('minecraft/')?'public, max-age=31536000':'no-cache');requests.push({url:req.url,legacy,cacheControl:req.headers['cache-control']});res.end(bytes);}catch{res.statusCode=404;res.end('not found');}});
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
/** Seed a controlled valid finite inventory without granting via the production UI.
 * @param {string} scene Authored scene.
 * @return {Promise<string>} Ordinary saved envelope.
 */
async function saved(scene){const s=structuredClone(initialState());s.progress.scene=scene;const ids=['cobblestone','iron_pickaxe','wooden_axe','iron_sword','oak_slab','torch','oak_door','oak_stairs'];s.progress.unlocked=ids.map(n=>'minecraft:'+n);s.progress.player.data.hotbar=Array.from({length:9},(_,i)=>ids[i]?{id:'minecraft:'+ids[i],count:i===1||i===2||i===3?1:16}:null);s.progress.world.visits.cave.removed=['stone:0','stone:1','coal_ore:0'];s.progress.scenes[scene].pose={feet:[0,0,7],yaw:0,pitch:scene==='cave'?-.6816207664:0};return JSON.stringify(await seal(s,'native-controls-'+scene,0));}
/** Await real world and HUD readiness and return inspectable production diagnostics.
 * @param {import('playwright').Page} page Real browser page.
 * @return {Promise<object>} Runtime and persistence facts.
 */
async function status(page){await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:30000});const s=await page.evaluate(k=>({app:{...document.querySelector('#app').dataset},canvas:{...document.querySelector('canvas[data-scene]')?.dataset},save:JSON.parse(localStorage.getItem(k)),viewport:[innerWidth,innerHeight]}),key);assert.equal(s.app.boot,'ready',s.app.resourceError);assert.equal(s.app.inventoryReady,'true');assert.equal(s.app.resourceError,undefined);return s;}
try{
 for(const [label,base] of [['root','/'],['pages','/minecraft-birthday-2026/']]){
    const context=await browser.newContext({viewport:{width:1280,height:800}});await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:await saved('cave')});
    const page=await context.newPage(),errors=[],cdp=await context.newCDPSession(page),responses=[];page.on('pageerror',e=>errors.push(e.message));await cdp.send('Network.enable');cdp.on('Network.responseReceived',e=>{if(e.response.url.includes('world-manifest'))responses.push({url:e.response.url,disk:e.response.fromDiskCache??false});});
    legacy=true;await page.goto(origin+base+'cache-prime');await page.evaluate(async urls=>{await Promise.all(urls.map(u=>fetch(u)));await Promise.all(urls.map(u=>fetch(u)));},[base+'minecraft/26.3/world-manifest.json',base+'minecraft/26.3/world-manifest.json?build=before-controls',...previous.entries.map(e=>base+'minecraft/26.3/'+e.entry)]);assert.ok(responses.some(r=>r.disk));legacy=false;const start=requests.length;
    await page.goto(origin+base+'game/');const upgraded=await status(page);assert.equal(upgraded.save.state.progress.world.visits.cave.removed.length,3);await page.waitForTimeout(700);
    await page.mouse.click(640,400);await page.keyboard.press('Digit1');await page.waitForTimeout(650);await page.mouse.click(640,400,{button:'right'});await page.waitForTimeout(700);const placed=await status(page);assert.equal(placed.save.state.progress.scenes.cave.blocks.length,1);assert.equal(placed.save.state.progress.player.data.hotbar[0].count,15);assert.equal(await page.evaluate(()=>!!document.pointerLockElement),true);
    await page.screenshot({path:resolve(out,label+'-cobblestone-placed.png')});await page.reload();const restored=await status(page);assert.deepEqual(restored.save.state.progress.scenes.cave.blocks,placed.save.state.progress.scenes.cave.blocks);await page.mouse.click(640,400);await page.keyboard.press('Digit2');await page.waitForTimeout(700);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up();await page.waitForTimeout(450);const mined=await status(page);assert.equal(mined.save.state.progress.scenes.cave.blocks.length,0);assert.equal(mined.save.state.progress.player.data.hotbar[0].count,16);assert.deepEqual(errors,[]);
    const before=JSON.parse(mined.canvas.player).feet;await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');await page.waitForTimeout(600);const moved=await status(page);assert.ok(JSON.parse(moved.canvas.player).feet[2]<before[2]-.5);await page.reload();const pose=await status(page);assert.deepEqual(pose.save.state.progress.scenes.cave.pose,moved.save.state.progress.scenes.cave.pose);
    report.cache.push({label,oldManifestDiskCache:true,upgraded,restored,pose,requests:requests.slice(start).filter(r=>r.url.includes('manifest.json')),errors});report.inputs.push({label,placed:placed.save.state.progress.scenes.cave.blocks,mined:mined.save.state.progress.player.data.hotbar[0],moved:JSON.parse(moved.canvas.player)});await context.close();console.log(label+' cache, placement, mining, moving and reload passed');
 }
 for(const [scene,width,height] of [['cave',1280,800],['cave',1920,1080],['cave',390,844],['plains',1280,800],['farm',1280,800],['home',1280,800]]){
    const context=await browser.newContext({viewport:{width,height}});await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:await saved(scene)});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/game/');await status(page);await page.waitForTimeout(11000);await page.mouse.click(width/2,height/2);await page.keyboard.press('Digit2');await page.waitForTimeout(800);
    if(scene==='plains'){
        await page.mouse.move(width/2,height/2-300);await page.keyboard.press('Digit3');await page.waitForTimeout(1500);await page.mouse.click(width/2,height/2-300);await page.waitForTimeout(180);const axe=JSON.parse((await status(page)).canvas.hand);assert.equal(axe.profile.speed,.8);assert.ok(axe.charge<.6);await page.screenshot({path:resolve(out,'axe-attack-cooldown.png')});await page.waitForTimeout(1500);await page.keyboard.press('Digit4');await page.waitForTimeout(800);await page.mouse.click(width/2,height/2-300);await page.waitForTimeout(180);const sword=JSON.parse((await status(page)).canvas.hand);assert.equal(sword.profile.speed,1.6);assert.ok(sword.charge<.7);report.inputs.push({axe,sword});await page.mouse.move(width/2,height/2);
    }
    if(scene==='cave'){await page.mouse.move(width/2,height/2-200);if(width===1280){await page.keyboard.press('Digit9');await page.waitForTimeout(800);await page.screenshot({path:resolve(out,'cave-empty-hand.png')});await page.keyboard.press('Digit2');await page.waitForTimeout(900);}}
    const file=scene+'-'+width+'.png';await page.screenshot({path:resolve(out,file)});report.scenes.push({file,...await status(page),errors});assert.deepEqual(errors,[]);await context.close();console.log(file);
 }
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
