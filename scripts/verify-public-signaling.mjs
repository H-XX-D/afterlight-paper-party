import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(project, 'verification');
await mkdir(directory, { recursive: true });
const baseURL = process.env.AFTERLIGHT_TEST_URL || 'http://localhost:5187';
const report = {
  startedAt: new Date().toISOString(), baseURL, passed: false,
  setup: 'Two independent Chrome browser contexts; no AFTERLIGHT_NETWORK override; default public PeerJS signaling and application default STUN configuration.',
  limits: ['Both browser peers run on the same computer. Success establishes public signaling and local real WebRTC connectivity, not a connection across separate WANs, restrictive NATs, or a TURN relay.'],
  assertions: [], pageErrors: [], consoleErrors: [], failedRequests: [], websockets: [],
};
let browser;
const pages = [];
const check = (name, details = {}) => { report.assertions.push({ name, passed: true, ...details }); console.log(`PASS ${name}`); };
try {
  const options = { headless: true, args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] };
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try { await access(chrome); options.executablePath = chrome; } catch {}
  browser = await chromium.launch(options);
  report.browserVersion = browser.version();
  for (let player = 0; player < 2; player++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push({ player, error: error.message }));
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push({ player, error: msg.text() }); });
    page.on('requestfailed', req => { const url = new URL(req.url()); report.failedRequests.push({ player, url: url.origin + url.pathname, error: req.failure()?.errorText }); });
    page.on('websocket', socket => { const url = new URL(socket.url()); report.websockets.push({ player, url: url.origin + url.pathname }); });
    page.on('dialog', dialog => dialog.dismiss());
    pages.push(page);
  }
  await Promise.all(pages.map(page => page.goto(baseURL, { waitUntil: 'networkidle' })));
  for (let i = 0; i < pages.length; i++) {
    await pages[i].waitForFunction(() => window.afterlight?.route === 'home');
    assert.equal(await pages[i].evaluate(() => window.AFTERLIGHT_NETWORK), undefined);
    await pages[i].locator('[data-play="online"]').click();
    await pages[i].locator('#player-name').fill(i ? 'Public Guest' : 'Public Host');
  }
  const [host, guest] = pages;
  await host.locator('#host').click();
  await host.waitForFunction(() => window.afterlight?.route === 'lobby' || (document.querySelector('#host') && !document.querySelector('#host').disabled), null, { timeout: 22000 });
  const hostRoute = await host.evaluate(() => window.afterlight.route);
  if (hostRoute !== 'lobby') throw new Error(`Public host failed: ${await host.locator('#net-status').textContent().catch(() => '')}`);
  const code = await host.locator('#room-code').innerText();
  report.peerOptions = await host.evaluate(() => { const p = window.afterlight.network.peer.options; return { host: p.host, port: p.port, path: p.path, secure: p.secure, iceServers: p.config?.iceServers }; });
  assert.equal(report.peerOptions.host, '0.peerjs.com');
  check('Default public PeerJS signaling registers the host', { code, host: report.peerOptions.host });
  await guest.locator('#join-code').fill(code);
  await guest.locator('#join').click();
  await guest.waitForFunction(() => window.afterlight?.route === 'lobby' || (document.querySelector('#join') && !document.querySelector('#join').disabled), null, { timeout: 22000 });
  const guestRoute = await guest.evaluate(() => window.afterlight.route);
  if (guestRoute !== 'lobby') throw new Error(`Public guest failed: ${await guest.locator('#net-status').textContent().catch(() => '')}`);
  await Promise.all(pages.map(page => page.waitForFunction(() => window.afterlight.network.players.length === 2)));
  check('Second browser joins through public signaling and both peers share a two-human roster');
  report.rtc = await guest.evaluate(() => {
    const conn = window.afterlight.network.hostConnection.conn;
    return { state: conn.peerConnection.connectionState, channel: conn.dataChannel.readyState, open: conn.open };
  });
  assert.deepEqual(report.rtc, { state: 'connected', channel: 'open', open: true });
  check('Publicly signaled peers establish an actual connected WebRTC DataChannel');
  await host.locator('#start-online').click();
  await guest.waitForFunction(() => window.afterlight.state?.phase === 'board');
  const roster = await host.evaluate(() => window.afterlight.state.players);
  assert.equal(roster.filter(p => !p.bot).length, 2);
  assert.equal(roster.filter(p => p.bot).length, 2);
  assert.deepEqual(await guest.evaluate(() => window.afterlight.state.players), roster);
  check('Host board state synchronizes to guest with two human players and two bots');
  await host.locator('#roll-dice').click();
  await guest.waitForFunction(() => window.afterlight.state.boardStage !== 'await-roll' && window.afterlight.state.dice >= 1);
  check('Host UI roll arrives at guest through the publicly signaled real connection');
  report.rtcStats = await guest.evaluate(async () => {
    const stats = await window.afterlight.network.hostConnection.conn.peerConnection.getStats();
    return [...stats.values()].filter(stat => ['data-channel', 'transport', 'candidate-pair'].includes(stat.type)).map(stat => ({ ...stat }));
  });
  assert.ok(report.rtcStats.some(stat => stat.type === 'data-channel' && stat.messagesSent > 0 && stat.messagesReceived > 0));
  assert.equal(report.pageErrors.length, 0);
  check('Actual DataChannel traffic is recorded with no uncaught browser errors');
  await guest.screenshot({ path: path.join(directory, 'public-signaling-board.png'), fullPage: true });
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  report.uiStatus = await Promise.all(pages.map(page => page.evaluate(() => ({ route: window.afterlight?.route, status: document.querySelector('#net-status')?.textContent || '', toast: document.querySelector('#toast')?.textContent || '' })).catch(() => null)));
  if (pages[0]) await pages[0].screenshot({ path: path.join(directory, 'public-signaling-failure.png'), fullPage: true }).catch(() => {});
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, 'public-signaling-report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(`Report: ${path.join(directory, 'public-signaling-report.json')}`);
  process.exitCode = report.passed ? 0 : 1;
}
