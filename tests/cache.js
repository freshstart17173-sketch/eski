/* Does every asset the site loads actually get a caching policy?

   vercel.json is configuration, which means it fails silently: a rule with a
   typo in the path does not error, it just never matches, and the file it was
   meant to cover is served with no Cache-Control at all. Nobody notices,
   because the site still works — it is only slower.

   The failure this is really guarding against is growth. `loudness.js` was
   added this week and would have been served uncached forever, because the
   rule naming the app's scripts lists them one by one. So rather than
   checking the config against itself, this walks the HTML for every
   same-origin asset it actually references and asserts each one is covered.

   It cannot check what Vercel really sends — that needs a deploy — so it
   checks the thing that goes wrong far more often: an asset nobody added to
   the list. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let bad = 0;
const ok = (cond, what, extra = '') => {
  console.log((cond ? '  ok  ' : '  FAIL  ') + what + (cond ? '' : '  << ' + extra));
  if (!cond) bad++;
};

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

console.log('vercel.json is shaped like vercel expects');
ok(Array.isArray(cfg.headers) && cfg.headers.length > 0, 'it has a headers array');
ok(cfg.headers.every(h => typeof h.source === 'string' && Array.isArray(h.headers)),
  'every rule has a source and a headers list');
ok(cfg.headers.every(h => h.headers.every(k => k.key && k.value)),
  'every header has a key and a value');

/* Vercel sources are path-to-regexp; the subset used here is `(.*)` and
   `(a|b|c)` alternation. Translating just that subset is enough, but it has
   to be done by SPLITTING ON THE GROUPS FIRST — escaping the whole string and
   then trying to un-escape the wildcards turns `(.*)` into `(\.*)`, which
   matches a run of literal dots and nothing else. Every rule then silently
   matched nothing, which is exactly the class of failure this file exists to
   catch, so it is fitting that it happened here first. */
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function toRe(source) {
  let out = '', i = 0;
  for (const m of source.matchAll(/\(([^)]*)\)/g)) {
    out += esc(source.slice(i, m.index));
    out += m[1] === '.*' ? '.*' : '(?:' + m[1].split('|').map(esc).join('|') + ')';
    i = m.index + m[0].length;
  }
  out += esc(source.slice(i));
  return new RegExp('^' + out + '$');
}
const RULES = cfg.headers.map(h => ({ source: h.source, re: toRe(h.source),
  cc: (h.headers.find(k => k.key.toLowerCase() === 'cache-control') || {}).value || '' }));

const policyFor = p => (RULES.find(r => r.re.test(p)) || {}).cc || null;

console.log('every asset the pages load is covered');
/* pull same-origin src/href out of the shipped html */
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const assets = new Set();
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(u)) continue;   // not ours to cache
    const clean = u.split(/[?#]/)[0];
    if (!clean || clean.endsWith('/')) continue;
    if (!fs.existsSync(path.join(ROOT, clean))) continue;      // a route, not a file
    assets.add('/' + clean.replace(/^\.?\//, ''));
  }
}
ok(assets.size > 5, 'found the referenced assets', String(assets.size));

const uncovered = [...assets].filter(a => !a.endsWith('.html') && !policyFor(a));
ok(uncovered.length === 0,
  'no referenced asset is served without a Cache-Control',
  uncovered.join(', '));

console.log('the policies are the right way round');
/* THE ONE THAT MATTERS: html must revalidate, or a deploy does not land and
   people keep running last week's javascript against this week's database. */
for (const page of PAGES) {
  const cc = policyFor('/' + page);
  ok(cc !== null && /max-age=0|no-cache|no-store/.test(cc),
    `${page} revalidates rather than being held`, String(cc));
}
/* and vendored files, which are pinned versions, are immutable — the point of
   vendoring is that they do not change under you */
const vendored = [...assets].filter(a => a.startsWith('/vendor/'));
ok(vendored.length > 0, 'the pages reference vendored files', String(vendored.length));
ok(vendored.every(a => /immutable/.test(policyFor(a) || '')),
  'every vendored file is immutable',
  vendored.filter(a => !/immutable/.test(policyFor(a) || '')).join(', '));

/* an immutable year on something that is edited in place would strand every
   browser that already has it. only /vendor/ earns that, and only because
   re-vendoring is supposed to rename the file. */
const appFiles = [...assets].filter(a => !a.startsWith('/vendor/') && /\.(js|css)$/.test(a));
ok(appFiles.every(a => !/immutable/.test(policyFor(a) || '')),
  'nothing edited in place is marked immutable',
  appFiles.filter(a => /immutable/.test(policyFor(a) || '')).join(', '));
ok(appFiles.every(a => /max-age=\d+/.test(policyFor(a) || '')),
  'every app script and stylesheet has a max-age',
  appFiles.filter(a => !/max-age=\d+/.test(policyFor(a) || '')).join(', '));

/* the service worker precaches a list of its own; anything on it is served by
   vercel too, so it has to be covered by the same rules */
console.log('the service worker precache list is covered too');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const block = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf(']', sw.indexOf('const ASSETS')));
const pre = [...block.matchAll(/'([^']+)'/g)].map(m => m[1])
  .filter(a => a !== './' && !a.startsWith('http'));
const preMissing = pre.filter(a => {
  const p = '/' + a.replace(/^\.?\//, '');
  return fs.existsSync(path.join(ROOT, a)) && !p.endsWith('.html') && !policyFor(p);
});
ok(preMissing.length === 0, 'every precached asset has a policy', preMissing.join(', '));

/* ------------------------------------------------------------------------ */
console.log('the media cache keeps published pages and audio');
/* RUN AS CODE, NOT READ AS TEXT. The rules here are decisions — only a 200 is
   stored, the query string is part of the key, the ceiling actually evicts —
   and a grep for the right words would pass on a version that does none of
   them. sw.js is loaded into a vm with a fake Cache API instead, which is
   enough to call media() and trim() for real.

   Why not a browser: registering a real service worker needs a live origin and
   an activation dance, and every assertion below is about logic that has
   nothing to do with either.

   Wrapped in an async IIFE because media() is async and the rest of this file
   is a plain script; the report moves inside so it still runs last. */
(async () => {
  const vm = require('vm');

  const makeCaches = () => {
    const stores = new Map();
    return {
      stores,
      open: async name => {
        if (!stores.has(name)) stores.set(name, new Map());
        const m = stores.get(name);
        return {
          // insertion-ordered, which is what trim()'s FIFO relies on
          keys:   async () => [...m.keys()],
          /* ignoreSearch IS IMPLEMENTED, not ignored. A fake that quietly
             accepts the option and behaves the same either way makes the
             assertion about signed urls pass on a version that gets it wrong —
             which is what this one did until the mutation test caught it. */
          match:  async (req, opts) => {
            const url = typeof req === 'string' ? req : req.url;
            if (!opts || !opts.ignoreSearch) return m.get(url);
            const bare = u => u.split('?')[0];
            for (const [k, v] of m) if (bare(k) === bare(url)) return v;
            return undefined;
          },
          put:    async (req, res) => { m.set(typeof req === 'string' ? req : req.url, res); },
          delete: async req => m.delete(typeof req === 'string' ? req : req.url)
        };
      }
    };
  };

  const load = (fakeCaches, fetchImpl) => {
    const ctx = {
      self: { addEventListener(){} },
      caches: fakeCaches,
      fetch: fetchImpl,
      URL, Promise, Math, console
    };
    vm.createContext(ctx);
    vm.runInContext(sw, ctx);
    return ctx;
  };

  const KEY = 'https://cdn.eski.lol/ab/deadbeef.png';
  const res = (status, tag) => ({ status, tag, clone(){ return { status, tag }; } });

  // one fetch, then the cache
  {
    const c = makeCaches();
    let hits = 0;
    const ctx = load(c, async () => { hits++; return res(200, 'net'); });
    const a = await ctx.media({ url: KEY });
    const b = await ctx.media({ url: KEY });
    ok(hits === 1, 'a second read of the same object never reaches the network', 'fetches=' + hits);
    ok(a.status === 200 && b.tag === 'net', 'and gets the same bytes back');
    ok(c.stores.has('eski-media'), 'stored in its own cache, not the versioned one');
    ok(!c.stores.get('eski-v16'), 'the versioned cache is untouched by media');
  }

  // a 206 is a RANGE, not the file. Storing it would serve a fragment as if it
  // were whole, which for audio means a clip that silently plays half.
  {
    const c = makeCaches();
    let hits = 0;
    const ctx = load(c, async () => { hits++; return res(206, 'partial'); });
    await ctx.media({ url: KEY });
    await ctx.media({ url: KEY });
    ok(hits === 2, 'a 206 range response is never stored', 'fetches=' + hits);
  }
  { // nor is an error page
    const c = makeCaches();
    let hits = 0;
    const ctx = load(c, async () => { hits++; return res(404, 'gone'); });
    await ctx.media({ url: KEY });
    await ctx.media({ url: KEY });
    ok(hits === 2, 'and neither is a 404', 'fetches=' + hits);
  }

  // the query string is part of the key: a presigned GET carries a signature
  // that expires, and serving it for a plain public read would be worse than
  // not caching at all
  {
    const c = makeCaches();
    let hits = 0;
    const ctx = load(c, async () => { hits++; return res(200, 'net'); });
    await ctx.media({ url: KEY });
    await ctx.media({ url: KEY + '?X-Amz-Signature=abc' });
    ok(hits === 2, 'a signed url is not served from the unsigned one', 'fetches=' + hits);
  }

  // the ceiling actually evicts, oldest first
  {
    const c = makeCaches();
    const ctx = load(c, async () => res(200, 'net'));
    const max = vm.runInContext('MEDIA_MAX', ctx);
    for (let i = 0; i < max + 5; i++) await ctx.media({ url: KEY + i });
    const left = [...c.stores.get('eski-media').keys()];
    ok(left.length < max, 'the cache is trimmed below the ceiling, not held at it',
      `${left.length} of ${max}`);
    ok(!left.includes(KEY + '0'), 'and the oldest went first');
    ok(left.includes(KEY + (max + 4)), 'while the newest stayed');
  }

  console.log(bad ? `\n${bad} FAILURES` : '\ncache: all checks passed');
  process.exit(bad ? 1 : 0);
})();
