# eski — what's left, in order

Sorted by impact, biggest first. Times are how long the work takes including
tests and docs. Anything marked half a day is one sitting; anything marked days
is several.

This is the only backlog. If it is not here or in `docs/design/STYLE.md`, it is
not tracked — there is no issue tracker and there are no other todo files.

Nothing here is a suggestion to do all of it. The four at the bottom are the
ones I would not leave sitting.

---

## Yours, not mine

Four things no amount of code can do, because they need a dashboard login, a
legal name, or a decision that is yours.

### 1. Move the media off `r2.dev` — 20 minutes, then some waiting

Worth more than everything else on this page put together. Every page and every
clip is fetched from one region with no edge cache, on a hostname Cloudflare
rate-limits on purpose and which under real traffic starts answering 429.

**The full step-by-step, with the checks, is in
[`docs/FASTER.md`](docs/FASTER.md) §1.** The shape of it: put `eski.lol` on
Cloudflare (free plan, **grey**-cloud the Vercel records — you do not want it
proxying the app), attach `cdn.eski.lol` to the R2 bucket, add a cache rule
that overrides origin with a one-year TTL, turn on Smart Tiered Cache. Then one
line in `platform.js` changes: `const R2_BASE = 'https://cdn.eski.lol'`.

The cache rule is the part not to skip — it is what fixes comics published
before August, which went up with no cache headers at all.

### 2. Register a DMCA agent — 15 minutes and $6

You host other people's artwork; safe harbour is not automatic.
<https://www.copyright.gov/dmca-directory/>. **Put a three-year reminder in
your calendar** — the registration expires silently and the protection goes
with it.

### 3. Fill in the blanks in `legal.html` — 20 minutes

The page exists and the footer links point at it. It is a draft and says so in
red at the top. It needs an address for notices, your name and postal details
for the agent block, and two decisions I deliberately left blank because they
are product calls, not legal ones: can an author reuse a contributed voiceover
**outside** eski, and is AI-generated voice allowed and must it be labelled.
Then delete the red box. Have someone who knows this read it.

### 4. Billing alarms — 10 minutes

Supabase pauses a free project after enough inactivity, and a paused project is
a dead site — turn on whatever usage email they offer. R2 has no egress fees
but bills per read; set a spend notification. Item 1 cuts those a lot.

Two smaller ones, whenever: start filling `tag_synonyms` (the table and
`canonical_tag()` exist, nothing reads them yet — see item 12), and delete the
orphan draft `untitled-76nm`, left over from the save-then-publish bug. The bug
is fixed; the row is yours to remove from the admin console.

---

## Tier 1 — open holes

### 5. Consent controls in the studio · ~1–2 hours

Anyone signed in can attach a voice track or a soundtrack to your comic, and
you have no way to say no.

The database already has the switch — `comics.voice_consent` and
`music_consent`, both defaulting to `open`, with a live policy enforcing them.
What is missing is a pair of toggles in the studio's settings drawer and on the
profile row, plus the same two words on the comic page so a contributor knows
before they start recording.

A hole opened by wiring parts. It should close in the same week.

### 6. Upload quota on the signer · ~2–3 hours

One person with a script can fill the bucket and the bill. `api/sign.mjs` signs
up to 500 upload urls per call for any signed-in user, with no per-user limit
and no size cap. A presigned PUT cannot enforce a content-length, so the cap
has to be counted *before* signing: objects per user per day, and a maximum
page count per comic. One small table, or a count against `pages`.

Cheap now, awkward later — once people have published, any limit is
retroactive and someone is already over it.

### 7. Reporting and a moderation queue · ~2–3 hours

Strangers can attach audio to your comic and there is no button anywhere to
complain about it. Two gaps left now that `admin.html` exists:

- `reports.target_type` only allows `'comic'`. It needs `'vo'` and
  `'soundtrack'` — one `alter table`, sketched at the foot of
  `schema-parts.sql`.
- No report button exists on any surface.

The admin console already reads the table, so the queue half is done. Add a
Discord webhook on insert (~20 minutes) or reports rot until someone remembers
to look.

### 8. Cache headers · ~30 minutes

Every visitor re-downloads things that can never change. `vercel.json` sets
rewrites and an install command and nothing else. Media keys are
content-addressed, so they can be immutable for a year; HTML must stay
no-cache so deploys land immediately. Best effort-to-payoff ratio left in the
repo, and it compounds with item 1.

---

## Tier 2 — the v3 gap

This is the largest block of work in the project. `SPEC.md` describes layered
audio and per-line voice performances; the running app implements v2, one
soundtrack per comic. The design for all three studios is built and styled in
`docs/design/final/studios/` and hooked to nothing.

### 9. The contribution studio · ~2–3 days

**Designed and decided — see [`docs/design/CONTRIBUTION.md`](docs/design/CONTRIBUTION.md).**
The voiceover and composer studios collapse into one screen: rows are pages,
columns are layers, and the stance you entered with decides which columns are
live. Everything else stays visible and audible but refuses a drop, which is
what finally lets a voice actor hear the score they are performing over.

Settled: one character per part, stance fixed at creation (`parts.kind`
already holds it), sound effects travel with the part, and the effects layer
has exactly one owner at play time with the composer winning even when their
effects layer is empty.

Still open in the interaction, not the model: no fades or crossfades anywhere
though the manifest has them; nothing expresses "this bed ducks under
dialogue"; two clips on one layer can overlap with nothing deciding which
wins; the cue rail can only be filled from the bay, not recorded into; and
there is no way to **see a range as a shape** now that the lanes are gone,
only as "pages 7–13" in a row. That last one is the real question left.

### 9b. Overlapping dialogue · ~4–6 hours

**Designed and decided — same document, Part 2.** A cue is relative to the cue
before it: `after`, `with`, or `over`, and `over` carries a *fraction* of the
previous entry rather than a millisecond offset, because the audio does not
exist when the author writes it and there is more than one of it afterwards.
Two columns on the lines table, one control per row in the author studio, and
a scheduler in the reader that walks a page's entries at page turn instead of
firing them all at zero. A group still playing when the page turns is cut.

Blocks nothing, and makes the author studio able to describe a conversation
rather than a list.

### 10. The reader plays layers · ~1–2 days

It has to let a reader pick the mix — which voiceover per character, which
score — and play the layers stacked. Everything downstream of this is blocked
on it, including rewriting `spec.html`, which still documents v2 and carries a
note saying so.

### 11. The open questions at the foot of `SPEC.md`

Layer precedence, ducking across contributors, per-layer loudness, and what
happens to page ranges when an author inserts a page. Decisions, not code, and
9 and 10 will force them.

---

## Tier 3 — making contribution findable

### 12. The contribute hub · ~3–4 hours

Parts work and nobody can find a comic to make one for. Barely a feature: a
comic with open voice consent and an uncast character **already is** an open
role. It is a query, not a data model. One page listing comics open for voice
or music, with the characters nobody has voiced yet, is the main lever against
the cold-start problem. Pairs with a "filler" badge on comics carrying
reference tracks.

### 13. Swap voices and soundtracks while reading · ~4–6 hours

The mix picker on the comic page is fine for choosing before you start and
useless once you have. The reader needs the cast bar on arrival — who is
voicing whom, with a preview and a link to their profile — and a swap panel
during the read that re-resolves the current page and keeps your position.
Mostly UI; the parts rows exist and `comicFromApi` already merges them.

### 14. Preview clips for voice tracks · ~2–3 hours

You cannot hear a voice actor before committing to their whole track. Generate
a preview at publish time from the first three lines, store one `preview_key`
on the part, play it from the cast bar and the contribute hub. Deterministic,
one small extra upload, and it makes every list above browsable instead of a
wall of names.

### 15. Server-side search · ~3–4 hours

`tag_synonyms` and `canonical_tag()` exist and nothing reads them. Search still
filters an already-loaded array in the browser, which is genuinely instant into
the thousands — so this is not urgent. It becomes urgent the moment the shelf
outgrows one query, and the synonym table is what makes `slice of life`,
`slice-of-life` and `sliceoflife` stop being three tags that cannot find each
other.

### 16. Collections · ~an afternoon of code

The highest-value product idea in `docs/RESEARCH.md`, and the code is the small
half: a table and a rail on home. **The blurb is the actual product** — with
twenty comics no algorithm helps, and what does help is four of them put
together with a sentence about why. MUBI ran on thirty films at a time doing
exactly this. Blocked on you deciding what a collection is.

---

## Tier 4 — the studio, and hygiene

### 17. Autosave, resumable uploads, reopening drafts · ~5–7 hours

Close the tab and lose everything; a failed upload starts over; a draft saved
to the server cannot be opened again. Three symptoms of one missing thing:
nothing snapshots your work locally. Save studio state plus media blobs to
IndexedDB on a debounce and offer to restore on open. The same record makes an
interrupted upload resumable — content-addressed keys mean an object already in
the bucket never needs sending twice.

The largest genuine gap in the authoring app.

### 18. Pre-export validation and export progress · ~2 hours

Duplicate trigger pages, tracks past the last page, zero pages — caught before
export rather than after. Plus a percentage on big exports.

### 19. Kudos and view counts · ~3–4 hours

Two tables that exist and nothing writes to them. Kudos is one button, one
insert, no removal, count displayed. Views is one insert when a comic opens.
Attribution history cannot be backfilled, so the insert should start early even
though payouts are deferred.

### 20. Account deletion · ~2–3 hours

Supabase gives users no way to delete themselves, so today it is a manual job
in a dashboard. Someone will ask, possibly in the same breath as asking why
there is no privacy policy.

### 21. Run the tests on every push · ~1 hour

The suite only runs when someone remembers to. GitHub Actions, the local
runners, gate deploys on green. The local suites mock every external
dependency, so this is mostly YAML — but note the live suites need real
credentials and should not gate a PR.

### 22. The small performance batch · ~2–3 hours

Gnomon is base64-inlined in `tokens.css` and it is the only remaining reason
that file is 14 KB — move it to one `.woff2`. Revoke off-screen page blobs so a
long comic stops growing in memory. Decode with `createImageBitmap`. Add a
low-resolution placeholder so pages do not flash blank.

### 23. Accessibility pass · ~2 hours

The icon-only buttons say nothing to a screen reader. Labels on every one, a
keyboard-help overlay, and swipe-to-turn in the reader. Pinch to zoom already
works — the reader, the author studio and the composer preview all run on the
vendored Panzoom, which handles two pointers.

### 24. Per-character volume in the reader · ~2 hours

Asked for, never built. Wants item 10 first if it is going to survive the move
to layers.

### 25. An offline download button · ~2–3 hours

The service worker caches what you have read; there is no way to say "keep this
one". Small, and the PWA plumbing is already there.

---

## Deliberately not now

- **A framework.** Measured, not guessed: nothing slow in this project is
  caused by hand-written DOM code. Revisit only if a second surface needs real
  routing.
- **Mixes as first-class rows.** Combination popularity, canonical mixes,
  payout splits. The parts table can grow into it; nothing today is asking.
- **Series pages, creator dashboard, troupes, direct messages.** All reasonable.
  None of them unblock anything.
- **Panel-level metadata / Guided View.** See `docs/RESEARCH.md` §1 — expensive
  to author, and the most famous implementation of it was retired.

---

## If you only do four things

Items 1 through 4 are yours and take an afternoon between them. Then 5, 6 and 8
in one sitting — consent, quota, cache headers, call it half a day.
