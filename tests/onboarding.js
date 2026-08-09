/* Picking a username on first sign-in.
 *
 *   node tests/onboarding.js
 *
 * WHY ITS OWN SUITE. smoke.js is signed out from end to end — the supabase
 * origin answers 401 for anything under /auth — and that is load-bearing there:
 * it is what keeps the suite off the real project. This one needs the opposite,
 * a session that looks real, so it stands up its own fake supabase instead of
 * bending smoke's.
 *
 * WHAT IT GUARDS. The old behaviour was silent: sign in with Google and the
 * profile row was inserted from full_name without asking, so @alex-morgan
 * appeared on a public page nobody had chosen. The failure mode if this
 * regresses is exactly that — a row appearing on its own — which no screenshot
 * would catch and nobody would notice until it was somebody's real name.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8947;
const REF = 'zidqagrmxeawpasurpwi';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };

let bad = 0;
function ok(cond, name, extra){
  if(cond) console.log('  ok  ' + name);
  else { bad++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated', role: 'authenticated', email: 'alex@example.com',
  user_metadata: { full_name: 'Alex Morgan', avatar_url: 'https://x/a.png' },
  app_metadata: {}
};

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if(p === '/') p = '/index.html';
    /* home asks for the local library listing on every load. there are no
       comics in this suite and that is fine — but a 404 would be console noise
       the last assertion cannot tell from a real failure, so answer it empty. */
    if(p === '/library/' || p === '/library' || p === '/library/index.json'){
      res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html' });
      res.end(p.endsWith('.json') ? '{"entries":[]}' : '<html><body></body></html>');
      return;
    }
    const f = path.join(ROOT, p.slice(1));
    if(!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });

  /* the fake supabase. `db.profiles` is the whole database, and `inserts` is
     the thing under test: whether anything was written without being asked. */
  const db = { profiles: [] };
  const inserts = [];
  let handleLookups = 0;

  /* served rather than 404'd, so the only console errors left are ours. a 404
     here would be four lines of noise the last assertion cannot tell from a
     real failure. */
  await ctx.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({
    contentType: 'text/javascript',
    body: r.request().url().includes('jszip')
      ? fs.readFileSync(require.resolve('jszip/dist/jszip.min.js')) : '' }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
  await ctx.route('https://fonts.gstatic.com/**', r => r.fulfill({ contentType:'font/woff2', body:'' }));
  await ctx.route(`https://${REF}.supabase.co/**`, route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status) => route.fulfill({
      status: status || 200, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin':'*' } });

    if(url.pathname.startsWith('/auth/v1/user')) return json(USER);
    if(url.pathname.startsWith('/auth/v1/logout')) return json({});
    if(url.pathname.startsWith('/auth/v1/')) return json({});

    if(url.pathname === '/rest/v1/profiles'){
      if(req.method() === 'POST'){
        const row = JSON.parse(req.postData() || '{}');
        const one = Array.isArray(row) ? row[0] : row;
        inserts.push(one);
        if(db.profiles.some(p => p.handle === one.handle))
          return json({ code:'23505', message:'duplicate key value' }, 409);
        db.profiles.push(one);
        return json([one], 201);
      }
      // GET: the only filters this code uses are id=eq.x and handle=eq.x
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const handle = (url.searchParams.get('handle') || '').replace('eq.', '');
      if(handle) handleLookups++;
      const hit = db.profiles.filter(p =>
        (id ? p.id === id : true) && (handle ? p.handle === handle : true));
      return json(id || handle ? hit : db.profiles);
    }
    if(url.pathname === '/rest/v1/user_prefs') return json([]);
    return json([]);
  });

  // a session that looks real enough for supabase-js to hand out a user
  await ctx.addInitScript(([ref, user]) => {
    localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now()/1000) + 3600, user
    }));
  }, [REF, USER]);

  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });

  console.log('a new account is asked for a username');
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector('.oz-scrim', { timeout: 10000 });
  ok(true, 'the sheet appears on whatever page you signed in on');
  ok(inserts.length === 0,
    'and NOTHING has been written yet', JSON.stringify(inserts));

  const seeded = await page.inputValue('#oz-h-in');
  ok(seeded === 'alex-morgan',
    'the name from google is offered as a suggestion', seeded);
  /* THE WHOLE POINT. It is in an input, not in the database. If this ever
     reads as an insert again, the bug is back. */
  ok(await page.evaluate(() => document.activeElement.id === 'oz-h-in'),
    'and the field is focused, so typing over it is the fastest path');
  /* home's "How eski works" tour is shown once EVER. Opening it under a sheet
     nobody can dismiss does not just look wrong — it spends the one showing. */
  ok(await page.evaluate(() => !document.getElementById('ob').classList.contains('open')),
    'home\'s tour does not open underneath it');
  ok(await page.evaluate(() => !localStorage.getItem('eski-onboarded')),
    'and has not spent its one showing');

  console.log('what it refuses');
  await page.fill('#oz-h-in', 'A');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('oz-go').disabled),
    'too short, and continue stays disabled');
  ok(await page.evaluate(() => document.getElementById('oz-say').classList.contains('bad')),
    'and it says why rather than just refusing');

  await page.fill('#oz-h-in', 'Alex Morgan!');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('oz-go').disabled),
    'spaces and punctuation are refused');

  console.log('handles nobody may take');
  /* Impersonation is the cheapest attack on a site whose currency is
     attribution, and these are permanent once claimed. */
  for(const [h, why] of [['admin','the obvious one'],
                         ['support','the one that phishes'],
                         ['eski','us'],
                         ['ad-min','separators do not evade it'],
                         ['studio','a route the site answers on']]){
    await page.fill('#oz-h-in', h);
    await page.waitForTimeout(320);
    const said = await page.evaluate(() => document.getElementById('oz-say').textContent);
    const off  = await page.evaluate(() => document.getElementById('oz-go').disabled);
    ok(off && /reserved/i.test(said), `@${h} is refused — ${why}`, said);
  }
  /* AND IT COSTS NO ROUND TRIP. A reserved handle can never become free, so
     asking the server about one is waste on every keystroke. Counted, because
     'it feels instant' is not an assertion. */
  const spent = handleLookups;
  await page.fill('#oz-h-in', 'moderator');
  await page.waitForTimeout(400);
  ok(handleLookups === spent, 'and refusing one costs no server round trip',
    `${handleLookups - spent} lookups`);

  console.log('a handle that is taken');
  db.profiles.push({ id:'other', handle:'taken' });
  await page.fill('#oz-h-in', 'taken');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.getElementById('oz-say').textContent.includes('taken')),
    'says so before you press anything');
  ok(await page.evaluate(() => document.getElementById('oz-go').disabled),
    'and will not let you try');

  console.log('picking one');
  await page.fill('#oz-h-in', 'kite');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !document.getElementById('oz-go').disabled),
    'a free handle enables continue');
  await page.click('#oz-go');
  await page.waitForSelector('.oz-scrim', { state: 'detached', timeout: 8000 });
  ok(inserts.length === 1 && inserts[0].handle === 'kite',
    'exactly one row, with the handle they typed', JSON.stringify(inserts));
  ok(inserts[0].display_name === 'Alex Morgan',
    'their real name is kept as the display name, which is theirs to change');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('ob').classList.contains('open')),
    'and the tour gets its turn once the sheet is gone');

  console.log('and never again');
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page2.goto(`http://localhost:${PORT}/index.html`);
  await page2.waitForTimeout(2500);
  ok(await page2.evaluate(() => !document.querySelector('.oz-scrim')),
    'an account that already has a profile is not asked again');
  ok(inserts.length === 1, 'and nothing more is written', String(inserts.length));

  console.log('profile.html does not invent one');
  /* the row is deleted underneath it: the page must say so, not silently
     create an address from the google name the way it used to. */
  db.profiles = db.profiles.filter(p => p.handle !== 'kite');
  const p3 = await ctx.newPage();
  p3.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p3.goto(`http://localhost:${PORT}/profile.html`);
  await p3.waitForTimeout(2500);
  const wrote = inserts.filter(i => i.handle !== 'kite');
  ok(wrote.length === 0, 'no handle was generated', JSON.stringify(wrote));
  await p3.close();

  /* ---------------------------------------------------------------------- */
  console.log('a deleted account');
  /* THE TOMBSTONE SCREEN. A deleted account keeps its row and its handle, so
     /u/<handle> still resolves — and rendering the normal profile with a blank
     name and four zeroes would read as a bug rather than as a person leaving. */
  db.profiles.push({ id:'gone-1', handle:'ghost', display_name:null, bio:null,
                     avatar_url:null, created_at:'2025-03-01',
                     deleted_at:'2026-08-01T10:00:00Z' });
  const gp = await ctx.newPage();
  gp.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await gp.goto(`http://localhost:${PORT}/profile.html?u=ghost`);
  await gp.waitForTimeout(2000);
  const head = await gp.evaluate(() => {
    const h = document.querySelector('h1');
    /* #page, NOT document.body: every page here holds its behaviour in an
       inline <script> at the foot of <body>, and textContent includes script
       source. Reading the body matched the string "Not found" in this page's
       own comment about not saying "Not found". */
    return { h: h ? h.textContent.trim() : '',
             body: document.getElementById('page').textContent };
  });
  ok(head.h === 'Deleted account', 'says the account was deleted', head.h);
  /* NOT "Not found". Whoever followed a byline here needs to know the person
     was real and their work may still be up — "not found" would say the link
     was wrong. */
  ok(!/Not found/.test(head.body), 'and does not claim the link was wrong');
  ok(/@ghost/.test(head.body), 'the handle is still shown, because it is still theirs');
  ok(/still on eski/.test(head.body),
     'and it says their published work survives, which is the surprising part');
  await gp.close();

  /* SIGNING BACK IN MUST NOT WORK. Google will happily mint a new session for
     the same user id after deletion, so without this you would land in a
     working session attached to a tombstone and find every action failing
     silently against the policies. */
  const back = await ctx.newPage();
  back.on('pageerror', e => errors.push('pageerror: ' + e.message));
  db.profiles.push({ id: USER.id, handle:'kite2', deleted_at:'2026-08-01T10:00:00Z' });
  db.profiles = db.profiles.filter(p => !(p.id === USER.id && !p.deleted_at));
  await back.goto(`http://localhost:${PORT}/index.html`);
  await back.waitForSelector('.oz-scrim', { timeout: 10000 });
  const notice = await back.evaluate(() => document.querySelector('.oz h2').textContent);
  ok(/deleted/i.test(notice), 'signing in on a deleted account says so', notice);
  ok(!(await back.evaluate(() => !!document.getElementById('oz-h-in'))),
    'and does not offer to pick a new username on the dead one');
  await back.close();

  console.log('console errors');
  ok(errors.length === 0, 'zero console errors', errors.join(' | '));

  await browser.close();
  server.close();
  console.log(bad ? `\n${bad} FAILURES` : '\nonboarding: all checks passed');
  process.exit(bad ? 1 : 0);
})();
