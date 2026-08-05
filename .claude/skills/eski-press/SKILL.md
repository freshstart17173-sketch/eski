---
name: eski-press
description: The combined eski house style, assembled from choices made surface by surface. Near-white ground with near-black vertical rules, flat sage colour fields behind every cover, wordmark-only Gnomon, three-word navigation, right-aligned tabular metadata, a cover-tinted reader, and no second hue: the one emphasis per screen is a solid near-black fill in a page otherwise made of hairlines. Draws on Screen Slate, Breakdown Press, Standards Manual and Le Cinema Club. This is the default for all eski surfaces unless a single-direction skill is named. Trigger on "house style", "the combined style", "eski-press", "restyle eski", or any eski design work with no direction specified.
---

# eski-press

**In one line:** a printed catalogue whose plates are colour fields, set in Jost, ruled in near-black, and marked once per screen with the only solid fill on the page.

This is the house style. It is assembled, not borrowed whole: the structure comes from Screen Slate, the plates from Breakdown Press, the chrome and the accent discipline from Standards Manual, and the reader from Le Cinéma Club. Where those four disagreed, a choice was made and is recorded below.

## Tokens

```css
--paper:#FCFDFC;              /* near-white, very slightly sage */
--paper-2:var(--paper-1);
--surface:var(--white);

--rule:#141A17;               /* near-black. structural, 1px, vertical and horizontal */
--rule-hair:var(--line-1);    /* secondary, inside a column only */

--ink:var(--sage-900);
--soft-ink:#45544D;
--muted:#62746B;

--accent:var(--sage-700);     /* link hover, quiet emphasis */
--mark:#141A17;               /* the one state mark. see the accent budget below. */

/* the six legal cover fields */
--field-1:var(--sage-200); --field-2:var(--sage-300); --field-3:var(--sage-400);
--field-4:var(--sage-500); --field-5:var(--sage-700); --field-6:var(--sage-800);
--field-pad:clamp(14px,2.4vw,28px);

--gutter:30px;                /* rotated-label strip, used sparingly */
```

Dark theme: `--paper:var(--void)`, `--rule:#C8D2CC`, `--ink:#EAF0EC`, `--mark:#EAF0EC`, `--accent:var(--sage-300)`. The mark stays the lightest thing on the page rather than the darkest.

## The accent budget

**One mark per screen, and it is a solid fill, not a colour.** Every boundary on an eski page is a 1px hairline, so a single filled block is already the loudest thing on screen. That contrast is the emphasis system; a second hue is not needed to produce it.

Legal uses:
- The exclamation in the wordmark.
- Exactly one state marker per screen: the thing that is playing, the row that is selected, or the one call to action.
- Link *hover*, at `--accent` (sage-700).

**Links are not marked.** They are `--ink` with a `--rule-hair` underline and take `--accent` only on hover. This matters more than it sounds: an eski page is mostly credits, so every performer and every score is a link, and emphasising them all destroys the one-mark rule.

**No second hue.** A brighter accent was tried against the sage ramp and read as a clash rather than a pop — sage is a desaturated green and almost any saturated hue fights it. If a true accent hue is ever wanted, it needs a black-and-white ground to sit against, not this one, and that is a different style.

Illegal: a second solid fill visible at the same time; a fill larger than `--ctl` height or a table row; a mark on any `--field-*` ground. Status colour stays sage and the studio's existing amber.

## Type

- **Gnomon appears in the wordmark and nowhere else.** No display type on any surface, including comic titles.
- Jost carries everything. Working size `--fs-sm` (13.5px); running prose `--fs` (15px) at 62ch.
- Section labels: `--fs-micro`, uppercase, `letter-spacing:.12em`, `--muted`.
- **Every number is tabular and right-aligned.** Pages, chapters, durations, kudos, vouches, dates.
- Comic titles: Jost 500, `--fs-lg`. Hierarchy comes from weight and position, never from a second face.

## Structure

Two devices, and only two:

1. **Near-black rules.** 1px, `--rule`. Vertical rules run the full height of their section — set the section to `display:grid` so children stretch and the rules actually reach top and bottom. Horizontal rules separate rows and cap sections.
2. **Flat colour fields.** Only ever behind a cover, one cover per field, chosen by sampling the artwork's lightness and snapping to the nearest of the six sage steps, with a 12% contrast floor so a cover never dissolves into its ground. Store the step on the comic row; never recompute per render.

No third device. No cards, no shadows, no rounded corners, no fills beyond fields and the one accent mark.

## Navigation

Three or four words, lowercase, `--fs-sm`, in a top strip with a near-black rule under it. `browse · shelf · studio` signed out becomes `browse · shelf · studio · you` signed in. No icons, no sidebar, no hamburger above 640px.

**Nothing is pinned.** No live strip, no persistent player bar, no sticky footer. Chrome stays silent; status lives on the page it belongs to.

## Metadata

Right-aligned tabular columns, always. A row is text left, numbers right, with the near-black rule beneath it. Never inline middots, never rotated into the gutter except on the comic detail page where a single vertical chapter label is allowed.

Cast status is a number too: `3 of 4 voiced` beats a badge.

## The reader is the exception

The reader keeps its cover-derived tint — `--hue` and `--tintsat` recoloured live from the cover art, as `read.html` already does. It is the one surface where the ground changes identity per comic, because the reader's job is to disappear into the work rather than to look like the site.

Everything else still holds there: no display type, tabular numbers, square corners, one mark maximum.

## Bans

- Drop shadows and rounded corners. Depth is a change of ground plus a hairline. Round survives only on a disc or a track.
- Carousels and horizontal scroll. Vertical only; nothing important hides off the right edge.
- Cards with padding on four sides. Boundaries are rules and fields.
- A second display face, or Gnomon anywhere but the wordmark.
- More than one solid mark per screen, and any second brand hue.

## Surfaces

All six core pages: home, browse, comic detail, reader, profile, studio. The studio may raise density and drop to the dark half of the ramp, but keeps every rule above — including wordmark-only Gnomon and the one-mark accent budget.
