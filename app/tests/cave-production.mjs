/** Real Chromium HTTP-cache upgrade and screenshots against audited root/Pages builds.
 * Run with Node --experimental-transform-types, passing the Playwright package directory and Chrome executable.
 */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {emptyFurnace,inputChanged} from '../web/src/domain/furnace.ts';

/** Test-only origins never read or reset the user's browser profile. */
const root=resolve(import.meta.dirname,'..'), out=resolve(root,'../docs/p9/cave/evidence'),
    playwright=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),
    old=await readFile(resolve(root,'tests/fixtures/world-manifest-before-cave.json')),
    previous=JSON.parse(old),rules=JSON.parse(await readFile(resolve(root,'../data/minecraft/26.3/rules.json'),'utf8'));
let legacy=false;
const requests=[];
/** Serve exact build bytes and deliberately retained old manifest responses with real HTTP caching. */
const server=createServer(async(req,res)=>{
    try {
        const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
        let path=url.pathname.slice(base.length);if(!path||path.endsWith('/'))path+='index.html';
        if(path==='cache-prime'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>TEST old HTTP cache</title>Old cache priming');return;}
        const bytes=legacy&&path==='minecraft/26.3/world-manifest.json'?old:await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');
        res.setHeader('Cache-Control',path.startsWith('minecraft/')?'public, max-age=31536000':'no-cache');
        requests.push({url:req.url,legacy:legacy&&path.endsWith('world-manifest.json'),cacheControl:req.headers['cache-control']??null});res.end(bytes);
    }catch{res.statusCode=404;res.end('not found');}
});
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await playwright.chromium.launch({executablePath:process.argv[3],headless:true});
/** Create an explicit saved-state sample for the ordinary app loader.
 * @param {string} name Controlled initial conditions.
 * @return {Promise<string>} Checksummed valid envelope.
 */
async function saved(name){
    const s=initialState();s.progress.scene='cave';
    const nodes=['stone:0','stone:1','stone:2','stone:3','stone:4','coal_ore:0','coal_ore:1','coal_ore:2','iron_ore:0','iron_ore:1','iron_ore:2','iron_ore:3'];
    if(name==='partial')s.progress.world.visits.cave.removed=nodes.slice(0,6);
    if(name==='empty')s.progress.world.visits.cave.removed=nodes;
    if(name==='devices'||name==='legacy'){
        s.progress.unlocked=['minecraft:furnace','minecraft:oak_log'];
        const contents=emptyFurnace();contents.data.input={id:'minecraft:oak_log',count:3};inputChanged(contents.data,null,'furnace',rules);
        s.progress.scenes.cave.stations=[{id:'cave-saved-device',kind:'furnace',cell:name==='legacy'?[-5,0,1]:[3,0,0],facing:'south',contents}];
    }
    return JSON.stringify(await seal(s,'cave-production-'+name,0));
}
/** Wait for actual loader/HUD readiness, preserving concrete errors in the report.
 * @param {import('playwright').Page} page Browser page.
 * @return {Promise<object>} Actual boot diagnostics and saved facts.
 */
async function status(page){
    await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:20000});
    return page.evaluate(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,app:{...document.querySelector('#app').dataset},canvas:{...document.querySelector('canvas[data-scene]')?.dataset},save:JSON.parse(localStorage.getItem('minecraft-birthday-2026:formal:save'))}));
}
try{
    for(const [label,base] of [['root','/'],['pages','/minecraft-birthday-2026/']]){
        const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
        await context.addInitScript(raw=>{if(!localStorage.getItem('minecraft-birthday-2026:formal:save'))localStorage.setItem('minecraft-birthday-2026:formal:save',raw);},await saved('partial'));
        const page=await context.newPage(),cdp=await context.newCDPSession(page),responses=[];await cdp.send('Network.enable');
        cdp.on('Network.responseReceived',e=>{if(e.response.url.includes('/minecraft/'))responses.push({url:e.response.url,fromDiskCache:e.response.fromDiskCache??false,status:e.response.status});});
        legacy=true;await page.goto(origin+base+'cache-prime');
        // Warm both historical URL forms plus the current key to test no-cache revalidation as well as version separation.
        const build=execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8'}).trim();
        const files=[base+'minecraft/26.3/world-manifest.json',base+'minecraft/26.3/world-manifest.json?build=before-cave',base+'minecraft/26.3/world-manifest.json?build='+build,...previous.entries.map(e=>base+'minecraft/26.3/'+e.entry)];
        await page.evaluate(async urls=>{await Promise.all(urls.map(u=>fetch(u)));await Promise.all(urls.map(u=>fetch(u)));},files);
        const primed=responses.slice();assert.ok(primed.some(r=>r.fromDiskCache&&r.url.includes('world-manifest.json')),'real browser manifest cache was populated');
        legacy=false;const start=requests.length;await page.goto(origin+base+'game/');const upgraded=await status(page);assert.equal(upgraded.app.boot,'ready');assert.equal(upgraded.app.resourceError,undefined);assert.equal(upgraded.app.inventoryReady,'true');assert.equal(upgraded.canvas.renderedScene,'cave');assert.equal(upgraded.save.state.progress.world.visits.cave.removed.length,6);
        await page.reload();const refreshed=await status(page);assert.equal(refreshed.app.boot,'ready');assert.deepEqual(refreshed.save.state.progress.world.visits.cave,upgraded.save.state.progress.world.visits.cave);
        await page.screenshot({path:resolve(out,label+'-cache-upgraded.png')});
        const manifestRequests=requests.slice(start).filter(r=>r.url.includes('world-manifest.json'));assert.ok(manifestRequests.every(r=>r.url.includes('?build=')&&!r.legacy));
        await writeFile(resolve(out,label+'-cache.json'),JSON.stringify({primed,manifestRequests,upgraded,refreshed},null,2));await context.close();
        // Failure injection stays separate from the ordinary upgrade above and does not clear browser data on repair.
        const bad=await browser.newContext({viewport:{width:1280,height:720}});await bad.addInitScript(raw=>{if(!localStorage.getItem('minecraft-birthday-2026:formal:save'))localStorage.setItem('minecraft-birthday-2026:formal:save',raw);},await saved('partial'));
        const failurePage=await bad.newPage();legacy=true;await failurePage.goto(origin+base+'game/');const failure=await status(failurePage);assert.equal(failure.app.boot,'failed');assert.match(failure.app.resourceError,/world-model:wall_torch/);await failurePage.screenshot({path:resolve(out,label+'-old-manifest-failure.png')});
        legacy=false;await failurePage.reload();const repaired=await status(failurePage);assert.equal(repaired.app.boot,'ready');await writeFile(resolve(out,label+'-failure-recovery.json'),JSON.stringify({failure,repaired},null,2));await bad.close();
        console.log(label+' old cache, normal refresh, saved progress and failure recovery passed');
    }
    const screenshots=[];
    for(const size of [{width:1280,height:720},{width:1920,height:1080},{width:390,height:844}])for(const name of ['default','empty','devices']){
        const context=await browser.newContext({viewport:size,deviceScaleFactor:1});await context.addInitScript(raw=>{if(!localStorage.getItem('minecraft-birthday-2026:formal:save'))localStorage.setItem('minecraft-birthday-2026:formal:save',raw);},await saved(name));
        const page=await context.newPage();await page.goto(origin+'/game/');const actual=await status(page);assert.equal(actual.app.boot,'ready');await page.waitForTimeout(11000);
        const file=name+'-'+size.width+'.png';await page.screenshot({path:resolve(out,file)});screenshots.push({file,viewport:actual.viewport,dpr:actual.dpr,build:actual.app.build,setup:name==='default'?'initial empty cave save':'controlled '+name+' saved sample'});
        if(size.width===390&&name==='default'){
            await page.mouse.click(195,422);await page.waitForTimeout(150);await page.mouse.click(195,422,{button:'right'});await page.waitForTimeout(150);
            for(const [label,drags] of [['left',[[300,90]]],['right',[[90,300],[90,300]]]]){
                for(const [from,to] of drags){await page.mouse.move(from,500);await page.mouse.down({button:'right'});await page.mouse.move(to,500,{steps:12});await page.mouse.up({button:'right'});}
                await page.waitForTimeout(200);const file='pan-'+label+'-390.png';await page.screenshot({path:resolve(out,file)});screenshots.push({file,viewport:actual.viewport,dpr:actual.dpr,look:await page.locator('canvas[data-scene]').getAttribute('data-look'),setup:'native right mouse drag'});
            }
        }
        await context.close();console.log(file);
    }
    await writeFile(resolve(out,'screenshots.json'),JSON.stringify(screenshots,null,2));
}finally{await browser.close();server.close();}
