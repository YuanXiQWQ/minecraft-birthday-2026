/** Native Java 26.3 language row and footer dimensions are independent of viewport screenshots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {languageLayout} from '../web/src/ui/native-screens.ts';

test('native language rows are 270 by 18 and begin two pixels into the list',()=>{
    const l=languageLayout(640,400);
    assert.equal(l.rowWidth,270);assert.equal(l.rowHeight,18);assert.equal(l.rowLeft,185);
    assert.equal(l.listTop,36);assert.equal(l.firstRow,2);assert.equal(l.textTop,5);
    assert.equal(languageLayout(240,400).rowWidth,224);
});

test('53-pixel footer centers nine-pixel warning, eight-pixel gap and twenty-pixel Done button',()=>{
    for(const height of [240,329,400,540]){
        const l=languageLayout(640,height);
        assert.equal(l.warningY,height-45);assert.equal(l.doneY,height-28);
        assert.equal(l.doneY-(l.warningY+9),8);
        assert.equal(l.warningY-(height-53),8);assert.equal(height-(l.doneY+20),8);
    }
});
