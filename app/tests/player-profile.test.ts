/** Identity validation and render-camera regressions use CPU geometry without native pointer capture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera,Raycaster} from 'three';
import {parseProfile,textureUrl} from '../web/src/ui/player-profile.ts';
import {playerParts} from '../web/src/ui/player-model.ts';
import {PlayerPerspective,nextPerspective} from '../web/src/render/player-perspective.ts';

/** Recorded public default profile, independently included in the audited resource manifest. */
const original=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/profile-manifest.json',import.meta.url),'utf8'));
/** Wrap the exact original Mojang textures property in the public lookup response.
 * @return {object} Valid response for sireoh.
 */
function response(){return{success:true,data:{player:{username:original.profile.name,raw_id:original.profile.id,properties:original.properties}}};}
test('exact case-insensitive Java identity retains native slim skin and equipped cape',()=>{const p=parseProfile(response(),'SIREOH');assert.equal(p.id,'929ae351eb2c4ebdb70044d7b0fa239f');assert.equal(p.slim,true);assert.match(p.skin,/^https:\/\/textures\.minecraft\.net\//);assert.ok(p.cape);});
test('similar names, invalid UUIDs and untrusted texture origins cannot become a matching player',()=>{assert.throws(()=>parseProfile(response(),'sireoh_'));const r=response();r.data.player.raw_id='a'.repeat(32);assert.throws(()=>parseProfile(r,'sireoh'));for(const url of ['https://evil.test/skin','data:image/png,x','https://textures.minecraft.net.evil.test/texture/'+'a'.repeat(64)])assert.throws(()=>textureUrl(url));});
test('native slim arms have three-pixel width and do not mutate wide geometry',()=>{const slim=playerParts(true),wide=playerParts();for(const name of ['rightArm','leftArm']){assert.equal(slim.find(p=>p.name===name)!.box[3],3);assert.equal(wide.find(p=>p.name===name)!.box[3],4);}assert.equal(slim.find(p=>p.name==='head'),wide.find(p=>p.name==='head'));});
test('F5 cycles first/back/front and does not transform physical camera or interaction direction',()=>{assert.equal(nextPerspective(nextPerspective(nextPerspective(0))),0);const eye=new PerspectiveCamera(70,1,.1,512);eye.position.set(0,1.62,0);eye.updateMatrixWorld();const original=eye.matrixWorld.clone();const view=Object.assign(Object.create(PlayerPerspective.prototype),{camera:new PerspectiveCamera(),ray:new Raycaster(),mode:1}) as PlayerPerspective;assert.equal(view.view(eye,[],()=>true).position.z,4);view.mode=2;assert.equal(view.view(eye,[],()=>true).position.z,-4);assert.deepEqual(eye.matrixWorld,original);view.mode=0;assert.equal(view.view(eye,[],()=>true),eye);});
test('third-person camera clips against visible walls on either side without moving the player',()=>{const eye=new PerspectiveCamera();eye.position.set(0,1.62,0);eye.updateMatrixWorld();const wall=new Mesh(new BoxGeometry(10,10,.5),new MeshBasicMaterial());wall.position.set(0,1.62,2);wall.updateMatrixWorld();const view=Object.assign(Object.create(PlayerPerspective.prototype),{camera:new PerspectiveCamera(),ray:new Raycaster(),mode:1}) as PlayerPerspective;view.view(eye,[wall],()=>true);assert.ok(view.distance<1.8);assert.equal(eye.position.z,0);view.mode=2;wall.position.z=-2;wall.updateMatrixWorld();view.view(eye,[wall],()=>true);assert.ok(view.distance<1.8);wall.geometry.dispose();wall.material.dispose();});
