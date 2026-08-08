/* Does recording actually record, and does what it records get measured?

   Chromium's --use-fake-device-for-media-stream feeds a real audio stream
   into getUserMedia, so this exercises the whole path — permission,
   MediaRecorder, the blob, the loudness measurement, the shared part gain —
   without a microphone and without anybody clicking anything. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let bad = 0;
const ok = (c, what, extra='') => {
  console.log((c ? '  ok  ' : '  FAIL  ') + what + (c ? '' : '  << ' + extra));
  if(!c) bad++;
};

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory())
    return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8934, r));
  const browser = await chromium.launch({ args: [
    '--use-fake-ui-for-media-stream',        // grant the permission, no prompt
    '--use-fake-device-for-media-stream',    // a synthetic tone as the input
    '--autoplay-policy=no-user-gesture-required'
  ]});
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errs = [];
  /* A FAILED FETCH IS NOT A SCRIPT ERROR. This page asks for Google's fonts
     and for supabase, and neither is reachable from a sandbox — that is the
     harness's network, not the studio's code. Only real thrown errors count. */
  page.on('console', m => {
    const t = m.text();
    if(m.type() !== 'error') return;
    if(/Failed to load resource|net::ERR_|ESK-1005|ESK-1002/.test(t)) return;
    errs.push(t);
  });
  page.on('pageerror', e => errs.push('uncaught: ' + e.message));
  await page.goto('http://localhost:8934/contribute.html');

  console.log('the recorder');
  ok(await page.evaluate(() => typeof pickMime() === 'string'),
    'this browser offers a container MediaRecorder will accept');

  /* record straight through the real path: startRec on a fake slot, wait,
     stopRec, and see what lands in myTracks. */
  const got = await page.evaluate(async () => {
    stance = 'vo'; character = 'aki'; page = 1;
    cast = [{ key:'aki', name:'Aki', kind:'character' }];
    entries = []; myTracks = [];
    const slot = { id:'s1', kind:'dialogue', authored:{ id:'l1', order_idx:1 }, live:true };
    await startRec(slot);
    const started = !!rec;
    await new Promise(r => setTimeout(r, 1200));
    stopRec();
    // onstop is async and does the measuring
    for(let i = 0; i < 60 && (!myTracks.length || myTracks[0].measuring); i++)
      await new Promise(r => setTimeout(r, 100));
    const t = myTracks[0] || null;
    return { started, has: !!t, size: t && t.local ? t.local.size : 0,
             lufs: t ? t.lufs : null, gain: t ? t.gain_db : null,
             fills: t ? t.fills : null, micOpen: !!rec };
  });
  ok(got.started, 'the microphone opens and recording starts');
  ok(got.has && got.size > 0, 'a take arrives with bytes in it', String(got.size));
  ok(got.fills === 'l1', 'and it points at the authored slot it fills', String(got.fills));
  ok(!got.micOpen, 'the microphone is closed again after the take');
  ok(got.lufs != null && got.lufs < 0 && got.lufs > -70,
    'the take is measured in LUFS', String(got.lufs));
  ok(typeof got.gain === 'number', 'and carries a part gain', String(got.gain));

  console.log('one gain across the part');
  const shared = await page.evaluate(() => {
    myTracks = [
      { id:'a', lufs:-30, peak:0.1, duration:3 },
      { id:'b', lufs:-12, peak:0.6, duration:3 }
    ];
    repartGain();
    return myTracks.map(t => t.gain_db);
  });
  ok(shared[0] === shared[1],
    'two takes at different levels get the SAME correction, so the performance survives',
    shared.join(' vs '));

  console.log('console errors');
  ok(errs.length === 0, 'zero console errors', errs.join(' | '));

  await browser.close();
  server.close();
  console.log(bad ? `\n${bad} FAILURES` : '\nrecording: all checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e); process.exit(2); });
