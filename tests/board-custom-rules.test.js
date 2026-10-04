import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_SPACES,BOARD_TIMINGS,createParty,actParty,stepParty,playableCards,viewParty,drawBoard,finishProjection,finishMinigame} from '../src/board.js';
import {BOARD_MISCHIEF,boardPadMischief} from '../src/board-mischief.js';

const roster=['a','b','c','d'].map((id,character)=>({id,name:id.toUpperCase(),character}));
const card=(color,value,buff)=>({color,value:String(value),...(buff?{buff}:{})});
const physical=state=>[...state.deck,...state.discard,...state.players.flatMap(player=>player.hand)];
function conserved(state){
  const cards=physical(state);assert.equal(cards.length,108);assert.equal(new Set(cards.map(card=>card.id)).size,108);
  assert.equal(state.deckCount,state.deck.length);for(const player of state.players)assert.equal(player.handCount,player.hand.length);
}
function rig(hands,{seed=81,position=6}={}){
  const state=createParty(roster,{seed}),stock=physical(state);for(const card of stock)delete card.buff;
  const take=spec=>{const index=stock.findIndex(card=>card.color===spec.color&&card.value===spec.value);assert.ok(index>=0,JSON.stringify(spec));const result=stock.splice(index,1)[0];if(spec.buff)result.buff=spec.buff;return result;};
  state.discard=[take(card('ivory',5))];state.activeColor='ivory';
  state.players.forEach((player,index)=>{player.hand=hands[index]?hands[index].map(take):stock.splice(0,7);player.handCount=player.hand.length;player.position=position;});
  state.deck=stock;state.deckCount=stock.length;conserved(state);return state;
}
function play(state,index=0,color){const player=state.players.find(player=>player.id===state.currentPlayerId);return actParty(state,player.id,'play-card',{cardId:player.hand[index].id,...(color?{color}:{})});}
function until(state,done){for(let frame=0;frame<500&&!done();frame++)stepParty(state,.05);assert.ok(done(),`${state.phase}/${state.boardStage}`);}
function settle(state){
  const actor=state.currentPlayerId;
  for(let frame=0;frame<500&&state.phase==='board'&&state.currentPlayerId===actor;frame++){
    // Resolve unrelated route/story prompts explicitly while testing card debt.
    if(state.boardStage==='choose-path')actParty(state,actor,'choose-path',{choice:'main'});
    if(state.boardStage==='choose-event')actParty(state,actor,'choose-event',{choice:state.pendingEvent.choices.at(-1).id});
    if(state.boardStage==='choose-chain')actParty(state,actor,'end-chain');
    stepParty(state,.05);
  }
  assert.ok(state.phase!=='board'||state.currentPlayerId!==actor,`${state.phase}/${state.boardStage}`);
}
function arrive(state,index){
  const player=state.players[0];state.players.slice(1).forEach(other=>{other.position=(index+24)%48;});
  player.position=(index+47)%48;Object.assign(state,{phase:'board',boardStage:'moving',turnIndex:0,currentPlayerId:'a',moveTarget:index,movesRemaining:1,timer:.1,shortcutTravel:true});
  stepParty(state,.11);assert.equal(player.position,index);return player;
}

test('matching-number chains are optional, color independent, privately eligible and movement accumulates',()=>{
  const state=rig([[card('ivory',3,'boost'),card('jade',3),card('violet',8),card('ember',5)]],{position:0});state.players[0].boost=1;
  assert.equal(play(state),true);assert.equal(state.moveTotal,6);assert.equal(state.players[0].position,0);
  until(state,()=>state.boardStage==='choose-chain');
  assert.equal(state.chainValue,'3');assert.equal(state.chainCount,1);
  assert.deepEqual(playableCards(state,'a').map(card=>card.value),['3']);
  assert.equal(viewParty(state,'a').chainEligible,true);assert.equal(viewParty(state,'b').chainEligible,false);
  const before=JSON.stringify(state);
  assert.equal(actParty(state,'b','end-chain'),false);
  assert.equal(actParty(state,'a','play-card',{cardId:state.players[0].hand[1].id}),false);
  assert.equal(JSON.stringify(state),before);
  for(let second=0;second<10;second++)stepParty(state,1);
  assert.equal(state.boardStage,'choose-chain');assert.equal(state.players[0].position,0,'humans never lose the optional choice to a timer');
  assert.equal(play(state),true);assert.equal(state.activeColor,'jade');assert.equal(state.moveTotal,9);assert.equal(state.chainCount,2);
  assert.equal(state.lastEvent.chained,true);assert.equal(state.lastPlayedCard.value,'3');
  assert.equal(play(state),false,'the card play animation rejects duplicate intent');
  stepParty(state,BOARD_TIMINGS.play);assert.equal(state.boardStage,'moving');assert.equal(state.movesRemaining,9);
  conserved(state);
});

test('ending a chain moves once and leaves an eligible extra card in the hand',()=>{
  const state=rig([[card('ivory',2),card('jade',2),card('violet',7)]],{position:0});assert.equal(play(state),true);
  until(state,()=>state.boardStage==='choose-chain');const retained=state.players[0].hand[0].id;
  assert.equal(actParty(state,'a','end-chain'),true);assert.equal(state.boardStage,'moving');assert.equal(state.moveTotal,2);
  assert.equal(actParty(state,'a','end-chain'),false);settle(state);
  assert.equal(state.players[0].position,2);assert.ok(state.players[0].hand.some(card=>card.id===retained));conserved(state);
});

test('a last card inside a chain closes immediately with the point leader winning',()=>{
  const state=rig([[card('ivory',4),card('jade',4)]],{position:6});state.players[0].sparks=20;state.players[1].sparks=30;
  assert.equal(actParty(state,'a','call-last'),true);assert.equal(play(state),true);until(state,()=>state.boardStage==='choose-chain');
  assert.equal(state.players[0].hand.length,1);assert.equal(play(state),true);
  assert.equal(state.phase,'finished');assert.equal(state.finisherId,'a');assert.equal(state.finishBonus,5);assert.equal(state.winnerId,'b');
  assert.equal(state.players[0].position,6);assert.equal(state.pendingDraw,0);conserved(state);
});

test('LAST LIGHT remains callable between chain cards and its missed-call debt conserves physical cards',()=>{
  for(const called of [false,true]){
    const state=rig([[card('ivory',2),card('jade',2),card('violet',9)]],{position:0});play(state);until(state,()=>state.boardStage==='choose-chain');
    if(called)assert.equal(actParty(state,'a','call-last'),true);
    assert.equal(play(state),true);assert.equal(state.players[0].hand.length,called?1:3);
    assert.equal(state.players[0].calledLast,false);conserved(state);
  }
});

test('same-symbol +2 stacks cross colors, mixed stacks are rejected, and accepting ends one real turn',()=>{
  const state=rig([
    [card('ivory','draw2'),card('jade',5),card('violet',8)],
    [card('ember','draw2'),card('wild','draw4'),card('ivory',9),card('jade',6)],
    [card('violet','draw2'),card('ember',4),card('jade',7)],
  ]);
  const lengths=state.players.map(player=>player.hand.length);
  assert.equal(play(state),true);assert.equal(state.pendingDraw,2);assert.equal(state.players[1].hand.length,lengths[1]);settle(state);
  assert.equal(state.currentPlayerId,'b');assert.equal(state.boardStage,'penalty-card');
  assert.deepEqual(playableCards(state,'b').map(card=>card.value),['draw2']);
  assert.equal(actParty(state,'b','play-card',{cardId:state.players[1].hand[1].id,color:'jade'}),false);
  assert.equal(actParty(state,'b','pass'),false);assert.equal(play(state),true);assert.equal(state.pendingDraw,4);settle(state);
  assert.equal(state.currentPlayerId,'c');assert.equal(state.boardStage,'penalty-card');assert.equal(play(state),true);assert.equal(state.pendingDraw,6);settle(state);
  assert.equal(state.currentPlayerId,'d');const before=state.players[3].hand.length,position=state.players[3].position;
  assert.equal(actParty(state,'d','draw-card'),true);assert.equal(state.players[3].hand.length,before+6);
  assert.equal(state.players[3].position,position);assert.equal(state.turnsCompleted,4);assert.equal(state.phase,'minigame-intro');
  assert.equal(state.pendingDraw,0);assert.equal(state.pendingDrawValue,null);assert.equal(actParty(state,'d','draw-card'),false);
  conserved(state);
});

test('ordinary +4 restriction remains while a forced same-symbol stack can use an active-color hand',()=>{
  const state=rig([
    [card('wild','draw4'),card('jade',2),card('violet',3)],
    [card('wild','draw4'),card('ember',3),card('jade',7)],
  ]);
  assert.equal(play(state,0,'ember'),true);settle(state);
  assert.equal(state.currentPlayerId,'b');assert.equal(state.activeColor,'ember');
  assert.ok(state.players[1].hand.some(card=>card.color==='ember'));
  assert.deepEqual(playableCards(state,'b').map(card=>card.value),['draw4']);
  assert.equal(play(state,0,'ivory'),true);assert.equal(state.pendingDraw,8);settle(state);
  const before=state.players[2].hand.length;assert.equal(actParty(state,'c','draw-card'),true);
  assert.equal(state.players[2].hand.length,before+8);assert.equal(state.currentPlayerId,'d');assert.equal(state.pendingDraw,0);conserved(state);
});

test('a fourth-turn draw attack survives the minigame and resumes at its actual penalty recipient',()=>{
  const state=rig([[card('ivory','draw2'),card('jade',2),card('violet',3)]]);state.turnsCompleted=3;
  play(state);settle(state);assert.equal(state.phase,'minigame-intro');assert.equal(state.pendingDraw,2);assert.equal(state.turnIndex,1);
  assert.equal(actParty(state,'a','begin-minigame'),true);assert.equal(finishMinigame(state,[]),true);assert.equal(actParty(state,'a','continue'),true);
  assert.equal(state.currentPlayerId,'b');assert.equal(state.boardStage,'penalty-card');assert.equal(state.pendingDraw,2);
  assert.equal(actParty(state,'b','draw-card'),true);assert.equal(state.currentPlayerId,'c');conserved(state);
});

test('accepting an exhausted draw stack clears the debt instead of softlocking the recipient',()=>{
  const state=rig([[card('ivory',2),card('jade',3),card('violet',7)]]);
  state.players[1].hand.push(...state.deck);state.players[1].handCount=state.players[1].hand.length;state.deck=[];state.deckCount=0;
  state.boardStage='penalty-card';state.pendingDraw=30;state.pendingDrawValue='draw2';
  const before=state.players[0].hand.length;assert.equal(actParty(state,'a','draw-card'),true);
  assert.equal(state.players[0].hand.length,before);assert.equal(state.pendingDraw,0);assert.equal(state.currentPlayerId,'b');conserved(state);
});

test('a Shine last card scores before the closer bonus and its explicit projection matches the winner',()=>{
  const state=rig([[card('ivory',1,'shine')]]);state.players[0].sparks=8;state.players[1].sparks=13;
  const original=JSON.stringify(state),projection=finishProjection(viewParty(state,'a'),'a',{buff:'shine'});
  assert.equal(JSON.stringify(state),original);assert.equal(projection.points,14);assert.equal(projection.bonus,3);assert.equal(projection.wouldWin,true);
  assert.equal(play(state),true);assert.equal(state.players[0].sparks,14);assert.equal(state.finishBonus,3);assert.equal(state.winnerId,projection.winnerId);
  assert.equal(finishProjection(state,'a',{buff:'shine'}).points,14,'finished projection applies neither card reward nor closer bonus twice');conserved(state);
});

test('host-seeded shuffle changes future order while preserving actor slots, host, positions and cards',()=>{
  const state=rig([[card('ivory',2,'shuffle'),card('jade',7),card('violet',8)]]),restored=JSON.parse(JSON.stringify(state));
  const slots=state.players.map(player=>({id:player.id,seat:player.seat,position:player.position})),order=[...state.turnOrder],host=state.hostId;
  for(const target of [state,restored])assert.equal(play(target),true);
  assert.deepEqual(state,restored);assert.notDeepEqual(state.turnOrder,order);assert.equal(new Set(state.turnOrder).size,4);
  assert.equal(state.hostId,host);assert.deepEqual(state.players.map(player=>({id:player.id,seat:player.seat,position:player.position})),slots);
  assert.equal(state.lastPlayedCard.buff,'shuffle');assert.equal(state.turnOrderRevision,1);
  const expected=state.turnOrder[(state.turnOrder.indexOf('a')+1)%4];
  for(const target of [state,restored])settle(target);
  assert.equal(state.currentPlayerId,expected);assert.deepEqual(state,restored);conserved(state);
});

test('shuffled reverse order sends stacked debt to the same public target it names',()=>{
  const state=rig([[card('ivory','draw2','shuffle'),card('jade',7),card('violet',8)]]);state.turnDirection=-1;
  const counts=state.players.map(player=>player.hand.length);assert.equal(play(state),true);
  const index=state.turnOrder.indexOf('a'),expected=state.turnOrder[(index+3)%4];
  assert.equal(state.lastEvent.targetId,expected);assert.equal(state.pendingDraw,2);settle(state);
  assert.equal(state.currentPlayerId,expected);assert.equal(state.boardStage,'penalty-card');
  const receiver=state.players.find(player=>player.id===expected);
  assert.equal(actParty(state,expected,'draw-card'),true);assert.equal(receiver.hand.length,counts[receiver.seat]+2);
  assert.equal(state.currentPlayerId,state.turnOrder[(index+2)%4]);conserved(state);
});

test('every ordinary pad has a real bounded landing effect and private buff identity stays hidden',()=>{
  for(const definition of BOARD_MISCHIEF){
    const index=BOARD_SPACES.findIndex((space,index)=>space.type==='spark'&&boardPadMischief(index).id===definition.id);
    assert.ok(index>=0,definition.id);
    const state=rig([[card('ivory',2),card('jade',3),card('violet',7)]],{position:0});
    state.players.forEach((player,seat)=>{player.sparks=[10,30,2,0][seat];player.shield=false;});
    const before=state.players.map(player=>({points:player.sparks,boost:player.boost,lanterns:player.lanterns,hand:player.hand.length})),player=arrive(state,index),rule=definition.effect;
    assert.equal(state.padEvent.kind,definition.id);assert.equal(state.padEvent.space,index);assert.equal(state.lastEvent.type,'mischief');
    if(rule.type==='points'||rule.type==='draw-prize'||rule.type==='lantern'||rule.type==='bank')assert.equal(player.sparks,before[0].points+rule.points);
    if(rule.type==='toll')assert.equal(player.sparks,7);
    if(rule.type==='boost'||rule.type==='bank')assert.equal(player.boost,rule.boost);
    if(rule.type==='shelter')assert.equal(player.shield,true);
    if(rule.type==='lantern')assert.equal(player.lanterns,1);
    if(rule.type==='steal'){assert.equal(player.sparks,13);assert.equal(state.players[1].sparks,27);}
    if(rule.type==='all-points')assert.deepEqual(state.players.map(player=>player.sparks),[12,32,4,2]);
    if(rule.type==='draw-prize')assert.equal(player.hand.length,before[0].hand+1);
    if(rule.type==='card-buff'){
      assert.equal(player.hand.filter(card=>card.buff===rule.buff).length,1);
      const owner=viewParty(state,'a'),observer=viewParty(state,'b');
      assert.ok(owner.players[0].hand.some(card=>card.buff===rule.buff));
      assert.ok(observer.players[0].hand.every(card=>card.back&&Object.keys(card).length===1));
      const metadata=JSON.stringify({padEvent:observer.padEvent,lastEvent:observer.lastEvent});
      for(const card of player.hand)assert.ok(!metadata.includes(card.id),'the enchantment announces no private recipient card ID');
    }
    const after=JSON.stringify(state.padEvent.effects),points=player.sparks;stepParty(state,1);stepParty(state,.2);
    assert.equal(player.sparks,points);assert.equal(JSON.stringify(state.padEvent.effects),after);conserved(state);
  }
  const empty=rig([[card('ivory',2),card('jade',3),card('violet',7)]]);empty.players[0].sparks=1;
  arrive(empty,1);assert.equal(empty.players[0].sparks,0,'Thorn Toll never creates a negative purse');conserved(empty);
});

test('rare dealt card buffs remain private and a client cannot supply a different buff or chain value',()=>{
  const state=createParty(roster,{seed:413}),enchanted=physical(state).filter(card=>card.buff);
  assert.ok(enchanted.length>0&&enchanted.length<20);assert.ok(state.players.every(player=>player.hand.length===7));
  for(const viewer of state.players){const view=viewParty(state,viewer.id);for(const player of view.players)if(player.id!==viewer.id)assert.ok(player.hand.every(card=>Object.keys(card).length===1&&card.back));}
  const controlled=rig([[card('ivory',2),card('jade',3),card('violet',7)]]);
  assert.equal(actParty(controlled,'a','play-card',{cardId:controlled.players[0].hand[0].id,buff:'shine',chainValue:'9',pendingDraw:100}),true);
  assert.equal(controlled.players[0].sparks,0);assert.equal(controlled.moveTotal,2);assert.equal(controlled.chainValue,'2');assert.equal(controlled.pendingDraw,0);assert.equal(controlled.lastPlayedCard.buff,undefined);
  conserved(controlled);
});

test('chain and stack snapshots restore exactly through JSON and human decisions never time out',()=>{
  const state=rig([[card('ivory',2),card('jade',2),card('violet',7)]],{position:0});play(state);until(state,()=>state.boardStage==='choose-chain');
  const restored=JSON.parse(JSON.stringify(state));
  for(const target of [state,restored]){actParty(target,'a','call-last');play(target);stepParty(target,BOARD_TIMINGS.play);settle(target);}
  assert.deepEqual(state,restored);conserved(state);
  const debt=rig([[card('ivory','draw2'),card('jade',7),card('violet',8)]]);play(debt);settle(debt);
  const copy=JSON.parse(JSON.stringify(debt));for(const target of [debt,copy]){for(let second=0;second<30;second++)stepParty(target,1);assert.equal(target.boardStage,'penalty-card');actParty(target,'b','draw-card');}
  assert.deepEqual(debt,copy);conserved(debt);
});

test('all forty-eight pads animate original prop emblems with no printed platform numbers',()=>{
  const state=createParty(roster,{seed:19}),before=JSON.stringify(state),printed=[],calls=[];
  const gradient={addColorStop(){}};
  const ctx=new Proxy({globalAlpha:1,canvas:{clientWidth:960,clientHeight:540},createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,fillText(text){printed.push(String(text));}},{get(target,key){return key in target?target[key]:()=>{};}});
  drawBoard(ctx,state,{prop:(ctx,icon,x,y,size,rotation)=>calls.push({icon,x,y,size,rotation}),boardOverview:true});
  assert.equal(printed.some(text=>/^\d+$/.test(text)),false);assert.equal(calls.length,48);
  for(let index=0;index<48;index++){assert.equal(calls[index].icon,BOARD_SPACES[index].icon);assert.ok(calls[index].size>=15&&calls[index].size<=22);}
  state.clock=.7;const later=[];drawBoard(ctx,state,{prop:(ctx,icon,x,y,size,rotation)=>later.push({icon,x,y,size,rotation}),boardOverview:true});
  assert.ok(later.some((call,index)=>call.y!==calls[index].y&&call.rotation!==calls[index].rotation));
  state.clock=0;assert.equal(JSON.stringify(state),before,'rendering is read-only');
});

test('sixteen seeded bot parties finish under combined pad, chain, stack and shuffle rules with exact replay',()=>{
  let chains=0,stacks=0,shuffles=0,pads=0;
  for(let seed=1;seed<=16;seed++){
    const state=createParty(roster.map(player=>({...player,bot:true})),{seed}),restored=JSON.parse(JSON.stringify(state));
    let serial=0;
    for(let frame=0;frame<30000&&state.phase!=='finished';frame++){
      for(const target of [state,restored]){
        if(target.phase==='minigame-intro')actParty(target,target.hostId,'begin-minigame');
        if(target.phase==='minigame')finishMinigame(target,target.players.map(player=>({id:player.id,score:player.seat+target.round%3})));
        if(target.phase==='results')actParty(target,target.hostId,'continue');
        stepParty(target,.2);
      }
      if(frame%37===0){assert.deepEqual(state,restored);conserved(state);}
      for(const event of state.history.filter(event=>event.serial>serial)){
        if(event.chained)chains++;
        if(event.type==='card'&&event.pendingDraw>event.penalty&&event.penalty)stacks++;
        if(event.buff==='shuffle')shuffles++;
        if(event.type==='mischief')pads++;
      }
      serial=state.eventSerial;
    }
    assert.equal(state.phase,'finished',`seed ${seed} progresses without a rule deadlock`);assert.deepEqual(state,restored);conserved(state);
    assert.ok(state.players.every(player=>player.sparks>=0));assert.equal(state.pendingDraw,0);
  }
  assert.ok(chains>0,'the replay trace exercised real number chains');assert.ok(stacks>0,'the replay trace exercised actual penalty stacks');
  assert.ok(shuffles>0,'the replay trace exercised shuffled seat order');assert.ok(pads>0,'the replay trace exercised ordinary pad effects');
});

test('new clinic and workshop paper tableaus appear beside their traveler instead of the canvas origin',()=>{
  for(const event of ['clockwork-clinic','tower-workshop']){
    const state=createParty(roster,{seed:19}),pieces=[],gradient={addColorStop(){}};
    state.players[0].position=8;Object.assign(state,{boardStage:'moving',moveTarget:9,movesRemaining:1,timer:.1,storyDeck:[event]});stepParty(state,.11);
    const before=JSON.stringify(state),ctx=new Proxy({globalAlpha:1,canvas:{clientWidth:960,clientHeight:540},createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get(target,key){return key in target?target[key]:()=>{};}});
    drawBoard(ctx,state,{challengePiece:(ctx,name,x,y,size)=>pieces.push({name,x,y,size}),boardOverview:true});
    assert.equal(pieces.length,2);
    for(const piece of pieces){assert.ok(Math.abs(piece.x-BOARD_SPACES[9].x)<75);assert.ok(Math.abs(piece.y-BOARD_SPACES[9].y)<100);assert.ok(piece.y>0);}
    assert.equal(JSON.stringify(state),before);
  }
});
