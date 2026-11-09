/* Vault Rush — a tiny stand-in for the Socket.IO client, over a plain WebSocket at /ws, so the game runs
 * on the Node server and on Cloudflare (where Socket.IO can't run). It covers what js/net.js uses:
 *   const socket = io(opts); socket.connected; socket.on(event, fn); socket.emit(type, data);
 *   socket.connect(); socket.disconnect();   events: 'connect', 'disconnect', 'connect_error' + the server's
 * Wire format both ways: {t: type, d: data}. Reconnects by itself (0.5–5 s backoff) and sends "ping"
 * every 20 s so the server knows the phone is still there.
 * Without a network (e.g. opened from the offline cache) window.io stays null: the app then offers solo play only. */
(function () {
  if (!/^https?:$/.test(location.protocol) || navigator.onLine === false) { window.io = null; return; }

  window.io = function io() {
    const handlers = {};
    let ws = null;
    let wanted = true;   // false after disconnect() until connect()
    let retries = 0;
    let retryTimer = null;

    const fire = (event, arg) => (handlers[event] || []).slice().forEach((fn) => fn(arg));
    const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

    function open() {
      clearTimeout(retryTimer);
      if (ws || !wanted) return;
      const sock = new WebSocket(url());
      ws = sock;
      let opened = false;
      sock.onopen = () => { opened = true; retries = 0; socket.connected = true; fire('connect'); };
      sock.onmessage = (e) => {
        if (e.data === 'pong') return;
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (msg && typeof msg.t === 'string') fire(msg.t, msg.d);
      };
      sock.onclose = () => {
        if (ws !== sock) return;
        ws = null;
        const was = socket.connected;
        socket.connected = false;
        if (was) fire('disconnect', wanted ? 'transport close' : 'io client disconnect');
        else if (!opened) fire('connect_error', new Error('could not connect'));
        if (wanted) retryTimer = setTimeout(open, Math.min(500 * 2 ** retries++, 5000));
      };
    }

    const socket = {
      connected: false,
      on(event, fn) { (handlers[event] = handlers[event] || []).push(fn); return socket; },
      emit(type, data) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: type, d: data }));
        return socket;
      },
      connect() { wanted = true; retries = 0; open(); return socket; },
      disconnect() {
        wanted = false;
        clearTimeout(retryTimer);
        if (ws) {
          const s = ws;
          ws = null;
          s.onclose = null; // finished right here, so a connect() straight after opens a fresh socket
          s.close();
        }
        if (socket.connected) { socket.connected = false; fire('disconnect', 'io client disconnect'); }
        return socket;
      },
    };

    setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 20000);
    // back from the background: reconnect straight away instead of waiting for the next retry
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && wanted && !ws) { retries = 0; open(); }
    });

    open();
    return socket;
  };
})();
