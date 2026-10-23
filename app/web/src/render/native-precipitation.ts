/** Native textured precipitation columns respect authored block heightmaps and finite device roofs. */
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,ShaderMaterial,CanvasTexture,RepeatWrapping,NearestFilter,SRGBColorSpace,PerspectiveCamera,Object3D} from 'three';
import type {Resources} from './resources.ts';
import type {Progress} from '../domain/types.ts';
import {WORLD_SCENES} from '../domain/world-config.ts';
import {GaussianRandom} from './native-sky.ts';

/** Render one bounded native precipitation field without adding collectible entities or simulation sources. */
export class NativePrecipitation {
    heights=new Map<string,number>();
    root=new Group();rain:CanvasTexture;snow:CanvasTexture;mesh:Mesh;signature='';columns=0;
    /** Load only verified original precipitation textures.
     * @param {Resources} pack Original same-version resources.
     */
    constructor(pack:Resources){
        /** Bind original top-origin pixels to native UV coordinates without a second vertical flip. @param {string} name Native environment PNG name. @return {CanvasTexture} Owned texture. */
        const texture=(name:string)=>{const image=pack.guiImages.get('assets/minecraft/textures/environment/'+name+'.png');if(!image)throw Error('native-precipitation-unavailable');const t=new CanvasTexture(image);t.flipY=false;t.wrapS=t.wrapT=RepeatWrapping;t.magFilter=t.minFilter=NearestFilter;t.colorSpace=SRGBColorSpace;return t;};
        this.rain=texture('rain');this.snow=texture('snow');
        const material=new ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:this.rain},tick:{value:0},intensity:{value:0},snowing:{value:0}},
            vertexShader:`attribute vec4 motion; attribute float opacity; attribute float columnHash; varying vec2 vUv; varying float vOpacity; uniform float tick; uniform float snowing;
                void main(){float t=mod(tick,131072.);vec2 offset=vec2(0.,mod(-(t+columnHash)/32.*motion.x,32.));
                if(snowing>.5)offset=vec2(motion.x+t*.01*motion.y,-mod(tick,512.)/512.+motion.z+t*.001*motion.w);
                vUv=uv+offset;vOpacity=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader:`uniform sampler2D map;uniform float intensity;varying vec2 vUv;varying float vOpacity;
                void main(){vec4 color=texture2D(map,vUv);gl_FragColor=vec4(color.rgb,color.a*vOpacity*intensity);if(gl_FragColor.a<.001)discard;
                #include <colorspace_fragment>
                }`});
        material.side=2;this.mesh=new Mesh(new BufferGeometry(),material);this.mesh.renderOrder=3;this.root.add(this.mesh);this.root.visible=false;
    }

    /** Compile heightmap-clipped columns with native top/bottom UV endpoint pairing after layout/source changes.
     * @param {PerspectiveCamera} camera Stationary authored eye.
     * @param {Progress} progress Current committed world.
     * @param {Object3D} scenery Actual authored batches with logical block cells.
     * @param {boolean} snow Whether the native snow rather than rain column mapping applies.
     */
    rebuild(camera:PerspectiveCamera,progress:Progress,scenery:Object3D,snow:boolean):void{
        const heights=this.heights=new Map<string,number>();
        /** Register a blocking block top. @param {number[]} cell Original logical block coordinates. */
        const block=(cell:number[])=>{const key=cell[0]+':'+cell[2];heights.set(key,Math.max(heights.get(key)??-64,cell[1]+1));};
        scenery.traverse(object=>{if(object.userData.blocksRain===false)return;for(const cell of object.userData.cells??[])block(cell);});
        for(const n of WORLD_SCENES[progress.scene].nodes)if(!n.kind&&!['short_grass','sugar_cane','wheat'].includes(n.block)&&!progress.world.visits[progress.scene].removed.includes(n.id))block(n.cell);
        for(const station of progress.scenes[progress.scene].stations)block(station.cell);
        const p:number[]=[],uv:number[]=[],motion:number[]=[],opacity:number[]=[],hash:number[]=[],indices:number[]=[],ex=Math.floor(camera.position.x),ey=Math.floor(camera.position.y),ez=Math.floor(camera.position.z),radius=10;
        for(let z=ez-radius;z<=ez+radius;z++)for(let x=ex-radius;x<=ex+radius;x++){
            const dx=x-ex,dz=z-ez,length=Math.hypot(dx,dz);if(!length)continue;
            const h=heights.get(x+':'+z)??0,bottom=Math.max(ey-radius,h),top=Math.max(ey+radius,h);if(top<=bottom)continue;
            const a=(Math.imul(Math.imul(x,x),3121)+Math.imul(x,45238971))|0,b=(Math.imul(Math.imul(z,z),418711)+Math.imul(z,13761))|0,random=new GaussianRandom(a^b),hashValue=(a+b)&255;
            const m=snow?[random.double(),random.gaussian(),random.double(),random.gaussian()]:[3+random.float(),0,0,0],nx=-dz/length*.5,nz=dx/length*.5,base=p.length/3;
            const distance=Math.min(1,((x+.5-camera.position.x)**2+(z+.5-camera.position.z)**2)/100),alpha=(snow?.8:1)+(.5-(snow?.8:1))*distance;
            for(const [sx,y,u] of [[-1,bottom,0],[-1,top,0],[1,top,1],[1,bottom,1]]){p.push(x+.5+sx*nx,y,z+.5+sx*nz);uv.push(u,(top+bottom-y)*.25);motion.push(...m);hash.push(hashValue);opacity.push(alpha);}
            indices.push(base,base+1,base+2,base,base+2,base+3);
        }
        this.mesh.geometry.dispose();this.mesh.geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(p,3)).setAttribute('uv',new Float32BufferAttribute(uv,2)).setAttribute('motion',new Float32BufferAttribute(motion,4)).setAttribute('columnHash',new Float32BufferAttribute(hash,1)).setAttribute('opacity',new Float32BufferAttribute(opacity,1)).setIndex(indices);this.columns=p.length/12;
    }

    /** Project native intensity/UV time while reusing unchanged column geometry.
     * @param {PerspectiveCamera} camera Current authored view.
     * @param {Progress} progress Committed world.
     * @param {Object3D} scenery Actual static block batches.
     * @param {number} ticks Native render clock.
     * @param {number} rain Native smoothed rain strength.
     * @param {boolean} snow Native snow mapping for real snowfall.
     */
    update(camera:PerspectiveCamera,progress:Progress,scenery:Object3D,ticks:number,rain:number,snow:boolean):void{
        this.root.visible=rain>.001;if(!this.root.visible)return;
        const signature=JSON.stringify([progress.scene,progress.world.visits[progress.scene].removed,progress.scenes[progress.scene].stations.map(s=>s.cell),snow]);
        if(signature!==this.signature){this.rebuild(camera,progress,scenery,snow);this.signature=signature;}
        const uniforms=(this.mesh.material as ShaderMaterial).uniforms;uniforms.tick.value=ticks;uniforms.intensity.value=rain;uniforms.snowing.value=snow?1:0;uniforms.map.value=snow?this.snow:this.rain;
    }

    /** Dispose every precipitation-owned GPU allocation. */
    dispose():void{this.mesh.geometry.dispose();(this.mesh.material as ShaderMaterial).dispose();this.rain.dispose();this.snow.dispose();this.root.clear();}
}
