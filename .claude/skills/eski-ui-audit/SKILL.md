---
name: eski-ui-audit
description: Nitpick every eski surface from screenshots, across every configuration — surface x state x theme x viewport — against the rules in docs/design/STYLE.md and the eski-pivot skill. Catches the class of bug that only exists in a combination, like a hover that resolves to the colour it already was, a pane with no width rule that only collapses on one content kind, or a control still in lowercase. Use before shipping any visual change, after any change to pivot.css or palettes.css, when the user reports something "looks off" or "irks" them, or when asked to audit, review, check or screenshot the UI. Trigger on "audit", "nitpick", "check the UI", "does this look right", "screenshot every screen", "alignment", "theme bug", "looks off".
---

# eski-ui-audit

**In one line:** a surface at rest in the default theme is the easy half; every
bug that survives review needs a surface *and* a state *and* a theme (or a
content kind) at once.

## Why this exists

Real bugs from this repo's own history, none visible in a screenshot of a page
at rest:

- `.medial` (the detail overlay's media pane) had no CSS width rule at all —
  ported from the mockup without it. Invisible on an image post, because the
  `<img>` still filled available space by its own aspect ratio; only visible
  on **audio**, where nothing but a 76px icon was left to hold the pane open.
- The audio play button was a circle that looked exactly like a play control
  and did nothing — the real `<audio>` element sat underneath it, silently
  handling clicks on itself. Visible only by actually clicking it, never by
  looking at it.
- The version dropdown's numbering came from `findIndex` on a newest-first
  array, so adding a second version relabelled the *original* from v1 to v2
  while the new one became v1. Invisible with one version; wrong the moment
  a second existed.

None of these are subtle once you are looking at the right picture, or trying
the right interaction. The whole job is generating the right pictures *and*
actually clicking things, not just looking at them at rest.

## Run it

```
node tests/shots.js                       # every config, both themes, 2 viewports
node tests/shots.js --grid                # + the alignment overlay
node tests/shots.js --only=modal,upload    # one config, while chasing something
BASE=http://localhost:8940 node tests/shots.js
```

**`tests/shots.js` targets pre-pivot routes and selectors and needs a rewrite
before this actually runs against `index.html`/`profile.html`/`admin.html`**
— see ROADMAP.md's test-suite item. Until then, treat the matrix below as the
shot list to update it against, and do the sweep by hand (`computer`
screenshots, or `html2canvas` per the eski-pivot skill's verification note)
rather than trusting the script to already cover it.

Shots land in `docs/design/shots/`, named `<config>-<theme>-<viewport>.png`.
**Read them.** The script only takes pictures; it asserts nothing except
alignment near-misses. The looking is the skill.

## The matrix

**Surfaces at rest** — `index` (the home feed), `profile` (own + someone
else's, at `/u/<handle>`), `admin` (moderation queue, deliberately plain, not
held to the pivot's own rules — see its own file header).

**States** — a surface plus something open over or instead of it:

| Config | What it proves |
|---|---|
| `detail-image` / `-video` / `-audio` / `-text` / `-other` / `-combination` | Six different `mediaPane()` branches, each its own layout — a fix to one kind's pane silently breaking another is the `.medial` bug's whole shape |
| `upload` | The upload modal: dropzone, filmstrip, per-kind form fields |
| `comments` | The thread tab, reply nesting, the report link next to reply |
| `tags-editing` | The inline tag input as the poster — type, enter, backspace |
| `settings` | profile.html's own tab: live inputs, the theme toggle, storage-used |
| `signed-out` | Home/Profile/Upload hidden from the nav, the sign-in prompt on any gated action |
| `report-flow` | The styled prompt from `Pivot.reportFlow()` — work, comment, and profile |

**Themes** — both of them: `light`, `dark`. There is no hue axis any more
(cut 2026-08-15, see `palettes.css`'s own header) — a theme bug now is either
present in both or it isn't, there's no eighteen-way sweep to reason about.

**Viewports** — 1440×900 and 390×844.

## What to check, in order

Go in this order. Colour first, because a colour bug is visible in a
thumbnail and a spacing bug is not.

### 1. Colour that does not belong to the theme

The single highest-yield check. Look at every pixel that is not artwork and
ask **which token is that?**

- **Scrims and overlays.** Any dim over the page must be `--scrim`, defined
  per-theme in `palettes.css` — never a literal `rgba()`.
- **A colour that isn't sage.** The only accent in this system is sage
  (`#5B7A6B` light / `#8AA89A` dark). Anything else — a stray hex, a browser-
  default blue focus ring, an unstyled `<select>` popup — is a second hue
  that escaped, or (as happened this session) a browser sitting on a stale
  cached copy of an old palette. Rule out the cache before chasing the code.
- **The video/audio player's white-on-media chrome is the one deliberate
  exception** — `.vplay-overlay`/`.vplayer-bar` use literal white, same
  reasoning as `.carrow`/`.ccount`: it has to read on arbitrary footage, not
  the page's own theme.
- **Art is never tinted.** No scrim, no recolour over a cover or a waveform.

### 2. Case

Every visible string is in exactly one of three registers (`STYLE.md` §1):

- **Clickable → UPPERCASE**, letterspaced. If it is in caps and it is not a
  field label, you can press it. **The inverse is the test that catches
  things**: find something you can press that is not in caps.
- **Field labels → uppercase micro type.**
- **Everything else → sentence case.**

Never transformed: post titles, tags, names, handles, comment bodies,
captions.

### 3. Hover, and the no-op hover

For every interactive thing, hover it and look. Then ask: **would this hover
be visible if the two tokens happened to be equal?** Per the eski-pivot
skill: hover is a flat `--plate-bg` background swap, full stop, with exactly
one exception (`.btnline.filled` goes to `--accent`) and one thing that is
*never* a hover at all — `.actbtn.like.on`'s ruby-red only ever comes from a
click. If you see a hover rule reference the like colours, that's the bug
the skill was written to catch.

Also check for controls with **no** hover at all — `.gcard`, `.fthumb` and
others had none until this session; a newly-added control is the likely
next one to be missing it.

### 4. Alignment

Run with `--grid` once `tests/shots.js` is rewritten for the pivot pages.
Until then: the wordmark starts where the wrap starts; the nav cluster stays
flush right regardless of how many children `platform.js` appends after it
(never `justify-content:space-between` — see the eski-pivot skill); the
detail overlay's media pane is exactly 58% of the card width, the info
column the other 42%.

### 5. Icons

Every icon must actually render — check the SVG path exists in `pivot.js`
(`PLAY_PATH`, `PAUSE_PATH`, `CHECK`, etc). Icon-only buttons need an
`aria-label`.

### 6. Empty, loading and error states

Shoot `signed-out`, and a feed/profile with nothing published yet. An empty
state is a sentence, not a blank region. An error names its `ESK-####`. A
count of zero still renders, so the row does not resize when it becomes one.

### 7. Phone

- Nothing scrolls sideways. Check `document.scrollingElement.scrollWidth`
  against the viewport, not by eye.
- Touch targets ≥ 40px.
- The detail overlay's tabs and action buttons still fit without overflow at
  390px.

## Reporting a finding

Name the picture, the token, and the rule. Not "the player looks wrong" but:

> `detail-audio-dark-desktop.png` — `.player-track`'s background is
> `var(--surface)`, the same colour as `.medial`'s own background, so the
> track is invisible against the pane. Should be `var(--plate-bg)`.

If a finding is a rule the style guide does not yet have, say so and propose
the rule — then write it into `docs/design/STYLE.md` or the eski-pivot
skill, because the next audit needs to be able to check it.

## Do not

- Do not assert a bug from the DOM alone. `innerText` applies
  `text-transform`, so a control reads `HOME` not `Home` — match on the
  rendered case or lowercase both sides.
- Do not report a blank thumbnail from a sandbox run as a bug. A proxy relay
  dropping requests under load looks like a *different* asset failing each
  run, which is saturation, not the site.
- Do not fix by adding a literal. Every fix is a token, or a new token.
- Do not trust that a page matches the mockup because a screenshot looks
  close — measure computed styles when it matters (see the eski-pivot
  skill's own Verification section).
