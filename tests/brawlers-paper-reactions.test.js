import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrawl,stepBrawl,drawBrawl,brawlPaperBodyReaction,sampleBrawlPaperFlight} from '../src/brawlers.js';

const roster=[{id:'a',name:'Pip',character:0},{id:'b',name:'Moth',character:1}];
function pair(){const g=createBrawl('crown-clash',roster,41);Object.assign(g.players[0],{x:430,y:430,facing:1});Object.assign(g.players[1],{x:490,y:430,facing:-1});return g;}
const tick=(g,n=1,controls={})=>{for(let i=0;i<n;i++)stepBrawl(g,controls,1/60);};
const finite=(o)=>{for(const v of Object.values(o))if(typeof v==='number')assert.ok(Number.isFinite(v));};

test('a remaining regular swing cannot deal damage while its owner is already in hitstun',()=>{
 const g=pair(),[a,b]=g.players;Object.assign(a,{attack:.2,move:'slash',stun:.3});tick(g);
 assert.equal(b.damage,0);assert.ok(a.stun>0);assert.equal(a.hitIds.length,0);
 const ready=pair();tick(ready,1,{a:{action:true}});assert.equal(ready.players[1].damage,12,'responsive fresh attack still connects in the input frame');
});

test('simultaneous fresh attacks still trade instead of giving the first seat a collision advantage',()=>{
 const g=pair();tick(g,1,{a:{action:true},b:{action:true}});
 assert.deepEqual(g.players.map(p=>p.damage),[12,12]);assert.deepEqual(g.players.map(p=>p.damageDealt),[12,12]);
 const swapped=createBrawl('crown-clash',[roster[1],roster[0]],41);Object.assign(swapped.players[0],{x:490,y:430,facing:-1});Object.assign(swapped.players[1],{x:430,y:430,facing:1});tick(swapped,1,{a:{action:true},b:{action:true}});
 assert.deepEqual(swapped.players.map(p=>p.damage),[12,12]);
});

test('active specials also respect hitstun and a parry resets their recovery animation progress',()=>{
 const blocked=pair(),[a,b]=blocked.players;Object.assign(a,{specialAnimation:'active',specialKind:'courier-cut',specialTime:.2,specialProgress:.7,stun:.3});tick(blocked);
 assert.equal(b.damage,0);assert.equal(a.specialHitIds.length,0);
 const parry=pair(),[c,d]=parry.players;Object.assign(c,{specialAnimation:'active',specialKind:'courier-cut',specialTime:.2,specialProgress:.7});tick(parry,1,{b:{down:true}});
 assert.equal(d.damage,0);assert.equal(d.parries,1);assert.equal(c.specialAnimation,'recovery');assert.equal(c.specialProgress,0);
});

test('solo stock practice ends when the last stock is exhausted instead of stranding an eliminated player',()=>{
 const g=createBrawl('rift-rumble',[roster[0]],1),p=g.players[0];p.stocks=1;p.x=1030;tick(g);
 assert.equal(p.stocks,0);assert.equal(p.eliminated,true);assert.equal(g.done,true);assert.ok(g.time<g.duration);
 const snapshot=JSON.stringify(g);tick(g,120,{a:{up:true,action:true,special:true}});assert.equal(JSON.stringify(g),snapshot);
});

test('clean hits produce directional large paper fragments and preserve deterministic snapshot replay',()=>{
 const a=pair(),b=JSON.parse(JSON.stringify(a));tick(a,1,{a:{action:true}});tick(b,1,{a:{action:true}});assert.deepEqual(a,b);
 const victim=a.players[1];assert.equal(victim.launchAt,a.time);assert.ok(victim.launchVx>0);assert.ok(victim.launchVy<0);
 const fragments=a.state.effects.filter(f=>f.max===.5);assert.equal(fragments.length,12);assert.ok(fragments.every(f=>f.size>=5&&f.size<=11));assert.ok(fragments.every(f=>f.vx>0),'directional fragments follow the real launch instead of radiating equally backward');
 assert.ok(fragments.some(f=>f.type==='hit'));assert.ok(a.state.effects.length<=100);
 for(let n=0;n<100;n++){tick(a,1,{a:{action:n%3===0,special:n===20},b:{right:true}});tick(b,1,{a:{action:n%3===0,special:n===20},b:{right:true}});}assert.deepEqual(a,b);
});

test('ordinary airborne landings record real impact strength without pulsing each grounded step',()=>{
 const g=pair(),p=g.players[0];Object.assign(p,{x:480,y:429,vy:500,ground:-1});tick(g);
 assert.equal(p.ground,0);assert.equal(p.landAt,g.time);assert.ok(p.landStrength>.7);
 const first=p.landAt,initial=brawlPaperBodyReaction(g,p);assert.ok(initial.land>.7);assert.ok(initial.scaleX>1);assert.ok(initial.scaleY<1);
 tick(g,10);assert.equal(p.landAt,first);assert.ok(brawlPaperBodyReaction(g,p).land<initial.land);
 tick(g,15);assert.equal(brawlPaperBodyReaction(g,p).land,0);
});

test('KO puppets grow toward the camera or shrink away while keeping gameplay players untouched',()=>{
 const g=pair();g.players[0].x=-80;tick(g);g.players[1].x=1040;tick(g);
 assert.equal(g.state.paperFlights.length,2);const toward=g.state.paperFlights.find(f=>f.toward),away=g.state.paperFlights.find(f=>!f.toward);assert.ok(toward&&away);
 const startNear=sampleBrawlPaperFlight(toward,toward.at),near=sampleBrawlPaperFlight(toward,toward.at+.5),startFar=sampleBrawlPaperFlight(away,away.at),far=sampleBrawlPaperFlight(away,away.at+.5);
 assert.ok(near.scale>startNear.scale*3);assert.ok(far.scale<startFar.scale*.4);assert.ok(near.alpha<1&&far.alpha<1);finite(near);finite(far);
 const before=JSON.stringify(g);for(const f of g.state.paperFlights)for(let n=0;n<=20;n++)finite(sampleBrawlPaperFlight(f,f.at+f.duration*n/20));assert.equal(JSON.stringify(g),before);
 const done=sampleBrawlPaperFlight(toward,toward.at+toward.duration+.01);assert.equal(done.alpha,0);
 tick(g,55);assert.equal(g.state.paperFlights.length,0,'completed paper flights leave no unbounded retained sprites');
});

test('larger fighter and KO drawings use distinct anchored actor IDs and bounded pixel atlas effects',()=>{
 const g=pair();Object.assign(g.players[0],{launchAt:0,launchVx:700,launchVy:-350});g.time=.19;g.players[1].x=1040;tick(g);
 const calls=[],fx=[],ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)}),before=JSON.stringify(g);
 drawBrawl(ctx,g,{background(){},platform(){},character(c,p,x,y,size,options){calls.push({id:p.id,x,y,size,options});},fx(c,type,x,y,size){fx.push({type,x,y,size});}});
 assert.equal(JSON.stringify(g),before);
 const player=calls.find(c=>c.id==='a'),paper=calls.find(c=>c.options.paperFlight);
 assert.ok(player.size>100);assert.equal(player.x,g.players[0].x);assert.equal(player.y,g.players[0].y);assert.ok(player.options.scaleX>1);
 assert.ok(paper);assert.notEqual(paper.id,'b');assert.ok(fx.some(f=>f.size>=95));assert.ok(fx.every(f=>['dust','hit','magic','shield'].includes(f.type)));
});
