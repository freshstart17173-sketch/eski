---
name: eski-station
description: The always-live radio-station style for eski. Dark half of the sage ramp everywhere, a pinned live strip under the nav, an irregular mosaic instead of a card grid, 11-12px caps labels, and nothing wasted. Grounded in NTS Radio and Shonen Jump+. Use when styling any eski surface in this direction, and by default for the studio. Trigger on "station", "live", "dense", "mosaic", "dark", "studio", or a request to make eski feel active and high-bandwidth.
---

# eski-station

**In one line:** density reads as activity, and a small platform needs to project activity more than it needs white space.

## The reference

**NTS Radio** (nts.live), with **Shonen Jump+** for information rate.

NTS pins two live channels in a strip directly under the nav, then drops into an irregular photo mosaic — tiles at different sizes and aspect ratios, not a uniform grid — with 11px uppercase labels and a right-hand rail of playable strips. Nothing on the page is decorative and nothing is more than a click from playing.

Shonen Jump+ is the density benchmark: a ranked list, a dated ranking block and a magazine rail all above the fold. Study its information rate; ignore its colour and its shouting.

**Steal:** the pinned live strip; the irregular mosaic; dated and numbered rankings; hairlines on dark; a right rail of playable rows.

**Do not steal:** pure black, the noise texture, or Jump's promotional red banners.

## Tokens

```css
--paper:var(--void);         /* #0C130F, sage-biased, never #000 */
--surface:var(--surf-1);
--surface-2:var(--surf-2);
--rule:var(--line-dark);
--ink:#EAF0EC;
--muted:var(--muted-dark);
--accent:var(--sage-300);
--live:var(--sage-200);      /* the only thing that pulses */
--strip-h:34px;
```

Anything that must be read is `--sage-300` or lighter. `--sage-500` fails on this ground and is banned for text.

## Type

- Jost only. Gnomon for the wordmark and nothing else.
- Working size `--fs-xs` (12px); labels `--fs-micro` (11px) uppercase, `letter-spacing:.1em`.
- Minimum 11px, and 11px only for uppercase labels with a 4.5:1 ratio. Body text never goes below 12px.
- Every number tabular; times, counts and durations are everywhere in this style.

## Layout

Fixed nav, then the pinned `--strip-h` live strip, then content. Content is a mosaic: a CSS grid with `grid-auto-flow:dense` where tiles span 1 or 2 columns and 1 or 2 rows, assigned by a stable rule (chapter count, kudos band) rather than randomly.

A right rail, 300px, carries playable rows and stays on desktop.

## Components

**live strip** — pinned under the nav. Left: what is playing. Centre: what needs a voice this week, as a rotating single line. Right: a mute and a queue toggle. Never taller than `--strip-h`.

**tile** — art, a 1px rule, and a label overlay at the bottom in `--fs-micro`. Tiles vary in span, never in style.

**rail row** — 40px, play triangle, 24px thumb, two lines of text, right-aligned duration. The densest legal row.

**ranking block** — a dated, numbered list. Number in `--accent`, title, byline, count right-aligned. Ten rows, no pagination.

## Rules

- Sage-biased dark, never pure black.
- No text below 12px except uppercase labels.
- Tile spans come from data, never from a random or decorative rule.
- Nothing pinned except the live strip. No second fixed bar.
- Square, hairline, no shadows, no rounded corners, no carousels.

## Surfaces

Default for the studio, where its density is a feature and only authors ever go. Also strong on browse and contribute. Do not use for the reader, which must go quiet, or as the only style on home, where it reads as intimidating to a first-time visitor.
