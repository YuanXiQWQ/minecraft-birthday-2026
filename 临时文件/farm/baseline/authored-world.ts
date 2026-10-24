/** Authored native block scenery and Java-derived animal cuboids, independent from persistent simulation. */
import {Group, InstancedMesh, Matrix4, Mesh, Vector3} from 'three';
import type {SceneId, Progress, Cell} from '../domain/types.ts';
import {caveLayout, caveFixed} from '../domain/cave-shape.ts';
import {WORLD_SCENES, cropAge, caveExcavated, caveCleared} from '../domain/world-config.ts';
import type {VanillaModels} from './vanilla-models.ts';
import type {Resources} from './resources.ts';
import animals from '../data/animal-models.json' with {type: 'json'};
import {playerCube} from '../ui/player-model.ts';
import {PlayerItems} from '../ui/player-items.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import {DISTANT_OAKS, PLAINS_OAKS, oakCrown, plainsHeight, plainsPlants, retainedPlainsSupports} from '../domain/plains-shape.ts';
import {plainsTerrain, exposedModel} from './plains-terrain.ts';
import type {Sample} from './resources.ts';

/** Build bounded authored geometry; scenery is never implicitly registered as a harvest source. */
export class AuthoredWorld {
    staticRoot = new Group();
    natural = new Group();
    crops = new Group();
    signature = '';
    /** Static collision geometry changes only when terrain or source-linked decoration changes. */
    staticVersion = 0;
    plainsSignature = '';
    caveRoot: Group | null = null;
    caveSignature = '[]';
    caveLights: Cell[] = [];
    plainsDecor: Group | null = null;

    /** Retain the shared native material factory. @param {VanillaModels} models Native model ownership. @param {Resources} resources Verified pixels and documents. */
    constructor(public models: VanillaModels, public resources: Resources) {
    }

    /** Select a declared native block state. @param {string} block Original block. @param {string} state Optional native state fragment. @return {Group} Owned model geometry. */
    block(block: string, state = ''): Group {
        const sample = this.resources.samples.find(s => s.block === block && s.state.includes(state));
        if (!sample) throw Error('world-model:' + block + state);
        return this.models.sample(sample);
    }

    /** Instance every mesh part with original transforms, UVs and shared materials.
     * @param {string} block Native model.
     * @param {Cell[]} cells World coordinates.
     * @param {Group} parent Owner.
     * @param {string} id Ray identity; decoration uses render-only layer 1.
     * @param {string} state Native blockstate fragment.
     * @param {Sample} sample Optional exposed-face native model.
     */
    batch(block: string, cells: Cell[], parent = this.staticRoot, id = 'scenery', state = '', sample?: Sample): void {
        if (!cells.length) return;
        const root = sample ? this.models.sample(sample) : this.block(block, state);
        root.updateMatrixWorld(true);
        root.traverse(source => {
            if (!(source instanceof Mesh)) return;
            const mesh = new InstancedMesh(source.geometry, source.material, cells.length);
            cells.forEach((c, i) => mesh.setMatrixAt(i, new Matrix4().makeTranslation(...c).multiply(source.matrixWorld)));
            mesh.userData.id = id;
            mesh.userData.block = block;
            mesh.userData.cells = structuredClone(cells);
            mesh.userData.blocksRain = !['short_grass', 'tall_grass', 'dandelion', 'poppy', 'oxeye_daisy', 'cornflower', 'azure_bluet'].includes(block);
            if (id === 'decoration') mesh.layers.set(1);
            parent.add(mesh);
        });
    }

    /** Build native grass and exposed dirt terraces without submitting buried cube faces. */
    plainsGround(): void {
        for (const batch of plainsTerrain()) {
            const source = this.resources.samples.find(s => s.block === batch.block)!;
            const sample = {...source, compiled: exposedModel(source.compiled, batch.faces)};
            /** Keep rays bounded to the unchanged build region; surrounding terrain remains render-only.
             * @param {Cell} c Native block coordinate.
             * @return {boolean} Whether this surface can support a legal device.
             */
            const reachable = (c: Cell) => c[0] >= -18 && c[0] <= 18 && c[2] >= -22 && c[2] <= 10;
            this.batch(batch.block, batch.cells.filter(reachable), this.staticRoot, 'ground', '', sample);
            this.batch(batch.block, batch.cells.filter(c => !reachable(c)), this.staticRoot, 'decoration', '', sample);
        }
        const leaves: Cell[] = [], trunks: Cell[] = [];
        DISTANT_OAKS.forEach(([x, z, height], i) => {
            const y = plainsHeight(x, z);
            for (let dy = 0; dy < height; dy++) trunks.push([x, y + dy, z]);
            leaves.push(...oakCrown([x, y, z], height - 1, i + 3).filter(c => c[0] !== x || c[2] !== z || c[1] >= y + height));
        });
        this.batch('oak_log', trunks, this.staticRoot, 'decoration');
        this.batch('oak_leaves', leaves, this.staticRoot, 'decoration');
        this.plainsDecor = new Group();
        this.staticRoot.add(this.plainsDecor);
    }

    /** Rebuild the cave shell, supported decoration and local light anchors as one layout.
     * @param {Cell[]} stations Saved device cells protected by the cave compatibility envelope.
     * @param {Cell[]} excavated Persisted mined cells determine exposed backing and torch support.
     */
    caveScenery(stations: Cell[], excavated: Cell[] = []): void {
        if (!this.caveRoot) return;
        this.staticVersion++;
        this.clear(this.caveRoot);
        const layout = caveLayout(stations, WORLD_SCENES.cave.eye, excavated);
        this.batch('stone', layout.stone.filter(caveFixed), this.caveRoot);
        this.batch('oak_log', layout.wood.filter(c => c[1] < 3), this.caveRoot);
        this.batch('oak_planks', layout.wood.filter(c => c[1] === 3), this.caveRoot);
        for (const torch of layout.torches) {
            this.batch('wall_torch', [torch.cell], this.caveRoot, 'scenery', 'facing=' + torch.facing);
            this.caveRoot.children.at(-1)!.userData.support = false;
        }
        this.caveLights = layout.torches.map(t => t.light);
    }

    /** Project source-linked crowns and decorative plants around persisted workstation footprints.
     * @param {Progress} p Current authoritative source and station facts.
     */
    plainsDecoration(p: Progress): void {
        if (!this.plainsDecor) return;
        const signature = JSON.stringify([p.world.visits.plains.removed.filter(id => id.startsWith('oak_log:')), p.scenes.plains.stations.map(s => s.cell), p.scenes.plains.blocks?.map(b => b.cell)]);
        if (signature === this.plainsSignature) return;
        this.plainsSignature = signature;
        this.staticVersion++;
        this.clear(this.plainsDecor);
        const stations = [...p.scenes.plains.stations,...(p.scenes.plains.blocks??[])], removed = p.world.visits.plains.removed;
        /** Exclude complete device cells from the decorative canopy.
         * @param {Cell} c Candidate leaf coordinate.
         * @return {boolean} Whether a saved device occupies this cell.
         */
        const occupied = (c: Cell) => stations.some(s => s.cell.every((n, i) => n === c[i]));
        const leaves = PLAINS_OAKS.flatMap((base, i) => [0, 1, 2].every(dy => removed.includes('oak_log:' + (i * 3 + dy))) ? [] : oakCrown(base, 3, i)).filter(c => !occupied(c));
        this.batch('oak_leaves', leaves, this.plainsDecor, 'decoration');
        this.batch('oak_log', retainedPlainsSupports(stations.map(s => s.cell)), this.plainsDecor, 'scenery');
        const plants = plainsPlants([...WORLD_SCENES.plains.nodes.filter(n=>!n.id.startsWith('meadow:')).map(n => n.cell), ...stations.map(s => s.cell)]).filter(plant=>!WORLD_SCENES.plains.nodes.some(n=>n.renderCell&&n.renderCell[0]===plant.cell[0]&&n.renderCell[2]===plant.cell[2]));
        const groups = new Map<string, {block: string; state: string; cells: Cell[]}>();
        for (const plant of plants) {
            const key = plant.block + plant.state;
            if (!groups.has(key)) groups.set(key, {...plant, cells: []});
            groups.get(key)!.cells.push(plant.cell);
        }
        for (const group of groups.values()) this.batch(group.block, group.cells, this.plainsDecor, 'decoration', group.state);
    }

    /** Assemble the native animal hierarchy with downward-Y Java model coordinates. @param {'cow'|'chicken'} kind Adult entity. @return {Group} Native UV-mapped cuboids. */
    animal(kind: 'cow' | 'chicken'): Group {
        const data = animals[kind], root = new Group();
        root.scale.set(1, -1, 1);
        root.position.set(.5, 1.5, .5);
        root.rotation.y = Math.PI;
        for (const part of data.parts) {
            const pivot = new Group();
            pivot.position.set(...part.pivot.map(n => n / 16) as Cell);
            if ('rotation' in part) pivot.rotation.set(...part.rotation as Cell);
            for (const box of part.boxes) {
                const compiled = playerCube(box, data.texture, data.height, 0, 'mirror' in part && !!part.mirror);
                pivot.add(this.models.sample({id: kind, block: kind, state: '', variant: {model: kind}, compiled}));
            }
            root.add(pivot);
        }
        return root;
    }

    /** Make an actual alpha-edge-extruded native egg item, with visible front and back. @return {Group} Small three-dimensional item geometry. */
    egg(): Group {
        const builder = new PlayerItems({images: this.resources.guiImages} as CatalogueArt),
            compiled = builder.generated('minecraft:item/egg');
        for (const f of compiled.faces) delete f.tintindex;
        const root = this.models.sample({id: 'world-egg', block: 'egg', state: '', variant: {model: 'egg'}, compiled});
        root.scale.setScalar(.55);
        root.position.set(.2, .05, .2);
        root.rotation.y = .3;
        return root;
    }

    /** Build distinct authored terrain and static native entities. @param {SceneId} id Scene identity. */
    build(id: SceneId): void {
        this.staticVersion++;
        this.plainsSignature = '';
        this.clear(this.staticRoot);
        this.clear(this.natural);
        this.clear(this.crops);
        this.signature = '';
        this.plainsDecor = null;
        this.caveRoot = null; this.caveSignature = '[]';
        const spec = WORLD_SCENES[id], floor: Cell[] = [], pad: Cell[] = [];
        for (let x = -18; x <= 18; x++) for (let z = -22; z <= 10; z++) {
            if (id !== 'farm' || !spec.plots.some(c => c[0] === x && c[2] === z) && !(x === 8 && z >= -5 && z <= 0)) {
                floor.push([x, -1, z]);
            }
        }
        if (id === 'plains') this.plainsGround();
        else this.batch(spec.floor, floor, this.staticRoot, 'ground');
        this.batch(id === 'cave' ? 'oak_planks' : 'cobblestone', pad, this.staticRoot, 'ground');
        if (id === 'cave') {
            this.caveRoot = new Group(); this.staticRoot.add(this.caveRoot);
            this.caveScenery([]);
        }
        if (id === 'farm') {
            const barn: Cell[] = [];
            for (let x = -10; x <= -7; x++) for (let y = 0; y < 4; y++) barn.push([x, y, -12]);
            for (const x of [-11, -6]) for (let z = -12; z <= -8; z++) for (let y = 0; y < 4; y++) barn.push([x, y, z]);
            for (let x = -11; x <= -6; x++) for (let z = -12; z <= -8; z++) barn.push([x, 4, z]);
            this.batch('oak_planks', barn);
            for (const cell of spec.plots) {
                const plot = this.block('farmland');
                plot.position.set(cell[0], -1, cell[2]);
                plot.userData.id = 'plot:' + cell.join(',');
                plot.userData.cell = [cell[0], -1, cell[2]];
                this.staticRoot.add(plot);
            }
            const animal = this.animal('chicken');
            animal.position.add(new Vector3(4, 0, -4));
            animal.userData.id = 'chicken';
            this.staticRoot.add(animal);
            const second = this.animal('chicken');
            second.position.add(new Vector3(6, 0, -5));
            second.rotation.y = .6;
            second.userData.id = 'chicken';
            this.staticRoot.add(second);
            const path: Cell[] = [];
            for (let z = 1; z >= -12; z--) path.push([-1, -1, z]);
            this.batch('dirt_path', path);
            const water = this.block('stone');
            const mesh = water.children[0] as Mesh;
            mesh.material = this.models.materials.get('minecraft:block/water_still')!;
            water.position.set(8, -.85, -5);
            water.scale.set(1, .5, 6);
            water.userData.id = 'water';
            water.userData.support = false;
            this.staticRoot.add(water);
        }
        if (id === 'home') {
            const walls: Cell[] = [];
            for (let x = -11; x <= 11; x++) for (let y = 0; y < 6; y++) if (!(Math.abs(x) < 4 && y > 1 && y < 5)) walls.push([x, y, -9]);
            for (const x of [-11, 11]) for (let z = -8; z <= 5; z++) for (let y = 0; y < 6; y++) walls.push([x, y, z]);
            this.batch('oak_planks', walls);
            for (let x = -1; x <= 1; x++) for (let z = 0; z <= 1; z++) {
                const top = this.models.sample(this.resources.samples.find(s => s.id === 'tabletop')!);
                top.position.set(x - .5, 1, z - 4);
                top.userData.id = 'birthday-table';
                this.staticRoot.add(top);
            }
            for (const x of [-1.2, 1.2]) for (const z of [-3.75, -2.25]) {
                const leg = this.models.sample(this.resources.samples.find(s => s.id === 'leg')!);
                leg.position.set(x - .5, 0, z - .5);
                leg.userData.id = 'birthday-table';
                this.staticRoot.add(leg);
            }
        }
    }

    /** Retain source and crop objects whose identity and growth stage are unchanged across committed edits.
     * @param {Progress} p Current durable facts.
     */
    sync(p: Progress): void {
        const id = p.scene, spec = WORLD_SCENES[id], removed = p.world.visits[id].removed, crops = p.scenes[id].crops,
            stations = p.scenes[id].stations,
            signature = JSON.stringify([removed, stations.map(s => s.cell),p.scenes[id].blocks, crops.map(c => [c.id, cropAge(c.growth.version === 1 ? c.growth.data.ticks : 0)])]);
        if (id === 'cave' && this.caveRoot) {
            const layout = JSON.stringify([stations.map(s=>s.cell), removed]);
            if (layout !== this.caveSignature) {this.caveSignature = layout; this.caveScenery(stations.map(s=>s.cell), caveExcavated(p));}
        }
        if (signature === this.signature) return;
        this.signature = signature;
        if (id === 'plains') this.plainsDecoration(p);
        const caveVisible = id === 'cave' ? new Set(caveLayout(stations.map(s=>s.cell), spec.eye, caveExcavated(p)).stone.map(c=>c.join(','))) : null;
        const carved = id === 'cave' ? caveCleared(p) : null;
        const visible = spec.nodes.filter(n=>!p.scenes[id].blocks?.some(b=>b.cell.every((v,i)=>v===n.cell[i])) && !removed.includes(n.id) && !stations.some(s=>s.cell.every((v,i)=>v===n.cell[i])) && !carved?.has(n.cell.join(',')) && (!n.id.startsWith('rock:') || caveVisible?.has(n.cell.join(','))));
        const wanted = new Set(visible.map(n=>'node:'+n.id));
        const retained = this.natural.children.filter(o=>wanted.has(o.userData.id));
        for (const root of retained) root.removeFromParent();
        this.clear(this.natural);
        if (retained.length) this.natural.add(...retained);
        const cropStages = new Map(crops.map(c => ['crop:' + c.id, cropAge(c.growth.version === 1 ? c.growth.data.ticks : 0)]));
        const retainedCrops = this.crops.children.filter(o => cropStages.get(o.userData.id) === o.userData.cropAge);
        for (const root of retainedCrops) root.removeFromParent();
        this.clear(this.crops);
        if (retainedCrops.length) this.crops.add(...retainedCrops);
        const existing = new Set(retained.map(o=>o.userData.id));
        for (const n of visible) {
            if (existing.has('node:'+n.id)) continue;
            const root = n.kind === 'cow' ? this.animal('cow') : n.kind === 'egg' ? this.egg() : this.block(n.block,n.block==='tall_grass'?'half=lower':'');
            if(n.block==='tall_grass'){const upper=this.block(n.block,'half=upper');upper.position.y=1;root.add(upper);}
            root.position.add(new Vector3(...(n.renderCell??n.cell)));
            root.userData.id = 'node:' + n.id;root.userData.block=n.block;
            root.userData.cell = [...n.cell];
            this.natural.add(root);
        }
        for (const c of crops) {
            if (retainedCrops.some(o => o.userData.id === 'crop:' + c.id)) continue;
            const root = this.block('wheat', 'age=' + cropAge(c.growth.version === 1 ? c.growth.data.ticks : 0));
            root.position.set(c.cell[0], -.0625, c.cell[2]);
            root.userData.id = 'crop:' + c.id;root.userData.cell=[c.cell[0],0,c.cell[2]];root.userData.block='wheat';
            root.userData.cropAge = cropStages.get(root.userData.id);
            this.crops.add(root);
        }
    }

    /** Release instance-owned geometry while shared materials remain reusable. @param {Group} group Owned scene layer. */
    clear(group: Group): void {
        for (const child of [...group.children]) {
            child.removeFromParent();
            child.traverse(o => {
                if (o instanceof InstancedMesh) o.dispose();
                if (o instanceof Mesh) o.geometry.dispose();
            });
        }
    }

    /** Release all authored scene layers. */
    dispose(): void {
        for (const group of [this.staticRoot, this.natural, this.crops]) this.clear(group);
    }
}
