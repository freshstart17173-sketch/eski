# eski — what's left, in order

Sorted by impact, biggest first. Times are how long the work takes including
tests and docs. Anything marked half a day is one sitting; anything marked days
is several.

This is the only backlog. If it is not here or in `docs/design/STYLE.md`, it is
not tracked — there is no issue tracker and there are no other todo files.

---

## 2026-08-15: the pivot, and what it retired

eski stopped being a comic-and-soundtrack format and became a place to post
anything. `schema-clean.sql` replaced the entire comics-era database in one
pass — no migration, no data kept, owner's explicit call. `studio.html`,
`author.html`, `contribute.html`, `read.html`, `spec.html`, `comments.js`,
`viewer.js`, and `api/comic.mjs` were deleted with it: not just their tables,
the pages themselves, because they were the old product.

**Everything below tier 0 that used to be about the v3 audio-layering gap
(voice parts, soundtracks, cue linking, the contribution hub, ducking,
loudness normalisation as a *product feature*) is gone from this list, not
because it was finished but because the product direction that needed it no
longer exists.** `loudness.js` (the meter itself) is still in the tree,
unused, in case a future audio-upload feature wants it — but there is no
studio left to wire it into.

---

## Tier 0 — wiring the pivot up (do this first)

### 0. Rebuild `index.html` and `profile.html` against the new schema · days

The single largest thing outstanding. Both pages are still the deleted
comics product — nav bars linking to a studio that no longer exists, comic
cards, reader deep-links — and both query tables `schema-clean.sql` dropped.
Neither will load correctly until this is done.

`artboard.html` is the complete design spec: home feed (feed switcher,
freeform content tags with a `+` search popover, the modifier-tags panel,
the 4-col square-bounding-box grid with real aspect ratios), the upload
modal (drag-drop, same-type-detected collection/versions choice, per-item +
overall captions), per-kind detail overlays (image/video/audio/text/other/
collection, the last with dual item-level and collection-level metadata),
profile tabs (Posts/Saved/Settings), the save-to-folder dropdown, the
version dropdown, the burger menu (private/delete/archive), threaded
comments with reply-to and collapse. Build against that, not from scratch —
every screen in it is already reviewed and settled.

**Two concrete naming traps to not reintroduce, both already hit once during
planning:** (1) the upload flow's "post as a collection" choice must write
`works.kind = 'combination'` + `work_items`, never a row in the `collections`
table — those are two different features that both happen to be called
"collection" in the UI. (2) `save_folders` (private, Pinterest-board style)
is not `collections` (public, curated) — two different "+" buttons on the
profile, two different tables.

### 0b. A new comment thread widget · half a day, once 0 is underway

`comments.js` was comic_id-shaped and is deleted. The new `comments` table is
generalized over `target_type`/`target_id`, one level of reply, tombstoned on
delete, rate-limited at 30/hour (`comments_rate_guard`, already live). The
widget needs rebuilding against that shape, not restoring — `artboard.html`'s
`commentsPanel()` is the design to match (reply-to indicator, nesting,
"show N more" collapse).

### 0c. The new upload flow · ~a day

`api/sign.mjs` and `claim_upload_quota` are untouched and content-agnostic —
no backend work needed there. What's missing is the client: drag-drop
multiple files, detect same-type and offer collection-vs-versions, per-item
+ overall captions, `.md`/`.txt` getting a title field. `artboard.html`'s
`uploadCard` is the design.

### 0d. Tests, once 0-0c exist

Everything in `tests/` except `structure.js` and `cache.js` drives or asserts
against the deleted pages and is stale — see `tests/README.md`. `smoke.js`'s
shape (drive the real page over localhost, zero console errors) and
`live.js`'s (publish/read/delete for real against prod) are both still the
right pattern for the new pages once they exist.

---

## Yours, not mine

Things no amount of code can do, because they need a dashboard login, a legal
name, or a decision that is yours.

### 1. Move the media off `r2.dev` — 20 minutes, then some waiting

Still worth more than everything else on this page put together, and
unaffected by the pivot — R2 storage and content-addressed keys didn't
change. Every object is fetched from one region with no edge cache, on a
hostname Cloudflare rate-limits on purpose.

**The full step-by-step is in [`docs/FASTER.md`](docs/FASTER.md) §1.** The
shape of it: put `eski.lol` on Cloudflare (free plan, **grey**-cloud the
Vercel records), attach `cdn.eski.lol` to the R2 bucket, add a cache rule
with a one-year TTL, turn on Smart Tiered Cache. Then one line in
`platform.js`: `const R2_BASE = 'https://cdn.eski.lol'`.

### 2. Register a DMCA agent — DEFERRED until there are users

Still your call. Safe harbour is not retroactive — the trigger is the first
time somebody who is not you posts, not "when it gets busy."
<https://www.copyright.gov/dmca-directory/>, 15 minutes and $6.

### 3. Fill in the blanks in `legal.html` — 20 minutes

Still a draft, still says so in red. Needs an address for notices and two
product calls: may someone reuse a work of yours outside eski, and is
AI-generated content allowed and must it be labelled.

### 4. Billing alarms — the half that mattered is DONE

Inactivity emails are set up. Spend notification is still deferred until
there are users.

**Do not delete the `harness@eski.test` account.** It is what
`tests/live-comic.js` and friends sign in as; it has no powers a signed-up
user lacks. (Its old draft-comic fixture, `harness-fixture`, is gone with
the comics table — that part of the old note is moot.)

---

## Tier 1 — open holes, unaffected by the pivot

### 5. Upload quota on the signer · DONE

`claim_upload_quota` is untouched, still live, still 2000 objects/day,
still fails closed. Content/table-agnostic, so it covers the new upload flow
with no changes.

### 6. Reporting and a moderation queue · mostly done

`reports` (generalized over work/collection/comment/profile) and
`file_report()` are live and fixed for the new schema. `admin.html` reading
the queue and a report button on each surface are still 0's job, not a
separate item.

### 7. Cache headers · DONE, updated for the pivot

`vercel.json`'s asset list was trimmed for the deleted files
(`viewer.js`/`comments.js` removed, `/c/:slug` rewrite removed). `cache.js`
still walks the HTML and asserts coverage — rerun it once 0's new pages
exist.

### 8. Account deletion · DONE

`delete_my_account()` is live — soft-deletes the profile, drops your draft
works/collections, save folders, follows, quota and prefs rows.
`profiles_tombstone()` blanks your public fields and relabels your posts and
comments "Deleted account." Both were fixed during the pivot (they pointed
at the dropped `comics` table) — no UI wires to this yet; that's a Settings
button in 0.

---

## Tier 2 — product, once 0 ships

### 9. The criticism marks (`!` / `?` / `!!`) · designed, not built

`comments.mark_type` exists and is unused. A plain Like (`likes` table,
ruby-red in the mockup) is what ships in 0. Whether marks replace or sit
alongside likes is still open — revisit once there's something to react to.

### 10. Modifier-tag search backing · small, once 0 exists

Every modifier tag is a pure query filter, no new storage:
posted-window (`created_at`), following/not-following (`follows`),
seen/unseen (`seen_marks`), liked (`likes`), saved (`save_folder_items`),
updated (has a `version_of` row), kind toggles (`works.kind`). This is query
code in the pages 0 builds, not a separate backend task.

### 11. Server-side search · deferred until it's needed

`tag_synonyms`/`canonical_tag()` exist, predate the pivot, and aren't read by
anything. Not urgent until the tag list outgrows an in-browser filter.

### 12. Collections, curation UX · the schema is done, the UI is 0's job

`collections`/`collection_items` are live. What's left is entirely UI: the
profile's "create a collection" flow, adding existing published works to
one. No backend work remains here.

---

## Tier 3 — hygiene

### 13. Run the tests on every push · needs revisiting

`.github/workflows/tests.yml` still runs the old ten. It will fail loudly
once it hits anything beyond `structure.js`/`cache.js`, correctly, because
the pages those tests drive are gone. Update the workflow once 0d has real
tests to run instead of leaving CI red for a known reason.

### 14. Accessibility pass · ~2 hours, once 0 ships

Icon-only buttons need labels, a keyboard-help overlay, swipe-to-turn where
relevant. Wants the new pages to exist first.

### 15. An offline/PWA pass · small, once 0 ships

`sw.js` still precaches the app shell. Revisit what "keep this one" means for
a work instead of a comic.

---

## Deliberately not now

- **A framework.** Still nothing slow here that hand-written DOM code causes.
- **Series pages, creator dashboard, direct messages.** Reasonable, none of
  them unblock anything.
- **Ducking, per-layer loudness, layered audio contributions.** These were
  the v3 comics gap. The product direction that needed them is retired; if
  audio-over-image or audio-over-video posts ever want a layering feature,
  design it fresh against `works`, don't resurrect the old `parts`/`tracks`
  model.
