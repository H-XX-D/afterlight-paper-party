import test from 'node:test';
import assert from 'node:assert/strict';
import {MINIGAMES,createGame,stepGame,drawGame} from '../src/minigames.js';
import {createBrawl} from '../src/brawlers.js';
import {createGullet} from '../src/gullet-gala.js';
import {createChallenge} from '../src/boardgame-challenges.js';
import {BOT_DIFFICULTIES,BOT_CONTROL_LIMITS,normalizeBotDifficulty,configureBotDifficulty,botControl,botTarget,botTimingOffset,botDifficultyDiagnostics} from '../src/bot-difficulty.js';

const levels=['easy','medium','hard'];
const roster=(n=2,bot=true)=>Array.from({length:n},(_,slot)=>({id:`p${slot}`,name:`Paper ${slot}`,character:slot,bot}));
const finish=g=>{for(let frame=0;frame<Math.ceil(g.duration*60)+1;frame++)stepGame(g,{},1/60);return g;};
const mistakes=g=>g.players.reduce((sum,p)=>sum+(p.botBrain?.missedActions||0)+(p.botBrain?.lapses||0)+(p.botBrain?.wrongTurns||0),0);
const score=g=>g.players.reduce((sum,p)=>sum+p.score,0);

test('all 26 production modes default to Medium and accept normalized public difficulty options',()=>{
 assert.equal(normalizeBotDifficulty(' Easy '),'easy');assert.equal(normalizeBotDifficulty('impossible'),'medium');assert.equal(normalizeBotDifficulty(null),'medium');
 for(const definition of MINIGAMES){
  const ordinary=createGame(definition.id,roster(),172),explicit=createGame(definition.id,roster(),172,{difficulty:'medium'});
  assert.deepEqual(ordinary,explicit);assert.equal(ordinary.botDifficulty,'medium');
  for(const difficulty of levels){const g=createGame(definition.id,roster(),172,{difficulty});assert.equal(g.botDifficulty,difficulty);assert.ok(g.players.every(p=>p.botBrain&&p.botBrain.queue.length===0));}
 }
 for(const create of [options=>createBrawl('crown-clash',roster(),3,options),options=>createGullet(roster(),3,options),options=>createChallenge('clockwork-surgery',roster(),3,options)]){
  assert.equal(create().botDifficulty,undefined,'omitted direct-native options retain old physical-core fixtures');assert.equal(create({difficulty:'easy'}).botDifficulty,'easy');
 }
});

test('difficulty actually delays observed controls, changes decision cadence and leaves spawn RNG untouched',()=>{
 const first={},counts={},means={};
 for(const difficulty of levels){
  const g={id:'reaction-test',time:0,rng:173,players:roster(1)};configureBotDifficulty(g,{difficulty},173);const p=g.players[0],rng=g.rng;
  for(let frame=0;frame<180;frame++){
   g.time=frame/60;const input=botControl(g,p,{right:true,action:frame%18<3},1/60);
   if(input.right&&first[difficulty]===undefined)first[difficulty]=g.time;
   assert.ok(p.botBrain.queue.length<=BOT_CONTROL_LIMITS.queue);
  }
  assert.equal(g.rng,rng);const diagnostics=botDifficultyDiagnostics(g);counts[difficulty]=diagnostics.bots[0].decisions;means[difficulty]=diagnostics.bots[0].meanReaction;
  assert.ok(Object.isFrozen(diagnostics)&&Object.isFrozen(diagnostics.bots));
 }
 assert.ok(first.easy>first.medium&&first.medium>first.hard);assert.ok(first.hard>.04,'Hard cannot react in the same frame');
 assert.ok(counts.easy<counts.medium&&counts.medium<counts.hard);assert.ok(means.easy>means.medium&&means.medium>means.hard);
});

test('even Hard has nonzero target and timing error; Easy is less accurate without consuming gameplay RNG',()=>{
 const error={};
 for(const difficulty of levels){
  const g=createGame('rhythm',roster(1),97,{difficulty}),p=g.players[0],rng=g.rng,before=JSON.stringify(g);
  const offsets=Array.from({length:50},(_,beat)=>botTimingOffset(g,p,beat)),target=botTarget(g,p,{x:480,y:250});
  error[difficulty]=offsets.reduce((sum,v)=>sum+Math.abs(v),0);
  assert.ok(offsets.some(v=>v<0)&&offsets.some(v=>v>0));assert.ok(offsets.every(v=>Math.abs(v)<=BOT_DIFFICULTIES[difficulty].timing));assert.notDeepEqual(target,{x:480,y:250});
  assert.equal(g.rng,rng);assert.equal(JSON.stringify(g),before,'reading perceived targets and timing is deterministic and read-only once configured');
 }
 assert.ok(error.easy>error.medium&&error.medium>error.hard&&error.hard>0);
});

test('human control traces produce identical physics and scores across difficulty settings',()=>{
 for(const definition of MINIGAMES){
  const easy=createGame(definition.id,roster(2,false),841,{difficulty:'easy'}),hard=createGame(definition.id,roster(2,false),841,{difficulty:'hard'});
  for(let frame=0;frame<500;frame++){
   const inputs={p0:{right:frame%110<35,left:frame%110>75,up:frame%89<19,down:frame%113>83,action:frame%17===0,special:frame%191<5}};
   stepGame(easy,inputs,1/60);stepGame(hard,inputs,1/60);
  }
  assert.deepEqual(easy.players,hard.players,definition.id);assert.deepEqual(easy.state,hard.state,definition.id);assert.deepEqual(easy.surprises,hard.surprises,definition.id);assert.equal(easy.rng,hard.rng);
 }
});

for(const difficulty of levels)test(`${difficulty}: all 26 bot simulations replay through JSON snapshots with finite bounded control state`,()=>{
 for(const definition of MINIGAMES){
  const a=createGame(definition.id,roster(),283,{difficulty});let b=JSON.parse(JSON.stringify(a));
  for(let frame=0;frame<Math.ceil(a.duration*60)+1;frame++){
   stepGame(a,{},1/60);stepGame(b,{},1/60);if(frame%211===0)b=JSON.parse(JSON.stringify(b));
   for(const p of a.players){assert.ok(p.botBrain.queue.length<=BOT_CONTROL_LIMITS.queue);assert.ok(Number.isFinite(p.botBrain.nextAt)&&Number.isFinite(p.botBrain.reactionTotal)&&Number.isFinite(p.score));}
  }
  assert.deepEqual(a,b,definition.id);assert.ok(a.done);assert.equal(a.botDifficulty,difficulty);assert.ok(mistakes(a)>0,`${definition.id}: ${difficulty} makes observable control mistakes`);
  const frozen=JSON.stringify(a);stepGame(a,{},1/60);assert.equal(JSON.stringify(a),frozen);
 }
});

test('three paired seeds show genuine Easy mistakes in every mode and progressively stronger aggregate play',()=>{
 const totals={easy:0,medium:0,hard:0};let strongerModes=0;
 for(const definition of MINIGAMES){
  const scores={easy:0,medium:0,hard:0},errors={easy:0,medium:0,hard:0};
  for(const difficulty of levels)for(const seed of [19,43,87]){
   const g=finish(createGame(definition.id,roster(),seed,{difficulty}));scores[difficulty]+=score(g);errors[difficulty]+=mistakes(g);
  }
  assert.ok(errors.easy>errors.medium&&errors.medium>errors.hard,`${definition.id}: easier bots miss more actual control opportunities`);
  assert.ok(scores.easy>0,`${definition.id}: Easy still engages with the objective`);
  for(const difficulty of levels)totals[difficulty]+=scores[difficulty];if(scores.hard>scores.easy)strongerModes++;
 }
 assert.ok(totals.medium>totals.easy*1.2);assert.ok(totals.hard>totals.medium*1.08);assert.ok(strongerModes>=20,'competitive shared objectives may reverse an individual result, but Hard improves most modes');
});

test('difficulty state never copies private roster data and diagnostics/drawing cannot advance bots',()=>{
 const privateRoster=roster().map(p=>({...p,hand:['do-not-copy'],authToken:'secret-token',nested:{hidden:'private'}}));
 const gradient={addColorStop(){}};const c=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
 for(const definition of MINIGAMES){
  const g=createGame(definition.id,privateRoster,984,{difficulty:'easy'});for(let frame=0;frame<120;frame++)stepGame(g,{},1/60);
  const snapshot=JSON.stringify(g);assert.ok(!snapshot.includes('do-not-copy')&&!snapshot.includes('secret-token')&&!snapshot.includes('private'));
  botDifficultyDiagnostics(g);drawGame(c,g,{character(){},prop(){},object(){},fx(){}});assert.equal(JSON.stringify(g),snapshot,definition.id);
 }
});
