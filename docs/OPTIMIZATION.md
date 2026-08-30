# eski — optimization guide (for a future agent)

How to make eski faster, more correct, and simpler **without breaking the things that make it
good**. Written 2026-08-30 after a full backend + data-layer audit. Read
[`CLAUDE.md`](../CLAUDE.md) and [`docs/VERIFICATION.md`](VERIFICATION.md) first — the design
rules and the test method there are load-bearing, and nothing here overrides them.

**The golden rule: measure before you cut.** `app/perf.js` is an in-app timing HUD (turn it on
with `?perf=1`, `⌘/Ctrl+Shift+P`, or Appearance settings). Every read in `data.js` is wrapped in
`time("label", …)`. The sandbox can't reach prod, so you optimize against **real numbers pasted
from the HUD**, or against `node`-measured file sizes — never a guess. Ship one change, re-measure,
keep it only if the number moved.

---

## 0. The ethos you must preserve

- **Vanilla JS + a thin reactive layer (`app/signals.js`), no framework, no build step** (CANON
  §G). This is a deliberate choice — it makes the codebase legible and diff-able and removes a
  whole class of bundler nondeterminism. Do **not** introduce React/Vue/Svelte or a required build
  step to "optimize." Every technique below is achievable without one, or as an **optional** build.
- **The RLS policy is the fence; the UI is only the signpost.** Never move a security check from
  the DB into JS for speed.
- **One canonical name/token/selector per concept.** Search before you add (this repo has shipped
  duplicate selectors). Optimizations that duplicate a definition are a net loss.

---

## 1. Load speed — ranked by leverage (do them in this order)

### 1.1 Add an OPTIONAL production minify/bundle step (highest ROI, keeps dev buildless)
Today nothing is minified: `app/data.js` is **107 KB**, `vendor/supabase.js` **212 KB**, CSS
**~101 KB**, all shipped raw. Vercel already gzip/brotli-compresses static assets on the wire, so
this is less catastrophic than the raw numbers, but minification + tree-shaking still typically
**halves** parse/transfer.

The move that respects the "no build step" ethos: keep local dev buildless (open `index.html`,
zero tooling), and add **esbuild** as the Vercel *build command only* — one binary, no config
files, no framework:
```
esbuild app/main.js --bundle --minify --format=esm --outfile=dist/app.js --sourcemap
```
Point `index.html`'s production `<script>` at the bundled+hashed file; keep the unbundled module
graph for local dev (a tiny `?dev` switch or a separate `index.dev.html`). This alone is the single
biggest first-paint win and it **preserves** the vanilla, no-framework codebase. If you truly want
zero build, skip to 1.2–1.5, which need no tooling.

### 1.2 Lazy-load `demo.js` (free, no build) — 25 KB off every real user
`app/data.js` does a **static** `import { … } from "./demo.js"` (15 fixture fns), so the 25 KB
demo bundle ships to **every production user** even though it's only used with `?demo=1`. Convert
to a dynamic import gated on `isDemo()`:
```js
if (isDemo()) { const d = await import("./demo.js"); return d.demoWorkspace(); }
```
Do it once at each `if (isDemo()) return demo…()` site (there are ~15). The demo path is already
the first branch of every loader, so this is mechanical and removes `demo.js` from the main graph.

### 1.3 Fonts: drop the base64 `@import` chain (no build) — kills a render-blocking waterfall
`styles/tokens.css` does `@import "../docs/design/_fonts.css"` — a **39 KB base64** file. Two costs:
`@import` serializes the request (the browser must download+parse `tokens.css` before it even
discovers `_fonts.css`), and base64 is ~33% larger than the binary `woff2`. Fix:
- Extract the Jost faces to real `.woff2` files under `/styles/fonts/`.
- In `<head>`, `<link rel="preload" as="font" type="font/woff2" crossorigin>` the 1–2 faces used
  above the fold, and declare `@font-face { … font-display: swap; }` directly in `tokens.css` (no
  `@import`). `swap` shows text immediately in the fallback and swaps when Jost lands — no invisible
  text.
- Subset the faces to the glyphs actually used (Latin + the wordmark) — a subsetter (`fonttools
  pyftsubset`) typically cuts a face by 60–80%.

### 1.4 Slim the Supabase client (needs the 1.1 bundler to tree-shake, or a modular swap)
`vendor/supabase.js` is the **212 KB** umbrella `@supabase/supabase-js`, loaded at boot. eski uses
**auth + postgrest + realtime** only — it does NOT use Supabase Storage or Edge Functions (uploads
go through `api/sign.mjs` → R2 directly). Options, cheapest first:
- With the 1.1 bundler, import from `@supabase/supabase-js` and let tree-shaking drop unused
  clients (modest win — the umbrella isn't fully tree-shakeable).
- Better: import the modular packages directly — `@supabase/postgrest-js`, `@supabase/realtime-js`,
  `@supabase/auth-js` — and construct only what you use. Biggest single JS win after minify.
- **Defer realtime**: realtime-js is a large chunk and is only needed once a channel/DM/notifs
  screen mounts. Dynamic-`import()` the realtime wiring (`app/realtime.js`) on first subscribe, not
  at boot. First paint (feed/explorer) doesn't need a WebSocket.

### 1.5 Split critical vs deferred CSS (no build)
Six render-blocking stylesheets load in `<head>` (~101 KB): `tokens`, `base`, `primitives`,
`shell`, `content` (**40 KB**), `landing` (4 KB). `content.css` is only needed once an in-app
screen renders; `landing.css` only on the marketing route. Keep `tokens+base+shell+primitives`
render-blocking (they paint the shell), and load `content.css`/`landing.css` per-route
(`<link media="print" onload="this.media='all'">` trick, or inject the `<link>` when the route
mounts). HTTP/2 multiplexes the requests, so the win is in *render-blocking bytes*, not request
count.

### 1.6 Route-level code splitting (pairs with 1.1)
`main.js` statically pulls the whole screen graph (`workspace`, `explorer`, `settings`, `profile`,
`dms`, …). Once a bundler is in place, dynamic-`import()` each screen module in the route dispatch
(`main.js`) so navigating to `/s/:id/c/:c` only downloads the workspace chunk. Without a bundler
the browser still fetches each `./screens/*.js` on demand if you convert the static imports to
`import()` — a free win even buildless, at the cost of a tiny per-navigation fetch.

### 1.7 Collapse per-screen query fan-out (latency, not bytes)
Supabase is in **eu-north-1**; a US/AU user pays ~100–250 ms per round-trip. `loadWorkspace`
issues several *sequential* batches — members/roles/channels, then a separate `profiles` fetch
(the `byId` pattern, forced because `user_id` columns FK to `auth.users`, not `public.profiles` —
see GOTCHA R), then messages, then reactions/pins/attachments. Each sequential hop is one RTT.
- **Already good:** independent queries inside a screen use `Promise.all` (parallel). Keep that.
- **Win:** fold the multi-hop loaders into one `SECURITY DEFINER` RPC per screen that returns
  shaped JSON in a single round-trip (e.g. `get_workspace(channel_id)` → members+roles+channels+
  last-50-messages+reactions as one `jsonb`). This trades a little SQL surface for a big latency
  cut on high-RTT connections. Do it for the hot screens (workspace, explorer) only; leave the
  cold ones direct. **Verify each new RPC the VERIFICATION.md way** (it's the fence now, so
  re-check the gate in-body).
- Cheaper interim win: the profile `byId` fetch can be **cached** across screens (profiles rarely
  change) — a module-level `Map<id, profile>` with a short TTL, reused by every loader.

### 1.8 Paginate long lists (correctness-adjacent perf — see TODO P20)
`loadWorkspace` loads a channel's **entire** message history (no `.limit()`). Comments cap at 200,
DMs at 300, feed at 120 — channel messages must too. Load the newest ~50 + lazy-load older on
scroll-up. Same for the explorer grid when a folder holds thousands of files (virtualize the grid,
or cap + "load more"). This is the difference between a snappy channel and a 5-second freeze at
scale.

### 1.9 Media (the explorer/feed thumbnails)
Media already serves from R2 via `cdn.eski.lol` (Cloudflare-proxied, cached) — good. When P14
(thumbnail view modes) lands, generate/serve **downscaled thumbnails**, not full-res originals, in
the grid (a Cloudflare Image Resizing URL or a stored `_thumb` key). Add `loading="lazy"` +
explicit `width/height` on every `<img>`/`<video>` to stop layout shift and defer offscreen media
(the explorer already uses `loading="lazy"` in places — make it universal).

---

## 2. Correctness & determinism

The backend + data layer were audited end-to-end (2026-08-29/30; see BUILDLOG). The methods that
caught real bugs, keep using them:

- **"No error" ≠ success — trust a *changed row*, never the absence of an error.** A Supabase
  `.update()/.delete()` that RLS filters to zero rows returns `{data:[], error:null}`. Every
  load-bearing write must `.select()` its touched rows and check `data.length`, or throw (GOTCHA Q).
  The silent-no-op class bit pfp/banner (K2), delete_server (K4), the file menu (this audit), and
  folder-share revoke. **Audit any new write for it.**
- **Prefer a `SECURITY DEFINER` RPC for any write with a COMPLEX inline-`auth.uid()` check** — a
  simple `col = auth.uid()` check is reliable, but a compound `CASE/EXISTS/subquery` check fails
  or no-ops non-deterministically over the pooled MCP connection (the works-insert outage, K7/K8).
  RPCs and helper-gated policies test reliably.
- **Test the deterministic way** ([`VERIFICATION.md`](VERIFICATION.md)): rolled-back role-sim
  (`set local role authenticated` + `request.jwt.claims`), service-role row-shape inserts, and
  static `pg_policies` reads. A demo screenshot proves layout, not function. This session's fence
  tests (visibility/DM/moderation/search) are the template.
- **The FK-embed hazard (GOTCHA R):** `user_id` columns FK to `auth.users`, which has no FK to
  `public.profiles`, so a PostgREST embed of author profiles silently returns nothing. Every loader
  fetches profiles into a `byId` map by hand. Keep that; never "simplify" it into an embed.
- **Free type-checking without a build:** `db-types.ts` (regenerated from the live schema) already
  exists. Run `npx tsc --noEmit --checkJs --allowJs app/*.js` in CI (or a SessionStart hook) to
  catch wrong column names, missing awaits, and shape drift *statically* — huge determinism win for
  a plain-JS codebase, zero runtime cost, no bundler.
- **The gallery determinism harness** (`docs/design/verify.mjs`) machine-checks every design state.
  Run it before any gallery/UI-primitive change; extend the same idea to a tiny `node` harness that
  imports `data.js` shapers (`shapeWork`, `shapeDM`) and asserts their output shape against
  fixtures — catches data-shape regressions without a live DB.

---

## 3. Simplicity

- **`app/data.js` is 107 KB / ~1750 lines in one file.** It's coherent but large. Split by domain
  (`data/workspace.js`, `data/explorer.js`, `data/social.js`, `data/admin.js`, re-exported from a
  barrel) for legibility and to make 1.6 code-splitting natural. Cosmetic, do it opportunistically.
- **Keep the `el()` DOM helper and the signals layer.** They're the whole framework; they're
  enough. Resist adding a template library.
- **Dedupe the read helpers.** Many loaders repeat "fetch works → fetch placements/tags/stars →
  fetch author profiles → shape." Extract one `hydrateWorks(rows, {source})` used by explorer,
  feed, profile, and channel-attachments. Fewer copies = fewer places for a `deleted_at`/visibility
  filter to drift.
- **One storage-shape helper.** `loadServerExplorer`, `loadPersonalExplorer`, `loadUserSettings`,
  and `refreshStorage` each recompute `{usedBytes, capGb, capBytes, …}`. Extract `shapeStorage(meter,
  balance, base)`.

---

## 4. Libraries — keep / add / avoid

**Keep:** vanilla + `app/signals.js`; `aws4fetch` (the only dep — a tiny SigV4 signer for R2 in
`api/sign.mjs`, correct choice); Supabase for auth/postgrest/realtime.

**Consider adding (all small, no framework lock-in):**
- **esbuild** — production minify/bundle only (see 1.1). The single highest-leverage addition.
- **The modular `@supabase/*` packages** instead of the 212 KB umbrella (see 1.4).
- **A tiny virtual-scroll** (hand-rolled ~50 lines, or `@tanstack/virtual-core` which is
  framework-agnostic) for the message stream and the explorer grid when P14/P20 land.
- **`pyftsubset`** (build-time font subsetting, see 1.3).

**Avoid:** any UI framework (React/Vue/Svelte); a CSS framework (the token system is the design
language — a utility framework would fight it); an ORM (RLS + typed RPCs are the data layer);
moment/lodash-scale utility libs (the `el()`/signals/`fmtTime` helpers cover it).

---

## 5. Techniques already in the codebase worth copying elsewhere

These are *good* — extend them, don't undo them:
- **`<link rel="preconnect">` to Supabase + `cdn.eski.lol`** (index.html) — warms TLS before the
  first query/media fetch. Add `dns-prefetch` fallbacks if you add another origin.
- **`theme.js` is a blocking classic script in `<head>` before the stylesheets** — it stamps
  `data-theme` pre-paint, so there's no theme flash. Never make it a module or move it after CSS.
- **`_cache` (rail + per-server bundle)** — a channel switch only refetches the channel. The
  pattern to copy: cache what changes rarely, key it so a different account can't read a prior
  one's cache, and clear on sign-out.
- **`perf.js`** — an in-app, opt-in timing HUD because the builder can't reach prod. This is the
  right way to optimize a site you can't profile from the sandbox: instrument, ship, read the HUD.
- **Realtime teardown on route change** (`teardownRealtime()`, K6) — no leaked subscriptions.
  Combine with 1.4's lazy realtime import.

---

## 6. Prioritized checklist (copy into TODO when you pick this up)

1. **Lazy-load `demo.js`** (1.2) — free, no build, −25 KB for every real user. *Easy.*
2. **`tsc --checkJs` in CI/hook** (§2) — free determinism, catches column/shape bugs. *Easy.*
3. **Fonts → woff2 + preload + `font-display:swap`, drop the `@import`** (1.3). *Easy-medium.*
4. **Split critical/deferred CSS** (1.5) — defer `content.css`/`landing.css`. *Easy-medium.*
5. **Paginate channel messages** (1.8 / TODO P20) — the scale landmine. *Medium.*
6. **esbuild production minify/bundle + hashed filenames + immutable caching** (1.1). *Medium.*
7. **Slim/modularize Supabase + defer realtime** (1.4) — biggest JS win, needs 1.1 or a swap. *Medium.*
8. **Route-level code splitting** (1.6) — after 1.1. *Medium.*
9. **`get_workspace`/`get_explorer` consolidation RPCs** (1.7) — latency win on hot screens. *Medium-hard, verify the fence.*
10. **Virtualize the message stream + explorer grid; thumbnails** (1.8/1.9, with P14). *Hard.*

Measure with `perf.js` before #1 and after each — keep only what moves the number.
