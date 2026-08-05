---
name: eski-repertory
description: The cinema-that-writes style for eski. Warm sage paper ground, icon-over-word navigation, a written now-playing paragraph where every title is a link, art carrying all the colour. Grounded in Metrograph and It's Nice That. Use when styling any eski surface in this direction. Trigger on "repertory", "warm", "friendly", "editorial", "cinema", "now playing", or a request to make eski feel like a place rather than a tool.
---

# eski-repertory

**In one line:** eski is a venue that programmes comics, so the site should read like a cinema's own page — warm, written, and signed by a human.

## The reference

**Metrograph** (metrograph.com), with **It's Nice That** for the editorial feed.

Metrograph is a two-screen cinema in New York whose site is warm cream, a display wordmark with real character, six icon-over-word nav items, and a now-playing block that is a genuine paragraph — every film title inside it is a link. It sells a programme by writing about it, not by gridding it.

It's Nice That contributes the feed shape: a thin ticker strip of secondary content above a centred masthead, then a stream where the artwork carries all the colour and the chrome carries none.

**Steal:** the warm ground; prose as a navigation surface; icon-over-word nav capped at six; a centred masthead with a thin strip above it.

**Do not steal:** the red/navy pairing, the deco display face, or the carousel.

## Tokens

```css
--paper:var(--sage-50);      /* #F6F9F7 — warm, two steps up from today */
--paper-2:var(--sage-100);
--surface:var(--white);
--rule:var(--sage-200);
--ink:var(--sage-900);
--soft-ink:var(--sage-700);
--accent:var(--sage-600);
--strip:var(--sage-800);     /* the thin ticker strip above the masthead */
--strip-ink:var(--sage-100);
```

Warmth comes from moving the paper up the sage ramp, never from adding a beige or a second hue. If it starts reading municipal-green, step the paper lighter rather than warmer.

## Type

- Gnomon centred as the masthead, at `--fs-title` to `--fs-display`. This is the one style where display type gets room.
- Jost at `--fs` (15px), `line-height:1.65` for the editorial paragraph — the paragraph is the main content, so it gets reading measure, 62ch.
- Section heads: Jost `--fs-lg`, medium weight, sentence case. No letterspaced micro-caps in this style; it is warm, not technical.
- Numbers tabular, but metadata is written into sentences wherever it can be.

## Layout

Centred, `--max` 1100px, generous vertical rhythm at `--s7`/`--s8`. A thin dark strip runs above the masthead carrying one line of secondary news. Below the masthead, the icon-over-word nav, centred.

The home page leads with the now-playing paragraph, not a grid. Grids appear below it, and they are quiet.

## Components

**masthead** — wordmark centred, nav centred beneath as icon-over-word. Six items maximum, drawn from the existing Lucide set.

**now playing** — a written paragraph, 3–5 sentences, in which every comic title, performer name and score name is a link in `--accent`. Replaces the hero. Rewritten weekly by a person.

**programme card** — art at natural aspect, title, byline, and one written sentence. No badges: cast status is written into the sentence.

**strip** — the dark bar above the masthead. One line, links only, no controls.

## Rules

- Every surface has at least one paragraph a person wrote. If there is nothing to say about a comic, it does not get a programme card.
- Status is words, never a badge or a chip.
- Art keeps its own aspect ratio and is never recoloured or scrimmed.
- Six nav items maximum, always icon over word, never a hamburger on desktop.
- Vertical scroll only, no carousels.

## Surfaces

Strongest on home and profile. Detail works. The studio should not use this — its warmth is ornament the studio cannot afford.
