import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { PeerServer } from 'peer';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(project, 'verification');
const baseURL = process.env.AFTERLIGHT_TEST_URL || 'http://localhost:5187';
await mkdir(artifacts, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), baseURL,
  transport: 'Real Chrome RTCPeerConnection and PeerJS DataConnection; local ephemeral PeerServer; host ICE candidates; no mocks',
  limits: ['Local direct WebRTC only. Public PeerJS signaling, internet NAT traversal, TURN relaying, and other browser engines are not established by this test.',
    'The board host/join/roll/start/leave paths use the visible UI. All twenty minigame snapshots are seeded through imported production simulation functions to exercise their full state through the real DataChannels without waiting through twenty full rounds.'],
  assertions: [], minigames: [], browserErrors: [], browserConsoleErrors: [], signalingClients: [], passed: false,
};
let server, browser;
const check = (name, detail = {}) => { report.assertions.push({ name, passed: true, ...detail }); console.log(`PASS ${name}`); };
const snapshot = page => page.evaluate(() => {
  const n = window.afterlight.network;
  return { role: n?.role, id: n?.id, code: n?.code, roster: n?.players, route: window.afterlight.route,
    state: window.afterlight.state, connections: n ? [...n.connections.values()].map(({ conn }) => ({ peer: conn.peer, open: conn.open, connectionState: conn.peerConnection?.connectionState, dataChannel: conn.dataChannel?.readyState })) : [] };
});

try {
  const signaler = await new Promise(resolve => {
    const instance = PeerServer({ host: '127.0.0.1', port: 0, path: '/peerjs', allow_discovery: false }, httpServer => { server = httpServer; resolve(instance); });
  });
  signaler.on('connection', client => report.signalingClients.push(client.getId()));
  const port = server.address().port;
  report.signalingPort = port;
  const options = { headless: true, args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] };
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try { await access(chrome); options.executablePath = chrome; } catch {}
  browser = await chromium.launch(options);
  report.browserVersion = browser.version();
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 1440, height: 1080 } })));
  const pages = [];
  for (let i = 0; i < contexts.length; i++) {
    await contexts[i].addInitScript(({ port }) => {
      window.AFTERLIGHT_NETWORK = { host: '127.0.0.1', port, path: '/peerjs', secure: false, config: { iceServers: [] } };
    }, { port });
    const page = await contexts[i].newPage();
    page.on('pageerror', error => report.browserErrors.push({ player: i, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.browserConsoleErrors.push({ player: i, message: message.text() }); });
    page.on('dialog', dialog => dialog.dismiss());
    pages.push(page);
  }
  await Promise.all(pages.map(page => page.goto(baseURL, { waitUntil: 'networkidle' })));
  await Promise.all(pages.map(page => page.waitForFunction(() => window.afterlight?.route === 'home')));
  const [host, guest1, guest2, guest3] = pages;
  const names = ['Host Paper', 'Guest Moth', 'Guest Bolt', 'Guest Wisp'];
  for (let i = 0; i < pages.length; i++) {
    await pages[i].locator('[data-play="online"]').click();
    await pages[i].locator('#player-name').fill(names[i]);
    await pages[i].locator(`[data-character="${i}"]`).click();
  }
  await host.locator('#host').click();
  await host.waitForFunction(() => window.afterlight?.route === 'lobby' && window.afterlight.network?.role === 'host');
  const code = await host.locator('#room-code').innerText();
  assert.match(code, /^[A-Z0-9]{6}$/);
  for (const page of pages.slice(1)) {
    await page.locator('#join-code').fill(code);
    await page.locator('#join').click();
    await page.waitForFunction(() => window.afterlight?.route === 'lobby' && window.afterlight.network?.role === 'guest');
  }
  await Promise.all(pages.map(page => page.waitForFunction(() => window.afterlight.network.players.length === 4)));
  report.roster = (await snapshot(host)).roster;
  assert.deepEqual(report.roster.map(player => player.name), names);
  check('Four separate browser contexts join the same room through the UI', { code, playerIds: report.roster.map(player => player.id) });

  const hostLinks = (await snapshot(host)).connections;
  assert.equal(hostLinks.length, 3);
  assert.ok(hostLinks.every(link => link.open && link.connectionState === 'connected' && link.dataChannel === 'open'));
  report.hostLinks = hostLinks;
  for (const page of pages.slice(1)) {
    const link = await page.evaluate(() => { const c = window.afterlight.network.hostConnection.conn; return { open: c.open, connectionState: c.peerConnection.connectionState, channel: c.dataChannel.readyState }; });
    assert.deepEqual(link, { open: true, connectionState: 'connected', channel: 'open' });
  }
  check('Three real WebRTC peer connections have connected transports and open data channels');

  await host.locator('#start-online').click();
  await Promise.all(pages.map(page => page.waitForFunction(() => window.afterlight.state?.phase === 'board')));
  const start = await snapshot(host);
  assert.equal(start.state.players.length, 4);
  assert.equal(start.state.players.some(player => player.bot), false);
  assert.equal(await host.evaluate(() => window.afterlight.network.locked), true);
  await host.screenshot({ path: path.join(artifacts, 'network-board-four-players.png'), fullPage: true });
  check('Host starts the party and every guest receives the four-human board state');

  // An out-of-turn guest supplies a forged host playerId through a real channel.
  const hostId = start.id;
  await guest1.evaluate(hostId => window.afterlight.network.hostConnection.conn.send({ v: 1, t: 'action', action: 'roll', payload: null, playerId: hostId }), hostId);
  await host.waitForTimeout(350);
  assert.equal((await snapshot(host)).state.boardStage, 'await-roll');
  check('A guest cannot roll out of turn by forging the host identity');
  await host.locator('#roll-dice').click();
  const guestId = await guest1.evaluate(() => window.afterlight.network.id);
  await guest1.waitForFunction(id => window.afterlight.state?.currentPlayerId === id && window.afterlight.state?.boardStage === 'await-roll', guestId, { timeout: 10000 });
  await guest1.locator('#roll-dice').click();
  await host.waitForFunction(id => window.afterlight.state.currentPlayerId === id && window.afterlight.state.boardStage !== 'await-roll', guestId);
  const rolling = (await snapshot(host)).state;
  assert.ok(rolling.dice >= 1 && rolling.dice <= 6);
  await guest2.waitForFunction(id => window.afterlight.state?.currentPlayerId === id && window.afterlight.state?.boardStage === 'await-roll', await guest2.evaluate(() => window.afterlight.network.id), { timeout: 10000 });
  check('Guest roll travels to the host, advances the board, and hands the turn to the next guest', { roll: rolling.dice });

  // Retain a raw snapshot history to compare complete serialized minigame state.
  await Promise.all(pages.slice(1).map(page => page.evaluate(() => {
    const n = window.afterlight.network, receive = n.onState;
    window.__networkSamples = [];
    n.onState = state => { if (state.game) window.__networkSamples.push(JSON.stringify(state.game)); if (window.__networkSamples.length > 80) window.__networkSamples.shift(); receive(state); };
  })));
  const defs = await host.evaluate(() => window.afterlight.minigames);
  assert.equal(defs.length, 20);
  for (let index = 0; index < defs.length; index++) {
    const seeded = await host.evaluate(async ({ index, id }) => {
      const { createGame, stepGame } = await import('/src/minigames.js');
      const party = window.afterlight.state;
      party.phase = 'minigame'; party.nextGame = index; party.countdown = 10000;
      party.game = createGame(id, party.players, 9000 + index);
      const intent = Object.fromEntries(party.players.map((p, i) => [p.id, { right: i % 2 === 0, left: i % 2 !== 0, up: true, action: true }]));
      for (let step = 0; step < 120; step++) { for (const input of Object.values(intent)) input.action = step % 14 < 7; stepGame(party.game, intent, 1 / 60); }
      const json = JSON.stringify(party.game);
      return { id, json, sent: window.afterlight.network.broadcast(party), bytes: JSON.stringify(party).length };
    }, { index, id: defs[index].id });
    assert.equal(seeded.sent, true, `Host accepts ${defs[index].id} snapshot`);
    await Promise.all(pages.slice(1).map(page => page.waitForFunction(json => window.__networkSamples.includes(json), seeded.json)));
    await Promise.all(pages.slice(1).map(page => page.waitForFunction(id => window.afterlight.state.game?.id === id, defs[index].id)));
    assert.equal(report.browserErrors.length, 0, `No renderer error for ${defs[index].id}`);
    report.minigames.push({ id: defs[index].id, name: defs[index].name, snapshotBytes: seeded.bytes, guestsMatchedExactly: 3 });
  }
  check('All twenty production minigames transmit their entire seeded state exactly to three real WebRTC guests', { count: report.minigames.length });

  await host.evaluate(async () => {
    const { createGame } = await import('/src/minigames.js');
    const p = window.afterlight.state; p.phase = 'minigame'; p.nextGame = 7; p.countdown = 0;
    p.game = createGame('tug', p.players, 1234); window.afterlight.network.broadcast(p);
  });
  await guest1.waitForFunction(() => window.afterlight.state.game?.id === 'tug' && window.afterlight.state.countdown === 0);
  // Focus the game canvas so Space exercises the production keyboard handler.
  await guest1.locator('#game-canvas').click({ position: { x: 25, y: 25 } });
  for (let press = 0; press < 6; press++) {
    await guest1.keyboard.down('Space'); await guest1.waitForTimeout(90);
    await guest1.keyboard.up('Space'); await guest1.waitForTimeout(90);
  }
  await host.waitForFunction(id => window.afterlight.state.game.players.find(p => p.id === id).score > 0, guestId);
  const score = await host.evaluate(id => window.afterlight.state.game.players.find(p => p.id === id).score, guestId);
  await Promise.all(pages.slice(1).map(page => page.waitForFunction(({ id, score }) => window.afterlight.state.game.players.find(p => p.id === id).score >= score, { id: guestId, score })));
  check('Real guest keyboard input changes the authoritative minigame score and synchronizes to every guest', { guestId, score });
  await guest2.screenshot({ path: path.join(artifacts, 'network-minigame-guest.png'), fullPage: true });

  report.rtcStats = await host.evaluate(async () => {
    const output = [];
    for (const { conn } of window.afterlight.network.connections.values()) {
      const stats = await conn.peerConnection.getStats();
      output.push({ peer: conn.peer, connectionState: conn.peerConnection.connectionState,
        stats: [...stats.values()].filter(stat => ['data-channel', 'transport', 'candidate-pair'].includes(stat.type)).map(stat => ({ ...stat })) });
    }
    return output;
  });
  assert.ok(report.rtcStats.every(link => link.stats.some(stat => stat.type === 'data-channel' && stat.messagesSent > 20 && stat.messagesReceived > 0)));
  check('Browser RTC statistics report actual bidirectional messages on all three DataChannels');

  const departingId = await guest3.evaluate(() => window.afterlight.network.id);
  await guest3.locator('#match-menu').click();
  await guest3.locator('#quit').click();
  await host.waitForFunction(id => window.afterlight.state.players.find(p => p.id === id).bot && window.afterlight.state.game.players.find(p => p.id === id).bot, departingId);
  await Promise.all([guest1, guest2].map(page => page.waitForFunction(id => window.afterlight.state.players.find(p => p.id === id).bot, departingId)));
  assert.equal((await snapshot(host)).roster.length, 3);
  check('A guest leaving through the UI becomes a bot in board and active minigame state for remaining peers');

  await host.locator('#match-menu').click();
  await host.locator('#quit').click();
  for (const guest of [guest1, guest2]) {
    await guest.waitForFunction(() => window.afterlight.state === null && window.afterlight.network?.role === 'offline');
    assert.match(await guest.locator('.modal').innerText(), /host disconnected/i);
  }
  await guest1.screenshot({ path: path.join(artifacts, 'network-host-left.png'), fullPage: true });
  check('Host leaving ends both remaining guest sessions and displays the host-loss message');
  assert.equal(report.browserErrors.length, 0);
  check('No uncaught browser errors across the complete four-browser network run');
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(artifacts, 'network-report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  server?.close();
  console.log(`Report: ${path.join(artifacts, 'network-report.json')}`);
  // PeerServer owns recurring housekeeping timers with no public dispose API.
  // The isolated verification process exits after closing Chrome and HTTP.
  process.exit(report.passed ? 0 : 1);
}
