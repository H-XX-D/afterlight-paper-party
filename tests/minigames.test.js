import test from 'node:test';
import assert from 'node:assert/strict';
import { MINIGAMES, createGame, stepGame, getGameResults, drawGame, MINIGAME_REALMS } from '../src/minigames.js';

const players=n=>Array.from({length:n},(_,j)=>({id:`p${j}`,name:`Paper ${j+1}`,character:j,bot:false}));
const advance=(g,frames,input={})=>{for(let j=0;j<frames;j++)stepGame(g,input,1/60);return g;};
function finiteTree(value,path='state'){
  if(typeof value==='number')assert.ok(Number.isFinite(value),`${path} is finite`);
  if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))finiteTree(v,`${path}.${k}`);
}

test('catalog has twenty-four distinct games, complete rules, and bounded rounds',()=>{
  assert.equal(MINIGAMES.length,24);assert.equal(new Set(MINIGAMES.map(g=>g.id)).size,24);
  for(const d of MINIGAMES){assert.ok(d.name&&d.description&&d.instructions&&d.icon);assert.ok(d.duration>=18&&d.duration<=48);}
});

test('invalid games and unsupported party sizes fail explicitly',()=>{
  assert.throws(()=>createGame('missing',players(1)),/Unknown/);
  assert.throws(()=>createGame('sweep',[]),/1–4/);
  assert.throws(()=>createGame('sweep',players(5)),/1–4/);
});

for(const definition of MINIGAMES){
  test(`${definition.id}: deterministic four-player replay survives JSON network snapshots`,()=>{
    const a=createGame(definition.id,players(4).map((p,j)=>({...p,bot:j>1})),987654321);
    let b=JSON.parse(JSON.stringify(a));
    for(let frame=0;frame<Math.ceil(definition.duration*60)+1;frame++){
      const controls={p0:{left:frame%150<30,right:frame%150>75,up:frame%71<27,down:frame%91>60,action:frame%13===0,special:frame%211<10},p1:{left:frame%103>80,right:frame%103<35,up:frame%97<30,down:frame%143>85,action:frame%17===0,special:frame%239<15}};
      stepGame(a,controls,1/60);stepGame(b,controls,1/60);
      if(frame%127===0)b=JSON.parse(JSON.stringify(b));
    }
    assert.deepEqual(a,b);assert.ok(a.done);if(definition.id==='rift-rumble')assert.ok(a.time<=a.duration);else assert.equal(a.time,a.duration);finiteTree(a);
    const results=getGameResults(a);assert.equal(results.length,4);assert.deepEqual(new Set(results.map(r=>r.id)),new Set(players(4).map(p=>p.id)));
    for(let j=0;j<results.length;j++){assert.ok(Number.isInteger(results[j].score)&&results[j].score>=0);if(j)assert.ok(results[j-1].score>=results[j].score);}
    const frozen=JSON.stringify(a);stepGame(a,{},1/60);assert.equal(JSON.stringify(a),frozen,'completed rounds are immutable');
  });
  test(`${definition.id}: solo and two-player bots complete without invalid state`,()=>{
    for(const count of [1,2]){const g=createGame(definition.id,players(count).map(p=>({...p,bot:true})),23);advance(g,Math.ceil(g.duration*60)+1);assert.ok(g.done);finiteTree(g);assert.ok(getGameResults(g).some(r=>r.score>0),'bots engage with the objective');}
  });
}

test('movement controls affect every directional arena',()=>{
  for(const id of ['inkfall','mothlight','raft','trace','shadow']){const g=createGame(id,players(1),45),before=g.players[0].x;advance(g,12,{p0:{right:true}});assert.ok(g.players[0].x>before,`${id} moves right`);}
  const maze=createGame('maze',players(1),4);stepGame(maze,{p0:{right:true}},1/60);assert.equal(maze.players[0].cx,1);
  const red=createGame('redlight',players(1),4);advance(red,20,{p0:{up:true}});assert.ok(red.players[0].progress>0);
  const aim=createGame('gallery',players(1),4);advance(aim,20,{p0:{right:true}});assert.ok(aim.players[0].aim>.5);
});

test('jump timing clears sweep; an idle player gets clipped',()=>{
  const g=createGame('sweep',players(2),3);advance(g,79);stepGame(g,{p0:{action:true}},1/60);advance(g,22);assert.equal(g.players[0].score,10);assert.equal(g.players[1].score,0);
});

test('rhythm awards precise taps and rejects holding the key',()=>{
  const g=createGame('rhythm',players(1),4);advance(g,47);stepGame(g,{p0:{action:true}},1/60);assert.equal(g.players[0].score,5);advance(g,60,{p0:{action:true}});assert.equal(g.players[0].score,5);
});

test('red-light violations cost progress while the watcher is awake',()=>{
  const g=createGame('redlight',players(1),4);g.state.green=false;g.state.timer=1;g.players[0].progress=50;g.players[0].score=10;advance(g,20,{p0:{up:true}});assert.ok(g.players[0].progress<50);assert.ok(g.players[0].score<10);
});

test('all games render through the supplied generated-art helper contract',()=>{
  let chars=0,props=0;const gradient={addColorStop(){}};const context=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,k)=>k in target?target[k]:()=>{},set:(target,k,v)=>(target[k]=v,true)});
  for(const d of MINIGAMES){const g=createGame(d.id,players(4),72);advance(g,30);drawGame(context,g,{character(){chars++;},prop(){props++;}});}
  assert.ok(chars>=80);assert.ok(props>100);
});


test('private card hands and unrelated player fields never enter minigame snapshots',()=>{
  const privatePlayers=players(4).map(p=>({...p,hand:[{secret:'hidden-card'}],cards:['wild'],authToken:'not-game-state',nested:{secret:'private'}}));
  for(const d of MINIGAMES){const game=createGame(d.id,privatePlayers,81),snapshot=JSON.stringify(game);assert.ok(!snapshot.includes('hidden-card'),d.id);assert.ok(!snapshot.includes('not-game-state'),d.id);assert.ok(!snapshot.includes('private'),d.id);assert.equal(game.players[0].id,'p0');assert.equal(game.players[0].character,0);}
});

test('every original arcade paints its own realm without changing authoritative state',()=>{
  const gradient={addColorStop(){}};
  const context=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,k)=>k in target?target[k]:()=>{},set:(target,k,v)=>(target[k]=v,true)});
  for(const d of MINIGAMES.filter(d=>MINIGAME_REALMS[d.id])){let backdrop;const game=createGame(d.id,players(4),47);advance(game,21);const before=JSON.stringify(game);drawGame(context,game,{background:(ctx,id,time)=>{backdrop={id,time};},character(){},prop(){}});assert.deepEqual(backdrop,{id:d.id,time:game.time});assert.equal(JSON.stringify(game),before,`${d.id} rendering may not write simulation state`);assert.ok(MINIGAME_REALMS[d.id].name&&MINIGAME_REALMS[d.id].weather);}
});

test('paper-world draws use finite generated object/platform/effect geometry for all original games',()=>{
  const types=new Set(['gauge','rope','altar','star','portal','pedestal','sign','crate','crown']);
  const gradient={addColorStop(){}};
  const context=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,k)=>k in target?target[k]:()=>{},set:(target,k,v)=>(target[k]=v,true)});
  for(const d of MINIGAMES.filter(d=>MINIGAME_REALMS[d.id])){
    const game=createGame(d.id,players(4),73);advance(game,480);const before=JSON.stringify(game),calls={objects:0,platforms:0,effects:0};
    const finite=(values)=>assert.ok(values.every(Number.isFinite),`${d.id}: finite drawing coordinates`);
    drawGame(context,game,{character(){},prop(){},object(ctx,type,x,y,w,h,time){assert.ok(types.has(type),`${d.id}: supported generated ${type}`);finite([x,y,w,h,time]);assert.ok(w>0&&h>0);calls.objects++;},platform(ctx,x,y,w,depth,time){finite([x,y,w,depth,time]);assert.ok(w>0&&depth>0);calls.platforms++;},fx(ctx,type,x,y,size,time){assert.ok(['hit','dust','magic','shield'].includes(type));finite([x,y,size,time]);assert.ok(size>0);calls.effects++;}});
    assert.ok(calls.objects+calls.platforms>0,`${d.id}: physical paper objects or platforms`);
    assert.equal(JSON.stringify(game),before,`${d.id}: rendering cannot mutate the network simulation`);
  }
});

test('constellation retains physical paper stars without large vector circles',()=>{
  for(const id of ['trace']){
    const geometry=[],objects=[],platforms=[],gradient={addColorStop(){}};
    const context=new Proxy({arc:(...v)=>geometry.push(['arc',...v]),ellipse:(...v)=>geometry.push(['ellipse',...v]),createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,k)=>k in target?target[k]:()=>{},set:(target,k,v)=>(target[k]=v,true)});
    const game=createGame(id,players(4),99);advance(game,30);
    drawGame(context,game,{character(){},prop(){},platform(ctx,x,y,w,depth,time,variant){platforms.push(variant);},fx(){},object(ctx,type){objects.push(type);}});
    assert.ok(geometry.every(([type,x,y,r])=>r<30),`${id}: no large circular gauge, target, aura or ellipse arena`);
    assert.ok(objects.includes('star'),'constellation paper stars are visible');
  }
});

test('inkfall changes hazard waves and a phase dash crosses an otherwise damaging gear',()=>{
 const normal=createGame('inkfall',players(1),5);normal.state.timer=99;normal.players[0].score=20;normal.state.objects=[{x:480,y:398,speed:0,r:22,spin:0}];const dashed=structuredClone(normal);
 stepGame(normal,{},1/60);stepGame(dashed,{p0:{action:true,right:true}},1/60);assert.ok(dashed.players[0].score>normal.players[0].score+5);assert.ok(dashed.players[0].ability>2);
 dashed.time=7.1;stepGame(dashed,{},1/60);assert.equal(dashed.state.wave,1);dashed.time=14.1;stepGame(dashed,{},1/60);assert.equal(dashed.state.wave,2);
});

test('mothlight rewards banking cargo and its roaming thief steals unbanked moths',()=>{
 const g=createGame('mothlight',players(1),4),p=g.players[0];g.state.objects=[];p.x=480;p.y=403;p.carry=5;stepGame(g,{p0:{action:true}},1/60);assert.equal(p.carry,0);assert.equal(p.banked,5);assert.equal(p.score,28);
 p.carry=4;p.x=480+Math.sin((g.time+1/60)*.8)*350;p.y=260+Math.cos((g.time+1/60)*1.2)*100;stepGame(g,{},1/60);assert.equal(p.carry,1);assert.ok(p.cooldown>1);
});

test('train rules alternate jump and duck, reward streaks and schedule express passes',()=>{
 const g=createGame('sweep',players(2),8);g.state.height='high';g.state.next=.05;g.players[0].duck=true;g.players[1].jump=60;g.players[0].combo=2;stepGame(g,{p0:{down:true}},.05);assert.equal(g.players[0].score,14);assert.equal(g.players[1].score,0);
 g.state.count=2;g.state.next=g.time;stepGame(g,{p0:{down:true}},1/60);assert.equal(g.state.express,true);assert.ok(g.state.next-g.time<1);
});

test('rhythm requires the matching instrument and speeds up after each phrase',()=>{
 const g=createGame('rhythm',players(1),4),p=g.players[0];g.time=2.08;stepGame(g,{p0:{action:true}},1/60);assert.equal(p.score,0);stepGame(g,{},1/60);g.time=2.08;stepGame(g,{p0:{right:true,action:true}},1/60);assert.equal(p.track,1);assert.equal(p.score,5);
 g.time=10.76-1/60;p.prev.action=false;p.track=0;stepGame(g,{p0:{action:true}},1/60);assert.equal(p.lastBeat,16,'the sixteenth beat arrives before a constant-tempo schedule');assert.equal(p.score,10);
});

test('maze gates block a normal step while phase-step bypasses the gate and secret rune pays once',()=>{
 const g=createGame('maze',players(1),4),p=g.players[0];p.cx=2;p.cy=0;stepGame(g,{p0:{right:true}},1/60);assert.equal(p.cx,2,'gate at3,0 is closed in first phase');stepGame(g,{p0:{right:true,action:true}},1/60);assert.equal(p.cx,4);assert.ok(p.ability>3);
 p.cx=2;p.cy=5;p.walk=1;stepGame(g,{},1/60);const score=p.score;assert.equal(score,12);stepGame(g,{},1/60);assert.equal(p.score,score);
});

test('watchman cover allows crouched progress on red while sprinting on green adds an alert cost',()=>{
 const g=createGame('redlight',players(1),4),p=g.players[0];g.state.green=false;g.state.timer=3;p.lane=0;p.progress=20;advance(g,12,{p0:{up:true,down:true}});assert.ok(p.progress>20);assert.equal(p.alert,0);
 g.state.green=true;const before=p.progress;stepGame(g,{p0:{action:true}},1/60);assert.ok(p.progress>=before+12);assert.ok(p.alert>0);assert.ok(p.ability>2);
});

test('island jumps bridge unsafe space and sky shards are contested single pickups',()=>{
 const g=createGame('raft',players(2),4);g.state.safe=2;g.state.next=.8;g.state.shard=0;for(const p of g.players){p.x=120;p.score=20;}
 stepGame(g,{p0:{action:true}},1/60);assert.ok(g.players[0].jump>0);assert.ok(g.players[0].score>30);assert.ok(g.players[1].score<20);assert.ok(g.state.shardTimer>2);assert.notEqual(g.state.shard,0);
});

test('gallery armor stops taps but a charged release pierces it; couriers cost points',()=>{
 const g=createGame('gallery',players(1),4),p=g.players[0];g.time=1.9;g.state.objects=[{id:0,x:480,y:180,speed:0,respawn:0,friendly:false,marked:true,open:false}];stepGame(g,{p0:{action:true}},1/60);assert.equal(p.score,0,'closed armor absorbs tap');p.charge=.8;p.prev.action=true;stepGame(g,{},1/60);assert.ok(p.score>=12,'charge pierces armor');
 p.score=20;p.cooldown=0;p.prev={};g.state.objects=[{id:0,x:480,y:180,speed:0,respawn:0,friendly:true,marked:false,open:true}];stepGame(g,{p0:{action:true}},1/60);assert.equal(p.score,13);
});

test('constellation focus shields comet hits and spent focus requires releasing the key',()=>{
 const g=createGame('trace',players(1),4),p=g.players[0];p.score=20;p.x=400;p.y=220;p.route=Array.from({length:6},()=>({x:850,y:410}));g.state.comets=[{x:400,y:220,vx:0}];const shielded=structuredClone(g);stepGame(g,{},1/60);stepGame(shielded,{p0:{action:true}},1/60);assert.equal(g.players[0].score,15);assert.equal(shielded.players[0].score,20);assert.ok(shielded.players[0].focus<1);
 const q=shielded.players[0];q.focus=0;q.cooldown=0;stepGame(shielded,{p0:{action:true}},1/60);assert.equal(q.focusExhausted,true);stepGame(shielded,{},1/60);assert.equal(q.focusExhausted,false);
});

test('shadow relic banking removes cargo, decoys lure the keeper and mist stops pursuit',()=>{
 const g=createGame('shadow',players(1),4),p=g.players[0];p.x=480;p.y=408;p.relics=2;g.state.relics=[];stepGame(g,{p0:{down:true}},1/60);assert.equal(p.relics,0);assert.equal(p.banked,2);assert.ok(p.score>=24);
 p.x=300;p.y=330;p.prev={};stepGame(g,{p0:{down:true,action:true}},1/60);assert.equal(g.state.decoys.length,1);assert.ok(p.ability>4);
 g.state.decoys=[];p.x=185;p.y=235;const x=g.state.seeker.x,y=g.state.seeker.y;stepGame(g,{},1/60);assert.equal(g.state.seeker.x,x);assert.equal(g.state.seeker.y,y);
});

test('all evolving mechanics stay bounded and render their late-round state without mutation',()=>{
 const gradient={addColorStop(){}};const ctx=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,k)=>k in target?target[k]:()=>{},set:(target,k,v)=>(target[k]=v,true)});
 for(const d of MINIGAMES){const g=createGame(d.id,players(4).map(p=>({...p,bot:true})),823);advance(g,Math.floor(d.duration*60*.65));const before=JSON.stringify(g);drawGame(ctx,g,{character(){},prop(){},background(){}});assert.equal(JSON.stringify(g),before);const fighter=Array.isArray(g.state.platforms);assert.ok(before.length<(fighter?32768:18000),`${d.id} snapshots remain bounded: ${before.length}`);if(g.state.effects)assert.ok(g.state.effects.length<=(fighter?100:28),`${d.id} live effects are capped`);if(g.state.objective?.foes)assert.ok(g.state.objective.foes.length<=9);if(g.state.objective?.loot)assert.ok(g.state.objective.loot.length<=18);if(d.id==='gullet-gala')assert.ok(g.state.objects.length<=44);finiteTree(g);}
});

test('changing library destinations remain solvable through complete cycles',()=>{
 for(const id of ['maze']){const g=createGame(id,players(1).map(p=>({...p,bot:true})),92),seen=new Set();for(let f=0;f<g.duration*60+1;f++){const p=g.players[0];seen.add(`${p.keyTile.x},${p.keyTile.y}:${p.exitTile.x},${p.exitTile.y}`);stepGame(g,{},1/60);}assert.ok(g.players[0].level>=8,`${id}: bots complete multiple layout cycles`);assert.ok(seen.size>=3,`${id}: completed rooms change the route`);}
});


test('ten replacement slots expose new mechanics and retired games cannot be started',()=>{
 const replacements={memory:'bell-breakers',tug:'relic-launch',fishing:'hollow-horde',balance:'rift-ball',sorting:'spark-heist',reaction:'fuse-festival',potato:'gullet-gala',crates:'tower-relay',orbit:'bellows-boxing',cipher:'colossus-wake'};
 const ids=new Set(MINIGAMES.map(game=>game.id));
 for(const [retired,replacement]of Object.entries(replacements)){assert.equal(ids.has(retired),false,retired+' retired');assert.ok(ids.has(replacement),replacement+' registered');assert.throws(()=>createGame(retired,players(1)),/Unknown/);const g=createGame(replacement,players(4),21);assert.equal(g.id,replacement);if(replacement!=='gullet-gala')assert.equal(g.state.objective.kind,replacement);}
});
