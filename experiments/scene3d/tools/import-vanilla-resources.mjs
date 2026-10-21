/** Import the verified, bounded Java 26.3 cohort into the reusable repository resource directory. */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
/** Explicit import input; ordinary development and builds never require this input directory. */
const input=resolve(process.argv[2]??'');
/** Versioned shared runtime resource directory, independent of the experiment web root. */
const output=resolve(import.meta.dirname,'../../../resources/minecraft/26.3');
/** Produce the integrity value stored in the runtime manifest.
 * @param {Uint8Array} bytes Exact file bytes.
 * @return {string} Lowercase SHA-256.
 */
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
if(!process.argv[2])throw new Error('Pass the verified extraction directory once for import');
/** Verified extraction inventory, retaining original source identities during import. */
const manifest=JSON.parse(readFileSync(join(input,'manifest.json'),'utf8').replace(/^\uFEFF/,''));
if(manifest.version!=='26.3'||manifest.clientSha1!=='e877b6a07acd633fb3bb475002175cec036e7b87'||manifest.entries.length!==95)throw new Error('Wrong or incomplete verified cohort');
for(const entry of manifest.entries){
  if(!/^assets\/minecraft\/[a-z0-9_/.\/-]+$/.test(entry.entry)||entry.entry.includes('..'))throw new Error('Invalid resource path');
  const bytes=readFileSync(join(input,entry.entry));if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Resource integrity mismatch: '+entry.entry);
  const target=join(output,entry.entry);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(input,entry.entry),target);
}
/** Original sound event document supplies the bounded runtime event subset. */
const soundPath='assets/minecraft/sounds.json',originalSounds=JSON.parse(readFileSync(join(input,soundPath),'utf8'));
/** Preserve each selected event definition and sample reference unchanged. */
const selected=Object.fromEntries(Object.keys(manifest.celebration.events).map(id=>[id,originalSounds[id]]));
/** Exact derived bytes have their own checksum, separate from the original document. */
const soundBytes=Buffer.from(JSON.stringify(selected,null,2)+'\n');writeFileSync(join(output,soundPath),soundBytes);
/** Record both original provenance and derived runtime integrity for the sound subset. */
const soundEntry=manifest.entries.find(e=>e.entry===soundPath);
soundEntry.sourceAssetSha1=soundEntry.assetSha1;delete soundEntry.assetSha1;
soundEntry.derived={operation:'Select the twelve implemented original sound events; definitions and Ogg samples unchanged',sourceSha256:soundEntry.sha256};
soundEntry.size=soundBytes.length;soundEntry.sha256=sha(soundBytes);
delete manifest.gui.rights;
manifest.celebration.usage='Default Java 26.3 runtime cohort; public-release rights review remains separate from development authorization';
manifest.provenance={clientSha1:manifest.clientSha1,assetIndexSha1:manifest.celebration.assetIndexSha1,scope:'Five block families, ASCII GUI subset, two item icons, firework particles and twelve sound events',source:'Official client resources and official asset-index objects; no client code or complete client included'};
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
process.stdout.write(JSON.stringify({directory:'resources/minecraft/26.3',entries:manifest.entries.length,bytes:manifest.entries.reduce((n,e)=>n+e.size,0)})+'\n');
