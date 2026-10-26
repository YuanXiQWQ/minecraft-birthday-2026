/** Render committed native egg flights and item-fragment impacts on the world's simulation clock. */
import {CanvasTexture,Group,NearestFilter,Sprite,SpriteMaterial,SRGBColorSpace} from 'three';
import type {Camera} from 'three';
import type {CatalogueArt} from '../ui/icons.ts';
import type {Cell} from '../domain/types.ts';
import {clip} from '../domain/player-motion.ts';
import type {Bounds} from '../domain/player-motion.ts';
import {EggProjectile,eggHatch,eggHatchPosition} from '../domain/egg-projectile.ts';

/** Own projectile sprites and fragment lifetimes without a second timer. */
export class EggProjectiles {
    root=new Group();flights:{flight:EggProjectile;sprite:Sprite}[]=[];
    particles:{sprite:Sprite;velocity:Cell;age:number;life:number}[]=[];
    texture:CanvasTexture;material:SpriteMaterial;
    /** Bind original egg pixels to an unfiltered billboard material.
     * @param {CatalogueArt} art Verified item textures.
     */
    constructor(art:CatalogueArt){this.texture=new CanvasTexture(art.images.get('assets/minecraft/textures/item/egg.png')!);this.texture.magFilter=this.texture.minFilter=NearestFilter;this.texture.colorSpace=SRGBColorSpace;this.material=new SpriteMaterial({map:this.texture,alphaTest:.1});}
    /** Add the visual counterpart of one successfully consumed egg.
     * @param {Cell} eye Player eye at input.
     * @param {Cell} direction Unit look direction.
     * @param {Cell} movement Known movement per tick.
     * @param {boolean} grounded Whether the player is grounded.
     */
    launch(eye:Cell,direction:Cell,movement:Cell,grounded:boolean):void{const flight=new EggProjectile(eye,direction,movement,grounded),sprite=new Sprite(this.material);sprite.scale.setScalar(.5);sprite.position.set(...flight.position);this.root.add(sprite);this.flights.push({flight,sprite});}
    /** Spawn the eight native item particles using separate quarter-texture fragments.
     * @param {Cell} point Impact position.
     */
    burst(point:Cell):void{for(let i=0;i<8;i++){const map=this.texture.clone();map.repeat.set(-.25,.25);map.offset.set(.25+Math.random()*.75,Math.random()*.75);const material=new SpriteMaterial({map,alphaTest:.1}),sprite=new Sprite(material);sprite.position.set(...point);sprite.scale.setScalar(.2*(Math.random()*.5+.5));this.root.add(sprite);const raw=[(Math.random()*2-1)*.4,(Math.random()*2-1)*.4,(Math.random()*2-1)*.4],scale=(Math.random()+Math.random()+1)*.15/(Math.hypot(...raw)||1)*.04;this.particles.push({sprite,velocity:raw.map((v,i)=>v*scale+(i===1?.01:0)+(Math.random()-.5)*.08) as Cell,age:0,life:Math.floor(4/(Math.random()*.9+.1))});}}
    /** Simulate each projectile once, emitting exactly one hatch roll per impact.
     * @param {Bounds[]} solids Native colliders.
     * @param {Bounds[]} entities Living colliders.
     * @param {Cell[]} water Effective water cells.
     * @param {Function} impact Callback for committed hatch creation.
     */
    tick(solids:Bounds[],entities:Bounds[],water:Cell[],impact:(point:Cell,count:number,entity:number,spawn:Cell|null)=>void):void{
        for(const p of this.flights){const hit=p.flight.tick(solids,entities,water);if(hit){this.burst(hit.point);impact(hit.point,eggHatch(),hit.entity,eggHatchPosition(hit.point,solids));}if(!p.flight.alive)p.sprite.removeFromParent();}
        this.flights=this.flights.filter(p=>p.flight.alive);
        for(const p of this.particles){if(p.age++>=p.life){p.sprite.removeFromParent();p.sprite.material.map?.dispose();p.sprite.material.dispose();continue;}p.velocity[1]-=.04;const at=p.sprite.position,box:Bounds=[at.x-.1,at.y,at.z-.1,at.x+.1,at.y+.2,at.z+.1];let ground=false;for(const axis of [1,0,2]){const wanted=p.velocity[axis],moved=clip(box,solids,axis,wanted);box[axis]+=moved;box[axis+3]+=moved;at.setComponent(axis,at.getComponent(axis)+moved);if(moved!==wanted){if(axis===1&&wanted<0)ground=true;p.velocity[axis]=0;}}p.velocity=p.velocity.map((v,i)=>v*Math.fround(.98)*(ground&&i!==1?Math.fround(.7):1)) as Cell;}
        this.particles=this.particles.filter(p=>p.age<=p.life);
    }
    /** Interpolate flight positions and preserve the native initial close-camera visibility rule.
     * @param {number} alpha Fractional tick.
     * @param {Camera} camera Active camera.
     */
    animate(alpha:number,camera:Camera):void{for(const {flight:f,sprite} of this.flights){sprite.position.set(...f.position.map((v,i)=>f.previous[i]+(v-f.previous[i])*alpha) as Cell);sprite.visible=f.age>=2||sprite.position.distanceToSquared(camera.position)>=12.25;}}
    /** Release transient entities when changing worlds or restoring a save. */
    clear():void{for(const p of this.flights)p.sprite.removeFromParent();this.flights=[];for(const p of this.particles){p.sprite.removeFromParent();p.sprite.material.map?.dispose();p.sprite.material.dispose();}this.particles=[];}
    /** Release all owned scene and GPU resources. */
    dispose():void{this.clear();this.root.removeFromParent();this.material.dispose();this.texture.dispose();}
}
