/** Browser interaction and rendering checks use simulated ownership; native OS pointer capture is not exercised. */
import {installPointerSimulation} from './browser-pointer-sim.mjs';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

/** External runtime, browser and URL are explicit so the user's browser profile is never reused. */
const [runtime, executablePath, url, output] = process.argv.slice(2);
const pw = createRequire(resolve(runtime, 'package.json'))('playwright');
const browser = await pw.chromium.launch({executablePath, headless: true});
const context = await browser.newContext({viewport: {width: 1280, height: 800}});
const page = await context.newPage(), errors = [], report = {url,pointerMode:'simulated-no-os-lock'};
await installPointerSimulation(context);
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    window.jumpSamples=[];
    new MutationObserver(()=>{const canvas=document.querySelector('canvas[data-player]');if(canvas)window.jumpSamples.push(JSON.parse(canvas.dataset.player));}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-player']});
    window.keyboardCaptures=[];window.forwardEvents=[];window.worldResizes=[];window.frameSamples=[];
    const keyboard=navigator.keyboard;
    if(keyboard?.lock){const lock=keyboard.lock.bind(keyboard);keyboard.lock=async keys=>{try{await lock(keys);window.keyboardCaptures.push({keys,success:true});}catch(error){window.keyboardCaptures.push({keys,success:false,error:String(error)});throw error;}};}
    window.addEventListener('keydown',event=>{if(event.code==='KeyW')window.forwardEvents.push({ctrl:event.ctrlKey,cancelled:event.defaultPrevented});});
    for(const name of ['width','height']){const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name);Object.defineProperty(HTMLCanvasElement.prototype,name,{...descriptor,set(value){if(this.getAttribute('role')==='img')window.worldResizes.push({at:performance.now(),name,value});descriptor.set.call(this,value);}});}
    /** Sample the actual freshly drawn default framebuffer, retaining a bounded autosave observation window. */
    let sampledFrame='';
    function sample(){const canvas=document.querySelector('canvas[data-pointer-mode]');if(document.querySelector('#app')?.dataset.boot==='ready'&&canvas&&canvas.dataset.frames!==sampledFrame){sampledFrame=canvas.dataset.frames;const gl=canvas.getContext('webgl2'),rgb=new Uint8Array(4);if(gl&&!gl.getParameter(gl.FRAMEBUFFER_BINDING)){gl.readPixels(30,canvas.height-30,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgb);window.frameSamples.push({at:performance.now(),rgb:[...rgb.slice(0,3)],revision:document.querySelector('#app').dataset.revision});if(window.frameSamples.length>120)window.frameSamples.shift();}}}
    const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>raf(time=>{callback(time);sample();});
    window.chatTiming = {ready: null, messages: []};
    new MutationObserver(() => {
        const app = document.querySelector('#app'), chat = document.querySelector('.game-chat');
        if (app?.dataset.boot === 'ready' && window.chatTiming.ready === null) window.chatTiming.ready = performance.now();
        const messages = JSON.parse(chat?.dataset.messages ?? '[]');
        for (let i = window.chatTiming.messages.length; i < messages.length; i++) {
            window.chatTiming.messages.push({...messages[i], observed: performance.now()});
        }
    }).observe(document, {subtree: true, attributes: true, childList: true, attributeFilter: ['data-boot', 'data-messages']});
});

/** Read actual browser ownership and the application's published input mode.
 * @return {Promise<object>} Current document state without changing application internals.
 */
async function state() {
    return page.evaluate(() => ({locked: !!document.pointerLockElement,
        mode: JSON.parse(document.querySelector('canvas[data-pointer-mode]').dataset.pointerMode),
        build: document.querySelector('#app').dataset.build, boot: document.querySelector('#app').dataset.boot}));
}

/** Send the removed shortcut to ensure it cannot release world pointer ownership. */
async function shortcut() {
    await page.keyboard.down('Control');
    await page.mouse.click(640, 400, {button: 'right'});
    await page.keyboard.up('Control');
}

try {
    await page.goto(url);
    await page.waitForFunction(() => ['ready', 'failed'].includes(document.querySelector('#app')?.dataset.boot), null, {timeout: 120000});
    assert.equal((await state()).boot, 'ready');
    assert.equal((await state()).mode.desired, 'hidden');
    if (!(await state()).locked) await page.mouse.click(640, 400);
    await page.waitForFunction(() => !!document.pointerLockElement);
    await shortcut();
    assert.equal((await state()).locked, true);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !document.pointerLockElement && !!document.querySelector('dialog[open]'));
    await shortcut();
    assert.equal((await state()).locked, false);
    assert.equal((await state()).mode.paused, true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !!document.pointerLockElement && !document.querySelector('dialog[open]'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !!document.querySelector('#game-menu[open]'));
    assert.equal(await page.locator('#game-menu button').count(),3);
    assert.equal(await page.getByRole('button', {name: 'Fullscreen game',exact:true}).count(),0);
    await page.getByRole('button',{name:'Back to Game',exact:true}).click();
    await page.waitForFunction(()=>!!document.pointerLockElement);
    await page.keyboard.down('ControlLeft');await page.keyboard.down('KeyW');await page.waitForTimeout(200);
    const jumpStart=await page.evaluate(()=>window.jumpSamples.length);
    await page.keyboard.press('Space');await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');await page.keyboard.up('ControlLeft');
    report.jump=await page.evaluate(i=>window.jumpSamples.slice(i),jumpStart);
    assert.ok(Math.max(...report.jump.map(v=>v.feet[1]))>.5,'quick Ctrl + W + Space did not jump');
    assert.ok(report.jump.some(v=>v.sprinting));
    const before = await page.locator('#app').getAttribute('data-revision');
    await page.waitForFunction(revision => Number(document.querySelector('#app').dataset.revision) >= Number(revision)+4, before);
    report.saves = await page.evaluate(() => ({revision:document.querySelector('#app').dataset.revision, resizes:window.worldResizes, samples:window.frameSamples}));
    const samples=report.saves.samples;
    assert.ok(samples.length>30);
    assert.ok(samples.every(sample => sample.rgb.some(channel => channel>0)), 'black world frame sampled during autosave');
    assert.equal(report.saves.resizes.filter(item => item.at>samples[0].at && item.at<samples.at(-1).at).length,0,'unchanged autosave cleared the world canvas');
    report.cursor = await state();
    await page.waitForFunction(() => window.chatTiming.messages.filter(m => m.kind === 'author').length === 8, null, {timeout: 60000});
    const timing = await page.evaluate(() => window.chatTiming);
    const authors = timing.messages.filter(m => m.kind === 'author');
    report.delays = authors.map((m, i) => m.observed - (i ? authors[i - 1].observed : timing.ready));
    assert.ok(report.delays[0] >= 2900 && report.delays[0] < 5000, JSON.stringify(report.delays));
    for (const delay of report.delays.slice(1)) assert.ok(delay >= 4900 && delay < 7000, JSON.stringify(report.delays));
    assert.ok(timing.messages.find(m => m.kind === 'system').observed < authors[0].observed);
    assert.ok(authors.every(m => m.identity === 'YuanXiQWQ'));
    assert.match(authors.at(-1).runs.map(r => r.text).join(''), /inventory or pause/);
    assert.match(authors.at(-1).runs.map(r=>r.text).join(''),/F11.*:>/);
    assert.ok(!timing.messages.some(m=>m.runs.some(r=>/browser has not locked/.test(r.text))));
    report.timing = timing;
    await page.keyboard.press('KeyT');
    await page.keyboard.type('Hello Vincent!');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => JSON.parse(document.querySelector('.game-chat').dataset.messages).some(m => m.kind === 'player'));
    await page.waitForFunction(() => !!document.pointerLockElement);
    await page.goto(new URL('../', url).href);
    assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
    assert.deepEqual(errors, []);
    report.errors = errors; report.passed = true;
    await mkdir(resolve(output), {recursive: true});
    await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({passed: true, delays: report.delays, cursor: report.cursor, jumpPeak:Math.max(...report.jump.map(v=>v.feet[1])), samples:report.saves.samples.length}));
} catch (error) {
    console.error(JSON.stringify({state: await state().catch(() => null), timing: await page.evaluate(() => window.chatTiming).catch(() => null), errors}));
    throw error;
} finally {
    await browser.close();
}
