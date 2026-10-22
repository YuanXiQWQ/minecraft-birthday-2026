/** A single reusable WebGL entity preview is composited into the screen GUI without any input hit surface or animation loop. */
import {Scene, Group, OrthographicCamera, WebGLRenderer, AmbientLight, DirectionalLight} from 'three';
import {PlayerItems} from './player-items.ts';
import {PLAYER_PARTS, PLAYER_WINDOWS, playerCube, playerLook, armorParts} from './player-model.ts';
import type {PartName} from './player-model.ts';
import type {CatalogueArt} from './icons.ts';
import type {PlayerLayout} from '../domain/inventory.ts';
import type {Rules} from '../rules/types.ts';

/** Preview geometry reflects committed layout only; the world renderer and persistent state are never touched. */
export class PlayerPreview {
    renderer: WebGLRenderer;
    scene = new Scene();
    camera = new OrthographicCamera();
    tilt = new Group();
    body = new Group();
    native = new Group();
    parts = new Map<PartName, Group>();
    armor = new Group();
    hands: Group[] = [];
    items: PlayerItems;
    signature = '';
    disposed = false;
    pointer = {x: 0, y: 0};
    look = playerLook(0, 0);
    renders = 0;

    /** Allocate one owned renderer and native wide Steve with all outer skin layers.
     * @param {CatalogueArt} art Audited original resources.
     * @param {Rules} rules Native equipment component slots.
     */
    constructor(public art: CatalogueArt, public rules: Rules) {
        this.items = new PlayerItems(art);
        this.renderer = new WebGLRenderer({alpha: true, antialias: false, preserveDrawingBuffer: true});
        this.renderer.setClearColor(0, 0);
        this.renderer.domElement.className = 'player-entity-preview';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.renderer.domElement.style.cssText = 'position:absolute;pointer-events:none;display:none';
        this.camera.position.set(0, 0, 10);
        this.camera.near = .1;
        this.camera.far = 30;
        this.scene.add(new AmbientLight(0xffffff, .8));
        for (const [x, y, z] of [[-1, 2, 3], [1, 1, -2]]) {
            const l = new DirectionalLight(0xffffff, .6);
            l.position.set(x, y, z);
            this.scene.add(l);
        }
        this.scene.add(this.tilt);
        this.tilt.add(this.body);
        this.body.add(this.native);
        this.native.scale.set(.9375, -.9375, -.9375);
        this.native.position.y = .5;
        for (const p of PLAYER_PARTS) {
            const g = new Group();
            g.name = p.name;
            g.position.set(...p.pivot.map(n => n / 16) as [number, number, number]);
            g.add(this.items.mesh(playerCube(p.box, 'minecraft:entity/player/wide/steve')), this.items.mesh(playerCube(p.overlay, 'minecraft:entity/player/wide/steve', 64, p.inflate)));
            this.parts.set(p.name, g);
            this.native.add(g);
        }
        this.native.add(this.armor);
    }

    /** Synchronize armor and true hand-context geometry from the latest saved effective player layout.
     * @param {PlayerLayout} layout Last accepted persistent layout.
     */
    sync(layout: PlayerLayout): void {
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

    /** Draw within the original entity rectangle, leaving its original panel background untouched.
     * @param {'personal'|'equipment'} kind Original container entity window.
     * @param {number} mouseX Mouse X in panel logical pixels.
     * @param {number} mouseY Mouse Y in panel logical pixels.
     * @param {number} scale Current integer GUI scale; DPR affects only the owned framebuffer.
     * @return {object} Auditable pose, model and bounded renderer statistics.
     */
    draw(kind: 'personal' | 'equipment', mouseX: number, mouseY: number, scale = 1): object {
        const b = PLAYER_WINDOWS[kind];
        this.look = playerLook(mouseX - (b.x + b.width / 2), mouseY - (b.y + b.height / 2));
        this.body.rotation.y = this.look.body;
        this.tilt.rotation.x = this.look.tilt;
        this.parts.get('head')!.rotation.set(this.look.pitch, this.look.head, 0);
        for (const g of this.armor.children) if (g.userData.part === 'head') g.rotation.copy(this.parts.get('head')!.rotation);
        this.camera.left = -b.width / b.scale / 2;
        this.camera.right = -this.camera.left;
        this.camera.top = b.height / b.scale / 2;
        this.camera.bottom = -this.camera.top;
        this.camera.updateProjectionMatrix();
        const ratio = Math.min(globalThis.devicePixelRatio ?? 1, 2);
        if (this.renderer.domElement.width !== Math.floor(b.width * scale * ratio) || this.renderer.domElement.height !== Math.floor(b.height * scale * ratio)) {
            this.renderer.setPixelRatio(ratio);
            this.renderer.setSize(b.width * scale, b.height * scale, false);
        }
        Object.assign(this.renderer.domElement.style, {
            display: 'block',
            left: b.x * scale + 'px',
            top: b.y * scale + 'px',
            width: b.width * scale + 'px',
            height: b.height * scale + 'px'
        });
        this.items.update(performance.now());
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renders++;
        return {
            skin: 'minecraft:entity/player/wide/steve',
            window: b,
            framebuffer: [this.renderer.domElement.width, this.renderer.domElement.height],
            look: this.look,
            layout: this.signature,
            parts: [...this.parts.keys()],
            outerLayers: 6,
            hands: this.hands.length,
            armorParts: this.armor.children.length,
            renders: this.renders,
            geometries: this.renderer.info.memory.geometries,
            textures: this.renderer.info.memory.textures,
            animatedTextures: this.items.animations.size,
            calls: this.renderer.info.render.calls
        };
    }

    /** Hide the display surface without releasing reusable geometry or starting background updates. */
    hide(): void {
        this.renderer.domElement.style.display = 'none';
    }

    /** Release this renderer and all owned geometry/materials once; no RAF or listeners are owned here. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.items.release(this.tilt);
        this.items.dispose();
        this.renderer.domElement.remove();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }
}
