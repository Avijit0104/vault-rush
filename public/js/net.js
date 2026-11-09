/* Vault Rush — connections. Same interface for online (Socket.IO) and solo (in-browser room). */

// window.io comes from js/wsio.js (a small WebSocket stand-in for the Socket.IO client).
class OnlineConn {
  constructor() {
    this.handlers = {};
    this.mode = 'online';
    this.socket = window.io();
    ['state', 'tick', 'joined', 'emote', 'errorMsg', 'kicked', 'rejoinFailed', 'connect', 'disconnect', 'connect_error']
      .forEach((ev) => this.socket.on(ev, (d) => this.emit(ev, d)));
  }
  on(type, fn) { this.handlers[type] = fn; }
  emit(type, d) { if (this.handlers[type]) this.handlers[type](d); }
  send(type, d) { this.socket.emit(type, d); }
  close() { this.socket.emit('leave'); this.socket.disconnect(); }
  // drop a connection that looks open but has stopped delivering, and open a fresh one (the app then rejoins)
  restart() { this.socket.disconnect(); this.socket.connect(); }
}

class LocalConn {
  constructor() {
    this.handlers = {};
    this.mode = 'solo';
    this.room = new VR_ROOM.GameRoom({ code: 'SOLO', send: (_pid, type, d) => this.emit(type, d) });
    this.id = null;
  }
  on(type, fn) { this.handlers[type] = fn; }
  emit(type, d) { if (this.handlers[type]) setTimeout(() => this.handlers[type](d), 0); }
  send(type, d) {
    const r = this.room;
    switch (type) {
      case 'create': {
        const { player } = r.addHuman(d);
        this.id = player.id;
        this.emit('joined', { code: 'SOLO', playerId: player.id });
        break;
      }
      case 'settings': r.cmdSettings(this.id, d); break;
      case 'addBot': r.cmdAddBot(this.id); break;
      case 'start': r.start(this.id); break;
      case 'action': r.setAction(this.id, d); break;
      case 'lockIn': r.lockIn(this.id); break;
      case 'playAgain': r.playAgain(this.id); break;
      case 'emote': r.cmdEmote(this.id, d); break;
      case 'pause': r.cmdPause(this.id, d); break;
    }
  }
  close() { this.room.destroy(); }
}
