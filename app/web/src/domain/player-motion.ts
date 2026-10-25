/** Java 26.3 grounded player dimensions, 20 Hz travel and axis-separated block collision. */
import type {Cell} from './types.ts';

export type Bounds = [number, number, number, number, number, number];
/** Attributes and Player standing dimensions from the locked 26.3 client. */
export const PLAYER_PHYSICS = {width: .6, height: 1.8, eye: 1.62, crouchHeight: 1.5, crouchEye: 1.27, step: .6, blockReach: 4.5, entityReach: 3} as const;

/** Return a standing or crouching player's collision box at its feet.
 * @param {Cell} feet Position at the bottom center.
 * @param {boolean} crouch Crouching pose.
 * @return {Bounds} Native player AABB.
 */
export function playerBounds(feet: Cell, crouch = false): Bounds {return [feet[0]-.3, feet[1], feet[2]-.3, feet[0]+.3, feet[1]+(crouch?1.5:1.8), feet[2]+.3];}
/** Test strict overlapping volumes, allowing face contact.
 * @param {Bounds} a First box.
 * @param {Bounds} b Second box.
 * @return {boolean} Whether their interiors intersect.
 */
export function overlaps(a:Bounds,b:Bounds):boolean{return [0,1,2].every(i=>a[i]<b[i+3]-1e-7&&a[i+3]>b[i]+1e-7);}
/** Clip movement along a single axis against the world's collision shapes.
 * @param {Bounds} box Player bounds.
 * @param {Bounds[]} solids Nearby block shapes.
 * @param {number} axis Coordinate axis.
 * @param {number} amount Desired displacement.
 * @return {number} Displacement stopping at the first face.
 */
export function clip(box:Bounds,solids:Bounds[],axis:number,amount:number):number{
    for(const b of solids){if(![0,1,2].filter(i=>i!==axis).every(i=>box[i+3]>b[i]+1e-7&&box[i]<b[i+3]-1e-7))continue;
        if(amount>0&&box[axis+3]<=b[axis]+1e-7)amount=Math.min(amount,b[axis]-box[axis+3]);
        else if(amount<0&&box[axis]>=b[axis+3]-1e-7)amount=Math.max(amount,b[axis+3]-box[axis]);}
    return amount;
}
/** Integrate a local player; scene/save facts remain owned by the transactional world. */
export class PlayerMotion {
    autoJumpTime=0;
    feet:Cell=[0,0,7]; velocity:Cell=[0,0,0]; grounded=false; crouching=false; jumpDelay=0;
    sprinting=false;forwardDown=false;sprintWindow=0;walk=0;walkOld=0;bob=0;bobOld=0;moveDistance=0;nextStep=1;step=false;fallDistance=0;landedDistance=0;
    /** Reset momentum on a scene transition.
     * @param {Cell} eye Authored safe spawn eye.
     */
    reset(eye:Cell):void{this.autoJumpTime=0;this.feet=[eye[0],eye[1]-PLAYER_PHYSICS.eye,eye[2]];this.velocity=[0,0,0];this.grounded=false;this.crouching=false;this.jumpDelay=0;this.sprinting=this.forwardDown=this.step=false;this.sprintWindow=this.walk=this.walkOld=this.bob=this.bobOld=this.moveDistance=this.fallDistance=this.landedDistance=0;this.nextStep=1;}
    /** Resolve Y then horizontal axes, matching Entity collision ordering.
     * @param {Cell} delta Desired movement.
     * @param {Bounds[]} solids Collision shapes.
     * @param {Cell} origin Starting feet.
     * @return {Cell} Clipped displacement.
     */
    resolve(delta:Cell,solids:Bounds[],origin=this.feet):Cell{
        const box=playerBounds(origin,this.crouching),result:Cell=[0,0,0],axes=Math.abs(delta[0])<Math.abs(delta[2])?[1,2,0]:[1,0,2];
        for(const a of axes){result[a]=clip(box,solids,a,delta[a]);box[a]+=result[a];box[a+3]+=result[a];}return result;
    }
    /** Advance one native travel tick with WASD, jump, sprint, edge-safe sneak and complete downward landing distance.
     * @param {Set<string>} keys Physical keyboard codes currently held.
     * @param {number} yaw Camera yaw in Three's right-handed coordinates.
     * @param {Bounds[]} solids Nearby authoritative collision shapes.
     * @param {{water?:boolean,climb?:boolean,sprintWindow?:number,autoJump?:boolean}} environment Fluid occupancy and native movement preferences.
     */
    tick(keys:Set<string>,yaw:number,solids:Bounds[],environment:{water?:boolean,climb?:boolean,sprintWindow?:number,autoJump?:boolean}={}):void{
        if(this.autoJumpTime>0){this.autoJumpTime--;if(environment.autoJump){keys=new Set(keys);keys.add('Space');}}
        this.walkOld=this.walk;this.bobOld=this.bob;this.bob+=((this.grounded&&!environment.water?Math.min(.1,Math.hypot(this.velocity[0],this.velocity[2])):0)-this.bob)*.4;this.step=false;this.landedDistance=0;
        const sneak=keys.has('ShiftLeft')||keys.has('ShiftRight');
        this.crouching=sneak||solids.some(b=>overlaps(playerBounds(this.feet),b));
        const forward=keys.has('KeyW')&&!keys.has('KeyS');if(this.sprintWindow>0)this.sprintWindow--;
        if(forward&&!this.forwardDown){if(this.sprintWindow>0)this.sprinting=true;this.sprintWindow=environment.sprintWindow??7;}
        this.forwardDown=forward;if(!forward||this.crouching)this.sprinting=false;else if(keys.has('ControlLeft')||keys.has('ControlRight'))this.sprinting=true;
        const sprint=this.sprinting;
        let x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));
        const norm=Math.max(1,Math.hypot(x,z)),scale=.98*(this.crouching?.3:1)/norm;x*=scale;z*=scale;
        const accel=environment.water?.02:this.grounded?(sprint?.13:.1):(sprint?.026:.02),cos=Math.cos(yaw),sin=Math.sin(yaw);
        this.velocity[0]+=(x*cos+z*sin)*accel;this.velocity[2]+=(z*cos-x*sin)*accel;
        if(this.jumpDelay>0)this.jumpDelay--;if(!keys.has('Space'))this.jumpDelay=0;
        if(environment.water){if(keys.has('Space'))this.velocity[1]+=.04;if(sneak)this.velocity[1]-=.04;}
        else if(keys.has('Space')&&this.grounded&&!this.jumpDelay){this.velocity[1]=.42;this.jumpDelay=10;if(sprint){this.velocity[0]-=Math.sin(yaw)*.2;this.velocity[2]-=Math.cos(yaw)*.2;}}
        if(environment.climb){for(const a of [0,2])this.velocity[a]=Math.max(-.15,Math.min(.15,this.velocity[a]));this.velocity[1]=Math.max(sneak?0:-.15,this.velocity[1]);}
        const desired=[...this.velocity] as Cell;
        if(this.grounded&&sneak){for(const a of [0,2])while(Math.abs(desired[a])>1e-7){const test=[...this.feet] as Cell;test[a]+=desired[a];test[1]-=.6;if(solids.some(b=>overlaps(playerBounds(test,this.crouching),b)))break;desired[a]=Math.abs(desired[a])<=.05?0:desired[a]-Math.sign(desired[a])*.05;}}
        let moved=this.resolve(desired,solids);
        if((this.grounded||desired[1]<0&&moved[1]!==desired[1])&&(moved[0]!==desired[0]||moved[2]!==desired[2])){
            const up=this.resolve([0,.6,0],solids),raised=this.feet.map((n,i)=>n+up[i]) as Cell,step=this.resolve([desired[0],0,desired[2]],solids,raised);
            if(step[0]**2+step[2]**2>moved[0]**2+moved[2]**2){const down=this.resolve([0,-up[1]+desired[1],0],solids,raised.map((n,i)=>n+step[i]) as Cell);moved=[step[0],up[1]+down[1],step[2]];}
        }
        this.grounded=desired[1]<0&&Math.abs(moved[1]-desired[1])>1e-7;
        this.feet=this.feet.map((n,i)=>n+moved[i]) as Cell;
        for(let i=0;i<3;i++)if(Math.abs(moved[i]-desired[i])>1e-7)this.velocity[i]=0;
        const wall=moved[0]!==desired[0]||moved[2]!==desired[2];
        if(wall)this.sprinting=false;
        const horizontal=Math.hypot(moved[0],moved[2])*.6;this.walk+=horizontal;this.moveDistance+=environment.climb?Math.hypot(...moved)*.6:horizontal;
        if(environment.water)this.fallDistance=0;else if(moved[1]<0)this.fallDistance-=moved[1];if(this.grounded){this.landedDistance=this.fallDistance;this.fallDistance=0;}
        if(this.moveDistance>this.nextStep&&(this.grounded||environment.climb)&&!environment.water){this.nextStep=Math.floor(this.moveDistance)+1;this.step=!sneak;}
        if(environment.climb&&(wall||keys.has('Space')))this.velocity[1]=.2;
        if(environment.water){this.velocity[1]=this.velocity[1]*.8-.005;if(wall){const raised=this.feet.map((n,i)=>n+(i===1?.6:desired[i])) as Cell;if(!solids.some(b=>overlaps(playerBounds(raised,this.crouching),b)))this.velocity[1]=.3;}}
        else this.velocity[1]=(this.velocity[1]-.08)*.98;
        const drag=environment.water?(sprint?.9:.8):this.grounded?.6*.91:.91;this.velocity[0]*=drag;this.velocity[2]*=drag;
        for(let i=0;i<3;i++)if(Math.abs(this.velocity[i])<.003)this.velocity[i]=0;
        if(environment.autoJump&&!environment.water&&!environment.climb&&!keys.has('Space'))this.planAutoJump(keys,yaw,solids,moved);
    }

    /** Schedule the native one-tick automatic jump using two shoulder rays and overhead clearance.
     * @param {Set<string>} keys Logical movement controls.
     * @param {number} yaw Current orientation.
     * @param {Bounds[]} solids Nearby native collision shapes.
     * @param {Cell} moved Actual travel displacement.
     */
    planAutoJump(keys:Set<string>,yaw:number,solids:Bounds[],moved:Cell):void{
        if(!this.grounded||this.crouching||this.autoJumpTime||!['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k)))return;
        let dx=moved[0],dz=moved[2],speed=this.sprinting?.13:.1;
        if(dx*dx+dz*dz<=.001){const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));dx=(x*Math.cos(yaw)+z*Math.sin(yaw))*speed;dz=(z*Math.cos(yaw)-x*Math.sin(yaw))*speed;}
        const length=Math.hypot(dx,dz);if(length*length<=.001)return;const nx=dx/length,nz=dz/length;if(-Math.sin(yaw)*nx-Math.cos(yaw)*nz<-.15)return;
        const [x,y,z]=this.feet,distance=Math.max(speed*7,length),eyeCell=[Math.floor(x),Math.floor(y+PLAYER_PHYSICS.height),Math.floor(z)];
        if(solids.some(b=>overlaps(b,[eyeCell[0],eyeCell[1],eyeCell[2],eyeCell[0]+1,eyeCell[1]+2,eyeCell[2]+1])))return;
        for(const b of solids){if(b[1]>y+.51||b[4]<y+.51)continue;
            let hit=false;for(const side of [-1,1]){const sx=x+nz*.3*side,sz=z-nx*.3*side,ex=sx+dx+nx*distance,ez=sz+dz+nz*distance;let enter=0,leave=1;
                for(const [start,end,min,max] of [[sx,ex,b[0],b[3]],[sz,ez,b[2],b[5]]]){const d=end-start;if(Math.abs(d)<1e-9){if(start<min||start>max){enter=2;break;}}else{const a=(min-start)/d,c=(max-start)/d;enter=Math.max(enter,Math.min(a,c));leave=Math.min(leave,Math.max(a,c));}}if(enter<=leave)hit=true;}
            if(!hit)continue;let top=b[4];const cx=(b[0]+b[3])/2,cz=(b[2]+b[5])/2;
            for(const above of solids)if(cx>=above[0]&&cx<=above[3]&&cz>=above[2]&&cz<=above[5]&&above[1]<y+2.8&&above[4]>top)top=Math.max(top,above[4]);
            if(top-y>.5&&top-y<=1.2)this.autoJumpTime=1;return;
        }
    }
}
