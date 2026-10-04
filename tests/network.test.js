import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import PeerJS from 'peerjs';
import { PartyNetwork } from '../src/network.js';
import { BOARD_EVENTS, actParty, createParty, finishMinigame, stepParty, viewParty } from '../src/board.js';
import { MINIGAMES, createGame, getGameResults, stepGame } from '../src/minigames.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeConnection extends EventEmitter {
  constructor(peer) { super(); this.peer = peer; this.open = false; this.bufferSize = 0; this.dataChannel = { bufferedAmount: 0 }; }
  send(message) {
    if (!this.open) throw new Error('Not open');
    const data = structuredClone(message);
    queueMicrotask(() => { if (this.other?.open) this.other.emit('data', data); });
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.open = false;
    this.emit('close');
    if (this.other && !this.other.closed) this.other.close();
  }
}

class FakePeer extends EventEmitter {
  static peers = new Map();
  static next = 0;
  constructor(id, config) {
    super();
    this.config = typeof id === 'object' ? id : config;
    this.id = typeof id === 'string' ? id : `guest-${++FakePeer.next}`;
    this.links = [];
    this.destroyed = false;
    if (FakePeer.peers.has(this.id)) {
      queueMicrotask(() => this.emit('error', { type: 'unavailable-id' }));
    } else {
      FakePeer.peers.set(this.id, this);
      queueMicrotask(() => { if (!this.destroyed) this.emit('open', this.id); });
    }
  }
  connect(id, options) {
    this.connectOptions = options;
    const local = new FakeConnection(id);
    local.label = options?.label;
    local.serialization = options?.serialization;
    this.links.push(local);
    queueMicrotask(() => {
      const remote = FakePeer.peers.get(id);
      if (!remote) { this.emit('error', { type: 'peer-unavailable' }); return; }
      const other = new FakeConnection(this.id);
      other.label = options?.label;
      other.serialization = options?.serialization;
      local.other = other; other.other = local;
      remote.links.push(other);
      remote.emit('connection', other);
      if (other.closed) { local.close(); return; }
      local.open = true; other.open = true;
      other.emit('open'); local.emit('open');
    });
    return local;
  }
  reconnect() { this.disconnected = false; this.emit('open', this.id); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    FakePeer.peers.delete(this.id);
    for (const conn of this.links) conn.close();
    this.emit('close');
  }
}

// Use the installed PeerJS codecs, including their real JSON limit and binary
// chunk/reassembly path. Only the socket/RTC negotiation is replaced; a clone
// transport would conceal the message-too-big error this regression covers.
class CodecRegistryPeer extends PeerJS.Peer {
  _createServerConnection() { const socket = new EventEmitter(); socket.close = () => {}; return socket; }
  _delayedAbort() {}
  _initialize() {}
}
const codecRegistry = new CodecRegistryPeer('codec-test', { host: 'test.invalid', secure: false });
const peerSerializers = codecRegistry._serializers;
codecRegistry.destroy();

function installPeerCodec(conn, serialization) {
  const codec = Object.create(peerSerializers[serialization].prototype);
  Object.assign(codec, { _open: true, _chunkedData: {}, chunker: PeerJS.util,
    encoder: new TextEncoder(), decoder: new TextDecoder(), stringify: JSON.stringify, parse: JSON.parse });
  conn.serialization = serialization;
  conn.wireFrames = [];
  conn.wireErrors = [];
  codec.emit = (event, data) => conn.emit(event, data);
  codec.emitError = (type, message) => { conn.wireErrors.push({ type, message }); conn.emit('error', { type, message }); };
  codec._bufferedSend = encoded => {
    const wire = encoded.slice(0);
    conn.wireFrames.push(wire.byteLength);
    queueMicrotask(() => { if (conn.other?.open) conn.other.peerCodec._handleDataMessage({ data: wire }); });
  };
  conn.peerCodec = codec;
  conn.send = data => codec.send(data);
}

class CodecPeer extends FakePeer {
  static nextCodecId = 0;
  constructor(id, config) {
    if (typeof id !== 'string') {
      config = typeof id === 'object' ? id : config;
      id = `10000000-0000-4000-8000-${String(++CodecPeer.nextCodecId).padStart(12, '0')}`;
    }
    super(id, config);
  }
  connect(id, options) {
    if (this.constructor.forceJSON && options.label === 'afterlight-v1') options = { ...options, serialization: 'json' };
    const conn = super.connect(id, options);
    installPeerCodec(conn, options.serialization);
    queueMicrotask(() => { if (conn.other) installPeerCodec(conn.other, options.serialization); });
    return conn;
  }
}
class OldJSONCodecPeer extends CodecPeer { static forceJSON = true; }

function oversizedRiftResults(players) {
  const party = createParty(players, { seed: 48 });
  party.phase = 'minigame'; party.kind = 'party'; party.nextGame = 20;
  party.game = createGame('rift-rumble', party.players, 513, { difficulty: 'hard' });
  party.game.netId = 'codec-results-regression';
  for (let frame = 0; frame < 45; frame++) {
    const inputs = Object.fromEntries(party.players.map((player, i) => [player.id, {
      right: (frame + i * 22) % 180 < 90, left: (frame + i * 22) % 180 >= 90,
      action: frame % 18 === 0, special: frame % 190 === 0, up: frame % 160 === 0,
    }]));
    stepGame(party.game, inputs, 1 / 60);
  }
  party.game.time = party.game.duration;
  stepGame(party.game, {}, 1 / 60);
  finishMinigame(party, getGameResults(party.game));
  return party;
}

function setup(t, opts = {}) {
  const network = new PartyNetwork({ Peer: FakePeer, timeoutMs: 150, heartbeatMs: 10000, ...opts });
  t.after(() => network.close());
  return network;
}

function manualHeartbeat(network) {
  for (const timer of network.timers) clearTimeout(timer);
  network.timers.clear();
  const pending = [];
  network._later = (callback, delay) => { pending.push({ callback, delay }); return 0; };
  network._startHeartbeat(network.session);
  return {
    tick() { const next = pending.shift(); assert.ok(next, 'heartbeat was scheduled'); next.callback(); },
    get delay() { return pending[0]?.delay; },
  };
}

const physicalPartyCards = state => [...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)];

function assertPhysicalPartyCards(state, originalIds) {
  const cards = physicalPartyCards(state);
  assert.equal(cards.length, 108);
  assert.equal(new Set(cards.map(card => card.id)).size, 108);
  assert.deepEqual(cards.map(card => card.id).sort(), originalIds);
  assert.equal(state.deckCount, state.deck.length);
  for (const player of state.players) assert.equal(player.handCount, player.hand.length);
}

function rigNetworkCards(state, { hands, top, draws = [] }) {
  const stock = physicalPartyCards(state);
  const originalIds = stock.map(card => card.id).sort();
  for (const card of stock) delete card.buff;
  const take = spec => {
    const index = stock.findIndex(card => card.color === spec.color && card.value === spec.value);
    assert.notEqual(index, -1, `physical fixture card exists: ${spec.color} ${spec.value}`);
    const card = stock.splice(index, 1)[0];
    if (spec.buff) card.buff = spec.buff;
    return card;
  };
  state.discard = [take(top)];
  state.activeColor = top.color;
  const assigned = new Map(Object.entries(hands).map(([id, specs]) => [id, specs.map(take)]));
  const drawnCards = draws.map(take);
  for (const player of state.players) {
    player.hand = assigned.get(player.id) || stock.splice(0, 7);
    player.handCount = player.hand.length;
    player.position = 24 + player.seat;
    if (!assigned.has(player.id)) player.hand[0].buff = ['boost', 'shine', 'shuffle'][player.seat % 3];
  }
  state.deck = [...stock, ...[...drawnCards].reverse()];
  state.deckCount = state.deck.length;
  assertPhysicalPartyCards(state, originalIds);
  return { originalIds, drawnCards };
}

function assertPrivateBoardSnapshot(party, snapshot, viewerId) {
  assert.deepEqual(snapshot, viewParty(party, viewerId));
  assert.deepEqual(snapshot.players.find(player => player.id === viewerId).hand,
    party.players.find(player => player.id === viewerId).hand);
  for (const player of snapshot.players.filter(player => player.id !== viewerId)) {
    assert.deepEqual(player.hand, Array.from({ length: player.handCount }, () => ({ back: true })),
      'other hands expose neither physical card IDs nor private buff metadata');
  }
  for (const key of ['deck', 'rng', 'seed', 'gameDeck', 'storyDeck']) assert.equal(snapshot[key], undefined, key);
}

test('host and three guests complete profile handshakes and receive authoritative snapshots', async t => {
  const rosters = [];
  const host = setup(t, { onPlayers: players => rosters.push(players) });
  const { code, id } = await host.host({ name: 'Host', character: 'pilgrim' });
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(id, `afterlight-v1-${code}`);
  assert.equal(host.players.length, 1);
  const snapshots = [];
  const guests = [0, 1, 2].map(() => setup(t, { onState: state => snapshots.push(state) }));
  for (let i = 0; i < guests.length; i++) await guests[i].join(code.toLowerCase(), { name: `<b>Guest ${i}</b>`, character: i });
  await flush();
  assert.equal(host.players.length, 4);
  assert.equal(host.players[1].name, 'Guest 0');
  assert.equal(host.players[1].bot, false);
  for (const guest of guests) {
    assert.deepEqual(guest.players, host.players);
    assert.equal(guest.hostConnection.conn.serialization, 'binary');
    assert.equal(guest.broadcast({ score: 100000 }), false);
  }
  assert.equal(host.broadcast({ phase: 'minigame', score: [0, 1, 2, 3] }), true);
  await flush();
  assert.equal(snapshots.length, 3);
  assert.deepEqual(snapshots[0], { phase: 'minigame', score: [0, 1, 2, 3] });
  assert.deepEqual(rosters.map(players => players.length), [1, 2, 3, 4]);
});

const initialCharacterCases = [7, 8, 15, 'pilgrim', null, -1, NaN, 3.5, 0];
const normalizedInitialCharacter = value => value === 7 ? 7 : 0;

test('initial host character profiles normalize to the supported cast before actual-codec roster publication', async t => {
  for (const character of initialCharacterCases) {
    const published = [], received = [];
    const host = setup(t, { Peer: CodecPeer, onPlayers: players => published.push(players) });
    const { code } = await host.host({ name: 'Host profile', character });
    const guest = setup(t, { Peer: CodecPeer, onPlayers: players => received.push(players) });
    await guest.join(code, { name: 'Guest', character: 7 }); await flush();
    const expected = normalizedInitialCharacter(character);
    assert.equal(host.players[0].character, expected, `host profile ${String(character)}`);
    assert.equal(guest.players[0].character, expected);
    assert.ok(published.length >= 2 && received.length >= 1);
    for (const roster of [...published, ...received]) {
      assert.equal(roster[0].character, expected);
      assert.ok(roster.every(player => Number.isInteger(player.character) && player.character >= 0 && player.character < 8));
    }
    host.close(); guest.close();
  }
});

test('initial guest character profiles normalize through actual-codec hello and every emitted roster', async t => {
  for (const character of initialCharacterCases) {
    const published = [], received = [];
    const host = setup(t, { Peer: CodecPeer, onPlayers: players => published.push(players) });
    const { code } = await host.host({ name: 'Host', character: 7 });
    const guest = setup(t, { Peer: CodecPeer, onPlayers: players => received.push(players) });
    await guest.join(code, { name: 'Guest profile', character }); await flush();
    const expected = normalizedInitialCharacter(character);
    assert.equal(host.players[1].character, expected, `guest profile ${String(character)}`);
    assert.equal(guest.players[1].character, expected);
    for (const roster of [...published, ...received]) {
      assert.ok(roster.every(player => Number.isInteger(player.character) && player.character >= 0 && player.character < 8));
      if (roster.length === 2) assert.equal(roster[1].character, expected);
    }
    host.close(); guest.close();
  }
});

test('host normalizes unsupported raw hello characters even when a remote bypasses outgoing profile normalization', async t => {
  for (const character of initialCharacterCases) {
    class RawHelloPeer extends CodecPeer {
      connect(id, options) {
        const conn = super.connect(id, options), send = conn.send;
        conn.send = data => {
          const packet = typeof data === 'string' ? JSON.parse(data) : data;
          if (packet.t === 'hello') packet.profile.character = character;
          return send(typeof data === 'string' ? JSON.stringify(packet) : packet);
        };
        return conn;
      }
    }
    const published = [], received = [];
    const host = setup(t, { Peer: CodecPeer, onPlayers: players => published.push(players) });
    const { code } = await host.host({ character: 7 });
    const guest = setup(t, { Peer: RawHelloPeer, onPlayers: players => received.push(players) });
    await guest.join(code, { character: 7 }); await flush();
    const expected = normalizedInitialCharacter(character);
    assert.equal(host.players[1].character, expected, `untrusted hello ${String(character)}`);
    assert.equal(guest.players[1].character, expected);
    for (const roster of [...published, ...received]) {
      assert.ok(roster.every(player => Number.isInteger(player.character) && player.character >= 0 && player.character < 8));
    }
    host.close(); guest.close();
  }
});

test('host fixes input and action sender identity to its admitted connection', async t => {
  const inputs = [], actions = [];
  const host = setup(t, { onInput: input => inputs.push(input), onAction: action => actions.push(action) });
  const { code } = await host.host({ name: 'Host' });
  const guest = setup(t);
  await guest.join(code, { name: 'Guest' });
  assert.equal(guest.sendInput({ left: true, action: true }), 1);
  assert.equal(guest.sendAction('play-card', { cardId: 'ivory-3-0' }), true);
  guest.hostConnection.conn.send({ v: 1, t: 'action', action: 'draw-card', payload: null, playerId: host.id });
  host.sendAction('begin-minigame');
  host.sendInput({ up: true });
  await flush();
  assert.equal(inputs[0].playerId, host.id);
  assert.equal(inputs[1].playerId, guest.id);
  assert.deepEqual(inputs[1].input, { left: true, right: false, up: false, down: false, action: true, special: false });
  assert.equal(actions[0].playerId, host.id);
  assert.equal(actions[1].playerId, guest.id);
  assert.equal(actions[2].playerId, guest.id);
});

test('host edits only its own lobby profile and publishes sanitized eight-character roster entries', async t => {
  const rosters=[],host=setup(t,{onPlayers:players=>rosters.push(players)}),{code,id}=await host.host({name:'Host',character:0});
  const guest=setup(t);await guest.join(code,{name:'Guest',character:1});const guestBefore=structuredClone(host.players[1]);
  assert.equal(host.updateProfile({name:'<b>Moon\u0000 Knight</b> the excessively long',character:7}),true);
  assert.equal(host.players[0].name,'Moon Knight the ex');assert.equal(host.players[0].character,7);assert.equal(host.players[0].id,id);assert.equal(host.players[0].bot,false);assert.deepEqual(host.players[1],guestBefore);
  await flush();assert.deepEqual(guest.players,host.players);assert.deepEqual(rosters.at(-1),host.players);
  assert.equal(host.updateProfile({character:4}),true);assert.equal(host.players[0].name,'Moon Knight the ex');assert.equal(host.players[0].character,4);
  assert.equal(host.updateProfile({name:'\u0000 <> '}),true);assert.equal(host.players[0].name,'Wanderer');
});

test('an admitted guest edits its own profile through the host and all peers receive the authoritative roster', async t => {
  const host=setup(t),{code}=await host.host({name:'Host',character:0}),guest=setup(t),observer=setup(t);
  await guest.join(code,{name:'Guest',character:1});await observer.join(code,{name:'Observer',character:2});await flush();
  const original=structuredClone(host.players),before=structuredClone(guest.players);
  assert.equal(guest.updateProfile({name:'<i>Lantern</i>',character:6}),true);assert.deepEqual(guest.players,before,'guest does not rewrite the roster before host delivery');assert.deepEqual(host.players,original);
  await flush();assert.deepEqual(host.players.find(p=>p.id===guest.id),{id:guest.id,name:'Lantern',character:6,bot:false});
  assert.deepEqual(host.players.find(p=>p.id===host.id),original[0]);assert.deepEqual(host.players.find(p=>p.id===observer.id),original[2]);assert.deepEqual(guest.players,host.players);assert.deepEqual(observer.players,host.players);
  assert.equal(guest.updateProfile({character:7}),true);await flush();assert.equal(host.players.find(p=>p.id===guest.id).name,'Lantern');assert.equal(host.players.find(p=>p.id===guest.id).character,7);
});

test('profile requests reject forged identity, private fields, oversized names and invalid character indices', async t => {
  const host=setup(t),{code}=await host.host(),guest=setup(t);await guest.join(code);const before=structuredClone(host.players),conn=guest.hostConnection.conn;
  for(const profile of [{character:8},{character:-1},{character:1.2},{character:'7'},{name:3},{name:'x'.repeat(257)},{id:host.id,character:5},{bot:true},{hand:['hidden']},{},null])assert.equal(guest.updateProfile(profile),false);
  const cyclic={name:'Nope'};cyclic.self=cyclic;assert.equal(guest.updateProfile(cyclic),false);
  conn.send({v:1,t:'profile',playerId:host.id,profile:{name:'Spoofed',character:5}});
  conn.send({v:1,t:'profile',profile:{name:'Spoofed',character:5,id:host.id}});
  conn.send({v:1,t:'profile',profile:{name:'x'.repeat(1500),character:5}});
  conn.send({v:2,t:'profile',profile:{name:'Wrong protocol',character:5}});
  conn.send({v:1,t:'profile',profile:{character:15}});
  await flush();assert.deepEqual(host.players,before);assert.deepEqual(guest.players,before);assert.equal(host.lastState,null);
});

test('locked and started parties reject profile changes locally and at the host boundary', async t => {
  const host=setup(t),{code}=await host.host(),guest=setup(t);await guest.join(code);const before=structuredClone(host.players),conn=guest.hostConnection.conn;
  host.setLocked(true);assert.equal(host.updateProfile({character:7}),false);
  conn.send({v:1,t:'profile',profile:{name:'Too late',character:7}});await flush();assert.equal(guest.locked,true);assert.equal(guest.updateProfile({character:7}),false);assert.deepEqual(host.players,before);
  host.setLocked(false);await flush();assert.equal(guest.locked,false);assert.equal(guest.updateProfile({character:4}),true);await flush();assert.equal(host.players[1].character,4);
  host.broadcast({phase:'board',players:host.players});await flush();const startedRoster=structuredClone(host.players);assert.equal(host.started,true);assert.equal(guest.started,true);
  host.setLocked(true);host.setLocked(false);await flush();assert.equal(host.updateProfile({character:3}),false);assert.equal(guest.updateProfile({character:3}),false);
  conn.send({v:1,t:'profile',profile:{name:'Runtime edit',character:3}});await flush();assert.deepEqual(host.players,startedRoster);
});

test('profile edit rates are independently bounded while gameplay intents and private projections stay intact', async t => {
  let now=1000;const actions=[],host=setup(t,{now:()=>now,onAction:data=>actions.push(data)}),{code}=await host.host(),guest=setup(t,{now:()=>now});await guest.join(code);const conn=guest.hostConnection.conn;
  for(let i=0;i<10;i++)conn.send({v:1,t:'profile',profile:{name:`Choice ${i}`,character:i%8}});guest.sendAction('draw-card');await flush();
  assert.equal(host.players[1].name,'Choice 5');assert.equal(actions.length,1);assert.equal(actions[0].playerId,guest.id);
  now+=1001;assert.equal(guest.updateProfile({name:'Final choice',character:7}),true);await flush();assert.equal(host.players[1].name,'Final choice');
  const party=createParty(host.players,{seed:37,hostId:host.id}),states=[];guest.onState=state=>states.push(state);host.broadcast(party,(state,viewerId)=>viewParty(state,viewerId));await flush();
  assertPrivateBoardSnapshot(party,states.at(-1),guest.id);assert.equal(party.players.find(p=>p.id===guest.id).character,7);assert.equal(party.players.find(p=>p.id===guest.id).name,'Final choice');
  assert.equal(guest.updateProfile({name:'After cards dealt',character:3}),false);assertPrivateBoardSnapshot(party,states.at(-1),guest.id);
});

test('offline, pending and closed transports cannot update a lobby identity', async t => {
  const offline=setup(t);assert.equal(offline.updateProfile({character:1}),false);
  const host=setup(t),{code}=await host.host(),guest=setup(t);const pending=guest.join(code);assert.equal(guest.updateProfile({character:2}),false);await pending;
  guest.close();assert.equal(guest.updateProfile({character:2}),false);host.close();assert.equal(host.started,false);assert.equal(host.updateProfile({name:'No room'}),false);
});

test('fifth player and joins after party lock are rejected with useful messages', async t => {
  const host = setup(t);
  const { code } = await host.host();
  for (let i = 0; i < 3; i++) await setup(t).join(code);
  const fifth = setup(t);
  await assert.rejects(fifth.join(code), /room is full/);
  assert.equal(fifth.role, 'offline');
  assert.equal(host.players.length, 4);
  const secondHost = setup(t);
  const room = await secondHost.host();
  secondHost.setLocked(true);
  await assert.rejects(setup(t).join(room.code), /already started/);
  assert.equal(secondHost.players.length, 1);
});

test('malformed, oversized, out-of-protocol and excessive guest commands never reach gameplay', async t => {
  const inputs = [], actions = [];
  const host = setup(t, { onInput: data => inputs.push(data), onAction: data => actions.push(data) });
  const { code } = await host.host();
  const guest = setup(t);
  await guest.join(code);
  const conn = guest.hostConnection.conn;
  conn.send({ v: 1, t: 'input', input: { left: 'true' } });
  conn.send({ v: 1, t: 'input', input: { win: true } });
  conn.send({ v: 1, t: 'action', action: '<script>', payload: null });
  conn.send({ v: 1, t: 'action', action: 'roll', payload: { text: 'x'.repeat(1100) } });
  conn.send({ v: 2, t: 'action', action: 'roll', payload: null });
  conn.send({ v: 1, t: 'state', state: { winner: guest.id } });
  conn.send({ v: 1, t: 'roster', players: [] });
  await flush();
  assert.equal(inputs.length, 0);
  assert.equal(actions.length, 0);
  for (let i = 0; i < 150; i++) conn.send({ v: 1, t: 'input', b: 1, q: i + 1 });
  for (let i = 0; i < 50; i++) conn.send({ v: 1, t: 'action', action: 'draw-card', payload: null });
  await flush();
  assert.equal(inputs.length, 88);
  assert.equal(actions.length, 13);
  assert.equal(guest.sendInput({ right: 1 }), false);
  assert.equal(guest.sendAction('roll', { value: Infinity }), false);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(guest.sendAction('roll', cyclic), false);
});

test('guest disconnect removes its roster slot once and admits a replacement', async t => {
  const departures = [];
  const host = setup(t, { onDisconnect: info => departures.push(info) });
  const { code } = await host.host();
  const guest = setup(t);
  const { id } = await guest.join(code);
  guest.close();
  await flush();
  assert.equal(host.players.length, 1);
  assert.equal(departures.length, 1);
  assert.deepEqual(departures[0], { playerId: id, hostLost: false, reason: 'Player disconnected.' });
  await setup(t).join(code, { name: 'Replacement' });
  assert.equal(host.players.length, 2);
});

test('host loss closes the guest session and reports it once', async t => {
  const departures = [], statuses = [];
  const host = setup(t);
  const { code, id } = await host.host();
  const guest = setup(t, { onDisconnect: info => departures.push(info), onStatus: text => statuses.push(text) });
  await guest.join(code);
  host.close();
  await flush();
  assert.equal(guest.role, 'offline');
  assert.equal(guest.timers.size, 0);
  assert.equal(departures.length, 1);
  assert.equal(departures[0].playerId, id);
  assert.equal(departures[0].hostLost, true);
  assert.match(statuses.at(-1), /host left/);
  assert.equal(guest.sendAction('roll'), false);
});

test('invalid code and missing rooms reject without claiming a fallback connection', async t => {
  const statuses = [];
  const guest = setup(t, { onStatus: status => statuses.push(status) });
  await assert.rejects(guest.join('ab'), /six-character/);
  await assert.rejects(guest.join('ZZZZZZ'), /Room not found/);
  assert.equal(guest.role, 'offline');
  assert.equal(guest.peer, null);
  assert.equal(guest.timers.size, 0);
  assert.equal(statuses.some(text => /LAN|Connected to the party/.test(text)), false);
});

test('unresponsive signaling startup times out and cleans up', async t => {
  class SilentPeer extends EventEmitter {
    destroy() { this.destroyed = true; }
  }
  const network = setup(t, { Peer: SilentPeer, timeoutMs: 15 });
  await assert.rejects(network.host(), /signaling server timed out/);
  assert.equal(network.role, 'offline');
  assert.equal(network.timers.size, 0);
});

test('canceling startup rejects the pending operation and ignores stale peer events', async t => {
  class SlowPeer extends EventEmitter {
    destroy() { this.destroyed = true; }
  }
  const network = setup(t, { Peer: SlowPeer });
  const pending = network.host(null);
  const stalePeer = network.peer;
  network.close();
  stalePeer.emit('open', 'stale-host');
  await assert.rejects(pending, /canceled/);
  assert.equal(network.role, 'offline');
  assert.equal(network.id, '');
  assert.equal(network.timers.size, 0);
});

test('half-open handshakes do not occupy player slots and expire', async t => {
  const host = setup(t, { timeoutMs: 20 });
  const { id } = await host.host();
  const untrusted = new FakePeer();
  t.after(() => untrusted.destroy());
  await flush();
  const conn = untrusted.connect(id);
  await flush();
  assert.equal(host.players.length, 1);
  assert.equal(host.pending.size, 1);
  conn.send({ v: 1, t: 'action', action: 'roll', payload: null });
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(conn.closed, true);
  assert.equal(host.pending.size, 0);
});

test('late joining guest receives the latest host snapshot', async t => {
  const states = [];
  const host = setup(t);
  const { code } = await host.host();
  host.broadcast({ phase: 'lobby', round: 0 });
  const guest = setup(t, { onState: state => states.push(state) });
  await guest.join(code);
  await flush();
  assert.deepEqual(states, [{ phase: 'lobby', round: 0 }]);
});

test('configured signaler and TURN relay options are passed to PeerJS', async t => {
  const iceServers = [{ urls: 'turn:relay.example.test', username: 'temporary', credential: 'ephemeral' }];
  const host = setup(t, { config: { host: 'localhost', port: 9123, path: '/peer', secure: false, config: { iceServers } } });
  await host.host();
  assert.equal(host.peer.config.host, 'localhost');
  assert.equal(host.peer.config.port, 9123);
  assert.deepEqual(host.peer.config.config.iceServers, iceServers);
});

test('snapshot backpressure drops stale replaceable frames while allowing reliable actions', async t => {
  const states = [], actions = [];
  const host = setup(t, { onAction: action => actions.push(action) });
  const { code } = await host.host();
  const guest = setup(t, { onState: state => states.push(state) });
  await guest.join(code);
  const hostLink = host.connections.get(guest.id).conn;
  hostLink.bufferSize = 3;
  host.broadcast({ tick: 1 });
  await flush();
  assert.equal(states.length, 0);
  hostLink.bufferSize = 0;
  host.broadcast({ tick: 2 });
  guest.hostConnection.conn.bufferSize = 3;
  assert.equal(guest.sendInput({ up: true }), 1);
  assert.equal(guest.sendAction('draw-card'), true);
  await flush();
  assert.deepEqual(states, [{ tick: 2 }]);
  assert.equal(actions.length, 1);
});

test('signaling interruptions preserve active WebRTC gameplay', async t => {
  const states = [];
  const host = setup(t);
  const { code } = await host.host();
  const guest = setup(t, { onState: state => states.push(state) });
  await guest.join(code);
  host.peer.disconnected = true;
  host.peer.emit('disconnected');
  host.broadcast({ phase: 'playing' });
  await flush();
  assert.equal(host.role, 'host');
  assert.equal(guest.role, 'guest');
  assert.deepEqual(states, [{ phase: 'playing' }]);
});

test('silent peers are removed by heartbeat timeout', async t => {
  let now = 0;
  const disconnected = [];
  const host = setup(t, { now: () => now, heartbeatMs: 5, staleMs: 10, onDisconnect: info => disconnected.push(info) });
  const { code } = await host.host();
  const guest = setup(t);
  await guest.join(code);
  const heartbeat = manualHeartbeat(host);
  guest.hostConnection.conn.send = () => {};
  for (const at of [5, 10, 15]) { now = at; heartbeat.tick(); await flush(); }
  assert.equal(host.players.length, 1);
  assert.equal(disconnected.length, 1);
  assert.equal(guest.role, 'offline');
  assert.equal(host.heartbeatDiagnostics.graceCount, 0, 'normal-cadence silence expires immediately');
});

test('default network clock is monotonic despite a wall-clock adjustment', t => {
  let monotonic = 120, wall = 1700000000000;
  t.mock.method(globalThis.performance, 'now', () => monotonic);
  t.mock.method(Date, 'now', () => wall);
  const network = setup(t);
  assert.equal(network.now(), 120);
  wall += 30000;
  assert.equal(network.now(), 120, 'a wall-clock jump cannot age the transport');
  monotonic += 15;
  assert.equal(network.now(), 135);
  assert.throws(() => { network.lastHeartbeatAt = 999; }, TypeError);
  assert.throws(() => { network.heartbeatLateness = 999; }, TypeError);
  assert.ok(Object.isFrozen(network.heartbeatDiagnostics));
});

test('network clock falls back to Date.now when performance is unavailable', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: undefined });
  t.after(() => Object.defineProperty(globalThis, 'performance', descriptor));
  t.mock.method(Date, 'now', () => 1700000000123);
  const network = setup(t);
  assert.equal(network.now(), 1700000000123);
});

test('an injected network clock retains its exact values and controls heartbeat timing', t => {
  let clock = 42;
  const network = setup(t, { now: () => clock, heartbeatMs: 5 });
  const heartbeat = manualHeartbeat(network);
  assert.equal(network.now(), 42);
  assert.equal(network.lastHeartbeatAt, 42);
  clock = 50; heartbeat.tick();
  assert.equal(network.lastHeartbeatAt, 50);
  assert.equal(network.heartbeatLateness, 3);
  clock = -20;
  assert.equal(network.now(), -20, 'injected test clocks are not silently replaced or clamped');
});

for (const role of ['host', 'guest']) {
  test(`${role} heartbeat after suspension lets a queued pong recover the open session`, async t => {
    let now = 0;
    const departures = [];
    const host = setup(t, { now: () => now, heartbeatMs: 2500, onDisconnect: info => departures.push(info) });
    const { code } = await host.host();
    const guest = setup(t, { now: () => now, heartbeatMs: 2500, onDisconnect: info => departures.push(info) });
    await guest.join(code);
    const target = role === 'host' ? host : guest;
    const heartbeat = manualHeartbeat(target);
    const record = role === 'host' ? host.connections.get(guest.id) : guest.hostConnection;
    const packets = [], send = record.conn.send;
    record.conn.send = function(data) { packets.push((typeof data === 'string' ? JSON.parse(data) : data).t); return send.call(this, data); };
    now = 20001;
    queueMicrotask(() => record.conn.emit('data', { v: 1, t: 'pong' }));
    heartbeat.tick();
    assert.equal(target.role, role, 'the late callback must not close before queued traffic runs');
    assert.equal(record.heartbeatGraceUntil, 22501);
    assert.ok(packets.includes('ping'), 'the still-open channel receives a liveness probe');
    assert.equal(target.heartbeatLateness, 17501);
    assert.equal(target.heartbeatDiagnostics.graceCount, 1);
    await flush();
    assert.equal(record.lastSeen, 20001);
    assert.equal(record.heartbeatGraceUntil, undefined, 'received traffic ends the silence episode');
    now = 22501; heartbeat.tick(); await flush();
    assert.equal(host.role, 'host');
    assert.equal(guest.role, 'guest');
    assert.equal(target.heartbeatDiagnostics.graceCount, 1);
    assert.deepEqual(departures, []);
  });

  test(`${role} silent connection is evicted after one capped grace even if the next callback is late`, async t => {
    let now = 0;
    const departures = [];
    const host = setup(t, { now: () => now, heartbeatMs: 10000, onDisconnect: info => departures.push(info) });
    const { code } = await host.host();
    const guest = setup(t, { now: () => now, heartbeatMs: 10000, onDisconnect: info => departures.push(info) });
    await guest.join(code);
    const target = role === 'host' ? host : guest;
    const heartbeat = manualHeartbeat(target);
    const record = role === 'host' ? host.connections.get(guest.id) : guest.hostConnection;
    guest.hostConnection.conn.send = () => {};
    host.connections.get(guest.id).conn.send = () => {};
    now = 50001; heartbeat.tick();
    assert.equal(target.role, role);
    assert.equal(record.heartbeatGraceUntil, 52501);
    assert.equal(heartbeat.delay, 2500, 'a large configured interval cannot lengthen the probe window');
    assert.equal(target.heartbeatDiagnostics.graceCount, 1);
    now = 100002; heartbeat.tick(); await flush();
    assert.equal(guest.role, 'offline');
    assert.equal(host.players.length, 1);
    assert.equal(target.heartbeatDiagnostics.graceCount, 1, 'late callbacks cannot keep granting grace');
    assert.equal(departures.filter(info => info.hostLost).length, 1);
    assert.equal(departures.filter(info => !info.hostLost).length, 1);
  });
}

test('UNO actions accept only bounded card/path intents, not dice or unrecognized fields', async t => {
  const actions = [];
  const host = setup(t, { onAction: action => actions.push(action) });
  const { code } = await host.host();
  const guest = setup(t);
  await guest.join(code);
  for (const action of ['draw-card', 'pass', 'call-last', 'item']) assert.equal(guest.sendAction(action), true);
  assert.equal(guest.sendAction('play-card', { cardId: 'wild-draw4-0', color: 'violet' }), true);
  assert.equal(guest.sendAction('choose-path', { choice: 'shortcut' }), true);
  for (const [action, payload] of [
    ['roll', null], ['route', { direction: -1 }], ['give-cards', null], ['play-card', null],
    ['play-card', { cardId: 'a'.repeat(65) }], ['play-card', { cardId: 'ivory-3-0', color: 'orange' }],
    ['play-card', { cardId: 'ivory-3-0', playerId: host.id }], ['play-card', { cardId: '<script>' }],
    ['draw-card', { count: 99 }], ['choose-path', { choice: 'teleport' }], ['choose-path', { choice: 'main', target: 47 }],
  ]) assert.equal(guest.sendAction(action, payload), false, `${action} ${JSON.stringify(payload)}`);
  // A guest cannot bypass validation by sending packets directly.
  guest.hostConnection.conn.send({ v: 1, t: 'action', action: 'play-card', payload: { cardId: 'jade-5-0', count: 5 } });
  await flush();
  assert.equal(actions.length, 6);
  assert.ok(actions.every(action => action.playerId === guest.id));
});

test('end-chain accepts only empty intent and card plays reject forged buffs, chains and draw debt', async t => {
  let now = 0;
  const actions = [];
  const host = setup(t, { now: () => now, onAction: event => actions.push(event) });
  const { code } = await host.host();
  const guest = setup(t);
  await guest.join(code);
  assert.equal(guest.sendAction('end-chain'), true);
  assert.equal(guest.sendAction('end-chain', null), true);
  assert.equal(guest.sendAction('end-chain', {}), true);
  assert.equal(guest.sendAction('play-card', { cardId: 'violet-draw2-0' }), true);
  assert.equal(guest.sendAction('play-card', { cardId: 'wild-draw4-0', color: 'jade' }), true);
  await flush();
  assert.deepEqual(actions.map(({ action, payload }) => ({ action, payload })), [
    { action: 'end-chain', payload: null }, { action: 'end-chain', payload: null }, { action: 'end-chain', payload: {} },
    { action: 'play-card', payload: { cardId: 'violet-draw2-0' } },
    { action: 'play-card', payload: { cardId: 'wild-draw4-0', color: 'jade' } },
  ]);
  assert.ok(actions.every(event => event.playerId === guest.id));
  const malformed = [
    ...[[], false, 0, '', { chainValue: '3' }, { pendingDraw: 6 }, { buff: 'shuffle' },
      { playerId: host.id }, { end: true }].map(payload => ['end-chain', payload]),
    ...[{ buff: 'shine' }, { chainValue: '3' }, { pendingDraw: 99 }, { pendingDrawValue: 'draw4' },
      { turnOrder: [guest.id, host.id] }].map(forged => ['play-card', { cardId: 'violet-draw2-0', ...forged }]),
  ];
  for (const [action, payload] of malformed) {
    now += 1001; // Every forged packet reaches validation inside a fresh rate window.
    assert.equal(guest.sendAction(action, payload), false, `${action} ${JSON.stringify(payload)}`);
    guest.hostConnection.conn.send({ v: 1, t: 'action', action, payload });
    await flush();
    assert.equal(actions.length, 5, `raw ${action} cannot smuggle ${JSON.stringify(payload)}`);
  }
  now += 1001;
  assert.equal(guest.sendAction('end-chain', {}), true);
  await flush();
  assert.equal(actions.length, 6, 'validation rejects the bad payload without disabling legal intents');
  assert.equal(actions.at(-1).playerId, guest.id);
});

test('guest accepts cumulative draw-two debt on host once while recipient buffs remain private', async t => {
  let party;
  const resolved = [], guestStates = [], observerStates = [];
  const host = setup(t, { onAction: ({ playerId, action, payload }) => {
    const accepted = actParty(party, playerId, action, payload);
    resolved.push({ playerId, action, accepted });
    if (accepted) host.broadcast(party, viewParty);
  } });
  const { code } = await host.host();
  const guest = setup(t, { onState: state => guestStates.push(state) });
  const observer = setup(t, { onState: state => observerStates.push(state) });
  await guest.join(code); await observer.join(code);
  party = createParty(host.players, { seed: 672 });
  const { originalIds, drawnCards } = rigNetworkCards(party, {
    top: { color: 'ivory', value: 'draw2' },
    hands: { [guest.id]: [
      { color: 'jade', value: '2', buff: 'boost' }, { color: 'violet', value: '3', buff: 'shine' },
      { color: 'ember', value: '6', buff: 'shuffle' },
    ] },
    draws: [
      { color: 'ivory', value: '7', buff: 'boost' }, { color: 'jade', value: '8', buff: 'shine' },
      { color: 'violet', value: 'reverse', buff: 'shuffle' }, { color: 'ember', value: '4' },
    ],
  });
  const traveler = party.players.find(player => player.id === guest.id);
  party.turnIndex = traveler.seat; party.currentPlayerId = guest.id;
  party.boardStage = 'penalty-card'; party.pendingDraw = 4; party.pendingDrawValue = 'draw2';
  const initialHand = structuredClone(traveler.hand), deckCount = party.deckCount;
  host.broadcast(party, viewParty); await flush();
  for (const [viewer, states] of [[guest, guestStates], [observer, observerStates]]) {
    assertPrivateBoardSnapshot(party, states.at(-1), viewer.id);
    assert.equal(states.at(-1).pendingDraw, 4);
    assert.equal(states.at(-1).pendingDrawValue, 'draw2');
  }
  observer.hostConnection.conn.send({ v: 1, t: 'action', action: 'draw-card', payload: null, playerId: guest.id });
  await flush();
  assert.deepEqual(resolved, [{ playerId: observer.id, action: 'draw-card', accepted: false }]);
  assert.equal(party.pendingDraw, 4); assert.deepEqual(traveler.hand, initialHand);
  assert.equal(guest.sendAction('draw-card'), true);
  assert.deepEqual(traveler.hand, initialHand, 'the guest sends an intent before the host receives it');
  await flush();
  assert.deepEqual(traveler.hand, [...initialHand, ...drawnCards]);
  assert.equal(party.deckCount, deckCount - 4);
  assert.equal(party.pendingDraw, 0); assert.equal(party.pendingDrawValue, null);
  assert.equal(party.currentPlayerId, observer.id); assert.equal(party.boardStage, 'await-card');
  assert.equal(party.turnsCompleted, 1);
  assert.equal(party.lastEvent.type, 'draw'); assert.equal(party.lastEvent.id, guest.id);
  assert.equal(party.lastEvent.penalty, 4); assert.equal(party.lastEvent.amount, 4);
  for (const [viewer, states] of [[guest, guestStates], [observer, observerStates]]) {
    assertPrivateBoardSnapshot(party, states.at(-1), viewer.id);
    assert.equal(states.at(-1).players.find(player => player.id === guest.id).handCount, 7);
  }
  assert.deepEqual(guestStates.at(-1).players.find(player => player.id === guest.id).hand.slice(-4).map(card => card.buff),
    ['boost', 'shine', 'shuffle', undefined]);
  assert.equal(guest.sendAction('draw-card'), true);
  await flush();
  assert.deepEqual(resolved.at(-1), { playerId: guest.id, action: 'draw-card', accepted: false });
  assert.equal(traveler.hand.length, 7); assert.equal(party.turnsCompleted, 1);
  assertPhysicalPartyCards(party, originalIds);
});

test('guest stacks only its host-owned draw-two and reveals its buff only when played', async t => {
  let party;
  const resolved = [], guestStates = [], observerStates = [];
  const host = setup(t, { onAction: ({ playerId, action, payload }) => {
    const accepted = actParty(party, playerId, action, payload);
    resolved.push({ playerId, action, accepted });
    if (accepted) host.broadcast(party, viewParty);
  } });
  const { code } = await host.host();
  const guest = setup(t, { onState: state => guestStates.push(state) });
  const observer = setup(t, { onState: state => observerStates.push(state) });
  await guest.join(code); await observer.join(code);
  party = createParty(host.players, { seed: 913 });
  const { originalIds } = rigNetworkCards(party, {
    top: { color: 'ivory', value: 'draw2' },
    hands: { [guest.id]: [
      { color: 'violet', value: 'draw2', buff: 'shine' },
      { color: 'wild', value: 'draw4', buff: 'boost' }, { color: 'jade', value: '3', buff: 'shuffle' },
    ] },
  });
  const traveler = party.players.find(player => player.id === guest.id), selected = traveler.hand[0];
  traveler.position = 0; traveler.sparks = 11;
  party.turnIndex = traveler.seat; party.currentPlayerId = guest.id;
  party.boardStage = 'penalty-card'; party.pendingDraw = 4; party.pendingDrawValue = 'draw2';
  const deckCount = party.deckCount;
  host.broadcast(party, viewParty); await flush();
  assertPrivateBoardSnapshot(party, guestStates.at(-1), guest.id);
  assertPrivateBoardSnapshot(party, observerStates.at(-1), observer.id);
  assert.equal(guestStates.at(-1).players.find(player => player.id === guest.id).hand[0].buff, 'shine');
  observer.hostConnection.conn.send({ v: 1, t: 'action', action: 'play-card', payload: { cardId: selected.id }, playerId: guest.id });
  assert.equal(guest.sendAction('play-card', { cardId: party.players[0].hand[0].id }), true);
  assert.equal(guest.sendAction('play-card', { cardId: traveler.hand[1].id, color: 'jade' }), true);
  assert.equal(guest.sendAction('play-card', { cardId: traveler.hand[2].id }), true);
  await flush();
  assert.deepEqual(resolved.map(event => [event.playerId, event.accepted]), [
    [observer.id, false], [guest.id, false], [guest.id, false], [guest.id, false],
  ]);
  assert.equal(party.pendingDraw, 4); assert.equal(traveler.sparks, 11); assert.equal(traveler.hand.length, 3);
  assert.equal(guest.sendAction('play-card', { cardId: selected.id }), true);
  assert.equal(traveler.sparks, 11, 'private card metadata takes effect only when the host applies the intent');
  await flush();
  assert.equal(party.pendingDraw, 6); assert.equal(party.pendingDrawValue, 'draw2');
  assert.equal(party.boardStage, 'playing-card'); assert.equal(party.moveTotal, 4);
  assert.equal(traveler.sparks, 14); assert.equal(traveler.hand.length, 2);
  assert.equal(party.activeColor, 'violet'); assert.equal(party.deckCount, deckCount);
  assert.equal(party.discard.at(-1), selected); assert.equal(party.lastPlayedCard.buff, 'shine');
  assert.equal(party.lastEvent.targetId, observer.id);
  for (const [viewer, states] of [[guest, guestStates], [observer, observerStates]]) {
    const snapshot = states.at(-1);
    assertPrivateBoardSnapshot(party, snapshot, viewer.id);
    assert.equal(snapshot.pendingDraw, 6);
    assert.equal(snapshot.discard.at(-1).buff, 'shine', 'played buffs become public with the discard');
    assert.equal(snapshot.lastPlayedCard.id, selected.id);
  }
  assert.equal(guest.sendAction('play-card', { cardId: selected.id }), true);
  await flush();
  assert.equal(resolved.at(-1).accepted, false);
  assert.equal(party.pendingDraw, 6); assert.equal(traveler.sparks, 14);
  for (let frame = 0; frame < 160 && party.currentPlayerId === guest.id; frame++) stepParty(party, .05);
  assert.equal(party.currentPlayerId, observer.id);
  assert.equal(party.boardStage, 'penalty-card'); assert.equal(party.pendingDraw, 6);
  assert.equal(party.pendingDrawValue, 'draw2'); assert.equal(party.turnsCompleted, 1);
  host.broadcast(party, viewParty); await flush();
  for (const [viewer, states] of [[guest, guestStates], [observer, observerStates]]) {
    assertPrivateBoardSnapshot(party, states.at(-1), viewer.id);
    assert.equal(states.at(-1).currentPlayerId, observer.id);
    assert.equal(states.at(-1).pendingDraw, 6);
  }
  assertPhysicalPartyCards(party, originalIds);
});

test('each guest receives only its own full hand while authoritative cards remain on host', async t => {
  const hostStates = [], statesByGuest = [[], [], []];
  const host = setup(t, { onState: state => hostStates.push(state) });
  const { code } = await host.host();
  const guests = statesByGuest.map(states => setup(t, { onState: state => states.push(state) }));
  for (const guest of guests) await guest.join(code);
  const state = createParty(host.players, { seed: 814 });
  assert.equal(host.broadcast(state), false, 'private hands require an explicit projection');
  assert.equal(host.broadcast(state, viewParty), true);
  await flush();
  assert.equal(host.lastState, state);
  assert.equal(hostStates.length, 0, 'host uses its local simulation without receiving a projected callback');
  for (let index = 0; index < guests.length; index++) {
    const snapshot = statesByGuest[index][0], viewerId = guests[index].id;
    assert.deepEqual(snapshot.players.find(player => player.id === viewerId).hand, state.players.find(player => player.id === viewerId).hand);
    assert.ok(snapshot.players.filter(player => player.id !== viewerId).every(player => player.hand.every(card => card.back && Object.keys(card).length === 1)));
    assert.equal(snapshot.deck, undefined); assert.equal(snapshot.rng, undefined); assert.equal(snapshot.gameDeck, undefined);
  }
  assert.ok(state.players.every(player => player.hand.every(card => card.id && card.color && card.value)));
  assert.equal(host.broadcast(state), true, 'the registered projector stays active for subsequent broadcasts');
  await flush();
  assert.ok(statesByGuest.every(states => states.length === 2));
});

test('late join snapshots reuse per-recipient projection instead of a previous guest view or raw state', async t => {
  const host = setup(t);
  const { code } = await host.host();
  const firstStates = [], lateStates = [];
  const first = setup(t, { onState: state => firstStates.push(state) });
  await first.join(code);
  const state = createParty(host.players, { seed: 88 });
  host.broadcast(state, viewParty);
  await flush();
  const late = setup(t, { onState: state => lateStates.push(state) });
  await late.join(code);
  await flush();
  assert.equal(lateStates.length, 1);
  assert.ok(lateStates[0].players.every(player => player.hand.every(card => card.back)), 'new viewer has no established seat in old state so sees no hand');
  assert.equal(lateStates[0].deck, undefined);
  assert.deepEqual(firstStates[0].players.find(player => player.id === first.id).hand, state.players.find(player => player.id === first.id).hand);
  const updated = createParty(host.players, { seed: 89 });
  host.broadcast(updated, viewParty);
  await flush();
  assert.deepEqual(lateStates[1].players.find(player => player.id === late.id).hand, updated.players.find(player => player.id === late.id).hand);
  assert.ok(lateStates[1].players.filter(player => player.id !== late.id).every(player => player.hand.every(card => card.back)));
});

test('snapshot projection errors fail closed and close clears private state and projector', async t => {
  const states = [];
  const host = setup(t);
  const { code } = await host.host();
  const guest = setup(t, { onState: state => states.push(state) });
  await guest.join(code);
  const state = createParty(host.players);
  assert.equal(host.broadcast(state, () => { throw new Error('projection failed'); }), true);
  await flush();
  assert.deepEqual(states, []);
  assert.equal(host.broadcast(state, () => ({ invalid: Infinity })), true);
  await flush();
  assert.deepEqual(states, []);
  host.close();
  assert.equal(host.lastState, null);
  assert.equal(host.stateProjector, null);
});

test('guests form direct input mesh, bind sender IDs, and deduplicate host relays', async t => {
  const observed = [];
  const host = setup(t);
  const { code } = await host.host();
  const a = setup(t), b = setup(t, { onInput: event => observed.push(event) });
  await a.join(code); await b.join(code); await flush();
  assert.equal(a.meshConnections.size, 1); assert.equal(b.meshConnections.size, 1);
  assert.ok(a.meshConnections.get(b.id).conn.open);
  a.sendInput({ right: true }, { immediate: true });
  await flush();
  assert.equal(observed.filter(event => event.playerId === a.id).length, 1);
  assert.equal(observed[0].seq, 1);
  assert.equal(observed[0].input.right, true);
  assert.ok(['direct', 'relay'].includes(observed[0].source));
  assert.ok(b.inputStats.duplicates >= 1);
  a.meshConnections.get(b.id).conn.send({ v: 1, t: 'input', q: 2, b: 1, playerId: host.id });
  await flush();
  assert.equal(observed.at(-1).playerId, a.id);
  a.meshConnections.get(b.id).conn.send({ v: 1, t: 'state', s: 999, state: { winner: a.id } });
  await flush();
  assert.equal(b.receivedSnapshotSequence, 0);
});

test('input changes send immediately, idle refreshes coalesce, and host ACKs only consumed sequence', async t => {
  let now = 0;
  const host = setup(t, { now: () => now });
  const { code } = await host.host();
  const received = [];
  const guest = setup(t, { now: () => now, onState: (state, meta) => received.push({ state, meta }) });
  await guest.join(code);
  assert.equal(guest.sendInput({ action: true }), 1);
  assert.equal(guest.sendInput({ action: true }), 1, 'same held state coalesces');
  assert.equal(guest.sendInput({ action: false }, { immediate: true }), 2);
  await flush();
  assert.equal(host.inputAcks[guest.id], undefined);
  host.markInputApplied(guest.id, 1);
  host.broadcast({ phase: 'minigame', game: { id: 'tug' } });
  await flush();
  assert.equal(received[0].meta.acks[guest.id], 1);
  assert.equal(received[0].meta.inputs[guest.id].input.action, true, 'ACK carries consumed press, not later received release');
  now = 101;
  assert.equal(guest.sendInput({ action: false }), 3, 'unchanged held state refreshes at 10 Hz');
});

test('special bit32 survives direct mesh, host receipt and consumed-input ACKs without aliasing action', async t => {
  const hostInputs = [], remoteInputs = [], snapshots = [];
  const host = setup(t, { onInput: event => hostInputs.push(event) });
  const { code } = await host.host();
  const a = setup(t, { onState: (state, meta) => snapshots.push({ state, meta }) });
  const b = setup(t, { onInput: event => remoteInputs.push(event) });
  await a.join(code); await b.join(code); await flush();
  const meshPackets = [];
  b.meshConnections.get(a.id).conn.on('data', message => meshPackets.push(message));
  assert.equal(a.sendInput({ special: true }, { immediate: true }), 1);
  await flush();
  const expected = { left: false, right: false, up: false, down: false, action: false, special: true };
  assert.deepEqual(hostInputs.at(-1).input, expected);
  assert.equal(hostInputs.at(-1).playerId, a.id);
  assert.deepEqual(remoteInputs.filter(event => event.playerId === a.id).map(event => event.input), [expected], 'direct/relay duplicates deliver one input');
  assert.equal(meshPackets.at(-1).b, 32, 'direct guest packet preserves the sixth bit');
  host.markInputApplied(a.id, 1);
  host.broadcast({ phase: 'minigame' }); await flush();
  assert.equal(snapshots.at(-1).meta.acks[a.id], 1);
  assert.deepEqual(snapshots.at(-1).meta.inputs[a.id].input, expected);
  assert.equal(a.sendInput({}, { immediate: true }), 2);
  await flush();
  assert.equal(hostInputs.at(-1).input.special, false);
  assert.equal(remoteInputs.at(-1).input.special, false);
  assert.equal(meshPackets.at(-1).b, 0, 'release clears special immediately');
});

test('input masks accept all six bits and reject higher, negative or noninteger masks on host and mesh', async t => {
  const hostInputs = [], meshInputs = [];
  const host = setup(t, { onInput: event => hostInputs.push(event) });
  const { code } = await host.host();
  const a = setup(t), b = setup(t, { onInput: event => meshInputs.push(event) });
  await a.join(code); await b.join(code); await flush();
  assert.equal(a.sendInput({ special: 1 }), false);
  assert.equal(a.sendInput({ special: 'true' }), false);
  const links = [a.hostConnection.conn, a.meshConnections.get(b.id).conn];
  for (const conn of links) {
    for (const mask of [64, 95, 127, 255, -1, 32.5, '32', null]) conn.send({ v: 1, t: 'input', q: 99, b: mask });
  }
  await flush();
  assert.equal(hostInputs.length, 0); assert.equal(meshInputs.length, 0);
  assert.equal(host.inputSequences.has(a.id), false, 'invalid mask does not consume its sequence');
  assert.equal(b.inputSequences.has(a.id), false);
  for (const conn of links) conn.send({ v: 1, t: 'input', q: 1, b: 63 });
  await flush();
  const allHeld = { left: true, right: true, up: true, down: true, action: true, special: true };
  assert.deepEqual(hostInputs.map(event => event.input), [allHeld]);
  assert.deepEqual(meshInputs.map(event => event.input), [allHeld]);
});

test('choose-event accepts exactly the eighteen defined choices and rejects malformed peer payloads', async t => {
  let now = 0;
  const actions = [];
  const host = setup(t, { now: () => now, onAction: event => actions.push(event) });
  const { code } = await host.host();
  const guest = setup(t);
  await guest.join(code);
  const choices = ['prize', 'parade', 'follow', 'lantern', 'borrow', 'gift', 'bargain', 'safe', 'enter', 'picnic', 'reverse', 'wind', 'shelter', 'collect', 'repair', 'donate', 'build', 'brace'];
  assert.deepEqual(BOARD_EVENTS.flatMap(event => event.choices.map(choice => choice.id)).sort(), [...choices].sort());
  for (const choice of choices.slice(0, 14)) assert.equal(guest.sendAction('choose-event', { choice }), true, choice);
  await flush();
  now = 1001; // Deliver the second batch in its own real host rate window.
  for (const choice of choices.slice(14)) assert.equal(guest.sendAction('choose-event', { choice }), true, choice);
  await flush();
  assert.deepEqual(actions.map(event => event.payload.choice), choices);
  assert.ok(actions.every(event => event.playerId === guest.id && event.action === 'choose-event'));
  const malformed = [null, {}, [], { choice: 1 }, { choice: true }, { choice: ['prize'] }, { choice: 'PRIZE' }, { choice: 'forged' },
    { choice: 'prize', points: 999 }, { choice: 'prize', playerId: host.id }, { choice: 'enter', target: 0 }, { choice: 'bargain', cardId: 'wild-draw4-0' }];
  now = 2002; // Separate validation from the fifteen-actions-per-second rate limit.
  for (const payload of malformed) {
    assert.equal(guest.sendAction('choose-event', payload), false, JSON.stringify(payload));
    guest.hostConnection.conn.send({ v: 1, t: 'action', action: 'choose-event', payload });
  }
  await flush();
  assert.equal(actions.length, 18, 'raw packets cannot bypass the public sender validation');
});

test('a human guest resolves its story choice on the host and receives public points without exposing other hands', async t => {
  let party;
  const resolved = [], guestStates = [], observerStates = [];
  const host = setup(t, { onAction: ({ playerId, action, payload }) => {
    const accepted = actParty(party, playerId, action, payload);
    resolved.push({ playerId, action, accepted });
    if (accepted) host.broadcast(party, viewParty);
  } });
  const { code } = await host.host();
  const guest = setup(t, { onState: state => guestStates.push(state) });
  const observer = setup(t, { onState: state => observerStates.push(state) });
  await guest.join(code); await observer.join(code);
  party = createParty(host.players, { seed: 481 });
  const traveler = party.players.find(player => player.id === guest.id);
  const originalCards = [...party.deck, ...party.discard, ...party.players.flatMap(player => player.hand)].map(card => card.id).sort();
  party.turnIndex = traveler.seat; party.currentPlayerId = guest.id;
  traveler.position = 8; traveler.sparks = 17;
  party.boardStage = 'moving'; party.moveTarget = 9; party.movesRemaining = 1; party.timer = .1;
  party.storyDeck = ['moon-carnival'];
  stepParty(party, .11);
  assert.equal(party.boardStage, 'choose-event');
  host.broadcast(party, viewParty); await flush();
  assert.equal(guestStates.at(-1).pendingEvent.playerId, guest.id);
  assert.deepEqual(guestStates.at(-1).pendingEvent.choices.map(choice => choice.id), ['prize', 'parade']);
  for (let second = 0; second < 4; second++) stepParty(party, 1);
  assert.equal(party.boardStage, 'choose-event', 'human decision does not time out into a reward');
  assert.equal(traveler.sparks, 17);
  observer.hostConnection.conn.send({ v: 1, t: 'action', action: 'choose-event', payload: { choice: 'prize' }, playerId: guest.id });
  assert.equal(guest.sendAction('choose-event', { choice: 'bargain' }), true, 'protocol intent still requires host event-membership validation');
  await flush();
  assert.deepEqual(resolved.map(event => [event.playerId, event.accepted]), [[observer.id, false], [guest.id, false]]);
  assert.equal(traveler.sparks, 17);
  assert.equal(guest.sendAction('choose-event', { choice: 'prize' }), true);
  assert.equal(traveler.sparks, 17, 'guest sends intent; host applies it only upon receipt');
  await flush();
  assert.equal(traveler.sparks, 25);
  assert.equal(party.pendingEvent, null); assert.equal(party.storyEvent.choice, 'prize');
  for (const [viewer, states] of [[guest, guestStates], [observer, observerStates]]) {
    const snapshot = states.at(-1);
    assert.deepEqual(snapshot, viewParty(party, viewer.id));
    assert.equal(snapshot.players.find(player => player.id === guest.id).sparks, 25);
    assert.deepEqual(snapshot.storyEvent, party.storyEvent);
    assert.equal(snapshot.deck, undefined); assert.equal(snapshot.storyDeck, undefined); assert.equal(snapshot.rng, undefined);
    assert.ok(snapshot.players.filter(player => player.id !== viewer.id).every(player => player.hand.every(card => card.back && Object.keys(card).length === 1)));
  }
  assert.equal(guest.sendAction('choose-event', { choice: 'prize' }), true);
  await flush();
  assert.equal(resolved.at(-1).accepted, false, 'replayed valid intent cannot award points twice');
  assert.equal(traveler.sparks, 25);
  assert.deepEqual([...party.deck, ...party.discard, ...party.players.flatMap(player => player.hand)].map(card => card.id).sort(), originalCards);
});

test('per-recipient snapshot deltas reduce static traffic without leaking any private hand', async t => {
  const host = setup(t), states = [];
  const { code } = await host.host();
  const guest = setup(t, { onState: state => states.push(state) });
  await guest.join(code);
  const state = createParty(host.players, { seed: 15 });
  state.kind = 'party';
  assert.equal(host.broadcast(state, viewParty), true); await flush();
  state.clock += .1;
  assert.equal(host.broadcast(state, viewParty), true); await flush();
  assert.equal(host.snapshotStats.delta, 1);
  assert.ok(host.snapshotStats.bytes < host.snapshotStats.rawBytes);
  assert.equal(states.at(-1).clock, state.clock);
  assert.ok(states.at(-1).players.filter(p => p.id !== guest.id).every(p => p.hand.every(card => card.back)));
  assert.equal(states.at(-1).deck, undefined);
  assert.deepEqual(states.at(-1), viewParty(state, guest.id));
});

test('the actual PeerJS JSON codec reproduces all-guest closure on a native Rift Rumble results packet', async t => {
  const host = setup(t, { Peer: OldJSONCodecPeer });
  const { code } = await host.host({ name: 'File Host Rook', character: 4 });
  const guests = [7, 0, 0].map(character => setup(t, { Peer: OldJSONCodecPeer }));
  for (const [i, guest] of guests.entries()) await guest.join(code, { name: 'File Guest Nix', character: [7, 0, 0][i] });
  const party = oversizedRiftResults(host.players);
  const links = [...host.connections.values()].map(record => record.conn);
  for (const guest of guests) {
    const message = { v: 1, t: 'state', s: 1, a: {}, i: {}, k: party.game.netId, state: viewParty(party, guest.id) };
    assert.ok(new TextEncoder().encode(JSON.stringify(message)).byteLength >= PeerJS.util.chunkedMTU,
      'native game results must exceed the installed JSON transport limit without filler');
  }
  host.broadcast(party, viewParty); await flush();
  assert.equal(host.players.length, 1);
  assert.ok(guests.every(guest => guest.role === 'offline'));
  assert.ok(links.every(conn => conn.wireErrors.some(error => error.type === 'message-too-big')));
});

test('binary PeerJS chunks native four-player results and preserves private views, deltas and full resyncs', async t => {
  const departures = [], states = [[], [], []];
  const host = setup(t, { Peer: CodecPeer, onDisconnect: info => departures.push(info) });
  const { code } = await host.host({ name: 'File Host Rook', character: 4 });
  const guests = [7, 0, 0].map((character, i) => setup(t, { Peer: CodecPeer,
    onState: state => states[i].push(state), onDisconnect: info => departures.push(info) }));
  for (const [i, guest] of guests.entries()) await guest.join(code, { name: 'File Guest Nix', character: [7, 0, 0][i] });
  const party = oversizedRiftResults(host.players);
  const links = [...host.connections.values()].map(record => record.conn);
  links.forEach(conn => conn.wireFrames.length = 0);
  assert.equal(host.broadcast(party, viewParty), true); await flush();
  for (const [i, guest] of guests.entries()) {
    assert.equal(guest.hostConnection.conn.serialization, 'binary');
    assert.deepEqual(states[i].at(-1), viewParty(party, guest.id));
    assertPrivateBoardSnapshot(party, states[i].at(-1), guest.id);
    assert.equal(states[i].at(-1).phase, 'results');
    assert.ok(links[i].wireFrames.length >= 2, 'real PeerJS binary transport splits the full snapshot');
    assert.ok(links[i].wireFrames.every(bytes => bytes <= PeerJS.util.chunkedMTU + 256));
    assert.deepEqual(links[i].wireErrors, []);
  }
  party.clock += .1; party.message = 'A new round awaits.';
  assert.equal(host.broadcast(party, viewParty), true); await flush();
  assert.equal(host.snapshotStats.delta, 3);
  for (const [i, guest] of guests.entries()) assert.deepEqual(states[i].at(-1), viewParty(party, guest.id));
  guests[0].hostConnection.conn.send({ v: 1, t: 'resync' }); await flush();
  assert.equal(host.snapshotStats.full, 4);
  assert.deepEqual(states[0].at(-1), viewParty(party, guests[0].id));
  assertPrivateBoardSnapshot(party, states[0].at(-1), guests[0].id);
  assert.equal(host.players.length, 4);
  assert.ok(guests.every(guest => guest.role === 'guest'));
  assert.deepEqual(departures, []);
});

test('bounded JSON strings inside binary retain sender authority and reject malformed or oversized intents', async t => {
  const actions = [], inputs = [];
  const host = setup(t, { Peer: CodecPeer, onAction: action => actions.push(action), onInput: input => inputs.push(input) });
  const { code } = await host.host();
  const guest = setup(t, { Peer: CodecPeer });
  await guest.join(code);
  const conn = guest.hostConnection.conn;
  for (const data of ['not JSON', '[1,2,3]', 'null', 'x'.repeat(4097),
    JSON.stringify({ v: 1, t: 'action', action: 'draw-card', payload: null, padding: 'x'.repeat(4097) }),
    '{"v":1,"t":"action","action":"draw-card","payload":null,"__proto__":{"admin":true}}',
    JSON.stringify({ v: 1, t: 'input', q: 1, b: 128 }),
    JSON.stringify({ v: 2, t: 'action', action: 'draw-card', payload: null })]) conn.send(data);
  await flush();
  assert.deepEqual(actions, []);
  assert.deepEqual(inputs, []);
  conn.send(JSON.stringify({ v: 1, t: 'action', action: 'draw-card', payload: null, playerId: host.id }));
  await flush();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].playerId, guest.id, 'the decoded request remains bound to its admitted channel');
  assert.equal(guest.role, 'guest');
  assert.equal(host.players.length, 2);
});

test('every evolved minigame passes actual PeerJS binary full and delta decoding with exact recipient state', async t => {
  const host = setup(t, { Peer: CodecPeer }), states = [];
  const { code } = await host.host();
  const guest = setup(t, { Peer: CodecPeer, onState: state => states.push(state) });
  await guest.join(code);
  const party = createParty(host.players, { seed: 48 });
  party.phase = 'minigame'; party.kind = 'party';
  for (const [index, definition] of MINIGAMES.entries()) {
    party.nextGame = index;
    party.game = createGame(definition.id, party.players, 513);
    for (let frame = 0; frame < 240; frame++) stepGame(party.game, {}, 1 / 60);
    assert.equal(host.broadcast(party, viewParty), true); await flush();
    assert.deepEqual(states.at(-1), viewParty(party, guest.id), `${definition.id}: initial snapshot`);
    stepGame(party.game, {}, 1 / 60);
    assert.equal(host.broadcast(party, viewParty), true); await flush();
    assert.deepEqual(states.at(-1), viewParty(party, guest.id), `${definition.id}: subsequent snapshot`);
  }
  assert.ok(host.snapshotStats.delta > 0);
});
