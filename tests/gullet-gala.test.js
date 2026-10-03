import test from 'node:test';
import assert from 'node:assert/strict';
import {GULLET_GAME,GULLET_ARENA,createGullet,stepGullet,drawGullet,getGulletResults} from '../src/gullet-gala.js';

const roster=Array.from({length:4},(_,slot)=>({id:`p${slot}`,name:`PAPER ${slot}`,character:slot}));
const copy=value=>JSON.parse(JSON.stringify(value));
function quiet(count=1){const g=createGullet(roster.slice(0,count),19);g.state.objects=[];g.state.spawnClock=999;return g;}
function anchor(p,x,y,angle=0){p.baseX=x;p.baseY=y;p.x=x;p.y=y;p.baseAngle=angle;p.angle=angle;p.aim=0;}
function pellet(g,{x=480,y=292,kind='crumb',value=1,vx=0,vy=0}={}){const o={id:++g.state.nextId,x,y,kind,value,vx,vy,r:kind==='pearl'?10:8,life:15,spin:0};g.state.objects.push(o);return o;}
function run(g,seconds,inputs={}){for(let n=0;n<Math.ceil(seconds*60);n++)stepGullet(g,inputs,1/60);return g;}
function tap(g,ids=['p0']){const held=Object.fromEntries(ids.map(id=>[id,{action:true}]));stepGullet(g,held,1/60);stepGullet(g,{},1/60);}

test('Gullet Gala creates only the public actor schema and bounded physical pellets',()=>{
  const source=roster.map(p=>({...p,hand:[{id:'private-card'}],seed:123,deck:['secret']}));
  const g=createGullet(source,5);
  assert.equal(g.id,'gullet-gala');assert.equal(GULLET_GAME.duration,44);assert.equal(g.duration,44);
  assert.equal(g.players.length,4);assert.equal(g.state.objects.length,30);
  assert.deepEqual(copy(g),g);assert.deepEqual(createGullet(source,5),g);
  for(const p of g.players){assert.equal(p.hand,undefined);assert.equal(p.seed,undefined);assert.equal(p.deck,undefined);assert.equal(p.score,0);}
  assert.ok(!JSON.stringify(g).includes('private-card'));assert.equal(source[0].hand[0].id,'private-card');
  assert.throws(()=>createGullet([],1));assert.throws(()=>createGullet([...roster,roster[0]],1));assert.throws(()=>createGullet([roster[0],roster[0]],1));
  assert.notDeepEqual(g.state.objects,createGullet(source,6).state.objects);
});

test('a quick tap primes immediately, extends a real jaw, and catches a nearby pellet',()=>{
  const g=quiet();anchor(g.players[0],210,292);pellet(g,{x:335});
  const p=g.players[0];stepGullet(g,{p0:{action:true}},1/60);
  assert.equal(p.charging,true);assert.ok(p.charge>0);assert.ok(p.x>p.baseX,'button-down immediately changes rendered mouth pose');
  stepGullet(g,{},1/60);assert.equal(p.bites,1);assert.equal(p.bitePower,0);assert.equal(p.biteReach,205);
  run(g,.3);assert.equal(p.score,1);assert.equal(p.caught,1);assert.equal(g.state.objects.length,0);assert.equal(g.state.claims,1);
});

test('swept catches cannot tunnel across a pellet between simulation frames',()=>{
  const g=quiet(),p=g.players[0];anchor(p,210,292);
  p.bite=.42;p.biteDuration=.42;p.biteReach=335;p.bitePower=1;
  pellet(g,{x:271});stepGullet(g,{},.05);
  assert.ok(p.x>310,'mouth finishes beyond the pellet');assert.ok(Math.abs(p.x-271)>39,'endpoints alone would miss');
  assert.equal(p.caught,1);assert.equal(p.score,1);
});

test('contested pellets have one owner, earliest contact wins, and exact ties rotate',()=>{
  for(const turn of [0,1]){
    const g=quiet(2);anchor(g.players[0],300,292,0);anchor(g.players[1],660,292,Math.PI);
    g.state.claimSerial=turn;pellet(g);tap(g,['p0','p1']);run(g,.35);
    assert.equal(g.players.reduce((sum,p)=>sum+p.caught,0),1);assert.equal(g.players.reduce((sum,p)=>sum+p.score,0),1);
    assert.equal(g.players[turn].caught,1,'exact same arrival uses rotating seat priority');assert.equal(g.state.claims,1);
  }
  const g=quiet(2);anchor(g.players[0],280,292);anchor(g.players[1],650,292,Math.PI);
  pellet(g);tap(g,['p0','p1']);run(g,.35);assert.equal(g.players[1].caught,1,'nearer mouth beats array order');
});

test('charging gives longer reach and recovery; holding does not repeat free attacks',()=>{
  const g=quiet(),p=g.players[0];anchor(p,210,292);
  run(g,1.2,{p0:{action:true}});assert.equal(p.bites,0);assert.equal(p.charge,1);
  stepGullet(g,{},1/60);assert.equal(p.chargedBites,1);assert.equal(p.bitePower,1);assert.equal(p.biteReach,335);
  assert.ok(p.cooldown>1);const count=p.bites;
  for(let n=0;n<10;n++){stepGullet(g,{p0:{action:true}},1/60);stepGullet(g,{},1/60);}
  assert.equal(p.bites,count,'cooldown rejects rapid held/tap spam');
  run(g,1.1);tap(g);assert.equal(p.bites,count+1,'jaw becomes usable after recovery');
});

test('blackthorns cost points, force a spit delay, and stop the current bite',()=>{
  const g=quiet(),p=g.players[0];anchor(p,210,292);p.score=10;
  pellet(g,{x:335,kind:'thorn',value:0});tap(g);run(g,.18);
  assert.equal(p.score,7);assert.equal(p.thorns,1);assert.ok(p.stun>.6);assert.equal(p.bite,0);assert.ok(p.cooldown>.8);
  const count=p.bites;tap(g);assert.equal(p.bites,count);assert.equal(p.caught,0);
  const poor=quiet();anchor(poor.players[0],210,292);pellet(poor,{x:335,kind:'thorn',value:0});tap(poor);run(poor,.2);assert.equal(poor.players[0].score,0);
});

test('gold moon pearls carry their actual value and bites have a bounded catch capacity',()=>{
  const g=quiet(),p=g.players[0];anchor(p,210,292);
  pellet(g,{x:335,kind:'pearl',value:8});tap(g);run(g,.3);
  assert.equal(p.score,8);assert.equal(p.pearls,1);
  const many=quiet();anchor(many.players[0],210,292);
  for(let n=0;n<10;n++)pellet(many,{x:280+n*15,y:292+(n%2?5:-5)});
  tap(many);run(many,.4);assert.ok(many.players[0].caught<=3,'quick jaw cannot clear the entire bowl');assert.ok(many.state.objects.length>=7);
});

test('SIP mode physically attracts only pellets inside the mouth cone',()=>{
  const sip=quiet(),p=sip.players[0];anchor(p,210,292);
  pellet(sip,{x:370});pellet(sip,{x:480,y:405});
  stepGullet(sip,{p0:{up:true}},1/60);assert.equal(p.mode,'sip');
  const gulp=copy(sip);gulp.players[0].mode='gulp';
  run(sip,.2,{p0:{action:true}});run(gulp,.2,{p0:{action:true}});
  assert.ok(sip.state.objects[0].vx<gulp.state.objects[0].vx-20);
  assert.ok(sip.state.objects[0].x<gulp.state.objects[0].x);
  assert.ok(Math.abs(sip.state.objects[1].vx-gulp.state.objects[1].vx)<1e-9,'off-cone pellet receives no suction');
});

test('burps add a real pellet impulse, interrupt a rival jaw and obey cooldown',()=>{
  const g=quiet(2),[p,q]=g.players;anchor(p,210,292);anchor(q,400,292,Math.PI);
  q.x=350;q.extension=50;q.bite=.3;q.biteDuration=.42;q.biteReach=205;
  const ball=pellet(g,{x:330});stepGullet(g,{p0:{down:true}},.05);
  assert.ok(ball.vx>200);assert.ok(q.stun>0);assert.equal(q.bite,0);assert.equal(p.burps,1);assert.equal(g.state.burps,1);
  run(g,.1,{p0:{down:true}});stepGullet(g,{},1/60);stepGullet(g,{p0:{down:true}},1/60);
  assert.equal(p.burps,1,'holding and retapping cannot bypass3-second recovery');
});

test('physical pellets bounce off the bowl and transfer velocity on contact',()=>{
  const g=quiet();const edge=pellet(g,{x:750,y:292,vx:200});
  stepGullet(g,{},.05);assert.ok(edge.vx<0);assert.ok(edge.x<=GULLET_ARENA.x+GULLET_ARENA.rx);
  g.state.objects=[];const a=pellet(g,{x:450,vx:80}),b=pellet(g,{x:465,vx:0});stepGullet(g,{},1/60);
  assert.ok(b.vx>0);assert.ok(a.vx<80);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=15.9);
});

test('courses change circulation, increase serving rate and finish with high-value dessert',()=>{
  const g=quiet();g.time=13.99;stepGullet(g,{},.02);assert.equal(g.state.course,1);assert.equal(g.state.courseName,'WHIRLING FEAST');
  g.time=28.99;stepGullet(g,{},.02);assert.equal(g.state.course,2);assert.equal(g.state.courseName,'SUDDEN RUSH');
  g.time=37.99;stepGullet(g,{},.02);assert.equal(g.state.course,3);
  assert.ok(g.state.objects.filter(o=>o.kind==='pearl'&&o.value===8).length>=6);
  g.time=43.99;stepGullet(g,{},.05);assert.equal(g.time,44);assert.equal(g.done,true);
  const snapshot=JSON.stringify(g);stepGullet(g,{p0:{action:true}},.05);assert.equal(JSON.stringify(g),snapshot);
});

test('complete bot matches remain competitive, bounded, and JSON-replay deterministic',()=>{
  for(const seed of [1,2,3]){
    const g=createGullet(roster.map(p=>({...p,bot:true})),seed);run(g,1.7);const restored=copy(g);
    let maxObjects=0,maxEffects=0;
    while(!g.done){stepGullet(g,{},1/60);stepGullet(restored,{},1/60);maxObjects=Math.max(maxObjects,g.state.objects.length);maxEffects=Math.max(maxEffects,g.state.effects.length);}
    assert.deepEqual(g,restored);assert.ok(g.players.every(p=>p.score>20&&p.caught>15&&p.bites>10));
    assert.ok(g.players.some(p=>p.chargedBites>0));assert.ok(g.state.burps>0);
    assert.ok(maxObjects<=44);assert.ok(maxEffects<=28);
    const results=getGulletResults(g);assert.equal(results.length,4);assert.ok(results.every((result,i)=>i===0||results[i-1].score>=result.score));
  }
});

test('malformed times do not mutate state and input shapes cannot inject actor data',()=>{
  const g=quiet(),before=JSON.stringify(g);
  for(const dt of [NaN,Infinity,-1,0])stepGullet(g,{p0:{action:true}},dt);
  assert.equal(JSON.stringify(g),before);
  stepGullet(g,{p0:null,foreign:{score:999}},1/60);assert.equal(g.players[0].score,0);
});

test('renderer uses physical paper helpers, flushes materials before HUD and never mutates simulation',()=>{
  const g=quiet(4);pellet(g,{kind:'pearl'});pellet(g,{x:510,kind:'thorn'});pellet(g,{x:450});tap(g);run(g,.1);
  const snapshot=JSON.stringify(g),calls=[],ctx=new Proxy({}, {get:(target,key)=>target[key]||((...args)=>{calls.push([key,...args]);}),set:(target,key,value)=>{target[key]=value;return true;}});
  const h=Object.fromEntries(['background','platform','character','object','objective','prop','fx','feast','endScene'].map(name=>[name,(...args)=>calls.push([name,...args.slice(1)])]));
  drawGullet(ctx,g,h);assert.equal(JSON.stringify(g),snapshot);
  const flush=calls.findIndex(call=>call[0]==='endScene'),arena=calls.slice(0,flush),hud=calls.slice(flush+1);
  assert.equal(arena.filter(call=>call[0]==='feast').length,4);assert.equal(arena.filter(call=>call[0]==='character'&&call[4]===64).length,4);
  assert.equal(hud.filter(call=>call[0]==='character'&&call[4]===52&&call[5].portrait===true).length,4,'four separate HUD portraits render after material flush');
  assert.ok(calls.filter(call=>call[0]==='platform').length>=9);assert.ok(calls.some(call=>call[0]==='objective'&&call[1]==='bomb'));
  assert.equal(calls.filter(call=>call[0]==='endScene').length,1);
  assert.ok(calls.findIndex(call=>call[0]==='endScene')<calls.findIndex(call=>call[0]==='fillText'));
  assert.ok(!arena.some(call=>['arc','ellipse'].includes(call[0])),'no clean vector bowl rings replace paper gameplay assets; decorative HUD medallions are separate');
});
