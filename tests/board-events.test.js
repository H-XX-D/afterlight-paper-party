import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_EVENTS,BOARD_STORY_TILES,BOARD_SPACES,createParty,actParty,stepParty,viewParty} from '../src/board.js';

const humans=['a','b','c','d'].map(id=>({id,name:id.toUpperCase()}));
const make=(seed=719)=>createParty(humans,{seed});
function conserved(state){
  const cards=[...state.deck,...state.discard,...state.players.flatMap(player=>player.hand)];
  assert.equal(cards.length,108);assert.equal(new Set(cards.map(card=>card.id)).size,108);
  assert.equal(state.deckCount,state.deck.length);
  state.players.forEach(player=>assert.equal(player.handCount,player.hand.length));
}
function arrive(state,{tile=9,eventId,moves=1,shortcut=false}={}){
  const player=state.players[0];
  state.phase='board';state.turnIndex=0;state.currentPlayerId=player.id;
  state.boardStage='moving';state.moveTarget=tile;state.movesRemaining=moves;state.timer=.1;
  state.shortcutTravel=shortcut;player.position=(tile+47)%48;
  if(eventId)state.storyDeck=[eventId];
  stepParty(state,.11);
  return player;
}
function resolve(state,choice){assert.equal(actParty(state,'a','choose-event',{choice}),true);conserved(state);}

test('nine whimsical encounters expose real choices on the existing three story platforms',()=>{
  assert.equal(BOARD_EVENTS.length,9);assert.equal(new Set(BOARD_EVENTS.map(event=>event.id)).size,9);
  assert.deepEqual(Object.keys(BOARD_STORY_TILES).map(Number),[9,20,35]);
  for(const [tile,metadata] of Object.entries(BOARD_STORY_TILES)){
    assert.equal(BOARD_SPACES[tile].type,'event');assert.ok(metadata.title);assert.ok(BOARD_SPACES[metadata.doorTarget]);
  }
  for(const event of BOARD_EVENTS){
    assert.equal(event.choices.length,2);
    const state=make();arrive(state,{eventId:event.id});
    assert.equal(state.boardStage,'choose-event');assert.equal(state.pendingEvent.id,event.id);
    assert.deepEqual(state.pendingEvent.choices.map(choice=>choice.id),event.choices.map(choice=>choice.id));
    const pending=JSON.stringify(state.pendingEvent),points=state.players[0].sparks;
    for(let n=0;n<50;n++)stepParty(state,1);
    assert.equal(state.boardStage,'choose-event');assert.equal(JSON.stringify(state.pendingEvent),pending);
    assert.equal(state.players[0].sparks,points,'a human decision never awards by timeout');
    for(const [id,payload] of [['b',{choice:event.choices[0].id}],['a',{choice:'forged'}],['a',null],['a',{choice:1}]])assert.equal(actParty(state,id,'choose-event',payload),false);
    conserved(state);
  }
});

test('the seeded host encounter deck visits every event before repeating and restores exactly',()=>{
  const state=make(314),restored=JSON.parse(JSON.stringify(state)),order=[];
  for(let n=0;n<BOARD_EVENTS.length*2;n++){
    for(const target of [state,restored]){
      arrive(target);const event=target.pendingEvent;
      if(target===state)order.push(event.id);
      resolve(target,event.choices[1].id);
    }
    assert.deepEqual(state,restored);conserved(state);
  }
  assert.equal(new Set(order.slice(0,BOARD_EVENTS.length)).size,BOARD_EVENTS.length);
  assert.equal(new Set(order.slice(BOARD_EVENTS.length)).size,BOARD_EVENTS.length);
  const other=make(315);arrive(other);
  assert.notDeepEqual([other.pendingEvent.id,...other.storyDeck],[order[0],...state.storyDeck],'another seed changes the host encounter order');
});

test('Moon Carnival and Paper Moth choices apply distinct bounded rewards',()=>{
  for(const [eventId,choice,points,boost] of [['moon-carnival','prize',8,0],['moon-carnival','parade',4,1],['moth-procession','follow',0,3],['moth-procession','lantern',5,0]]){
    const state=make();arrive(state,{eventId});resolve(state,choice);
    assert.equal(state.players[0].sparks,points);assert.equal(state.players[0].boost,boost);
    assert.equal(state.storyEvent.choice,choice);assert.equal(state.pendingEvent,null);
    assert.equal(actParty(state,'a','choose-event',{choice}),false,'a replay cannot award twice');
    stepParty(state,1);stepParty(state,.2);assert.equal(state.players[0].sparks,points);
  }
});

test('the mimic borrows at most five from the richest rival and never creates negative points',()=>{
  for(const richest of [0,2,9]){
    const state=make();state.players[0].sparks=20;state.players[1].sparks=richest;
    const total=state.players.reduce((sum,player)=>sum+player.sparks,0);
    arrive(state,{eventId:'mimic-cache'});resolve(state,'borrow');
    assert.equal(state.players[0].sparks,20+Math.min(5,richest));assert.equal(state.players[1].sparks,Math.max(0,richest-5));
    assert.equal(state.players.reduce((sum,player)=>sum+player.sparks,0),total);
    assert.ok(state.players.every(player=>player.sparks>=0));
  }
  const gift=make();arrive(gift,{eventId:'mimic-cache'});resolve(gift,'gift');assert.equal(gift.players[0].sparks,3);
});

test('Midnight Bargain draws exactly one conserved private card or gives a safe reward',()=>{
  for(const choice of ['bargain','safe']){
    const state=make();arrive(state,{eventId:'midnight-bargain'});
    const before=state.players[0].hand.length;resolve(state,choice);
    assert.equal(state.players[0].sparks,choice==='bargain'?12:4);
    assert.equal(state.players[0].hand.length,before+(choice==='bargain'?1:0));
    const owner=viewParty(state,'a'),guest=viewParty(state,'b');
    assert.deepEqual(owner.players[0].hand,state.players[0].hand);
    assert.ok(guest.players[0].hand.every(card=>card.back&&Object.keys(card).length===1));
    assert.equal(guest.deck,undefined);assert.equal(guest.storyDeck,undefined);assert.equal(guest.rng,undefined);
    for(const card of state.players[0].hand)assert.ok(!JSON.stringify(guest.storyEvent).includes(card.id),'event reward metadata contains no card identity');
    assert.deepEqual(guest.storyEvent,state.storyEvent);
    assert.ok(state.storyEvent.effects.every(effect=>effect.type!=='cards'||Object.keys(effect).every(key=>['type','playerId','amount'].includes(key))));
  }
});

test('Folded Door traverses each nearby destination once without landing chains or lap awards',()=>{
  for(const [source,metadata] of Object.entries(BOARD_STORY_TILES)){
    const state=make();arrive(state,{tile:Number(source),eventId:'folded-door'});resolve(state,'enter');
    const serial=state.storySerial;assert.equal(state.boardStage,'transport');assert.equal(state.transport.type,'door');
    assert.equal(state.transport.to,metadata.doorTarget);assert.equal(state.players[0].position,Number(source));
    stepParty(state,1);stepParty(state,.21);
    assert.equal(state.players[0].position,metadata.doorTarget);assert.equal(state.boardStage,'event');
    assert.equal(state.players[0].sparks,0,'door bypasses shrine/item landing rewards');
    assert.equal(state.players[0].laps,0);assert.equal(state.players[0].lapPoints,0);
    assert.equal(state.storySerial,serial);assert.equal(state.pendingEvent,null);assert.equal(state.transport,null);
    stepParty(state,1);stepParty(state,.2);assert.equal(state.currentPlayerId,'b');conserved(state);
  }
  const state=make();arrive(state,{eventId:'folded-door'});resolve(state,'picnic');assert.equal(state.players[0].sparks,4);assert.equal(state.transport,null);
});

test('clockwork reverses turn order and umbrella rain grants protection or points',()=>{
  const reverse=make();arrive(reverse,{eventId:'clockwork-reversal'});resolve(reverse,'reverse');
  assert.equal(reverse.turnDirection,-1);stepParty(reverse,1);stepParty(reverse,.2);assert.equal(reverse.currentPlayerId,'d');
  const wind=make();arrive(wind,{eventId:'clockwork-reversal'});resolve(wind,'wind');assert.equal(wind.players[0].boost,2);
  const shield=make();arrive(shield,{eventId:'umbrella-rain'});resolve(shield,'shelter');assert.equal(shield.players[0].shield,true);assert.equal(shield.players[0].sparks,3);
  const collect=make();arrive(collect,{eventId:'umbrella-rain'});resolve(collect,'collect');assert.equal(collect.players[0].shield,false);assert.equal(collect.players[0].sparks,7);
});

test('bots make deterministic event decisions while keeping state/card restore exact',()=>{
  for(const event of BOARD_EVENTS){
    const state=make();arrive(state,{eventId:event.id});state.players[0].bot=true;
    const restored=JSON.parse(JSON.stringify(state));stepParty(state,.73);stepParty(restored,.73);
    assert.equal(state.pendingEvent,null);assert.ok(state.storyEvent);assert.deepEqual(state,restored);conserved(state);
  }
});

test('passing high-fives give2/1 points once per other traveler per card',()=>{
  const state=make();state.players[1].position=1;
  arrive(state,{tile:1,moves:2});
  assert.equal(state.players[0].sparks,2);assert.equal(state.players[1].sparks,1);
  assert.equal(state.boardEncounter.type,'high-five');assert.deepEqual(state.boardEncounter.targetIds,['b']);
  assert.equal(state.players[1].position,1);
  arrive(state,{tile:1,moves:2});
  assert.equal(state.players[0].sparks,2);assert.equal(state.players[1].sparks,1,'repeat contact during same card cannot farm points');
  state.cardEncounteredIds=[];arrive(state,{tile:1,moves:2});assert.equal(state.players[0].sparks,4);
  conserved(state);
});

test('landing bumps each occupied traveler once; shields absorb and displacements never chain',()=>{
  const state=make();state.players[1].position=1;state.players[2].position=1;state.players[2].shield=true;
  state.players[3].position=47;
  arrive(state,{tile:1});
  assert.equal(state.players[0].sparks,0,'one3-point bump then the Thorn Toll takes its bounded three');
  assert.equal(state.players[1].position,47);assert.equal(state.players[2].position,1);assert.equal(state.players[2].shield,false);
  assert.equal(state.players[3].position,47,'the bumped traveler cannot bump a third traveler');
  assert.deepEqual(state.boardEncounter.moves,[{playerId:'b',from:1,to:47,blocked:false},{playerId:'c',from:1,to:1,blocked:true}]);
  assert.ok(state.players.every(player=>player.laps===0&&player.lapPoints===0));
  assert.equal(state.pendingEvent,null);assert.equal(state.transport,null);
  const before=state.players[0].sparks;stepParty(state,1);stepParty(state,.2);assert.equal(state.players[0].sparks,before);
  conserved(state);
});

test('starting stack gives no free encounter; moved and teleported bumps cannot trigger tile rewards',()=>{
  const state=make();arrive(state,{tile:1});assert.equal(state.boardEncounter,null);assert.equal(state.players[0].sparks,0,'an empty purse pays no Thorn Toll');
  const door=make();arrive(door,{eventId:'folded-door'});door.players[1].position=7;resolve(door,'enter');
  stepParty(door,1);stepParty(door,.21);
  assert.equal(door.players[0].position,7);assert.equal(door.players[0].sparks,3,'door contact gives its bump, not the shrine reward');
  assert.equal(door.players[1].position,5,'bump can end on a ladder without activating it');
  assert.equal(door.transport,null);assert.equal(door.pendingEvent,null);assert.equal(door.players[1].laps,0);
  conserved(door);
});

test('visible encounter and lap metadata stay detached in recipient views',()=>{
  const state=make();arrive(state,{tile:0});
  assert.equal(state.lapCelebration.amount,25);assert.equal(state.boardEncounter.type,'bump');
  assert.equal(state.players[0].sparks,38,'lap25 plus three bumps9 plus Moon Mint4');
  const guest=viewParty(state,'b');assert.deepEqual(guest.boardEncounter,state.boardEncounter);assert.deepEqual(guest.lapCelebration,state.lapCelebration);
  guest.boardEncounter.moves[0].to=123;assert.notEqual(state.boardEncounter.moves[0].to,123);
  assert.ok(guest.players[0].hand.every(card=>card.back));conserved(state);
});

test('overlapping visual encounters stay in a bounded expiring public queue',()=>{
  const state=make();
  for(let n=0;n<9;n++){
    state.cardEncounteredIds=[];state.players[1].position=1;
    arrive(state,{tile:1,moves:2});
  }
  assert.equal(state.boardEncounters.length,6);assert.equal(state.boardEncounters.at(-1).id,state.boardEncounter.id);
  assert.equal(new Set(state.boardEncounters.map(event=>event.id)).size,6);
  assert.deepEqual(viewParty(state,'b').boardEncounters,state.boardEncounters);
  state.boardStage='await-card';stepParty(state,1);stepParty(state,.3);
  assert.equal(state.boardEncounters.length,0,'expired cues stop inflating network snapshots');
  assert.ok(state.boardEncounter,'latest cue remains available for compatibility');
});
