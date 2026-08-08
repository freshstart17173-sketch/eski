/* Is the wordmark's INK centred in the bar?

   "The logo still looks a few pixels too high" is the kind of note that gets
   answered with a nudge, shipped, and re-reported three weeks later. It is
   measurable, so it is measured.

   Gnomon is metrically odd: it declares 63.5% ascent and 26% descent, and
   "eski!" has no descender — at 21px the lowest ink sits 4px ABOVE the
   baseline. So every box-based centring is wrong by construction, because the
   box is mostly empty underneath the letters. Two previous values were judged
   by eye and both left it high.

   HOW IT MEASURES. A zero-height inline-block appended to the wordmark sits
   exactly on the baseline, so its top edge IS the baseline — a measurement,
   not a reconstruction from font metrics, and it needs no overflow:hidden,
   which is the trap that makes a strut report line-height instead. Canvas
   measureText then gives the ink extents either side of that baseline.

   Needs the folder served: BASE=http://localhost:8940 node tests/wordmark.js */
const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:1280,height:300}})).newPage();
  await p.goto((process.env.BASE||'http://localhost:8940')+'/',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.mark'); await p.waitForTimeout(3000);
  const m = await p.evaluate(async ()=>{
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const a=document.querySelector('.mark'), bar=document.querySelector('.top');
    const rb=bar.getBoundingClientRect();
    const cs=getComputedStyle(a);

    /* A ZERO-SIZED INLINE-BLOCK SITS ON THE BASELINE. Its top edge is the
       baseline of the line it is on, which is a measurement rather than a
       reconstruction from font metrics — and it does not need overflow:hidden,
       which is the trap that makes a strut report line-height instead. */
    const probe=document.createElement('span');
    probe.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';
    a.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top - rb.top;
    a.removeChild(probe);

    const cv=document.createElement('canvas').getContext('2d');
    cv.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m=cv.measureText(a.textContent.trim());
    const inkTop = baseline - m.actualBoundingBoxAscent;
    const inkBot = baseline + m.actualBoundingBoxDescent;
    const inkMid = (inkTop + inkBot)/2, barMid = rb.height/2;
    return {
      barHeight:+rb.height.toFixed(2),
      baselineFromBarTop:+baseline.toFixed(2),
      inkTop:+inkTop.toFixed(2), inkBottom:+inkBot.toFixed(2),
      inkHeight:+(inkBot-inkTop).toFixed(2),
      inkCentre:+inkMid.toFixed(2), barCentre:+barMid.toFixed(2),
      tooHighBy:+(barMid-inkMid).toFixed(2),
      currentTransform:cs.transform
    };
  });
  console.log(JSON.stringify(m, null, 1));

  let bad = 0;
  const ok = (c, what, extra='') => {
    console.log((c ? '  ok  ' : '  FAIL  ') + what + (c ? '' : '  << ' + extra));
    if(!c) bad++;
  };
  ok(m.inkHeight > 4, 'the wordmark rendered as Gnomon, not a fallback',
    'ink height ' + m.inkHeight + 'px — if this is 0 the font did not load');
  /* A PIXEL EITHER WAY IS INVISIBLE; five is what got reported. */
  ok(Math.abs(m.tooHighBy) <= 1,
    'the wordmark ink is centred in the bar',
    `off by ${m.tooHighBy}px (ink centre ${m.inkCentre}, bar centre ${m.barCentre})`);

  await b.close();
  console.log(bad ? `\n${bad} FAILURES` : '\nwordmark: centred');
  process.exit(bad ? 1 : 0);
})();
