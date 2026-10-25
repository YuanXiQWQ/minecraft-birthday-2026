/** Native first-person arm/item transforms share the world renderer and its visible clock. */
import {Scene,Group,PerspectiveCamera,AmbientLight,DirectionalLight,Matrix4,Vector2} from 'three';
import type {WebGLRenderer} from 'three';
import {PlayerItems} from '../ui/player-items.ts';
import {playerParts,playerCube} from '../ui/player-model.ts';
import type {PlayerAppearance} from '../ui/player-profile.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import {attackCharge,attackProfile} from '../domain/attack.ts';

/** Own native hand geometry and transient animation; no animation state is persisted. */
export class FirstPersonHand {
    appearance:PlayerAppearance|null=null;
    /** Synchronize native model width and hand pixels with the committed player identity.
     * @param {PlayerAppearance|null} appearance Validated profile or fallback.
     */
    setAppearance(appearance:PlayerAppearance|null):void{if(this.appearance===appearance)return;this.appearance=appearance;this.items.setProfileTexture('skin',appearance?.skin);this.replace();}
    scene=new Scene();camera=new PerspectiveCamera(70,1,.01,10);root=new Group();items:PlayerItems;
    item:string|null=null;pending:string|null=null;model:Group|null=null;height=1;clock=0;attackAt=-100;swapAt=-100;swingAt=-100;swingDuration=6;stab=false;
    /** Construct an arm from the same original Steve atlas as the inventory preview.
     * @param {CatalogueArt} art Verified item and skin resources.
     */
    constructor(art:CatalogueArt){this.items=new PlayerItems(art);this.scene.add(new AmbientLight(0xffffff,1));const light=new DirectionalLight(0xffffff,.5);light.position.set(-1,2,3);this.scene.add(light,this.root);this.root.matrixAutoUpdate=false;this.replace();}
    /** Build only the displayed hand or first-person item after the equip transition. */
    replace():void{
        if(this.model)this.items.release(this.model);this.item=this.pending;
        if(this.item)this.model=this.items.held(this.item,false,true);
        else {const p=playerParts(this.appearance?.profile.slim).find(p=>p.name==='rightArm')!,texture=this.appearance?'profile:skin':'minecraft:entity/player/wide/steve',g=new Group();g.position.set(...p.pivot.map(n=>n/16) as [number,number,number]);g.rotation.z=.1;g.add(this.items.mesh(playerCube(p.box,texture)),this.items.mesh(playerCube(p.overlay,texture,64,p.inflate)));this.model=g;}
        this.root.add(this.model);
    }
    /** Select a committed carrier without treating count-only changes as a new equipped item.
     * @param {string|null} item Selected identity.
     */
    select(item:string|null):void{if(item!==this.pending){this.pending=item;this.swapAt=this.attackAt=this.clock;}}
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
        this.clock+=delta/50;const target=this.item!==this.pending?0:attackCharge(this.clock-this.swapAt,this.pending)**3;
        this.height+=Math.max(-.4*delta/50,Math.min(.4*delta/50,target-this.height));if(this.height<.1&&this.item!==this.pending)this.replace();
        const a=Math.min(1,Math.max(0,(this.clock-this.swingAt)/this.swingDuration)),s=a>=1?0:a,sqrt=Math.sqrt(s),m=new Matrix4();
        /** Append translation in the native pose stack. @param {number} x X. @param {number} y Y. @param {number} z Z. */
        const t=(x:number,y:number,z:number):void=>{m.multiply(new Matrix4().makeTranslation(x,y,z));};
        /** Append a native degree rotation. @param {'x'|'y'|'z'} axis Axis. @param {number} angle Degrees. */
        const r=(axis:'x'|'y'|'z',angle:number):void=>{const n=angle*Math.PI/180;m.multiply(axis==='x'?new Matrix4().makeRotationX(n):axis==='y'?new Matrix4().makeRotationY(n):new Matrix4().makeRotationZ(n));};
        if(this.item){t(.56,-.52-(1-this.height)*.6,-.72);
            if(s&&this.stab){
                /** Normalize a segment of the native spear animation. @param {number} l Start. @param {number} h End. @return {number} Bounded progress. */
                const p=(l:number,h:number):number=>Math.max(0,Math.min(1,(s-l)/(h-l)));
                const start=-(Math.cos(Math.PI*p(0,.05))-1)/2,x=p(.05,.2)-1,middle=1+2.70158*x**3+1.70158*x*x,e=p(.4,1),end=e===0?0:e===1?1:e<.5?2**(20*e-10)/2:(2-2**(-20*e+10))/2;
                t(.1*(start-middle),-.075*(start-end),.65*(start-middle));r('x',-70*(start-end));t(0,0,-.25*(end-middle));
            }else if(s){t(-.4*Math.sin(sqrt*Math.PI),.2*Math.sin(sqrt*Math.PI*2),-.2*Math.sin(s*Math.PI));r('y',45-20*Math.sin(s*s*Math.PI));r('z',-20*Math.sin(sqrt*Math.PI));r('x',-80*Math.sin(sqrt*Math.PI));r('y',-45);}
        }else {t(.64000005-.3*Math.sin(sqrt*Math.PI),-.6+.4*Math.sin(sqrt*Math.PI*2)-(1-this.height)*.6,-.71999997-.4*Math.sin(s*Math.PI));r('y',45);r('y',70*Math.sin(sqrt*Math.PI));r('z',-20*Math.sin(s*s*Math.PI));t(-1,3.6,3.5);r('z',120);r('x',200);r('y',-135);t(5.6,0,0);}
        this.root.matrix.copy(m);this.items.update(this.clock*50);
    }
    /** Draw the hand after clearing only world depth, with native hand FOV.
     * @param {WebGLRenderer} renderer Shared world renderer.
     * @param {Matrix4} bob Native projection-space walking transform.
     */
    render(renderer:WebGLRenderer,bob=new Matrix4()):void{const size=renderer.getSize(new Vector2());this.camera.aspect=size.x/size.y;this.camera.updateProjectionMatrix();this.camera.projectionMatrix.multiply(bob);const clear=renderer.autoClear;renderer.autoClear=false;try{renderer.clearDepth();renderer.render(this.scene,this.camera);}finally{renderer.autoClear=clear;}renderer.domElement.dataset.hand=JSON.stringify({item:this.item,equip:this.height,swing:(this.clock-this.swingAt)/this.swingDuration,charge:this.charge(),profile:attackProfile(this.pending)});}
    /** Release only owned first-person geometry and materials. */
    dispose():void{if(this.model)this.items.release(this.model);this.items.dispose();}
}
