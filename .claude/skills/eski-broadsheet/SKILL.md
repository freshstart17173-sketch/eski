---
name: eski-broadsheet
description: The printed-listings style for eski. Hard vertical rules edge to edge, labels rotated into the gutters, titles centred over their column, credits stacked under art as a plate caption. Near-white ground, near-black rules, sage only as accent. Grounded in Screen Slate and Fonts In Use. Use when styling any eski surface in this direction. Trigger on "broadsheet", "listings", "printed", "ruled columns", "newspaper", or a request to restyle eski as printed matter.
---

# eski-broadsheet

**In one line:** the page is a printed listings sheet, and the rules that divide it are the design.

## The reference

**Screen Slate** (screenslate.com), with **Fonts In Use** (fontsinuse.com) for the archive half.

Screen Slate is a repertory-cinema listings guide. Its whole layout is columns separated by full-height 1px rules, with category and date set vertically in the gutters so metadata never eats the reading column. Titles centre over their column; body text does not. One accent colour, used for labels and links only.

Fonts In Use applies the same logic to an archive: an image, then the credits stacked beneath it as a caption. That is structurally identical to an eski comic with a cast.

**Steal:** full-height rules as the primary structure; rotated marginal labels; caption-under-art credit stacks; centred titles over left-aligned bodies; one accent used only on labels.

**Do not steal:** the hand-drawn doodles, the scrolling marquee band, or centred paragraphs.

## Tokens

```css
--paper:#FCFDFC;             /* near-white, very slightly sage */
--surface:var(--white);
--rule:#141A17;              /* near-black. this is the structural line */
--rule-hair:var(--line-1);   /* secondary, inside a column */
--label:var(--sage-600);     /* rotated gutter labels and eyebrows */
--accent:var(--sage-600);
--ink:var(--sage-900);
--gutter:34px;               /* width of a rotated-label gutter */
```

Dark theme inverts ground and rule (`--paper:var(--void)`, `--rule:#C8D2CC`) and steps `--label` to `--sage-300`.

## Type

- Gnomon for the wordmark and comic titles only, at `--fs-title` and centred over its column. Never at hero scale.
- Jost everywhere else. `--fs-sm` (13.5px) is the working size; captions drop to `--fs-xs`.
- Rotated gutter labels: `--fs-micro`, uppercase, `letter-spacing:.14em`, `writing-mode:vertical-rl`.
- Every number tabular.

## Layout

A page is a row of columns divided by `border-left:1px solid var(--rule)` running the full height of the section — set the section to `display:grid` with equal-height children so the rules actually reach top and bottom.

Each column is: a `--gutter` strip carrying the rotated label, then the content. Titles centre; paragraphs left-align at 62ch max.

Art is followed by its caption stack: title, then byline, then credits, each on its own line, `--fs-xs`, no middots.

## Components

**ruled section** — grid of columns with full-height 1px rules between them. The outermost rules touch the viewport edge.

**gutter label** — rotated 90°, `writing-mode:vertical-rl`, carrying category / chapter / date / status. Always paired with an `aria-label` on the parent so screen readers get it horizontally.

**plate** — art, then the caption stack. The eski equivalent of a catalogue plate. Used for comics, for performers and for scores identically.

**credit line** — `role` in `--label`, person in `--ink`, count right-aligned tabular. Stacked, one per line, no table borders.

**masthead** — wordmark centred, a hard `--rule` beneath it running the full width.

## Rules

- Rules are 1px and near-black. Never 2px, never sage, never a shadow.
- Titles may centre. Paragraphs never centre.
- Metadata goes in the gutter or in the caption, never inline in the title line.
- No cards, no rounded corners, no fills except the accent on a label.
- Vertical scroll only.

## Surfaces

Strongest on comic detail and profile, where credits are the content. Home and browse work. The reader should stay quiet and the studio should not use this at all.
