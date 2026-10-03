import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeGame, FIXED_STEP, makeDelta, applyDelta } from '../src/realtime.js';
import { MINIGAMES, createGame } from '../src/minigames.js';

const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, character: i, bot: false }));
const clone = value => JSON.parse(JSON.stringify(value));
const game = id => createGame(id, players, 481);
function biteFixture() {
  const g = game('gullet-gala'), p = g.players[1];
  Object.assign(p, { baseX: 210, baseY: 292, x: 210, y: 292, baseAngle: 0, angle: 0, aim: 0 });
  g.state.spawnClock = 999;
  g.state.objects = [{ id: ++g.state.nextId, kind: 'crumb', x: 335, y: 292, vx: 0, vy: 0, r: 8, value: 1, life: 15, spin: 0 }];
  return g;
}

test('every minigame stays deterministic when rendered at different frame rates', () => {
  for (const { id } of MINIGAMES) {
    const a = new RealtimeGame({ authoritative: true, localId: 'p0' });
    const b = new RealtimeGame({ authoritative: true, localId: 'p0' });
    a.setGame(game(id), id); b.setGame(game(id), id);
    for (let phase = 0; phase < 10; phase++) {
      for (let player = 0; player < 4; player++) {
        const input = { right: phase % 2 === 0, left: phase % 2 === 1, up: player % 2 === 0, down: phase === 4, action: phase % 3 === 1, special: phase === 2 };
        a.setInput(`p${player}`, input, phase + 1); b.setInput(`p${player}`, input, phase + 1);
      }
      for (let frame = 0; frame < 12; frame++) a.advance(FIXED_STEP);
      for (let frame = 0; frame < 6; frame++) b.advance(FIXED_STEP * 2);
    }
    assert.deepEqual(a.game, b.game, `${id} uses the same fixed 60 Hz simulation at 30 and 60 fps`);
  }
});

test('local movement starts before any host echo and unacknowledged movement survives reconciliation', () => {
  const original = game('mothlight');
  const client = new RealtimeGame({ localId: 'p0' });
  client.setGame(original, '1:mothlight');
  const x = client.game.players[0].x;
  client.setInput('p0', { right: true }, 1);
  client.advance(FIXED_STEP);
  assert.ok(client.game.players[0].x > x);
  assert.equal(original.players[0].x, x, 'prediction never mutates authority');
  for (let i = 0; i < 11; i++) client.advance(FIXED_STEP);
  const predictedX = client.game.players[0].x;
  const hostWithoutInput = clone(original);
  hostWithoutInput.time = .2;
  client.reconcile(hostWithoutInput, { acks: { p0: 0 } }, '1:mothlight');
  assert.ok(Math.abs(client.game.players[0].x - predictedX) < .001, 'pending movement is replayed, not erased by a delayed echo');
  assert.equal(client.renderGame().players[0].x, client.game.players[0].x, 'local actor has no interpolation delay');
});

test('press and release received together remain separate simulation edges and ACK after consumption', () => {
  const applied = [], outcomeAtAck = [];
  const host = new RealtimeGame({ localId: 'p0', authoritative: true, onApplied: (id, seq) => {
    applied.push([id, seq]);
    const p = host.game.players[1];
    outcomeAtAck.push({ charging: p.charging, bites: p.bites });
  } });
  host.setGame(biteFixture(), 'gullet-gala');
  host.setInput('p1', { action: true }, 1);
  host.setInput('p1', { action: false }, 2);
  assert.deepEqual(applied, []);
  host.advance(FIXED_STEP);
  assert.deepEqual(applied, [['p1', 1]]);
  assert.equal(host.game.players[1].prev.action, true);
  assert.equal(host.game.players[1].charging, true);
  assert.equal(host.game.players[1].bites, 0, 'press primes the jaw; release has not been consumed');
  assert.ok(host.game.players[1].x > 210, 'press visibly primes the real mouth');
  host.advance(FIXED_STEP);
  assert.deepEqual(applied, [['p1', 1], ['p1', 2]]);
  assert.equal(host.game.players[1].prev.action, false);
  assert.equal(host.game.players[1].bites, 1, 'the queued release launches exactly one real bite');
  assert.deepEqual(outcomeAtAck, [{ charging: true, bites: 0 }, { charging: false, bites: 1 }], 'each ACK follows the corresponding gameplay transition');
  for (let frame = 0; frame < 18; frame++) host.advance(FIXED_STEP);
  assert.equal(host.game.players[1].caught, 1);
  assert.equal(host.game.players[1].score, 1);
  assert.equal(host.game.state.objects.length, 0, 'the bite physically claims its pellet');
});

test('acknowledged action edges are not replayed a second time', () => {
  const host = new RealtimeGame({ authoritative: true, localId: 'p0' });
  const client = new RealtimeGame({ localId: 'p1' });
  host.setGame(biteFixture(), 'gullet-gala'); client.setGame(biteFixture(), 'gullet-gala');
  for (const simulation of [host, client]) {
    simulation.setInput('p1', { action: true }, 1);
    simulation.setInput('p1', { action: false }, 2);
    for (let frame = 0; frame < 60; frame++) simulation.advance(FIXED_STEP);
    assert.equal(simulation.game.players[1].bites, 1);
    assert.equal(simulation.game.players[1].caught, 1);
    assert.equal(simulation.game.players[1].score, 1);
    assert.equal(simulation.game.players[1].cooldown, 0, 'reconciliation occurs after cooldown, so it cannot hide a duplicated bite');
  }
  client.reconcile(host.game, { acks: { p1: 2 }, inputs: { p1: { seq: 2, input: { action: false } } } }, 'gullet-gala');
  for (let frame = 0; frame < 36; frame++) client.advance(FIXED_STEP);
  assert.equal(client.game.players[1].bites, 1);
  assert.equal(client.game.players[1].caught, 1);
  assert.equal(client.game.players[1].score, 1);
  assert.equal(client.tracks.get('p1').history.length, 0);
  assert.equal(client.tracks.get('p1').queue.length, 0);
});

test('the sixth button predicts a damaging special before the host echo and reconciles once', () => {
  const original = game('rift-rumble');
  original.players[0].x = 350; original.players[0].facing = 1;
  original.players[1].x = 420; original.players[2].x = 700; original.players[3].x = 800;
  const host = new RealtimeGame({ authoritative: true, localId: 'p1' });
  const client = new RealtimeGame({ localId: 'p0' });
  host.setGame(original, 'rift-rumble'); client.setGame(original, 'rift-rumble');
  client.setInput('p0', { special: true }, 1);
  client.advance(FIXED_STEP);
  assert.equal(client.game.players[0].specialUses, 1);
  assert.equal(client.game.players[0].specialAnimation, 'windup');
  assert.equal(original.players[0].specialUses, 0, 'local special prediction does not alter the host');
  client.setInput('p0', { special: false }, 2);
  for (let frame = 0; frame < 24; frame++) client.advance(FIXED_STEP);
  assert.ok(client.game.players[1].damage > 0, 'the predicted courier cut actually strikes the rival');
  assert.equal(client.game.players[0].moveUses.slash, 0, 'special remains distinct from the normal action button');
  client.reconcile(original, { acks: { p0: 0 } }, 'rift-rumble');
  assert.equal(client.game.players[0].specialUses, 1, 'unacknowledged special replays from authority exactly once');
  assert.ok(client.game.players[1].damage > 0);
  host.setInput('p0', { special: true }, 1);
  host.setInput('p0', { special: false }, 2);
  for (let frame = 0; frame < 25; frame++) host.advance(FIXED_STEP);
  client.reconcile(host.game, { acks: { p0: 2 }, inputs: { p0: { seq: 2, input: { special: false } } } }, 'rift-rumble');
  assert.equal(client.game.players[0].specialUses, 1);
  assert.equal(client.game.players[1].damage, host.game.players[1].damage);
  assert.equal(client.tracks.get('p0').history.length, 0);
  assert.equal(client.tracks.get('p0').held.special, false);
});

test('remote corrections smooth only the render copy and cannot move authority or local simulation', () => {
  const client = new RealtimeGame({ localId: 'p0' });
  client.setGame(game('mothlight'), 'mothlight');
  const authoritative = clone(client.game);
  authoritative.players[0].x += 20;
  authoritative.players[1].x += 100;
  client.reconcile(authoritative, {}, 'mothlight');
  const render = client.renderGame(FIXED_STEP);
  assert.equal(render.players[0].x, authoritative.players[0].x);
  assert.ok(render.players[1].x < authoritative.players[1].x);
  assert.equal(client.game.players[1].x, authoritative.players[1].x);
  for (let i = 0; i < 60; i++) client.renderGame(FIXED_STEP);
  assert.ok(Math.abs(client.renderGame(FIXED_STEP).players[1].x - authoritative.players[1].x) < .01);
});

test('stale remote held inputs release on authority while fresh refresh sequences keep movement alive', () => {
  const host = new RealtimeGame({ localId: 'p0', authoritative: true });
  host.setGame(game('mothlight'), 'mothlight');
  host.setInput('p1', { right: true }, 1);
  for (let i = 0; i < 42; i++) host.advance(FIXED_STEP);
  const stopped = host.game.players[1].x;
  host.advance(.1);
  assert.equal(host.game.players[1].x, stopped);
  host.setInput('p1', { right: true }, 2); host.advance(FIXED_STEP);
  assert.ok(host.game.players[1].x > stopped);
});

test('recipient-safe JSON deltas reconstruct additions, deletions, changing arrays, and nested states', () => {
  const a = { phase: 'board', players: [{ id: 'a', hand: [{ back: true }], x: 3 }], old: true, fixed: 'static scenery' };
  const b = { phase: 'minigame', players: [{ id: 'a', hand: [{ back: true }, { back: true }], x: 8 }], fixed: 'static scenery', game: { time: 2, score: 1 } };
  const reconstructed = applyDelta(a, makeDelta(a, b));
  assert.deepEqual(reconstructed, b);
  assert.equal(a.players[0].x, 3);
  assert.equal(applyDelta(a, { changes: [[['__proto__', 'polluted'], true]], removals: [] }), null);
  assert.equal({}.polluted, undefined);
});
