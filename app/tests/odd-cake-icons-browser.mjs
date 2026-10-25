/** Compare actual rendered cake item sprites without persisting screenshots or acquiring native Pointer Lock. */
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {installPointerSimulation} from './browser-pointer-sim.mjs';

/** Isolated development renderer and test browser use the production icon loader. */
const root=resolve(import.meta.dirname,'..'),pw=createRequire(resolve(process.argv[2],'package.json'))('playwright'),server=await createServer({configFile:resolve(root,'vite.config.ts'),server:{port:0,strictPort:false},logLevel:'error'});
await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port,browser=await pw.chromium.launch({executablePath:process.argv[3],headless:true});
try{
    const context=await browser.newContext();await installPointerSimulation(context);const page=await context.newPage();
    await page.goto(origin+'/minecraft/26.3/easter-egg-manifest.json');
    const result=await page.evaluate(async()=>{
        const {loadCatalogueArt}=await import('/src/ui/icons.ts'),art=await loadCatalogueArt();
        try{
            const normal=art.icons.get('minecraft:cake'),odd=art.icons.get('jerrys_farm:upside_down_cake'),a=normal.getContext('2d').getImageData(0,0,256,256).data,b=odd.getContext('2d').getImageData(0,0,256,256).data;
            let mismatch=0,visible=0;for(let pixel=0;pixel<256*256;pixel++){if(b[pixel*4+3])visible++;for(let c=0;c<4;c++)if(Math.abs(a[(256*256-1-pixel)*4+c]-b[pixel*4+c])>2)mismatch++;}
            return {kind:art.kinds.get('jerrys_farm:upside_down_cake'),route:art.coverage.find(c=>c.id==='jerrys_farm:upside_down_cake').route,mismatch,visible};
        }finally{art.dispose();}
    });
    assert.equal(result.kind,'sprite');assert.equal(result.route,'native-generated');assert.ok(result.visible>0);assert.equal(result.mismatch,0);
    console.log(JSON.stringify({pointer:'simulated',...result}));
}finally{await browser.close();await server.close();}
