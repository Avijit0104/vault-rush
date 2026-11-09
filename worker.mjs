// Vault Rush on Cloudflare (free plan). The Worker serves public/ as static files and sends /ws and /stats
// to one Durable Object that runs every online room in memory, exactly like server/server.js on Node
// (same server/hub.js, same unchanged GameRoom).
//
// Unlike Chor Police Dakat Babu and RSJM, rooms are NOT saved to storage: a GameRoom runs on live timers
// (intro, 1 s ticks, bot decisions, the reveal), so a deploy or restart ends the games in progress, as on
// Render. The object stays awake while anyone is connected (no hibernation). Even awake 24 hours a day it
// uses ~11,000 of the free 13,000 GB-s/day, and rooms idle for 15 minutes in the lobby or on the results
// screen are closed so a forgotten tab doesn't keep it awake.
import { DurableObject } from 'cloudflare:workers';
import hubModule from './server/hub.js';
import qrcodeSource from './node_modules/qrcode-generator/dist/qrcode.js'; // bundled as text (see "rules" in wrangler.jsonc)

const { createHub } = hubModule;
const MAX_MESSAGE = 16 * 1024;
const IDLE_CLOSE_MS = 15 * 60 * 1000;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    // answered here so a health check never wakes the game server
    if (pathname === '/healthz') return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (pathname === '/vendor/qrcode.js') {
      return new Response(qrcodeSource, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
    }
    if (pathname.startsWith('/music/')) return music(request, env);
    if (pathname === '/ws' || pathname === '/stats') {
      if (pathname === '/ws' && request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      // One object runs every room. It's created near the first player (asia-pacific hint) and stays there.
      return env.GAME.get(env.GAME.idFromName('vault-rush'), { locationHint: 'apac' }).fetch(request);
    }
    return new Response('Not found', { status: 404 }); // files in public/ are served before this runs
  },
};

// Music files with byte-range support: phones stream audio in pieces, and iPhone Safari won't play it
// without "206 Partial Content" answers.
async function music(request, env) {
  const file = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
  if (!file.ok) return file;
  const headers = new Headers(file.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (!range || request.method === 'HEAD') return new Response(request.method === 'HEAD' ? null : file.body, { status: 200, headers });
  const body = await file.arrayBuffer();
  const size = body.byteLength;
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (!(start >= 0 && start <= end && start < size)) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

export class Game extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hub = createHub({ idleCloseMs: IDLE_CLOSE_MS });
  }

  async fetch(request) {
    if (new URL(request.url).pathname === '/stats') {
      return Response.json({ ...this.hub.stats(), host: 'cloudflare' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const socket = {
      data: {},
      emit: (type, payload) => { try { server.send(JSON.stringify({ t: type, d: payload })); } catch { /* closing */ } },
      disconnect: () => { try { server.close(1000, 'Replaced'); } catch {} },
    };
    this.hub.connection(socket);
    server.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.length > MAX_MESSAGE) return;
      if (e.data === 'ping') { try { server.send('pong'); } catch {} return; }
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg && typeof msg.t === 'string') this.hub.message(socket, msg.t, msg.d);
    });
    let closed = false;
    const onClose = () => { if (!closed) { closed = true; this.hub.closed(socket); } };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    return new Response(null, { status: 101, webSocket: client });
  }
}
