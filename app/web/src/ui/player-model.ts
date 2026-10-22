/** Java 26.3 wide PlayerModel cuboids and InventoryScreen mouse projection, independent of DOM and persistent state. */
import {Vector3} from 'three';import type {CompiledModel} from '../render/model-format.ts';
export type PartName='head'|'body'|'rightArm'|'leftArm'|'rightLeg'|'leftLeg';
export interface PlayerPart {name:PartName;pivot:[number,number,number];box:number[];overlay:number[];inflate:number}
/** Native model-space cuboids use downward Y, front -Z, sixteen model pixels per block. */
export const PLAYER_PARTS:PlayerPart[]=[
 {name:'head',pivot:[0,0,0],box:[-4,-8,-4,8,8,8,0,0],overlay:[-4,-8,-4,8,8,8,32,0],inflate:.5},
 {name:'body',pivot:[0,0,0],box:[-4,0,-2,8,12,4,16,16],overlay:[-4,0,-2,8,12,4,16,32],inflate:.25},
 {name:'rightArm',pivot:[-5,2,0],box:[-3,-2,-2,4,12,4,40,16],overlay:[-3,-2,-2,4,12,4,40,32],inflate:.25},
 {name:'leftArm',pivot:[5,2,0],box:[-1,-2,-2,4,12,4,32,48],overlay:[-1,-2,-2,4,12,4,48,48],inflate:.25},
 {name:'rightLeg',pivot:[-1.9,12,0],box:[-2,0,-2,4,12,4,0,16],overlay:[-2,0,-2,4,12,4,0,32],inflate:.25},
 {name:'leftLeg',pivot:[1.9,12,0],box:[-2,0,-2,4,12,4,16,48],overlay:[-2,0,-2,4,12,4,0,48],inflate:.25}
];
/** Native screen rectangles and model scale; the original panel background stays behind the entity. */
export const PLAYER_WINDOWS={personal:{x:26,y:8,width:49,height:70,scale:30},equipment:{x:73,y:6,width:32,height:43,scale:20}};
/** Reproduce the arctangent body/head tracking rather than inventing a turntable animation.
 * @param {number} dx Logical mouse X relative to preview center.
 * @param {number} dy Logical mouse Y relative to preview center.
 * @return {object} Radian model-space rotations derived from InventoryScreen's 40/20 constants.
 */
export function playerLook(dx:number,dy:number){const x=Math.atan(-dx/40),y=Math.atan(dy/40),r=Math.PI/180;return{body:-x*20*r,head:-x*20*r,pitch:y*20*r,tilt:y*20*r};}
/** Build native Cube polygon UVs with deformation changing geometry only, never stretching atlas coordinates.
 * @param {number[]} box Native x,y,z,width,height,depth,u,v.
 * @param {string} texture Original atlas identity.
 * @param {number} height Atlas height (skin64, armor32).
 * @param {number} inflate Native cube deformation in model pixels.
 * @param {boolean} mirror Native left armor mirroring.
 * @return {CompiledModel} Six independent textured faces.
 */
export function playerCube(box:number[],texture:string,height=64,inflate=0,mirror=false):CompiledModel{const[x,y,z,w,h,d,u,v]=box;let a=x-inflate,A=x+w+inflate;if(mirror)[a,A]=[A,a];const b=y-inflate,B=y+h+inflate,c=z-inflate,C=z+d+inflate,vertices=[[a,b,c],[A,b,c],[A,B,c],[a,B,c],[a,b,C],[A,b,C],[A,B,C],[a,B,C]],faces=[[5,4,0,1],[2,3,7,6],[0,4,7,3],[1,0,3,2],[5,1,2,6],[4,5,6,7]],rects=[[u+d,v,u+d+w,v+d],[u+d+w,v+d,u+d+2*w,v],[u,v+d,u+d,v+d+h],[u+d,v+d,u+d+w,v+d+h],[u+d+w,v+d,u+2*d+w,v+d+h],[u+2*d+w,v+d,u+2*d+2*w,v+d+h]],out:CompiledModel={positions:[],normals:[],uvs:[],indices:[],faces:[],textures:[texture]};for(let f=0;f<6;f++){const ps=faces[f].map(i=>new Vector3(...vertices[i] as [number,number,number]).multiplyScalar(1/16)),n=ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).normalize(),[U,V,R,S]=rects[f],uv=[[R,V],[U,V],[U,S],[R,S]];for(let i=0;i<4;i++){out.positions.push(...ps[i].toArray());out.normals.push(...n.toArray());out.uvs.push(uv[i][0]/64,1-uv[i][1]/height);}const start=f*4;out.indices.push(start,start+1,start+2,start,start+2,start+3);out.faces.push({direction:'north',texture});}return out;}
/** Select armor parts independently per native equipment slot, without item-name suffix inference.
 * @param {string} slot Verified equippable component slot.
 * @return {PartName[]} Native visible armor subparts.
 */
export function armorParts(slot:string):PartName[]{switch(slot){case'head':return['head'];case'chest':return['body','rightArm','leftArm'];case'legs':return['body','rightLeg','leftLeg'];case'feet':return['rightLeg','leftLeg'];default:return[];}}
