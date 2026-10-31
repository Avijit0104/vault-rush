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

test('bounty: raiding the leader steals 60%', () => {
  const r = byId(E.resolveRound([P('a', 10000), P('b'), P('c'), P('d')], boxes, { b: { type: 'ATTACK', targetId: 'a' } }, { leaderId: 'a' }));
  assert.strictEqual(r.b.unsecured, 6000);
  assert.strictEqual(E.leaderOf([P('a', 5), P('b', 5)]), null);
  assert.strictEqual(E.leaderOf([P('a', 5), P('b', 6)]), 'b');
});

test('HIGH_ALERT: blocked raider loses everything, never below zero even when also raided', () => {
  const r = byId(E.resolveRound([P('a', 10000), P('b', 4000), P('c'), P('d')], boxes, {
    a: { type: 'ATTACK', targetId: 'b' }, b: { type: 'SECURE' }, c: { type: 'ATTACK', targetId: 'a' },
  }, { event: 'HIGH_ALERT', leaderId: 'a' }));
  assert.strictEqual(r.c.unsecured, 6000);     // 60% bounty of a
  assert.strictEqual(r.a.unsecured, 0);        // remaining 4000 lost as penalty
  assert.strictEqual(r.b.secured, 4000 - 200 + 4000);
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
  // b loses 10000 (split 5000/5000 to a,c), a loses 5000 to b
  assert.strictEqual(r.a.unsecured, 10000 - 5000 + 5000);
  assert.strictEqual(r.b.unsecured, 20000 - 10000 + 5000);
  assert.strictEqual(r.c.unsecured, 5000);
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
  assert.strictEqual(r.b.unsecured, 5000);
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
