/** Reciprocal animal pushes preserve block collision and persistent return to the authored home disc. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmAnimal,pushAnimals} from '../web/src/domain/farm-life.ts';
import {PlayerMotion,overlaps,type Bounds} from '../web/src/domain/player-motion.ts';

/** Supported open terrain for navigation and external displacement. */
const ground:Bounds=[-20,-1,-20,20,0,20];

test('player and cow receive equal opposite native horizontal impulses, with no vertical push',()=>{
    const cow=new FarmAnimal('cow',[0,0,0],3),player=new PlayerMotion();player.feet=[.6,0,0];
    pushAnimals([cow],player);
    assert.ok(Math.abs(cow.velocity[0]+Math.sqrt(.6)*Math.fround(.05))<1e-12);
    assert.equal(cow.velocity[0],-player.velocity[0]);assert.equal(cow.velocity[1],0);assert.equal(player.velocity[1],0);
    cow.tick([ground],[]);assert.ok(cow.feet[0]<0);assert.ok(cow.animation.speed>0);
    player.tick(new Set(),0,[ground]);assert.ok(player.feet[0]>.6);
});

test('cow and chicken push each other once; separated heights and distant animals do not',()=>{
    const cow=new FarmAnimal('cow',[0,0,0],3),chicken=new FarmAnimal('chicken',[.5,0,.1],4);
    pushAnimals([cow,chicken]);assert.ok(cow.velocity[0]<0);assert.equal(cow.velocity[0],-chicken.velocity[0]);assert.equal(cow.velocity[2],-chicken.velocity[2]);
    for(const feet of [[.5,2,0],[4,0,0]] as [number,number,number][]){chicken.feet=feet;cow.velocity=[0,0,0];chicken.velocity=[0,0,0];pushAnimals([cow,chicken]);assert.deepEqual(cow.velocity,[0,0,0]);assert.deepEqual(chicken.velocity,[0,0,0]);}
});

test('exactly coincident centers do not produce invalid native push vectors',()=>{
    const a=new FarmAnimal('cow',[0,0,0],1),b=new FarmAnimal('chicken',[0,0,0],2);pushAnimals([a,b]);assert.deepEqual(a.velocity,[0,0,0]);assert.deepEqual(b.velocity,[0,0,0]);
});

for(const kind of ['cow','chicken'] as const)test(kind+' returns from beyond its home disc without random wandering or teleporting',()=>{
    const a=new FarmAnimal(kind,[0,0,0],3);a.feet=[7,0,.13];a.path=[[8,0,.13]];
    let returned=false;
    for(let i=0;i<100;i++){
        const previous=[...a.feet];a.tick([ground],[]);
        assert.ok(Math.hypot(a.feet[0]-previous[0],a.feet[2]-previous[2])<=.251);
        if(Math.hypot(a.feet[0],a.feet[2])<=2){returned=true;break;}
        assert.equal(a.returning,true);
    }
    assert.equal(returned,true);
    for(let i=0;i<300;i++){a.tick([ground],[]);assert.ok(Math.hypot(a.feet[0],a.feet[2])<=2+1e-8);}
});

test('external displacement crosses the wander boundary and retains the original home center',()=>{
    const a=new FarmAnimal('cow',[0,0,0],3);a.feet=[1.99,0,0];a.velocity=[.4,0,0];a.tick([ground],[]);
    assert.ok(a.feet[0]>2);assert.equal(a.returning,true);assert.deepEqual(a.origin,[0,0,0]);
    for(let i=0;i<60;i++)a.tick([ground],[]);
    assert.ok(Math.hypot(a.feet[0],a.feet[2])<=2+1e-8);
});

test('return routes go around solid walls and never pass through them',()=>{
    const a=new FarmAnimal('cow',[0,0,0],3),wall:Bounds=[2,0,-1,2.5,2,1];a.feet=[4,0,0];let detoured=false;
    for(let i=0;i<180;i++){a.tick([ground,wall],[]);assert.equal(overlaps(a.bounds(),wall),false);detoured ||= Math.abs(a.feet[2])>=1.45;if(Math.hypot(a.feet[0],a.feet[2])<=2)break;}
    assert.ok(detoured);assert.ok(Math.hypot(a.feet[0],a.feet[2])<=2);
});

test('blocked animals keep return intent and retry after the route reopens',()=>{
    const a=new FarmAnimal('cow',[0,0,0],3);a.feet=[4,0,0];
    const cage:Bounds[]=[[3.4,0,-.6,3.5,2,.6],[4.5,0,-.6,4.6,2,.6],[3.4,0,-.6,4.6,2,-.5],[3.4,0,.5,4.6,2,.6]];
    for(let i=0;i<40;i++){a.tick([ground,...cage],[]);assert.equal(a.returning,true);assert.deepEqual(a.feet,[4,0,0]);}
    for(let i=0;i<60;i++)a.tick([ground],[]);
    assert.ok(Math.hypot(a.feet[0],a.feet[2])<=2+1e-8);
});

test('large pushes stop at thin walls and cannot cross unsupported edges or water',()=>{
    const a=new FarmAnimal('cow',[0,0,0],3),wall:Bounds=[.6,0,-2,.7,2,2];a.velocity=[2,0,0];a.previous=[...a.feet];a.travelPush([ground,wall],[]);
    assert.ok(a.feet[0]<=.15+1e-8);assert.equal(overlaps(a.bounds(),wall),false);
    const b=new FarmAnimal('chicken',[0,0,0],3);b.velocity=[2,0,0];b.travelPush([[-1,-1,-1,.5,0,1]],[]);assert.ok(b.feet[0]<=.5+1e-8);
    const c=new FarmAnimal('cow',[0,0,0],3);c.velocity=[2,0,0];c.travelPush([ground],[[1,0,0]]);assert.ok(c.feet[0]<=.55+1e-8);
});
