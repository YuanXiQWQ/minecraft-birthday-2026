/** Original heart sprites show successful feeding and active animal love windows. */
import {CanvasTexture,Group,NearestFilter,Sprite,SpriteMaterial,SRGBColorSpace} from 'three';
import type {Resources} from './resources.ts';
import type {Progress} from '../domain/types.ts';
import type {FarmAnimal} from '../domain/farm-life.ts';
import {animalCare} from '../domain/husbandry.ts';
/** Client-only heart particles, never stored in the durable world. */
export class AnimalHearts {
    root=new Group();texture:CanvasTexture;last=0;remainder=0;tick=0;owner='';seen=new Map<string,number>();particles:{sprite:Sprite;age:number;velocity:number[]}[]=[];
    /** Load the original native particle texture. @param {Resources} pack Verified pixels. */
    constructor(pack:Resources){this.texture=new CanvasTexture(pack.guiImages.get('assets/minecraft/textures/particle/heart.png')!);this.texture.minFilter=this.texture.magFilter=NearestFilter;this.texture.colorSpace=SRGBColorSpace;}
    /** Emit initial feeding hearts and native periodic love particles. @param {number} now Frame time. @param {Progress} p World. @param {Map<string,FarmAnimal>} animals Live positions. @param {boolean} paused Simulation pause. */
    update(now:number,p:Progress,animals:Map<string,FarmAnimal>,paused:boolean):void{
        if(this.owner!==p.scene){this.clear();this.owner=p.scene;}
        const elapsed=this.last?Math.min(250,now-this.last):0;this.last=now;if(paused){this.remainder=0;return;}this.remainder+=elapsed;
        while(this.remainder>=50){this.remainder-=50;this.tick++;
            for(const [id,animal] of animals){const love=animalCare(p,id).loveUntil;if(love<=p.world.tick){this.seen.delete(id);continue;}const first=this.seen.get(id)!==love;this.seen.set(id,love);if(!first&&this.tick%10)continue;
                for(let i=0;i<(first?7:1);i++){const sprite=new Sprite(new SpriteMaterial({map:this.texture,transparent:true,depthWrite:false})),width=animal.kind==='cow'?.9:.4,height=animal.kind==='cow'?1.4:.7;sprite.position.set(animal.feet[0]+(Math.random()-.5)*width,animal.feet[1]+Math.random()*height+.5,animal.feet[2]+(Math.random()-.5)*width);sprite.scale.setScalar(.3);this.root.add(sprite);this.particles.push({sprite,age:0,velocity:[(Math.random()-.5)*.04,.1,(Math.random()-.5)*.04]});}
            }
            this.particles=this.particles.filter(particle=>{if(++particle.age>=16){particle.sprite.removeFromParent();particle.sprite.material.dispose();return false;}particle.sprite.position.x+=particle.velocity[0];particle.sprite.position.y+=particle.velocity[1];particle.sprite.position.z+=particle.velocity[2];particle.velocity=particle.velocity.map(v=>v*.86);return true;});
        }
    }
    /** Clear particles and feeding identity when leaving a scene. */
    clear():void{for(const p of this.particles){p.sprite.removeFromParent();p.sprite.material.dispose();}this.particles=[];this.seen.clear();this.last=this.remainder=0;}
    /** Release the particle texture and owned materials. */
    dispose():void{this.clear();this.texture.dispose();this.root.removeFromParent();}
}
