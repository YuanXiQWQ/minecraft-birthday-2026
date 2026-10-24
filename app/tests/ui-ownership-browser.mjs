/** Browser interaction and rendering checks use simulated ownership; native OS pointer capture is not exercised. */
import {installPointerSimulation} from './browser-pointer-sim.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {emptyFurnace} from '../web/src/domain/furnace.ts';
import {emptyHopper} from '../web/src/domain/hopper.ts';

/** Explicit temporary browser profile keeps ordinary user saves and desktop state untouched. */
const [runtime,executablePath,url,output]=process.argv.slice(2),pw=createRequire(resolve(runtime,'package.json'))('playwright'),browser=await pw.chromium.launch({executablePath,headless:true}),page=await browser.newPage({viewport:{width:1280,height:800}}),report={url,pointerMode:'simulated-no-os-lock',cases:[],errors:[]};
await installPointerSimulation(page);
page.on('pageerror',error=>report.errors.push(error.message));

/** Await the simulated ownership event and game state, after the final UI closes.
 * @param {string} label UI close route.
 */
async function returned(label){await page.waitForFunction(()=>!!document.pointerLockElement&&JSON.parse(document.querySelector('canvas[data-pointer-mode]').dataset.pointerMode).actual&&!JSON.parse(document.querySelector('canvas[data-pointer-mode]').dataset.pointerMode).pending&&!document.querySelector('dialog[open]')&&document.querySelector('.game-chat')?.dataset.open!=='true',null,{timeout:7000});report.cases.push({label,...await page.evaluate(()=>({locked:!!document.pointerLockElement,mode:JSON.parse(document.querySelector('canvas[data-pointer-mode]').dataset.pointerMode)}))});}

/** Await visible, unowned mouse while the requested screen is open.
 * @param {string} selector Expected semantic screen.
 */
async function opened(selector){await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(()=>!document.pointerLockElement);}

try{
    await page.goto(url);await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready',null,{timeout:120000});
    if(!await page.evaluate(()=>!!document.pointerLockElement))await page.mouse.click(640,400);await returned('initial');
    for(const [key,label,selector]of [['KeyE','inventory','.inventory-dialog[open]'],['KeyL','advancements','#advancements[open]'],['Escape','pause','#game-menu[open]']]){
        await page.keyboard.press(key);await opened(selector);await page.keyboard.press('Escape');await returned(label+' Escape');
    }
    for(const closeKey of ['Escape','Enter']){await page.keyboard.press('KeyT');await opened('.game-chat[data-open=true]');if(closeKey==='Enter')await page.keyboard.type('Hello Vincent!');await page.keyboard.press(closeKey);await returned('chat '+closeKey);}
    await page.keyboard.press('Escape');await opened('#game-menu[open]');await page.getByRole('button',{name:'Options...',exact:true}).click();await opened('#settings[open]');
    for(const name of ['Language...','Music & Sounds...','Player Settings...','Weather Settings...']){
        const choice=page.getByRole('button',{name,exact:true});if(!await choice.count())continue;
        await choice.click();await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
    }
    await page.getByRole('button',{name:'Done',exact:true}).click();await opened('#game-menu[open]');await page.getByRole('button',{name:'Back to Game',exact:true}).click();await returned('settings and Back to Game');
    for(let i=0;i<3;i++){await page.keyboard.press('KeyE');await opened('.inventory-dialog[open]');await page.keyboard.press('Escape');await returned('rapid inventory '+i);}
    for(const kind of ['crafting_table','furnace','blast_furnace','hopper']){
        const state=initialState();state.progress.scenes.plains.stations=[{id:'ui-'+kind,kind,cell:[0,0,4],facing:'south',contents:kind==='crafting_table'?{version:1,data:{grid:Array(9).fill(null)}}:kind==='hopper'?emptyHopper():emptyFurnace()}];
        state.progress.scenes.plains.pose={feet:[.5,0,7.5],yaw:0,pitch:Math.atan2(.5-1.62,3)};
        await page.evaluate(raw=>localStorage.setItem('minecraft-birthday-2026:formal:save',raw),JSON.stringify(await seal(state,'ui-'+kind,0)));
        await page.goto(url);await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready');
        if(!await page.evaluate(()=>!!document.pointerLockElement))await page.mouse.click(640,400);await returned(kind+' entry');
        await page.mouse.click(640,400,{button:'right'});await opened('.inventory-dialog[open]');await page.keyboard.press('Escape');await returned(kind+' close');
    }
    assert.equal(await page.getByRole('button',{name:'Fullscreen game',exact:true}).count(),0);assert.deepEqual(report.errors,[]);report.passed=true;
    await mkdir(resolve(output),{recursive:true});await writeFile(resolve(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({dialogs:await page.locator('dialog[open]').evaluateAll(elements=>elements.map(e=>({id:e.id,class:e.className}))),body:await page.locator('body').innerText(),cases:report.cases}));throw error;}finally{await browser.close();}
