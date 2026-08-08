/* Screenshots of every main screen, desktop and phone.

   Also, with --grid, an overlay that makes misalignment visible instead of
   arguable: every element's left and right edge is drawn as a vertical line,
   and edges that ALMOST agree — within 12px of each other but not equal — are
   drawn in red. Those near-misses are what reads as sloppy; a thing either
   lines up with its neighbour or is deliberately somewhere else.

   node tests/shots.js            → shots into docs/design/shots/
   node tests/shots.js --grid     → the same, with the alignment overlay
   BASE=http://localhost:8940 node tests/shots.js   → against a local server */
const { chromium, request } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'https://www.eski.lol';
const GRID = process.argv.includes('--grid');
const OUT = path.join(__dirname, '..', 'docs', 'design', 'shots');
const EMAIL = process.env.ESKI_TEST_EMAIL || 'harness@eski.test';
const PASSWORD = process.env.ESKI_TEST_PASSWORD || 'eski-harness-2026';

/* Draws the edges. Runs in the page. */
const OVERLAY = (tol) => {
  document.getElementById('__align')?.remove();
  const box = document.createElement('div');
  box.id = '__align';
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none';
  const W = innerWidth, H = document.documentElement.scrollHeight;

  // every edge that a person can actually see
  const edges = [];
  for(const el of document.querySelectorAll('body *')){
    if(el.closest('#__align')) continue;
    const s = getComputedStyle(el);
    if(s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if(r.width < 8 || r.height < 6) continue;
    if(r.top > innerHeight || r.bottom < 0) continue;
    edges.push({ x: Math.round(r.left), el }, { x: Math.round(r.right), el });
  }

  // group edges that are close but not equal: those are the near-misses
  const xs = [...new Set(edges.map(e => e.x))].sort((a, b) => a - b);
  const near = new Set();
  for(let i = 0; i < xs.length; i++)
    for(let j = i + 1; j < xs.length && xs[j] - xs[i] <= tol; j++)
      if(xs[j] !== xs[i]){ near.add(xs[i]); near.add(xs[j]); }

  const counts = new Map();
  for(const e of edges) counts.set(e.x, (counts.get(e.x) || 0) + 1);

  for(const x of xs){
    const bad = near.has(x);
    const n = counts.get(x);
    const line = document.createElement('div');
    line.style.cssText = `position:absolute;left:${x}px;top:0;width:1px;height:${H}px;` +
      `background:${bad ? 'rgba(255,0,0,.85)' : 'rgba(0,120,255,' + Math.min(.55, .12 + n * .06) + ')'}`;
    box.appendChild(line);
    if(bad){
      const tag = document.createElement('div');
      tag.textContent = x;
      tag.style.cssText = `position:absolute;left:${x + 1}px;top:2px;font:9px/1 monospace;` +
        `color:#fff;background:rgba(255,0,0,.9);padding:1px 2px`;
      box.appendChild(tag);
    }
  }
  document.body.appendChild(box);
  return { edges: xs.length, misaligned: near.size };
};

const SCREENS = [
  { name: 'home',    path: '/' },
  { name: 'browse',  path: '/#browse' },
  { name: 'comic',   path: '/c/untitled' },
  { name: 'reader',  path: null },           // resolved from the comic page
  { name: 'studio',  path: '/studio.html' },
  { name: 'author',  path: '/author.html' },
  { name: 'profile', path: '/profile.html' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
  const api = PROXY ? await request.newContext({ proxy: { server: PROXY } }) : null;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  const make = async (viewport, extra) => {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', ...extra });
    if(api) await ctx.route('**/*', async route => {
      const q = route.request();
      // a local server needs no proxy, and routing it through one breaks it
      if(q.url().startsWith('http://localhost')) return route.continue();
      /* three attempts with backoff. a phone context opens thirty requests at
         once and the relay drops one often enough that a single retry still
         left a stylesheet failing about one run in three. */
      for(let attempt = 0; attempt < 3; attempt++){
        try{
          const r = await api.fetch(q.url(), { method:q.method(), headers:q.headers(),
            data: q.postDataBuffer() || undefined, maxRedirects: 5, timeout: 60000 });
          const h = r.headers(); delete h['content-encoding']; delete h['content-length'];
          await route.fulfill({ status:r.status(), headers:h, body: await r.body() });
          return;
        }catch(e){
          if(attempt === 2){ await route.abort(); return; }
          await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    });
    await ctx.addInitScript(() => { try{ localStorage.setItem('eski-onboarded','1'); }catch(e){} });
    ctx.setDefaultNavigationTimeout(120000);
    ctx.setDefaultTimeout(60000);
    return ctx;
  };

  const shoot = async (label, viewport, extra) => {
    const ctx = await make(viewport, extra);
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil:'domcontentloaded' });
    await p.waitForSelector('.card', { timeout: 60000 });
    await p.evaluate(async ([e, pw]) => {
      await window.eski.sb.auth.signInWithPassword({ email: e, password: pw });
    }, [EMAIL, PASSWORD]);
    await p.waitForTimeout(2500);

    let readerHref = null;
    for(const s of SCREENS){
      let url = s.path;
      if(s.name === 'reader'){
        if(!readerHref) continue;
        url = readerHref;
      }
      await p.goto(new URL(url, BASE + '/').href, { waitUntil:'domcontentloaded' });
      if(s.name === 'comic'){
        await p.waitForFunction(() => {
          const o = document.getElementById('overlay');
          return !!o && o.classList.contains('open');
        }, null, { timeout: 60000 }).catch(()=>{});
        readerHref = await p.locator('#ov-read').getAttribute('href').catch(()=>null);
      }
      if(s.name === 'reader')
        await p.waitForSelector('#player-bar:not([style*="display:none"])',
          { timeout: 90000 }).catch(()=>{});
      await p.waitForTimeout(3500);

      let stats = null;
      if(GRID) stats = await p.evaluate(OVERLAY, 12).catch(()=>null);
      const file = path.join(OUT, `${s.name}-${label}${GRID ? '-grid' : ''}.png`);
      await p.screenshot({ path: file, fullPage: false });
      console.log(`  ${path.basename(file)}` +
        (stats ? `   ${stats.edges} edges, ${stats.misaligned} near-misses` : ''));
    }
    await ctx.close();
  };

  console.log('desktop 1440x900');
  await shoot('desktop', { width: 1440, height: 900 });
  console.log('phone 390x844');
  await shoot('phone', { width: 390, height: 844 }, {
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
               '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

  await browser.close();
  console.log('\nshots in docs/design/shots/');
})();
