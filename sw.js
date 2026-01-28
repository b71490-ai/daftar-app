const CACHE_NAME = 'daftar-app-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Simple caching strategy:
// - Navigation requests: network-first, fallback to cache/offline
// - Static assets: cache-first
// - API requests: network-only (do not cache)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // don't handle non-GET
  if (req.method !== 'GET') return;

  // API calls: try network, otherwise fail (let app handle offline behavior)
  if (url.pathname.startsWith('/api')) {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503, statusText: 'Service Unavailable' })));
    return;
  }

  // Navigation (pages)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(res => {
        // update cache
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('/offline.html')))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      try { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); } catch (e) { }
      return res;
    }).catch(() => {
      // if image or icon requested and not available, return nothing
      return caches.match('/icons/icon-192.png');
    }))
  );
});
