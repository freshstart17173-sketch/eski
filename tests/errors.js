/* the ESK-#### codes are only worth anything if they actually reach a person.
   this proves two halves that smoke.js deliberately does not touch:

   1. the signer's refusals, called straight as a function with no network
   2. the boot path with vendor/supabase.js missing, in a real browser

   and, third, the healthy case: no page may claim a service is unreachable
   when it is fine. that regression is exactly what the module-ordering bug
   caused (platform.js is a module, so window.eski does not exist while a
   classic script is still parsing), and it is why the profile page reported
   "could not reach the server" on a working site.

   the table of codes is ERRORS.txt. keep the two in step. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const JSZIP = require.resolve('jszip/dist/jszip.min.js');
let bad = 0;
const ok = (cond, what, extra = '') => {
  console.log((cond ? '  ok  ' : '  FAIL  ') + what + (cond ? '' : '  << ' + extra));
  if (!cond) bad++;
};

(async () => {
  /* ---------- 1. the signer ---------- */
  console.log('signer: every refusal names itself');
  const fakeRes = () => {
    const r = { code: 0, body: null };
    r.status = c => { r.code = c; return r; };
    r.json = b => { r.body = b; return r; };
    return r;
  };
  const { default: handler } = await import('file:///' +
    path.join(ROOT, 'api/sign.mjs').replace(/\\/g, '/'));

  const ENV = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  for (const k of ENV) delete process.env[k];

  const call = async (req) => { const r = fakeRes(); await handler(req, r); return r; };

  let r = await call({ method: 'GET', headers: {} });
  ok(r.code === 405 && r.body.code === 'ESK-3002', 'a GET is ESK-3002', JSON.stringify(r.body));

  r = await call({ method: 'POST', headers: {}, body: {} });
  ok(r.code === 500 && r.body.code === 'ESK-3001' && /SUPABASE_URL/.test(r.body.error),
    'missing env vars are ESK-3001, and are named', JSON.stringify(r.body));

  Object.assign(process.env, {
    SUPABASE_URL: 'not-a-url', SUPABASE_PUBLISHABLE_KEY: 'k', R2_ACCOUNT_ID: 'a',
    R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd'
  });
  r = await call({ method: 'POST', headers: {}, body: {} });
  ok(r.body.code === 'ESK-3012', 'a SUPABASE_URL that is not a url is ESK-3012', JSON.stringify(r.body));

  // a url that parses but resolves nowhere. no token yet, so the token check wins
  process.env.SUPABASE_URL = 'https://zzzznotarealproject.supabase.co';
  r = await call({ method: 'POST', headers: {}, body: {} });
  ok(r.code === 401 && r.body.code === 'ESK-3003', 'no bearer token is ESK-3003', JSON.stringify(r.body));

  r = await call({ method: 'POST', headers: { authorization: 'Bearer x' }, body: {} });
  ok(r.body.code === 'ESK-3010', 'an unreachable supabase is ESK-3010, not a crash', JSON.stringify(r.body));

  /* ---------- a plain static server for the pages ---------- */
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, p === '/' ? 'index.html' : p.slice(1));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  }).listen(8932);

  const browser = await chromium.launch();
  const stub = async ctx => {
    await ctx.route('https://cdnjs.cloudflare.com/**', route =>
      route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(JSZIP) }));
    await ctx.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 404, body: '' }));
    await ctx.route('https://*.supabase.co/**', route => {
      const u = route.request().url();
      if (u.includes('/auth/v1/')) return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  };
  const text = async (page, sel) => (await page.textContent(sel)) || '';

  /* ---------- 2. boot, with the vendored client missing ---------- */
  console.log('boot: a missing client is named, not swallowed');
  const down = await browser.newContext({ serviceWorkers: 'block' });
  await stub(down);
  await down.route('**/vendor/supabase.js', route => route.fulfill({ status: 404, body: 'nope' }));

  const home = await down.newPage();
  await home.goto('http://localhost:8932/index.html');
  await home.waitForTimeout(1500);
  ok(/^ESK-1001/.test(await home.evaluate(() => (window.eski || {}).bootError) || ''),
    'a missing vendor/supabase.js boots as ESK-1001');
  ok(/ESK-1001/.test(await text(home, '#grid')), 'home prints the code in its empty state');

  const reader = await down.newPage();
  await reader.goto('http://localhost:8932/read.html?read=db:123');
  await reader.waitForTimeout(1500);
  ok(/ESK-100[15]/.test(await text(reader, 'body')), 'the reader names the code too');

  const prof = await down.newPage();
  await prof.goto('http://localhost:8932/profile.html');
  await prof.waitForTimeout(1500);
  ok(/ESK-1001/.test(await text(prof, '#page')), 'the profile names the code too');

  /* ---------- 3. the healthy path ---------- */
  console.log('boot: a working client is never reported as broken');
  const up = await browser.newContext({ serviceWorkers: 'block' });
  await stub(up);

  const prof2 = await up.newPage();
  await prof2.goto('http://localhost:8932/profile.html');
  await prof2.waitForTimeout(1200);
  const good = await text(prof2, '#page');
  ok(!/could not reach the server/i.test(good),
    'profile does not claim the server is unreachable when it is fine', good.slice(0, 160));
  ok(/sign in to see your profile/i.test(good),
    'profile shows the signed-out state instead', good.slice(0, 160));

  const home2 = await up.newPage();
  await home2.goto('http://localhost:8932/index.html');
  await home2.waitForTimeout(1200);
  ok(!/could not reach the shelf/i.test(await text(home2, '#grid')),
    'home does not claim the shelf is unreachable when it is fine');

  await browser.close();
  server.close();
  console.log(bad ? `\n${bad} FAILED` : '\nall error-code checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e); process.exit(2); });
