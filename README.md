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

Live at **eski.lol**. Solo project, one user, no staging: `main` is what is in
production, and Vercel deploys it directly.

---

## Start here

Five documents, and they do not overlap. Read them in this order and you know
the project.

| File | What it answers |
|---|---|
| **this file** | how the code is laid out, what runs where, how to run it |
| [`SPEC.md`](SPEC.md) | what an eski *is* — the file format and the product model. Source of truth over `spec.html` where they disagree |
| [`docs/design/STYLE.md`](docs/design/STYLE.md) | every visual rule, and what a comic's states mean. **If a surface disagrees with it, the surface is the bug** |
| [`docs/design/SURFACES.md`](docs/design/SURFACES.md) | every screen and every control on it, and what a theme has to cover |
| [`ROADMAP.md`](ROADMAP.md) | what is left, in order, and what is deliberately not being done |

Two reference files you go to rather than read: [`ERRORS.txt`](ERRORS.txt) (the
`ESK-####` registry — every code, its cause, its fix) and
[`ICONS.txt`](ICONS.txt).

Two research notes, both still accurate:
[`docs/FASTER.md`](docs/FASTER.md) — load performance, measured against
production, not guessed — and [`docs/RESEARCH.md`](docs/RESEARCH.md) — what
comparable sites do and what each idea would cost here.

There is no `catchup.txt` and no `TODO.txt` any more. They were working notes
that fell far enough behind the code to be actively misleading; everything in
them that was still true is in the files above.

---

## What is actually built

The reading half of the product is live and finished to the current design:
home, browse, the comic page, the reader, comments, profiles, an admin
console, and eighteen themes.

The authoring half is split. `studio.html` is the **v2** composer — one
soundtrack per comic — and it is what publishing runs through today.
`author.html` is the script and cast editor. The **v3** model in `SPEC.md`
(layered audio, per-line voice performances, three separate studios) is
designed but not wired: the prototypes live in `docs/design/final/studios/`
and are not part of the running app. `spec.html` documents v2 and says so.

That gap is the largest single thing outstanding; see `ROADMAP.md`.

---

## Structure

```
index.html        home, browse, the shelf, and the comic page
read.html          the reader
studio.html        the v2 composer: pages + a soundtrack timeline
author.html        the script: cast list and per-page transcription
profile.html       tabs: reading, shelf, read, contributions, published,
                     private, drafts, settings. Also answers at /u/<handle>
admin.html         moderation console, gated in the database
legal.html         terms, privacy, takedown
spec.html          published v2 file-format reference

platform.js        shared auth/session layer (Supabase). Every page loads it
palette.js         the theme, applied before anything paints. The ONLY writer
                     of data-theme / data-mode / data-dark
palettes.css       the eighteen themes, hue x treatment, each written out
tokens.css         scale, spacing, type — the things themes do not change
comments.js        the comment thread, shared by the comic page and the reader
viewer.js          page fit / zoom / pan, over vendored panzoom
hash-worker.js     sha256 content addressing for uploads, off the main thread
sw.js manifest.json  PWA: offline shell, install prompt, file handling

api/sign.mjs       Vercel function: signs R2 upload urls for a caller
api/comic.mjs      Vercel function: /c/<slug> — injects og: tags per comic,
                     because crawlers run no javascript

schema.sql             comics, pages, tracks, kudos, views, reports
schema-parts.sql       parts (voice/soundtrack contributions), cast_list
schema-profiles.sql    profiles
schema-thumbs.sql      cover thumbnails
schema-social.sql      comic_tags, saves (the shelf), follows
schema-comments.sql    comments, one level of reply, tombstones
schema-states.sql      draft -> published -> private, and the one-way trigger
schema-admin.sql       is_admin() and the security-definer admin views

library/           drop-in .eski files for local or self-hosted browsing
vendor/            vendored supabase-js and panzoom (no CDN at runtime)
tests/             see tests/README.md
docs/design/       the design work: final/ is the direction, shots/ is what
                     the site currently looks like, refs/ is what it steals
                     from, and the .zip is the original design drop those
                     came out of — nothing loads it
```

`vercel.json` holds the two rewrites that make `/c/<slug>` and `/u/<handle>`
real addresses. There is no router.

## Tech stack

- **No build step, no framework.** Every page is a single HTML file of classic
  scripts. `esbuild` is a dev dependency used only by the test tooling, never
  to bundle the app.
- **Supabase** — auth and Postgres. Row-level security is where ownership,
  consent and visibility are actually decided; the interface only reflects it.
  Several invariants are Postgres **triggers**, not application code: one level
  of comment reply, tombstones, server-filled author names, and the one-way
  publish.
- **Cloudflare R2** — page images and audio, addressed by content hash
  (`<sha256>.<ext>`). The browser uploads straight to R2 with short-lived
  presigned PUTs; nothing streams through Vercel. Because keys are hashes, the
  same bytes always get the same key and a retried upload costs nothing.
- **Vercel** — the static app plus two serverless functions.
- **pdf.js** (vendored, lazy) and **JSZip** for `.eski`/CBZ/PDF import-export.
- **WebCodecs `AudioEncoder`** + a hand-written Ogg muxer for the opus
  transcode on export. Measured at 3445 KB → 498 KB on a real score, with the
  original kept so Safari never gets silence.
- **PWA** — `sw.js` (network-first HTML, cache-first assets) and `launchQueue`
  for file handling.

Every failure that crosses a service boundary names itself with a stable
`ESK-####` code before it says anything else, and `platform.js`'s `DB_HINTS`
translates common Postgres/PostgREST codes into a fix inline.

## Running it

```bash
npm install
```

There is no dev server script — serve the folder with any static server and
open `index.html`. A `file://` open fails the demo fetch. Note that a static
server does **not** run `api/`, so uploads and `/c/<slug>` need `vercel dev`.

`platform.js` carries real Supabase and R2 values. They are public by design
(see `.env.example`); the secret key never goes in a file the browser loads.

Tests: [`tests/README.md`](tests/README.md).

## Things worth knowing before you change something

- **Publishing is one way.** A published comic can become private or be
  deleted. It can never go back to `draft`, because a draft is editable and
  other people have already voiced and scored it. A trigger enforces this. See
  `STYLE.md` §9.
- **One writer for the theme.** `palette.js`. The system this replaced had
  seven surfaces setting the theme on load from their own flag, so choosing one
  and navigating anywhere reset it.
- **`text-transform: lowercase` appears nowhere** and must not come back. It
  forced other people's titles into a house voice and made `eski`, `Eski` and
  `ESKI` render identically while being three different strings.
- **Uppercase means clickable.** Not important — clickable. See `STYLE.md` §1.
- **The reader's tap zones listen in the capture phase.** Panzoom's default
  `handleStartEvent` calls `stopPropagation()` on the panned element, so a
  bubbling `pointerdown` on `#viewer` never arrives and every edge tap is
  silently dropped. This broke once and was invisible to a test that only
  measured geometry.
- **`security definer` functions bypass RLS**, so the admin check has to be
  *inside* the function. `schema-admin.sql` does that.
