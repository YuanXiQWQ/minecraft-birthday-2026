/** Shared native player geometry for inventory and third-person rendering. */
import {Group,Quaternion,Vector3} from 'three';
import {PlayerItems} from './player-items.ts';
import {PLAYER_PARTS,playerParts,playerCube,armorParts} from './player-model.ts';
import type {PartName} from './player-model.ts';
import type {CatalogueArt} from './icons.ts';
import type {PlayerLayout} from '../domain/inventory.ts';
import type {Rules} from '../rules/types.ts';
import type {PlayerAppearance} from './player-profile.ts';
/** Own geometry and materials while keeping all appearance changes atomic. */
export class PlayerAvatar {
    native=new Group();parts=new Map<PartName,Group>();armor=new Group();hands:Group[]=[];items:PlayerItems;signature='';appearance:PlayerAppearance|null=null;cape:Group|null=null;layout:PlayerLayout|null=null;
    /** Create the fallback avatar. @param {CatalogueArt} art Audited assets. @param {Rules} rules Equipment rules. */
    constructor(public art:CatalogueArt,public rules:Rules){this.items=new PlayerItems(art);this.rebuild();}
    /** Rebuild only skin geometry, retaining equipment and independently owned textures. */
    rebuild():void{
        for(const g of this.parts.values())this.items.release(g);this.parts.clear();if(this.cape)this.items.release(this.cape);this.cape=null;
        const texture=this.appearance?'profile:skin':'minecraft:entity/player/wide/steve';
        for(const p of playerParts(this.appearance?.profile.slim)){const g=new Group();g.name=p.name;g.position.set(...p.pivot.map(n=>n/16) as [number,number,number]);g.add(this.items.mesh(playerCube(p.box,texture)),this.items.mesh(playerCube(p.overlay,texture,64,p.inflate)));this.parts.set(p.name,g);this.native.add(g);}
        this.native.add(this.armor);
        if(this.appearance?.cape){this.cape=new Group();this.cape.position.set(0,0,2/16);this.cape.add(this.items.mesh(playerCube([-5,0,-1,10,16,1,0,0],'profile:cape',32)));this.parts.get('body')!.add(this.cape);this.poseCape();}
        this.signature='';if(this.layout)this.sync(this.layout);
    }
    /** Atomically replace skin/cape pixels and model width, releasing old GPU textures.
     * @param {PlayerAppearance|null} appearance Complete profile or fallback.
     */
    setAppearance(appearance:PlayerAppearance|null):void{if(this.appearance===appearance)return;this.appearance=appearance;this.items.setProfileTexture('skin',appearance?.skin);this.items.setProfileTexture('cape',appearance?.cape);this.rebuild();}
    /** Apply the native cape quaternion chain and chest-armor offset.
     * @param {number} lean Forward lag in degrees.
     * @param {number} flap Vertical lag/walking in degrees.
     * @param {number} side Sideways lag in degrees.
     */
    poseCape(lean=0,flap=0,side=0):void{if(!this.cape)return;const r=Math.PI/180,q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI);q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.PI)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),(6+lean/2+flap)*r)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),side/2*r)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),(180-side/2)*r));this.cape.quaternion.copy(q);this.cape.position.set(0,this.layout?.equipment.chest?-.053125:0,2/16+(this.layout?.equipment.chest?.06875:0));}
    /** Synchronize armor and true hand-context geometry from the latest saved effective player layout.
     * @param {PlayerLayout} layout Last accepted persistent layout.
     */
    sync(layout: PlayerLayout): void {
        this.layout=layout;this.poseCape();
        const signature = JSON.stringify([layout.equipment, layout.hotbar[layout.selected]]);
        if (this.signature === signature) return;
        this.signature = signature;
        for (const h of this.hands) this.items.release(h);
        this.hands = [];
        for (const child of [...this.armor.children]) this.items.release(child as Group);
        for (const p of PLAYER_PARTS) this.parts.get(p.name)!.rotation.set(0, 0, 0);
        for (const [slot, stack] of Object.entries(layout.equipment)) {
            if (!stack || slot === 'offhand') continue;
            if (this.rules.items[stack.id]?.equipment !== slot) throw Error('invalid-preview-equipment');
            const equipment = this.art.documents.get('player-equipment-bindings')?.[stack.id];
            if (!equipment) throw Error('unsupported-preview-equipment:' + stack.id);
            const layer = slot === 'legs' ? 'humanoid_leggings' : 'humanoid',
                definition = this.art.documents.get('assets/minecraft/equipment/' + equipment.split(':')[1] + '.json');
            for (const entry of definition.layers[layer]) for (const name of armorParts(slot)) {
                const p = PLAYER_PARTS.find(p => p.name === name)!, leg = name === 'rightLeg' || name === 'leftLeg',
                    box = leg ? [...p.box.slice(0, 6), 0, 16] : name === 'leftArm' ? [-1, -2, -2, 4, 12, 4, 40, 16] : p.box,
                    inflate = (slot === 'legs' ? .5 : 1) - (leg ? .1 : 0),
                    texture = 'minecraft:entity/equipment/' + layer + '/' + entry.texture.split(':').at(-1),
                    g = new Group();
                g.position.copy(this.parts.get(name)!.position);
                const mesh = this.items.mesh(playerCube(box, texture, 32, inflate, name === 'leftArm' || name === 'leftLeg'));
                g.add(mesh);
                g.userData.part = name;
                this.armor.add(g);
            }
        }
        for (const [left, stack] of [[false, layout.hotbar[layout.selected]], [true, layout.equipment.offhand]] as const) {
            const part = this.parts.get(left ? 'leftArm' : 'rightArm')!;
            if (!stack) continue;
            part.rotation.x = -Math.PI / 10;
            const hand = new Group(), offset = new Group();
            hand.rotation.set(-Math.PI / 2, Math.PI, 0);
            offset.position.set((left ? -1 : 1) / 16, 2 / 16, -10 / 16);
            hand.add(offset);
            offset.add(this.items.held(stack.id, left));
            part.add(hand);
            this.hands.push(hand);
        }
        for (const g of this.armor.children) g.rotation.copy(this.parts.get(g.userData.part)!.rotation);
    }


    /** Release every owned instance and cached material. */
    dispose():void{this.items.release(this.native);this.items.dispose();}
}
