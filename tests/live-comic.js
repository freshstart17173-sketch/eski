/* The comic page and its thread, driven on the deployed site.

   Three things are checked that only production can answer:

     1. /c/<slug> is a real address. It rewrites to api/comic.mjs, which
        injects og: tags a static file could never carry per-comic. A local
        server has no rewrite, so this cannot be checked anywhere else.
     2. Browsing did not get worse. Clicking a card must still open in place,
        push the url, and close on back — no navigation, no flash.
     3. The thread is SHUT until asked for, and posting, replying, editing
        and deleting all really hit the database with RLS on.

   Signs in as the ordinary harness account (tests/live-account.sql). It has
   no powers a signed-up reader lacks, and it cleans up after itself. */
const { chromium, request } = require('playwright');

const BASE = process.env.BASE || 'https://www.eski.lol';
const EMAIL = process.env.ESKI_TEST_EMAIL || 'harness@eski.test';
const PASSWORD = process.env.ESKI_TEST_PASSWORD || 'eski-harness-2026';
const STAMP = 'harness ' + Date.now();

let bad = 0;
const ok = (n, c, extra) => {
  console.log(`  ${c ? 'ok ' : 'FAIL'}  ${n}${extra ? '   ' + extra : ''}`);
  if(!c) bad++;
};

(async () => {
  const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
  const api = PROXY ? await request.newContext({ proxy: { server: PROXY } }) : null;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  const wire = async ctx => {
    if(api) await ctx.route('**/*', async route => {
      const q = route.request();
      try{
        const r = await api.fetch(q.url(), { method:q.method(), headers:q.headers(),
          data: q.postDataBuffer() || undefined, maxRedirects: 5, timeout: 60000 });
        const h = r.headers(); delete h['content-encoding']; delete h['content-length'];
        await route.fulfill({ status:r.status(), headers:h, body: await r.body() });
      }catch(e){ await route.abort(); }
    });
    await ctx.addInitScript(() => { try{ localStorage.setItem('eski-onboarded','1'); }catch(e){} });
  };

  const ctx = await browser.newContext({ viewport:{width:1280,height:900}, serviceWorkers:'block' });
  await wire(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));

  const settle = async ms => p.waitForTimeout(ms || 900);

  /* ---------------------------------------------- the address */
  console.log('a comic has an address');
  await p.goto(BASE + '/', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('.card', { timeout: 30000 });
  await settle(2500);

  const before = p.url();
  await p.locator('.card').first().click();
  await settle();
  const slug = await p.evaluate(() => {
    const m = location.pathname.match(/^\/c\/([^/]+)$/); return m ? m[1] : null; });
  ok('opening a card puts a real url in the bar', !!slug, '/c/' + slug);
  ok('and it did so WITHOUT navigating away', p.url() !== before &&
     await p.evaluate(() => document.getElementById('overlay').classList.contains('open')));
  ok('the tab is named after the comic', /·\s*eski$/.test(await p.title()), await p.title());

  await p.goBack(); await settle();
  ok('back closes it', !(await p.evaluate(() =>
     document.getElementById('overlay').classList.contains('open'))));
  ok('and lands where you were', !/^\/c\//.test(new URL(p.url()).pathname));

  /* ---------------------------------------------- the thread is shut */
  console.log('the thread is shut until you ask');
  await p.locator('.card').first().click();
  await settle();
  ok('comments are a closed fold, not an open section',
     (await p.locator('#d-cm-toggle').getAttribute('aria-expanded')) === 'false');
  ok('and the bodies are not on the page',
     !(await p.locator('#d-cm-body').isVisible().catch(()=>false)));
  const fetched = [];
  p.on('request', r => { if(/\/rest\/v1\/comments\?.*select=\*/.test(r.url())) fetched.push(r.url()); });
  await settle(600);
  ok('nor even fetched', fetched.length === 0, fetched.length + ' fetches');
  await p.locator('#d-cm-toggle').click();
  await settle(1600);
  ok('opening it fetches them', fetched.length === 1, fetched.length + ' fetches');
  ok('and shows the thread', await p.locator('#d-cm-body').isVisible().catch(()=>false));
  ok('signed out, it says how to join',
     /sign in/i.test(await p.locator('#d-cm-body').innerText()));

  /* ---------------------------------------------- cold, from a link */
  console.log('arriving on a shared link');
  const cold = await browser.newContext({ viewport:{width:1280,height:900}, serviceWorkers:'block' });
  await wire(cold);
  const q = await cold.newPage();
  const coldErrs = [];
  q.on('pageerror', e => coldErrs.push(e.message));
  q.on('console', m => m.type() === 'error' && coldErrs.push(m.text()));
  await q.goto(BASE + '/c/' + slug, { waitUntil:'domcontentloaded' });
  await q.waitForFunction(() =>
    document.getElementById('overlay').classList.contains('open'), null, { timeout: 30000 });
  ok('a cold /c/<slug> opens straight onto the comic', true);
  ok('and reads as a page, not a modal over a shelf',
     await q.evaluate(() => document.body.classList.contains('deep')));
  ok('the way out is a word, not a cross',
     await q.locator('.sheet-home').isVisible().catch(()=>false));
  ok('relative assets still resolve two levels down — <base> is doing its job',
     await q.evaluate(() => !!window.eski && !!document.querySelector('link[href$="tokens.css"]')));
  const readHref = await q.locator('#ov-read').getAttribute('href');
  ok('and the read link points at the reader, not /c/read.html',
     /^\/?read\.html\?/.test(readHref || ''), readHref);
  ok('no console errors on a cold link', coldErrs.length === 0, coldErrs.slice(0,3).join(' | '));

  /* ---------------------------------------------- link preview */
  console.log('the link preview a crawler sees');
  const head = await (await request.newContext(
    PROXY ? { proxy:{ server: PROXY } } : {})).get(BASE + '/c/' + slug);
  const html = await head.text();
  const tag = re => (html.match(re) || [])[1] || '';
  ok('og:title names the comic', /\S/.test(tag(/og:title" content="([^"]*)"/)),
     tag(/og:title" content="([^"]*)"/));
  ok('og:image is the cover', /^https?:\/\//.test(tag(/og:image" content="([^"]*)"/)));
  ok('og:url is canonical', tag(/og:url" content="([^"]*)"/).endsWith('/c/' + slug));
  ok('there is exactly one <title>', (html.match(/<title>/g) || []).length === 1);
  const miss = await (await request.newContext(
    PROXY ? { proxy:{ server: PROXY } } : {})).get(BASE + '/c/no-such-comic-here');
  ok('a link to nothing answers 404, not 200', miss.status() === 404, 'got ' + miss.status());

  /* ---------------------------------------------- signed in: the thread works */
  console.log('signed in, the thread works');
  const auth = await p.evaluate(async ([email, password]) => {
    const r = await window.eski.sb.auth.signInWithPassword({ email, password });
    return r.error ? r.error.message : 'ok';
  }, [EMAIL, PASSWORD]);
  ok('the harness account signs in', auth === 'ok', auth);
  if(auth !== 'ok'){ await browser.close(); process.exit(1); }

  await p.goto(BASE + '/c/' + slug, { waitUntil:'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('overlay');       // null mid-navigation
    return !!o && o.classList.contains('open');
  }, null, { timeout: 30000 });
  await p.locator('#d-cm-toggle').click();
  await settle(1600);

  const count = () => p.evaluate(() =>
    parseInt(document.getElementById('d-cm-n').textContent.replace(/[^0-9]/g,''), 10) || 0);
  const n0 = await count();

  await p.locator('#cm-new-top').fill(STAMP);
  await p.locator('[data-cm-post]').first().click();
  await settle(2000);
  const body = () => p.locator('#d-cm-body').innerText();
  ok('a comment posts', (await body()).includes(STAMP));
  ok('and the count goes up', (await count()) === n0 + 1, `${n0} -> ${await count()}`);
  // innerText applies text-transform, and .cm-head is uppercase by design
  ok('it is signed with the account name, not something the browser chose',
     /test harness/i.test(await body()));

  await p.locator('[data-cm-reply]').first().click();
  await settle(500);
  await p.locator('[id^="cm-new-"]:not(#cm-new-top)').fill(STAMP + ' reply');
  await p.locator('.cm [data-cm-post]').last().click();
  await settle(2000);
  ok('a reply posts under it', (await body()).includes(STAMP + ' reply'));
  ok('and is indented as a reply', (await p.locator('.cm.reply').count()) > 0);

  await p.locator('[data-cm-edit]').first().click();
  await settle(400);
  await p.locator('#cm-edit').fill(STAMP + ' edited');
  await p.locator('[data-cm-save]').first().click();
  await settle(1800);
  ok('an edit saves', (await body()).includes(STAMP + ' edited'));
  ok('and is marked as edited', /edited/i.test(await body()));

  /* ---------------------------------------------- reader round trip */
  console.log('reading, commenting, and coming back');
  // the read button on the page we are already on is the route a reader takes
  const toReader = await p.locator('#ov-read').getAttribute('href');
  await p.goto(new URL(toReader, BASE + '/').href, { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#player-bar:not([style*="display:none"])', { timeout: 30000 });
  await settle(2500);
  await p.evaluate(() => navRight());
  await settle(1200);
  const cmHref = await p.locator('#cm-btn').getAttribute('href');
  ok('the reader offers a way to the thread', !!cmHref, cmHref);
  ok('and it carries the page you are on', /\?page=\d+#comments$/.test(cmHref || ''));

  await p.locator('#cm-btn').click();
  await p.waitForFunction(() => {
    const o = document.getElementById('overlay');       // null mid-navigation
    return !!o && o.classList.contains('open');
  }, null, { timeout: 30000 });
  await settle(1500);
  ok('following it lands on the comic with the thread already open',
     (await p.locator('#d-cm-toggle').getAttribute('aria-expanded')) === 'true');

  const pageStamp = STAMP + ' from the reader';
  await p.locator('#cm-new-top').fill(pageStamp);
  await p.locator('[data-cm-post]').first().click();
  await settle(2000);
  // innerText applies text-transform, and the head is uppercase by design
  ok('a comment written here records the page it came from',
     /p\.\d+/i.test(await body()), (await body()).match(/p\.\d+/i)?.[0] || 'no page tag');

  await p.goBack();
  await p.waitForSelector('#player-bar:not([style*="display:none"])', { timeout: 30000 });
  await settle(1500);
  ok('and back returns to the reader', /read\.html/.test(p.url()));
  ok('on the page you left off', /page=\d+/.test(p.url()), p.url().split('#')[1] || '');

  /* ---------------------------------------------- tidy up */
  console.log('tidying up');
  const gone = await p.evaluate(async stamp => {
    const { data } = await window.eski.sb.from('comments').select('id,body');
    const mine = (data || []).filter(r => (r.body || '').includes(stamp));
    for(const r of mine) await window.eski.sb.from('comments').delete().eq('id', r.id);
    const { data: left } = await window.eski.sb.from('comments').select('id,body');
    return (left || []).filter(r => (r.body || '').includes(stamp)).length;
  }, STAMP);
  ok('the harness comments are off the comic again', gone === 0, gone + ' left');

  ok('zero console errors across the run', errs.length === 0, errs.slice(0,3).join(' | '));

  /* ---------------------------------------------- the same trip on a phone */
  console.log('on a phone: read, comment, come back');
  const phone = await browser.newContext({
    viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3,
    serviceWorkers:'block',
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '+
              '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await wire(phone);
  const m = await phone.newPage();
  const mErrs = [];
  m.on('pageerror', e => mErrs.push(e.message));
  m.on('console', e => e.type() === 'error' && mErrs.push(e.text()));
  const mStamp = STAMP + ' from a phone';

  await m.goto(BASE + '/', { waitUntil:'domcontentloaded' });
  await m.waitForSelector('.card', { timeout: 30000 });
  await m.evaluate(async ([email, password]) => {
    await window.eski.sb.auth.signInWithPassword({ email, password });
  }, [EMAIL, PASSWORD]);
  await m.waitForTimeout(2500);

  await m.locator('.card').first().tap();
  await m.waitForTimeout(1200);
  ok('tapping a card opens the comic and takes its url',
     /^\/c\//.test(new URL(m.url()).pathname), new URL(m.url()).pathname);
  ok('the modal still has its close button', await m.locator('.sheet-x').isVisible().catch(()=>false));
  ok('the page does not scroll sideways on a phone',
     await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  const mRead = await m.locator('#ov-read').getAttribute('href');
  await m.goto(new URL(mRead, BASE + '/').href, { waitUntil:'domcontentloaded' });
  await m.waitForSelector('#player-bar:not([style*="display:none"])', { timeout: 30000 });
  await m.waitForTimeout(2500);
  ok('the reader shows a comments control on a phone too',
     await m.locator('#cm-btn').isVisible().catch(()=>false));
  const barRight = await m.evaluate(() => {
    const r = document.querySelector('.pb-right');
    return r ? Math.round(r.getBoundingClientRect().right) : -1; });
  ok('and the bar still fits the screen with it there', barRight > 0 && barRight <= 390,
     `right edge ${barRight} of 390`);

  await m.locator('#cm-btn').tap();
  await m.waitForFunction(() => {
    const o = document.getElementById('overlay');
    return !!o && o.classList.contains('open');
  }, null, { timeout: 30000 });
  await m.waitForTimeout(1800);
  ok('tapping it lands on the comic with the thread open',
     (await m.locator('#d-cm-toggle').getAttribute('aria-expanded')) === 'true');
  ok('and the thread is actually on screen, not below the fold',
     await m.evaluate(() => {
       const t = document.getElementById('d-thread');
       if(!t) return false;
       const r = t.getBoundingClientRect();
       return r.top < window.innerHeight && r.bottom > 0;
     }));

  await m.locator('#cm-new-top').fill(mStamp);
  await m.locator('[data-cm-post]').first().tap();
  await m.waitForTimeout(2500);
  ok('a comment posts from a phone',
     (await m.locator('#d-cm-body').innerText()).includes(mStamp));

  await m.goBack();
  await m.waitForSelector('#player-bar:not([style*="display:none"])', { timeout: 30000 });
  await m.waitForTimeout(1500);
  ok('back returns to the reader, on the page you left', /read\.html.*#.*page=\d+/.test(m.url()));

  // and from the comic page, home is one tap
  await m.goto(BASE + '/c/' + slug, { waitUntil:'domcontentloaded' });
  await m.waitForFunction(() => {
    const o = document.getElementById('overlay');
    return !!o && o.classList.contains('open');
  }, null, { timeout: 30000 });
  await m.waitForTimeout(1200);
  ok('arriving cold on a phone reads as a page',
     await m.evaluate(() => document.body.classList.contains('deep')));
  await m.locator('.sheet-home').tap();
  await m.waitForSelector('.card', { timeout: 30000 });
  ok('and "all eskis" gets you to the shelf', new URL(m.url()).pathname === '/');

  const mGone = await m.evaluate(async stamp => {
    const { data } = await window.eski.sb.from('comments').select('id,body');
    for(const r of (data||[]).filter(x => (x.body||'').includes(stamp)))
      await window.eski.sb.from('comments').delete().eq('id', r.id);
    const { data: left } = await window.eski.sb.from('comments').select('id,body');
    return (left||[]).filter(x => (x.body||'').includes(stamp)).length;
  }, STAMP);
  ok('the phone run cleaned up after itself', mGone === 0, mGone + ' left');
  ok('zero console errors on the phone', mErrs.length === 0, mErrs.slice(0,3).join(' | '));

  await browser.close();
  console.log(bad ? `\n${bad} check(s) failed` : '\ncomic-page run clean');
  process.exit(bad ? 1 : 0);
})();
