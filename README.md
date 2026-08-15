# eski

A place for artists to post anything — audio, video, image, text, other, or a
combination of several as one post — with versioning, curated collections,
and criticism in place of like/dislike.

**2026-08-15: mid-pivot.** eski was a comic-and-soundtrack format; it isn't
any more. The database was rebuilt from a clean slate for the new model
(`schema-clean.sql`) and the old reader/studio/composer pages were deleted
outright — no migration path, no back-compat shim, because there was no data
worth keeping. The pages that read from the new schema don't exist yet:
`artboard.html` is the complete design mockup, `index.html`/`profile.html`
are still the deleted product's pages querying tables that no longer exist.
Wiring the mockup up to the schema is the largest thing left; see
`ARCHITECTURE.md`'s pivot section and `ROADMAP.md`.

Live at **eski.lol**. Solo project, one user, no staging: `main` is what is in
production, and Vercel deploys it directly.

---

## Start here

Five documents, and they do not overlap. Read them in this order and you know
the project.

| File | What it answers |
|---|---|
| **this file** | how the code is laid out, what runs where, how to run it |
| [`SPEC.md`](SPEC.md) | **stale — describes the deleted `.eski` file format.** Not yet rewritten for the pivot; do not treat as current |
| [`docs/design/STYLE.md`](docs/design/STYLE.md) | every visual rule. Still broadly accurate — colour/type/spacing tokens didn't change — but its comic-state language predates the pivot |
| [`docs/design/SURFACES.md`](docs/design/SURFACES.md) | **stale — every screen it documents was for the deleted product.** `artboard.html` is the current surface spec |
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

The **database** is built for the pivot: `schema-clean.sql` — works
(audio/video/image/text/other/combination, with poster-only versioning),
work_items, collections (curated groupings of existing posts, distinct from
a combination-kind work), content_tags (freeform), comments (generalized,
threaded one level deep, tombstoned on delete), likes, save_folders (private,
multi-folder bookmarking, distinct from `collections`), seen_marks, reports,
follows. Live, RLS-enforced, empty.

The **design** is built: `artboard.html` has every screen and overlay as
static HTML — home feed, upload flow, per-kind detail overlays, profile
tabs, the works.

The **pages that connect them are not built.** `index.html` and
`profile.html` are still the deleted comics product, unwired and broken.
Rebuilding them (or replacing them) against `schema-clean.sql`, matching
`artboard.html`'s designs, is the largest single thing outstanding; see
`ROADMAP.md`.

---

## Structure

```
index.html         STALE — still the deleted comics home/browse/shelf, queries
                     tables that no longer exist. Pending the pivot rewrite.
profile.html       STALE — same state as index.html.
onboarding.html    account creation: pick a handle. Runs once on first sign-in.
artboard.html      the pivot's design spec: every screen and overlay, live,
                     Supabase-backed comments/pins for review. Unlisted.
admin.html         moderation console, gated in the database
legal.html         terms, privacy, takedown

platform.js        shared auth/session layer (Supabase). Every page loads it
palette.js         the theme, applied before anything paints. The ONLY writer
                     of data-theme / data-mode / data-dark
palettes.css       the eighteen themes, hue x treatment, each written out
tokens.css         scale, spacing, type — the things themes do not change
loudness.js        ITU-R BS.1770-4 loudness meter. Currently unused — its only
                     callers (the two deleted studios) are gone — kept because
                     whatever the new upload flow does with audio will want it
hash-worker.js     sha256 content addressing for uploads, off the main thread
sw.js manifest.json  PWA: offline shell, install prompt, file handling

api/sign.mjs       Vercel function: signs R2 upload urls for a caller.
                     Content/table-agnostic, untouched by the pivot

schema-clean.sql       the pivot model: works, work_items, collections,
                         collection_items, content_tags, comments, likes,
                         save_folders, save_folder_items, seen_marks, reports,
                         follows, plus admin-console policies. THE SCHEMA.
schema-quota.sql       upload_quota, claim_upload_quota — the daily object cap
schema-artboard.sql    artboard_items + its own storage bucket — the review
                         tool above, unrelated to the product schema

library/           drop-in .eski files for local or self-hosted browsing.
                     STALE — the .eski format is retired; nothing loads these
vendor/            vendored supabase-js and panzoom (no CDN at runtime)
tests/             see tests/README.md — most of it is stale too
docs/design/       the design work: final/ is the old comics direction,
                     shots/ is what the site looked like before the pivot,
                     refs/ is what it steals from
```

Several more database objects are live with no schema file — `admins`/
`is_admin()`, `user_prefs`, `rate_events` and its rate-limiting functions,
`tag_synonyms`/`canonical_tag()` — applied through migrations directly rather
than a file in this repo. `schema-clean.sql`'s header has the full list and
why it matters: two live functions (`file_report`, `profiles_tombstone`)
referenced tables the pivot dropped and had to be fixed *after* the fact,
because nothing in this repo had documented that they existed.

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
- **Cloudflare R2** — work media, addressed by content hash (`<sha256>.<ext>`).
  The browser uploads straight to R2 with short-lived presigned PUTs; nothing
  streams through Vercel. Because keys are hashes, the same bytes always get
  the same key and a retried upload costs nothing. `api/sign.mjs` is
  content/table-agnostic — it signs whatever it's asked to, so the pivot's
  new upload flow needs no changes there.
- **Vercel** — the static app plus one serverless function (`api/sign.mjs`;
  `api/comic.mjs` was deleted with the reader it served).
- **pdf.js** and **JSZip** are still vendored but currently unused — they
  backed `.eski`/CBZ/PDF import-export, which no longer exists as a feature.
  Same for the WebCodecs opus transcode that ran on export.
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
server does **not** run `api/`, so uploading needs `vercel dev`.

`platform.js` carries real Supabase and R2 values. They are public by design
(see `.env.example`); the secret key never goes in a file the browser loads.

Tests: [`tests/README.md`](tests/README.md).

## Things worth knowing before you change something

- **Publishing is one way.** A published work or collection can become
  private or be deleted; it can never go back to `draft`, because other
  people may already have commented on, liked, or built a collection around
  it. `post_status_guard()` in `schema-clean.sql` enforces this as a trigger,
  shared by both tables.
- **A version may only be added by the original poster**, enforced the same
  way — as a trigger (`works_version_owner_guard()`), not just a UI
  affordance, so pointing `version_of` at someone else's work fails even from
  a stale client.
- **One writer for the theme.** `palette.js`. The system this replaced had
  seven surfaces setting the theme on load from their own flag, so choosing one
  and navigating anywhere reset it.
- **`text-transform: lowercase` appears nowhere** and must not come back. It
  forced other people's titles into a house voice and made `eski`, `Eski` and
  `ESKI` render identically while being three different strings.
- **Uppercase means clickable.** Not important — clickable. See `STYLE.md` §1.
- **`security definer` functions bypass RLS**, so the admin check has to be
  *inside* the function. `is_admin()` does that (schema predates this repo's
  files — see `schema-clean.sql`'s header); the per-table admin policies in
  `schema-clean.sql` §11 are what actually grant the reach.
- **If a live database function or trigger isn't in any `schema*.sql` file,
  that doesn't mean it's safe to ignore.** Several were applied through
  migrations directly and are undocumented here — `schema-clean.sql`'s header
  has the list. Check `pg_get_functiondef` against the live project before
  assuming something doesn't exist.
