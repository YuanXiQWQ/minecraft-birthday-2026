/** Java 26.3 GameRenderer projection bob, independent of the authoritative aim and player collision body. */
import {Matrix4} from 'three';
import type {PlayerMotion} from '../domain/player-motion.ts';

/** Reproduce the native interpolated translation and ordered Z/X rotations.
 * @param {PlayerMotion} motion Active 20 Hz local motion.
 * @param {number} alpha Render partial tick.
 * @return {Matrix4} Camera-space projection transform, also used by the first-person hand.
 */
export function viewBob(motion:PlayerMotion,alpha:number):Matrix4{
    const walk=-(motion.walk+(motion.walk-motion.walkOld)*alpha),bob=motion.bobOld+(motion.bob-motion.bobOld)*alpha,s=Math.sin(walk*Math.PI),c=Math.cos(walk*Math.PI);
    return new Matrix4().makeTranslation(s*bob*.5,-Math.abs(c*bob),0).multiply(new Matrix4().makeRotationZ(s*bob*3*Math.PI/180)).multiply(new Matrix4().makeRotationX(Math.abs(Math.cos(walk*Math.PI-.2)*bob)*5*Math.PI/180));
}
