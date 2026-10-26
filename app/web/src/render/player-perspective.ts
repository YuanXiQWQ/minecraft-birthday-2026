/** Java camera cycling and shared player geometry; simulation and interaction remain anchored to the player's eyes. */
import {Group,PerspectiveCamera,Raycaster,Vector3,AmbientLight,DirectionalLight,Matrix4} from 'three';
import type {Object3D,Intersection} from 'three';
import {PlayerAvatar} from '../ui/player-avatar.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import type {Rules} from '../rules/types.ts';
import type {PlayerMotion} from '../domain/player-motion.ts';
import {spearProfile,spearUsePose,progress} from '../domain/item-use.ts';
import type {ItemUse} from '../domain/item-use.ts';

export type Perspective=0|1|2;
/** Cycle the native first/back/front ordering. @param {Perspective} value Current view. @return {Perspective} Next view. */
export function nextPerspective(value:Perspective):Perspective{return ((value+1)%3) as Perspective;}
/** Own the world avatar and the independent render camera, never the physical player camera. */
export class PlayerPerspective extends PlayerAvatar {
    root=new Group();camera=new PerspectiveCamera();mode:Perspective=0;ray=new Raycaster();distance=4;
    walkSpeed=0;walkPhase=0;lastFeet=new Vector3();cloak=new Vector3();lastTime=0;initialized=false;
    /** Share the same equipment/skin implementation as the GUI without allocating another renderer.
     * @param {CatalogueArt} art Audited resources.
     * @param {Rules} rules Current equipment rules.
     */
    constructor(art:CatalogueArt,rules:Rules){super(art,rules);const light=new DirectionalLight(0xffffff,.6);light.position.set(-1,2,3);this.root.add(new AmbientLight(0xffffff,.8),light);this.root.add(this.native);this.native.scale.set(.9375,-.9375,-.9375);this.root.visible=false;}
    /** Reset interpolation when teleporting between authored scenes. */
    reset():void{this.initialized=false;this.walkSpeed=this.walkPhase=0;}
    /** Pose the actual equipped body and cape on the existing visible frame clock.
     * @param {PerspectiveCamera} eye Physical camera.
     * @param {PlayerMotion} motion Current travel state.
     * @param {number} now Active animation time in milliseconds.
     * @param {number} swing Normalized interaction swing.
     * @param {ItemUse} use Active hand and elapsed use ticks.
     * @param {boolean} stab Whether the current attack uses the spear animation.
     */
    animate(eye:PerspectiveCamera,motion:PlayerMotion,now:number,swing=0,use?:ItemUse,stab=false):void{
        this.setUsingHand(use?.hand??null);
        const feet=eye.position.clone();feet.y-=motion.crouching?1.27:1.62;
        if(!this.initialized){this.lastFeet.copy(feet);this.cloak.copy(feet);this.lastTime=now;this.initialized=true;}
        const ticks=Math.min(2,Math.max(0,(now-this.lastTime)/50)),dx=feet.x-this.lastFeet.x,dz=feet.z-this.lastFeet.z;
        if(ticks>0){const target=Math.min(1,Math.hypot(dx,dz)*4/ticks);this.walkSpeed+=(target-this.walkSpeed)*(1-Math.pow(.6,ticks));this.walkPhase+=this.walkSpeed*ticks;this.cloak.lerp(feet,1-Math.pow(.75,ticks));}
        this.lastFeet.copy(feet);this.lastTime=now;
        this.root.visible=this.mode!==0;this.root.position.copy(feet);this.root.rotation.y=eye.rotation.y+Math.PI;
        this.native.position.y=24*.9375/16-(motion.crouching?.2:0);
        for(const [name,part] of this.parts){part.position.set(...(name==='head'||name==='body'?[0,0,0]:name.endsWith('Arm')?[(name==='rightArm'?-5:5)/16,(this.appearance?.profile.slim?2.5:2)/16,0]:[(name==='rightLeg'?-1.9:1.9)/16,12/16,0]) as [number,number,number]);part.rotation.set(0,0,0);}
        this.parts.get('head')!.rotation.x=-eye.rotation.x;
        for(const [name,phase] of [['rightLeg',0],['leftLeg',Math.PI],['rightArm',Math.PI],['leftArm',0]] as const)this.parts.get(name)!.rotation.x=Math.cos(this.walkPhase*.6662+phase)*this.walkSpeed*(name.endsWith('Leg')?1.4:1);
        for(const [name,held] of [['rightArm',this.layout?.hotbar[this.layout.selected]],['leftArm',this.layout?.equipment.offhand]] as const){const p=this.parts.get(name)!;if(held)p.rotation.x=p.rotation.x*.5-Math.PI/10;}
        for(const hand of this.hands){hand.rotation.set(-Math.PI/2,Math.PI,0);hand.children[0].position.set((hand.userData.hand==='offhand'?-1:1)/16,2/16,-10/16);hand.children[0].rotation.set(0,0,0);hand.children[0].updateMatrix();}
        if(swing>0&&swing<1&&!use?.hand){
            if(stab){const prepare=-(Math.cos(Math.PI*progress(swing,0,.05))-1)/2,attack=progress(swing,.05,.2)**2,e=progress(swing,.4,1),retract=e===0?0:e===1?1:e<.5?2**(20*e-10)/2:(2-2**(-20*e+10))/2;this.parts.get('rightArm')!.rotation.x+=(90*prepare-120*attack+30*retract)*Math.PI/180;
                const held=this.hands.find(h=>h.userData.hand==='mainhand')?.children[0];if(held){held.updateMatrix();held.matrix.multiply(rotateItem('x',-70*(attack-retract),[0,-.125,.125])).multiply(new Matrix4().makeTranslation(0,.38*(attack-retract),0));held.matrix.decompose(held.position,held.quaternion,held.scale);}
            }else this.parts.get('rightArm')!.rotation.x-=Math.sin(Math.sqrt(swing)*Math.PI)*1.2;
        }
        if(use?.hand){const left=use.hand==='offhand',sign=left?-1:1,arm=this.parts.get(left?'leftArm':'rightArm')!,head=this.parts.get('head')!;
            if(use.id==='minecraft:shield'){arm.rotation.x=arm.rotation.x*.5-.9424779+Math.max(-1.3962634,Math.min(.43633232,head.rotation.x));arm.rotation.y=-sign*Math.PI/6;}
            const profile=spearProfile(use.id);if(profile){const p=spearUsePose(profile,use.ticks);arm.rotation.x=Math.max(-120*Math.PI/180,Math.min(Math.PI/6,-Math.PI/2+head.rotation.x+.8));arm.rotation.y=-.1*sign-sign*p.fast*Math.PI/180*p.intensity;arm.rotation.z=-sign*p.slow*Math.PI/180*p.intensity*.5;arm.rotation.x+=Math.PI/180*(-40*p.start+30*p.middle-20*p.end+20*p.lower+10*p.back+.6*p.slow*p.intensity);
                const held=this.hands.find(h=>h.userData.hand===use.hand)?.children[0];if(held){const x=-p.raise,modified=1-(1+2.70158*x**3+1.70158*x*x);const time=use.hitFeedback,feedback=.4*(1-(1-progress(time,1,3))**4+(Math.cos(Math.PI*progress(time,3,10))-1)/2);held.updateMatrix();held.matrix.multiply(new Matrix4().makeTranslation(0,-feedback*.4,-.38*(modified-p.back)+feedback)).multiply(rotateItem('x',-70*(p.raise-p.back),[0,-.03125,.125])).multiply(rotateItem('y',sign*90*(p.raise-p.sway),[0,0,.125]));held.matrix.decompose(held.position,held.quaternion,held.scale);}
            }
        }
        if(motion.crouching){this.parts.get('body')!.rotation.x=.5;for(const name of ['rightArm','leftArm'] as const)this.parts.get(name)!.rotation.x+=.4;for(const name of ['rightLeg','leftLeg'] as const)this.parts.get(name)!.position.set(this.parts.get(name)!.position.x,12.2/16,4/16);this.parts.get('head')!.position.y=4.2/16;}
        const yaw=eye.rotation.y,lag=this.cloak.clone().sub(feet),forward=-(lag.x*Math.sin(yaw)+lag.z*Math.cos(yaw));
        this.poseCape(Math.max(0,Math.min(150,-forward*100)),Math.max(-6,Math.min(32,lag.y*10))+Math.sin(motion.walk*6)*motion.bob*32+(motion.crouching?25:0),Math.max(-20,Math.min(20,(lag.x*Math.cos(yaw)-lag.z*Math.sin(yaw))*100)));
        for(const g of this.armor.children){const p=this.parts.get(g.userData.part)!;g.position.copy(p.position);g.rotation.copy(p.rotation);}
        this.items.update(now);
    }
    /** Use eight native ±0.1 visual rays to prevent the four-block third-person camera crossing geometry.
     * @param {PerspectiveCamera} eye Physical eye pose and projection.
     * @param {Object3D[]} objects Visual world geometry only.
     * @param {Function} accepts Native alpha/fluid/entity visibility filter.
     * @return {PerspectiveCamera} Render-only camera.
     */
    view(eye:PerspectiveCamera,objects:Object3D[],accepts:(hit:Intersection<Object3D>)=>boolean):PerspectiveCamera{
        this.camera.copy(eye);if(this.mode===0)return eye;
        if(this.mode===2)this.camera.rotation.set(-eye.rotation.x,eye.rotation.y+Math.PI,0,'YXZ');
        const direction=new Vector3(0,0,1).applyQuaternion(this.camera.quaternion);let distance=4;
        for(let i=0;i<8;i++){const origin=eye.position.clone().add(new Vector3((i&1?1:-1)*.1,(i&2?1:-1)*.1,(i&4?1:-1)*.1));this.ray.set(origin,direction);this.ray.far=distance;const hit=this.ray.intersectObjects(objects,true).find(accepts);if(hit)distance=Math.min(distance,hit.point.distanceTo(eye.position));}
        this.distance=distance;this.camera.position.addScaledVector(direction,distance);this.camera.updateMatrixWorld(true);return this.camera;
    }
    /** Release the body and all cached GPU resources. */
    override dispose():void{this.root.removeFromParent();super.dispose();}
}

/** Rotate an item around a native ItemInHandLayer pivot.
 * @param {'x'|'y'} axis Rotation axis.
 * @param {number} degrees Native angle.
 * @param {[number,number,number]} pivot Pivot relative to the hand attachment.
 * @return {Matrix4} Ordered pose-stack rotation.
 */
function rotateItem(axis:'x'|'y',degrees:number,pivot:[number,number,number]):Matrix4{return new Matrix4().makeTranslation(...pivot).multiply(axis==='x'?new Matrix4().makeRotationX(degrees*Math.PI/180):new Matrix4().makeRotationY(degrees*Math.PI/180)).multiply(new Matrix4().makeTranslation(-pivot[0],-pivot[1],-pivot[2]));}
