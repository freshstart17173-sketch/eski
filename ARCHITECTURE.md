# How eski is put together

**Read this before changing anything.** It says what each file owns, so a
change lands in one place instead of being added next to the thing that
already does it.

There is no build step. Every `.html` file is served as written, loads a few
shared scripts, and holds its own behaviour in one `<script>` at the bottom.
That is deliberate — the whole app is inspectable with view-source — but it
means **the discipline has to come from knowing what owns what**, because
nothing stops you defining the same thing twice.

`tests/structure.js` enforces the parts of this that can be checked
mechanically. If it fails, this document is what it is holding you to.

---

## The pivot, and where things actually stand (2026-08-15, updated)

eski stopped being a comics-only format and became a place to post anything —
audio, video, image, text, other, or a combination of several as one post —
plus curated collections, versioning, and a criticism-based comment system in
place of like/dislike. The **database is rebuilt for this already**:
`schema-clean.sql` is what is live, replacing the entire comics-era model
(comics/pages/tracks/parts/kudos/comic_tags/the old saves) in one pass, no
migration path kept — see that file's own header for the full accounting.

**`index.html` is rebuilt.** It's the real home feed now — genuine Supabase
queries against `works`/`content_tags`/`comments`/`likes`/`save_folders`/
`follows`/`seen_marks`, no mock content — built against `artboard.html`'s
`homepageHtml` mockup and its detail-overlay/upload-modal templates. See
`pivot.css` below for how the mockup's look became real tokens.

**`profile.html` is still the old comics product** — nav bars that link to
the deleted studio, comic cards with "Voice this" / "Score it" buttons,
reader deep-links — and queries tables that no longer exist. Rebuilding it
against `schema-clean.sql`, matching `artboard.html`'s `profileHtml` mockup,
is what's left of the pivot's largest remaining item. `index.html`'s upload
modal, detail overlay, tag/comment/save-folder wiring, and the auth-gating
pattern are all reusable as-is — `profile.html` needs its own Posts/Saved/
Settings tabs and the "create a collection" flow, not a second copy of any
of that.

**Known v1 gaps in the new `index.html`, left honest rather than faked:**
the mockup's feed-switcher (rename/add/delete several feeds) has no backing
table — "Discover" is the only feed, filtered live, nothing persisted across
a reload; video and audio posts get no auto-generated thumbnail yet (real
work — a canvas frame-grab or a waveform image — deferred, see the comment
by `uploadOne()`); "Edit post" isn't in the burger menu because there's no
edit flow yet, only Make private / Delete.

Deleted in the same pass, because they were the old product and not just its
database: `studio.html` (the composer), `author.html` (the script/cast
editor), `contribute.html` (the vo/soundtrack/sfx studio), `read.html` (the
reader), `spec.html` (the `.eski` file-format reference), `comments.js` (the
old comic-thread widget — a new one is needed, generalized over
work/collection rather than comic_id), `viewer.js` (page-turn pan/zoom, only
ever used by the reader and the two studios), `api/comic.mjs` (`/c/<slug>`
og:tag injection for a route that no longer exists).

---

## The rule that matters most

**One thing is decided in one place.**

The bug this codebase keeps producing is not a broken feature — it is a
correct fix that gets silently undone. `.btn.p:hover` was defined near the top
of `broadsheet.css` and again 330 lines later with a different value. Same
specificity, so source order won. It was fixed twice, and both times the site
did not change.

So, concretely:

- **Colour and hover for a shared control live in the interaction section at
  the foot of `broadsheet.css`,** and nowhere else. The structural rule higher
  up sets size, spacing, borders and type only.
- **A page's own `<style>` may not restate a shared control.** If `.btn` needs
  to look different on one surface, that surface has a class of its own.
- **Every colour comes from a token.** `palettes.css` is the only file that
  holds raw colour. (`artboard.html` currently has its own separate,
  deliberately-not-themed token set — an internal review tool, not a surface
  — and is not held to this; `tests/structure.js` still flags its hex
  literals, which is expected there.)

---

## Load order, and why it is not negotiable

Every themed page loads the same head in the same order:

```
platform.js           TYPE=MODULE, so it is deferred whatever you do
palette.js            classic, sync — must run BEFORE the stylesheets
tokens.css             metrics and type scale
broadsheet.css         the house style
palettes.css           the eighteen themes; last, so it wins
```

**`palette.js` runs before the stylesheets** because it stamps the chosen
theme onto `<html>`. Load it after and the page paints the default theme and
then repaints — the flash the whole token system exists to avoid.
`tests/structure.js` checks this on every page.

**`platform.js` is a module, so it never runs during parse.** Nothing may read
`window.eski` at the top level of a classic script. Every page waits on
`window.eski.ready`, and the pattern for it is at the top of each page's
script. This is what ESK-1005 is for.

`viewer.js` and `loudness.js` used to be part of this list on pages that
needed page-turning or audio measurement. Both are gone from every current
page (their only callers — the reader and the two studios — are deleted).
`loudness.js` (the ITU-R BS.1770-4 meter) is generic and left in the tree,
unused, because whatever the new upload flow does with audio will likely want
it again.

---

## What each file owns

### Shared

| File | Owns |
|---|---|
| `platform.js` | The Supabase client, the current user, `mediaUrl()`, and `dbError()`. The single boot path. Everything else waits on `window.eski.ready`. |
| `tokens.css` | Spacing, type scale, control heights, timings, and the handful of status colours that are fixed regardless of theme (`--danger`, and now `--like-bg`/`--like-ink` for the ruby-red Like state). **No theme colour.** |
| `docs/design/final/broadsheet.css` | The OLD comics-reader chrome: nav, `.btn`, plates, sheets, folds. Only `admin.html`/`legal.html` still lean on it; not used by any pivot page. |
| `pivot.css` | **The new product's shared component vocabulary** — buttons, chips, the feed grid, detail overlays, tags, comments, the upload modal. Ported from `artboard.html`'s `.eski-mockup` scope onto real tokens; see its own header comment for the two deliberate deviations (hover colour, corner radius). Used by `index.html`; `profile.html` should reuse it rather than redefine any of it. |
| `palettes.css` | The themes. The only file with raw colour in it. Now nineteen: the original eighteen (light/mono/dark × neutral/green/blue/red/amber/pink) plus **sage** (light/mono/dark), the pivot's reviewed accent (`#5B7A6B`), which `palette.js` sets as `DEFAULT`. |
| `palette.js` | Reads and stamps the theme, and draws the picker. |
| `hash-worker.js` | SHA-256 off the main thread, for content-addressed upload keys. Used by `index.html`'s upload flow exactly as the old studio used it. |
| `sw.js` | Precaches the app shell. Deliberately refuses media. |

### Surfaces

| File | Is |
|---|---|
| `index.html` | The home feed, rebuilt for the pivot: real `works` query with live tag/modifier filters, per-kind cards, a detail overlay (tags, comments, likes, save-folders, versions, the poster's burger menu), and the upload modal. See the pivot section above for what's still v1-scoped. |
| `profile.html` | Your comics, parts, shelf and settings — **still the old comics product**, querying tables that no longer exist. Pending rewrite, reusing `pivot.css` and `index.html`'s patterns. |
| `onboarding.html` | Account creation: pick a handle. Runs once, on first sign-in, via `platform.js`'s `maybeOnboard()`. |
| `artboard.html` | The complete design mockup for the pivot — every screen and overlay as static HTML, Supabase-backed comments/pins on top for review. Unlisted, `noindex`. This is the spec `index.html`/`profile.html` are being rewritten against. |
| `admin.html` | The moderation queue. |
| `legal.html` | Static prose: terms, privacy, takedown. |

### Server

| File | Is |
|---|---|
| `api/sign.mjs` | Signs presigned R2 uploads. A trust boundary — it is the only thing standing between a signed-in user and the bucket. Content/table-agnostic; nothing here is comics-specific. |

### Database

Schema lives in `schema-clean.sql` (the pivot model: works, work_items,
collections, collection_items, content_tags, comments, likes, save_folders,
save_folder_items, seen_marks, reports, follows, plus the admin/moderation
policies) and three narrowly-scoped files applied separately: `schema-quota.sql`
(upload ceiling), `schema-artboard.sql` (the artboard tool's own table and
bucket — unrelated to the product schema). All three are safe to re-run.

Several more pieces are live in the database with **no schema file at all** —
applied through migrations directly, undocumented until `schema-clean.sql`'s
header called them out: `admins`/`is_admin()` (the admin gate), `user_prefs`,
`rate_events`/`claim_rate()`/`claim_rate_sweep()`/`rate_limit()` (comment and
report rate limiting), `tag_synonyms`/`canonical_tag()` (tag normalization,
not read by anything yet), `account_live()`, `touch_updated_at()`, and
`rls_auto_enable()` — an event trigger that turns RLS on for every new public
table automatically, which is why every table above already has it on even
though `schema-clean.sql` also does it explicitly. **If you find a live
function or trigger this document does not mention, it probably predates the
pivot and was applied outside this repo's schema files — check
`pg_get_functiondef` against the live project before assuming it is dead.**
That gap is exactly how `file_report()`, `profiles_tombstone()`,
`delete_my_account()` and `comments_rate_guard` were nearly left pointing at
tables `schema-clean.sql` dropped; see that file's header for the fixes.

**The policies are the rule, not the UI** — a page hides a control it knows is
refused, but the insert is where the refusal actually happens.

---

## Where a change goes

| If you are changing… | It goes in |
|---|---|
| How a button looks when hovered | the interaction section of `broadsheet.css`, once |
| A colour, any colour | `palettes.css` — never a literal in a page |
| A spacing or type step | `tokens.css` |
| Who may do what | `schema-clean.sql` (a policy) first, the UI second |
| A new error condition | a new `ESK-####` **and** a line in `ERRORS.txt` |
| Anything visual | run `tests/shots.js`, then the `eski-ui-audit` skill |

---

## The tests, and what each is really for

`tests/README.md` has the full list. Most of them — `smoke.js`, `errors.js`,
`live.js`, `live-input.js`, `live-comic.js`, `cues.js`, `loudness.js`,
`recording.js`, `viewer-fit.js`, `wordmark.js`, `shots.js` — were written
against the reader/studio/composer and are stale until the pivot pages exist
to test. `structure.js` and `cache.js` are the two that still mean what they
always meant and are worth running now.

---

## Known shape problems

Written down rather than left to be rediscovered.

- **`profile.html` is still the old product.** Not a small patch: needs
  rebuilding against `works`/`collections`, reusing `pivot.css` and
  `index.html`'s query/overlay patterns. See `ROADMAP.md`.
- **The criticism marks (`!` / `?` / `!!`) are designed, not built.**
  `comments.mark_type` exists and is unused; a plain Like (`likes` table) is
  what ships today.
- **Saved/named feeds have no backing table.** `index.html`'s feed switcher
  is one feed ("Discover"), filtered live. The mockup's rename/add/delete
  affordance was deliberately left out rather than built against nothing —
  see `ROADMAP.md` if this becomes worth a real table.
- **No video or audio thumbnails.** A post of either kind has no `cover_key`
  yet — its card shows a play glyph on a plain box. Generating one (a canvas
  frame-grab, a waveform image) is real work, not wired.
- **`index.html`'s own inline `<script>` is doing everything** — feed query,
  filters, the detail overlay, the upload flow. `studio.html` was 3,500
  lines for the same reason before it was deleted; watch this file the same
  way if `profile.html`'s build wants to share more than `pivot.css` with it.
