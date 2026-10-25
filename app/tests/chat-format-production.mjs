/** Ordinary root/Pages chat regression with simulated pointer ownership and no screenshots or native mouse capture. */
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {initialState} from '../web/src/domain/state.ts';
import {seal} from '../web/src/persistence/codec.ts';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Runtime paths are explicit; the browser uses disposable context storage. */
const root=resolve(import.meta.dirname,'..'),pw=createRequire(resolve(process.argv[2],'package.json'))('./index.js'),key='minecraft-birthday-2026:formal:save';
/** Serve the audited build for both deployment paths. */
const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname,base=path.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
    let file=path.slice(base.length)||'index.html';if(file.endsWith('/'))file+='index.html';
    const body=await readFile(resolve(root,base==='/'?'dist':'dist-pages',file));
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(file)]??'application/octet-stream');res.end(body);
}catch{res.statusCode=404;res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
try{
    for(const [base,locale] of [['/','en'],['/minecraft-birthday-2026/','zh-CN']]){
        const context=await browser.newContext({viewport:{width:1280,height:800}});
        try{
            await installPointerSimulation(context);
            const state=structuredClone(initialState());state.settings.locale=locale;state.settings.username='Alice';
            await context.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:JSON.stringify(await seal(state,'chat-format',0))});
            const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
            await page.goto('http://127.0.0.1:'+server.address().port+base+'game/');
            await page.waitForFunction(()=>['ready','failed'].includes(document.querySelector('#app')?.dataset.boot),null,{timeout:90000});
            assert.equal(await page.locator('#app').getAttribute('data-boot'),'ready');
            await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages??'[]').some(m=>m.kind==='author'));
            await page.keyboard.press('t');await page.keyboard.insertText('hello   world');await page.keyboard.press('Enter');
            await page.keyboard.press('t');
            const player=await page.locator('.game-chat').evaluate(node=>JSON.parse(node.dataset.messages).findLast(m=>m.kind==='player'));
            assert.equal(player.runs.map(run=>run.text).join(''),'<Alice> hello world');
            await page.keyboard.insertText('/not_a_command');await page.keyboard.press('Enter');await page.keyboard.press('t');
            await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.messages).some(m=>m.runs.some(r=>r.underline)));
            const sample=await page.locator('.game-chat').evaluate(node=>{
                const layout=JSON.parse(node.dataset.layout),messages=JSON.parse(node.dataset.messages),canvas=node.querySelector('canvas'),ctx=canvas.getContext('2d'),ratio=canvas.width/canvas.getBoundingClientRect().width;
                const row=layout.lines.findIndex(line=>line==='<Alice> hello world'),distance=layout.lines.length-1-row;
                const authorRow=layout.lines.findIndex(line=>line.startsWith('<YuanXiQWQ> ')),authorDistance=layout.lines.length-1-authorRow;
                const pixel=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*layout.scale*ratio),Math.floor(y*layout.scale*ratio),1,1).data);
                return{layout,messages,authorRow,authorEdge:pixel(0,layout.base-authorDistance*9-5),playerEdge:pixel(0,layout.base-distance*9-5),systemEdge:pixel(0,layout.base-5),pointerMode:window.__pointerSimulation};
            });
            assert.deepEqual(sample.playerEdge.slice(0,3),[0,0,0]);assert.ok(sample.playerEdge[3]>=127&&sample.playerEdge[3]<=128);
            assert.ok(sample.authorRow>=0);assert.deepEqual(sample.authorEdge,[0,0,0,128]);
            assert.deepEqual(sample.systemEdge,[208,208,208,255]);assert.equal(sample.pointerMode,true);
            assert.ok(sample.messages.some(m=>m.runs.some(r=>r.underline&&r.color==='#FF5555')));
            await page.keyboard.press('Escape');
            for(let i=0;i<24;i++){await page.keyboard.press('t');await page.keyboard.insertText('history '+i);await page.keyboard.press('Enter');}
            await page.keyboard.press('t');await page.mouse.move(120,600);await page.mouse.wheel(0,-100);
            await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.layout).offset===7);
            await page.keyboard.press('PageDown');await page.waitForFunction(()=>JSON.parse(document.querySelector('.game-chat').dataset.layout).offset===0);
            assert.deepEqual(errors,[]);console.log(JSON.stringify({base,locale,pointerMode:'simulated',playerPrefix:true,playerHasNoTag:true,authorHasNoTag:true,systemTag:true,errorStyles:true,scroll:true}));
        }finally{await context.close();}
    }
}finally{await browser.close();server.close();}
