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
