import test from 'node:test';
import assert from 'node:assert/strict';
import {PAPER_PALETTES,PAPER_REALMS,paperPalette,paperEffectColor,paperColorRGB} from '../src/paper-palette.js';
import {MINIGAMES,createGame} from '../src/minigames.js';
import {sceneLighting} from '../src/scene-lighting.js';
import {makeLightingPair} from './lighting-fixtures.js';

const luma=color=>paperColorRGB(color).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);

test('every active game has an explicit shared realm and cache cardinality stays five',()=>{
 const identities=new Set();
 for(const id of ['world',...MINIGAMES.map(game=>game.id)]){
  assert.ok(Object.hasOwn(PAPER_REALMS,id),id+' has an explicit art choice');
  for(let time=0;time<10;time++)identities.add(paperPalette({id,time,players:[{score:time}]}));
 }
 assert.equal(identities.size,5);assert.equal(Object.keys(PAPER_PALETTES).length,5);
 for(const id of ['not-a-realm','constructor','__proto__',null,42])assert.equal(paperPalette(id),paperPalette('world'));
});

test('pigments stay muted, light paper retains strong contrast with dark ink, and palettes cannot mutate',()=>{
 for(const palette of Object.values(PAPER_PALETTES)){
  assert.ok(Object.isFrozen(palette));assert.ok(Object.isFrozen(palette.fx));
  assert.ok(palette.spriteTint>=.12&&palette.spriteTint<=.18);
  for(const color of [palette.paper,palette.edge,palette.accent,palette.bounce,palette.ambient,palette.key,palette.fill,palette.metal,...Object.values(palette.fx)]){
   assert.match(color,/^#[0-9a-f]{6}$/);
   const rgb=paperColorRGB(color);assert.ok(Math.max(...rgb)-Math.min(...rgb)<.39,'no neon primary pigment: '+color);
  }
  assert.ok((luma(palette.paper)+.05)/(luma(palette.ink)+.05)>9,'dark ink remains legible on paper');
  assert.throws(()=>{palette.fx.magic='#ff00ff'},TypeError);
 }
});

test('palette lookup reads no private player data and FX keep their distinct surface roles',()=>{
 const game={id:'mothlight',get players(){throw Error('private roster read')},get hand(){throw Error('private hand read')}};
 assert.equal(paperPalette(game),PAPER_PALETTES.sage);
 assert.equal(paperEffectColor(game,'magic'),PAPER_PALETTES.sage.fx.magic);
 assert.notEqual(paperEffectColor(game,'dust'),paperEffectColor(game,'shield'));
 assert.equal(paperEffectColor(game,'invalid'),PAPER_PALETTES.sage.fx.magic);
 assert.equal(paperEffectColor(game,'constructor'),PAPER_PALETTES.sage.fx.magic);
 assert.deepEqual(paperColorRGB('#102030'),[16/255,32/255,48/255]);
 for(const bad of [null,23,'#abc','red','#000000ff'])assert.deepEqual(paperColorRGB(bad),[1,1,1]);
});

test('real gameplay event fixtures retain bounded realm color and deterministic state-dependent lights',()=>{
 const profiles=[];
 for(const {id} of MINIGAMES){
  const {idle,event}=makeLightingPair(id,createGame),before=JSON.stringify(event),profile=sceneLighting(event),palette=paperPalette(id);
  assert.equal(profile.palette,palette);assert.deepEqual(profile,sceneLighting(structuredClone(event)));
  assert.equal(JSON.stringify(event),before);assert.notDeepEqual(profile,sceneLighting(idle));
  const colors=new Set([palette.key,palette.fill,palette.metal,palette.fx.hit,...Object.values(palette.fx)]);
  for(const light of [profile.key,profile.fill,...profile.points])assert.ok(colors.has(light.color),id+' uses restrained realm light pigments');
  for(const effect of profile.effects)assert.ok(colors.has(effect.color),id+' uses realm pixel pigments');
  assert.ok(profile.points.length<=4);assert.ok(profile.effects.length<=16);profiles.push(profile);
 }
 assert.equal(new Set(profiles.map(p=>p.ambient.color)).size,5,'all five color families reach real active profiles');
});
