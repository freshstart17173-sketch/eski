# The eski style rules

The whole of it, for the pivot (`index.html`, `profile.html`, `onboarding.html`
— everything built on `pivot.css`/`pivot.js`). If something on one of those
surfaces disagrees with this file, the file is right and the surface is a bug.

Implemented in `tokens.css` (scale), `palettes.css` (colour), `pivot.css`
(the pivot's own chrome — buttons, cards, the detail overlay, the player).
The eski-pivot skill (`.claude/skills/eski-pivot/SKILL.md`) has the
component-level detail this file doesn't try to duplicate; read that one
when you're building something new in `index.html`/`profile.html`/`pivot.css`.

**`legal.html` is the one surface still on the old system** — it loads
`docs/design/final/broadsheet.css` and still uses Gnomon for its own
headings. `admin.html` is deliberately plain and isn't held to this file
either — see its own header comment. Neither is covered below.

---

## 1. Case

Three registers. Nothing else, anywhere.

| What | Case | Example |
|---|---|---|
| **Anything clickable** | UPPERCASE, letterspaced `.06–.12em` | `HOME`, `UPLOAD`, `MAKE PRIVATE` |
| **Field labels** | UPPERCASE micro type, `.06–.1em` | `HANDLE`, `BIO`, `SORT` |
| **Everything else** | Sentence case, as typed | `Nothing published yet.` |

**Clickable is uppercase because it is clickable**, not because it is
important. That is the whole signal: if it is in caps and it is not a field
label, you can press it.

**Never transformed**, because they are somebody's words and not ours: post
titles and captions, tags, names, handles, and comment bodies.
`text-transform: lowercase` appears nowhere and should never be added — it
forces other people's words into a house voice.

---

## 2. Colour

**eski has a brand colour: sage.** "The colour belongs to the reader" was the
comics-era premise, and it produced a six-hue/three-treatment picker —
eighteen themes, written out in full in `palettes.css` — that outlived the
product direction it was built for. The pivot has a real, reviewed accent
(sage, `#5B7A6B` light / `#8AA89A` dark, settled in `artboard.html`), so
"which hue" stopped being a decision a reader needed to make, and the picker
became old chrome quietly running under the new product: the exact shape of
bug where a stray pick from an eighteen-swatch footer control looks, from a
signed-in visitor's side, indistinguishable from something actually broken.

**A theme is now just a ground: `light` or `dark`.** Two, not eighteen, both
sage. Still one attribute on `<html>` with everything already parsed: instant,
cannot flash a half-applied state.

**The picker is in profile.html's Settings tab.**

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
- Art is never tinted, scrimmed or recoloured — not even a generated
  waveform cover, which bakes in a fixed sage rather than reading a live
  theme token (it's a generated asset, not chrome; see `generateWaveform()`
  in `pivot.js`).

**One writer.** `palette.js` owns `data-theme` (`light` or `dark`). Nothing
else writes it. The system this replaced had seven surfaces setting the
theme on load from their own local flag, so choosing one and navigating
anywhere reset it — which read as "the theme disappears when I leave the
profile."

---

## 3. Shape

**Does not change between palettes, and is not a setting.**

- `--pv-r: 2px` (`pivot.css`) is the pivot's own corner radius — chrome
  only. Media (`.gbox`, `.fillmedia`) stays hard `0` via its own rules, not
  a shared radius token. This is deliberately *not* `tokens.css`'s `--r: 0`
  (the site's older, fully-square token, still what `legal.html` uses) —
  "no rounded corners" was the pivot's opening instruction, but the
  reviewed mockup itself settled on a barely-visible 2px, measured off
  `artboard.html`, and that measurement won.
- `--bw: 1px`. Hairline rules.
- No shadows on flat chrome. The detail overlay's own card
  (`.pv-card`) and dropdowns are the exception — they float over the page,
  so they get a real drop shadow to read as raised.

---

## 4. Type

**Jost, everywhere in the pivot, including the wordmark.** This was a direct
correction (2026-08-15): Gnomon declares a baseline 0.26em above where its
ink actually sits, so every use of it needed a `translateY()` correction
term, and that term was wrong often enough (measurably: 3px off the nav
row's own centreline) that it wasn't worth the inconsistency it bought.
Gnomon survives only on `legal.html`, which is still on the pre-pivot system.

| Role | Treatment |
|---|---|
| Wordmark | Jost 700, `.wordmark` in `pivot.css`, plain `--ink` (not the accent) |
| Section heading | Jost, uppercase, letterspaced |
| Body | Jost 15px, 400 |
| Field label | Jost 11px, uppercase, `.06–.1em`, `--muted` |
| Numbers | `font-variant-numeric: tabular-nums`, always — timecodes, byte counts, bitrates |

---

## 5. Hover

**A flat background swap. Nothing moves.**

`--plate-bg` as the ground, 160ms, full stop — that's the whole rule for
every pivot control (`.chip`, `.btnline`, `.gcard`, `.actbtn`, `.tagchip`,
the player's controls, all of it). Two named exceptions, and only two:

- `.btnline.filled` (a solid-ink button — Upload, Publish) goes to
  `--accent` on hover instead of `--plate-bg`.
- `.actbtn.like.on`'s ruby red (`--like-bg`/`--like-ink`) is a **click**
  state, never a hover — if a hover rule ever references those tokens,
  that's the bug the eski-pivot skill was written to catch.

No underlines on hover, no transforms, no scale, no shift. The one control
where the *whole cell* lights up rather than a button inside it is `.gcard`
— a feed card is a big target, and its hover (the box background plus the
caption darkening) should be unmistakable across its full area.

---

## 6. Underlines

One, in the whole chrome: 2px `--ink` under the nav word for the page you
are on, and under the selected tab (`.navlink.active`, `.dtab.active`). It's
there because nothing else says where you are.

Nothing else gets one — not on hover, not on a title, not on a caption.

---

## 7. Layout

- `--wrap: 1280px`, centred. The header reads it too, so the wordmark starts
  where the wrap starts and the nav cluster ends where it ends.
- Space is the 4px scale, `--s1` … `--s9`, and this UI lives at the low end.
- The nav cluster (`nav`, then whatever `platform.js` appends after it) is
  `margin-left:auto` on `nav`, never `justify-content:space-between` on the
  header — see the eski-pivot skill for why that distinction matters the
  moment a visitor is signed out.

---

## 8. What a work's status means

Not styling, but it drives what the feed and profile show, so it belongs
somewhere findable.

| Status | Who sees it | Can become |
|---|---|---|
| `draft` | the owner (no upload path currently creates one — the upload flow always publishes directly) | `published` |
| `published` | everyone | `private`, deleted |
| `private` | the owner | `published`, deleted |

**Publishing is one way.** A published work can never go back to `draft` —
by then other people may have liked, commented on, or built a collection
around it. `post_status_guard()` in `schema-clean.sql` enforces this as a
trigger, not the interface. "Make private" is the only walk-back there is.

**Editing a published post's text is not a feature** (removed 2026-08-15,
a deliberate product decision, not a gap) — adding a version is the
supported way to change what's published, and only the original poster may
add one (`works_version_owner_guard()`, also a trigger).

---

## 9. What a profile shows a stranger

| Tab | Visible to |
|---|---|
| Posts | everyone (published only, unless you're viewing your own — then private too) |
| Saved, Settings | the owner only |

That's the whole tab bar — `profile.html` doesn't have a Reading/
Contributions/Shelf split the way the comics-era product did; a "post" is
whatever kind it is, and Posts is Posts.

**Make private and delete live in the detail overlay's own burger menu**
(poster only), not on the profile grid — and both ask first, through
`Pivot.openConfirm()`, never the browser's native `confirm()`.
