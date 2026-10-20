/** Original diagnostic geometry and flat colors; deliberately not Minecraft asset substitutes. */
import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, DoubleSide } from 'three';
import type { Material } from 'three';
import type { Facing, Kind } from './domain.ts';

/** Diagnostic palette is generated locally; no image/texture files are loaded. */
export const COLORS = { crafting_table: 0xc28a46, furnace: 0x648296, blast_furnace: 0x42586d, hopper: 0x52aaa2 };

/** Own shared materials and count individually disposed geometry for lifecycle evidence. */
export class DebugModels {
  materials = new Map<string, MeshStandardMaterial>();
  created = 0;
  released = 0;

  /** Reuse a diagnostic material within one adapter lifetime.
   * @param {string} key Cache key.
   * @param {number} color Flat color.
   * @return {MeshStandardMaterial} Shared material.
   */
  material(key: string, color: number): MeshStandardMaterial {
    if (!this.materials.has(key)) this.materials.set(key, new MeshStandardMaterial({ color, roughness: .85, metalness: .08, side: DoubleSide,
      transparent: key.startsWith('preview-'), opacity: key.startsWith('preview-') ? .42 : 1, depthWrite: !key.startsWith('preview-') }));
    return this.materials.get(key)!;
  }

  /** Attach one owned geometry and register its disposal counter.
   * @param {Group} root Parent group.
   * @param {BufferGeometry} geometry Owned geometry.
   * @param {Material} material Shared diagnostic or sample-probe material.
   * @param {number[]} position Local translation.
   * @return {Mesh} Attached mesh.
   */
  part(root: Group, geometry: BufferGeometry, material: Material, position: number[]): Mesh {
    const mesh = new Mesh(geometry, material); mesh.position.set(position[0],position[1],position[2]);
    this.created++; geometry.addEventListener('dispose', () => { this.released++; }); root.add(mesh); return mesh;
  }

  /** Build a visibly schematic device; hopper aperture and directional outlet are real geometry.
   * @param {Kind} kind Device type.
   * @param {Facing} facing Logical orientation.
   * @param {number|undefined} override Preview tint, when provided.
   * @return {Group} Unit-cell model with minimum corner at the origin.
   */
  device(kind: Kind, facing: Facing, override?: number): Group {
    const root = new Group(), body = new Group(); root.add(body); body.position.set(.5,0,.5);
    const mat = this.material(override === undefined ? kind : `preview-${override}`, override ?? COLORS[kind]);
    if (kind === 'hopper') {
      for (const [w,d,x,z] of [[1,.13,0,-.435],[1,.13,0,.435],[.13,.74,-.435,0],[.13,.74,.435,0]]) this.part(body,new BoxGeometry(w,.22,d),mat,[x,.84,z]);
      const funnel = this.part(body,new CylinderGeometry(.48,.15,.45,4,1,true),mat,[0,.505,0]); funnel.rotation.y = Math.PI/4;
      this.part(body,new BoxGeometry(.22, facing === 'down' ? .3 : .18, facing === 'down' ? .22 : .48),mat,[0,.16,facing === 'down' ? 0 : -.3]).name = 'outlet';
    } else {
      this.part(body,new BoxGeometry(.94,.94,.94),mat,[0,.47,0]);
      if (kind === 'crafting_table') {
        this.part(body,new BoxGeometry(1,.09,1),this.material('wood-top',0xe8ba72),[0,.97,0]);
      } else {
        this.part(body,new BoxGeometry(.55,.36,.035),this.material('opening',0x172b3e),[0,.4,-.484]);
        this.part(body,new BoxGeometry(.34,.08,.04),this.material('warm',0xffbb65),[0,.31,-.51]).name = 'front';
      }
    }
    if (facing !== 'down') body.rotation.y = -['north','east','south','west'].indexOf(facing) * Math.PI/2;
    return root;
  }

  /** Dispose only geometries owned by this instance; shared materials survive until adapter disposal.
   * @param {Group} root Model group.
   */
  release(root: Group): void { root.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); }); root.removeFromParent(); }

  /** Release every shared material after all model groups have been released. */
  dispose(): void { for (const material of this.materials.values()) material.dispose(); this.materials.clear(); }
}
