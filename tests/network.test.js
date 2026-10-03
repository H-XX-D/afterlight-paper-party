import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PartyNetwork } from '../src/network.js';
import { BOARD_EVENTS, actParty, createParty, stepParty, viewParty } from '../src/board.js';
import { MINIGAMES, createGame, stepGame } from '../src/minigames.js';

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
    this.links.push(local);
    queueMicrotask(() => {
      const remote = FakePeer.peers.get(id);
      if (!remote) { this.emit('error', { type: 'peer-unavailable' }); return; }
      const other = new FakeConnection(this.id);
      other.label = options?.label;
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

function setup(t, opts = {}) {
  const network = new PartyNetwork({ Peer: FakePeer, timeoutMs: 150, heartbeatMs: 10000, ...opts });
  t.after(() => network.close());
  return network;
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
    assert.equal(guest.peer.connectOptions.serialization, 'json');
    assert.equal(guest.broadcast({ score: 100000 }), false);
  }
  assert.equal(host.broadcast({ phase: 'minigame', score: [0, 1, 2, 3] }), true);
  await flush();
  assert.equal(snapshots.length, 3);
  assert.deepEqual(snapshots[0], { phase: 'minigame', score: [0, 1, 2, 3] });
  assert.deepEqual(rosters.map(players => players.length), [1, 2, 3, 4]);
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
  now = 20;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(host.players.length, 1);
  assert.equal(disconnected.length, 1);
  assert.equal(guest.role, 'offline');
});

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

test('choose-event accepts exactly the fourteen defined choices and rejects malformed peer payloads', async t => {
  let now = 0;
  const actions = [];
  const host = setup(t, { now: () => now, onAction: event => actions.push(event) });
  const { code } = await host.host();
  const guest = setup(t);
  await guest.join(code);
  const choices = ['prize', 'parade', 'follow', 'lantern', 'borrow', 'gift', 'bargain', 'safe', 'enter', 'picnic', 'reverse', 'wind', 'shelter', 'collect'];
  assert.deepEqual(BOARD_EVENTS.flatMap(event => event.choices.map(choice => choice.id)).sort(), [...choices].sort());
  for (const choice of choices) assert.equal(guest.sendAction('choose-event', { choice }), true, choice);
  await flush();
  assert.deepEqual(actions.map(event => event.payload.choice), choices);
  assert.ok(actions.every(event => event.playerId === guest.id && event.action === 'choose-event'));
  const malformed = [null, {}, [], { choice: 1 }, { choice: true }, { choice: ['prize'] }, { choice: 'PRIZE' }, { choice: 'forged' },
    { choice: 'prize', points: 999 }, { choice: 'prize', playerId: host.id }, { choice: 'enter', target: 0 }, { choice: 'bargain', cardId: 'wild-draw4-0' }];
  now = 1001; // Separate validation from the fifteen-actions-per-second rate limit.
  for (const payload of malformed) {
    assert.equal(guest.sendAction('choose-event', payload), false, JSON.stringify(payload));
    guest.hostConnection.conn.send({ v: 1, t: 'action', action: 'choose-event', payload });
  }
  await flush();
  assert.equal(actions.length, 14, 'raw packets cannot bypass the public sender validation');
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

test('every evolved minigame passes full and delta decoding with exact recipient state', async t => {
  const host = setup(t), states = [];
  const { code } = await host.host();
  const guest = setup(t, { onState: state => states.push(state) });
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
