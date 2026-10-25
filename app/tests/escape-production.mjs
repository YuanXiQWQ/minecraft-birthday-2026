/** Browser screen dismissal regression; native pointer ownership is replaced before navigation. */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Explicit browser runtime and test URL keep this probe usable with development and built pages. */
const pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js');
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
try {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    await installPointerSimulation(context,true);
    const page=await context.newPage(),errors=[],passed=[];
    page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(String(error)));
    // Keep the loaded test document stable when the development server observes unrelated file edits.
    await page.routeWebSocket(/.*/,socket=>socket.close());
    await page.goto(process.argv[4]);
    await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready',null,{timeout:60000});
    await page.mouse.click(600,450);
    /** Wait for world input and simulated hidden ownership after all active screens close.
     * @return {Promise<unknown>} Completed UI gate transition.
     */
    const playing=()=>page.waitForFunction(()=>!document.querySelector('dialog[open]')&&document.querySelector('.game-chat')?.dataset.open==='false'&&!!document.pointerLockElement);
    for(const key of ['KeyT','Slash','KeyE','KeyL']) {
        await page.keyboard.press(key);
        await page.waitForFunction(()=>!!document.querySelector('dialog[open]')||document.querySelector('.game-chat')?.dataset.open==='true');
        if(key==='KeyE')await page.locator('dialog[open] .catalogue-search').fill('cake');
        if(key==='KeyT'||key==='Slash')await page.keyboard.type('unsent');
        await page.keyboard.down('Escape');
        await page.waitForFunction(()=>!document.querySelector('dialog[open]')&&document.querySelector('.game-chat')?.dataset.open==='false');
        // Holding and repeated keydown must not turn closing a UI into opening pause.
        await page.keyboard.down('Escape');
        assert.equal(await page.locator('#game-menu').evaluate(menu=>menu.open),false);
        await page.keyboard.up('Escape');await playing();
        passed.push(key+' closes while held and stays closed after release');
    }
    for(let press=0;press<12;press++) {
        await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#game-menu').open);
        await page.keyboard.down('Escape');
        assert.equal(await page.locator('#game-menu').evaluate(menu=>menu.open),false);
        await page.keyboard.up('Escape');await playing();
    }
    passed.push('12 repeated pause open/close cycles');
    // Emulate browser-reserved Escape with both keyboard events withheld from the page.
    await page.evaluate(()=>window.__pointerSimulationEscape());
    await page.waitForFunction(()=>document.querySelector('#game-menu').open);
    await page.keyboard.up('Escape');assert.equal(await page.locator('#game-menu').evaluate(menu=>menu.open),true);
    await page.keyboard.press('Escape');await playing();
    passed.push('reserved Escape opens on unlock without keyboard events; trailing keyup does not toggle');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Advancements',exact:true}).click();
    await page.keyboard.press('Escape');await playing();
    passed.push('advancements opened from pause close without reopening pause');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Options...',exact:true}).click();
    await page.getByRole('button',{name:'Language...',exact:true}).click();await page.locator('.language-search').fill('English');
    await page.keyboard.press('Escape');assert.equal(await page.locator('.language-search').isVisible(),false);
    assert.equal(await page.locator('#game-menu').evaluate(menu=>menu.open),false);
    await page.keyboard.press('Escape');await playing();
    passed.push('settings subpage closes one level; root closes to world');
    const cdp=await context.newCDPSession(page);
    // CDP evaluation explicitly disables activation; ordinary Playwright evaluate can create it.
    await page.waitForTimeout(5100);
    const inactive=await cdp.send('Runtime.evaluate',{expression:'navigator.userActivation.isActive',returnByValue:true,userGesture:false});
    assert.equal(inactive.result.value,false);
    await cdp.send('Runtime.evaluate',{expression:'window.__pointerSimulationEscape()',userGesture:false});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1400);
    const restricted=await cdp.send('Runtime.evaluate',{expression:'({menu:document.querySelector("#game-menu").open,active:navigator.userActivation.isActive,locked:!!document.pointerLockElement})',returnByValue:true,userGesture:false});
    assert.deepEqual(restricted.result.value,{menu:false,active:false,locked:false},'Escape closes the menu without creating browser activation');
    await page.keyboard.down('KeyW');await playing();await page.keyboard.up('KeyW');
    passed.push('expired activation resumes on real movement input after native Escape cooldown');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pointerMode:'simulated'}));
} finally {await browser.close();}
