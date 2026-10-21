/** Independent numerical/clock/source evidence for the bounded celebration research model. */
import test from 'node:test';import assert from 'node:assert/strict';
import {FireworkSimulation,SHAPES,spriteFrame,visibleSpark,fireworkSound,starterLifetime}from'../web/src/firework-simulation.ts';
import type{Explosion,Shape}from'../web/src/firework-simulation.ts';
import{readVanillaResources}from'../tools/vanilla-resources.ts';
/** Build a repeatable rule fixture without importing production progress or any original asset bytes.
 * @param {Shape} shape Original explosion type.
 * @param {boolean} trail Trail toggle.
 * @param {boolean} twinkle Twinkle toggle.
 * @return {Explosion[]} Single zero-time diagnostic explosion.
 */
function plan(shape:Shape,trail=false,twinkle=false):Explosion[]{return[{shape,tick:0,position:[0,5,0],velocity:[.1,.2,-.1],colors:[0xff0000],fade:[0x0000ff],trail,twinkle}];}
for(const [index,shape]of SHAPES.entries())test(`F01 ${shape} original primary count and genuinely three-dimensional velocity`,()=>{
  const s=new FireworkSimulation(plan(shape),263);s.step();const particles=s.particles.filter(p=>!p.flash);assert.equal(particles.length,[98,386,121,265,70][index]);assert.ok(particles.every(p=>p.life>=48&&p.life<=59&&p.size>=.075&&p.size<.15));
  assert.ok(particles.some(p=>p.v[2]!==0));assert.ok(particles.some(p=>p.v[0]!==0));assert.equal(s.particles.filter(p=>p.flash).length,1);
});
test('F02 all shape and Trail/Twinkle combinations terminate with bounded children',()=>{
  for(const shape of SHAPES)for(const trail of [false,true])for(const twinkle of [false,true]){const s=new FireworkSimulation(plan(shape,trail,twinkle),263);for(let i=0;i<120;i++)s.step();assert.equal(s.done(),true);assert.equal(s.particles.length,0);assert.equal(s.children>0,trail);assert.ok(s.peak<20000);}
});
test('F03 same seed and elapsed time produce identical state across 30/60/144 Hz refresh sequences',()=>{
  const states=[30,60,144].map(hz=>{const s=new FireworkSimulation(plan('creeper',true,true),42);for(let i=0;i<=hz*2;i++)s.advance(i/hz);return s;});assert.deepEqual(states[0],states[1]);assert.deepEqual(states[0],states[2]);
});
test('F04 gravity precedes motion, drag follows it, color approaches fade after half life',()=>{
  const s=new FireworkSimulation(plan('burst'),4);s.step();const p=s.particles[0],old=[...p.p],velocity=[...p.v];s.step();assert.ok(Math.abs(p.p[1]-old[1]-(velocity[1]-.004))<1e-12);assert.ok(Math.abs(p.v[1]-(velocity[1]-.004)*.91)<1e-12);
  while(p.age<=Math.floor(p.life/2))s.step();assert.ok(p.color[0]<1&&p.color[2]>0);assert.ok(p.alpha<1);
});
test('F05 original reverse frame age formula, twinkle gate and trail birth age',()=>{
  assert.equal(spriteFrame(0,48),0);assert.equal(spriteFrame(47,48),6);assert.equal(spriteFrame(48,48),7);
  const s=new FireworkSimulation(plan('star',true,true),8);for(let i=0;i<15;i++)s.step();const child=s.particles.find(p=>p.child)!;assert.ok(child);assert.equal(child.trail,false);assert.equal(child.twinkle,true);assert.equal(child.fade,undefined);
  const p=s.particles.find(p=>!p.child&&!p.flash)!;p.life=48;p.age=16;assert.equal(visibleSpark(p),false);p.age=18;assert.equal(visibleSpark(p),true);
});
test('F06 near/far boundary, blast/twinkle pitch ranges and integer-tick sound delay',()=>{
  assert.equal(fireworkSound(false,false,15.999,0).event,'entity.firework_rocket.blast');assert.equal(fireworkSound(false,false,16,0).event,'entity.firework_rocket.blast_far');assert.equal(fireworkSound(true,false,16,0).event,'entity.firework_rocket.large_blast_far');assert.equal(fireworkSound(false,true,16,0).event,'entity.firework_rocket.twinkle_far');
  assert.equal(fireworkSound(false,false,10,0).delay,0);assert.equal(fireworkSound(false,false,16,0).delay,.4);assert.equal(fireworkSound(false,true,32,.5).pitch,.975);assert.equal(fireworkSound(false,false,32,0).volume,20);
});
test('F07 committed original particle/audio cohort has all required dependencies',()=>{
  const files=readVanillaResources(),m=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));assert.ok(m.celebration);
  assert.equal(m.celebration.entries.length,24);assert.equal(Object.keys(m.celebration.events).length,12);const frames=JSON.parse(new TextDecoder().decode(files.get('assets/minecraft/particles/firework.json'))).textures;assert.deepEqual(frames,Array.from({length:8},(_,i)=>`minecraft:spark_${7-i}`));
});

test('F08 Starter final tick includes the base lifetime before its fifteen extra twinkle ticks',()=>{
  assert.equal(starterLifetime(1,false),1);assert.equal(starterLifetime(1,true),16);
  assert.equal(starterLifetime(3,false),5);assert.equal(starterLifetime(3,true),20);
});
