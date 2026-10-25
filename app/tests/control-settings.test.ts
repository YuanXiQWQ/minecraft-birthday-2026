/** Native control preferences exercise actual save transactions and physical input semantics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {controlSettings,patchControls,boundKey,validControls,ActionKeys,ControlScroll,lookSensitivity} from '../web/src/domain/control-settings.ts';
import {SaveSession} from '../web/src/persistence/session.ts';
import {decode,token} from '../web/src/persistence/codec.ts';
import {PlayerMotion,type Bounds} from '../web/src/domain/player-motion.ts';
import {SceneView} from '../web/src/render/scene.ts';
import {Look} from '../web/src/render/look.ts';
import type {Rules} from '../web/src/rules/types.ts';
import {keyLabel} from '../web/src/ui/control-settings.ts';

test('native printable key names never expose browser physical-code prefixes',()=>{
    for(const locale of ['en','zh-CN']){
        for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')assert.equal(keyLabel('Key'+letter,locale),letter);
        for(const digit of '0123456789')assert.equal(keyLabel('Digit'+digit,locale),digit);
        assert.equal(keyLabel('F5',locale),'F5');assert.equal(keyLabel('Slash',locale),'/');
    }
    assert.equal(keyLabel('ShiftLeft','zh-CN'),'左Shift');assert.equal(keyLabel('Mouse0','zh-CN'),'左键');
});

test('locked native defaults, explicit unbinding and invalid preferences',()=>{
    const c=controlSettings();assert.equal(c.sprintWindow,7);assert.equal(c.sensitivity,.5);assert.equal(c.mouseWheelSensitivity,1);assert.equal(c.autoJump,false);assert.equal(c.allowCursorChanges,true);assert.ok(validControls(c));
    const next=patchControls(c,{bindings:{forward:'ArrowUp',sprint:'KeyR',jump:''}});assert.equal(boundKey(next,'forward'),'ArrowUp');assert.equal(boundKey(next,'jump'),'');assert.equal(boundKey(next,'back'),'KeyS');
    for(const patch of [{sprintWindow:11},{sprintWindow:.5},{sensitivity:NaN},{mouseWheelSensitivity:0},{bindings:{forward:'Escape'}},{bindings:{unknown:'KeyW'}},{autoJump:'yes'}])assert.throws(()=>patchControls(c,patch as never));
    assert.ok(Math.abs(lookSensitivity(.5)-Math.PI/1200)<1e-8);
});

test('physical toggles ignore repeat and release; conflicts match every action; cancellation clears ownership',()=>{
    const c=patchControls(undefined,{toggleCrouch:true,toggleAttack:true,bindings:{sneak:'Mouse3',attack:'KeyZ',forward:'KeyZ'}}),keys=new ActionKeys();
    keys.edge('Mouse3',true,c);keys.edge('Mouse3',true,c);keys.edge('Mouse3',false,c);assert.ok(keys.active.has('sneak'));
    keys.edge('Mouse3',true,c);assert.equal(keys.active.has('sneak'),false);
    keys.edge('KeyZ',true,c);assert.ok(keys.active.has('attack')&&keys.active.has('forward'));keys.edge('KeyZ',false,c);assert.ok(keys.active.has('attack'));assert.equal(keys.active.has('forward'),false);
    keys.clear();assert.equal(keys.active.size,0);assert.equal(keys.physical.size,0);
});

test('scroll retains fractional steps, changes direction immediately and honors discrete mode',()=>{
    const scroll=new ControlScroll(),c=patchControls(undefined,{mouseWheelSensitivity:.5});
    assert.equal(scroll.steps(100,0,c),0);assert.equal(scroll.steps(100,0,c),1);assert.equal(scroll.steps(100,0,c),0);assert.equal(scroll.steps(-200,0,c),-1);
    assert.equal(scroll.steps(1,0,patchControls(c,{discreteMouseScroll:true,mouseWheelSensitivity:2})),2);
});

test('real shared save merges independent bindings, preserves progress and rolls failed writes back',async()=>{
    let raw:string|null=null,deny=false,tail=Promise.resolve();const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(deny)throw Error('quota');raw=v;}},locks={
        /** Serialize real session edits. @param {Function} work Transaction. @return {Promise<T>} Result. */
        exclusive<T>(work:()=>Promise<T>):Promise<T>{const result=tail.then(work);tail=result.then(()=>{},()=>{});return result;}
    },rules=JSON.parse(readFileSync(new URL('../../data/minecraft/26.3/rules.json',import.meta.url),'utf8')) as Rules;
    const a=new SaveSession(storage,locks,{allows:()=>true}),b=new SaveSession(storage,locks,{allows:()=>true});a.rules=b.rules=rules;await a.refresh();await b.refresh();const progress=structuredClone(a.view.envelope!.state.progress);
    await Promise.all([a.dispatch({type:'control-settings',patch:{bindings:{forward:'KeyI'}}}),b.dispatch({type:'control-settings',patch:{invertMouseY:true,bindings:{jump:'Mouse3'}}})]);
    await a.refresh();const c=a.view.envelope!.state.settings.controls!;assert.equal(boundKey(c,'forward'),'KeyI');assert.equal(boundKey(c,'jump'),'Mouse3');assert.equal(c.invertMouseY,true);assert.deepEqual(a.view.envelope!.state.progress,progress);
    const before=raw;deny=true;await assert.rejects(a.dispatch({type:'control-settings',patch:{sensitivity:.1}}));assert.equal(raw,before);deny=false;await a.refresh();assert.equal(a.view.envelope!.state.settings.controls!.sensitivity,.5);
    await a.reset(token(a.view.envelope!));assert.deepEqual(a.view.envelope!.state.settings.controls,c);assert.deepEqual((await decode(raw!)).envelope.state.settings.controls,c);a.dispose();b.dispose();
});

test('sprint interval zero disables double tapping without disabling the sprint binding',()=>{
    const p=new PlayerMotion(),floor:Bounds=[-20,-1,-20,20,0,20];p.feet=[0,0,0];p.grounded=true;
    p.tick(new Set(['KeyW']),0,[floor],{sprintWindow:0});p.tick(new Set(),0,[floor],{sprintWindow:0});p.tick(new Set(['KeyW']),0,[floor],{sprintWindow:0});assert.equal(p.sprinting,false);
    p.tick(new Set(['KeyW','ControlLeft']),0,[floor],{sprintWindow:0});assert.equal(p.sprinting,true);
});

test('automatic jump climbs a one-block obstacle but refuses a low ceiling and backward travel',()=>{
    const floor:Bounds=[-20,-1,-20,20,0,20],step:Bounds=[-1,0,-2,1,1,-1];
    for(const [ceiling,backward] of [[false,false],[true,false],[false,true]]){const p=new PlayerMotion();p.feet=[0,0,0];p.grounded=true;const solids=[floor,step,...(ceiling?[[-1,2,-3,1,3,1] as Bounds]:[])];let peak=0;
        for(let i=0;i<30;i++){p.tick(new Set([backward?'KeyS':'KeyW']),0,solids,{autoJump:true});peak=Math.max(peak,p.feet[1]);}
        assert.equal(peak>1, !ceiling&&!backward);
    }
});

test('real scene route retains short remapped jumps, mouse movement bindings and toggle attack lifetimes',()=>{
    let starts=0,stops=0;const view=Object.assign(Object.create(SceneView.prototype),{input:true,lost:false,disposed:false,controls:patchControls(undefined,{bindings:{jump:'KeyJ',forward:'Mouse3',attack:'KeyZ'},toggleAttack:true}),actionKeys:new ActionKeys(),keys:new Set(),jumpQueued:false,motion:new PlayerMotion(),look:new Look(),requestRender(){},refreshHover(){return null;},onMineStart(){starts++;},onMineCancel(){stops++;}}) as SceneView;
    view.controlEdge('KeyJ',true);view.controlEdge('KeyJ',false);assert.ok(view.movementKeys().has('Space'));assert.equal(view.movementKeys().has('Space'),false);
    view.controlEdge('Mouse3',true);assert.ok(view.keys.has('KeyW'));view.controlEdge('Mouse3',false);assert.equal(view.keys.has('KeyW'),false);
    view.controlEdge('KeyZ',true);view.controlEdge('KeyZ',false);assert.equal(starts,1);assert.equal(stops,0);view.controlEdge('KeyZ',true);assert.equal(stops,1);
});

test('keyboard sneak and sprint toggles restore across GUI only; mouse toggles and blur never restore',()=>{
    const view=Object.assign(Object.create(SceneView.prototype),{input:true,lost:false,disposed:false,controls:patchControls(undefined,{toggleCrouch:true,toggleSprint:true,toggleAttack:true}),actionKeys:new ActionKeys(),screenToggles:new Set<string>(),keys:new Set<string>(),motion:new PlayerMotion(),look:new Look(),movementEpoch:0,pointer:null,renderer:{domElement:{dataset:{},hasPointerCapture:()=>false}},requestRender(){},showPreview(){},refreshHover(){return null;}}) as SceneView;
    view.cancel=()=>view.cancelInput();view.controlEdge('ShiftLeft',true);view.controlEdge('ControlLeft',true);view.controlEdge('Mouse0',true);view.setInputEnabled(false);assert.equal(view.actionKeys.active.size,0);
    view.cancelInput(true);view.setInputEnabled(true);assert.ok(view.actionKeys.active.has('sneak')&&view.actionKeys.active.has('sprint'));assert.equal(view.actionKeys.active.has('attack'),false);
    view.setInputEnabled(false);view.cancelInput();view.setInputEnabled(true);assert.equal(view.actionKeys.active.size,0);
    view.controls=patchControls(view.controls,{bindings:{sneak:'Mouse3'}});view.controlEdge('Mouse3',true);view.setInputEnabled(false);view.setInputEnabled(true);assert.equal(view.actionKeys.active.size,0);
});
