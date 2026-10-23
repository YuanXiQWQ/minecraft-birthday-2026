/** Native HUD crosshair shares the scene renderer and uses the original invert blend equation. */
import {Scene,OrthographicCamera,CanvasTexture,NearestFilter,NoColorSpace,ShaderMaterial,CustomBlending,OneMinusDstColorFactor,OneMinusSrcColorFactor,OneFactor,ZeroFactor,Mesh,PlaneGeometry,Vector2} from 'three';
import type {WebGLRenderer} from 'three';
import {nativeScale} from '../ui/chat.ts';
export interface CrosshairState {actual:boolean;owned:boolean;desired:string;pending:boolean;paused:boolean;enabled:boolean;lost:boolean;disposed:boolean}
/** Require actual browser ownership in addition to desired mode and input authority.
 * @param {CrosshairState} state Current production input state.
 * @return {boolean} Whether the native HUD may draw.
 */
export function crosshairVisible(state: CrosshairState): boolean {return state.actual&&state.owned&&state.desired==='hidden'&&!state.pending&&!state.paused&&state.enabled&&!state.lost&&!state.disposed;}
/** Own one HUD quad and texture without creating another WebGL context. */
export class NativeCrosshair {
    attackProgress=1; attackFull=false; indicators:Mesh<PlaneGeometry,ShaderMaterial>[]=[];
    scene=new Scene();
    camera=new OrthographicCamera(0,1,1,0,-1,1);
    texture:CanvasTexture;
    material:ShaderMaterial;
    mesh:Mesh<PlaneGeometry,ShaderMaterial>;
    /** Retain the hash-verified native fifteen-pixel HUD sprite.
     * @param {HTMLCanvasElement} image Original crosshair pixels.
     */
    constructor(image:HTMLCanvasElement,images?:Map<string,HTMLCanvasElement>){
        this.texture=new CanvasTexture(image);this.texture.magFilter=this.texture.minFilter=NearestFilter;this.texture.colorSpace=NoColorSpace;
        this.material=new ShaderMaterial({uniforms:{map:{value:this.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 vUv;void main(){vec4 c=texture2D(map,vUv);if(c.a<.1)discard;gl_FragColor=c;}',depthTest:false,depthWrite:false,transparent:true,blending:CustomBlending,blendSrc:OneMinusDstColorFactor,blendDst:OneMinusSrcColorFactor,blendSrcAlpha:OneFactor,blendDstAlpha:ZeroFactor,toneMapped:false});
        this.mesh=new Mesh(new PlaneGeometry(15,15),this.material);this.scene.add(this.mesh);
        for(const name of ['background','progress','full']){const source=images?.get('assets/minecraft/textures/gui/sprites/hud/crosshair_attack_indicator_'+name+'.png');if(!source)continue;const texture=new CanvasTexture(source);texture.magFilter=texture.minFilter=NearestFilter;texture.colorSpace=NoColorSpace;const material=this.material.clone();material.uniforms={map:{value:texture}};const mesh=new Mesh(new PlaneGeometry(16,name==='full'?16:4),material);this.indicators.push(mesh);this.scene.add(mesh);}
    }
    /** Draw after the world with native logical bounds, retaining the renderer's viewport and clear state.
     * @param {WebGLRenderer} renderer Existing scene renderer.
     * @param {CrosshairState} state Live input authority.
     */
    render(renderer:WebGLRenderer,state:CrosshairState):void{
        const canvas=renderer.domElement,visible=crosshairVisible(state),size=renderer.getSize(new Vector2()),scale=nativeScale(canvas.parentElement!),w=Math.ceil(size.x/scale),h=Math.ceil(size.y/scale),left=Math.floor((w-15)/2),top=Math.floor((h-15)/2);
        canvas.dataset.crosshair=JSON.stringify({visible,bounds:[left,top,15,15],scale,logical:[w,h],ray:[0,0],blend:['ONE_MINUS_DST_COLOR','ONE_MINUS_SRC_COLOR','ONE','ZERO']});
        if(!visible)return;
        this.camera.right=w;this.camera.top=h;this.camera.updateProjectionMatrix();this.mesh.position.set(left+7.5,h-top-7.5,0);
        const x=Math.floor(w/2)-8,y=Math.floor(h/2)+9,progress=Math.floor(this.attackProgress*17);
        this.indicators.forEach((mesh,i)=>{mesh.visible=i===2?this.attackFull:this.attackProgress<1&&!this.attackFull;mesh.position.set(x+8,h-y-(i===2?8:2),0);if(i===1){const width=Math.min(16,progress);mesh.scale.x=width/16;mesh.position.x=x+width/2;const uv=mesh.geometry.getAttribute('uv');uv.setX(1,width/16);uv.setX(3,width/16);uv.needsUpdate=true;}});
        canvas.dataset.attackIndicator=JSON.stringify({visible:visible&&(this.attackProgress<1||this.attackFull),charge:this.attackProgress,pixels:progress,bounds:[x,y,16,4]});
        const clear=renderer.autoClear;renderer.autoClear=false;
        try{renderer.render(this.scene,this.camera);}finally{renderer.autoClear=clear;}
    }
    /** Release the single shared-renderer HUD resource set. */
    dispose():void{for(const mesh of this.indicators){mesh.geometry.dispose();mesh.material.uniforms.map.value.dispose();mesh.material.dispose();}this.mesh.geometry.dispose();this.material.dispose();this.texture.dispose();}
}
