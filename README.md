# eski

A comic and everything you hear over it, in one file.

An author finishes the art and publishes it with a transcript. Composers lay
sound under it. Voice actors read the characters. A reader picks which of
those performances they want and reads the comic with them playing. Nothing is
exclusive: a character can be voiced by twenty people, a comic can carry a
dozen scores, and the reader chooses. Contributions stack, they never replace
— no surface ever tells anyone a part is already taken.

The `.eski` file itself is a plain zip: pages, audio, and a manifest mapping
one to the other. A zip with no manifest still opens as a silent comic (CBZ
compatible).

Full product spec: [`SPEC.md`](SPEC.md).

This is currently a solo project — one user, no staging. Changes go straight
to `main` and straight to prod.

## Where things actually stand

Two layers of this repo are at different stages:

- **The live app** (root `*.html` + `platform.js` + `api/` + `schema*.sql`) —
  a working single-file-format reader, composer and publishing pipeline,
  backed by Supabase + Cloudflare R2, deployed on Vercel. Implements the
  **v2** manifest: one soundtrack per comic (see `spec.html`).
- **The design direction** (`docs/design/final/`) — the **v3** model from
  `SPEC.md`: layered audio (beds/score/oneshots/voice), a script with
  per-line voice performances, and three separate studios (author, composer,
  voiceover) replacing today's single `studio.html`. The *reading* half of
  this is now live: `index.html` (home + browse) and `profile.html` are built
  against `broadsheet.css` and the final layouts. The three studios are not —
  `studio.html` is still the single v2 composer.

`ROADMAP.md` and `docs/design/final/TODO.md` track what's left to close that
gap. `TODO.txt` and `catchup.txt` are older working notes, kept for history.

## Structure

```
index.html            library / home — browse and open a comic
read.html              the reader (also reachable as index.html today)
studio.html             the v2 composer: pages + a soundtrack timeline
profile.html            signed-in profile: reading, read, parts performed
spec.html                published v2 file-format reference
platform.js              shared auth/session layer (Supabase), used by all pages
hash-worker.js            content-addressing (sha256) for uploads, off the main thread
sw.js / manifest.json     PWA: offline shell, install prompt

api/sign.mjs               Vercel function: signs R2 upload URLs for a caller
schema.sql                 comics, pages, tracks, kudos, views, reports
schema-parts.sql           parts (voice/soundtrack contributions), tracks.part_id, comics.cast_list
schema-profiles.sql        profiles
schema-thumbs.sql          cover thumbnails
schema-social.sql          comic_tags, saves (the shelf), follows

library/                   drop-in .eski files for local/self-hosted browsing
vendor/                    vendored supabase-js client (no CDN dependency at runtime)
tests/                     Playwright smoke suite + signer/error-code checks

docs/
  design/final/              the v3 design direction
    home.html, broadsheet.css        reading surfaces (home, browse, details, profile)
    studios/                          author.html, score.html, voice.html + shared shell/base/studio.css

SPEC.md                    the master spec — source of truth over spec.html where they disagree
ROADMAP.md                  prioritized list of what's next, with time estimates
ERRORS.txt                  ESK-#### error code registry (paired with the code sites)
ICONS.txt                   Lucide icon inventory used across the app
```

## Tech stack

- **No build step, no framework.** Each page is a single classic-script
  HTML file; `platform.js` is the only shared module. `esbuild` is a dev
  dependency used only inside the test tooling, not to bundle the app.
- **Supabase** — auth (Google OAuth via magic-link-capable sessions) and
  Postgres for comics, pages, tracks, parts, profiles, kudos/views/reports.
  Row-level security enforces ownership and consent.
- **Cloudflare R2** — object storage for page images and audio, addressed by
  content hash (`<sha256>.<ext>`). The browser uploads directly to R2 via
  short-lived presigned PUT URLs; nothing streams through Vercel.
- **Vercel** — hosts the static app and the one serverless function
  (`api/sign.mjs`, using `aws4fetch` to sign R2 requests).
- **pdf.js** (vendored, lazy-loaded) and **JSZip** for import/export of
  `.eski`/CBZ/PDF in the composer.
- **WebCodecs `AudioEncoder`** + a hand-written Ogg muxer for opus transcode
  on export.
- **Playwright** for smoke tests, driving the real pages over `localhost`
  with CDN requests route-intercepted.
- **PWA**: `manifest.json` + `sw.js` (network-first HTML, cache-first
  assets) + `launchQueue` for file handling.

Every error path returns a stable `ESK-####` code documented in
`ERRORS.txt`; `platform.js`'s `DB_HINTS` map translates common Postgres/
PostgREST error codes into fixes inline.

## Running it

```bash
npm install
```

There's no dev server script — open `index.html` (or `read.html`,
`studio.html`, `profile.html`) over any static file server; a `file://`
open will fail the demo fetch. `platform.js` has real Supabase/R2 values
committed (they're public by design, see `.env.example`); the Vercel
function needs its own env vars set to actually sign uploads.

Smoke tests (see [`tests/README.md`](tests/README.md)):

```bash
npx playwright install chromium
node tests/vendor-pdfjs.js
node tests/make-fixtures.js
node tests/smoke.js
node tests/check-sign.mjs
node tests/errors.js
```

## TODO

**Current priority: the UI and load performance.** Everything else below is
secondary until eskis open fast and consistently and the live app looks like
`docs/design/final/` instead of the current pages.

- [ ] **Wire the v3 design into the live app** — the redesigned home/browse/
      details/profile (`docs/design/final/home.html`, `broadsheet.css`) and
      the three-studio split (`docs/design/final/studios/`) are built and
      styled but not hooked up to real data or the reader. This is the "all
      the UI" work.
- [ ] **Loading speed and consistency**, several separate causes:
  - Cache headers in `vercel.json` — content-addressed media (pages, audio)
    isn't marked `immutable`/long-`max-age` yet, so every visit re-fetches it.
  - Library covers currently download each full `.eski` to read its manifest
    for the cover/title; a `library/index.json` with pre-generated cover
    thumbnails would make the shelf render from small files instead.
  - The Gnomon font is base64-inlined separately in every HTML file — move it
    to one `.woff2` so it downloads and caches once.
  - Page decode: revoke off-screen page blob URLs so long comics stop growing
    in memory, decode with `createImageBitmap`, add a low-res placeholder so
    pages don't flash blank while decoding.
  - `sw.js` is network-first for HTML already; worth double-checking asset
    caching is actually being hit in practice, not just configured.
- [ ] **Consent controls in the studio** — `comics.voice_consent` /
      `music_consent` exist and are enforced by policy, but there's no UI
      toggle for an author to actually say no.
- [ ] **Upload quota on `api/sign.mjs`** — no per-user cap on signed uploads
      or comic size today.
- [ ] **A real comic detail page** (`/c/<slug>`) — comics only open as a
      modal today, so nothing has a shareable URL or link-preview metadata.
- [ ] **Contribute hub** — surface comics with an open voice/soundtrack slot;
      mostly a query away given the existing `parts` schema.
- [ ] **Swap voice/soundtrack mid-read** without returning to the shelf.
- [ ] **Preview clips** for voice tracks before committing to one.
- [ ] **Studio autosave / resumable uploads / reopenable drafts** — nothing
      persists work locally yet.
- [ ] Reporting/moderation queue, kudos/view counts, terms/privacy/takedown
      pages, account deletion, CI running the smoke suite on push, an
      accessibility pass.

See `ROADMAP.md` for time estimates and what's deliberately deferred (search
infra, a frontend framework, first-class "mixes"). `ROADMAP.md` still frames
some of this in beta/multi-user terms from when this was scoped as an
invite-only launch — treat the technical detail as current, the audience
framing as stale.
