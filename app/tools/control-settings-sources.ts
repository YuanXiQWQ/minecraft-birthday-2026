/** Export bounded native control translations and reproducible class identities from the locked client. */
import {readClient} from './vanilla/zip.ts';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
/** Repository paths and hash-verified original archive. */
const root=resolve(import.meta.dirname,'../..'),zip=readClient(process.argv[2]);
/** SHA256 identity of original bytes. @param {Uint8Array} bytes Source bytes. @return {string} Hex digest. */
function hash(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
/** Write a deterministic JSON document. @param {string} path Repository-relative destination. @param {unknown} value JSON value. */
function json(path:string,value:unknown):void{writeFileSync(resolve(root,path),JSON.stringify(value,null,2)+'\n');}
/** Original language resource identities included in the provenance manifest. */
const inputs=[];
for(const locale of ['en_us','zh_cn']){
    const entry='assets/minecraft/lang/'+locale+'.json',bytes=zip.get(entry)??readFileSync(resolve(root,'resources/minecraft/26.3',entry)),source=JSON.parse(bytes.toString());
    const result=Object.fromEntries(Object.entries(source).filter(([key])=>/^(key\.|key\.categories\.|key\.category\.|controls\.|options\.(mouse|sensitivity|discrete|invert|allowCursor|autoJump|sprintWindow|on$|off$|key\.|generic_value|percent_value)|gui\.(done|yes|no))/.test(key)));
    json('app/web/src/i18n/controls.'+locale+'.json',result);inputs.push({entry,size:bytes.length,sha256:hash(bytes)});
}
/** Native implementations inspected for menu geometry and input behavior. */
const classes=['net/minecraft/client/gui/screens/options/controls/ControlsScreen','net/minecraft/client/gui/screens/options/MouseSettingsScreen','net/minecraft/client/gui/screens/options/controls/KeyBindsScreen','net/minecraft/client/gui/screens/options/controls/KeyBindsList','net/minecraft/client/gui/screens/options/controls/KeyBindsList$KeyEntry','net/minecraft/client/gui/screens/options/controls/KeyBindsList$CategoryEntry','net/minecraft/client/Options','net/minecraft/client/OptionInstance$IntRangeBase','net/minecraft/client/ScrollWheelHandler','net/minecraft/client/KeyMapping','net/minecraft/client/KeyMapping$Category','net/minecraft/client/ToggleKeyMapping','net/minecraft/client/MouseHandler','net/minecraft/client/player/LocalPlayer','net/minecraft/client/gui/components/OptionsList','net/minecraft/client/gui/components/AbstractSelectionList','net/minecraft/client/gui/layouts/HeaderAndFooterLayout','net/minecraft/client/gui/layouts/AbstractLayout$AbstractChildWrapper'];
classes.push('com/mojang/blaze3d/platform/InputConstants$Type','com/mojang/blaze3d/font/GlyphInfo','net/minecraft/client/gui/components/AbstractScrollArea','net/minecraft/client/gui/components/AbstractSelectionList$Entry','net/minecraft/client/gui/components/FocusableTextWidget','net/minecraft/client/gui/components/FocusableTextWidget$Builder');
json('data/minecraft/26.3/control-settings-sources.json',{version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',url:'https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar',method:'Read-only javap -c -p -constants; no client execution',inputs,classes:classes.map(name=>{const bytes=zip.get(name+'.class')!;return{entry:name+'.class',size:bytes.length,sha256:hash(bytes)};}),exporterSha256:hash(Buffer.from(readFileSync(import.meta.filename,'utf8').replaceAll('\r\n','\n')))});
