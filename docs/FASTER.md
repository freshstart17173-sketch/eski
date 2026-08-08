# Making eski fast

Everything here is measured against production on 7 Aug 2026, not guessed.
Each item says what is wrong, what to do, and how to check you did it.

Ordered by payoff for effort. The first one is worth more than all the
others put together.

---

## The numbers as they stand

A page from a real published comic:

| | |
|---|---|
| stored | 1988 × 3057 progressive JPEG, **984 KB** |
| shown at | ~950 CSS px wide |
| fetch time | **0.6 – 1.2 s**, every time |
| `Cache-Control` | **absent** |
| `Content-Type` | `application/octet-stream` |
| served from | `pub-b9e7c6b680ca415e9ffd5875bad0df03.r2.dev` |

The last three are fixed for anything published from now on — the studio
uploads a viewport-sized WebP, a correct content type and an immutable cache
directive. **The hostname is not fixed, and it is the big one.**

Everything the browser downloads before it can show you a comic:

| | compressed | notes |
|---|---|---|
| `read.html` | 33 KB | brotli, fine |
| `vendor/supabase.js` | **57 KB** | biggest first-party asset |
| `broadsheet.css` | 6 KB | |
| `tokens.css` | 8 KB | includes Gnomon inline as base64 |
| `platform.js` | 5 KB | |
| `vendor/panzoom.js` | 4 KB | |
| `viewer.js` | 4 KB | |
| jszip, from cdnjs | ~30 KB | **third-party origin, blocking, usually unused** |

Plus two font origins, and every single one of those files served
`max-age=0, must-revalidate`.

---

## 1. Move the media off `r2.dev` — the hostname swap

### Why

`pub-*.r2.dev` is Cloudflare's **development** hostname for a public bucket.
Their own docs: it "is rate-limited and should only be used for development
purposes", and caching "is not available when using the r2.dev development
url". So today:

- every page and every clip is fetched from the **origin in one region**, for
  every reader, every time — nothing is cached at the edge;
- there is no `Cache-Control` on anything uploaded before 7 Aug, so browsers
  re-download pages they have already seen;
- under any real traffic it starts answering **429**.

This is why a page turn costs a second. Fixing it makes everything already
published faster, without republishing anything.

### The complication: your DNS is on Vercel

```
$ dig NS eski.lol
ns1.vercel-dns.com.
ns2.vercel-dns.com.
```

An R2 custom domain requires the zone to be **in Cloudflare, in the same
account as the bucket**. There is a "partial (CNAME) setup" that leaves DNS
where it is — but it is Business plan only ($200/mo), so it is not the answer
here.

So the move is: **the zone goes to Cloudflare, the app stays on Vercel.**
Cloudflare becomes the authoritative DNS host; Vercel keeps serving the site
through an ordinary DNS record. This is a completely standard arrangement and
the free plan covers it.

### What you will see if you try it first

Attaching the bucket before the zone moves fails with:

> That domain was not found on your account. Public bucket access supports
> only domains on your account and managed through Cloudflare DNS.

That is this whole section, stated as an error. It is not a permissions
problem and there is nothing to fix in R2 — the zone simply has to be
Cloudflare's before the custom domain exists as an option.

### Steps

**1. Write down what Vercel is currently serving.**
Vercel dashboard → your project → Settings → Domains. As of this writing the
live zone is four A records and nothing else — no CNAME, no MX, no TXT:

```
A   eski.lol       216.198.79.1, 64.29.17.65
A   www.eski.lol   216.198.79.1, 216.198.79.65
```

**Take Vercel's values, not these.** It hands out per-project targets and
rotates them; the point of listing them is that the zone is small and boring,
so this is a low-risk move rather than that these are the numbers to type.

**2. Add the zone to Cloudflare.**
Cloudflare dashboard → Add a site → `eski.lol` → Free plan. It will scan and
import what it can find. Check the imported records against step 1 and fix
anything missing. **Include any MX/TXT records** — email and domain
verification break silently if you drop them. (There are none today, which is
one less thing to get wrong.)

Do this BEFORE touching the nameservers. Cloudflare is not authoritative until
step 4, so the zone can be wrong for as long as you like at this stage and
nothing is affected.

**3. Set the Vercel records to DNS only.**
On the `eski.lol` and `www` records, click the orange cloud so it goes
**grey**. You do not want Cloudflare proxying traffic to Vercel: two CDNs in
series buys nothing and makes cache behaviour and IP forwarding harder to
reason about. Vercel serves the app exactly as it does today.

The record you are about to create for the bucket is different — that one
*must* be proxied, and R2 sets it up that way itself.

**4. Change the nameservers at your registrar** to the two Cloudflare gives
you, replacing `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. You are moving
DNS hosting, **not** the domain registration — the registrar stays whoever it
is and nothing is transferred.

Propagation is usually minutes, occasionally a few hours. The site keeps
working throughout, because the records resolve to the same Vercel targets.

Vercel will then show a nameserver warning on the domain. It is expected and
can be ignored: A-record setup is their supported "external DNS" path, and the
records still point at them. The domain stays verified and the certificate
keeps renewing.

Wait until Cloudflare shows the zone as **Active**.

**5. Connect the bucket.**
Cloudflare dashboard → R2 → your bucket → **Settings** → **Custom Domains** →
**Add**. Enter `cdn.eski.lol`. Review the record it proposes and **Connect
Domain**. Status goes Initializing → Active in a few minutes.

**6. Change one line.** In `platform.js`:

```js
const R2_BASE = 'https://cdn.eski.lol';
```

That is the whole code change. The database stores object **keys** and never
URLs, so no rows migrate and every comic already published starts coming off
the edge the moment you deploy.

**7. Add a cache rule** — this is the step people skip, and it is the one that
retro-fixes everything uploaded before 7 Aug with no `Cache-Control`.

Cloudflare → your zone → **Caching** → **Cache Rules** → Create rule:

- **Name:** eski media
- **If:** `Hostname equals cdn.eski.lol`
- **Then:** Eligible for cache
- **Edge TTL:** *Ignore cache-control header and use this TTL* → **1 year**
- **Browser TTL:** *Override origin* → **1 year**

Safe because every key is a sha256 of the bytes: an object at a given key can
never change. If the bytes change, so does the key.

**8. Turn on Tiered Cache** (Caching → Tiered Cache → Smart Tiered Cache).
Free, one toggle. It means a miss in one city is filled from a nearby
Cloudflare datacentre rather than from the bucket.

### Check it worked

```bash
# should be a real image type, an immutable directive, and — on the second
# request — a HIT
curl -sI https://cdn.eski.lol/98/9877…c.jpg | grep -iE 'content-type|cache-control|cf-cache-status'

content-type: image/jpeg
cache-control: public, max-age=31536000, immutable
cf-cache-status: HIT
```

`cf-cache-status: HIT` on the second request is the whole point. If it says
`DYNAMIC`, the cache rule is not matching. If there is no `cf-cache-status`
header at all, the record is not proxied.

Also check the site still works: `curl -sI https://www.eski.lol/` should still
show `x-vercel-id`, and **not** a `cf-ray`. If you see `cf-ray`, the Vercel
record got proxied — grey-cloud it.

### While you are in there

Two more toggles on the zone, both free:

- **Speed → Optimization → HTTP/3 (with QUIC):** on. Fewer round trips on
  flaky mobile connections, which is where a comic reader hurts most.
- **Speed → Optimization → Early Hints:** on. Lets the edge start pushing
  `preconnect`/`preload` hints while the origin is still thinking.

### If you do not want to move DNS

There is one alternative: a Cloudflare Worker bound to the bucket, served on
`<name>.<subdomain>.workers.dev`. It is not rate-limited the way `r2.dev` is
and it is cacheable, but you are then serving media off a `workers.dev`
hostname, which you cannot put a cache rule on and cannot brand. It is a
stopgap, not a destination. Moving the zone is 20 minutes and is the right
answer.

---

## 2. Preconnect to the media host — one line, big effect

The reader's `<head>` preconnects to two font origins and **not** to the host
every single page comes from:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

So the first page image pays a full DNS lookup + TCP + TLS handshake — on a
mobile connection, easily 300–500 ms — *after* the database has answered and
the URL is known. That cost is completely avoidable: the origin is known
before the page has even parsed.

Add to `read.html` and `index.html`:

```html
<link rel="preconnect" href="https://cdn.eski.lol" crossorigin>
<link rel="dns-prefetch" href="https://cdn.eski.lol">
```

`crossorigin` matters — the audio elements set `crossOrigin="anonymous"`, and
a preconnect without it opens a connection in the wrong credentials mode and
gets used for nothing.

Do it whichever hostname you are on; it helps today, on `r2.dev`, before you
move anything.

---

## 3. Stop loading jszip on pages that never use it

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

That is a **render-blocking script from a third-party origin** in the head of
`read.html`, `index.html` and `studio.html`. It costs another DNS + TLS
handshake before anything renders, and in the reader it is used **only** for
`.eski` files — a published comic (`?read=db:…`) never touches it.

Two changes:

1. **Vendor it**, like supabase and panzoom: `vendor/jszip.js`. Same-origin,
   already-warm connection, covered by the service worker, no third party in
   the critical path. Add it to the `ASSETS` list in `sw.js`.
2. **Load it on demand.** In the reader, only a `?read=` that is not `db:`
   needs it:

```js
let jszipReady = null;
const loadJSZip = () => jszipReady ||= new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = 'vendor/jszip.js';
  s.onload = res; s.onerror = () => rej(new Error('ESK-1006 jszip did not load'));
  document.head.appendChild(s);
});
```

and `await loadJSZip()` in the branch of `boot()` that opens a zip. The
composer can keep loading it eagerly — it is a tool, not a reading surface.

---

## 4. Give the un-hashed assets a real cache policy

Every first-party file is served `public, max-age=0, must-revalidate` —
Vercel's default for static files. That does not re-download them (a 304 is
cheap), but it does mean **eight conditional round trips** before the reader
can run, on every cold navigation.

`vercel.json` currently only sets `installCommand`. Add:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install --omit=dev",
  "headers": [
    {
      "source": "/vendor/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(tokens.css|viewer.js|platform.js|hash-worker.js)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=60, stale-while-revalidate=86400" }
      ]
    },
    {
      "source": "/docs/design/final/(.*).css",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=60, stale-while-revalidate=86400" }
      ]
    }
  ]
}
```

Two different policies on purpose:

- **`/vendor/*` is immutable.** Those files are pinned third-party versions
  and only change when you deliberately re-vendor. When you do, **rename
  them** — `vendor/panzoom-4.6.2.js` — because with a year-long immutable TTL
  a browser that has the old one will never ask again.
- **Everything else gets `stale-while-revalidate`.** The browser uses its copy
  instantly and refreshes in the background, so a deploy lands on the next
  navigation instead of costing a round trip on every one.

**Leave the HTML alone.** `read.html`, `index.html` and `studio.html` carry
the app itself and must keep landing immediately. That is deliberate, and it is
why `sw.js` is network-first for HTML and cache-first for everything else.

---

## 5. Let the service worker cache media

`sw.js` decides what it will store:

```js
const cacheable = sameOrigin || url.href.startsWith('https://cdnjs.cloudflare.com/');
```

So pages and audio — the biggest, slowest, most re-read things on the site —
are the one category it refuses to keep.

Content-addressed keys make this trivially safe: a key can never point at
different bytes, so a cached response can never be stale. Add the media host,
cache-first, and a re-read becomes instant and works on a train:

```js
const MEDIA = 'https://cdn.eski.lol/';
const cacheable = sameOrigin
  || url.href.startsWith(MEDIA)
  || url.href.startsWith('https://cdnjs.cloudflare.com/');
```

Worth adding a size ceiling (`Cache-Storage` is not free) and an eviction
pass — keep the last N comics read, drop the rest. That is also 80% of the
work of a real **"download for offline"** button, which is the feature every
comic app has and readers on trains actually want.

---

## 6. The reader does not need 57 KB of Supabase client

`vendor/supabase.js` is 212 KB raw, 57 KB brotli — the largest first-party
asset, on the critical path of every surface. The **reader** uses it for
exactly two things: read a session, and run four `select`s.

PostgREST is a REST API. Those four queries are plain `fetch` calls:

```js
const rows = await fetch(
  `${SUPABASE_URL}/rest/v1/pages?comic_id=eq.${id}&select=idx,image_key,display_key,blur&order=idx`,
  { headers: { apikey: KEY, Authorization: `Bearer ${token || KEY}` } }
).then(r => r.json());
```

A small `db.js` covering select/insert/update, with the full client loaded
lazily only where auth actually happens (sign-in, publish), takes ~57 KB off
the reader and the home page. Not urgent, but it is the biggest single lump
left once the media is on a CDN.

---

## 7. Give the home grid smaller covers

The grid already uses `thumb_key`, which is good. Two things to check:

- The thumbnail is generated at **420 px wide** (`makeCoverThumb`) and the
  grid cell is ~230 px at five-up. Fine for 2×, slightly generous for 1×.
- `loading="lazy"` is on the card images — confirm it is also on anything
  below the fold in browse, where the list can be long.

The cheap win here is `<link rel="preload" as="image" fetchpriority="high">`
for the **first row** of covers, since they are what the page is.

---

## Longer range — what the sites you are competing with do

Not tasks. Ideas with a source.

**AVIF is not available to us client-side, and fails silently.** The display
copies are already WebP — that is what the 984 KB → 238 KB is. AVIF would be
another 20–30% smaller again, but `canvas.toBlob('image/avif')` is not
supported: Chromium **returns a PNG instead of erroring**. Measured on a real
page at 1600px:

| asked for | got back | size |
|---|---|---|
| `image/webp` | webp | **151 KB** |
| `image/jpeg` | jpeg | 239 KB |
| `image/avif` | **png** | **2245 KB** |

Fifteen times bigger than the WebP, and nothing throws. `makeDisplay()` has a
`out.size >= blob.size` guard that would reject it, but only after doing the
work. If AVIF is ever wanted it has to come from the edge (`format=auto`) or
a wasm encoder, not from the canvas.

**Serve derivatives at the edge, not at publish.** Cloudflare Image
Transformations (`/cdn-cgi/image/width=1600,format=auto/<key>`) would replace
the publish-time WebP with a URL parameter, and — crucially — it works on
comics **already published**, with no re-upload and no second object per page.
`format=auto` also means AVIF for browsers that take it, which is another
20–30% under WebP. It needs the custom domain from item 1 first, and it bills
per transform, so the trade is per-read cost against per-publish storage. Once
you have more than a handful of comics, revisit it — the ability to change the
display size for the entire catalogue by editing one string is worth a lot.

**Webtoon-style vertical delivery.** The scroll reader currently loads whole
pages as the reader approaches them. Webtoon and Tapas slice long strips into
fixed-height tiles server-side, so a 900×20000 webtoon arrives as twenty
independent 900×1000 images that decode fast and stream in order. Your
`.eski` format already tolerates any page shape, so this is a publish-time
slicing pass plus a scroll reader that knows tiles are one page.

**Prefetch by intent, not by position.** MangaDex and Marvel Unlimited both
widen the prefetch window when you turn pages quickly, and drop it when you
linger. You have the hooks: `warmPage` is already priority-aware, so
`PREFETCH_FWD` could be a function of the last three page-turn intervals.

**Audio: Opus, and one file per page-range.** On the todo already. The second
half matters as much as the codec: a soundtrack that spans pages 1–20 is one
long file the reader must seek into. Bandcamp and NTS both stream; if a score
is ever longer than a couple of minutes, HLS or plain byte-range seeking beats
downloading the whole thing to play thirty seconds of it. `<audio>` does range
requests natively — the thing to check is that R2 honours `Range` on a custom
domain (it does) and that the reader is not defeating it with `preload="auto"`
on a 40 MB file.

**A real thumbnail sprite for the page strip.** The composer's page strip
loads every page image at 64 px. At 45 pages that is 45 requests for something
the reader will glance at. One sprite sheet generated at publish, or a single
`<canvas>` atlas, turns that into one request.

**Read-ahead on the database, not just the media.** Opening a comic is four
round trips to Supabase before the first byte of page one is requested. A
single Postgres function returning comic + pages + tracks + parts as one JSON
document makes it one. `create function get_comic(uuid) returns json` and one
`rpc()` call — this is the single biggest latency win left after the CDN,
because it is pure serial round-trip time before anything else can start.

**Cost note.** R2 has no egress fees, which is why the current architecture is
sane at any scale. Watch **Class B operations** (reads) instead: they are
billed per request, and edge caching cuts them by whatever your hit rate is.
Item 1 pays for itself twice over.

---

## Sources

- [Cloudflare — Public buckets and r2.dev limitations](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare — CNAME (partial) setup, Business plan only](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)
- [Cloudflare — Cache rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Cloudflare — Image Transformations via URL](https://developers.cloudflare.com/images/transform-images/transform-via-url/)
- [web.dev — Fetch Priority](https://web.dev/articles/fetch-priority)
- [web.dev — Preconnect and dns-prefetch](https://web.dev/articles/preconnect-and-dns-prefetch)
- [Vercel — Headers configuration](https://vercel.com/docs/project-configuration#headers)
