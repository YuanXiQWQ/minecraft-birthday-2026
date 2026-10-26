/** Native first-person arm/item transforms share the world renderer and its visible clock. */
import {Scene,Group,PerspectiveCamera,AmbientLight,DirectionalLight,Matrix4,Vector2} from 'three';
import type {WebGLRenderer} from 'three';
import {PlayerItems} from '../ui/player-items.ts';
import {playerParts,playerCube} from '../ui/player-model.ts';
import type {PlayerAppearance} from '../ui/player-profile.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import {attackCharge,attackProfile} from '../domain/attack.ts';
import {spearProfile,spearUsePose,progress} from '../domain/item-use.ts';
import type {ItemUse} from '../domain/item-use.ts';

/** Own native hand geometry and transient animation; no animation state is persisted. */
export class FirstPersonHand {
    appearance:PlayerAppearance|null=null;
    /** Synchronize native model width and hand pixels with the committed player identity.
     * @param {PlayerAppearance|null} appearance Validated profile or fallback.
     */
    setAppearance(appearance:PlayerAppearance|null):void{if(this.appearance===appearance)return;this.appearance=appearance;this.items.setProfileTexture('skin',appearance?.skin);this.replace();this.offhand?.setAppearance(appearance);}
    scene=new Scene();camera=new PerspectiveCamera(70,1,.01,10);root=new Group();items:PlayerItems;
    item:string|null=null;pending:string|null=null;model:Group|null=null;height=1;clock=0;attackAt=-100;swapAt=-100;swingAt=-100;swingDuration=6;stab=false;
    offhand:FirstPersonHand|null=null;using=false;useTicks=0;hitFeedback=100;
    /** Construct an arm from the same original Steve atlas as the inventory preview.
     * @param {CatalogueArt} art Verified item and skin resources.
     * @param {boolean} left Whether this instance owns the secondary left hand.
     */
    constructor(art:CatalogueArt,public left=false){this.items=new PlayerItems(art);this.scene.add(new AmbientLight(0xffffff,1));const light=new DirectionalLight(0xffffff,.5);light.position.set(-1,2,3);this.scene.add(light,this.root);this.root.matrixAutoUpdate=false;this.replace();if(!left){this.offhand=new FirstPersonHand(art,true);this.scene.add(this.offhand.root);}}
    /** Build only the displayed hand or first-person item after the equip transition. */
    replace():void{
        if(this.model)this.items.release(this.model);this.item=this.pending;
        if(this.item)this.model=this.items.held(this.item,this.left,true,this.using);
        else {const p=playerParts(this.appearance?.profile.slim).find(p=>p.name==='rightArm')!,texture=this.appearance?'profile:skin':'minecraft:entity/player/wide/steve',g=new Group();g.position.set(...p.pivot.map(n=>n/16) as [number,number,number]);g.rotation.z=.1;g.add(this.items.mesh(playerCube(p.box,texture)),this.items.mesh(playerCube(p.overlay,texture,64,p.inflate)));this.model=g;}
        this.root.add(this.model);
        this.root.visible=!this.left||!!this.item;
    }
    /** Select a committed carrier without treating count-only changes as a new equipped item.
     * @param {string|null} item Selected identity.
     * @param {string|null} offhand Secondary carrier identity.
     */
    select(item:string|null,offhand:string|null=null):void{if(item!==this.pending){this.pending=item;this.swapAt=this.attackAt=this.clock;}this.offhand?.select(offhand);}
    /** Select the native using-item model for the exact active hand.
     * @param {ItemUse} use Shared continuous-use state.
     */
    setUse(use:ItemUse):void{const active=use.hand===(this.left?'offhand':'mainhand')&&use.id===this.pending;this.useTicks=active?use.ticks:0;this.hitFeedback=use.hitFeedback;if(this.using!==active){this.using=active;if(this.item===this.pending)this.replace();}this.offhand?.setUse(use);}
    /** Begin a native attack or interaction swing; block mining uses the interaction animation.
     * @param {boolean} attack Whether to reset the attack charge and use the attack component.
     */
    swing(attack=false):void{const profile=attackProfile(this.pending);if(attack&&profile.stab&&this.charge()<1)return;if(attack)this.attackAt=this.clock;if(this.clock-this.swingAt<this.swingDuration/2)return;this.swingAt=this.clock;this.swingDuration=attack?profile.duration:6;this.stab=attack&&profile.stab;}
    /** Read current active-time attack strength. @return {number} Native normalized strength. */
    charge():number{return attackCharge(this.clock-this.attackAt,this.pending);}
    /** Advance equip and swing transforms, preserving ordered PoseStack multiplication.
     * @param {number} delta Active elapsed milliseconds.
     */
    update(delta:number):void{
        this.offhand?.update(delta);this.clock+=delta/50;const target=this.item!==this.pending?0:this.left?1:attackCharge(this.clock-this.attackAt,this.pending)**3;
        this.height+=Math.max(-.4*delta/50,Math.min(.4*delta/50,target-this.height));if(this.height<.1&&this.item!==this.pending)this.replace();
        const a=Math.min(1,Math.max(0,(this.clock-this.swingAt)/this.swingDuration)),s=a>=1?0:a,sqrt=Math.sqrt(s),m=new Matrix4();
        /** Append translation in the native pose stack. @param {number} x X. @param {number} y Y. @param {number} z Z. */
        const t=(x:number,y:number,z:number):void=>{m.multiply(new Matrix4().makeTranslation(x,y,z));};
        /** Append a native degree rotation. @param {'x'|'y'|'z'} axis Axis. @param {number} angle Degrees. */
        const r=(axis:'x'|'y'|'z',angle:number):void=>{const n=angle*Math.PI/180;m.multiply(axis==='x'?new Matrix4().makeRotationX(n):axis==='y'?new Matrix4().makeRotationY(n):new Matrix4().makeRotationZ(n));};
        const sign=this.left?-1:1,profile=spearProfile(this.item),swapScale=profile?1.95:1;
        if(this.item){t(sign*.56,-.52-(this.using&&profile?0:(1-this.height)*.6*swapScale),-.72);
            if(this.using&&profile){
                const p=spearUsePose(profile,this.useTicks),c=1.70158*1.525,x=p.raise,back=x<.5?(2*x)**2*((c+1)*2*x-c)/2:((2*x-2)**2*((c+1)*(2*x-2)+c)+2)/2;
                t(sign*(p.raise*.15-p.end*.05-p.sway*.1+p.slow*.005),-p.raise*.075+p.middle*.075+p.fast*.01,p.start*.05-p.end*.05+p.slow*.005);
                t(0,.1,0);r('x',-65*back-35*p.lower+100*p.back-.5*p.fast);t(0,-.1,0);
                t(sign*.15,0,0);r('y',-sign*(-90*progress(p.raise,.5,.55)+90*p.sway+2*p.slow));t(-sign*.15,0,0);const feedback=.4*(1-(1-progress(this.hitFeedback,1,3))**4+(Math.cos(Math.PI*progress(this.hitFeedback,3,10))-1)/2);t(0,-feedback,0);
            }else if(!this.using&&s&&this.stab){
                /** Normalize a segment of the native spear animation. @param {number} l Start. @param {number} h End. @return {number} Bounded progress. */
                const p=(l:number,h:number):number=>Math.max(0,Math.min(1,(s-l)/(h-l)));
                const start=-(Math.cos(Math.PI*p(0,.05))-1)/2,x=p(.05,.2)-1,middle=1+2.70158*x**3+1.70158*x*x,e=p(.4,1),end=e===0?0:e===1?1:e<.5?2**(20*e-10)/2:(2-2**(-20*e+10))/2;
                t(sign*.1*(start-middle),-.075*(start-end),.65*(start-middle));r('x',-70*(start-end));t(0,0,-.25*(end-middle));
            }else if(!this.using&&s){t(-sign*.4*Math.sin(sqrt*Math.PI),.2*Math.sin(sqrt*Math.PI*2),-.2*Math.sin(s*Math.PI));r('y',sign*(45-20*Math.sin(s*s*Math.PI)));r('z',-sign*20*Math.sin(sqrt*Math.PI));r('x',-80*Math.sin(sqrt*Math.PI));r('y',-sign*45);}
        }else {t(.64000005-.3*Math.sin(sqrt*Math.PI),-.6+.4*Math.sin(sqrt*Math.PI*2)-(1-this.height)*.6,-.71999997-.4*Math.sin(s*Math.PI));r('y',45);r('y',70*Math.sin(sqrt*Math.PI));r('z',-20*Math.sin(s*s*Math.PI));t(-1,3.6,3.5);r('z',120);r('x',200);r('y',-135);t(5.6,0,0);}
        this.root.matrix.copy(m);this.items.update(this.clock*50);
    }
    /** Draw the hand after clearing only world depth, with native hand FOV.
     * @param {WebGLRenderer} renderer Shared world renderer.
     * @param {Matrix4} bob Native projection-space walking transform.
     */
    render(renderer:WebGLRenderer,bob=new Matrix4()):void{const size=renderer.getSize(new Vector2());this.camera.aspect=size.x/size.y;this.camera.updateProjectionMatrix();this.camera.projectionMatrix.multiply(bob);const clear=renderer.autoClear;renderer.autoClear=false;try{renderer.clearDepth();renderer.render(this.scene,this.camera);}finally{renderer.autoClear=clear;}renderer.domElement.dataset.hand=JSON.stringify({item:this.item,equip:this.height,swing:(this.clock-this.swingAt)/this.swingDuration,charge:this.charge(),profile:attackProfile(this.pending),using:this.using,offhand:{item:this.offhand?.item,using:this.offhand?.using,equip:this.offhand?.height}});}
    /** Release only owned first-person geometry and materials. */
    dispose():void{this.offhand?.dispose();if(this.model)this.items.release(this.model);this.items.dispose();}
}
