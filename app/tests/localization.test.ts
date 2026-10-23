/** Simplified Chinese copy, native substitutions, item search and audited glyph coverage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ENGLISH, LANGUAGES, displayLocale, loadLocale, localeDictionary, translate} from '../web/src/i18n/index.ts';
import {itemName, matchesItem} from '../web/src/i18n/items.ts';
import {advancementText} from '../web/src/i18n/advancements.ts';
import {harvestFeedback} from '../web/src/ui/harvest-feedback.ts';
import {BitmapFont} from '../web/src/ui/vanilla.ts';
import chineseItems from '../web/src/i18n/items.zh_cn.json' with {type:'json'};
import chineseAdvancements from '../web/src/i18n/advancements.zh_cn.json' with {type:'json'};

test('every English key has Chinese copy with exactly the same named arguments', async () => {
    const dictionary = await loadLocale('zh-CN');
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(ENGLISH).sort());
    for (const [key, value] of Object.entries(ENGLISH)) {
        const fields = [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(v => v[1]).sort();
        assert.deepEqual([...dictionary[key as keyof typeof ENGLISH]!.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(v => v[1]).sort(), fields, key);
        assert.equal(translate(key, Object.fromEntries(fields.map(name => [name, name])), dictionary).includes('{'), false, key);
    }
    assert.equal(translate('home.title', {recipient:'Vincent'}, dictionary), '生日快乐，Vincent！');
    assert.equal(translate('menu.title', {}, dictionary), '游戏菜单');
    assert.deepEqual(await loadLocale('fr'), {});
    assert.equal(displayLocale('zh_cn'), 'zh-CN');
    assert.deepEqual(localeDictionary('zh_cn'), dictionary);
    assert.deepEqual(LANGUAGES.map(v => v.id), ['en', 'zh-CN']);
});

test('native command templates preserve reordered arguments and literal percent signs', () => {
    const zh = localeDictionary('zh-CN');
    assert.equal(translate('commands.time.no_time_marker_found', {v0:'noon',v1:'minecraft:overworld'}, zh), '时钟minecraft:overworld不存在时间标记noon');
    assert.equal(translate('commands.tick.query.percentiles', {v0:1,v1:2,v2:3,v3:4}, zh), '百分位数：50%：1毫秒 95%：2毫秒 99%：3毫秒。共采样：4');
    execFileSync(process.execPath, ['tools/localization-assets.ts', '--check']);
});

test('all reachable item names use the selected language and remain searchable in both languages', () => {
    for (const [id, name] of Object.entries(chineseItems)) {
        assert.equal(itemName(id, 'zh-CN'), name);
        assert.equal(matchesItem(id, name), true);
        assert.equal(matchesItem(id, itemName(id, 'en')), true);
    }
    assert.equal(itemName('minecraft:cobblestone', 'zh-CN'), '圆石');
    assert.equal(itemName('minecraft:cake', 'en'), 'Cake');
    assert.equal(itemName('minecraft:cake', 'fr'), 'Cake');
    assert.equal(advancementText('gui.advancements', 'zh-CN'), '进度');
    const lines = harvestFeedback({type:'items-acquired',overflow:[{id:'minecraft:cobblestone',count:2}]}, (key, values) => translate(key, values, localeDictionary('zh-CN')), 'zh-CN');
    assert.match(lines[0][0].text, /2 个圆石/);
});

test('every Chinese UI, item, advancement and language-name glyph exists in the native font', () => {
    const root = new URL('../../resources/minecraft/26.3/', import.meta.url),
        font = JSON.parse(readFileSync(new URL('assets/minecraft/font/project_unifont.json', root), 'utf8')),
        values = [...Object.values(localeDictionary('zh-CN')), ...Object.values(chineseItems), ...Object.values(chineseAdvancements), ...LANGUAGES.map(v => v.name)];
    for (const char of new Set(values.join(''))) {
        if (char.charCodeAt(0) < 127) continue;
        assert.ok(font[char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')], char);
    }
    const startup = JSON.parse(readFileSync(new URL('startup-manifest.json', root), 'utf8')),
        bytes = readFileSync(new URL('assets/minecraft/font/project_unifont.json', root)),
        entry = startup.inputs['assets/minecraft/font/project_unifont.json'];
    assert.equal(entry.size, bytes.length);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
});

test('Unihex uses native nearest sampling, cropped source bounds and baseline zero', () => {
    const font = Object.assign(Object.create(BitmapFont.prototype), {unicode:{'4E2D':'F'.repeat(64)},unicodeTiles:new Map([['中#FFF', {}]])}) as BitmapFont;
    const draws: {smooth:boolean;args:unknown[]}[] = [];
    const context = {imageSmoothingEnabled:true,drawImage(...args:unknown[]) {draws.push({smooth:this.imageSmoothingEnabled,args});}};
    font.drawUnicode(context as unknown as CanvasRenderingContext2D, '中', 0, 0, '#FFF');
    assert.equal(context.imageSmoothingEnabled, true);
    assert.equal(draws[0].smooth, false);
    assert.deepEqual(draws[0].args.slice(1), [0,0,16,16,0,0,8,8]);
});

test('official CJK ranges retain full width while Unihex shadows use half a logical pixel', () => {
    const definition=JSON.parse(readFileSync(new URL('../../resources/minecraft/26.3/assets/minecraft/font/include/unifont.json',import.meta.url),'utf8')),
        overrides=definition.providers.find((p:{hex_file:string})=>p.hex_file==='minecraft:font/unifont.zip').size_overrides,
        font=Object.assign(Object.create(BitmapFont.prototype),{unicode:{'4E2D':'0001'.repeat(16)},unicodeOverrides:overrides,glyphs:new Map(),tints:new Map([['#FFF',{}],['#3f3f3f',{}]])}) as BitmapFont,
        draws:{x:number;y:number;color:string}[]=[];
    font.drawUnicode=(_context,_char,x,y,color)=>{draws.push({x,y,color});};
    assert.deepEqual(font.unicodeGlyph('中'),{bitmap:'0001'.repeat(16),left:0,right:15,advance:9});
    font.draw({} as CanvasRenderingContext2D,'中',10,20,'#FFF',true);
    assert.deepEqual(draws,[{x:10.5,y:20.5,color:'#3f3f3f'},{x:10,y:20,color:'#FFF'}]);
});

test('default bitmap providers keep original priority before the Unihex fallback',()=>{
    const image=(width:number)=>({width,height:8,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(width*8*4).fill(255)})})}) as unknown as HTMLCanvasElement,
        definitions=new Map<string,unknown>([['assets/minecraft/font/include/default.json',{providers:[{type:'bitmap',file:'minecraft:font/nonlatin_european.png',ascent:7,chars:['…']},{type:'bitmap',file:'minecraft:font/ascii.png',ascent:7,chars:['a…']}]}],['assets/minecraft/font/include/space.json',{providers:[{advances:{' ':4}}]}]]),
        images=new Map([['assets/minecraft/textures/font/nonlatin_european.png',image(8)],['assets/minecraft/textures/font/ascii.png',image(16)]]),
        font=new BitmapFont(definitions,images);
    assert.equal(font.glyphs.get('…')?.provider,'minecraft:font/nonlatin_european.png');
    assert.equal(font.glyphs.get('a')?.provider,'minecraft:font/ascii.png');
    images.delete('assets/minecraft/textures/font/nonlatin_european.png');
    assert.throws(()=>new BitmapFont(definitions,images),/missing-native-font/);
});
