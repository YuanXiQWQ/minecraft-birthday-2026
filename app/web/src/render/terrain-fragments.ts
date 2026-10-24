/** Java 26.3 ClientLevel and TerrainParticle birth, lifetime and collision equations. */
import type {Cell} from '../domain/types.ts';
import type {Bounds} from '../domain/player-motion.ts';

export interface TerrainFragment {position:Cell;previous:Cell;velocity:Cell;age:number;lifetime:number;halfSize:number;body:number;u:number;v:number;ground:boolean;stopped:boolean}

/** Construct one native terrain fragment, retaining Java float operations in randomized initialization.
 * @param {Cell} point World-space birth position.
 * @param {Cell} auxiliary Shape-relative initial impulse.
 * @param {Function} random Native nextFloat source.
 * @return {TerrainFragment} Unadvanced particle.
 */
export function terrainFragment(point:Cell,auxiliary:Cell,random:()=>number):TerrainFragment {
    const f=Math.fround,lifetime=Math.floor(f(4/f(f(random()*f(.9))+f(.1)))),
        velocity=auxiliary.map(n=>n+f(f(f(random()*2)-1)*f(.4))) as Cell,
        speed=f(f(f(random()+random())+1)*f(.15)),length=Math.hypot(...velocity)||1;
    for(let i=0;i<3;i++)velocity[i]=velocity[i]/length*speed*f(.4)+(i===1?f(.1):0);
    const halfSize=f(f(f(.1)*f(f(random()*.5)+.5))*2)/2;
    return{position:[...point],previous:[...point],velocity,age:0,lifetime,halfSize,body:f(.2),u:f(random()*3),v:f(random()*3),ground:false,stopped:false};
}

/** Subdivide every original voxel box at native quarter-block density, with at least two samples per axis.
 * @param {Bounds[]} boxes Native disjoint selection shape.
 * @param {Cell} cell Broken block origin.
 * @param {Function} random Native nextFloat source.
 * @return {TerrainFragment[]} Volume-distributed fragments rather than a surface-point explosion.
 */
export function terrainBurst(boxes:Bounds[],cell:Cell,random:()=>number):TerrainFragment[] {
    const result:TerrainFragment[]=[];
    for(const box of boxes){
        const size=box.slice(0,3).map((n,i)=>Math.min(1,box[i+3]-n)),counts=size.map(n=>Math.max(2,Math.ceil(n/.25)));
        for(let x=0;x<counts[0];x++)for(let y=0;y<counts[1];y++)for(let z=0;z<counts[2];z++){
            const relative=[(x+.5)/counts[0],(y+.5)/counts[1],(z+.5)/counts[2]];
            result.push(terrainFragment(relative.map((n,i)=>cell[i]+box[i]+n*size[i]) as Cell,relative.map(n=>n-.5) as Cell,random));
        }
    }
    return result;
}

/** Clip one particle displacement against the finite world's original collision boxes.
 * @param {Bounds} body Particle collision body.
 * @param {Bounds[]} solids Nearby world collisions.
 * @param {number} axis Movement axis.
 * @param {number} amount Desired displacement.
 * @return {number} Unobstructed displacement.
 */
function clip(body:Bounds,solids:Bounds[],axis:number,amount:number):number {
    for(const box of solids){if(![0,1,2].filter(i=>i!==axis).every(i=>body[i+3]>box[i]&&body[i]<box[i+3]))continue;
        if(amount>0&&body[axis+3]<=box[axis])amount=Math.min(amount,box[axis]-body[axis+3]);
        else if(amount<0&&body[axis]>=box[axis+3])amount=Math.max(amount,box[axis+3]-body[axis]);}
    return amount;
}

/** Advance native gravity, friction, grounded damping and stopped-by-collision at 20 Hz.
 * @param {TerrainFragment} particle Owned transient fragment.
 * @param {Bounds[]} solids Nearby original collision shapes.
 * @return {boolean} Whether this particle remains alive.
 */
export function tickTerrainFragment(particle:TerrainFragment,solids:Bounds[]):boolean {
    const p=particle;p.previous=[...p.position];if(p.age++>=p.lifetime)return false;
    p.velocity[1]-=.04;
    if(!p.stopped){
        const [x,y,z]=p.position,r=p.body/2,body:Bounds=[x-r,y,z-r,x+r,y+p.body,z+r],desired=[...p.velocity] as Cell,moved=[...desired] as Cell;
        for(const axis of Math.abs(desired[0])<Math.abs(desired[2])?[1,2,0]:[1,0,2]){moved[axis]=clip(body,solids,axis,moved[axis]);body[axis]+=moved[axis];body[axis+3]+=moved[axis];}
        p.position=p.position.map((n,i)=>n+moved[i]) as Cell;
        p.ground=desired[1]!==moved[1]&&desired[1]<0;
        p.stopped=Math.abs(desired[1])>=Math.fround(.00001)&&Math.abs(moved[1])<Math.fround(.00001);
        for(const axis of [0,2])if(desired[axis]!==moved[axis])p.velocity[axis]=0;
    }
    for(let i=0;i<3;i++)p.velocity[i]*=Math.fround(.98);
    if(p.ground){p.velocity[0]*=Math.fround(.7);p.velocity[2]*=Math.fround(.7);}
    return true;
}
