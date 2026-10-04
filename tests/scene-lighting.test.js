import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,drawGame,MINIGAMES,stepGame} from '../src/minigames.js';
import {sceneLighting,LIGHTING_AUDIT,SCENE_LAYOUT,scenePanel} from '../src/scene-lighting.js';
import {makeLightingPair,LIGHTING_EVENT_FIXTURES} from './lighting-fixtures.js';
import {towerLayout,towerBlockPosition} from '../src/boardgame-challenges.js';

const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
function checkProfile(profile){
 assert.ok(profile.ambient.intensity>=0&&profile.ambient.intensity<=2);
 for(const lamp of [profile.key,profile.fill,...profile.points]){
  for(const name of ['x','y','z','intensity'])assert.ok(Number.isFinite(lamp[name]),name+' finite');
  assert.match(lamp.color,/^#[0-9a-f]{6}$/i);assert.ok(lamp.intensity>=0&&lamp.intensity<=2.4);
 }
 assert.ok(profile.points.length<=4,'bounded GPU point-light count');
 assert.ok(profile.effects.length<=16,'bounded pixel-effect work');
 for(const point of profile.points)assert.ok(point.radius>=24&&point.radius<=360);
 for(const effect of profile.effects){assert.ok(['hit','dust','magic','shield'].includes(effect.type));for(const name of ['x','y','size','time','alpha','rotation'])assert.ok(Number.isFinite(effect[name]),name+' finite');assert.ok(effect.alpha>0&&effect.alpha<=.85);if(effect.progress!==undefined)assert.ok(effect.progress>=0&&effect.progress<=1);}
}
const withoutEffects=profile=>({ambient:profile.ambient,key:profile.key,fill:profile.fill,points:profile.points});

test('all twenty-six shipped gameplay loops have independent event fixtures',()=>{
 assert.equal(LIGHTING_AUDIT.length,26);assert.deepEqual(new Set(LIGHTING_AUDIT.map(x=>x.id)),new Set(MINIGAMES.map(x=>x.id)));assert.deepEqual(new Set(LIGHTING_AUDIT.map(x=>x.id)),new Set(Object.keys(LIGHTING_EVENT_FIXTURES)));
 for(const audit of LIGHTING_AUDIT){assert.ok(audit.mechanics.length>20);assert.ok(audit.state.length>10);assert.ok(audit.effect.length>20);}
});

for(const {id} of LIGHTING_AUDIT)test(`${id}: actual gameplay fields change lights at a fixed clock, with immutable deterministic output`,()=>{
 const pair=makeLightingPair(id,createGame);assert.equal(pair.idle.time,pair.event.time);assert.equal(pair.idle.rng,pair.event.rng);
 const before=JSON.stringify(pair);freeze(pair);const idle=sceneLighting(pair.idle),event=sceneLighting(pair.event);
 checkProfile(idle);checkProfile(event);assert.notDeepEqual(withoutEffects(event),withoutEffects(idle),'lighting changes must come from gameplay state, not clock animation or added FX alone');
 assert.ok(event.effects.length>0,'a gameplay-specific pixel cue is emitted');
 assert.deepEqual(event,sceneLighting(pair.event));assert.deepEqual(event,sceneLighting(JSON.parse(JSON.stringify(pair.event))));
 assert.equal(JSON.stringify(pair),before,'lighting cannot mutate the authoritative snapshot');
});

test('all twenty-six games and id/time-only world diagnostics retain a finite lighting profile',()=>{
 const roster=Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i,character:i,bot:true}));
 for(const def of MINIGAMES){const game=createGame(def.id,roster,38);for(let j=0;j<180;j++)stepGame(game,{},1/60);const before=JSON.stringify(game);checkProfile(sceneLighting(game));checkProfile(sceneLighting({id:def.id,time:game.time}));assert.equal(JSON.stringify(game),before);}
 checkProfile(sceneLighting());checkProfile(sceneLighting({id:'world',time:0}));
});

test('surgery shared pressure, moving cursor, alarm, steady and clean extraction independently affect actual light fields',()=>{
 const {idle}=makeLightingPair('clockwork-surgery',createGame),before=JSON.stringify(idle),base=sceneLighting(idle),changes=[g=>{g.state.pressure=.9;},g=>{g.players[0].cursor.x+=27;g.players[0].cursor.y-=61;},g=>{g.state.bell=.45;g.players[0].alarm=.6;},g=>{g.players[0].steady=.9;},g=>{g.players[0].success=.6;}];
 for(const change of changes){const game=structuredClone(idle);change(game);freeze(game);const profile=sceneLighting(game);checkProfile(profile);assert.notDeepEqual(withoutEffects(profile),withoutEffects(base));}assert.equal(JSON.stringify(idle),before);
});
test('tower lean, instability, wind, active brace and physical collapse independently affect actual light fields',()=>{
 const {idle}=makeLightingPair('tottering-tower',createGame),before=JSON.stringify(idle),base=sceneLighting(idle),changes=[g=>{g.state.lean=.51;},g=>{g.state.instability=.82;},g=>{g.state.wind=-.9;},g=>{g.players[0].bracing=true;g.players[0].brace=.8;},g=>{g.state.phase='collapsing';g.state.collapseTime=1.2;g.state.debris=[{x:517,y:271,life:1.2}];}];
 for(const change of changes){const game=structuredClone(idle);change(game);freeze(game);const profile=sceneLighting(game);checkProfile(profile);assert.notDeepEqual(withoutEffects(profile),withoutEffects(base));}assert.equal(JSON.stringify(idle),before);
});
test('new challenge tools and block highlights use their production projection while hostile hand getters are never read',()=>{
 for(const id of['clockwork-surgery','tottering-tower']){const {event}=makeLightingPair(id,createGame);for(const player of event.players)Object.defineProperty(player,'hand',{get(){throw Error('private hand read');}});const profile=sceneLighting(event);checkProfile(profile);assert.ok(profile.effects.length>0);}
 const {event}=makeLightingPair('clockwork-surgery',createGame),cursor=event.players[0].cursor;assert.ok(sceneLighting(event).points.some(point=>point.x===cursor.x&&point.y===cursor.y-12));
 const {idle:pulling}=makeLightingPair('tottering-tower',createGame),p=pulling.players[0],block=pulling.state.blocks.find(b=>b.layer===p.selectedLayer&&b.slot===p.selectedSlot);p.phase='pulling';p.carried=block.id;block.owner=p.id;block.pull=.43;pulling.state.lean=.18;const at=towerBlockPosition(pulling.state,block,towerLayout(pulling.state));assert.ok(sceneLighting(pulling).points.some(point=>point.x===at.x&&point.y===at.y),'light follows the real leaning, displaced block');
 const {event:tower}=makeLightingPair('tottering-tower',createGame);tower.state.phase='collapsing';tower.state.collapseTime=1;tower.state.debris=[{x:610,y:242,life:1.4}];const profile=sceneLighting(tower);assert.ok(profile.effects.some(effect=>effect.type==='hit'));assert.ok(profile.points.length<=4);
});

test('short-lived action flashes decay with simulation; no retained lighting history leaks between rounds',()=>{
 const {event}=makeLightingPair('gallery',createGame),shot=sceneLighting(event).points[0].intensity;
 for(let j=0;j<30;j++)stepGame(event,{},1/60);
 assert.ok(sceneLighting(event).points.every(p=>p.intensity<shot));
 const fresh=makeLightingPair('gallery',createGame);assert.deepEqual(sceneLighting(fresh.idle),sceneLighting(structuredClone(fresh.idle)));
});

test('four enlarged panels remain inside the canvas and keep grid origins consistent',()=>{
 const game={players:[{},{},{},{}]},panels=game.players.map((p,i)=>scenePanel(game,i));
 assert.equal(SCENE_LAYOUT.panelSpan,920);assert.equal(panels[0].x,20);assert.equal(panels.at(-1).x+panels.at(-1).w,940);
 for(const p of panels)assert.ok((p.w-SCENE_LAYOUT.gridInset)/7>30,'larger four-player maze cells');
});

test('drawGame brackets original and brawler draws once, including material clip balance',()=>{
 const roster=Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i,character:i,bot:false}));
 const gradient={addColorStop(){}};
 for(const id of ['inkfall','rhythm','gullet-gala','rift-rumble','bell-breakers','bellows-boxing']){
  const events=[];const ctx=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
  const game=createGame(id,roster,54);const before=JSON.stringify(game);let clips=0;
  drawGame(ctx,game,{beginScene(c,scene,time,profile){events.push('begin');assert.equal(scene,id);assert.deepEqual(profile,sceneLighting(game));},endScene(){events.push('end');},background(){events.push('background');},character(){},prop(){},object(){},platform(){},fx(){},clipMaterials(){clips++;},restoreMaterials(){clips--;assert.ok(clips>=0);}});
  assert.equal(events[0],'begin');assert.equal(events.filter(x=>x==='begin').length,1);assert.equal(events.filter(x=>x==='end').length,1);assert.equal(clips,0);assert.equal(JSON.stringify(game),before);
 }
});
