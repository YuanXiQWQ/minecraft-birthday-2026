/** Export the bounded advancement profile from the locked official client without executing Minecraft. */
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readClient} from './vanilla/zip.ts';
import {iconParts,iconModel} from '../web/src/ui/icon-model.ts';
import {resolveTexture} from '../web/src/render/model-format.ts';

/** Repository destination and the seven reachable nodes plus the required husbandry ancestor. */
const root = resolve(import.meta.dirname, '../..'), target = resolve(root, 'resources/minecraft/26.3'),
    ids = ['story/root','story/mine_stone','story/upgrade_tools','story/smelt_iron','story/obtain_armor','story/iron_tools','husbandry/root','husbandry/plant_seed'],
    client = process.argv[process.argv.indexOf('--client') + 1], zip = readClient(client), entries: object[] = [], assetInputs:Record<string,string>={};
/** Hash exact original bytes. @param {Buffer} body Input bytes. @return {string} SHA-256. */
function hash(body: Buffer): string {return createHash('sha256').update(body).digest('hex');}
/** Write a UTF-8 JSON artifact. @param {string} path Absolute destination. @param {unknown} value JSON value. */
function json(path: string, value: unknown): void {mkdirSync(dirname(path), {recursive:true});writeFileSync(path, JSON.stringify(value,null,2)+'\n');}
/** Other profiles own shared resources; this profile records every input but emits each runtime byte once. */
const known = new Set(readdirSync(target).filter(p=>p.endsWith('manifest.json')&&p!=='advancement-manifest.json').flatMap(p=>JSON.parse(readFileSync(resolve(target,p),'utf8')).entries.map((e:any)=>e.entry)));
/** Copy and describe a verified original entry. @param {string} entry Original ZIP path. */
function copy(entry: string): void {
    const body=zip.get(entry);if(!body)throw Error('missing-advancement-source:'+entry);
    assetInputs[entry]=hash(body);
    if(!known.has(entry)){mkdirSync(dirname(resolve(target,entry)),{recursive:true});writeFileSync(resolve(target,entry),body);entries.push({entry,size:body.length,sha256:hash(body)});}
}
/** Auditable raw definitions retain native criteria, requirements, parent and all display defaults. */
const definitions=Object.fromEntries(ids.map(id=>['minecraft:'+id,JSON.parse(zip.get('data/minecraft/advancement/'+id+'.json')!.toString())]));
for(const id of ids)copy('data/minecraft/advancement/'+id+'.json');
copy('data/minecraft/tags/item/stone_tool_materials.json');
for(const name of zip.keys())if(name.startsWith('assets/minecraft/textures/gui/advancements/')&&(name.includes('/backgrounds/stone.')||name.includes('/backgrounds/husbandry.')||name.endsWith('/window.png'))||name.startsWith('assets/minecraft/textures/gui/sprites/advancements/')&&(/(?:task_frame|box_|title_box|tab_above_(?:left|middle))/.test(name)))copy(name);
copy('assets/minecraft/textures/gui/sprites/toast/advancement.png');
/** Resolve UI-only grass icon dependencies without adding an obtainable item.
 * @param {string} id Native model ID.
 * @return {any} Original model document.
 */
function model(id:string):any {
    const path='assets/minecraft/models/'+id.split(':')[1]+'.json';copy(path);
    const value=JSON.parse(zip.get(path)!.toString());if(value.parent&&!value.parent.includes('builtin/'))model(value.parent.includes(':')?value.parent:'minecraft:'+value.parent);return value;
}
copy('assets/minecraft/items/grass_block.json');
const uiDefinitions={'minecraft:grass_block':JSON.parse(zip.get('assets/minecraft/items/grass_block.json')!.toString()).model};
for(const part of iconParts(uiDefinitions['minecraft:grass_block'],'10-21')) {
    const resolved=iconModel(part.model,model);
    for(const ref of Object.values(resolved.textures??{}) as string[]){const path='assets/minecraft/textures/'+resolveTexture(ref,resolved.textures).split(':')[1]+'.png';copy(path);if(zip.has(path+'.mcmeta'))copy(path+'.mcmeta');}
    if(part.tints?.length)copy('assets/minecraft/textures/colormap/grass.png');
}
json(resolve(root,'app/web/src/data/advancements.json'),{definitions,tags:{'minecraft:stone_tool_materials':JSON.parse(zip.get('data/minecraft/tags/item/stone_tool_materials.json')!.toString()).values}});
/** Official UI labels are extracted for English fallback and the project's existing item translation language. */
const localeKeys=['gui.advancements','advancements.empty','advancements.sad_label','advancements.toast.task','key.advancements',...Object.values(definitions).flatMap((d:any)=>[d.display.title.translate,d.display.description.translate])];
localeKeys.push('gui.done');
for(const language of ['en_us','zh_cn']) {
    const path='assets/minecraft/lang/'+language+'.json', bytes=zip.get(path)??readFileSync(resolve(target,path));
    if(language==='zh_cn'&&createHash('sha1').update(bytes).digest('hex')!==JSON.parse(readFileSync(resolve(target,'interaction-manifest.json'),'utf8')).language.sha1)throw Error('language-integrity');
    const languageDoc=JSON.parse(bytes.toString());
    json(resolve(root,'app/web/src/i18n/advancements.'+language+'.json'),Object.fromEntries(localeKeys.map(k=>{if(typeof languageDoc[k]!=='string')throw Error('missing-language:'+k);return[k,languageDoc[k]];})));
}
/** Read-only bytecode locations permit reproducing conclusions without shipping complete decompiler output. */
const classes=['server.level.ServerPlayer','server.level.ServerPlayer$2','world.inventory.InventoryMenu','world.inventory.AbstractContainerMenu','world.item.ItemStack','advancements.triggers.InventoryChangeTrigger$TriggerInstance','advancements.AdvancementProgress','advancements.AdvancementRequirements','server.PlayerAdvancements','server.advancements.AdvancementVisibilityEvaluator','client.multiplayer.ClientAdvancements','client.gui.screens.advancements.AdvancementsScreen','client.gui.screens.advancements.AdvancementWidget','client.gui.screens.advancements.AdvancementTab','client.gui.components.toasts.AdvancementToast','client.gui.components.toasts.ToastManager$ToastInstance','client.Options'];
const evidence=classes.map(name=>{
    const full='net.minecraft.'+name,entry=full.replaceAll('.','/')+'.class',body=zip.get(entry)!;
    const dump=execFileSync('javap',['-classpath',client,'-c','-p','-constants',full],{encoding:'utf8',maxBuffer:8000000});
    const locations=dump.split('\n').flatMap((line,i)=>/ (?:public|private|protected) .*\(/.test(line)?[{line:i+1,method:line.trim()}]:[]);
    writeFileSync(resolve(process.env.TEMP!,'adv-'+name.split('.').at(-1)+'.txt'),dump);
    return{entry,size:body.length,sha256:hash(body),locations};
});
const inputs=[...ids.map(id=>'data/minecraft/advancement/'+id+'.json'),'data/minecraft/tags/item/stone_tool_materials.json','assets/minecraft/lang/en_us.json','assets/minecraft/lang/zh_cn.json'].map(entry=>{const bytes=zip.get(entry)??readFileSync(resolve(target,entry));return{entry,size:bytes.length,sha256:hash(bytes),source:entry.endsWith('zh_cn.json')?'Official asset index 34; interaction-manifest language SHA-1':'official client.jar'};});
json(resolve(target,'advancement-manifest.json'),{version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',source:'Official Java 26.3 client.jar; bounded native advancements',inputs:assetInputs,uiDefinitions,entries});
json(resolve(root,'docs/p9/advancements/native-evidence.json'),{version:'26.3',clientSha1:'e877b6a07acd633fb3bb475002175cec036e7b87',url:'https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar',method:'Read-only javap -c -p -constants; line numbers refer to reproducible javap output, not Java source',inputs,classes:evidence,exporterSha256:hash(readFileSync(import.meta.filename)),derived:['app/web/src/data/advancements.json','app/web/src/i18n/advancements.en_us.json','app/web/src/i18n/advancements.zh_cn.json'].map(entry=>({entry,sha256:hash(readFileSync(resolve(root,entry)))}))});
console.log('Exported eight native nodes and '+entries.length+' unique resources.');
