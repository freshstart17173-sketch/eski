/* eski service worker.
   HTML is network-first so a deploy lands immediately (no hard-reload needed);
   other assets are cache-first with a background refresh. */
const CACHE = 'eski-v9';
const ASSETS = [
  './',
  'index.html',
  'read.html',
  'author.html',
  'studio.html',
  'profile.html',
  'platform.js',
  'viewer.js',
  'hash-worker.js',
  'vendor/supabase.js',
  'tokens.css',
  'docs/design/final/broadsheet.css',
  'demo.eski',
  'manifest.json',
  'spec.html',
  'eski_logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // demo.eski may be missing on some deploys; cache what we can
      Promise.allSettled(ASSETS.map(a => cache.add(a)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  const cacheable = sameOrigin || url.href.startsWith('https://cdnjs.cloudflare.com/');
  if (!cacheable) return;

  const isHTML = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html') ||
    /\.html$/.test(url.pathname);

  if (isHTML) {
    // network-first: always try the freshest page, fall back to cache offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))
      )
    );
    return;
  }

  // assets: cache-first, refresh in the background
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request, { ignoreSearch: sameOrigin }).then(hit => {
        const refresh = fetch(e.request).then(res => {
          if (res && res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || refresh;
      })
    )
  );
});
