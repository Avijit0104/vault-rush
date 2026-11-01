/* Vault Rush — authoritative room / round state machine.
 * Runs on the server for online rooms, and inside the browser for solo games.
 * Transport-agnostic: everything goes out through `send(playerId, type, data)`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./config.js'), require('./engine.js'));
  else root.VR_ROOM = factory(root.VR_CONFIG, root.VR_ENGINE);
})(this, function (CONFIG, ENGINE) {
  'use strict';

  const BOT_NAMES = ['Rocky', 'Tokyo', 'Nairobi', 'Denver', 'Rio', 'Berlin', 'Helsinki', 'Lisbon', 'Oslo', 'Bogota', 'Marseille', 'Palermo'];
  const BOT_AVATARS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];
  const freshStats = () => ({
    rounds: 0, secures: 0, attacks: 0, claims: 0, lastAction: null,
    lootGained: 0, lootLost: 0, securedTotal: 0, claimedTotal: 0, blocks: 0, failedRaids: 0, biggestGain: 0,
  });

  function rid(len) {
    const c = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  class GameRoom {
    constructor({ code, send, onEmpty, rng }) {
      this.code = code;
      this.send = send;
      this.onEmpty = onEmpty || (() => {});
      this.rng = rng || Math.random;
      this.players = [];
      this.spectators = [];
      this.hostId = null;
      this.settings = { rounds: CONFIG.AVAILABLE_ROUNDS[0], actionTime: CONFIG.ACTION_TIME_SECONDS };
      this.phase = 'LOBBY';
      this.round = 0;
      this.boxes = [];
      this.event = null;
      this.leaderId = null;
      this.actions = {};
      this.locked = new Set();
      this.timeLeft = 0;
      this.paused = false;
      this.timers = new Set();
      this.interval = null;
      this.lastResolution = null;
      this.ranking = null;
      this.awards = null;
      this.emptySince = null;
      this.lastEmote = {};
      this.gamesPlayed = 0;
    }

    /* ---------- timers ---------- */
    later(fn, ms) {
      const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
      this.timers.add(t);
      return t;
    }
    clearTimers() {
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      if (this.interval) clearInterval(this.interval);
      this.interval = null;
    }
    destroy() { this.clearTimers(); }

    /* ---------- players ---------- */
    humans() { return this.players.filter((p) => !p.isBot); }
    get(id) { return this.players.find((p) => p.id === id); }
    getSpec(id) { return this.spectators.find((p) => p.id === id); }

    newPlayer(fields) {
      return {
        id: 'p-' + rid(6),
        token: rid(16),
        seat: this.players.length,
        lives: CONFIG.STARTING_LIVES,
        unsecured: 0,
        secured: 0,
        eliminated: false,
        connected: true,
        stats: freshStats(),
        ...fields,
      };
    }

    addHuman({ name, avatar, look }) {
      const l = look || {};
      const ok = (kind, id, def) => (CONFIG.COSMETICS[kind].some((c) => c.id === id) ? id : def);
      const clean = {
        name: String(name || 'Player').slice(0, 14), avatar: String(avatar || 'c0').slice(0, 4),
        look: { acc: ok('acc', l.acc, 'none'), crate: ok('crate', l.crate, 'wood') },
      };
      if (this.phase !== 'LOBBY') {
        // mid-game join → spectator until the next game
        const s = { id: 'p-' + rid(6), token: rid(16), connected: true, ...clean };
        this.spectators.push(s);
        this.broadcast();
        return { player: s, spectator: true };
      }
      if (this.players.length >= CONFIG.MAX_PLAYERS) {
        const bot = this.players.slice().reverse().find((p) => p.isBot);
        if (!bot) return { error: 'Room is full' };
        this.removePlayer(bot.id);
      }
      const p = this.newPlayer({ ...clean, isBot: false });
      this.players.push(p);
      if (!this.hostId) this.hostId = p.id;
      this.reseat();
      this.broadcast();
      return { player: p };
    }

    addBot() {
      if (this.phase !== 'LOBBY' || this.players.length >= CONFIG.MAX_PLAYERS) return;
      const used = new Set(this.players.map((p) => p.name));
      const free = BOT_NAMES.filter((n) => !used.has(n));
      const name = free[Math.floor(this.rng() * free.length)] || 'Bot';
      const pers = ENGINE.PERSONALITIES[Math.floor(this.rng() * ENGINE.PERSONALITIES.length)];
      const usedAv = new Set(this.players.map((p) => p.avatar));
      const avatar = BOT_AVATARS.find((a) => !usedAv.has(a)) || BOT_AVATARS[0];
      this.players.push(this.newPlayer({ name, avatar, isBot: true, personality: pers, look: { acc: 'none', crate: 'wood' } }));
      this.reseat();
    }

    removePlayer(id) {
      this.players = this.players.filter((p) => p.id !== id);
      if (this.hostId === id) {
        const h = this.humans().find((p) => p.connected) || this.humans()[0];
        this.hostId = h ? h.id : null;
      }
      this.reseat();
    }

    reseat() { this.players.forEach((p, i) => (p.seat = i)); }

    /* ---------- lobby commands ---------- */
    cmdAddBot(byId) { if (byId === this.hostId) { this.addBot(); this.broadcast(); } }
    cmdRemoveBot(byId, botId) {
      const b = this.get(botId);
      if (byId === this.hostId && b && b.isBot && this.phase === 'LOBBY') { this.removePlayer(botId); this.broadcast(); }
    }
    cmdKick(byId, targetId) {
      const t = this.get(targetId);
      if (byId !== this.hostId || !t || t.id === byId || this.phase !== 'LOBBY') return;
      this.send(t.id, 'kicked', {});
      this.removePlayer(t.id);
      this.broadcast();
    }
    cmdSettings(byId, s) {
      if (byId !== this.hostId || this.phase !== 'LOBBY' || !s) return;
      if (CONFIG.AVAILABLE_ROUNDS.includes(+s.rounds)) this.settings.rounds = +s.rounds;
      if (CONFIG.ACTION_TIME_OPTIONS.includes(+s.actionTime)) this.settings.actionTime = +s.actionTime;
      this.broadcast();
    }
    cmdEmote(id, emoji) {
      const p = this.get(id);
      if (!p || !CONFIG.EMOTES.includes(emoji) || this.phase === 'LOBBY') return;
      const now = Date.now();
      if (now - (this.lastEmote[id] || 0) < CONFIG.EMOTE_COOLDOWN_MS) return;
      this.lastEmote[id] = now;
      this.sendAll('emote', { playerId: id, emoji });
    }
    /* solo only: pause the clock (tutorial) */
    cmdPause(id, on) {
      if (this.humans().length !== 1 || !this.get(id)) return;
      this.paused = !!on;
      this.broadcast();
    }

    start(byId) {
      if (byId !== this.hostId || this.phase !== 'LOBBY') return;
      while (this.players.length < CONFIG.MIN_PLAYERS) this.addBot();
      this.players.forEach((p) => Object.assign(p, {
        lives: CONFIG.STARTING_LIVES, unsecured: 0, secured: 0, eliminated: false, stats: freshStats(),
      }));
      this.round = 0;
      this.ranking = null;
      this.awards = null;
      this.gamesPlayed++;
      this.nextRound();
    }

    playAgain(byId) {
      if (byId !== this.hostId || this.phase !== 'GAMEOVER') return;
      this.clearTimers();
      this.players = this.players.filter((p) => p.isBot || p.connected);
      // spectators get seats (replacing bots if needed)
      this.spectators.filter((s) => s.connected).forEach((s) => {
        if (this.players.length >= CONFIG.MAX_PLAYERS) {
          const bot = this.players.slice().reverse().find((p) => p.isBot);
          if (!bot) return;
          this.players = this.players.filter((p) => p !== bot);
        }
        this.players.push(this.newPlayer({ id: s.id, token: s.token, name: s.name, avatar: s.avatar, look: s.look, isBot: false }));
      });
      this.spectators = [];
      this.reseat();
      this.phase = 'LOBBY';
      this.round = 0;
      this.boxes = [];
      this.event = null;
      this.lastResolution = null;
      this.broadcast();
    }

    /* ---------- rounds ---------- */
    get maxRounds() { return this.settings.rounds; }
    get actionTime() { return this.settings.actionTime; }
    get endgame() { return ENGINE.endgameInfo(this.round, this.maxRounds); }
    active() { return this.players.filter((p) => !p.eliminated); }

    nextRound() {
      this.clearTimers();
      this.round++;
      this.event = ENGINE.rollEvent(this.round, this.maxRounds, this.rng);
      this.leaderId = ENGINE.leaderOf(this.players);
      this.boxes = ENGINE.makeBoxes(this.round, this.maxRounds, this.players.length, this.rng, this.event);
      this.actions = {};
      this.locked = new Set();
      this.lastResolution = null;
      this.phase = 'INTRO';
      this.timeLeft = this.actionTime;
      this.broadcast();
      this.later(() => this.beginAction(), CONFIG.INTRO_MS + (this.event ? CONFIG.EVENT_INTRO_MS : 0));
    }

    beginAction() {
      this.phase = 'ACTION';
      this.timeLeft = this.actionTime;
      this.scheduleBots();
      this.broadcast();
      this.interval = setInterval(() => {
        if (this.paused) return;
        this.timeLeft--;
        if (this.timeLeft <= 0) this.resolve();
        else this.broadcastTimer(); // Only send timer updates, not full state
      }, 1000);
    }

    scheduleBots() {
      const T = this.actionTime;
      this.active().filter((p) => p.isBot).forEach((bot) => {
        const decide = () => {
          if (this.phase !== 'ACTION') return;
          if (this.paused) return this.later(decide, 1000);
          this.actions[bot.id] = ENGINE.botChooseAction(this.botView(), bot.id, this.rng);
          this.broadcast();
        };
        this.later(decide, (1.2 + this.rng() * (T * 0.45)) * 1000);
        if (this.rng() < 0.35) this.later(decide, (T * 0.55 + this.rng() * (T * 0.3)) * 1000); // change of mind
      });
    }

    botView() {
      const blackout = this.event === 'BLACKOUT';
      const avg = this.boxes.reduce((s, b) => s + b.value, 0) / Math.max(1, this.boxes.length);
      return {
        round: this.round,
        maxRounds: this.maxRounds,
        event: this.event,
        leaderId: this.leaderId,
        avgBox: avg,
        boxes: this.boxes.map((b) => (blackout ? { id: b.id, value: null } : b)),
        secureDisabled: !!(this.endgame && this.endgame.secureDisabled),
        players: this.players.map((p) => ({ ...p })),
      };
    }

    setAction(id, action) {
      const p = this.get(id);
      if (!p || p.eliminated || this.phase !== 'ACTION' || this.locked.has(id) || !action) return;
      const a = { type: String(action.type), targetId: action.targetId ? String(action.targetId) : undefined };
      if (!['CLAIM', 'ATTACK', 'SECURE', 'NONE'].includes(a.type)) return;
      if (a.type === 'SECURE' && this.endgame && this.endgame.secureDisabled) return;
      if (a.type === 'NONE') delete this.actions[id];
      else this.actions[id] = a;
      this.broadcast();
    }

    lockIn(id) {
      const p = this.get(id);
      if (!p || p.eliminated || this.phase !== 'ACTION' || !this.actions[id]) return;
      this.locked.add(id);
      const waiting = this.active().filter((h) => !h.isBot && h.connected && !this.locked.has(h.id));
      if (!waiting.length && this.timeLeft > CONFIG.LOCKED_IN_FAST_FORWARD) this.timeLeft = CONFIG.LOCKED_IN_FAST_FORWARD;
      this.broadcast();
    }

    resolve() {
      this.clearTimers();
      this.phase = 'RESOLVING';
      this.timeLeft = 0;
      this.paused = false;
      const before = this.players.map((p) => ({ ...p, stats: { ...p.stats } }));
      const res = ENGINE.resolveRound(this.players, this.boxes, this.actions, {
        secureDisabled: !!(this.endgame && this.endgame.secureDisabled),
        leaderId: this.leaderId,
        event: this.event,
      });

      // update stats (public habits the bots learn from + end-of-game awards)
      const st = {};
      this.players.forEach((p) => (st[p.id] = { ...p.stats }));
      this.players.forEach((p) => {
        if (p.eliminated) return;
        const a = res.actions[p.id];
        const s = st[p.id];
        s.rounds++;
        s.lastAction = a.type;
        if (a.type === 'SECURE') s.secures++;
        if (a.type === 'ATTACK') s.attacks++;
        if (a.type === 'CLAIM') s.claims++;
      });
      res.events.forEach((e) => {
        if (e.type === 'secure') st[e.playerId].securedTotal += e.amount - e.fee;
        if (e.type === 'blocked') { st[e.attackerId].failedRaids++; st[e.defenderId].blocks++; }
        if (e.type === 'loot') { st[e.targetId].lootLost += e.total; e.shares.forEach((s) => (st[s.playerId].lootGained += s.amount)); }
        if (e.type === 'claim') e.shares.forEach((s) => (st[s.playerId].claimedTotal += s.amount));
      });
      res.players.forEach((np, i) => {
        const p = this.players[i];
        const gain = np.unsecured + np.secured - (p.unsecured + p.secured);
        if (gain > st[p.id].biggestGain) st[p.id].biggestGain = gain;
        Object.assign(p, { lives: np.lives, unsecured: np.unsecured, secured: np.secured, eliminated: np.eliminated, stats: st[p.id] });
      });

      const shown = res.events.filter((e) => e.type !== 'unclaimed').length;
      const slowMo = !!(this.endgame && this.endgame.secureDisabled); // final heist: slow-motion reveal with drumrolls
      const duration = Math.round(Math.min(slowMo ? 34000 : 18000, (2600 + shown * 1400) * (slowMo ? 1.8 : 1)));
      this.lastResolution = {
        round: this.round, events: res.events, actions: res.actions, before, duration,
        boxes: this.boxes, event: this.event, leaderId: this.leaderId,
      };
      this.broadcast();
      this.scheduleBotEmotes(res.events, duration);

      const over = this.round >= this.maxRounds || this.active().length <= 1;
      this.later(() => (over ? this.finish() : this.nextRound()), duration + 600);
    }

    scheduleBotEmotes(events, duration) {
      const isBot = (id) => { const p = this.get(id); return p && p.isBot; };
      const pick = (arr) => arr[Math.floor(this.rng() * arr.length)];
      events.forEach((e) => {
        let who = null, emoji = null;
        if (e.type === 'blocked') {
          if (isBot(e.attackerId) && this.rng() < 0.5) { who = e.attackerId; emoji = pick(['😡', '😱']); }
          else if (isBot(e.defenderId) && this.rng() < 0.5) { who = e.defenderId; emoji = pick(['😂', '🫡']); }
        } else if (e.type === 'loot' && e.total > 0) {
          const thief = e.shares.find((s) => isBot(s.playerId));
          if (thief && this.rng() < 0.4) { who = thief.playerId; emoji = pick(['😂', '💸', '🔥']); }
          else if (isBot(e.targetId) && this.rng() < 0.4) { who = e.targetId; emoji = pick(['😡', '😱']); }
        }
        if (who) this.later(() => this.cmdEmote(who, emoji), duration * (0.4 + this.rng() * 0.5));
      });
    }

    finish() {
      this.clearTimers();
      this.phase = 'GAMEOVER';
      this.ranking = ENGINE.rankPlayers(this.players).map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, look: p.look, isBot: p.isBot, rank: p.rank, total: p.total, seat: p.seat,
        lives: p.lives, eliminated: p.eliminated, secured: p.secured, unsecured: p.unsecured, stats: p.stats,
      }));
      this.awards = ENGINE.computeAwards(this.players);
      this.broadcast();
    }

    /* ---------- connections ---------- */
    disconnect(id) {
      const sp = this.getSpec(id);
      if (sp) {
        sp.connected = false;
        setTimeout(() => { if (!sp.connected) this.spectators = this.spectators.filter((x) => x !== sp); }, 60000);
        this.checkEmpty();
        return;
      }
      const p = this.get(id);
      if (!p) return;
      p.connected = false;
      if (this.hostId === id) {
        const h = this.humans().find((x) => x.connected);
        if (h) this.hostId = h.id;
      }
      if (this.phase === 'LOBBY') {
        // phones drop sockets when switching apps — give 30s to come back
        setTimeout(() => { if (this.phase === 'LOBBY' && !p.connected && this.get(id)) { this.removePlayer(id); this.broadcast(); } }, 30000);
      }
      if (this.paused) this.paused = false;
      this.checkEmpty();
      this.broadcast();
    }

    reconnect(token) {
      const p = this.players.find((x) => x.token === token && !x.isBot) || this.spectators.find((x) => x.token === token);
      if (!p) return null;
      p.connected = true;
      this.emptySince = null;
      if (this.get(p.id) && (!this.hostId || !this.get(this.hostId) || !this.get(this.hostId).connected)) this.hostId = p.id;
      this.broadcast();
      return p;
    }

    checkEmpty() {
      if (this.humans().some((p) => p.connected) || this.spectators.some((s) => s.connected)) return;
      this.onEmpty(this);
    }

    /* ---------- outgoing ---------- */
    viewFor(viewerId) {
      const eg = this.endgame;
      const blackout = this.event === 'BLACKOUT' && (this.phase === 'INTRO' || this.phase === 'ACTION');
      const ev = this.event && CONFIG.EVENTS[this.event];
      return {
        code: this.code,
        phase: this.phase,
        round: this.round,
        maxRounds: this.maxRounds,
        hostId: this.hostId,
        youId: viewerId,
        spectating: !!this.getSpec(viewerId),
        timeLeft: this.timeLeft,
        actionTime: this.actionTime,
        paused: this.paused,
        endgame: eg ? { label: eg.label, multiplier: eg.multiplier, secureDisabled: eg.secureDisabled } : null,
        event: ev ? { key: this.event, ...ev } : null,
        leaderId: this.phase === 'LOBBY' ? null : this.leaderId,
        settings: this.settings,
        boxes: this.phase === 'LOBBY' ? [] : this.boxes.map((b) => (blackout ? { id: b.id, tier: 'MYSTERY', value: null } : b)),
        yourAction: this.actions[viewerId] || null,
        youLocked: this.locked.has(viewerId),
        players: this.players.map((p) => ({
          id: p.id, name: p.name, avatar: p.avatar, look: p.look, isBot: p.isBot, connected: p.connected, seat: p.seat,
          lives: p.lives, unsecured: p.unsecured, secured: p.secured, eliminated: p.eliminated,
          hasActed: !!this.actions[p.id], locked: this.locked.has(p.id),
          // Reduced stats payload - only send essential fields (saves ~30% per player)
          stats: { rounds: p.stats.rounds, secures: p.stats.secures, attacks: p.stats.attacks, claims: p.stats.claims,
            blocks: p.stats.blocks },
        })),
        spectators: this.spectators.filter((s) => s.connected).map((s) => ({ id: s.id, name: s.name, avatar: s.avatar })),
        resolution: this.phase === 'RESOLVING' ? this.lastResolution : null,
        ranking: this.ranking,
        awards: this.awards,
      };
    }

    sendAll(type, data) {
      this.humans().forEach((p) => { if (p.connected) this.send(p.id, type, data); });
      this.spectators.forEach((s) => { if (s.connected) this.send(s.id, type, data); });
    }

    broadcastTimer() {
      // Lightweight timer-only update during ACTION phase (reduces network traffic by ~95%)
      this.sendAll('tick', { timeLeft: this.timeLeft });
    }

    broadcast() {
      this.humans().forEach((p) => { if (p.connected) this.send(p.id, 'state', this.viewFor(p.id)); });
      this.spectators.forEach((s) => { if (s.connected) this.send(s.id, 'state', this.viewFor(s.id)); });
    }
  }

  return { GameRoom, rid };
});
