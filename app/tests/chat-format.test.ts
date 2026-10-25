/** Java 26.3 ChatComponent, ComponentRenderUtils and StringSplitter formatting regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameChat,wrapChat,normalizeChat} from '../web/src/ui/chat.ts';

test('outgoing player and command input uses native whitespace normalization and length limit',()=>{
    assert.equal(normalizeChat('  hello   world\t中文　消息  '),'hello world 中文 消息');
    assert.equal(normalizeChat(' /time   set   day '),'/time set day');
    assert.equal(normalizeChat('   '),'');
    assert.equal(normalizeChat('a'.repeat(300)).length,256);
});

test('native soft wraps indent once, explicit newlines reset indentation and offsets retain repeated spaces',()=>{
    assert.deepEqual(wrapChat('abc def\nghi',24,s=>s.length*6),[
        {text:'abc',start:0,indent:false},{text:'def',start:4,indent:true},{text:'ghi',start:8,indent:false}
    ]);
    assert.deepEqual(wrapChat('  a  b\n\n',100,s=>s.length*6),[
        {text:'  a  b',start:0,indent:false},{text:'',start:7,indent:false},{text:'',start:8,indent:false}
    ]);
    assert.deepEqual(wrapChat('中文😀中文',12,s=>[...s].length*6),[
        {text:'中文',start:0,indent:false},{text:'😀中',start:2,indent:true},{text:'文',start:5,indent:true}
    ]);
    assert.equal(wrapChat('longword',1,s=>s.length*6).map(row=>row.text).join(''),'longword');
});

test('native drawing distinguishes local player chat from system and scripted author messages',()=>{
    const originalDpr=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
    const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
    Object.defineProperty(globalThis,'devicePixelRatio',{value:1,configurable:true});
    const rectangles:any[]=[],glyphs:any[]=[];
    const context={fillStyle:'',globalAlpha:1,setTransform(){},clearRect(){},save(){},restore(){},drawImage(){},fillRect(...bounds:number[]){rectangles.push({color:this.fillStyle,bounds});}};
    Object.defineProperty(globalThis,'document',{value:{createElement:()=>({getContext:()=>context})},configurable:true});
    const chat=Object.assign(Object.create(GameChat.prototype),{
        paintFrame:0,viewport:{clientWidth:640,clientHeight:360},canvas:{width:640,height:360,style:{},getContext:()=>context},
        root:{style:{setProperty(){}},dataset:{}},input:{value:'',style:{}},pixels:{font:{width:(s:string)=>[...s].length*6,draw(_c:unknown,text:string,x:number,y:number,color:string){glyphs.push({text,x,y,color});}}},
        open:false,offset:0,wrapping:new WeakMap(),rowLayout:null,tagHover:null,
        messages:[
            {kind:'system',time:performance.now(),runs:[{text:'Ready'}]},
            {kind:'author',time:performance.now(),runs:[{text:'<YuanXiQWQ> Welcome'}]},
            {kind:'player',time:performance.now(),runs:[{text:'<Alice> '+'a'.repeat(60),color:'#FFFFFF'},{text:'红',color:'#FF5555'}]}
        ]
    }) as GameChat;
    try{
        chat.paint();
        assert.equal(rectangles.filter(r=>r.color==='#D0D0D0').length,2,'only system and scripted author messages have a source tag');
        assert.ok(rectangles.filter(r=>r.color==='#00000080').every(r=>r.bounds[0]===0&&r.bounds[2]===332),'native background includes both margins');
        assert.equal(glyphs[0]?.x,10,'soft continuation starts one space after x=4');
        assert.equal(glyphs.find(g=>g.text==='红')?.color,'#FF5555','source style survives continuation indentation');
        assert.equal(glyphs.find(g=>g.text==='<')?.x,4,'first line starts at x=4');
        const glyphCount=glyphs.length;chat.paint();assert.equal(glyphs.length,glyphCount,'unchanged history reuses rasterized glyphs');
    }finally{
        if(originalDpr)Object.defineProperty(globalThis,'devicePixelRatio',originalDpr);else delete (globalThis as any).devicePixelRatio;
        if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete (globalThis as any).document;
    }
});
