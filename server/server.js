/* Vault Rush — Node server. Serves the client and hosts online rooms over plain WebSockets at /ws.
 * The server is authoritative: clients only send intended actions. The room logic lives in
 * server/hub.js, shared with the Cloudflare version (worker.mjs). */
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { createHub } = require('./hub.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const hub = createHub();

app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  // The 2 MB music files never change (rename them if replaced): let phones and Cloudflare keep them
  // instead of re-downloading from the free server every time the track loops.
  setHeaders: (res, file) => {
    if (/[\\/](music|icons)[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  },
}));
app.get('/vendor/qrcode.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'node_modules', 'qrcode-generator', 'dist', 'qrcode.js')));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: hub.roomCount() }));

// Server load, so you can see how hard the free instance is working: CPU % of one core over the last minute + memory.
let cpuMark = { t: Date.now(), u: process.cpuUsage() }, cpuPercent = 0;
setInterval(() => {
  const now = Date.now(), u = process.cpuUsage(cpuMark.u);
  cpuPercent = +((100 * (u.user + u.system) / 1000) / (now - cpuMark.t)).toFixed(2);
  cpuMark = { t: now, u: process.cpuUsage() };
}, 60000).unref();
app.get('/stats', (_req, res) => res.json({ ...hub.stats(), cpuPercentLastMinute: cpuPercent, memoryMB: Math.round(process.memoryUsage().rss / 1e6) }));

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  const socket = {
    data: {},
    emit: (type, payload) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: type, d: payload })); },
    disconnect: () => ws.close(),
  };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  hub.connection(socket);
  ws.on('message', (data) => {
    const text = String(data);
    if (text === 'ping') return ws.send('pong'); // keep-alive from public/js/wsio.js
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg && typeof msg.t === 'string') hub.message(socket, msg.t, msg.d);
  });
  ws.on('close', () => hub.closed(socket));
});

// A silently dead phone connection is noticed within 10–20 s (it misses a ping round).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000).unref();

server.listen(PORT, () => {
  console.log(`Vault Rush running on http://localhost:${PORT}  (players ${hub.CONFIG.MIN_PLAYERS}-${hub.CONFIG.MAX_PLAYERS})`);
});
