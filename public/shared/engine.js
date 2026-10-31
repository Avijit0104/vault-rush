/* Vault Rush — pure game rules. No timers, no I/O.
 * resolveRound() computes every outcome from ONE snapshot, then returns the
 * new player states + an ordered event list for animations. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./config.js'));
  else root.VR_ENGINE = factory(root.VR_CONFIG);
})(this, function (CONFIG) {
  'use strict';

  function endgameInfo(round, maxRounds) {
    if (!CONFIG.FINAL_ROUNDS_SPECIAL_RULE) return null;
    const offset = maxRounds - round;
    return CONFIG.ENDGAME.find((e) => e.offsetFromEnd === offset) || null;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function baseValue(round, maxRounds) {
    const eg = endgameInfo(round, maxRounds);
    return (CONFIG.BASE_VALUE + CONFIG.BASE_GROWTH * (round - 1)) * (eg ? eg.multiplier : 1);
  }

  function rollEvent(round, maxRounds, rng) {
    if (endgameInfo(round, maxRounds) || round < CONFIG.EVENT_MIN_ROUND) return null;
    if (rng() >= CONFIG.EVENT_CHANCE) return null;
    const keys = Object.keys(CONFIG.EVENTS);
    return keys[Math.floor(rng() * keys.length)];
  }

  function makeBoxes(round, maxRounds, playerCount, rng, event) {
    let count = CONFIG.BOX_COUNT[playerCount] || CONFIG.BOX_COUNT[CONFIG.MIN_PLAYERS];
    if (event === 'BONUS_DROP') count++;
    const tiers = shuffle(CONFIG.BOX_TIERS[count].slice(), rng);
    const base = baseValue(round, maxRounds);
    const boxes = tiers.map((tier, i) => ({
      id: 'box-' + (i + 1),
      tier,
      value: Math.round((CONFIG.PRIZE_RATIO[tier] * base) / 100) * 100,
    }));
    if (event === 'GOLDEN') {
      const g = boxes[Math.floor(rng() * boxes.length)];
      g.golden = true;
      g.value *= CONFIG.GOLDEN_MULTIPLIER;
    }
    return boxes;
  }

  /* Leader = richest active player (must be unique and > 0). Raiding them pays a bounty. */
  function leaderOf(players) {
    const act = players.filter((p) => !p.eliminated);
    let best = null, tie = false;
    act.forEach((p) => {
      const t = p.unsecured + p.secured;
      if (!best || t > best.t) { best = { id: p.id, t }; tie = false; }
      else if (t === best.t) tie = true;
    });
    return best && best.t > 0 && !tie ? best.id : null;
  }

  /* Split `total` among ids (already in deterministic seat order).
   * Leftover units go to the first claimants. */
  function split(total, ids) {
    const each = Math.floor(total / ids.length);
    let rem = total - each * ids.length;
    return ids.map((id) => ({ playerId: id, amount: each + (rem-- > 0 ? 1 : 0) }));
  }

  function sanitize(action, player, ctx) {
    if (!action || player.eliminated) return { type: 'NONE' };
    if (action.type === 'CLAIM' && ctx.boxIds.has(action.targetId)) return action;
    if (action.type === 'ATTACK' && action.targetId !== player.id && ctx.activeIds.has(action.targetId)) return action;
    if (action.type === 'SECURE' && !ctx.secureDisabled) return action;
    return { type: 'NONE' };
  }

  /* players: [{id, lives, unsecured, secured, eliminated}] in seat order
   * actions: { [playerId]: action }
   * opts: { secureDisabled, leaderId, event } */
  function resolveRound(players, boxes, actions, opts) {
    opts = opts || {};
    const secureDisabled = !!opts.secureDisabled;
    const event = opts.event || null;
    const snap = {};
    players.forEach((p) => (snap[p.id] = { ...p }));
    const ctx = {
      boxIds: new Set(boxes.map((b) => b.id)),
      activeIds: new Set(players.filter((p) => !p.eliminated).map((p) => p.id)),
      secureDisabled,
    };
    const act = {};
    players.forEach((p) => (act[p.id] = sanitize(actions[p.id], p, ctx)));

    const dU = {}, dS = {}, dL = {};
    players.forEach((p) => { dU[p.id] = 0; dS[p.id] = 0; dL[p.id] = 0; });
    const events = [];
    const securers = new Set(players.filter((p) => act[p.id].type === 'SECURE').map((p) => p.id));
    const feePct = event === 'FREE_VAULT' ? 0 : CONFIG.VAULT_FEE_PERCENT;
    const penaltyPct = event === 'HIGH_ALERT' ? CONFIG.HIGH_ALERT_PENALTY_PERCENT : CONFIG.FAILED_ATTACK_PENALTY_PERCENT;

    // 1. Secure: move snapshot unsecured into the vault (minus a small fee)
    securers.forEach((id) => {
      const amt = snap[id].unsecured;
      const fee = Math.floor(amt * feePct);
      dU[id] -= amt; dS[id] += amt - fee;
      events.push({ type: 'secure', playerId: id, amount: amt, fee });
    });

    // 2. Attacks, grouped by target, all based on the snapshot
    const byTarget = {};
    players.forEach((p) => {
      const a = act[p.id];
      if (a.type === 'ATTACK') (byTarget[a.targetId] = byTarget[a.targetId] || []).push(p.id);
    });
    // 2a. successful loot amounts first (so a player can never lose more than they have)
    const lootLost = {};
    players.forEach((t) => {
      if (byTarget[t.id] && !securers.has(t.id)) {
        const pct = t.id === opts.leaderId ? CONFIG.BOUNTY_LOOT_PERCENT : CONFIG.SUCCESSFUL_LOOT_PERCENT;
        lootLost[t.id] = Math.floor(snap[t.id].unsecured * pct);
      }
    });
    players.forEach((t) => {
      const attackers = byTarget[t.id];
      if (!attackers) return;
      if (securers.has(t.id)) {
        attackers.forEach((aid) => {
          const avail = snap[aid].unsecured - (lootLost[aid] || 0);
          const penalty = Math.max(0, Math.min(avail, Math.floor(snap[aid].unsecured * penaltyPct)));
          dU[aid] -= penalty; dS[t.id] += penalty;
          dL[aid] -= CONFIG.FAILED_ATTACK_LIFE_LOSS;
          events.push({ type: 'blocked', attackerId: aid, defenderId: t.id, penalty, lifeLoss: CONFIG.FAILED_ATTACK_LIFE_LOSS });
        });
      } else {
        const total = lootLost[t.id];
        const shares = split(total, attackers);
        dU[t.id] -= total;
        shares.forEach((s) => (dU[s.playerId] += s.amount));
        events.push({ type: 'loot', targetId: t.id, total, shares, bounty: t.id === opts.leaderId });
      }
    });

    // 3. Claims, grouped by box
    boxes.forEach((b) => {
      const ids = players.filter((p) => act[p.id].type === 'CLAIM' && act[p.id].targetId === b.id).map((p) => p.id);
      if (!ids.length) { events.push({ type: 'unclaimed', boxId: b.id, value: b.value }); return; }
      const shares = split(b.value, ids);
      shares.forEach((s) => (dU[s.playerId] += s.amount));
      events.push({ type: 'claim', boxId: b.id, value: b.value, shares, golden: !!b.golden });
    });

    // 4. Apply + eliminations
    const next = players.map((p) => {
      const n = { ...p };
      if (!p.eliminated) {
        n.unsecured = Math.max(0, p.unsecured + dU[p.id]);
        n.secured = p.secured + dS[p.id];
        n.lives = Math.max(0, p.lives + dL[p.id]);
        if (n.lives <= 0) { n.eliminated = true; events.push({ type: 'eliminated', playerId: p.id }); }
      }
      return n;
    });

    return { players: next, events, actions: act };
  }

  function rankPlayers(players) {
    const total = (p) => p.unsecured + p.secured;
    const sorted = players.slice().sort((a, b) =>
      (a.eliminated - b.eliminated) || (total(b) - total(a)) || (b.lives - a.lives));
    let rank = 0, prev = null;
    return sorted.map((p, i) => {
      const key = [p.eliminated, total(p), p.lives].join('|');
      if (key !== prev) rank = i + 1;
      prev = key;
      return { ...p, total: total(p), rank };
    });
  }

  /* End-of-game awards from player stats. */
  const AWARDS = [
    { key: 'lootGained', icon: '🦹', title: 'Master Thief', unit: 'stolen' },
    { key: 'securedTotal', icon: '🏦', title: 'Vault Keeper', unit: 'locked away' },
    { key: 'claimedTotal', icon: '📦', title: 'Box Hunter', unit: 'from boxes' },
    { key: 'blocks', icon: '🛡️', title: 'Iron Wall', unit: 'raids blocked', count: true },
    { key: 'failedRaids', icon: '🤡', title: 'Daredevil', unit: 'raids bounced', count: true },
    { key: 'biggestGain', icon: '💥', title: 'Biggest Haul', unit: 'in one round' },
  ];
  function computeAwards(players) {
    const out = [];
    AWARDS.forEach((a) => {
      let best = null;
      players.forEach((p) => {
        const v = (p.stats && p.stats[a.key]) || 0;
        if (v > 0 && (!best || v > best.v)) best = { v, p };
      });
      if (best) out.push({ icon: a.icon, title: a.title, playerId: best.p.id, value: best.v, unit: a.unit, count: !!a.count });
    });
    return out;
  }

  /* ---------------- Bot brain ----------------
   * Expected-value model + personality + noise. Uses only public info
   * (money, lives, past habits, events) — never other players' current picks. */
  const PERSONALITIES = {
    greedy:     { greed: 1.25, aggression: 0.9, caution: 0.8, contrarian: 0.3 },
    cautious:   { greed: 0.95, aggression: 0.7, caution: 1.4, contrarian: 0.5 },
    aggressive: { greed: 0.9, aggression: 1.5, caution: 0.75, contrarian: 0.4 },
    sneaky:     { greed: 1.0, aggression: 1.15, caution: 1.0, contrarian: 1.0 },
  };

  function botChooseAction(state, botId, rng) {
    const me = state.players.find((p) => p.id === botId);
    const pers = PERSONALITIES[me.personality] || PERSONALITIES.sneaky;
    const others = state.players.filter((p) => !p.eliminated && p.id !== botId);
    const n = others.length + 1;
    const progress = state.round / state.maxRounds;
    const base = baseValue(state.round, state.maxRounds);
    const options = [];

    // Claims: assume others crowd onto bigger boxes. Blackout → values unknown.
    const vals = state.boxes.map((b) => (b.value == null ? state.avgBox || base * 7 : b.value));
    const sq = vals.reduce((s, v) => s + v * v, 0);
    state.boxes.forEach((b, i) => {
      const crowd = others.length * 0.6 * ((vals[i] * vals[i]) / sq) * (1.4 - pers.contrarian * 0.6);
      options.push({ action: { type: 'CLAIM', targetId: b.id }, ev: (vals[i] / (1 + crowd)) * pers.greed });
    });

    // How likely is each rival to raid me? (habit + how rich I look)
    const raidHabit = (p) => (((p.stats && p.stats.attacks) || 0) + 0.5) / (((p.stats && p.stats.rounds) || 0) + 2);

    // Secure: worth it when holding a juicy unsecured pile and rivals are raiders
    if (!state.secureDisabled && me.unsecured > 0) {
      const poorer = others.filter((o) => o.unsecured < me.unsecured).length / Math.max(1, others.length);
      const habit = others.reduce((s, o) => s + raidHabit(o), 0) / Math.max(1, others.length);
      let threat = Math.min(0.95, 0.12 + poorer * 0.45 + habit * 0.6 + (me.id === state.leaderId ? 0.15 : 0));
      const fee = state.event === 'FREE_VAULT' ? 0 : CONFIG.VAULT_FEE_PERCENT;
      const lootPct = me.id === state.leaderId ? CONFIG.BOUNTY_LOOT_PERCENT : CONFIG.SUCCESSFUL_LOOT_PERCENT;
      const ev = me.unsecured * lootPct * threat * 1.5 * pers.caution - me.unsecured * fee;
      options.push({ action: { type: 'SECURE' }, ev });
    }

    // Attacks: EV = P(no secure)*loot - P(secure)*(penalty + life value)
    const lifeValue = base * ([0, 30, 7, 3.5, 2.5][Math.min(4, me.lives)] || 3);
    const penaltyPct = state.event === 'HIGH_ALERT' ? CONFIG.HIGH_ALERT_PENALTY_PERCENT : CONFIG.FAILED_ATTACK_PENALTY_PERCENT;
    const aggroRamp = 0.95 + progress * 0.9;
    others.forEach((t) => {
      if (t.unsecured <= 0) return;
      const h = t.stats || { rounds: 0, secures: 0 };
      let pSecure = state.secureDisabled ? 0 : (h.secures + 1) / (h.rounds + 4);
      if (!state.secureDisabled) {
        const richest = others.every((o) => o.unsecured <= t.unsecured);
        if (richest) pSecure = Math.min(0.85, pSecure + 0.12);
        if (h.lastAction === 'SECURE') pSecure *= 0.7; // just secured → maybe less paranoid now
      }
      const lootPct = t.id === state.leaderId ? CONFIG.BOUNTY_LOOT_PERCENT : CONFIG.SUCCESSFUL_LOOT_PERCENT;
      const loot = (t.unsecured * lootPct) / (1 + (n - 2) * 0.18);
      const cost = me.unsecured * penaltyPct + lifeValue;
      const ev = ((1 - pSecure) * loot - pSecure * cost) * pers.aggression * aggroRamp;
      options.push({ action: { type: 'ATTACK', targetId: t.id }, ev });
    });

    // Softmax-ish pick with noise (this is also the "bluff": bots aren't fully predictable)
    const best = Math.max(...options.map((o) => o.ev));
    const temp = Math.max(base * 1.2, Math.abs(best) * 0.3);
    const weights = options.map((o) => Math.exp((o.ev - best) / temp));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return options[i].action; }
    return options[0].action;
  }

  return {
    endgameInfo, makeBoxes, rollEvent, leaderOf, resolveRound, rankPlayers, computeAwards, botChooseAction, split, baseValue,
    PERSONALITIES: Object.keys(PERSONALITIES),
  };
});
