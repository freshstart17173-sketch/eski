# What other people have already worked out

Research for future stages. Not a plan and not a backlog — things other
comic and media sites do, why they do them, and what each would mean here.
Load speed has its own file (`docs/FASTER.md`); this is everything else.

Each item says roughly what it costs. **Small** is an afternoon, **medium**
is a weekend, **large** changes the shape of something.

---

## 0. What eski actually is, so the comparisons land

A comic with a score and a cast, where **the mix is the reader's choice** and
**anyone can contribute a part**. That combination does not exist elsewhere.
The nearest neighbours each solve one half:

- **Webtoon / Tapas / MangaDex** — comics at scale, no sound.
- **Bandcamp / NTS** — sound, no pictures.
- **AO3 / Discogs** — many contributors to one work, credited properly.

So most of what follows is stolen from one of those three columns. The
things worth stealing are the ones that survive having twenty comics rather
than twenty thousand.

---

## 1. Reading

### Do not build Guided View

ComiXology's Guided View walked the reader panel by panel, and it was the
most famous feature in digital comics for a decade. It is instructive that
**it is now gone** — Amazon retired the ComiXology app in December 2023 and
the Kindle reader that replaced it supports neither Guided View nor zooming,
which broke double-page spreads. There was also a rival patent (Disney, filed
2006, granted 2012) hanging over it the whole time.

Two lessons. The obvious one: panel-level metadata is expensive to author and
the thing that consumes it can disappear. The less obvious one: **spreads and
zoom are the features people actually noticed losing.** eski has both, and
the panzoom work means zoom is now genuinely good. That is the right place to
have spent the effort.

*Effort: none. This is a "don't".*

### Slice long pages, don't stream them whole

Webtoon caps each uploaded slice at **800 px wide, 1280 px tall** and stacks
them; a long vertical episode is dozens of small images, not one enormous
one. That is why their scroll never janks: each slice decodes in milliseconds
and the browser can discard the ones off screen.

eski's scroll mode currently loads whole pages. For ordinary comic pages that
is fine. For a webtoon-shaped `.eski` — and the fixture suite already tests a
900×4000 strip — it means one 4000 px decode blocking the scroll.

**Here:** a publish-time slicing pass for any page taller than ~2.5× its
width, plus a scroll reader that knows several tiles are one page. The
`.eski` format already tolerates any page shape, so this is additive.

*Effort: medium.*

### Resume, everywhere, without being asked

The `saves` row already tracks `last_page`, and the reader writes it. What is
missing is the other half: the shelf does not offer "continue" as the primary
action on a comic you are halfway through. Every reading app on earth does
this and it is the single highest-value UI affordance for a returning reader.

**Here:** on the home grid, a card with `progress != null` gets its button
labelled *continue · p.12* and deep-links straight there. The data exists.

*Effort: small.*

### Offline is 80% done and nobody has noticed

`sw.js` already precaches the app shell. It explicitly refuses to cache media
(`docs/FASTER.md` item 5). Turn that on with an eviction policy and a "keep
for offline" toggle on the detail sheet, and eski has the feature every comic
app charges for. Content-addressed keys make it safe by construction.

*Effort: medium. Mostly eviction policy and a storage-quota conversation.*

---

## 2. Sound

### Two qualities, not one

Bandcamp streams previews at **MP3 128**, and gives buyers MP3 V0 (~250 kbps)
in the app. The split exists because auditioning and listening are different
jobs: you will sample thirty voices to pick one, and listen to a score once.

eski already has `preview_key` for a clip of a VO part. The same logic
applies to scores: a low-bitrate stream for browsing, the good one for
reading. Once Opus transcoding is in, generating two is nearly free.

*Effort: small, once Opus lands.*

### Long scores want range requests, not downloads

A score spanning pages 1–20 is one long file the reader currently downloads
before playing. `<audio>` does HTTP range requests natively and R2 honours
`Range` — the thing that defeats it is `preload="auto"` on a large file, which
pulls the whole thing.

HLS (2–10 s chunks, optionally at several bitrates) is what podcast and music
platforms use, and is genuinely better on flaky connections. It is also a lot
of machinery. **The cheap 80%:** keep `preload="auto"` only for clips under a
size threshold, and let anything long stream by range. Revisit HLS only if
scores routinely run past a few minutes.

*Effort: small for the threshold. Large for HLS.*

### The one-shot channel is the interesting part

Nothing else does this: sound effects and spoken lines attached to a page,
triggered by the reader, ducking the music underneath. The duck is already
asymmetric (fast in, slow out) and per-clip overridable, which is a genuinely
good piece of audio design.

Where it could go, in rough order of value:
- **Auto-advance one-shots** as an option: a page with four lines plays them
  in order with gaps, so a reader can just read.
- **Per-character volume** in the reader, since a mix is assembled from parts
  recorded by different people in different rooms. Loudness normalisation
  already measures each clip; exposing a trim per character is a small step.
- **Spatial placement**, someday: a `PannerNode` and an x-position per line
  so dialogue sits where the balloon is. Cheap to try, easy to overdo.

*Effort: small / small / medium.*

---

## 3. Discovery when you have twenty comics

This is the actual problem. Every recommendation system assumes a catalogue.

### AO3's curated folksonomy is the best answer anyone has

AO3 lets anyone write any tag — tagging is treated as *part of the act of
creation* — and then several hundred volunteer **wranglers** map the variants
onto canonical tags. Searching a synonym finds everything under the canonical
one. It is described in the literature as "democratic indexing": the users
supply the vocabulary, curators supply the consistency.

eski already has free-text `comic_tags` with per-user attribution. What it
lacks is the wrangling layer: `slice of life`, `slice-of-life` and
`sliceoflife` are three different tags today.

**Here, and this is cheap:** a `tag_synonyms` table mapping variant →
canonical, applied at search time. One person (you) wrangling twenty comics
is not a burden, and the structure is what lets it survive growth. Do this
before the catalogue gets big enough for it to be work.

*Effort: small now. Large if you wait.*

### Programme it, don't rank it

MUBI ran on thirty films at a time; the Criterion Channel programmes seasons.
With a small catalogue, editorial beats algorithmic — a human sentence about
why these four comics are together is worth more than any "similar to"
carousel, and it costs one table.

The `eski-marquee` and `eski-repertory` skills in this repo already describe
this direction, so the design thinking is done.

**Here:** a `collections` table (title, blurb, ordered comic ids) and a home
rail. The blurb is the product.

*Effort: small.*

### "Roles that need a voice" is already your best discovery surface

It is not a browse mode, it is a **job board**, and it is the thing that gets
someone to make an account. It deserves more than it has: sort by how long a
part is, filter by whether the comic already has a score, show the character
blurb prominently, and — the big one — let someone **audition without signing
up**, and only ask for an account when they submit.

*Effort: medium, mostly the anonymous-audition flow.*

---

## 4. Contribution and credit

### Credit the group, and honour removal requests

MangaDex's acceptable-use policy requires crediting scanlation groups and
**honouring their content removal requests**. It is a community norm encoded
as policy, and it is why groups tolerate the aggregator.

eski's equivalent: a voice actor or composer should be able to withdraw their
part, and the comic should keep working without it. The parts model already
supports this technically — a missing part is an empty slot — but there is no
button and no policy text.

*Effort: small for the button. The policy is a paragraph.*

### Discogs-style credit is the differentiator, so lean on it

Every human who touched a release gets a row. The `eski-ledger` skill in this
repo already describes exactly this for eski. The database supports it: parts
carry `owner_name`, tracks carry `character_key`.

What is missing is the **person-centric** view — a profile that reads as a
discography ("voiced 14 characters across 6 comics"), which is what makes
contributing feel like building something rather than doing a favour.

*Effort: medium.*

### Let a part be a work in progress

Right now a part is draft or published. Recording twenty lines is a project,
and a contributor needs to see progress, save, and come back. The author
studio's per-line status model is the right shape; the voice studio should
share it.

*Effort: medium.*

---

## 5. Backend and processing

### Collapse the opening round trips

Opening a comic is **four serial queries** to Supabase before the first byte
of page one is even requested. PostgREST exposes Postgres functions as RPC,
and a function can return a nested JSON document.

```sql
create function get_comic(p_id uuid) returns json language sql stable as $$
  select json_build_object(
    'comic', to_jsonb(c),
    'pages', (select coalesce(json_agg(p order by p.idx), '[]')
                from pages p where p.comic_id = c.id),
    'tracks',(select coalesce(json_agg(t order by t.order_idx), '[]')
                from tracks t where t.comic_id = c.id and t.part_id is null),
    'parts', (select coalesce(json_agg(pt), '[]')
                from parts pt where pt.comic_id = c.id and pt.status = 'published'))
  from comics c where c.id = p_id;
$$;
```

One `rpc('get_comic', {p_id})` instead of four round trips. On a mobile
connection at 150 ms RTT that is ~450 ms removed from before-anything-starts.
RLS still applies (`stable`, not `security definer` — keep it that way).

This is the largest latency win left after the CDN, and it is an hour's work.

*Effort: small. Highest value in this file.*

### Move derivative work off the publishing browser — eventually

Today the studio hashes, resizes, re-encodes and uploads in the author's
browser. That is genuinely the right call for now: zero infrastructure, zero
per-job cost, and it scales with the number of authors rather than your
budget.

It stops being right when: a 200-page comic makes the tab unresponsive, or
you want to re-encode the whole catalogue when a better format arrives, or
someone publishes from a phone.

The shape when that day comes is Cloudflare Queues + a Worker consumer:
upload originals, enqueue a job per page, generate derivatives at the edge.
Decoupling ingest from processing is exactly what queues are for, and it
means a re-encode of everything is a script rather than asking every author
to republish.

**Do not do this yet.** Note the trigger conditions and carry on.

*Effort: large. Deferred.*

### Search should be Postgres, not JavaScript

Browse currently filters `COMICS` in memory, which is correct at twenty and
wrong at two thousand. Postgres full-text search over title, description,
author, tags and **character names** is a generated column plus a GIN index —
no new service, no sync problem.

Character names matter: "who has voiced a narrator" is a question this site
should be able to answer and nobody else can.

*Effort: small.*

### The `.eski` file is an asset, not a legacy

A single portable file containing pages, audio and the map between them is
genuinely rare, and it is what makes eski archivable rather than a service
that can disappear. Two things follow:

- **Keep export working forever**, including for published comics. "Download
  this eski" on the detail sheet is a trust feature.
- **Version the format explicitly** in the manifest and never break v2. The
  reader already tolerates old files; keep it that way and say so publicly.

*Effort: small, ongoing.*

---

## 6. Cost, and what breaks first

R2 has no egress fees, which is why this architecture is sane at any size.
The things that actually bite, in the order they will:

1. **Supabase free tier pauses on inactivity** and caps database size. A
   paused project is a dead site. Know the current limits and set a billing
   alarm.
2. **R2 Class B operations** (reads) are billed per request. Edge caching cuts
   them by the hit rate — another reason `docs/FASTER.md` item 1 pays twice.
3. **Vercel function invocations** — only `/api/sign`, one call per publish.
   Not a concern.
4. **Storage growth**: each page now stores an original *and* a display copy.
   At 45 pages × ~1.2 MB that is ~54 MB per comic. A hundred comics is 5 GB —
   fine. A thousand is worth revisiting whether originals stay hot.

*Effort: an afternoon setting alarms. Do it before launch, not after.*

---

## 7. Rights, safety and trust

**I am not a lawyer and this is not legal advice.** But the shape is
well-documented and cheap to get right.

### Register a DMCA agent

A site hosting other people's artwork wants safe harbour, and it is not
automatic. The requirements: designate an agent, publish their contact details
on the site, and **register with the U.S. Copyright Office** — a $6 filing,
renewable every three years or it silently expires. You also need a published
takedown-and-counter-notice process and a repeat-infringer termination policy.

The site footer already links `TERMS`, `PRIVACY` and `TAKEDOWN` — and all
three are `href="#"`. Those three dead links are the cheapest, highest-value
thing on this list.

*Effort: small, plus $6.*

### Voice is a consent question, not just a copyright one

A recording of someone's voice is a different thing from a drawing. Worth
deciding, before it matters:

- Can a voice actor withdraw a published part? (Say yes. The parts model
  already allows it.)
- What is the licence on a contributed part — can the author reuse it
  elsewhere?
- Is AI-generated voice allowed, and must it be labelled?

None of these need building. They need a paragraph each, written before the
first argument rather than during it.

*Effort: an evening's writing.*

### Moderation reality

The `reports` table exists and is empty. At twenty comics you are the
moderator and that is fine. What matters now is that the *route* exists: a
report button, and a queue you actually look at. Adding it later, after
something bad is already published, is worse.

*Effort: small.*

---

## 8. Things I would not do

Anti-recommendations, because they save more time than the recommendations.

- **A recommendation algorithm.** Twenty comics. Programme it by hand.
- **Infinite scroll on browse.** The grid is dense and finite; pagination is
  honest and the "see more" already works.
- **A mobile app.** The PWA already installs, plays audio and can go offline.
  App stores are a tax paid in review cycles.
- **Accounts required to read.** The current signed-out experience is good.
  Keep the wall at *contribute*, never at *read*.
- **A volunteer CDN** like MangaDex@Home. It exists because they serve
  terabytes under legal pressure. You have R2 and no egress fees.
- **Real-time anything.** No collaborative editing, no live presence. Nothing
  here is improved by a websocket.

---

## Sources

- [ComiXology Guided View, and its retirement](https://en.wikipedia.org/wiki/ComiXology)
- [Webtoon slice dimensions (800 × 1280 max per slice)](https://www.s-morishitastudio.com/vertical-scrolling-webtoon-format/)
- [AO3 — tag wrangling and canonical tags](https://www.transformativeworks.org/spotlight-tag-wrangling/)
- [AO3 — Tags FAQ](https://archiveofourown.org/faq/tags)
- ["Thank god for tags" — fanfiction as a reading paradigm](https://www.tandfonline.com/doi/full/10.1080/13614568.2024.2369508)
- [Bandcamp — stream format and quality](https://get.bandcamp.help/hc/en-us/articles/23020710088343-What-format-quality-are-the-streams-on-Bandcamp)
- [HLS vs progressive audio delivery](https://soundstack.com/blog/better-podcast-delivery-through-hls-key-questions-answered/)
- [MangaDex — infrastructure overview](https://mangadex.dev/mangadex-v5-infrastructure-overview/)
- [MangaDex@Home — volunteer CDN client](https://github.com/mangadex-network/mangadex-at-cloud)
- [PostgREST — functions as RPC](https://docs.postgrest.org/en/stable/references/api/functions.html)
- [Cloudflare Queues for background processing](https://developers.cloudflare.com/queues/)
- [U.S. Copyright Office — DMCA designated agent directory](https://www.copyright.gov/dmca-directory/)
- [U.S. Copyright Office — Section 512 safe harbours](https://www.copyright.gov/512/)
