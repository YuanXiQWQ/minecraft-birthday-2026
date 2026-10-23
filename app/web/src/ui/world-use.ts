/** Formal free-pointer world actions bind actual ray hits to current-generation semantic commands. */
import {miningTicks} from '../domain/mining.ts';
import {blockSounds} from '../domain/block-sounds.ts';
import type {SoundOptions} from '../render/world-audio.ts';
import type {SaveSession} from '../persistence/session.ts';
import type {GameInventory} from './inventory.ts';
import type {SceneView, Pick} from '../render/scene.ts';
import type {Station, Cell, Facing, Kind} from '../domain/types.ts';
import {WORLD_REGION, WORLD_SCENES, sameCell, supported, sourceOccupied} from '../domain/world-config.ts';
import {emptyFurnace} from '../domain/furnace.ts';
import {emptyHopper} from '../domain/hopper.ts';
import {layout} from '../domain/inventory.ts';

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
        valid: hit.support !== false && WORLD_REGION.allows(p.scene, station) && !list.some(s => sameCell(s.cell, cell)) && supported(p, cell) && !sourceOccupied(p, cell)
    };
}

/** Own bounded device orientation and actions; no carrier contents or natural facts live here. */
export class WorldUse {
    mining: { id: string; scope: string; tool: string; start: number; ticks: number; hit: Pick; block: string; cell: Cell; nextSound: number } | null = null;
    miningTimer = 0;
    holding = false;
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

    /** Connect actual ray actions and a scoped rotation shortcut. @param {SceneView} scene True camera view. @param {GameInventory} inventory GUI/carrier authority. @param {SaveSession} session Shared transaction owner. @param {Function} notify Localized feedback consumer. @param {Function} sound Native interaction audio. */
    constructor(public scene: SceneView, public inventory: GameInventory, public session: SaveSession, public notify: (key: string) => void, public sound: (id: string, options?: SoundOptions) => void) {
        this.scope = session.view.envelope?.generation + ':' + session.view.envelope?.state.progress.scene;
        scene.onHover = hit => {
            if (this.mining && hit?.id !== this.mining.id) this.clearMiningProgress();
            this.hover = hit;
            scene.renderer.domElement.style.cursor = hit && (hit.id.startsWith('node:') || hit.id.startsWith('crop:') || !!session.view.envelope?.state.progress.scenes[session.view.envelope.state.progress.scene].stations.some(s => s.id === hit.id)) ? 'pointer' : 'default';
            this.preview();
        };
        scene.canUse = hit => {
            const p = session.view.envelope?.state.progress, held = p?.player.data.hotbar[p.player.data.selected], equip = held && inventory.rules.items[held.id]?.equipment;
            if (!hit) return !!equip;
            return !!p && (!!equip || (hit.id === 'birthday-table' || hit.id.startsWith('plot:') || hit.id.includes('cow:') || !!this.heldKind() || p.scenes[p.scene].stations.some(s => s.id === hit.id)));
        };
        scene.onMineStart = hit => this.beginMining(hit);
        scene.onMineCancel = () => this.cancelMining();
        scene.onPick = null;
        scene.onUse = (hit, modifiers) => {
            if (hit) this.use(hit, !!modifiers?.shift, !!modifiers?.alt, !!modifiers?.ctrl); else inventory.autoEquip();
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
            if (e.code !== 'KeyR' || scene.look.active || !scene.input || inventory.modal.open || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
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

    /** Read only the selected actual temporary group. @return {Kind|null} Placeable selected device, if any. */
    heldKind(): Kind | null {
        const p = this.session.view.envelope?.state.progress,
            id = p?.player.data.hotbar[p.player.data.selected]?.id.replace('minecraft:', '');
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
        point: Cell
    }, options?: SoundOptions): Promise<boolean> {
        const scope = this.session.view.envelope?.generation + ':' + this.session.view.envelope?.state.progress.scene, serial = this.session.serial;
        return this.session.dispatch(command).then(events => {
            if (!this.current(scope, serial)) return false;
            if (command.type === 'harvest-node' || command.type === 'harvest-crop') this.scene.renderer.domElement.dataset.harvestResult = JSON.stringify({command, events, selected: this.session.view.envelope!.state.progress.player.data.selected, backpack: this.session.view.envelope!.state.progress.player.data.backpack, unlocked: this.session.view.envelope!.state.progress.unlocked});
            if (effect) this.scene.breakEffect(effect.block, effect.point);
            if (message && !['harvest-node', 'harvest-crop'].includes(command.type) && !events.some(e => e.type === 'item-unlocked')) this.notify(message);
            if (sound) this.sound(sound, {...options, valid: () => this.current(scope, serial)});
            this.preview();
            return true;
        }).catch(error => {if (this.current(scope, serial)) this.notify(error instanceof Error && error.message === 'inventory-full' ? 'game.inventoryFull' : 'game.actionFailed'); return false;});
    }

    /** Fence both successful and failed acknowledgements to their live scene and save owner.
     * @param {string} scope Issuing save generation and scene.
     * @param {number} serial Issuing page lifecycle serial.
     * @return {boolean} Whether feedback still belongs to this active adapter.
     */
    current(scope: string, serial: number): boolean {
        return !this.abort.signal.aborted && !this.scene.disposed && !this.session.disposed && !this.session.suspended && serial === this.session.serial && scope === this.session.view.envelope?.generation + ':' + this.session.view.envelope?.state.progress.scene;
    }

    /** Begin a cancellable held attack; target progress can change without requiring another press.
     * @param {Pick|null} hit Current nearest ray target, including a press that starts over empty space.
     * @param {number} now Injectable monotonic start time.
     */
    beginMining(hit: Pick | null, now = performance.now()): void {
        this.cancelMining();
        const e = this.session.view.envelope;
        if (!e || !this.scene.input || !this.session.view.writable) return;
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

    /** Start progress and initial native hit feedback for the live visible block using the actual main-hand tool.
     * @param {Pick} hit Fresh nearest ray target.
     * @param {number} now Active monotonic time.
     */
    selectMining(hit: Pick, now: number): void {
        const e = this.session.view.envelope!;
        const p = e.state.progress, station = p.scenes[p.scene].stations.find(s => s.id === hit.id),
            node = WORLD_SCENES[p.scene].nodes.find(n => 'node:' + n.id === hit.id),
            block = station?.kind ?? (hit.id.startsWith('crop:') ? 'wheat' : node?.block);
        if (!block || node?.kind === 'cow') return;
        const held = p.player.data.hotbar[p.player.data.selected], ticks = node?.kind === 'egg' ? 0 : miningTicks(block, held, this.inventory.rules);
        this.mining = {id: hit.id, scope: this.holdScope, tool: JSON.stringify([p.player.data.selected, held]), start: now, ticks, hit, block, cell: station?.cell ?? node?.cell ?? hit.cell ?? hit.point.map(Math.floor) as Cell, nextSound: now + 200};
        if (!ticks || node?.kind === 'egg') this.finishMining(now);
        else {this.scene.renderer.domElement.dataset.mining = JSON.stringify(this.mining); this.scene.showCrack(hit.id, 0); this.miningSound();}
    }

    /** Play the native initial or four-tick block hit at its cell center, fencing unfinished decoding to this held target. */
    miningSound(): void {
        const m = this.mining, serial = this.holdSerial, epoch = this.miningEpoch;
        if (!m) return;
        const material = blockSounds(m.block);
        this.sound(material.hit, {volume: (material.volume + 1) / 8, pitch: material.pitch * .5,
            position: m.cell.map(n => n + .5) as Cell,
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
        const material = station ? blockSounds(station.kind) : null;
        const work = station ? this.run({type: 'remove-station', scene: p.scene, id: station.id, expected: layout(this.inventory.value)}, null, material!.break, {block: station.kind, point: m.hit.point}, {volume: material!.volume, pitch: material!.pitch, position: m.cell.map(n => n + .5) as Cell}) : this.harvest(m.hit);
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
        if (hit.id.startsWith('node:') && !hit.id.includes('cow:')) {
            const node = hit.id.slice(5), block = WORLD_SCENES[p.scene].nodes.find(n => n.id === node)?.block;
            return this.run({
                type: 'harvest-node',
                scene: p.scene,
                node,
                visit: p.world.visits[p.scene].epoch,
                expected: layout(this.inventory.value)
            }, 'game.harvested', block === 'egg' ? 'entity.item.pickup' : block?.includes('log') ? 'block.wood.break' : block?.includes('grass') || block === 'sugar_cane' ? 'block.grass.break' : 'block.stone.break', block && block !== 'egg' ? {
                block,
                point: hit.point
            } : undefined);
        } else if (hit.id.startsWith('crop:')) return this.run({
            type: 'harvest-crop',
            id: hit.id.slice(5),
            expected: layout(this.inventory.value)
        }, 'game.harvested', 'block.crop.break');
        return Promise.resolve(false);
    }

    /** Short right Use opens stations, plants, milks or places against actual faces. @param {Pick} hit Real ray. @param {boolean} shift Suppress opening a device. @param {boolean} attach Place against an existing device face. @param {boolean} above Explicit upper neighbor of the visible device. */
    use(hit: Pick, shift: boolean, attach = false, above = false): void {
        const p = this.session.view.envelope?.state.progress;
        if (!p) return;
        if (hit.id === 'birthday-table') {
            if (p.scene === 'home' && p.player.data.hotbar[p.player.data.selected]?.id === 'minecraft:cake') this.run({
                type: 'record-cake-placement',
                scene: 'home',
                table: 'birthday-table',
                expected: layout(this.inventory.value)
            }, 'game.cakePlaced'); else this.notify('game.tableNeedsCake');
            return;
        }
        const found = p.scenes[p.scene].stations.find(s => s.id === hit.id);
        if (found && attach && this.heldKind()) {
            this.place(this.attachHit(hit, above));
            return;
        }
        if (found && !shift) {
            this.inventory.openWorkbench(found.id);
            return;
        }
        if (found && shift) return;
        if (hit.id === 'node:cow:0') {
            this.run({
                type: 'harvest-node',
                scene: p.scene,
                node: 'cow:0',
                visit: p.world.visits[p.scene].epoch,
                expected: layout(this.inventory.value)
            }, 'game.harvested', 'entity.cow.milk');
            return;
        }
        if (hit.id.startsWith('plot:') && p.player.data.hotbar[p.player.data.selected]?.id === 'minecraft:wheat_seeds') {
            this.run({
                type: 'plant-crop',
                cell: hit.id.slice(5).split(',').map(Number) as Cell,
                id: crypto.randomUUID(),
                expected: layout(this.inventory.value)
            }, 'game.planted', 'item.crop.plant');
            return;
        }
        if (this.heldKind()) {
            this.place(hit);
            return;
        }
        this.inventory.autoEquip();
    }

    /** Place against a visible face with finite authored support, without consuming permanent eligibility. @param {Pick} hit Real face. */
    place(hit: Pick): void {
        const p = this.session.view.envelope?.state.progress, kind = this.heldKind();
        if (!p || !kind) return;
        const candidate = placement(hit, this.session, kind, this.facing === 'down' && kind !== 'hopper' ? 'south' : this.facing);
        if (candidate.valid) {
            const {valid, ...station} = candidate;
            station.id = crypto.randomUUID();
            this.run({
                type: 'put-station',
                scene: p.scene,
                station,
                expected: layout(this.inventory.value)
            }, 'game.workbenchPlaced', 'block.stone.break');
        } else this.notify('game.invalidPosition');
    }

    /** Disconnect input and transient preview, leaving all durable simulation untouched. */
    dispose(): void {
        this.cancelMining();
        this.scene.onMineStart = null;
        this.scene.onMineCancel = null;
        this.abort.abort();
        this.scene.showPreview(null);
        this.scene.onHover = null;
        this.scene.onPick = null;
        this.scene.onUse = null;
    }
}
