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

Five things no amount of code can do, because they need a dashboard login, a
legal name, or a decision that is yours. Most are now done or deliberately
deferred — **item 1 is the one still worth doing.**

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

### 2. Register a DMCA agent — DEFERRED until there are users

Your call, and a reasonable one: with no users there is nothing to receive a
notice about. Two things to know so the deferral stays deliberate rather than
forgotten.

Safe harbour is not retroactive — it protects you from the moment you
register, not from the moment you needed it. So the trigger is **the first
time somebody who is not you uploads artwork**, not "when it gets busy". That
may be the same day you show anyone the contribute hub.

<https://www.copyright.gov/dmca-directory/>, 15 minutes and $6, and it expires
silently after three years.

### 3. Fill in the blanks in `legal.html` — 20 minutes

The page exists and the footer links point at it. It is a draft and says so in
red at the top. It needs an address for notices, your name and postal details
for the agent block, and two decisions I deliberately left blank because they
are product calls, not legal ones: can an author reuse a contributed voiceover
**outside** eski, and is AI-generated voice allowed and must it be labelled.
Then delete the red box. Have someone who knows this read it.

### 4. Billing alarms — the half that mattered is DONE

The inactivity emails are set up, which was the part that is not about
traffic: a quiet project is more likely to be paused than a busy one, and a
paused project is a dead site.

The spend notification is deferred until there are users, which is right — R2
bills per read, and nobody is reading yet.

### 4b. Paste the R2 CORS policy — DONE

Applied in the dashboard. GET and HEAD are `*`; PUT keeps its allowlist.
ESK-6003 opening an eski in the studio should be gone from preview deploys and
localhost — worth confirming once, since it is the only way to know the
dashboard took it.

Two smaller ones, whenever: start filling `tag_synonyms` (the table and `canonical_tag()` exist, nothing
reads them yet — see item 12), and delete the orphan draft `untitled-76nm`,
left over from the save-then-publish bug. The bug is fixed; the row is yours to
remove from the admin console.

**Do not delete `harness-fixture`.** It looks like the same kind of orphan and
is not: it is a four-page draft owned by `harness@eski.test` carrying a
five-entry overlapping conversation, and `tests/shots.js` opens it to
photograph the author studio's cast rows and after/with/over controls. Deleting
it makes that audit config shoot an empty picker instead.

---

## Tier 1 — open holes

### 5. Consent controls in the studio · DONE

Anyone signed in could attach a voice track or a soundtrack to your comic and
you had no way to say no. The database had the switch and a live policy
enforcing it; nothing in the app ever showed it to you.

Three checkboxes in the studio's settings drawer now — voices, score, sound
effects — written on every save, and the same words on the comic page so a
contributor knows before they record rather than after. `sfx_consent` is the
third axis, applied. A closed axis is never the one the contribute link opens
on, and a comic closed to all three offers no contribute route at all; both
are asserted in `smoke.js`.

Still open: the toggles are not on the profile row, only in the studio.

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

### 8. Cache headers · DONE

`vercel.json` set rewrites and an install command and nothing else, so every
visitor re-downloaded things that can never change.

Three policies. `/vendor/*` is immutable for a year — those are pinned
versions, and **re-vendoring must rename the file**, because a browser holding
an immutable copy will never ask again. App scripts and stylesheets get 60
seconds plus a day of `stale-while-revalidate`, so a repeat visit paints from
cache and refreshes behind itself. HTML revalidates every time, which is what
makes a deploy land instead of leaving people running last week's javascript
against this week's database.

`tests/cache.js` guards it, and guards the failure that actually happens:
config fails SILENTLY, so a rule with a typo does not error — it just never
matches. Rather than checking the config against itself, the test walks the
HTML for every same-origin asset and asserts each one is covered. It caught
`manifest.json` immediately, and it would have caught `loudness.js`, which was
added this week to a rule that names files one at a time.

Its own pattern translator got the bug it exists to catch: escaping the source
before expanding `(.*)` turned every wildcard into "a run of literal dots", so
every rule matched nothing and every check passed vacuously until the
assertions were strong enough to notice.

---

## Tier 2 — the v3 gap

This is the largest block of work in the project. `SPEC.md` describes layered
audio and per-line voice performances; the running app implements v2, one
soundtrack per comic. The design for all three studios is built and styled in
`docs/design/final/studios/` and hooked to nothing.

### 9. The contribution studio · BUILT

**Designed and decided — see [`docs/design/CONTRIBUTION.md`](docs/design/CONTRIBUTION.md).**
The voiceover and composer studios collapse into one screen: rows are pages,
columns are layers, and the stance you entered with decides which columns are
live. Everything else stays visible and audible but refuses a drop, which is
what finally lets a voice actor hear the score they are performing over.

Settled: **three stances** — voice, score and sound effects — with exactly
one column writable under each, which is the same sentence for all three. One
character per voice part, stance fixed at creation (`parts.kind` already holds
it, and gains `'sfx'`). Effects are a part kind of their own, open to anyone,
picked by the reader on its own like a score, so no layer ever needs a
precedence rule.

Needs one migration beyond `parts.kind`: `comics.sfx_consent`, because an
author who agreed to be scored has not thereby agreed to gunshots.

`contribute.html` ships it: the author studio's frame exactly, a stance
segment, and one writable column under each — asserted in `smoke.js`, because
a live row and a dead row differ by an attribute rather than by much ink.
Consent is checked twice, once in the studio so nobody wastes an evening and
once in the policy because that is the rule.

**Recording is in**, with a level meter and a timer, and every clip is
measured for loudness on the way in (see 9c). `tests/recording.js` drives the
whole path against Chromium's fake capture device, so it runs with no
microphone and no clicking.

**Still to do here**, smallest first:

- Two clips on one layer can overlap with nothing deciding which wins.
- No way to **see a range as a shape** now that the lanes are gone, only as
  "pages 7–13" in a row. Still the real open question.
- A part cannot be withdrawn from the studio yet — the policy allows it, so
  this is a button and a confirm.
- No fades or crossfades, though the manifest has them.

### 9c. Loudness normalisation · DONE

Every clip is measured with ITU-R BS.1770-4 — the algorithm behind EBU R128 —
and `tracks.gain_db`, which the reader has always applied and nothing ever
set, now carries target-minus-measured. `loudness.js` is the meter and
`tests/loudness.js` holds it to the published EBU conformance cases.

Three things worth knowing about it:

- **The correction is per PART, not per clip.** A whisper and a shout are one
  performance; pulling each to the same loudness would flatten the acting out
  of it. What needs fixing is the offset between two contributors, not the
  range inside one person's work. Same distinction streaming services draw
  between track and album normalisation.
- **The composer studio was measuring RMS**, which is amplitude and not
  loudness, against its own targets. Two studios disagreeing about the same
  file is precisely the mismatch this exists to remove, so it now goes through
  the same meter.
- **Mono is deliberately not BS.1770.** The spec would read a mono file 3 LU
  quieter, but the browser upmixes mono to both speakers on playback and puts
  that 3 dB straight back — and a laptop voice take is almost always mono.

### 9d. Ducking · ON THE BACK BURNER, deliberately

Pulling the score down whenever a voice is present is the usual answer to "the
music buries the dialogue". It needs a sidechain, an attack and a release, and
it is audible when it mistimes.

Most of what it is for is already done by 9c: the layers arrive at random
loudnesses, and once they are placed at fixed sensible ones relative to each
other — speech at -16 LUFS, effects at -18, a score at -22 — a bed sits under
dialogue without anything moving. `tracks.duck` exists and the reader's DUCK
table is still there, so picking this up later is wiring rather than design.

Revisit if a real comic turns out to need it. Do not build it speculatively.

### 9b. Overlapping dialogue · BUILT (author side)

**Designed and decided — same document, Part 2.** A cue is relative to the cue
before it: `after`, `with`, or `over`, and `over` carries a *fraction* of the
previous entry rather than a millisecond offset, because the audio does not
exist when the author writes it and there is more than one of it afterwards.
Two columns on the lines table, one control per row in the author studio, and
a scheduler in the reader that walks a page's entries at page turn instead of
firing them all at zero. A group still playing when the page turns is cut.

The author side is live: the control is on every entry after the first, a
linked run draws one bracket, and `tracks.link` / `tracks.over_pct` are
applied with the pair kept honest by a check constraint.

**The reader half is not built** — it still fires every one-shot on a page at
the page turn. That is the scheduler described above, and it belongs with item
10 rather than here, because both need the same rewrite of how a page's audio
is started.

### 10. The reader plays layers · PARTLY DONE — cues land, one score

**The cue scheduler is in.** A page's one-shots are scheduled from the
`after` / `with` / `over` timing the author studio writes, so a page is a
conversation rather than a chord. Several can sound at once, which is what
`with` and `over` mean, so playback owns a small pool of elements instead of
the single one the old stepper used.

Durations are MEASURED before the schedule is built, because `over` is a
percentage of a take whose length is not known until it loads — that is the
whole reason it is a percentage and not a millisecond offset.

The stepper is gone with it: a cursor over one element cannot express two
lines at once, and it was the reason the authored timing had nothing reading
it. The loop setting was repurposed rather than dropped — it wrapped a cursor,
and now repeats the page.

**Still one score layer**, deliberately, and that is the remaining half:

- A reader still cannot pick between two published scores mid-read, or hear a
  contributed voice part instead of the author's. `comicFromApi` already
  merges parts into the track list when it is handed part ids; nothing lets a
  reader change that selection without going back to the comic page. That is
  item 13.
- A published effects part is not selectable at all yet.
- No crossfade between two scores, since there is only ever one.

`tests/cues.js` holds the arithmetic — after/with/over, chained runs, the
clamp on a silly percentage — as a pure function, with no audio and no
browser needed for the maths.

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

### 13. Swap voices and soundtracks while reading · DONE

The mix sheet existed and worked, but APPLYING it set `location.href` — the
hash kept your place, so it looked fine, and it threw away every decoded page
to fetch the same forty-five images again. A reader comparing two takes of one
line paid for the whole comic twice, which means nobody does it twice.

Only the audio changes when the mix changes, so only the audio is rebuilt now:
a pristine copy of the author's own tracks, the chosen parts merged onto it
with the SAME function the initial load uses, and the page re-cued. Pages,
scroll and zoom are never touched, and the url still gets the mix through
`replaceState` so it still travels with a link.

Keeping the author's tracks pristine is the part that matters: merging a part
rewrites the slot it fills in place, so without a clean base every swap would
layer onto the result of the last one.

**Still to do here:** the cast bar on arrival — who is voicing whom, with a
preview — which is really item 14, and effects parts are not in the sheet yet
because nothing publishes one.

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

### 21. Run the tests on every push · DONE

`.github/workflows/tests.yml`. Nothing ran the suites but me, which made "the
tests are green" a claim rather than a fact — in a codebase whose failure mode
is a correct fix being silently undone.

Two jobs. The static four need nothing but node and finish in seconds, so they
fail fast: `structure` runs first because it is the one that catches a fix
being overwritten. The browser six only start once those pass, so a typo does
not cost a Playwright download. Chromium only — the reader is not
browser-specific and three engines is three times the install for one answer.

`npm ci` rather than `npm install`, because the lockfile is tracked and is
already a deploy requirement: Vercel builds `api/sign.mjs` from it.

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
