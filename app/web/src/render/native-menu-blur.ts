/** Java 26.3 menu blur ports post_effect/blur.json and post/box_blur.fsh into the shared WebGL2 renderer. */
import {WebGLRenderTarget,LinearFilter,NoColorSpace,ShaderMaterial,NoBlending,Scene,OrthographicCamera,Mesh,PlaneGeometry,Vector2,Vector4} from 'three';
import type {WebGLRenderer,Camera} from 'three';
/** Native menu post-effect performs three horizontal/vertical pairs with the configured five-pixel radius. */
export const MENU_BLUR_DIRECTIONS=[[1,0],[0,1],[1,0],[0,1],[1,0],[0,1]] as const;
/** Share two targets; an encoding pass bridges Three's linear scene to the native byte-color blur pipeline. */
export class NativeMenuBlur {
    targets=[new WebGLRenderTarget(1,1,{minFilter:LinearFilter,magFilter:LinearFilter}),new WebGLRenderTarget(1,1,{minFilter:LinearFilter,magFilter:LinearFilter})];
    scene=new Scene();camera=new OrthographicCamera(-1,1,1,-1,0,1);
    material=new ShaderMaterial({depthTest:false,depthWrite:false,blending:NoBlending,toneMapped:false,uniforms:{map:{value:null},size:{value:new Vector2(1,1)},direction:{value:new Vector2(1,0)},encode:{value:true}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
        varying vec2 vUv;uniform sampler2D map;uniform vec2 size;uniform vec2 direction;uniform bool encode;
        vec3 srgb(vec3 v){return mix(1.055*pow(v,vec3(1./2.4))-.055,12.92*v,lessThanEqual(v,vec3(.0031308)));}
        void main(){if(encode){gl_FragColor=vec4(srgb(texture2D(map,vUv).rgb),1.);return;}
            vec2 sampleStep=direction/size;vec4 blurred=vec4(0.);float actualRadius=5.;
            for(float a=-actualRadius+.5;a<=actualRadius;a+=2.)blurred+=texture2D(map,vUv+sampleStep*a);
            blurred+=texture2D(map,vUv+sampleStep*actualRadius)/2.;gl_FragColor=blurred/(actualRadius+.5);
        }`});
    quad=new Mesh(new PlaneGeometry(2,2),this.material);
    /** Allocate only bounded reusable native post-effect objects. */
    constructor(){this.targets.forEach(t=>t.texture.colorSpace=NoColorSpace);this.scene.add(this.quad);}
    /** Draw the scene followed by the six native separable box passes, restoring renderer ownership.
     * @param {WebGLRenderer} renderer Existing scene renderer.
     * @param {Scene} world Main world including actual particles and devices.
     * @param {Camera} camera Approved scene camera.
     */
    render(renderer:WebGLRenderer,world:Scene,camera:Camera):void{
        const size=renderer.getDrawingBufferSize(new Vector2()),previous=renderer.getRenderTarget(),viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4()),test=renderer.getScissorTest(),clear=renderer.autoClear;
        for(const target of this.targets)if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
        try{
            renderer.setScissorTest(false);renderer.autoClear=true;renderer.setRenderTarget(this.targets[0]);renderer.render(world,camera);
            this.material.uniforms.map.value=this.targets[0].texture;this.material.uniforms.encode.value=true;renderer.setRenderTarget(this.targets[1]);renderer.render(this.scene,this.camera);
            this.material.uniforms.encode.value=false;this.material.uniforms.size.value.copy(size);
            for(const [i,dir] of MENU_BLUR_DIRECTIONS.entries()){
                this.material.uniforms.map.value=this.targets[(i+1)%2].texture;this.material.uniforms.direction.value.set(...dir);
                renderer.setRenderTarget(i===5?previous:this.targets[i%2]);renderer.render(this.scene,this.camera);
            }
        }finally{renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test);renderer.autoClear=clear;}
    }
    /** Release the bounded framebuffer pair and fullscreen quad. */
    dispose():void{this.targets.forEach(t=>t.dispose());this.quad.geometry.dispose();this.material.dispose();}
}
