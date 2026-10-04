import {gameFont} from './game-hud.js';
import {MINIGAMES} from './minigames.js';
import {bakePaperBoard,paperBoardStats} from './paper-board.js';
export {paperBoardStats};
import {boardCamera,sampleBoardTraveler,sampleBoardEncounter} from './board-camera.js';
import {boardPadMischief,cardBuffDefinition} from './board-mischief.js';
/** Host-owned card party. All authority, cards and randomness stay on the host. */
export const CARD_COLORS = Object.freeze(['ivory', 'jade', 'violet', 'ember']);
export const CARD_SYMBOLS = Object.freeze({ ivory: '☼', jade: '♧', violet: '☾', ember: '♨', wild: '✦' });
export const CARD_PALETTE = Object.freeze({ ivory: '#eee5cb', jade: '#88bfa5', violet: '#b69adf', ember: '#dc946f', wild: '#eee5cb' });
export const BOARD_LADDERS = Object.freeze({ 5: 26, 11: 20, 28: 35 });
export const BOARD_CHUTES = Object.freeze({ 21: 10, 30: 1, 40: 23 });
export const BOARD_SHORTCUTS = Object.freeze({ 14: 17, 19: 44, 25: 38 });
const REALMS = ['WHISPERING GROVE', 'CLOCKWORK CITY', 'MUSHROOM MARSH', 'FROSTHOLLOW', 'EMBER WASTES', 'THE ETERNAL TREE'];
const SPECIALS = {
  10: 'item', 22: 'item', 34: 'item', 46: 'item', 7: 'shrine', 23: 'shrine', 39: 'shrine', 9: 'event', 20: 'event', 35: 'event',
  ...Object.fromEntries(Object.keys(BOARD_LADDERS).map(from => [from, 'ladder'])),
  ...Object.fromEntries(Object.keys(BOARD_CHUTES).map(from => [from, 'chute'])),
  ...Object.fromEntries(Object.keys(BOARD_SHORTCUTS).map(from => [from, 'fork'])),
};
export const BOARD_PAD_SYMBOLS=Object.freeze({
  ladder:Object.freeze({icon:'spark',color:'#a5b89d',symbol:'↑'}),
  chute:Object.freeze({icon:'spike',color:'#ad9ac3',symbol:'↓'}),
  fork:Object.freeze({icon:'key',color:'#d4bd8b',symbol:'⑂'}),
  item:Object.freeze({icon:'crate',color:'#c6ab83',symbol:'◇'}),
  shrine:Object.freeze({icon:'lantern',color:'#dfd1a5',symbol:'✦'}),
  event:Object.freeze({icon:'orb',color:'#b8bfd0',symbol:'?'}),
});
export const BOARD_RINGS = Object.freeze([
  Object.freeze({ x: 480, y: 285, rx: 410, ry: 182, label: 'OUTER REALMS' }),
  Object.freeze({ x: 480, y: 285, rx: 295, ry: 120, label: 'MOON CIRCUIT' }),
  Object.freeze({ x: 480, y: 285, rx: 178, ry: 59, label: 'INNER SANCTUM' }),
]);
// Equal arc-length spacing avoids crowded tokens at the narrow ends of an
// ellipse. Each complete ring has sixteen distinct stops and a visible bridge.
function ringAngles(ring,phase){
  const samples=[{angle:phase,length:0}];let distance=0,previous={x:ring.rx*Math.cos(phase),y:ring.ry*Math.sin(phase)};
  for(let n=1;n<=2048;n++){
    const angle=phase+n/2048*Math.PI*2,next={x:ring.rx*Math.cos(angle),y:ring.ry*Math.sin(angle)};
    distance+=Math.hypot(next.x-previous.x,next.y-previous.y);samples.push({angle,length:distance});previous=next;
  }
  return Array.from({length:16},(_,n)=>{
    const target=distance*n/16;let i=1;while(samples[i].length<target)i++;
    const a=samples[i-1],b=samples[i];return a.angle+(b.angle-a.angle)*(target-a.length)/(b.length-a.length);
  });
}
// Alternating the middle circuit leaves three independent routes through the
// bottom gap, so the continuous48-stop loop never needs a crossing overpass.
const RING_ANGLES=BOARD_RINGS.map((ring,index)=>{
  const angles=ringAngles(ring,Math.PI/2+index*.055);
  return index===1?angles.reverse():angles;
});
export const BOARD_SPACES = Object.freeze(Array.from({ length: 48 }, (_, index) => {
  const ring=Math.floor(index/16),shape=BOARD_RINGS[ring],angle=RING_ANGLES[ring][index%16];
  const type = SPECIALS[index] || 'spark';
  const motif=type==='spark'?boardPadMischief(index):BOARD_PAD_SYMBOLS[type];
  return Object.freeze({ x:shape.x+Math.cos(angle)*shape.rx,y:shape.y+Math.sin(angle)*shape.ry,ring,angle,type,realm:Math.floor(index/8),icon:motif.icon,color:motif.color,symbol:motif.symbol,...(type==='spark'?{mischiefId:motif.id}:{}),label:type==='spark'?motif.name:type==='ladder'?'Moon ladder':type==='chute'?'Shadow chute':type==='fork'?'Secret bridge':REALMS[Math.floor(index/8)] });
}));

function cubicRoute(a,c,d,b,t){
  const u=1-t;
  return {x:u**3*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t**3*b.x,y:u**3*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t**3*b.y};
}
function lapRoute(a,b,t){
  // Pass through the unoccupied gap between the last and first middle stops.
  // Matching tangents on both halves keeps the token's return motion smooth.
  const ring=BOARD_RINGS[1],angle=(RING_ANGLES[1][15]+RING_ANGLES[1][0]+Math.PI*2)/2;
  const mid={x:ring.x+Math.cos(angle)*ring.rx,y:ring.y+Math.sin(angle)*ring.ry};
  const tangent={x:(b.x-a.x)/6,y:(b.y-a.y)/6};
  return t<=.5
    ?cubicRoute(a,{x:a.x+(mid.x-a.x)/3,y:a.y+(mid.y-a.y)/3},{x:mid.x-tangent.x,y:mid.y-tangent.y},mid,t*2)
    :cubicRoute(mid,{x:mid.x+tangent.x,y:mid.y+tangent.y},{x:b.x-(b.x-mid.x)/3,y:b.y-(b.y-mid.y)/3},b,t*2-1);
}
/** Shared route geometry keeps animated feet on the drawn circular bridges. */
export function boardRoutePoint(from,to,t,kind='main'){
  const a=BOARD_SPACES[from],b=BOARD_SPACES[to];
  if(!a||!b||!Number.isFinite(t))throw new RangeError('A board route needs valid spaces and finite progress');
  t=Math.max(0,Math.min(1,t));const u=1-t;
  if(t===0)return {x:a.x,y:a.y};
  if(t===1)return {x:b.x,y:b.y};
  if(kind==='main'&&a.ring===b.ring&&to===from+1){
    const shape=BOARD_RINGS[a.ring],angle=a.angle+(b.angle-a.angle)*t;
    return {x:shape.x+Math.cos(angle)*shape.rx,y:shape.y+Math.sin(angle)*shape.ry};
  }
  if(kind==='ladder')return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  if(kind==='main'&&from===47&&to===0)return lapRoute(a,b,t);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
  if(kind==='chute'){
    const bend=Math.min(18,length*.16);
    return cubicRoute(a,{x:a.x+dx/3+nx*bend,y:a.y+dy/3+ny*bend},{x:a.x+dx*2/3-nx*bend,y:a.y+dy*2/3-ny*bend},b,t);
  }
  const bend=kind==='shortcut'?Math.min(14,length*.14):Math.min(10,length*.08);
  return {x:u*u*a.x+2*u*t*((a.x+b.x)/2+nx*bend)+t*t*b.x,y:u*u*a.y+2*u*t*((a.y+b.y)/2+ny*bend)+t*t*b.y};
}

const BOT_NAMES = ['MOTH', 'ECHO', 'VELLUM', 'CINDER'];
const PLAY_TIME = .78, MOVE_TIME = .18, TRANSPORT_TIME = 1.2, EVENT_TIME = 1.15, BOT_TIME = .72, GAME_COUNT = MINIGAMES.length;
export const BOARD_TIMINGS = Object.freeze({play:PLAY_TIME,move:MOVE_TIME,shortcut:.62,transport:TRANSPORT_TIME,event:EVENT_TIME});
const WAIT_STAGES = ['await-card', 'drawn-card','penalty-card','choose-chain'];
export const BOARD_EVENTS = Object.freeze([
  { id:'moon-carnival', title:'Moon Carnival', description:'A tiny paper carousel offers two prizes.', choices:[{id:'prize',label:'Claim the moon prize',description:'+8 points.'},{id:'parade',label:'Join the parade',description:'+4 points and +1 step on your next card.'}] },
  { id:'moth-procession', title:'Paper Moth Procession', description:'Lantern moths invite you to follow their secret route.', choices:[{id:'follow',label:'Follow the moths',description:'+3 steps on your next card.'},{id:'lantern',label:'Keep their lantern',description:'+5 points.'}] },
  { id:'mimic-cache', title:'The Polite Mimic', description:'A smiling suitcase offers to borrow from a rival.', choices:[{id:'borrow',label:'Borrow a rival’s treasure',description:'Take up to 5 points from the richest other player.'},{id:'gift',label:'Accept a small gift',description:'+3 points, without taking from anyone.'}] },
  { id:'midnight-bargain', title:'Midnight Bargain', description:'A moonlit merchant trades points for a heavier hand.', choices:[{id:'bargain',label:'Take the midnight deal',description:'+12 points and draw 1 card.'},{id:'safe',label:'Take the safe gift',description:'+4 points, no card.'}] },
  { id:'folded-door', title:'The Folded Door', description:'A cardboard door opens onto a nearby platform.', choices:[{id:'enter',label:'Step through the door',description:'Move to the marked nearby platform. No lap reward or second landing event.'},{id:'picnic',label:'Stay for a paper picnic',description:'+4 points.'}] },
  { id:'clockwork-reversal', title:'Clockwork Tea Party', description:'The clockmaker lets you wind the journey backward.', choices:[{id:'reverse',label:'Reverse the turn order',description:'Players take their next turns in the opposite order.'},{id:'wind',label:'Wind your own boots',description:'+2 steps on your next card.'}] },
  { id:'umbrella-rain', title:'Umbrella Rain', description:'Folded umbrellas fall like leaves.', choices:[{id:'shelter',label:'Catch a protective umbrella',description:'+3 points and protection from the next chute.'},{id:'collect',label:'Collect the silver raindrops',description:'+7 points.'}] },
  {id:'clockwork-clinic',title:'The Clockwork Clinic',description:'A folded automaton needs a steady hand. The alarm wakes every workstation.',choices:[{id:'repair',label:'Open the clinic',description:'Clockwork Surgery becomes the next party challenge.'},{id:'donate',label:'Donate a spare gear',description:'+4 points.'}]},
  {id:'tower-workshop',title:'The Tottering Workshop',description:'A creased cathedral tower sways above the road. Each missing support changes its balance.',choices:[{id:'build',label:'Challenge the tower',description:'Tottering Tower becomes the next party challenge.'},{id:'brace',label:'Brace the bridge',description:'+2 steps on your next card.'}]},
].map(event=>Object.freeze({...event,choices:Object.freeze(event.choices.map(choice=>Object.freeze(choice)))})));
export const BOARD_STORY_TILES = Object.freeze({
  9:Object.freeze({title:'Moon Carnival',doorTarget:7}),
  20:Object.freeze({title:'Clockwork Fair',doorTarget:22}),
  35:Object.freeze({title:'Folded Market',doorTarget:37}),
});

/** The last card closes the match; its owner receives a quarter of their points. */
export function finishingBonus(player) {
  return Math.ceil(Math.max(0,Number.isFinite(player?.sparks)?player.sparks:0)*.25);
}
function comparePoints(a,b,finisherId) {
  return (b.sparks||0)-(a.sparks||0) || Number(b.id===finisherId)-Number(a.id===finisherId)
    || (b.wins||0)-(a.wins||0) || (a.handCount??a.hand?.length??0)-(b.handCount??b.hand?.length??0) || a.seat-b.seat;
}
/** Pure public-data projection, so clients can weigh their final card privately. */
export function finishProjection(state,playerId,{buff=null}={}) {
  const player=state?.players?.find(candidate=>candidate.id===playerId);
  if(!player)return null;
  const finished=state.phase==='finished',cardPoints=finished?0:cardBuffDefinition(buff)?.points||0,base=(player.sparks||0)+cardPoints;
  const bonus=finished?(state.finisherId===playerId?state.finishBonus||0:0):finishingBonus({...player,sparks:base});
  const points=base+(finished?0:bonus),finisherId=finished?state.finisherId:playerId;
  const ordered=state.players.map(candidate=>candidate.id===playerId&&!finished?{...candidate,sparks:points,handCount:0}:candidate).sort((a,b)=>comparePoints(a,b,finisherId));
  const rank=ordered.findIndex(candidate=>candidate.id===playerId)+1;
  return {playerId,bonus,points,rank,wouldWin:rank===1,winnerId:ordered[0].id,standings:ordered.map((candidate,index)=>({id:candidate.id,name:candidate.name,points:candidate.sparks||0,rank:index+1}))};
}

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
function shuffle(state, cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function logEvent(state, message, type = 'info', detail = {}) {
  state.message = message;
  state.eventSerial=(state.eventSerial||0)+1;
  state.lastEvent = { message, type, ...detail,serial:state.eventSerial,at:state.clock };
  state.history.push({ round: state.round, ...state.lastEvent });
  if (state.history.length > 32) state.history.shift();
}
function syncCounts(state) {
  state.deckCount = state.deck.length;
  state.players.forEach(player => { player.handCount = player.hand.length; });
}
function deck108() {
  const deck = [];
  for (const color of CARD_COLORS) {
    for (let number = 0; number <= 9; number++) {
      for (let copy = 0; copy < (number === 0 ? 1 : 2); copy++) deck.push({ id: `${color}-${number}-${copy}`, color, value: String(number) });
    }
    for (const value of ['skip', 'reverse', 'draw2']) for (let copy = 0; copy < 2; copy++) deck.push({ id: `${color}-${value}-${copy}`, color, value });
  }
  for (const value of ['wild', 'draw4']) for (let copy = 0; copy < 4; copy++) deck.push({ id: `wild-${value}-${copy}`, color: 'wild', value });
  return deck;
}
function drawCards(state, player, count) {
  let drawn = null, actual = 0;
  for (let i = 0; i < count; i++) {
    if (!state.deck.length && state.discard.length > 1) {
      const top = state.discard.pop();
      state.deck = shuffle(state, state.discard);
      state.discard = [top];
    }
    if (!state.deck.length) break;
    drawn = state.deck.pop();
    player.hand.push(drawn);
    actual++;
  }
  if (actual) player.calledLast = false;
  syncCounts(state);
  return { drawn, actual };
}
function nextGame(state) {
  if(Number.isInteger(state.queuedGame)&&state.queuedGame>=0&&state.queuedGame<GAME_COUNT){state.nextGame=state.queuedGame;state.queuedGame=null;state.gameDeck=state.gameDeck.filter(index=>index!==state.nextGame);return;}
  if (!state.gameDeck.length) {
    state.gameDeck = shuffle(state, Array.from({ length: GAME_COUNT }, (_, i) => i));
    if (state.gameDeck.at(-1) === state.nextGame) [state.gameDeck[0], state.gameDeck[GAME_COUNT - 1]] = [state.gameDeck[GAME_COUNT - 1], state.gameDeck[0]];
  }
  state.nextGame = state.gameDeck.pop();
}

export function createParty(players = [], { seed = 123 } = {}) {
  if (!Array.isArray(players) || players.length > 4) throw new Error('A party supports up to four players.');
  const ids = new Set();
  const roster = players.map((player, seat) => {
    const id = String(player.id ?? `player-${seat + 1}`);
    if (ids.has(id)) throw new Error('Every player must have a unique id.');
    ids.add(id);
    return { id, name: String(player.name || `Traveler ${seat + 1}`).slice(0, 24), character: player.character ?? seat, bot: Boolean(player.bot) };
  });
  while (roster.length < 4) {
    const seat = roster.length;
    let id = `bot-${seat + 1}`;
    while (ids.has(id)) id += '-bot';
    ids.add(id);
    roster.push({ id, name: BOT_NAMES[seat], character: seat, bot: true });
  }
  const state = {
    version: 3, phase: 'board', boardStage: 'await-card',
    players: roster.map((player, seat) => ({ ...player, seat, position: 0, fromPosition: 0, sparks: 0, laps:0, lapPoints:0, lanterns: 0, item: 'shield', boost: 0, shield: false, direction: 1, wins: 0, totalScore: 0, hand: [], handCount: 0, calledLast: false, shortcutChoice: null })),
    hostId: roster.find(player => !player.bot)?.id || roster[0].id,
    round: 1, totalRounds: null, turnIndex: 0, turnDirection: 1, turnsCompleted: 0, currentPlayerId: roster[0].id,
    movesRemaining: 0, moveTotal: 0, moveTarget: null, pathOptions: [], transport: null,
    timer: BOT_TIME, clock: 0, rng: Number.isFinite(seed) ? seed >>> 0 : 123,
    deck: [], deckCount: 0, discard: [], activeColor: null, drawnCardId: null, lastPlayedCard: null, lastCardPlayerId: null,
    skipNext: false, winnerId: null, finisherId:null, finishBonus:0, nextGame: null,queuedGame:null, gameDeck: [], playedGames: [], results: [], history: [], lastEvent: null,eventSerial:0,cardTravelStartedAt:null,lastCardPlayedAt:null,
    turnOrder:roster.map(player=>player.id),turnOrderRevision:0,pendingDraw:0,pendingDrawValue:null,chainValue:null,chainCount:0,mischiefSerial:0,padEvent:null,
    storyDeck:[],storySerial:0,pendingEvent:null,storyEvent:null,lapSerial:0,lapCelebration:null,
    encounterSerial:0,boardEncounter:null,boardEncounters:[],cardEncounteredIds:[],
    message: `${roster[0].name}, match the color or symbol. Last card ends the game with a 25% bonus; most points wins.`,
  };
  state.deck = shuffle(state, deck108());
  // A few physical cards carry printed surprises. Their metadata stays inside
  // the host deck or its owner's masked view until that card is actually played.
  state.deck.forEach((card,index)=>{if(index%13===7)card.buff=['boost','shine','shuffle'][Math.floor(index/13)%3];});
  for (let count = 0; count < 7; count++) for (const player of state.players) drawCards(state, player, 1);
  // A numbered opening card avoids special-card opening-turn ambiguities.
  const initialIndex = state.deck.findLastIndex(card => /^\d$/.test(card.value));
  const initial = state.deck.splice(initialIndex, 1)[0];
  state.discard.push(initial);
  state.activeColor = initial.color;
  syncCounts(state);
  return state;
}

/** Legal card objects for UI/bots. Masks returned by viewParty never become playable. */
export function playableCards(state, playerId) {
  if (!state || state.phase !== 'board' || !WAIT_STAGES.includes(state.boardStage) || state.currentPlayerId !== playerId) return [];
  const player = state.players.find(player => player.id === playerId), top = state.discard.at(-1);
  if (!player || !top) return [];
  return player.hand.filter(card => {
    if (card.back || (state.boardStage === 'drawn-card' && state.drawnCardId !== card.id)) return false;
    if(state.boardStage==='choose-chain')return /^\d$/.test(state.chainValue||'')&&card.value===state.chainValue;
    if(state.boardStage==='penalty-card')return state.pendingDraw>0&&card.value===state.pendingDrawValue;
    if (card.value === 'draw4') return !player.hand.some(other => other.color === state.activeColor);
    return card.color === 'wild' || card.color === state.activeColor || card.value === top.value;
  });
}
function nextSeat(state, distance = 1) {
  const order=state.turnOrder||state.players.map(player=>player.id),current=state.players[state.turnIndex]?.id,index=order.indexOf(current);
  const id=order[((index<0?state.turnIndex:index)+distance*state.turnDirection+order.length*distance)%order.length];
  return state.players.findIndex(player=>player.id===id);
}
function prepareTurn(state) {
  const player = state.players[state.turnIndex];
  state.currentPlayerId = player.id;
  state.boardStage = state.pendingDraw>0?'penalty-card':'await-card';
  state.drawnCardId = null;
  state.pathOptions = [];
  state.moveTarget = null;
  state.movesRemaining = 0;
  state.chainValue=null;state.chainCount=0;state.moveTotal=0;
  state.timer = BOT_TIME;
  player.calledLast = false;
  player.shortcutChoice = null;
  state.message = state.pendingDraw>0?`${player.name}: stack another ${state.pendingDrawValue==='draw2'?'+2':'+4'} or take ${state.pendingDraw} cards.`:`${player.name}, match ${state.activeColor} ${CARD_SYMBOLS[state.activeColor]} or the discard symbol.`;
}
function endTurn(state) {
  state.turnsCompleted++;
  state.turnIndex = nextSeat(state, state.skipNext ? 2 : 1);
  state.skipNext = false;
  state.drawnCardId = null;
  state.movesRemaining = 0;
  state.pathOptions = [];
  state.moveTarget = null;
  if (state.turnsCompleted % 4 === 0) {
    state.phase = 'minigame-intro';
    state.currentPlayerId = null;
    state.timer = 0;
    nextGame(state);
    logEvent(state, 'Four turns complete. The realms open a new challenge!', 'minigame');
  } else prepareTurn(state);
}
function moveAmount(card) {
  return /^\d$/.test(card.value) ? Math.max(1, Number(card.value)) : card.color === 'wild' ? 5 : 4;
}
function moveTo(state, target, shortcut = false) {
  state.boardStage = 'moving';
  state.moveTarget = target;
  state.shortcutTravel = shortcut;
  state.timer = shortcut ? .62 : MOVE_TIME;
}
function planStep(state) {
  const player = state.players[state.turnIndex];
  if (BOARD_SHORTCUTS[player.position] !== undefined) {
    state.pathOptions = [
      { choice: 'main', label: 'Circle onward', target: (player.position + 1) % BOARD_SPACES.length },
      { choice: 'shortcut', label: `Secret bridge to ${BOARD_SPACES[BOARD_SHORTCUTS[player.position]].label}`, target: BOARD_SHORTCUTS[player.position] },
    ];
    if (player.shortcutChoice) {
      const choice = state.pathOptions.find(option => option.choice === player.shortcutChoice);
      player.shortcutChoice = null;
      state.pathOptions = [];
      moveTo(state, choice.target, choice.choice === 'shortcut');
      if(choice.choice==='shortcut')logEvent(state,`${player.name} crosses a secret bridge.`,'shortcut',{id:player.id,target:choice.target});
    } else {
      state.boardStage = 'choose-path';
      state.timer = BOT_TIME;
      logEvent(state, `${player.name}: a fork! Circle onward or cross the secret bridge.`, 'fork', { id: player.id });
    }
  } else moveTo(state, (player.position + 1) % BOARD_SPACES.length);
}
function beginStory(state,player) {
  if(!state.storyDeck?.length)state.storyDeck=shuffle(state,BOARD_EVENTS.map(event=>event.id));
  const eventId=state.storyDeck.pop(),event=BOARD_EVENTS.find(candidate=>candidate.id===eventId);
  const tile=player.position,doorTarget=BOARD_STORY_TILES[tile]?.doorTarget;
  state.pendingEvent={...event,choices:event.choices.map(choice=>({...choice,...(event.id==='folded-door'&&choice.id==='enter'?{description:`Fold into ${BOARD_SPACES[doorTarget].label}. No lap reward or second landing event.`,target:doorTarget}:{})})),tile,space:tile,playerId:player.id,startedAt:state.clock,instanceId:`story-${++state.storySerial}`};
  state.boardStage='choose-event';state.timer=BOT_TIME;
  logEvent(state,`${player.name} finds ${event.title}. Choose what happens next.`, 'story-choice',{id:player.id,eventId:event.id,space:tile});
}
function resolveStory(state,player,choiceId) {
  const event=state.pendingEvent,choice=event?.choices.find(candidate=>candidate.id===choiceId);
  if(!event||event.playerId!==player.id||!choice)return false;
  const effects=[];
  const points=(target,amount)=>{target.sparks+=amount;effects.push({type:'points',playerId:target.id,amount});};
  const boost=amount=>{player.boost+=amount;effects.push({type:'boost',playerId:player.id,amount});};
  let description='';
  if(event.id==='moon-carnival'){
    points(player,choiceId==='prize'?8:4);if(choiceId==='parade')boost(1);
    description=choiceId==='prize'?'The carousel pays out 8 points.':'The parade brings 4 points and +1 step on your next card.';
  }else if(event.id==='moth-procession'){
    if(choiceId==='follow')boost(3);else points(player,5);
    description=choiceId==='follow'?'The moths grant +3 steps on your next card.':'Their lantern holds 5 points.';
  }else if(event.id==='mimic-cache'){
    if(choiceId==='borrow'){
      const rival=rankPlayers(state).find(candidate=>candidate.id!==player.id),amount=Math.min(5,Math.max(0,rival?.sparks||0));
      if(rival)points(rival,-amount);points(player,amount);
      description=`The suitcase borrows ${amount} points from ${rival?.name||'nobody'}.`;
    }else{points(player,3);description='The polite suitcase gives you 3 points.';}
  }else if(event.id==='midnight-bargain'){
    points(player,choiceId==='bargain'?12:4);
    if(choiceId==='bargain'){const {actual}=drawCards(state,player,1);effects.push({type:'cards',playerId:player.id,amount:actual});description=`The deal grants 12 points and adds ${actual} card${actual===1?'':'s'} to your hand.`;}
    else description='The merchant gives you 4 points with no extra card.';
  }else if(event.id==='folded-door'){
    if(choiceId==='enter'){
      const to=BOARD_STORY_TILES[event.tile].doorTarget;
      state.transport={from:player.position,to,type:'door',eventId:event.id};
      effects.push({type:'teleport',playerId:player.id,from:player.position,to});
      description=`The door opens into ${BOARD_SPACES[to].label}. This hop grants no lap or landing reward.`;
    }else{points(player,4);description='Your paper picnic comes with 4 points.';}
  }else if(event.id==='clockwork-reversal'){
    if(choiceId==='reverse'){state.turnDirection*=-1;effects.push({type:'turn-order',direction:state.turnDirection});description='The clockwork table reverses the turn order.';}
    else{boost(2);description='Clockwork boots grant +2 steps on your next card.';}
  }else if(event.id==='umbrella-rain'){
    points(player,choiceId==='shelter'?3:7);
    if(choiceId==='shelter'){player.shield=true;effects.push({type:'shield',playerId:player.id});description='Catch 3 points and an umbrella against the next chute.';}
    else description='Silver raindrops turn into 7 points.';
  }
  if(event.id==='clockwork-clinic'||event.id==='tower-workshop'){
    const challenge=event.id==='clockwork-clinic'?'clockwork-surgery':'tottering-tower';
    if(choiceId==='repair'||choiceId==='build'){state.queuedGame=MINIGAMES.findIndex(game=>game.id===challenge);effects.push({type:'challenge',game:challenge});description=`The next challenge is ${event.title==='The Clockwork Clinic'?'Clockwork Surgery':'Tottering Tower'}.`;}
    else if(choiceId==='donate'){points(player,4);description='Your spare gear earns 4 points.';}else{boost(2);description='Your bridge brace grants +2 steps on the next card.';}
  }
  state.storyEvent={id:event.id,instanceId:event.instanceId,playerId:player.id,title:event.title,description,kind:event.id,startedAt:state.clock,duration:3,space:event.tile,tile:event.tile,choice:choiceId,effects};
  state.pendingEvent=null;
  state.boardStage=state.transport?'transport':'event';state.timer=state.transport?TRANSPORT_TIME:EVENT_TIME;
  logEvent(state,`${player.name}: ${description}`,'story',{id:player.id,eventId:event.id,choice:choiceId,space:event.tile,effects});
  return true;
}
function botStoryChoice(state,player) {
  if(state.pendingEvent?.id==='clockwork-clinic')return 'repair';
  if(state.pendingEvent?.id==='tower-workshop')return 'build';
  const event=state.pendingEvent;
  if(event.id==='mimic-cache')return state.players.some(other=>other.id!==player.id&&other.sparks>=3)?'borrow':'gift';
  if(event.id==='midnight-bargain')return player.handCount<=2&&finishProjection(state,player.id).wouldWin?'safe':'bargain';
  if(event.id==='folded-door')return 'enter';
  if(event.id==='clockwork-reversal')return state.players[nextSeat(state)].handCount<=2?'reverse':'wind';
  if(event.id==='umbrella-rain')return player.shield?'collect':'shelter';
  if(event.id==='moth-procession')return player.position>=42?'follow':'lantern';
  return 'prize';
}
function meetTravelers(state,player,landing) {
  const seen=state.cardEncounteredIds||= [];
  const others=state.players.filter(other=>other.id!==player.id&&other.position===player.position&&!seen.includes(other.id));
  if(!others.length)return;
  const moves=[],effects=[];
  const points=(target,amount)=>{target.sparks+=amount;effects.push({type:'points',playerId:target.id,amount});};
  for(const other of others){
    seen.push(other.id);
    if(landing){
      const from=other.position,blocked=Boolean(other.shield);
      if(blocked)other.shield=false;
      else{other.fromPosition=from;other.position=(from+BOARD_SPACES.length-2)%BOARD_SPACES.length;points(player,3);}
      moves.push({playerId:other.id,from,to:other.position,blocked});
    }else{points(player,2);points(other,1);}
  }
  state.boardEncounter={id:`encounter-${++state.encounterSerial}`,type:landing?'bump':'high-five',playerId:player.id,targetIds:others.map(other=>other.id),space:player.position,from:player.fromPosition,to:player.position,startedAt:state.clock,duration:1.2,moves,effects};
  state.boardEncounters=[...(state.boardEncounters||[]).filter(event=>state.clock-event.startedAt<event.duration),state.boardEncounter].slice(-6);
  const blocked=moves.filter(move=>move.blocked).length;
  logEvent(state,landing?`${player.name} bumps ${others.length-blocked} traveler${others.length-blocked===1?'':'s'} back two platforms${blocked?`; ${blocked} umbrella${blocked===1?'':'s'} block the nudge`:''}.`:`${player.name} trades paper high-fives: +2 points per traveler, +1 for each friend.`,'encounter',{id:player.id,kind:state.boardEncounter.type,targetIds:state.boardEncounter.targetIds,blockedIds:moves.filter(move=>move.blocked).map(move=>move.playerId)});
}
function shuffleTurnOrder(state){
  const previous=state.turnOrder||state.players.map(player=>player.id),order=shuffle(state,[...previous]);
  if(order.every((id,index)=>id===previous[index]))order.push(order.shift());
  state.turnOrder=order;state.turnOrderRevision=(state.turnOrderRevision||0)+1;
  return [...order];
}
function padMischief(state,player){
  const pad=boardPadMischief(player.position),rule=pad.effect,effects=[];
  const points=(target,amount)=>{const actual=Math.max(-(target.sparks||0),amount);target.sparks+=actual;effects.push({type:'points',playerId:target.id,amount:actual});return actual;};
  let result='';
  if(rule.type==='points'){points(player,rule.points);result=`+${rule.points} points.`;}
  else if(rule.type==='toll'){const lost=-points(player,-rule.points);result=`The thorns take ${lost} points.`;}
  else if(rule.type==='boost'||rule.type==='bank'){
    if(rule.points)points(player,rule.points);player.boost+=rule.boost;
    effects.push({type:'boost',playerId:player.id,amount:rule.boost});result=`${rule.points?`+${rule.points} points and `:''}+${rule.boost} steps on your next play.`;
  }else if(rule.type==='shelter'){player.shield=true;effects.push({type:'shield',playerId:player.id});result='An umbrella catches your next chute or bump.';}
  else if(rule.type==='lantern'){player.lanterns+=rule.lanterns;points(player,rule.points);effects.push({type:'lantern',playerId:player.id,amount:rule.lanterns});result=`A lantern and ${rule.points} points.`;}
  else if(rule.type==='steal'){
    const rival=rankPlayers(state).find(other=>other.id!==player.id),amount=Math.min(rule.points,Math.max(0,rival?.sparks||0));
    if(rival)points(rival,-amount);points(player,amount);result=`Borrow ${amount} points from ${rival?.name||'the shadows'}.`;
  }else if(rule.type==='card-buff'){
    const eligible=player.hand.filter(card=>!card.buff);
    if(eligible.length){eligible[Math.floor(random(state)*eligible.length)].buff=rule.buff;effects.push({type:'card-buff',playerId:player.id,buff:rule.buff,amount:1});result=`One private card gains ${cardBuffDefinition(rule.buff).name}.`;}
    else{points(player,2);result='Every card is enchanted already: +2 points.';}
  }else if(rule.type==='all-points'){for(const other of state.players)points(other,rule.points);result=`Every traveler catches ${rule.points} points.`;}
  else if(rule.type==='draw-prize'){points(player,rule.points);const {actual}=drawCards(state,player,rule.draw);effects.push({type:'cards',playerId:player.id,amount:actual});result=`+${rule.points} points; the hungry cache adds ${actual} card.`;}
  state.padEvent={id:`pad-${++state.mischiefSerial}`,kind:pad.id,title:pad.name,icon:pad.icon,color:pad.color,playerId:player.id,space:player.position,startedAt:state.clock,duration:2.6,effects};
  logEvent(state,`${player.name}: ${pad.name}. ${result}`,'mischief',{id:player.id,kind:pad.id,space:player.position,effects});
}
function landingReward(state, transported = false) {
  const player = state.players[state.turnIndex], space = BOARD_SPACES[player.position];
  if (!transported && BOARD_LADDERS[player.position] !== undefined) {
    state.transport = { from: player.position, to: BOARD_LADDERS[player.position], type: 'ladder' };
    state.boardStage = 'transport'; state.timer = TRANSPORT_TIME;
    logEvent(state, `${player.name} climbs a moon ladder to ${BOARD_SPACES[state.transport.to].label}!`, 'ladder', { id: player.id });
    return;
  }
  if (!transported && BOARD_CHUTES[player.position] !== undefined) {
    if (player.shield) {
      player.shield = false;
      logEvent(state, `${player.name}'s umbrella catches the shadow chute. Safe!`, 'shield', { id: player.id });
    } else {
      state.transport = { from: player.position, to: BOARD_CHUTES[player.position], type: 'chute' };
      state.boardStage = 'transport'; state.timer = TRANSPORT_TIME;
      logEvent(state, `${player.name} slides into ${BOARD_SPACES[state.transport.to].label}!`, 'chute', { id: player.id });
      return;
    }
  } else if (space.type === 'item') {
    if (!player.item) player.item = random(state) < .5 ? 'shield' : 'boost';
    else player.sparks += 3;
    logEvent(state, `${player.name} discovers a ${player.item === 'shield' ? 'chute umbrella' : 'three-step boost'} in the cache.`, 'item', { id: player.id });
  } else if (space.type === 'shrine') {
    player.lanterns++;
    player.sparks += 4;
    logEvent(state, `${player.name} lights a realm lantern and finds 4 points. Most points wins!`, 'lantern', { id: player.id });
  } else if (space.type === 'event') {
    beginStory(state,player);
    return;
  } else if(space.type==='spark')padMischief(state,player);
  else if(space.type==='fork'){
    player.boost+=1;logEvent(state,`${player.name} finds a folded signpost: +1 step, with a secret path ahead.`,'fork',{id:player.id,space:player.position,boost:1});
  }
  state.boardStage = 'event';
  state.timer = EVENT_TIME;
}
function playCard(state, player, card, color) {
  const chaining=state.boardStage==='choose-chain',buff=cardBuffDefinition(card.buff);
  player.hand.splice(player.hand.findIndex(other => other.id === card.id), 1);
  state.discard.push(card);
  state.activeColor = card.color === 'wild' ? color : card.color;
  state.drawnCardId = null;
  state.lastPlayedCard = { ...card };
  state.lastCardPlayerId = player.id;
  state.lastCardPlayedAt=state.clock;
  state.cardTravelStartedAt=null;
  if (card.value === 'reverse') state.turnDirection *= -1;
  let buffEffect='';
  if(buff?.id==='shine'){player.sparks+=3;buffEffect='The gilded fold adds 3 points.';}
  if(buff?.id==='shuffle'){shuffleTurnOrder(state);buffEffect='The clockwork fold shuffles the turn order.';}
  state.skipNext = card.value==='skip';
  const target = state.players[nextSeat(state)];
  const penalty = card.value === 'draw2' ? 2 : card.value === 'draw4' ? 4 : 0;
  let effect = card.value === 'reverse' ? 'Turn order reverses.' : card.value === 'skip' ? `${target.name} skips a turn.` : '';
  if (penalty) {
    state.pendingDraw=(state.pendingDraw||0)+penalty;state.pendingDrawValue=card.value;
    effect = `${target.name} must stack another ${card.value==='draw2'?'+2':'+4'} or draw ${state.pendingDraw}.`;
  }
  if (player.hand.length === 1 && !player.calledLast) {
    drawCards(state, player, 2);
    effect += ` ${player.name} forgot LAST LIGHT and draws 2.`;
  }
  player.calledLast = false;
  syncCounts(state);
  logEvent(state, `${player.name} ${chaining?'chains':'plays'} ${card.color === 'wild' ? 'WILD' : card.color.toUpperCase()} ${card.value.toUpperCase()}. ${effect} ${buffEffect}`.trim(), 'card', { id: player.id,targetId:target.id,cardValue:card.value,penalty,pendingDraw:state.pendingDraw||0,buff:buff?.id||null,chained:chaining,...(buff?.id==='shuffle'?{turnOrder:[...state.turnOrder]}:{}) });
  if (player.hand.length === 0) {
    state.finisherId=player.id;
    state.finishBonus=finishingBonus(player);
    player.sparks+=state.finishBonus;
    state.winnerId = rankPlayers(state)[0].id;
    state.phase = 'finished';
    state.currentPlayerId = null;
    state.pendingDraw=0;state.pendingDrawValue=null;state.chainValue=null;
    const winner=state.players.find(candidate=>candidate.id===state.winnerId);
    logEvent(state, `${player.name} clears their hand and earns a ${state.finishBonus}-point finishing bonus. ${winner.name} wins with ${winner.sparks} points!`, 'winner', { id:winner.id,finisherId:player.id,bonus:state.finishBonus });
    return;
  }
  state.moveTotal = (chaining?state.moveTotal:0)+moveAmount(card)+player.boost+(buff?.id==='boost'?2:0);
  state.movesRemaining = state.moveTotal;
  if(!chaining)state.cardEncounteredIds=[];
  state.chainValue=/^\d$/.test(card.value)?card.value:null;state.chainCount=chaining?state.chainCount+1:1;
  player.boost = 0;
  state.boardStage = 'playing-card';
  state.timer = PLAY_TIME;
}

/** Returns false for out-of-turn, malformed, illegal or phase-inappropriate input. */
export function actParty(state, playerId, action, payload = {}) {
  if (!state || !state.players) return false;
  if (action === 'begin-minigame') {
    if (state.phase !== 'minigame-intro' || playerId !== state.hostId) return false;
    state.phase = 'minigame';
    state.playedGames.push(state.nextGame);
    state.message = 'The realm is alive. Find its secret.';
    return true;
  }
  if (action === 'continue') {
    if (state.phase !== 'results' || playerId !== state.hostId) return false;
    state.round = 1 + Math.floor(state.turnsCompleted / 4);
    state.phase = 'board';
    state.results = [];
    delete state.game;
    prepareTurn(state);
    return true;
  }
  if (state.phase !== 'board' || state.currentPlayerId !== playerId) return false;
  const player = state.players[state.turnIndex];
  if (!player || player.id !== playerId) return false;
  if(action==='choose-event')return state.boardStage==='choose-event'&&typeof payload?.choice==='string'&&resolveStory(state,player,payload.choice);
  if(action==='end-chain'){
    if(state.boardStage!=='choose-chain')return false;
    state.chainValue=null;state.cardTravelStartedAt=state.clock;planStep(state);return true;
  }
  if (action === 'choose-path') {
    if (!['main', 'shortcut'].includes(payload?.choice)) return false;
    if (WAIT_STAGES.includes(state.boardStage)) {
      player.shortcutChoice = payload.choice;
      return true;
    }
    if (state.boardStage !== 'choose-path') return false;
    const path = state.pathOptions.find(option => option.choice === payload.choice);
    if (!path) return false;
    state.pathOptions = [];
    moveTo(state, path.target, path.choice === 'shortcut');
    if(path.choice==='shortcut')logEvent(state,`${player.name} crosses a secret bridge.`,'shortcut',{id:player.id,target:path.target});
    return true;
  }
  if (!WAIT_STAGES.includes(state.boardStage)) return false;
  if (action === 'call-last') {
    if (player.hand.length !== 2 || player.calledLast) return false;
    player.calledLast = true;
    logEvent(state, `${player.name} calls LAST LIGHT before playing down to one card.`, 'last-light', { id: player.id });
    return true;
  }
  if (action === 'item') {
    if (player.item === 'boost') player.boost += 3;
    else if (player.item === 'shield' && !player.shield) player.shield = true;
    else return false;
    logEvent(state, `${player.name} uses a ${player.item === 'boost' ? 'three-step boost' : 'chute umbrella'}.`, 'item', { id: player.id });
    player.item = null;
    return true;
  }
  if (action === 'draw-card') {
    if(state.boardStage==='penalty-card'){
      const debt=state.pendingDraw,kind=state.pendingDrawValue,{actual}=drawCards(state,player,debt);
      state.pendingDraw=0;state.pendingDrawValue=null;
      logEvent(state,`${player.name} accepts the ${kind==='draw2'?'+2':'+4'} stack: draws ${actual} cards and rests this turn.`,'draw',{id:player.id,penalty:debt,amount:actual});
      endTurn(state);return true;
    }
    if (state.boardStage !== 'await-card') return false;
    const { drawn } = drawCards(state, player, 1);
    state.drawnCardId = drawn?.id || null;
    state.boardStage = 'drawn-card';
    state.timer = BOT_TIME;
    logEvent(state, drawn ? `${player.name} draws one card. Play that card if it matches, or pass.` : 'The draw pile is empty. Pass to continue.', 'draw', { id: player.id });
    return true;
  }
  if (action === 'pass') {
    if (state.boardStage !== 'drawn-card') return false;
    logEvent(state, `${player.name} passes.`, 'pass', { id: player.id });
    endTurn(state);
    return true;
  }
  if (action !== 'play-card' || typeof payload?.cardId !== 'string') return false;
  const card = playableCards(state, playerId).find(card => card.id === payload.cardId);
  if (!card || (card.color === 'wild' && !CARD_COLORS.includes(payload?.color))) return false;
  playCard(state, player, card, payload?.color);
  return true;
}
function botTurn(state, player) {
  if (player.item) actParty(state, player.id, 'item');
  const legal = playableCards(state, player.id);
  if(state.boardStage==='choose-chain'&&(!legal.length||(player.hand.length===1&&!finishProjection(state,player.id,{buff:player.hand[0]?.buff}).wouldWin))){actParty(state,player.id,'end-chain');return;}
  // Ending the match while behind gives the crown away. Keep playing for points.
  if (!legal.length || (player.hand.length===1&&!finishProjection(state,player.id,{buff:player.hand[0]?.buff}).wouldWin)) {
    actParty(state, player.id, state.boardStage === 'drawn-card' ? 'pass' : state.boardStage==='choose-chain'?'end-chain':'draw-card');
    return;
  }
  if (player.hand.length === 2) actParty(state, player.id, 'call-last');
  // Keep wilds for difficult matches; action cards are useful when opponents are close.
  const danger = state.players[nextSeat(state)].hand.length <= 2;
  legal.sort((a, b) => (a.color === 'wild') - (b.color === 'wild') || (danger ? Number(['skip', 'draw2'].includes(b.value)) - Number(['skip', 'draw2'].includes(a.value)) : 0));
  const card = legal[0];
  const color = [...CARD_COLORS].sort((a, b) => player.hand.filter(c => c.color === b).length - player.hand.filter(c => c.color === a).length)[0];
  actParty(state, player.id, 'play-card', { cardId: card.id, color });
}

/** Advances animation and bot decisions. Human cards/path/event choices never time out. */
export function stepParty(state, dt) {
  if (!state || !Number.isFinite(dt) || dt <= 0 || state.phase !== 'board') return;
  let remaining = Math.min(dt, 1);
  state.clock += remaining;
  if(state.boardEncounters?.length)state.boardEncounters=state.boardEncounters.filter(event=>state.clock-event.startedAt<event.duration);
  for (let transitions = 0; transitions < 32 && remaining > 1e-8 && state.phase === 'board'; transitions++) {
    const player = state.players[state.turnIndex];
    if ((WAIT_STAGES.includes(state.boardStage) || ['choose-path','choose-event'].includes(state.boardStage)) && !player.bot) break;
    const elapsed = Math.min(remaining, Math.max(0, state.timer));
    state.timer -= elapsed;
    remaining -= elapsed;
    if (state.timer > 1e-8) break;
    if (WAIT_STAGES.includes(state.boardStage)) botTurn(state, player);
    else if (state.boardStage === 'choose-path') actParty(state, player.id, 'choose-path', { choice: random(state) < .72 ? 'shortcut' : 'main' });
    else if (state.boardStage === 'choose-event') actParty(state,player.id,'choose-event',{choice:botStoryChoice(state,player)});
    else if (state.boardStage === 'playing-card'){
      const canChain=state.chainValue!==null&&player.hand.some(card=>card.value===state.chainValue);
      if(canChain){state.boardStage='choose-chain';state.timer=BOT_TIME;state.message=`${player.name} can chain another ${state.chainValue}, or unfold the journey.`;}
      else{state.chainValue=null;state.cardTravelStartedAt=state.clock;planStep(state);}
    }
    else if (state.boardStage === 'moving') {
      player.fromPosition = player.position;
      player.position = state.moveTarget;
      if(player.fromPosition===47&&player.position===0&&!state.shortcutTravel){
        player.laps=(player.laps||0)+1;player.lapPoints=(player.lapPoints||0)+25;player.sparks+=25;
        state.lapCelebration={id:`lap-${++state.lapSerial}`,playerId:player.id,points:25,amount:25,lap:player.laps,startedAt:state.clock,duration:3};
        logEvent(state,`${player.name} completes lap ${player.laps}: +25 points!`,'lap',{id:player.id,points:25,lap:player.laps});
      }
      state.moveTarget = null;
      state.movesRemaining--;
      meetTravelers(state,player,state.movesRemaining===0);
      if (state.movesRemaining > 0) planStep(state);
      else landingReward(state);
    } else if (state.boardStage === 'transport') {
      const door=state.transport.type==='door';
      player.fromPosition = player.position;
      player.position = state.transport.to;
      state.transport = null;
      meetTravelers(state,player,true);
      if(door){state.boardStage='event';state.timer=EVENT_TIME;}
      else landingReward(state, true);
    } else if (state.boardStage === 'event') endTurn(state);
    else break;
  }
}

/** Scores are host output; unrecognized/duplicate IDs are ignored. Cards never change. */
export function finishMinigame(state, results = []) {
  if (state.phase !== 'minigame' || !Array.isArray(results)) return false;
  const scoreMap = new Map();
  for (const result of results) if (result && !scoreMap.has(result.id) && state.players.some(player => player.id === result.id)) scoreMap.set(result.id, Number.isFinite(result.score) ? Math.max(-1e9, Math.min(1e9, result.score)) : 0);
  const ordered = state.players.map(player => ({ id: player.id, name: player.name, character: player.character, score: scoreMap.get(player.id) ?? 0, seat: player.seat })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  state.results = ordered.map(result => {
    const rank = ordered.findIndex(other => other.score === result.score), award = [20, 12, 8, 4][rank];
    const player = state.players.find(player => player.id === result.id);
    player.sparks += award;
    player.totalScore += result.score;
    if (rank === 0) { player.wins++; player.item ||= 'shield'; }
    return { ...result, rank: rank + 1, award };
  });
  state.phase = 'results';
  state.message = state.results.filter(result => result.rank === 1).map(result => result.name).join(' & ') + ' found the light. The card journey continues.';
  return true;
}
export function rankPlayers(state) {
  return [...state.players].sort((a,b)=>comparePoints(a,b,state.finisherId));
}

/** Send this per-recipient view over WebRTC; never broadcast the authoritative state. */
export function viewParty(state, viewerId) {
  const view = JSON.parse(JSON.stringify(state));
  view.deckCount = state.deck.length;
  delete view.deck;
  delete view.rng;
  delete view.seed;
  delete view.gameDeck;
  delete view.storyDeck;
  view.chainEligible=state.currentPlayerId===viewerId&&state.boardStage==='choose-chain'&&playableCards(state,viewerId).length>0;
  for (const player of view.players) {
    player.handCount = player.hand.length;
    if (player.id !== viewerId) player.hand = Array.from({ length: player.handCount }, () => ({ back: true }));
  }
  if (viewerId !== state.currentPlayerId) view.drawnCardId = null;
  // Minigames use a public actor roster. Strip private fields defensively if a caller copied players wholesale.
  if (view.game?.players) for (const actor of view.game.players) {
    delete actor.hand;
    delete actor.calledLast;
    delete actor.shortcutChoice;
  }
  return view;
}

function boardText(ctx, text, x, y, size = 10, color = '#eee6d2') {
  ctx.font = gameFont(size);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = '#111316'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function traceBoardPath(ctx,from,to,kind='main',steps=28){
 const start=boardRoutePoint(from,to,0,kind);ctx.beginPath();ctx.moveTo(start.x,start.y);
 for(let n=1;n<=steps;n++){const p=boardRoutePoint(from,to,n/steps,kind);ctx.lineTo(p.x,p.y);}
}
function pathLength(from,to,kind='main'){
 let p=boardRoutePoint(from,to,0,kind),length=0;
 for(let n=1;n<=32;n++){const q=boardRoutePoint(from,to,n/32,kind);length+=Math.hypot(q.x-p.x,q.y-p.y);p=q;}
 return length;
}
function smallStone(ctx,helpers,x,y,w,h,rotation=0,alpha=1){
 if(helpers.boardPiece)helpers.boardPiece(ctx,'stone',x,y,w,h,{rotation,alpha});
 else{ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle='#d5cfbb';ctx.beginPath();ctx.ellipse(x,y,w/2,h/3,rotation,0,Math.PI*2);ctx.fill();ctx.restore();}
}
function drawPaperPath(ctx,helpers,from,to,kind='main'){
 const length=pathLength(from,to,kind),steps=Math.max(3,Math.ceil(length/(kind==='shortcut'?12:19)));
 // A quiet binding thread makes gaps legible; individual cut-paper stones carry
 // the route. There is no continuous filled road or asphalt-like center stripe.
 traceBoardPath(ctx,from,to,kind);ctx.strokeStyle='#10130c66';ctx.lineWidth=4;ctx.stroke();
 ctx.strokeStyle=kind==='shortcut'?'#c5b78b99':'#bfb79c77';ctx.lineWidth=1;ctx.stroke();
 for(let n=1;n<steps;n++){
  const t=n/steps,p=boardRoutePoint(from,to,t,kind),q=boardRoutePoint(from,to,Math.min(1,t+.005),kind);
  const rotation=Math.atan2(q.y-p.y,q.x-p.x),size=kind==='shortcut'?19:13+Math.sin(from*2.1+n*1.7)*2;
  smallStone(ctx,helpers,p.x,p.y,size,kind==='shortcut'?11:8,rotation*.08+Math.sin(from+n*2)*.08,kind==='shortcut'?.95:.74);
 }
 // Small stamped chevrons occur between stops, rather than across the landscape.
 if(kind==='main'&&from%4===1){const p=boardRoutePoint(from,to,.5,kind),q=boardRoutePoint(from,to,.52,kind);ctx.save();ctx.translate(p.x,p.y-1);ctx.rotate(Math.atan2(q.y-p.y,q.x-p.x));ctx.fillStyle='#393a2a';ctx.beginPath();ctx.moveTo(-2,-2);ctx.lineTo(2,0);ctx.lineTo(-2,2);ctx.fill();ctx.restore();}
}
function drawPaperTransport(ctx,helpers,from,to,kind){
 const length=pathLength(from,to,kind),width=kind==='ladder'?19:27;
 traceBoardPath(ctx,from,to,kind);ctx.strokeStyle='#090c0b70';ctx.lineWidth=width+4;ctx.stroke();
 if(!helpers.boardPiece)return;
 // Slice the original texture along its length to follow curved geometry. The
 // same function also drives the traveler, including reverse-facing slides.
 const count=Math.max(8,Math.ceil(length/6));
 for(let n=0;n<count;n++){
  const a=boardRoutePoint(from,to,n/count,kind),b=boardRoutePoint(from,to,(n+1)/count,kind);
  helpers.boardPiece(ctx,kind==='ladder'?'ladder':'chute',(a.x+b.x)/2,(a.y+b.y)/2,width,Math.hypot(b.x-a.x,b.y-a.y)+1.3,{rotation:Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2,start:n/count,end:(n+1)/count,anchor:.5});
 }
}
let paperBoardLayer=null;
function paintBoardFoundation(ctx,helpers){
 const originalPiece=helpers.boardPiece,commands=[];
 const modelHelpers=originalPiece?{...helpers,boardPiece:(c,type,x,y,w,h,options={})=>commands.push({type,x,y,w,h,options})}:helpers;
 // Distant scenery recedes softly behind the handmade routes, retaining the
 // floating-world illustration without letting every background line compete.
 const shade=ctx.createRadialGradient(480,278,110,480,278,530);
 shade.addColorStop(0,'#121614b5');shade.addColorStop(.72,'#171b198e');shade.addColorStop(1,'#10141328');ctx.fillStyle=shade;ctx.fillRect(0,0,960,540);
 for(let i=0;i<48;i++)drawPaperPath(ctx,modelHelpers,i,(i+1)%48);
 for(const [a,b]of Object.entries(BOARD_SHORTCUTS))drawPaperPath(ctx,modelHelpers,+a,b,'shortcut');
 for(const [a,b]of Object.entries(BOARD_CHUTES))drawPaperTransport(ctx,modelHelpers,+a,b,'chute');
 for(const [a,b]of Object.entries(BOARD_LADDERS))drawPaperTransport(ctx,modelHelpers,+a,b,'ladder');
 // A small physical landmark leaves the center open and ties the route to the
 // same gothic paper architecture as the surrounding realms.
 modelHelpers.boardPiece?.(ctx,'gate',480,319,54,71);
 for(let i=0;i<48;i++){const p=BOARD_SPACES[i],special=p.type!=='spark';smallStone(ctx,modelHelpers,p.x,p.y,special?48:42,special?32:28,(i%3-1)*.028);if(commands.length){commands[commands.length-1].realm=p.realm;commands[commands.length-1].stop=true;}}
 const start=BOARD_SPACES[0];modelHelpers.boardPiece?.(ctx,'gate',start.x-38,start.y+4,29,38);
 if(originalPiece){const solidLayer=bakePaperBoard(commands,originalPiece);if(solidLayer)ctx.drawImage(solidLayer,0,0,960,540);else for(const c of commands)originalPiece(ctx,c.type,c.x,c.y,c.w,c.h,c.options);}
 for(let i=0;i<48;i++){
  const p=BOARD_SPACES[i],special=p.type!=='spark';
  // A translucent pigment wash leaves the photographed cut-paper grain intact.
  // Each stop carries an animated original-art emblem instead of a number.
  ctx.save();ctx.globalAlpha=.21;ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(p.x,p.y-2,special?17:15,special?8:7,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
 }
}
function drawPadSymbols(ctx,state,helpers){
 const time=state.clock||0;
 for(let index=0;index<BOARD_SPACES.length;index++){
  const pad=BOARD_SPACES[index],phase=time*1.7+index*1.31,landed=state.padEvent?.space===index&&time-state.padEvent.startedAt<state.padEvent.duration;
  const pulse=landed?Math.sin(Math.max(0,time-state.padEvent.startedAt)*7)*.12:Math.sin(phase)*.055,size=(pad.type==='spark'?17:20)*(1+pulse);
  helpers.prop?.(ctx,pad.icon,pad.x,pad.y-3-Math.sin(phase)*1.1,size,Math.sin(phase*.7)*.075);
 }
}
function boardCue(state,name){
 const cue=state[name];if(!cue)return null;const age=Math.max(0,(state.clock||0)-cue.startedAt),duration=cue.duration||3;
 return age<duration?{...cue,age,progress:age/duration,alpha:Math.min(1,age/.15,(duration-age)/.45)}:null;
}
function drawStoryTableau(ctx,cue,token,helpers,time){
 const x=token.x+42,y=token.y-53,t=cue.age,type=cue.kind||cue.id;
 ctx.save();ctx.globalAlpha*=cue.alpha;
 const object=(name,dx,dy,size,rotation=0)=>helpers.object?.(ctx,name,x+dx,y+dy,size,size,time,{rotation});
 const prop=(name,dx,dy,size,rotation=0)=>helpers.prop?.(ctx,name,x+dx,y+dy,size,rotation);
 if(type==='moon-carnival'){
  object('pedestal',0,19,33);object('crown',0,-10+Math.sin(t*3)*3,29);
  for(let i=0;i<3;i++){const a=t*1.8+i*Math.PI*2/3;object('star',Math.cos(a)*25,Math.sin(a)*8,12,a);}
 }else if(type==='moth-procession'){
  for(let i=0;i<3;i++)prop('lantern',Math.sin(t*2+i)*17+(i-1)*15,-i*14+Math.cos(t*2+i)*4,19,(Math.sin(t*2+i))*.18);
 }else if(type==='mimic-cache'){
  object('crate',0,8-Math.abs(Math.sin(t*4))*5,36,Math.sin(t*4)*.12);prop('key',9,-16-Math.abs(Math.sin(t*3))*9,23,t*.5);
 }else if(type==='clockwork-clinic'){
  helpers.challengePiece?.(ctx,'heart',x,y-14,44,{time:t,rotation:Math.sin(t*3)*.07});helpers.challengePiece?.(ctx,'tweezers',x+21,y-29,36,{time:t,rotation:-.4});
 }else if(type==='tower-workshop'){
  helpers.challengePiece?.(ctx,'stack',x,y-4,55,{time:t,rotation:Math.sin(t*3)*.08});helpers.challengePiece?.(ctx,'crown',x,y-36,21,{time:t});
 }else if(type==='midnight-bargain'){
  object('altar',0,14,43);for(let i=0;i<3;i++)prop('spark',(i-1)*15,-10-Math.sin(t*3+i)*5,17,t*.5);
 }else if(type==='folded-door')object('portal',0,0,49,Math.sin(t*2)*.04);
 else if(type==='clockwork-reversal'){
  object('gauge',0,0,39);for(let i=0;i<3;i++){const a=t+i*Math.PI*2/3;prop('gear',Math.cos(a)*23,Math.sin(a)*23,16,-t*2);}
 }else if(type==='umbrella-rain'){
  for(let i=0;i<3;i++){const phase=(t*.55+i/3)%1;prop('umbrella',(i-1)*22+Math.sin(t*2+i)*5,-40+phase*60,25,Math.sin(t*2+i)*.16);}
 }
 ctx.restore();
}
function drawBoardCelebrations(ctx,state,helpers,tokens){
 const pending=state.boardStage==='choose-event'&&state.pendingEvent;
 const story=pending?{...pending,age:Math.max(0,(state.clock||0)-pending.startedAt),alpha:1}:boardCue(state,'storyEvent'),lap=boardCue(state,'lapCelebration'),pad=boardCue(state,'padEvent');
 for(const cue of [story,lap,pad]){
  if(!cue)continue;const token=tokens.find(t=>t.player.id===cue.playerId);if(!token)continue;
  const isLap=cue===lap,spread=18+Math.min(1,cue.age/.7)*28;
  for(let i=0;i<6;i++){
   const angle=i*Math.PI/3+cue.age*.75,x=token.x+Math.cos(angle)*spread,y=token.y-39+Math.sin(angle)*spread*.6-cue.age*8;
   helpers.object?.(ctx,'star',x,y,isLap?13:9,isLap?13:9,state.clock,{rotation:angle,alpha:cue.alpha*.8});
  }
  helpers.fx?.(ctx,isLap?'hit':'magic',token.x,token.y-35,50,state.clock,{progress:Math.min(1,cue.age/.7),alpha:cue.alpha*.55});
  if(story===cue)drawStoryTableau(ctx,cue,token,helpers,state.clock);
  if(pad===cue){
   for(let n=0;n<3;n++){const angle=cue.age*1.8+n*Math.PI*2/3;helpers.prop?.(ctx,cue.icon,token.x+Math.cos(angle)*31,token.y-45+Math.sin(angle)*13-cue.age*5,21,angle);}
  }
 }
 if(state.boardStage==='transport'&&state.transport?.type==='door'){
  for(const point of [BOARD_SPACES[state.transport.from],BOARD_SPACES[state.transport.to]])helpers.object?.(ctx,'portal',point.x,point.y-23,42,62,state.clock,{alpha:.82});
 }
}
function drawBoardHUD(ctx,state){
 // Choices live in the card dock. Only a short, temporary outcome remains here.
 if(state.boardStage==='choose-event')return;
 const lap=boardCue(state,'lapCelebration'),story=boardCue(state,'storyEvent'),cue=lap||story;
 if(!cue)return;
 ctx.save();ctx.globalAlpha=cue.alpha??1;
 boardText(ctx,lap?'LAP +'+(lap.amount||lap.points||25):cue.title,480,488,16,'#f0dfae');ctx.restore();
}
/** Handmade stepping-stone circuits and a deterministic traveling camera. */
export function drawBoard(ctx,state,helpers={}){
 const time=state.clock||0,timings={play:PLAY_TIME,move:MOVE_TIME,shortcut:.62,transport:TRANSPORT_TIME,event:EVENT_TIME};
 const geometry={spaces:BOARD_SPACES,routePoint:boardRoutePoint,timings};
 const portrait=helpers.boardPortrait===true,canvas=ctx.canvas,visibleWidth=canvas?.clientHeight>0?540*canvas.clientWidth/canvas.clientHeight:320;
 const camera=boardCamera(state,{...geometry,overview:helpers.boardOverview===true,portrait,visibleWidth});
 helpers.beginScene?.(ctx,'world',time,undefined,state);
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.translate(camera.tx,camera.ty);ctx.scale(camera.zoom,camera.zoom);
 // Backdrop and foreground share a transform; bounded zoom cannot reveal an edge.
 helpers.background?.(ctx,'world',time);
 if(helpers.boardPiece&&typeof document!=='undefined'){
  if(!paperBoardLayer){paperBoardLayer=document.createElement('canvas');paperBoardLayer.width=960;paperBoardLayer.height=540;paintBoardFoundation(paperBoardLayer.getContext('2d'),helpers);}
  ctx.drawImage(paperBoardLayer,0,0);
 }else paintBoardFoundation(ctx,helpers);
 drawPadSymbols(ctx,state,helpers);
 for(const [kind,links]of [['ladder',BOARD_LADDERS],['chute',BOARD_CHUTES]])for(const [from,to]of Object.entries(links)){
  const t=(time*(kind==='ladder'?.19:.3)+Number(from)*.173)%1,p=boardRoutePoint(+from,to,t,kind);
  ctx.save();ctx.globalAlpha=.38;ctx.fillStyle=kind==='ladder'?'#ebdec0':'#d5d1db';ctx.fillRect(Math.round(p.x)-1,Math.round(p.y)-1,2,2);ctx.restore();
 }
 if(state.boardStage==='choose-path')for(const option of state.pathOptions||[]){
  const from=state.players[state.turnIndex].position,kind=option.choice==='shortcut'?'shortcut':'main';
  traceBoardPath(ctx,from,option.target,kind);ctx.strokeStyle=option.choice==='shortcut'?'#d1b87999':'#e4dac699';ctx.lineWidth=3;ctx.setLineDash([2,6]);ctx.stroke();ctx.setLineDash([]);
  const p=BOARD_SPACES[option.target];ctx.save();ctx.strokeStyle='#efdfb6';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y,25+Math.sin(time*5),13,0,0,Math.PI*2);ctx.stroke();ctx.restore();
 }
 const tokens=state.players.map(player=>{
  const motion=sampleBoardTraveler(state,player,geometry),encounter=sampleBoardEncounter(state,player,geometry);let x=motion.x,y=motion.drawY;
  if(encounter){x=encounter.x??x;y=(encounter.y??y)-encounter.hop;motion.rotation+=encounter.rotation;motion.scaleX*=encounter.scaleX;motion.scaleY*=encounter.scaleY;}
  const sharing=state.players.filter(other=>other.position===player.position&&!(motion.moving&&other.id===player.id)),index=sharing.findIndex(other=>other.id===player.id),stacked=!motion.moving&&!Number.isFinite(encounter?.x)&&sharing.length>1;
  if(stacked){
   const gather=motion.active&&state.boardStage==='playing-card'?1-camera.weight:1;
   x+=(index-(sharing.length-1)/2)*36*gather;y+=(index%2?5:-5)*gather;
  }
  return {player,...motion,x,y,stacked,encounter};
 }).sort((a,b)=>a.y-b.y);
 drawBoardCelebrations(ctx,state,helpers,tokens);
 for(const {player,x,y,active,moving,stacked,kind,progress,rotation,scaleX,scaleY,flip,encounter}of tokens){
  ctx.fillStyle='#080e0b66';ctx.beginPath();ctx.ellipse(x,y+2,15,5,0,0,Math.PI*2);ctx.fill();
  if(active){ctx.strokeStyle='#eddfb7';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(x,y+1,21+Math.sin(time*4),8,0,0,Math.PI*2);ctx.stroke();}
  if(moving&&kind==='main'&&progress>.7)helpers.fx?.(ctx,'dust',x,y+3,25,time,{progress:(progress-.7)/.3,alpha:.55});
  if(moving&&kind==='chute')helpers.fx?.(ctx,'dust',x+(flip?19:-19),y,29,time,{alpha:.5});
  if(encounter){helpers.fx?.(ctx,encounter.blocked?'shield':encounter.type==='bump'?'hit':'magic',x,y-39,encounter.type==='bump'?54:39,time,{progress:encounter.progress,alpha:1-encounter.progress});}
  helpers.character?.(ctx,player,x,y,stacked?57:63,{active,moving,grounded:!moving||kind==='ladder'||kind==='chute',pose:moving?'walk':'idle',flip,rotation,scaleX,scaleY,time});
  if(player.shield)helpers.prop?.(ctx,'umbrella',x,y-64,34,-.08);

 }
 ctx.restore();helpers.endScene?.(ctx);drawBoardHUD(ctx,state,camera);return camera;
}
