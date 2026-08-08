# eski tests

Seven runners, in two groups.

**Local** — `smoke.js`, `errors.js`, `check-sign.mjs`, `viewer-fit.js`. They
drive the real pages over localhost with every CDN request route-intercepted,
so they need no egress and no account. Zero console errors is a hard assertion.
These are the ones to run before every commit.

**Live** — `live.js`, `live-input.js`, `live-comic.js`, plus `shots.js`, which
takes pictures rather than assertions. They run against **www.eski.lol** and
sign in as a real account. Run them when you have changed something only
production can answer for.

Fixtures, vendor output and `dl/` are generated and gitignored. If a branch
switch ever wipes `tests/fixtures/`, re-run `make-fixtures.js`.

## Setup (once)

```
npm install
npx playwright install chromium
node tests/vendor-pdfjs.js     # vendors pdf.js for offline runs
node tests/make-fixtures.js    # builds test.eski / test.cbz / test.pdf / wavs
```

The live runners need an ordinary account. Create it once with
`tests/live-account.sql`, then override with `ESKI_TEST_EMAIL` /
`ESKI_TEST_PASSWORD` if you used different details.

---

## The local ten

```
node tests/structure.js
node tests/smoke.js
node tests/errors.js
node tests/check-sign.mjs
node tests/cache.js
node tests/loudness.js
node tests/recording.js
node tests/viewer-fit.js       # needs the folder served on :8940
node tests/wordmark.js         # same
node tests/cues.js             # needs it too
```

Three of them need nothing at all — `cache.js`, `loudness.js` and
`check-sign.mjs` read files and do arithmetic. `recording.js` needs a browser
but no microphone.

### `smoke.js` — the reader and the composer

- boot: `demo.eski` (from fixtures) opens, track names, page count
- deep links: `#comic-title/page=N` lands on the page; the hash follows
  navigation
- rtl override: arrows flip, page bar flips
- scroll mode: the midline page drives the track; spread and click zones off
- playlist mode: tracks advance on `ended`, no looping, the page does not move
- composer: cbz extracts pages, pdf rasterizes pages, waveforms decode,
  dragging the card waveform sets `sync.start`
- validation: duplicate trigger pages block export, fixing re-enables it
- export: reader-side overrides (rtl / playlist / scroll) never change the
  manifest; authored values round-trip
- opus transcode: exported audio is ogg/opus, smaller, and plays after
  re-import

### `errors.js` — the ESK codes

Calls the signer directly with broken env vars, then loads the pages with
`vendor/supabase.js` 404ing to prove the boot failure is **named** rather than
swallowed, and finally checks the healthy case: no page may claim a service is
unreachable when it is not. Codes are registered in `ERRORS.txt`.

### `structure.js` — a fix cannot be silently overwritten

The one to run first, and the one that exists because the same bug happened
twice: `.btn.p:hover` defined at the top of `broadsheet.css` and again 330
lines later, source order deciding it, "fixed" twice with no visible change.

It fails on a selector given the same colour property in two places outside a
media query, on a hex literal in a page, on an ESK code raised but not
registered, on a page loading `palette.js` after the stylesheets, and on
`ARCHITECTURE.md` drifting behind the files it describes.

### `wordmark.js` — the logo is actually centred

"It looks a few pixels too high" got answered by eye twice and was wrong both
times. Gnomon declares 63.5% ascent and 26% descent, and "eski!" has no
descender at all — at 21px the lowest ink sits 4px ABOVE the baseline, so any
box-based centring is wrong by construction. A zero-height inline-block finds
the baseline by measurement, canvas measureText finds the ink either side of
it, and the check fails past a pixel of drift.

### `cues.js` — a page of dialogue is scheduled as written

The reader half of overlapping dialogue. `cues.plan()` is kept as a pure
function of (clips, durations) so the arithmetic can be checked without audio:
`after` follows, `with` lands together, `over` takes a percentage of whatever
take is actually selected — which is why it is a percentage and not a
millisecond offset. Also the edges: a first line that says `over` has nothing
to be over, and a percentage outside 1-99 is clamped rather than thrown.

### `cache.js` — every asset has a caching policy

`vercel.json` is configuration, so it fails silently: a rule with a typo does
not error, it just never matches. This walks the HTML for every same-origin
asset and asserts each one is covered, which catches the failure that actually
happens — a file added later that nobody put on the list. It also checks the
policies are the right way round: HTML must revalidate or deploys do not land,
and only `/vendor/` may be immutable, because nothing else gets renamed when
it changes.

### `loudness.js` — the meter, against the published conformance cases

ITU-R BS.1770-4 checked against EBU Tech 3341: a 1kHz sine at a known level
must read that level back within 0.1 LU, at several sample rates. Also the
gates, the peak-headroom guard, and the rule that a whole part gets ONE gain so
a performance keeps its dynamics. Fakes an AudioBuffer, so it runs in node with
no browser and no audio files.

### `recording.js` — a take, end to end, with no microphone

Chromium's fake capture device drives the contribution studio's recorder:
permission, MediaRecorder, the blob, the loudness measurement, the shared part
gain, and that the microphone is closed again afterwards.

### `check-sign.mjs` — the signer, without a browser

`api/sign.mjs` guards a trust boundary and needs neither a browser nor a
network, so it gets its own check with dummy credentials.

### `viewer-fit.js` — the page fits the box

Mounts `viewer.js` on its own and checks that a page sits inside the viewer on
**both** axes, at four page shapes (tall, wide, square, and a 900×4000 webtoon
strip) across three viewports; that the wheel still zooms by the same amount;
that a pan moves and stays contained; and that the zoom bar responds to a
**real** click while zoomed.

That last one is not decoration. The bar used to capture the pointer on the
container to start a pan, and pointer capture retargets the click — so every
button in it, Fit included, was dead in exactly the state you would press it. A
synthetic click would not have caught it.

The fit check exists because it broke twice: `max-height:100%` on the page
image only resolves against a parent with a definite height. Inside a grid or
flex row sized by its own content it silently does nothing, the page renders at
natural size, and a tall scan loses its foot to the overflow rule. A check that
only ever used a **wide** page passes anyway, because there `max-width` does
the work and the broken `max-height` is never asked to.

---

## The live three

```
node tests/live.js          # add --keep to leave the comic up
node tests/live-input.js
node tests/live-comic.js
```

### `live.js` — publish and read, for real

Signs in, publishes a twelve-page comic with two soundtracks and two spoken
lines, reads every page, plays every clip, checks mute, then deletes the comic
again unless you pass `--keep`.

It exists because three things can only break in production: `/api/sign` is a
Vercel function that does not exist on a static server, the bucket's CORS is
what decides whether audio routed through Web Audio is sound or silence, and
row-level security decides whether an insert lands at all.

There is no guest mode and there must not be one — publishing needs a row owned
by `auth.uid()` and an upload url signed against a real access token, so
nothing client-side can stand in for a session, and anything that could would
be an unauthenticated write into the bucket and onto the shelf.

### `live-input.js` — the tap and click zones

Phone first, then the same zones with a mouse. It exists because the edge bands
that turn the page listen in the **capture** phase: Panzoom's default
`handleStartEvent` calls `stopPropagation()` on the panned element, which is a
child of `#viewer`, so a bubbling `pointerdown` never arrives and every edge tap
is silently dropped. The first version of this check measured geometry, found
the zones where they belonged, and passed while the reader did nothing.

### `live-comic.js` — the comic page and its thread

Three things production alone can answer:

1. `/c/<slug>` is a real address. It rewrites to `api/comic.mjs`, which injects
   `og:` tags a static file could never carry per comic. A local server has no
   rewrite, so this is unverifiable anywhere else.
2. Browsing did not get worse. Clicking a card still opens in place, pushes the
   url and closes on back — no navigation, no flash. A cold `/c/<slug>` renders
   as a page rather than a modal over a shelf, and relative assets still resolve
   two levels down, which is `<base href="/">` doing its job.
3. The thread is shut until asked for — the bodies are not merely hidden, they
   are not fetched — and posting, replying, editing and deleting all really hit
   the database with RLS on.

Signs in as the ordinary harness account, which has no powers a signed-up
reader lacks, and cleans up after itself.

---

## `shots.js` — pictures, and an alignment overlay

```
node tests/shots.js                              # into docs/design/shots/
node tests/shots.js --grid                       # with the overlay
BASE=http://localhost:8940 node tests/shots.js   # against a local server
```

Every main screen at 1440×900 and 390×844. With `--grid` it draws each
element's left and right edge as a vertical line and paints in **red** any two
edges that almost agree — within 12px but not equal. Those near-misses are what
reads as sloppy; a thing either lines up with its neighbour or is deliberately
somewhere else. It makes misalignment visible instead of arguable.

---

## Running these from a sandbox

If `HTTPS_PROXY` is set, every browser request is fetched by the node driver
instead, which is how the live runners work from a box whose browser has no
egress.

**That relay is the bottleneck, not the site.** A phone opening a comic fires
thirty requests at once; the relay drops one; an aborted stylesheet reads as
"the site is broken" — a *different* file each run, which is the signature of
saturation rather than a bug. Retrying harder made it worse, because the
retries pile onto the same jam. So all four live-facing runners hold at most
**three** requests in flight and give anything that still fails four attempts
with a growing backoff. If you add a runner, copy the gate; if you see a
one-off `ERR_FAILED` on a different asset each run, that is this, not the site.

## Assertions and text

`innerText` applies `text-transform`, so an assertion against a control reads
what the CSS made of it — `P.5` and `TEST HARNESS`, not `p.5` and
`Test Harness`. Match on the rendered case, or lowercase both sides.
