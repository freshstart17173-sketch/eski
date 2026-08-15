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
(all 14) until they matched, including the upload flow, every detail-overlay
kind, the comment thread, save-folders, and the poster-only edit/version/
delete chrome. `studio.html`, `author.html`, `contribute.html`, `read.html`,
`spec.html`, `comments.js`, `viewer.js`, and `api/comic.mjs` are gone with
the old product they belonged to.

---

## Blocker — do not share this site until these are done

### A. Rebuild `admin.html` · same size as the profile.html rebuild

**Currently fully broken.** It calls `admin_overview()` and `admin_users()`,
both dropped in the clean-slate migration, and queries `comics`/`parts`,
both gone — every load errors. This is the moderation queue, and per the
CSAM/reporting obligations already noted below (item 3), you cannot
responsibly open the site to strangers without a working one. Rebuild
against `reports`/`works`/`collections`/`comments`, reusing `pivot.css`/
`pivot.js` where it fits rather than a third copy of the card/overlay code.

### B. A report button, anywhere

`file_report()` is live and correct (fixed for `work`/`collection`/
`comment`/`profile` targets). Nothing in the UI calls it — there is no way
for a reader to flag anything. Small once (A) exists to receive the reports.

---

## Yours, not mine

Things no amount of code can do, because they need a dashboard login, a legal
name, or a decision that is yours.

### 1. Move the media off `r2.dev` — 20 minutes, then some waiting

Still the single biggest performance item on this page. Every object is
fetched from one region with no edge cache, on a hostname Cloudflare
rate-limits on purpose.

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

### 4. Turn on leaked-password protection — one Supabase dashboard toggle

Off by default. Checks new passwords against HaveIBeenPwned. Auth settings,
two minutes.

### 5. Check your Supabase project's region — investigate

Measured live: `/works` queries are taking **1.7–3.4s round-trip against an
empty table.** A bare REST call with no auth is 585ms TTFB by itself — that's
network/infra latency, not a query problem (indexes and RLS plans are fine,
see Tier 1). If the project's region is far from where your traffic actually
comes from, this is the fix; if it's already close, worth a support ticket
before blaming the code.

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
added alongside it (`collections.owner_id`, `comments.user_id`,
`likes.user_id`, and five more).

### 8. Upload quota on the signer · DONE

`claim_upload_quota` is untouched, still live, still 2000 objects/day,
still fails closed. Content/table-agnostic, covers the whole upload flow.

### 9. Cache headers · DONE

`vercel.json`'s asset list matches what's actually served post-pivot.
`cache.js` walks the HTML and asserts coverage.

### 10. Account deletion · DONE

`delete_my_account()` is live — soft-deletes the profile, drops your draft
works/collections, save folders, follows, quota and prefs rows.
`profiles_tombstone()` blanks your public fields and relabels your posts
and comments "Deleted account." Wired to a real button in profile.html's
Settings tab.

### 11. Video/audio thumbnails · real work, not started

A video or audio post has no `cover_key` — its card shows a bare play glyph
on a plain box, no poster frame. Needs a canvas frame-grab (video) or a
generated waveform image (audio) at upload time.

---

## Tier 2 — smaller product gaps

### 12. Saved/named feeds have no backing table

`index.html`'s feed switcher is one feed ("Discover"), filtered live. The
mockup's rename/add/delete affordance was deliberately left out rather than
built against nothing. Add a table if this turns out to matter.

### 13. Server-side search · deferred until it's needed

`tag_synonyms`/`canonical_tag()` exist, predate the pivot, aren't read by
anything. Current search is client-side substring matching — genuinely fine
until the feed outgrows one query.

### 14. Post editing is text-only

Title/caption/body, not the underlying file. Swapping `media_key` after
publish (and what that does to a `combination`'s `work_items`) is a real
design question, not built.

---

## Tier 3 — hygiene

### 15. Run the tests on every push · needs a rewrite

`.github/workflows/tests.yml` still runs the pre-pivot ten. `structure.js`
and `cache.js` still mean what they always meant; everything else
(`smoke.js`, `live.js`, the rest) drives pages that no longer exist. Needs
real coverage for `index.html`/`profile.html`/`pivot.js` before this is
worth turning back on.

### 16. Accessibility pass · ~2 hours

Icon-only buttons need labels, a keyboard-help overlay.

### 17. An offline/PWA pass · small

`sw.js` still precaches the app shell. Revisit what "keep this one" means
for a work instead of a comic.

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
