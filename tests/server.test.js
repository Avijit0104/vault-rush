/* End-to-end test of the online server over real WebSockets (the protocol public/js/wsio.js speaks).
 * By default it starts server/server.js on a spare port. TEST_URL runs the same checks against a server
 * that's already running, e.g. the Cloudflare version:
 *   npx wrangler@4 dev      then      TEST_URL=http://127.0.0.1:8787 npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const PORT = 3996;
const BASE = process.env.TEST_URL || `http://127.0.0.1:${PORT}`;
let server = null;

class Phone {
  constructor(name) {
    this.name = name;
    this.view = null;
    this.events = [];
    this.waiters = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const text = String(data);
        if (text === 'pong') this.pong = true;
        else {
          const { t, d } = JSON.parse(text);
          this.events.push(t);
          if (t === 'joined') this.joined = d;
          if (t === 'state') this.view = d;
          if (t === 'tick') this.ticks = (this.ticks || 0) + 1;
          if (t === 'errorMsg') this.error = d;
          if (t === 'emote') this.emote = d;
        }
        this.waiters = this.waiters.filter((w) => !w());
      });
    });
  }

  send(t, d) { this.ws.send(JSON.stringify({ t, d })); }

  until(check, what, ms = 15000) {
    if (check()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for ${what}`)), ms);
      this.waiters.push(() => { if (!check()) return false; clearTimeout(timer); resolve(); return true; });
    });
  }

  close() { this.ws.close(); }
}

test.before(async () => {
  if (process.env.TEST_URL) return;
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.once('data', resolve));
});

test.after(() => server?.kill());

test('health check and QR library are served', async () => {
  const health = await fetch(`${BASE}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const qr = await fetch(`${BASE}/vendor/qrcode.js`);
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /qrcode/);
  const stats = await (await fetch(`${BASE}/stats`)).json();
  assert.equal(typeof stats.roomsOpen, 'number');
});

test('an online game: create, join, bots, a full round, rejoin, spectator, leave', { timeout: 90000 }, async () => {
  const host = new Phone('host');
  const guest = new Phone('guest');
  await host.open();
  host.ws.send('ping');
  await host.until(() => host.pong, 'pong');

  // create + join
  host.send('create', { name: 'Avijit', avatar: 'c1', look: { acc: 'shades', crate: 'wood' } });
  await host.until(() => host.joined && host.view?.phase === 'LOBBY', 'lobby');
  const code = host.joined.code;
  assert.match(code, /^[A-Z]{4}$/);
  assert.ok(!JSON.stringify(host.view).includes(host.joined.token), 'no rejoin tokens in views');

  await guest.open();
  guest.send('join', { code: 'zzzz', name: 'Nobody' });
  await guest.until(() => guest.error, 'room-not-found error');
  assert.match(guest.error, /not found/i);
  guest.send('join', { code, name: 'Rahul', avatar: 'c2' });
  await host.until(() => host.view.players.length === 2, 'host sees guest');

  // host settings + one bot; the guest can't change settings
  guest.send('settings', { actionTime: 20 });
  host.send('settings', { actionTime: 15 });
  host.send('addBot');
  await host.until(() => host.view.players.length === 3 && host.view.settings.actionTime === 15, 'bot + 15 s timer');

  // start: filled to 4 with bots, intro → action with 1 s ticks
  host.send('start');
  await host.until(() => host.view.phase === 'INTRO', 'intro');
  assert.equal(host.view.players.length, 4);
  assert.equal(host.view.boxes.length >= 3, true);
  await host.until(() => host.view.phase === 'ACTION', 'action phase');
  await host.until(() => host.ticks >= 1, 'a timer tick', 3000);

  // both people pick and lock in → the round is cut short and resolves; bots always have a move
  const box = host.view.boxes[0].id;
  host.send('action', { type: 'CLAIM', targetId: box });
  guest.send('action', { type: 'SECURE' });
  await host.until(() => host.view.yourAction?.type === 'CLAIM', 'host action recorded');
  await guest.until(() => guest.view.yourAction?.type === 'SECURE', 'guest action recorded');
  host.send('emote', '🔥');
  await guest.until(() => guest.emote?.emoji === '🔥', 'emote');
  host.send('lockIn');
  guest.send('lockIn');
  await host.until(() => host.view.phase === 'RESOLVING', 'reveal', 8000);
  const res = host.view.resolution;
  assert.equal(res.round, 1);
  assert.equal(Object.keys(res.actions).length, 4, 'every seat had a move');
  assert.ok(!JSON.stringify(res).includes(host.joined.token), 'no tokens in the reveal');

  // a friend arriving mid-game becomes a spectator
  const late = new Phone('late');
  await late.open();
  late.send('join', { code, name: 'Late' });
  await late.until(() => late.joined, 'late joined');
  assert.equal(late.joined.spectator, true);

  // the guest's phone drops and comes back with its rejoin token
  const { token } = guest.joined;
  guest.close();
  await host.until(() => host.view.players.some((p) => p.name === 'Rahul' && !p.connected), 'guest offline');
  const guest2 = new Phone('guest2');
  await guest2.open();
  guest2.send('rejoin', { code, token });
  await guest2.until(() => guest2.joined && guest2.view, 'guest rejoined');
  await host.until(() => host.view.players.find((p) => p.name === 'Rahul').connected, 'guest online again');

  // the game moves on to round 2 by itself
  await host.until(() => host.view.round === 2 && host.view.phase !== 'RESOLVING', 'round 2', 30000);

  // a wrong rejoin is refused
  const stranger = new Phone('stranger');
  await stranger.open();
  stranger.send('rejoin', { code, token: 'nope' });
  await stranger.until(() => stranger.events.includes('rejoinFailed'), 'rejoinFailed');

  for (const p of [host, guest2, late, stranger]) { p.send('leave'); p.close(); }
});
