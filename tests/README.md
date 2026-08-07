# eski smoke tests

playwright drives the real pages over localhost: `index.html` (library +
home), `read.html` (reader), `studio.html`. cdn requests
(jszip, pdf.js, google fonts) are route-intercepted so the suite runs
without egress. zero console errors is a hard assertion.

fixtures, vendor output and `dl/` are generated and gitignored. if a branch
switch or merge ever wipes `tests/fixtures/`, just re-run `make-fixtures.js`.

## setup (once)

```
npm i playwright jszip
npx playwright install chromium
node tests/vendor-pdfjs.js     # vendors pdf.js for offline runs
node tests/make-fixtures.js    # builds test.eski / test.cbz / test.pdf / wavs
```

## run

```
node tests/smoke.js
```

`api/sign.mjs` guards a trust boundary and needs neither a browser nor a
network, so it has its own check with dummy credentials:

```
node tests/check-sign.mjs
```

the ESK-#### codes (see `ERRORS.txt`) have their own runner. it calls the
signer directly with broken env vars, then loads the pages with
`vendor/supabase.js` 404ing to prove the boot failure is named rather than
swallowed, and finally checks the healthy case: no page may claim a service is
unreachable when it is not.

```
node tests/errors.js
```

## what it covers

- boot: demo.eski (served from fixtures) opens, track names, page count
- deep links: `#comic-title/page=N` lands on the page; hash follows navigation
- rtl override: arrows flip, page bar flips
- scroll mode: midline page drives the track, spread and click zones disable
- playlist mode: tracks advance on `ended`, no looping, page does not move
- composer: cbz extracts pages, pdf rasterizes pages, waveforms decode,
  dragging the card waveform sets `sync.start`
- validation: duplicate trigger pages block export, fixing re-enables it
- export: reader-side overrides (rtl / playlist / scroll) never change the
  manifest; authored values round-trip
- opus transcode: exported audio is ogg/opus, smaller, and actually plays
  after re-import

fixtures are generated, never committed. the reader's `demo.eski` at the
project root is owner-swappable and is not touched by the tests.

## viewer-fit

`node tests/viewer-fit.js` (needs the folder served on :8940, e.g. the
`eski` launch config) mounts `viewer.js` on its own and checks that a page
sits inside the viewer box on BOTH axes, at four page shapes — tall, wide,
square and a 900x4000 webtoon strip — across three viewports, and that the
wheel still zooms.

it exists because this broke twice. `max-height:100%` on the page image only
resolves against a parent with a definite height; inside a grid or flex row
sized by its own content it silently does nothing, the page renders at
natural size, and a tall scan loses its foot to the overflow rule. a check
that only ever used a WIDE page passes anyway, because there `max-width`
does the work and the broken `max-height` is never asked to.
