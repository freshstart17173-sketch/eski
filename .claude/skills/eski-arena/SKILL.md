---
name: eski-arena
description: The plain-archive style for eski. One thing at a time in a single scrolling column, near-zero chrome, a block carrying only what it is with metadata cut to a byline and a caption. Tags are the entire structure, feeds are user-built out of them, and every feed has an honest cap instead of an infinite scroll. Grounded in Are.na's channel view. Use for a feed that has to stay legible at any length, tag-composed personal feeds, and any surface that should feel collected rather than published or ranked. Trigger on "are.na", "arena style", "channel", "block", "collect", "one thing at a time", "feed cap", or a request to strip a screen down to the minimum it needs.
---

# eski-arena

**In one line:** are.na proves a feed can run long and still feel curated, as long as the scroll is the only thing that gets to scale — nothing else is allowed to get louder to compensate.

## The reference

**Are.na.**

The whole interface exists to disappear in favour of what got collected into it. A channel is one column of blocks — an image, a link, a paragraph, another channel nested inside — rendered as plainly as the format allows: an image block is just the image, a text block is just the text, on a field with almost no chrome around it. There is no like count anywhere, no algorithmic sort, no follower-count arms race. The only structure a person adds is a channel (a named collection) and a connection (this block also belongs there, additively — never a move). Search and a small editorial "conversations" section are the only curation surfaces, and both stay quiet about it.

**Steal:**
- One column, one block at a time, full width. Nothing shares the eye with the block that's on screen.
- A block carries only its own metadata — who added it, roughly when — and nothing that ranks it against the block before or after it.
- Tags/channels as the whole taxonomy. A "feed" is just a channel, and a person can be in as many as they want with none of them ranked against each other.
- Plainness as a decision, not a loading state. Small type, near-monochrome, no shadows, no gradients — the collected thing stays the most visually interesting object on the screen because nothing else is competing for that.
- Connect, not replace. The same block sits in fifty channels at once and loses nothing by it.

**Do not steal:** are.na's total absence of borders — eski's shape system is fixed everywhere else (`--r:0`, `--bw:1px`, hairlines by default) and doesn't flex per style, so arena-style plainness here still gets a 1px rule, just spent at a third the frequency broadsheet spends it. Also skip are.na's actual infinite scroll — the whole reason this style is worth borrowing for eski is the cap in Rules below, which are.na does not have.

## Why it fits eski

Every existing eski surface is already committed to "no algorithmic feed" — the browse modes are named, not ranked, and the home page is curated rails. Arena is the version of that commitment for a surface that has to be long and chronological by nature (a shorts feed, follow timeline), where a grid can't hide how many items there are and a marquee's one-at-a-time rotation is too slow for something people are meant to move through quickly.

The cap is the part are.na doesn't have and eski needs: a feed that never ends is the one shape "no algorithm" can't fix by itself, because infinite is still a machine optimizing for your attention, just without telling you how. Capping it and handing you a tab switcher instead is the same move as are.na's channel-hopping, done on purpose instead of as a side effect of there being more channels than any one person tracks.

## Tokens

Inherit `tokens.css`. Override:

```css
--arena-max: 640px;         /* the column. narrower than --wrap on purpose — a block reads as one thing */
--arena-gap: var(--s6);     /* air between blocks stands in for the border broadsheet would draw */
--arena-rule: var(--rule-hair);   /* the one rule per block: a single line under the caption, nothing else */
--tab-h: 34px;
```

No new colour. `--accent` marks the active tab and an unread cap notice; nothing else is allowed to use it. A block's own art carries every other colour on the screen.

## Type

- Jost throughout, `--fs-sm` for captions, `--fs-micro` for the byline and the tab strip. Gnomon does not appear in this style — are.na has no display face and borrowing eski's would make one block look like an announcement next to the one before it.
- Tags always `#lowercase`, never title case, never pluralised.
- Captions are one line, ellipsis-truncated. If it needs two lines it is a description, and descriptions belong on the detail sheet, not the feed.

## Layout

A single column, `--arena-max` wide, centred, full width on a phone. One block per row, stacked with `--arena-gap` between them — no grid, no masonry, because the whole point is that a weird aspect ratio never has to negotiate a column width with its neighbours.

The tab strip is a horizontal row of `#tag` buttons, sticky under the header, `--tab-h` tall. It scrolls sideways on overflow rather than wrapping — wrapping would make it a menu, and it's meant to read as one line you skim.

When a feed reaches its cap, the column ends in a **feed cap** module: a stated count ("30 of 30 in #following"), then the tab strip again, restated as an invitation rather than a nav — "keep going in" — so the exit from one feed is the entrance to another, not a wall.

## Components

**block** — the unit. Full-width art at its own aspect ratio, no crop. Under it: audio glyphs (presence only, same rule as the rest of eski — nothing rendered for what's absent), a one-line caption, a byline, and a single hairline closing it off from the block below. Tapping the art opens the detail sheet; tapping the byline goes to the profile; nothing else on the row is a target.

**tab** — a `#tag` button. Built-in tabs (`#following`, `#shortform`, `#longform`, `#lastweek`) and user-built ones look identical; there is no visual tier for "official." The active tab is the only place `--accent` fills text rather than just marking it.

**tab composer** — a plain text field that accepts `#tag #tag #tag` and turns it into a saved tab the moment it resolves to at least one result. No form, no name field required — the tag string *is* the name until the person renames it. Saved tabs live at the end of the built-in row, not before it.

**feed cap** — count, one sentence ("you've read everything new in #shortform"), then the tab strip. Never a spinner, never an auto-load. The cap is a stated fact, not a failure state.

## Rules

- Every feed has a visible cap and a real number attached to it. A feed that would never end is not this style.
- No row carries a ranking signal — no like count, no view count, no "trending." Presence-only audio glyphs are the only iconography a block gets.
- One column, always. A grid of these blocks is a different eski style (the shorts grid, the browse grid) — arena is specifically the exception that isn't a grid.
- Reaching a cap always offers another tab in the same breath. It is never a dead end and never a "check back later."
- Tags compose with space, not with an AND/OR picker. `#following #shortform` reads as plainly as it behaves.

## Surfaces this style owns

The shorts feed and its tab system. Not the rest of eski — broadsheet stays the house style everywhere a grid or a cover still makes sense.
