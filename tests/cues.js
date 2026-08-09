/* Does a page of dialogue get scheduled the way the author wrote it?

   This is the reader half of overlapping dialogue. The author studio lets a
   line say how it starts relative to the line above — after it, with it, or
   partway over it — and until now nothing read that: every one-shot on a page
   either fired at the page turn or waited for the reader to step to it.

   The arithmetic is small and easy to get subtly wrong in ways no screenshot
   shows, so cues.plan() is kept as a pure function of (list, durations) and
   tested here with no audio and no browser. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let bad = 0;
const ok = (c, what, extra = '') => {
  console.log((c ? '  ok  ' : '  FAIL  ') + what + (c ? '' : '  << ' + extra));
  if (!c) bad++;
};
const near = (got, want, what) => ok(Math.abs(got - want) < 1e-6, what, `${got} vs ${want}`);

const server = http.createServer((q, r) => {
  const p = path.join(ROOT, q.url.split('?')[0]);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return r.writeHead(404).end();
  r.writeHead(200, { 'content-type': q.url.endsWith('.js') ? 'text/javascript' : 'text/html' });
  fs.createReadStream(p).pipe(r);
});

(async () => {
  await new Promise(r => server.listen(8936, r));
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto('http://localhost:8936/read.html');
  await p.waitForFunction(() => typeof cues !== 'undefined' && cues.plan, null, { timeout: 20000 });

  const plan = (links, secs) => p.evaluate(([l, s]) =>
    cues.plan(l.map(x => ({ link: x[0], overPct: x[1] })), s).map(r => +r.at.toFixed(4)),
    [links, secs]);

  console.log('after: one thing at a time');
  near((await plan([['after'], ['after'], ['after']], [2, 3, 1]))[1], 2,
    'the second line waits for the first to finish');
  near((await plan([['after'], ['after'], ['after']], [2, 3, 1]))[2], 5,
    'and the third waits for both');

  console.log('with: at the same instant');
  const w = await plan([['after'], ['with'], ['with']], [2, 3, 1]);
  near(w[1], 0, 'a `with` starts when the line above it starts');
  near(w[2], 0, 'and a run of them all land together — a crowd');

  console.log('over: partway through');
  const o = await plan([['after'], ['over', 70]], [10, 4]);
  near(o[1], 7, 'an interruption at 70% of a 10s line lands at 7s');
  /* THE POINT OF A PERCENTAGE: the same authored timing tracks whatever take
     is actually selected, because it is written against the line and resolved
     against the audio. */
  const o2 = await plan([['after'], ['over', 70]], [4, 4]);
  near(o2[1], 2.8, 'the same 70% against a shorter take moves with it');

  console.log('the first entry is always at zero');
  near((await plan([['over', 50]], [5]))[0], 0,
    'a page whose first line says `over` has nothing to be over, so it starts');
  near((await plan([['with']], [5]))[0], 0, 'same for `with`');

  console.log('a run chains from what it follows, not from the page');
  /* 2s line, then one WITH it, then one AFTER — the `after` must follow the
     pair, not the first alone. */
  const c = await plan([['after'], ['with'], ['after']], [2, 5, 1]);
  near(c[2], 5, 'after a `with`, the next line follows the one it started with');

  console.log('a missing or silly percentage does not break the page');
  near((await plan([['after'], ['over', null]], [10, 2]))[1], 6,
    'no percentage falls back to 60%');
  near((await plan([['after'], ['over', 500]], [10, 2]))[1], 9.9,
    'and an out-of-range one is clamped rather than thrown');

  /* ------------------------------------------------------------------ */
  console.log('the author studio can actually reach the link control');
  /* THE ARITHMETIC ABOVE IS USELESS IF NOBODY CAN SET THE LINK, and for a
     while nobody could. `first` — the flag that suppresses the AFTER/WITH/OVER
     bar — was the entry's index WITHIN ITS GROUP, and groups are split on
     link === 'after'. So an 'after' entry was always index 0 of its own group,
     always `first`, and never got a bar; and a new entry defaults to 'after'.
     The only control that could move an entry off AFTER was hidden on every
     entry that was on AFTER.

     This runs the SHIPPED grouping and render code out of author.html rather
     than a retyped copy, because a retyped copy would have passed the whole
     time the real one was broken. */
  {
    const src = fs.readFileSync(path.join(ROOT, 'author.html'), 'utf8');
    const grp = src.slice(src.indexOf('  const groups = [];'),
                          src.indexOf('  const entryHtml ='));
    const ren = src.match(/  let seen = 0;\n  box\.innerHTML = groups\.map\(g => \{\n[\s\S]*?\}\)\.join\(''\);/);
    ok(!!ren, 'the render block is still findable in author.html');
    if(ren){
      const body = grp +
        '\nconst entryHtml=(l,first)=>{ out.push(!first); return ""; };\n' +
        ren[0] + '\nreturn out;';
      const render = new Function('mine', 'out', 'box', body);
      const bars = ls => render(ls, [], { set innerHTML(v){} });
      const L = link => ({ id: Math.random(), link });

      const fresh = bars([L('after'), L('after'), L('after')]);
      ok(JSON.stringify(fresh) === '[false,true,true]',
        'three fresh entries: every one but the first offers the control',
        JSON.stringify(fresh));

      const linked = bars([L('after'), L('with'), L('after')]);
      ok(JSON.stringify(linked) === '[false,true,true]',
        'and setting one to WITH does not take the control off the others',
        JSON.stringify(linked));

      ok(bars([L('after')])[0] === false,
        'the first entry on a page has nothing above it, so no control');
    }
  }

  console.log('console errors');
  await b.close(); server.close();
  console.log(bad ? `\n${bad} FAILURES` : '\ncues: all checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('runner crashed:', e); process.exit(2); });
