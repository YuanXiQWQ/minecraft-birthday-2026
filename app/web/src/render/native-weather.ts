/** Native weather presentation uses authored heightmaps, Java random branches and the original lightning geometry. */
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,ShaderMaterial,DoubleSide,AdditiveBlending} from 'three';
import {NativeRandom} from '../domain/environment.ts';
import type {SoundOptions} from './world-audio.ts';

/** Java 26.3 Options simulationDistance default bounds the sky-only weather projection. */
export const WEATHER_DISTANCE=12;

/** Read Java nextLong's low 48 seed bits without losing precision in a JavaScript double.
 * @param {NativeRandom} random Native LCG owner.
 * @return {number} Seed bits accepted by the Java LCG constructor.
 */
function seedLong(random:NativeRandom):number{return Number(((BigInt(random.next(32)|0)<<32n)+BigInt(random.next(32)|0))&((1n<<48n)-1n));}
/** Reproduce LightningBoltRenderer's four layers, eight main segments and two three-segment branches.
 * @param {number} seed Native entity render seed.
 * @return {BufferGeometry} Triangle representation of the native colored quads.
 */
export function lightningGeometry(seed:number):BufferGeometry{
 const xs:number[]=[],zs:number[]=[],initial=new NativeRandom(seed);let x=0,z=0;for(let i=7;i>=0;i--){xs[i]=x;zs[i]=z;x+=initial.integer(-5,5);z+=initial.integer(-5,5);}
 const vertices:number[]=[];
 /** Emit one native lightning quad as two triangles.
  * @param {number} x1 Lower segment X.
  * @param {number} z1 Lower segment Z.
  * @param {number} x2 Upper segment X.
  * @param {number} z2 Upper segment Z.
  * @param {number} y Segment index.
  * @param {number} upper Upper half-width.
  * @param {number} lower Lower half-width.
  * @param {number[]} signs Native corner signs.
  */
 function quad(x1:number,z1:number,x2:number,z2:number,y:number,upper:number,lower:number,signs:number[]):void{const [a,b,c,d]=signs,points=[[x1+a*lower,y*16,z1+b*lower],[x2+a*upper,(y+1)*16,z2+b*upper],[x2+c*upper,(y+1)*16,z2+d*upper],[x1+c*lower,y*16,z1+d*lower]];for(const i of [0,1,2,0,2,3])vertices.push(...points[i]);}
 for(let layer=0;layer<4;layer++){const random=new NativeRandom(seed);for(let branch=0;branch<3;branch++){const main=branch===0,top=main?7:7-branch,bottom=main?0:top-2;let px=xs[top]-x,pz=zs[top]-z;for(let y=top;y>=bottom;y--){const ox=px,oz=pz;px+=random.integer(main?-5:-15,main?5:15);pz+=random.integer(main?-5:-15,main?5:15);let upper=Math.fround(.1+layer*.2),lower=upper;if(main){upper=Math.fround(upper*(y*.1+1));lower=Math.fround(lower*((y-1)*.1+1));}for(const signs of [[-1,-1,1,-1],[1,-1,1,1],[1,1,-1,1],[-1,1,-1,-1]])quad(px,pz,ox,oz,y,upper,lower,signs);}}}
 return new BufferGeometry().setAttribute('position',new Float32BufferAttribute(vertices,3));
}
interface Bolt {mesh:Mesh;life:number;flashes:number;random:NativeRandom;position:[number,number,number];seed:number;age:number}
/** Own transient weather effects only; no mobs, fire, damage, drops or persistent world mutation. */
export class NativeWeather {
 root=new Group();random:NativeRandom;bolts:Bolt[]=[];last=-1;scope='';rainSoundTime=0;flashUntil=-1;records:object[]=[];
 heightSource:Map<string,number>|null=null;chunks:string[]=[];
 sound:((id:string,options:SoundOptions)=>void)|null=null;
 /** Retain a reproducible Java random stream for a bounded native-distance weather projection.
  * @param {number} seed Weather effect seed.
  * @param {number} distance Native-default sky projection radius or isolated fixture radius.
  */
 constructor(seed=Date.now()%2147483647,public distance=WEATHER_DISTANCE){this.random=new NativeRandom(seed);}
 /** Construct a native lightning entity presentation and schedule its first-tick sounds.
  * @param {number[]} position Native strike position on a rain-exposed heightmap.
  */
 strike(position:number[]):void{
  const random=new NativeRandom(seedLong(this.random)),seed=seedLong(random),flashes=random.integer(1,3),material=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,side:DoubleSide,vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(.45,.45,.5,.3);}',toneMapped:false});
  const mesh=new Mesh(lightningGeometry(seed),material);mesh.position.fromArray(position);mesh.frustumCulled=false;this.root.add(mesh);this.bolts.push({mesh,life:2,flashes,random,seed,position:position as [number,number,number],age:0});this.records.push({kind:'lightning',tick:this.last,position,seed,flashes});if(this.records.length>64)this.records.shift();
 }
 /** Process native rain-sound and per-chunk thunder trials across the bounded sky projection once per visual game tick.
  * @param {number} ticks Interpolated game tick, with no hidden-page progression.
  * @param {string} scope Current authored scene identity.
  * @param {number[]} eye Real camera position.
  * @param {Map<string,number>} heights Motion-blocking heightmap.
  * @param {object} weather Native weather strengths and snow state.
  */
 update(ticks:number,scope:string,eye:number[],heights:Map<string,number>,weather:{rain:number;thunder:number;snow:boolean}):void{
  const tick=Math.floor(ticks);if(this.scope!==scope){this.clear();this.scope=scope;}
  if(tick<this.last){this.flashUntil+=tick-this.last;this.last=tick;return;}
  if(this.last<0){this.last=tick;return;}if(tick===this.last)return;
  const from=tick-this.last>20?tick:this.last+1;
  if(this.heightSource!==heights){this.heightSource=heights;this.chunks=[];const cx=Math.floor(eye[0]/16),cz=Math.floor(eye[2]/16);for(let z=cz-this.distance;z<=cz+this.distance;z++)for(let x=cx-this.distance;x<=cx+this.distance;x++)this.chunks.push(x+':'+z);}
  for(let at=from;at<=tick;at++){
   this.last=at;
   if(weather.rain>0&&!weather.snow){const random=new NativeRandom(Number((BigInt(at)*312987231n)&((1n<<48n)-1n))),radius=10,span=21,count=Math.floor(.225*span*span*weather.rain*weather.rain);let target:number[]|null=null;
    for(let i=0;i<count;i++){const x=Math.floor(eye[0])+random.integer(0,20)-radius,z=Math.floor(eye[2])+random.integer(0,20)-radius,y=heights.get(x+':'+z);if(y!==undefined&&y<=Math.floor(eye[1])+10&&y>=Math.floor(eye[1])-10){target=[x,y-1,z];random.double();random.double();}}
    if(target&&random.integer(0,2)<this.rainSoundTime++){this.rainSoundTime=0;const above=target[1]>Math.floor(eye[1])+1&&(heights.get(Math.floor(eye[0])+':'+Math.floor(eye[2]))??-64)>Math.floor(eye[1]);this.sound?.(above?'weather.rain.above':'weather.rain',{volume:above ? .1 : .2,pitch:above ? .5 : 1,position:target.map(v=>v+.5) as [number,number,number]});}
   }
   if(weather.rain>.2&&weather.thunder>.9)for(const chunk of this.chunks)if(this.random.integer(0,99999)===0){const [cx,cz]=chunk.split(':').map(Number),x=cx*16+this.random.integer(0,15),z=cz*16+this.random.integer(0,15),y=heights.get(x+':'+z)??0;this.strike([x+.5,y,z+.5]);}
   for(const bolt of [...this.bolts]){
    if(bolt.life===2){this.sound?.('entity.lightning_bolt.thunder',{volume:10000,pitch:.8+bolt.random.float()*.2,position:bolt.position});this.sound?.('entity.lightning_bolt.impact',{volume:2,pitch:.5+bolt.random.float()*.2,position:bolt.position});}
    bolt.life--;bolt.age++;if(bolt.life<0){if(!bolt.flashes){bolt.mesh.geometry.dispose();(bolt.mesh.material as ShaderMaterial).dispose();this.root.remove(bolt.mesh);this.bolts.splice(this.bolts.indexOf(bolt),1);continue;}if(bolt.life< -bolt.random.integer(0,9)){bolt.flashes--;bolt.life=1;bolt.seed=seedLong(bolt.random);bolt.mesh.geometry.dispose();bolt.mesh.geometry=lightningGeometry(bolt.seed);}}
    bolt.mesh.visible=bolt.life>=0;if(bolt.life>=0)this.flashUntil=at+2;
   }
  }
 }
 /** Discard every old scene flash without generating any sound or gameplay action. */
 clear():void{for(const bolt of this.bolts){bolt.mesh.geometry.dispose();(bolt.mesh.material as ShaderMaterial).dispose();}this.root.clear();this.bolts=[];this.last=-1;this.flashUntil=-1;this.rainSoundTime=0;this.heightSource=null;this.chunks=[];}
 /** Release transient geometry and sound callbacks. */
 dispose():void{this.clear();this.sound=null;}
}
