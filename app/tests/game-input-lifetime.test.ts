/** Input ownership and framebuffer updates remain independent of durable save publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameKeyboard} from '../web/src/ui/game-keyboard.ts';
import {SceneView} from '../web/src/render/scene.ts';

/** Own explicit browser API substitutes around the actual keyboard controller.
 * @return {object} Events, world gate and keyboard capture counters.
 */
function keyboard() {
    const originals = new Map(['document','window','navigator','Element'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    class Editable {closest() {return true;}}
    const doc = Object.assign(new EventTarget(), {hidden:false,fullscreenElement:null as unknown,hasFocus:()=>true});
    const win = new EventTarget(), calls: string[][] = [];
    let enabled=true,unlocks=0;
    Object.defineProperties(globalThis, {
        document:{configurable:true,value:doc}, window:{configurable:true,value:win}, Element:{configurable:true,value:Editable},
        navigator:{configurable:true,value:{keyboard:{lock:async(keys:string[])=>{calls.push(keys);},unlock:()=>{unlocks++;}}}}
    });
    const controller = new GameKeyboard(()=>enabled);
    return {doc,win,calls,controller,Editable,unlocks:()=>unlocks,enable:(value:boolean)=>{enabled=value;},close(){controller.dispose();for(const [key,value] of originals)if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}};
}

test('game cancels delivered Ctrl + W without cancelling editing or UI shortcuts', () => {
    const f=keyboard();try {
        const event=()=>Object.assign(new Event('keydown',{cancelable:true}),{code:'KeyW',ctrlKey:true});
        const playing=event();f.win.dispatchEvent(playing);assert.equal(playing.defaultPrevented,true);
        f.enable(false);const ui=event();f.win.dispatchEvent(ui);assert.equal(ui.defaultPrevented,false);
        f.enable(true);const editor=event();Object.defineProperty(editor,'target',{value:new f.Editable()});f.win.dispatchEvent(editor);assert.equal(editor.defaultPrevented,false);
    }finally{f.close();}
});

test('unchanged autosave gates preserve gestures, mouse ownership and render state', () => {
    const view=Object.assign(Object.create(SceneView.prototype),{input:true,mode:{pause:()=>assert.fail('changed lock')},cancel:()=>assert.fail('cancelled input'),requestRender:()=>assert.fail('restarted render')}) as SceneView;
    for(let i=0;i<40;i++)view.setInputEnabled(true);
});

test('unchanged viewport notifications do not clear the framebuffer; real resize is consumed by the render frame', () => {
    const calls:string[]=[],canvas={width:1280,height:800};
    const view=Object.assign(Object.create(SceneView.prototype),{viewport:{width:1280,height:800,ratio:1},renderer:{domElement:canvas,getPixelRatio:()=>1,setSize:()=>calls.push('size')},camera:{updateProjectionMatrix:()=>calls.push('projection')},refreshHover:()=>calls.push('hover')}) as SceneView;
    view.resizeViewport();assert.deepEqual(calls,[]);assert.equal(view.viewport,null);
    view.viewport={width:1000,height:700,ratio:1};assert.deepEqual(calls,[]);
    view.resizeViewport();assert.deepEqual(calls,['size','projection','hover']);
    assert.equal(view.camera.aspect,1000/700);
});
