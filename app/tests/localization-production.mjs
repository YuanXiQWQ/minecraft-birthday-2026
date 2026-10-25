/** Real Chromium input verifies language changes, saved progress, native glyphs and both production paths. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {initialBook} from '../web/src/domain/recipe-book.ts';
import {seal} from '../web/src/persistence/codec.ts';

/** Isolated origin and browser profile keep the user's actual save untouched. */
const root = resolve(import.meta.dirname, '..'), out = resolve(root, process.argv[4] ?? '../.test-results/localization/evidence'),
    key = 'minecraft-birthday-2026:formal:save',
    pw = createRequire(resolve(process.argv[2], 'package.json'))('./index.js'),
    oldStartup = await readFile(resolve(root, 'tests/fixtures/startup-manifest-before-localization.json')),
    oldExperience = process.argv.includes('--language-style') ? await readFile(resolve(root, 'tests/fixtures/experience-manifest-before-font-style.json')) : null,
    records = [], requests = [];
let legacy = false;
/** Serve exact production bytes and allow the previous startup manifest to be cached before upgrade. */
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost'), base = url.pathname.startsWith('/minecraft-birthday-2026/') ? '/minecraft-birthday-2026/' : '/';
        let path = url.pathname.slice(base.length);
        if (path === 'cache-prime') {res.setHeader('Content-Type', 'text/html'); res.end('<title>Cache fixture</title>'); return;}
        if (!path || path.endsWith('/')) path += 'index.html';
        const body = legacy && path === 'minecraft/26.3/startup-manifest.json' ? oldStartup : legacy && oldExperience && path === 'minecraft/26.3/experience-manifest.json' ? oldExperience : await readFile(resolve(root, base === '/' ? 'dist' : 'dist-pages', path));
        res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', path.startsWith('minecraft/') ? 'public, max-age=31536000' : 'no-cache');
        requests.push({url:req.url, legacy, revalidate:req.headers['cache-control']});
        res.end(body);
    } catch {res.statusCode = 404; res.end('not found');}
});

/** Seed only an isolated, valid existing English save to verify language changes preserve its facts.
 * @return {Promise<string>} Sealed application envelope.
 */
async function fixture() {
    const s = structuredClone(initialState());
    s.progress.scene = 'home'; s.progress.cakePlacement = {scene:'home',table:'birthday-table'};
    s.progress.unlocked = ['minecraft:oak_log','minecraft:oak_planks','minecraft:cobblestone','minecraft:iron_pickaxe','minecraft:cake'];
    s.progress.player.data.hotbar[0] = {id:'minecraft:cobblestone',count:32};
    s.progress.player.data.hotbar[1] = {id:'minecraft:iron_pickaxe',count:1};
    s.progress.recipeBook = initialBook(s.progress.unlocked);
    s.progress.recipeBook.data.views.crafting.open = true;
    return JSON.stringify(await seal(s, 'localization-fixture', 0));
}

/** Await real assets and, for game entry, the world and HUD first frame.
 * @param {import('playwright').Page} page Isolated browser tab.
 * @param {boolean} game Whether world readiness is required.
 * @return {Promise<void>} Usable application.
 */
async function ready(page, game = false) {
    try{await page.waitForFunction(game => {
        const root = document.querySelector('#app');
        return root?.dataset.resources === 'failed' || root?.dataset.resources === '26.3' && (!game || root.dataset.boot === 'ready');
    }, game, {timeout:60000});}
    catch(error){console.error('readiness-timeout',await page.evaluate(()=>({url:location.href,hidden:document.hidden,root:document.querySelector('#app')?.dataset,loading:document.querySelector('[data-loading]')?.dataset})));throw error;}
    assert.equal(await page.locator('#app').getAttribute('data-resource-error'), null);
    if (game) assert.equal(await page.locator('#app').getAttribute('data-inventory-ready'), 'true');
}

/** Read durable facts without mutating them through the browser runtime.
 * @param {import('playwright').Page} page Isolated browser tab.
 * @return {Promise<object>} Current saved state.
 */
async function state(page) {return page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key);}

/** Choose an actual language row through its semantic button.
 * @param {import('playwright').Page} page Isolated browser tab.
 * @param {string} locale Supported saved identifier.
 * @return {Promise<void>} Committed language and rendered document language.
 */
async function choose(page, locale) {
    await page.locator('.native-language-row[data-locale="' + locale + '"]').click();
    await page.waitForFunction(({key, locale}) => JSON.parse(localStorage.getItem(key)).state.settings.locale === locale && document.documentElement.lang === locale, {key, locale});
}

/** Compare opaque text texels with the actual browser screenshot, detecting compositor blur after canvas painting.
 * @param {import('playwright').Page} page Ordinary production page.
 * @param {string} selector Visible text-bearing canvas.
 * @param {string} label Evidence identity.
 * @param {object} options Optional native header region or chat-editor exclusion.
 * @return {Promise<void>} Exact foreground comparison recorded for this surface.
 */
async function crisp(page,selector,label,options={}) {
    if(!process.argv.includes('--text-raster'))return;
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const png=(await page.screenshot()).toString('base64');
    const result=await page.evaluate(async({png,selector,options})=>{
        const source=document.querySelector(selector),r=source.getBoundingClientRect(),dpr=devicePixelRatio,
            bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'})),
            screen=document.createElement('canvas');screen.width=bitmap.width;screen.height=bitmap.height;screen.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
        if(!r.width||!r.height)throw Error('text-surface-not-visible:'+selector);
        const raw=source.getContext('2d').getImageData(0,0,source.width,source.height).data,shot=screen.getContext('2d').getImageData(0,0,screen.width,screen.height).data,
            left=Math.round(r.left*dpr),top=Math.round(r.top*dpr),density=Number(document.querySelector('#inventory')?.dataset.guiScale??1)*dpr;
        const pixels=[];
        for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
            if(options.header&&y>14*density||options.chat&&y>source.height-50*dpr||options.book&&(y<14*density||y>26*density||x<27*density||x>105*density))continue;
            if(options.slider&&(y<5*source.height/20||y>15*source.height/20||x<source.width*.25||x>source.width*.75))continue;
            const at=(y*source.width+x)*4,red=raw[at],green=raw[at+1],blue=raw[at+2];
            if(raw[at+3]!==255||red!==green||red!==blue||(options.header?red!==64:options.slider?red!==255:red<160))continue;
            pixels.push({x,y,red,green,blue});
        }
        const offsets=[];
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            let checked=0,mismatched=0,maxDelta=0;const samples=[];
            for(const {x,y,red,green,blue} of pixels){
                const sx=left+x+dx,sy=top+y+dy;if(sx<0||sy<0||sx>=screen.width||sy>=screen.height)continue;
                const target=(sy*screen.width+sx)*4,delta=Math.max(Math.abs(red-shot[target]),Math.abs(green-shot[target+1]),Math.abs(blue-shot[target+2]));
                checked++;maxDelta=Math.max(maxDelta,delta);if(delta>1){mismatched++;if(samples.length<8)samples.push({x,y,source:[red,green,blue],actual:[shot[target],shot[target+1],shot[target+2]]});}
            }
            offsets.push({translation:[dx,dy],checked,mismatched,maxDelta,samples});
        }
        const nominalMismatched=offsets[4].mismatched;
        offsets.sort((a,b)=>a.mismatched-b.mismatched||Math.abs(a.translation[0])+Math.abs(a.translation[1])-Math.abs(b.translation[0])-Math.abs(b.translation[1]));
        return{dpr,widthRatio:source.width/(r.width*dpr),heightRatio:source.height/(r.height*dpr),origin:[r.left*dpr,r.top*dpr],nominalMismatched,...offsets[0]};
    },{png,selector,options});
    if(result.mismatched)await page.screenshot({path:resolve(out,label+'-failed.png')});
    records.push({label,...result});await writeFile(resolve(out,'raster-checks.json'),JSON.stringify(records.filter(v=>v.checked!==undefined),null,2)+'\n');assert.ok(result.checked>10,label+' has real glyph pixels');
    assert.equal(result.mismatched,0,label+' actual screenshot must preserve opaque text pixels');
}

await mkdir(out, {recursive:true}); await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser = await pw.chromium.launch({executablePath:process.argv[3], headless:true});
try {
    const cases=process.argv.includes('--text-raster')?[['root','/',1],['pages','/minecraft-birthday-2026/',1.25],['root-150','/',1.5],['pages-200','/minecraft-birthday-2026/',2]]:[['root','/'],['pages','/minecraft-birthday-2026/']];
    for (const [label, base, density] of cases) {
        if(process.argv.some(value=>value.startsWith('--case='))&&!process.argv.includes('--case='+label))continue;
        if(label!=='root'){await browser.close();browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});}
        const context = await browser.newContext({viewport:{width:process.argv.includes('--text-raster')?691:1280,height:800},deviceScaleFactor:density??(process.argv.includes('--language-style')&&label==='pages'?1.25:1)}), errors = [];
        await context.addInitScript(({key, raw}) => {if (!localStorage.getItem(key)) localStorage.setItem(key, raw);}, {key, raw:await fixture()});
        const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
        await page.goto(origin + base); await ready(page); const before = await state(page);
        await crisp(page,'.copy h1 canvas',label+'-home-title');await crisp(page,'.copy .story canvas',label+'-home-story');
        await page.getByRole('button', {name:'Settings', exact:true}).click();
        await page.getByRole('button', {name:'Language...', exact:true}).click();
        await page.locator('.language-search').fill('中文');
        assert.equal(await page.locator('[data-locale="en"]').isVisible(), false);
        await choose(page, 'zh-CN');
        assert.match(await page.locator('h1').textContent(), /生日快乐/);
        assert.equal(await page.locator('[data-locale="zh-CN"]').getAttribute('aria-selected'), 'true');
        assert.deepEqual((await state(page)).progress, before.progress);
        await page.locator('.language-search').fill('');
        await crisp(page,'.language-accuracy canvas',label+'-footer');
        await crisp(page,'[data-locale="zh-CN"] canvas',label+'-language');
        await crisp(page,'#settings .native-screen-plane>button:last-child>canvas:not(.button-sprite)',label+'-button');
        if (process.argv.includes('--language-style')) {
            await page.locator('[data-locale="zh-CN"]').focus(); await page.locator('[data-locale="en"]').hover();
            const style=await page.evaluate(()=>{
                const dialog=document.querySelector('#settings'),layout=JSON.parse(dialog.dataset.layout),row=document.querySelector('[data-locale="zh-CN"]'),other=document.querySelector('[data-locale="en"]'),
                    selected=getComputedStyle(row),unselected=getComputedStyle(other),warning=document.querySelector('.language-accuracy').getBoundingClientRect(),done=document.querySelector('#settings .native-screen-plane>button:last-child').getBoundingClientRect(),
                    canvas=row.querySelector('canvas'),r=row.getBoundingClientRect(),top=dialog.getBoundingClientRect().top;
                return{layout,row:{width:r.width,height:r.height},selected:{background:selected.backgroundColor,shadow:selected.boxShadow},unselected:{background:unselected.backgroundColor,shadow:unselected.boxShadow,marginTop:unselected.marginTop},warningY:(warning.top-top)/layout.scale,doneY:(done.top-top)/layout.scale,fontRatio:canvas.width/(canvas.getBoundingClientRect().width*devicePixelRatio),textWidth:canvas.getBoundingClientRect().width,textLeftOffset:canvas.getBoundingClientRect().left-r.left,copyVisible:getComputedStyle(document.querySelector('.copy')).visibility};
            });
            assert.ok(Math.abs(style.row.width-270*style.layout.scale)<.05);assert.ok(Math.abs(style.row.height-18*style.layout.scale)<.05);
            assert.equal(style.unselected.background,'rgba(0, 0, 0, 0)');assert.equal(style.unselected.shadow,'none');assert.equal(style.unselected.marginTop,'0px');
            assert.equal(style.selected.background,'rgb(0, 0, 0)');assert.match(style.selected.shadow,/255, 255, 255/);
            assert.ok(Math.abs(style.warningY-(style.layout.height-45))<.01);assert.ok(Math.abs(style.doneY-(style.layout.height-28))<.01);
            assert.ok(Math.abs(style.fontRatio-1)<.01);assert.equal(style.copyVisible,'hidden');records.push({label:label+'-style',...style});
            assert.ok(Math.abs(style.textWidth-style.row.width)<.05);assert.equal(style.textLeftOffset,0);
        }
        await page.screenshot({path:resolve(out, label + '-languages.png')});
        await page.locator('#settings').getByRole('button', {name:'完成', exact:true}).click();
        await page.locator('#settings').getByRole('button', {name:'完成', exact:true}).click();
        await page.screenshot({path:resolve(out, label + '-home.png')});
        await page.reload(); await ready(page); assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
        const sibling = await context.newPage(); await sibling.goto(origin + base); await ready(sibling);
        await page.getByRole('button', {name:'设置', exact:true}).click();
        await page.getByRole('button', {name:'语言…', exact:true}).click(); await choose(page, 'en');
        await sibling.waitForFunction(() => document.documentElement.lang === 'en');
        await choose(page, 'zh-CN'); await sibling.waitForFunction(() => document.documentElement.lang === 'zh-CN'); await sibling.close();await page.bringToFront();
        const build = await page.locator('#app').getAttribute('data-build'), cdp = await context.newCDPSession(page), responses = [];
        await cdp.send('Network.enable'); cdp.on('Network.responseReceived', e => {if (e.response.url.includes('startup-manifest.json')) responses.push({url:e.response.url,disk:e.response.fromDiskCache ?? false});});
        await page.goto(origin + base + 'cache-prime'); legacy = true; const primeStart = requests.length;
        await page.evaluate(async urls => {for(const url of urls){await fetch(url,{cache:'reload'});await fetch(url);}}, [base + 'minecraft/26.3/startup-manifest.json?build=' + build,...(oldExperience?[base+'minecraft/26.3/experience-manifest.json?build='+build]:[])]); legacy = false;
        assert.equal(requests.slice(primeStart).filter(r => r.legacy && r.url.includes('startup-manifest.json')).length, 1);
        const start = requests.length;
        await page.goto(origin + base + 'game/'); await ready(page, true);
        assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
        assert.deepEqual((await state(page)).progress.player, before.progress.player);
        assert.equal((await state(page)).progress.cakePlacement.table, 'birthday-table');
        assert.match(await page.locator('.birthday-message').textContent(), /生日快乐/);
        assert.equal(await page.locator('.birthday-celebration').getAttribute('data-playing'), 'false');
        const loadingFont = requests.slice(start).find(r => r.url.includes('project_unifont.json'));
        assert.ok(loadingFont); assert.ok(requests.slice(start).some(r => r.url.includes('startup-manifest.json?build=') && !r.legacy));
        if(oldExperience)assert.ok(requests.slice(start).some(r=>r.url.includes('font/include/unifont.json')));
        await page.keyboard.press('e'); await page.locator('#inventory').waitFor({state:'visible'});
        await page.locator('.catalogue-search').fill('圆石');
        assert.equal(await page.locator('.inventory-slot[data-kind="source"][data-item="minecraft:cobblestone"]').getAttribute('aria-label'), '圆石');
        await page.locator('.inventory-slot[data-kind="source"][data-item="minecraft:cobblestone"]').hover();
        await page.screenshot({path:resolve(out, label + '-items.png')});
        await crisp(page,'.item-tooltip canvas',label+'-tooltip');
        await crisp(page,'.inventory-panel>canvas',label+'-inventory-header',{header:true});
        await page.locator('.inventory-tab[data-tab="crafting"]').click(); await page.locator('.recipe-book-search').fill('木板');
        assert.ok(await page.locator('.recipe-book-hit[aria-label*="橡木木板"]').count());
        await page.screenshot({path:resolve(out, label + '-recipes.png')});
        if(process.argv.includes('--text-raster'))await page.keyboard.press('Tab');
        await crisp(page,'.recipe-book>canvas',label+'-recipe-search',{book:true});
        await page.keyboard.press('Escape'); await page.locator('#inventory').waitFor({state:'hidden'});
        if(process.argv.includes('--text-raster')){
            const edge=await page.locator('.navigation-edge').boundingBox();
            if(edge)await page.mouse.move(edge.x+edge.width/2,edge.y+edge.height/2);
            await page.locator('.world-navigation[data-expanded="true"]').waitFor();
            await page.locator('.world-navigation [data-scene="plains"]').click();
            await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.progress.scene==='plains',key);
        }
        await page.locator('canvas[data-scene]').click();
        await page.keyboard.press('Slash'); await page.locator('.game-chat input').fill('/weather clear'); await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('.game-chat')?.textContent.includes('天气已设为晴天'));
        await page.keyboard.press('t'); await page.screenshot({path:resolve(out, label + '-chat.png')});await crisp(page,'.game-chat>canvas',label+'-chat',{chat:true}); await page.keyboard.press('Escape');
        await page.keyboard.press('Escape'); await page.getByRole('button', {name:'选项…',exact:true}).click();
        await page.getByRole('button', {name:'音乐和声音…',exact:true}).click();
        assert.match(await page.locator('input[type=range]').first().getAttribute('aria-label'), /主音量/);
        await page.screenshot({path:resolve(out, label + '-sound.png')});
        await crisp(page,'.native-slider>canvas',label+'-slider',{slider:true});
        await page.setViewportSize({width:390,height:844});
        await page.screenshot({path:resolve(out, label + '-sound-narrow.png')});
        await page.locator('#settings').getByRole('button', {name:'完成',exact:true}).click();
        await page.getByRole('button', {name:'语言…',exact:true}).click();
        await page.screenshot({path:resolve(out, label + '-language-narrow.png')});
        await page.locator('#settings').getByRole('button', {name:'完成',exact:true}).click();
        await page.getByRole('button', {name:'重置进度…',exact:true}).click();
        await page.screenshot({path:resolve(out, label + '-reset-narrow.png')});
        await page.getByRole('button', {name:'确定，重置进度',exact:true}).click();
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.progress.cakePlacement === null, key);
        assert.equal((await state(page)).settings.locale, 'zh-CN');
        assert.equal(await page.locator('#settings').isVisible(), false);
        assert.deepEqual(errors, []); records.push({label, cacheUpgrade:true, responses, manifestRequests:requests.slice(start).filter(r => r.url.includes('manifest.json')), language:'zh-CN', progressPreserved:true, crossTab:true, errors});
        await context.close(); console.log(label + ' localization passed');
    }
    const failureContext = await browser.newContext({viewport:{width:1280,height:800}}), failurePage = await failureContext.newPage();
    await failurePage.goto(origin + '/'); await ready(failurePage);
    await failurePage.getByRole('button', {name:'Settings',exact:true}).click();
    await failurePage.getByRole('button', {name:'Language...',exact:true}).click();
    await failurePage.evaluate(() => {Storage.prototype.setItem = () => {throw Error('isolated-write-failure');};});
    await failurePage.locator('[data-locale="zh-CN"]').click();
    await failurePage.locator('#preference-feedback').filter({hasText:'This setting could not be saved.'}).waitFor();
    assert.equal(await failurePage.locator('html').getAttribute('lang'), 'en');
    assert.equal((await state(failurePage)).settings.locale, 'en');
    assert.equal(await failurePage.locator('[data-locale="en"]').getAttribute('aria-selected'), 'true');
    await failurePage.screenshot({path:resolve(out, 'failed-write.png')});
    records.push({label:'failed-write', language:'en', saveUnchanged:true, selectedLanguageRestored:true}); await failureContext.close();
    await writeFile(resolve(out, 'browser-results.json'), JSON.stringify(records, null, 2) + '\n');
} finally {await browser.close(); server.close();}
