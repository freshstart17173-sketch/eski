# eski

A place for artists to post anything — audio, video, image, text, other, or a
combination of several as one post — with versioning and curated
collections.

**The pivot is done and live.** eski was a comic-and-soundtrack format; it
isn't any more. `schema-clean.sql` replaced the database in one pass, and
`index.html`/`profile.html`/`pivot.css`/`pivot.js` are the real, schema-backed
rebuild, not mockups — measured against `artboard.html` screen by screen.
`admin.html` was rebuilt the same way on 2026-08-15, closing the last hole
that kept this from being safe to open to strangers. See `ROADMAP.md` for
what's still open — a report button in the UI now feeds it, but the queue
itself still needs eyes on it regularly.

Live at **eski.lol** (media served from `cdn.eski.lol`, a Cloudflare custom
domain in front of R2 — not the rate-limited `r2.dev` dev hostname). Solo
project, one user, no staging: `main` is what is in production, and Vercel
deploys it directly.

---

## Start here

| File | What it answers |
|---|---|
| **this file** | how the code is laid out, what runs where, how to run it |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | what each file owns — read before changing anything |
| [`docs/design/STYLE.md`](docs/design/STYLE.md) | every visual rule: case, colour (two themes now, not eighteen), shape |
| [`ROADMAP.md`](ROADMAP.md) | what is left, in order, and what is deliberately not being done |
| `.claude/skills/eski-pivot/SKILL.md` | the pivot's component vocabulary and the mistakes already made once (wordmark font, hover colour, header alignment) |

`SPEC.md` and `docs/design/SURFACES.md` describe the deleted comics product
and have not been rewritten for the pivot — treat both as historical, not
current.

Two reference files you go to rather than read: [`ERRORS.txt`](ERRORS.txt)
(the `ESK-####` registry — every code, its cause, its fix) and
[`ICONS.txt`](ICONS.txt).

There is no `catchup.txt`, `TODO.txt`, or issue tracker. `ROADMAP.md` and
conversation are the only backlog.

---

## What is actually built

The **database**: `schema-clean.sql` — works (audio/video/image/text/other/
combination, with poster-only versioning and now a `bytes` column for the
storage-used stat), work_items, collections (curated groupings of existing
posts, distinct from a combination-kind work), content_tags (freeform),
comments (generalized, threaded one level deep, tombstoned on delete),
likes, save_folders (private, multi-folder bookmarking, distinct from
`collections`), seen_marks, reports, follows. Live, RLS-enforced, in use.

The **pivot pages** are built and live: `index.html` (home feed — real
queries, server-side tag/user/free-text search, sort by newest/popular/
comments, upload flow with real client-side video-frame and audio-waveform
cover generation), `profile.html` (posts/saved/settings, direct-edit
settings fields, a light/dark theme toggle, the storage-used stat),
`admin.html` (moderation: works/collections/comments/reports/users, gated
by `is_admin()` both in the UI and in every RLS policy it relies on).

`artboard.html` is still the design spec — every screen and overlay as
static HTML, Supabase-backed comments/pins for review. It's the mockup the
live pages are measured against, not itself a live surface.

---

## Structure

```
index.html         home feed: real works query, server-side search/filter,
                     the upload modal, live
profile.html       your posts/saved/settings, or someone else's posts at
                     /u/<handle>, live
onboarding.html    account creation: pick a handle. Runs once on first
                     sign-in via platform.js's maybeOnboard()
admin.html         moderation console — works/collections/comments/reports/
                     users — gated by is_admin() in the db, not just the UI
artboard.html      the pivot's design spec: every screen and overlay, live,
                     Supabase-backed comments/pins for review. Unlisted.
legal.html         terms, privacy, takedown (still a draft)

platform.js        shared auth/session layer (Supabase), maybeOnboard(),
                     mediaUrl() (now cdn.eski.lol). Every page loads it
palette.js         the theme, applied before anything paints. The ONLY
                     writer of data-theme (light or dark — see below)
palettes.css       two themes, light and dark, both the pivot's sage
                     accent. Cut from the old six-hue/three-treatment
                     system (2026-08-15) — see the file's own header
pivot.css          the pivot's shared component vocabulary: buttons, chips,
                     the feed grid, detail overlays (incl. the custom
                     audio/video player), tags, comments, upload
pivot.js           the pivot's shared runtime: auth/profile state, the grid
                     card renderer, the whole detail overlay, sign-in,
                     upload + cover generation, reporting
tokens.css         scale, spacing, type — the things themes do not change
loudness.js        ITU-R BS.1770-4 loudness meter. Still unused by anything
                     live; kept in case audio normalization gets built
hash-worker.js     sha256 content addressing for uploads, off the main thread
sw.js manifest.json  PWA precache list — not currently registered by any
                     page, so this is dormant until something calls
                     navigator.serviceWorker.register()

api/sign.mjs       Vercel function: signs R2 upload urls for a caller.
                     Content/table-agnostic

schema-clean.sql       the pivot model: works, work_items, collections,
                         collection_items, content_tags, comments, likes,
                         save_folders, save_folder_items, seen_marks,
                         reports, follows, plus admin policies. THE SCHEMA.
schema-quota.sql       upload_quota, claim_upload_quota — the daily object cap
schema-artboard.sql    artboard_items + its own storage bucket — the review
                         tool above, unrelated to the product schema

vendor/            vendored supabase-js (no CDN at runtime)
tests/             see tests/README.md — mostly pre-pivot and stale; only
                     structure.js and cache.js still mean what they say
docs/design/       the design work: final/ is the old comics direction,
                     shots/ is what the site looked like before the pivot,
                     refs/ is what it steals from
```

Several more database objects are live with no schema file — `admins`/
`is_admin()`, `user_prefs`, `rate_events` and its rate-limiting functions,
`tag_synonyms`/`canonical_tag()`, `account_live()`, `touch_updated_at()`,
`rls_auto_enable()` — applied through migrations directly rather than a file
in this repo. `schema-clean.sql`'s header has the full list.

`vercel.json` holds the two rewrites that make `/c/<slug>` and `/u/<handle>`
real addresses. There is no router.

## Tech stack

- **No build step, no framework.** Every page is a single HTML file of
  classic scripts.
- **Supabase** (`eu-north-1`) — auth and Postgres. Row-level security is
  where ownership, consent and visibility are actually decided; the
  interface only reflects it. Several invariants are Postgres **triggers**,
  not application code: one level of comment reply, tombstones, server-
  filled author names, and the one-way publish.
- **Cloudflare R2** — work media, addressed by content hash (`<sha256>.<ext>`),
  served from `cdn.eski.lol` (a Cloudflare custom domain, not the rate-
  limited `r2.dev` dev hostname). The browser uploads straight to R2 with
  short-lived presigned PUTs; nothing streams through Vercel.
- **Vercel** — the static app plus one serverless function (`api/sign.mjs`).
- **PWA** — `sw.js` precaches the app shell (network-first HTML, cache-first
  assets) but isn't currently registered by any page; the offline behavior
  is dormant.

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

- **There is no hue to pick any more.** `palette.js` writes `data-theme`
  as `light` or `dark`, full stop — the old six-hue/three-treatment picker
  (eighteen themes, footer-only) is gone. See `palettes.css`'s header and
  `docs/design/STYLE.md` §2 for why.
- **Publishing is one way.** A published work or collection can become
  private or be deleted; it can never go back to `draft`, because other
  people may already have commented on, liked, or built a collection around
  it. `post_status_guard()` in `schema-clean.sql` enforces this as a
  trigger, shared by both tables. Editing a published post's text/caption
  isn't a feature either — deliberately dropped, not unbuilt; adding a new
  version is the supported way to change what's published.
- **A version may only be added by the original poster**, enforced the same
  way — as a trigger (`works_version_owner_guard()`), not just a UI
  affordance, so pointing `version_of` at someone else's work fails even
  from a stale client.
- **One writer for the theme.** `palette.js`. The system this replaced had
  seven surfaces setting the theme on load from their own flag, so choosing
  one and navigating anywhere reset it.
- **No native `prompt()`/`confirm()`/`alert()` anywhere in the live
  product.** `Pivot.openPrompt()`/`openConfirm()` are the styled
  equivalents — a native dialog stops the theme dead and looks broken, not
  intentional. (`admin.html` and `artboard.html` are exceptions — an
  internal moderation console and an internal review tool, not held to the
  same bar.)
- **`text-transform: lowercase` appears nowhere** and must not come back. It
  forced other people's titles into a house voice and made `eski`, `Eski`
  and `ESKI` render identically while being three different strings.
- **Uppercase means clickable.** Not important — clickable. See `STYLE.md` §1.
- **`security definer` functions bypass RLS**, so the admin check has to be
  *inside* the function. `is_admin()` does that; the per-table admin
  policies in `schema-clean.sql` are what actually grant the reach —
  confirmed present for works/collections/comments/reports as of the
  2026-08-15 backend audit.
- **If a live database function or trigger isn't in any `schema*.sql`
  file, that doesn't mean it's safe to ignore.** Several were applied
  through migrations directly and are undocumented here — `schema-clean.sql`'s
  header has the list. Check `pg_get_functiondef` against the live project
  before assuming something doesn't exist.
