import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_MISCHIEF,boardPadMischief,cardBuffDefinition} from '../src/board-mischief.js';
import {BOARD_SPACES} from '../src/board.js';
import {PAPER_PALETTES} from '../src/paper-palette.js';

// art.js is a browser entry with a Vite JSON import; inspect its public prop
// declaration to check renderer compatibility without initializing graphics.
const propDeclaration=readFileSync(new URL('../src/art.js',import.meta.url),'utf8')
  .match(/export const PROP_NAMES\s*=\s*\[([^\]]+)\]/)?.[1];
assert.ok(propDeclaration,'The art renderer must declare its supported props');
const PROP_NAMES=[...propDeclaration.matchAll(/'([^']+)'/g)].map(match=>match[1]);

test('twelve pad encounters expose distinct identities and supported paper props',()=>{
  assert.equal(BOARD_MISCHIEF.length,12);
  assert.equal(new Set(BOARD_MISCHIEF.map(pad=>pad.id)).size,12);
  assert.equal(new Set(BOARD_MISCHIEF.map(pad=>pad.name)).size,12);
  for(const pad of BOARD_MISCHIEF){
    assert.match(pad.id,/^[a-z]+(?:-[a-z]+)+$/);
    assert.ok(pad.name.length<=20,pad.name);
    assert.ok(PROP_NAMES.includes(pad.icon),pad.icon);
    assert.ok(pad.symbol.length>0&&pad.symbol.length<=2,pad.symbol);
    assert.equal(JSON.parse(JSON.stringify(pad)).id,pad.id);
  }
});

test('encounters describe rewards, limits, shields, shared gifts and card modifiers',()=>{
  const byId=Object.fromEntries(BOARD_MISCHIEF.map(pad=>[pad.id,pad.effect]));
  assert.deepEqual(byId,{
    'moon-mint':{type:'points',points:4},
    'thorn-toll':{type:'toll',points:3},
    'spring-fold':{type:'boost',boost:2},
    'umbrella-roost':{type:'shelter',shield:true},
    'lantern-flare':{type:'lantern',lanterns:1,points:3},
    'sly-mimic':{type:'steal',points:3,target:'richest-other'},
    'comet-gift':{type:'card-buff',buff:'boost'},
    'ink-prize':{type:'card-buff',buff:'shine'},
    'clockwork-switch':{type:'card-buff',buff:'shuffle'},
    'twin-moons':{type:'all-points',points:2},
    'hungry-cache':{type:'draw-prize',points:7,draw:1},
    'quiet-bank':{type:'bank',points:2,boost:1},
  });
  assert.equal(new Set(BOARD_MISCHIEF.map(pad=>pad.effect.type)).size,10);
});

test('the actual ordinary pads expose every encounter across the full circuit',()=>{
  const ordinary=BOARD_SPACES.map((space,index)=>({space,index})).filter(({space})=>space.type==='spark');
  assert.ok(ordinary.length>BOARD_MISCHIEF.length);
  const encountered=new Set(ordinary.map(({index})=>boardPadMischief(index).id));
  assert.deepEqual([...encountered].sort(),BOARD_MISCHIEF.map(pad=>pad.id).sort());
  // The Hungry Cache is reachable despite every index % 12 === 10 being special.
  assert.ok(ordinary.some(({index})=>boardPadMischief(index).id==='hungry-cache'));
});

test('each quarter varies its placement and later laps preserve pad identity',()=>{
  const quarters=Array.from({length:4},(_,quarter)=>Array.from({length:12},(_,n)=>boardPadMischief(quarter*12+n).id));
  for(const quarter of quarters)assert.equal(new Set(quarter).size,12);
  assert.equal(new Set(quarters.map(quarter=>quarter.join('|'))).size,4);
  for(let index=0;index<48;index++){
    assert.equal(boardPadMischief(index),boardPadMischief(index+48));
    assert.equal(boardPadMischief(index),boardPadMischief(index+48*10000));
  }
  assert.equal(boardPadMischief(Number.MAX_SAFE_INTEGER),boardPadMischief(Number.MAX_SAFE_INTEGER%48));
});

test('definitions and gameplay metadata reject mutation at every exposed level',()=>{
  assert.ok(Object.isFrozen(BOARD_MISCHIEF));
  assert.throws(()=>BOARD_MISCHIEF.push(BOARD_MISCHIEF[0]),TypeError);
  for(const pad of BOARD_MISCHIEF){
    assert.ok(Object.isFrozen(pad));
    assert.ok(Object.isFrozen(pad.effect));
    assert.throws(()=>{pad.color='#ff0000';},TypeError);
    assert.throws(()=>{pad.effect.type='forged';},TypeError);
  }
  for(const id of ['boost','shine','shuffle']){
    const buff=cardBuffDefinition(id);
    assert.ok(Object.isFrozen(buff));
    assert.throws(()=>{buff.id='forged';},TypeError);
  }
});

test('pad and card pigments reuse the shared muted world palette',()=>{
  const pigments=new Set(Object.values(PAPER_PALETTES).flatMap(palette=>[
    palette.accent,palette.edge,palette.metal,...Object.values(palette.fx),
  ]));
  const definitions=[...BOARD_MISCHIEF,...['boost','shine','shuffle'].map(cardBuffDefinition)];
  for(const definition of definitions){
    assert.match(definition.color,/^#[0-9a-f]{6}$/i);
    assert.ok(pigments.has(definition.color),definition.id);
  }
});

test('card bonuses are public immutable definitions with host-owned shuffle semantics',()=>{
  assert.equal(cardBuffDefinition('boost').movement,2);
  assert.equal(cardBuffDefinition('shine').points,3);
  assert.equal(cardBuffDefinition('shuffle').seatOrder,'host-seeded');
  const buffs=BOARD_MISCHIEF.filter(pad=>pad.effect.type==='card-buff');
  assert.deepEqual(buffs.map(pad=>pad.effect.buff),['boost','shine','shuffle']);
  for(const pad of buffs){
    const definition=cardBuffDefinition(pad.effect.buff);
    assert.equal(definition,cardBuffDefinition(pad.effect.buff));
    assert.ok(PROP_NAMES.includes(definition.icon));
    assert.equal(definition.color,pad.color);
    assert.deepEqual(JSON.parse(JSON.stringify(definition)),definition);
  }
});

test('malformed indices and inherited card names have no definitions',()=>{
  for(const index of [undefined,null,'0',true,{},[],NaN,Infinity,-Infinity,-1,.5,Number.MAX_SAFE_INTEGER+1,1n]){
    assert.equal(boardPadMischief(index),null,String(index));
  }
  for(const id of [undefined,null,0,true,{},[],Symbol('boost'),'BOOST','boost ','constructor','toString','__proto__','unknown']){
    assert.equal(cardBuffDefinition(id),null,String(id));
  }
});

test('public pad identities are independent of random calls and lookup order',()=>{
  const baseline=Array.from({length:48},(_,index)=>boardPadMischief(index));
  const originalRandom=Math.random;
  Math.random=()=>{throw new Error('Public pad selection must not draw random values');};
  try{
    for(let index=47;index>=0;index--)assert.equal(boardPadMischief(index),baseline[index]);
    for(const id of ['shuffle','boost','shine'])assert.equal(cardBuffDefinition(id).id,id);
    assert.deepEqual(Array.from({length:48},(_,index)=>boardPadMischief(index)),baseline);
  }finally{
    Math.random=originalRandom;
  }
});
