/** Exercise real browser rays and right-click transactions against an isolated production save. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';
import {seal} from '../web/src/persistence/codec.ts';
/** Local build, isolated storage key and user-selected browser runtime. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../.test-results/native-farm/browser'),key='minecraft-birthday-2026:formal:save',pw=createRequire(resolve(process.argv[2],'package.json'))('playwright');
await mkdir(out,{recursive:true});
/** Serve only built files on a random loopback port. */
const server=createServer(async(req,res)=>{try{let file=new URL(req.url,'http://localhost').pathname.slice(1);if(!file||file.endsWith('/'))file+='index.html';if(file==='fixture'){res.end('<title>Isolated farm fixture</title>');return;}const bytes=await readFile(resolve(root,'dist',file));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),origin='http://127.0.0.1:'+server.address().port;
try{
    for(const [name,item,feet,target] of [
        ['chicken','wheat_seeds',[4.5,0,-1],[4.5,.35,-3.5]],
        ['cow','wheat',[2.5,0,-2],[2.5,.8,-4.5]],
        ['shovel','iron_shovel',[4.5,0,3],[4.5,.25,.5]],
        ['bucket','bucket',[7,0,1],[8.5,-.1,-1.5]],
        ['place-water','water_bucket',[10.5,0,3],[10.5,-.01,.5]],
        ['hay','campfire',[-7.5,0,-9.5],[-8.5,1,-10.5]],
        ['breed','wheat_seeds',[0,0,6],[5,.5,-4]]
    ]){
        if(process.env.FARM_CASE&&process.env.FARM_CASE!==name)continue;
        const context=await browser.newContext({viewport:{width:1100,height:750}});await installPointerSimulation(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
        const s=initialState(),p=s.progress;p.scene='farm';p.environment.control.frozen=true;p.unlocked.push('minecraft:'+item);p.player.data.hotbar[0]={id:'minecraft:'+item,count:1};const d=target.map((v,i)=>v-feet[i]-(i===1?1.62:0));p.scenes.farm.pose={feet,yaw:Math.atan2(-d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};
        if(name==='breed'){p.environment.control.frozen=false;p.scenes.farm.animalCare=Object.fromEntries(['animal:chicken:0','animal:chicken:1'].map(id=>[id,{loveUntil:600,readyAt:0,grownAt:0,forcedAge:0}]));}
        if(name==='shovel')p.scenes.farm.blocks=[{id:'fire',block:'campfire',cell:[4,0,0],state:{lit:'true',waterlogged:'false',signal_fire:'false',facing:'north'}}];
        await page.goto(origin+'/fixture');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:JSON.stringify(await seal(s,'native-browser-'+name,0))});await page.goto(origin+'/game/');
        await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready',JSON.stringify(errors));
        const canvas=page.locator('canvas[data-scene]'),box=await canvas.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.waitForTimeout(150);const hit=JSON.parse(await canvas.getAttribute('data-hover'));console.log(name,'hover',JSON.stringify(hit));
        if(name==='breed')await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scenes.farm.offspring?.length===1,key,{timeout:30000});
        else await page.mouse.click(x,y,{button:'right',delay:40});await page.waitForTimeout(400);let actual=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress,key);await page.screenshot({path:resolve(out,name+'.png')});
        if(name==='chicken')assert.ok(actual.scenes.farm.animalCare?.['animal:chicken:0']?.loveUntil>0);
        if(name==='cow')assert.ok(actual.scenes.farm.animalCare?.['node:cow:0']?.loveUntil>0);
        if(name==='shovel')assert.equal(actual.scenes.farm.blocks[0].state.lit,'false');
        if(name==='bucket')assert.equal(actual.player.data.hotbar[0]?.id,'minecraft:water_bucket');
        if(name==='place-water'){assert.equal(actual.player.data.hotbar[0]?.id,'minecraft:bucket');assert.ok(actual.scenes.farm.fluids.some(f=>f.level===0));}
        if(name==='hay')assert.equal(actual.scenes.farm.blocks?.[0].state.signal_fire,'true');
        await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready',null,{timeout:90000});actual=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress,key);assert.deepEqual(errors,[]);console.log(name,'passed after reload',actual.player.data.hotbar[0]);await context.close();
    }
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
