---
name: eski-gallery
description: The one-work-at-a-time style for eski. A flat mid-tone ground, art placed in a field and never scrimmed or cropped, the credit set as a single bold-and-regular sentence beneath it, and a ticker at the foot naming what is next. No display type at all. Grounded in Le Cinema Club, MUBI and Unit Editions. Use when styling any eski surface in this direction, and by default for the reader. Trigger on "gallery", "one at a time", "marquee", "quiet", "reader", "let the art breathe", or a request for the most restrained eski.
---

# eski-gallery

**In one line:** put the art in a field and set the type underneath it, because dimming someone's artwork so your headline can sit on top of it is a bad trade.

## The reference

**Le Cinéma Club** (lecinemaclub.com), with **MUBI** and **Unit Editions**.

Le Cinéma Club shows one film a week. The page is a flat mid-grey, the film sits in it at its own aspect ratio, and the credit runs underneath as a single sentence where the title is bold and everything else is regular. There is no hero type. A ticker at the very bottom names next week.

The important detail is the ground: mid-tone, not white and not black. The work is the only thing on screen lighter or darker than the page, which is why it reads as hung rather than pasted.

**Steal:** the flat mid ground; art in a field, never scrimmed; the one-sentence credit; the bottom ticker.

**Do not steal:** the single acid accent, or their near-total absence of navigation.

## Tokens

```css
--paper:#C9D3CE;             /* mid-tone, sage-biased. the wall. */
--paper-2:#BFCAC4;
--ink:var(--sage-900);
--soft-ink:var(--sage-700);
--rule:var(--sage-400);
--accent:var(--sage-700);
--ticker-h:34px;
--frame:clamp(32px,7vw,120px); /* margin around the work */
```

Dark theme moves the wall down, not to black: `--paper:var(--surf-2)`, `--ink:#EAF0EC`. The relationship — a mid ground with the work as the only extreme — must survive the flip.

## Type

- **No display type.** Gnomon appears in the wordmark and nowhere else. This is the rule that makes the style work.
- Jost at `--fs` (15px) for the credit sentence, `--fs-sm` for everything secondary.
- The credit is one sentence: title in weight 500, the rest in 400. No stacking, no labels, no middots.
- Ticker at `--fs-micro`, letterspaced `.12em`.

## Layout

One column, centred, with `--frame` of empty ground on every side of the work. The work is `max-height:78vh` and keeps its aspect ratio; the field never crops.

Below the work: the credit sentence, then a single action. Then nothing until the next work.

A plain text index sits at the bottom of any page that shows fewer than six works, so the emptiness upstairs is a choice rather than a dead end.

## Components

**work** — art in the field at natural aspect, capped by height. No border, no shadow, no scrim, no overlay type.

**credit sentence** — one line: `**tidewater** by mara okonkwo, 48 pages, voiced by imogen ash and samuel opoku, scored by mara okonkwo.` Every name a link.

**ticker** — fixed at the foot, `--ticker-h`, one line: what is next and when. Text only, no controls, no playback.

**index** — a plain hairline list of everything not on show. Title, byline, pages, status. No thumbnails.

## Rules

- The art is never scrimmed, tinted, cropped or overlaid. If type needs to be readable, move the type.
- No display type anywhere except the wordmark.
- One work per screen. If two are visible at once the frame is too small.
- No badges and no chips: status goes in the credit sentence or in the index.
- Square, hairline, no shadows, no rounded corners, no carousels.

## Surfaces

Default for the reader — a flat neutral field around a comic page is exactly right. Strong on home when the catalogue is small. Weak on browse past about forty comics, where it needs the index doing the real work. Never use in the studio.
