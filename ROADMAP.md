# eski — what's next, in order

Sorted by impact, biggest first. Times are how long it takes **me** to build the
thing including tests and docs, not how long it takes you to review it. Assume
anything marked half a day is one sitting; anything marked days is several.

Nothing here is a suggestion to do all of it. The top four are the ones I would
not leave sitting.

---

## Tier 1 — open holes, fix before anyone else shows up

### 1. Consent controls in the studio · ~1–2 hours

**Plain English:** anyone signed in can now attach a voice track or a soundtrack
to your comic, and you have no way to say no.

The database already has the switch — `comics.voice_consent` and
`music_consent`, both defaulting to `open`, and the policy that enforces them is
live. What's missing is a pair of toggles in the studio's settings drawer and on
the profile row, plus the same two words on the comic page so a contributor
knows before they start recording.

This is a hole I opened by wiring parts. It should close in the same week.

### 2. Upload quota on the signer · ~2–3 hours

**Plain English:** one person with a script can fill your bucket and your bill.

`api/sign.mjs` will sign up to 500 upload urls per call for any signed-in user,
with no per-user limit and no size cap. A presigned PUT cannot enforce a
content-length, so the cap has to be counted before signing: objects per user
per day, and a maximum page count per comic. Needs one small table or a count
against `pages`.

Cheap now, awkward later — once people have published, any limit you add is
retroactive and someone will already be over it.

### 3. Reporting and a moderation queue · ~3–4 hours

**Plain English:** strangers can attach audio to your comic, and there is no
button anywhere to complain about it.

Three gaps, one job:
- `reports.target_type` only allows `'comic'`. It needs `'vo'` and
  `'soundtrack'` (one `alter table`, already sketched at the bottom of
  `schema-parts.sql`).
- No report button exists on any surface.
- The reports table has no reader. You are the only moderator, so a plain table
  with a takedown action is enough — no UI polish, per your own note in the
  catchup.

Add a Discord webhook on insert (~20 minutes of the estimate) or reports rot
until someone remembers to look.

### 4. Cache headers · ~30 minutes

**Plain English:** every visitor re-downloads things that can never change.

`vercel.json` is four lines with only an `installCommand`. Media keys are
content-addressed, so they can be cached for a year and immutable; HTML must
stay no-cache so deploys land immediately. This is E5 from the performance plan
and it is the best effort-to-payoff ratio left in the repo.

---

## Tier 2 — the arrival path, and making contribution findable

### 5. The comic page, with real urls and link previews · ~4–6 hours

**Plain English:** a link you paste in Discord lands on the shelf, not on the
comic, and unfurls as nothing.

Today a comic opens a modal on the home page. It has no address of its own, so
there is nowhere for a title, a cover image, a description or a cast list to
live, and nothing for Discord or Twitter to read when someone shares it.

Covers B3, P-1 and E6 together: a `/c/<slug>` page via Vercel rewrites (no
router needed), the cover, description, creator, cast table, available voice
tracks and soundtracks, kudos, and the read button. This becomes the page every
new reader arrives on, so the open-graph tags belong here.

Do this before the reader surfaces below — they show nearly the same
information, and building the page first means the in-reader version is a
condensed copy rather than a second implementation.

### 6. The contribute hub · ~3–4 hours

**Plain English:** parts work now, and nobody can find a comic to make one for.

The good news is it is barely a feature: a comic with open voice consent and an
uncast character **already is** an open role. It is a query, not a data model.
One page listing comics open for voice or music, with the specific characters
nobody has voiced yet, is the main lever against the cold-start problem.

Pairs with a "filler" badge on comics carrying reference tracks, which lowers
the barrier for the next voice actor.

### 7. Swap voices and soundtracks while reading · ~4–6 hours

**Plain English:** pick a different cast mid-comic without going back to the
shelf.

The mix picker on the shelf is off-by-default checkboxes, which is fine for
choosing before you start and useless once you have started. The reader needs
the cast bar on arrival (who is voicing whom, with a preview and a link to their
profile) and a swap panel during the read that re-resolves the current page and
keeps your position.

Now genuinely buildable — the parts rows exist and `comicFromApi` already merges
them. Most of this is UI.

### 8. Preview clips for voice tracks · ~2–3 hours

**Plain English:** you cannot hear a voice actor before committing to their
whole track.

Generate a preview at publish time from the first three lines, store one
`preview_key` on the part, play it from the cast bar and the contribute hub.
Deterministic, one small extra upload, and it makes every list above browsable
instead of a wall of names.

---

## Tier 3 — the studio

### 9. Autosave, resumable uploads, reopening drafts · ~5–7 hours

**Plain English:** close the tab and lose everything; a failed upload starts
over; a draft you saved to the server cannot be opened again.

Three symptoms of one missing thing: nothing snapshots your work locally. Save
the studio state plus the media blobs to IndexedDB on a debounce and offer to
restore on open. The same record makes an interrupted upload resumable — because
keys are content-addressed, an object already in the bucket never needs sending
twice. And a server draft becomes reopenable, which you asked for on the 28th
and is still not possible.

This is E4, and the largest genuine gap in the authoring app.

### 10. The composer streamline (C1–C11) · ~2–3 days

**Plain English:** the soundtrack timeline goes away and every page's panel
becomes the place you author that page.

The whole of section 11 in the catchup: preview audio before dragging it,
a persistent page info panel showing the song, the range and the one-shot queue,
badges on the page grid showing what each page has, zoom and pan in the preview,
a real reader embedded so you can balance volumes, a resizable media bay,
per-item menus with trim, multi-select.

It is the biggest single block of work left and it is pure authoring quality —
nothing depends on it. Worth doing when the platform side stops moving.

### 11. Pre-export validation and export progress · ~2 hours

**Plain English:** small guardrails that used to exist and got lost.

Duplicate trigger pages, tracks past the last page, zero pages — caught before
export rather than after. Plus a percentage on big exports.

---

## Tier 4 — hygiene, and things that will be asked for

### 12. Kudos and view counts · ~3–4 hours for both

**Plain English:** two tables that exist and nothing writes to them.

Kudos is one button, one insert, no removal, count displayed. Views is one
insert when a comic opens. Neither is exciting, but attribution history cannot
be backfilled, so the insert should start early even though payouts are
deferred.

### 13. Terms, privacy and a takedown contact · ~2–3 hours

**Plain English:** the moment someone else uploads, you stop being an author and
start being a host.

Google's OAuth consent screen wants a privacy policy link for a published app,
and safe harbour depends on a stated way to receive infringement notices. Three
short pages and a footer link. I can draft them; you should read them, and this
is the one item where "get a lawyer to glance at it" is honest advice rather
than hedging.

### 14. Account deletion · ~2–3 hours

**Plain English:** Supabase gives users no way to delete themselves, so today it
is a manual job in a dashboard. Someone will ask, possibly in the same breath as
asking why there is no privacy policy.

### 15. Run the tests on every push · ~1 hour

**Plain English:** the suite only runs when you or I remember to run it.

GitHub Actions, the three runners, gate deploys on green. The suite already
mocks every external dependency, so this is mostly YAML.

### 16. The small performance batch · ~3–4 hours

**Plain English:** four unrelated things that each shave a bit.

The Gnomon font is base64-inlined in four HTML files, so it downloads four times
and caches never; move it to one `.woff2`. Revoke off-screen page blobs so a
long comic stops growing in memory. Decode with `createImageBitmap`. Add a
low-resolution placeholder so pages do not flash blank.

### 17. Accessibility pass · ~2 hours

**Plain English:** the icon-only buttons say nothing to a screen reader.

Labels on every icon button, a keyboard-help overlay, and touch gestures in the
reader (swipe to turn, pinch to zoom — zoom is wheel-only today).

### 18. Position memory collision · ~30 minutes

**Plain English:** two comics with the same title share a "last page you read".

It is keyed by title. Key it by comic id.

---

## Deliberately not now

- **Search.** It filters an already-loaded array in the browser, which is
  instant into the thousands of comics. Moving it to Postgres full-text before
  the shelf outgrows one query would be work with no visible result.
- **A framework.** Measured, not guessed: nothing slow in this project is caused
  by hand-written DOM code. Revisit only if a second surface needs real routing.
- **Mixes as first-class rows.** Combination popularity, canonical mixes,
  payout splits. The parts table can grow into it; nothing today is asking.
- **Series pages, creator dashboard, troupes, bookmarks, direct messages.** All
  reasonable. None of them unblock anything.

---

## If you only do four things

1, 2 and 4 in one sitting — consent, quota, cache headers, call it half a day.
Then 5, the comic page, because every reader you ever get arrives through it.
