/** VERIFICATION_ONLY: actual precipitation geometry, shader and original textures at deterministic render ticks. */
import {Group, Mesh, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial, Vector3, WebGLRenderer} from 'three';
import {NativePrecipitation} from '../web/src/render/native-precipitation.ts';
import {loadResources} from '../web/src/render/resources.ts';
import {initialState} from '../web/src/domain/state.ts';
if (import.meta.env.MODE !== 'verification') throw Error('verification-only');
const snow = new URLSearchParams(location.search).has('snow'), pack = await loadResources(true), effect = new NativePrecipitation(pack), eye = new PerspectiveCamera();
eye.position.set(.5,2,.5); effect.update(eye, initialState().progress, new Group(), 0, 1, snow);
const geometry = effect.mesh.geometry.clone(); geometry.setDrawRange(0,6);
const p = geometry.getAttribute('position'), center = new Vector3().fromBufferAttribute(p,0).add(new Vector3().fromBufferAttribute(p,2)).multiplyScalar(.5), side = new Vector3().fromBufferAttribute(p,3).sub(new Vector3().fromBufferAttribute(p,0)).normalize(), normal = side.clone().cross(new Vector3(0,1,0));
const camera = new OrthographicCamera(-.5,.5,2,-2,.1,20); camera.position.copy(center).addScaledVector(normal,4); camera.lookAt(center); camera.updateMatrixWorld();
const scene = new Scene(), mesh = new Mesh(geometry,effect.mesh.material), renderer = new WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(128,256); renderer.setClearColor(0x000000,1); scene.add(mesh);
const title = document.createElement('h1'); title.textContent = snow ? 'TEST ONLY: native snow motion' : 'TEST ONLY: native rain motion'; document.body.append(title, renderer.domElement);
const frames: Uint8ClampedArray[] = [], step = snow ? 4 : .125;
for (let i=0;i<4;i++) {
    (mesh.material as ShaderMaterial).uniforms.tick.value=20+i*step;
    renderer.render(scene,camera);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const context=canvas.getContext('2d')!;context.drawImage(renderer.domElement,0,0);frames.push(context.getImageData(0,0,128,256).data);
    const image=document.createElement('img');image.src=canvas.toDataURL('image/png');image.dataset.tick=String(20+i*step);image.className='raw-frame';document.body.append(image);
}
/** Track rendered texture features in top-origin pixels, independent of the implementation's UV formula.
 * @param {Uint8ClampedArray} before First actual GPU frame.
 * @param {Uint8ClampedArray} after Next actual GPU frame.
 * @return {object} Lowest-error displacement; positive dy means downward on screen.
 */
function displacement(before:Uint8ClampedArray,after:Uint8ClampedArray){
    let best={dx:0,dy:0,error:Infinity};
    for(let dy=-16;dy<=16;dy++)for(let dx=snow?-16:0;dx<=(snow?16:0);dx++){
        let error=0,count=0;
        for(let y=24;y<232;y+=2)for(let x=24;x<104;x+=2){const a=(y*128+x)*4,b=((y+dy)*128+x+dx)*4;error+=(before[a]-after[b])**2;count++;}
        error/=count;if(error<best.error)best={dx,dy,error};
    }
    return best;
}
const result={snow,step,flipY:effect.rain.flipY,positions:Array.from(p.array.slice(0,12)),uv:Array.from(geometry.getAttribute('uv').array.slice(0,8)),motion:Array.from(geometry.getAttribute('motion').array.slice(0,4)),flow:frames.slice(1).map((f,i)=>displacement(frames[i],f)),nonempty:frames.map(f=>f.filter((v,i)=>i%4===0&&v>0).length)};
const output=document.createElement('pre');output.id='rain-motion-evidence';output.textContent=JSON.stringify(result);document.body.append(output);
window.addEventListener('pagehide',()=>{geometry.dispose();effect.dispose();renderer.dispose();renderer.forceContextLoss();},{once:true});
