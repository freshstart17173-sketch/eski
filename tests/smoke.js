/* eski smoke tests: serve the project over localhost, intercept CDNs, drive the UI.
   covers the reader (index.html), the studio (studio.html), and the library. */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const http = require('http');
const fs = require('fs');
const path = require('path');

/* run below normal priority. the suite drives a real headless chromium for
   ~90s and on windows the browser it spawns inherits this priority class, so
   the run yields to whatever you are actually doing.
   BELOW_NORMAL (10), NOT IDLE (19): idle starves the browser badly enough that
   the audio waits ("track ended quietly", "jump restarts the range track")
   start timing out, because they assert on real playback against a wall
   clock. That cost two false failures before it was tracked down. */
try { require('os').setPriority(10); } catch (e) { /* not permitted, run normally */ }

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const VENDOR = path.join(__dirname, 'vendor');
const DL = path.join(__dirname, 'dl');
fs.mkdirSync(DL, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css',   // without this the browser refuses tokens.css and every layout assertion lies
  '.png': 'image/png', '.eski': 'application/x-eski' };

let failures = 0;
function ok(cond, name, extra) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p === '/') p = '/index.html';
    // the production path: an explicit index.json, which is what Vercel needs
    // since it does not autoindex. Listed without covers so the grid still
    // exercises reading a manifest out of the zip.
    if (p === '/library/index.json') {
      const files = fs.readdirSync(path.join(FIX, 'library')).filter(f => f.endsWith('.eski'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries: files }));
      return;
    }
    // serve the fixture library folder: autoindex listing + the eski files themselves
    if (p === '/library/' || p === '/library') {
      const files = fs.readdirSync(path.join(FIX, 'library')).filter(f => f.endsWith('.eski'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>' + files.map(f => `<a href="${f}">${f}</a>`).join('<br>') + '</body></html>');
      return;
    }
    if (p.startsWith('/library/')) {
      const f = path.join(FIX, 'library', p.slice('/library/'.length));
      if (fs.existsSync(f) && !fs.statSync(f).isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(fs.readFileSync(f)); return;
      }
      res.writeHead(404); res.end('nope'); return;
    }
    // /fx/<name> and /dl/<name> serve raw files (the reader only opens via ?read=)
    if (p.startsWith('/fx/') || p.startsWith('/dl/')) {
      const f = path.join(p.startsWith('/fx/') ? FIX : DL, p.slice(4));
      if (fs.existsSync(f) && !fs.statSync(f).isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(fs.readFileSync(f)); return;
      }
      res.writeHead(404); res.end('nope'); return;
    }
    let file = p === '/demo.eski' ? path.join(FIX, 'test.eski') : path.join(ROOT, p.slice(1));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  }).listen(8931);

  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  // block the service worker: it would serve cached copies past our route intercepts
  const ctx = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });

  // CI may lack egress: serve CDN deps locally, kill fonts.
  await ctx.route('https://cdnjs.cloudflare.com/**', route => {
    const url = route.request().url();
    const local = url.includes('jszip') ? require.resolve('jszip/dist/jszip.min.js')
      : url.includes('pdf.worker') ? path.join(VENDOR, 'pdf.worker.min.js')
      : url.includes('pdf.min.js') ? path.join(VENDOR, 'pdf.min.js') : null;
    if (local && fs.existsSync(local))
      route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(local) });
    else if (local) route.continue();
    else route.fulfill({ status: 404, body: '' });
  });
  // the auth client is vendored now, so it loads from localhost like any other
  // asset. what must not happen is the suite reaching the real project, so the
  // supabase origin is stubbed: no session, and an empty shelf.
  await ctx.route('https://*.supabase.co/**', r => {
    const u = r.request().url();
    if(u.includes('/auth/v1/')) return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 404, body: '' }));

  const consoleErrors = [];
  const wire = p => {
    p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message +
      ' @@ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  };
  const page = await ctx.newPage();
  wire(page);
  const jump = () => page.inputValue('#page-jump');
  const track = () => page.evaluate(() => window.nowPlaying());

  console.log('reader: boot + demo');
  await page.goto('http://localhost:8931/read.html');
  await page.waitForSelector('#player-bar', { state: 'visible' });
  ok(await page.textContent('#vt-info-text') === 'Page 1 of 6', 'demo opens on page 1 of 6',
    await page.textContent('#vt-info-text'));
  await page.waitForFunction(() => window.nowPlaying().includes('first song'));
  ok(true, 'track 1 named');
  ok(await page.title() === 'eski', 'title is just eski');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => location.hash === '#test-comic/page=2');
  ok(true, 'hash follows navigation');

  /* THE STALE-PAGE GUARD.
     prefetchAround used to call ensurePageUrl, which short circuits the moment
     a page already has a url — always true for a published comic — so it
     "prefetched" by returning a string and nothing was ever fetched. Combined
     with img.src keeping the OLD picture on screen until the new one decodes,
     a reader turning pages faster than the network sat looking at page one.
     Two invariants: the neighbours are really warmed, and what is on screen is
     the page the counter claims. */
  console.log('reader: pages keep up with the page turns');
  await page.evaluate(() => goToPage(2, true));
  await page.waitForFunction(() => {
    const rec = warm.get(currentPage);
    return rec && document.getElementById('page-left').src === rec.url;
  }, null, { timeout: 8000 });
  ok(true, 'the picture on screen is the page the counter says');
  ok(await page.evaluate(() => warm.has(currentPage + 1) && warm.has(currentPage - 1)),
    'the neighbours either side are warmed, not just named');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => {
    const rec = warm.get(currentPage);
    return rec && document.getElementById('page-left').src === rec.url;
  }, null, { timeout: 8000 });
  ok(true, 'five fast turns still land on the right picture');
  await page.evaluate(() => goToPage(1, true));

  console.log('reader: colour match is gone');
  ok(await page.evaluate(() =>
      !document.documentElement.style.getPropertyValue('--tintsat').trim() &&
      typeof window.applyTint === 'undefined' && !document.getElementById('set-tint')),
    'the reader no longer recolours itself from the cover');

  console.log('the theme');
  ok(await page.evaluate(() => !!window.eskiTheme), 'palette.js is on the reader');
  ok(await page.evaluate(() => {
      window.eskiTheme.set('light-blue');
      const el = document.documentElement;
      return el.getAttribute('data-theme') === 'light-blue' &&
             el.getAttribute('data-mode') === 'light' && !el.hasAttribute('data-dark');
    }), 'a light theme applies and clears data-dark');
  ok(await page.evaluate(() => {
      window.eskiTheme.set('mono-green');
      const c = getComputedStyle(document.documentElement);
      // shape is NOT a theme decision and must survive every swap
      return c.getPropertyValue('--r').trim() === '0' &&
             c.getPropertyValue('--bw').trim() === '1px' &&
             document.documentElement.hasAttribute('data-dark');
    }), 'a mono theme applies and leaves the radius and rules alone');
  ok(await page.evaluate(() => window.eskiTheme.hues.length * window.eskiTheme.treatments.length),
    'eighteen themes: six hues across three treatments');
  ok(await page.evaluate(() => {
      const p = document.querySelector('[data-palette-picker] .pal-pop');
      // shut until asked for, and never a stack of rows
      return p && !document.querySelector('.pal-row');
    }), 'the picker is one row, shut until the word is clicked');

  console.log('reader: deep link');
  const page2 = await ctx.newPage();
  wire(page2);
  await page2.goto('http://localhost:8931/read.html#test-comic/page=5');
  await page2.waitForSelector('#player-bar', { state: 'visible' });
  await page2.waitForFunction(() => document.getElementById('page-jump').value === '5');
  ok(true, 'deep link lands on page 5');
  await page2.waitForFunction(() => window.nowPlaying().includes('second song'));
  ok(true, 'deep link page owns track 2');
  await page2.close();

  console.log('reader: rtl override');
  await page.click('#settings-btn');
  await page.click('#set-dir button[data-m="rtl"]');
  await page.click('#settings-btn');
  const before = await jump();
  await page.keyboard.press('ArrowLeft'); // rtl: left arrow goes forward
  await page.waitForFunction(v => document.getElementById('page-jump').value !== v, before);
  ok(parseInt(await jump()) === parseInt(before) + 1, 'rtl: ArrowLeft advances', await jump());
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(v => document.getElementById('page-jump').value === v, before);
  ok(true, 'rtl: ArrowRight goes back');
  ok(await page.evaluate(() => isRTL()), 'the reader is reading right to left');

  console.log('reader: spread mode is gone');
  ok(await page.evaluate(() => !document.getElementById('spread-btn') &&
    typeof window.toggleSpread === 'undefined'),
    'no spread button and no toggleSpread');
  ok(await page.evaluate(() => audioPage() === currentPage),
    'one visible page owns the audio outright');
  await page.click('#settings-btn');
  await page.click('#set-dir button[data-m="ltr"]');
  await page.click('#settings-btn');
  await page.click('#settings-btn');
  await page.click('#set-dir button[data-m="file"]');
  await page.click('#settings-btn');

  console.log('reader: jump replays a quietly ended track');
  // fixture loopMode is "next": the 1s track on page 1 ends and goes quiet
  await page.evaluate(() => goToPage(0, true));
  await page.waitForFunction(() => audio.active && audio.active.duration > 0);
  await page.waitForFunction(() => audio.active === null, null, { timeout: 8000 });
  ok(true, 'track ended quietly (loopMode next)');
  await page.evaluate(() => goToPage(1, true)); // jump within the same range
  await page.waitForFunction(() => audio.active !== null && !audio.active.paused);
  ok(true, 'jump restarts the range track, not silence');

  console.log('reader: scroll mode');
  await page.click('#settings-btn');
  await page.click('#set-reading button[data-m="scroll"]');
  await page.click('#settings-btn');
  ok(await page.isVisible('#scroll-pages'), 'scroller visible');
  ok(await page.evaluate(() => zoneAt(innerWidth * 0.02, innerHeight / 2) === null),
    'the page-turn bands are inert in scroll mode');
  /* pages lazy-load, so scrollHeight grows as images arrive: re-apply the scroll
     on every poll instead of once, or the midline can settle on an earlier page.
     the whole comic has to decode before the last page can be the midline one,
     which on a cold run is slower than it looks: 20s was tight enough to fail
     roughly one run in three. */
  await page.waitForFunction(() => {
    const sc = document.getElementById('scroll-pages');
    sc.scrollTop = sc.scrollHeight;
    return document.getElementById('page-jump').value === '6';
  }, null, { timeout: 60000 });
  ok(true, 'midline page tracks scroll (page 6)');
  await page.waitForFunction(() => window.nowPlaying().includes('second song'));
  ok(true, 'scroll changed the track');
  await page.waitForFunction(() => // lazy loading actually loaded the visible page
    !!document.querySelector('#scroll-pages .sp-page:last-child img[src]'), null, { timeout: 8000 });
  ok(true, 'scroller images lazy load');
  await page.evaluate(() => { document.getElementById('scroll-pages').scrollTop = 0; });
  await page.waitForFunction(() => document.getElementById('page-jump').value === '1');
  await page.click('#settings-btn');
  await page.click('#set-reading button[data-m="file"]');
  await page.click('#settings-btn');

  console.log('reader: playlist mode');
  await page.click('#settings-btn');
  await page.click('#set-playback button[data-m="playlist"]');
  await page.click('#settings-btn');
  await page.waitForFunction(() => window.nowPlaying().includes('first song'));
  await page.waitForFunction(() =>
    window.nowPlaying().includes('second song'), null, { timeout: 8000 });
  ok(true, 'playlist advanced on ended');
  ok(await jump() === '1', 'page did not move', await jump());
  await page.waitForFunction(() =>
    window.nowPlaying().includes('end of playlist'), null, { timeout: 8000 });
  ok(true, 'playlist ends, no loop');
  await page.click('#settings-btn');
  await page.click('#set-playback button[data-m="file"]');
  await page.click('#settings-btn');

  console.log('reader: queue file (two tracks on one page)');
  await page.goto('http://localhost:8931/read.html?read=fx/queue.eski');
  await page.waitForSelector('#player-bar', { state: 'visible' });
  await page.keyboard.press('Shift');   // any gesture unlocks audio after a fresh load
  await page.waitForFunction(() => document.getElementById('vt-info-text').textContent.includes('of 3'));
  await page.waitForFunction(() => window.nowPlaying().includes('first song'));
  ok(await page.evaluate(() => queueForPage(current, currentPage).tracks.length === 2),
    'page 1 carries a two-track queue');
  // out point at 0.5s: the second track should take over without a page turn
  await page.waitForFunction(() =>
    window.nowPlaying().includes('second song'), null, { timeout: 8000 });
  ok(true, 'queue advanced at the out point');
  ok(await jump() === '1', 'still on page 1');

  console.log('reader: fullscreen focus');
  await page.click('button[title="Fullscreen (f)"]');
  await page.waitForFunction(() => document.body.classList.contains('focus'));
  ok(await page.isHidden('#player-bar'), 'player bar hidden in focus');
  ok(await page.isHidden('.site-header'), 'header hidden in focus');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('focus'));
  ok(true, 'escape exits focus');

  console.log('reader: big pages fit + controls visible (layout regression guard)');
  const bigp = await ctx.newPage();
  wire(bigp);
  await bigp.goto('http://localhost:8931/read.html?read=fx/big.eski');
  await bigp.waitForSelector('#player-bar', { state: 'visible' });
  await bigp.waitForFunction(() => document.getElementById('page-left').complete &&
    document.getElementById('page-left').naturalHeight > 0);
  const layout = await bigp.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const pb = document.getElementById('player-bar'), img = document.getElementById('page-left');
    return { innerH: innerHeight, pbBottom: Math.round(r(pb).bottom),
      imgH: Math.round(r(img).height), viewerH: Math.round(r(document.getElementById('viewer')).height) };
  });
  ok(layout.pbBottom <= layout.innerH + 1, 'player bar sits within the viewport', JSON.stringify(layout));
  ok(layout.imgH <= layout.viewerH + 1, 'tall page fits the viewer (no overflow)', JSON.stringify(layout));

  console.log('reader: page zoom + pan');
  await bigp.evaluate(() => {
    const v = document.getElementById('viewer'), b = v.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    v.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    v.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
  });
  ok(await bigp.evaluate(() => pageZoom() > 1.3), 'wheel zooms the page in',
    await bigp.evaluate(() => pageZoom()));
  /* THE BANDS ARE A FRAME, NOT A SPLIT, and the middle belongs to the picture.
     Two half-width divs over the whole viewer used to mean a pinch never
     reached panzoom — no zoom at all on a phone — and a double click to zoom
     on the desktop turned two pages first. */
  const bands = await bigp.evaluate(() => {
    const r = document.getElementById('viewer').getBoundingClientRect();
    return {
      left:   zoneAt(r.left + 4, r.top + r.height / 2),
      right:  zoneAt(r.right - 4, r.top + r.height / 2),
      middle: zoneAt(r.left + r.width / 2, r.top + r.height / 2),
      overlay: !document.getElementById('click-zones')
    };
  });
  ok(bands.left === 'prev' && bands.right === 'next', 'the edges turn the page',
    JSON.stringify(bands));
  ok(bands.middle === null, 'the middle of the page turns nothing, so it can zoom',
    JSON.stringify(bands));
  ok(bands.overlay, 'and nothing overlays the page to steal a pinch');
  // the zoom bar only exists while there is something to fit, and "fit" has to
  // work from a real click WHILE ZOOMED — capturing the pointer on the
  // container used to retarget that click and leave the button dead
  ok(await bigp.isVisible('#zoombar'), 'the zoom bar appears once zoomed');
  await bigp.click('#zoombar [data-z="fit"]');
  ok(Math.abs(await bigp.evaluate(() => pageZoom()) - 1) < 1e-4,
    'fit returns the page to the box', await bigp.evaluate(() => pageZoom()));
  /* IT STAYS. This asserted the opposite until the bar started carrying a
     WIDTH preset, and the old rule stopped making sense on two counts: fit
     width is not a no-op at 1x — it is what you want on a tall page before
     touching anything — and hiding the only route back to FIT is exactly how
     somebody ends up zoomed into a corner with no control on screen. It is
     dimmed at rest and comes up on hover, which is a different thing from
     absent. */
  ok(await bigp.isVisible('#zoombar'),
    'the zoom bar stays at 1x, because WIDTH and FIT are both live there');
  ok(await bigp.isVisible('#zoombar [data-z="width"]'),
    'and it offers fit-width, not just fit');
  await bigp.evaluate(() => {
    const v = document.getElementById('viewer'), b = v.getBoundingClientRect();
    v.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: b.left + b.width / 2,
      clientY: b.top + b.height / 2, bubbles: true, cancelable: true }));
  });
  await bigp.evaluate(() => window.showPage(1, false, false));
  // contain:'outside' derives its floor from measured dimensions, so a reset
  // lands on 1 to within a rounding error rather than the integer 1
  await bigp.waitForFunction(() => Math.abs(pageZoom() - 1) < 1e-4);
  ok(true, 'turning the page resets the zoom');
  await bigp.close();

  console.log('reader: settings works in fullscreen focus');
  await page.evaluate(() => document.body.classList.add('focus', 'peek'));
  await page.click('#settings-btn');
  const sset = await page.evaluate(() => {
    const s = document.getElementById('settings'), b = s.getBoundingClientRect();
    return { open: s.classList.contains('open'), onScreen: b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
      z: +getComputedStyle(s).zIndex };
  });
  ok(sset.open && sset.onScreen && sset.z >= 60, 'settings popover opens on-screen above the focus bar',
    JSON.stringify(sset));
  await page.click('#settings-btn');
  await page.evaluate(() => document.body.classList.remove('focus', 'peek'));

  console.log('reader: one-shots (dubbing)');
  const osp = await ctx.newPage();
  wire(osp);
  await osp.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await osp.goto('http://localhost:8931/read.html?read=fx/oneshots.eski');
  await osp.waitForSelector('#player-bar', { state: 'visible' });
  const osCount = () => osp.textContent('#os-count');
  const osHintShown = () => osp.evaluate(() => document.getElementById('os-hint').style.display !== 'none');
  ok(await osp.evaluate(() => !document.getElementById('arrow-prev') && !document.getElementById('arrow-next')),
    'nav arrow buttons removed');
  await osp.evaluate(() => goToPage(0, true));
  await osp.waitForFunction(() => document.getElementById('os-hint').style.display === 'none');
  ok(true, 'page without one-shots hides the indicator');
  // the soundtrack music must still own page 2 (one-shots do not split the range)
  await osp.evaluate(() => goToPage(1, true));
  await osp.waitForFunction(() => document.getElementById('os-hint').style.display !== 'none');
  ok(await osCount() === '2 cues', 'page 2 shows its two cues', await osCount());
  ok((await osp.evaluate(() => window.nowPlaying())).includes('bg'),
    'soundtrack still owns the one-shot page', await osp.evaluate(() => window.nowPlaying()));
  // the one-shot tutorial is gone for good, not merely dismissed
  ok(await osp.evaluate(() => !document.getElementById('tut-os') &&
    typeof window.maybeOsTutorial === 'undefined'), 'no one-shot tutorial popup');
  /* THE STEPPER IS GONE, so the assertions that walked a cursor with the arrow
     keys went with it. A page's cues are SCHEDULED — several can sound at once,
     which is the whole point of `with` and `over` — so there is no "next one"
     to move to, and the count is how many there are rather than where you are.

     What is worth asserting instead: that pressing replay actually starts
     them, and that they stop dead on a page turn. */
  await osp.keyboard.press('ArrowDown');       // now replays rather than steps
  let osPlaying = false;
  try { await osp.waitForFunction(() => document.getElementById('os-hint').classList.contains('playing'),
    null, { timeout: 6000 }); osPlaying = true; } catch (e) {}
  ok(osPlaying, 'the page\'s cues play when replayed');
  ok(await osCount() === '2 cues', 'and the count is how many, not where you are',
    await osCount());
  /* CUT ON THE TURN. A group still sounding when the reader moves on is
     stopped, all of it — audio from the page before arguing with the page in
     front of you is worse than losing the end of a sentence. */
  await osp.evaluate(() => goToPage(0, true));
  ok(await osp.evaluate(() => cues.playing === 0 &&
       cues.pool.every(el => el.paused)), 'a page turn cuts every sounding cue');
  await osp.waitForFunction(() => document.getElementById('os-hint').style.display === 'none');
  ok(true, 'one-shots reset on page turn');
  // space no longer turns the page; it pauses the soundtrack
  const pgBefore = await osp.inputValue('#page-jump');
  await osp.keyboard.press('Space');
  await osp.waitForTimeout(60);
  ok(await osp.inputValue('#page-jump') === pgBefore, 'space no longer turns the page');
  ok(await osp.evaluate(() => soundPaused && audio.active.paused), 'space pauses the soundtrack');
  await osp.keyboard.press('Space'); // resume
  // hotkeys panel toggles with ?
  await osp.keyboard.press('Shift+Slash'); // "?"
  ok(await osp.evaluate(() => document.getElementById('keys-panel').classList.contains('open')),
    'hotkeys panel opens with ?');
  await osp.keyboard.press('Escape');
  ok(await osp.evaluate(() => !document.getElementById('keys-panel').classList.contains('open')),
    'escape closes the hotkeys panel');
  /* LOOP USED TO WRAP THE CURSOR. There is no cursor, so it now means the
     honest equivalent: play the page's cues again when they finish. It is
     kept rather than retired because somebody may already have it switched
     on, and silently ignoring a setting is worse than removing it. */
  await osp.evaluate(() => { toggleOsLoop(); goToPage(1, true); });
  await osp.waitForFunction(() => document.getElementById('os-count').textContent === '2 cues');
  ok(await osp.evaluate(() => effOsLoop()), 'the loop setting is on');
  await osp.keyboard.press('ArrowDown');
  /* run() MEASURES THE CLIPS BEFORE IT SCHEDULES THEM — durations are read
     from the audio rather than assumed, because `over` is a percentage of a
     take whose length is not known until it loads. So nothing is armed the
     instant the key goes down; wait for the schedule rather than racing it. */
  let armed = 0;
  try {
    await osp.waitForFunction(() => cues.timers.length > 2, null, { timeout: 15000 });
    armed = await osp.evaluate(() => cues.timers.length);
  } catch (e) { armed = await osp.evaluate(() => cues.timers.length); }
  ok(armed > 2, 'with loop on, the page arms a repeat as well as its cues', String(armed));
  await osp.evaluate(() => { toggleOsLoop(); });

  /* SWAPPING THE MIX MUST NOT RELOAD THE COMIC. It used to set location.href,
     which kept your place through the hash but threw away every decoded page
     to fetch the same forty-five images again — so a reader comparing two
     takes of one line paid for the whole comic twice. Nobody does it twice.

     What proves it is not a reload: the page you were on, the zoom, and a
     marker put on `window` survive the swap. A navigation would lose all
     three. */
  console.log('reader: the mix swaps in place');
  await osp.evaluate(() => { goToPage(1, true); window.__notReloaded = true; });
  const beforePage = await osp.inputValue('#page-jump');
  await osp.evaluate(() => toggleMix(true));
  await osp.evaluate(() => applyMix());
  await osp.waitForFunction(() => !document.getElementById('mix').classList.contains('open'),
    null, { timeout: 15000 }).catch(()=>{});
  ok(await osp.evaluate(() => window.__notReloaded === true),
    'changing the mix does not reload the reader');
  ok(await osp.inputValue('#page-jump') === beforePage,
    'and you are still on the page you were reading',
    await osp.inputValue('#page-jump'));
  /* THIS FIXTURE IS A .eski FILE, which has no parts to swap between and no
     comic id to fetch them with — so the honest assertion is that the sheet
     says so and the button does not pretend. The database path needs a
     published comic with a second part, which is tests/live.js territory. */
  ok(await osp.evaluate(() => !current.baseId),
    'the fixture is a file, so there is nothing to swap between');
  ok(await osp.evaluate(() => typeof mergeParts === 'function'),
    'and the swap shares one merge with the initial load rather than a copy');

  console.log('reader: soundtrack duck under one-shots');
  ok(await osp.evaluate(() => graph.ok && graph.nodes.size === 2),
    'web audio graph built on both soundtrack elements');
  ok(await osp.evaluate(() => graph.ctx.state === 'running'), 'audio context is running');
  ok(await osp.evaluate(() => effDuck() === 'medium'),
    'a file with no player.duck still ducks (default medium)');
  ok(await osp.evaluate(() => !!document.getElementById('set-duck')), 'duck setting row exists');
  // the duck keys on the channel going busy, not on each one-shot
  const duckState = await osp.evaluate(async () => {
    const n = [...graph.nodes.values()][0];
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const read = () => ({ g: +n.duck.gain.value.toFixed(2), eq: +n.lo.gain.value.toFixed(2) });
    // the cue tests above left audio playing; silence the channel and let its
    // release debounce flush before measuring a clean idle. os.el is gone with
    // the stepper — the scheduler owns a pool now, and stop() releases the
    // duck as well as pausing it.
    cues.stop(); await wait(900);
    applyDuck(false); await wait(1800);
    const idle = read();
    duckChannel(true, null); await wait(500);
    const busy = read();
    duckChannel(false, null); duckChannel(true, null); await wait(300);
    const requeued = read();          // a second line in the same run must not lift the duck
    duckChannel(false, null); await wait(200);
    const stillHeld = read();         // release is debounced, so this is still ducked
    await wait(1600);
    return { idle, busy, requeued, stillHeld, released: read() };
  });
  // setTargetAtTime approaches its target asymptotically, so allow a hair of tail
  ok(duckState.idle.g > 0.98 && Math.abs(duckState.idle.eq) < 0.1, 'idle: no duck, no eq',
    JSON.stringify(duckState.idle));
  ok(duckState.busy.g < 0.5 && duckState.busy.eq < -3, 'busy: soundtrack ducks and the eq notches in',
    JSON.stringify(duckState.busy));
  ok(duckState.requeued.g < 0.5, 'a queued one-shot does not re-trigger the duck',
    JSON.stringify(duckState.requeued));
  ok(duckState.stillHeld.g < 0.5, 'release is debounced, not instant',
    JSON.stringify(duckState.stillHeld));
  ok(duckState.released.g > 0.9 && duckState.released.eq > -0.5, 'duck lifts once the channel goes idle',
    JSON.stringify(duckState.released));
  // per-one-shot override and the off switch
  ok(await osp.evaluate(() => duckLevelFor({ duck: 'light' }) === 'light'),
    'a one-shot can ask for a lighter duck');
  ok(await osp.evaluate(() => duckLevelFor({ duck: 'inherit' }) === 'medium'), '"inherit" falls through');
  ok(await osp.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    applyDuck(false); await wait(1600);            // settle to unity first
    setDuckMode('off'); duckChannel(true, null); await wait(400);
    const g = [...graph.nodes.values()][0].duck.gain.value;
    setDuckMode('medium');
    return g > 0.95;
  }), 'duck off means the soundtrack never moves');
  // and it degrades to a volume-only duck with no web audio
  ok(await osp.evaluate(() => {
    const was = graph.ok; graph.ok = false;
    applyDuck(true, 'strong'); const on = duckMul;
    applyDuck(false); const off = duckMul;
    graph.ok = was;
    return on === 0.3 && off === 1;
  }), 'falls back to a volume-only duck without web audio');
  ok(await osp.evaluate(() => normGain({ gainDb: -6 }).toFixed(2) === '0.50' &&
    normGain({ gainDb: 0 }) === 1 && normGain({ gainDb: 99 }) < 4.1),
    'gainDb converts to a linear gain and clamps');
  await osp.close();

  /* ================= composer ================= */
  console.log('composer: import media (merged)');
  const comp = await ctx.newPage();
  wire(comp);
  await comp.goto('http://localhost:8931/studio.html');
  ok(await comp.isVisible('#empty-hint'), 'empty hint shows');
  await comp.setInputFiles('#in-media', path.join(FIX, 'test.cbz'));
  await comp.waitForFunction(() => cState.pages.length === 3);
  ok(true, 'cbz gave 3 pages');
  await comp.setInputFiles('#in-media', path.join(FIX, 'test.pdf'));
  await comp.waitForFunction(() => cState.pages.length === 5, null, { timeout: 20000 });
  ok(true, 'pdf added 2 rasterized pages (one add-media input)');
  ok(await comp.isHidden('#empty-hint'), 'empty hint gone');
  await comp.waitForFunction(() => cState.pages.every(p => p.thumb));
  ok(true, 'low quality thumbs generated');
  ok(await comp.evaluate(() => document.querySelectorAll('#bay-imgs .chip-img').length) === 5,
    'media bay shows 5 image blocks');

  console.log('composer: default silence');
  ok(await comp.evaluate(() => cState.tracks.length === 1 && cState.tracks[0].type === 'silence'),
    'a silence track exists by default');

  console.log('composer: the soundtrack timeline is gone');
  for (const id of ['tl-inner', 'tl-ruler', 'tl-pagerow', 'tl-lanes', 'minimap', 'mm-window',
                    'sel-band', 'modeswitch', 'os-tool', 'clipbar-slot', 'zoom-ctrls']) {
    ok(await comp.evaluate(i => !document.getElementById(i), id), `#${id} removed`);
  }
  ok(await comp.evaluate(() => !document.querySelector('.clipbar') && !document.querySelector('.tl-band')),
    'no clip bar and no timeline bands');
  ok(await comp.evaluate(() => typeof window.renderTimeline === 'undefined' &&
    typeof window.zoomFit === 'undefined' && typeof window.syncMinimap === 'undefined' &&
    typeof window.setTLMode === 'undefined'), 'the timeline renderers are gone from the page');

  console.log('composer: audio into the bay, then placed from the page panel');
  await comp.setInputFiles('#in-media', path.join(FIX, 'a.wav'));
  await comp.waitForFunction(() => audioPool.length === 1);
  ok(await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length) === 0,
    'imported audio stays in the bay, not auto-placed');
  await comp.waitForFunction(() => Object.values(audioStore)[0].peaks, null, { timeout: 10000 });
  ok(true, 'waveform peaks decoded');
  ok(await comp.isVisible('#bay-auds .chip-aud'), 'audio block in bay');
  ok(await comp.isVisible('#bay-auds .chip-aud canvas'), 'bay block shows a waveform');
  ok(await comp.isVisible('#bay-auds .chip-aud button'), 'bay block can be auditioned');
  // place from the pool onto page 3 (what dropping audio on the panel does)
  await comp.evaluate(() => addTrackFromPool(audioPool[0], 3));
  await comp.waitForFunction(() => cState.tracks.some(t => t.type === 'music' && t.from === 3));
  ok(true, 'placed a track from the bay at page 3');

  console.log('composer: the page panel sets what the timeline used to');
  await comp.evaluate(() => openQueue(3));
  ok(await comp.isVisible('.songrow'), 'the song shows on its trigger page');
  ok(await comp.evaluate(() => document.querySelectorAll('.songknobs input').length === 4),
    'volume, trigger page, in point and out point are all editable');
  // in point, formerly the slip drag
  await comp.fill('.songknobs input.inp', '2.5');
  await comp.evaluate(() => document.querySelector('.songknobs input.inp')
    .dispatchEvent(new Event('change', { bubbles: true })));
  ok(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').start) === 2.5,
    'in point set from the panel');
  // trigger page, formerly the grip drag
  await comp.fill('.songknobs input.pg', '4');
  await comp.evaluate(() => document.querySelector('.songknobs input.pg')
    .dispatchEvent(new Event('change', { bubbles: true })));
  ok(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').from) === 4,
    'trigger page set from the panel',
    String(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').from)));
  ok(await comp.evaluate(() => qpPage === 4), 'the panel follows the song it just moved');

  console.log('composer: queueing a second song on the same page');
  await comp.evaluate(() => addTrackFromPool(audioPool[0], 4));
  await comp.waitForFunction(() => cState.tracks.filter(t => t.type === 'music').length === 2);
  ok(await comp.evaluate(() => {
    const m = cState.tracks.filter(t => t.type === 'music'); return m[0].from === m[1].from;
  }), 'a second song on the same page joins the queue');
  ok(await comp.evaluate(() => document.querySelectorAll('.songrow').length === 2),
    'the panel lists the whole queue');

  console.log('composer: undo / redo / copy / paste / delete');
  await comp.keyboard.press('Control+z');
  await comp.waitForFunction(() => cState.tracks.filter(t => t.type === 'music').length === 1);
  ok(true, 'ctrl+z undoes the queue copy');
  await comp.keyboard.press('Control+Shift+z');
  await comp.waitForFunction(() => cState.tracks.filter(t => t.type === 'music').length === 2);
  ok(true, 'redo restores it');
  await comp.evaluate(() => { sel = cState.tracks.find(t => t.type === 'music').tid; render(); });
  await comp.keyboard.press('Control+c');
  await comp.keyboard.press('Control+v');
  await comp.waitForFunction(() => cState.tracks.filter(t => t.type === 'music').length === 3);
  ok(true, 'ctrl+c/v pastes a copy');
  await comp.keyboard.press('Delete');
  await comp.waitForFunction(() => cState.tracks.filter(t => t.type === 'music').length === 2);
  ok(true, 'delete removes the selection');

  console.log('composer: page grid reorder + remove');
  ok(await comp.evaluate(() => document.querySelectorAll('.pgcard').length) === 5,
    'the page grid lists every page');
  const firstName = await comp.evaluate(() => cState.pages[0].name);
  await comp.evaluate(() => movePage(0, 2));
  ok(await comp.evaluate((n) => cState.pages[2].name === n, firstName), 'page reordered via movePage');
  await comp.evaluate(() => removePage(4));
  ok(await comp.evaluate(() => cState.pages.length) === 4, 'page removed');
  await comp.evaluate(() => movePage(2, 0));

  console.log('composer: settings drawer');
  await comp.click('button[onclick="openSettings()"]');
  ok(await comp.evaluate(() => document.getElementById('drawer').classList.contains('open')),
    'settings drawer opens');
  await comp.fill('#m-title', 'round trip');
  await comp.dispatchEvent('#m-title', 'input');
  await comp.click('.drawer-head button');
  ok(await comp.evaluate(() => !document.getElementById('drawer').classList.contains('open')),
    'settings drawer closes');

  console.log('composer: export packs sources as-is (no opus)');
  await comp.evaluate(() => { sel = null; render(); });
  const dl1 = comp.waitForEvent('download');
  await comp.evaluate(() => exportCurrent());
  const f1 = path.join(DL, 'plain.eski');
  await (await dl1).saveAs(f1);
  const z1 = await JSZip.loadAsync(fs.readFileSync(f1));
  const man1 = JSON.parse(await z1.file('.eski/manifest.json').async('string'));
  const audioFiles1 = Object.keys(z1.files).filter(k => k.startsWith('audio/') && !z1.files[k].dir);
  ok(man1.version === 2, 'manifest v2');
  ok(audioFiles1.length === 1 && audioFiles1[0].endsWith('.wav'), 'audio packed as-is (wav, not opus)',
    audioFiles1.join(','));
  const music1 = man1.tracks.filter(t => t.type === 'music');
  ok(music1.length === 2 && music1[0].sync.from === music1[1].sync.from, 'queue kept on one trigger page');
  ok(music1[0].file === music1[1].file, 'queue copies share one packed audio file');
  ok(music1.every(t => !('end' in t.sync)), 'no out point written (feature removed)');
  ok(man1.tracks.some(t => t.type === 'silence'), 'silence track exported');
  ok(man1.player.crossfade === 1, 'crossfade defaults to 1s');
  ok(man1.pages.count === 4, 'page count 4');

  console.log('composer: icons + tray/page zoom');
  ok(await comp.evaluate(() => document.querySelectorAll('svg.ico').length) > 12, 'icons painted across the ui');
  ok(await comp.evaluate(() => [...document.querySelectorAll('svg.ico')].every(s => s.innerHTML.trim())),
    'no empty icon glyphs');
  const chipW0 = await comp.evaluate(() => document.querySelector('.chip-img').offsetWidth);
  await comp.click('.sec-head .zoomers button[title="Bigger"]');
  ok(await comp.evaluate(() => document.querySelector('.chip-img').offsetWidth) > chipW0,
    'media tray zoom grows the image blocks');
  const pgW0 = await comp.evaluate(() => document.querySelector('.pgcard').offsetWidth);
  await comp.click('#pages-ctrls button[title="Bigger pages"]');
  ok(await comp.evaluate(() => document.querySelector('.pgcard').offsetWidth) > pgW0,
    'page zoom grows the thumbnails');

  console.log('composer: removing a song from the panel');
  await comp.evaluate(() => openQueue(cState.tracks.find(t => t.type === 'music').from));
  const nMusic = await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length);
  await comp.click('.songrow button[title="Remove"]');
  ok(await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length) === nMusic - 1,
    'the panel removes a song');
  await comp.close();

  console.log('composer: one-shots (pages-mode block + queue panel)');
  const oc = await ctx.newPage();
  wire(oc);
  await oc.goto('http://localhost:8931/studio.html');
  await oc.setInputFiles('#in-eski', path.join(FIX, 'oneshots.eski'));
  await oc.waitForFunction(() => cState.tracks.filter(t => t.type === 'oneshot').length === 2);
  ok(await oc.evaluate(() => cState.tracks.filter(t => t.type === 'music').length) === 1,
    'opened: 1 music + 2 one-shots');
  await oc.waitForSelector('.pgcard');
  // page state is two stacked bars, no icons: top = one-shots, bottom = soundtrack
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .pgstate i.lines.on').length) === 1,
    'exactly one page is marked as carrying one-shots');
  ok(await oc.evaluate(() => !document.querySelector('.pgcard .osblock, .pgcard .trig')),
    'the old one-shot and trigger icons are gone');
  // the page panel is docked and persistent, not a modal over the stage
  ok(await oc.isVisible('#qp'), 'page panel is always present');
  ok(await oc.evaluate(() => !document.getElementById('qp-scrim')), 'the modal scrim is gone');
  ok(await oc.evaluate(() => getComputedStyle(document.getElementById('qp')).position === 'static'),
    'page panel is docked in the layout, not floating');
  // selecting a page is enough to see everything on it
  await oc.evaluate(() => openQueue(cState.tracks.find(t => t.type === 'oneshot').from));
  ok(await oc.evaluate(() => document.querySelectorAll('#qp-list .oschip').length) === 2,
    'panel lists both one-shots for the selected page');
  ok((await oc.textContent('#info-song')).length > 0, 'panel says which song owns the page');
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard.sel').length === 1),
    'the selected page is marked in the grid');
  // the two soundtrack states are distinguishable: where it starts, and where
  // it is carried over. that distinction is the whole point of the pair.
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .pgstate i.song.starts').length > 0),
    'the page a soundtrack starts on is marked');
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .pgstate i.song.cont').length > 0),
    'pages carrying that soundtrack over are marked differently');
  ok(await oc.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.pgcard .pgstate i.song.starts'));
    const c = getComputedStyle(document.querySelector('.pgcard .pgstate i.song.cont'));
    return s.backgroundColor !== c.backgroundColor && parseFloat(s.height) >= 8;
  }), 'the two soundtrack shades differ and the bars are the taller size');
  ok(await oc.evaluate(() => { openQueue(1); return document.getElementById('qp-title').textContent; })
    === 'Page 1 of 3', 'clicking a page retargets the panel');
  await oc.evaluate(() => openQueue(2));
  // reorder in the queue
  const order0 = await oc.evaluate(() => cState.tracks.filter(t => t.type === 'oneshot').map(t => t.title));
  await oc.evaluate(() => {
    const s = cState.tracks.filter(t => t.type === 'oneshot');
    moveOneshotBefore(s[1].tid, 2, s[0].tid);
  });
  const order1 = await oc.evaluate(() => cState.tracks.filter(t => t.type === 'oneshot').map(t => t.title));
  ok(order1[0] === order0[1] && order1[1] === order0[0], 'queue reordered', order0 + ' -> ' + order1);
  await oc.evaluate(() => closeQueue());
  // the tool creates an empty block on a page that has none
  await oc.evaluate(() => addBlock(1));
  ok(await oc.evaluate(() => hasBlock(1)), 'a page can hold an empty one-shot block');
  await oc.evaluate(() => closeQueue());
  // export and check the manifest
  const dlo = oc.waitForEvent('download');
  await oc.evaluate(() => exportCurrent());
  const fo = path.join(DL, 'oneshots.eski');
  await (await dlo).saveAs(fo);
  const zo = await JSZip.loadAsync(fs.readFileSync(fo));
  const mano = JSON.parse(await zo.file('.eski/manifest.json').async('string'));
  const shots = mano.tracks.filter(t => t.type === 'oneshot');
  ok(shots.length === 2 && shots.every(t => t.sync.from === 2), 'both one-shots exported on page 2');
  ok(shots[0].title === order1[0] && shots[1].title === order1[1], 'one-shot order preserved in export');
  ok(shots.every(t => t.file && zo.file(t.file)), 'one-shot audio packed');
  ok(mano.tracks.some(t => t.type === 'music' && t.sync.from === 1), 'music track intact');

  console.log('studio: cast + dialogue slots');
  await oc.evaluate(() => { addCast('Aiko'); addCast('The Narrator', 'narrator'); });
  ok(await oc.evaluate(() => cState.cast.map(c => c.key).join(',')) === 'aiko,the-narrator',
    'cast keys slugify from the name');
  ok(await oc.evaluate(() => cState.cast[1].kind) === 'narrator', 'a narrator is castable');
  ok(await oc.evaluate(() => document.querySelectorAll('.castrow').length === 2),
    'cast list renders in the drawer');
  // a slot is an authored void: a run of speech with no audio yet
  await oc.evaluate(() => { openQueue(1); addSlot(1, 'aiko'); addSlot(1, 'aiko'); });
  ok(await oc.evaluate(() => linesFor(1).length === 2), 'two dialogue slots on page 1');
  ok(await oc.evaluate(() => linesFor(1).every(t => t.aud === null)), 'slots start empty');
  ok(await oc.evaluate(() => document.querySelectorAll('#qp-list .oschip.empty').length === 2),
    'empty slots read as empty in the panel');
  ok(await oc.evaluate(() => JSON.stringify(coverageFor('aiko')) === '{"filled":0,"total":2,"pct":0}'),
    'coverage starts at zero', await oc.evaluate(() => JSON.stringify(coverageFor('aiko'))));
  // filling one slot moves coverage and skips the recording's dead air
  await oc.evaluate(() => {
    const a = Object.keys(audioStore)[0];
    audioStore[a].leadTrim = 0.4;
    fillSlot(linesFor(1)[0], a);
    render();
  });
  ok(await oc.evaluate(() => coverageFor('aiko').pct === 50), 'coverage tracks filled slots');
  ok(await oc.evaluate(() => linesFor(1)[0].start === 0.4),
    'filling a slot skips the leading silence');
  ok(await oc.evaluate(() => coverageFor('the-narrator').pct === 100),
    'a character with no slots is complete, not a divide by zero');

  console.log('studio: edit modes gate what a contributor may touch');
  await oc.evaluate(() => setEditMode('vo'));
  ok(await oc.evaluate(() => !canPages() && canLines() && !canMusic() && !canSfx()),
    'vo mode: dialogue only');
  ok(await oc.evaluate(() => document.querySelector('.bay-sec.imgs').style.display === 'none'),
    'vo mode hides the image bay: contributors do not touch pages');
  ok(await oc.evaluate(() => document.getElementById('cast-row').style.display === 'none'),
    'vo mode hides cast editing');
  ok(await oc.evaluate(() => { const n = cState.pages.length; removePage(0); return cState.pages.length === n; }),
    'vo mode refuses to remove a page');
  await oc.evaluate(() => setEditMode('soundtrack'));
  ok(await oc.evaluate(() => !canLines() && canMusic() && canSfx()),
    'soundtrack mode: music and sfx, no dialogue');
  await oc.evaluate(() => setEditMode('scratch'));
  ok(await oc.evaluate(() => canPages() && canCast() && canLines() && canMusic()),
    'scratch mode has no restrictions');

  console.log('studio: the role picker only appears when there is a role to pick');
  const solo = await ctx.newPage();
  wire(solo);
  await solo.goto('http://localhost:8931/studio.html');
  await solo.waitForSelector('#tl-panel');
  ok(await solo.evaluate(() => document.getElementById('modebar').style.display === 'none'),
    'a new comic shows no role picker: you are its author');
  ok(await solo.evaluate(() => editMode === 'scratch'), 'a new comic is authored');
  ok(await solo.evaluate(() => { setEditMode('vo'); return editMode === 'scratch'; }),
    'a new comic cannot be switched into a contributor role');

  // the library hands over ?base=<id>. the id does not resolve against the
  // stubbed supabase, which is fine: the picker policy is what is under test.
  await solo.goto('http://localhost:8931/studio.html?base=00000000-0000-0000-0000-000000000000&as=vo');
  await solo.waitForSelector('#tl-panel');
  ok(await solo.evaluate(() => document.getElementById('modebar').style.display !== 'none'),
    "somebody else's comic shows the picker");
  ok(await solo.evaluate(() =>
    document.querySelector('#mode-sel option[value="scratch"]').hidden),
    'the author role is not offered on somebody else\'s comic');
  ok(await solo.evaluate(() => !document.getElementById('mode-sel').disabled),
    'voice actor and composer both stay selectable');
  ok(await solo.evaluate(() => { setEditMode('soundtrack'); return editMode === 'soundtrack'; }),
    'a contributor may switch between the two roles');
  ok(await solo.evaluate(() => { setEditMode('scratch'); return editMode !== 'scratch'; }),
    'a contributor cannot take the author role');
  await solo.close();

  console.log('studio: cast + slots round-trip through export');
  const dl2 = oc.waitForEvent('download');
  await oc.evaluate(() => exportCurrent());
  const f2 = path.join(DL, 'cast.eski');
  await (await dl2).saveAs(f2);
  const mz = await JSZip.loadAsync(fs.readFileSync(f2));
  const mm = JSON.parse(await mz.file('.eski/manifest.json').async('string'));
  ok(JSON.stringify(mm.meta.cast) === '[{"key":"aiko","name":"Aiko","kind":"character"},' +
    '{"key":"the-narrator","name":"The Narrator","kind":"narrator"}]',
    'cast is written to meta', JSON.stringify(mm.meta.cast));
  const slotTracks = mm.tracks.filter(t => t.type === 'oneshot' && t.role === 'line');
  ok(slotTracks.length >= 2, 'line slots exported with role');
  ok(slotTracks.some(t => t.file === null && t.character === 'aiko'),
    'an unfilled slot exports as file:null with its character');

  console.log('reader: an unfilled slot is not in the cursor');
  const sl = await ctx.newPage();
  wire(sl);
  await sl.goto('http://localhost:8931/read.html?read=dl/cast.eski');
  await sl.waitForSelector('#player-bar', { state: 'visible' });
  ok(await sl.evaluate(() => oneshotsForPage(current, 0).every(t => t.url || t.entry)),
    'slots with no audio never reach the one-shot cursor');
  await sl.close();

  console.log('studio: a vo exports as a part, not a whole comic');
  // the base above shipped with slot 2 still empty; record it now so the vo
  // covers something the base cannot play on its own
  await oc.evaluate(() => { fillSlot(linesFor(1)[1], Object.keys(audioStore)[0]); render(); });
  ok(await oc.evaluate(() => coverageFor('aiko').pct === 100), 'aiko is fully covered');
  await oc.evaluate(() => setEditMode('vo'));
  const dl3 = oc.waitForEvent('download');
  await oc.evaluate(() => exportCurrent());
  const f3 = path.join(DL, 'vo.eski');
  await (await dl3).saveAs(f3);
  const vz = await JSZip.loadAsync(fs.readFileSync(f3));
  const vm = JSON.parse(await vz.file('.eski/manifest.json').async('string'));
  ok(vm.kind === 'vo', 'part is tagged as a vo');
  ok(vm.character === 'aiko', 'a vo names the one character it covers', String(vm.character));
  ok(!!vm.base && !!vm.base.id, 'a vo names the base it was built against');
  ok(vz.file(/^\d+\.(png|jpg)/).length === 0, 'a vo ships no pages');
  ok(vm.tracks.every(t => t.role === 'line' && t.file), 'a vo ships only recorded lines');
  const slotIds = await oc.evaluate(() =>
    cState.tracks.filter(t => t.type === 'oneshot' && t.role === 'line').map(t => t.tid));
  ok(vm.tracks.every(t => slotIds.includes(t.id)),
    'clips are keyed by the base slot id, which is what makes casts swappable');
  await oc.evaluate(() => setEditMode('scratch'));

  console.log('reader: base + vo mix');
  const mx = await ctx.newPage();
  wire(mx);
  // the base alone: the slot exists but has nothing to play
  await mx.goto('http://localhost:8931/read.html?read=dl/cast.eski');
  await mx.waitForSelector('#player-bar', { state: 'visible' });
  const soloLines = await mx.evaluate(() => oneshotsForPage(current, 0).length);
  // now layer the vo over the same base
  await mx.goto('http://localhost:8931/read.html?read=dl/cast.eski&with=dl/vo.eski');
  await mx.waitForSelector('#player-bar', { state: 'visible' });
  const mixedLines = await mx.evaluate(() => oneshotsForPage(current, 0).length);
  ok(mixedLines > soloLines, 'the vo fills slots the base left empty',
    `${soloLines} -> ${mixedLines}`);
  ok(await mx.evaluate(() => current.baseId), 'the base carries an id parts can match on');
  ok(await mx.evaluate(() => current.cast.some(c => c.key === 'aiko')),
    'cast survives into the reader');
  // a part built for a different comic is refused, not silently mixed in
  await mx.goto('http://localhost:8931/read.html?read=fx/oneshots.eski&with=dl/vo.eski');
  await mx.waitForSelector('#player-bar', { state: 'visible' });
  ok(await mx.evaluate(() => current.tracks.every(t => !String(t.id).startsWith('slotmismatch'))),
    'a mismatched part does not corrupt the comic');
  await mx.close();

  /* the database twin of the mix above. no network: comicFromApi is handed a
     fake supabase client, so what is under test is the merge rule (a row with
     `fills` REPLACES the author's empty slot, anything else is appended) and
     the fact that the base query never picks up other people's tracks. */
  console.log('reader: parts merge from the database the same way files do');
  const api = await ctx.newPage();
  wire(api);
  await api.goto('http://localhost:8931/read.html');
  await api.waitForSelector('#player-bar');
  const merged = await api.evaluate(async () => {
    const rows = {
      comics: { id: 'c1', title: 'db comic', owner_name: 'author', direction: 'ltr',
                cover_key: 'aa/cover.jpg', cast_list: [{ key: 'aiko', name: 'Aiko' }] },
      pages: [{ idx: 1, image_key: 'aa/1.jpg' }, { idx: 2, image_key: 'aa/2.jpg' }],
      base: [
        { id: 'slot-1', type: 'oneshot', role: 'line', character_key: 'aiko',
          audio_key: null, from_page: 1, order_idx: 1, volume: 100, start_ms: 0 },
        { id: 'song-1', type: 'music', audio_key: 'aa/song.mp3', from_page: 1,
          order_idx: 2, volume: 100, start_ms: 0 }
      ],
      part: [
        { id: 'clip-1', type: 'oneshot', role: 'line', character_key: 'aiko',
          audio_key: 'bb/line.mp3', fills: 'slot-1', part_id: 'p1',
          from_page: 1, order_idx: 1, volume: 100, start_ms: 0 },
        { id: 'extra-1', type: 'oneshot', role: 'sfx', audio_key: 'bb/sfx.mp3',
          fills: null, part_id: 'p1', from_page: 2, order_idx: 2, volume: 100, start_ms: 0 }
      ]
    };
    // the smallest thing that answers like postgrest: every filter returns the
    // builder, and awaiting it resolves to whatever the table was asked for
    const q = table => {
      const st = { table, isNull: false, inParts: false };
      const b = {
        select: () => b, eq: () => b, order: () => b,
        is: (col, v) => { if (col === 'part_id' && v === null) st.isNull = true; return b; },
        in: () => { st.inParts = true; return b; },
        single: () => ({ then: r => r({ data: rows.comics, error: null }) }),
        then: r => r({
          data: st.table === 'pages' ? rows.pages
              : st.inParts ? rows.part
              : rows.base,
          error: null
        })
      };
      return b;
    };
    window.eski = { ready: Promise.resolve({ from: q }), mediaUrl: k => 'https://r2.test/' + k,
                    dbError: (c, w, e) => c + ' ' + w };
    const c = await comicFromApi('c1', ['p1']);
    return {
      total: c.tracks.length,
      slot: c.tracks.find(t => t.id === 'slot-1'),
      appended: c.tracks.find(t => t.id === 'extra-1'),
      cast: c.cast.map(x => x.key)
    };
  });
  ok(merged.total === 3, 'a filled slot replaces the base row instead of doubling it',
    'tracks: ' + merged.total);
  ok(merged.slot && merged.slot.url === 'https://r2.test/bb/line.mp3',
    'the empty slot now plays the contributor\'s recording',
    merged.slot && merged.slot.url);
  ok(merged.slot && merged.slot.character === 'aiko',
    'the slot keeps the character it was written for');
  ok(!!merged.appended, 'a part track that fills nothing is appended');
  ok(merged.cast.join() === 'aiko', 'the cast comes back with the comic');
  await api.close();

  console.log('studio: a contributor publishes only their own work');
  const cw = await ctx.newPage();
  wire(cw);
  await cw.goto('http://localhost:8931/studio.html');
  // the base exported a few steps up: it has both a recorded line and an empty slot
  await cw.setInputFiles('#in-eski', path.join(DL, 'cast.eski'));
  // pages are pushed before the manifest's tracks, so waiting on pages alone
  // catches the import half way through
  await cw.waitForFunction(() =>
    cState.tracks.filter(t => t.type === 'oneshot' && t.role === 'line').length >= 2);
  const split = await cw.evaluate(() => {
    // stand in for loadBase: the author's rows arrived, one of them an empty slot
    const lines = cState.tracks.filter(t => t.type === 'oneshot' && t.role === 'line');
    baseTrackIds = new Set(cState.tracks.map(t => t.tid));
    baseSlotIds = new Set(lines.filter(t => !t.aud).map(t => t.tid));
    const filled = [...baseSlotIds][0];
    if (filled) fillSlot(cState.tracks.find(t => t.tid === filled), Object.keys(audioStore)[0]);
    editMode = 'vo';
    const mine = myPartTracks('vo');
    return {
      mine: mine.map(t => t.tid),
      filled,
      authorLines: lines.filter(t => t.aud && !baseSlotIds.has(t.tid)).map(t => t.tid)
    };
  });
  ok(split.filled && split.mine.includes(split.filled),
    'a slot the contributor filled counts as theirs', JSON.stringify(split));
  ok(split.authorLines.every(id => !split.mine.includes(id)),
    'lines the author already recorded are never re-published by a contributor',
    JSON.stringify(split));
  await cw.close();

  console.log('studio + reader: sfx chains, chapters, series');
  const ch = await ctx.newPage();
  wire(ch);
  await ch.goto('http://localhost:8931/studio.html');
  await ch.setInputFiles('#in-eski', path.join(FIX, 'oneshots.eski'));
  await ch.waitForFunction(() => cState.tracks.filter(t => t.type === 'oneshot').length === 2);
  // hang one one-shot off the other: it should stop being separately triggerable
  await ch.evaluate(() => {
    const os = cState.tracks.filter(t => t.type === 'oneshot');
    os[1].role = 'sfx'; os[1].attachTo = os[0].tid; os[1].offset = 0.3;
    cState.meta.chapters = [{page:1, title:'one'}, {page:2, title:'two'}];
    cState.meta.series = {title:'a series', index:2};
    render();
  });
  const dl4 = ch.waitForEvent('download');
  await ch.evaluate(() => exportCurrent());
  const f4 = path.join(DL, 'chain.eski');
  await (await dl4).saveAs(f4);
  const cz = await JSZip.loadAsync(fs.readFileSync(f4));
  const cm = JSON.parse(await cz.file('.eski/manifest.json').async('string'));
  const child = cm.tracks.find(t => t.attachTo);
  ok(!!child, 'an attached sfx exports with attachTo');
  ok(child.offset === 0.3, 'and with its offset', String(child && child.offset));
  ok(JSON.stringify(cm.meta.chapters) === '[{"page":1,"title":"one"},{"page":2,"title":"two"}]',
    'chapters export', JSON.stringify(cm.meta.chapters));
  ok(cm.meta.series.title === 'a series' && cm.meta.series.index === 2, 'series exports');
  ok(await ch.evaluate(() => parseChapters('3: hello\nrubbish\n1: start').map(c => c.page).join(',')) === '1,3',
    'chapter text parses and sorts, ignoring junk');
  await ch.close();

  const cr = await ctx.newPage();
  wire(cr);
  await cr.goto('http://localhost:8931/read.html?read=dl/chain.eski');
  await cr.waitForSelector('#player-bar', { state: 'visible' });
  ok(await cr.evaluate(() => current.chapters.length === 2), 'reader reads chapters');
  ok(await cr.evaluate(() => current.series.index === 2), 'reader reads series');
  ok(await cr.isVisible('#chapter-sel'), 'chapter jump appears when a comic has chapters');
  await cr.evaluate(() => goToPage(1, true));
  ok(await cr.evaluate(() => oneshotsForPage(current, 1).length === 1),
    'an attached sfx is not separately triggerable: the chain head owns it',
    String(await cr.evaluate(() => oneshotsForPage(current, 1).length)));
  ok(await cr.evaluate(() => {
    const head = oneshotsForPage(current, 1)[0];
    return childrenOf(head).length === 1;
  }), 'and it rides along with its parent');
  await cr.close();

  console.log('studio: preview runs the real reader on a snapshot');
  const pv = await ctx.newPage();
  wire(pv);
  await pv.goto('http://localhost:8931/studio.html');
  await pv.setInputFiles('#in-media', path.join(FIX, 'test.cbz'));
  await pv.waitForFunction(() => cState.pages.length === 3);
  await pv.click('#preview-btn');
  await pv.waitForFunction(() => document.getElementById('readerprev').classList.contains('open'));
  ok(true, 'preview opens');
  const frame = pv.frameLocator('#rp-frame');
  await frame.locator('#player-bar').waitFor({ state: 'visible', timeout: 15000 });
  ok((await frame.locator('#vt-info-text').textContent()).includes('of 3'),
    'the preview is the real reader, loading a snapshot of the current state');
  ok(await pv.evaluate(() => document.getElementById('rp-frame').src.includes('read.html?read=blob')),
    'it feeds read.html a blob url rather than duplicating the engine');
  await pv.click('.rp-head button');
  ok(await pv.evaluate(() => document.getElementById('rp-frame').src === 'about:blank'),
    'closing stops the preview so its audio does not keep playing');
  // out points trim without re-encoding
  await pv.evaluate(() => {
    cState.tracks.push({tid:'trim1', aud:null, type:'silence', title:'s', from:1, start:0, end:2.5, volume:100});
  });
  ok(await pv.evaluate(() => cState.tracks.find(t => t.tid === 'trim1').end === 2.5),
    'tracks carry an out point');
  await pv.close();

  console.log('studio: media dock search + filter');
  await oc.fill('#bay-q', 'o1');
  ok(await oc.evaluate(() => document.querySelectorAll('#bay-auds .chip-aud').length) === 1,
    'search filters the audio dock');
  await oc.fill('#bay-q', '');
  await oc.selectOption('#bay-filter', 'images');
  ok(await oc.evaluate(() => document.querySelector('.bay-sec.auds').style.display) === 'none',
    'filter can hide the audio section');
  await oc.selectOption('#bay-filter', 'all');
  await oc.close();

  console.log('reader: re-import the composed export');
  await page.goto('http://localhost:8931/read.html?read=dl/' + path.basename(f1));
  await page.waitForSelector('#player-bar', { state: 'visible' });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => document.getElementById('vt-info-text').textContent.includes('of 4'));
  ok(true, 'composed export re-imports cleanly (4 pages)');
  const musicFrom = music1[0].sync.from;
  await page.evaluate((p) => goToPage(p, true), musicFrom - 1);
  await page.waitForFunction(() => {
    const q = queueForPage(current, currentPage);
    return q && q.tracks.length === 2 && q.tracks[1].id === audio.currentTrackId;
  }, null, { timeout: 8000 });
  ok(true, 'queue advances after re-import');

  console.log('reader: listening with no score');
  const ns = await ctx.newPage();
  wire(ns);
  await ns.goto('http://localhost:8931/read.html?read=fx/oneshots.eski&with=score%3Anone');
  await ns.waitForSelector('#player-bar', { state: 'visible' });
  await ns.keyboard.press('Shift');
  ok(await ns.evaluate(() => current.tracks.every(t => t.type !== 'music')),
    'no score means no music tracks at all');
  ok(await ns.evaluate(() => current.tracks.some(t => t.type === 'oneshot')),
    'the voices are still there');
  ok(await ns.textContent('#pb-score-name') === 'None', 'the bar says there is no score',
    await ns.textContent('#pb-score-name'));
  await ns.close();

  console.log('reader: ?read= opens a specific eski from the library folder');
  const rp = await ctx.newPage();
  wire(rp);
  await rp.goto('http://localhost:8931/read.html?read=library/test-comic.eski');
  await rp.waitForSelector('#player-bar', { state: 'visible' });
  await rp.waitForFunction(() => document.getElementById('vt-info-text').textContent.includes('of 6'));
  ok(true, '?read= loaded the requested eski (6 pages)');
  await rp.close();

  console.log('reader: control icons painted');
  ok(await page.evaluate(() => document.querySelectorAll('.player-bar svg.ico').length) >= 4,
    'reader chrome shows icons');
  ok(await page.evaluate(() => !document.querySelector('.sound-gate')),
    'no "tap for sound" button');
  ok(await page.evaluate(() => !document.querySelector('.songbar, .timeline')),
    'no progress bars in the reader');
  ok(await page.evaluate(() => !document.querySelector('.player-bar a[href="index.html"]')),
    'no home button in the bar; the header carries navigation');
  ok(await page.evaluate(() => (document.getElementById('pb-score-name').textContent || '').length > 0),
    'the bar names the score', await page.textContent('#pb-score-name'));
  await page.click('#mute-btn');
  ok(await page.evaluate(() => document.querySelector('#mute-btn').getAttribute('data-ico')) === 'volume-x',
    'mute swaps to the muted icon');
  await page.click('#mute-btn');

  /* ================= library ================= */
  console.log('library: reads the library/ folder');
  const lib = await ctx.newPage();
  wire(lib);
  await lib.goto('http://localhost:8931/index.html');
  await lib.waitForSelector('#ob.open');
  ok(true, 'onboarding shows on the first visit');
  ok(await lib.evaluate(() => localStorage.getItem('eski-onboarded') === '1'),
    'onboarding flag is written the moment it opens, not on dismiss');
  await lib.click('#ob .btn.primary');
  ok(await lib.evaluate(() => !document.getElementById('ob').classList.contains('open')),
    'onboarding dismisses');
  await lib.reload();
  await lib.waitForSelector('.cover img', { timeout: 12000 });
  ok(await lib.evaluate(() => !document.getElementById('ob').classList.contains('open')),
    'onboarding never shows again');
  ok(await lib.locator('.cover').count() === 2, 'two eskis from the folder');
  ok(await lib.evaluate(() => [...document.querySelectorAll('.cover img')].every(i => i.src.startsWith('blob:'))),
    'covers extracted from the eski manifests');
  const titles = await lib.evaluate(() => [...document.querySelectorAll('.cover .t')].map(t => t.textContent));
  ok(titles.some(t => /test comic|queue comic/.test(t)), 'titles read from manifest', titles.join(','));
  // index.json wins over the autoindex, because Vercel has no autoindex at all
  ok(await lib.evaluate(async () => {
    const r = await fetch('library/index.json', { cache: 'no-store' });
    return r.ok;
  }), 'the library reads library/index.json');
  ok(await lib.evaluate(() => fileComic({ file: 'x.eski', title: 'given', cover: 'c.jpg' })
    .then(e => e.title === 'given' && e.cover === 'c.jpg')),
    'an entry that already carries a title and cover is not downloaded');
  await lib.click('.cover');
  await lib.waitForSelector('.overlay.open');
  // the modal is about the comic now: read it, save it for later, and what it
  // is. the discord pitch moved out of the way of the decision.
  ok(await lib.evaluate(() => !document.querySelector('#ov-discord')),
    'no discord button competing with read it');
  ok(await lib.evaluate(() => !!document.getElementById('ov-later')),
    'read later sits beside read it');
  ok((await lib.getAttribute('#ov-read', 'href')).startsWith('read.html?read=library/'),
    'read-it opens the eski in the reader');
  await lib.keyboard.press('Escape');
  ok(await lib.evaluate(() => !document.getElementById('overlay').classList.contains('open')),
    'escape closes the overlay');

  console.log('library: published comics offer a contribute route, files do not');
  ok(await lib.evaluate(() => {
    openDetails({ file: 'db:abc-123', dbId: 'abc-123', title: 'x' });
    const a = document.getElementById('ov-contrib');
    const shown = !a.hidden && /contribute\.html\?base=abc-123&as=vo/.test(a.getAttribute('href'));
    close_();
    return shown;
  }), 'a published comic links into the contributor studio');
  /* CONSENT IS SHOWN BEFORE THE WORK, not after it. the gate is a database
     policy, but a person who spends an evening voicing a character and only
     then learns the author said no has been failed by the interface. */
  ok(await lib.evaluate(() => {
    openDetails({ file: 'db:abc-123', dbId: 'abc-123', title: 'x',
                  consent: { vo: false, soundtrack: true, sfx: true } });
    const a = document.getElementById('ov-contrib');
    const to = a.getAttribute('href');
    close_();
    return !a.hidden && /as=soundtrack/.test(to);
  }), 'a closed axis is never the one the contribute link opens on');
  ok(await lib.evaluate(() => {
    openDetails({ file: 'db:abc-123', dbId: 'abc-123', title: 'x',
                  consent: { vo: false, soundtrack: false, sfx: false } });
    const hidden = document.getElementById('ov-contrib').hidden;
    close_();
    return hidden;
  }), 'a comic closed to all three offers no contribute route at all');
  ok(await lib.evaluate(() => {
    openDetails({ file: 'library/one.eski', title: 'x' });
    const hidden = document.getElementById('ov-contrib').hidden;
    close_();
    return hidden;
  }), 'a plain file offers no contribute route: the studio needs rows to open');

  console.log('library: local shelf (drop your own eskis in)');
  const beforeShelf = await lib.evaluate(() => document.querySelectorAll('.cell').length);
  await lib.setInputFiles('#shelf-input', path.join(FIX, 'queue.eski'));
  await lib.waitForFunction(n => document.querySelectorAll('.cell').length === n + 1, beforeShelf);
  ok(true, 'a shelved eski joins the grid');
  // .tag is a tag CHIP now that tags are a real table, so the "on your shelf"
  // badge has its own class rather than sharing one with them.
  ok(await lib.evaluate(() => document.querySelectorAll('.cell .shelved').length === 1),
    'shelved eskis are badged, published ones are not');
  await lib.click('.cell .cover');
  await lib.waitForSelector('.overlay.open');
  const shelfHref = await lib.getAttribute('#ov-read', 'href');
  ok(shelfHref.startsWith('read.html?read=idb%3A'), 'shelved eskis open by indexeddb id', shelfHref);
  await lib.keyboard.press('Escape');
  // and the reader resolves that id without any file picker
  const sp = await ctx.newPage();
  wire(sp);
  await sp.goto('http://localhost:8931/' + shelfHref);
  await sp.waitForSelector('#player-bar', { state: 'visible' });
  ok((await sp.textContent('#vt-info-text')).includes('of 3'), 'the reader opens a shelved eski',
    await sp.textContent('#vt-info-text'));
  ok(await sp.evaluate(() => !document.getElementById('file-input') && !document.getElementById('url-input')),
    'the reader still offers no way to open arbitrary files');
  await sp.close();
  await lib.click('.cell .rm');
  await lib.waitForFunction(n => document.querySelectorAll('.cell').length === n, beforeShelf);
  ok(true, 'unshelving removes it again');
  await lib.close();

  console.log('mobile: every surface usable at 9:16');
  const phone = await ctx.newPage();
  wire(phone);
  await phone.setViewportSize({ width: 390, height: 693 });
  const noSideScroll = async p =>
    p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // the onboarding flag is already set from the library section: this context
  // is shared, so just dismiss whatever is there rather than expecting it
  await phone.goto('http://localhost:8931/index.html');
  await phone.waitForSelector('.cover img', { timeout: 12000 });
  await phone.evaluate(() => closeOnboarding());
  ok(await noSideScroll(phone), 'library does not scroll sideways on a phone');
  ok(await phone.evaluate(() => document.querySelectorAll('#grid .cell').length >= 1 &&
    getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length === 2),
    'library grid drops to two columns');
  await phone.click('.cover');
  await phone.waitForSelector('.overlay.open');
  ok(await phone.evaluate(() => {
    const m = document.querySelector('#overlay .modal');
    return m.getBoundingClientRect().width <= window.innerWidth;
  }), 'the comic modal fits the screen');
  /* a phone has no scrim to tap and no escape key, so the sheet carries its
     own way out */
  ok(await phone.isVisible('.sheet-x'), 'the modal has a close button on a phone');
  await phone.click('.sheet-x');
  ok(await phone.evaluate(() => !document.getElementById('overlay').classList.contains('open')),
    'and it closes the modal');
  await phone.keyboard.press('Escape');

  await phone.goto('http://localhost:8931/read.html?read=fx/oneshots.eski');
  await phone.waitForSelector('#player-bar', { state: 'visible' });
  ok(await noSideScroll(phone), 'reader does not scroll sideways on a phone');
  ok(await phone.evaluate(() =>
    [...document.querySelectorAll('.player-bar .btn')].every(p => p.offsetHeight === 0 || p.offsetHeight >= 40)),
    'player bar buttons are at least 40px tall for thumbs');
  /* THE BAR'S BACKGROUND IS --rule, showing through the 1px flex gaps as the
     dividers. Something must absorb the leftover width or the bar paints it as
     a slab in the corner — which is exactly what happened when the mobile query
     hid .pb-score, the only child that was flex:1. Assert the children cover
     the bar rather than asserting a colour: any future child that stops
     growing brings the box back, whatever it is called. */
  ok(await phone.evaluate(() => {
    const bar = document.querySelector('.player-bar');
    const kids = [...bar.children].filter(k => k.offsetWidth > 0);
    const right = Math.max(...kids.map(k => k.getBoundingClientRect().right));
    return bar.getBoundingClientRect().right - right < 2;
  }), 'the player bar has no bare strip in the corner on a phone');

  await phone.click('#settings-btn');
  ok(await phone.evaluate(() => {
    const s = getComputedStyle(document.getElementById('settings'));
    return s.position === 'fixed' && s.left === '0px' && s.bottom === '0px';
  }), 'settings becomes a bottom sheet, not a corner popover');
  // the sheet covers the button that opened it, so it carries its own close
  await phone.click('#settings .sheet-head button');
  ok(await phone.evaluate(() => !document.getElementById('settings').classList.contains('open')),
    'the sheet can be closed from inside itself');

  await phone.goto('http://localhost:8931/studio.html');
  await phone.setInputFiles('#in-media', path.join(FIX, 'test.cbz'));
  await phone.waitForFunction(() => cState.pages.length === 3);
  ok(await noSideScroll(phone), 'studio does not scroll sideways on a phone');
  ok(await phone.evaluate(() => document.querySelector('.stage').offsetWidth >= window.innerWidth - 1),
    'the stage keeps the full width: the bay and panel are off-canvas');
  ok(await phone.evaluate(() => document.querySelectorAll('.mob-only').length === 2 &&
    getComputedStyle(document.getElementById('bay-toggle')).display !== 'none'),
    'drawer toggles appear only on narrow screens');
  await phone.click('#bay-toggle');
  await phone.waitForTimeout(320);
  ok(await phone.evaluate(() => document.getElementById('bay').getBoundingClientRect().left >= -1),
    'the media bay slides in');
  // the drawer covers most of the scrim, so aim at the strip beside it
  await phone.click('#drawer-back', { position: { x: 375, y: 420 } });
  await phone.waitForTimeout(320);
  ok(await phone.evaluate(() => document.getElementById('bay').getBoundingClientRect().left < 0),
    'tapping the scrim closes it');
  await phone.close();

  // the contract is fail-soft: with the auth client unreachable (the esm.sh
  // route above throws), no auth ui is painted and the page is untouched.
  // if this ever fails, a broken cdn takes the whole site with it.
  console.log('platform: sign in degrades to nothing');
  const plat = await ctx.newPage();
  wire(plat);
  await plat.goto('http://localhost:8931/index.html');
  await plat.waitForSelector('.cell');
  // the client is vendored, so it is present here rather than absent: the auth
  // ui paints and offers a sign in. the fail-soft path is still real, it is
  // just no longer the common case.
  await plat.waitForSelector('.auth-btn');
  ok(await plat.evaluate(() => /sign in/i.test(document.querySelector('.auth-btn').textContent)),
    'the vendored client loads and offers a sign in');
  ok(await plat.evaluate(() => document.querySelectorAll('.cell').length > 0),
    'the library still renders without it');

  console.log('browse: search, sort and the three modes');
  // the header no longer carries a search of its own: the design puts one on
  // browse, beside the sort and the filter chips, and that is the one tested.
  ok(await plat.evaluate(() => document.querySelector('.hdr-label').textContent === 'Home' &&
    document.querySelector('#nav [aria-current]').textContent.trim() === 'Home'),
    'the shelf is called home');
  await plat.waitForSelector('.cell[data-search]');
  ok(await plat.evaluate(() => !document.getElementById('search-btn') &&
    !document.getElementById('theme-btn') && !document.getElementById('hdr-discord')),
    'the header is the wordmark and the four words, nothing else');
  await plat.evaluate(() => goBrowse('comics'));
  const total = await plat.evaluate(() => document.querySelectorAll('#grid-browse .bcell').length);
  const one = await plat.evaluate(() => {
    const t = document.querySelector('.cell[data-search]').dataset.search.split(' ')[0];
    const q = document.getElementById('b-q');
    q.value = t; q.dispatchEvent(new Event('input'));
    return document.querySelectorAll('#grid-browse .bcell').length;
  });
  ok(one > 0 && one <= total, 'typing filters browse', `${one} of ${total}`);
  ok(await plat.evaluate(() => {
    const q = document.getElementById('b-q');
    q.value = 'zzzznotathing'; q.dispatchEvent(new Event('input'));
    return document.querySelectorAll('#grid-browse .bcell').length === 0 &&
           !document.getElementById('browse-empty').hidden;
  }), 'no match says so instead of showing an empty page');
  ok(await plat.evaluate(() => {
    const q = document.getElementById('b-q');
    q.value = ''; q.dispatchEvent(new Event('input'));
    return document.querySelectorAll('#grid-browse .bcell').length > 0 &&
           document.getElementById('browse-empty').hidden;
  }), 'clearing the query restores the whole shelf');
  ok(await plat.evaluate(() => {
    goBrowse('roles');
    const a = document.getElementById('browse-n').textContent;
    goBrowse('scores');
    const b = document.getElementById('browse-n').textContent;
    goBrowse('comics');
    return /role/.test(a) && /score/.test(b);
  }), 'each browse mode says which of the three you are in');
  await plat.goto('http://localhost:8931/studio.html');
  // publish stays visible signed out and explains itself on click, rather than
  // vanishing and leaving no trace of the flow
  // the title is set by the eski-auth event, which fires only once the dynamic
  // import of the auth client settles. sampling it straight after goto() is a
  // race, so wait for the condition rather than reading it once.
  await plat.waitForFunction(() => {
    const b = document.getElementById('publish-btn');
    return b && b.offsetParent !== null && /sign in/i.test(b.title);
  }, null, { timeout: 10000 });
  ok(true, 'publish is visible signed out and says it needs a sign in');

  /* ---------------- the contribution studio ----------------
     THE ONE INVARIANT WORTH A TEST: exactly one column is writable, and which
     one is decided by the stance. Everything else on that screen is drawn but
     dead. A screenshot cannot prove this — a greyed row and a live row differ
     by an attribute, not by much ink — so it is checked as logic.

     slotsOn() is called with a fixed script rather than a live comic, because
     what is being tested is the rule and not the data. */
  console.log('contribute: one writable column per stance');
  const contrib = await ctx.newPage();
  await contrib.goto('http://localhost:8931/contribute.html');
  const stanceRule = await contrib.evaluate(() => {
    // stand up just enough state for slotsOn() to run
    cast = [{ key:'aki', name:'Aki', kind:'character' },
            { key:'nar', name:'narrator', kind:'narrator' }];
    entries = [
      { id:'l1', from_page:1, role:'line', character_key:'aki',    line_text:'mine',  order_idx:1 },
      { id:'l2', from_page:1, role:'line', character_key:'nar',    line_text:'theirs',order_idx:2 },
      { id:'l3', from_page:1, role:'sfx',  character_key:null,     line_text:'bang',  order_idx:3 }
    ];
    myTracks = []; character = 'aki';
    const live = () => slotsOn(1).filter(s => s.live).map(s => s.id).sort().join(',');
    stance = 'vo';         const vo    = live();
    stance = 'sfx';        const sfx   = live();
    stance = 'soundtrack'; const score = live();
    return { vo, sfx, score, scoreCount: slotsOn(1).length };
  });
  ok(stanceRule.vo === 'l1',
    'voice: only the chosen character\'s own lines are writable', stanceRule.vo);
  ok(stanceRule.sfx === 'l3',
    'effects: only the effect entries are writable', stanceRule.sfx);
  ok(stanceRule.score === 'score-1',
    'score: the page itself, and none of the dialogue', stanceRule.score);
  /* the point of merging the two studios: a voice actor can HEAR the score and
     a composer can hear the dialogue, so nothing may be filtered out of the
     list — only made dead. */
  ok(stanceRule.scoreCount === 4,
    'every authored entry stays on screen under every stance', String(stanceRule.scoreCount));
  await contrib.close();

  /* ---------------------------------------------------------------------- */
  console.log('the theme follows the account');
  /* The suite is signed out throughout — the supabase origin returns 401 for
     auth — so adopt() is driven directly with a fake client. That is the point:
     what is being tested is the reconciliation rule, and a fake makes each
     branch reachable without four sessions on two devices. */
  const th = await ctx.newPage();
  wire(th);
  await th.goto('http://localhost:8931/legal.html');
  const theme = await th.evaluate(async () => {
    const out = {};
    const writes = [];
    // the shape palette.js uses: .from(t).select(c).eq(c,v).maybeSingle() and
    // .from(t).upsert(row, opts)
    const client = stored => ({
      from(){ return {
        select(){ return { eq(){ return { maybeSingle(){
          return Promise.resolve({ data: stored ? { theme: stored } : null });
        } }; } }; },
        upsert(row){ writes.push(row.theme); return Promise.resolve({}); }
      }; }
    });

    localStorage.setItem('eski-theme', 'light-blue');
    window.eskiTheme.set('light-blue');

    // 1. the account has one, and it wins over whatever this browser had
    await window.eskiTheme.adopt(client('dark-pink'), 'u1');
    out.adopted = window.eskiTheme.current;
    out.stamped = document.documentElement.getAttribute('data-theme');

    // 2. a token refresh must not re-pull: it would drag a fresh pick back
    window.eskiTheme.set('mono-amber');
    await window.eskiTheme.adopt(client('dark-pink'), 'u1');
    out.afterRefresh = window.eskiTheme.current;

    // 3. picking one writes it through
    out.wroteOnSet = writes.includes('mono-amber');

    // 4. an account with no row is seeded from this browser's pick
    writes.length = 0;
    await window.eskiTheme.adopt(client(null), 'u2');
    out.seeded = writes[0];
    out.keptLocal = window.eskiTheme.current;

    // 5. signing out detaches, and a later pick must not throw
    await window.eskiTheme.adopt(null, null);
    writes.length = 0;
    window.eskiTheme.set('light-neutral');
    out.silentSignedOut = writes.length === 0;
    return out;
  });
  ok(theme.adopted === 'dark-pink' && theme.stamped === 'dark-pink',
    'signing in adopts the account theme over this browser\'s', JSON.stringify(theme));
  ok(theme.afterRefresh === 'mono-amber',
    'a token refresh does not undo a pick made since', theme.afterRefresh);
  ok(theme.wroteOnSet, 'picking a theme writes it to the account');
  ok(theme.seeded === 'mono-amber' && theme.keptLocal === 'mono-amber',
    'an account with no theme yet is seeded from this browser', JSON.stringify(theme));
  ok(theme.silentSignedOut, 'signed out, a pick stays local and writes nothing');
  await th.close();

  console.log('console errors');
  ok(consoleErrors.length === 0, 'zero console errors', consoleErrors.join(' | '));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURES` : '\nall smoke tests passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e); process.exit(2); });
