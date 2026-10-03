import { stepGame } from './minigames.js';

export const FIXED_STEP = 1 / 60;
const KEYS = ['left', 'right', 'up', 'down', 'action', 'special'];
const clean = input => Object.fromEntries(KEYS.map(key => [key, !!input?.[key]]));
const copy = value => JSON.parse(JSON.stringify(value));

/** A single fixed-step simulation for authority and local prediction.
 * Network authority always supplies scores/results. The guest simulation only
 * supplies the interactive render state between authoritative snapshots.
 */
export class RealtimeGame {
  constructor({ localId = '', authoritative = false, onApplied = () => {} } = {}) {
    this.localId = localId;
    this.authoritative = authoritative;
    this.onApplied = onApplied;
    this.game = null;
    this.key = '';
    this.accumulator = 0;
    this.clock = 0;
    this.timelineTime = 0;
    this.tracks = new Map();
    this.corrections = new Map();
    this.stats = { steps: 0, reconciliations: 0, replaySteps: 0, pendingInputs: 0 };
  }

  setGame(game, key = game?.id || '') {
    if (this.game === game && this.key === key) return;
    if (this.key !== key || !game) {
      this.accumulator = 0;
      this.clock = 0;
      this.timelineTime = game?.time || 0;
      this.corrections.clear();
      // Keep the held state and sequence across rounds, but never old tap queues.
      for (const track of this.tracks.values()) { track.queue = []; track.history = []; }
    }
    this.key = key;
    this.game = this.authoritative ? game : game ? copy(game) : null;
  }

  setInput(playerId, input, seq = 0) {
    if (typeof playerId !== 'string') return false;
    let track = this.tracks.get(playerId);
    if (!track) {
      track = { seq: 0, held: clean(), queue: [], history: [], age: 0 };
      this.tracks.set(playerId, track);
    }
    if (!Number.isSafeInteger(seq) || seq <= 0) seq = track.seq + 1;
    if (seq <= track.seq) return false;
    const event = { seq, input: clean(input), at: this.game?.time || 0, clock: this.clock, timelineAt: this.timelineTime };
    track.seq = seq;
    track.age = 0;
    track.queue.push(event);
    track.history.push(event);
    if (track.queue.length > 120) track.queue.splice(0, track.queue.length - 120);
    if (track.history.length > 360) track.history.splice(0, track.history.length - 360);
    return true;
  }

  _step(replay = false) {
    if (!this.game || this.game.done) return;
    const inputs = {}, consumed = [];
    for (const actor of this.game.players) {
      const track = this.tracks.get(actor.id);
      if (!track || actor.bot) continue;
      track.age = (track.age || 0) + FIXED_STEP;
      if (this.authoritative && actor.id !== this.localId && track.age > .6) { track.held = clean(); track.queue = []; }
      // Consume at most one transition per simulation tick. A press and release
      // arriving together must still become two ticks, otherwise taps disappear.
      if (track.queue.length && track.queue[0].at <= this.game.time + FIXED_STEP + 1e-7) {
        const event = track.queue.shift();
        track.held = event.input;
        event.appliedAt ??= this.game.time;
        consumed.push([actor.id, event.seq]);
      }
      inputs[actor.id] = track.held;
    }
    stepGame(this.game, inputs, FIXED_STEP);
    if (this.authoritative && !replay) for (const [playerId, seq] of consumed) this.onApplied(playerId, seq);
    this.stats.steps++;
    if (replay) this.stats.replaySteps++;
  }

  advance(dt) {
    if (!this.game || this.game.done) return this.game;
    this.accumulator += Math.min(.25, Math.max(0, dt || 0));
    let count = 0;
    while (this.accumulator + 1e-9 >= FIXED_STEP && count++ < 15) {
      this.accumulator -= FIXED_STEP;
      this._step();
      this.clock += FIXED_STEP;
      this.timelineTime += FIXED_STEP;
    }
    this.stats.pendingInputs = [...this.tracks.values()].reduce((sum, track) => sum + track.queue.length, 0);
    return this.game;
  }

  reconcile(authoritativeGame, meta = {}, key = authoritativeGame?.id || '') {
    if (this.authoritative) { this.setGame(authoritativeGame, key); return this.game; }
    if (!authoritativeGame) { this.setGame(null, ''); return null; }
    if (!this.game || this.key !== key) {
      this.setGame(authoritativeGame, key);
      for (const actor of this.game.players) {
        const track = this.tracks.get(actor.id);
        if (track) track.held = clean(meta.inputs?.[actor.id]?.input || actor.prev);
      }
      return this.game;
    }
    const before = this.game;
    // Replay to the already displayed local time. No input waits for an echo.
    // Bound catch-up work after a suspended tab to avoid a long blocking frame.
    const localPending = this.tracks.get(this.localId)?.history.filter(event => event.seq > (meta.acks?.[this.localId] || 0)) || [];
    const unacknowledgedTime = localPending.length ? Math.max(0, this.clock - localPending[0].clock) : 0;
    const targetTime = Math.max(authoritativeGame.time, Math.min(Math.max(this.timelineTime, authoritativeGame.time + unacknowledgedTime), authoritativeGame.time + 1));
    this.game = copy(authoritativeGame);
    const acks = meta.acks || {};
    for (const actor of this.game.players) {
      let track = this.tracks.get(actor.id);
      if (!track) {
        track = { seq: 0, held: clean(), queue: [], history: [], age: 0 };
        this.tracks.set(actor.id, track);
      }
      const ack = Number.isSafeInteger(acks[actor.id]) ? acks[actor.id] : 0;
      track.history = track.history.filter(event => event.seq > ack);
      track.held = clean(meta.inputs?.[actor.id]?.input || actor.prev);
      const first = track.history[0];
      track.queue = track.history.map(event => ({ ...event, at: actor.id === this.localId && first
        ? Math.max(this.game.time, first.timelineAt) + event.clock - first.clock
        : Math.max(this.game.time, event.appliedAt ?? event.at) }));
      track.seq = Math.max(track.seq, ack);
    }
    let replayCount = 0;
    while (this.game.time + FIXED_STEP <= targetTime + 1e-7 && !this.game.done && replayCount++ < 60) this._step(true);
    for (const actor of this.game.players) {
      if (actor.id === this.localId) continue;
      const previous = before.players.find(player => player.id === actor.id);
      if (!previous) continue;
      const correction = {};
      for (const field of ['x', 'y', 'angle', 'aim', 'lean', 'progress']) {
        if (Number.isFinite(previous[field]) && Number.isFinite(actor[field])) {
          let error = previous[field] - actor[field];
          if (field === 'angle') error = Math.atan2(Math.sin(error), Math.cos(error));
          correction[field] = error + (this.corrections.get(actor.id)?.[field] || 0);
        }
      }
      this.corrections.set(actor.id, correction);
    }
    this.stats.reconciliations++;
    return this.game;
  }

  renderGame(dt = FIXED_STEP) {
    if (!this.game || this.authoritative || !this.corrections.size) return this.game;
    const decay = Math.exp(-Math.max(0, dt) * 18);
    const players = this.game.players.map(actor => {
      if (actor.id === this.localId) return actor;
      const correction = this.corrections.get(actor.id);
      if (!correction) return actor;
      const rendered = { ...actor };
      for (const [field, error] of Object.entries(correction)) {
        correction[field] *= decay;
        rendered[field] += error * decay;
      }
      return rendered;
    });
    return { ...this.game, players };
  }

  clear() { this.game = null; this.key = ''; this.accumulator = 0; this.clock = 0; this.timelineTime = 0; this.tracks.clear(); this.corrections.clear(); }
}

/** JSON-tree delta. Arrays replace as a unit when their length changes. */
export function makeDelta(previous, next) {
  const changes = [], removals = [];
  function visit(a, b, path) {
    if (a === b) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
      && (!Array.isArray(b) || a.length === b.length)) {
      for (const key of Object.keys(a)) if (!(key in b)) removals.push([...path, key]);
      for (const key of Object.keys(b)) visit(a[key], b[key], [...path, key]);
    } else changes.push([path, b]);
  }
  visit(previous, next, []);
  // One parent path for a changed actor/effect instead of repeating that same
  // path for x, y, velocity, timers, etc. This matters in the platform fighters.
  const parents = new Map(), singles = [];
  for (const [path, value] of changes) {
    if (!path.length) { singles.push([path, value]); continue; }
    const parent = path.slice(0, -1), key = JSON.stringify(parent);
    if (!parents.has(key)) parents.set(key, [parent, {}]);
    parents.get(key)[1][path.at(-1)] = value;
  }
  return { changes: singles, groups: [...parents.values()], removals };
}

export function applyDelta(previous, delta) {
  if (!previous || !delta || !Array.isArray(delta.changes) || !Array.isArray(delta.removals)) return null;
  let state = copy(previous);
  const safe = path => Array.isArray(path) && path.length <= 12 && path.every(key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key));
  function parent(path) {
    let at = state;
    for (const key of path.slice(0, -1)) {
      if (!at || typeof at !== 'object' || !Object.hasOwn(at, key)) return null;
      at = at[key];
    }
    return at;
  }
  for (const path of delta.removals) {
    if (!safe(path) || !path.length) return null;
    const object = parent(path);
    if (!object || typeof object !== 'object') return null;
    delete object[path.at(-1)];
  }
  for (const entry of delta.changes) {
    if (!Array.isArray(entry) || entry.length !== 2 || !safe(entry[0])) return null;
    const [path, value] = entry;
    if (!path.length) state = copy(value);
    else {
      const object = parent(path);
      if (!object || typeof object !== 'object') return null;
      object[path.at(-1)] = copy(value);
    }
  }
  for (const entry of delta.groups || []) {
    if (!Array.isArray(entry) || entry.length !== 2 || !safe(entry[0]) || !entry[1] || typeof entry[1] !== 'object' || Array.isArray(entry[1])) return null;
    const [path, values] = entry;
    let object = state;
    for (const key of path) {
      if (!object || typeof object !== 'object' || !Object.hasOwn(object, key)) return null;
      object = object[key];
    }
    if (!object || typeof object !== 'object') return null;
    for (const [key, value] of Object.entries(values)) {
      if (!safe([key])) return null;
      object[key] = copy(value);
    }
  }
  return state;
}
