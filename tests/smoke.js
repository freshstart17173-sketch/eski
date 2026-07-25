/* eski smoke tests: serve the project over localhost, intercept CDNs, drive the UI.
   covers the reader (index.html), the studio (studio.html), and the library. */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const VENDOR = path.join(__dirname, 'vendor');
const DL = path.join(__dirname, 'dl');
fs.mkdirSync(DL, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
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
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
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
  const track = () => page.textContent('#pb-track');

  console.log('reader: boot + demo');
  await page.goto('http://localhost:8931/read.html');
  await page.waitForSelector('#player-bar', { state: 'visible' });
  ok(await page.textContent('#vt-info-text') === 'page 1 of 6', 'demo opens on page 1 of 6',
    await page.textContent('#vt-info-text'));
  await page.waitForFunction(() => document.getElementById('pb-track').textContent.includes('first song'));
  ok(true, 'track 1 named');
  ok(await page.title() === 'eski', 'title is just eski');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => location.hash === '#test-comic/page=2');
  ok(true, 'hash follows navigation');

  console.log('reader: colour match');
  await page.waitForFunction(() =>
    document.documentElement.style.getPropertyValue('--tintsat').trim() === '9%');
  ok(true, 'tint applied from cover');
  await page.click('#settings-btn');
  await page.click('#set-tint');
  await page.waitForFunction(() =>
    document.documentElement.style.getPropertyValue('--tintsat').trim() === '0%');
  ok(true, 'tint toggles off to neutral');
  await page.click('#set-tint');
  await page.click('#settings-btn');

  console.log('reader: deep link');
  const page2 = await ctx.newPage();
  wire(page2);
  await page2.goto('http://localhost:8931/read.html#test-comic/page=5');
  await page2.waitForSelector('#player-bar', { state: 'visible' });
  await page2.waitForFunction(() => document.getElementById('page-jump').value === '5');
  ok(true, 'deep link lands on page 5');
  await page2.waitForFunction(() => document.getElementById('pb-track').textContent.includes('second song'));
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
  ok(await page.evaluate(() => document.getElementById('pb-tl').classList.contains('rtl')),
    'page bar flipped');

  console.log('reader: spread precedence (leftmost page wins)');
  await page.evaluate(() => goToPage(2, true)); // pages 3 and 4; page 4 triggers track 2
  await page.evaluate(() => { if (!document.getElementById('spread-btn').classList.contains('on')) toggleSpread(); });
  await page.waitForFunction(() => document.getElementById('pb-track').textContent.includes('second song'));
  ok(true, 'rtl spread: leftmost (page 4) track plays');
  await page.click('#settings-btn');
  await page.click('#set-dir button[data-m="ltr"]');
  await page.click('#settings-btn');
  await page.waitForFunction(() => document.getElementById('pb-track').textContent.includes('first song'));
  ok(true, 'ltr spread: leftmost (page 3) track plays');
  await page.evaluate(() => { if (document.getElementById('spread-btn').classList.contains('on')) toggleSpread(); });
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
  ok(await page.isHidden('#click-zones'), 'click zones off');
  ok(await page.evaluate(() => document.getElementById('spread-btn').disabled), 'spread disabled');
  // pages lazy-load, so scrollHeight grows as images arrive: re-apply the scroll
  // on every poll instead of once, or the midline can settle on an earlier page
  await page.waitForFunction(() => {
    const sc = document.getElementById('scroll-pages');
    sc.scrollTop = sc.scrollHeight;
    return document.getElementById('page-jump').value === '6';
  }, null, { timeout: 20000 });
  ok(true, 'midline page tracks scroll (page 6)');
  await page.waitForFunction(() => document.getElementById('pb-track').textContent.includes('second song'));
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
  await page.waitForFunction(() => document.getElementById('pb-track').textContent.includes('first song'));
  await page.waitForFunction(() =>
    document.getElementById('pb-track').textContent.includes('second song'), null, { timeout: 8000 });
  ok(true, 'playlist advanced on ended');
  ok(await jump() === '1', 'page did not move', await jump());
  await page.waitForFunction(() =>
    document.getElementById('pb-track').textContent.includes('end of playlist'), null, { timeout: 8000 });
  ok(true, 'playlist ends, no loop');
  await page.click('#settings-btn');
  await page.click('#set-playback button[data-m="file"]');
  await page.click('#settings-btn');

  console.log('reader: queue file (two tracks on one page)');
  await page.goto('http://localhost:8931/read.html?read=fx/queue.eski');
  await page.waitForSelector('#player-bar', { state: 'visible' });
  await page.keyboard.press('Shift');   // any gesture unlocks audio after a fresh load
  await page.waitForFunction(() => document.getElementById('vt-info-text').textContent.includes('of 3'));
  await page.waitForFunction(() => document.getElementById('pb-track').textContent.includes('first song'));
  ok((await page.textContent('#pb-sub')).includes('1/2'), 'queue position shown', await page.textContent('#pb-sub'));
  // out point at 0.5s: the second track should take over without a page turn
  await page.waitForFunction(() =>
    document.getElementById('pb-track').textContent.includes('second song'), null, { timeout: 8000 });
  ok(true, 'queue advanced at the out point');
  ok(await jump() === '1', 'still on page 1');

  console.log('reader: fullscreen focus');
  await page.click('button[title="fullscreen (f)"]');
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
  ok(await bigp.evaluate(() => /scale\((?!1\))/.test(document.getElementById('pages').style.transform)),
    'wheel zooms the page in', await bigp.evaluate(() => document.getElementById('pages').style.transform));
  ok(await bigp.evaluate(() => document.getElementById('click-zones').style.pointerEvents === 'none'),
    'page-turn zones disabled while zoomed');
  await bigp.evaluate(() => window.showPage(1, false, false));
  await bigp.waitForFunction(() => document.getElementById('pages').style.transform === 'translate(0px, 0px) scale(1)');
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
  ok(await osCount() === '0/2', 'page 2 shows 2 one-shots', await osCount());
  ok((await osp.textContent('#pb-track')).includes('bg'), 'soundtrack still owns the one-shot page',
    await osp.textContent('#pb-track'));
  ok(await osp.evaluate(() => document.getElementById('tut-os').classList.contains('show')),
    'first-run tutorial shows');
  // down = next, up = previous, no wrap by default
  await osp.keyboard.press('ArrowDown'); ok(await osCount() === '1/2', 'down = next one-shot', await osCount());
  // the indicator reflects that a one-shot is actually playing
  let osPlaying = false;
  try { await osp.waitForFunction(() => document.getElementById('os-hint').classList.contains('playing'),
    null, { timeout: 4000 }); osPlaying = true; } catch (e) {}
  ok(osPlaying, 'indicator shows the one-shot playing');
  await osp.keyboard.press('ArrowDown'); ok(await osCount() === '2/2', 'down again', await osCount());
  await osp.keyboard.press('ArrowDown'); ok(await osCount() === '2/2', 'no wrap at the end', await osCount());
  await osp.keyboard.press('ArrowUp'); ok(await osCount() === '1/2', 'up = previous one-shot', await osCount());
  // turning the page resets the one-shot cursor + hides the indicator
  await osp.evaluate(() => goToPage(0, true));
  await osp.waitForFunction(() => document.getElementById('os-hint').style.display === 'none');
  ok(true, 'one-shots reset on page turn');
  // space no longer turns the page; it pauses the soundtrack
  const pgBefore = await osp.inputValue('#page-jump');
  await osp.keyboard.press('Space');
  await osp.waitForTimeout(60);
  ok(await osp.inputValue('#page-jump') === pgBefore, 'space no longer turns the page');
  ok(/paused/.test(await osp.textContent('#pb-sub')), 'space pauses the soundtrack', await osp.textContent('#pb-sub'));
  await osp.keyboard.press('Space'); // resume
  // hotkeys panel toggles with ?
  await osp.keyboard.press('Shift+Slash'); // "?"
  ok(await osp.evaluate(() => document.getElementById('keys-panel').classList.contains('open')),
    'hotkeys panel opens with ?');
  await osp.keyboard.press('Escape');
  ok(await osp.evaluate(() => !document.getElementById('keys-panel').classList.contains('open')),
    'escape closes the hotkeys panel');
  // loop setting wraps the cursor
  await osp.evaluate(() => { toggleOsLoop(); goToPage(1, true); });
  await osp.waitForFunction(() => document.getElementById('os-count').textContent === '0/2');
  await osp.keyboard.press('ArrowDown'); await osp.keyboard.press('ArrowDown'); await osp.keyboard.press('ArrowDown');
  ok(await osCount() === '1/2', 'loop setting wraps the cursor', await osCount());

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
    // the one-shot tests above left audio playing; silence the channel and let
    // its release debounce flush before measuring a clean idle
    os.el.pause(); await wait(900);
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
  ok(await comp.evaluate(() => document.querySelectorAll('.songknobs input').length === 3),
    'volume, trigger page and in point are all editable');
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
  await comp.click('#export-btn');
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
  await comp.click('.sec-head .zoomers button[title="bigger"]');
  ok(await comp.evaluate(() => document.querySelector('.chip-img').offsetWidth) > chipW0,
    'media tray zoom grows the image blocks');
  const pgW0 = await comp.evaluate(() => document.querySelector('.pgcard').offsetWidth);
  await comp.click('#pages-ctrls button[title="bigger pages"]');
  ok(await comp.evaluate(() => document.querySelector('.pgcard').offsetWidth) > pgW0,
    'page zoom grows the thumbnails');

  console.log('composer: removing a song from the panel');
  await comp.evaluate(() => openQueue(cState.tracks.find(t => t.type === 'music').from));
  const nMusic = await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length);
  await comp.click('.songrow button[title="remove"]');
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
  // the page with one-shots shows a single block with the count
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .osblock').length) === 1,
    'exactly one page shows a one-shot block');
  ok((await oc.textContent('.pgcard .osblock')).includes('2'), 'the block shows the one-shot count');
  // the page panel is docked and persistent, not a modal over the stage
  ok(await oc.isVisible('#qp'), 'page panel is always present');
  ok(await oc.evaluate(() => !document.getElementById('qp-scrim')), 'the modal scrim is gone');
  ok(await oc.evaluate(() => getComputedStyle(document.getElementById('qp')).position === 'static'),
    'page panel is docked in the layout, not floating');
  // selecting a page is enough to see everything on it
  await oc.click('.pgcard .osblock');
  ok(await oc.evaluate(() => document.querySelectorAll('#qp-list .oschip').length) === 2,
    'panel lists both one-shots for the selected page');
  ok((await oc.textContent('#info-song')).length > 0, 'panel says which song owns the page');
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard.sel').length === 1),
    'the selected page is marked in the grid');
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .inrange').length > 0),
    'pages inside a song range are marked');
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .trig').length > 0),
    'pages that trigger a song are marked');
  ok(await oc.evaluate(() => { openQueue(1); return document.getElementById('qp-title').textContent; })
    === 'page 1 of 3', 'clicking a page retargets the panel');
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
  await oc.click('#export-btn');
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

  console.log('studio: cast + slots round-trip through export');
  const dl2 = oc.waitForEvent('download');
  await oc.click('#export-btn');
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
  await oc.click('#export-btn');
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
  await page.waitForFunction(() => /\d\/2/.test(document.getElementById('pb-sub').textContent), null,
    { timeout: 8000 });
  await page.waitForFunction(() =>
    document.getElementById('pb-sub').textContent.includes('2/2'), null, { timeout: 8000 });
  ok(true, 'queue advances after re-import');

  console.log('reader: ?read= opens a specific eski from the library folder');
  const rp = await ctx.newPage();
  wire(rp);
  await rp.goto('http://localhost:8931/read.html?read=library/test-comic.eski');
  await rp.waitForSelector('#player-bar', { state: 'visible' });
  await rp.waitForFunction(() => document.getElementById('vt-info-text').textContent.includes('of 6'));
  ok(true, '?read= loaded the requested eski (6 pages)');
  await rp.close();

  console.log('reader: control icons painted');
  ok(await page.evaluate(() => document.querySelectorAll('.player-bar svg.ico, .site-header svg.ico').length) > 4,
    'reader chrome shows icons');
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
  await lib.click('.cover');
  await lib.waitForSelector('.overlay.open');
  ok((await lib.textContent('#overlay .modal p')).includes('browse and share more eskis in the discord'),
    'discord message in the modal');
  ok((await lib.getAttribute('#ov-read', 'href')).startsWith('read.html?read=library/'),
    'read-it opens the eski in the reader');
  await lib.keyboard.press('Escape');
  ok(await lib.evaluate(() => !document.getElementById('overlay').classList.contains('open')),
    'escape closes the overlay');

  console.log('library: local shelf (drop your own eskis in)');
  const beforeShelf = await lib.evaluate(() => document.querySelectorAll('.cell').length);
  await lib.setInputFiles('#shelf-input', path.join(FIX, 'queue.eski'));
  await lib.waitForFunction(n => document.querySelectorAll('.cell').length === n + 1, beforeShelf);
  ok(true, 'a shelved eski joins the grid');
  ok(await lib.evaluate(() => document.querySelectorAll('.cell .tag').length === 1),
    'shelved eskis are tagged, published ones are not');
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

  console.log('console errors');
  ok(consoleErrors.length === 0, 'zero console errors', consoleErrors.join(' | '));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURES` : '\nall smoke tests passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e); process.exit(2); });
