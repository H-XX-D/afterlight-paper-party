import test from 'node:test';
import assert from 'node:assert/strict';
import {actParty,createParty,finishMinigame,stepParty,viewParty} from '../src/board.js';
import {MINIGAMES,createGame} from '../src/minigames.js';

const humans=['a','b','c','d'].map((id,character)=>({id,name:id.toUpperCase(),character}));
const routes=[
  {event:'clockwork-clinic',accept:'repair',decline:'donate',game:'clockwork-surgery',points:4,boost:0},
  {event:'tower-workshop',accept:'build',decline:'brace',game:'tottering-tower',points:0,boost:2},
];
const make=()=>createParty(humans,{seed:914});
const indexOf=id=>MINIGAMES.findIndex(game=>game.id===id);
const cardState=state=>({deck:structuredClone(state.deck),discard:structuredClone(state.discard),hands:state.players.map(player=>structuredClone(player.hand))});

function conserved(state,original){
  const all=[...state.deck,...state.discard,...state.players.flatMap(player=>player.hand)];
  assert.equal(all.length,108);
  assert.equal(new Set(all.map(card=>card.id)).size,108,'every private physical card still exists exactly once');
  assert.equal(state.deckCount,state.deck.length);
  for(const player of state.players)assert.equal(player.handCount,player.hand.length);
  if(original)assert.deepEqual(cardState(state),original,'story routing and minigame awards never move private cards');
}
function arrive(state,event,seat=1){
  const player=state.players[seat];
  state.phase='board';state.turnIndex=seat;state.currentPlayerId=player.id;
  player.position=8;state.boardStage='moving';state.moveTarget=9;
  state.movesRemaining=1;state.timer=.1;state.storyDeck=[event];
  stepParty(state,.11);
  assert.equal(state.pendingEvent.id,event);assert.equal(state.boardStage,'choose-event');
  return player;
}
function finishEvent(state){
  assert.equal(state.boardStage,'event');stepParty(state,1);stepParty(state,.2);
}
function finishEmptyTurn(state){
  // Isolate challenge scheduling from card draw/play rules covered in board.test.js.
  state.boardStage='event';state.timer=.01;stepParty(state,.02);
}
function assertPublic(state,viewer){
  const view=viewParty(state,viewer);
  for(const field of ['deck','gameDeck','storyDeck','rng','seed'])assert.equal(view[field],undefined,field);
  for(const player of state.players){
    const shown=view.players.find(candidate=>candidate.id===player.id);
    if(player.id===viewer)assert.deepEqual(shown.hand,player.hand);
    else assert.deepEqual(shown.hand,Array.from({length:player.hand.length},()=>({back:true})));
  }
  const publicMetadata=JSON.stringify({pendingEvent:view.pendingEvent,storyEvent:view.storyEvent,lastEvent:view.lastEvent});
  for(const player of state.players)for(const card of player.hand)assert.ok(!publicMetadata.includes(card.id),'challenge metadata exposes no hand identity');
  return view;
}

for(const route of routes){
  test(`${route.event}: accepting routes the fourth-turn challenge and only the host can launch it`,()=>{
    const state=make(),original=cardState(state),target=indexOf(route.game);
    assert.ok(target>=0,'the routed challenge is registered');
    state.gameDeck=MINIGAMES.map((_,index)=>index);state.turnsCompleted=3;
    const traveler=arrive(state,route.event);
    assert.equal(actParty(state,traveler.id,'choose-event',{choice:route.accept}),true);
    assert.equal(state.queuedGame,target);assert.equal(state.nextGame,null);
    assert.equal(state.phase,'board');assert.equal(state.boardStage,'event');
    assert.deepEqual(state.storyEvent.effects,[{type:'challenge',game:route.game}]);
    assert.equal(actParty(state,state.hostId,'begin-minigame'),false,'the board landing animation must finish first');
    assertPublic(state,state.hostId);assertPublic(state,traveler.id);conserved(state,original);
    finishEvent(state);
    assert.equal(state.phase,'minigame-intro');assert.equal(state.nextGame,target);
    assert.equal(state.queuedGame,null);assert.equal(state.currentPlayerId,null);
    assert.equal(state.gameDeck.length,MINIGAMES.length-1);
    assert.ok(!state.gameDeck.includes(target),'the explicit challenge is removed from this cycle');
    assert.equal(new Set(state.gameDeck).size,state.gameDeck.length);
    assert.equal(actParty(state,traveler.id,'begin-minigame'),false,'a guest cannot launch the host simulation');
    assert.equal(actParty(state,state.hostId,'begin-minigame'),true);
    assert.equal(createGame(MINIGAMES[state.nextGame].id,state.players,{seed:22}).id,route.game);
    assert.deepEqual(state.playedGames,[target]);
    assert.equal(actParty(state,state.hostId,'begin-minigame'),false,'a launch replay cannot duplicate the game');
    conserved(state,original);
  });

  test(`${route.event}: declining grants its board reward and preserves ordinary challenge selection`,()=>{
    const state=make(),original=cardState(state),normal=indexOf('inkfall');
    state.gameDeck=[normal];state.turnsCompleted=3;
    const traveler=arrive(state,route.event);
    assert.equal(actParty(state,traveler.id,'choose-event',{choice:route.decline}),true);
    assert.equal(state.queuedGame??null,null);
    assert.equal(traveler.sparks,route.points);assert.equal(traveler.boost,route.boost);
    assert.ok(state.storyEvent.effects.every(effect=>effect.type!=='challenge'));
    assert.equal(actParty(state,traveler.id,'choose-event',{choice:route.decline}),false,'reward replay is rejected');
    assert.equal(traveler.sparks,route.points);assert.equal(traveler.boost,route.boost);
    finishEvent(state);
    assert.equal(state.nextGame,normal);assert.equal(state.phase,'minigame-intro');
    conserved(state,original);
  });

  test(`${route.event}: JSON restoration replays accepted and declined routes through awards and the following challenge`,()=>{
    for(const choice of [route.accept,route.decline]){
      const state=make();state.gameDeck=MINIGAMES.map((_,index)=>index);state.turnsCompleted=3;
      arrive(state,route.event);
      const original=cardState(state),restored=JSON.parse(JSON.stringify(state));
      for(const target of [state,restored])assert.equal(actParty(target,'b','choose-event',{choice}),true);
      assert.deepEqual(state,restored);
      for(const target of [state,restored])finishEvent(target);
      assert.deepEqual(state,restored);
      for(const target of [state,restored]){
        assert.equal(actParty(target,'a','begin-minigame'),true);
        assert.equal(finishMinigame(target,target.players.map((player,seat)=>({id:player.id,score:10-seat}))),true);
        assert.equal(actParty(target,'a','continue'),true);
        for(let turn=0;turn<4;turn++)finishEmptyTurn(target);
        conserved(target,original);assertPublic(target,'c');
      }
      assert.equal(state.phase,'minigame-intro');assert.deepEqual(state,restored);
      assert.notEqual(state.nextGame,state.playedGames[0],'the routed game cannot immediately reappear in its remaining cycle');
      assert.ok(!state.gameDeck.includes(state.playedGames[0]));
    }
  });
}

test('an accepted challenge waits for the four-turn boundary and survives a later declined encounter',()=>{
  const state=make(),original=cardState(state),target=indexOf('clockwork-surgery');
  state.gameDeck=MINIGAMES.map((_,index)=>index);state.turnsCompleted=1;
  arrive(state,'clockwork-clinic');
  assert.equal(actParty(state,'b','choose-event',{choice:'repair'}),true);finishEvent(state);
  assert.equal(state.phase,'board');assert.equal(state.turnsCompleted,2);
  assert.equal(state.nextGame,null);assert.equal(state.queuedGame,target);
  const traveler=arrive(state,'tower-workshop',2);
  assert.equal(actParty(state,traveler.id,'choose-event',{choice:'brace'}),true);finishEvent(state);
  assert.equal(state.turnsCompleted,3);assert.equal(state.phase,'board');assert.equal(state.queuedGame,target);
  assert.equal(traveler.boost,2);finishEmptyTurn(state);
  assert.equal(state.phase,'minigame-intro');assert.equal(state.nextGame,target);assert.equal(state.queuedGame,null);
  conserved(state,original);
});

test('new challenge choices reject the wrong encounter, another seat, and replay without changing host state',()=>{
  for(const route of routes){
    const state=make();arrive(state,route.event);
    const before=JSON.stringify(state),wrong=route.accept==='repair'?'build':'repair';
    for(const [player,payload] of [['a',{choice:route.accept}],['c',{choice:route.accept}],['b',{choice:wrong}],['b',{choice:route.game}],['b',null]]){
      assert.equal(actParty(state,player,'choose-event',payload),false);assert.equal(JSON.stringify(state),before);
    }
    assert.equal(actParty(state,'b','choose-event',{choice:route.accept}),true);
    const after=JSON.stringify(state);
    assert.equal(actParty(state,'b','choose-event',{choice:route.accept}),false);
    assert.equal(JSON.stringify(state),after);conserved(state);
  }
});
