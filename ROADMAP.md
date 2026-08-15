# eski — what's left, in order

Sorted by impact, biggest first. Times are how long the work takes including
tests and docs.

This is the only backlog. If it is not here or in `docs/design/STYLE.md`, it is
not tracked — there is no issue tracker and there are no other todo files.

---

## 2026-08-15: the pivot — the rebuild is done

eski stopped being a comic-and-soundtrack format and became a place to post
anything — audio, video, image, text, other, or a combination of several as
one post — plus curated collections and versioning. `schema-clean.sql`
replaced the entire comics-era database in one pass. `index.html`,
`profile.html`, `pivot.css`, and `pivot.js` are the real, live, schema-backed
rebuild — not mockups — measured against `artboard.html` screen by screen
(all 14) until they matched. `studio.html`, `author.html`, `contribute.html`,
`read.html`, `spec.html`, `comments.js`, `viewer.js`, and `api/comic.mjs` are
gone with the old product they belonged to.

---

## 2026-08-15: stabilization + admin rebuild — the site is safe to open now

A first real signed-in walkthrough surfaced a pile of bugs the artboard
review didn't, and both blockers below got closed the same day.

**Bugs found by actually using it, all fixed:**
- `sw.js` was serving stale bytes — its precache list still named deleted
  pages and never named `pivot.css`/`pivot.js`, under a cache version that
  hadn't moved since before the pivot. Likely explanation for "the pink
  hover is still there" / "the wordmark is still Gnomon" reports on
  already-fixed code. Bumped to v16, list corrected, dead vendor files
  (`panzoom.js`, `webm-muxer.js`) dropped from both the list and disk.
- **The 21-theme picker is gone.** Cut to two: `light` and `dark`, both the
  pivot's sage accent — see `palettes.css`'s header and `docs/design/STYLE.md`
  §2. The toggle lives in profile.html's Settings tab now.
- `.medial` (the detail overlay's media pane) had no CSS — ported from the
  mockup without its `width:58%` rule, so it collapsed to content size.
  Worst on audio, where a 76px icon was the only thing holding it open.
- The audio play button was decorative, wired to nothing.
- Native `prompt()`/`confirm()` in the live product — replaced with
  `Pivot.openPrompt()`/`openConfirm()`.
- Settings required an Edit click before you could type — every field is a
  live input now.
- Home/Profile/Upload showed when signed out, with nowhere to go — hidden
  until a session exists.
- Account creation was unreachable — `ARCHITECTURE.md` claimed `platform.js`
  had a `maybeOnboard()` redirecting first-time sign-ins to
  `onboarding.html`; it never existed. Added.
- A collection-publish upload would have failed outright — `pivot.js`
  briefly tried to write `work_items.cover_key`, a column that doesn't
  exist. Caught by the backend audit before it shipped; reverted (nothing
  reads it yet — see Tier 2).

**Product changes made this session, not bug fixes:**
- Search bar removed; the content-tags box does its job — typing matches
  tags, `@handle`/display name (exact), or free text against title/caption/
  poster, and the matching now happens **server-side** in the query itself
  (was: fetch a page, then filter client-side over just that page).
- Native `<audio controls>`/`<video controls>` replaced with eski's own
  player — square track, sage fill, tabular-nums time, click-to-seek. The
  audio player shows the waveform itself (dense, continuous columns, no
  gaps — not the spaced-bar "soundcloud" look) instead of a decorative icon.
- Video/audio thumbnails, generated at upload time (`coverKeyFor()` in
  `pivot.js`): a canvas frame-grab for video, a high-density peak waveform
  for audio. Audio cards are always framed (background square, like text/
  other cards) with the waveform inset, not edge-to-edge.
- Video cards in the feed autoplay muted, first 5 seconds, on scroll into
  view (`IntersectionObserver`). **Audio does not autoplay with sound** —
  browsers block unmuted autoplay without prior interaction, and a muted
  audio preview has no value, so this was skipped rather than shipped
  broken. Click-to-open-and-play still works.
- A storage-used stat on profile Settings (owner-only) — `works.bytes`
  (new column, migration applied) is populated at upload time and summed.
- Post editing (title/caption/body after publish) removed — a deliberate
  product decision, not a gap; adding a version is the supported way to
  change what's published. Adding a version is untouched.
- Saved/named feeds dropped as a product (not "not built yet" — the live
  page never had the add/rename UI, so this was doc/CSS cleanup: dead
  `.feedplus`/`.feed[contenteditable]` rules removed from `pivot.css`).
- `R2_BASE` flipped to `cdn.eski.lol` — verified live (200 on a real object
  key) before flipping. See "Yours, not mine" §1, now done.
- A report button — `[data-report-work]` in the detail overlay,
  `[data-report-comment]` next to reply, `#prow-report` on someone else's
  profile. All call `file_report()` through a styled prompt.

### `admin.html` — rebuilt

Was fully broken: called `admin_overview()`/`admin_users()` (dropped) and
queried `comics`/`parts` (gone). Rebuilt against `works`/`collections`/
`comments`/`reports`. Confirmed by a backend audit before rebuilding — see
below — that RLS already grants admin read/write/delete on all four tables,
so only Users still needs a security-definer RPC (`admin_users()`, new:
email/`last_sign_in_at` live in `auth.users`, which PostgREST won't expose
even to an admin-RLS'd read). Reports sort CSAM-category first — a legal
reporting obligation, not just severity, per the table's own comment in
`schema-clean.sql`.

**Backend audit (2026-08-15), for the record:** every `.from()`/`.rpc()` call
across `index.html`/`profile.html`/`pivot.js`/`admin.html`/`onboarding.html`/
`api/sign.mjs` was cross-referenced against the live schema and its RLS
policies. Six gaps found, all in the old `admin.html` (now rebuilt) plus the
`work_items.cover_key` issue above (reverted). Zero RLS policy gaps —
everything the frontend writes to or does an ownership-scoped read on has a
matching policy.

**Still not "shippable and forget it":** the moderation queue exists now,
but a report only gets seen if someone opens `admin.html` and looks. There's
no notification path (email, anything) when a report — especially a CSAM
one — comes in. Worth revisiting before there's real traffic.

---

## Yours, not mine

Things no amount of code can do, because they need a dashboard login, a legal
name, or a decision that is yours.

### 1. Move the media off `r2.dev` · DONE

`cdn.eski.lol` is attached and serving — verified live against a real
object key. `platform.js`'s `R2_BASE` now points there.

### 2. Register a DMCA agent — DEFERRED until there are users

Still your call. Safe harbour is not retroactive — the trigger is the first
time somebody who is not you posts, not "when it gets busy."
<https://www.copyright.gov/dmca-directory/>, 15 minutes and $6.

### 3. Fill in the blanks in `legal.html` — 20 minutes

Still a draft, still says so in red. Needs an address for notices and two
product calls: may someone reuse a work of yours outside eski, and is
AI-generated content allowed and must it be labelled.

### 4. Turn on leaked-password protection — one Supabase dashboard toggle

Off by default. Checks new passwords against HaveIBeenPwned. Auth settings,
two minutes.

### 5. Supabase project region — confirmed `eu-north-1`

That's the whole explanation for the 1.7–3.4s round-trips measured earlier
(indexes and RLS plans are fine, see Tier 1 below — this was always
network/infra latency, not a query problem). Whether it's worth moving
depends on where the audience actually is; Supabase doesn't support an
in-place region migration, only recreate-and-copy, so this is a real
tradeoff to weigh, not a quick fix.

### 6. Billing alarms — the half that mattered is DONE

Inactivity emails are set up. Spend notification is still deferred until
there are users.

**Do not delete the `harness@eski.test` account.** It's the real,
password-based test account this project's own live tests sign in as
(`tests/live-account.sql`) — no powers a signed-up user lacks.

---

## Tier 1 — backend hygiene

### 7. RLS query-plan perf · DONE

28 policies called `auth.uid()` unwrapped, which Postgres re-evaluates per
row instead of once per query. Wrapped as `(select auth.uid())` everywhere
— `schema-clean.sql` matches what's live. 8 missing foreign-key indexes
added alongside it.

### 8. Upload quota on the signer · DONE

`claim_upload_quota` is untouched, still live, still 2000 objects/day,
still fails closed.

### 9. Cache headers · DONE

`vercel.json`'s asset list matches what's actually served post-pivot.

### 10. Account deletion · DONE

`delete_my_account()` is live — soft-deletes the profile, drops your draft
works/collections, save folders, follows, quota and prefs rows.

### 11. Video/audio thumbnails · DONE

See the 2026-08-15 entry above.

---

## Tier 2 — smaller product gaps

### 12. A collection's carousel has no cover art or audio player

`collectionPane()` in `pivot.js` renders each item's raw `media_key`
directly — fine for image, shows nothing useful for video (no frame-grab)
or audio (no player, just a broken `<img>`). `work_items` has no
`cover_key` column on purpose (see the 2026-08-15 entry above) — add one,
and wire the carousel to use it, when this is worth doing.

### 13. "By {name}" in the detail overlay isn't a link

`infoColHtml()`/`collectionInfoColHtml()` in `pivot.js` render the poster's
name as plain text in the metaRows, not a link to `/u/<handle>`. Not a
one-line fix: `works`/`collections` only store `owner_name` (a display-name
snapshot, set at insert time) — no handle. Two ways to get one: query
`profiles.select('handle').eq('id', work.owner_id)` client-side when the
overlay opens (one extra small query, consistent with how cheaply this
codebase already treats similar lookups), or add an `owner_handle` column
mirroring `owner_name` and populate it at insert time (avoids the query,
same staleness tradeoff `owner_name` already accepts if someone renames).

### 14. `sw.js` isn't registered by anything

The precache list is correct now (see above), but no live page calls
`navigator.serviceWorker.register('sw.js')` — grep confirms only stale test
files reference `serviceWorker` at all. If a service worker is showing up
in production, it's a leftover from an old deploy still running in
someone's browser, not something this deploy installs fresh. Decide: wire
registration back up, or delete `sw.js`/`manifest.json`'s offline story
outright rather than let it sit half-built.

---

## Tier 3 — hygiene

### 15. Real UI coverage for the pivot pages

The purge (2026-08-15) deleted the tests that were purely dead —
`smoke.js`, `recording.js`, `live.js`/`live-input.js`/`live-comic.js`,
`wordmark.js`, `cues.js`, `viewer-fit.js`, `make-fixtures.js` and their
fixtures — rather than leave them failing "expectedly" forever.
`.github/workflows/tests.yml` now runs exactly the four that still mean
what they say: `structure.js`, `cache.js`, `loudness.js`, `check-sign.mjs`.

What's still missing: `errors.js`'s page-driven half and `shots.js` both
need rewrites against `index.html`/`profile.html`'s real markup before
they're worth anything (see `tests/README.md`) — and beyond that, there's
still no real UI coverage at all: feed load, tag/search filtering, the
detail overlay per kind, upload, settings, sign-in gating. Should lean
UI-first (the pages ARE the product now), not just the backend-shape
checks `structure.js`/`cache.js` already cover.

### 16. Accessibility pass · ~2 hours

Icon-only buttons need labels, a keyboard-help overlay.

---

## Deliberately not now

- **Editing a published post's text/caption.** Was a Tier 2 gap; now a
  decided "no" (2026-08-15) — adding a version is the supported way to
  change what's published. `editFormHtml()` and its wiring were removed
  from `pivot.js`, not left half-built.
- **Saved/named feeds.** Was a Tier 2 gap; dropped as a product
  (2026-08-15) rather than built. "Discover" is the only feed.
- **Server-side search via `tag_synonyms`/`canonical_tag()`.** Moot —
  search moved server-side a different way (see the 2026-08-15 entry
  above), and those tables/functions still aren't read by anything.
- **A framework.** Still nothing slow here that hand-written DOM code causes.
- **Series pages, creator dashboard, direct messages.** Reasonable, none of
  them unblock anything.
- **Ducking, per-layer loudness, layered audio contributions.** These were
  the v3 comics gap. The product direction that needed them is retired; if
  audio-over-image or audio-over-video posts ever want a layering feature,
  design it fresh against `works`, don't resurrect the old `parts`/`tracks`
  model.
