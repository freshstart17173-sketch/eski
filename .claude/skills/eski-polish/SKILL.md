---
name: eski-polish
description: The eski deep alignment, spacing & density finishing pass — the fit-and-finish discipline applied AFTER a screen or dialog is built/restyled. Enforces consistent font and button sizes, consistent edge/corner insets, true alignment, even hierarchy-aware distribution in grids/lists/rows, and hard density (cut copy that loses utility after a week, cut icons that don't add meaning past their label, cut chrome that isn't separating anything — e.g. tag pills become coloured bold text). Use whenever asked for a polish / alignment / spacing / density / "tighten this up" / fit-and-finish pass on gallery.html (a screen, a dialog, or the whole gallery), or after building a new surface. Load eski-style first for the raw values; this skill is the audit + procedure, not new values.
---

# eski polish — the alignment, spacing & density pass

This is the **finishing discipline**, run after a surface is built or restyled.
`eski-style` owns the *values* (tokens, button archetypes, colour rules) — **load it
first**. This skill owns the *fit and finish*: making every surface precise, evenly
distributed, and dense. It is an **audit + fix procedure**, not a new design language.

The failure mode it fights is the one CLAUDE.md names: "be exacting about alignment,
balance, borders, type hierarchy (size *and* colour), and aspect ratio… no super-tall
buttons, no super-wide bars, nothing wonky." Plus the eski bias toward **density** —
a pro tool a user lives in for hours, not a first-run brochure.

---

## 0. Prime directives

- **This is a RESTYLE + a trim, never a feature edit.** You may change size, spacing,
  alignment, weight, colour, and you may remove **decorative copy, decorative icons, and
  non-separating chrome** (per §4). You may **not** remove a control, field, row, action,
  state, or menu item. If a fix seems to need removing a functional element, stop and ask.
- **Every value comes from a token.** Sizes from `--fs-*`, space from `--s1…--s5`, radius
  `--r`. No ad-hoc px for type or spacing. If you're typing a raw px for a gap or a
  font-size, you're doing it wrong — reach for the token.
- **One value per role.** The same *kind* of thing (a dialog body inset, a list-row gap,
  a section label) uses the **same** token everywhere. Divergence is the bug.
- **Verify by screenshot at 1440, both themes.** Jost renders wrong when squeezed; judge
  at the design canvas width. Every fix is eyeballed light **and** dark before commit.
- **Density is a feature — and it means the words and icons.** When in doubt between
  "explain it" and "trust the user," trust the user. The mental model: a control a daily
  user has **memorized** no longer needs to be a big touch target or maximally scannable —
  so it **shrinks, and the content gets the reclaimed space.** Oversized filter pills, icon
  segmented switchers, and always-visible secondary toggles are the anti-pattern; the files,
  messages, and data are what deserve the room. Copy and chrome that help on day one become
  noise by week two — cut to the signal.
- **One control system.** Every button **and every dropdown** uses the `.btn` archetypes
  (or `.iconbtn`). There is no second control style — no bespoke bordered "select" pills, no
  custom segmented switchers, no one-off chips. A dropdown is a `.btn` (colour-change) with a
  trailing chevron; its options are a `.menu`. Find a control that isn't a `.btn`/`.iconbtn`/
  `.field`? Convert it. (A full-width **form input** inside a dialog is the one exception —
  that's a `.field`.)

---

## 1. The seven enforcement rules

Audit every surface against these. Each has a **test** (how to spot the violation) and a
**fix**.

### 1. Consistent font sizes
- **Test:** any `font-size` not one of `--fs-mi (11) / --fs-xs (12) / --fs-sm (13) /
  --fs (14.5) / --fs-lg (16) / --fs-xl (20)`. Two elements with the **same role** (e.g.
  two dialog labels, two card titles) rendering at different sizes.
- **Fix:** snap to the nearest token; make same-role text identical. Hierarchy is carried
  by **size + colour together** (`--ink` primary, `--soft` secondary, `--muted`
  tertiary/labels) — never by a bespoke px value. A label is `--fs-xs`/`--muted`; body is
  `--fs-sm`/`--soft`; a title is `--fs`/`--fs-lg` `--ink`.

### 2. One button system, consistent sizes
- **Test:** a control that isn't one of the archetypes — a bordered "select" pill
  (`.selbtn`), an icon **segmented switcher** (`.vseg`-style), a one-off filter chip at a
  bespoke size; a button with one-off `padding`/`height`; an icon button that isn't 26px
  (`.iconbtn`); a super-tall or super-wide button; two sibling controls at different heights.
- **Fix:** **every button and dropdown is a `.btn` archetype** (`.btn`, `.btn.sm`,
  `.iconbtn`, `.btn.primary/ghost/outline/danger`). A **dropdown = `.btn` + a trailing
  chevron**, options in a `.menu` — not a bordered pill. A **segmented switcher of memorized
  options → a compact text dropdown** (`Grid ▾`), which is denser and scales (add options
  without widening). Toggle chips shrink to `.btn` metrics. Controls in one cluster share a
  height and gap. A control's box shrinks to its label — never stretch to fill unless it's a
  deliberate full-width primary. (A full-width dialog form input stays a `.field`.)

### 3. Consistent distance to corners & edges
- **Test:** the padding from a pane / card / dialog / row edge differs between two
  instances of the same container; content that kisses an edge on one side and floats on
  the other; a dialog body inset that doesn't match its header/footer inset.
- **Fix:** pick the canonical inset for that container type (dialog body `--s4`, menu rows
  the menu's own padding, card `--s3`/`--s4`) and apply it uniformly. Symmetric unless
  there's a reason. Hairlines stay inset (`--hair-inset`), never full-bleed.

### 4. Proper alignment
- **Test:** left edges of stacked items not sharing an x; a value column that's ragged;
  an icon and its label off-baseline; a title and a control not centred to the same line;
  numbers not aligned. Screenshot and look down each edge — it should be a straight ruler.
- **Fix:** share a single left inset down a column; right-align metadata values to the
  panel edge (are.na rows); vertically centre icon+label; use `tabular-nums` for times/
  sizes. Optical alignment beats mathematical when they disagree (icons often need a nudge).

### 5. Proper distribution in grids / lists / rows (hierarchy-aware)
- **Test:** uneven gaps between items in a row/grid/list; the same gap used between items
  *within* a group and *between* groups (flattening the hierarchy); a grid whose gutter ≠
  its row gap without reason.
- **Fix:** one gap token per context, applied evenly (grid `gap:var(--s4/--s5)`; list rows
  a consistent rhythm). **Encode hierarchy in space:** items in the same group sit closer
  (`--s1/--s2`); groups separate by a larger step (`--s4/--s5`) or a background step — not
  by a random in-between value. Higher-in-hierarchy elements get more breathing room around
  them, not less.

### 6. Density — cut unnecessary copy
- **Test:** helper subtext under a field explaining the obvious ("Files posted here land
  in this folder"); a "how it works" blurb on a dialog; a hint that's useful the first
  time and noise the hundredth; label + sublabel that say the same thing; a sentence where
  a phrase works.
- **Fix:** **cut any copy that loses utility after a week of use.** Keep: the one required
  choice's consequence, a genuinely non-obvious warning (destructive, billing, "can't be
  undone"), first-run onboarding (once). Cut: restating what the control already says,
  reassurance, and tutorial voice. Tighten what stays to the shortest phrase that carries
  it. A pro tool is terse.

### 7. Density — cut unnecessary icons
- **Test:** a leading icon on a text button where the **word alone** already says it
  ("Cancel", "Save", "Done", "Copy link" with the word present); duplicate icons; a
  decorative icon that carries no meaning.
- **Fix:** remove the icon when the label is self-sufficient. **Keep an icon when it IS the
  affordance** (icon-only button — close, more, star), when it **speeds scanning** in a
  dense list (file-type glyphs, nav rail, channel # / voice), or when it disambiguates two
  similar labels. Default for a labelled secondary/tertiary text button: **no icon.** The
  primary CTA may keep one if it aids recognition; Cancel/ghost never needs one.

---

## 2. Cut unnecessary UI elements (chrome)

Beyond copy and icons, remove chrome that isn't doing separating work. **Surfaces separate
by background step, not by boxes/borders/dividers** (eski-style §0). So:

- **Tags → coloured bold text, not pills.** The canonical example: a content tag ("drums",
  "142bpm") loses its `--tagbg` background and becomes **bold text** in a step-down colour
  (`--soft`, or `--muted` for the quietest). The word carries it; the grey pill was chrome.
  (This changed the tag treatment — update `eski-style` and CANON when you apply it so the
  value stays canonical.)
- **Drop resting borders** that aren't a field affordance. The only element with a resting
  border is an interactive **field** (`--line2`). A card/chip/row separates by sitting on a
  different background step — not a `1px solid`.
- **Drop redundant badges/dots/dividers.** A full-width divider between two rows that
  already differ by background step is noise. A count badge duplicating a number already in
  the label is noise. The round member colour-dot in a name chip is already killed (CANON
  #26) — colour reads via the text.
- **Collapse nested boxes.** A box inside a box inside a pane usually wants to be one
  background step, not three borders.

- **Tuck away rarely-used secondary toggles.** A control a user touches once in a while
  (e.g. *Show hidden*) does not earn a full labelled slot in the main control row — make it a
  small `.iconbtn` tucked at an edge, title-tooltip'd. The frequent controls stay legible;
  the rare one gets out of the way.
- **Balance the toolbar/row.** Search grows to fill; the compact controls sit at equal height
  and even gap; the primary action anchors one end. No lone oversized control throwing the
  row off; no ragged right edge. A control row is a composed line, not a pile.

**The test for any element:** *if I delete it, does the user lose information or an action?*
If no — it's chrome; cut it. If yes — it stays. **The test for its size:** *once the user has
this memorized, does it still need to be this big?* If no — shrink it, give the space to the
content.

---

## 3. The procedure (per surface)

Work one screen / dialog at a time so a regression is easy to bisect.

1. **Screenshot** the surface at **1440**, both themes (see §5). Look at it cold.
2. **Inventory the elements** first — list every control/field/row/action. This is the
   "do not delete" set for the whole pass.
3. **Audit** top-to-bottom against §1's seven rules, then §2's chrome list. Write the hit
   list before touching code.
4. **Fix in place.** Edit the selector **where it already lives** — never add a second
   rule nearby (source-order bugs are a documented eski failure). If a generic class is
   shared across surfaces, scope it (`.arena …`, `.appshell …`).
5. **Re-screenshot** both themes. Compare against the pre-shot: every functional element
   from step 2 still present; the violations gone; nothing new blended, clipped, or
   misaligned.
6. **Reconcile docs.** Any value or rule you changed for real (e.g. tags lose their
   background) updates **`eski-style`** (the value source) and **CANON** (if behaviour/
   registry) so the next pass doesn't undo it.

Do the cheap global wins first (a token snapped in one CSS rule shifts every instance),
then the per-surface markup trims.

---

## 4. Keep / cut quick reference

| Element | Keep when… | Cut when… |
|---|---|---|
| Leading icon on a text button | icon-only control; dense-scan list; disambiguates | the label word already says it (Cancel, Save, Done, Copy link) |
| Helper subtext | destructive/billing consequence; genuinely non-obvious; first-run once | restates the control; reassurance; tutorial voice; useful once, noise forever |
| Tag pill background | — (cut it) | always → bold coloured text |
| Resting border | it's a field (`--line2`) | anything else — use a background step |
| Divider / hairline | separates two things on the **same** background step | the rows already differ by step |
| Count badge / dot | adds info not already shown | duplicates a number/state already visible |
| A control's style | it's a `.btn`/`.iconbtn`/`.field` | it's a bespoke pill/segmented switcher/chip → convert to `.btn` |
| Segmented switcher | 2 options, both always worth showing | ≥3 or memorized options → compact text dropdown (`Grid ▾`) |
| A labelled toolbar toggle | frequent, needs its label | rare (Show hidden) → small tucked `.iconbtn` |

---

## 5. Rendering (the how)

`gallery.html?app=1&theme=<light|dark>#<screen>` renders one live screen; no query = the
catalog. Screenshot with the pre-installed Chromium via Playwright:

```
node -e "const {chromium}=require('/opt/node22/lib/node_modules/playwright'); ..."
executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
viewport: { width: 1440, height: 900 }
```

For a dialog/menu that only shows on interaction, reveal it in `page.evaluate` (unset its
`hidden`) or click its real entry point, then screenshot the element. Always shoot **both
themes**; check for blended surfaces, invisible dark-mode text, ragged edges, and any
element that vanished. Watch the console for JS errors on load.

### 5.1 Measurement overlay — render the numbers, don't eyeball the pixels

The eye misses a 14-vs-16px gap or a 2px x-drift. So **don't trust the naked screenshot for
spacing** — overlay the real values and screenshot *that*. `references/measure-overlay.js`
injects numeric alignment / spacing / distribution labels **on top of every element** in a
container:

- **`x<n>`** — each child's left offset from the container's content box. Equal numbers down
  a column = aligned; one stray value = the misalignment, named in pixels.
- **gap number** (green if it matches the group's most-common gap, **red if it doesn't**) —
  so uneven distribution in a row/grid/list lights up red instantly.
- **`pl/pr/pt/pb`** — the container's own paddings (the distance to its edges).
- **`W×H`** on each child (catches inconsistent button/card sizes); **`e<n>`** edge insets
  with `{edges:1}`.

Workflow per surface:

```
// 1. render the surface (or reveal the dialog), then:
await page.addScriptTag({ path: '.claude/skills/eski-polish/references/measure-overlay.js' });
await page.evaluate(() => { __pm('.umodal .ubody'); __pm('.arena .meta', {edges:1}); /* each grid/list/row/dialog body */ });
await page.screenshot({ path: 'measured.png' });
```

Then **read the numbers against the token scale** — every gap and padding must be a `--s`
value (**4 / 8 / 12 / 16 / 24**). A `13`, `15`, `18`, `22` is a fumble: snap it to a token.
Every red gap is uneven distribution: even it out. Any `x` that breaks a column is a
misalignment: share the inset. Run the overlay on **every** grid, list, row, dialog body,
toolbar, metadata block, and button cluster on the surface — this is how the pass catches the
smallest fumbles instead of only the obvious ones. `__pmClear()` removes the overlay before a
clean "after" shot.

---

## 6. Guardrails (do not)

- **Do not delete a functional element** to "clean up" — only decorative copy/icons/chrome
  per §1.6, §1.7, §2. When unsure whether copy/an icon is load-bearing, keep it and flag it.
- **Do not invent values.** Every size/space is a token; if a needed step doesn't exist,
  that's an eski-style decision, not a local literal.
- **Do not define a selector twice.** Edit where it lives; scope shared generic names.
- **Do not break dark mode.** No pure-black text on dark; scrims darken in both themes;
  re-verify contrast after any colour/weight change.
- **Do not restyle the v2 voice theatre** or other explicitly-deferred chrome for the beta.
- **A structural removal (a whole element/section) needs owner sign-off** — density cuts
  are copy, icons, and non-separating chrome only.
