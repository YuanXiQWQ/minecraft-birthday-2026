/** Native precipitation endpoints use the opposite height for V, with top-origin original texture storage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, PerspectiveCamera, ShaderMaterial} from 'three';
import {initialState} from '../web/src/domain/state.ts';
import {NativePrecipitation} from '../web/src/render/native-precipitation.ts';

/** Supply only original texture ownership; production builds the complete real column geometry.
 * @return {NativePrecipitation} Actual precipitation implementation without a WebGL context.
 */
function precipitation(): NativePrecipitation {
    return new NativePrecipitation({guiImages:new Map(['rain','snow'].map(name=>['assets/minecraft/textures/environment/'+name+'.png',{width:64,height:64}]))} as any);
}

for (const snow of [false,true]) test((snow?'snow':'rain')+' binds native bottom V to top vertices and top V to bottom vertices',()=>{
    const effect=precipitation(),camera=new PerspectiveCamera(),scenery=new Group(),roof=new Group(); camera.position.set(.5,2,.5); roof.userData.cells=[[-4,6,-5],[1,5,0]];scenery.add(roof);
    try {
        effect.update(camera,initialState().progress,scenery,20.125,1,snow);
        const geometry=effect.mesh.geometry,p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
        let clipped=false,negative=false;
        for(let i=0;i<p.count;i+=4){
            const bottom=p.getY(i),top=p.getY(i+1);
            assert.equal(uv.getY(i),top*.25); assert.equal(uv.getY(i+1),bottom*.25);
            assert.equal(uv.getY(i+2),bottom*.25); assert.equal(uv.getY(i+3),top*.25);
            assert.equal((uv.getY(i+1)-uv.getY(i))/(top-bottom),-.25);
            clipped ||= bottom>=6; negative ||= p.getX(i)<0 && p.getZ(i)<0;
        }
        assert.equal(clipped,true);assert.equal(negative,true);
        assert.equal(effect.rain.flipY,false);assert.equal(effect.snow.flipY,false);
        effect.update(camera,initialState().progress,scenery,20.25,1,snow);
        assert.equal(effect.mesh.geometry,geometry);assert.equal((effect.mesh.material as ShaderMaterial).uniforms.tick.value,20.25);
        assert.equal((effect.mesh.material as ShaderMaterial).uniforms.map.value,snow?effect.snow:effect.rain);
    } finally {effect.dispose();}
});
