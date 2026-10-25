/** Native advancement geometry, text wrapping and dismissal behavior without browser input claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {advancementPositions,advancementTooltipLayout} from '../web/src/ui/advancement-layout.ts';
import {AdvancementView} from '../web/src/ui/advancements.ts';
import {ADVANCEMENTS} from '../web/src/domain/advancements.ts';

test('native tree walk apportions an uneven branch instead of allocating every leaf a separate global row',()=>{
    const base=ADVANCEMENTS['minecraft:story/root'],tree=Object.fromEntries([['root',undefined],['a','root'],['a1','a'],['a2','a'],['b','root']].map(([id,parent])=>[id!,{...base,parent}]));
    assert.deepEqual([...advancementPositions('root',tree)],[['root',{x:0,y:27}],['a',{x:28,y:13}],['a1',{x:56,y:0}],['a2',{x:56,y:27}],['b',{x:28,y:40}]]);
});

test('native tooltip reserves minimum title width and wraps long titles before calculating bar height',()=>{
    const short=advancementTooltipLayout('Title','Description',s=>s.length*6);
    assert.equal(short.width,117);assert.equal(short.titleHeight,26);assert.equal(short.descriptionHeight,15);
    const long=advancementTooltipLayout('A very long advancement title that needs another line','Description',s=>s.length*6,26);
    assert.ok(long.titles.length>1);assert.ok(long.titles.every(line=>line.length*6<=163));assert.equal(long.titleHeight,long.titles.length*9+17);assert.ok(long.width>=143);
});

test('explicit advancement dismissal restores its parent before reopening the world input gate',()=>{
    const original=globalThis.cancelAnimationFrame,calls:string[]=[];globalThis.cancelAnimationFrame=()=>{};
    try{const view=Object.assign(Object.create(AdvancementView.prototype),{modal:{open:true,close(){calls.push('close');this.open=false;}},returnTo:()=>calls.push('parent'),gate:()=>calls.push('gate')});view.close();assert.deepEqual(calls,['parent','close','gate']);view.close();assert.deepEqual(calls,['parent','close','gate']);
        calls.length=0;view.modal.open=true;view.returnTo=()=>calls.push('parent');view.close(false);assert.deepEqual(calls,['close','gate']);assert.equal(view.returnTo,undefined);
    }finally{globalThis.cancelAnimationFrame=original;}
});
