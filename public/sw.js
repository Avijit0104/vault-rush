/* Vault Rush service worker — network-first, falls back to cache so solo mode works offline. */
const CACHE = 'vault-rush-v10';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest',
  'shared/config.js', 'shared/engine.js', 'shared/room.js',
  'js/audio.js', 'js/art.js', 'js/wsio.js', 'js/net.js', 'js/anim.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // music is streamed with range requests: let the browser handle it directly
  if (e.request.method !== 'GET' || url.pathname === '/ws' || url.pathname === '/healthz' || url.pathname === '/stats' || url.pathname.includes('/music/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
