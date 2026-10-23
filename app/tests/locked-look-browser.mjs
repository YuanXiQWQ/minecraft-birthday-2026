/** Ordinary-build regression using browser-native mouse/keyboard input, isolated saves and unedited screenshots. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
/** Explicit external browser runtime and target keep this test independent of the user's browser profile. */
const [runtime,executablePath,url,outPath]=process.argv.slice(2),pw=createRequire(resolve(runtime,'package.json'))('playwright'),out=resolve(outPath),browser=await pw.chromium.launch({executablePath,headless:true});
await mkdir(out,{recursive:true});
const context=await browser.newContext({viewport:{width:1280,height:800}}),errors=[],report={url,turns:[],walks:[]};
await context.addInitScript(()=>{
    window.lockRequests=[];window.lockMoves=[];
    const request=Element.prototype.requestPointerLock;
    /** Observe actual browser requests without replacing their result. */
    Element.prototype.requestPointerLock=function(options){window.lockRequests.push(options??null);return request.call(this,options);};
    window.addEventListener('mousemove',e=>{if(document.pointerLockElement)window.lockMoves.push({dx:e.movementX,dy:e.movementY,trusted:e.isTrusted});});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
/** Wait for rendered player diagnostics rather than assuming a fixed browser frame rate.
 * @return {Promise<object>} Real player and input state.
 */
async function state(){return page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const c=document.querySelector('canvas[data-scene]');return{player:JSON.parse(c.dataset.player),mode:JSON.parse(c.dataset.pointerMode),moves:window.lockMoves.slice(),requests:window.lockRequests.slice()};});}
try{
    await page.goto(url);await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot));
    const app=await page.locator('#app').evaluate(e=>({...e.dataset}));assert.equal(app.boot,'ready',app.resourceError);assert.equal(app.inventoryReady,'true');report.app=app;
    await page.mouse.click(640,400);await page.waitForFunction(()=>!!document.pointerLockElement);let x=640,y=400;
    const start=await state();assert.deepEqual(start.requests,[{unadjustedMovement:true}]);
    for(const dx of [30,-30,120,-120]){
        const before=await state();for(let i=0;i<80;i++){x+=dx;await page.mouse.move(x,y);}
        const after=await state(),moves=after.moves.slice(before.moves.length),sum=moves.reduce((a,e)=>a+e.dx,0),expected=before.player.yaw-sum*.003;
        assert.ok(moves.every(e=>e.trusted));assert.ok(Math.abs(after.player.yaw-expected)<1e-8);assert.ok(Math.abs(sum)>2000);report.turns.push({dx,count:moves.length,sum,before:before.player.yaw,after:after.player.yaw,expected});
    }
    for(let i=0;i<4;i++){
        x+=524;await page.mouse.move(x,y);const before=await state();await page.keyboard.down('KeyW');await page.waitForTimeout(350);await page.keyboard.up('KeyW');await page.waitForTimeout(200);const after=await state(),delta=after.player.feet.map((n,j)=>n-before.player.feet[j]),forward=-Math.sin(before.player.yaw)*delta[0]-Math.cos(before.player.yaw)*delta[2];assert.ok(forward>.2,JSON.stringify({before,after,delta,forward}));report.walks.push({before:before.player,after:after.player,forward});
    }
    await page.waitForTimeout(700);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('minecraft-birthday-2026:formal:save')));report.pose=saved.state.progress.scenes.plains.pose;
    await page.screenshot({path:resolve(out,'locked-look.png')});
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement);const paused=await state();await page.mouse.move(x+200,y);assert.equal((await state()).player.yaw,paused.player.yaw);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready');const restored=await state();assert.ok(Math.abs(restored.player.yaw-report.pose.yaw)<1e-8);assert.deepEqual(restored.player.feet,report.pose.feet);report.restored=restored.player;
    await page.mouse.click(640,400);await page.waitForFunction(()=>!!document.pointerLockElement);const resumed=await state();await page.mouse.move(670,400);const turned=await state();assert.ok(Math.abs(turned.player.yaw-resumed.player.yaw+.09)<1e-8);assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
