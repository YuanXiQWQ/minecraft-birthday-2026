/** Execute isolated native geometry audits without controlling the user's desktop browser. */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
/** Caller-selected test runtime and dedicated verification server. */
const pw=createRequire(resolve(process.argv[2],'package.json'))('playwright'),browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true}),out=resolve(import.meta.dirname,'../../.test-results/farm/evidence');
await mkdir(out,{recursive:true});
try{
    for(const [width,height] of [[1440,900],[1280,720],[390,844]]){
        const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
        await page.addInitScript(()=>Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{value:undefined,configurable:true}));
        await page.goto((process.argv[4]??'http://127.0.0.1:4297')+'/__verify__/farm.html');await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:60000});
        const result=await page.evaluate(()=>window.farmTest.audit());await writeFile(resolve(out,'geometry-'+width+'.json'),JSON.stringify({...result,errors},null,2));
        console.log(width,JSON.stringify(result.cases.map(c=>({name:c.name,walkable:c.walkable,failed:c.rays.filter(r=>!r.result).map(r=>r.id)}))));
        assert.deepEqual(errors,[]);assert.equal(result.passed,true);await page.close();
    }
}finally{await browser.close();}
