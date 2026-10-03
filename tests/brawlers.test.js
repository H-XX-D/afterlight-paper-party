import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAWL_GAMES,createBrawl,stepBrawl,drawBrawl,getBrawlResults } from '../src/brawlers.js';

const roster=(count=4,bot=false)=>Array.from({length:count},(_,n)=>({id:`p${n}`,name:['Pip','Moth','Bolt','Wisp'][n],character:n,bot}));
const advance=(g,frames,controls={})=>{for(let f=0;f<frames;f++)stepBrawl(g,controls,1/60);return g;};
function finite(v,path='game'){
  if(typeof v==='number')assert.ok(Number.isFinite(v),`${path} must be finite`);
  if(v&&typeof v==='object')for(const [k,value] of Object.entries(v))finite(value,`${path}.${k}`);
}
function combatPair(id='rift-rumble'){
  const g=createBrawl(id,roster(2),13);g.players[0].x=430;g.players[0].facing=1;g.players[1].x=500;g.players[1].facing=-1;return g;
}

test('thirteen original brawlers provide complete bounded instructions and validate party size',()=>{
  assert.equal(BRAWL_GAMES.length,13);assert.equal(new Set(BRAWL_GAMES.map(g=>g.id)).size,13);
  for(const d of BRAWL_GAMES){assert.ok(d.name&&d.tag&&d.description&&d.instructions&&d.icon);assert.ok(d.duration<=48);assert.ok(d.instructions.includes('↑'));assert.ok(createBrawl(d.id,roster()).state.platforms.length>=4);}
  assert.throws(()=>createBrawl('missing',roster()),/Unknown/);
  assert.throws(()=>createBrawl('rift-rumble',[]),/1–4/);
  assert.throws(()=>createBrawl('rift-rumble',roster(5)),/1–4/);
});

for(const definition of BRAWL_GAMES){
  test(`${definition.id}: deterministic four-player battle survives JSON snapshots`,()=>{
    const a=createBrawl(definition.id,roster().map((p,n)=>({...p,bot:n>1})),123456),b=JSON.parse(JSON.stringify(a));
    for(let frame=0;frame<Math.ceil(a.duration*60)+1;frame++){
      const controls={p0:{left:frame%117<23,right:frame%117>60,up:frame%67===0,down:frame%101>78,action:frame%17<9},p1:{left:frame%135>70,right:frame%135<30,up:frame%83===0,down:frame%91>70,action:frame%19>5}};
      stepBrawl(a,controls,1/60);stepBrawl(b,controls,1/60);
      if(frame%157===0)Object.assign(b,JSON.parse(JSON.stringify(b)));
    }
    assert.deepEqual(a,b);assert.ok(a.done);assert.ok(a.time<=a.duration);finite(a);
    const scores=getBrawlResults(a);assert.equal(scores.length,4);assert.deepEqual(new Set(scores.map(p=>p.id)),new Set(roster().map(p=>p.id)));for(const p of scores)assert.ok(Number.isInteger(p.score)&&p.score>=0);
    const before=JSON.stringify(a);stepBrawl(a,{p0:{action:true,up:true}},1/60);assert.equal(JSON.stringify(a),before);
  });
  test(`${definition.id}: bots reach the objective without leaking card data`,()=>{
    const inputs=roster(4,true).map(p=>({...p,hand:[{color:'red',value:'wild-secret'}],secret:'private',drawPile:['secret-card']}));
    const g=createBrawl(definition.id,inputs,323);advance(g,Math.ceil(g.duration*60)+1);finite(g);
    const encoded=JSON.stringify(g);assert.ok(!encoded.includes('wild-secret'));assert.ok(!encoded.includes('private'));assert.ok(!encoded.includes('drawPile'));
    assert.ok(g.state.attacks>0,'bots use their strikes');assert.ok(getBrawlResults(g).some(p=>p.score>0),'bots make scoring progress');
    if(definition.id==='crown-clash'||definition.id==='spire-kings')assert.ok(g.players.some(p=>p.held>0),'bots reach the elevated objective');
  });
}

test('horizontal movement is continuous and running off an edge causes a real fall',()=>{
  const g=createBrawl('rift-rumble',roster(1),1),p=g.players[0],start=p.x;
  advance(g,12,{p0:{right:true}});assert.ok(p.x>start+20);assert.equal(p.y,430);
  advance(g,140,{p0:{right:true}});assert.ok(p.deaths>=1);assert.ok(g.state.ringouts>=1);
});

test('jump input edges allow exactly two jumps and holding cannot auto-jump',()=>{
  const g=createBrawl('rift-rumble',roster(1),1),p=g.players[0];
  stepBrawl(g,{p0:{up:true}},1/60);assert.equal(p.jumps,1);assert.ok(p.vy<0);
  advance(g,8,{p0:{up:true}});assert.equal(p.jumps,1);
  stepBrawl(g,{},1/60);stepBrawl(g,{p0:{up:true}},1/60);assert.equal(p.jumps,2);assert.ok(p.vy<-400);
  stepBrawl(g,{},1/60);const velocity=p.vy;stepBrawl(g,{p0:{up:true}},1/60);assert.equal(p.jumps,2);assert.ok(p.vy>velocity,'third press does not restore upward velocity');
});

test('one-way platforms catch descending feet and allow ascent through the underside',()=>{
  const g=createBrawl('rift-rumble',roster(1),1),p=g.players[0],b=g.state.platforms[1];
  p.x=b.x+b.w/2;p.y=b.y-2;p.vy=250;p.ground=-1;p.jumps=2;
  stepBrawl(g,{},1/60);assert.equal(p.y,b.y);assert.equal(p.vy,0);assert.equal(p.ground,b.id);assert.equal(p.jumps,0);
  p.y=b.y+5;p.vy=-200;p.ground=-1;p.jumps=1;
  stepBrawl(g,{},1/60);assert.ok(p.y<b.y+5);assert.ok(p.vy<0);assert.equal(p.ground,-1);
  p.x=b.x-40;p.y=b.y-1;p.vy=250;stepBrawl(g,{},1/60);assert.ok(p.y>b.y,'outside platform does not collide');
});

test('strike has a forward hurtbox, hits once per swing, and needs cooldown',()=>{
  const g=combatPair(),[a,b]=g.players;
  stepBrawl(g,{p0:{action:true}},1/60);assert.equal(b.damage,12);assert.ok(b.vx>0);assert.equal(a.hitIds.length,1);assert.equal(g.state.attacks,1);
  for(let n=0;n<6;n++){b.x=a.x+70;b.y=a.y;b.vx=0;b.vy=0;stepBrawl(g,{p0:{action:true}},1/60);}
  assert.equal(b.damage,12,'same swing cannot farm damage');assert.equal(g.state.attacks,1);
  const behind=combatPair();behind.players[1].x=behind.players[0].x-65;stepBrawl(behind,{p0:{action:true}},1/60);assert.equal(behind.players[1].damage,0,'no hit behind the attacker');
  const far=combatPair();far.players[1].x=far.players[0].x+180;stepBrawl(far,{p0:{action:true}},1/60);assert.equal(far.players[1].damage,0,'no hit outside reach');
  const high=combatPair();high.players[1].y-=100;stepBrawl(high,{p0:{action:true}},1/60);assert.equal(high.players[1].damage,0,'vertical separation matters');
  advance(g,30,{p0:{action:true}});assert.ok(g.state.attacks>=2,'holding continues attacks only after cooldown');
});

test('damage increases launch force and shielding absorbs damage and knockback',()=>{
  const low=combatPair(),high=combatPair(),guard=combatPair();high.players[1].damage=140;
  advance(guard,10,{p1:{down:true}}); // Hold beyond the fresh-press parry window to test normal guarding.
  stepBrawl(low,{p0:{action:true}},1/60);stepBrawl(high,{p0:{action:true}},1/60);stepBrawl(guard,{p0:{action:true},p1:{down:true}},1/60);
  assert.ok(high.players[1].vx>low.players[1].vx*2);assert.ok(Math.abs(high.players[1].vy)>Math.abs(low.players[1].vy));
  assert.ok(guard.players[1].damage<low.players[1].damage*.25);assert.ok(guard.players[1].vx<low.players[1].vx*.25);assert.ok(guard.players[1].shield<80);
  const p=guard.players[1];p.stun=0;p.shield=2.1;stepBrawl(guard,{p1:{down:true}},1/60);assert.ok(p.shieldLock>0);assert.equal(p.shielding,false);
  advance(guard,80);assert.ok(p.shield>20,'guard regenerates while released');
});

test('ringouts credit the latest attacker, consume a stock, and respawn with invulnerability',()=>{
  const g=combatPair(),[a,b]=g.players;stepBrawl(g,{p0:{action:true}},1/60);
  b.x=1030;stepBrawl(g,{},1/60);assert.equal(b.stocks,1);assert.equal(b.deaths,1);assert.equal(a.kos,1);assert.ok(b.respawn>0);
  advance(g,56);assert.equal(b.respawn,0);assert.equal(b.damage,0);assert.ok(b.invuln>0);
  a.x=b.x-65;a.y=b.y;a.facing=1;a.cooldown=0;stepBrawl(g,{p0:{action:true}},1/60);assert.equal(b.damage,0,'respawn prevents immediate spawn hits');
  b.x=-100;stepBrawl(g,{},1/60);assert.equal(b.stocks,0);assert.equal(b.eliminated,true);assert.equal(g.done,true);assert.equal(getBrawlResults(g)[0].id,a.id);
});

test('old hits do not earn stale knockout credit',()=>{
  const g=combatPair(),[a,b]=g.players;b.lastHit=a.id;b.lastHitAt=-10;b.x=1100;stepBrawl(g,{},1/60);assert.equal(a.kos,0);assert.equal(b.deaths,1);
});

test('a surviving stock always outranks damage farming by an eliminated opponent',()=>{
  const g=combatPair(),[a,b]=g.players;a.stocks=1;a.kos=0;a.score=0;a.damageDealt=0;b.stocks=0;b.kos=6;b.score=900;b.damageDealt=9000;
  assert.equal(getBrawlResults(g)[0].id,a.id);
  b.stocks=1;b.kos=1;assert.equal(getBrawlResults(g)[0].id,b.id,'KO count resolves equal lives');
});

test('the crown is acquired by contact, scores while held, and drops on a clean strike',()=>{
  const g=combatPair('crown-clash'),[a,b]=g.players,c=g.state.crown;c.x=b.x;c.y=b.y-40;c.vy=0;
  stepBrawl(g,{},1/60);assert.equal(c.holder,b.id);advance(g,12);assert.ok(b.held>.15);assert.ok(b.score>1.5);
  a.x=b.x-70;a.y=b.y;a.facing=1;a.cooldown=0;stepBrawl(g,{p0:{action:true}},1/60);assert.equal(c.holder,null);assert.ok(c.lock>0);
  assert.ok(c.vy<0);finite(c);
});

test('spire control requires the elevated seal and stops while contested',()=>{
  const g=createBrawl('spire-kings',roster(2),1),[a,b]=g.players,top=g.state.platforms[3];a.x=480;a.y=top.y;a.ground=top.id;
  advance(g,10);assert.equal(g.state.controller,a.id);assert.ok(a.held>.15);assert.ok(a.score>1.9);
  b.x=510;b.y=top.y;b.ground=top.id;const before=a.held;advance(g,10);assert.equal(g.state.controller,null);assert.equal(g.state.contested,true);assert.equal(a.held,before);
  a.y=430;b.y=430;advance(g,1);assert.equal(g.state.controller,null,'standing beneath the seal does not score');
});

test('meteors warn before moving, inflict real damage, and award survival points',()=>{
  const g=createBrawl('meteor-melee',roster(1),8),p=g.players[0];g.state.nextMeteor=0;stepBrawl(g,{},1/60);
  const m=g.state.meteors[0];assert.ok(m.warning>0);assert.equal(m.y,-70);assert.equal(p.damage,0);
  m.warning=0;m.x=p.x;m.y=p.y-54;m.vy=400;stepBrawl(g,{},1/60);assert.equal(p.damage,19);assert.ok(p.vx!==0);assert.ok(p.score>0);
  m.x=p.x;m.y=p.y-54;stepBrawl(g,{},1/60);assert.equal(p.damage,19,'one meteor hits each player once');
});

test('invalid time steps cannot corrupt or advance state, and huge steps are bounded',()=>{
  const g=combatPair(),before=JSON.stringify(g);for(const dt of [NaN,Infinity,-1,0])stepBrawl(g,{},dt);assert.equal(JSON.stringify(g),before);
  stepBrawl(g,{},1000);assert.equal(g.time,.05);finite(g);
});

test('all thirteen render with unique generated backgrounds and animated cutout helpers',()=>{
  const scenes=[],characters=[],props=[];const gradient={addColorStop(){}};
  const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  for(const d of BRAWL_GAMES){const g=createBrawl(d.id,roster(4,true),4);advance(g,130);drawBrawl(ctx,g,{background(c,id,t){scenes.push(id);assert.ok(t>0);},character(c,p,x,y,size){characters.push(size);assert.equal(typeof p.id,'string');assert.ok(Number.isFinite(x)&&Number.isFinite(y));},prop(c,name){props.push(name);}});}
  assert.deepEqual(scenes,BRAWL_GAMES.map(g=>g.id));assert.ok(characters.filter(size=>size===72).length>=12);assert.ok(props.includes('flag'));
});

test('uppercut uses an upward hurtbox and vertical launch rather than a forward slash',()=>{
  const g=combatPair(),[a,b]=g.players;a.x=470;b.x=480;b.y=350;b.ground=-1;
  stepBrawl(g,{p0:{up:true,action:true}},1/60);
  assert.equal(a.move,'uppercut');assert.equal(a.moveUses.uppercut,1);assert.equal(b.damage,16);assert.ok(b.vy<-360);assert.ok(Math.abs(b.vy)>Math.abs(b.vx)*2);
  const miss=combatPair();miss.players[1].x=530;miss.players[1].y=345;stepBrawl(miss,{p0:{up:true,action:true}},1/60);assert.equal(miss.players[1].damage,0,'uppercut has a narrower horizontal reach');
});

test('aerial spin hits either side, while a dive drives a lower target downward',()=>{
  const spin=combatPair(),[a,b]=spin.players;a.y=320;a.ground=-1;b.x=a.x-60;b.y=320;b.ground=-1;
  stepBrawl(spin,{p0:{action:true}},1/60);assert.equal(a.move,'spin');assert.equal(b.damage,10);assert.ok(b.vx<0,'spin launches an opponent on the left to the left');
  const dive=combatPair(),[c,d]=dive.players;c.x=470;c.y=275;c.ground=-1;d.x=480;d.y=340;d.ground=-1;
  stepBrawl(dive,{p0:{down:true,action:true}},1/60);assert.equal(c.move,'dive');assert.equal(c.shielding,false);assert.equal(d.damage,17);assert.ok(d.vy>380);assert.ok(c.vy>430);
  c.x=480;c.y=429;c.vy=400;c.attack=.2;stepBrawl(dive,{},1/60);assert.equal(c.ground,0);assert.equal(c.attack,0,'a dive ends on landing instead of hitting through the floor');
});

test('a fresh guard parries once, cancels the attacker, and rewards precise timing',()=>{
  const g=combatPair(),[a,b]=g.players;stepBrawl(g,{p0:{action:true},p1:{down:true}},1/60);
  assert.equal(b.damage,0);assert.equal(b.parries,1);assert.equal(g.state.parries,1);assert.equal(a.attack,0);assert.ok(a.stun>=.3);assert.equal(b.score,3);assert.equal(b.parryWindow,0);
  const held=combatPair();advance(held,10,{p1:{down:true}});stepBrawl(held,{p0:{action:true},p1:{down:true}},1/60);assert.equal(held.players[1].parries,0);assert.ok(held.players[1].damage>0,'holding a shield does not repeatedly parry');
  const cooldown=combatPair();stepBrawl(cooldown,{p1:{down:true}},1/60);stepBrawl(cooldown,{},1/60);stepBrawl(cooldown,{p1:{down:true},p0:{action:true}},1/60);assert.equal(cooldown.players[1].parries,0,'rapid guard taps cannot restart the cooldown window');
});

test('perfect guarding can reflect a meteor for points without damage',()=>{
  const g=createBrawl('meteor-melee',roster(1),9),p=g.players[0];g.state.nextMeteor=10;g.state.meteors.push({x:p.x,y:p.y-54,warning:0,vy:400,spin:0,hitIds:[],spent:false});
  stepBrawl(g,{p0:{down:true}},1/60);assert.equal(p.damage,0);assert.equal(p.parries,1);assert.ok(p.score>=6);assert.equal(g.state.meteors.length,0);
});

test('the drifting rift ledge carries a grounded rider and gusts warn before pushing',()=>{
  const g=createBrawl('rift-rumble',roster(1),5),p=g.players[0],top=g.state.platforms[3];p.x=480;p.y=top.y;p.ground=3;
  const startX=p.x,startPlatform=top.x;advance(g,20);assert.ok(top.x>startPlatform);assert.ok(Math.abs((p.x-startX)-(top.x-startPlatform))<.001);assert.equal(p.ground,3);
  g.time=5;stepBrawl(g,{},1/60);assert.equal(g.state.arenaPhase,'rift-warning');assert.equal(g.state.wind,0);assert.ok(g.state.arenaWarning>0);
  const blown=createBrawl('rift-rumble',roster(1),1);blown.time=6.2;const braced=JSON.parse(JSON.stringify(blown));advance(blown,10);advance(braced,10,{p0:{down:true}});
  assert.equal(blown.state.arenaPhase,'rift-gust');assert.ok(blown.players[0].vx>0);assert.ok(braced.players[0].vx<blown.players[0].vx*.2,'guarding braces against the announced wind');
});

test('crown elevators carry their riders and final fever doubles possession scoring',()=>{
  const g=createBrawl('crown-clash',roster(1),5),p=g.players[0],left=g.state.platforms[1];p.x=280;p.y=left.y;p.ground=1;const start=p.y;advance(g,15);
  assert.notEqual(left.y,320);assert.equal(p.y,left.y);assert.notEqual(p.y,start);
  const normal=createBrawl('crown-clash',roster(1),5);normal.state.crown.holder='p0';normal.time=31;const fever=JSON.parse(JSON.stringify(normal));fever.time=34;
  advance(normal,30);advance(fever,30);assert.equal(fever.state.crownBonus,true);assert.ok(Math.abs(fever.players[0].score-normal.players[0].score*2)<1e-8);
});

test('meteor impact leaves a contested healing ember that can be collected only once',()=>{
  const g=createBrawl('meteor-melee',roster(2),5),[a,b]=g.players;g.state.nextMeteor=10;g.state.meteors.push({x:480,y:429,warning:0,vy:400,spin:0,hitIds:[],spent:false});stepBrawl(g,{},1/60);
  assert.equal(g.state.embers.length,1);assert.equal(g.state.meteors.length,0);
  a.x=480;a.y=430;a.damage=40;b.x=480;b.y=430;b.damage=40;stepBrawl(g,{},1/60);
  assert.equal(a.damage,26);assert.equal(a.embers,1);assert.equal(b.damage,40);assert.equal(b.embers,0);assert.equal(g.state.embers.length,0);
});

test('meteor storm phases are announced and increase the spawn rate only when active',()=>{
  const g=createBrawl('meteor-melee',roster(1),5);g.time=7;g.state.nextMeteor=10;stepBrawl(g,{},1/60);assert.equal(g.state.arenaPhase,'storm-warning');assert.equal(g.state.storm,false);
  g.time=8.1;g.state.nextMeteor=0;stepBrawl(g,{},1/60);assert.equal(g.state.storm,true);assert.equal(g.state.arenaPhase,'meteor-storm');assert.equal(g.state.nextMeteor,.32);assert.ok(g.state.meteors.every(m=>m.warning>0),'storm meteors retain their individual warnings');
});

test('the spire seal announces its destination then transfers scoring to that balcony',()=>{
  const g=createBrawl('spire-kings',roster(2),5),[a,b]=g.players;g.time=9;a.x=480;a.y=215;a.ground=3;b.x=300;b.y=322;b.ground=1;
  stepBrawl(g,{},1/60);assert.equal(g.state.arenaPhase,'seal-warning');assert.equal(g.state.controlPlatform,3);assert.equal(g.state.nextControlPlatform,1);assert.equal(g.state.controller,a.id);
  const old=a.held;g.time=10;stepBrawl(g,{},1/60);assert.equal(g.state.controlPlatform,1);assert.equal(g.state.controller,b.id);assert.equal(a.held,old);assert.ok(b.held>0);
});

test('bots use varied attacks, timed guards, moving objectives, and finite late-phase state',()=>{
  const uses=new Set();let parries=0,embers=0;
  const gradient={addColorStop(){}};const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  for(const d of BRAWL_GAMES){const g=createBrawl(d.id,roster(4,true),323);for(let f=0;f<Math.ceil(g.duration*60)+1;f++){stepBrawl(g,{},1/60);if(f%180===0){const before=JSON.stringify(g);drawBrawl(ctx,g,{background(){},character(){},prop(){}});assert.equal(JSON.stringify(g),before);}}
    for(const p of g.players){for(const [move,count] of Object.entries(p.moveUses))if(count>0)uses.add(move);parries+=p.parries;embers+=p.embers;}finite(g);assert.deepEqual(g,JSON.parse(JSON.stringify(g)),'no undefined actor fields');
  }
  assert.deepEqual(uses,new Set(['slash','uppercut','spin','dive']));assert.ok(parries>0,'bots use the precise guard window');assert.ok(embers>0,'bots collect meteor embers');
});
