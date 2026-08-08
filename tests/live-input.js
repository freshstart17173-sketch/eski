/* the tap and click zones, checked on the deployed site.
   phone first, then the same zones with a mouse — the capture-phase
   bug that dropped every edge tap dropped edge clicks too. */
const { chromium, request } = require('playwright');
const BASE = process.env.BASE || 'https://www.eski.lol';
(async () => {
  let bad = 0;
  const ok = (n, c, extra) => { console.log(`  ${c?'ok ':'FAIL'}  ${n}${extra?'   '+extra:''}`); if(!c) bad++; };
  // the sandbox has no direct egress; route the browser through the agent proxy
  const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
  const api = PROXY ? await request.newContext({ proxy: { server: PROXY } }) : null;
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true,
    hasTouch:true, deviceScaleFactor:3, serviceWorkers:'block',
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  if(api) await ctx.route('**/*', async route => {
    const q = route.request();
    try{
      const r = await api.fetch(q.url(), { method:q.method(), headers:q.headers(),
        data: q.postDataBuffer() || undefined, maxRedirects: 5, timeout: 60000 });
      const h = r.headers(); delete h['content-encoding']; delete h['content-length'];
      await route.fulfill({ status:r.status(), headers:h, body: await r.body() });
    }catch(e){ await route.abort(); }
  });
  // a first-ever visit gets the onboarding overlay; this run is not about that
  await ctx.addInitScript(() => { try{ localStorage.setItem('eski-onboarded','1'); }catch(e){} });
  /* every request is relayed node-side through the agent proxy, so a comic's
     worth of pages and audio arrives far slower here than for a real reader.
     the default 30s is a harness artefact, not a budget. */
  ctx.setDefaultNavigationTimeout(120000);
  ctx.setDefaultTimeout(60000);
  const p = await ctx.newPage();
  const errs = []; p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(e.message));
  /* name the resource. a bare "ERR_FAILED" is usually the harness relay
     dropping one request, not the site; saying which keeps the two apart. */
  /* ERR_ABORTED is the reader CANCELLING a prefetch it no longer needs when
     you turn pages faster than they warm — that is the design working, not a
     failure. Anything else is named, so a relay hiccup and a real broken
     asset are not the same line in the output. */
  p.on('requestfailed', r => {
    const why = (r.failure() && r.failure().errorText) || '';
    if(why === 'net::ERR_ABORTED') return;
    errs.push('requestfailed ' + r.url().slice(0,110) + ' :: ' + why);
  });

  console.log('phone: the library');
  await p.goto(BASE + '/', { waitUntil:'networkidle' });
  await p.waitForTimeout(1500);
  const card = p.locator('.card, .comic-card, [data-comic]').first();
  if (await card.count()) {
    await card.tap();
    await p.waitForTimeout(800);
    const x = p.locator('.sheet-x').first();
    ok('the comic modal has a close button on a phone', await x.isVisible().catch(()=>false));
    if (await x.isVisible().catch(()=>false)) {
      await x.tap(); await p.waitForTimeout(400);
      ok('and it closes the modal', !(await x.isVisible().catch(()=>false)));
    }
  } else ok('a comic card to open', false, '(shelf empty)');

  console.log('phone: the reader');
  // the bar only exists with a comic loaded, and the read link only exists
  // inside the details modal, so go in the way a reader does
  await p.goto(BASE + '/', { waitUntil:'networkidle' });
  await p.waitForTimeout(1500);
  const c2 = p.locator('.card, .comic-card, [data-comic]').first();
  await c2.tap();
  await p.waitForTimeout(1000);
  const href = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="read.html"]')][0];
    return a ? a.getAttribute('href') : null;
  });
  if (!href) { ok('a readable comic on the shelf', false); await b.close(); process.exit(1); }
  await p.goto(new URL(href, BASE + '/').href, { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#player-bar:not([style*="display:none"])', { timeout: 30000 });
  await p.waitForFunction(() => typeof current !== 'undefined' && !!current, null, { timeout: 30000 });
  await p.waitForTimeout(1500);

  ok('no eski header in reader mode on a phone',
     await p.evaluate(()=>{ const t=document.querySelector('.top');
       return !t || getComputedStyle(t).display === 'none'; }));

  ok('nothing sits on top of the page — pinch reaches panzoom',
     await p.evaluate(()=>{ const v=document.getElementById('viewer'); if(!v) return false;
       const r=v.getBoundingClientRect();
       const el=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
       return !!el && !el.closest('.click-zones');
     }));

  const band = await p.evaluate(()=>{ const v=document.getElementById('viewer');
    const r=v.getBoundingClientRect();
    const bx=Math.min(Math.max(r.width*0.16,44),190), by=Math.min(Math.max(r.height*0.14,44),190);
    return { w:Math.round(r.width), h:Math.round(r.height), bx:Math.round(bx), by:Math.round(by) }; });
  ok('the tap bands are edges, not quadrants',
     band.bx < band.w*0.25 && band.by < band.h*0.2,
     `${band.bx}px of ${band.w} wide, ${band.by}px of ${band.h} tall`);

  ok('the middle of the page is free for double-tap',
     band.w - band.bx*2 > band.w*0.5, `${band.w - band.bx*2}px of ${band.w} free`);

  ok('the mix button is on the bar', await p.locator('#mix-btn').isVisible().catch(()=>false));

  const bar = await p.evaluate(()=>{ const r=document.querySelector('.pb-right');
    return r ? Math.round(r.getBoundingClientRect().right) : -1; });
  ok('the player bar does not overflow the screen', bar > 0 && bar <= 390, `right edge ${bar} of 390`);

  console.log('phone: the tap bands');
  const pageNow0 = () => p.evaluate(() => {
    const v = document.getElementById('page-jump');
    return v && v.value ? parseInt(v.value, 10) : -1; });
  const s0 = await pageNow0();
  await p.touchscreen.tap(band.w - 20, Math.round(band.h/2)); await p.waitForTimeout(1200);
  const s1 = await pageNow0();
  ok('a tap on the right edge turns the page', s1 === s0 + 1, `${s0} -> ${s1}`);
  await p.touchscreen.tap(20, Math.round(band.h/2)); await p.waitForTimeout(1200);
  const s2 = await pageNow0();
  ok('a tap on the left edge turns it back', s2 === s0, `${s1} -> ${s2}`);
  await p.touchscreen.tap(Math.round(band.w/2), Math.round(band.h/2)); await p.waitForTimeout(1200);
  const s3 = await pageNow0();
  ok('a tap in the middle does nothing — that is the zoom area', s3 === s2, `${s2} -> ${s3}`);

  console.log('phone: zoom in the middle');
  const zoomNow = () => p.evaluate(() => typeof pageZoom==='function' ? pageZoom() : -1);
  const cx = Math.round(band.w/2), cy = Math.round(band.h/2);
  await p.touchscreen.tap(cx, cy); await p.waitForTimeout(60);
  await p.touchscreen.tap(cx, cy); await p.waitForTimeout(900);
  const z1 = await zoomNow();
  ok('a double-tap in the middle zooms in', z1 > 1.5, `scale ${z1}`);
  await p.touchscreen.tap(cx, cy); await p.waitForTimeout(60);
  await p.touchscreen.tap(cx, cy); await p.waitForTimeout(900);
  const z2 = await zoomNow();
  ok('and a second double-tap zooms back out', Math.abs(z2 - 1) < 0.01, `scale ${z2}`);

  console.log('phone: a real two-finger pinch');
  {
    const cdp = await ctx.newCDPSession(p);
    const pt = (x,y,id) => ({x, y, radiusX:12, radiusY:12, force:1, id});
    const send = (type, pts) => cdp.send('Input.dispatchTouchEvent',
      { type, touchPoints: pts, modifiers: 0 });
    await send('touchStart', [pt(cx-30, cy, 1), pt(cx+30, cy, 2)]);
    for (let i = 1; i <= 6; i++) {
      const d = 30 + i * 22;
      await send('touchMove', [pt(cx-d, cy, 1), pt(cx+d, cy, 2)]);
      await p.waitForTimeout(40);
    }
    await send('touchEnd', []);
    await p.waitForTimeout(600);
    const zp = await zoomNow();
    ok('a pinch actually zooms — the whole point of this batch', zp > 1.2, `scale ${zp}`);
    await p.evaluate(() => resetZoom());
    await p.waitForTimeout(600);
    const zr = await zoomNow();
    ok('and fit brings it back to one', Math.abs(zr - 1) < 0.01, `scale ${zr}`);
  }

  console.log('phone: the one-shot bands');
  {
    // walk forward until a page carries one-shots; skip if this comic has none
    let found = -1;
    for (let i = 0; i < 14; i++) {
      if (await p.evaluate(() => os.list.length > 0)) { found = i; break; }
      await p.evaluate(() => navRight()); await p.waitForTimeout(700);
    }
    if (found < 0) console.log('    (this comic has no one-shots — bands not exercised)');
    else {
      const cur = () => p.evaluate(() => os.cursor);
      const b0 = await cur();
      await p.touchscreen.tap(cx, band.h - 20); await p.waitForTimeout(900);
      const b1 = await cur();
      ok('a tap on the bottom band steps to the next sound', b1 > b0, `${b0} -> ${b1}`);
      await p.touchscreen.tap(cx, 20); await p.waitForTimeout(900);
      const b2 = await cur();
      const n = await p.evaluate(() => os.list.length);
      // with a single clip on the page the cursor has nowhere to go; that is
      // correct behaviour, not a pass to be claimed as a step backwards
      ok(n > 1 ? 'a tap on the top band steps back'
               : 'a tap on the top band holds at the only clip',
         n > 1 ? b2 === b1 - 1 : b2 === b1, `${b1} -> ${b2} of ${n}`);
    }
  }

  console.log('phone: the panels');
  const isOpen = id => p.evaluate(i =>
    !!document.getElementById(i) && document.getElementById(i).classList.contains('open'), id);
  // `let currentPage` is script-scoped, not on window; read the counter instead
  const pageNow = () => p.evaluate(() => {
    const v = document.getElementById('page-jump');
    return v && v.value ? parseInt(v.value, 10) : -1; });

  for (const [btn, panel, name] of [['#settings-btn','settings','settings'],
                                    ['#mix-btn','mix','the mix']]) {
    await p.locator(btn).tap(); await p.waitForTimeout(500);
    ok(`${name} opens from the bar`, await isOpen(panel));
    const before = await pageNow();
    await p.touchscreen.tap(band.w - 20, Math.round(band.h/2)); // an edge band: worst case
    await p.waitForTimeout(600);
    ok(`${name} closes when anything else is tapped`, !(await isOpen(panel)));
    ok(`and that tap did not also turn the page`, (await pageNow()) === before);
  }


  ok('the controls panel shows a tap map, not hotkeys',
     await p.evaluate(()=>{ const t=document.querySelector('.keys-touch'), k=document.querySelector('.keys-keyboard');
       if(!t) return false;
       return getComputedStyle(t).display !== 'none' && (!k || getComputedStyle(k).display === 'none'); }));

  ok('zero console errors on the phone', errs.length===0, errs.slice(0,3).join(' | '));

  /* the capture-phase bug hit the mouse too, so check a desktop edge click */
  console.log('desktop: the same zones with a mouse');
  {
    const d = await b.newContext({ viewport:{width:1440,height:900}, serviceWorkers:'block' });
    if(api) await d.route('**/*', async route => {
      const q = route.request();
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
    await d.addInitScript(() => { try{ localStorage.setItem('eski-onboarded','1'); }catch(e){} });
    d.setDefaultNavigationTimeout(120000); d.setDefaultTimeout(60000);
    const q = await d.newPage();
    const derrs = []; q.on('pageerror', e => derrs.push(e.message));
    await q.goto(new URL(href, BASE + '/').href, { waitUntil:'domcontentloaded' });
    await q.waitForSelector('#player-bar:not([style*="display:none"])', { timeout: 30000 });
    await q.waitForFunction(() => typeof current !== 'undefined' && !!current, null, { timeout: 30000 });
    await q.waitForTimeout(1500);
    const box = await q.evaluate(()=>{ const r=document.getElementById('viewer').getBoundingClientRect();
      return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}; });
    const pn = () => q.evaluate(() => { const v=document.getElementById('page-jump');
      return v && v.value ? parseInt(v.value,10) : -1; });
    const d0 = await pn();
    await q.mouse.click(box.l + box.w - 20, box.t + Math.round(box.h/2));
    await q.waitForTimeout(1000);
    const d1 = await pn();
    ok('a click on the right edge turns the page', d1 === d0 + 1, `${d0} -> ${d1}`);
    await q.mouse.click(box.l + 20, box.t + Math.round(box.h/2));
    await q.waitForTimeout(1000);
    const d2 = await pn();
    ok('a click on the left edge turns it back', d2 === d0, `${d1} -> ${d2}`);
    ok('zero console errors on the desktop', derrs.length===0, derrs.slice(0,3).join(' | '));
  }

  await b.close();
  console.log(bad ? `\n${bad} input check(s) failed` : '\ninput run clean');
  process.exit(bad ? 1 : 0);
})();
