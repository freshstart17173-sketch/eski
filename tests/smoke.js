/* eski smoke tests: serve the project over localhost, intercept CDNs, drive the UI.
   covers the reader (index.html), the composer (composer.html), and the library. */
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
    // /fx/<name> serves a raw fixture file (used by ?read= tests)
    if (p.startsWith('/fx/')) {
      const f = path.join(FIX, p.slice('/fx/'.length));
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
    p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  };
  const page = await ctx.newPage();
  wire(page);
  const jump = () => page.inputValue('#page-jump');
  const track = () => page.textContent('#pb-track');

  console.log('reader: boot + demo');
  await page.goto('http://localhost:8931/');
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
  await page2.goto('http://localhost:8931/#test-comic/page=5');
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
  await page.evaluate(() => {
    const sc = document.getElementById('scroll-pages');
    sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForFunction(() => document.getElementById('page-jump').value === '6');
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
  await page.setInputFiles('#file-input', path.join(FIX, 'queue.eski'));
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
  await bigp.goto('http://localhost:8931/index.html?read=fx/big.eski');
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
  await osp.goto('http://localhost:8931/index.html?read=fx/oneshots.eski');
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
  await osp.close();

  /* ================= composer ================= */
  console.log('composer: import media (merged)');
  const comp = await ctx.newPage();
  wire(comp);
  await comp.goto('http://localhost:8931/composer.html');
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

  console.log('composer: audio into the bay, then placed on the timeline');
  await comp.setInputFiles('#in-media', path.join(FIX, 'a.wav'));
  await comp.waitForFunction(() => audioPool.length === 1);
  ok(await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length) === 0,
    'imported audio stays in the bay, not auto-placed');
  await comp.waitForFunction(() => Object.values(audioStore)[0].peaks, null, { timeout: 10000 });
  ok(true, 'waveform peaks decoded');
  ok(await comp.isVisible('#bay-auds .chip-aud'), 'audio block in bay');
  ok(await comp.isVisible('#bay-auds .chip-aud canvas'), 'bay block shows a waveform');
  // place from the pool onto page 3 (the drag path calls this)
  await comp.evaluate(() => addTrackFromPool(audioPool[0], 3));
  await comp.waitForFunction(() => cState.tracks.some(t => t.type === 'music' && t.from === 3));
  ok(true, 'placed a track from the bay at page 3');
  ok(await comp.isVisible('.tl-band canvas'), 'band waveform drawn on the timeline');

  console.log('composer: select shows the clip bar (no big side panel)');
  ok(!(await comp.$('#p-start')) && !(await comp.$('#p-end')),
    'no in/out/crossfade per-track panel');
  await comp.evaluate(() => { sel = cState.tracks.find(t => t.type === 'music').tid; render(); });
  ok(await comp.isVisible('#cb-name'), 'clip bar name field appears on select');

  console.log('composer: slip by dragging the band body (in point + waveform move)');
  const startBefore = await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').start);
  const body = await comp.locator('.tl-band.sel .body').boundingBox();
  await comp.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await comp.mouse.down();
  await comp.mouse.move(body.x + body.width / 2 - 40, body.y + body.height / 2, { steps: 5 });
  await comp.mouse.up();
  ok(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').start) > startBefore,
    'slip changed the in point', String(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').start)));

  console.log('composer: grip drag moves the trigger page');
  await comp.evaluate(() => { sel = cState.tracks.find(t => t.type === 'music').tid; render(); });
  const zoomXBefore = await comp.evaluate(() => zoomX);
  const grip = await comp.locator('.tl-band.sel .grip').boundingBox();
  await comp.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await comp.mouse.down();
  await comp.mouse.move(grip.x + grip.width / 2 + zoomXBefore, grip.y + grip.height / 2, { steps: 5 });
  await comp.mouse.up();
  ok(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').from) === 4,
    'grip moved the trigger to page 4',
    String(await comp.evaluate(() => cState.tracks.find(t => t.type === 'music').from)));

  console.log('composer: queue nesting via clip bar');
  await comp.evaluate(() => { sel = cState.tracks.find(t => t.type === 'music').tid; render(); });
  await comp.click('#cb-queue');
  await comp.waitForFunction(() => cState.tracks.filter(t => t.type === 'music').length === 2);
  ok(await comp.evaluate(() => {
    const m = cState.tracks.filter(t => t.type === 'music'); return m[0].from === m[1].from;
  }), 'queued track shares the trigger page');

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

  console.log('composer: zoom out to whole comic + minimap');
  ok(await comp.isVisible('#minimap'), 'minimap zoom/pan bar visible');
  await comp.click('button[title="zoom in"]');
  const zIn = await comp.evaluate(() => zoomX);
  ok(zIn > zoomXBefore, 'zoom in grows page width');
  await comp.click('button[title="fit whole comic"]');
  ok(await comp.evaluate(() => cState.pages.length * zoomX <= document.getElementById('tl-scroll').clientWidth + 2),
    'fit zooms out to show the entire comic');

  console.log('composer: page range selection');
  await comp.evaluate(() => { document.querySelector('.tl-range').click(); });
  ok(await comp.evaluate(() => selRange !== null), 'clicking a range selects it');
  ok(await comp.isVisible('#sel-band'), 'selection highlight shown');

  console.log('composer: pages mode reorder + remove');
  await comp.click('#modeswitch button[data-m="pages"]');
  ok(await comp.evaluate(() => document.querySelectorAll('.pgcard').length) === 5, 'pages mode lists every page');
  const firstName = await comp.evaluate(() => cState.pages[0].name);
  await comp.evaluate(() => movePage(0, 2));
  ok(await comp.evaluate((n) => cState.pages[2].name === n, firstName), 'page reordered via movePage');
  await comp.evaluate(() => removePage(4));
  ok(await comp.evaluate(() => cState.pages.length) === 4, 'page removed');
  await comp.evaluate(() => movePage(2, 0)); // restore order enough; re-add a page
  await comp.click('#modeswitch button[data-m="sound"]');

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
  await comp.click('#modeswitch button[data-m="pages"]');
  const pgW0 = await comp.evaluate(() => document.querySelector('.pgcard').offsetWidth);
  await comp.click('#pages-ctrls button[title="bigger pages"]');
  ok(await comp.evaluate(() => document.querySelector('.pgcard').offsetWidth) > pgW0,
    'pages timeline zoom grows the thumbnails');
  await comp.click('#modeswitch button[data-m="sound"]');

  console.log('composer: drag a band onto the trash bar to delete');
  await comp.evaluate(() => { sel = cState.tracks.find(t => t.type === 'music').tid; render(); });
  const nMusic = await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length);
  const gb = await comp.locator('.tl-band.sel .grip').boundingBox();
  const vp = comp.viewportSize();
  await comp.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await comp.mouse.down();
  await comp.mouse.move(gb.x + gb.width / 2, gb.y + 40, { steps: 3 });
  await comp.mouse.move(vp.width / 2, vp.height - 38, { steps: 10 }); // onto the trash bar
  ok(await comp.evaluate(() => document.getElementById('trash-bar').classList.contains('show')),
    'trash bar appears while dragging');
  await comp.mouse.up();
  ok(await comp.evaluate(() => cState.tracks.filter(t => t.type === 'music').length) === nMusic - 1,
    'grip-drag onto the trash removed the track');
  await comp.close();

  console.log('composer: one-shots (pages-mode block + queue panel)');
  const oc = await ctx.newPage();
  wire(oc);
  await oc.goto('http://localhost:8931/composer.html');
  await oc.setInputFiles('#in-eski', path.join(FIX, 'oneshots.eski'));
  await oc.waitForFunction(() => cState.tracks.filter(t => t.type === 'oneshot').length === 2);
  ok(await oc.evaluate(() => cState.tracks.filter(t => t.type === 'music').length) === 1,
    'opened: 1 music + 2 one-shots');
  ok(await oc.evaluate(() => !document.querySelector('#modeswitch button[data-m="oneshots"]')),
    'the separate one-shots mode is gone');
  await oc.click('#modeswitch button[data-m="pages"]');
  await oc.waitForSelector('.pgcard');
  // the page with one-shots shows a single block with the count
  ok(await oc.evaluate(() => document.querySelectorAll('.pgcard .osblock').length) === 1,
    'exactly one page shows a one-shot block');
  ok((await oc.textContent('.pgcard .osblock')).includes('2'), 'the block shows the one-shot count');
  ok(await oc.isVisible('#os-tool'), 'the draggable one-shot tool is present in pages mode');
  // clicking the block opens the queue panel with both one-shots
  await oc.click('.pgcard .osblock');
  ok(await oc.isVisible('#qp'), 'queue panel opens');
  ok(await oc.evaluate(() => document.querySelectorAll('#qp-list .oschip').length) === 2,
    'queue lists both one-shots');
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
  ok(await oc.evaluate(() => hasBlock(1)), 'one-shot tool creates a block on an empty page');
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

  console.log('composer: media dock search + filter');
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
  await page.setInputFiles('#file-input', f1);
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
  await rp.goto('http://localhost:8931/index.html?read=library/test-comic.eski');
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
  await lib.goto('http://localhost:8931/library.html');
  await lib.waitForSelector('.cover img', { timeout: 12000 });
  ok(await lib.locator('.cover').count() === 2, 'two eskis from the folder');
  ok(await lib.evaluate(() => [...document.querySelectorAll('.cover img')].every(i => i.src.startsWith('blob:'))),
    'covers extracted from the eski manifests');
  const titles = await lib.evaluate(() => [...document.querySelectorAll('.cover .t')].map(t => t.textContent));
  ok(titles.some(t => /test comic|queue comic/.test(t)), 'titles read from manifest', titles.join(','));
  await lib.click('.cover');
  await lib.waitForSelector('.overlay.open');
  ok((await lib.textContent('.modal p')).includes('find all these eskis and more in the discord channel'),
    'discord message in the modal');
  ok((await lib.getAttribute('#ov-read', 'href')).startsWith('index.html?read=library/'),
    'read-it opens the eski in the reader');
  await lib.keyboard.press('Escape');
  ok(await lib.evaluate(() => !document.getElementById('overlay').classList.contains('open')),
    'escape closes the overlay');
  await lib.close();

  console.log('console errors');
  ok(consoleErrors.length === 0, 'zero console errors', consoleErrors.join(' | '));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURES` : '\nall smoke tests passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e); process.exit(2); });
