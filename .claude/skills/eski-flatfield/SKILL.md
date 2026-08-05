---
name: eski-flatfield
description: The publisher-shelf style for eski. Every cover sits on its own flat block of colour sampled from the artwork and snapped to a step on the sage ramp, so a catalogue of wildly different art reads as one curated shelf. Identical card geometry, varying ground. Single-ink riso duotone for placeholders. Grounded in Breakdown Press, Standards Manual and Hato Press. Use when styling any eski surface in this direction. Trigger on "flat field", "colour field", "shelf", "browse", "covers", "riso", "duotone", or a request to make mismatched artwork cohere.
---

# eski-flatfield

**In one line:** eski hosts other people's art at wildly different quality, and giving each cover its own colour field is the cheapest way to make the shelf look curated instead of assorted.

## The reference

**Breakdown Press** (breakdownpress.com), with **Standards Manual** and **Hato Press**.

Breakdown's store puts every book on a saturated flat field — yellow, navy, orange, teal — with the book photographed small and centred on it. The layout never varies; only the ground does. The effect is that a shelf of unrelated covers by unrelated artists reads as one publisher's output.

Standards Manual contributes the chrome: lowercase condensed nav on black, one accent, product photography allowed to fill the viewport. Hato contributes single-ink riso duotone as a house treatment for images that are not covers.

**Steal:** the colour field behind each cover; identical geometry with varying ground; duotone for placeholders and empty states.

**Do not steal:** the full-spectrum palette. Sampling to the sage ramp is what keeps eski's one-hue rule intact.

## Tokens

```css
--paper:var(--paper-1);
--surface:var(--white);
--rule:var(--line-1);
--ink:var(--sage-900);
--accent:var(--sage-700);

/* the six legal fields. a cover's ground is always one of these. */
--field-1:var(--sage-200);  --field-2:var(--sage-300);
--field-3:var(--sage-400);  --field-4:var(--sage-500);
--field-5:var(--sage-700);  --field-6:var(--sage-800);
--field-pad:clamp(16px,3vw,32px);
```

## Choosing a field

Sample the cover's dominant colour, convert to lightness, and snap to the nearest of the six fields **by lightness contrast**, not by hue — everything lands on sage regardless of the source hue.

Then enforce a contrast floor: if the cover's own average lightness is within 12% of the chosen field, step one field further away. A cover must never dissolve into its ground. Covers with no art get `--field-3` and a duotone placeholder.

Store the chosen step on the comic row so the shelf is stable between loads. Never recompute per render.

## Type

- Jost throughout. Gnomon for the wordmark and for a comic title on its own page.
- Nav lowercase, `--fs-sm`, letterspacing `.02em`. Lowercase is the house voice here.
- Captions under a field: title `--fs-sm` medium, byline `--fs-xs` muted, count right-aligned tabular.
- Type never sits on the field. It sits below it, on paper.

## Layout

A shelf is a grid of equal cells, `minmax(200px,1fr)`, gap `1px` over `--rule` so the fields form a continuous block with hairlines between them.

Inside a cell: the field, `--field-pad` all round, cover centred at its natural aspect with `max-height` capped so tall and wide covers occupy the same cell height. Below the field, on paper, the caption.

## Components

**field cell** — the atom. Coloured ground, padded, cover centred, caption below on paper. Used identically on home, browse, shelf, profile and search.

**duotone** — a one-ink treatment for any image that is not a cover: profile photos, page thumbnails, empty states. `filter: grayscale(1)` plus a `--field-*` multiply layer.

**shelf head** — lowercase label left, count right, one hairline under. No section furniture beyond that.

## Rules

- One cover per field. Never two covers on one ground.
- Type never sits on a field. Fields are for art only.
- Six fields exist. Do not invent a seventh, and do not use a raw sampled colour.
- Square corners, no shadows, no rounded cards.
- A cover keeps its own aspect ratio inside the field; the field is what makes cells equal, not cropping.

## Surfaces

Strongest on browse, shelf and home. Profile works, using the same cells for a person's comics and their performances. The reader must not use fields — the reader's ground stays neutral. The studio uses duotone for page thumbnails only.
