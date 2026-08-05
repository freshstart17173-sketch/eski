---
name: eski-ledger
description: The credits-ledger style for eski. A comic is a release, a mix is a pressing, and every human who touched it gets a row. Tabular hairline layout, tabular figures everywhere, role-first credit blocks, version selector instead of checkboxes. Grounded in Discogs release pages, Genius song credits, and vinyl liner notes. Use for the comic detail page, the cast bar, the contribute hub, profile discographies, and any surface whose job is attribution. Trigger on "credits", "cast", "attribution", "mix picker", "comic page", "who voiced", "detail page", or a request for a denser, more archival eski.
---

# eski-ledger

**In one line:** eski's real novelty is that one comic has many casts, so the interface should be a discography, not a card.

## The reference

**Discogs release pages** (plus Genius song credits and the liner-note tradition they both descend from).

Discogs solved a problem nobody else in consumer software takes seriously: one work, many versions, and dozens of humans who each did one specific job on one specific version. It does it with no cards, no hero image bigger than a thumbnail, no marketing copy. Just a masthead, a tracklist, and a credits block where every line reads `Role — Person`.

**Steal:**
- Role-first credit lines. The role is the label; the person is the value. Never the reverse.
- The version selector as a first-class control. On Discogs you are always looking at *one pressing* of a release, and switching pressings is one click near the top.
- Tabular figures and aligned columns. Page counts, durations, dates, vouch counts all line up on the right.
- Hairline rows instead of cards. Density reads as completeness, which is the emotional point of a credits page.
- Everything is a link. Every performer, every role, every tag is a way into more of the database.

**Do not steal:** Discogs' visual chaos, its ad slots, its 2007 gradients, its blue hyperlink field. Take the information design, not the surface.

## Why it fits eski

The existing detail page shows the mix as off-by-default checkboxes, which frames a cast as a settings panel. It is not a settings panel. It is a credit list, and credit is the entire economy the platform runs on: contributors show up because their name lands somewhere permanent.

A ledger layout also solves three roadmap items by shape rather than by feature work. The contribute hub (an uncast character is an empty row). Preview clips (a play affordance on a credit row). Kudos and vouches (a right-aligned number column that already exists in the grid).

## Tokens

Inherit `tokens.css`. Override these:

```css
--paper: var(--paper-1);        /* the ledger sits on a shade darker than white */
--surface: var(--white);
--rule: var(--line-1);          /* hairline, 1px, never 2 */
--rule-strong: var(--sage-300); /* section breaks only */
--role: var(--muted);           /* role labels */
--value: var(--ink);            /* people, titles */
--font-data: 'Jost', ui-monospace, monospace;
```

Add no hues. This style is the most monochrome of the five; the only colour beyond the sage ramp is `--danger` on a takedown action.

## Type

- Titles in Gnomon, but **small** — `--fs-title`, not `--fs-display`. A ledger has a masthead, not a hero.
- Everything else Jost.
- Role labels: `--fs-xs`, lowercase, `letter-spacing: 0.08em`, `--role` colour.
- All numerals `font-variant-numeric: tabular-nums`. No exceptions in this style.
- Line height 1.35 in tables, 1.6 in the one prose paragraph a comic gets.

## Layout

Two columns on desktop, one on mobile. Left column 280px: cover, at native aspect, hairline border, nothing else. Right column: masthead, one description paragraph capped at 66ch, then credit blocks stacked.

A credit block is a `<dl>`-shaped grid: `grid-template-columns: 140px 1fr auto`. Role, person, number. Rows separated by a 1px rule and nothing else — no zebra striping, no hover fill beyond a one-step ground change.

## Components

**version bar** — a horizontal row of mixes directly under the masthead. One is active (hairline becomes `--rule-strong`, label goes semibold). Switching re-renders the credit blocks below. This replaces the checkbox mix picker entirely.

**credit row** — `role · person · count`. Person carries an avatar disc at 20px and links to a profile. A play triangle appears on hover for rows that have a preview clip. Uncast roles render with the person slot italic and muted (`not yet voiced`) and a `voice this` action in the count slot — the contribute hub, inline.

**stat strip** — a single row under the masthead: pages, chapters, published date, kudos. Separated by middots, tabular figures, no icons.

**section rule** — a `--rule-strong` line with a lowercase label sitting on it. This is the only ornament the style gets.

## Rules

- No cards. If a thing needs a boundary it gets a hairline, not a box with padding on four sides.
- No cover art larger than 280px wide anywhere in this style. The ledger is about the credits; the marquee style is where art gets to be big.
- Never hide a credit behind a disclosure. Long cast lists scroll; they do not collapse.
- Right-align every number column. Left-align every text column. Nothing centres.
- One prose paragraph per comic maximum. Everything else is a row.

## Surfaces this style owns

The comic detail page (`/c/<slug>`), the cast bar in the reader, the contribute hub, profile pages.
