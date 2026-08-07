/* ================================================================
   THE LIVE RUN. publishes a real eski to production and reads it back.

   Everything else in tests/ drives localhost against fixtures. That
   suite cannot see the three things most likely to be broken in
   production and nowhere else:

     - /api/sign, a Vercel function that does not exist on a static
       server, holding real R2 credentials;
     - the bucket's CORS, which decides whether audio routed through
       Web Audio is sound or silence;
     - row level security, which decides whether an insert lands.

   So this one talks to www.eski.lol, the real Supabase project and the
   real bucket. It signs in as an ordinary account (see AUTH below),
   publishes a twelve page comic with two soundtracks and two spoken
   lines, then reads every page and plays every clip.

     node tests/live.js
     node tests/live.js --keep      leave the comic published

   ---------------------------------------------------------------
   AUTH. There is no guest mode and there must not be one. Publishing
   needs a row owned by auth.uid() and an upload url signed against a
   real access token, so a client-side "guest" flag cannot work at all
   — and one that did would be an unauthenticated write path to the
   bucket and the shelf. This uses a normal email account instead,
   created once with tests/live-account.sql. It has no powers a signed
   up reader does not have.
   ---------------------------------------------------------------

   NETWORK. If HTTPS_PROXY is set, every request the browser makes is
   fetched by the node driver instead, which is how this runs from a
   sandbox whose browser has no egress of its own. Unset, it is a plain
   browser hitting a plain website.
   ================================================================ */
const path = require('path');
const zlib = require('zlib');
const JSZip = require('jszip');
const { chromium, request } = require('playwright');

const SITE = process.env.ESKI_SITE || 'https://www.eski.lol';
const EMAIL = process.env.ESKI_TEST_EMAIL || 'harness@eski.test';
const PASSWORD = process.env.ESKI_TEST_PASSWORD || 'eski-harness-2026';
const KEEP = process.argv.includes('--keep');
const PAGES = 12;

let failures = 0;
const ok = (cond, name, extra) => {
  if(cond) console.log('  ok  ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

/* ---------------- the fixture, built here so nothing is stale ----------------
   every page is a different hue AND carries a white band whose height down the
   page is its page number, so "am I looking at page 7" is answerable from the
   picture alone and two pages can never be mistaken for each other. */
function pngChunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, [r, g, b], n){
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const bandTop = h * 0.07 * n, bandBottom = bandTop + h * 0.06;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const o = y * (w * 3 + 1) + 1 + x * 3;
    const band = y > bandTop && y < bandBottom;
    raw[o] = band ? 255 : r;
    raw[o + 1] = band ? 255 : Math.min(255, g + ((y / h) * 70 | 0));
    raw[o + 2] = band ? 255 : b;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds, freq, rate){
  const sr = rate || 8000, n = Math.round(sr * seconds), d = Buffer.alloc(n * 2);
  for(let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*i/sr) * 12000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(d.length, 40);
  return Buffer.concat([h, d]);
}
async function buildEski(){
  const zip = new JSZip();
  const hues = [[200,60,60],[60,140,200],[80,180,90],[200,150,60],[160,90,200],[220,90,140],
                [90,190,190],[230,120,60],[120,120,220],[70,200,140],[210,70,90],[140,160,60]];
  for(let i = 1; i <= PAGES; i++)
    zip.file('p' + String(i).padStart(2,'0') + '.png', png(600, 900, hues[i-1], i));
  /* long enough to cross the transcode floor, because a three second clip is
     not what the opus path exists for. 40 s of 44.1 kHz stereo-ish PCM is a
     few MB, which is the shape of a real score. */
  zip.file('audio/song-a.wav', wav(40.0, 220, 44100));
  zip.file('audio/song-b.wav', wav(40.0, 330, 44100));
  zip.file('audio/line-1.wav', wav(1.2, 500));
  zip.file('audio/line-2.wav', wav(1.2, 660));
  zip.file('.eski/manifest.json', JSON.stringify({
    version: 3, kind: 'base',
    meta: { title: 'Harness Run ' + new Date().toISOString().slice(0,19).replace('T',' '),
            creator: 'Test Harness', description: 'A twelve page check of pages, score and voices.',
            direction: 'ltr',
            cast: [{ key:'ana', name:'Ana', kind:'character', blurb:'the one who talks' }] },
    player: { volume: 80, crossfade: 0.4, loopMode: 'loop', playbackMode: 'sync' },
    tracks: [
      { id:'m1', title:'Song A', type:'music', file:'audio/song-a.wav', sync:{from:1} },
      { id:'m2', title:'Song B', type:'music', file:'audio/song-b.wav', sync:{from:7} },
      { id:'o1', title:'Ana line one', type:'oneshot', role:'line', character:'ana',
        file:'audio/line-1.wav', sync:{from:3} },
      { id:'o2', title:'Ana line two', type:'oneshot', role:'line', character:'ana',
        file:'audio/line-2.wav', sync:{from:3} }
    ]
  }));
  return zip.generateAsync({ type: 'nodebuffer' });
}

(async () => {
  const file = path.join(require('os').tmpdir(), 'eski-harness.eski');
  require('fs').writeFileSync(file, await buildEski());

  const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
  const api = PROXY ? await request.newContext({ proxy: { server: PROXY } }) : null;
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width:1440, height:900 },
    serviceWorkers: 'block' });
  if(api) await ctx.route('**/*', async route => {
    const q = route.request();
    try{
      const r = await api.fetch(q.url(), { method:q.method(), headers:q.headers(),
        data: q.postDataBuffer() || undefined, maxRedirects: 5, timeout: 60000 });
      const h = r.headers(); delete h['content-encoding']; delete h['content-length'];
      await route.fulfill({ status:r.status(), headers:h, body: await r.body() });
    }catch(e){ await route.abort(); }
  });

  const errs = [], bad = [];
  const wire = p => {
    p.on('console', m => { if(m.type() === 'error') errs.push('console: ' + m.text().slice(0,200)); });
    p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0,200)));
    /* "a 409" on its own is not a diagnosis. record which call, so a failure
       here names the request rather than the status. */
    p.on('response', async r => {
      if(r.status() < 400) return;
      let body = ''; try{ body = (await r.text()).slice(0, 220); }catch(e){}
      bad.push(r.request().method() + ' ' + r.status() + ' ' + r.url().replace(SITE,'') + ' :: ' + body);
    });
  };

  console.log('publish');
  const s = await ctx.newPage(); wire(s);
  await s.goto(SITE + '/studio.html', { waitUntil:'domcontentloaded', timeout:60000 });
  await s.waitForFunction(() => window.eski && window.eski.sb, null, { timeout:60000 });
  const auth = await s.evaluate(async ([email, password]) => {
    const r = await window.eski.sb.auth.signInWithPassword({ email, password });
    return r.error ? 'ERR ' + r.error.message : r.data.user.id;
  }, [EMAIL, PASSWORD]);
  ok(!auth.startsWith('ERR'), 'signed in to the live project', auth);
  if(auth.startsWith('ERR')){ await browser.close(); process.exit(1); }

  await s.reload({ waitUntil:'domcontentloaded' });
  await s.waitForFunction(() => window.eski && window.eski.user, null, { timeout:60000 });
  await s.setInputFiles('#in-eski', file);
  await s.waitForFunction(n => typeof cState !== 'undefined' && cState.pages.length === n &&
    cState.tracks.length === 4, PAGES, { timeout:90000 });
  ok(true, 'the composer imported ' + PAGES + ' pages and 4 tracks');

  const pubErr = await s.evaluate(async () => {
    const seen = [], orig = window.toast;
    window.toast = (m, k) => { if(k === 'error') seen.push(String(m)); return orig && orig(m, k); };
    try{ await publishComic(); }catch(e){ seen.push('threw: ' + ((e && e.message) || e)); }
    window.toast = orig;
    return seen;
  });
  ok(pubErr.length === 0, 'publish reported no errors', JSON.stringify(pubErr));

  const row = await s.evaluate(async () => {
    const sb = window.eski.sb;
    const u = (await sb.auth.getUser()).data.user;
    const r = await sb.from('comics').select('id,title,status')
      .eq('owner_id', u.id).order('created_at', { ascending:false }).limit(1);
    return r.error ? { err:r.error.message } : r.data[0];
  });
  ok(row && row.id && row.status === 'published', 'a published comic row exists', JSON.stringify(row));
  if(!row || !row.id){ console.log(JSON.stringify(errs, null, 1)); await browser.close(); process.exit(1); }
  console.log('    ' + row.id + '  ' + row.title);

  console.log('read: every page');
  const r = await ctx.newPage(); wire(r);
  await r.goto(SITE + '/read.html?read=db:' + row.id, { waitUntil:'domcontentloaded', timeout:60000 });
  await r.waitForSelector('#player-bar', { state:'visible', timeout:60000 });
  await r.keyboard.press('Shift');                        // any gesture unlocks audio
  ok(await r.textContent('#vt-info-text') === 'page 1 of ' + PAGES,
    'opens on page 1 of ' + PAGES, await r.textContent('#vt-info-text'));

  const seen = [];
  let stale = null, blank = null;
  for(let i = 0; i < PAGES; i++){
    await r.evaluate(n => goToPage(n, true), i);
    try{
      await r.waitForFunction(() => {
        const rec = warm.get(currentPage), img = document.getElementById('page-left');
        return rec && img.src === rec.url && img.complete && img.naturalWidth > 0;
      }, null, { timeout:25000 });
    }catch(e){
      stale = stale || await r.evaluate(() => JSON.stringify({ page: currentPage + 1,
        shown: document.getElementById('page-left').src.slice(-24) }));
    }
    const st = await r.evaluate(() => ({ src: document.getElementById('page-left').src,
      w: document.getElementById('page-left').naturalWidth }));
    if(!st.w) blank = blank || 'page ' + (i + 1);
    seen.push(st.src);
  }
  ok(!stale, 'every page turn lands on its own picture', stale);
  ok(!blank, 'no page rendered blank', blank);
  ok(new Set(seen).size === PAGES, 'all ' + PAGES + ' pages are different images',
    new Set(seen).size + ' distinct');

  /* what the reader actually pulled down, and how it was served. this is the
     assertion that would have caught the whole thing: octet-stream, no cache
     directive, and the author's original bytes rather than a display copy. */
  const delivery = await r.evaluate(() => ({
    shownIsDisplay: current.pages.every(p => p.url !== p.full),
    hasBlur: current.pages.every(p => !!p.blur),
    blurBytes: Math.round(current.pages.reduce((n,p)=>n+(p.blur||'').length,0)/current.pages.length)
  }));
  ok(delivery.shownIsDisplay, 'the reader is showing display copies, not the originals',
    JSON.stringify(delivery));
  ok(delivery.hasBlur, 'every page carries its own placeholder', JSON.stringify(delivery));
  const head = await api.fetch(await r.evaluate(() => current.pages[0].url), { method: 'GET' });
  const hh = head.headers();
  ok(/^image\//.test(hh['content-type'] || ''), 'pages are served as an image type',
    hh['content-type']);
  ok(/immutable/.test(hh['cache-control'] || ''), 'pages are served immutable',
    hh['cache-control'] || '(no cache-control)');
  const full = await api.fetch(await r.evaluate(() => current.pages[0].full), { method: 'GET' });
  console.log('    original ' + Math.round((await full.body()).length/1024) + ' KB -> display ' +
    Math.round((await head.body()).length/1024) + ' KB, placeholder ~' +
    Math.round(delivery.blurBytes/1024*0.75) + ' KB inline');

  /* THE POINT OF THE PLACEHOLDER, proved rather than assumed: hold one page's
     bytes back and check that what is on screen is that page's own 1 KB
     stand-in, not the previous page pretending to be this one.

     In its OWN CONTEXT, because the walk above has already pulled every page
     into the browser cache and they are served immutable — a second visit
     makes no request at all, so there would be nothing to hold back. (That
     is itself the cache header working; it just makes this untestable in a
     warm tab.) */
  /* THE OPUS COPY. The score is 40 s of 44.1 kHz PCM — a few MB, the shape of
     a real one — so the transcode floor is crossed and there should be a
     second, much smaller object beside it. And the reader should be playing
     THAT one, because chromium can play opus in webm. */
  console.log('read: the opus copy');
  const au = await r.evaluate(async () => {
    const sb = window.eski.sb;
    const t = await sb.from('tracks').select('title,type,audio_key,audio_opus_key')
      .eq('comic_id', current.baseId).eq('type', 'music').order('order_idx');
    return { rows: t.data || [], err: t.error && t.error.message,
      playsOpus: !!new Audio().canPlayType('audio/webm; codecs="opus"'),
      using: (current.tracks.find(x => x.type === 'music') || {}).url };
  });
  const withOpus = au.rows.filter(x => x.audio_opus_key);
  ok(withOpus.length === au.rows.length && au.rows.length > 0,
    'every score got an opus copy', JSON.stringify(au.rows.map(x => !!x.audio_opus_key)));
  if(withOpus.length){
    const orig = await api.fetch(SITE.replace(/^https:\/\/www\./,'https://') && await r.evaluate(k =>
      window.eski.mediaUrl(k), withOpus[0].audio_key));
    const op = await api.fetch(await r.evaluate(k => window.eski.mediaUrl(k), withOpus[0].audio_opus_key));
    const ob = (await orig.body()).length, pb = (await op.body()).length;
    ok(pb < ob * 0.6, 'the opus copy is substantially smaller',
      Math.round(ob/1024) + ' KB -> ' + Math.round(pb/1024) + ' KB');
    console.log('    ' + Math.round(ob/1024) + ' KB original -> ' + Math.round(pb/1024) +
      ' KB opus  (' + (ob/pb).toFixed(1) + 'x)');
    ok(/^audio\//.test(op.headers()['content-type'] || ''), 'served as an audio type',
      op.headers()['content-type']);
  }
  ok(au.playsOpus && /\.webm$/.test(au.using || ''),
    'and this browser, which plays opus, is being given the opus copy',
    JSON.stringify({ playsOpus: au.playsOpus, using: (au.using || '').slice(-12) }));

  console.log('read: a slow page');
  const cold = await browser.newContext({ viewport: { width:1440, height:900 },
    serviceWorkers: 'block' });
  let stall = null, stallHits = 0;
  // the catch-all goes on FIRST: playwright checks handlers most-recent-first,
  // so the stall has to be registered after it to get a look in.
  if(api) await cold.route('**/*', async route => {
    const q = route.request();
    try{
      const rs = await api.fetch(q.url(), { method:q.method(), headers:q.headers(),
        data: q.postDataBuffer() || undefined, maxRedirects: 5, timeout: 60000 });
      const h = rs.headers(); delete h['content-encoding']; delete h['content-length'];
      await route.fulfill({ status:rs.status(), headers:h, body: await rs.body() });
    }catch(e){ await route.abort(); }
  });
  await cold.route(u => stall && u.href === stall, async route => {
    stallHits++;
    await new Promise(x => setTimeout(x, 3000));
    await route.fallback();
  });
  const c = await cold.newPage(); wire(c);
  await c.goto(SITE + '/read.html?read=db:' + row.id, { waitUntil:'domcontentloaded', timeout:60000 });
  await c.waitForSelector('#player-bar', { state:'visible', timeout:60000 });
  stall = await c.evaluate(() => current.pages[9].url);
  await c.evaluate(() => goToPage(9, true));
  await c.waitForTimeout(900);
  const mid = await c.evaluate(() => ({
    plate: document.getElementById('viewer').classList.contains('plate'),
    showingPlaceholder: document.getElementById('page-left').src.startsWith('data:'),
    counter: document.getElementById('vt-info-text').textContent
  }));
  ok(stallHits > 0, 'the slow page really was held back', 'stallHits=' + stallHits);
  ok(mid.plate && mid.showingPlaceholder,
    'a slow page shows its own placeholder, never the previous page', JSON.stringify(mid));
  ok(/10 of 12/.test(mid.counter), 'and the counter has already moved to it', mid.counter);
  await c.waitForFunction(() => !document.getElementById('viewer').classList.contains('plate'),
    null, { timeout: 25000 });
  ok(await c.evaluate(() => {
    const rec = warm.get(currentPage);
    return rec && document.getElementById('page-left').src === rec.url;
  }), 'and the real page replaces it when it lands');
  await cold.close();

  console.log('read: the score');
  await r.evaluate(() => goToPage(0, true));
  /* sampled twice rather than once. the track loops, so a single reading of
     currentTime can legitimately be near zero and prove nothing. */
  const song = await r.evaluate(async () => {
    const w = ms => new Promise(x => setTimeout(x, ms));
    unlockAudio(); await w(2500);
    const a = audio.active ? audio.active.currentTime : -1;
    await w(1200);
    const b = audio.active ? audio.active.currentTime : -1;
    const el = audio.active;
    return { title: (trackById(audio.currentTrackId) || {}).title, a: +a.toFixed(2), b: +b.toFixed(2),
      dur: el && el.duration ? +el.duration.toFixed(2) : 0, ready: el ? el.readyState : 0,
      err: el && el.error ? el.error.code : 0, vol: el ? +el.volume.toFixed(3) : 0,
      routed: graph.ok, ctx: graph.ctx ? graph.ctx.state : 'none',
      score: document.getElementById('pb-score-name').textContent,
      eq: document.getElementById('pb-score').classList.contains('playing') };
  });
  const advanced = song.b > song.a || (song.a > song.dur - 1.4 && song.b < song.a);  // or it wrapped
  ok(song.title === 'Song A', 'page 1 plays Song A', song.title);
  ok(advanced && !song.err && song.ready === 4, 'the soundtrack is really advancing',
    JSON.stringify(song));
  ok(song.routed && song.ctx === 'running' && song.vol > 0,
    'routed through web audio and audible — the cross-origin silence bug stays fixed',
    JSON.stringify(song));
  ok(song.eq, 'the playing indicator is up while sound is coming out');
  ok(song.score.length > 0, 'the bar names the score', song.score);

  await r.evaluate(() => goToPage(6, true));
  const song2 = await r.evaluate(async () => {
    const w = ms => new Promise(x => setTimeout(x, ms));
    await w(2500);
    const a = audio.active ? audio.active.currentTime : -1;
    await w(1000);
    return { title: (trackById(audio.currentTrackId) || {}).title,
      moved: audio.active ? audio.active.currentTime !== a : false,
      paused: audio.active ? audio.active.paused : true };
  });
  ok(song2.title === 'Song B' && !song2.paused && song2.moved,
    'page 7 swaps to Song B and it plays', JSON.stringify(song2));

  console.log('read: the voices');
  await r.evaluate(() => goToPage(2, true));
  await r.waitForTimeout(600);
  const os = await r.evaluate(async () => {
    const w = ms => new Promise(x => setTimeout(x, ms));
    /* `os` is a top-level const in a classic script: script-scoped, so it is
       reachable from here but never lands on window. */
    const out = { count: os.list.length, played: [] };
    for(let i = 0; i < os.list.length; i++){
      osAdvance(1); await w(1400);
      out.played.push({ title: (os.cur || {}).title, t: +os.el.currentTime.toFixed(2),
        err: os.el.error ? os.el.error.code : 0 });
    }
    return out;
  });
  ok(os.count === 2, 'page 3 carries both spoken lines', JSON.stringify(os));
  ok(os.played.every(x => x.t > 0.2 && !x.err), 'both clips actually played',
    JSON.stringify(os.played));

  console.log('read: mute');
  await r.evaluate(() => goToPage(0, true));
  await r.waitForTimeout(1500);
  await r.click('#mute-btn');
  const muted = await r.evaluate(async () => {
    await new Promise(x => setTimeout(x, 400));
    return { flag: audio.muted, vol: audio.active ? +audio.active.volume.toFixed(3) : null,
      icon: document.getElementById('mute-btn').getAttribute('data-ico'),
      eq: document.getElementById('pb-score').classList.contains('playing') };
  });
  ok(muted.flag && muted.vol === 0, 'mute silences the soundtrack', JSON.stringify(muted));
  ok(muted.icon === 'volume-x', 'mute swaps its icon', muted.icon);
  ok(!muted.eq, 'the playing indicator goes down when muted');
  await r.click('#mute-btn');
  const back = await r.evaluate(async () => {
    await new Promise(x => setTimeout(x, 400));
    return { flag: audio.muted, vol: audio.active ? +audio.active.volume.toFixed(3) : null };
  });
  ok(!back.flag && back.vol > 0, 'unmute brings it back', JSON.stringify(back));

  /* one 409 is legitimate and handled: two runs close enough together slugify
     to the same string, and saveComic catches the duplicate and retries with a
     suffix. anything else is a real failure. */
  const unexpected = bad.filter(x => !/^POST 409 .*\/comics\?/.test(x));
  ok(unexpected.length === 0, 'no request failed on the live site',
    JSON.stringify(unexpected.slice(0, 6), null, 1));
  ok(errs.length === 0, 'zero console errors on the live site', JSON.stringify(errs.slice(0, 6)));

  if(!KEEP){
    const gone = await r.evaluate(async id => {
      const sb = window.eski.sb;
      const e = await sb.from('comics').delete().eq('id', id);
      return e.error ? e.error.message : 'ok';
    }, row.id);
    ok(gone === 'ok', 'the harness comic is off the shelf again', gone);
    console.log('    (pass --keep to leave it published)');
  }else{
    console.log('    kept: ' + SITE + '/read.html?read=db:' + row.id);
  }

  await browser.close();
  if(api) await api.dispose();
  console.log('\n' + (failures ? failures + ' FAILURES' : 'live run clean'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASHED', e); process.exit(1); });
