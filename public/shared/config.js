/* Vault Rush — game balance configuration.
 * Shared by the server (Node) and the browser (solo mode).
 * Change numbers here to rebalance the game; nothing else is hardcoded. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VR_CONFIG = factory();
})(this, function () {
  return {
    MIN_PLAYERS: 4,
    MAX_PLAYERS: 6,

    STARTING_LIVES: 2,

    ACTION_TIME_SECONDS: 30,           // default turn timer
    ACTION_TIME_OPTIONS: [15, 20, 30], // host can choose
    INTRO_MS: 2600,                    // "ROUND X" banner + boxes dropping
    EVENT_INTRO_MS: 1600,              // extra intro time when a random event is announced
    LOCKED_IN_FAST_FORWARD: 3,         // seconds left once every human has locked in

    AVAILABLE_ROUNDS: [10, 15, 20],

    BOX_COUNT: { 4: 3, 5: 3, 6: 4 },

    // Tier layout per box count (values = PRIZE_RATIO * base)
    BOX_TIERS: {
      3: ['HIGH', 'MEDIUM', 'LOW'],
      4: ['HIGH', 'MEDIUM', 'LOW', 'LOW'],
      5: ['HIGH', 'MEDIUM', 'MEDIUM', 'LOW', 'LOW'],
    },

    PRIZE_RATIO: { HIGH: 10, MEDIUM: 8, LOW: 5 },

    // base value for round r = BASE_VALUE + BASE_GROWTH * (r - 1)
    BASE_VALUE: 1000,
    BASE_GROWTH: 100,

    SUCCESSFUL_LOOT_PERCENT: 0.95,      // of target's unsecured, split among all attackers
    BOUNTY_LOOT_PERCENT: 1,             // raiding the current leader takes everything unsecured (comeback mechanic)
    FAILED_ATTACK_PENALTY_PERCENT: 0.5, // of attacker's unsecured, goes to the defender's vault
    FAILED_ATTACK_LIFE_LOSS: 1,
    VAULT_FEE_PERCENT: 0.05,            // securing costs a small bank fee, so it isn't a free move

    // Random round events (never in endgame rounds)
    EVENT_CHANCE: 0.35,
    EVENT_MIN_ROUND: 3,
    EVENTS: {
      GOLDEN:     { label: 'GOLDEN BOX',  icon: '🌟', desc: 'One box is worth DOUBLE!' },
      HIGH_ALERT: { label: 'HIGH ALERT',  icon: '🚨', desc: 'Blocked raiders lose ALL their unsecured cash!' },
      BLACKOUT:   { label: 'BLACKOUT',    icon: '🌑', desc: 'Box values are hidden until time runs out!' },
      BONUS_DROP: { label: 'BONUS DROP',  icon: '🎁', desc: 'An extra box drops this round!' },
      FREE_VAULT: { label: 'BANK HOLIDAY', icon: '🏦', desc: 'No vault fee this round!' },
    },
    HIGH_ALERT_PENALTY_PERCENT: 1,
    GOLDEN_MULTIPLIER: 2,

    // Endgame modifiers. offsetFromEnd 0 = final round.
    FINAL_ROUNDS_SPECIAL_RULE: true,
    ENDGAME: [
      { offsetFromEnd: 2, label: 'HEAT ROUND', multiplier: 1.5, secureDisabled: false },
      { offsetFromEnd: 1, label: 'DANGER ROUND', multiplier: 2, secureDisabled: false },
      { offsetFromEnd: 0, label: 'FINAL HEIST', multiplier: 3, secureDisabled: true },
    ],

    // Unlockable looks (progress is stored on the player's phone; the server only validates the ids)
    COSMETICS: {
      acc: [
        { id: 'none', name: 'No Hat' },
        { id: 'shades', name: 'Shades', need: { games: 2 } },
        { id: 'partyhat', name: 'Party Hat', need: { games: 5 } },
        { id: 'tophat', name: 'Top Hat', need: { wins: 1 } },
        { id: 'chain', name: 'Gold Chain', need: { wins: 3 } },
        { id: 'halo', name: 'Halo', need: { wins: 5 } },
      ],
      crate: [
        { id: 'wood', name: 'Wooden Crate' },
        { id: 'neon', name: 'Neon Crate', need: { games: 3 } },
        { id: 'gold', name: 'Gold Crate', need: { wins: 2 } },
        { id: 'diamond', name: 'Diamond Crate', need: { wins: 4 } },
      ],
    },

    EMOTES: ['😂', '😡', '🫡', '💸', '😱', '🤝', '🔥', '👀'],
    EMOTE_COOLDOWN_MS: 1500,

    CURRENCY: '₹',
  };
});
