/** Ordinary-build native-input reproduction: mine a previously unknown log, craft the silent root, then earn actual progress. */
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {PerspectiveCamera,Vector3} from 'three';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {WORLD_SCENES} from '../web/src/domain/world-config.ts';

/** Only explicit prior material qualifications are seeded; log and workbench acquisition use real gameplay. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../docs/p9/advancement-chat/evidence'),key='minecraft-birthday-2026:formal:save',before=process.argv.includes('--before'),playwright=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),records=[];
/** Serve exact ordinary build bytes without an application debug or grant route. */
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),base=u.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';let path=u.pathname.slice(base.length);if(path==='seed'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>TEST initial conditions</title>');return;}if(!path||path.endsWith('/'))path+='index.html';const body=await readFile(resolve(root,base==='/'?'dist':'dist-pages',path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end('not found');}});
await mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await playwright.chromium.launch({executablePath:process.argv[3],headless:true});
/** Read the formal stored facts. @param {import('playwright').Page} page Browser. @return {Promise<object>} Progress. */
async function progress(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.progress,key);}
/** Read original displayed message components. @param {import('playwright').Page} page Browser. @return {Promise<object[]>} Actual chat log. */
async function chat(page){return page.locator('.game-chat').evaluate(n=>JSON.parse(n.dataset.messages??'[]'));}
/** Wait on actual saved facts. @param {import('playwright').Page} page Browser. @param {string} id Item or advancement path. @param {boolean} advancement Whether this is a criterion. */
async function saved(page,id,advancement=false){await page.waitForFunction(({key,id,advancement})=>{const p=JSON.parse(localStorage.getItem(key)).state.progress;return advancement?!!p.advancements.criteria['minecraft:'+id]:p.unlocked.includes('minecraft:'+id);},{key,id,advancement},{timeout:15000});}
/** Obtain one bounded directory group on the cursor. @param {import('playwright').Page} page Browser. @param {string} id Native short ID. */
async function source(page,id){await page.locator('.catalogue-search').fill('minecraft:'+id);await page.locator('.inventory-slot[data-kind="source"][data-item="minecraft:'+id+'"]').click();await page.waitForFunction(()=>{const c=document.querySelector('#inventory')?.dataset.cursor;return c&&c!=='null';},{},{timeout:10000});}
/** Wait until ordinary slot actions return the cursor. @param {import('playwright').Page} page Browser. */
async function emptyCursor(page){await page.waitForFunction(()=>document.querySelector('#inventory')?.dataset.cursor==='null',{},{timeout:10000});}
try{
 for(const [label,base] of before?[['root','/']]:[['root','/'],['pages','/minecraft-birthday-2026/']]){
    const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+base+'seed');const state=initialState();state.progress.unlocked=['minecraft:cobblestone','minecraft:stone_pickaxe'];await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw:JSON.stringify(await seal(state,'chat-'+label,0))});
    await page.goto(origin+base+'game/');await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),{},{timeout:60000});assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready');
    const canvas=page.locator('canvas[data-scene]'),bounds=await canvas.boundingBox(),spec=WORLD_SCENES.plains;
    await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{button:'right'});await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-scene]').dataset.pointerMode).actual,{},{timeout:10000});await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{button:'right'});await page.waitForFunction(()=>!JSON.parse(document.querySelector('canvas[data-scene]').dataset.pointerMode).actual,{},{timeout:10000});
    const camera=new PerspectiveCamera(70,bounds.width/bounds.height,.1,512);camera.position.set(...spec.eye);camera.lookAt(...spec.target);camera.updateMatrixWorld();let target;
    for(const node of spec.nodes.filter(n=>n.block==='oak_log')){const point=new Vector3(node.cell[0]+.5,node.cell[1]+.5,node.cell[2]+.5).project(camera),x=bounds.x+(point.x+1)*bounds.width/2,y=bounds.y+(1-point.y)*bounds.height/2;await page.mouse.move(x,y);await page.waitForTimeout(40);const hit=JSON.parse(await canvas.getAttribute('data-hover')??'null');if(hit?.id.startsWith('node:oak_log')){target={x,y,hit};break;}}
    assert.ok(target,'a real native ray must reach an actual log');await page.mouse.down();await saved(page,'oak_log');await page.mouse.up();
    const afterLog=await chat(page),textLog=afterLog.map(m=>m.runs.map(r=>r.text).join(''));assert.equal((await progress(page)).advancements.criteria['minecraft:story/root'],undefined);
    if(before){assert.ok(textLog.includes('First acquired: Oak Log'));await page.keyboard.press('t');await page.screenshot({path:resolve(out,'before-'+label+'.png')});records.push({label,build:await page.locator('#app').getAttribute('data-build'),target,afterLog});await context.close();continue;}
    assert.ok(textLog.every(s=>!s.includes('First acquired:')));assert.ok(textLog.every(s=>!s.includes('has made the advancement')));
    await page.keyboard.press('e');await page.locator('#inventory').waitFor({state:'visible'});await source(page,'oak_log');await page.locator('.inventory-tab[data-tab="crafting"]').click();await page.locator('.inventory-slot[data-kind="crafting"][data-index="0"]').click();await emptyCursor(page);
    await page.locator('.inventory-slot[data-kind="preview"]').click({modifiers:['Shift']});await saved(page,'oak_planks');
    const planks=(await progress(page)).player.data.hotbar.findIndex(s=>s?.id==='minecraft:oak_planks');assert.ok(planks>=0);await page.locator('.inventory-slot[data-kind="hotbar"][data-index="'+planks+'"]').click();
    for(let i=0;i<4;i++){await page.locator('.inventory-slot[data-kind="crafting"][data-index="'+i+'"]').click({button:'right'});await page.waitForTimeout(80);}await emptyCursor(page);
    await page.locator('.inventory-slot[data-kind="preview"]').click({modifiers:['Shift']});await saved(page,'story/root',true);assert.ok((await chat(page)).every(m=>!m.runs.map(r=>r.text).join('').includes('has made the advancement')));
    await page.locator('.inventory-tab[data-tab="catalogue"]').click();await source(page,'cobblestone');assert.ok((await chat(page)).every(m=>!m.runs.map(r=>r.text).join('').includes('Stone Age')));await page.locator('.inventory-slot[data-kind="hotbar"][data-index="2"]').click();await emptyCursor(page);await saved(page,'story/mine_stone',true);
    await source(page,'stone_pickaxe');await page.locator('.inventory-slot[data-kind="hotbar"][data-index="3"]').click();await emptyCursor(page);await saved(page,'story/upgrade_tools',true);
    await source(page,'cobblestone');await page.locator('.inventory-slot[data-kind="hotbar"][data-index="4"]').click();await emptyCursor(page);
    await page.keyboard.press('Escape');await page.locator('#inventory').waitFor({state:'hidden'});await page.keyboard.press('t');await page.waitForTimeout(150);
    const messages=await chat(page),announcements=messages.filter(m=>m.runs.map(r=>r.text).join('').includes('has made the advancement'));
    assert.deepEqual(announcements.map(m=>m.runs.map(r=>r.text).join('')),['sireoh has made the advancement [Stone Age]','sireoh has made the advancement [Getting an Upgrade]']);assert.ok(messages.every(m=>!m.runs.map(r=>r.text).join('').includes('First acquired:')));
    assert.ok(announcements.every(m=>m.kind==='system'&&m.runs.find(r=>r.hover)?.color==='#55FF55'));
    await page.screenshot({path:resolve(out,label+'-chat.png')});
    const layout=JSON.parse(await page.locator('.game-chat').getAttribute('data-layout')),row=layout.lines.findLastIndex(s=>s.includes('Stone Age')),distance=layout.lines.length-1-row,y=bounds.y+(layout.base-distance*9-4)*layout.scale;assert.ok(row>=0);let hover;
    for(let x=5;x<layout.width;x+=4){await page.mouse.move(bounds.x+x*layout.scale,y);hover=JSON.parse(await page.locator('.game-chat').getAttribute('data-hover')??'null');if(hover?.[0]?.text==='Stone Age')break;}
    assert.deepEqual(hover,[{text:'Stone Age',color:'#55FF55'},{text:'Mine Stone with your new Pickaxe',color:'#55FF55'}]);await page.screenshot({path:resolve(out,label+'-hover.png')});
    records.push({label,build:await page.locator('#app').getAttribute('data-build'),target,afterLog,messages,hover,errors,kind:'native browser pointer/keyboard in ordinary audited build; no synthetic DOM events or grant function'});assert.deepEqual(errors,[]);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.dataset.boot==='ready',{},{timeout:60000});assert.ok((await chat(page)).every(m=>!m.runs.map(r=>r.text).join('').includes('has made the advancement')));await context.close();
 }
 await writeFile(resolve(out,before?'before.json':'browser-results.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records.map(r=>({label:r.label,build:r.build,messages:(r.messages??r.afterLog).map(m=>m.runs.map(r=>r.text).join(''))})),null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
