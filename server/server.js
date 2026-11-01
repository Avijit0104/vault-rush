/* Vault Rush — server. Serves the client and hosts online rooms over Socket.IO.
 * The server is authoritative: clients only send intended actions. */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const CONFIG = require('../public/shared/config.js');
const { GameRoom } = require('../public/shared/room.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 25000,      // Increased from 10s for mobile networks (reduces unnecessary pings)
  pingTimeout: 60000,       // Increased from 20s to handle slow networks better
  connectTimeout: 45000,    // Allow more time for initial connection
  transports: ['websocket', 'polling'], // Fallback to polling if WebSocket fails
  allowUpgrades: true,      // Allow upgrading from polling to WebSocket
  perMessageDeflate: false, // Disable compression to reduce CPU load on old phones
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/vendor/qrcode.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'node_modules', 'qrcode-generator', 'dist', 'qrcode.js')));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// Tiny built-in analytics (no third-party tracking): counts since the server started.
const stats = { startedAt: new Date().toISOString(), roomsCreated: 0, gamesStarted: 0, joins: 0 };
app.get('/stats', (_req, res) => res.json({ ...stats, roomsOpen: rooms.size,
  playersOnline: [...rooms.values()].reduce((n, r) => n + r.humans().filter((p) => p.connected).length + r.spectators.length, 0) }));

const rooms = new Map();          // code -> GameRoom
const socketsByPlayer = new Map(); // playerId -> socket

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

function createRoom() {
  const code = newCode();
  const room = new GameRoom({
    code,
    send: (pid, type, data) => { const s = socketsByPlayer.get(pid); if (s) s.emit(type, data); },
    onEmpty: (r) => {
      // give everyone 2 minutes to reconnect before the room is deleted
      r.emptySince = Date.now();
      setTimeout(() => {
        if (r.emptySince && !r.humans().some((p) => p.connected)) { r.destroy(); rooms.delete(r.code); }
      }, 120000);
    },
  });
  rooms.set(code, room);
  stats.roomsCreated++;
  return room;
}

function attach(socket, room, player, spectator) {
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socketsByPlayer.set(player.id, socket);
  socket.join(room.code);
  socket.emit('joined', { code: room.code, playerId: player.id, token: player.token, spectator: !!spectator });
  room.broadcast();
}

io.on('connection', (socket) => {
  const ctx = () => {
    const room = rooms.get(socket.data.roomCode);
    return room ? { room, id: socket.data.playerId } : null;
  };

  socket.on('create', ({ name, avatar, look } = {}) => {
    const room = createRoom();
    const { player } = room.addHuman({ name, avatar, look });
    attach(socket, room, player);
  });

  socket.on('join', ({ code, name, avatar, look } = {}) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return socket.emit('errorMsg', 'Room not found. Check the code.');
    const r = room.addHuman({ name, avatar, look });
    if (r.error) return socket.emit('errorMsg', r.error);
    stats.joins++;
    attach(socket, room, r.player, r.spectator);
  });

  socket.on('rejoin', ({ code, token } = {}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    const player = room && room.reconnect(token);
    if (!player) return socket.emit('rejoinFailed');
    attach(socket, room, player, !room.get(player.id));
  });

  socket.on('leave', () => {
    const c = ctx(); if (!c) return;
    socketsByPlayer.delete(c.id);
    c.room.disconnect(c.id);
    socket.leave(c.room.code);
    socket.data.roomCode = null;
  });

  socket.on('settings', (s = {}) => { const c = ctx(); if (c) c.room.cmdSettings(c.id, s); });
  socket.on('addBot', () => { const c = ctx(); if (c) c.room.cmdAddBot(c.id); });
  socket.on('removeBot', (botId) => { const c = ctx(); if (c) c.room.cmdRemoveBot(c.id, botId); });
  socket.on('kick', (pid) => { const c = ctx(); if (c) c.room.cmdKick(c.id, pid); });
  socket.on('start', () => { const c = ctx(); if (c && c.room.phase === 'LOBBY' && c.id === c.room.hostId) stats.gamesStarted++; if (c) c.room.start(c.id); });
  socket.on('emote', (e) => { const c = ctx(); if (c) c.room.cmdEmote(c.id, e); });
  socket.on('action', (a) => { const c = ctx(); if (c) c.room.setAction(c.id, a); });
  socket.on('lockIn', () => { const c = ctx(); if (c) c.room.lockIn(c.id); });
  socket.on('playAgain', () => { const c = ctx(); if (c) c.room.playAgain(c.id); });

  socket.on('disconnect', () => {
    const c = ctx(); if (!c) return;
    if (socketsByPlayer.get(c.id) === socket) socketsByPlayer.delete(c.id);
    c.room.disconnect(c.id);
  });
});

server.listen(PORT, () => {
  console.log(`Vault Rush running on http://localhost:${PORT}  (players ${CONFIG.MIN_PLAYERS}-${CONFIG.MAX_PLAYERS})`);
});
