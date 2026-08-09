# Before you show this to anyone

Written 9 Aug 2026, from an audit of the live site and the live database rather
than from a checklist. Ordered by what actually bites first.

The distinction that matters throughout: **a bug annoys the person who hits it.
A missing control is something you cannot undo afterwards.** Everything in
Tier 1 is the second kind.

---

## Tier 1 — do not share the link until these are done

### 1. There is no way to report anything · ~2 hours · MINE

**This is the one.** Strangers can attach audio to your comic and write
comments on it, and there is no button anywhere on the site to complain about
either. The moment somebody who is not you can upload, you need a way for
somebody else to tell you it is wrong.

Half of it exists: `admin.html` already reads the `reports` table and shows a
queue. What is missing is:

- **any report button at all** — the comic page, a comment, a contributed part
- `reports.target_type` is `check (target_type = 'comic')`, so a part cannot be
  reported even in principle. One `alter table`, sketched at the foot of
  `schema-parts.sql`.
- a Discord webhook on insert, or the queue rots until you remember to look

Roadmap item 7.

### 2. Nothing rate-limits anything a stranger can write · ~2 hours · MINE

Checked: there is no rate limiting in the schema, the policies or the API. One
signed-in account can insert comments in a loop as fast as the network allows.
The upload path has a ceiling (`claim_upload_quota`, 2000 objects a day) —
**the text paths have nothing.**

The same shape as the quota works: a `claim_comment_quota()` that adds
atomically and answers from what it wrote. An hour of work, and it is the
difference between one bad actor being an annoyance and being an outage.

### 3. `legal.html` still says DRAFT in red · 20 minutes · YOURS

It needs your name and postal address for notices, and two decisions I left
blank on purpose because they are product calls, not legal ones:

- can an author reuse a contributed voiceover **outside** eski?
- is AI-generated voice allowed, and must it be labelled?

Then delete the red box. Have someone who knows this read it.

### 4. Register a DMCA agent · 15 minutes and $6 · YOURS

You deferred this "until there are users", which was reasonable then. The
trigger is **the first time somebody who is not you uploads artwork**, and
sharing the link is that moment. Safe harbour is **not retroactive** — it
protects you from the day you register, not from the day you needed it.

<https://www.copyright.gov/dmca-directory/>. Expires silently after three
years.

---

## Tier 2 — the first day will be worse without these

### 5. Finish the CDN move · 20 minutes · YOURS

`cdn.eski.lol` exists but points at **Vercel**, not the bucket, so every page
is still served from one region with no edge cache on a hostname Cloudflare
rate-limits on purpose. `docs/FASTER.md` §1, from step 5a.

This is a first-impression problem as much as a cost one: a page turn costing a
second is what somebody will remember.

### 6. Back up the database · 10 minutes · YOURS

Supabase's free tier does daily backups with a 7-day window and **no
point-in-time recovery**. Before other people's work is in there, know what you
would actually do if you dropped a table — this session dropped seven, and only
because they were verified empty first.

At minimum: Database → Backups, confirm they are running, and take one manual
dump you keep off-platform.

### 7. `thumb_key` is null on the published comic · 5 minutes · YOURS

So the home grid downloads the full 1 MB cover into a 230 px cell. Data, not
code — the studio generates thumbnails now. Re-publish, or backfill.

---

## Tier 3 — worth knowing, not worth blocking on

### 8. Account erasure is not complete

Deleting an account tombstones it — name, bio and avatar cleared, bylines
scrubbed, published work kept. The `auth.users` row survives, so **the email
address and Google identity are still stored**. For UK GDPR that is not
erasure. Shape of the fix is in ROADMAP item 20; until then a real request is a
manual job.

### 9. One sign-in provider

Google only. Anyone without a Google account, or unwilling to use one, cannot
join — and a Google outage is a total sign-in outage. Discord is already
half-wired: uncomment it in `PROVIDERS` once it is enabled in the dashboard.
`docs/AUTH.md`.

### 10. `spec.html` documents v2 while the app grows v3

It says so at the top, but somebody will read it and believe it.

### 11. `studio.html` is 3,500 lines

Not a launch problem. It is the next thing that should be split, and the seam
is the import/transcode pipeline.

---

## What is already solid, so you do not re-audit it

Checked this session, not assumed:

- **RLS is on every table** and the policies are the rule — the studio hides
  controls it knows are refused, but the refusal happens at the insert.
- **The two RPCs are `STABLE` and not `SECURITY DEFINER`**, so `auth.uid()` is
  the real caller and RLS applies. Keep it that way.
- **Every `SECURITY DEFINER` function now pins `search_path`** — eleven did
  not, which was a live privilege-escalation vector (`schema-hardening.sql`).
- **No trigger function is callable over the API** any more. Seven were.
- **Free text is capped everywhere** — comments 4000, bio 400, display name 60,
  title 200, description 2000, tags 2-40, handle by regex.
- **Handles cannot be `admin`, `support`, `eski`** or ~60 others, separators
  stripped so `ad-min` does not walk around it.
- **Uploads are capped** at 2000 objects per account per day, claimed
  atomically, failing closed.
- **The database has no leftover tables** from the earlier project sharing it.
- **All ten test suites pass**, and CI runs them on every push.
