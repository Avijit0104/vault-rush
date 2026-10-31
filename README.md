# 🔒 Vault Rush

**Grab the cash · Raid your rivals · Lock your vault.**
A fast 4–6 player heist strategy game for phones and desktops. Empty seats are filled with bots.

*Made by Avijit Bose*

---

## Play locally

```bash
npm install
npm start          # → http://localhost:3000
npm test           # rules-engine tests
```

**Friends on the same Wi-Fi:** run `npm start`, find your PC's IP (`ipconfig` → IPv4, e.g. `192.168.1.5`) and have them open `http://192.168.1.5:3000` on their phones. (Allow Node through Windows Firewall when asked.)

---

## Put it online for free (GitHub + Render)

Everything below is free. No credit card is needed.

### 1. Push to GitHub
1. Create a new **empty** repository on github.com (e.g. `vault-rush`). Don't add a README.
2. On the PC that has this folder:
   ```bash
   git init
   git add .
   git commit -m "Vault Rush"
   git branch -M main
   git remote add origin https://github.com/<your-username>/vault-rush.git
   git push -u origin main
   ```
   (`node_modules` is ignored automatically.)

### 2. Deploy on Render
1. Sign up at **render.com** with your GitHub account (free plan).
2. Click **New → Blueprint**, pick the `vault-rush` repo. Render reads `render.yaml` and creates a free web service.
   *Or:* **New → Web Service** → pick the repo → Runtime **Node**, Build `npm install`, Start `npm start`, Instance type **Free**.
3. Wait for the build (~2 min). You get a URL like `https://vault-rush.onrender.com`. Share it with anyone!
4. Every `git push` to `main` redeploys automatically.

### 3. Free-tier notes
- A free Render service **sleeps after 15 minutes without traffic**. The first visit after that takes ~30–60 s to wake up; the game shows a "Waking up the server…" message meanwhile.
- **Optional, to keep it awake:** create a free monitor at **uptimerobot.com** that pings `https://<your-app>.onrender.com/healthz` every 5 minutes. Render's 750 free hours/month cover one service running 24/7.
- Game rooms live in memory. A redeploy or restart ends games in progress (fine for casual play).
- **Play vs Bots runs entirely on the phone**, so once the page has loaded it works offline too.

### 4. Install on a phone
Open the URL in Chrome (Android) or Safari (iPhone) → **Add to Home screen**. It launches full-screen like an app.

---

## How to play
Each round, cash boxes parachute in. You have 15/20/30 s (host's choice) to tap **one** thing:
- 📦 **A box** → claim it (split equally if others pick it too)
- ⚔️ **A rival** → steal 50% of their unsecured cash. If they secured, you're blocked: −1 ❤️ and half your unsecured cash goes to them.
- 🔒 **Your vault** → secure all your unsecured cash (5% fee) and block every raid this round.

👑 The richest player carries a **bounty**: raiding them steals 60%. Random **events** shake things up: Golden Box, High Alert, Blackout, Bonus Drop, Bank Holiday.
The last 3 rounds pay ×1.5 / ×2 / ×3, and in the **Final Heist** vaults are jammed. Most total cash wins.

Long-press any player to see their habits. 😀 sends emotes. 📜 shows the round log.

## Server endpoints
- `/healthz`: health check (Render + UptimeRobot)
- `/stats`: simple built-in counters (rooms created, games started, players online). No third-party tracking.

## Tech
Plain HTML/CSS/JS client · Node + Express + Socket.IO server · no database · all art is hand-made SVG, all sound is synthesized. Game rules live in `public/shared/` and are shared by the server and the browser. All balance numbers are in `public/shared/config.js`.
