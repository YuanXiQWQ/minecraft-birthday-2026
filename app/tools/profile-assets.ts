/** Export the public default Java profile and immutable texture bytes with independently audited provenance. */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {readClient} from './vanilla/zip.ts';

/** Resource output and locked native implementation source. */
const root=resolve(import.meta.dirname,'../../resources/minecraft/26.3'),client=readClient(process.argv[process.argv.indexOf('--client')+1]);
/** Hash original bytes without text normalization. @param {Uint8Array} bytes Source bytes. @return {string} SHA-256. */
function hash(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
/** Read public JSON with bounded wait and explicit HTTP failure. @param {string} url Public URL. @return {Promise<any>} JSON response. */
async function json(url:string):Promise<any>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('profile-http:'+r.status);return r.json();}
const identity=await json('https://api.mojang.com/users/profiles/minecraft/sireoh');
const profile=await json('https://sessionserver.mojang.com/session/minecraft/profile/'+identity.id);
const texture=JSON.parse(Buffer.from(profile.properties.find((p:any)=>p.name==='textures').value,'base64').toString()).textures;
const entries=[];
for(const [kind,source] of Object.entries(texture) as [string,any][]){
    if(!['SKIN','CAPE'].includes(kind))continue;
    const url=source.url.replace('http:','https:');if(!/^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/.test(url))throw Error('texture-host');
    const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('texture-http:'+r.status);
    const bytes=new Uint8Array(await r.arrayBuffer()),entry='assets/jerrys_farm/textures/player/'+url.split('/').at(-1)+'.png';
    mkdirSync(dirname(resolve(root,entry)),{recursive:true});writeFileSync(resolve(root,entry),bytes);
    entries.push({kind,entry,source:url,size:bytes.length,sha256:hash(bytes)});
}
const classes=['net/minecraft/client/Camera','net/minecraft/client/CameraType','net/minecraft/client/model/player/PlayerModel','net/minecraft/client/model/player/PlayerCapeModel','net/minecraft/client/renderer/entity/layers/CapeLayer','net/minecraft/client/renderer/entity/player/AvatarRenderer'];
writeFileSync(resolve(root,'profile-manifest.json'),JSON.stringify({version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',source:'Public Mojang session profile; player textures are user content, not vanilla client assets',profile:{name:profile.name,id:profile.id,slim:texture.SKIN.metadata?.model==='slim'},properties:profile.properties,entries,classes:Object.fromEntries(classes.map(p=>[p+'.class',hash(client.get(p+'.class')!)])),exporterSha256:hash(Buffer.from(readFileSync(import.meta.filename,'utf8').replaceAll('\r\n','\n')))},null,2)+'\n');
console.log(JSON.stringify({name:profile.name,id:profile.id,slim:texture.SKIN.metadata?.model==='slim',textures:entries.length}));
