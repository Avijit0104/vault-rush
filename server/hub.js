/* Vault Rush — the online rooms, shared by the Node server (server/server.js) and the Cloudflare
 * version (worker.mjs). It knows nothing about the network: each transport wraps a connection as
 *   { data: {}, emit(type, payload), disconnect() }
 * and calls hub.connection(socket), hub.message(socket, type, payload), hub.closed(socket).
 * The rooms themselves are the unchanged GameRoom from public/shared/room.js. */
const CONFIG = require('../public/shared/config.js');
const { GameRoom } = require('../public/shared/room.js');

function createHub({ idleCloseMs = 0 } = {}) {
  const rooms = new Map();          // code -> GameRoom
  const socketsByPlayer = new Map(); // playerId -> socket

  // Tiny built-in analytics (no third-party tracking): counts since the server started.
  const stats = { startedAt: new Date().toISOString(), roomsCreated: 0, gamesStarted: 0, joins: 0 };

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
    room.lastHumanAt = Date.now();
    rooms.set(code, room);
    stats.roomsCreated++;
    return room;
  }

  function attach(socket, room, player, spectator) {
    // a reconnecting phone: retire its old socket so that socket's late "disconnect" can't mark the player offline
    const old = socketsByPlayer.get(player.id);
    if (old && old !== socket) { old.data.roomCode = null; old.data.playerId = null; old.disconnect(); }
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socketsByPlayer.set(player.id, socket);
    socket.emit('joined', { code: room.code, playerId: player.id, token: player.token, spectator: !!spectator });
    room.broadcast();
  }

  const ctx = (socket) => {
    const room = rooms.get(socket.data.roomCode);
    return room ? { room, id: socket.data.playerId } : null;
  };

  const handlers = {
    create(socket, { name, avatar, look } = {}) {
      const room = createRoom();
      const { player } = room.addHuman({ name, avatar, look });
      attach(socket, room, player);
    },
    join(socket, { code, name, avatar, look } = {}) {
      const room = rooms.get(String(code || '').toUpperCase().trim());
      if (!room) return socket.emit('errorMsg', 'Room not found. Check the code.');
      const r = room.addHuman({ name, avatar, look });
      if (r.error) return socket.emit('errorMsg', r.error);
      stats.joins++;
      attach(socket, room, r.player, r.spectator);
    },
    rejoin(socket, { code, token } = {}) {
      const room = rooms.get(String(code || '').toUpperCase());
      const player = room && room.reconnect(token);
      if (!player) return socket.emit('rejoinFailed');
      attach(socket, room, player, !room.get(player.id));
    },
    leave(socket) {
      const c = ctx(socket); if (!c) return;
      socketsByPlayer.delete(c.id);
      c.room.disconnect(c.id);
      socket.data.roomCode = null;
    },
    settings: (socket, s = {}) => { const c = ctx(socket); if (c) c.room.cmdSettings(c.id, s); },
    addBot: (socket) => { const c = ctx(socket); if (c) c.room.cmdAddBot(c.id); },
    removeBot: (socket, botId) => { const c = ctx(socket); if (c) c.room.cmdRemoveBot(c.id, botId); },
    kick: (socket, pid) => { const c = ctx(socket); if (c) c.room.cmdKick(c.id, pid); },
    start(socket) {
      const c = ctx(socket);
      if (c && c.room.phase === 'LOBBY' && c.id === c.room.hostId) stats.gamesStarted++;
      if (c) c.room.start(c.id);
    },
    emote: (socket, e) => { const c = ctx(socket); if (c) c.room.cmdEmote(c.id, e); },
    action: (socket, a) => { const c = ctx(socket); if (c) c.room.setAction(c.id, a); },
    lockIn: (socket) => { const c = ctx(socket); if (c) c.room.lockIn(c.id); },
    playAgain: (socket) => { const c = ctx(socket); if (c) c.room.playAgain(c.id); },
  };

  // Rooms sitting in the lobby or on the results screen with nobody doing anything get closed, so a
  // forgotten open tab doesn't keep the server busy all day (used on Cloudflare; off on Node).
  if (idleCloseMs > 0) {
    setInterval(() => {
      const now = Date.now();
      for (const room of rooms.values()) {
        if (room.phase !== 'LOBBY' && room.phase !== 'GAMEOVER') continue;
        if (now - room.lastHumanAt < idleCloseMs) continue;
        const ids = [...room.humans(), ...room.spectators].map((p) => p.id);
        for (const id of ids) {
          const s = socketsByPlayer.get(id);
          socketsByPlayer.delete(id);
          if (!s) continue;
          s.data.roomCode = null;
          s.emit('errorMsg', 'The room was closed after 15 minutes without activity.');
          s.emit('rejoinFailed');
        }
        room.destroy();
        rooms.delete(room.code);
      }
    }, 60000);
  }

  return {
    connection() { /* nothing to do until the phone sends create / join / rejoin */ },

    message(socket, type, payload) {
      const fn = Object.prototype.hasOwnProperty.call(handlers, type) && handlers[type];
      if (!fn) return;
      const c = ctx(socket);
      if (c) c.room.lastHumanAt = Date.now();
      try {
        fn(socket, payload);
      } catch (err) {
        console.error(`[${type}]`, err);
      }
    },

    closed(socket) {
      const c = ctx(socket); if (!c) return;
      // Only the player's CURRENT socket counts. An old socket that times out after the phone already
      // rejoined on a new one used to mark the player offline, so the server stopped sending them
      // anything and their game froze.
      if (socketsByPlayer.get(c.id) !== socket) return;
      socketsByPlayer.delete(c.id);
      c.room.disconnect(c.id);
    },

    stats() {
      return {
        ...stats,
        roomsOpen: rooms.size,
        playersOnline: [...rooms.values()].reduce((n, r) => n + r.humans().filter((p) => p.connected).length + r.spectators.length, 0),
      };
    },

    roomCount: () => rooms.size,
    CONFIG,
  };
}

module.exports = { createHub };
