/* the mobile batch, checked on the deployed site */
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
  const p = await ctx.newPage();
  const errs = []; p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(e.message));

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
  await p.goto(new URL(href, BASE + '/').href, { waitUntil:'networkidle' });
  await p.waitForTimeout(4000);

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

  await b.close();
  console.log(bad ? `\n${bad} mobile check(s) failed` : '\nmobile run clean');
  process.exit(bad ? 1 : 0);
})();
