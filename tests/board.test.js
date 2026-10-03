import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SPACES, BOARD_RINGS, BOARD_LADDERS, BOARD_CHUTES, BOARD_SHORTCUTS, CARD_COLORS, boardRoutePoint, createParty, actParty, stepParty, finishMinigame, finishingBonus, finishProjection, rankPlayers, playableCards, viewParty } from '../src/board.js';

const humans = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
const make = options => createParty(humans, options);
const cards = state => [...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)];
const card = (color, value) => ({ color, value: String(value) });
function assertConserved(state) {
  assert.equal(cards(state).length, 108);
  assert.equal(new Set(cards(state).map(card => card.id)).size, 108, 'every physical card exists exactly once');
  assert.equal(state.deckCount, state.deck.length);
  for (const player of state.players) assert.equal(player.handCount, player.hand.length);
}
function rig({ hand, top = card('ivory', 5), otherHands = [], deckTop, position = 0 } = {}) {
  const state = make({ seed: 12 });
  const stock = cards(state);
  const take = spec => {
    const index = stock.findIndex(candidate => candidate.color === spec.color && candidate.value === spec.value);
    assert.notEqual(index, -1, `test card exists: ${spec.color} ${spec.value}`);
    return stock.splice(index, 1)[0];
  };
  state.discard = [take(top)];
  state.activeColor = top.color;
  state.players.forEach((player, index) => {
    const specs = index === 0 ? hand : otherHands[index - 1];
    player.hand = specs ? specs.map(take) : stock.splice(0, 7);
    player.handCount = player.hand.length;
  });
  if (deckTop) { const draw = take(deckTop); stock.push(draw); }
  state.deck = stock;
  state.deckCount = stock.length;
  state.players[0].position = position;
  assertConserved(state);
  return state;
}
function play(state, id, color) {
  return actParty(state, state.currentPlayerId, 'play-card', { cardId: id || playableCards(state, state.currentPlayerId)[0]?.id, color });
}
function tickUntil(state, predicate, limit = 3000) {
  for (let i = 0; i < limit && !predicate(); i++) stepParty(state, .05);
  assert.ok(predicate(), `condition reached; phase=${state.phase}, stage=${state.boardStage}`);
}
function settle(state) {
  const start = state.currentPlayerId;
  tickUntil(state, () => state.phase !== 'board' || state.currentPlayerId !== start || state.boardStage === 'choose-path');
}
function passCycle(state) {
  for (let i = 0; i < 4; i++) {
    assert.equal(actParty(state, state.currentPlayerId, 'draw-card'), true);
    assert.equal(actParty(state, state.currentPlayerId, 'pass'), true);
  }
  assert.equal(state.phase, 'minigame-intro');
}

test('108-card deck, seven-card deal, numeric opening, four unique serializable seats', () => {
  const state = createParty([{ id: 'a', name: 'A' }]);
  assert.equal(state.players.length, 4);
  assert.equal(state.players.filter(player => player.bot).length, 3);
  assert.ok(state.players.every(player => player.hand.length === 7));
  assert.match(state.discard[0].value, /^\d$/);
  assert.equal(state.deck.length, 79);
  assertConserved(state);
  for (const color of CARD_COLORS) {
    const colored = cards(state).filter(card => card.color === color);
    assert.equal(colored.length, 25);
    assert.equal(colored.filter(card => card.value === '0').length, 1);
    for (const value of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2']) assert.equal(colored.filter(card => card.value === value).length, 2);
  }
  assert.equal(cards(state).filter(card => card.value === 'wild').length, 4);
  assert.equal(cards(state).filter(card => card.value === 'draw4').length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(state.totalRounds, null);
  assert.equal(BOARD_SPACES.length, 48);
  assert.throws(() => createParty([{ id: 'a' }, { id: 'a' }]));
  assert.throws(() => createParty(Array.from({ length: 5 }, (_, id) => ({ id }))));
  const collision = createParty([{ id: 'bot-2' }]);
  assert.equal(new Set(collision.players.map(player => player.id)).size, 4);
});

test('host rejects other seats, dice, forged card ids, illegal matches and duplicate card input', () => {
  const state = rig({ hand: [card('jade', 3), card('ivory', 2), card('violet', 5)] });
  assert.equal(actParty(state, 'b', 'play-card', { cardId: state.players[0].hand[1].id }), false);
  assert.equal(actParty(state, 'a', 'roll'), false);
  assert.equal(actParty(state, 'a', 'route', { direction: -1 }), false);
  assert.equal(actParty(state, 'a', 'play-card', { cardId: 'forged' }), false);
  assert.equal(actParty(state, 'a', 'play-card', null), false);
  assert.equal(actParty(state, 'a', 'play-card', { cardId: state.players[0].hand[0].id }), false);
  assert.deepEqual(playableCards(state, 'a').map(card => card.value), ['2', '5']);
  const selected = state.players[0].hand[1];
  assert.equal(play(state, selected.id), true);
  assert.equal(state.boardStage, 'playing-card');
  assert.equal(state.moveTotal, 2);
  assert.equal(play(state, selected.id), false);
  assert.equal(actParty(state, 'a', 'draw-card'), false);
  assertConserved(state);
});

test('matching a number or action symbol changes color; zero moves one', () => {
  const state = rig({ hand: [card('jade', 5), card('violet', 3), card('ember', 4)] });
  assert.equal(play(state, state.players[0].hand[0].id), true);
  assert.equal(state.activeColor, 'jade');
  const actionState = rig({ top: card('ivory', 'skip'), hand: [card('jade', 'skip'), card('violet', 8), card('jade', 6)] });
  assert.equal(play(actionState, actionState.players[0].hand[0].id), true);
  assert.equal(actionState.activeColor, 'jade');
  assert.equal(actionState.moveTotal, 4);
  const zero = rig({ hand: [card('ivory', 0), card('jade', 3), card('violet', 4)] });
  assert.equal(play(zero), true);
  assert.equal(zero.moveTotal, 1);
});

test('draw exactly one then only that drawn card may be played; pass is draw-only', () => {
  const state = rig({ hand: [card('ivory', 2), card('jade', 3)], deckTop: card('ivory', 9) });
  const oldId = state.players[0].hand[0].id;
  assert.equal(actParty(state, 'a', 'pass'), false);
  assert.equal(actParty(state, 'a', 'draw-card'), true);
  assert.equal(state.players[0].hand.length, 3);
  assert.equal(state.boardStage, 'drawn-card');
  assert.equal(actParty(state, 'a', 'draw-card'), false);
  assert.equal(play(state, oldId), false, 'cannot swap to an old legal card after drawing');
  assert.deepEqual(playableCards(state, 'a').map(card => card.id), [state.drawnCardId]);
  assert.equal(play(state, state.drawnCardId), true);
  assertConserved(state);
  const miss = rig({ hand: [card('jade', 2), card('violet', 3)], deckTop: card('ember', 9) });
  assert.equal(actParty(miss, 'a', 'draw-card'), true);
  assert.equal(playableCards(miss, 'a').length, 0);
  assert.equal(actParty(miss, 'a', 'pass'), true);
  assert.equal(miss.currentPlayerId, 'b');
  assert.equal(miss.turnsCompleted, 1);
});

test('wild requires a real selected color; draw four is rejected if any active-color card exists', () => {
  const state = rig({ hand: [card('wild', 'wild'), card('jade', 2), card('violet', 3)] });
  const wildId = state.players[0].hand[0].id;
  assert.equal(play(state, wildId), false);
  assert.equal(play(state, wildId, 'orange'), false);
  assert.equal(play(state, wildId, 'jade'), true);
  assert.equal(state.activeColor, 'jade');
  assert.equal(state.moveTotal, 5);
  const restricted = rig({ hand: [card('wild', 'draw4'), card('ivory', 2), card('jade', 3)] });
  assert.equal(play(restricted, restricted.players[0].hand[0].id, 'jade'), false);
  assert.equal(restricted.players[1].hand.length, 7);
  const legal = rig({ hand: [card('wild', 'draw4'), card('jade', 2), card('violet', 3)] });
  assert.equal(play(legal, legal.players[0].hand[0].id, 'ember'), true);
  assert.equal(legal.players[1].hand.length, 11);
  assert.equal(legal.activeColor, 'ember');
  assert.equal(legal.skipNext, true);
  assertConserved(legal);
});

test('skip and draw-two skip the affected seat; no penalty stacking; reverse changes order', () => {
  for (const value of ['skip', 'draw2', 'reverse']) {
    const state = rig({ hand: [card('ivory', value), card('jade', 2), card('violet', 3)], position: 6 });
    const before = state.players[1].hand.length;
    assert.equal(play(state), true);
    assert.equal(state.players[1].hand.length, before + (value === 'draw2' ? 2 : 0));
    assert.equal(actParty(state, 'b', 'play-card', { cardId: state.players[1].hand[0].id }), false);
    settle(state);
    assert.equal(state.currentPlayerId, value === 'reverse' ? 'd' : 'c');
    assert.equal(state.turnDirection, value === 'reverse' ? -1 : 1);
    assert.equal(state.turnsCompleted, 1, 'skipped seats are not extra completed card turns');
    assertConserved(state);
  }
});

test('LAST LIGHT must be called with two cards; missing it adds two; calling it preserves one', () => {
  const missed = rig({ hand: [card('ivory', 2), card('jade', 3)] });
  assert.equal(play(missed), true);
  assert.equal(missed.players[0].hand.length, 3);
  assert.match(missed.message, /forgot LAST LIGHT/);
  const called = rig({ hand: [card('ivory', 2), card('jade', 3)] });
  assert.equal(actParty(called, 'b', 'call-last'), false);
  assert.equal(actParty(called, 'a', 'call-last'), true);
  assert.equal(actParty(called, 'a', 'call-last'), false);
  assert.equal(play(called), true);
  assert.equal(called.players[0].hand.length, 1);
  assert.equal(called.players[0].calledLast, false);
  const seven = make();
  assert.equal(actParty(seven, 'a', 'call-last'), false);
  assertConserved(missed); assertConserved(called);
});

test('empty hand ends the match; final draw-four penalty applies before points are ranked', () => {
  for (const spec of [card('ivory', 1), card('wild', 'draw4')]) {
    const state = rig({ hand: [spec] });
    const targetBefore = state.players[1].hand.length;
    assert.equal(play(state, state.players[0].hand[0].id, 'jade'), true);
    assert.equal(state.phase, 'finished');
    assert.equal(state.winnerId, 'a');
    assert.equal(state.finisherId, 'a');
    assert.equal(state.finishBonus, 0);
    assert.equal(state.currentPlayerId, null);
    assert.equal(state.players[0].hand.length, 0);
    assert.equal(state.players[1].hand.length, targetBefore + (spec.value === 'draw4' ? 4 : 0));
    assert.equal(rankPlayers(state)[0].id, 'a');
    assert.equal(actParty(state, 'b', 'draw-card'), false);
    assert.equal(actParty(state, 'a', 'continue'), false);
    assertConserved(state);
  }
});

test('finishing bonus rounds up and the point winner may differ from the finisher',()=>{
  for(const [points,bonus] of [[0,0],[1,1],[4,1],[5,2],[19,5],[100,25]])assert.equal(finishingBonus({sparks:points}),bonus);
  for(const [points,winner] of [[19,'b'],[24,'a'],[25,'a']]){
    const state=rig({hand:[card('ivory',1)]});
    state.players[0].sparks=points;state.players[1].sparks=30;state.players[1].wins=99;
    const before=JSON.stringify(state),projection=finishProjection(state,'a');
    assert.equal(JSON.stringify(state),before,'projection never mutates authority');
    assert.equal(projection.bonus,Math.ceil(points*.25));
    assert.equal(projection.points,points+projection.bonus);
    assert.equal(projection.winnerId,winner);
    assert.equal(projection.wouldWin,winner==='a');
    assert.equal(finishProjection(state,'stranger'),null);
    play(state);
    assert.equal(state.finisherId,'a');assert.equal(state.winnerId,winner);
    assert.equal(state.finishBonus,projection.bonus);assert.equal(state.players[0].sparks,projection.points);
    assert.equal(rankPlayers(state)[0].id,winner);
    assert.equal(finishProjection(state,'a').points,projection.points,'finished UI does not add the bonus twice');
    const awarded=state.players[0].sparks;stepParty(state,1);assert.equal(state.players[0].sparks,awarded);
    assertConserved(state);
  }
});

test('ties favor finisher, then minigame wins, fewer cards and stable seat',()=>{
  const state=make();state.players.forEach(player=>{player.sparks=50;player.wins=0;player.handCount=7;});
  state.players[1].wins=2;state.players[2].wins=2;state.players[2].handCount=3;
  assert.deepEqual(rankPlayers(state).map(player=>player.id),['c','b','a','d']);
  state.finisherId='d';assert.deepEqual(rankPlayers(state).map(player=>player.id),['d','c','b','a']);
  state.players[0].sparks=51;assert.equal(rankPlayers(state)[0].id,'a','points outrank every tie breaker');
  state.winnerId='b';assert.equal(rankPlayers(state)[0].id,'a','stale winner metadata cannot override points');
});

test('bots delay a losing final card but finish when their bonus wins the points tie',()=>{
  const losing=rig({hand:[card('ivory',1)],deckTop:card('ember',9)});
  losing.players[0].bot=true;losing.players[0].sparks=5;losing.players[1].sparks=100;
  const lastCard=losing.players[0].hand[0].id;stepParty(losing,.73);
  assert.equal(losing.phase,'board');assert.equal(losing.boardStage,'drawn-card');
  assert.equal(losing.players[0].hand.length,2);assert.ok(losing.players[0].hand.some(card=>card.id===lastCard));
  stepParty(losing,.73);assert.equal(losing.currentPlayerId,'b');assertConserved(losing);
  const winning=rig({hand:[card('ivory',1)]});winning.players[0].bot=true;
  winning.players[0].sparks=24;winning.players[1].sparks=30;winning.players[1].wins=99;
  stepParty(winning,.73);assert.equal(winning.phase,'finished');assert.equal(winning.winnerId,'a');assert.equal(winning.finishBonus,6);
});

test('a final card ends before movement, laps or physical contacts can add points',()=>{
  const state=rig({hand:[card('ivory',1)],position:47});
  state.players[0].sparks=5;state.players[1].sparks=30;
  play(state);stepParty(state,1);
  assert.equal(state.phase,'finished');assert.equal(state.players[0].position,47);
  assert.equal(state.finishBonus,2);assert.equal(state.players[0].sparks,7);assert.equal(state.winnerId,'b');
  assert.equal(state.players[0].laps,0);assert.equal(state.lapCelebration,null);assert.equal(state.boardEncounter,null);
});

test('deck refill preserves the visible discard and all physical cards; exhausted deck can pass', () => {
  const state = make();
  const top = state.discard[0];
  state.discard = [...state.deck, top];
  state.deck = []; state.deckCount = 0;
  assert.equal(actParty(state, 'a', 'draw-card'), true);
  assert.deepEqual(state.discard, [top]);
  assert.equal(state.deck.length, 78);
  assertConserved(state);
  const exhausted = make();
  exhausted.players[3].hand.push(...exhausted.deck);
  exhausted.players[3].handCount = exhausted.players[3].hand.length;
  exhausted.deck = []; exhausted.deckCount = 0;
  assert.equal(actParty(exhausted, 'a', 'draw-card'), true);
  assert.equal(exhausted.drawnCardId, null);
  assert.equal(actParty(exhausted, 'a', 'pass'), true);
  assertConserved(exhausted);
});

test('48-space circular graph has three well-spaced rings and short adjacent-ring connections', () => {
  assert.equal(BOARD_RINGS.length,3);
  assert.equal(BOARD_SPACES.length,48);
  for(let ring=0;ring<3;ring++){
    const shape=BOARD_RINGS[ring],spaces=BOARD_SPACES.filter(space=>space.ring===ring);assert.equal(spaces.length,16);
    for(const space of spaces){
      assert.ok(Math.abs(((space.x-shape.x)/shape.rx)**2+((space.y-shape.y)/shape.ry)**2-1)<1e-10,'every stop lies on its ellipse');
      assert.ok(space.x>=50&&space.x<=910&&space.y>=90&&space.y<=480,'route fits the playfield');
    }
  }
  assert.equal(Object.keys(BOARD_LADDERS).length, 3);
  assert.equal(Object.keys(BOARD_CHUTES).length, 3);
  assert.equal(Object.keys(BOARD_SHORTCUTS).length, 3);
  for (const [from, to] of Object.entries(BOARD_LADDERS)) {
    assert.ok(to > Number(from));
    assert.equal(BOARD_SPACES[to].ring - BOARD_SPACES[from].ring, 1, 'ladders climb exactly one inner circuit');
  }
  for (const [from, to] of Object.entries(BOARD_CHUTES)) {
    assert.ok(to < Number(from));
    assert.equal(BOARD_SPACES[from].ring - BOARD_SPACES[to].ring, 1, 'chutes return exactly one outer circuit');
  }
  for (const [from, to] of Object.entries(BOARD_SHORTCUTS)) assert.equal(BOARD_SPACES[to].ring - BOARD_SPACES[from].ring, 1);
  const sources=new Set();
  for(const [links,type] of [[BOARD_LADDERS,'ladder'],[BOARD_CHUTES,'chute'],[BOARD_SHORTCUTS,'fork']])for(const [from,to] of Object.entries(links)){
    assert.equal(BOARD_SPACES[from].type,type,'tile type is derived from its transport map');
    const angle=BOARD_SPACES[from].angle-BOARD_SPACES[to].angle;
    assert.ok(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<.18,'transport endpoints occupy nearby radial angles');
    assert.ok(!sources.has(from),'transport sources are distinct');sources.add(from);
  }
  for (let i = 0; i < BOARD_SPACES.length; i++) for (let j = i + 1; j < BOARD_SPACES.length; j++) assert.ok(Math.hypot(BOARD_SPACES[i].x - BOARD_SPACES[j].x, BOARD_SPACES[i].y - BOARD_SPACES[j].y) > 36,'numbered stops do not overlap');
});

test('all twelve connectors stay local and never cross one another',()=>{
  const routes=[];
  for(const [links,kind] of [[BOARD_LADDERS,'ladder'],[BOARD_CHUTES,'chute'],[BOARD_SHORTCUTS,'shortcut'],[{15:16,31:32,47:0},'main']])for(const [from,to] of Object.entries(links)){
    const points=Array.from({length:129},(_,i)=>boardRoutePoint(Number(from),to,i/128,kind));
    const straight=Math.hypot(points.at(-1).x-points[0].x,points.at(-1).y-points[0].y);
    const length=points.slice(1).reduce((total,p,i)=>total+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
    assert.ok(length<(kind==='main'?130:125),`${kind} ${from}→${to} must stay local`);
    assert.ok(length<=straight*1.03,`${kind} ${from}→${to} cannot take a sideways detour`);
    if(kind==='ladder')assert.ok(Math.abs(length-straight)<1e-8,'ladders are straight radial climbs');
    routes.push({name:`${kind} ${from}→${to}`,points});
  }
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const crosses=(a,b,c,d)=>orient(a,b,c)*orient(a,b,d)<-1e-8&&orient(c,d,a)*orient(c,d,b)<-1e-8;
  for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
    const a=routes[i],b=routes[j];
    for(let u=1;u<a.points.length;u++)for(let v=1;v<b.points.length;v++)assert.ok(!crosses(a.points[u-1],a.points[u],b.points[v-1],b.points[v]),`${a.name} must not cross ${b.name}`);
  }
});

test('ring transitions are short and the lap return uses the open middle-ring gap',()=>{
  for(const [from,to] of [[15,16],[31,32],[47,0]]){
    const points=Array.from({length:129},(_,i)=>boardRoutePoint(from,to,i/128));
    const length=points.slice(1).reduce((total,p,i)=>total+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
    assert.ok(length<130,`${from}→${to} stays local`);
    for(const point of points)assert.ok(point.x>=450&&point.x<=610&&point.y>=340&&point.y<=470,'main transition remains in the bottom gap');
  }
  const mid=boardRoutePoint(47,0,.5),ring=BOARD_RINGS[1];
  assert.ok(Math.abs(((mid.x-ring.x)/ring.rx)**2+((mid.y-ring.y)/ring.ry)**2-1)<1e-10,'lap return crosses the middle ellipse exactly in its gap');
  assert.ok(mid.x>BOARD_SPACES[31].x&&mid.x<BOARD_SPACES[16].x,'return clears both numbered middle-ring stops');
  const left=boardRoutePoint(47,0,.5-1e-5),right=boardRoutePoint(47,0,.5+1e-5);
  assert.ok(Math.abs((mid.x-left.x)-(right.x-mid.x))<1e-6&&Math.abs((mid.y-left.y)-(right.y-mid.y))<1e-6,'return curve keeps a continuous tangent through the gap');
});

test('circular travel follows ellipse arcs and all bridges join their exact endpoints',()=>{
  for(let from=0;from<48;from++){
    const to=(from+1)%48,a=BOARD_SPACES[from],b=BOARD_SPACES[to],start=boardRoutePoint(from,to,0),end=boardRoutePoint(from,to,1),mid=boardRoutePoint(from,to,.5);
    assert.ok(Math.hypot(start.x-a.x,start.y-a.y)<1e-9);assert.ok(Math.hypot(end.x-b.x,end.y-b.y)<1e-9);
    assert.ok(Number.isFinite(mid.x)&&Number.isFinite(mid.y));
    if(a.ring===b.ring){const r=BOARD_RINGS[a.ring];assert.ok(Math.abs(((mid.x-r.x)/r.rx)**2+((mid.y-r.y)/r.ry)**2-1)<1e-10,'mid-step stays on the curved road');}
  }
  for(const [links,kind] of [[BOARD_LADDERS,'ladder'],[BOARD_CHUTES,'chute'],[BOARD_SHORTCUTS,'shortcut']])for(const [from,to] of Object.entries(links)){
    const end=boardRoutePoint(Number(from),to,1,kind);assert.deepEqual(end,{x:BOARD_SPACES[to].x,y:BOARD_SPACES[to].y});
  }
  assert.throws(()=>boardRoutePoint(48,0,0),RangeError);assert.throws(()=>boardRoutePoint(0,1,NaN),RangeError);
});

test('forks pause for a real main/shortcut decision and resume the remaining card movement', () => {
  const [source,target]=Object.entries(BOARD_SHORTCUTS)[0],fork=Number(source);
  for (const choice of ['main', 'shortcut']) {
    const state = rig({ hand: [card('ivory', 1), card('jade', 2), card('violet', 3)], position: fork });
    assert.equal(play(state), true);
    tickUntil(state, () => state.boardStage === 'choose-path');
    assert.equal(state.players[0].position, fork);
    assert.equal(state.movesRemaining, 1);
    assert.equal(state.pathOptions.length, 2);
    assert.equal(actParty(state, 'b', 'choose-path', { choice }), false);
    assert.equal(actParty(state, 'a', 'choose-path', { choice: 'teleport' }), false);
    assert.equal(actParty(state, 'a', 'choose-path', { choice }), true);
    settle(state);
    assert.equal(state.players[0].position, choice === 'main' ? fork+1 : target);
  }
});

test('a preselected shortcut applies once at the next fork', () => {
  const [source,target]=Object.entries(BOARD_SHORTCUTS)[0];
  const state = rig({ hand: [card('ivory', 2), card('jade', 2), card('violet', 3)], position: Number(source)-1 });
  assert.equal(actParty(state, 'a', 'choose-path', { choice: 'shortcut' }), true);
  assert.equal(play(state), true);
  settle(state);
  assert.equal(state.players[0].position, target);
  assert.equal(state.players[0].shortcutChoice, null);
});

test('landing on ladders and chutes animates transport; umbrella blocks one chute', () => {
  const [ladderSource,ladderTarget]=Object.entries(BOARD_LADDERS)[0];
  const [chuteSource,chuteTarget]=Object.entries(BOARD_CHUTES).find(([from])=>BOARD_SHORTCUTS[Number(from)-1]===undefined);
  for (const [start, target, type] of [[Number(ladderSource)-1, ladderTarget, 'ladder'], [Number(chuteSource)-1, chuteTarget, 'chute']]) {
    const state = rig({ hand: [card('ivory', 1), card('jade', 2), card('violet', 3)], position: start });
    assert.equal(play(state), true);
    tickUntil(state, () => state.boardStage === 'transport');
    assert.equal(state.transport.type, type);
    assert.equal(state.transport.to, target);
    settle(state);
    assert.equal(state.players[0].position, target);
  }
  const shielded = rig({ hand: [card('ivory', 1), card('jade', 2), card('violet', 3)], position: Number(chuteSource)-1 });
  assert.equal(actParty(shielded, 'a', 'item'), true);
  assert.equal(actParty(shielded, 'a', 'item'), false);
  assert.equal(play(shielded), true);
  settle(shielded);
  assert.equal(shielded.players[0].position, Number(chuteSource));
  assert.equal(shielded.players[0].shield, false);
});

test('continuous lap bridge loops to space one and movement rewards do not mutate cards', () => {
  const state = rig({ hand: [card('ivory', 1), card('jade', 2), card('violet', 3)], position: 47 });
  state.players.slice(1).forEach((player,index)=>{player.position=10+index*12;});
  assert.equal(play(state), true);
  settle(state);
  assert.equal(state.players[0].position, 0);
  assert.equal(state.players[0].handCount, 2);
  assert.equal(state.players[0].laps,1);
  assert.equal(state.players[0].lapPoints,25);
  assert.equal(state.players[0].sparks,27,'25 lap points plus2 ordinary landing points');
  assert.equal(state.lapCelebration.playerId,'a');assert.equal(state.lapCelebration.amount,25);
  const before=state.players[0].sparks;for(let n=0;n<20;n++)stepParty(state,1);
  assert.equal(state.players[0].sparks,before,'the completed step cannot award again');
  assertConserved(state);
});

test('lap bonus waits for authoritative step completion and ignores special travel',()=>{
  const state=rig({hand:[card('ivory',1),card('jade',2),card('violet',3)],position:47});
  play(state);stepParty(state,.48);
  assert.equal(state.boardStage,'moving');assert.equal(state.players[0].laps,0);
  stepParty(state,.17);assert.equal(state.players[0].laps,0);
  stepParty(state,.02);assert.equal(state.players[0].laps,1);assert.equal(state.players[0].lapPoints,25);
  for(const type of ['shortcut','ladder','chute','door']){
    const special=make(),player=special.players[0];player.position=47;
    special.timer=.1;special.movesRemaining=1;
    if(type==='shortcut'){special.boardStage='moving';special.moveTarget=0;special.shortcutTravel=true;}
    else{special.boardStage='transport';special.transport={from:47,to:0,type};}
    stepParty(special,.11);assert.equal(player.position,0);assert.equal(player.laps,0,type);assert.equal(player.lapPoints,0,type);assert.equal(special.lapCelebration,null,type);
    assertConserved(special);
  }
});

test('two completed normal laps award twice while each traveler can interact only once per card',()=>{
  const state=rig({hand:[card('ivory',1),card('jade',2),card('violet',3)],position:47});
  state.players[0].boost=48;play(state);
  for(let n=0;n<1000&&state.currentPlayerId==='a'&&state.phase==='board';n++){
    if(state.boardStage==='choose-path')actParty(state,'a','choose-path',{choice:'main'});
    stepParty(state,.1);
  }
  assert.equal(state.currentPlayerId,'b');assert.equal(state.players[0].position,0);
  assert.equal(state.players[0].laps,2);assert.equal(state.players[0].lapPoints,50);
  assert.equal(state.players[0].sparks,58,'two laps50, three passing high-fives6, final ordinary landing2');
  assert.deepEqual(state.players.slice(1).map(player=>player.sparks),[1,1,1]);
  assert.equal(state.encounterSerial,1,'the second lap cannot repeat the same card’s contacts');assertConserved(state);
});

test('four card turns launch a minigame; host scores ties and continues preserved order', () => {
  const state = make();
  passCycle(state);
  assert.equal(state.turnsCompleted, 4);
  assert.equal(actParty(state, 'b', 'begin-minigame'), false);
  assert.equal(actParty(state, 'a', 'begin-minigame'), true);
  const before = state.players.map(player => player.sparks);
  const hands = state.players.map(player => JSON.stringify(player.hand));
  assert.equal(finishMinigame(state, [{ id: 'foreign', score: 999 }, { id: 'a', score: 20 }, { id: 'a', score: 99 }, { id: 'b', score: 20 }, { id: 'c', score: 5 }, { id: 'd', score: 1 }]), true);
  assert.deepEqual(state.results.map(result => result.award), [20, 20, 8, 4]);
  assert.deepEqual(state.players.map((player, i) => player.sparks - before[i]), [20, 20, 8, 4]);
  assert.deepEqual(state.players.map(player => JSON.stringify(player.hand)), hands);
  assert.equal(finishMinigame(state, []), false);
  assert.equal(actParty(state, 'b', 'continue'), false);
  assert.equal(actParty(state, 'a', 'continue'), true);
  assert.equal(state.round, 2);
  assert.equal(state.currentPlayerId, 'a');
});

test('minigame places pay20/12/8/4 points and rank by the new public total',()=>{
  const state=make();passCycle(state);actParty(state,'a','begin-minigame');
  finishMinigame(state,state.players.map((player,index)=>({id:player.id,score:40-index*10})));
  assert.deepEqual(state.results.map(result=>result.award),[20,12,8,4]);
  assert.deepEqual(state.players.map(player=>player.sparks),[20,12,8,4]);
  assert.deepEqual(rankPlayers(viewParty(state,'b')).map(player=>player.id),['a','b','c','d']);
});

test('all twenty-four minigames occur without repeat; party has no arbitrary round cap', () => {
  const state = make({ seed: 9, rounds: 1 });
  const games = [];
  for (let round = 0; round < 25; round++) {
    passCycle(state); games.push(state.nextGame);
    assert.equal(actParty(state, 'a', 'begin-minigame'), true);
    assert.equal(finishMinigame(state, []), true);
    assert.equal(actParty(state, 'a', 'continue'), true);
    assert.equal(state.phase, 'board');
    assertConserved(state);
  }
  assert.equal(new Set(games.slice(0, 24)).size, 24);
  assert.notEqual(games[23], games[24]);
  assert.equal(state.round, 26);
});

test('public per-seat snapshot conceals opponent cards, draw pile, random seed and game roster hands', () => {
  const state = make();
  actParty(state, 'a', 'draw-card');
  state.game = { players: state.players.map(player => ({ ...player })), kind: 0 };
  const a = viewParty(state, 'a'), b = viewParty(state, 'b');
  assert.deepEqual(a.players[0].hand, state.players[0].hand);
  assert.equal(a.drawnCardId, state.drawnCardId);
  assert.equal(b.drawnCardId, null);
  assert.equal(a.deck, undefined); assert.equal(a.rng, undefined); assert.equal(a.seed, undefined); assert.equal(a.gameDeck, undefined);
  assert.equal(a.deckCount, state.deck.length);
  for (let i = 1; i < 4; i++) assert.ok(a.players[i].hand.every(card => Object.keys(card).length === 1 && card.back === true));
  assert.ok(a.game.players.every(player => !('hand' in player)));
  assert.ok(b.players[0].hand.every(card => card.back));
  a.players[0].hand[0].value = 'tampered';
  assert.notEqual(state.players[0].hand[0].value, 'tampered');
  const observer = viewParty(state, 'stranger');
  assert.ok(observer.players.every(player => player.hand.every(card => card.back)));
});

test('ranking prioritizes points in every phase, independent of decorative lanterns', () => {
  const state = make();
  state.players[0].lanterns = 999;
  state.players[0].sparks = 999;
  state.players[1].handCount = 2;
  for(const phase of ['board','minigame-intro','minigame','results','finished']){state.phase=phase;assert.equal(rankPlayers(state)[0].id,'a');}
  assert.equal(state.players[0].id, 'a');
});

test('seeded bots finish a complete card party with conservation and JSON deterministic restore', () => {
  const state = createParty([], { seed: 719 });
  stepParty(state, .35);
  const restored = JSON.parse(JSON.stringify(state));
  let steps = 0;
  while (state.phase !== 'finished' && steps++ < 30000) {
    for (const target of [state, restored]) {
      if (target.phase === 'minigame-intro') actParty(target, target.hostId, 'begin-minigame');
      else if (target.phase === 'minigame') finishMinigame(target, target.players.map((player, index) => ({ id: player.id, score: 4 - index })));
      else if (target.phase === 'results') actParty(target, target.hostId, 'continue');
      else stepParty(target, .25);
    }
    if (steps % 100 === 0) assertConserved(state);
  }
  assert.equal(state.phase, 'finished');
  assert.deepEqual(restored, state);
  assert.equal(state.players.find(player => player.id === state.finisherId).hand.length, 0);
  assert.equal(rankPlayers(state)[0].id,state.winnerId);
  assertConserved(state);
});

test('bad timing never poisons snapshots and human card/path choices never time out', () => {
  const state = make();
  const snapshot = JSON.stringify(state);
  for (const dt of [NaN, Infinity, -1, 0]) stepParty(state, dt);
  assert.equal(JSON.stringify(state), snapshot);
  stepParty(state, 1000);
  assert.equal(state.clock, 1);
  assert.equal(state.boardStage, 'await-card');
});
