# Game Idea — Multiplayer Money Heist Arena

## 1. Overview

Build a fast-paced multiplayer strategy game for **4–6 players**.

The game is played over a fixed number of rounds:
- 10 rounds
- 15 rounds
- 20 rounds

Each player controls their own platform/pod and has:
- 4 lives at the start
- A visible storage area containing unsecured money
- A secured/locked money area
- The ability to claim money boxes
- The ability to attack another player
- The ability to secure their own storage

The game should feel like a real interactive game, not a quiz or text-choice game. The main interaction is **clicking/tapping objects in the arena**.

The core strategy is based on predicting what other players will do.

---

## 2. Core Gameplay Loop

Every round follows this exact high-level sequence:

1. A set of money boxes appears/drops into the arena.
2. Each box displays its prize value.
3. A **30-second action timer** starts.
4. During those 30 seconds, every active player can choose an action by clicking:
   - A money box → claim it.
   - Another player's platform → attack them.
   - Their own secure/storage control → secure their money.
5. Players may change their intended action before the timer reaches 0.
6. At 0 seconds:
   - All actions freeze.
   - No further clicks can change the decision.
7. The game resolves all actions simultaneously.
8. Animations show the results.
9. Money, lives and secure status are updated.
10. The next round begins.

---

## 3. Players

### Player Count

Supported:
- Minimum: 4 players
- Maximum: 6 players

### Starting State

Every player starts with:

```text
Lives: 4
Unsecured Storage: ₹0
Secured Storage: ₹0
```

Each player has their own visual platform/pod.

The player's:
- Name
- Lives
- Unsecured money
- Secured money

should be visible during gameplay.

---

## 4. Player Actions

There are three primary actions.

### A. Claim a Money Box

The player clicks a money box.

Example:

```text
[ BOX ]
₹10,000
```

Clicking it means:

```text
"I want to claim this box."
```

The player's selected box should become visually highlighted.

If the player clicks another box afterward, their selection changes.

Only the final selected action at the end of the 30-second timer matters.

---

### B. Attack Another Player

The player clicks another player's platform/pod.

Example:

```text
PLAYER 3
❤️❤️❤️
Storage: ₹18,000
```

Clicking Player 3 means:

```text
"I want to attack Player 3."
```

The target platform becomes highlighted.

The attacker can change their target before the timer ends.

---

### C. Secure Own Storage

The player clicks their own secure/storage control.

This means:

```text
"I want to secure my current unsecured money."
```

At resolution, the current unsecured storage is moved into secured storage.

Secured money cannot be looted by other players.

The secure action should have a strong visual effect:
- Lock animation
- Shield effect
- Golden/locked storage
- Short sound effect

---

## 5. Money Boxes

Money boxes appear at the beginning of every round.

### Number of Boxes

For:

```text
4 players → 3 boxes
5 players → 3 boxes
6 players → 4 boxes
```

The exact box locations should be visually clear.

Boxes should look clickable and should have:
- A physical box/container appearance
- Prize amount displayed/revealed
- Hover/tap effect
- Selected state
- Claim animation

---

## 6. Prize Distribution

The prize tiers follow a:

```text
10 : 8 : 5
```

ratio.

There are three prize levels:

| Tier | Ratio |
|---|---:|
| High | 10 |
| Medium | 8 |
| Low | 5 |

Example:

If the base value is ₹1,000:

```text
High   = ₹10,000
Medium = ₹8,000
Low    = ₹5,000
```

The exact distribution of High/Medium/Low boxes can be configured by the game logic.

The values should be visible before players choose a box.

---

## 7. Multiple Players Claiming the Same Box

This is one of the most important strategic mechanics.

Multiple players can select the same box.

When the round resolves, the box's prize is divided equally among all players who selected it.

Example:

```text
Box value = ₹10,000

Player A → selected
Player B → selected
Player C → selected
```

There are 3 claimants.

Therefore:

```text
₹10,000 / 3 = ₹3,333.33 each
```

The implementation may use integer currency rules if needed.

### Strategic Example

Suppose:

```text
Box A = ₹10,000
Box B = ₹8,000
```

If:

```text
Box A → 4 players
Box B → 1 player
```

Then:

```text
Box A → ₹2,500 each
Box B → ₹8,000 to one player
```

Therefore, choosing the highest-value box is not always optimal.

Players must predict what other players will choose.

---

## 8. Storage System

Each player has two money states.

### Unsecured Storage

This is the money that can potentially be stolen.

Example:

```text
Unsecured: ₹15,000
```

Other players can attack this player.

### Secured Storage

This is protected money.

Example:

```text
Secured: ₹30,000
```

Once money is secured, it cannot be looted.

The UI should visually distinguish:

```text
UNSECURED
₹15,000

SECURED
🔒 ₹30,000
```

---

## 9. Attacking

A player can attack another player by clicking their platform.

At the end of the timer, the attack is resolved.

### Successful Attack

If the target has unsecured money and has not secured it for the current round, the attacker can loot the target.

The exact successful-loot percentage should be configurable in the game rules/configuration rather than hardcoded into the UI.

Recommended initial implementation:

```text
Successful loot = 50% of target's unsecured storage
```

Example:

```text
Target unsecured storage = ₹20,000

Attacker steals 50%:
₹10,000

Target remaining:
₹10,000
```

The stolen money is transferred to the attacker.

The transfer should have a visual animation.

---

## 10. Failed Attack / Target Successfully Secured

If the attacker targets a player who successfully secures their storage for that round, the attack fails.

The attacker is punished.

### Explicit rule

The attacker:

1. Loses **1 life**
2. Loses **half of their own storage money**
3. That lost half is transferred to the defending player

Example:

```text
Attacker storage = ₹20,000
Defender secured their storage

Attack fails.

Attacker:
- loses 1 life
- loses ₹10,000

Defender:
- receives ₹10,000
```

If the attacker has no unsecured money, no money is transferred, but the attacker still loses 1 life.

The animation should clearly show:
- Attack attempt
- Defender shield/lock
- Attacker bounced/rejected
- Life lost
- Money transfer to defender

---

## 11. Multiple Attackers

Multiple players may attack the same player during a round.

The resolution system must support this.

For example:

```text
Player A → attacks Player C
Player B → attacks Player C
Player D → claims Box 1
Player C → secures
```

Both attacks against Player C should resolve according to the same secure-defense rule.

If Player C secured:
- Both attackers fail
- Each attacker loses 1 life
- Each attacker loses half of their unsecured storage
- The transferred amounts go to Player C

This should be resolved consistently and atomically.

---

## 12. Multiple Players Attacking Each Other

All actions are determined at the same time.

Example:

```text
A → attacks B
B → attacks A
```

The game should not resolve these actions sequentially in a way that gives one player an unfair advantage.

The round should first capture all decisions and then calculate the complete outcome from the same starting state.

Recommended implementation concept:

```text
ROUND STATE BEFORE RESOLUTION
        ↓
LOCK ALL ACTIONS
        ↓
CALCULATE OUTCOMES
        ↓
APPLY RESULTS
        ↓
PLAY ANIMATIONS
        ↓
NEW ROUND STATE
```

This prevents order-dependent bugs.

---

## 13. Lives

Every player starts with:

```text
❤️❤️❤️❤️
```

Maximum starting lives:

```text
4
```

A player loses 1 life when their attack fails because the target successfully secured.

Example:

```text
Before:
❤️❤️❤️❤️

Failed attack:

After:
❤️❤️❤️
```

---

## 14. Elimination

When a player reaches:

```text
0 lives
```

they are eliminated.

The eliminated player becomes a spectator.

### Spectator Rules

Eliminated players:
- Cannot claim boxes
- Cannot attack
- Cannot secure
- Cannot affect the game
- Can watch the remaining players

Their UI should clearly show:

```text
ELIMINATED
SPECTATING
```

Their platform can become visually inactive/greyed out.

---

## 15. Round Count

Before the game starts, the host/player chooses:

```text
10 ROUNDS
15 ROUNDS
20 ROUNDS
```

The game displays:

```text
ROUND 1 / 15
```

etc.

At the final round, the game enters the special endgame rules.

---

# 16. Final Rounds / Endgame

The final rounds should feel different and more intense.

This is based on the accepted "Idea 8" concept.

The final 2–3 rounds should introduce higher risk and pressure.

Possible implementation:

### Second-to-last round

Increase the danger:
- Higher box values
- More aggressive visual effects
- Faster-feeling resolution
- More dramatic animations

### Final Round

Recommended special rule:

```text
SECURE IS DISABLED
```

Players must take risks.

Money obtained in the final round cannot be protected through the normal secure action.

This creates a dramatic ending.

The exact endgame modifiers should be stored in configuration so they can easily be changed during balancing.

---

## 17. Winning

At the end of the final round:

```text
Final Score = Secured Money + Remaining Unsecured Money
```

Players are ranked by final total wealth.

Recommended ranking:

1. Highest total money
2. If tied, player with more remaining lives wins
3. If still tied, shared position

Eliminated players can still have their final money displayed for the leaderboard.

Example:

```text
🏆 FINAL RESULTS

1. Player A — ₹92,000
2. Player C — ₹78,000
3. Player B — ₹61,000
4. Player D — ₹34,000
5. Player E — ELIMINATED
6. Player F — ELIMINATED
```

---

# 18. User Interface

The UI should feel like a polished multiplayer game.

It should NOT feel like a form or dashboard.

## Main Screen

Suggested layout:

```text
┌──────────────────────────────────────────────┐
│ ROUND 7 / 15                 ⏱ 23s           │
├──────────────────────────────────────────────┤
│                                              │
│   [PLAYER 2]                 [PLAYER 3]     │
│   ❤️❤️❤️                       ❤️❤️           │
│   ₹12K                        ₹18K            │
│                                              │
│              💰 ₹10,000                     │
│                                              │
│        💰 ₹8,000       💰 ₹5,000             │
│                                              │
│                                              │
│   [YOUR POD]                  [PLAYER 4]     │
│   ❤️❤️❤️❤️                    ❤️❤️❤️          │
│   ₹15K                        ₹20K            │
│   🔒 SECURE                    ₹...           │
│                                              │
├──────────────────────────────────────────────┤
│ Your Storage: ₹15,000    Secured: ₹20,000   │
│ Selected: CLAIM ₹10,000                     │
└──────────────────────────────────────────────┘
```

The exact layout can change based on screen size.

---

# 19. Mobile-First Design

The game should work well on:
- Mobile browser
- Desktop browser

Because the main interaction is clicking/tapping, every interactive object must have a sufficiently large hit area.

Mobile requirements:
- Large buttons/objects
- Clear text
- No tiny controls
- Avoid excessive UI panels
- Keep the arena visible
- Timer always visible
- Player state always understandable

---

# 20. Visual Feedback

Every action should immediately give visual feedback.

### Selecting a Box

The selected box should:
- Glow
- Scale slightly
- Show a marker such as `YOUR TARGET`
- Remain selected until changed

### Selecting an Attack Target

Target platform should:
- Glow/red outline
- Show attack indicator
- Display something like `ATTACKING`

### Selecting Secure

Own storage should:
- Glow/gold
- Show a lock
- Display `SECURE SELECTED`

### Changing Selection

If the player changes their action:

```text
Box selected
    ↓
Player 3 clicked
    ↓
Box unselected
    ↓
Player 3 highlighted
```

Only the final selection is used.

---

# 21. Timer

Each round has:

```text
30 seconds
```

Timer should be highly visible.

Suggested behavior:

```text
30
29
28
...
10
9
8
...
3
2
1
0
```

Near the end:
- Increase visual urgency
- Optional ticking sound
- Timer can pulse

At:

```text
0
```

the arena becomes temporarily non-interactive.

Display:

```text
RESOLVING...
```

---

# 22. Resolution Phase

After the timer ends:

```text
ACTION PHASE
      ↓
LOCK
      ↓
RESOLUTION
      ↓
ANIMATIONS
      ↓
RESULTS
      ↓
NEXT ROUND
```

All player decisions should be resolved from the same pre-resolution state.

Animations should play in a clear sequence.

---

# 23. Animation Requirements

Animations are important to make the game feel polished.

## Box Claim

Example:

```text
BOX
 ↓
opens
 ↓
coins appear
 ↓
coins split
 ↓
coins fly to claimant(s)
 ↓
storage increases
```

If 3 players claim a ₹10,000 box:

```text
₹10,000
   ↓
₹3,333
₹3,333
₹3,334
   ↓
three separate coin animations
```

---

## Successful Attack

Example:

```text
Attacker
   ↓
moves/attacks target
   ↓
target storage opens
   ↓
loot amount appears
   ↓
coins fly from target → attacker
```

---

## Failed Attack

Example:

```text
Attacker
   ↓
attacks
   ↓
target shield activates
   ↓
ATTACK BLOCKED
   ↓
attacker gets knocked back
   ↓
❤️ -1
   ↓
half of attacker storage
   ↓
coins fly to defender
```

---

## Secure

Example:

```text
Storage
   ↓
gold glow
   ↓
lock closes
   ↓
🔒 SECURED
```

---

# 24. Game State Model

The game should maintain a central authoritative state.

Example conceptual state:

```js
gameState = {
  round: 7,
  maxRounds: 15,
  phase: "ACTION",
  timer: 30,

  boxes: [
    {
      id: "box-1",
      value: 10000
    },
    {
      id: "box-2",
      value: 8000
    },
    {
      id: "box-3",
      value: 5000
    }
  ],

  players: [
    {
      id: "player-1",
      name: "Player 1",
      lives: 4,
      unsecuredMoney: 15000,
      securedMoney: 20000,
      action: {
        type: "CLAIM",
        targetId: "box-1"
      },
      eliminated: false
    }
  ]
}
```

The server should be authoritative in multiplayer mode.

Clients should primarily:
- Render state
- Send intended actions
- Display animations
- Receive the final authoritative result

---

# 25. Action Model

Use a simple action structure.

### Claim

```js
{
  type: "CLAIM",
  targetId: "box-1"
}
```

### Attack

```js
{
  type: "ATTACK",
  targetId: "player-3"
}
```

### Secure

```js
{
  type: "SECURE"
}
```

### No Action

```js
{
  type: "NONE"
}
```

If the timer reaches 0 and a player has no selection, their action is:

```text
NONE
```

They receive no box and do not attack or secure.

---

# 26. Important Multiplayer Rule

The client must never be trusted to calculate money, lives or winners.

The server should calculate:

- Who selected which box
- How many people selected each box
- Box payout division
- Successful attacks
- Failed attacks
- Life loss
- Storage transfers
- Secure status
- Eliminations
- Final scores

This prevents cheating.

---

# 27. Recommended Technical Architecture

Because the first version needs to be built quickly, keep the architecture simple.

Recommended:

```text
Frontend:
HTML
CSS
JavaScript

Backend:
Node.js
Express

Realtime:
WebSocket / Socket.IO

State:
In-memory game state

Database:
None for MVP
```

This is suitable for a quick prototype.

Do NOT initially add:
- User accounts
- Persistent profiles
- Complex database systems
- Matchmaking
- Payment systems
- 3D rendering
- Physics engine
- Large asset pipeline

The goal is a playable multiplayer prototype first.

---

# 28. Suggested Project Structure

```text
money-heist-game/
│
├── server/
│   ├── server.js
│   ├── game/
│   │   ├── GameRoom.js
│   │   ├── GameState.js
│   │   ├── RoundManager.js
│   │   ├── ResolutionEngine.js
│   │   └── Player.js
│   │
│   └── config.js
│
├── client/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   │
│   ├── game/
│   │   ├── renderer.js
│   │   ├── interactions.js
│   │   ├── animations.js
│   │   └── ui.js
│   │
│   └── assets/
│       ├── boxes/
│       ├── players/
│       ├── sounds/
│       └── effects/
│
└── README.md
```

---

# 29. Round Resolution Algorithm

At the end of the action timer:

```text
1. Freeze all actions.

2. Take a snapshot of the current round state.

3. Group all CLAIM actions by box.

4. For each box:
   - Count claimants.
   - Divide the box value among claimants.
   - Add the payout to each claimant's unsecured storage.

5. Process SECURE actions.
   - Move current unsecured money into secured storage.
   - Mark the player's storage as secured for this round.

6. Process ATTACK actions.
   - Check whether target successfully secured.
   - If target secured:
       attacker loses 1 life
       attacker loses half of unsecured storage
       defender receives that amount
   - Otherwise:
       attacker receives the configured loot percentage
       target loses that amount

7. Apply eliminations.

8. Play result animations.

9. Update the final round state.

10. If the game is finished:
       show final leaderboard.
    Otherwise:
       start the next round.
```

The implementation must define exact ordering carefully so that the result is deterministic.

For the MVP, use a **resolution snapshot** and compute all outcomes before mutating the live state.

---

# 30. Determinism and Edge Cases

The game logic must explicitly handle:

### Player attacks an eliminated player

Invalid action.

The attack does nothing.

### Player is eliminated during resolution

Their action for that round should still be resolved according to the snapshot, then they become eliminated.

### Player has ₹0 unsecured money and fails an attack

They:
- Lose 1 life
- Transfer ₹0

### Several players attack the same target

All attacks are processed independently according to the target's secure state.

### Several players claim the same box

Prize is divided equally.

### Integer currency

Use integer currency units to avoid floating-point problems.

If a prize cannot be divided evenly, define a deterministic remainder rule.

Recommended:

```text
Extra ₹1 units are distributed to claimants in deterministic player-ID order.
```

### Player disconnects

For MVP:
- Mark them disconnected.
- Their action becomes `NONE` if they have not submitted an action.
- The room continues.

---

# 31. Game Feel

The game should feel:

- Fast
- Competitive
- Risky
- Easy to understand
- Visually satisfying
- Strategic
- Slightly chaotic
- Replayable

The player should constantly think:

```text
"Should I take the ₹10,000 box?"

"Everyone probably wants it."

"Maybe I should take the ₹8,000 box alone."

"Player 3 has a lot of money."

"Will Player 3 secure?"

"Should I attack them?"

"If I attack and they secure, I lose a life."

"Maybe I should secure my own money instead."
```

This decision tension is the core of the game.

---

# 32. Important UX Principle

Do NOT make the player interact through text questions such as:

```text
What do you want to do?

1. Claim
2. Attack
3. Secure
```

Instead, the environment itself should be interactive.

The player should simply:

```text
👆 Click box
👆 Click player
👆 Click secure
```

The UI communicates what the click means.

This is one of the most important design requirements.

---

# 33. MVP Scope

The first playable version should prioritize:

### Must Have

- 4–6 player room
- Player pods
- 4 starting lives
- 30-second action timer
- Money boxes
- 10:8:5 prize ratio
- Box claiming
- Multiple claimants splitting prize
- Player attacks
- Secure action
- Failed attack punishment
- Elimination
- Spectator mode
- 10/15/20 round selection
- Final round special rule
- Resolution animations
- Final leaderboard
- Responsive mobile UI

### Nice to Have

- Sound effects
- Background music
- Screen shake
- Particle effects
- Better character animations
- Chat
- Player avatars
- Match history
- Reconnection
- Lobby system
- Room codes

### Do NOT prioritize for the first 2-hour prototype

- Accounts
- Database
- Persistent user profiles
- Ranking system
- Matchmaking
- Payments
- Advanced anti-cheat
- Complex physics
- 3D models
- Voice chat

---

# 34. Configuration

Keep game balance values configurable.

Example:

```js
const GAME_CONFIG = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 6,

  STARTING_LIVES: 4,

  ACTION_TIME_SECONDS: 30,

  AVAILABLE_ROUNDS: [10, 15, 20],

  BOX_COUNT: {
    4: 3,
    5: 3,
    6: 4
  },

  PRIZE_RATIO: {
    HIGH: 10,
    MEDIUM: 8,
    LOW: 5
  },

  SUCCESSFUL_LOOT_PERCENT: 0.50,

  FAILED_ATTACK_LIFE_LOSS: 1,

  FINAL_ROUNDS_SPECIAL_RULE: true
};
```

The exact loot percentage and final-round modifiers should remain easy to change during balancing.

---

# 35. Future Features

After the MVP works, possible additions:

- Different maps
- Different box types
- Special abilities
- Temporary shields
- Decoy boxes
- Double-money boxes
- Trap boxes
- Character skins
- Player emotes
- Ranked mode
- Private rooms
- Room codes
- Persistent player statistics
- Match replay
- Spectator camera
- Sound packs
- Seasonal themes
- Power-ups

These are NOT required for the first version.

---

# 36. AI Development Instructions

If an AI coding agent is given this document, it should understand the following priorities:

1. Build a **working game first**.
2. Keep the architecture simple.
3. Prioritize the core round loop.
4. Make the arena clickable.
5. Make the 30-second timer authoritative.
6. Freeze all actions at timer 0.
7. Resolve actions simultaneously from a snapshot.
8. Never trust client-side money/life calculations.
9. Make the game playable with 4–6 players.
10. Make the UI responsive for mobile.
11. Use animations to communicate game results.
12. Keep game-balance values configurable.
13. Avoid unnecessary infrastructure.
14. Do not turn the game into a text-based decision system.
15. The final result should feel like a polished small multiplayer game, not a technical demo.

---

# 37. One-Sentence Game Description

> A fast multiplayer strategy game where players compete for falling money boxes, attack each other's unsecured wealth, and decide whether to risk everything or lock their money before the timer runs out.
