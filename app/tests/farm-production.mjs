/** Ordinary farm builds and HTTP cache verification; all local browser contexts disable Pointer Lock to protect desktop input. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {FARM_PLOTS} from '../web/src/domain/farm-shape.ts';
import {emptyFurnace,inputChanged} from '../web/src/domain/furnace.ts';

/** Isolated origins and profiles never read the user's game or browser data. */
const root=resolve(process.env.FARM_BUILD_ROOT??resolve(import.meta.dirname,'..')),out=resolve(import.meta.dirname,'../../docs/p9/farm/evidence'),
    pw=createRequire(resolve(process.argv[2],'package.json'))('playwright'),old=await readFile(resolve(root,'tests/fixtures/world-manifest-before-farm.json')),rules=JSON.parse(await readFile(resolve(root,'../data/minecraft/26.3/rules.json'),'utf8'));
let legacy=false;
const requests=[];
/** Serve ordinary build bytes, with long-lived historical resource responses for cache verification. */
const server=createServer(async(req,res)=>{
    try{
        const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
        let path=url.pathname.slice(base.length);if(!path||path.endsWith('/'))path+='index.html';
        if(path==='cache-prime'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Farm cache fixture</title>');return;}
        const bytes=legacy&&path==='minecraft/26.3/world-manifest.json'?old:await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');
        res.setHeader('Cache-Control',path.startsWith('minecraft/')?'public,max-age=31536000':'no-cache');
        requests.push({url:req.url,legacy,cacheControl:req.headers['cache-control']??null});res.end(bytes);
    }catch{res.statusCode=404;res.end('not found');}
});
/** Seal bounded test conditions using the ordinary save codec.
 * @param {string} name Fixture name.
 * @return {Promise<string>} Valid durable envelope.
 */
async function saved(name,aim){
    const s=initialState(),p=s.progress;p.scene='farm';p.environment.control.advanceTime=false;p.environment.control.advanceWeather=false;p.environment.dayTicks=6000;
    if(['mature','mixed'].includes(name)){
        p.unlocked=['minecraft:wheat_seeds'];
        p.scenes.farm.crops=FARM_PLOTS.filter((c,i)=>name==='mature'||i<3).map((cell,i)=>({id:'crop-'+i,item:'minecraft:wheat_seeds',cell,growth:{version:1,data:{ticks:240}}}));
    }
    if(name==='night')p.environment.dayTicks=18000;
    if(name==='dusk')p.environment.dayTicks=12500;
    if(name==='rain'){p.environment.raining=true;p.environment.rainLevel=1;p.environment.rainTime=12000;}
    if(name==='legacy'){
        p.unlocked=['minecraft:furnace','minecraft:oak_log','minecraft:wheat_seeds'];
        p.world.visits.farm.removed=['sugar_cane:1','chicken-egg:0'];
        p.scenes.farm.crops=[{id:'retained-crop',item:'minecraft:wheat_seeds',cell:FARM_PLOTS[5],growth:{version:1,data:{ticks:80}}}];
        p.environment.control.frozen=true;
        p.scenes.farm.stations=[[3,0,-7],[-6,0,-8],[-6,0,-4],[-8,5,-10]].map((cell,i)=>{const contents=emptyFurnace();contents.data.input={id:'minecraft:oak_log',count:3};inputChanged(contents.data,null,'furnace',rules);return{id:'retained-farm-'+i,kind:'furnace',cell,facing:'south',contents};});
    }
    if(aim){
        p.scenes.farm.pose={feet:aim.feet,yaw:aim.yaw+.12,pitch:aim.pitch};
        if(aim.id.startsWith('plot:')){p.unlocked=[...new Set([...p.unlocked,'minecraft:wheat_seeds'])];p.player.data.hotbar[0]={id:'minecraft:wheat_seeds',count:9};}
        if(aim.id==='node:cow:0'){p.unlocked=[...new Set([...p.unlocked,'minecraft:bucket'])];p.player.data.hotbar[0]={id:'minecraft:bucket',count:1};}
    }
    return JSON.stringify(await seal(s,'farm-production-'+name,0));
}
/** Wait for the production app and preserve concrete resource errors.
 * @param {import('playwright').Page} page Current isolated page.
 * @return {Promise<object>} Boot and persistent facts.
 */
async function status(page){
    await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:60000});
    return page.evaluate(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,app:{...document.querySelector('#app').dataset},canvas:{...document.querySelector('canvas[data-scene]')?.dataset},save:JSON.parse(localStorage.getItem('minecraft-birthday-2026:formal:save'))}));
}
/** Compare durable construction and crops independently of the ordinary pose autosave.
 * @param {object} actual Decoded scene.
 * @param {object} expected Expected scene.
 */
function sameFarm(actual,expected){for(const key of ['layoutVersion','stations','blocks','crops'])assert.deepEqual(actual[key],expected[key]);}
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
const screenshots=[],errors=[];
try{
    for(const size of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844}])for(const name of ['empty','mature','mixed','night','rain','legacy']){
        if(process.env.FARM_INPUT_ONLY||process.env.FARM_QUICK&&!(size.width===1440&&name==='empty'))continue;
        const context=await browser.newContext({viewport:size,deviceScaleFactor:1});
        await context.addInitScript(()=>Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{value:undefined,configurable:true}));
        await context.addInitScript(raw=>{if(!localStorage.getItem('minecraft-birthday-2026:formal:save'))localStorage.setItem('minecraft-birthday-2026:formal:save',raw);},await saved(name));
        const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+'/game/');const actual=await status(page);
        assert.equal(actual.app.boot,'ready',JSON.stringify(actual.app));assert.equal(actual.canvas.renderedScene,'farm');assert.equal(actual.app.inventoryReady,'true');
        await page.waitForTimeout(size.width===1440&&name==='empty'?51000:1300);const file=name+'-'+size.width+'.png';await page.screenshot({path:resolve(out,file)});
        screenshots.push({file,viewport:actual.viewport,dpr:actual.dpr,build:actual.app.build,setup:name==='empty'?'empty initial farm, controlled noon clock':name+' controlled valid save',canvas:actual.canvas});
        if(name==='legacy'){
            await page.reload();const refreshed=await status(page);sameFarm(refreshed.save.state.progress.scenes.farm,actual.save.state.progress.scenes.farm);assert.deepEqual(refreshed.save.state.progress.world.visits.farm,actual.save.state.progress.world.visits.farm);
        }
        await context.close();console.log(file);
    }
    if(!process.env.FARM_QUICK&&!process.env.FARM_INPUT_ONLY)for(const [label,base] of [['root','/'],['pages','/minecraft-birthday-2026/']]){
        const context=await browser.newContext({viewport:{width:1280,height:720}});
        await context.addInitScript(()=>Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{value:undefined,configurable:true}));
        await context.addInitScript(raw=>{if(!localStorage.getItem('minecraft-birthday-2026:formal:save'))localStorage.setItem('minecraft-birthday-2026:formal:save',raw);},await saved('legacy'));
        const page=await context.newPage(),cdp=await context.newCDPSession(page),responses=[];await cdp.send('Network.enable');
        cdp.on('Network.responseReceived',e=>{if(e.response.url.includes('/minecraft/'))responses.push({url:e.response.url,cached:e.response.fromDiskCache??false});});
        legacy=true;await page.goto(origin+base+'cache-prime');
        const build=screenshots[0]?.build??execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8'}).trim();
        const manifest=base+'minecraft/26.3/world-manifest.json',files=[manifest,manifest+'?build=before-farm',manifest+'?build='+build,...JSON.parse(old).entries.map(e=>base+'minecraft/26.3/'+e.entry)];
        await page.evaluate(async urls=>{for(let i=0;i<2;i++)await Promise.all(urls.map(u=>fetch(u)));},files);
        assert.ok(responses.some(r=>r.cached&&r.url.includes('world-manifest')));const primed=responses.slice(),start=requests.length;
        legacy=false;await page.goto(origin+base+'game/');const upgraded=await status(page);assert.equal(upgraded.app.boot,'ready');assert.equal(upgraded.app.inventoryReady,'true');assert.equal(upgraded.canvas.renderedScene,'farm');
        await page.reload();const refreshed=await status(page);sameFarm(refreshed.save.state.progress.scenes.farm,upgraded.save.state.progress.scenes.farm);
        await writeFile(resolve(out,label+'-cache.json'),JSON.stringify({primed,requests:requests.slice(start).filter(r=>r.url.includes('world-manifest')),upgraded,refreshed},null,2));
        await page.screenshot({path:resolve(out,label+'-cache.png')});await context.close();console.log(label+' cached upgrade passed');
    }
    if(!process.env.FARM_QUICK){
        const inputs=[];
        for(const width of [1280,390])for(const mode of ['visible']){
            const geometry=JSON.parse(await readFile(resolve(out,'geometry-'+width+'.json'),'utf8'));
            const height=width===390?844:720,context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
            await context.addInitScript(()=>Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{value:undefined,configurable:true}));
            const page=await context.newPage();
            for(const c of geometry.cases)for(const row of c.rays){
                if(c.name==='mixed'||c.name==='mature'&&!row.id.startsWith('crop:')||c.name==='legacy'&&!row.id.startsWith('retained-'))continue;
                if(width===390&&!['node:sugar_cane:0','node:cow:0','plot:-5,0,-6'].includes(row.id))continue;
                const aim=row.result;
                await page.goto(origin+'/cache-prime');await page.evaluate(raw=>{localStorage.clear();localStorage.setItem('minecraft-birthday-2026:formal:save',raw);},await saved(c.name,aim));
                await page.goto(origin+'/game/');await status(page);await page.waitForTimeout(250);
                await page.mouse.move(...aim.pointer);await page.waitForTimeout(100);
                assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
                const point=aim.pointer,canvas=page.locator('canvas[data-scene]');
                const hover=JSON.parse(await canvas.getAttribute('data-hover'));assert.equal(hover?.id,row.id,JSON.stringify({mode,row,hover}));
                const use=row.id.startsWith('plot:')||row.id==='node:cow:0'||row.id.startsWith('retained-');
                await page.mouse.click(...point,{button:use?'right':'left',delay:use?40:150});
                await page.waitForTimeout(350);
                const actual=await status(page),p=actual.save.state.progress;
                if(row.id.startsWith('plot:'))assert.ok(p.scenes.farm.crops.some(c=>'plot:'+c.cell.join(',')===row.id));
                else if(row.id.startsWith('crop:'))assert.equal(p.scenes.farm.crops.length,8);
                else if(row.id==='node:cow:0')assert.ok(p.player.data.hotbar.some(s=>s?.id==='minecraft:milk_bucket'));
                else if(row.id.startsWith('node:'))assert.ok(p.world.visits.farm.removed.includes(row.id.slice(5)));
                else assert.equal(await page.locator('[data-station-id="'+row.id+'"]').count(),1);
                inputs.push({width,mode,id:row.id,pose:aim,hover,actualLock:false,setup:'Pointer Lock disabled in test context; native visible mouse events, controlled saved pose',passed:true});
                if(width===390||row.id.startsWith('retained-'))await page.screenshot({path:resolve(out,'input-'+mode+'-'+width+'-'+row.id.replaceAll(/[^a-zA-Z0-9-]/g,'_')+'.png')});
                await writeFile(resolve(out,'native-input.json'),JSON.stringify(inputs,null,2));console.log('input',width,mode,row.id);
            }
            await context.close();
        }
    }
    assert.deepEqual(errors,[]);if(screenshots.length)await writeFile(resolve(out,'screenshots.json'),JSON.stringify({screenshots,errors},null,2));
}finally{await browser.close();server.close();}
