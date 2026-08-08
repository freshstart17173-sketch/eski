/* eski service worker.
   HTML is network-first so a deploy lands immediately (no hard-reload needed);
   other assets are cache-first with a background refresh. */
const CACHE = 'eski-v16';

/* WHERE PUBLISHED PAGES AND AUDIO COME FROM.

   MUST MATCH R2_BASE IN platform.js. A service worker cannot import a module,
   so this is the one value in the codebase that genuinely lives in two files —
   and a media host that disagrees with the app's is invisible: nothing breaks,
   the cache simply never hits and every page is downloaded again forever.
   tests/structure.js asserts the two are identical, which is what makes the
   duplication safe rather than a trap.

   Change both together when the bucket moves to a custom domain. */
const MEDIA = 'https://pub-b9e7c6b680ca415e9ffd5875bad0df03.r2.dev/';

/* A SEPARATE, VERSIONLESS CACHE, and this is the important part. `activate`
   deletes every cache whose name is not CACHE, so putting comics in there
   would throw away somebody's whole offline library on every single deploy.
   Media is content-addressed and cannot go stale, so it has nothing to gain
   from a version in its name and everything to lose. */
const MEDIA_CACHE = 'eski-media';
/* Cache Storage is not free, and a comic is 40-90 objects. This is roughly a
   dozen comics. FIFO by insertion, because the API gives no timestamps and
   cache.keys() is insertion-ordered — cruder than least-recently-used, and the
   right trade for a ceiling nobody should notice. */
const MEDIA_MAX = 900;
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
      // MEDIA_CACHE survives a deploy on purpose — see its definition
      Promise.all(keys.filter(k => k !== CACHE && k !== MEDIA_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  /* PUBLISHED MEDIA, kept forever and never revalidated.

     Pages and audio are the biggest, slowest, most re-read things on the site,
     and until now the cache refused exactly them. Keys are content-addressed —
     a key is a hash of the bytes, so it can never point at different bytes —
     which is what makes "cache-first, no background refresh" correct rather
     than merely convenient. Re-reading a comic becomes instant, and works on a
     train.

     Handled before the cacheable test below because it wants a different
     cache, a different strategy and a ceiling. */
  if (url.href.startsWith(MEDIA)) { e.respondWith(media(e.request)); return; }

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

/* One published object. Cache-first with no revalidation, then trimmed.

   NO ignoreSearch. Presigned GETs carry a signature in the query string and a
   plain public read does not, so two requests for the same object can differ
   only there — matching loosely would serve one for the other, and an expired
   signature cached under a bare key would be worse than no cache at all. */
async function media(request){
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const res = await fetch(request);
  /* only 200. A 206 partial (audio seeking asks for ranges) must never be
     stored whole: it would be served back as if it were the entire file. */
  if (res && res.status === 200){
    cache.put(request, res.clone()).then(trim).catch(() => {});
  }
  return res;
}

/* FIFO, and only when it is actually over. Runs after the put resolves rather
   than on a timer, so the ceiling is checked exactly as often as it can move. */
async function trim(){
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MEDIA_MAX) return;
  // 10% below the line at a time: trimming exactly one per put would leave the
  // cache permanently at the ceiling and run this scan on every single object
  const over = keys.length - MEDIA_MAX + Math.ceil(MEDIA_MAX * 0.1);
  await Promise.all(keys.slice(0, over).map(k => cache.delete(k)));
}
