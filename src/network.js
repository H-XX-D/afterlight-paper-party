import Peer from 'peerjs';
import { makeDelta, applyDelta } from './realtime.js';

const VERSION = 1;
const PREFIX = 'afterlight-v1-';
const MAX_PLAYERS = 4;
const INPUT_KEYS = ['left', 'right', 'up', 'down', 'action', 'special'];
const CARD_COLORS = ['ivory', 'jade', 'violet', 'ember'];
const SIMPLE_ACTIONS = new Set(['draw-card', 'pass', 'call-last', 'item', 'begin-minigame', 'continue']);
const noop = () => {};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const packet = (t, fields = {}) => ({ v: VERSION, t, ...fields });
const maskInput = input => INPUT_KEYS.reduce((mask, key, i) => mask | (input[key] ? 1 << i : 0), 0);
const unpackInput = mask => Object.fromEntries(INPUT_KEYS.map((key, i) => [key, !!(mask & (1 << i))]));

function profileOf(value = {}) {
  if (!isRecord(value)) value = {};
  const name = (typeof value.name === 'string' ? value.name : 'Wanderer')
    .replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 18) || 'Wanderer';
  const character = Number.isInteger(value.character) && value.character >= 0 && value.character < 16
    ? value.character
    : typeof value.character === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value.character)
      ? value.character : 0;
  return { name, character };
}

function validInput(input) {
  if (!isRecord(input) || Object.keys(input).some(key => !INPUT_KEYS.includes(key))) return null;
  if (INPUT_KEYS.some(key => input[key] !== undefined && typeof input[key] !== 'boolean')) return null;
  return Object.fromEntries(INPUT_KEYS.map(key => [key, Boolean(input[key])]));
}

// Reject cycles, excessive nesting, non-finite numbers, and exotic objects before
// serializing. Limits also keep untrusted peer messages out of the game engine.
function boundedJSON(value, bytes, maxDepth = 8, maxNodes = 8000) {
  let count = 0;
  const seen = new Set();
  function visit(item, depth) {
    if (++count > maxNodes || depth > maxDepth) return false;
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || seen.has(item)) return false;
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return false;
    seen.add(item);
    const entries = Object.entries(item);
    if (entries.some(([key, child]) => ['__proto__', 'prototype', 'constructor'].includes(key) || !visit(child, depth + 1))) return false;
    seen.delete(item);
    return true;
  }
  try { return visit(value, 0) && JSON.stringify(value).length <= bytes; } catch { return false; }
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

function errorMessage(error) {
  switch (error?.type) {
    case 'peer-unavailable': return 'Room not found. Check the six-character code and make sure the host is still in the lobby.';
    case 'unavailable-id': return 'That room code is already in use. Create a room again for a new code.';
    case 'browser-incompatible': return 'This browser does not support WebRTC. Try a current Chrome, Firefox, Edge, or Safari browser.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return 'The signaling server could not be reached. Check your connection and try again.';
    case 'webrtc': return 'The WebRTC connection failed. A restrictive network may require a configured TURN relay.';
    default: return typeof error?.message === 'string' ? error.message.slice(0, 180) : 'The multiplayer connection failed. Please try again.';
  }
}

/**
 * Four-player host-authoritative PeerJS transport. Guests send intent only;
 * the host applies game rules and broadcasts snapshots. Peer IDs are connection
 * identities for this room, not persistent accounts or authentication claims.
 *
 * window.AFTERLIGHT_NETWORK is a PeerJS options object. For a relay, provide
 * { config: { iceServers: [{ urls: 'turn:…', username: '…', credential: '…' }] } }.
 * For a custom signaler provide { host, port, path, secure } in the same object.
 */
export class PartyNetwork {
  constructor(options = {}) {
    this.Peer = options.Peer ?? Peer;
    const external = globalThis.window?.AFTERLIGHT_NETWORK ?? {};
    this.config = {
      debug: 0,
      ...external,
      ...options.config,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }],
        ...external.config,
        ...options.config?.config,
      },
    };
    for (const name of ['onStatus', 'onPlayers', 'onState', 'onAction', 'onInput', 'onDisconnect']) this[name] = options[name] ?? noop;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.heartbeatMs = options.heartbeatMs ?? 2500;
    this.staleMs = options.staleMs ?? 20000;
    this.now = options.now ?? Date.now;
    this.role = 'offline';
    this.id = '';
    this.code = '';
    this.players = [];
    this.locked = false;
    this.peer = null;
    this.connections = new Map();
    this.pending = new Set();
    this.timers = new Set();
    this.session = 0;
    this.lastState = null;
    this.stateProjector = null;
    this.awaiting = null;
    this.hostConnection = null;
    this.meshConnections = new Map();
    this.inputSequence = 0;
    this.lastInputMask = -1;
    this.lastInputSentAt = -Infinity;
    this.inputSequences = new Map();
    this.inputHistory = new Map();
    this.appliedInputs = {};
    this.inputAcks = {};
    this.snapshotSequence = 0;
    this.receivedSnapshot = null;
    this.receivedSnapshotSequence = 0;
    this.snapshotBases = new Map();
    this.inputStats = { sent: 0, directReceived: 0, relayReceived: 0, hostReceived: 0, duplicates: 0 };
    this.snapshotStats = { full: 0, delta: 0, bytes: 0, rawBytes: 0, dropped: 0 };
  }

  async host(profile = {}) {
    this.close();
    const session = this.session;
    this.role = 'host';
    this.code = roomCode();
    this.onStatus('Creating a WebRTC room…');
    try {
      await this._openPeer(PREFIX + this.code, session);
      if (session !== this.session) throw new Error('Connection canceled.');
      this.players = [{ id: this.id, ...profileOf(profile), bot: false }];
      this._publishPlayers();
      this._startHeartbeat(session);
      this.onStatus(`Room ${this.code} is ready. Share the code with your friends.`);
      return { code: this.code, id: this.id };
    } catch (error) {
      if (session === this.session) this._fail(error.message);
      throw error;
    }
  }

  async join(code, profile = {}) {
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new Error('Enter the six-character room code.');
    this.close();
    const session = this.session;
    this.role = 'guest';
    this.code = normalized;
    this.onStatus('Connecting to the host over WebRTC…');
    try {
      await this._openPeer(undefined, session);
      if (session !== this.session) throw new Error('Connection canceled.');
      await new Promise((resolve, reject) => {
        const timer = this._later(() => reject(new Error('The host did not respond. Check the room code; restrictive networks may need a TURN relay.')), this.timeoutMs);
        this.awaiting = error => {
          this._clear(timer);
          this.awaiting = null;
          error ? reject(error) : resolve();
        };
        const conn = this.peer.connect(PREFIX + normalized, { reliable: true, serialization: 'json', label: 'afterlight-v1' });
        this.hostConnection = { conn, lastSeen: this.now(), admitted: false };
        conn.on('open', () => {
          if (session === this.session) this._send(conn, packet('hello', { profile: profileOf(profile) }));
        });
        conn.on('data', data => { if (session === this.session) this._guestData(data); });
        conn.on('close', () => { if (session === this.session) this._hostLost('The host left the room. Return to the lobby to start or join another party.'); });
        conn.on('error', error => { if (session === this.session) this._hostLost(errorMessage(error)); });
      });
      if (session !== this.session) throw new Error('Connection canceled.');
      this._startHeartbeat(session);
      this.onStatus('Connected to the party over WebRTC.');
      return { id: this.id };
    } catch (error) {
      if (session === this.session) this._fail(error.message);
      throw error;
    }
  }

  _openPeer(id, session) {
    return new Promise((resolve, reject) => {
      let opened = false;
      const timer = this._later(() => reject(new Error('The signaling server timed out. Check your internet connection and try again.')), this.timeoutMs);
      this.awaiting = error => {
        this._clear(timer);
        this.awaiting = null;
        error ? reject(error) : resolve();
      };
      try { this.peer = id ? new this.Peer(id, this.config) : new this.Peer(this.config); }
      catch (error) { this.awaiting(new Error(errorMessage(error))); return; }
      this.peer.on('open', peerId => {
        if (session !== this.session) return;
        if (opened) { this.onStatus('Signaling connection restored.'); return; }
        opened = true;
        this.id = peerId;
        this.awaiting?.();
      });
      this.peer.on('connection', conn => {
        if (session === this.session && conn.label === 'afterlight-input-v1' && this.role === 'guest') this._acceptMeshConnection(conn, session);
        else if (session === this.session && this.role === 'host') this._acceptConnection(conn, session);
        else conn.close();
      });
      this.peer.on('error', error => {
        if (session !== this.session) return;
        const message = errorMessage(error);
        if (this.awaiting) this.awaiting(new Error(message));
        else this.onStatus(message);
      });
      this.peer.on('disconnected', () => {
        if (session !== this.session) return;
        this.onStatus('Signaling connection interrupted. Existing players can keep playing; reconnecting for new joins…');
        this._later(() => {
          if (session === this.session && this.peer?.disconnected && !this.peer.destroyed) {
            try { this.peer.reconnect(); } catch { this.onStatus('Signaling is unavailable. Existing WebRTC connections remain active.'); }
          }
        }, 1200);
      });
      this.peer.on('close', () => {
        if (session !== this.session) return;
        if (this.role === 'guest') this._hostLost('The multiplayer connection closed. Return to the lobby and reconnect.');
        else {
          const playerId = this.id;
          this._fail('The host connection closed. Create another room to continue online.');
          this.onDisconnect({ playerId, hostLost: true, reason: 'Host connection closed.' });
        }
      });
    });
  }

  _acceptConnection(conn, session) {
    // Bound half-open handshakes independently of confirmed player slots.
    if (this.pending.size >= 8) { conn.close(); return; }
    const record = { conn, admitted: false, lastSeen: this.now(), windowStart: this.now(), inputs: 0, actions: 0 };
    this.pending.add(record);
    const timer = this._later(() => { if (!record.admitted) this._removeGuest(record); }, this.timeoutMs);
    record.timer = timer;
    conn.on('data', data => {
      if (session !== this.session || record.removed) return;
      if (!isRecord(data) || data.v !== VERSION || typeof data.t !== 'string' || !boundedJSON(data, 4096, 7, 150)) return;
      record.lastSeen = this.now();
      if (!record.admitted) {
        if (data.t !== 'hello' || !isRecord(data.profile)) return;
        if (this.locked) { this._reject(record, 'This party has already started. Join the next game from the lobby.'); return; }
        if (this.players.length >= MAX_PLAYERS) { this._reject(record, 'This room is full. A party has four player slots.'); return; }
        if (this.connections.has(conn.peer) || conn.peer === this.id) { this._reject(record, 'This player is already connected.'); return; }
        record.admitted = true;
        this._clear(timer);
        this.pending.delete(record);
        this.connections.set(conn.peer, record);
        this.players.push({ id: conn.peer, ...profileOf(data.profile), bot: false });
        this._send(conn, packet('welcome', { players: this.players, hostId: this.id }));
        this._publishPlayers();
        if (this.lastState !== null) this._sendSnapshot(conn);
        return;
      }
      if (data.t === 'ping') { this._send(conn, packet('pong')); return; }
      if (data.t === 'pong') return;
      if (data.t === 'resync') {
        if (this.now() - (record.lastResync ?? -Infinity) > 500) { record.lastResync = this.now(); this.snapshotBases.delete(conn.peer); this._sendSnapshot(conn); }
        return;
      }
      if (this.now() - record.windowStart >= 1000) {
        record.windowStart = this.now(); record.inputs = 0; record.actions = 0;
      }
      if (data.t === 'input' && ++record.inputs <= 90) {
        if (this._deliverInput(conn.peer, data, 'host')) {
          // Relay immediately as a fallback when a guest-to-guest path cannot
          // establish through a restrictive NAT. Mesh/relay duplicates dedupe.
          for (const [id, other] of this.connections) if (id !== conn.peer) this._send(other.conn, packet('intent', { playerId: conn.peer, q: data.q, b: data.b }));
        }
      } else if (data.t === 'action' && ++record.actions <= 15 && this._validAction(data.action, data.payload)) {
        this.onAction({ playerId: conn.peer, action: data.action, payload: data.payload });
      }
    });
    conn.on('close', () => { if (session === this.session) this._removeGuest(record, false); });
    conn.on('error', () => { if (session === this.session) this._removeGuest(record); });
  }

  _guestData(data) {
    if (!this.hostConnection || !isRecord(data) || data.v !== VERSION || !boundedJSON(data, 262144, 14)) return;
    this.hostConnection.lastSeen = this.now();
    if (data.t === 'reject' && typeof data.reason === 'string') { this._hostLost(data.reason.slice(0, 180)); return; }
    if (data.t === 'welcome' || data.t === 'roster') {
      const roster = data.players;
      if (!Array.isArray(roster) || roster.length < 1 || roster.length > MAX_PLAYERS) return;
      if (roster.some(player => !isRecord(player) || typeof player.id !== 'string' || player.id.length > 100)) return;
      if (new Set(roster.map(player => player.id)).size !== roster.length || !roster.some(player => player.id === this.id)) return;
      if (!roster.some(player => player.id === PREFIX + this.code)) return;
      if (!this.hostConnection.admitted && data.t !== 'welcome') return;
      this.players = roster.map(player => ({ id: player.id, ...profileOf(player), bot: false }));
      if (data.t === 'welcome') { this.hostConnection.admitted = true; this.awaiting?.(); }
      this.onPlayers(this.players.map(player => ({ ...player })));
      this._syncMesh();
    } else if (data.t === 'intent' && this.hostConnection.admitted && this.players.some(player => player.id === data.playerId)) {
      this._deliverInput(data.playerId, data, 'relay');
    } else if ((data.t === 'state' || data.t === 'delta') && this.hostConnection.admitted) {
      if (!Number.isSafeInteger(data.s) || data.s <= this.receivedSnapshotSequence) return;
      let state = data.state;
      if (data.t === 'delta') {
        if (data.base !== this.receivedSnapshotSequence) { this._send(this.hostConnection.conn, packet('resync')); return; }
        try { state = applyDelta(this.receivedSnapshot, data.delta); } catch { return; }
      }
      if (!isRecord(state) || !boundedJSON(state, 260000)) return;
      this.receivedSnapshot = JSON.parse(JSON.stringify(state));
      this.receivedSnapshotSequence = data.s;
      this.onState(state, { acks: data.a || {}, inputs: data.i || {}, snapshotSeq: data.s, gameKey: data.k || '', receivedAt: this.now() });
    } else if (data.t === 'ping') this._send(this.hostConnection.conn, packet('pong'));
  }

  _validAction(action, payload) {
    if (typeof action !== 'string' || !boundedJSON(payload, 1024, 4, 80)) return false;
    if (SIMPLE_ACTIONS.has(action)) return payload === null || (isRecord(payload) && Object.keys(payload).length === 0);
    if (!isRecord(payload)) return false;
    if (action === 'play-card') {
      return Object.keys(payload).every(key => ['cardId', 'color'].includes(key))
        && typeof payload.cardId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(payload.cardId)
        && (payload.color === undefined || CARD_COLORS.includes(payload.color));
    }
    if(action==='choose-event')return Object.keys(payload).length===1&&['prize','parade','follow','lantern','borrow','gift','bargain','safe','enter','picnic','reverse','wind','shelter','collect'].includes(payload.choice);
    return action === 'choose-path' && Object.keys(payload).length === 1 && ['main', 'shortcut'].includes(payload.choice);
  }

  sendAction(action, payload = null) {
    if (!this._validAction(action, payload)) return false;
    if (this.role === 'host') { this.onAction({ playerId: this.id, action, payload }); return true; }
    return this.role === 'guest' && this.hostConnection?.admitted ? this._send(this.hostConnection.conn, packet('action', { action, payload })) : false;
  }

  sendInput(input, { immediate = false } = {}) {
    const normalized = validInput(input);
    if (!normalized || !['host', 'guest'].includes(this.role) || (this.role === 'guest' && !this.hostConnection?.admitted)) return false;
    const mask = maskInput(normalized), changed = mask !== this.lastInputMask;
    if (!changed && !immediate && this.now() - this.lastInputSentAt < 100) return this.inputSequence;
    // Button changes are immediate and never dropped as replaceable held samples.
    // A 10 Hz refresh repairs temporary link stalls without 60 Hz idle traffic.
    const seq = ++this.inputSequence;
    this.lastInputMask = mask;
    this.lastInputSentAt = this.now();
    const intent = { q: seq, b: mask };
    this.inputStats.sent++;
    this._deliverInput(this.id, intent, 'local');
    if (this.role === 'host') {
      for (const { conn } of this.connections.values()) this._send(conn, packet('intent', { playerId: this.id, ...intent }));
    } else {
      this._send(this.hostConnection.conn, packet('input', intent), !changed && !immediate);
      for (const { conn } of this.meshConnections.values()) this._send(conn, packet('input', intent), !changed && !immediate);
    }
    return seq;
  }

  _deliverInput(playerId, data, source) {
    if (!Number.isSafeInteger(data.q) || data.q < 1 || data.q > 2147483647 || !Number.isInteger(data.b) || data.b < 0 || data.b > 63) return false;
    if (data.q <= (this.inputSequences.get(playerId) || 0)) { this.inputStats.duplicates++; return false; }
    this.inputSequences.set(playerId, data.q);
    const input = unpackInput(data.b);
    let history = this.inputHistory.get(playerId);
    if (!history) { history = new Map(); this.inputHistory.set(playerId, history); }
    history.set(data.q, input);
    while (history.size > 120) history.delete(history.keys().next().value);
    if (source === 'direct') this.inputStats.directReceived++;
    if (source === 'relay') this.inputStats.relayReceived++;
    if (source === 'host') this.inputStats.hostReceived++;
    this.onInput({ playerId, input, seq: data.q, source, receivedAt: this.now() });
    return true;
  }

  markInputApplied(playerId, seq) {
    if (this.role !== 'host' || !Number.isSafeInteger(seq) || seq <= (this.inputAcks[playerId] || 0)) return;
    const input = this.inputHistory.get(playerId)?.get(seq);
    if (!input) return;
    this.inputAcks[playerId] = seq;
    this.appliedInputs[playerId] = { seq, input };
  }

  _syncMesh() {
    if (this.role !== 'guest' || !this.hostConnection?.admitted || !this.peer || this.peer.disconnected) return;
    const guests = this.players.filter(player => player.id !== this.id && player.id !== PREFIX + this.code);
    for (const [id, record] of this.meshConnections) {
      if (!guests.some(player => player.id === id)) { this.meshConnections.delete(id); record.conn.close(); }
    }
    // Exactly one side dials. State/roster membership still come only from host.
    for (const player of guests) if (this.id < player.id && !this.meshConnections.has(player.id)) {
      try {
        const conn = this.peer.connect(player.id, { reliable: true, serialization: 'json', label: 'afterlight-input-v1', metadata: { room: this.code } });
        this._acceptMeshConnection(conn, this.session);
      } catch { /* The admitted host connection remains the input relay. */ }
    }
  }

  _acceptMeshConnection(conn, session) {
    if (!this.players.some(player => player.id === conn.peer) || conn.peer === PREFIX + this.code || conn.peer === this.id || this.meshConnections.has(conn.peer)) { conn.close(); return; }
    const record = { conn, windowStart: this.now(), inputs: 0 };
    this.meshConnections.set(conn.peer, record);
    conn.on('data', data => {
      if (session !== this.session || this.meshConnections.get(conn.peer) !== record || !isRecord(data) || data.v !== VERSION || data.t !== 'input') return;
      if (!boundedJSON(data, 128, 2, 8)) return;
      if (this.now() - record.windowStart >= 1000) { record.windowStart = this.now(); record.inputs = 0; }
      if (++record.inputs <= 90) this._deliverInput(conn.peer, data, 'direct');
    });
    const remove = () => { if (this.meshConnections.get(conn.peer) === record) this.meshConnections.delete(conn.peer); };
    conn.on('close', remove);
    conn.on('error', () => { remove(); conn.close(); });
    this._later(() => { if (this.meshConnections.get(conn.peer) === record && !conn.open) { remove(); conn.close(); } }, this.timeoutMs);
  }

  broadcast(state, projector = this.stateProjector) {
    if (this.role !== 'host' || !isRecord(state) || !boundedJSON(state, 260000)) return false;
    if (projector !== null && typeof projector !== 'function') return false;
    // A private hand must never fall back to a public/raw broadcast by mistake.
    if (!projector && Array.isArray(state.players) && state.players.some(player => Array.isArray(player?.hand))) return false;
    this.lastState = state;
    this.stateProjector = projector;
    this.snapshotSequence++;
    for (const { conn } of this.connections.values()) this._sendSnapshot(conn, true);
    return true;
  }

  _sendSnapshot(conn, transient = false) {
    if (this.lastState === null) return false;
    try {
      const state = this.stateProjector ? this.stateProjector(this.lastState, conn.peer) : this.lastState;
      if (!isRecord(state) || !boundedJSON(state, 260000)) return false;
      const seq = this.snapshotSequence || 1;
      const base = this.snapshotBases.get(conn.peer);
      const fields = { s: seq, a: this.inputAcks, i: this.appliedInputs, k: state.game ? state.game.netId || `${state.round || 0}:${state.nextGame ?? state.game.id}:${state.game.id}` : '' };
      let message = packet('state', { ...fields, state });
      const rawBytes = JSON.stringify(message).length;
      if (base && this.now() - base.fullAt < 2000) {
        const delta = makeDelta(base.state, state);
        const deltaMessage = packet('delta', { ...fields, base: base.seq, delta });
        if (JSON.stringify(deltaMessage).length < rawBytes * .8) message = deltaMessage;
      }
      if (!this._send(conn, message, transient)) { this.snapshotStats.dropped++; return false; }
      this.snapshotBases.set(conn.peer, { state: JSON.parse(JSON.stringify(state)), seq, fullAt: message.t === 'state' ? this.now() : base.fullAt });
      this.snapshotStats[message.t === 'state' ? 'full' : 'delta']++;
      this.snapshotStats.bytes += JSON.stringify(message).length;
      this.snapshotStats.rawBytes += rawBytes;
      return true;
    } catch {
      // Projection failures drop this snapshot; raw authoritative hands stay local.
      return false;
    }
  }

  setLocked(locked) { this.locked = Boolean(locked); }

  _send(conn, data, transient = false) {
    if (!conn?.open) return false;
    // Drop replaceable snapshots and held-input samples when a link is congested.
    if (transient && ((conn.bufferSize ?? 0) > 0 || (conn.dataChannel?.bufferedAmount ?? 0) > 32768)) return false;
    try { conn.send(data); return true; } catch { return false; }
  }

  _publishPlayers() {
    const players = this.players.map(player => ({ ...player }));
    this.onPlayers(players);
    for (const { conn } of this.connections.values()) this._send(conn, packet('roster', { players }));
  }

  _reject(record, reason) {
    this._send(record.conn, packet('reject', { reason }));
    // Give the reliable channel a chance to deliver the useful rejection.
    this._later(() => this._removeGuest(record), 150);
  }

  _removeGuest(record, close = true) {
    if (record.removed) return;
    record.removed = true;
    this._clear(record.timer);
    this.pending.delete(record);
    const playerId = record.conn.peer;
    if (this.connections.get(playerId) === record) {
      this.connections.delete(playerId);
      this.snapshotBases.delete(playerId);
      this.players = this.players.filter(player => player.id !== playerId);
      this._publishPlayers();
      this.onDisconnect({ playerId, hostLost: false, reason: 'Player disconnected.' });
    }
    if (close) record.conn.close();
  }

  _hostLost(reason) {
    if (this.role !== 'guest') return;
    const playerId = PREFIX + this.code;
    const wasAdmitted = this.hostConnection?.admitted;
    this._fail(reason);
    if (wasAdmitted) this.onDisconnect({ playerId, hostLost: true, reason });
  }

  _fail(message) {
    this.close(new Error(message));
    this.onStatus(message);
  }

  _startHeartbeat(session) {
    const tick = () => {
      if (session !== this.session) return;
      if (this.role === 'host') {
        for (const record of [...this.connections.values()]) {
          if (this.now() - record.lastSeen > this.staleMs) this._removeGuest(record);
          else this._send(record.conn, packet('ping'));
        }
      } else if (this.role === 'guest' && this.hostConnection) {
        this._syncMesh();
        if (this.now() - this.hostConnection.lastSeen > this.staleMs) { this._hostLost('The host stopped responding. Return to the lobby and reconnect.'); return; }
        this._send(this.hostConnection.conn, packet('ping'));
      }
      this._later(tick, this.heartbeatMs);
    };
    this._later(tick, this.heartbeatMs);
  }

  _later(callback, ms) {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, ms);
    this.timers.add(timer);
    return timer;
  }
  _clear(timer) { clearTimeout(timer); this.timers.delete(timer); }

  close(reason = new Error('Connection canceled.')) {
    this.session++;
    const awaiting = this.awaiting;
    this.awaiting = null;
    awaiting?.(reason);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const peer = this.peer;
    this.peer = null;
    this.role = 'offline';
    this.id = '';
    this.code = '';
    this.players = [];
    this.locked = false;
    this.lastState = null;
    this.stateProjector = null;
    for (const record of this.meshConnections.values()) record.conn.close();
    this.meshConnections.clear();
    this.inputSequence = 0;
    this.lastInputMask = -1;
    this.lastInputSentAt = -Infinity;
    this.inputSequences.clear(); this.inputHistory.clear();
    this.appliedInputs = {}; this.inputAcks = {};
    this.snapshotSequence = 0; this.receivedSnapshot = null; this.receivedSnapshotSequence = 0; this.snapshotBases.clear();
    for (const record of [...this.pending, ...this.connections.values()]) record.conn.close();
    this.pending.clear();
    this.connections.clear();
    this.hostConnection?.conn.close();
    this.hostConnection = null;
    if (peer && !peer.destroyed) peer.destroy();
  }
}
