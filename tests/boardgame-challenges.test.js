import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARDGAME_CHALLENGES,createChallenge,stepChallenge,drawChallenge,getChallengeResults,surgeryTable,surgeryChannelContains,towerSupport,towerLayout,towerBlockPosition} from '../src/boardgame-challenges.js';

const roster=Array.from({length:4},(_,slot)=>({id:`p${slot}`,name:`Traveler ${slot+1}`,character:slot}));
const copy=value=>JSON.parse(JSON.stringify(value));
function create(id,count=4,seed=5){return createChallenge(id,roster.slice(0,count),seed);}
function run(g,seconds,inputs={}){for(let n=0;n<Math.ceil(seconds*60)&&!g.done;n++)stepChallenge(g,inputs,1/60);return g;}
function tap(g,inputs={p0:{action:true}}){stepChallenge(g,inputs,1/60);stepChallenge(g,{},1/60);}
function near(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<3;}
function guideOrgan(g,p,organ){
  // Focused starting fixture, followed by real six-button inputs through every bend.
  p.cursor={x:organ.x,y:organ.y};stepChallenge(g,{[p.id]:{action:true}},1/60);
  assert.equal(p.carried,organ.id);
  for(const point of organ.route.slice(1)){
    let frames=0;
    while(!near(p.cursor,point)&&p.carried&&frames++<500){
      const dx=point.x-p.cursor.x,dy=point.y-p.cursor.y;
      stepChallenge(g,{[p.id]:{action:true,left:dx<-1.4,right:dx>1.4,up:dy<-1.4,down:dy>1.4}},1/60);
    }
    assert.ok(frames<500,'the route is reachable using the actual controls');
    assert.equal(p.carried,organ.id,'following the printed channel avoids an alarm');
  }
  stepChallenge(g,{},1/60);
}
function claim(g,p=g.players[0],layer=2,slot=2){
  p.cooldown=0;p.selectedLayer=layer;p.selectedSlot=slot;p.chooseClock=0;
  stepChallenge(g,{[p.id]:{action:true}},1/60);
  assert.equal(p.phase,'pulling');return g.state.blocks.find(b=>b.id===p.carried);
}
function freeBlock(g,p=g.players[0]){
  for(let n=0;n<250&&p.phase==='pulling';n++)stepChallenge(g,{[p.id]:{action:true}},1/60);
  assert.equal(p.phase,'carrying');return p;
}

test('original challenge catalog is immutable and creation copies only public actor fields',()=>{
  assert.equal(BOARDGAME_CHALLENGES.length,2);assert.ok(Object.isFrozen(BOARDGAME_CHALLENGES));
  for(const definition of BOARDGAME_CHALLENGES){
    assert.ok(Object.isFrozen(definition));assert.ok(definition.duration>=45);assert.ok(definition.instructions.includes('Space'));
    const players=roster.map(p=>{
      const value={...p};for(const key of ['hand','deck','seed','lastDrawn'])Object.defineProperty(value,key,{get(){throw new Error('Private board field read');},enumerable:true});return value;
    });
    const g=createChallenge(definition.id,players,5);
    assert.equal(g.players.length,4);assert.deepEqual(copy(g),g);assert.deepEqual(createChallenge(definition.id,players,5),g);
    for(const p of g.players){assert.equal(p.hand,undefined);assert.equal(p.deck,undefined);assert.equal(p.seed,undefined);assert.equal(p.score,0);}
    assert.throws(()=>createChallenge(definition.id,[],1));assert.throws(()=>createChallenge(definition.id,[roster[0],roster[0]],1));
    assert.throws(()=>createChallenge(definition.id,[...roster,roster[0]],1));assert.throws(()=>createChallenge(definition.id,[{}],1));
  }
  assert.throws(()=>createChallenge('unknown',roster));
});

test('surgery uses three real organs and reachable multi-bend channels at readable scale',()=>{
  const g=create('clockwork-surgery');
  for(const p of g.players){
    const a=surgeryTable(p.slot,4);assert.ok(a.w>=190);assert.equal(a.h,235);assert.equal(p.pieces.length,3);
    for(const organ of p.pieces){
      assert.equal(organ.route.length,5);assert.ok(organ.route[0].x!==organ.route[1].x);
      for(const point of organ.route){assert.ok(point.x>a.x&&point.x<a.x+a.w);assert.ok(point.y>=a.y&&point.y<a.y+a.h);assert.ok(surgeryChannelContains(organ,point,1));}
      const point={x:organ.route[1].x+organ.width*.46,y:(organ.route[1].y+organ.route[2].y)/2};
      assert.ok(surgeryChannelContains(organ,point,0));assert.equal(surgeryChannelContains(organ,point,1),false);
      assert.ok(surgeryChannelContains(organ,point,1,true),'a timed steady hand removes narrowing');
    }
  }
});

test('surgery arrows move in all directions and a held button cannot grab from anywhere',()=>{
  const g=create('clockwork-surgery'),p=g.players[0],start={...p.cursor};
  run(g,.1,{p0:{left:true}});assert.ok(p.cursor.x<start.x-15);
  run(g,.1,{p0:{right:true}});assert.ok(Math.abs(p.cursor.x-start.x)<.01);
  run(g,.1,{p0:{up:true}});assert.ok(p.cursor.y<start.y-15);
  run(g,.1,{p0:{down:true}});assert.ok(Math.abs(p.cursor.y-start.y)<.01);
  stepChallenge(g,{p0:{action:true}},1/60);assert.equal(p.carried,null);
  const organ=p.pieces[0];p.cursor={x:organ.x,y:organ.y};run(g,.25,{p0:{action:true}});
  assert.equal(p.carried,null,'moving a held tool onto an organ does not create a free new grab');
  stepChallenge(g,{},1/60);stepChallenge(g,{p0:{action:true}},1/60);assert.equal(p.carried,organ.id);
});

test('a clean surgery extraction follows physical bends and banks only after tray release',()=>{
  const g=create('clockwork-surgery'),p=g.players[0],organ=p.pieces[0];
  guideOrgan(g,p,organ);
  assert.equal(p.extractions,1);assert.equal(g.state.extractions,1);assert.equal(organ.removed,true);
  assert.equal(p.score,9);assert.equal(p.combo,1);assert.equal(p.carried,null);assert.equal(p.shocks,0);
  assert.ok(g.state.effects.some(e=>e.type==='magic'));assert.ok(p.message.includes('+9'));
});

test('releasing an organ before the tray drops it without awarding or alarming',()=>{
  const g=create('clockwork-surgery'),p=g.players[0],organ=p.pieces[0];p.cursor={x:organ.x,y:organ.y};
  stepChallenge(g,{p0:{action:true}},1/60);run(g,.25,{p0:{action:true}});stepChallenge(g,{},1/60);
  assert.equal(p.drops,1);assert.equal(p.carried,null);assert.equal(organ.removed,false);assert.equal(p.extractions,0);
  assert.equal(p.shocks,0);assert.equal(p.score,0);assert.ok(p.cooldown>0);
});

test('real edge contact rings a shared bell, costs points and forces recovery',()=>{
  const g=create('clockwork-surgery'),p=g.players[0],organ=p.pieces[0];p.score=12;p.cursor={x:organ.x,y:organ.y};
  stepChallenge(g,{p0:{action:true}},1/60);
  for(let n=0;n<70&&p.shocks===0;n++)stepChallenge(g,{p0:{action:true,up:true}},1/60);
  assert.equal(p.shocks,1);assert.equal(p.score,10);assert.equal(p.carried,null);assert.equal(p.combo,0);assert.equal(g.state.alarms,1);
  assert.ok(g.state.bell>.4);assert.ok(g.state.resonance>.17);assert.ok(p.cooldown>.5);
  const calm=copy(g);calm.state.resonance=0;stepChallenge(g,{},1/60);stepChallenge(calm,{},1/60);
  assert.ok(g.state.pressure>calm.state.pressure+.15,'one player’s error changes all tables’ physical pressure');
  stepChallenge(g,{p0:{action:true}},1/60);assert.equal(p.carried,null,'stunned tools cannot instantly re-grab');
});

test('patient clears reward chains and restock a mirrored set of organs',()=>{
  const g=create('clockwork-surgery'),p=g.players[0],firstX=p.pieces[0].x;
  for(const organ of [...p.pieces]){run(g,.2);guideOrgan(g,p,organ);}
  assert.equal(p.extractions,3);assert.equal(p.clears,1);assert.equal(p.level,1);assert.equal(p.combo,3);
  assert.ok(p.score>=9+7+6+2+4+8);assert.ok(p.restock>0);assert.ok(p.pieces.every(o=>o.removed));
  run(g,.8);assert.ok(p.pieces.every(o=>!o.removed));assert.notEqual(p.pieces[0].x,firstX);assert.equal(p.pieces[0].kind,'gear');
});

test('steady hand is a timed six-button skill, suppresses airflow and cannot autorepeat',()=>{
  const g=create('clockwork-surgery'),p=g.players[0],organ=p.pieces[0];
  g.time=1;
  p.cursor={x:organ.x,y:organ.y};stepChallenge(g,{p0:{action:true,special:true}},1/60);
  assert.equal(p.steadies,1);assert.ok(p.steady>1);assert.ok(p.steadyCooldown>3);
  const bare=copy(g);bare.players[0].steady=0;const x=p.cursor.x;
  run(g,.15,{p0:{action:true,special:true}});run(bare,.15,{p0:{action:true,special:true}});
  assert.equal(p.cursor.x,x);assert.notEqual(bare.players[0].cursor.x,x);
  run(g,4,{p0:{special:true}});assert.equal(p.steadies,1);assert.equal(p.steady,0);
  stepChallenge(g,{},1/60);stepChallenge(g,{p0:{special:true}},1/60);assert.equal(p.steadies,2);
});

test('surgery changes bounty and announces a final high-value heart phase',()=>{
  const g=create('clockwork-surgery'),p=g.players[0];g.time=24.01;stepChallenge(g,{},1/60);
  assert.equal(g.state.bounty,'heart');assert.equal(g.state.phase,1);
  g.time=36.01;stepChallenge(g,{},1/60);assert.equal(g.state.phase,2);assert.equal(g.state.bounty,'gear');
  guideOrgan(g,p,p.pieces[0]);assert.equal(p.score,15,'last-phase hearts carry their real six-point bonus');
});

test('tower starts with a mass-bearing nine-layer shared structure and seed variations',()=>{
  const g=create('tottering-tower');assert.equal(g.state.blocks.length,27);assert.equal(towerLayout(g.state).height,9);
  assert.ok(g.state.blocks.every(b=>b.mass>=.85&&b.mass<=1.15&&b.friction>=.75));
  assert.notDeepEqual(g.state.blocks,create('tottering-tower',4,7).state.blocks);
  const support=towerSupport(g.state);assert.ok(support.clearance>65);assert.equal(support.violation,0);assert.equal(support.stress,0);
  for(const b of g.state.blocks){const pos=towerBlockPosition(g.state,b);assert.ok(pos.y>=140&&pos.y<404);}
});

test('tower arrows select actual block columns and layers with bounded repeat',()=>{
  const g=create('tottering-tower'),p=g.players[0];p.cooldown=0;p.selectedSlot=1;p.selectedLayer=2;
  stepChallenge(g,{p0:{right:true,up:true}},1/60);assert.equal(p.selectedSlot,2);assert.equal(p.selectedLayer,3);
  stepChallenge(g,{p0:{left:true,down:true}},1/60);assert.equal(p.selectedSlot,2,'held cursor repeat has a visible beat');
  run(g,.17,{p0:{left:true,down:true}});assert.equal(p.selectedSlot,1);assert.equal(p.selectedLayer,2);
  run(g,2,{p0:{down:true,left:true}});assert.equal(p.selectedSlot,0);assert.equal(p.selectedLayer,0);
});

test('a contested tower block has exactly one owner and exact claims rotate fairly',()=>{
  for(const turn of [0,1]){
    const g=create('tottering-tower',2);g.state.claimSerial=turn;
    for(const p of g.players){p.cooldown=0;p.selectedLayer=2;p.selectedSlot=2;}
    stepChallenge(g,{p0:{action:true},p1:{action:true}},1/60);
    const block=g.state.blocks.find(b=>b.layer===2&&b.slot===2);
    assert.equal(block.owner,`p${turn}`);assert.equal(g.players.filter(p=>p.phase==='pulling').length,1);
    assert.equal(g.players[1-turn].message,'RIVAL HAS THIS BLOCK');assert.equal(g.state.claimSerial,turn+1);
  }
});

test('inching, normal pulling and rushing move the real block at different speeds',()=>{
  const normal=create('tottering-tower');const b=claim(normal),slow=copy(normal),fast=copy(normal),brace=copy(normal);
  run(normal,.4,{p0:{action:true}});run(slow,.4,{p0:{action:true,down:true}});run(fast,.4,{p0:{action:true,up:true}});run(brace,.4,{p0:{action:true,special:true}});
  const pull=g=>g.state.blocks.find(o=>o.id===b.id).pull;
  assert.ok(pull(slow)<pull(brace));assert.ok(pull(brace)<pull(normal));assert.ok(pull(normal)<pull(fast));
  assert.ok(fast.players[0].rushes>0);assert.ok(Math.abs(fast.state.velocity)>Math.abs(normal.state.velocity));
  const partial=pull(normal);stepChallenge(normal,{},1/60);assert.equal(b.owner,null);assert.equal(normal.players[0].phase,'choosing');assert.equal(b.pull,partial);
  const rival=normal.players[1];claim(normal,rival,2,2);assert.equal(b.owner,rival.id);assert.equal(b.pull,partial,'a rival can continue the partly displaced physical block');
});

test('a complete pull must be released and deliberately stacked; its mass survives snapshots',()=>{
  const g=create('tottering-tower'),p=g.players[0],block=claim(g);const mass=block.mass;
  freeBlock(g,p);assert.equal(p.score,2);assert.equal(p.extractions,1);assert.equal(block.removed,true);assert.equal(p.carriedMass,mass);
  run(g,.25,{p0:{action:true}});assert.equal(p.stacks,0,'holding the extraction button does not instantly auto-stack');
  stepChallenge(g,{},1/60);p.stackX=clampForTest(-g.state.lean*1.7,-1.45,1.45);stepChallenge(g,{p0:{action:true}},1/60);
  assert.equal(p.stacks,1);assert.equal(g.state.stacks,1);assert.equal(p.phase,'choosing');assert.equal(p.score,14);
  assert.equal(g.state.blocks.length,27);assert.equal(towerLayout(g.state).height,10);
  const stacked=g.state.blocks.find(b=>b.stacked);assert.equal(stacked.mass,mass);assert.equal(stacked.layer,9);
});
test('simultaneously carried blocks preserve both masses after the first stack compacts records',()=>{
  const g=create('tottering-tower'),[a,b]=g.players;
  for(const [p,layer] of [[a,2],[b,3]]){p.cooldown=0;p.selectedLayer=layer;p.selectedSlot=2;}
  stepChallenge(g,{p0:{action:true},p1:{action:true}},1/60);
  const masses=[a,b].map(p=>g.state.blocks.find(o=>o.id===p.carried).mass);
  for(let n=0;n<200&&[a,b].some(p=>p.phase==='pulling');n++)stepChallenge(g,{p0:{action:true},p1:{action:true}},1/60);
  assert.ok([a,b].every(p=>p.phase==='carrying'));run(g,.1);
  stepChallenge(g,{p0:{action:true}},1/60);
  assert.equal(g.state.blocks.find(o=>o.id===b.carried),undefined,'old extracted records can be compacted safely');
  stepChallenge(g,{p1:{action:true}},1/60);
  assert.deepEqual(g.state.blocks.filter(o=>o.stacked).map(o=>o.mass),masses);
});
function clampForTest(v,a,b){return Math.max(a,Math.min(b,v));}

test('support clearance comes from the mass above each actual remaining support',()=>{
  const centered=create('tottering-tower');
  for(const b of centered.state.blocks)if(b.layer===2&&b.slot!==1)b.removed=true;
  assert.equal(towerSupport(centered.state).violation,0,'one center support can balance centered upper layers');
  const tilted=copy(centered);
  for(const b of tilted.state.blocks)if(b.layer>2)b.x+=35;
  const danger=towerSupport(tilted.state);assert.ok(danger.violation>.45);assert.ok(danger.clearance<0);assert.equal(danger.direction,1);
  for(const b of centered.state.blocks)if(b.layer===2)b.removed=true;
  assert.ok(towerSupport(centered.state).violation>=2,'no support cannot be rescued by a decorative gauge');
});

test('counterbalancing during a pull changes the shared tower lean',()=>{
  const right=create('tottering-tower');claim(right);const left=copy(right);
  run(right,.6,{p0:{action:true,right:true}});run(left,.6,{p0:{action:true,left:true}});
  assert.ok(right.players[0].balance>.9);assert.ok(left.players[0].balance<-.9);
  assert.ok(right.state.lean>left.state.lean+.05);assert.ok(Math.abs(right.state.lean)>Math.abs(left.state.lean));
});

test('tower brace drains, exhausts while held and needs release before reuse',()=>{
  const g=create('tottering-tower'),p=g.players[0];p.cooldown=0;
  run(g,4,{p0:{special:true}});assert.equal(p.braceExhausted,true);assert.equal(p.bracing,false);assert.ok(p.brace<.1);
  run(g,2,{p0:{special:true}});assert.equal(p.bracing,false);assert.ok(p.brace>.2);
  stepChallenge(g,{},1/60);assert.equal(p.braceExhausted,false);
  stepChallenge(g,{p0:{special:true}},1/60);assert.equal(p.bracing,true);
});

test('precision stacking rewards alignment while a far-edge stack changes support stress',()=>{
  const center=create('tottering-tower'),p=center.players[0];
  p.cooldown=0;p.phase='carrying';p.carried=center.state.blocks[0].id;p.carriedMass=1;p.carryTime=-1;p.stackX=0;
  center.state.blocks[0].removed=true;const edge=copy(center);edge.players[0].stackX=1.4;
  stepChallenge(center,{p0:{action:true}},1/60);stepChallenge(edge,{p0:{action:true}},1/60);
  assert.equal(center.players[0].score,12);assert.equal(center.players[0].perfectStacks,1);
  assert.equal(edge.players[0].score,8);assert.equal(edge.players[0].perfectStacks,0);
  assert.ok(edge.state.stress>center.state.stress+.5);assert.ok(edge.state.clearance<center.state.clearance);
});

test('removing the final real support topples the tower, penalizes its cause and rebuilds',()=>{
  const g=create('tottering-tower'),p=g.players[0];p.score=20;
  for(const b of g.state.blocks)if(b.layer===2&&b.slot!==1)b.removed=true;
  for(const q of g.players)q.cooldown=0;
  claim(g,p,2,1);
  for(let n=0;n<250&&g.state.phase==='playing';n++)stepChallenge(g,{p0:{action:true,up:true},p1:{special:true}},1/60);
  assert.equal(g.state.phase,'collapsing');assert.equal(g.state.culprit,'p0');assert.equal(g.state.collapses,1);
  assert.equal(p.collapses,1);assert.equal(p.score,14);assert.equal(g.players[1].score,3);assert.equal(g.players[1].saves,1);
  assert.ok(g.state.debris.length>=20);assert.ok(g.state.debris.every(d=>Number.isFinite(d.vx)&&Number.isFinite(d.vy)));
  assert.ok(g.players.every(q=>q.phase==='recovering'));run(g,1.6);
  assert.equal(g.state.phase,'playing');assert.equal(g.state.round,2);assert.equal(g.state.blocks.length,27);assert.equal(p.score,14);
  assert.equal(g.state.instability,0);assert.equal(g.state.debris.length,0);
});

test('tower gusts have an advance warning and alternate their physical direction',()=>{
  const g=create('tottering-tower');g.time=6.2;stepChallenge(g,{},1/60);
  assert.ok(g.state.warning>0);assert.equal(g.state.wind,0);
  g.time=7.1;stepChallenge(g,{},1/60);assert.ok(g.state.wind>.5);
  g.time=16.1;stepChallenge(g,{},1/60);assert.ok(g.state.wind<-.5);
});

test('both simulations replay identically across JSON peer snapshots and six-button traces',()=>{
  for(const {id} of BOARDGAME_CHALLENGES){
    const a=createChallenge(id,roster.map((p,j)=>({...p,bot:j>0})),11);let b=copy(a);
    for(let frame=0;frame<900;frame++){
      const inputs={p0:{left:frame%93<18,right:frame%93>=47&&frame%93<70,up:frame%77<22,down:frame%77>=47&&frame%77<61,action:frame%58<43,special:frame%211<21}};
      stepChallenge(a,inputs,1/60);stepChallenge(b,inputs,1/60);
      if(frame%83===0){assert.deepEqual(a,b);b=copy(b);}
    }
    assert.deepEqual(a,b);assert.deepEqual(getChallengeResults(a),getChallengeResults(b));
  }
});

test('four bots make meaningful progress, finish once and keep bounded render state',()=>{
  for(const {id,duration} of BOARDGAME_CHALLENGES){
    const g=createChallenge(id,roster.map(p=>({...p,bot:true})),5);run(g,duration+2);
    assert.equal(g.done,true);assert.equal(g.time,duration);assert.ok(g.players.every(p=>p.extractions>=5&&p.score>20));
    assert.ok(g.state.effects.length<=40);assert.deepEqual(copy(g),g);
    const scores=getChallengeResults(g);assert.equal(scores.length,4);assert.ok(scores.every((p,i)=>i===0||p.score<=scores[i-1].score));
    if(id==='clockwork-surgery')assert.ok(g.players.every(p=>p.clears>=2));
    else {assert.ok(g.players.every(p=>p.stacks>=5));assert.ok(g.state.collapses>=1);assert.ok(g.state.blocks.length<=32);assert.ok(g.state.debris.length<=48);}
    const finished=copy(g);stepChallenge(g,{p0:{action:true,special:true}},.05);assert.deepEqual(g,finished);
  }
});

test('invalid time is ignored, large deltas are bounded and finish time never overshoots',()=>{
  for(const {id,duration} of BOARDGAME_CHALLENGES){
    const g=create(id),start=copy(g);for(const dt of [0,-1,NaN,Infinity])stepChallenge(g,{},dt);assert.deepEqual(g,start);
    stepChallenge(g,{},1);assert.equal(g.time,.05);g.time=duration-.01;stepChallenge(g,{},.05);
    assert.equal(g.time,duration);assert.equal(g.done,true);
  }
});

function renderSpy(){
  const calls=[];
  const ctx=new Proxy({globalAlpha:1,measureText:text=>({width:String(text).length*7})},{get(target,key){return key in target?target[key]:(...args)=>{calls.push({kind:`ctx.${String(key)}`,args});};},set(target,key,value){target[key]=value;return true;}});
  const helpers={};
  for(const name of ['background','platform','challengePiece','challengeTable','character','fx','prop','endScene','uiFrame'])helpers[name]=(...args)=>calls.push({kind:name,args});
  return {ctx,helpers,calls};
}
test('draws use the original art helpers, large actors and one material pass without changing simulation',()=>{
  const kinds=new Set();
  for(const {id} of BOARDGAME_CHALLENGES){
    const g=create(id);if(id==='clockwork-surgery')g.players[0].steady=1;else g.players[0].bracing=true;
    const before=copy(g),{ctx,helpers,calls}=renderSpy();drawChallenge(ctx,g,helpers);assert.deepEqual(g,before);
    assert.equal(calls.filter(c=>c.kind==='background').length,1);assert.equal(calls.find(c=>c.kind==='background').args[1],id);
    assert.equal(calls.filter(c=>c.kind==='endScene').length,1);
    assert.equal(calls.filter(c=>c.kind==='character'&&c.args[4]>=80).length,4);
    if(id==='clockwork-surgery')assert.equal(calls.filter(c=>c.kind==='challengeTable').length,4);
    else assert.ok(calls.filter(c=>c.kind==='challengePiece'&&c.args[1]==='block').every(c=>c.args[5].width<=48&&c.args[5].height<=26));
    for(const call of calls.filter(c=>c.kind==='challengePiece'))kinds.add(call.args[1]);
    const end=calls.findIndex(c=>c.kind==='endScene'),hud=calls.findIndex(c=>c.kind==='uiFrame');assert.ok(hud>end);
  }
  for(const kind of ['heart','gear','bell','tweezers','block','stack','counterweight','crown'])assert.ok(kinds.has(kind));
});

test('falling tower paper changes scale with depth instead of shrinking every object uniformly',()=>{
  const g=create('tottering-tower');g.state.phase='collapsing';g.state.collapseTime=.75;
  g.state.debris=[{x:260,y:180,vx:0,vy:0,angle:.5,spin:1,life:.75,scale:1,depth:.2},{x:700,y:260,vx:0,vy:0,angle:-.7,spin:-1,life:.75,scale:1,depth:.8}];
  const {ctx,helpers,calls}=renderSpy();drawChallenge(ctx,g,helpers);
  const blocks=calls.filter(c=>c.kind==='challengePiece'&&c.args[1]==='block');
  assert.equal(blocks.length,2);assert.ok(blocks[0].args[4]<72);assert.ok(blocks[1].args[4]>72);
  assert.notEqual(blocks[0].args[5].rotation,blocks[1].args[5].rotation);
});


test('surgery sockets and pressure-narrowed channels use original paper rims without changing collision state',()=>{
 const g=create('clockwork-surgery'),p=g.players[0],organ=p.pieces[0];g.state.pressure=.6;p.carried=organ.id;
 const before=copy(g),{ctx,helpers,calls}=renderSpy();drawChallenge(ctx,g,helpers);assert.deepEqual(g,before);
 const sockets=calls.filter(call=>call.kind==='challengePiece'&&call.args[1]==='gear'&&call.args[5]?.width===66&&call.args[5]?.height===66);
 assert.equal(sockets.length,12,'Every live organ has one original printed gear rim');
 for(const actor of g.players)for(const o of actor.pieces)assert.ok(sockets.some(call=>call.args[2]===o.x&&call.args[3]===o.y+1),'Rim remains centered on its physical organ');
 const physicalWidth=organ.width*(1-g.state.pressure*.3),segments=calls.filter(call=>call.kind==='challengePiece'&&call.args[1]==='block');
 assert.equal(segments.length,organ.route.length-1,'Each physical route segment has one printed cardstock lip');
 segments.forEach((call,index)=>{const a=organ.route[index],b=organ.route[index+1],length=Math.hypot(b.x-a.x,b.y-a.y);assert.equal(call.args[2],(a.x+b.x)/2);assert.equal(call.args[3],(a.y+b.y)/2+1);assert.ok(Math.abs(call.args[5].width-(length+physicalWidth*.45))<1e-9);assert.ok(Math.abs(call.args[5].height-(physicalWidth+8))<1e-9);assert.equal(call.args[5].rotation,Math.atan2(b.y-a.y,b.x-a.x));});
 const floors=calls.filter(call=>call.kind==='ctx.fillRect');assert.equal(floors.length,segments.length);assert.ok(floors.every(call=>Math.abs(call.args[1]+physicalWidth/2)<1e-9&&Math.abs(call.args[3]-physicalWidth)<1e-9),'Inset drawing follows the pressure-narrowed physical width');
 const holes=calls.filter(call=>call.kind==='ctx.arc'&&call.args[2]===25&&call.args[3]===0&&call.args[4]===Math.PI*2);assert.equal(holes.length,12,'Pickup cavities retain their25px physical radius');
 assert.ok(!calls.some(call=>call.kind==='ctx.ellipse'&&call.args[2]===26&&call.args[3]===28),'Old flat socket ovals are gone');
 assert.equal(calls.filter(call=>call.kind==='endScene').length,1,'Printed recesses remain inside the single material pass');
});
