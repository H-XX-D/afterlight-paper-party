import test from 'node:test';
import assert from 'node:assert/strict';
import {BRAWL_GAMES,SPECIALS,createBrawl,stepBrawl,drawBrawl,getBrawlResults} from '../src/brawlers.js';
const roster=(n=2,bot=false,start=0)=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'Paper '+i,character:(start+i)%8,bot,hand:['secret-card']}));
const tick=(g,n=1,inputs={})=>{for(let i=0;i<n;i++)stepBrawl(g,inputs,1/60);return g;};
const fresh=(id,n=2)=>createBrawl(id,roster(n),42);
const place=(p,x,y=430)=>Object.assign(p,{x,y,vx:0,vy:0,ground:y===430?0:-1,invuln:0,stun:0,cooldown:0,attack:0,specialAnimation:'',prev:{}});
const readyHit=(p,x,y,move='slash')=>Object.assign(p,{x,y:y+36,vx:0,vy:0,ground:-1,move,attack:.2,cooldown:1,hitIds:[],specialAnimation:'',stun:0});
const centerTarget=(g,n=0)=>{const t=g.state.objective.targets[n];t.baseX=480;t.baseY=360;t.phase=-g.time*.85;return t;};

test('nine objective rules preserve original four slots and describe distinct goals',()=>{
 assert.deepEqual(BRAWL_GAMES.slice(0,4).map(g=>g.id),['rift-rumble','crown-clash','meteor-melee','spire-kings']);
 const defs=BRAWL_GAMES.slice(4);assert.equal(defs.length,9);assert.equal(new Set(defs.map(d=>d.tag)).size,9);for(const d of defs){assert.ok(d.instructions.includes('X special'));assert.ok(d.duration>=40&&d.duration<=48);assert.ok(fresh(d.id).state.objective);}
});
test('bells require real directional hits, gold takes two slashes, and combos scale scoring',()=>{
 const g=fresh('bell-breakers',1),p=g.players[0],t=centerTarget(g);t.gold=true;t.hp=2;for(const other of g.state.objective.targets)if(other!==t)other.respawn=100;
 readyHit(p,420,360);tick(g);assert.equal(t.hp,1);assert.equal(p.objective.breaks,0);
 readyHit(p,420,360);tick(g);assert.equal(p.objective.breaks,1);assert.equal(p.score,32);assert.ok(t.respawn>0);
 const next=centerTarget(g,1);next.gold=false;next.hp=1;next.respawn=0;readyHit(p,420,360);tick(g);assert.equal(p.objective.combo,2);assert.equal(p.score,52);
 const old=p.objective.breaks;tick(g,4);assert.equal(p.objective.breaks,old,'same swing cannot farm a target');
});
test('relic trial charges without flight, launches only in launch phase and measures physical distance',()=>{
 const g=fresh('relic-launch',1),p=g.players[0],d=g.state.objective.dummies[0];
 place(p,d.x-50);tick(g,1,{p0:{action:true}});assert.equal(d.damage,12);assert.equal(d.launched,false);
 g.time=7.1;place(p,d.x-50);tick(g,1,{p0:{action:true}});assert.equal(d.launched,true);const x=d.x;tick(g,50);assert.ok(d.x>x+200);assert.ok(d.distance>200);
 tick(g,120);assert.equal(p.objective.launches,1);assert.ok(p.objective.best>200);assert.ok(p.score>50);
 g.time=11;tick(g);assert.equal(g.state.objective.round,1);assert.equal(d.damage,0);assert.equal(d.launched,false);assert.equal(d.x,d.origin);
});
test('relic damage and high launch change the trajectory, every player owns a separate relic',()=>{
 const a=fresh('relic-launch',2),b=JSON.parse(JSON.stringify(a));a.time=b.time=7.2;const da=a.state.objective.dummies[0],db=b.state.objective.dummies[0];da.damage=12;db.damage=120;
 place(a.players[0],da.x-45);place(b.players[0],db.x-45);tick(a,1,{p0:{action:true}});tick(b,1,{p0:{action:true}});assert.ok(db.vx>da.vx*2);assert.ok(db.vy<da.vy);assert.equal(a.state.objective.dummies[1].damage,0);
});
test('horde foes warn before striking and actual strikes award foe knockouts',()=>{
 const g=fresh('hollow-horde',1),p=g.players[0];tick(g);const o=g.state.objective,f=o.foes[0];assert.equal(o.wave,1);assert.ok(o.foes.length>=3);assert.ok(f.spawn>0);
 o.foes=[f];Object.assign(f,{x:500,y:430,hp:10,spawn:0,stun:0,warning:0,cooldown:0});place(p,435);tick(g,1,{p0:{action:true}});assert.equal(p.objective.kills,1);assert.equal(o.defeated,1);assert.equal(o.foes.length,0);assert.ok(p.score>=22);
 g.time=8;tick(g);assert.equal(o.wave,2);assert.ok(o.foes.length>3);
});
test('perfect guard turns a warned horde strike into a credited knockout',()=>{
 const g=fresh('hollow-horde',1),p=g.players[0];tick(g);const o=g.state.objective,f=o.foes[0];o.foes=[f];Object.assign(f,{x:500,y:430,hp:20,spawn:0,stun:0,warning:.001,cooldown:0});place(p,450);tick(g,1,{p0:{down:true}});assert.equal(p.damage,0);assert.equal(p.parries,1);assert.equal(p.objective.kills,1);assert.equal(o.foes.length,0);
});
test('physical moon uses launch angle, last-touch goals and late double scoring',()=>{
 const g=fresh('rift-ball',1),p=g.players[0],b=g.state.objective.ball;Object.assign(b,{x:500,y:390});place(p,430);tick(g,1,{p0:{action:true}});assert.equal(b.lastTouch,p.id);assert.ok(b.vx>500);assert.ok(b.vy<0);
 Object.assign(b,{x:860,y:385,vx:150,vy:0});tick(g);assert.equal(p.objective.goals,1);assert.ok(p.score>=35);const score=p.score;
 g.time=34;b.reset=0;Object.assign(b,{x:860,y:385,vx:150,vy:0,lastTouch:p.id});tick(g);assert.equal(p.objective.goals,2);assert.equal(p.score-score,70);
});
test('moon parry reflects its physical velocity and changes goal attribution',()=>{
 const g=fresh('rift-ball',2),p=g.players[0],b=g.state.objective.ball;place(p,430);Object.assign(b,{x:456,y:391,vx:-400,vy:0,lock:0,lastTouch:'p1'});tick(g,1,{p0:{down:true}});assert.equal(b.lastTouch,p.id);assert.ok(b.vx>700);assert.equal(p.parries,1);
});
test('sparks spill on a clean hit, survive a shield and score only on the active bank',()=>{
 const g=fresh('spark-heist'),[a,b]=g.players,o=g.state.objective;place(a,430);place(b,500);b.objective.carried=5;const loose=o.loot.length;tick(g,1,{p0:{action:true}});assert.equal(b.objective.carried,2);assert.ok(o.loot.length>=loose+3);
 b.objective.carried=4;o.loot=[];o.nextSpawn=100;const bank=g.state.platforms[o.bank];place(b,bank.x+bank.w/2,bank.y);b.ground=bank.id;place(a,750);tick(g,29);assert.equal(b.objective.banked,4);assert.equal(b.objective.carried,0);assert.ok(b.score>=68);
 const protectedGame=fresh('spark-heist'),[c,d]=protectedGame.players;protectedGame.state.objective.loot=[];protectedGame.state.objective.nextSpawn=100;place(c,430);place(d,500);d.objective.carried=4;tick(protectedGame,1,{p0:{action:true},p1:{down:true}});assert.equal(d.objective.carried,4);
 g.time=10;tick(g);assert.equal(o.bank,2);
});
test('fuse passes on contact strike without resetting its countdown and explodes once',()=>{
 const g=fresh('fuse-festival'),[a,b]=g.players,bomb=g.state.objective.bomb;place(a,430);place(b,500);Object.assign(bomb,{holder:a.id,x:a.x,y:a.y-70,fuse:3,lock:0});tick(g,1,{p0:{action:true}});assert.equal(bomb.holder,b.id);assert.ok(bomb.fuse<3);assert.equal(a.objective.passes,1);
 place(a,200);place(b,500);Object.assign(bomb,{x:500,y:390,holder:b.id,fuse:.001,lock:0});tick(g);assert.ok(g.state.objective.explosion.life>0);assert.ok(bomb.reset>0);assert.ok(b.damage>0);assert.equal(a.objective.survived,1);const score=a.score;tick(g,10);assert.equal(a.score,score,'blast cannot score every frame');
});
test('relay awards ordered contacts and complete-circuit bonuses on moving platforms',()=>{
 const g=fresh('tower-relay',1),p=g.players[0],o=g.state.objective;for(const id of o.order){const b=g.state.platforms[id];place(p,b.x+b.w/2,b.y);p.ground=id;tick(g);}assert.equal(p.objective.checkpoints,4);assert.equal(p.objective.laps,1);assert.equal(p.score,115);const old=g.state.platforms[3].x;tick(g,20);assert.notEqual(g.state.platforms[3].x,old);
});
test('boss rejects armored hits, warns before a floor slam, then opens a scored weakpoint',()=>{
 const g=fresh('colossus-wake',1),p=g.players[0],b=g.state.objective.boss;tick(g);readyHit(p,b.x-50,b.y);tick(g);assert.equal(b.hp,320);assert.equal(p.objective.bossDamage,0);
 g.time=2.95;place(p,480);tick(g);assert.equal(g.state.objective.phase,'slam warning');assert.equal(p.damage,0);tick(g,4);assert.ok(p.damage>0);
 g.time=4;tick(g);readyHit(p,b.x-50,b.y);tick(g);assert.equal(p.objective.bossDamage,12);assert.equal(b.hp,308);assert.ok(p.score>=24);
});
test('boxing winds up before contact, head pops reset pressure and the ring tightens',()=>{
 const g=fresh('bellows-boxing'),[a,b]=g.players;place(a,430);place(b,500);b.objective.pressure=70;tick(g,1,{p0:{action:true}});assert.equal(b.damage,0);assert.ok(a.objective.punchWindup>0);tick(g,20);assert.equal(a.objective.headpops,1);assert.equal(b.objective.pressure,0);assert.equal(b.damage,0);assert.ok(b.objective.popped>0);assert.ok(a.score>=35);
 const width=g.state.platforms[0].w;g.time=16;tick(g);assert.ok(g.state.platforms[0].w<width);assert.equal(g.state.objective.phase,'heavy bell');
});
for(const def of BRAWL_GAMES.slice(4))test(def.id+': bots accomplish its objective, independent of incidental combat points',()=>{
 const g=createBrawl(def.id,roster(4,true),323);tick(g,Math.ceil(g.duration*60)+1);const key={'bell-breakers':'breaks','relic-launch':'launches','hollow-horde':'kills','rift-ball':'goals','spark-heist':'banked','fuse-festival':'survived','tower-relay':'checkpoints','colossus-wake':'bossDamage','bellows-boxing':'headpops'}[def.id];assert.ok(g.players.some(p=>p.objective[key]>0),key+' must advance');assert.ok(g.state.effects.length<=100);if(g.state.objective.foes)assert.ok(g.state.objective.foes.length<=9);if(g.state.objective.loot)assert.ok(g.state.objective.loot.length<=18);assert.ok(!JSON.stringify(g).includes('secret-card'));assert.deepEqual(g,JSON.parse(JSON.stringify(g)));
});
for(let character=0;character<8;character++)test('character '+character+': '+SPECIALS[character].id+' telegraphs, hits once, animates and cools down',()=>{
 const g=createBrawl('crown-clash',[{id:'p0',character},{id:'p1',character:0}],11),[a,b]=g.players;place(a,400);place(b,460);a.facing=1;tick(g,1,{p0:{special:true}});assert.equal(a.specialAnimation,'windup');assert.equal(b.damage,0);assert.ok(a.specialCooldown>0);assert.equal(a.specialUses,1);
 let hit=false,phases=new Set([a.specialAnimation]);for(let n=0;n<100;n++){tick(g,1,{p0:{special:true}});phases.add(a.specialAnimation);if(b.damage>0)hit=true;}
 assert.ok(hit,'special must connect');assert.ok(phases.has('active'));assert.ok(phases.has('recovery'));assert.ok(phases.has(''));assert.equal(a.specialUses,1);assert.ok(b.damage<=SPECIALS[character].damage+.001,'one special activation cannot farm repeated hits');assert.ok(a.specialCharge>0&&a.specialCharge<1);
});
test('special kits have distinct displacement, launch, pull, projectile, blink and slow effects',()=>{
 const states=[];for(let character=0;character<8;character++){const g=createBrawl('crown-clash',[{id:'p0',character},{id:'p1',character:0}],1);place(g.players[0],400);place(g.players[1],460);tick(g,50,{p0:{special:true}});states.push(g);}
 assert.ok(states[0].players[0].x>470,'courier dash moves actor');assert.ok(states[1].players[1].y<360,'wing lifts rival');assert.ok(states[2].players[1].damage>=24,'magnet detonates');assert.ok(states[3].players[0].specialX>650,'lantern travels beyond actor');assert.ok(states[4].players[1].damage>=27,'slam is heavy');assert.ok(states[5].players[1].slow>0,'thorn grasps');assert.ok(states[6].players[0].x>=550,'ink blinks');assert.ok(states[7].players[1].slow>1.7,'frost has longer slow');
});
test('special windup is interruptible and fresh guard parries an active special',()=>{
 const g=createBrawl('crown-clash',[{id:'p0',character:2},{id:'p1',character:0}],1),[a,b]=g.players;place(a,430);place(b,500);b.facing=-1;tick(g,1,{p0:{special:true}});tick(g,1,{p1:{action:true}});tick(g);assert.equal(a.specialAnimation,'recovery');assert.ok(a.specialCooldown>5);
 const parry=createBrawl('crown-clash',[{id:'p0',character:4},{id:'p1',character:0}],1),[c,d]=parry.players;place(c,430);place(d,500);tick(parry,20,{p0:{special:true}});tick(parry,4,{p1:{down:true}});assert.equal(d.damage,0);assert.equal(d.parries,1);assert.equal(c.specialAnimation,'recovery');
});
test('new roster and special input survive JSON replay without private board fields',()=>{
 const a=createBrawl('rift-ball',roster(4,false,4),924),b=JSON.parse(JSON.stringify(a));for(let f=0;f<1200;f++){const inputs=Object.fromEntries(a.players.map((p,n)=>[p.id,{left:f%140<30,right:f%140>90,up:f%67===n,special:f%320<2,action:f%15<8,down:f%101>90}]));stepBrawl(a,inputs,1/60);stepBrawl(b,inputs,1/60);if(f%123===0)Object.assign(b,JSON.parse(JSON.stringify(b)));}assert.deepEqual(a,b);assert.deepEqual(a.players.map(p=>p.character),[4,5,6,7]);assert.ok(!JSON.stringify(a).includes('secret-card'));assert.ok(a.players.every(p=>p.specialUses>0));
});
test('objective art helpers and special animation reach the renderer before HUD resolution',()=>{
 const events=[],kinds=new Set(),gradient={addColorStop(){}};const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 for(const def of BRAWL_GAMES.slice(4)){const g=createBrawl(def.id,roster(4,true,4),7);tick(g,180);if(def.id==='rift-ball')g.state.objective.ball.reset=0;const before=JSON.stringify(g);drawBrawl(ctx,g,{background(){},platform(){},objective(c,kind,x,y,size){assert.ok(Number.isFinite(x+y+size));events.push('object');kinds.add(kind);},character(c,p,x,y,size,opt){if(size>=84)assert.ok('specialAnimation' in opt);},fx(){},endScene(){events.push('end');}});assert.equal(JSON.stringify(g),before);assert.equal(events.at(-1),'end');}
 assert.deepEqual(kinds,new Set(['target','dummy','foe','ball','bank','bomb','checkpoint','boss']));
});
test('solo boxing supplies a real pressure-scored sparring automaton',()=>{
 const g=createBrawl('bellows-boxing',roster(1,true,6),4);assert.ok(g.state.objective.sparring);tick(g,2701);assert.ok(g.players[0].objective.headpops>0);assert.ok(getBrawlResults(g)[0].score>0);
});
test('all eight characters can advance every objective in solo practice',()=>{
 const keys={'bell-breakers':'breaks','relic-launch':'launches','hollow-horde':'kills','rift-ball':'goals','spark-heist':'banked','fuse-festival':'survived','tower-relay':'checkpoints','colossus-wake':'bossDamage','bellows-boxing':'headpops'};
 for(const d of BRAWL_GAMES.slice(4))for(let character=0;character<8;character++){const g=createBrawl(d.id,roster(1,true,character),100+character);tick(g,Math.ceil(d.duration*60)+1);assert.ok(g.players[0].objective[keys[d.id]]>0,d.id+' character '+character+' objective');assert.ok(getBrawlResults(g)[0].score>0,d.id+' character '+character+' score');}
});
