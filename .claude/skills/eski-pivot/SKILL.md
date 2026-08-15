---
name: eski-pivot
description: The design system for eski's all-purpose pivot (index.html, profile.html, pivot.css, pivot.js, and every screen in artboard.html) — tokens, components, and the rules that have already caused a real misunderstanding once (the wordmark's font, what turns pink and when, the header's alignment). Use whenever a UI element or screen in the pivot is added, changed, or reviewed. Trigger on "pivot", "artboard", "wordmark", "like button", "hover", "eski style", or a request to add/change/check any screen in index.html, profile.html, pivot.css, or pivot.js.
---

# eski-pivot

**In one line:** artboard.html is the spec, not a sketch of one — a pivot
screen is correct when it matches the mockup's *measured* computed styles,
and the workflow that keeps it that way is artboard first, live pages second.

## The rule that exists because it was broken once

**Prototype in `artboard.html` before touching a live page.** A change made
straight in `index.html`/`profile.html`/`pivot.css`/`pivot.js` with no
corresponding change in the mockup is exactly how the two drift — and drift
here doesn't announce itself, it just reads as "slightly off" until someone
measures it. The mockup is reviewed and approved; the live pages exist to
make it real. When a change is decided, edit `artboard.html`'s relevant
mockup and its CSS first, then port the same values into `pivot.css`/
`pivot.js`. Never the other direction.

**When checking whether a live screen matches**, don't eyeball it —
`getComputedStyle()` both sides and diff the numbers. Font, color, radius,
padding, and position all read as "close enough" to a screenshot at a glance
and are exactly where a few pixels or one wrong token hides. This is how
every real gap in this system was actually found: the corner radius (`0`
vs the mockup's `2px`), the avatar (circle vs the mockup's square), the
wordmark (3px off the nav row's centreline) — none of them were visible
until measured.

## Reference

**are.na.xyz**, researched live against the real site, not guessed: dark
canvas, `#1a1a1a` panels, `#333` hairlines, three text-gray tiers, one
pale accent, small text-link-style download rows, one-item-at-a-time
carousels for collections. That research shaped `artboard.html`'s own
toolbar chrome — but **the product mockups inside it (`.eski-mockup`) are
a *light* paper/ink system**, not the dark are.na chrome. Don't confuse
the two: the dark canvas is the artboard tool's own UI for arranging
mockups on a pannable canvas, not part of the product.

## Tokens

The mockup's own `.eski-mockup` scope defines a token set that, when
measured, turns out to already match the site's existing `tokens.css`/
`palettes.css` architecture almost exactly — so nothing here is a new,
separate system, it's the same one with one new hue:

| Mockup token | Real token | Value (light-sage) |
|---|---|---|
| `--paper` | `--paper` | `#FCFCFC` |
| `--paper-dim` | `--surface` | `#F1F1F1` |
| `--ink` | `--ink` | `#111111` |
| `--ink-soft` | `--soft-ink` | `#3A3A3A` |
| `--muted` | `--muted` | `#6B6B6B` |
| `--accent` | `--accent` | `#5B7A6B` (the **sage** hue — new, added for the pivot) |
| generic hover fill | `--plate-bg` | `#EAEAEA` |
| `--radius-min` | `--pv-r` (pivot.css) | `2px` — **not** the site's square `--r` (`0`). Measured off the live mockup; "no rounded corners" was the pivot's opening instruction but the reviewed mockup itself settled on a barely-visible 2px on chrome. Media (`.gbox`, `.fillmedia`) stays `0`. |
| the ruby-red Like state | `--like-bg` / `--like-ink` (tokens.css) | `#FCE4EC` / `#C2185B` — fixed across every theme, same reasoning as `--danger`, not palette-derived |

`sage` isn't a theme choice any more, it's just the accent — **the palette
system was cut to two themes, `light` and `dark`, both sage** (2026-08-15).
The old six-hue/three-treatment picker (eighteen themes, then nineteen once
sage joined it) was the comics-era "colour belongs to the reader" premise
still running underneath the pivot; it's how a signed-in visitor could land
on eski and get a magenta page with the wrong font with no way to know why
— a stray pick from the old picker, or a stale service-worker cache serving
pre-pivot CSS, looked identical from the outside. `palette.js`'s `DEFAULT`
is `'light'`; the toggle lives in profile.html's Settings tab now, not a
footer picker (see `docs/design/STYLE.md`, updated to match).

## Type

**Jost, everywhere, including the wordmark.** Gnomon is not used on any
pivot page or in any pivot mockup — not even the wordmark, which is the
one place it survived on the old comics-era pages. This was a direct
correction (2026-08-15): Gnomon declares a baseline 0.26em above where its
ink actually sits, so every use of it needed a `translateY()` correction
term, and that term was wrong often enough (measurably: 3px off the nav
row's own centreline, on the live site) that it wasn't worth the
inconsistency it bought. If a design idea calls for a display face
somewhere in the pivot, that's a real decision to make deliberately and
test the baseline of — it does not default back to Gnomon by habit.

Scale: `--fs-micro`(11) `--fs-xs`(12) `--fs-sm`(13.5) `--fs`(15) `--fs-lg`(17)
`--fs-title`(22) `--fs-display`(44, rarely used). Labels are uppercase,
`.06em`–`.12em` letter-spacing depending on size — check `pivot.css` for the
exact value on the element you're matching rather than picking one.

## Components

Everything reusable lives in **`pivot.css`** (styles) and **`pivot.js`**
(`window.Pivot` — state, the card renderer, the whole detail overlay,
sign-in, upload, and now `openConfirm()` for styled confirmations). A
second page needing any of this calls into `Pivot`; it does not get its
own copy. `index.html` and `profile.html` are both proof this works —
`index.html`'s inline script is only its feed query and filters because
everything else already lived in `pivot.js` by the time `profile.html`
needed it too.

Key classes: `.chip` `.btnline` `.navlink` `.tagchip` `.tagsearch`
`.dtab` `.navarrow` `.dropzone` `.filmstrip` `.ufield`/`.uinput`/`.utext`
`.fgrid`/`.gcard`/`.gbox`/`.fillmedia` `.burger` `.actbtn` `.savewrap`/
`.savedrop` `.cmt` `.carrow`/`.cdots`/`.ccount` `.seg`/`.mchip` `.verwrap`/
`.verdrop` `.searchmini` `.folderrow` `.a2c`/`.a2cdrop` `.pv-scrim`/
`.pv-card` `.wordmark` `.pivot-top`.

## Rules

**No outlines. State is a background fill, full stop.** Matches are.na's
own dark-fill buttons — this was explicit and repeated in the mockup's own
build notes. Never add a `border` to show a control is active or hovered.

**Hover is always neutral** — `var(--plate-bg)`, a flat background swap,
160ms. The one exception is a `.btnline.filled` (a solid-ink button, e.g.
Upload/Publish), which goes to `var(--accent)` on hover. **Hover is never
pink, on any control, including Like.**

**The Like button only turns pink when it is *on* — a click, never a
hover.** `.actbtn.like.on` gets `--like-bg`/`--like-ink`; plain
`.actbtn:hover` (Like included, before it's toggled) is the same neutral
`--plate-bg` every other action button gets. `.on` is a class toggled by a
click handler (`likeBtn.classList.toggle('on')` in `pivot.js`), never a
CSS `:hover` rule — if you ever see a hover rule reference the like
colors, that's the bug this line exists to catch. This is the exact
distinction that prompted this skill to be written: "only the like
button, and only on click" is the whole rule, and it was already correct
in the shipped code the one time it was checked carefully — the risk is
someone reintroducing a broader hover-pink rule later without checking.

**The header cluster (`nav` + whatever `platform.js` appends after it)
stays flush right regardless of how many children end up there.**
`.pivot-top nav{margin-left:auto}`, not `justify-content:space-between`
on the header — `space-between` only holds the *last* two children at the
edges, and `platform.js` appends a third child (`.auth`, the Sign-in
control) only when signed out, so a two-child assumption silently breaks
the moment someone is logged out. If you add a fourth thing to the header,
check it lands inside or after `nav`, not as a second `space-between`
partner.

**The gap between the wordmark and the nav cluster on a wide viewport is
correct, not a bug.** The mockup's own header is wordmark-far-left,
nav-cluster-far-right with nothing in between — that's an intentional
"logo and nav at opposite edges" layout, and it produces a large open
middle on a 1440px screen by construction. Don't "fix" this by pulling
nav toward the center; check vertical alignment (baselines, centerlines)
before assuming a spacing complaint is about the horizontal gap.

**Poster-only chrome is real access control, not UI hiding.** The burger
menu, editable tags, and "+ Add version" only render when
`user && user.id === work.owner_id` client-side — but every mutating
action behind them is *also* gated by an RLS policy or a trigger
(`works_write`, `works_version_owner_guard`) server-side. Don't add a
poster-only control without checking the matching database policy
already refuses it for anyone else; the UI check is a convenience, the
policy is the rule.

## Verification

Sign in for real when a screen's behavior depends on it. This project's
test harness (`tests/live-account.sql`) is a genuine password account —
`sb.auth.signInWithPassword({email:'harness@eski.test', password:'eski-harness-2026'})`
— not a mock or a bypass, and it persists through page navigation
(`localStorage`, same-origin). Use it to check poster-only chrome, the
edit flow, delete confirmations, and the upload flow against the real
database rather than assuming the conditional renders correctly.

For a full side-by-side pass across every screen, capture both sides with
`html2canvas` (loaded from CDN into the *live page*, not into any
artifact) rather than the `computer` screenshot tool alone — it's
scriptable, so a full 14-screen sweep is a batch of `javascript_exec`
calls instead of manual navigation, and it captures the exact rendered
DOM rather than a manually-timed screenshot. Persist captures to
`localStorage` between navigations (a plain JS variable does not survive
a page load) if the sweep spans more than one page.

## Do not

- Do not restate a `pivot.css` rule inside a page's own `<style>`. If a
  page needs a control to look different, that's a new class in
  `pivot.css`, not an inline override.
- Do not add Gnomon back to the wordmark, or to anything else in the
  pivot. See Type, above.
- Do not reach for `--r` (the site's square-corners token) inside
  `pivot.css`. Chrome is `--pv-r` (2px); media stays hard `0` via
  `.gbox`/`.fillmedia`'s own rules, not a shared radius token.
- Do not build a confirmation with the native `confirm()`. Use
  `Pivot.openConfirm(title, body, confirmLabel, onConfirm)` — it renders
  on its own stacking layer specifically so it can be raised from inside
  an already-open overlay without wiping it.
- Do not assume a live page matches its mockup because the diff "looks"
  clean in a screenshot. Measure it.
