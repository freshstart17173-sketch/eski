/* eski service worker.
   HTML is network-first so a deploy lands immediately (no hard-reload needed);
   other assets are cache-first with a background refresh. */
const CACHE = 'eski-v16';
const ASSETS = [
  './',
  'index.html',
  'read.html',
  'author.html',
  'studio.html',
  'profile.html',
  'platform.js',
  'viewer.js',
  'palette.js',
  'palettes.css',
  'comments.js',
  'hash-worker.js',
  'vendor/supabase.js',
  'vendor/panzoom.js',
  'vendor/webm-muxer.js',
  'tokens.css',
  'docs/design/final/broadsheet.css',
  'demo.eski',
  'manifest.json',
  'spec.html',
  'legal.html',
  'eski_logo.png',
  /* NOT PRECACHED, on purpose. jszip is 95 KB and most visits never open a
     zip; platform.js loads it the first time one is actually opened, and
     cache-first below keeps it from then on. Precaching it would put the cost
     back on the first load, which is the whole thing this moved off. */
  // 'vendor/jszip.js'
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
  /* cdnjs is still here for pdf.js, which the studio loads on demand for a PDF
     import. jszip left when it was vendored. */
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
