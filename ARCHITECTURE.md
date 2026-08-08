# How eski is put together

**Read this before changing anything.** It says what each file owns, so a
change lands in one place instead of being added next to the thing that
already does it.

There is no build step. Every `.html` file is served as written, loads a few
shared scripts, and holds its own behaviour in one `<script>` at the bottom.
That is deliberate — the whole app is inspectable with view-source — but it
means **the discipline has to come from knowing what owns what**, because
nothing stops you defining the same thing twice.

`tests/structure.js` enforces the parts of this that can be checked
mechanically. If it fails, this document is what it is holding you to.

---

## The rule that matters most

**One thing is decided in one place.**

The bug this codebase keeps producing is not a broken feature — it is a
correct fix that gets silently undone. `.btn.p:hover` was defined near the top
of `broadsheet.css` and again 330 lines later with a different value. Same
specificity, so source order won. It was fixed twice, and both times the site
did not change.

So, concretely:

- **Colour and hover for a shared control live in the interaction section at
  the foot of `broadsheet.css`,** and nowhere else. The structural rule higher
  up sets size, spacing, borders and type only.
- **A page's own `<style>` may not restate a shared control.** If `.btn` needs
  to look different on one surface, that surface has a class of its own.
- **Every colour comes from a token.** `palettes.css` is the only file that
  holds raw colour, plus the four entry-kind spines in the two studios, which
  are categories rather than brand and say so.

---

## Load order, and why it is not negotiable

Every page loads the same head in the same order:

```
vendor/panzoom.js     classic, sync — viewer.js needs it defined
viewer.js             classic, sync — exposes mountViewer()
platform.js           TYPE=MODULE, so it is deferred whatever you do
palette.js            classic, sync — must run BEFORE the stylesheets
loudness.js           classic, sync — only where audio is measured
tokens.css            metrics and type scale
broadsheet.css        the house style
palettes.css          the eighteen themes; last, so it wins
```

Two consequences that have each caused a bug:

**`palette.js` runs before the stylesheets** because it stamps the chosen
theme onto `<html>`. Load it after and the page paints the default theme and
then repaints — the flash the whole token system exists to avoid.
`tests/structure.js` checks this on every page.

**`platform.js` is a module, so it never runs during parse.** Nothing may read
`window.eski` at the top level of a classic script. Every page waits on
`window.eski.ready`, and the pattern for it is at the top of each page's
script. This is what ESK-1005 is for.

---

## What each file owns

### Shared

| File | Owns |
|---|---|
| `platform.js` | The Supabase client, the current user, `mediaUrl()`, and `dbError()`. The single boot path. Everything else waits on `window.eski.ready`. |
| `tokens.css` | Spacing, type scale, control heights, timings. **No colour.** |
| `docs/design/final/broadsheet.css` | The house style: chrome, controls, plates, sheets, folds, captions. The foot of the file owns colour and hover for every shared control. |
| `palettes.css` | The eighteen themes. The only file with raw colour in it. |
| `palette.js` | Reads and stamps the theme, and draws the picker. |
| `viewer.js` | `mountViewer()` — the pan/zoom page viewer. Used by the reader and both studios, so a viewer fix lands here once. |
| `loudness.js` | ITU-R BS.1770-4 measurement and the gain targets. Used by both studios so the two cannot disagree about how loud a clip is. |
| `comments.js` | The comment thread widget, used by the comic page and the reader. |
| `hash-worker.js` | SHA-256 off the main thread, for content-addressed upload keys. |
| `sw.js` | Precaches the app shell. Deliberately refuses media. |

### Surfaces

| File | Is |
|---|---|
| `index.html` | Home, browse, the comic modal, and the local shelf. The biggest surface and the one most likely to need splitting. |
| `read.html` | The reader. Pages, the player, the mix and comment sheets. |
| `studio.html` | The **composer**: import pages and audio, place a soundtrack, publish. The author's own tools. |
| `author.html` | The **author studio**: the cast, and the script — who says what on which page, and how each line is timed against the one above it. |
| `contribute.html` | The **contribution studio**: one screen, three stances (voice, score, effects), one writable column under each. For people who are not the author. |
| `profile.html` | Your comics, parts, shelf and settings. |
| `admin.html` | The moderation queue. |
| `legal.html`, `spec.html` | Static prose. `spec.html` documents v2 and says so. |

### Server

| File | Is |
|---|---|
| `api/sign.mjs` | Signs presigned R2 uploads. A trust boundary — it is the only thing standing between a signed-in user and the bucket. |
| `api/comic.mjs` | Server-renders `/c/<slug>` for link previews, then hands over to the client. |

### Database

Schema lives in `schema*.sql`, each applied in order and safe to re-run.

**Two reads go through an RPC rather than a query**, because both were serial
round trips that also counted in the browser what Postgres can count:
`get_comic(id)` for the reader and `get_shelf(slug, limit)` for home and
browse. Both are `STABLE` and **not** `SECURITY DEFINER` — they run as the
caller, so `auth.uid()` is the real user and RLS applies exactly as it does to
the selects they replaced. Keep it that way; `SECURITY DEFINER` here would be
a way to leak other people's drafts.

`schema.sql` is the base; the rest add a feature each. **The policies are the
rule, not the UI** — the studio hides a control it knows is refused, but the
insert is where the refusal actually happens, which is why closing a consent
axis works even against a stale page.

---

## Where a change goes

| If you are changing… | It goes in |
|---|---|
| How a button looks when hovered | the interaction section of `broadsheet.css`, once |
| A colour, any colour | `palettes.css` — never a literal in a page |
| A spacing or type step | `tokens.css` |
| Who may do what | a `schema*.sql` policy first, the UI second |
| The page viewer | `viewer.js` — all three surfaces get it |
| How loud something is | `loudness.js` — both studios read it |
| A new error condition | a new `ESK-####` **and** a line in `ERRORS.txt` |
| Anything visual | run `tests/shots.js`, then the `eski-ui-audit` skill |

---

## The tests, and what each is really for

Nine suites. Four need nothing but node.

| Suite | Catches |
|---|---|
| `structure.js` | A fix being silently overwritten. Duplicate colour declarations, unregistered or colliding ESK codes, load order, drift in this document. |
| `cache.js` | An asset added later that nobody gave a caching policy. Config fails silently, so this walks the HTML rather than trusting the config. |
| `loudness.js` | The meter, against the published EBU conformance cases. A normaliser that is wrong is worse than none. |
| `smoke.js` | The reader and both studios, end to end, in a browser. |
| `errors.js` | That a failure names itself instead of being swallowed. |
| `recording.js` | A take end to end against a fake capture device — no microphone needed. |
| `viewer-fit.js` | Every page shape fits its box, at every zoom. |
| `check-sign.mjs` | The signer's refusals, called as a function with no network. |
| `wordmark.js` | The logo's ink centred in the bar, measured rather than judged. |

`tests/shots.js` is not a test — it takes pictures across surface × state ×
theme × viewport. The `eski-ui-audit` skill is how to read them.

---

## Known shape problems

Written down rather than left to be rediscovered.

- **`studio.html` is 3,500 lines.** It is the composer, the importer, the
  exporter and the publisher in one file. It is the next thing that should be
  split, and the seam is the import/transcode pipeline.
- **`index.html` is 2,200 lines** and holds four surfaces (home, browse, the
  modal, the local shelf).
- **`spec.html` documents v2** while the app is growing v3 parts. It says so at
  the top, but it will mislead somebody eventually.
- **The reader has not caught up with the studios.** It plays one soundtrack
  and fires every one-shot at the page turn, so published parts and the
  `with`/`over` timing are authored but never heard. Roadmap item 10.
