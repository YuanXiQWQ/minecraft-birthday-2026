/** Original overworld sky discs, timeline-driven celestial bodies, native stars and alpha-cell clouds. */
import {Scene,PerspectiveCamera,Group,Mesh,InstancedMesh,MeshBasicMaterial,ShaderMaterial,BufferGeometry,Float32BufferAttribute,PlaneGeometry,CanvasTexture,NearestFilter,SRGBColorSpace,Color,DoubleSide,AdditiveBlending,Vector3,Matrix4,WebGLRenderer} from 'three';
import type {Resources} from './resources.ts';
import {NativeRandom,emptyEnvironment,realDayTicks} from '../domain/environment.ts';
import type {EnvironmentState,SkySettings} from '../domain/environment.ts';
import {cloudGeometry} from './cloud-geometry.ts';
import type {CloudData} from './cloud-geometry.ts';
import {trackAt,rgba,grayWeather} from './sky-tracks.ts';

/** Java's polar Gaussian sampler retains the second value for the following native request. */
export class GaussianRandom extends NativeRandom {
    spare:number|null=null;
    /** Sample native Marsaglia-polar noise. @return {number} Standard normal value. */
    gaussian():number{if(this.spare!==null){const v=this.spare;this.spare=null;return v;}let x:number,y:number,s:number;do{x=this.double()*2-1;y=this.double()*2-1;s=x*x+y*y;}while(s>=1||s===0);const scale=Math.sqrt(-2*Math.log(s)/s);this.spare=y*scale;return x*scale;}
}

/** Build the original 1500-attempt star mesh with its fixed seed and accepted unit-sphere samples.
 * @return {BufferGeometry} Original-sized oriented star quads.
 */
export function starGeometry():BufferGeometry{
    const random=new NativeRandom(10842),p:number[]=[],indices:number[]=[],f=Math.fround;
    for(let i=0;i<1500;i++){
        const x=f(f(random.float()*2)-1),y=f(f(random.float()*2)-1),z=f(f(random.float()*2)-1),size=f(f(.15)+f(random.float()*f(.1))),d=f(f(f(x*x)+f(y*y))+f(z*z));
        if(d<=f(.010000001)||d>=1)continue;
        const center=new Vector3(x,y,z).normalize().multiplyScalar(100),forward=center.clone().negate().normalize(),right=new Vector3().crossVectors(new Vector3(0,1,0),forward).normalize(),up=new Vector3().crossVectors(forward,right),angle=f(random.double()*Math.fround(Math.PI)*2);
        const matrix=new Matrix4().makeBasis(right,up,forward).multiply(new Matrix4().makeRotationZ(-angle)),base=p.length/3;
        for(const [a,b] of [[size,-size],[size,size],[-size,size],[-size,-size]]){const v=new Vector3(a,b,0).applyMatrix4(matrix).add(center);p.push(v.x,v.y,v.z);}
        indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    return new BufferGeometry().setAttribute('position',new Float32BufferAttribute(p,3)).setIndex(indices);
}

/** Apply native ARGB-derived weather multipliers without changing the source alpha.
 * @param {number[]} rgb Native attribute channels.
 * @param {number} rain Smoothed rain level.
 * @param {number} thunder Rain-weighted thunder level.
 * @return {number[]} Rain-then-thunder color projection.
 */
export function weatherTint(rgb:number[],rain:number,thunder:number):number[]{const r=rgb.map((v,i)=>i<3?v+(v*[127/255,127/255,153/255][i]-v)*(rain-thunder):v);return r.map((v,i)=>i<3?v+(v*[63/255,63/255,76/255][i]-v)*thunder:v);}

/** Apply WeatherAttributes' original light factor and night-color alpha blends in native layer order.
 * @param {number} factor Native day timeline factor.
 * @param {number[]} rgb Native day light channels.
 * @param {number} rain Smoothed rain level.
 * @param {number} thunder Rain-weighted thunder level.
 * @return {object} Native weather-adjusted factor and RGB channels.
 */
export function weatherLighting(factor:number,rgb:number[],rain:number,thunder:number){const first=factor+(.24-factor)*.3125*(rain-thunder),night=[122/255,122/255,1],color=rgb.map((v,i)=>i<3?v+(night[i]-v)*(79/255)*(rain-thunder):v);return{factor:first+(.24-first)*.52734375*thunder,color:color.map((v,i)=>i<3?v+(night[i]-v)*(134/255)*thunder:v)};}

/** Own sky-only rendering so world geometry correctly occludes every celestial or cloud layer. */
export class NativeSky {
    scene=new Scene(); camera=new PerspectiveCamera(70,1,.1,4096);
    sunRoot=new Group();moonRoot=new Group();starRoot=new Group();sunriseRoot=new Group();
    textures:CanvasTexture[]=[];
    sun:Mesh;moon:Mesh;stars:Mesh;clouds:InstancedMesh;sunrise:Mesh;disc:Mesh;
    moons:CanvasTexture[]=[];
    state:EnvironmentState=emptyEnvironment();preferences:SkySettings={time:'game',weather:'game'};
    weatherOverride:{rain:number;thunder:number;snow:boolean}|null=null;
    received=0;gameTick=0;realRain=0;realThunder=0;weatherAtTime=0;cloudSource:ImageData;report:Record<string,unknown>={};
    day:any;moonTimeline:any;dimension:any;cloudWorker:Worker|null=null;disposed=false;cloudQuads=0;

    /** Compile original asset pixels and native timeline JSON once per scene adapter.
     * @param {Resources} pack Audited Java 26.3 resources.
     */
    constructor(public pack:Resources){
        this.day=pack.documents.get('data/minecraft/timeline/day.json');this.moonTimeline=pack.documents.get('data/minecraft/timeline/moon.json');this.dimension=pack.documents.get('data/minecraft/dimension_type/overworld.json');
        if(!this.day||!this.moonTimeline||!this.dimension)throw Error('native-sky-data-unavailable');
        const cloud=pack.guiImages.get('assets/minecraft/textures/environment/clouds.png');if(!cloud)throw Error('native-clouds-unavailable');
        this.cloudSource=cloud.getContext('2d')!.getImageData(0,0,cloud.width,cloud.height);
        const sunTex=this.texture('celestial/sun.png');
        for(const name of ['full_moon','waning_gibbous','third_quarter','waning_crescent','new_moon','waxing_crescent','first_quarter','waxing_gibbous'])this.moons.push(this.texture('celestial/moon/'+name+'.png'));
        this.sun=this.body(30,sunTex);this.moon=this.body(20,this.moons[0]);this.sunRoot.add(this.sun);this.moonRoot.add(this.moon);
        this.stars=new Mesh(starGeometry(),new MeshBasicMaterial({color:0xffffff,side:DoubleSide,transparent:true,depthWrite:false,depthTest:false,blending:AdditiveBlending,toneMapped:false}));this.starRoot.add(this.stars);
        this.sunRoot.rotation.y=this.moonRoot.rotation.y=this.starRoot.rotation.y=-Math.PI/2;
        const geometry=new BufferGeometry(),positions=[0,100,0],alpha=[1],indices:number[]=[];
        for(let i=0;i<=16;i++){const a=i*Math.fround(Math.PI*2)/16;positions.push(Math.sin(a)*120,Math.cos(a)*120,-Math.cos(a)*40);alpha.push(0);if(i)indices.push(0,i,i+1);}
        geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(alpha.flatMap(a=>[1,1,1,a]),4));geometry.setIndex(indices);
        this.sunrise=new Mesh(geometry,new MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,depthTest:false,side:DoubleSide,toneMapped:false}));this.sunriseRoot.add(this.sunrise);
        const cloudMaterial=new MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:true,side:DoubleSide,toneMapped:false});
        /** Apply clouds.fsh's native distance-to-alpha formula at the native default 128-chunk cloud range.
         * @param {any} shader Three shader with native material color/sampling.
         */
        cloudMaterial.onBeforeCompile=shader=>{shader.vertexShader='varying float cloudDistance;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ncloudDistance=length(mvPosition.xyz);');shader.fragmentShader='varying float cloudDistance;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=1.-clamp(cloudDistance/2048.,0.,1.);\n#include <alphatest_fragment>');};
        cloudMaterial.side=0;this.clouds=new InstancedMesh(new BufferGeometry(),cloudMaterial,9);this.clouds.renderOrder=10;this.clouds.visible=false;
        let instance=0;for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)this.clouds.setMatrixAt(instance++,new Matrix4().makeTranslation(x*cloud.width*12,0,z*cloud.height*12));
        this.compileClouds();
        this.scene.add(this.sunRoot,this.moonRoot,this.starRoot,this.sunriseRoot,this.clouds);
        const discPositions=[0,16,0],discIndices:number[]=[];
        for(let a=-180;a<=180;a+=45){discPositions.push(Math.cos(a*Math.PI/180)*512,16,Math.sin(a*Math.PI/180)*512);if(a>-180){const i=(a+180)/45;discIndices.push(0,i,i+1);}}
        this.disc=new Mesh(new BufferGeometry().setAttribute('position',new Float32BufferAttribute(discPositions,3)).setIndex(discIndices),new ShaderMaterial({side:DoubleSide,depthWrite:false,depthTest:false,uniforms:{sky:{value:new Color()},fog:{value:new Color()},end:{value:90}},vertexShader:'varying float distanceToEye;void main(){distanceToEye=length(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float distanceToEye;uniform vec3 sky;uniform vec3 fog;uniform float end;void main(){gl_FragColor=vec4(mix(sky,fog,clamp(distanceToEye/end,0.,1.)),1.);\n#include <colorspace_fragment>\n}'}));this.disc.renderOrder=-100;this.scene.add(this.disc);
        this.scene.background=new Color('#78a7ff');
    }

    /** Decode an original celestial texture without generating replacement art.
     * @param {string} path Original relative environment PNG.
     * @return {CanvasTexture} Owned nearest-sampled texture.
     */
    texture(path:string):CanvasTexture{const image=this.pack.guiImages.get('assets/minecraft/textures/environment/'+path);if(!image)throw Error('native-celestial-unavailable');const t=new CanvasTexture(image);t.colorSpace=SRGBColorSpace;t.magFilter=t.minFilter=NearestFilter;this.textures.push(t);return t;}

    /** Create the original horizontal quad at native height 100 and half-size 30/20.
     * @param {number} half Native half-size.
     * @param {CanvasTexture} map Native atlas sample.
     * @return {Mesh} Owned celestial quad.
     */
    body(half:number,map:CanvasTexture):Mesh{const m=new Mesh(new PlaneGeometry(half*2,half*2).rotateX(-Math.PI/2),new MeshBasicMaterial({map,transparent:true,side:DoubleSide,depthWrite:false,depthTest:false,blending:AdditiveBlending,toneMapped:false}));m.position.y=100;return m;}

    /** Accept only committed game-clock state; civil time is evaluated without changing simulation facts.
     * @param {EnvironmentState} state Committed native environment.
     * @param {SkySettings} settings Independent user choices.
     * @param {number} tick Shared active-game tick.
     */
    sync(state:EnvironmentState,settings:SkySettings,tick:number):void{this.state=state;this.preferences=settings;this.gameTick=tick;this.received=performance.now();}

    /** Ease opt-in observation changes at the native 0.01-per-tick rate without advancing game facts.
     * @param {number} now Monotonic render time.
     * @return {object} Current native weather strengths and precipitation type.
     */
    weatherAt(now:number){
        const step=globalThis.document?.hidden?0:Math.min(250,Math.max(0,now-this.weatherAtTime))/50*Math.fround(.01);this.weatherAtTime=now;
        if(this.preferences.weather!=='real'||!this.weatherOverride){this.realRain=this.state.rainLevel;this.realThunder=this.state.thunderLevel;return{rain:this.state.rainLevel,thunder:this.state.thunderLevel*this.state.rainLevel,snow:false};}
        const target=this.weatherOverride;
        this.realRain+=Math.max(-step,Math.min(step,target.rain-this.realRain));this.realThunder+=Math.max(-step,Math.min(step,target.thunder-this.realThunder));
        return{rain:this.realRain,thunder:this.realThunder*this.realRain,snow:target.snow};
    }

    /** Install a complete native cloud tile once; repeated sheets only change their shared wind transform.
     * @param {CloudData} data Native packed vertices and indices.
     */
    installClouds(data:CloudData):void{
        if(this.disposed)return;
        this.clouds.geometry.dispose();this.clouds.geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(data.positions,3)).setAttribute('color',new Float32BufferAttribute(data.colors,3));
        this.clouds.geometry.setIndex(Array.from(data.indices));this.clouds.computeBoundingSphere();this.clouds.visible=true;this.cloudQuads=data.quads;
    }

    /** Prefer background compilation; the same pure compiler is a native-geometry fallback when workers are unavailable. */
    compileClouds():void{
        const source=this.cloudSource;
        if(typeof Worker==='undefined'){this.installClouds(cloudGeometry(source.data,source.width,source.height));return;}
        try{
            const worker=this.cloudWorker=new Worker(new URL('./cloud-worker.ts',import.meta.url),{type:'module'});
            worker.onmessage=event=>{this.installClouds(event.data);worker.terminate();if(this.cloudWorker===worker)this.cloudWorker=null;};
            worker.onerror=()=>{worker.terminate();if(this.cloudWorker===worker)this.cloudWorker=null;if(!this.disposed)this.installClouds(cloudGeometry(source.data,source.width,source.height));};
            worker.postMessage({pixels:source.data,width:source.width,height:source.height});
        }catch{this.installClouds(cloudGeometry(source.data,source.width,source.height));}
    }

    /** Render original overworld sky geometry at the current camera orientation.
     * @param {WebGLRenderer} renderer Shared renderer and current target.
     * @param {PerspectiveCamera} camera World view.
     * @param {number} now Monotonic render time.
     * @param {Date} date Injectable civil clock.
     */
    render(renderer:WebGLRenderer,camera:PerspectiveCamera,now:number,date=new Date()):void{
        const partial=document.hidden?0:Math.min(5,Math.max(0,now-this.received)/50),time=this.preferences.time==='real'?realDayTicks(date):this.state.dayTicks+partial,
            track=(key:string)=>trackAt(this.day.tracks['minecraft:visual/'+key],time,this.day.period_ticks),weatherValue=this.weatherAt(now),rain=weatherValue.rain,thunder=weatherValue.thunder;
        const attrs=this.dimension.attributes,sky=track('sky_color'),base=rgba(attrs['minecraft:visual/sky_color']),cloud=track('cloud_color'),cloudBase=rgba(attrs['minecraft:visual/cloud_color']);
        let skyRGB=base.map((v,i)=>v*sky[i]),cloudRGB=cloudBase.map((v,i)=>v*cloud[i]);
        /** Apply the two native weather layers in their original order. @param {number[]} rgb Base channels. @param {number} r Rain grayscale brightness. @param {number} t Thunder grayscale brightness. @return {number[]} Weather-adjusted channels. */
        const weather=(rgb:number[],r:number,t:number)=>{
            const a=grayWeather(rgb,r,.75*(rain-thunder)),b=grayWeather(a,t,.94);return a.map((v,i)=>v+(b[i]-v)*thunder);
        };
        skyRGB=weather(skyRGB,.6,.24);
        const rainCloud=grayWeather(cloudRGB,.24,.5);cloudRGB=cloudRGB.map((v,i)=>v+(rainCloud[i]-v)*(rain-thunder));const thunderCloud=grayWeather(cloudRGB,.095,.94);cloudRGB=cloudRGB.map((v,i)=>v+(thunderCloud[i]-v)*thunder);
        (this.disc.material as ShaderMaterial).uniforms.sky.value.setRGB(skyRGB[0],skyRGB[1],skyRGB[2],SRGBColorSpace);
        const fogBase=rgba(attrs['minecraft:visual/fog_color']),fogTrack=track('fog_color');let fog=fogBase.map((v,i)=>v*fogTrack[i]);
        fog=weatherTint(fog,rain,thunder);
        (this.scene.background as Color).setRGB(fog[0],fog[1],fog[2],SRGBColorSpace);
        (this.disc.material as ShaderMaterial).uniforms.fog.value.copy(this.scene.background);(this.disc.material as ShaderMaterial).uniforms.end.value=Math.min(12*16,512);
        this.sunRoot.rotation.set(0,-Math.PI/2,0);this.sunRoot.rotateX(track('sun_angle')*Math.PI/180);
        this.moonRoot.rotation.set(0,-Math.PI/2,0);this.moonRoot.rotateX(track('moon_angle')*Math.PI/180);
        this.starRoot.rotation.set(0,-Math.PI/2,0);this.starRoot.rotateX(track('star_angle')*Math.PI/180);
        const moonClock=this.preferences.time==='real'?Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000*24000+time:this.state.dayTicks,phase=trackAt(this.moonTimeline.tracks['minecraft:visual/moon_phase'],moonClock,this.moonTimeline.period_ticks),names=['full_moon','waning_gibbous','third_quarter','waning_crescent','new_moon','waxing_crescent','first_quarter','waxing_gibbous'];
        (this.moon.material as MeshBasicMaterial).map=this.moons[names.indexOf(phase)];
        (this.sun.material as MeshBasicMaterial).opacity=(this.moon.material as MeshBasicMaterial).opacity=1-rain;
        (this.stars.material as MeshBasicMaterial).opacity=track('star_brightness')*(1-rain+thunder)*(1-thunder);
        const sunrise=weatherTint(track('sunrise_sunset_color'),rain,thunder);this.sunriseRoot.rotation.set(Math.PI/2,0,(Math.sin(track('sun_angle')*Math.PI/180)<0?Math.PI:0)+Math.PI/2);this.sunriseRoot.scale.z=sunrise[3];
        const sm=this.sunrise.material as MeshBasicMaterial;sm.color.setRGB(sunrise[0],sunrise[1],sunrise[2],SRGBColorSpace);sm.opacity=sunrise[3];this.sunrise.visible=sm.opacity>.001;
        const wind=((this.gameTick% (this.cloudSource.width*400))+partial)*Math.fround(.03);
        this.clouds.position.set(-wind-camera.position.x,attrs['minecraft:visual/cloud_height']-camera.position.y,-Math.fround(3.96)-camera.position.z);
        const cm=this.clouds.material as MeshBasicMaterial;cm.color.setRGB(cloudRGB[0],cloudRGB[1],cloudRGB[2],SRGBColorSpace);cm.opacity=cloudRGB[3];
        this.camera.aspect=camera.aspect;this.camera.fov=camera.fov;this.camera.quaternion.copy(camera.quaternion);this.camera.updateProjectionMatrix();
        const skyLight=weatherLighting(track('sky_light_factor'),track('sky_light_color'),rain,thunder);
        this.report={dayTicks:time,sunAngle:track('sun_angle'),moonAngle:track('moon_angle'),moonPhase:phase,rain,thunder,skyLightFactor:skyLight.factor,skyLightColor:skyLight.color,cloudHeight:attrs['minecraft:visual/cloud_height'],cloudQuads:this.cloudQuads,cloudInstances:9,cloudReady:this.clouds.visible,cloudRange:128,starQuads:this.stars.geometry.index!.count/6};
        renderer.render(this.scene,this.camera);
    }

    /** Release sky-owned geometry, materials and decoded GPU textures without touching GUI caches. */
    dispose():void{this.disposed=true;this.cloudWorker?.terminate();this.cloudWorker=null;this.scene.traverse(o=>{if(o instanceof Mesh){if(o instanceof InstancedMesh)o.dispose();o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});for(const t of this.textures)t.dispose();this.scene.clear();}
}
