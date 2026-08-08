---
name: eski-ui-audit
description: Nitpick every eski surface from screenshots, across every configuration — surface x state x theme x viewport — against the rules in docs/design/STYLE.md. Catches the class of bug that only exists in a combination, like a green scrim under a pink modal, a hover that resolves to the colour it already was, or a control still in lowercase. Use before shipping any visual change, after any change to palettes.css or broadsheet.css, when the user reports something "looks off" or "irks" them, or when asked to audit, review, check or screenshot the UI. Trigger on "audit", "nitpick", "check the UI", "does this look right", "screenshot every screen", "alignment", "theme bug", "looks off".
---

# eski-ui-audit

**In one line:** a surface at rest in the default theme is the easy half; every
bug that survives review needs a surface *and* a state *and* a theme at once.

## Why this exists

The modal scrim was `rgba(12,19,15,.55)` — the old sage ground, written as a
literal. It was invisible for months because seeing it wrong required a sheet
**open** on a theme that was **not green**. No screenshot of six pages at rest
in the default theme could contain that. Same shape of bug:

- `.btn.p:hover` set `background:var(--accent)`, and every palette gives
  `--mark` and `--accent` the same value — so the site's two most-pressed
  buttons had no hover at all. Visible only *during* a hover.
- The browse sort list stayed lowercase because `select` was exempted from the
  uppercase rule for the reader's chapter list. Visible only in one mode of
  one surface.
- `message-square` was referenced as an icon and never defined, so the
  comments button rendered an empty box. Visible only where that icon is.

None of these are subtle once you are looking at the right picture. The whole
job is generating the right pictures.

## Run it

```
node tests/shots.js                       # every config, 3 themes, 2 viewports
node tests/shots.js --grid                # + the alignment overlay
node tests/shots.js --only=modal,thread   # one config, while chasing something
THEMES=light-pink,dark-amber node tests/shots.js
BASE=http://localhost:8940 node tests/shots.js
```

Shots land in `docs/design/shots/`, named `<config>-<theme>-<viewport>.png`.
**Read them.** The script only takes pictures; it asserts nothing except
alignment near-misses. The looking is the skill.

## The matrix

**Surfaces at rest** — `home`, `browse`, `comic`, `reader`, `studio`,
`author`, `profile`.

**States** — a surface plus something open over or instead of it:

| Config | What it proves |
|---|---|
| `modal` | The scrim. The one that hid the green for months |
| `thread` | The comment fold open, over the sheet |
| `theme-open` | The chips, drawn each in its own theme, in a footer |
| `reader-mix` | A sheet over the page, with the player bar under it |
| `reader-comments` | Writing without leaving the comic |
| `reader-settings` | The bottom sheet on a phone |
| `profile-settings` | The only tab with controls rather than cards |
| `author-open` | The author studio with a draft open — at rest it is a picker, and the cast rows, entry column and after/with/over bars only exist past it |
| `contrib-voice/-sfx/-score` | One writable column per stance. Three shots, because one proves nothing |
| `contrib-pick` | Only comics open to contributions |
| `signed-out` | Every empty state, and the auth button as a menu |

`author-open` needs the `harness-fixture` draft to exist (see ROADMAP,
"Yours, not mine"). Without it the config shoots an empty picker.

**Themes** — one per *treatment*, not one per theme:
`light-neutral`, `mono-green`, `dark-pink`. Two themes of the same treatment
differ by six hex values; two treatments differ by whether the ground is
light, whether the text is light, and whether the accent **is** the page or
sits on it. Every colour bug so far has lived in that difference. Eighteen
themes × nine configs × two viewports is 324 images nobody will look at.

**Viewports** — 1440×900 and 390×844. The phone is not a smaller desktop:
the reader loses its header, the nav moves into settings, buttons go
icon-only, and the player bar is 385 of 390px with no room for anything else.

## What to check, in order

Go in this order. Colour first, because a colour bug is visible in a thumbnail
and a spacing bug is not.

### 1. Colour that does not belong to the theme

The single highest-yield check. Look at every pixel that is not artwork and
ask **which token is that?**

- **Scrims, veils and overlays.** Any dim over the page must be `--scrim`; any
  wash must be `color-mix` on `--paper`. A green tint on a pink theme, or a
  scrim that looks identical on light and dark, is a literal that escaped.
- **Anything still sage.** `#0C130F`, `#14221B`, `#8FC0A4`, `#ABC4B8`,
  `#354D41`, `D1E1D9`. The ramp is deleted; a match means a hard-coded hex
  survived somewhere.
- **A second hue.** The page allows one. Browser-default blue in a selection,
  a focus ring, a `<select>` popup, an autofilled input, or a validation
  message is a second hue.
- **Art is never tinted.** No scrim, no recolour, no duotone over a cover.

### 2. Case

Every visible string is in exactly one of three registers
(`STYLE.md` §1):

- **Clickable → UPPERCASE**, letterspaced. If it is in caps and it is not a
  field label, you can press it. **The inverse is the test that catches
  things**: find something you can press that is not in caps. Fold toggles,
  tab labels, `<option>` text, links inside prose, and buttons added since the
  last sweep are the usual offenders.
- **Field labels → uppercase micro type.**
- **Everything else → sentence case.** Capital at the start, full stop at the
  end for real sentences.

Never transformed, because they are somebody's words: comic titles, tags,
names, handles, comment bodies, chapter names.

### 3. Hover, and the no-op hover

For every interactive thing, hover it and look. Then ask the harder question:
**would this hover be visible if the two tokens happened to be equal?** Check
the pair in `palettes.css` before believing a hover exists. `--mark` and
`--accent` are the same value in all eighteen themes, so any rule going from
one to the other does nothing at all.

A hover is **colour only**: a rectangular box, `--ui-hover-bg` ground, `--ui`
text, 160ms. Nothing moves, scales, lifts or shifts the line it sits on. No
underline appears.

### 4. Alignment

Run with `--grid`. Every element edge is drawn as a vertical line; two edges
within 12px but not equal are drawn **red**. A thing either lines up with its
neighbour or is deliberately somewhere else — a near-miss is what reads as
sloppy, and it is the thing that "irks to no end" without being nameable.

Specifically: the wordmark starts where the first heading starts; the nav ends
where the rule ends; captions right-align their values down a column; the
metadata row is `--row` (19px) everywhere so columns align down the grid.

### 5. Baselines

Two things on one line must sit on one baseline. Gnomon declares 63.5% ascent,
so its ink sits high in its box — that is why the wordmark carries a
`translateY(.18em)` and why headings are Jost. If you are measuring a
baseline, **do not use a strut with `overflow:hidden`**: that makes an
inline-block's baseline its bottom edge, and you will measure line-height
instead and chase a bug that is not there.

### 6. Icons

Every icon must actually render. A referenced-but-undefined name draws an
empty box, which looks like deliberate whitespace at a glance. Cross-check any
icon name against `ICONS.txt`. Icon-only buttons need an `aria-label`.

### 7. Empty, loading and error states

Shoot `signed-out`, and shoot a comic with no cast, no score, no tags and no
comments. An empty state is a sentence, not a blank region. An error names its
`ESK-####`. A count of zero still renders, so the row does not resize when it
becomes one.

### 8. Phone

- Nothing scrolls sideways. Check `document.scrollingElement.scrollWidth`
  against the viewport, not by eye.
- Touch targets ≥ 40px.
- Sheets close from inside themselves *and* on an outside tap.
- The reader's edge bands are at the edges, so a double-tap in the middle
  zooms instead of turning the page.

## Reporting a finding

Name the picture, the token, and the rule. Not "the modal looks green" but:

> `modal-light-neutral-desktop.png` — the scrim is `rgba(12,19,15,.55)` in
> `broadsheet.css:255`, the old sage ground. It should be `--scrim`.
> STYLE.md §2: colour comes from the palette only.

If a finding is a rule the style guide does not yet have, say so and propose
the rule — then write it into `docs/design/STYLE.md`, because the next audit
needs to be able to check it.

## Do not

- Do not assert a bug from the DOM alone. `innerText` applies
  `text-transform`, so a control reads `P.5` and `TEST HARNESS`, not `p.5` and
  `Test Harness` — match on the rendered case or lowercase both sides.
- Do not report a blank thumbnail from a sandbox run as a bug. The proxy relay
  drops requests under load; a *different* asset failing each run is
  saturation, not the site.
- Do not fix by adding a literal. Every fix is a token, or a new token.
- Do not add a config here without adding it to `SCREENS` in `tests/shots.js`.
  A checklist item nobody can photograph is not a check.
