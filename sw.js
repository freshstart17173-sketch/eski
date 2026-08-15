/* eski service worker.
   HTML is network-first so a deploy lands immediately (no hard-reload needed);
   other assets are cache-first with a background refresh. */
/* v16: the pivot. the precache list used to name pages and scripts that
   are gone (read/author/studio/comments.js/viewer.js/spec.html) and never
   named pivot.css/pivot.js at all — so a returning visitor could sit on a
   pre-pivot pivot.css indefinitely (cache-first) even after it shipped a
   real fix, which is exactly the "correct fix, silently undone" trap this
   repo keeps warning about. Bumping CACHE forces every asset to refetch
   once; the list below is what the pivot actually loads. */
const CACHE = 'eski-v16';
const ASSETS = [
  './',
  'index.html',
  'profile.html',
  'onboarding.html',
  'admin.html',
  'legal.html',
  'platform.js',
  'palette.js',
  'palettes.css',
  'tokens.css',
  'pivot.css',
  'pivot.js',
  'hash-worker.js',
  'vendor/supabase.js',
  'docs/design/final/broadsheet.css',
  'manifest.json',
  'eski_logo.png'
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
