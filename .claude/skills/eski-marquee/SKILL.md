---
name: eski-marquee
description: The curated-marquee style for eski. One comic at a time, full-bleed art, editorial copy, a dated rotation instead of an infinite grid. Charcoal ground, art is the only colour, type is small and confident. Grounded in MUBI's thirty-films model and the Criterion Channel's programming. Use for the home page, the browse surface, seasonal or themed collections, and any landing surface. Trigger on "home page", "landing", "browse", "shelf", "hero", "cold start", "we only have twenty comics", or a request for a more editorial, curated eski.
---

# eski-marquee

**In one line:** with twenty comics, a grid advertises an empty library and a marquee advertises taste.

## The reference

**MUBI**, and behind it the Criterion Channel.

MUBI's founding constraint was thirty films, one added and one removed each day. That constraint forced a UI that most streaming design refuses: no rows of rows, no infinite scroll, one title occupying the whole screen with a paragraph of real writing under it. Criterion does the same thing slower, with themed programmes and a house voice.

**Steal:**
- The scarcity frame. Show a small number and make the smallness deliberate and legible ("seven comics this week", with a date).
- Full-bleed art with type sitting *on* it, not beside it, held readable by a scrim rather than a panel.
- Editorial copy in a human voice, written per title. MUBI's synopses are essays, not metadata.
- The leaving-soon and just-added markers. A dated rotation makes returning feel worthwhile.
- Restraint in chrome: MUBI's nav is four words and they are small.

**Do not steal:** the auto-playing trailer, the endless carousel rows Netflix taught everyone, or the assumption of a large catalogue. eski's catalogue is small and the design should be honest that this is a feature.

## Why it fits eski

Cold start is the actual product problem in the roadmap — the contribute hub exists because nobody can find a comic to make a part for. A grid of twelve covers makes the platform look abandoned. A marquee that says "this week: seven comics, three still need voices" makes the same catalogue look programmed.

It also gives the open-graph work somewhere to live. A marquee entry *is* the link preview: cover, title, one sentence, cast status.

## Tokens

Inherit `tokens.css`. This style runs dark by default in both themes — it is the one place eski commits.

```css
--ground: var(--void);          /* #0C130F */
--ground-2: var(--surf-1);
--ink: #EAF0EC;
--muted: var(--muted-dark);
--rule: var(--line-dark);
--scrim: linear-gradient(180deg, rgba(12,19,15,0) 0%, rgba(12,19,15,.55) 55%, rgba(12,19,15,.94) 100%);
--accent: var(--sage-300);
```

The cover art is the only saturated thing on screen. Chrome never competes: no sage fills larger than a chip.

## Type

- Comic titles in Gnomon at `--fs-display`, tight (`line-height: .92`, `letter-spacing: -.015em`). This is the one style where display type runs big.
- Editorial paragraph in Jost at `--fs-lg`, `line-height: 1.65`, capped at 62ch, `--muted` — deliberately quieter than the title.
- Dates and counts at `--fs-micro`, uppercase off, letter-spaced `.14em`.
- Never more than three type sizes visible at once.

## Layout

A stack of full-width bands, one per comic, each `min-height: 78vh`. Art bleeds edge to edge and is cropped with `object-position` chosen per comic. Type sits bottom-left inside `--max`, held off the edge by `--s7`.

Between bands: a single hairline and a lowercase caption line (`no. 03 · added tuesday · needs two voices`). That caption is the numbering system, and it earns its numbers because the rotation is genuinely ordered.

Below the marquee, and only below it, a plain text index of everything else — no covers. The marquee is the front of house; the index is the back catalogue.

## Components

**band** — full-bleed art, scrim, title, one paragraph, one primary action (`read it`) and one ghost action (`voice a part`).

**rotation caption** — the hairline strip between bands. Carries number, date added, and cast status. Status is words, not chips: `needs two voices` reads better than a badge and doubles as the call to action.

**index** — a text list under the marquee: title, author, pages, status. Hairline rows, tabular figures. Deliberately unglamorous so the marquee stays the event.

## Rules

- One comic per screen. If two bands are visible at once the crop is wrong.
- Never put a cover in a rounded rectangle. Art is square-cornered and full-bleed or it is a 40px thumbnail in the index. Nothing in between.
- The editorial paragraph is written per comic by a human. If there is no paragraph, the comic does not get a band — it goes in the index.
- No carousels. Vertical scroll only.
- Scrim, never a solid panel behind text. If the art is too busy for a scrim, crop it differently.

## Surfaces this style owns

The signed-out home page, the browse surface, collection and season pages, share previews.
