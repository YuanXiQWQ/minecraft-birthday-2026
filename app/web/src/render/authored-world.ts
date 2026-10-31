/** Authored native block scenery and Java-derived animal cuboids, independent from persistent simulation. */
import {animalCare,animalFood} from '../domain/husbandry.ts';
import {handStack} from '../domain/hands.ts';
import {FarmAnimal,itemMotion,pushAnimals} from '../domain/farm-life.ts';
import type {Bounds,PlayerMotion} from '../domain/player-motion.ts';
import type {SoundOptions} from './world-audio.ts';
import {soils,cropStage} from '../domain/agriculture.ts';
import {Box3, Sphere, Group, InstancedMesh, Matrix4, Mesh, Vector3} from 'three';
import type {SceneId, Progress, Cell} from '../domain/types.ts';
import {caveLayout, caveFixed} from '../domain/cave-shape.ts';
import {WORLD_SCENES, caveExcavated, caveCleared} from '../domain/world-config.ts';
import type {VanillaModels} from './vanilla-models.ts';
import type {Resources} from './resources.ts';
import animals from '../data/animal-models.json' with {type: 'json'};
import {playerCube} from '../ui/player-model.ts';
import {PlayerItems} from '../ui/player-items.ts';
import type {CatalogueArt} from '../ui/icons.ts';
import {DISTANT_OAKS, PLAINS_OAKS, oakCrown, plainsHeight, plainsPlants, retainedPlainsSupports} from '../domain/plains-shape.ts';
import {plainsTerrain, exposedModel} from './plains-terrain.ts';
import type {Sample} from './resources.ts';
import {buildFarm} from './farm-world.ts';
import {patchSoils} from './soil-world.ts';
import type {Soil} from '../domain/soil-state.ts';
import {homeFloor, homeStructure, homeGardenHeight, currentHome, type HomeBlock} from '../domain/home-shape.ts';
import {nativeShapes} from '../domain/block-shapes.ts';
import {glassCells,glassFaces} from './glass-faces.ts';
import type {Face} from './model-format.ts';

/** Build bounded authored geometry; scenery is never implicitly registered as a harvest source. */
export class AuthoredWorld {
    /** Ground items share native model materials for the lifetime of this world view. */
    groundItems?:PlayerItems;
    animals=new Map<string,FarmAnimal>();
    lifeTicks=0;
    staticRoot = new Group();
    natural = new Group();
    crops = new Group();
    signature = '';
    /** Static collision geometry changes only when terrain or source-linked decoration changes. */
    staticVersion = 0;
    homeRoot: Group | null = null;
    homeCells: Map<string,HomeBlock> | null = null;
    homeGlassSignature = '';
    farmRoot: Group | null = null;
    farmSignature = '';
    farmLights: Cell[] = [];
    soilSignature = '[]';
    renderedSoils: Soil[] = [];
    plainsSignature = '';
    caveRoot: Group | null = null;
    caveSignature = '[]';
    caveLights: Cell[] = [];
    plainsDecor: Group | null = null;

    /** Retain shared native materials and optional fixed-camera geometry bounds. @param {VanillaModels} models Native model ownership. @param {Resources} resources Verified pixels and documents. @param {number} homeBack Optional furthest visible home row; the complete roof remains for weather. */
    constructor(public models: VanillaModels, public resources: Resources, public homeBack = Infinity) {
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
            if(block==='glass'){
                source.geometry.boundingBox=new Box3(new Vector3(0,0,0),new Vector3(1,1,1));
                source.geometry.boundingSphere=new Sphere(new Vector3(.5,.5,.5),Math.sqrt(3)/2);
            }
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

    /** Build native grass and exposed dirt terraces without submitting buried cube faces. @param {Progress} p Optional committed soil edits. */
    plainsGround(p?: Progress): void {
        const edits=p?soils(p,'plains'):[],changed=new Set(edits.map(s=>s.cell.join(','))),edges=new Set(edits.flatMap(s=>[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>[s.cell[0]+x,s.cell[1],s.cell[2]+z].join(','))));
        for (const batch of plainsTerrain()) {
            const source = this.resources.samples.find(s => s.block === batch.block)!;
            const sample = {...source, compiled: exposedModel(source.compiled, batch.faces)};
            /** Keep rays bounded to the unchanged build region; surrounding terrain remains render-only.
             * @param {Cell} c Native block coordinate.
             * @return {boolean} Whether this surface can support a legal device.
             */
            const reachable = (c: Cell) => c[0] >= -18 && c[0] <= 18 && c[2] >= -22 && c[2] <= 10;
            const cells=batch.cells.filter(c=>reachable(c)&&!changed.has(c.join(',')));
            this.batch(batch.block, cells.filter(c=>!edges.has(c.join(','))), this.staticRoot, 'ground', '', sample);
            this.batch(batch.block, cells.filter(c=>edges.has(c.join(','))), this.staticRoot, 'ground', '', source);
            this.batch(batch.block, batch.cells.filter(c => !reachable(c)), this.staticRoot, 'decoration', '', sample);
        }
        if(p)for(const soil of soils(p,'plains')){const b=this.block(soil.moisture===null?'dirt':'farmland',soil.moisture===null?'':'moisture='+soil.moisture);b.position.set(...soil.cell);b.userData={id:'ground',block:soil.moisture===null?'dirt':'farmland',cell:soil.cell,state:soil.moisture===null?{}:{moisture:String(soil.moisture)}};this.staticRoot.add(b);}
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

    /** Assemble the native animal hierarchy with downward-Y Java model coordinates. @param {'cow'|'chicken'|'chick'} kind Native adult or baby entity. @return {Group} Native UV-mapped cuboids. */
    animal(kind: 'cow' | 'chicken' | 'chick'): Group {
        const data = animals[kind], root = new Group();
        root.scale.set(1, -1, 1);
        root.position.set(.5, 1.5, .5);
        root.rotation.y = Math.PI;
        for (const part of data.parts) {
            const pivot = new Group(); pivot.name=part.name;
            pivot.position.set(...part.pivot.map(n => n / 16) as Cell);
            if ('rotation' in part) pivot.rotation.set(...part.rotation as Cell);
            for (const box of part.boxes) {
                const compiled = playerCube(box, data.texture, data.height, 0, 'mirror' in part && !!part.mirror,'width' in data?data.width:64);
                pivot.add(this.models.sample({id: kind, block: kind, state: '', variant: {model: kind}, compiled}));
            }
            root.add(pivot);
        }
        return root;
    }

    /** Make an alpha-edge-extruded native ground item, centered on its rotation axis. @param {string} item Native item path. @return {Group} Small three-dimensional item geometry. */
    egg(item='egg'): Group {
        const builder = new PlayerItems({images: this.resources.guiImages} as CatalogueArt),
            compiled = builder.generated('minecraft:item/'+item);
        for (const f of compiled.faces) delete f.tintindex;
        const mesh = this.models.sample({id: 'world-item', block: item, state: '', variant: {model: item}, compiled}),root=new Group();
        mesh.scale.setScalar(.5);mesh.position.set(-.25,0,-.25);root.add(mesh);
        root.position.set(.5,0,.5);root.userData.bobOffset=Math.random()*Math.PI*2;root.traverse(o=>o.layers.set(1));
        return root;
    }

    /** Resolve a dropped stack through its actual item definition and ground display transform.
     * @param {string} id Namespaced item identity, including authored items.
     * @return {Group} Native ground model centered on its bobbing rotation axis.
     */
    groundItem(id:string):Group {
        this.groundItems??=new PlayerItems({images:this.resources.guiImages,documents:this.resources.documents} as CatalogueArt);
        const root=this.groundItems.model(id,'ground');
        root.position.set(.5,0,.5);root.userData.bobOffset=Math.random()*Math.PI*2;root.traverse(o=>o.layers.set(1));
        return root;
    }

    /** Rebuild effective home geometry with the same occupancy used by placement and saved-object clearance.
     * @param {HomeBlock[]} cells Effective room and furniture cells.
     * @param {ReadonlySet<string>} glass All authored and player glass coordinates.
     */
    homeInterior(cells:HomeBlock[],glass:ReadonlySet<string>=new Set(cells.filter(b=>b.block==='glass').map(b=>b.cell.join(',')))):void {
        if(!this.homeRoot)return;
        this.clear(this.homeRoot);this.staticVersion++;
        const groups = new Map<string, {block:string; state:string; cells:Cell[]; faces?:Face[]}>();
        for (const {block,state,cell} of cells) {
            if(cell[2]>this.homeBack&&cell[1]<7)continue;
            if(block==='oak_stairs'){
                const object=this.block(block,state),properties=Object.fromEntries(state.split(',').map(s=>s.split('=')));
                object.position.set(...cell);
                Object.assign(object.userData,{id:'scenery',block,state:properties,cells:[cell],collisionShapes:nativeShapes(block,properties)});
                this.homeRoot.add(object);continue;
            }
            const faces=block==='glass'?glassFaces(cell,glass):undefined,key=block+state+(faces?.join(',')??'');
            if(!groups.has(key))groups.set(key,{block,state,cells:[],faces});
            groups.get(key)!.cells.push(cell);
        }
        for(const group of groups.values()){
            const source=group.faces?this.resources.samples.find(s=>s.block===group.block&&s.state.includes(group.state)):undefined;
            const sample=source?{...source,compiled:exposedModel(source.compiled,group.faces!)}:undefined;
            this.batch(group.block,group.cells,this.homeRoot,'scenery',group.state,sample);
        }
    }

    /** Build the complete home and its distant garden while leaving the birthday table independent. */
    homeScenery(): void {
        this.homeRoot=new Group();this.staticRoot.add(this.homeRoot);
        this.homeInterior(homeStructure());
        const grass:Cell[]=[],dirt:Cell[]=[],leaves:Cell[]=[],trunks:Cell[]=[];
        for(let x=-36;x<=36;x++)for(let z=-38;z<=-23;z++){
            const height=homeGardenHeight(z);grass.push([x,height-1,z]);
            for(let y=-1;y<height-1;y++)dirt.push([x,y,z]);
        }
        for(const [i,[x,z,h]] of [[-8,-26,6],[7,-29,7],[-18,-32,8],[20,-35,7],[1,-35,6]].entries()) {
            const base=homeGardenHeight(z);
            for(let y=0;y<h;y++)trunks.push([x,base+y,z]);
            leaves.push(...oakCrown([x,base,z],h-1,i));
        }
        this.batch('grass_block',grass,this.staticRoot,'decoration');
        this.batch('dirt',dirt,this.staticRoot,'decoration');
        this.batch('oak_log',trunks,this.staticRoot,'decoration','axis=y');
        this.batch('oak_leaves',leaves,this.staticRoot,'decoration');
        const fence:Cell[]=[];
        for(let x=-12;x<=12;x++)if(x<-3||x>3)fence.push([x,homeGardenHeight(-27),-27]);
        for(const state of ['post','east=true','west=true'])this.batch('oak_fence',fence,this.staticRoot,'decoration',state);
    }

    /** Build distinct authored terrain and static native entities. @param {SceneId} id Scene identity. */
    build(id: SceneId): void {
        this.animals.clear();this.lifeTicks=0;
        this.staticVersion++;
        this.plainsSignature = '';
        this.clear(this.staticRoot);
        this.clear(this.natural);
        this.clear(this.crops);
        this.signature = '';
        this.plainsDecor = null;
        this.homeRoot=null;this.homeCells=null;
        this.farmRoot = null; this.farmSignature = ''; this.soilSignature='[]'; this.renderedSoils=[]; this.farmLights = [];
        this.caveRoot = null; this.caveSignature = '[]';
        const spec = WORLD_SCENES[id], floor: Cell[] = [], pad: Cell[] = [];
        for (let x = -18; x <= 18; x++) for (let z = -22; z <= 10; z++) {
            if(id==='home'&&z>this.homeBack)continue;
            if (id !== 'farm' || !spec.plots.some(c => c[0] === x && c[2] === z) && !(x === 8 && z >= -5 && z <= 0)) {
                floor.push([x, -1, z]);
            }
        }
        if (id === 'plains') this.plainsGround();
        else if(id==='home') {
            const surfaces=new Map<string,Cell[]>();
            for(const cell of floor){const block=homeFloor(cell[0],cell[2]);if(!surfaces.has(block))surfaces.set(block,[]);surfaces.get(block)!.push(cell);}
            for(const [block,cells] of surfaces)this.batch(block,cells,this.staticRoot,'ground');
        } else if (id !== 'farm') this.batch(spec.floor, floor, this.staticRoot, 'ground');
        this.batch(id === 'cave' ? 'oak_planks' : 'cobblestone', pad, this.staticRoot, 'ground');
        if (id === 'cave') {
            this.caveRoot = new Group(); this.staticRoot.add(this.caveRoot);
            this.caveScenery([]);
        }
        if (id === 'farm') {this.farmRoot = new Group(); this.staticRoot.add(this.farmRoot);}
        if (id === 'home') {
            this.homeScenery();
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

    /** Patch committed soil locally and retain sources, crops and scenery whose effective state is unchanged.
     * @param {Progress} p Current durable facts.
     */
    sync(p: Progress): void {
        if(p.scene!=='farm'){const key=JSON.stringify(soils(p));if(key!==this.soilSignature){if(patchSoils(this,this.staticRoot,p,this.renderedSoils))this.staticVersion++;this.soilSignature=key;this.renderedSoils=structuredClone(soils(p));}}
        if(p.scene==='home'){
            const cells=currentHome(p),glass=glassCells(p),signature=JSON.stringify([...glass]);
            if(cells!==this.homeCells||signature!==this.homeGlassSignature){this.homeCells=cells;this.homeGlassSignature=signature;this.homeInterior([...cells.values()],glass);}
        }
        const id = p.scene, spec = WORLD_SCENES[id], removed = p.world.visits[id].removed, crops = p.scenes[id].crops,
            stations = p.scenes[id].stations,
            signature = JSON.stringify([removed,p.scenes[id].chickens?.map(c=>[c.id,animalCare(p,'hatched:'+c.id).grownAt<=p.world.tick]),p.scenes[id].offspring?.map(c=>[c,animalCare(p,'bred:'+c.id).grownAt<=p.world.tick]),p.scenes[id].animalVitals, stations.map(s => s.cell),p.scenes[id].blocks, soils(p),p.scenes[id].agriculture?.drops, crops.map(c => [c.id, cropStage(c)])]);
        if (id === 'cave' && this.caveRoot) {
            const layout = JSON.stringify([stations.map(s=>s.cell), removed]);
            if (layout !== this.caveSignature) {this.caveSignature = layout; this.caveScenery(stations.map(s=>s.cell), caveExcavated(p));}
        }
        if (id === 'farm' && this.farmRoot) {
            const layout = JSON.stringify([stations.map(s => s.cell), p.scenes.farm.blocks?.filter(b=>b.block!=='sugar_cane').map(b => b.cell)]),soilKey=JSON.stringify(soils(p));
            if (layout !== this.farmSignature) {
                this.farmSignature = layout; this.staticVersion++; this.clear(this.farmRoot);
                this.farmLights = buildFarm(this, this.farmRoot, p);
                this.soilSignature=soilKey;this.renderedSoils=structuredClone(soils(p));
            }else if(soilKey!==this.soilSignature){
                if(patchSoils(this,this.farmRoot,p,this.renderedSoils))this.staticVersion++;
                this.soilSignature=soilKey;this.renderedSoils=structuredClone(soils(p));
            }
        }
        if (signature === this.signature) return;
        this.signature = signature;
        if (id === 'plains') this.plainsDecoration(p);
        const caveVisible = id === 'cave' ? new Set(caveLayout(stations.map(s=>s.cell), spec.eye, caveExcavated(p)).stone.map(c=>c.join(','))) : null;
        const carved = id === 'cave' ? caveCleared(p) : null;
        const visible = spec.nodes.filter(n=>!p.scenes[id].blocks?.some(b=>b.cell.every((v,i)=>v===n.cell[i])) && !removed.includes(n.id) && !stations.some(s=>s.cell.every((v,i)=>v===n.cell[i])) && !carved?.has(n.cell.join(',')) && (!n.id.startsWith('rock:') || caveVisible?.has(n.cell.join(','))));
        const wanted = new Set([...(p.scenes[id].offspring??[]).map(c=>'bred:'+c.id),...(p.scenes[id].chickens??[]).map(c=>'hatched:'+c.id),...visible.map(n=>'node:'+n.id),...(id==='farm'?['animal:chicken:0','animal:chicken:1']:[]),...(p.scenes[id].agriculture?.drops??[]).map(d=>'drop:'+d.id)]);
        const retained = this.natural.children.filter(o=>wanted.has(o.userData.id));
        for (const root of retained) root.removeFromParent();
        this.clear(this.natural);
        if (retained.length) this.natural.add(...retained);
        const cropStages = new Map(crops.map(c => ['crop:' + c.id, cropStage(c)]));
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
        if(id==='farm')for(const [index,cell] of ([[4,0,-4],[6,0,-5]] as Cell[]).entries())if(!this.natural.children.some(o=>o.userData.id==='animal:chicken:'+index)){
            const root=this.animal('chicken');root.position.x+=cell[0];root.position.z+=cell[2];root.userData={id:'animal:chicken:'+index,block:'chicken',cell};this.natural.add(root);
        }
        for(const c of p.scenes[id].chickens??[]){const baby=animalCare(p,'hatched:'+c.id).grownAt>p.world.tick,old=this.natural.children.find(o=>o.userData.id==='hatched:'+c.id);if(old&&old.userData.baby===baby)continue;if(old){old.removeFromParent();old.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});}const root=this.animal(baby?'chick':'chicken');root.position.set(c.feet[0],c.feet[1]+1.5,c.feet[2]);root.userData={id:'hatched:'+c.id,block:'chicken',cell:[c.feet[0]-.5,c.feet[1],c.feet[2]-.5],baby};this.natural.add(root);}
        for(const c of p.scenes[id].offspring??[]){const key='bred:'+c.id,baby=animalCare(p,key).grownAt>p.world.tick,old=this.natural.children.find(o=>o.userData.id===key);if(old&&old.userData.baby===baby)continue;if(old){old.removeFromParent();old.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});}const root=this.animal(c.kind==='chicken'&&baby?'chick':c.kind);if(c.kind==='cow'&&baby)root.scale.set(.5,-.5,.5);root.position.set(c.feet[0],c.feet[1]+(c.kind==='cow'&&baby?.75:1.5),c.feet[2]);root.userData={id:key,block:c.kind,cell:[c.feet[0]-.5,c.feet[1],c.feet[2]-.5],baby};this.natural.add(root);}
        for(const root of [...this.natural.children])if(p.scenes[id].animalVitals?.[String(root.userData.id)]?.health===0){this.animals.delete(String(root.userData.id));root.removeFromParent();root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});}
        for(const drop of p.scenes[id].agriculture?.drops??[])if(!this.natural.children.some(o=>o.userData.id==='drop:'+drop.id)){const root=this.groundItem(drop.stack.id);root.position.add(new Vector3(...drop.cell));root.userData={...root.userData,id:'drop:'+drop.id,block:'item',cell:drop.cell};this.natural.add(root);}
        for (const c of crops) {
            if (retainedCrops.some(o => o.userData.id === 'crop:' + c.id)) continue;
            const root = this.block('wheat', 'age=' + cropStage(c));
            root.position.set(c.cell[0], c.cell[1]-.0625, c.cell[2]);
            root.userData.id = 'crop:' + c.id;root.userData.cell=[...c.cell];root.userData.block='wheat';
            root.userData.cropAge = cropStages.get(root.userData.id);
            this.crops.add(root);
        }
    }

    /** Advance food temptation, courtship, pushing and ambient state at the native tick rate.
     * @param {Progress} p Current world.
     * @param {Bounds[]} solids Collision geometry.
     * @param {Cell[]} water Water cells.
     * @param {Function|null} sound Spatial native sound consumer.
     * @param {PlayerMotion} player Local player participating in reciprocal entity pushes.
     */
    tickLife(p:Progress,solids:Bounds[],water:Cell[],sound:((id:string,options:SoundOptions)=>void)|null,player?:PlayerMotion):void {
        this.lifeTicks++;
        if(p.scene!=='farm'&&!p.scenes[p.scene].chickens?.length&&!p.scenes[p.scene].offspring?.length)return;
        const active:FarmAnimal[]=[];
        for(const root of this.natural.children){const kind=root.userData.block;if(kind!=='cow'&&kind!=='chicken')continue;
            const id=String(root.userData.id),cell=root.userData.cell as Cell;
            let animal=this.animals.get(id);if(!animal){animal=new FarmAnimal(kind,[cell[0]+.5,cell[1],cell[2]+.5],174761+this.animals.size*997);this.animals.set(id,animal);}
            animal.baby=!!root.userData.baby;active.push(animal);
        }
        for(const [id,animal] of this.animals){
            const care=animalCare(p,id),mate=care.loveUntil>p.world.tick?[...this.animals].filter(([key,a])=>key!==id&&a.kind===animal.kind&&animalCare(p,key).loveUntil>p.world.tick&&Math.hypot(...a.feet.map((v,i)=>v-animal.feet[i]))<8).sort((a,b)=>Math.hypot(...a[1].feet.map((v,i)=>v-animal.feet[i]))-Math.hypot(...b[1].feet.map((v,i)=>v-animal.feet[i])))[0]:undefined;
            const attracted=!!player&&(['mainhand','offhand'] as const).some(hand=>animalFood(animal.kind,handStack(p.player.data,hand)?.id))&&Math.hypot(...animal.feet.map((v,i)=>v-player.feet[i]))<10;
            if(animal.temptCooldown)animal.temptCooldown--;
            if(animal.tempted&&!attracted){animal.temptCooldown=100;animal.origin=[...animal.feet];animal.path=[];}animal.tempted=attracted&&!animal.temptCooldown&&!mate;
            if(animal.partner!==(mate?.[0]??''))animal.courtship=0;animal.partner=mate?.[0]??'';if(mate)animal.courtship++;else animal.courtship=0;
            const goal=mate?.[1].feet??(animal.tempted?player!.feet:null);if(!goal&&animal.goal)animal.path=[];animal.goal=goal?[...goal]:null;animal.goalStop=mate?1:2.5;animal.goalSpeed=mate?1:animal.kind==='cow'?1.25:1;
        }
        pushAnimals(active,player);
        for(const animal of active){const kind=animal.kind,
            near=solids.filter(b=>b[0]<Math.max(animal.goal?.[0]??animal.origin[0],animal.feet[0])+3&&b[3]>Math.min(animal.goal?.[0]??animal.origin[0],animal.feet[0])-3&&b[2]<Math.max(animal.goal?.[2]??animal.origin[2],animal.feet[2])+3&&b[5]>Math.min(animal.goal?.[2]??animal.origin[2],animal.feet[2])-3),feedback=animal.tick(near,water);
            if(feedback.ambient)sound?.('entity.'+kind+'.ambient',{volume:kind==='cow'?.4:1,pitch:feedback.pitch,position:[...animal.feet],category:'neutralVolume'});
            if(feedback.step)sound?.('entity.'+kind+'.step',{volume:.15,pitch:1,position:[...animal.feet],category:'neutralVolume'});
        }
    }
    /** Interpolate animal travel and animate ground items independently of pickup collision.
     * @param {number} alpha Fraction of the next native tick.
     */
    animateLife(alpha:number):void {
        this.groundItems?.update((this.lifeTicks+alpha)*50);
        for(const root of this.natural.children){const animal=this.animals.get(String(root.userData.id));
            if(animal){const position=animal.feet.map((v,i)=>animal.previous[i]+(v-animal.previous[i])*alpha);root.position.set(position[0],position[1]+(animal.kind==='cow'&&animal.baby?.75:1.5),position[2]);root.rotation.y=animal.previousYaw+(animal.yaw-animal.previousYaw)*alpha;
                const legs=root.children.filter(o=>o.name.includes('leg'));legs.forEach((leg,i)=>{leg.rotation.x=animal.animation.leg(alpha,animal.kind==='cow'?!![1,0,0,1][i]:i%2===1);});
            }else if(root.userData.block==='egg'||root.userData.id?.startsWith('drop:')){const cell=root.userData.cell as Cell,motion=itemMotion(this.lifeTicks+alpha,root.userData.bobOffset??0);root.position.set(cell[0]+.5,cell[1]+motion.y,cell[2]+.5);root.rotation.y=motion.yaw;}
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

    /** Release authored scene geometry and ground-item material caches. */
    dispose(): void {
        for (const group of [this.staticRoot, this.natural, this.crops]) this.clear(group);
        this.groundItems?.dispose();
    }
}
