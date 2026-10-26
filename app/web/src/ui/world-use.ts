/** Formal free-pointer world actions bind actual ray hits to current-generation semantic commands. */
import {handStack} from '../domain/hands.ts';
import type {InteractionHand} from '../domain/hands.ts';
import {spearTargets} from '../domain/spear-combat.ts';
import {spearProfile,kineticContact} from '../domain/item-use.ts';
import {isStorage} from '../domain/storage.ts';
import {KEY_BINDINGS,boundKey} from '../domain/control-settings.ts';
import {isCake,ODD_CAKE} from '../domain/easter-egg.ts';
import {canTill,canPickup,soilAt,cropStage} from '../domain/agriculture.ts';
import {PLACEABLE,placementBlocks,lookFacing,opposite} from '../domain/placed-blocks.ts';
import type {BlockHit} from '../domain/placed-blocks.ts';
import {miningTicks} from '../domain/mining.ts';
import {blockSounds} from '../domain/block-sounds.ts';
import type {SoundOptions} from '../render/world-audio.ts';
import type {SaveSession} from '../persistence/session.ts';
import type {GameInventory} from './inventory.ts';
import type {SceneView, Pick} from '../render/scene.ts';
import type {Station, Cell, Facing, Kind} from '../domain/types.ts';
import {WORLD_REGION, WORLD_SCENES, sameCell, sourceOccupied} from '../domain/world-config.ts';
import {emptyFurnace} from '../domain/furnace.ts';
import {emptyHopper} from '../domain/hopper.ts';
import {layout} from '../domain/inventory.ts';
import {plateContacts} from '../domain/pressure-plates.ts';
import type {PlateEntity} from '../domain/pressure-plates.ts';
import {playerBounds} from '../domain/player-motion.ts';

/** Calculate a real face-adjacent cell from logical support identity and the actual hit face and enforce occupancy, authored volume and vertical support. @param {Pick} hit Visible face. @param {SaveSession} session Latest state. @param {Kind} kind Held device. @param {Facing} facing Requested orientation. @return {Station & {valid:boolean}} Preview candidate. */
export function placement(hit: Pick, session: SaveSession, kind: Kind, facing: Facing): Station & { valid: boolean } {
    const p = session.view.envelope!.state.progress, source = p.scenes[p.scene].stations.find(s => s.id === hit.id),
        cell = (source?.cell ?? hit.cell) ? (source?.cell ?? hit.cell)!.map((n, i) => n + Math.round(hit.normal[i])) as Cell : hit.point.map((n, i) => Math.floor(n + hit.normal[i] * .02)) as Cell,
        station: Station = {
            id: 'preview',
            kind,
            cell,
            facing,
            contents: kind === 'hopper' ? emptyHopper() : kind === 'crafting_table' ? {
                version: 1,
                data: {grid: Array(9).fill(null)}
            } : emptyFurnace()
        }, list = p.scenes[p.scene].stations;
    return {
        ...station,
        valid: hit.support !== false && WORLD_REGION.allows(p.scene, station) && !list.some(s => sameCell(s.cell, cell)) && !sourceOccupied(p, cell)
    };
}

/** Own bounded device orientation and actions; no carrier contents or natural facts live here. */
export class WorldUse {
    mining: { id: string; scope: string; tool: string; start: number; ticks: number; hit: Pick; block: string; nextSound: number } | null = null;
    miningTimer = 0;
    pickupPending=false;pickupAfter=0;pickupSignature='';
    platePending=false;
    poseTimer=0; poseSignature=''; posePending=false;
    holding = false;
    itemPending=false;cooldownPixels=0;
    combatPending=new Set<string>();kineticHits=new Map<string,number>();
    miningEpoch = 0;
    miningTicket: object | null = null;
    miningAfter = 0;
    holdScope = '';
    holdSerial = 0;
    scope = '';
    hover: Pick | null = null;
    facing: Facing = 'down';
    above = false;
    abort = new AbortController();

    /** Connect actual ray actions and a scoped rotation shortcut. @param {SceneView} scene True camera view. @param {GameInventory} inventory GUI/carrier authority. @param {SaveSession} session Shared transaction owner. @param {Function} notify Localized feedback consumer. @param {Function} sound Native interaction audio. @param {Function} author Localized author guidance. */
    constructor(public scene: SceneView, public inventory: GameInventory, public session: SaveSession, public notify: (key: string) => void, public sound: (id: string, options?: SoundOptions) => void, public author:(key:string)=>void=()=>{}) {
        inventory.itemCooldown=id=>id==='minecraft:shield'&&scene.itemUse?.shieldCooldownLength?scene.itemUse.shieldCooldown/scene.itemUse.shieldCooldownLength:0;
        scene.onShieldWear=(hand,amount)=>{const p=session.view.envelope?.state.progress;if(p)void this.run({type:'wear-shield',scene:p.scene,hand,amount,expected:layout(inventory.value)},null);};
        scene.onPlayerTick=()=>this.walkInteractions();
        scene.onEggImpact=(feet,count,entity,spawn)=>{if(entity)void this.damageAnimal(entity,0,false,undefined,'mainhand',feet);const p=session.view.envelope?.state.progress;if(p&&count&&spawn)void this.run({type:'hatch-eggs',scene:p.scene,feet:spawn,count,id:crypto.randomUUID()},null);};
        if(scene.motion)this.poseTimer=window.setInterval(()=>this.savePose(),500);
        this.scope = session.view.envelope?.generation + ':' + session.view.envelope?.state.progress.scene;
        scene.onHover = hit => {
            if (this.mining && hit?.id !== this.mining.id) this.clearMiningProgress();
            this.hover = hit;
            scene.renderer.domElement.style.cursor = hit && (hit.id.startsWith('node:') || hit.id.startsWith('crop:') || !!session.view.envelope?.state.progress.scenes[session.view.envelope.state.progress.scene].stations.some(s => s.id === hit.id)) ? 'pointer' : 'default';
            this.preview();
        };
        scene.canUse = hit => {
            const p = session.view.envelope?.state.progress, held = p?.player.data.hotbar[p.player.data.selected], equip = held && inventory.rules.items[held.id]?.equipment;
            const usable=(['mainhand','offhand'] as const).some(hand=>{const id=p&&handStack(p.player.data,hand)?.id;return id==='minecraft:egg'||id==='minecraft:shield'||!!spearProfile(id??null)||!!(id&&inventory.rules.items[id]?.equipment)||!!this.heldBlock(hand);});
            if (!hit) return usable;
            return !!p && (usable || !!equip || (canTill(p,this.blockHit(hit).cell,this.blockHit(hit).normal,held??null) || hit.block==='farmland' || hit.id === 'birthday-table' || hit.id === 'birthday-cake' || hit.id.startsWith('plot:') || hit.id.includes('cow:') || !!this.heldBlock() || p.scenes[p.scene].blocks?.some(b=>b.id===hit.id) || p.scenes[p.scene].stations.some(s => s.id === hit.id)));
        };
        scene.onMineStart = hit => this.beginMining(hit);
        scene.onMineCancel = () => this.cancelMining();
        scene.onPick = null;
        scene.onUse = (hit, modifiers) => {
            if(this.holding||this.scene.itemUse?.hand)return;
            for(const hand of ['mainhand','offhand'] as const)if(hit?this.use(hit,!!modifiers?.shift,!!modifiers?.alt,!!modifiers?.ctrl,hand):this.useItem(hand))break;
        };
        window.addEventListener('keyup', e => {
            this.above = e.ctrlKey && e.altKey;
            this.preview();
        }, {signal: this.abort.signal});
        window.addEventListener('blur', () => {
            this.above = false;
        }, {signal: this.abort.signal});
        window.addEventListener('keydown', e => {
            this.above = e.ctrlKey && e.altKey;
            if (this.above) this.scene.refreshHover();
            if (e.code !== 'KeyR' || KEY_BINDINGS.some(([id])=>boundKey(scene.controls,id)===e.code) || scene.look.active || !scene.input || inventory.modal.open || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
            e.preventDefault();
            scene.refreshHover();
            const p = session.view.envelope?.state.progress,
                found = p?.scenes[p.scene].stations.find(s => s.id === this.hover?.id);
            if (found) this.run({
                type: 'rotate-station',
                scene: p!.scene,
                id: found.id,
                expected: found.facing
            }, 'game.rotated'); else {
                const order: Facing[] = this.heldKind() === 'hopper' ? ['down', 'north', 'east', 'south', 'west'] : ['north', 'east', 'south', 'west'];
                this.facing = order[(order.indexOf(this.facing) + 1) % order.length];
                this.preview();
            }
        }, {signal: this.abort.signal});
    }

    /** Settle landings and nearby ground items from physical movement, with no ray-click pickup. */
    walkInteractions():void {
        const p=this.session.view.envelope?.state.progress;if(!p||!this.session.view.writable||this.scene.simulationPaused||document.hidden)return;
        const cooldown=Math.ceil((this.inventory.itemCooldown?.('minecraft:shield')??0)*16);if(cooldown!==this.cooldownPixels){this.cooldownPixels=cooldown;this.inventory.draw(false);}
        const feet=[...this.scene.motion.feet] as Cell;
        this.samplePlates();
        if(p.sleep)return;
        this.attackSpear(true);
        if(this.scene.motion.landedDistance>.5&&soilAt(p,[Math.floor(feet[0]),Math.floor(feet[1]-.2),Math.floor(feet[2])]))void this.run({type:'land-on-soil',scene:p.scene,feet,distance:this.scene.motion.landedDistance},null);
        if(this.pickupPending||performance.now()<this.pickupAfter)return;
        const cells=[...(p.scenes[p.scene].agriculture?.drops??[]).map(d=>d.cell),...WORLD_SCENES[p.scene].nodes.filter(n=>n.kind==='egg'&&!p.world.visits[p.scene].removed.includes(n.id)).map(n=>n.cell)];
        const nearby=cells.filter(c=>canPickup(feet,c));if(!nearby.length)return;
        const signature=JSON.stringify([this.scope,p.world.visits[p.scene].epoch,nearby,p.player.data]);if(signature===this.pickupSignature)return;
        this.pickupPending=true;this.pickupAfter=performance.now()+500;
        void this.run({type:'pickup-ground',scene:p.scene,feet,visit:p.world.visits[p.scene].epoch},null).then(ok=>{if(ok)this.pickupSignature=signature;}).finally(()=>{this.pickupPending=false;});
    }

    /** Send current player, animal and item contacts to native scheduled pressure-plate checks. */
    samplePlates():void{
        const p=this.session.view.envelope?.state.progress;if(!p||this.platePending)return;
        const entities:PlateEntity[]=p.sleep?[]:[{id:'player',living:true,bounds:playerBounds(this.scene.motion.feet,this.scene.motion.crouching)}];
        for(const [id,animal] of this.scene.authored?.animals??[])entities.push({id:'animal:'+id,living:true,bounds:animal.bounds()});
        const drops=[...(p.scenes[p.scene].agriculture?.drops??[]),...WORLD_SCENES[p.scene].nodes.filter(n=>n.kind==='egg'&&!p.world.visits[p.scene].removed.includes(n.id))];
        for(const d of drops)entities.push({id:'item:'+d.id,living:false,bounds:[d.cell[0]+.375,d.cell[1],d.cell[2]+.375,d.cell[0]+.625,d.cell[1]+.25,d.cell[2]+.625]});
        const blocks=p.scenes[p.scene].blocks??[],contacts=plateContacts(blocks,entities);
        if(!contacts.length||contacts.every(c=>Number(blocks.find(b=>b.id===c.id)!.state.contacts??0)===c.count))return;
        this.platePending=true;void this.run({type:'pressure-contacts',scene:p.scene,contacts},null).finally(()=>{this.platePending=false;});
    }

    /** Persist settled movement through the shared save lock, including gravity while non-pausing screens are open. */
    savePose():void{const p=this.session.view.envelope?.state.progress;if(!p||p.sleep||this.scene.simulationPaused||document.hidden||this.posePending||!this.session.view.writable)return;const pose={feet:[...this.scene.motion.feet] as Cell,yaw:this.scene.look.yaw,pitch:this.scene.look.pitch},signature=JSON.stringify([p.scene,pose]);if(signature===this.poseSignature)return;this.posePending=true;void this.session.dispatch({type:'save-pose',scene:p.scene,pose}).then(()=>{this.poseSignature=signature;}).catch(()=>this.notify('game.actionFailed')).finally(()=>{this.posePending=false;});}

    /** Read the selected native BlockItem without treating arbitrary inventory items as blocks.
     * @param {InteractionHand} hand Used carrier.
     * @return {string|null} Placeable block identity.
     */
    heldBlock(hand:InteractionHand='mainhand'):string|null{const p=this.session.view.envelope?.state.progress,id=p&&handStack(p.player.data,hand)?.id.split(':')[1];return id&&PLACEABLE.has(id)?id:null;}
    /** Capture a current block ray and actual player pose for transactional placement.
     * @param {Pick} hit In-range target.
     * @return {BlockHit} Native placement context.
     */
    blockHit(hit:Pick):BlockHit{return {cell:hit.cell??hit.point.map((n,i)=>Math.floor(n-hit.normal[i]*.001)) as Cell,normal:hit.normal.map(Math.round) as Cell,point:hit.point,eye:this.scene.camera.position.toArray(),yaw:this.scene.camera.rotation.y,pitch:this.scene.camera.rotation.x,crouch:this.scene.motion.crouching};}

    /** Read the used hand's actual temporary group. @param {InteractionHand} hand Used carrier. @return {Kind|null} Placeable selected device, if any. */
    heldKind(hand:InteractionHand='mainhand'): Kind | null {
        const p = this.session.view.envelope?.state.progress,
            id = p&&handStack(p.player.data,hand)?.id.replace('minecraft:', '');
        return ['crafting_table', 'furnace', 'blast_furnace', 'hopper'].includes(id ?? '') ? id as Kind : null;
    }

    /** Anchor an explicit upper placement to a visible real instance without moving the camera or reaching through scenery.
     * @param {Pick} hit Fresh visible anchor.
     * @param {boolean} above Whether the held modifier requests its upper neighboring cell.
     * @return {Pick} Anchor with the requested face or the actual ray face.
     */
    attachHit(hit: Pick, above: boolean): Pick {
        const p = this.session.view.envelope?.state.progress;
        return above && p?.scenes[p.scene].stations.some(s => s.id === hit.id) ? {...hit, normal: [0, 1, 0]} : hit;
    }

    /** Update native placement tint from the latest state, never from cached connection endpoints. */
    preview(): void {
        const scope = this.session.view.envelope?.generation + ':' + this.session.view.envelope?.state.progress.scene;
        if (this.scope !== scope) {
            this.scope = scope;
            this.scene.cancel();
            this.hover = null;
        }
        const kind = this.heldKind();
        if (!kind || !this.hover || !this.scene.input || this.scene.look.active || !this.session.view.envelope) {
            this.scene.showPreview(null);
            return;
        }
        const facing = this.facing === 'down' && kind !== 'hopper' ? 'south' : this.facing;
        this.scene.showPreview(placement(this.attachHit(this.hover, this.above), this.session, kind, facing));
    }

    /** Dispatch one semantic intent with visible failure feedback. @param {Parameters<SaveSession['dispatch']>[0]} command Fresh observed intent. @param {string|null} message Significant success key, or null for silent routine actions. @param {string} sound Optional native event. @param {object} effect Optional committed break feedback. @param {SoundOptions} options Native audio parameters. @return {Promise<boolean>} Whether the live transaction committed successfully. */
    run(command: Parameters<SaveSession['dispatch']>[0], message: string | null, sound?: string, effect?: {
        block: string;
        point: Cell;
        cell?: Cell;
        state?: Record<string,string>
    }, options?: SoundOptions): Promise<boolean> {
        const scope = this.session.view.envelope?.generation + ':' + this.session.view.envelope?.state.progress.scene, serial = this.session.serial;
        return this.session.dispatch(command).then(events => {
            if (!this.current(scope, serial)) return false;
            if (command.type === 'harvest-node' || command.type === 'harvest-crop') this.scene.renderer.domElement.dataset.harvestResult = JSON.stringify({command, events, selected: this.session.view.envelope!.state.progress.player.data.selected, backpack: this.session.view.envelope!.state.progress.player.data.backpack, unlocked: this.session.view.envelope!.state.progress.unlocked});
            if(command.type==='put-station'||command.type==='plant-crop'||command.type==='record-cake-placement'||command.type==='eat-cake'&&events.some(e=>e.type==='cake-eaten'))this.swing(command.hand);
            if (effect) this.scene.breakEffect(effect.block, effect.point, effect.cell, effect.state);
            if (message && !['harvest-node', 'harvest-crop'].includes(command.type) && !events.some(e => e.type === 'item-unlocked')) this.notify(message);
            if (sound && (command.type!=='eat-cake'||events.some(e=>e.type==='cake-eaten'))) {
                const breaking=sound.startsWith('block.')&&['harvest-node','harvest-crop','remove-station','break-block'].includes(command.type);
                this.sound(sound,{...options,...(breaking?{volume:((options?.volume??1)+1)/2,pitch:(options?.pitch??1)*Math.fround(.8)}:{}),valid:()=>this.current(scope,serial)});
            }
            this.preview();
            return true;
        }).catch(error => {if (this.current(scope, serial)) this.notify(error instanceof Error && error.message.startsWith('bed.') ? error.message : error instanceof Error && error.message === 'inventory-full' ? 'game.inventoryFull' : 'game.actionFailed'); return false;});
    }

    /** Fence both successful and failed acknowledgements to their live scene and save owner.
     * @param {string} scope Issuing save generation and scene.
     * @param {number} serial Issuing page lifecycle serial.
     * @return {boolean} Whether feedback still belongs to this active adapter.
     */
    current(scope: string, serial: number): boolean {
        return !this.abort.signal.aborted && !this.scene.disposed && !this.session.disposed && !this.session.suspended && serial === this.session.serial && scope === this.session.view.envelope?.generation + ':' + this.session.view.envelope?.state.progress.scene;
    }

    /** Begin a native spear jab or a cancellable block-mining gesture whose target can change while held.
     * @param {Pick|null} hit Current nearest ray target, including a press that starts over empty space.
     * @param {number} now Injectable monotonic start time.
     */
    beginMining(hit: Pick | null, now = performance.now()): void {
        if(this.scene.itemUse?.hand)return;
        this.cancelMining();
        const e = this.session.view.envelope;
        if (!e || !this.scene.input || !this.session.view.writable) return;
        if(spearProfile(e.state.progress.player.data.hotbar[e.state.progress.player.data.selected]?.id??null)){this.attackSpear(false);return;}
        this.scene.hand?.swing(!hit||/cow|chicken/.test(hit.id));
        this.holding = true;
        this.holdScope = e.generation + ':' + e.state.progress.scene;
        this.holdSerial = this.session.serial;
        this.miningAfter = now;
        this.miningTimer = window.setInterval(() => this.advanceMining(), 25);
        if (hit) this.selectMining(hit, now);
    }

    /** Clear only the current block's progress, retaining an active left-button hold. */
    clearMiningProgress(): void {
        this.mining = null;
        this.scene.showCrack(null);
        delete this.scene.renderer.domElement.dataset.mining;
    }

    /** Cancel the gesture and fence late completion from restarting another held attack. */
    cancelMining(): void {
        this.holding = false;
        this.miningEpoch = (this.miningEpoch ?? 0) + 1;
        this.miningTicket = null;
        clearInterval(this.miningTimer);
        this.miningTimer = 0;
        this.clearMiningProgress();
    }

    /** Start progress, a native interaction swing and initial hit feedback for the live visible block using the actual main-hand tool.
     * @param {Pick} hit Fresh nearest ray target.
     * @param {number} now Active monotonic time.
     */
    selectMining(hit: Pick, now: number): void {
        const e = this.session.view.envelope!;
        const p = e.state.progress, station = p.scenes[p.scene].stations.find(s => s.id === hit.id),
            node = WORLD_SCENES[p.scene].nodes.find(n => 'node:' + n.id === hit.id),
            block = station?.kind ?? p.scenes[p.scene].blocks?.find(b=>b.id===hit.id)?.block ?? (hit.id.startsWith('crop:') ? 'wheat' : node?.block);
        if (!block || node?.kind === 'cow'||node?.kind==='egg') return;
        const held = p.player.data.hotbar[p.player.data.selected], ticks = miningTicks(block, held, this.inventory.rules);
        this.scene.hand?.swing();
        this.mining = {id: hit.id, scope: this.holdScope, tool: JSON.stringify([p.player.data.selected, held]), start: now, ticks, hit, block, nextSound: now + 200};
        if (!ticks) this.finishMining(now);
        else {this.scene.renderer.domElement.dataset.mining = JSON.stringify(this.mining); this.scene.showCrack(hit.id, 0); this.miningSound();}
    }

    /** Play the native initial or four-tick hit centered on the local player, fencing unfinished decoding to this held target. */
    miningSound(): void {
        const m = this.mining, serial = this.holdSerial, epoch = this.miningEpoch;
        if (!m) return;
        const material = blockSounds(m.block);
        this.scene.hitEffect?.(m.hit,m.block);
        this.sound(material.hit, {volume: (material.volume + 1) / 8, pitch: material.pitch * .5,
            valid: () => this.mining === m && this.miningEpoch === epoch && this.holding && !document.hidden && this.scene.input && !this.inventory.modal.open && this.current(m.scope, serial)});
    }

    /** Re-pick during a held attack, reset changed target/tool progress, play four-tick hits and honor the native five-tick break delay.
     * @param {number} now Injectable monotonic active time.
     */
    advanceMining(now = performance.now()): void {
        if (!this.holding) return;
        const e = this.session.view.envelope;
        if (!e || document.hidden || !this.scene.input || !this.session.view.writable || this.inventory.modal.open || this.scene.look.active || !this.current(this.holdScope, this.holdSerial)) {
            this.cancelMining(); return;
        }
        if (this.miningTicket) return;
        const hit = this.scene.refreshHover(), p = e.state.progress;
        const m = this.mining;
        if (m && (m.id !== hit?.id || m.tool !== JSON.stringify([p.player.data.selected, p.player.data.hotbar[p.player.data.selected]]))) this.clearMiningProgress();
        if (!hit || now < this.miningAfter) return;
        if (!this.mining) {this.selectMining(hit, now); return;}
        this.scene.hand?.swing();
        const fraction = (now - this.mining.start) / (this.mining.ticks * 50);
        if (fraction < 1) {
            this.scene.showCrack(this.mining.id, Math.floor(fraction * 10));
            if (now >= this.mining.nextSound) {
                this.mining.nextSound = this.mining.start + (Math.floor((now - this.mining.start) / 200) + 1) * 200;
                this.miningSound();
            }
        }
        else this.finishMining(now);
    }

    /** Commit one break at a time; continued destruction waits five ticks for progressed blocks and one attack tick for instant blocks.
     * @param {number} now Completion time for the next eligible held attack.
     */
    finishMining(now: number): void {
        const m = this.mining, e = this.session.view.envelope;
        if (!m || !e || this.miningTicket) return;
        const ticket = {}, epoch = this.miningEpoch, p = e.state.progress;
        this.miningTicket = ticket;
        this.clearMiningProgress();
        const station = p.scenes[p.scene].stations.find(s => s.id === m.id);
        const placed=p.scenes[p.scene].blocks?.find(b=>b.id===m.id);
        const material = placed?blockSounds(placed.block):station ? blockSounds(station.kind) : null;
        const work = placed?this.run({type:'break-block',scene:p.scene,id:placed.id,expected:layout(this.inventory.value)},null,material!.break,{block:placed.block,point:m.hit.point,cell:m.hit.cell,state:placed.state},{volume:material!.volume,pitch:material!.pitch}):station ? this.run({type: 'remove-station', scene: p.scene, id: station.id, expected: layout(this.inventory.value)}, null, material!.break, {block: station.kind, point: m.hit.point,cell:m.hit.cell,state:{facing:station.facing}}, {volume: material!.volume, pitch: material!.pitch}) : this.harvest(m.hit);
        void work.then(success => {
            if (this.miningTicket !== ticket || epoch !== this.miningEpoch || !this.holding) return;
            this.miningTicket = null;
            if (!success || !this.current(this.holdScope, this.holdSerial)) {this.cancelMining(); return;}
            this.miningAfter = Math.max(now, performance.now()) + (m.ticks ? 5 : 1) * 50;
            this.scene.refreshHover();
        });
    }

    /** Commit only declared nodes or an observed crop lifetime. @param {Pick} hit Actual visible object. @return {Promise<boolean>} Successful finite resource settlement. */
    harvest(hit: Pick): Promise<boolean> {
        const p = this.session.view.envelope?.state.progress;
        if (!p || !this.session.view.writable) return Promise.resolve(false);
        if (hit.id.startsWith('node:') && !hit.id.includes('cow:')&&!hit.id.includes('egg:')) {
            const node = hit.id.slice(5), block = WORLD_SCENES[p.scene].nodes.find(n => n.id === node)?.block;
            return this.run({
                type: 'harvest-node',
                scene: p.scene,
                node,
                visit: p.world.visits[p.scene].epoch,
                expected: layout(this.inventory.value)
            }, 'game.harvested', block === 'egg' ? undefined : block?.includes('log') ? 'block.wood.break' : block?.includes('grass') || block === 'sugar_cane' ? 'block.grass.break' : 'block.stone.break', block && block !== 'egg' ? {
                block,
                cell: block==='tall_grass'&&hit.cell?[hit.cell[0],Math.max(hit.cell[1],Math.floor(hit.point[1]-hit.normal[1]*.00001)),hit.cell[2]]:hit.cell,
                state: block==='tall_grass'?{half:hit.point[1]>=(hit.cell?.[1]??0)+1?'upper':'lower'}:{},
                point: hit.point
            } : undefined);
        } else if (hit.id.startsWith('crop:')) {
            const crop=p.scenes[p.scene].crops.find(c=>c.id===hit.id.slice(5)),age=crop?cropStage(crop):0;
            return this.run({
            type: 'harvest-crop',
            id: hit.id.slice(5),
            expected: layout(this.inventory.value)
        }, 'game.harvested', 'block.crop.break', {block:'wheat',point:hit.point,cell:hit.cell,state:{age:String(age)}});
        }
        return Promise.resolve(false);
    }

    /** Resolve native spear jabs or continuous kinetic contacts against all visible living collision boxes.
     * @param {boolean} kinetic Whether this is an active-use simulation tick.
     */
    attackSpear(kinetic:boolean):void{
        const p=this.session.view.envelope?.state.progress,scene=this.scene,use=scene.itemUse,hand=kinetic?use?.hand:'mainhand';if(!p||!hand)return;
        const item=handStack(p.player.data,hand)?.id,profile=spearProfile(item??null);if(!profile||!item||!scene.hand||!scene.authored)return;
        if(!kinetic&&scene.hand.charge()<1||kinetic&&use.ticks<profile.delay)return;
        const eye=scene.camera.position.toArray() as Cell,look=scene.camera.getWorldDirection(scene.ray.ray.direction.clone()).toArray() as Cell,movement=scene.motion.feet.map((v,i)=>v-scene.previousFeet[i]) as Cell;
        const targets=spearTargets(eye,look,movement,scene.collision,[...scene.authored.animals].map(([id,a])=>({id,bounds:a.bounds()})));
        if(!kinetic){scene.hand.swing(true);this.sound(item==='minecraft:wooden_spear'?'item.spear_wood.attack':'item.spear.attack',{category:'playersVolume'});}
        for(const id of targets){
            if(this.combatPending.has(id))continue;
            const animal=scene.authored.animals.get(id)!;
            let damage=profile.jabDamage as number,knockback=true;
            if(kinetic){if(use.ticks-(this.kineticHits.get(id)??-Infinity)<10)continue;this.kineticHits.set(id,use.ticks);const result=kineticContact(profile,use.ticks,movement.reduce((s,v,i)=>s+v*look[i]*20,0),animal.feet.reduce((s,v,i)=>s+(v-animal.previous[i])*look[i]*20,0));damage=result.damage;knockback=result.knockback;if(!damage&&!knockback)continue;}
            void this.damageAnimal(id,damage,knockback,item,hand,eye,kinetic);
        }
    }

    /** Commit a live target's health and weapon wear before playing hurt feedback or applying impulses.
     * @param {string} id Current animal identity.
     * @param {number} damage Native computed damage, including zero for eggs.
     * @param {boolean} knockback Additional piercing-weapon knockback.
     * @param {string|undefined} weapon Attacking spear, or an already-thrown egg.
     * @param {InteractionHand} hand Weapon carrier.
     * @param {Cell} source Damage-source position.
     * @param {boolean} kinetic Whether a successful hit triggers the use recoil animation.
     */
    async damageAnimal(id:string,damage:number,knockback:boolean,weapon:string|undefined,hand:InteractionHand,source:Cell,kinetic=false):Promise<void>{
        const e=this.session.view.envelope,animal=this.scene.authored?.animals.get(id);if(!e||!animal||this.combatPending.has(id))return;
        this.combatPending.add(id);const scope=this.scope,serial=this.session.serial,yaw=this.scene.look.yaw;
        try{
            const events=await this.session.dispatch({type:'animal-hit',scene:e.state.progress.scene,id,damage,weapon,hand});if(!this.current(scope,serial))return;
            const result=events.find(e=>e.type==='animal-hurt'),hurt=!!result;
            if(result?.fullHurt){const dead=this.session.view.envelope!.state.progress.scenes[e.state.progress.scene].animalVitals?.[id]?.health===0;this.sound('entity.'+animal.kind+(dead?'.death':'.hurt'),{volume:animal.kind==='cow'?.4:1,pitch:(animal.baby?1.5:1)+(Math.random()-Math.random())*.2,position:animal.feet,category:'neutralVolume'});}
            if(result?.fullHurt)animal.knockback(source,.4);
            if(knockback){animal.knockback([animal.feet[0]+Math.sin(yaw),animal.feet[1],animal.feet[2]+Math.cos(yaw)],.4);this.scene.motion.velocity[0]*=.6;this.scene.motion.velocity[2]*=.6;}
            if(weapon&&(hurt||knockback)){this.sound(weapon==='minecraft:wooden_spear'?'item.spear_wood.hit':'item.spear.hit',{category:'playersVolume'});if(kinetic)this.scene.itemUse.hitFeedback=0;}
        }catch{if(this.current(scope,serial))this.notify('game.actionFailed');}finally{this.combatPending.delete(id);}
    }

    /** Swing the hand that actually performed a successful interaction.
     * @param {InteractionHand} hand Used carrier.
     */
    swing(hand:InteractionHand='mainhand'):void{(hand==='offhand'?this.scene.hand?.offhand:this.scene.hand)?.swing();}

    /** Use a held item after its block/entity interaction passes.
     * @param {InteractionHand} hand Main hand before offhand.
     * @return {boolean} Whether this hand consumed the input.
     */
    useItem(hand:InteractionHand):boolean{
        const p=this.session.view.envelope?.state.progress;if(!p||p.sleep)return false;
        const held=handStack(p.player.data,hand);if(!held)return false;
        if(this.scene?.itemUse?.start(p.player.data,hand)){this.cancelMining();this.kineticHits.clear();this.scene.hand?.setUse(this.scene.itemUse);if(spearProfile(held.id))this.sound(held.id==='minecraft:wooden_spear'?'item.spear_wood.use':'item.spear.use',{category:'playersVolume'});return true;}
        if(held.id==='minecraft:egg'){
            if(this.itemPending)return true;
            this.itemPending=true;
            const eye=this.scene.motion.feet.map((v,i)=>v+(i===1?(this.scene.motion.crouching?1.27:1.62):0)) as Cell,direction=this.scene.camera.getWorldDirection(this.scene.ray.ray.direction.clone()).toArray() as Cell,velocity=this.scene.motion.feet.map((v,i)=>v-this.scene.previousFeet[i]) as Cell,grounded=this.scene.motion.grounded;
            void this.run({type:'throw-egg',scene:p.scene,hand,expected:layout(this.inventory.value)},null).then(ok=>{if(ok){this.swing(hand);this.scene.throwEgg(eye,direction,velocity,grounded);this.sound('entity.egg.throw',{volume:.5,pitch:.4/(Math.random()*.4+.8),category:'playersVolume'});}}).finally(()=>{this.itemPending=false;});return true;
        }
        return this.inventory?.autoEquip(hand)??false;
    }

    /** Follow Java's per-hand entity/block/item priority; only PASS allows the offhand attempt.
     * @param {Pick} hit Fresh ray target.
     * @param {boolean} shift Secondary-use modifier.
     * @param {boolean} attach Explicit device attachment.
     * @param {boolean} above Explicit upper face.
     * @param {InteractionHand} hand Carrier being tried.
     * @return {boolean} Whether an interaction consumed the input.
     */
    use(hit:Pick,shift:boolean,attach=false,above=false,hand:InteractionHand='mainhand'):boolean{
        const p=this.session.view.envelope?.state.progress;if(!p||p.sleep)return false;
        const held=handStack(p.player.data,hand),occupied=!!(handStack(p.player.data)||handStack(p.player.data,'offhand')),secondary=shift&&occupied;
        const placed=p.scenes[p.scene].blocks?.find(b=>b.id===hit.id),found=p.scenes[p.scene].stations.find(s=>s.id===hit.id);
        if(hand==='mainhand'&&!secondary){
            if(hit.block==='straw_bed'||placed?.block==='straw_bed'){void this.run({type:'use-bed',scene:p.scene,id:hit.id,feet:[...this.scene.motion.feet] as Cell,yaw:this.scene.look?.yaw},null);return true;}
            if(hit.id==='birthday-cake'||placed&&isCake(placed.block)){void this.run({type:'eat-cake',scene:p.scene,id:hit.id,expectedBites:placed?Number(placed.state.bites??0):p.cakePlacement?.bites??0},null,'entity.generic.eat',undefined,{volume:.5,pitch:1,category:'playersVolume'});return true;}
            if(placed&&isStorage(placed.block)){this.inventory.openWorkbench(placed.id);return true;}
            if(placed&&['oak_door','oak_trapdoor','oak_fence_gate','lever','oak_button','stone_button'].includes(placed.block)){void this.run({type:'use-block',scene:p.scene,id:placed.id},null).then(ok=>{if(ok)this.swing(hand);});return true;}
            if(found&&!(attach&&this.heldKind(hand))){this.inventory.openWorkbench(found.id);return true;}
        }
        if(hit.id==='birthday-table'){
            if(held?.id===ODD_CAKE){void this.run({type:'try-odd-cake-table',scene:p.scene,hand,expected:layout(this.inventory.value)},null);return true;}
            if(p.scene==='home'&&held?.id==='minecraft:cake'){void this.run({type:'record-cake-placement',scene:'home',table:'birthday-table',hand,expected:layout(this.inventory.value)},null);return true;}
        }
        if(hit.id==='node:cow:0'&&held?.id==='minecraft:bucket'){void this.run({type:'harvest-node',scene:p.scene,node:'cow:0',visit:p.world.visits[p.scene].epoch,hand,expected:layout(this.inventory.value)},'game.harvested','entity.cow.milk').then(ok=>{if(ok)this.swing(hand);});return true;}
        if((secondary&&(hit.block==='straw_bed'||placed?.block==='straw_bed')||hit.id==='birthday-cake')&&this.heldBlock(hand))return this.place(hit,hand);
        if(hit.id==='birthday-cake')return this.useItem(hand);
        const context=this.blockHit(hit);
        const shieldFirst=hand==='mainhand'&&!!held&&/_(hoe|shovel)$/.test(held.id)&&handStack(p.player.data,'offhand')?.id==='minecraft:shield'&&!this.scene.itemUse?.shieldCooldown;
        if(!shieldFirst&&canTill(p,context.cell,context.normal,held)){void this.run({type:'till-soil',scene:p.scene,cell:context.cell,normal:context.normal,hand,expected:layout(this.inventory.value)},null,'item.hoe.till').then(ok=>{if(ok)this.swing(hand);});return true;}
        if((hit.block==='farmland'||hit.id.startsWith('plot:'))&&context.normal[1]===1&&held?.id==='minecraft:wheat_seeds'){
            void this.run({type:'plant-crop',cell:[context.cell[0],context.cell[1]+1,context.cell[2]],id:crypto.randomUUID(),hand,expected:layout(this.inventory.value)},'game.planted','item.crop.plant');return true;
        }
        if(this.heldBlock(hand)&&!hit.id.includes('cow:')&&!hit.id.includes('chicken:'))return this.place(found&&attach?this.attachHit(hit,above):hit,hand);
        return this.useItem(hand);
    }

    /** Place finite blocks against valid faces, orienting device outlets with cardinal face normals; ordinary cakes request the birthday table. @param {Pick} hit Real face. @param {InteractionHand} hand Consuming carrier. @return {boolean} Whether placement consumed the input. */
    place(hit: Pick,hand:InteractionHand='mainhand'): boolean {
        const p = this.session.view.envelope?.state.progress, kind = this.heldKind(hand),block=this.heldBlock(hand);
        if (!p || !block) return false;
        if(block==='cake'){this.author('chat.cakeTableOnly');return true;}
        if(!kind){const material=blockSounds(block),context=this.blockHit(hit);try{placementBlocks(p,block,context,'preview');}catch{return false;}void this.run({type:'place-block',hand,scene:p.scene,item:block,hit:context,id:crypto.randomUUID(),expected:layout(this.inventory.value)},null,material.place,undefined,{volume:(material.volume+1)/2,pitch:material.pitch*.8}).then(ok=>{if(ok)this.swing(hand);});return true;}
        const normal=this.blockHit(hit).normal;
        this.facing=kind==='hopper'?(normal[1]?'down':normal[0]>0?'west':normal[0]<0?'east':normal[2]>0?'north':'south' as Facing):opposite(lookFacing(this.scene.camera.rotation.y)) as Facing;
        const candidate = placement(hit, this.session, kind, this.facing === 'down' && kind !== 'hopper' ? 'south' : this.facing);
        if (candidate.valid && !this.scene.playerIntersects(candidate.cell)) {
            const {valid, ...station} = candidate;
            station.id = crypto.randomUUID();
            this.run({
                type: 'put-station',hand,
                scene: p.scene,
                station,
                expected: layout(this.inventory.value)
            }, 'game.workbenchPlaced', blockSounds(kind).place,undefined,{volume:(blockSounds(kind).volume+1)/2,pitch:blockSounds(kind).pitch*.8});
        } else return false;
        return true;
    }

    /** Disconnect input and transient preview, leaving all durable simulation untouched. */
    dispose(): void {
        this.cancelMining();
        this.scene.onMineStart = null;
        this.scene.onMineCancel = null;
        clearInterval(this.poseTimer);this.scene.onPlayerTick=null;
        this.abort.abort();
        this.scene.showPreview(null);
        this.scene.onHover = null;
        this.scene.onPick = null;
        this.scene.onUse = null;
        this.scene.onEggImpact=null;this.scene.onShieldWear=null;this.inventory.itemCooldown=null;
    }
}
