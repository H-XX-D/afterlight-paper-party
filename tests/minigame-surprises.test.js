import test from 'node:test';
import assert from 'node:assert/strict';
import {MINIGAMES,createGame,stepGame,drawGame} from '../src/minigames.js';
import {MINIGAME_SURPRISES,SURPRISE_LIMITS,minigameSurprisePool,minigameSurpriseDiagnostics,minigameSurpriseCue,prepareMinigameSurprises,finishMinigameSurprises,drawMinigameSurprises} from '../src/minigame-surprises.js';

const players=(n=1)=>Array.from({length:n},(_,slot)=>({id:`p${slot}`,name:`Paper ${slot}`,character:slot}));
const advance=(g,frames,inputs={})=>{for(let i=0;i<frames;i++)stepGame(g,inputs,1/60);return g;};
function planned(g,kind,warning=.01){
 assert.ok(minigameSurprisePool(g).includes(kind),`${g.id}: ${kind} is in its production pool`);
 g.time=9;g.surprises.nextAt=99;g.surprises.warning={kind,...MINIGAME_SURPRISES[kind],serial:1,at:g.time-1.1,until:g.time+warning,direction:1};
 return g;
}
function active(g,kind){planned(g,kind,0);stepGame(g,{},1/60);return g;}
const mockContext=()=>new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});

test('all 26 production modes have finite, mode-appropriate event pools and independent seeds',()=>{
 for(const definition of MINIGAMES){
  const a=createGame(definition.id,players(2),123),b=createGame(definition.id,players(2),124),pool=minigameSurprisePool(a);
  assert.ok(pool.length>=3,definition.id);assert.equal(new Set(pool).size,pool.length);
  assert.notEqual(a.surprises.rng,b.surprises.rng);assert.ok(a.surprises.nextAt>=8.5&&a.surprises.nextAt<=9.3);
  for(const kind of pool){assert.ok(MINIGAME_SURPRISES[kind].label.length<48);assert.ok(MINIGAME_SURPRISES[kind].duration>4);}
  if(['maze','rhythm','gallery','redlight','clockwork-surgery','tottering-tower'].includes(a.id))assert.ok(!pool.includes('paper-gust')&&!pool.includes('relic-rain'),'anchored controls never get physical displacement or falling hazards');
 }
});

test('opening eight seconds retain native rules, followed by a complete warning before impact',()=>{
 const g=createGame('maze',players(),83);advance(g,480);
 assert.equal(g.surprises.serial,0);assert.equal(g.surprises.active,null);assert.equal(g.surprises.objects.length,0);
 while(!g.surprises.warning)stepGame(g,{},1/60);
 const warning=structuredClone(g.surprises.warning),score=g.players[0].score;
 assert.ok(Math.abs(warning.until-warning.at-SURPRISE_LIMITS.warning)<1e-10);assert.ok(minigameSurpriseCue(g).endsWith('s'));
 advance(g,60);assert.equal(g.surprises.active,null);assert.equal(g.players[0].score,score);
 while(!g.surprises.active)stepGame(g,{},1/60);
 assert.ok(g.time>=warning.until);assert.equal(g.surprises.active.kind,warning.kind);
});

test('double moon pays only newly earned score, never existing score or a loss',()=>{
 const g=active(createGame('inkfall',players(),5),'double-moon'),control=structuredClone(g);
 control.surprises.active=null;g.state.timer=control.state.timer=99;g.state.objects=control.state.objects=[];
 g.players[0].score=control.players[0].score=20;
 stepGame(g,{},.05);stepGame(control,{},.05);
 assert.ok(Math.abs((g.players[0].score-20)-(control.players[0].score-20)*2)<1e-9);
 // A native loss remains a loss; the director neither refunds nor doubles it.
 for(const game of [g,control]){game.players[0].cooldown=0;game.state.objects=[{x:480,y:400,speed:0,r:22,spin:0}];game.players[0].x=480;}
 const beforeG=g.players[0].score,beforeC=control.players[0].score;
 stepGame(g,{},.05);stepGame(control,{},.05);
 assert.equal(g.players[0].score-beforeG,control.players[0].score-beforeC);
 const grid=active(createGame('maze',players(),5),'double-moon');const score=grid.players[0].score;advance(grid,120);assert.equal(grid.players[0].score,score,'an idle grid player earns nothing');
});

test('paper gust retains left/right control and crouching reduces its displacement',()=>{
 const free=active(createGame('inkfall',players(),14),'paper-gust'),braced=structuredClone(free),opposed=structuredClone(free);
 for(const g of [free,braced,opposed]){g.state.objects=[];g.state.timer=99;g.players[0].x=480;}
 advance(free,60);advance(braced,60,{p0:{down:true}});advance(opposed,60,{p0:{left:true}});
 assert.ok(free.players[0].x>500);assert.ok(braced.players[0].x<485);assert.ok(opposed.players[0].x<300,'ordinary movement strongly overcomes the wind');
 assert.equal(free.players[0].ability,0,'wind does not consume a dash or disable control');
 const edge=active(createGame('rift-rumble',players(),15),'paper-gust');edge.players[0].x=895;edge.players[0].y=430;edge.players[0].vx=0;advance(edge,60,{p0:{down:true}});assert.ok(edge.players[0].x<=896,'the wind does not push a resting player across a ring-out margin');
});

test('warned relic rain rewards the first collector and permits avoiding or shielding thorns',()=>{
 const g=active(createGame('inkfall',players(2),28),'relic-rain');g.state.objects=[];g.state.timer=99;
 const star={id:100,x:480,y:399,vy:0,kind:'star',at:g.time,life:1,spin:0};
 g.surprises.objects=[star];for(const p of g.players){p.x=480;p.score=10;}
 stepGame(g,{},1/60);assert.equal(g.surprises.claims,1);assert.ok(g.players[0].score>17);assert.ok(g.players[1].score<11,'a contested relic is only paid once');
 const vulnerable=structuredClone(g),shielded=structuredClone(g),avoiding=structuredClone(g);
 for(const game of [vulnerable,shielded,avoiding]){game.players=game.players.slice(0,1);game.surprises.objects=[{...star,id:101,kind:'thorn',life:1}];game.players[0].score=20;game.players[0].prev.action=false;}
 stepGame(vulnerable,{},1/60);stepGame(shielded,{p0:{action:true}},1/60);avoiding.players[0].x=550;stepGame(avoiding,{},1/60);
 assert.ok(vulnerable.players[0].score<17);assert.ok(shielded.players[0].score>=20);assert.ok(avoiding.players[0].score>=20);
 assert.equal(shielded.surprises.avoided,1);assert.equal(avoiding.surprises.hits,0);
});

test('moon blooms create real bounded native pickups and expire temporary opportunities',()=>{
 const moth=planned(createGame('mothlight',players(),57),'moon-bloom');moth.state.objects=[];const rng=moth.rng;stepGame(moth,{},1/60);
 assert.equal(moth.rng,rng,'event spawns use the event stream');assert.equal(moth.state.objects.length,3);assert.ok(moth.state.objects.every(o=>o.value===3));
 const target=moth.state.objects[0];moth.players[0].x=target.x;moth.players[0].y=target.y;stepGame(moth,{},1/60);assert.ok(moth.players[0].carry>=3,'generated bloom moths use normal collection rules');
 advance(moth,330);assert.equal(moth.state.objects.filter(o=>o.surpriseUntil!==undefined).length,0);
 const bowl=planned(createGame('gullet-gala',players(),57),'moon-bloom');bowl.state.objects=[];stepGame(bowl,{},1/60);assert.equal(bowl.state.objects.length,9);assert.ok(bowl.state.objects.every(o=>o.kind==='pearl'&&o.value>0));
 const gallery=planned(createGame('gallery',players(),57),'moon-bloom');stepGame(gallery,{},1/60);assert.equal(gallery.state.objects.length,8);assert.ok(gallery.state.objects.slice(-3).some(o=>o.friendly),'couriers preserve the charge-versus-precision decision');
});

test('challenge boons recharge existing player resources and cannot cause an automatic extraction',()=>{
 const surgery=active(createGame('clockwork-surgery',players(),81),'clockwork-lull'),plain=structuredClone(surgery);plain.surprises.active=null;
 surgery.players[0].steadyCooldown=plain.players[0].steadyCooldown=3;const position=structuredClone(surgery.players[0].cursor);
 advance(surgery,30);advance(plain,30);assert.ok(surgery.players[0].steadyCooldown<plain.players[0].steadyCooldown-1);assert.deepEqual(surgery.players[0].cursor,position);assert.equal(surgery.players[0].extractions,0);
 const tower=active(createGame('tottering-tower',players(),81),'counterweight'),normal=structuredClone(tower);normal.surprises.active=null;
 tower.players[0].brace=normal.players[0].brace=.2;advance(tower,30);advance(normal,30);assert.ok(tower.players[0].brace>normal.players[0].brace+.1);assert.equal(tower.players[0].extractions,0);assert.equal(tower.players[0].stacks,0);
});

test('train surprises change the actual warning cadence and reward clean clears without idle points',()=>{
 const express=planned(createGame('sweep',players(),93),'ghost-express');express.state.next=11;stepGame(express,{},1/60);
 assert.ok(express.state.next-express.time>=.7&&express.state.next-express.time<1.5,'the accelerated pass still leaves a reaction window');
 const reward=active(createGame('sweep',players(),93),'star-carriage'),plain=structuredClone(reward);plain.surprises.active=null;
 for(const game of [reward,plain]){game.state.height='low';game.state.next=game.time+.05;game.players[0].jump=45;game.players[0].vy=0;game.players[0].score=0;}
 stepGame(reward,{},.05);stepGame(plain,{},.05);assert.equal(reward.players[0].score,plain.players[0].score+4);
 const score=reward.players[0].score;reward.state.next=99;advance(reward,60);assert.equal(reward.players[0].score,score);
});

test('phase fever and cover night accelerate existing decisions, while golden notes require correct play',()=>{
 const maze=active(createGame('maze',players(),94),'phase-fever'),ordinary=structuredClone(maze);ordinary.surprises.active=null;
 maze.players[0].ability=ordinary.players[0].ability=3;advance(maze,30);advance(ordinary,30);assert.ok(maze.players[0].ability<ordinary.players[0].ability-.9);assert.equal(maze.players[0].score,0);
 const cover=active(createGame('redlight',players(),94),'cover-night'),watch=structuredClone(cover);watch.surprises.active=null;
 for(const g of [cover,watch]){g.state.green=false;g.state.timer=3;g.players[0].lane=0;g.players[0].coverPhase=g.state.phase;g.players[0].score=0;g.players[0].progress=0;}
 advance(cover,30,{p0:{up:true,down:true}});advance(watch,30,{p0:{up:true,down:true}});
 assert.ok(Math.abs(cover.players[0].score-watch.players[0].score*2)<1e-9);assert.ok(cover.players[0].progress>watch.players[0].progress+5);
 const phrase=active(createGame('rhythm',players(),94),'golden-phrase');phrase.time=10.76-1/60;phrase.players[0].score=0;phrase.players[0].prev={};stepGame(phrase,{p0:{action:true,left:true}},1/60);assert.equal(phrase.players[0].score,8);
 const wrong=active(createGame('rhythm',players(),94),'golden-phrase');wrong.time=10.76-1/60;wrong.players[0].prev={};stepGame(wrong,{p0:{action:true,right:true}},1/60);assert.equal(wrong.players[0].score,0);assert.equal(wrong.surprises.bonusEarned,0);
});

test('rhythm echo bloom asks for a second opposite-instrument answer rather than awarding a passive bonus',()=>{
 const g=active(createGame('rhythm',players(),95),'moon-bloom'),p=g.players[0];g.time=10.76-1/60;p.prev={};
 stepGame(g,{p0:{left:true,action:true}},1/60);assert.equal(p.score,5);assert.ok(Math.abs(p.echoAt-11.02)<1e-8);assert.ok(minigameSurpriseCue(g).includes('OTHER INSTRUMENT'));
 const skip=structuredClone(g);g.time=p.echoAt-1/60;p.prev={};stepGame(g,{p0:{right:true,action:true}},1/60);assert.equal(p.score,11);assert.equal(p.echoClaimed,16);
 skip.time=skip.players[0].echoAt-1/60;skip.players[0].prev={};stepGame(skip,{},1/60);assert.equal(skip.players[0].score,5,'ignoring the extra note is allowed and earns nothing');
 const before=p.score;p.prev={};stepGame(g,{p0:{action:true}},1/60);assert.ok(p.score<=before,'an echo can only be claimed once');
});

test('drawing and diagnostics do not advance either RNG and material effects precede the HUD',()=>{
 for(const id of ['inkfall','rift-rumble','gullet-gala','clockwork-surgery','tottering-tower']){
  const g=active(createGame(id,players(2),112),minigameSurprisePool(createGame(id,players(2),112)).includes('relic-rain')?'relic-rain':'double-moon');
  const before=JSON.stringify(g),ctx=mockContext(),order=[];
  drawGame(ctx,g,{character(){},prop:(c,type,x,y,size)=>order.push(x===0&&y===0&&(size===37||size===41)?'event':'prop'),object(){},fx(){},endScene:()=>order.push('flush'),uiFrame:()=>order.push('ink')});
  const diagnostics=minigameSurpriseDiagnostics(g);drawMinigameSurprises(ctx,g,{prop(){},object(){},fx(){}});minigameSurpriseCue(g);
  assert.equal(JSON.stringify(g),before,id);assert.ok(Object.isFrozen(diagnostics)&&Object.isFrozen(diagnostics.pool));
  assert.equal(order.filter(e=>e==='flush').length,1);assert.ok(order.indexOf('event')>=0&&order.indexOf('event')<order.indexOf('flush'),'event paper joins the world batch');assert.ok(order.indexOf('ink')>order.indexOf('flush'),'event ink is painted after material composition');
 }
});

test('every 26-game director survives JSON replay, changes event choices with seed, and stays bounded',()=>{
 let uniqueSchedules=0;
 for(const definition of MINIGAMES){
  const a=createGame(definition.id,players(2),729),other=createGame(definition.id,players(2),730);let b=JSON.parse(JSON.stringify(a));
  for(let frame=0;frame<Math.ceil(definition.duration*60)+1;frame++){
   const inputs={p0:{right:frame%130<50,left:frame%130>85,up:frame%91<17,down:frame%119>90,action:frame%19===0,special:frame%157<8}};
   stepGame(a,inputs,1/60);stepGame(b,inputs,1/60);stepGame(other,inputs,1/60);
   if(frame%173===0)b=JSON.parse(JSON.stringify(b));
   assert.ok(a.surprises.objects.length<=SURPRISE_LIMITS.objects);assert.ok(a.surprises.effects.length<=SURPRISE_LIMITS.effects);assert.ok(a.surprises.history.length<=SURPRISE_LIMITS.history);
  }
  assert.deepEqual(a,b,definition.id);assert.ok(a.surprises.serial>=1,`${definition.id}: production wrapper actually schedules events`);
  const history=a.surprises.history;for(let j=1;j<history.length;j++)assert.notEqual(history[j].kind,history[j-1].kind,'consecutive events vary');
  if(JSON.stringify(history)!==JSON.stringify(other.surprises.history))uniqueSchedules++;
 }
 assert.ok(uniqueSchedules>=24,'seed affects the game director rather than cosmetic drawing');
});
