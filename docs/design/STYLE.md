# The eski style rules

The whole of it. If something on a surface disagrees with this file, the file
is right and the surface is a bug.

Implemented in `tokens.css` (scale), `palettes.css` (colour),
`docs/design/final/broadsheet.css` (chrome). Surface-specific shapes stay in
each page's own `<style>`.

---

## 1. Case

Three registers. Nothing else, anywhere.

| What | Case | Example |
|---|---|---|
| **Anything clickable** | UPPERCASE, letterspaced `.12em` | `COPY LINK`, `SEE ALL`, `HOME`, `READING` |
| **Field labels** | UPPERCASE micro type, `.06–.1em` | `BY`, `EXTENT`, `SORT` |
| **Everything else** | Sentence case, as typed | `No comic has a cast yet. An author writes one…` |

**Clickable is uppercase because it is clickable**, not because it is
important. That is the whole signal: if it is in caps and it is not a field
label, you can press it. The site used to have `eskis` beside
`Roles that need a voice` beside `EVERY ESKI ON THE SITE` and no way to tell a
control from a caption without hovering it.

**Two things are never transformed**, because they are somebody's words and
not ours: comic titles, and tags. Also names, handles, and comment bodies.
`text-transform: lowercase` appears nowhere and should never be added — it
forced other people's words into a house voice, and made `eski`, `Eski` and
`ESKI` look identical while being three different strings underneath.

Explainer text and titles are written as sentences. Capital at the start, full
stop at the end.

---

## 2. Colour

**There is no brand colour.** Sage green was one, and it was the wrong choice
for a site whose job is to show other people's artwork — every cover had to sit
inside somebody else's hue. The accent belongs to the reader.

Ten palettes: five on a light ground, five on a dark one, including black and
white. Each is written out in full in `palettes.css`, so a swap is one
attribute on `<html>` and the browser already has every value parsed.

A palette sets exactly these and nothing else:

```
--paper --surface --plate-bg    grounds
--ink --soft-ink --muted --label   text, four steps
--rule --rule-hair --line-1 --line-strong   lines
--accent      counts, the focus ring
--mark --on-mark   the one fill meaning "this is on", and what sits on it
--ui --ui-hover-bg   the colour of clickable things, and their hover box
```

Rules for using them:

- `--mark` is the **only** fill on the page. It means *this one is on*:
  selected, pressed, current, primary. Nothing else is filled.
- `--accent` colours numbers and counts you scan a dense view for, and the
  focus ring. It never fills anything.
- `--ui` is for text you can click. Nothing that is not clickable uses it.
- Art is never tinted, scrimmed or recoloured. **Colour match is gone** — it
  sampled the cover and recoloured the chrome from it, which fought the
  reader's own choice and never looked right.

**One writer.** `palette.js` owns `data-palette` and `data-mode`. Nothing else
writes them. The previous system had seven surfaces setting the theme on load
from their own local flag, so choosing one and navigating anywhere reset it —
which read as "the theme disappears when I leave the profile". If you find
yourself adding a second writer, that is the bug coming back.

---

## 3. Shape

**Does not change between palettes, and is not a setting.**

- `--r: 0`. Square corners. The only round things are genuine discs and
  tracks (`--r-round`, `--r-track`).
- `--bw: 1px`. Hairline rules, everywhere, always. Structure is drawn.
- No shadows. No lift. Nothing floats.

---

## 4. Type

One family: **Jost**. Gnomon survives in exactly one place — the wordmark — and
nowhere else. Headings used to be Gnomon and sat visibly high next to
everything beside them; they are uppercase Jost now.

| Role | Treatment |
|---|---|
| Wordmark | Gnomon 21px, `--ink`, nudged `.09em` down (its outlines sit high in its own line box) |
| Section heading | Jost 13px, 500, uppercase, `.16em` |
| Body | Jost 13.5px, 400 |
| Field label | Jost 11px, uppercase, `.06–.1em`, `--label` |
| Numbers | `font-variant-numeric: tabular-nums`, always |

**Weight**: 500 marks the *one* primary field of a row — the thing you scan
the column for. Everything else in that row is 400 and steps down to `--label`.
A row where two things are bold has not chosen; a row where nothing is bold is
a wall of grey.

---

## 5. Hover

**Colour only. Nothing moves.**

A clickable thing grows a rectangular box behind it: `--ui-hover-bg` as the
ground, `--ui` as the text, over `--t-fast` (160ms). Bare text controls carry
their padding at rest and only the ground appears, so the row never reflows
under the cursor.

No underlines on hover. No transforms. No scale. No shift.

The one exception is the comic card, where the **whole cell** lights up rather
than the button inside it, and the plate's border takes `--ui`. A card is a big
target and its hover should be unmistakable.

---

## 6. Underlines

One, in the whole chrome: the 2px `--mark` under the nav word for the page you
are on, and under the selected tab. It is there because nothing else says where
you are.

A link inside prose may have one. Nothing else does — not on hover, not on a
title, not on a section link.

---

## 7. Layout

- `--wrap: 1280px`, centred. **The header reads it too**, so the wordmark
  starts where the first heading starts and the nav ends where the rule ends.
  A surface with a narrower measure overrides `--wrap`.
- `--row: 19px` — one metadata row, fixed, so columns align down a grid.
- Space is the 4px scale, `--s1` … `--s9`, and this UI lives at the low end.
- Tabs, not stacked sections, when a page has more than three lists.

---

## 8. What this replaced

Kept here so the same ideas do not get re-proposed.

- **Six full themes** (Broadsheet / Press / eski / Light / Pink / Slate) that
  each changed typeface, radius and rule width. Too much — the site stopped
  being one thing, two of them removed the hairlines the layout was built out
  of, and the choice was overwhelming. Replaced by ten accent palettes over
  one fixed shape.
- **Cover-match tint** in the reader.
- **Gnomon on headings.**
- **Sign out in the top bar** — the one destructive control, permanently one
  click from every page. It is in the profile's settings tab now.
