/** Native campfire particle lifetimes, drift, collision and original random smoke sprites. */
import {CanvasTexture,Group,NearestFilter,Sprite,SpriteMaterial,SRGBColorSpace} from 'three';
import {clip} from '../domain/player-motion.ts';
import type {Bounds} from '../domain/player-motion.ts';
import type {Cell,Progress} from '../domain/types.ts';
import type {Resources} from './resources.ts';

/** One client-only smoke particle; world persistence never stores presentation particles. */
export class SmokePuff {
    age=0;alpha:number;lifetime:number;size:number;position:Cell;velocity:Cell;stopped=false;
    /** Apply CampfireSmokeParticle and SingleQuadParticle native constructor values.
     * @param {Cell} cell Campfire origin.
     * @param {boolean} signal Whether hay supplies signal smoke.
     * @param {Function} random Random source.
     */
    constructor(cell:Cell,signal:boolean,public random:()=>number=Math.random){
        this.position=[cell[0]+.5+random()/3*(random()<.5?-1:1),cell[1]+random()+random(),cell[2]+.5+random()/3*(random()<.5?-1:1)];
        this.velocity=[0,.07+random()/500,0];this.lifetime=(signal?280:80)+Math.floor(random()*50);this.alpha=signal?.95:.9;this.size=1.2*(random()*.5+.5);
    }
    /** Advance one native tick and stop against solid ceilings using a quarter-block particle body.
     * @param {Bounds[]} solids World collision boxes.
     * @return {boolean} Whether the particle remains alive.
     */
    tick(solids:Bounds[]):boolean{
        if(this.age++>=this.lifetime||this.alpha<=0)return false;
        this.velocity[0]+=this.random()/5000*(this.random()<.5?-1:1);this.velocity[2]+=this.random()/5000*(this.random()<.5?-1:1);this.velocity[1]-=.000003;
        if(!this.stopped){
            const [x,y,z]=this.position,box:Bounds=[x-.125,y,z-.125,x+.125,y+.25,z+.125],near=solids.filter(b=>b[0]<x+.5&&b[3]>x-.5&&b[1]<y+.5&&b[4]>y-.5&&b[2]<z+.5&&b[5]>z-.5);
            for(const axis of [1,0,2]){const amount=clip(box,near,axis,this.velocity[axis]);this.position[axis]+=amount;box[axis]+=amount;box[axis+3]+=amount;if(axis===1&&Math.abs(this.velocity[axis])>=.00001&&Math.abs(amount)<.00001)this.stopped=true;}
        }
        if(this.age>=this.lifetime-60&&this.alpha>.01)this.alpha-=.015;
        return true;
    }
}

/** Own native smoke sprites and a paused, bounded twenty-Hz visual clock. */
export class CampfireSmoke {
    root=new Group();textures:CanvasTexture[]=[];particles:{puff:SmokePuff;sprite:Sprite}[]=[];last=0;remainder=0;owner='';
    /** Decode the verified native particle definition and share its original textures.
     * @param {Resources} pack Verified resource pack.
     */
    constructor(pack:Resources){
        const definition=pack.documents.get('assets/minecraft/particles/campfire_cosy_smoke.json');
        for(const id of definition?.textures??[]){const canvas=pack.guiImages.get('assets/minecraft/textures/particle/'+id.replace('minecraft:','')+'.png');if(!canvas)throw Error('missing-campfire-smoke');const texture=new CanvasTexture(canvas);texture.minFilter=texture.magFilter=NearestFilter;texture.colorSpace=SRGBColorSpace;this.textures.push(texture);}
    }
    /** Emit from lit campfires and update smoke independently of the player's sleeping pose.
     * @param {number} now Animation clock.
     * @param {Progress} p Current world.
     * @param {Bounds[]} solids Current physical geometry.
     * @param {boolean} paused Whether client simulation is paused.
     */
    update(now:number,p:Progress,solids:Bounds[],paused:boolean):void{
        if(this.owner!==p.scene){this.clear();this.owner=p.scene;}
        const elapsed=this.last?Math.min(250,now-this.last):0;this.last=now;if(paused){this.remainder=0;return;}this.remainder+=elapsed;
        while(this.remainder>=50){
            this.remainder-=50;
            for(const b of p.scenes[p.scene].blocks??[])if(b.block==='campfire'&&b.state.lit!=='false'&&b.state.waterlogged!=='true'&&Math.random()<.11){
                for(let i=0;i<Math.floor(Math.random()*2)+2;i++){
                    if(this.particles.length>=2048||!this.textures.length)break;
                    const puff=new SmokePuff(b.cell,b.state.signal_fire==='true'),sprite=new Sprite(new SpriteMaterial({map:this.textures[Math.floor(Math.random()*this.textures.length)],transparent:true,depthWrite:false,opacity:puff.alpha}));
                    sprite.scale.setScalar(puff.size);sprite.position.set(...puff.position);this.root.add(sprite);this.particles.push({puff,sprite});
                }
            }
            this.particles=this.particles.filter(({puff,sprite})=>{if(!puff.tick(solids)){sprite.removeFromParent();sprite.material.dispose();return false;}sprite.position.set(...puff.position);sprite.material.opacity=puff.alpha;return true;});
        }
    }
    /** Drop scene-owned particles and reset the visual clock. */
    clear():void{for(const {sprite} of this.particles){sprite.removeFromParent();sprite.material.dispose();}this.particles=[];this.remainder=this.last=0;}
    /** Release particle materials and shared native textures. */
    dispose():void{this.clear();for(const texture of this.textures)texture.dispose();this.root.removeFromParent();}
}
