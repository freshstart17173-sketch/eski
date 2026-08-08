# Every surface, and every control on it

Written so the theme system has a known set of things to cover, and so a new
theme is a checklist rather than a hunt. If you add a control, add it here.

Measured at 1440×900 and 390×844 with `node tests/shots.js`. Shots land in
`docs/design/shots/`; `--grid` overlays every element edge and paints the
near-misses red.

---

## The shared chrome

Present on every surface except the reader on a phone and the admin console.

| Control | Element | Notes |
|---|---|---|
| Wordmark | `.mark` | The `!` is the one place `--accent` appears in the chrome |
| Nav: Home, Browse, Studio, Profile | `.top nav a/button` | Uppercase. The current one carries a 2px `--mark` underline — the only underline in the chrome |
| Sign in / Sign out | `.auth-btn` (platform.js) | Signed out it opens a provider menu; signed in it is one word |

**The header shares the content column.** `--wrap` is 1280px and `.top` insets
by `max(--s4, (100% - --wrap)/2 + --s4)`, so the wordmark starts exactly where
the first heading starts (96px at 1440) and the nav ends where the rule ends
(1344px). Before this it ran full-bleed at 16..1424 while the content sat at
96..1344, which is the misalignment you see once and cannot unsee.

---

## Home (`index.html`, pane `home`)

| Surface | Controls |
|---|---|
| Section head ×3 | `h2` (Gnomon), `.n` count, `All comics` / `Who you follow` / `See all` |
| Comic card | Whole card opens the detail; tags inside it are their own buttons |
| Card caption | BY · EXTENT · VOICES · SCORE · KUDOS · COMMENTS, right-aligned values |
| Resume strip | `.resume` — "continue · p.12", clicks straight into the reader |
| See more | `.seemore` — inverts on hover in broadsheet, fills in the soft themes |
| Onboarding | `#ob` overlay, shown once ever |

## Browse (`index.html`, pane `browse`)

Three modes — comics, roles that need a voice, scores — each with its own
search placeholder, sort list and filter chips.

| Surface | Controls |
|---|---|
| Mode switch | `.seg button[aria-selected]` |
| Search | `input.q` |
| Sort | `select` |
| Filters | `.chip[aria-pressed]` |
| Results | Card grid, or `.rolerow` for roles |

## Comic page (`/c/<slug>`, rendered by `index.html`)

Both a modal over the shelf and a page in its own right. `body.deep` is the
page form: no scrim, full height, and the way out is a word.

| Surface | Controls |
|---|---|
| Close | `.sheet-x` (phone) / `.sheet-home` "← all eskis" (deep) |
| Cover plate + caption | — |
| Tags | `.tag`, `[data-untag]`, add field |
| Series | `.chip[data-sib]` |
| Voices fold | `.pick` checkboxes, `[data-preview]` play buttons |
| Score fold | Same, plus "no score" — exclusive with the others |
| Thread | `#d-cm-toggle` fold, then comments.js |
| Actions | Read with this mix · Add to shelf · Kudos · Voice or score it · Copy link |

## Reader (`read.html`)

| Surface | Controls |
|---|---|
| Page | Edge bands turn the page, top/bottom step one-shots, middle is free for double-tap and pinch |
| Zoom bar | −, +, Fit |
| Player bar left | SCORE + name + the playing indicator |
| Player bar middle | Page counter, jump field, chapter select |
| Player bar right | Focus · Controls · The mix · Comments · Settings · Mute · Volume |
| Sheets | `#mix`, `#cmsheet`, `#settings`, `#keys-panel` — each closes on an outside tap |

On a phone the header is gone, the nav moves into settings, buttons go
icon-only, and the counter shortens to `N/M`. The bar is 385 of 390px — there
is no room for another control.

## Studio (`studio.html`)

The one surface that is not broadsheet: its own denser language, and the only
place `--accent` is allowed to fill anything.

| Surface | Controls |
|---|---|
| Bar | Add media · Add folder · Settings · Preview · Save draft · Publish |
| Media bay | Search, kind filter, image and audio chips, zoom in/out |
| Stage | Page grid, or the empty state |
| Page panel | Queue, one-shots, cast, trim, rename, duplicate, delete |

## Author studio (`author.html`)

Cast list and per-page transcription. Three entry kinds — dialogue, narration,
sound effect — which are the one documented exception to the colour rule.

## Profile (`profile.html`)

| Surface | Controls |
|---|---|
| Identity | Avatar, name, @handle, bio, Copy link, Edit profile |
| Stats | Contributions · Shelf · Reading · Kudos — four equal columns, hairline-separated |
| Edit panel | Display name, handle, bio, Save, Cancel |
| Sections | Reading · Read · Shelf · Contributions · Published · Drafts |
| Settings | The theme picker |

## Admin (`admin.html`)

Deliberately plain: monospace, one table style, no broadsheet.css. Overview,
Comics, Comments, Parts, Reports, Users. **The gate is in the database**
(`schema-admin.sql`), not on this page.

---

## What a theme has to cover

Every one of the above reads these tokens. A theme that sets all of them is
complete; see `themes.css`.

| Token | What it decides |
|---|---|
| `--paper` `--surface` `--plate-bg` | Grounds, including behind cover art |
| `--ink` `--soft-ink` `--muted` `--label` | Text, in four steps |
| `--rule` `--rule-hair` `--line-1` `--line-strong` | Every line on the site |
| `--accent` | Counts, focus rings, the wordmark's `!` |
| `--mark` `--on-mark` | The one fill that means "this is on", and what goes on it |
| `--r` | Corner radius, everywhere |
| `--bw` | Hairline width. **`0` genuinely removes them** |
| `--font-body` `--font-display` | Only Jost and Gnomon are downloaded; the rest are system stacks |
| `--hover-bg` `--hover-ink` | Whether a hover changes colour or fills |
| `--shadow-1` | Whether anything lifts off the page |

Two themes set `--bw:0`. That breaks any layout built out of borders, so the
card grid gets separation back the way unruled designs do it: a surface, a
radius, a small shadow and real space. If you add a bordered layout, check it
in **pink** before you call it done.
