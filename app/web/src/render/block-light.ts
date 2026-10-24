/** Finite native block-light propagation and lightmap shading for the authored world, without held-item dynamic light. */
import {DataTexture,RedFormat,UnsignedByteType,NearestFilter,Color,MeshBasicMaterial,ShaderMaterial} from 'three';
import {NativeRandom} from '../domain/environment.ts';
import type {Bounds} from '../domain/player-motion.ts';
import type {Cell} from '../domain/types.ts';

/** Bounded lighting volume surrounds every reachable scene cell and its supported construction height. */
const SIZE=48,HEIGHT=32,ORIGIN:Cell=[-24,-6,-28];
/** Native EnvironmentAttributes default BLOCK_LIGHT_TINT and overworld ambient color. */
const TINT=(-10100)>>>0;
/** Native lightmap brightness and tint equations shared by opaque blocks and precipitation columns. */
const LIGHT_SHADER=`uniform sampler2D blockField;uniform vec3 worldSky;uniform float blockFactor;
vec3 nativeLight(vec3 worldCell){
    vec3 cell=floor(worldCell)-vec3(${ORIGIN.join(',')});
    float level=0.;if(all(greaterThanEqual(cell,vec3(0.)))&&all(lessThan(cell,vec3(${SIZE}.,${HEIGHT}.,${SIZE}.))))level=texture2D(blockField,vec2((cell.x+.5)/${SIZE}.,(cell.z+${SIZE}.*cell.y+.5)/${SIZE*HEIGHT}.)).r*255./15.;
    vec3 light=vec3(10./255.)+worldSky+mix(vec3(${[(TINT>>>16&255)/255,(TINT>>>8&255)/255,(TINT&255)/255].join(',')}),vec3(1.),.9*pow(2.*level-1.,2.))*level/(4.-3.*level)*blockFactor;
    light=clamp(light,0.,1.);float maximum=max(max(light.r,light.g),light.b);return mix(light,light*((1.-pow(1.-maximum,4.))/max(maximum,.00001)),.5);
}`;

/** Own a six-neighbor light field and shared shader uniforms; all renderer materials retain their base colors. */
export class BlockLight {
    values=new Uint8Array(SIZE*SIZE*HEIGHT);texture=new DataTexture(this.values,SIZE,SIZE*HEIGHT,RedFormat,UnsignedByteType);
    sky={value:new Color(1,1,1)};factor={value:1.4};sources:Cell[]=[];
    random=new NativeRandom(Date.now()%2147483647);flicker=0;lastTick=-1;
    /** Upload integer light levels without color-space conversion or filtering across atlas slices. */
    constructor(){this.texture.magFilter=this.texture.minFilter=NearestFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;}
    /** Map a logical cell to its finite atlas address.
     * @param {Cell} cell World cell.
     * @return {number} Address, or -1 beyond the authored field.
     */
    index(cell:Cell):number{const [x,y,z]=cell.map((v,i)=>Math.floor(v)-ORIGIN[i]);return x<0||x>=SIZE||z<0||z>=SIZE||y<0||y>=HEIGHT?-1:x+SIZE*(z+SIZE*y);}
    /** Read an integer block-light level.
     * @param {Cell} cell World sample.
     * @return {number} Native 0–15 light level.
     */
    at(cell:Cell):number{return this.values[this.index(cell)]??0;}
    /** Advance the native client lightmap flicker once per visible 50 ms tick, without offline catch-up.
     * @param {number} now Visible renderer clock in milliseconds.
     */
    update(now:number):void{const tick=Math.floor(now/50);if(tick===this.lastTick)return;this.lastTick=tick;const r=this.random;this.flicker=Math.fround(Math.fround(this.flicker+Math.fround((r.float()-r.float())*r.float()*r.float()*.1))*.9);this.factor.value=this.flicker+1.4;}
    /** Illuminate an entire native weather column at its extraction sample cell.
     * @param {ShaderMaterial} material Owned precipitation shader with lightCell attributes.
     */
    bindWeather(material:ShaderMaterial):void{
        Object.assign(material.uniforms,{blockField:{value:this.texture},worldSky:this.sky,blockFactor:this.factor});
        material.vertexShader='attribute vec3 lightCell;varying vec3 weatherLightCell;\n'+material.vertexShader.replace('void main(){','void main(){weatherLightCell=lightCell;');
        material.fragmentShader=LIGHT_SHADER+'\nvarying vec3 weatherLightCell;\n'+material.fragmentShader.replace('vec4(color.rgb,','vec4(color.rgb*nativeLight(weatherLightCell),');material.needsUpdate=true;
    }
    /** Flood native emission through empty cells, attenuating by one per axis neighbor and stopping at full opaque blocks.
     * @param {{cell:Cell,level:number}[]} emitters Committed placed or authored light sources.
     * @param {Bounds[]} solids Full opaque collision volumes.
     */
    rebuild(emitters:{cell:Cell,level:number}[],solids:Bounds[]):void{
        this.values.fill(0);const blocked=new Uint8Array(this.values.length),queue:number[]=[];
        for(const b of solids){if([0,1,2].some(i=>b[i+3]-b[i]<.999))continue;for(let y=Math.max(ORIGIN[1],Math.floor(b[1]));y<Math.min(ORIGIN[1]+HEIGHT,Math.ceil(b[4]));y++)for(let z=Math.max(ORIGIN[2],Math.floor(b[2]));z<Math.min(ORIGIN[2]+SIZE,Math.ceil(b[5]));z++)for(let x=Math.max(ORIGIN[0],Math.floor(b[0]));x<Math.min(ORIGIN[0]+SIZE,Math.ceil(b[3]));x++)blocked[this.index([x,y,z])]=1;}
        this.sources=emitters.map(e=>e.cell);for(const e of emitters){const i=this.index(e.cell);if(i>=0){this.values[i]=e.level;queue.push(i);}}
        for(let q=0;q<queue.length;q++){const i=queue[q],level=this.values[i]-1;if(level<=0)continue;const x=i%SIZE,z=Math.floor(i/SIZE)%SIZE,y=Math.floor(i/(SIZE*SIZE));for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const nx=x+dx,ny=y+dy,nz=z+dz;if(nx<0||nx>=SIZE||nz<0||nz>=SIZE||ny<0||ny>=HEIGHT)continue;const n=nx+SIZE*(nz+SIZE*ny);if(!blocked[n]&&this.values[n]<level){this.values[n]=level;queue.push(n);}}}
        this.texture.needsUpdate=true;
    }
    /** Attach native lightmap intensity to a world-only native textured material.
     * @param {MeshBasicMaterial} material Shared world material, independent of GUI and hand renderers.
     */
    bind(material:MeshBasicMaterial):void{
        material.onBeforeCompile=shader=>{
            shader.uniforms.blockField={value:this.texture};shader.uniforms.worldSky=this.sky;shader.uniforms.blockFactor=this.factor;
            shader.vertexShader='varying vec3 lightPoint;\nvarying vec3 lightNormal;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
                vec4 lp=vec4(transformed,1.);vec3 ln=normal;
                #ifdef USE_INSTANCING
                lp=instanceMatrix*lp;ln=mat3(instanceMatrix)*ln;
                #endif
                lightPoint=(modelMatrix*lp).xyz;lightNormal=normalize(mat3(modelMatrix)*ln);`);
            shader.fragmentShader=LIGHT_SHADER+'\nvarying vec3 lightPoint;varying vec3 lightNormal;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
                diffuseColor.rgb*=nativeLight(lightPoint+normalize(lightNormal)*.02);`);
        };
        material.customProgramCacheKey=()=> 'native-block-light-v1';material.needsUpdate=true;
    }
    /** Release the owned finite light atlas. */
    dispose():void{this.texture.dispose();}
}
