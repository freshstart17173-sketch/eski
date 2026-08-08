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
inside somebody else's hue. The colour belongs to the reader.

**A theme is a hue and a treatment.** Six hues (neutral, green, blue, red,
amber, pink) across three treatments:

| Treatment | What it is |
|---|---|
| `light` | Near-white ground, near-black text, the hue as the accent |
| `mono`  | The hue **is** the page — ground, text and accent are one colour at different values. The old sage look. |
| `dark`  | Near-black ground, near-white text, the hue as the accent |

Eighteen in all, each written out in full in `palettes.css`, so a swap is one
attribute on `<html>` with everything already parsed: instant, and it cannot
flash a half-applied state.

**The picker is in the footer of every page**, and nowhere else — a second one
in settings meant two controls that could disagree about which was
authoritative. The word THEME is the toggle; the chips unroll to the right of
it on the same line.

**A chip is a miniature of the page it makes** — ground, rule, a heading bar, a
line of body text and the accent, drawn in its own theme. The first version was
a ground with an accent block on it, which said "mostly green" for a theme that
is a dark page with green type on it. There are no LIGHT/MONO/DARK labels: the
treatment is the thing you can already see, and naming it would be captioning a
picture with what the picture is.

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

**One writer.** `palette.js` owns `data-theme`, `data-mode` and `data-dark`. Nothing else
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
| Wordmark | Gnomon 21px, `--wordmark`, nudged `.18em` down onto its **bounding-box** centre (its outlines sit high in its own line box). One colour throughout, including the `!` |
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
- **Cover-match tint** in the reader. It sampled the cover and recoloured the
  chrome from it, which fought whatever theme the reader had chosen.
- **Gnomon on headings.**
- **Ten flat palettes** (one accent over a light or dark ground). The chips
  could not honestly show a monochrome theme, because "ground + accent block"
  is not what a monochrome page looks like. Replaced by hue × treatment.
- **Sign out in the top bar** — the one destructive control, permanently one
  click from every page. It is in the profile's settings tab now.


---

## 9. What a comic's state means

Not styling, but it drives what the profile and the studio show, so it belongs
somewhere findable.

| State | Who sees it | Editable | Can become |
|---|---|---|---|
| `draft` | the owner | **yes**, in the studio | `published` |
| `published` | everyone | no | `private`, deleted |
| `private` | the owner | no | `published`, deleted |

**Publishing is one way.** A published comic can never go back to being a
draft. By then other people have voiced and scored it, and a draft is editable
— so returning one to draft would let an author re-cut a comic underneath the
people who contributed to it. The database enforces this with a trigger, not
the interface.

`unpublish` is gone as a word and as an action. The thing it used to do —
return a comic to `draft` — is exactly what must not happen. **Make private**
is what it is now.

A draft is therefore only ever a comic that has **never** been published.

---

## 10. What a profile shows a stranger

| Tab | Visible to |
|---|---|
| Reading, Contributions, Published | everyone |
| Shelf | the owner, plus everyone **if** `profiles.shelf_public` |
| Read, Private, Drafts, Settings | the owner only |

What you have finished and what you have not shown anyone are never public and
have no setting. The shelf is the one where it is a real question — some people
want it read as a recommendation, some as a private queue.

**Unpublish/private and delete appear on the profile and nowhere else**, and
both ask first in a dialog that names what goes with it. The old flow acted
immediately and reported afterwards in a toast, which is the wrong order.
