/** Physical-pixel raster dimensions and placement guard against compositor resampling. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {alignRaster,rasterSize} from '../web/src/ui/raster.ts';

test('125-percent measurement noise cannot turn a 24-pixel text surface into 25 pixels',()=>{
    assert.equal(rasterSize(12,2.000000035),24);
    assert.equal(rasterSize(432,2.000000035),864);
    assert.equal(rasterSize(691,1.25),864);
});

test('all common display densities use the nearest physical size on both axes',()=>{
    for(const density of [1,1.1,1.25,1.5,1.75,2,2.5])for(const dimension of [9,12,147,195,691])
        assert.ok(Math.abs(rasterSize(dimension,density)-dimension*density)<=.5);
});

test('GUI raster fitting snaps significant offsets without replacing the existing centering transform',()=>{
    const previousStyle=globalThis.getComputedStyle,descriptor=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
    const style={translate:'',transform:'translateX(-50%)',width:'100px',height:'24px'},
        canvas={isConnected:true,width:125,height:30,style,getBoundingClientRect(){const [x=0,y=0]=style.translate==='none'?[0,0]:style.translate.split(' ').map(parseFloat);return{left:10.2+x,top:20.3+y,width:100,height:24};}};
    globalThis.getComputedStyle=(()=>style) as unknown as typeof getComputedStyle;
    Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1.25});
    try{alignRaster(canvas as unknown as HTMLCanvasElement,true);const r=canvas.getBoundingClientRect();assert.ok(Math.abs(r.left*1.25-Math.round(r.left*1.25))<1e-6);assert.ok(Math.abs(r.top*1.25-Math.round(r.top*1.25))<1e-6);assert.equal(style.transform,'translateX(-50%)');}
    finally{globalThis.getComputedStyle=previousStyle;if(descriptor)Object.defineProperty(globalThis,'devicePixelRatio',descriptor);else delete (globalThis as {devicePixelRatio?:number}).devicePixelRatio;}
});

test('CSS layout quantization does not create an extra transformed sampling phase',()=>{
    const previousStyle=globalThis.getComputedStyle,descriptor=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio'),
        style={translate:'',width:'432px',height:'19.1875px'},canvas={isConnected:true,width:540,height:24,style,getBoundingClientRect(){return{left:129.59375,top:97.578125,width:432,height:19.1875};}};
    globalThis.getComputedStyle=(()=>style) as unknown as typeof getComputedStyle;
    Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1.25});
    try{alignRaster(canvas as unknown as HTMLCanvasElement,true);assert.equal(style.translate,'none');}
    finally{globalThis.getComputedStyle=previousStyle;if(descriptor)Object.defineProperty(globalThis,'devicePixelRatio',descriptor);else delete (globalThis as {devicePixelRatio?:number}).devicePixelRatio;}
});
