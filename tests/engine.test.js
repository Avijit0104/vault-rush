// Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const E = require('../public/shared/engine.js');
const { GameRoom } = require('../public/shared/room.js');

const P = (id, u = 0, s = 0, lives = 4) => ({ id, unsecured: u, secured: s, lives, eliminated: false });
const boxes = [{ id: 'box-1', value: 10000 }, { id: 'box-2', value: 8000 }, { id: 'box-3', value: 5000 }];
const byId = (r) => Object.fromEntries(r.players.map((p) => [p.id, p]));

test('shared box splits deterministically with remainder to seat order', () => {
  const r = byId(E.resolveRound([P('a'), P('b'), P('c'), P('d')], boxes, {
    a: { type: 'CLAIM', targetId: 'box-1' }, b: { type: 'CLAIM', targetId: 'box-1' },
    c: { type: 'CLAIM', targetId: 'box-1' }, d: { type: 'CLAIM', targetId: 'box-2' },
  }));
  assert.deepStrictEqual([r.a.unsecured, r.b.unsecured, r.c.unsecured, r.d.unsecured], [3334, 3333, 3333, 8000]);
});

test('blocked attack: attacker loses life + half, defender vaults it', () => {
  const r = byId(E.resolveRound([P('a', 20000), P('b', 6000), P('c'), P('d')], boxes, {
    a: { type: 'ATTACK', targetId: 'b' }, b: { type: 'SECURE' },
  }));
  assert.strictEqual(r.a.lives, 3);
  assert.strictEqual(r.a.unsecured, 10000);
  assert.strictEqual(r.b.unsecured, 0);
  assert.strictEqual(r.b.secured, 6000 - 300 + 10000); // 5% vault fee on the 6000
});

test('vault fee waived on FREE_VAULT event', () => {
  const r = byId(E.resolveRound([P('a', 10000), P('b'), P('c'), P('d')], boxes, { a: { type: 'SECURE' } }, { event: 'FREE_VAULT' }));
  assert.strictEqual(r.a.secured, 10000);
});

test('raid steals 95%; bounty on the leader takes 100%', () => {
  const n = byId(E.resolveRound([P('a', 10000), P('b'), P('c'), P('d')], boxes, { b: { type: 'ATTACK', targetId: 'a' } }));
  assert.strictEqual(n.b.unsecured, 9500);
  assert.strictEqual(n.a.unsecured, 500);
  const r = byId(E.resolveRound([P('a', 10000), P('b'), P('c'), P('d')], boxes, { b: { type: 'ATTACK', targetId: 'a' } }, { leaderId: 'a' }));
  assert.strictEqual(r.b.unsecured, 10000);
  assert.strictEqual(r.a.unsecured, 0);
  assert.strictEqual(E.leaderOf([P('a', 5), P('b', 5)]), null);
  assert.strictEqual(E.leaderOf([P('a', 5), P('b', 6)]), 'b');
});

test('HIGH_ALERT: blocked raider loses everything, never below zero even when also raided', () => {
  const r = byId(E.resolveRound([P('a', 10000), P('b', 4000), P('c'), P('d')], boxes, {
    a: { type: 'ATTACK', targetId: 'b' }, b: { type: 'SECURE' }, c: { type: 'ATTACK', targetId: 'a' },
  }, { event: 'HIGH_ALERT', leaderId: 'a' }));
  assert.strictEqual(r.c.unsecured, 10000);    // 100% bounty of a
  assert.strictEqual(r.a.unsecured, 0);        // nothing left over for the penalty
  assert.strictEqual(r.b.secured, 4000 - 200); // so the defender gets no penalty cash
});

test('golden and bonus boxes', () => {
  const rng = () => 0.1;
  const g = E.makeBoxes(1, 10, 4, rng, 'GOLDEN');
  assert.strictEqual(g.filter((b) => b.golden).length, 1);
  assert.strictEqual(E.makeBoxes(1, 10, 4, rng, 'BONUS_DROP').length, 4);
  assert.strictEqual(E.makeBoxes(1, 10, 6, rng, 'BONUS_DROP').length, 5);
});

test('successful loot is split among attackers, simultaneous mutual attacks are fair', () => {
  const r = byId(E.resolveRound([P('a', 10000), P('b', 20000), P('c', 0), P('d')], boxes, {
    a: { type: 'ATTACK', targetId: 'b' }, b: { type: 'ATTACK', targetId: 'a' }, c: { type: 'ATTACK', targetId: 'b' },
  }));
  // b loses 95% = 19000 (split 9500/9500 to a,c), a loses 95% = 9500 to b
  assert.strictEqual(r.a.unsecured, 10000 - 9500 + 9500);
  assert.strictEqual(r.b.unsecured, 20000 - 19000 + 9500);
  assert.strictEqual(r.c.unsecured, 9500);
});

test('elimination at 0 lives, attack on eliminated target is ignored', () => {
  const players = [P('a', 0, 0, 1), P('b'), P('c'), { ...P('d', 9000), eliminated: true, lives: 0 }];
  const r = byId(E.resolveRound(players, boxes, { a: { type: 'ATTACK', targetId: 'b' }, b: { type: 'SECURE' }, c: { type: 'ATTACK', targetId: 'd' } }));
  assert.strictEqual(r.a.eliminated, true);
  assert.strictEqual(r.c.unsecured, 0);
  assert.strictEqual(r.d.unsecured, 9000);
});

test('secure disabled in final round', () => {
  const r = byId(E.resolveRound([P('a', 10000), P('b'), P('c'), P('d')], boxes, { a: { type: 'SECURE' }, b: { type: 'ATTACK', targetId: 'a' } }, { secureDisabled: true }));
  assert.strictEqual(r.a.secured, 0);
  assert.strictEqual(r.b.unsecured, 9500);
});

test('money is conserved apart from box prizes', () => {
  for (let k = 0; k < 500; k++) {
    const ps = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => P(id, Math.floor(Math.random() * 30000), Math.floor(Math.random() * 30000)));
    const opts = () => { const r = Math.random(); const t = ps[Math.floor(Math.random() * 6)].id;
      return r < 0.4 ? { type: 'CLAIM', targetId: boxes[Math.floor(Math.random() * 3)].id } : r < 0.7 ? { type: 'ATTACK', targetId: t } : { type: 'SECURE' }; };
    const actions = Object.fromEntries(ps.map((p) => [p.id, opts()]));
    const ev = ['HIGH_ALERT', 'FREE_VAULT', null][k % 3];
    const res = E.resolveRound(ps, boxes, actions, { event: ev, leaderId: E.leaderOf(ps) });
    const sum = (arr) => arr.reduce((s, p) => s + p.unsecured + p.secured, 0);
    const prizes = res.events.filter((e) => e.type === 'claim').reduce((s, e) => s + e.value, 0);
    const fees = res.events.filter((e) => e.type === 'secure').reduce((s, e) => s + e.fee, 0);
    assert.strictEqual(sum(res.players), sum(ps) + prizes - fees);
    res.players.forEach((p) => assert.ok(p.unsecured >= 0));
  }
});

test('full bot game runs to completion', async () => {
  const CONFIG = require('../public/shared/config.js');
  Object.assign(CONFIG, { ACTION_TIME_SECONDS: 1, INTRO_MS: 1 });
  let last;
  const room = new GameRoom({ code: 'TEST', send: (_id, type, v) => { if (type === 'state') last = v; } });
  const { player } = room.addHuman({ name: 'me' });
  room.cmdSettings(player.id, { rounds: 10 });
  for (let i = 0; i < 4; i++) room.cmdAddBot(player.id);
  // speed up resolution waits
  room.later = function (fn) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, 1); this.timers.add(t); return t; };
  room.start(player.id);
  await new Promise((res) => { const iv = setInterval(() => { if (room.phase === 'GAMEOVER') { clearInterval(iv); res(); } }, 20); });
  await new Promise((res) => setImmediate(res)); // state sends are merged and go out on the next tick
  assert.strictEqual(last.phase, 'GAMEOVER');
  assert.strictEqual(last.ranking.length, 5);
  assert.ok(Array.isArray(last.awards));
  // late joiner becomes a spectator, then gets a seat on play-again
  const late = room.addHuman({ name: 'late' });
  assert.strictEqual(late.spectator, true);
  room.playAgain(player.id);
  assert.ok(room.get(late.player.id));
  assert.strictEqual(room.players.length, 6);
  room.destroy();
});

test('bots are never idle, even when every human locks in at once', async () => {
  const room = new GameRoom({ code: 'IDLE', send: () => {} });
  const { player } = room.addHuman({ name: 'me' });
  room.cmdSettings(player.id, { actionTime: 30 }); // a normal 30 s clock (an earlier test shortens the default)
  for (let i = 0; i < 4; i++) room.cmdAddBot(player.id);
  room.start(player.id);
  await new Promise((res) => { const iv = setInterval(() => { if (room.phase === 'ACTION') { clearInterval(iv); res(); } }, 5); });
  room.setAction(player.id, { type: 'CLAIM', targetId: room.boxes[0].id });
  room.lockIn(player.id); // timer jumps to 3 s: bots that hadn't picked yet must pick now
  room.bots = room.players.filter((p) => p.isBot);
  assert.ok(room.bots.every((b) => room.actions[b.id] && room.actions[b.id].type !== 'NONE'));
  room.resolve();
  assert.ok(room.bots.every((b) => room.lastResolution.actions[b.id].type !== 'NONE'));
  room.destroy();
});

test('smart bots: bank a big pile before the Final Heist, raid freely during it', () => {
  const stats = (rounds, attacks, secures) => ({ rounds, attacks, secures, claims: rounds - attacks - secures, lastAction: 'CLAIM', lastTarget: null });
  const pl = (id, u, s, st) => ({ ...P(id, u, s, 2), personality: 'greedy', stats: st });
  const view = (round, players, secureDisabled) => ({
    round, maxRounds: 10, event: null, leaderId: E.leaderOf(players), avgBox: 20000, secureDisabled,
    boxes: E.makeBoxes(round, 10, players.length, () => 0.3, null), players,
  });
  const count = (v, id, type) => { let n = 0; for (let i = 0; i < 300; i++) if (E.botChooseAction(v, id, Math.random).type === type) n++; return n / 300; };
  // Round 9 (vaults jam next round): the bot holding a fat unsecured pile, with raiders around, secures.
  const before = [pl('bot', 300000, 20000, stats(8, 1, 1)), pl('a', 20000, 60000, stats(8, 4, 1)), pl('b', 10000, 50000, stats(8, 3, 2)), pl('c', 5000, 40000, stats(8, 3, 1))];
  assert.ok(count(view(9, before, false), 'bot', 'SECURE') > 0.8);
  // Final Heist: nobody can block, a rival sits on a fat pile → raid them.
  const final = [pl('bot', 0, 50000, stats(9, 2, 2)), pl('rich', 400000, 10000, stats(9, 1, 3)), pl('b', 10000, 50000, stats(9, 3, 2)), pl('c', 5000, 40000, stats(9, 3, 1))];
  const v = view(10, final, true);
  let raidRich = 0; for (let i = 0; i < 300; i++) { const a = E.botChooseAction(v, 'bot', Math.random); if (a.type === 'ATTACK' && a.targetId === 'rich') raidRich++; }
  assert.ok(raidRich / 300 > 0.8);
});
