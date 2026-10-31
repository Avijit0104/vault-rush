# CLAUDE.md — Vault Rush project log

> Read this first every session. **Update the "Status" and "Session log" sections at the end of every session.**

## What this is
**Vault Rush**: a mobile-first, GUI multiplayer heist strategy game for 4–6 players, built from `idea.md`. Players tap money boxes (claim), rival pods (raid) or their vault (secure) within a 15/20/30 s timer; all actions resolve simultaneously. Bots fill seats so there are always at least 4 players.

## Hard rules from the owner (Avijit Bose)
- **Every screen must show "Made by Avijit Bose"**. It's a fixed `<footer class="credit">` in `public/index.html` that sits outside the screens, so it's always visible (also in the splash and the settings sheet). Never remove it.
- **Everything must be free**: hosting, libraries, fonts, sounds. Art is hand-made SVG (`js/art.js`) and all audio is synthesized (`js/audio.js`), so there are no asset licences to worry about.
- **Never `git push` or create GitHub repos.** The owner pushes from another PC/account. Keep the repo deploy-ready for **GitHub → Render (free)**.
- Game must be playable on other people's phones (mobile browser, PWA-installable).
- The UI must be attractive and must not feel like a text quiz: the arena itself is the interface.
- **Owner's UI brief (S3, a draw.io sketch):** portrait arena, players down the LEFT and RIGHT edges, boxes stacked down the MIDDLE,
  each player has a "crate for storage that gets coins and increases when needed" on the outer edge. **No card-style player tiles.**
  I added a bank safe per player (owner asked me to place the secured bank myself). Keep this layout unless the owner changes it.

## Architecture
```
public/                 static client (served by Express; also works for solo offline)
  index.html            screens: home, solo, join, lobby, game, results, rules; sheets: settings, log, player info;
                        tutorial coach, splash (vault door), credit footer
  css/style.css         neon heist theme, side seats + centre runway layout, spotlight, alarms, sheets, responsive breakpoints
  js/audio.js           SETTINGS (localStorage: sfx/music/vibrate/fastAnim) + SFX + procedural Music (3 intensity levels)
  js/art.js             SVG robber characters c0..c11, robot bots r0..r5, prize crates/safe/chest/mystery, parachute, ₹ coin,
                        lootCrate(level 0-4) that fills with coins, bank safe, seat colours
  js/net.js             OnlineConn (Socket.IO) and LocalConn (in-browser room), same interface
  js/anim.js            FX: coin arcs, shields, lunges, floating text, beams/aim lines, tap labels, confetti
  js/app.js             screens, rendering, input (tap + long-press), tutorial, emotes, resolution animation, log, results
  shared/               UMD modules used by BOTH server (require) and browser (<script>)
    config.js           ALL balance numbers (loot %, bounty, vault fee, events, endgame, timers, emotes)
    engine.js           pure rules: makeBoxes, rollEvent, leaderOf, resolveRound (snapshot), rankPlayers, computeAwards, bot AI
    room.js             GameRoom state machine: LOBBY → INTRO → ACTION → RESOLVING → … → GAMEOVER; spectators, emotes, pause
  icons/                PNG icons (192/512/apple-touch) rendered from icon.svg
  sw.js, manifest.webmanifest, icon.svg   PWA (network-first, cache fallback; bump CACHE version when assets change)
server/server.js        Express static + Socket.IO; rooms by 4-letter code; rejoin by token; /healthz, /stats, /vendor/qrcode.js
tests/engine.test.js    node:test, 11 tests
render.yaml             Render blueprint (free web service, health check /healthz)
```
Key design: the server is authoritative. The client only sends `{type: CLAIM|ATTACK|SECURE|NONE, targetId}` and renders state. Solo mode runs the same `GameRoom` inside the browser.

### Socket events (client → server)
`create {name,avatar}`, `join {code,name,avatar}` (a mid-game join becomes a spectator), `rejoin {code,token}`, `leave`, `settings {rounds, actionTime}`, `addBot`, `removeBot id`, `kick id`, `start`, `action {type,targetId}`, `lockIn`, `playAgain`, `emote '😂'`. Solo only: `pause bool` (tutorial).
Server → client: `joined {code,playerId,token,spectator}`, `state <view>` (per-player view; others' choices hidden, only `hasActed`; Blackout hides box values), `emote {playerId, emoji}`, `errorMsg`, `kicked`, `rejoinFailed`.

## Rule decisions (idea.md was ambiguous or the owner approved changes)
1. **All amounts use the pre-round snapshot.** Loot = % of the target's unsecured money *at round start*; this round's box winnings can't be stolen in the same round.
2. **Several raiders on an unsecured target share one loot** (split like a box).
3. **Blocked-raid penalty goes into the defender's vault.** A player can never lose more than they have (loot is computed first, then penalty from what's left).
4. Boxes: 3 (H/M/L) for 4–5 players, 4 (H/M/L/L) for 6; base ₹1,000 + ₹100 per round.
5. Endgame: last 3 rounds HEAT ×1.5, DANGER ×2, FINAL HEIST ×3 with **secure disabled**.
6. Ranking: survivors first by total (then lives), eliminated players below.
7. **LOCK IN**: when every connected human has locked in, the timer jumps to 3 s.
8. Tapping your selection again deselects it.
9. Session 2 additions (owner said "do all updates"):
   - **Vault fee 5%** on secure (waived on the Bank Holiday event).
   - **Bounty**: the unique richest active player (👑) loses 60% instead of 50% when raided (comeback mechanic).
   - **Random events** (35% chance from round 3, never in endgame): GOLDEN (one box ×2), HIGH_ALERT (blocked raiders lose 100% unsecured), BLACKOUT (values hidden until resolve), BONUS_DROP (+1 box), FREE_VAULT (no fee).
   - Host-selectable timer 15/20/30 s.
   - Spectators: late joiners watch, then get a seat on Play Again (replacing bots if full).
   - Awards at game end: Master Thief, Vault Keeper, Box Hunter, Iron Wall, Daredevil, Biggest Haul.
   - Bots: smarter EV model (aggression ramps with game progress, learns raid/secure habits, respects bounty/events). Sim of 300 games: ~67% claim / 21% raid / 12% secure; the leader with 3 rounds left wins only ~41%.

## Live deployment
- **Live URL:** https://vault-rush-njwu.onrender.com (Render free web service via `render.yaml` Blueprint, deployed 2026-10-31).
- **GitHub repo:** `Avijit0104/vault-rush`. The owner uploads files through the GitHub website in an incognito window (no credentials on this PC).
  Never upload `node_modules`. Render auto-redeploys on every commit to `main`.
- README.md is **player-facing only** (play link + how to play). Keep dev/deploy notes here in CLAUDE.md, not in the README.

## How to run / test
- `npm install` then `npm start` → http://localhost:3000. `npm test` runs 11 engine tests.
- Browser testing: the Claude-in-Chrome extension could NOT reach localhost. Use puppeteer-core (install it in the session scratchpad) with the local Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. To skip the splash/tutorial in tests: `sessionStorage.vr_splash='1'`, `localStorage.vr_tut='1'`.
- After changing `server/server.js`, restart the server; static files are served live.

## Status (update every session)
**Session 1 (2026-10-31): MVP complete.**
**Session 2 (2026-10-31): full visual + gameplay upgrade complete and verified.**
- [x] Engine: vault fee, bounty, 5 random events, no-negative clamp, awards; 11 tests pass (incl. money conservation with fees/events)
- [x] Smarter bots + bot emotes (react to raids/blocks)
- [x] Visuals: SVG robber characters (12) + robot bots (6), per-seat colours, oval felt table with arch seating, crates/safe/chest/mystery art,
      parachute drops, golden box glow, aim line to your selection, raid beams in the reveal, spotlight + caption per result,
      endgame alarm lights + red felt + siren, vault-door splash intro, falling-cash home background, trophy/winner spotlight/awards results
- [x] Audio: procedural heist music (menu / game / endgame intensity), new SFX (siren, event, pop, vault)
- [x] UX: first-game interactive tutorial (pauses the solo clock), tap labels, long-press/right-click player stats sheet,
      settings sheet (sound, music, vibration, fast animations, replay tutorial, leave), round log sheet + "this round" recap
- [x] Multiplayer: emotes, spectators, timer choice, QR code in lobby, share link
- [x] Tech: PNG icons, /stats counters, server warm-up ping, SW cache v2
- Verified in headless Chrome: full solo games at 390×844 (5 bots) and 360×640 (5 bots), online room with host + guest (360×640) + late spectator (1280×800 desktop), emotes, QR, /stats. Zero console errors.

**Session 3 (2026-10-31): new arena layout from the owner's sketch, verified.**
- [x] Seats (no cards): character avatar on a glowing ledge in seat colour, name ribbon, hearts, habit line;
      outer edge has a **loot crate** (unsecured; coin pile grows: empty → few → pile → full → bills) and a **bank safe** (secured).
- [x] Me = bottom-left seat (bigger, YOU tag); my safe is the SECURE button (pulses when tappable, JAMMED in final).
      Others clockwise: up the left side, then right side top→bottom. 4p = 2+2, 5p = 3+2, 6p = 3+3.
- [x] Boxes stacked vertically in a gold-rimmed centre "runway" (tints red in endgame).
- [x] Coins fly box → crate, crate → own safe (secure), victim crate → raider crate, blocked raider crate → defender safe.
- [x] Character reactions: cheer (jump) on gains, hurt (red flash + shake) on losses; idle bob.
- Verified: 6p @390×844, 4p @360×640 (tutorial, final round), online host+guest+desktop spectator, emotes. Zero console errors.

**Session 4 (2026-10-31): UI polish pack (owner picked ideas 2-6; skipped festival theme and landscape mode).**
- [x] Reactions: winner dance on results, 💧 sweat on players with a big unsecured pile, 💢 anger mark on a blocked raider.
- [x] Danger meter: crates at level ≥3 wobble + glow red (`.seat.tempting`, faster at level 4 `.overflow`).
- [x] Unlockable looks (Locker screen): accessories none/shades/partyhat/tophat/chain/halo, crate skins wood/neon/gold/diamond.
      Unlock rules live in `CONFIG.COSMETICS`; progress `vr_profile {games,wins,acc,crate}` is stored on the phone and updated
      when a game ends. Looks are sent as `look {acc,crate}` on create/join, validated by the room, and shown to everyone.
- [x] Comic-book bursts (`FX.comic`): LOCKED!, BLOCKED!, STOLEN!/BOUNTY!/EMPTY!, KA-CHING!/SPLIT!/JACKPOT!, BUSTED!
- [x] Slow-motion final reveal: Final Heist resolution lasts ~1.8x (room.js), a drumroll before each result, dark vignette.
- Verified: locker, comics, danger crates, final slow-mo, results dance + unlock toast; 11 tests pass; zero console errors.

**Session 5 (2026-10-31): music picker.**
- [x] Settings → Music: 🎭 Bella Ciao heist remix (**default**), 🎬 Hall of the Mountain King (speeds up each loop), 🎹 Classic Vault Rush (the old music),
      🎧 My songs, 🔇 Off, plus a volume slider (default 40%, quieter than before). Sound effects unchanged and on their own toggle.
- Only public-domain melodies are synthesized in code (`Music` in js/audio.js); **no music files ship with the game**.
- **My songs**: the player adds audio files from their own phone; stored in IndexedDB (`vr_music`), played via `<audio>`, shuffle all or pick one.
  Never uploaded. The owner wanted On & On, Sia (Cheap Thrills/Snowman/The Greatest) and Dance Monkey: those are copyrighted, so
  **never commit them to the repo**; each player adds their own copies through My songs.
- Settings keys: `musicTrack` (bella|mountain|classic|mine|off), `musicVol` (0-100), `mySong` ('all' or the song id to play first), `shuffle` (default true; My songs order: shuffled or order added).
- **On & On (Cartoon ft. Daniel Levi, NCS) is NOT free for games.** ncs.io/usage-policy: free only for creators' videos; games need NCS's
  commercial licensing form. The owner may apply; only bundle it as the default if they confirm NCS gave permission.

## Ideas / next steps (not done)
- Owner declined for now: festival/Diwali theme, landscape/tablet layout.
- Real-device testing (low-end Android, iPhone Safari) — not possible from this PC.
- Apply the owner's UI brief when it arrives.
- Possible: power-ups / decoy boxes (idea.md §35), persistent stats, ranked mode.
- The room is kept in memory; a Render restart ends running games (acceptable for free tier).

## Session log
- **2026-10-31 (S1)**: Built the whole MVP from idea.md. Owner will push to GitHub from another PC/account and deploy on Render; I must not push.
- **2026-10-31 (S5c)**: Default music is now a REAL "Bella ciao" recording: `public/music/bella-ciao-serbian-guards.ogg` (original from
  Wikimedia Commons, by Tinkes, CC BY-SA 4.0, verified on the file page) + `.m4a` (converted in headless Chrome for iPhone). Credit shown in
  Settings, README and `public/music/CREDITS.txt`; **keep the attribution**. The synth Bella arrangement is only a fallback if the file can't play.
  The SW skips `/music/` (range requests). Endgame plays the recording at 1.07x.
- **2026-10-31 (S5b)**: Shuffle toggle (on by default) for My songs. Checked NCS policy: On & On needs a licence for games, not bundled.
- **2026-10-31 (S5)**: Music picker + "My songs" (local files) + volume. Copyrighted songs are not bundled (public repo/site).
- **2026-10-31 (S4)**: Owner chose UI ideas 2-6 (reactions, danger meter, unlockables, comic pop-ups, slow-mo final). All done.
- **2026-10-31 (S3)**: Owner sent a UI sketch (sides + centre boxes + growing storage crates, no cards). Rebuilt the arena to match; added bank safe per player.
- **2026-10-31 (S2)**: Owner asked for "all the updates" from my improvement list (gameplay + visual). Implemented everything listed in Status → Session 2.
