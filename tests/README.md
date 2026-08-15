# eski tests

**2026-08-15: the pre-pivot suite was deleted, not left stale.** It drove or
asserted against `read.html`/`studio.html`/`author.html`/`contribute.html`
and the comics-era database, all gone. What's left is what still means what
it says.

```
node tests/structure.js    # one thing decided in one place — run this first
node tests/cache.js        # every asset has a caching policy
node tests/loudness.js     # the BS.1770-4 meter against EBU conformance cases
node tests/check-sign.mjs  # api/sign.mjs's refusals, called as a function
```

All four need nothing but node — no browser, no account, no network. `.github/
workflows/tests.yml` runs them on every push.

### `structure.js` — a fix cannot be silently overwritten

The one to run first, and the one that exists because the same bug happened
twice: `.btn.p:hover` defined at the top of `broadsheet.css` and again 330
lines later, source order deciding it, "fixed" twice with no visible change.

It fails on a selector given the same colour property in two places outside a
media query, on a hex literal in a page (`artboard.html` is exempted — see
its own header comment), on an ESK code raised but not registered, on a page
loading `palette.js` after the stylesheets, and on `ARCHITECTURE.md` drifting
behind the files it describes.

### `cache.js` — every asset has a caching policy

`vercel.json` is configuration, so it fails silently: a rule with a typo does
not error, it just never matches. This walks the HTML for every same-origin
asset and asserts each one is covered, which catches the failure that
actually happens — a file added later that nobody put on the list. It also
checks the policies are the right way round: HTML must revalidate or deploys
do not land, and only `/vendor/` may be immutable, because nothing else gets
renamed when it changes.

### `loudness.js` — the meter, against the published conformance cases

ITU-R BS.1770-4 checked against EBU Tech 3341: a 1kHz sine at a known level
must read that level back within 0.1 LU, at several sample rates. Also the
gates, the peak-headroom guard, and the rule that a whole part gets ONE gain
so a performance keeps its dynamics. Fakes an AudioBuffer, so it runs in node
with no browser and no audio files. `loudness.js` (the module) isn't called
by anything live yet — kept in case audio normalization gets built — but the
math is real and this is what proves it.

### `check-sign.mjs` — the signer, without a browser

`api/sign.mjs` guards a trust boundary (the only thing standing between a
signed-in user and the R2 bucket) and needs neither a browser nor a network,
so it gets its own check with dummy credentials.

---

## `errors.js` — partial, not rewritten yet

```
node tests/errors.js
```

Its signer checks (calls `/api/sign` directly with broken env vars, asserts
each refusal carries the right `ESK-3xxx` code) still pass. Its page-driven
checks (load `index.html` with `vendor/supabase.js` 404ing, assert the boot
failure is named rather than swallowed) drive a selector (`#grid`) that
doesn't exist on the current pivot pages and will fail. Needs a rewrite
against `index.html`'s real markup before it's CI-worthy again — not run in
`tests.yml` until then.

## `shots.js` — needs a rewrite for the pivot pages

```
node tests/shots.js                              # into docs/design/shots/
node tests/shots.js --grid                       # with the alignment overlay
BASE=http://localhost:8940 node tests/shots.js   # against a local server
```

The shape is still right — every screen at 1440×900 and 390×844, `--grid`
drawing near-miss edges in red — and `THEMES` already matches the pivot's
two themes (`light`,`dark`). What's stale is the `SCREENS` list itself: it
targets pre-pivot routes and selectors (`/`, `.card`) that don't exist any
more. See the `eski-ui-audit` skill for the matrix it should cover once
that's fixed — home feed, profile, admin, the detail overlay per content
kind, the upload modal, settings.

## Setting up a harness account

The live product's own tests (and manual poking-around) sign in as a real,
password-based account rather than a mock:

```sql
-- tests/live-account.sql, run once in the supabase SQL editor
```

`harness@eski.test` — no powers a signed-up user lacks. **Do not delete it.**

## Running these from a sandbox

If `HTTPS_PROXY` is set, browser requests get fetched by the node driver
instead of a real browser, which is how a box with no browser egress can
still drive one.
