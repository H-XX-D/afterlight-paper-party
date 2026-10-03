import { PartyNetwork } from '../src/network.js';
import { createParty, viewParty } from '../src/board.js';
import { MINIGAMES, createGame, stepGame } from '../src/minigames.js';
import { writeFileSync } from 'node:fs';
let now = 0;
const net = new PartyNetwork({ Peer: class {}, now: () => now });
net.role = 'host'; net.id = 'host';
const conn = { peer: 'guest', open: true, bufferSize: 0, dataChannel: { bufferedAmount: 0 }, send() {} };
net.connections.set('guest', { conn });
const party = createParty(['host', 'guest', 'other-a', 'other-b'].map((id, character) => ({ id, name: id, character })), { seed: 742 });
party.phase = 'minigame'; party.kind = 'party';
const games = [];
for (const [index, def] of MINIGAMES.entries()) {
  party.game = createGame(def.id, party.players.map(player => ({ ...player, bot: true })), 841); party.nextGame = index;
  net.snapshotBases.clear(); net.snapshotStats = { full: 0, delta: 0, bytes: 0, rawBytes: 0, dropped: 0 };
  for (let frame = 0; frame < 600; frame++) {
    stepGame(party.game, {}, 1 / 60); now += 1000 / 60;
    if (frame % 5 === 0) net.broadcast(party, viewParty);
  }
  const s = net.snapshotStats;
  games.push({ id: def.id, snapshots: s.full + s.delta, full: s.full, delta: s.delta, rawBytes: s.rawBytes, sentBytes: s.bytes,
    reductionPercent: Math.round(100 * (1 - s.bytes / s.rawBytes)), averageSentBytes: Math.round(s.bytes / (s.full + s.delta)),
    projectedHostBytesPerSecondForThreeGuests: Math.round(s.bytes * 3 / 10) });
}
const result = { sample: 'Each minigame, four bots, ten simulation seconds, 60 Hz simulation, 12 Hz snapshots, one recipient private view. Projected three-guest throughput excludes WebRTC/DTLS/IP overhead.', generatedAt: new Date().toISOString(), games };
writeFileSync(new URL('../verification/network-payload-profile.json', import.meta.url), JSON.stringify(result, null, 2));
console.table(games.map(({ id, reductionPercent, averageSentBytes, projectedHostBytesPerSecondForThreeGuests }) => ({ id, reductionPercent, averageSentBytes, projectedHostBytesPerSecondForThreeGuests })));
