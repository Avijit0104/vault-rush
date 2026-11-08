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
   * Thinks like a careful player, using only public info (money, lives, events, everyone's past habits),
   * never anyone's current pick:
   *  1. models every player: how often they raid / secure, who they went after last time, who wronged them;
   *  2. predicts who is likely to raid whom this round (raiders go for big, unguarded piles; bounty on the 👑);
   *  3. scores each move as the expected change in its OWN money, counting what it risks by leaving cash unsecured,
   *     including the Final Heist where vaults jam (so it banks its pile the round before);
   *  4. picks the best move most of the time, with a little unpredictability so it can't be read like a script.
   * Personalities only nudge the numbers. */
  const PERSONALITIES = {
    greedy:     { greed: 1.1, aggression: 0.95, caution: 0.9, noise: 1.0 },
    cautious:   { greed: 1.0, aggression: 0.85, caution: 1.2, noise: 0.8 },
    aggressive: { greed: 0.95, aggression: 1.2, caution: 0.9, noise: 1.0 },
    sneaky:     { greed: 1.0, aggression: 1.05, caution: 1.05, noise: 1.3 },
  };

  function botChooseAction(state, botId, rng) {
    const me = state.players.find((p) => p.id === botId);
    const pers = PERSONALITIES[me.personality] || PERSONALITIES.sneaky;
    const active = state.players.filter((p) => !p.eliminated);
    const others = active.filter((p) => p.id !== botId);
    if (!others.length) return state.boxes.length ? { type: 'CLAIM', targetId: state.boxes[0].id } : { type: 'NONE' };
    const base = baseValue(state.round, state.maxRounds);
    const remaining = state.maxRounds - state.round;               // rounds still to come after this one
    const secureOff = !!state.secureDisabled;
    const next = endgameInfo(state.round + 1, state.maxRounds);
    const vaultsJamNext = !!(next && next.secureDisabled);          // last chance to bank before the Final Heist
    const fee = state.event === 'FREE_VAULT' ? 0 : CONFIG.VAULT_FEE_PERCENT;
    const penaltyPct = state.event === 'HIGH_ALERT' ? CONFIG.HIGH_ALERT_PENALTY_PERCENT : CONFIG.FAILED_ATTACK_PENALTY_PERCENT;
    const lootPct = (p) => (p.id === state.leaderId ? CONFIG.BOUNTY_LOOT_PERCENT : CONFIG.SUCCESSFUL_LOOT_PERCENT);
    const st = (p) => p.stats || {};
    const total = (p) => p.unsecured + p.secured;

    // --- 1. habits (with a sensible prior until we've seen a few rounds) ---
    const K = 3;
    const raidRate = (p) => {
      const s = st(p);
      let r = ((s.attacks || 0) + 0.3 * K) / ((s.rounds || 0) + K);
      if (secureOff) r = Math.min(0.9, r * 1.8 + 0.15);              // nobody can block in the Final Heist: raids are free
      if (p.lives <= 1 && !secureOff) r *= 0.6;                       // one life left: a blocked raid knocks them out
      return r;
    };
    // Will player x lock their vault this round? Their habit, blended with how exposed they look.
    const pile = (p) => p.unsecured * lootPct(p);
    const totalPile = active.reduce((s, p) => s + pile(p), 0) || 1;
    const looksThreatened = (x) => Math.min(0.95, others.concat(me).filter((r) => r.id !== x.id)
      .reduce((s, r) => s + raidRate(r) * pile(x) / Math.max(1, totalPile - pile(r)), 0));
    const pSecure = (x) => {
      if (secureOff || x.unsecured <= 0) return 0;
      const s = st(x);
      const habit = ((s.secures || 0) + 0.15 * K) / ((s.rounds || 0) + K);
      let want = Math.min(0.95, looksThreatened(x) * 1.6 + (vaultsJamNext ? 0.3 : 0) + (x.id === state.leaderId ? 0.1 : 0));
      if (x.unsecured < base * 1.5) want *= 0.35;                     // too little to bother paying the fee
      let p = 0.5 * habit + 0.5 * want;
      if (s.lastAction === 'SECURE') p *= 0.8;                        // people rarely secure twice in a row
      return Math.min(0.92, p);
    };

    // --- 2. who goes after whom ---
    // Raiders pick big, likely-unguarded piles; grudges (you raided me last time) and old targets weigh more.
    const attract = (r, x) => {
      if (x.id === r.id || x.unsecured <= 0) return 0;
      let a = pile(x) * (1 - pSecure(x)) + 1;
      if (st(x).lastTarget === r.id) a *= 1.5;                        // revenge
      if (st(r).lastTarget === x.id) a *= 1.2;                        // keeps hunting the same victim
      return a;
    };
    const pRaid = (r, x) => {
      let sum = 0; active.forEach((y) => (sum += attract(r, y)));
      return sum > 0 ? raidRate(r) * attract(r, x) / sum : 0;
    };
    let pSafe = 1;
    others.forEach((r) => (pSafe *= 1 - pRaid(r, me)));
    const pRaidedMe = 1 - pSafe;
    const exposedNow = pRaidedMe * lootPct(me) * me.unsecured * pers.caution;

    // Money left unsecured stays at risk in later rounds too. Before the Final Heist that risk is almost certain.
    let laterRisk = 0;
    if (!secureOff && remaining > 0) {
      if (vaultsJamNext) {
        const share = pile(me) / totalPile;
        laterRisk = me.unsecured * CONFIG.SUCCESSFUL_LOOT_PERCENT * Math.min(0.95, 0.35 + 1.4 * share);
      } else {
        laterRisk = me.unsecured * lootPct(me) * Math.min(0.6, pRaidedMe * Math.min(remaining, 3) * 0.35);
      }
      laterRisk *= pers.caution;
    }

    // Lives: a second blocked raid means elimination = ranked below every survivor.
    const lifeCost = me.lives <= 1 ? total(me) + base * 12 * (remaining + 1) : base * 2 + total(me) * 0.15;
    const options = [];

    // --- 3a. claim a box ---
    // Smart claimers spread out until no box is clearly better (each box's share evens out); humans tend to pile
    // onto the biggest box. So a lone bot often does better on a smaller box nobody else wants.
    const vals = state.boxes.map((b) => (b.value == null ? state.avgBox || base * 7 : b.value));
    const claimP = (o) => Math.max(0.1, 1 - raidRate(o) - pSecure(o));
    const botsClaiming = others.filter((o) => o.isBot !== false).reduce((s, o) => s + claimP(o), 0);
    const humansClaiming = others.filter((o) => o.isBot === false).reduce((s, o) => s + claimP(o), 0);
    const crowdOf = (lambda) => vals.map((v) => Math.max(0, v / lambda - 1));
    let lo = 1e-6, hi = Math.max(...vals, 1);
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (crowdOf(mid).reduce((a, b) => a + b, 0) > botsClaiming) lo = mid; else hi = mid; }
    // real players are only partly that rational: blend the even spread with "bigger boxes draw more people"
    const SPREAD = 0.25; // tuned by simulation: strongest vs other styles, hardest to exploit
    const pull = vals.map((v) => v * v), pullSum = pull.reduce((a, b) => a + b, 0) || 1;
    const crowd = crowdOf(hi).map((c, i) => SPREAD * c + (1 - SPREAD) * botsClaiming * (pull[i] / pullSum));
    const biggest = vals.indexOf(Math.max(...vals));
    vals.forEach((v, i) => (crowd[i] += humansClaiming * (i === biggest ? 0.6 : 0.4 / Math.max(1, vals.length - 1))));
    state.boxes.forEach((b, i) => {
      const share = vals[i] / (1 + crowd[i]);
      options.push({ action: { type: 'CLAIM', targetId: b.id }, ev: share * pers.greed - exposedNow - laterRisk });
    });

    // --- 3b. secure: no loss, plus whatever blocked raiders pay me; costs the fee ---
    if (!secureOff && me.unsecured > 0) {
      let blockGain = 0;
      others.forEach((r) => (blockGain += pRaid(r, me) * Math.min(r.unsecured, r.unsecured * penaltyPct)));
      options.push({ action: { type: 'SECURE' }, ev: blockGain - fee * me.unsecured });
    }

    // --- 3c. raid someone ---
    others.forEach((t) => {
      if (t.unsecured <= 0) return;
      const ps = pSecure(t);
      let rivals = 0;
      others.forEach((r) => { if (r.id !== t.id) rivals += pRaid(r, t); });
      const loot = (lootPct(t) * t.unsecured) / (1 + rivals);
      const blocked = penaltyPct * me.unsecured + lifeCost;
      const ev = ((1 - ps) * loot * pers.aggression) - ps * blocked - exposedNow - laterRisk;
      options.push({ action: { type: 'ATTACK', targetId: t.id }, ev });
    });

    // --- 4. pick: the best move most of the time, but not a script ---
    const best = Math.max(...options.map((o) => o.ev));
    const temp = Math.max(base * 0.35, Math.abs(best) * 0.08) * pers.noise;
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
