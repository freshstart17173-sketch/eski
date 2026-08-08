# Six things you can do today

None of these need code. I have done everything on the small-effort list that
was mine to do; these are the ones that need your dashboard, your name, or
your decision.

Roughly in order of value.

---

## 1. Move the media off `r2.dev` — 20 minutes, then some waiting

This is worth more than everything else here put together. Right now every
page and every clip is fetched from one region with no edge cache, on a
hostname Cloudflare rate-limits on purpose.

Full detail is in `docs/FASTER.md`. The short version:

1. **Vercel** → your project → Settings → Domains. Write down the records for
   `eski.lol` and `www`.
2. **Cloudflare** → Add a site → `eski.lol` → **Free** plan. Check what it
   imported against step 1. **Make sure your MX and TXT records came over** —
   email breaks silently if they didn't.
3. On the `eski.lol` and `www` records, click the orange cloud so it turns
   **grey**. You do not want Cloudflare proxying your app; Vercel keeps
   serving it exactly as now.
4. At your registrar, change the nameservers to the two Cloudflare gave you.
   The site keeps working the whole time. Wait for Cloudflare to say
   **Active** — usually minutes.
5. **Cloudflare** → R2 → your bucket → Settings → **Custom Domains** → Add →
   `cdn.eski.lol` → Connect.
6. Tell me, and I'll change the one line in `platform.js`. (Or do it
   yourself: `const R2_BASE = 'https://cdn.eski.lol';`)
7. **Cloudflare** → Caching → **Cache Rules** → Create:
   - If `Hostname equals cdn.eski.lol`
   - Then Eligible for cache
   - Edge TTL: *ignore cache-control, use* **1 year**
   - Browser TTL: *override origin* → **1 year**

   Don't skip this one. It's what fixes the comics you published **before**
   this week, which went up with no cache headers at all.
8. **Cloudflare** → Caching → **Tiered Cache** → Smart Tiered Cache → on.

**Check it worked:**
```
curl -sI https://cdn.eski.lol/<any-key> | grep -i 'cache-control\|cf-cache-status'
```
Run it twice. The second time should say `cf-cache-status: HIT`.

Also check you didn't break the site:
```
curl -sI https://www.eski.lol/ | grep -i 'x-vercel-id\|cf-ray'
```
You want `x-vercel-id` and **no** `cf-ray`. If you see `cf-ray`, the Vercel
record got proxied — go back and grey-cloud it.

---

## 2. Register a DMCA agent — 15 minutes and $6

You host other people's artwork. Safe harbour is not automatic and it is
cheap to get.

1. Go to <https://www.copyright.gov/dmca-directory/>.
2. Create an account, designate an agent (you), pay $6.
3. **Put a reminder in your calendar for three years from now.** The
   registration expires silently and you lose the protection.

---

## 3. Fill in the blanks in `legal.html` — 20 minutes

I wrote the page and wired the three footer links to it — they were all
`href="#"` before. It is a draft and it says so at the top in red.

What needs you:

- Set up an email address for notices (`agent@eski.lol` or similar) and put
  it in.
- Your name, postal address and phone for the designated agent block. Same
  details you file in step 2.
- Two decisions I deliberately left as blanks, because they're yours:
  - Can an author reuse a contributed voiceover **outside** eski?
  - Is AI-generated voice allowed, and does it have to be labelled?
- Then delete the red draft box.

**Have someone who knows this stuff read it.** I wrote it from the published
requirements, not from legal training.

---

## 4. Set billing alarms — 10 minutes

The things that will actually bite, in the order they will:

- **Supabase** — the free tier pauses a project after enough inactivity, and
  a paused project is a dead site. Check the current limits and turn on
  whatever usage email they offer.
- **Cloudflare R2** — no egress fees, but reads are billed per request. Set a
  spend notification. (Step 1 cuts these a lot.)

---

## 5. Start wrangling tags — 5 minutes, then whenever

I added a `tag_synonyms` table. It maps variants onto one canonical tag, so
`slice of life`, `slice-of-life` and `sliceoflife` stop being three separate
things that can't find each other. This is how AO3 does it, and it's much
cheaper to start at twenty comics than at two thousand.

In the Supabase SQL editor:

```sql
insert into tag_synonyms (variant, canonical) values
  ('slice-of-life', 'slice of life'),
  ('sliceoflife',   'slice of life'),
  ('sci fi',        'science fiction'),
  ('scifi',         'science fiction');
```

To see what's actually out there and worth merging:

```sql
select tag, count(*) from comic_tags group by tag order by count(*) desc;
```

Nothing reads this table yet — the search side is still on my list. Adding
rows now costs nothing and means the data is ready.

---

## 6. Decide what a collection is — an evening, whenever you feel like it

Not urgent, but it's the highest-value product thing on the research list and
it's writing, not code.

With twenty comics, no algorithm helps. What helps is you putting four of
them together and writing a sentence about why. MUBI ran on thirty films at a
time doing exactly this.

If you want it, tell me and I'll build the table and the home rail — it's an
afternoon. **The blurb is the actual product**, and only you can write it.

---

## Since then

- Every comic has an address at `/c/<slug>`, with real link previews.
- Comments, in the reader and on the comic page.
- An admin console at `/admin.html`, gated in the database. You are an admin.
- Eighteen themes; the picker is in the footer of every page.
- **A `private` state.** Publishing is now one way: a published eski can be
  made private or deleted, never returned to draft. That is what stops an
  author re-cutting a comic under the people who voiced it.
- Your profile has a real address at `/u/<handle>`, avatars, and a switch for
  whether your shelf is public.

**One thing for you:** there is still an orphan draft, `untitled-76nm`, left
over from the save-then-publish bug — publishing used to write a second comic
row rather than updating the first. The bug is fixed; that row is yours to
delete from the admin console or your profile when you want it gone.

## What I did on my side

For the record, so you know what's already handled:

- Opus transcoding for long audio — **3445 KB → 498 KB** measured on
  production, with the original kept so Safari never gets silence.
- Opening a comic went from three round trips to one.
- The shelf now says "continue · p.12" and takes you there.
- Long scores stream instead of downloading whole.
- `legal.html` exists and the footer links point at it.
- `tag_synonyms` table and a `canonical_tag()` function.

Still mine, not done: server-side search using those synonyms, per-character
volume in the reader, collections, and the offline-download button.
