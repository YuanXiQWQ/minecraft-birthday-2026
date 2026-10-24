/** Formal cane input and old-manifest upgrade on both published paths, with simulated pointer ownership. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {agriculture} from '../web/src/domain/soil-state.ts';
import {NativeRandom} from '../web/src/domain/environment.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';
/** Formal resource roots and isolated browser runtime. */
const root=resolve(import.meta.dirname,'..'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),old=await readFile(resolve(root,'tests/fixtures/world-manifest-before-agriculture.json'));
let legacy=false;
/** Serve real build bytes, retaining long-lived old resource cache entries. */
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname,base=path.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let file=path.slice(base.length);if(!file||file.endsWith('/'))file+='index.html';if(file==='fixture'){res.setHeader('Content-Type','text/html');res.end('<title>Fixture</title>');return;}const body=legacy&&file==='minecraft/26.3/world-manifest.json'?old:await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control',file.startsWith('minecraft/')?'public,max-age=31536000':'no-cache');res.end(body);}catch{res.statusCode=404;res.end('missing');}});
/** Prepare finite cane, physical pose and a deterministic next random sample for a mature stalk.
 * @param {boolean} growth Whether to prepare a two-high stalk at age fifteen.
 * @return {Promise<string>} Valid sealed save.
 */
async function fixture(growth=false){const s=initialState(),p=s.progress;p.scene='farm';p.unlocked=['minecraft:sugar_cane'];p.player.data.hotbar[0]={id:'minecraft:sugar_cane',count:4};p.environment.control.advanceTime=false;p.environment.control.advanceWeather=false;p.environment.dayTicks=6000;p.scenes.farm.pose={feet:[7.5,0,2.5],yaw:0,pitch:-Math.atan2(1.64,2)};
 if(growth){p.scenes.farm.blocks=[{id:'growing-cane',block:'sugar_cane',cell:[7,1,-3],state:{age:'15'}}];const a=agriculture(p);for(let seed=0;seed<1000000;seed++){const rng=new NativeRandom(seed),saved=Number(rng.state);if(rng.integer(0,15)===7&&rng.integer(0,15)===1&&rng.integer(0,15)===13){a.random=saved;break;}}}
 return JSON.stringify(await seal(s,'cane-browser',0));}
/** Check formal boot and first world frame without screenshots. @param {import('playwright').Page} page Isolated page. */
async function ready(page){await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:90000});assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',await page.locator('#app').evaluate(e=>JSON.stringify(e.dataset)));await page.waitForFunction(()=>document.querySelector('canvas[data-scene]')?.dataset.renderedScene==='farm');}
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),results=[];
try{for(const base of ['/','/minecraft-birthday-2026/']){const context=await browser.newContext({viewport:{width:1100,height:760}});await installPointerSimulation(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin+base+'fixture');legacy=true;await page.evaluate(async base=>{const m=await(await fetch(base+'minecraft/26.3/world-manifest.json?build=old-cane')).json();await Promise.all(m.entries.filter(e=>e.entry.includes('sugar_cane')).map(e=>fetch(base+'minecraft/26.3/'+e.entry)));},base);legacy=false;
 await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture()});await page.goto(origin+base+'game/');await ready(page);const canvas=page.locator('canvas[data-scene]');await canvas.click({button:'right'});
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.blocks?.some(b=>b.block==='sugar_cane'&&b.cell.join(',')==='7,0,0'),key,{timeout:15000});
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress.player.data.hotbar[0].count,key),3);
 await page.reload();await ready(page);assert.equal(await canvas.evaluate(e=>{const pose=JSON.parse(localStorage.getItem('minecraft-birthday-2026:formal:save')).state.progress.scenes.farm.pose;let yaw=pose.yaw,pitch=pose.pitch;for(const x of [.2,.3,.4,.5,.6,.7,.8])for(const y of [.3,.5,.7]){const nextYaw=Math.atan2(.5-x,2),nextPitch=-Math.atan2(1.62-y,2);e.dispatchEvent(new MouseEvent('mousemove',{movementX:(yaw-nextYaw)/.003,movementY:(pitch-nextPitch)/.003,bubbles:true}));yaw=nextYaw;pitch=nextPitch;if(JSON.parse(e.dataset.hover??'null')?.block==='sugar_cane')return true;}return false;}),true,'visible cane ray');await canvas.click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.player.data.hotbar[0]?.count===4,key,{timeout:15000});
 await page.goto(origin+base+'fixture');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:await fixture(true)});await page.goto(origin+base+'game/');await ready(page);
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.blocks?.some(b=>b.block==='sugar_cane'&&b.cell.join(',')==='7,2,-3'),key,{timeout:15000});await page.reload();await ready(page);
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.blocks.filter(b=>b.block==='sugar_cane').length,key),2);assert.deepEqual(errors,[]);results.push({base,plant:true,finite:true,harvest:true,growThree:true,refresh:true,oldCache:true,pointer:'simulated',errors});await context.close();}console.log(JSON.stringify(results));}finally{await browser.close();await new Promise(r=>server.close(r));}
