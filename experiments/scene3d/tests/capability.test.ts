/** Capability failure contracts preserve explicit errors and safe cleanup without claiming unavailable hardware was tested. */
import test from 'node:test';import assert from 'node:assert/strict';
import {requireWebGL2} from '../web/src/scene-adapter.ts';
import {CelebrationAudio} from '../web/src/celebration-audio.ts';

test('C01 injected WebGL2 absence rejects real 3D initialization without a 2D fallback',()=>{
  assert.throws(()=>requireWebGL2({getContext:()=>null} as unknown as HTMLCanvasElement),/WebGL2 unavailable/);
});
test('C02 injected Web Audio absence has explicit capability state and safe cleanup',async()=>{
  const audio=new CelebrationAudio(()=>{throw new Error('injected unsupported AudioContext');});
  assert.equal(audio.state,'unavailable');assert.match(audio.unavailable!,/unsupported AudioContext/);assert.equal(await audio.enable(),false);
  assert.equal(audio.sources.size,0);assert.equal(audio.chains.size,0);assert.equal(audio.time,0);
  audio.gain(.5,true);audio.listener([0,0,0],[0,0,-1],[0,1,0]);await audio.pause();audio.cancel('test');audio.dispose();audio.dispose();assert.equal(audio.disposed,true);
});
