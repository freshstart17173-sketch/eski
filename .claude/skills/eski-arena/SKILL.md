---
name: eski-arena
description: The plain-archive style for eski. One thing at a time in a single scrolling column, near-zero chrome, a block carrying only what it is with metadata cut to a byline and a caption, and a signature muted green marking anything clickable — names, channels, tabs. Tags are the entire structure, feeds are user-built out of them, and every feed has an honest cap instead of an infinite scroll. Grounded in Are.na's actual product UI (channel view, block detail, search facets), not just its marketing site. Use for a feed that has to stay legible at any length, tag-composed personal feeds, and any surface that should feel collected rather than published or ranked. Trigger on "are.na", "arena style", "channel", "block", "collect", "one thing at a time", "feed cap", or a request to strip a screen down to the minimum it needs.
---

# eski-arena

**In one line:** are.na proves a feed can run long and still feel curated, as long as the scroll is the only thing that gets to scale — nothing else is allowed to get louder to compensate.

## The reference

**Are.na** — the product, not the marketing page. (Grounded in screenshots of the block detail view, a search-results grid, and a channel-filtered search — the marketing site renders a generic content-marketing layout and does not represent the app.)

The interface is built to disappear in favour of what got collected into it, but it is **not** monochrome — that was a wrong assumption in an earlier pass of this skill. A muted olive-sage runs through every clickable name: a channel title, a person's name, an active tab, a search facet. It is the one colour the chrome is allowed, and it means exactly one thing everywhere it appears: *this is a name you can go to*. Everything else — labels, counts, timestamps — stays a flat grey.

A block's detail view is a photo (or file) on the left at whatever size it naturally wants, and a plain key/value panel on the right: `Added`, `Modified`, `By`, `Source`, `Dimensions`, each a grey label with a value beside it, bold where the value is a name. Below that, two actual rounded-pill buttons (`Connect →`, `Actions ⌄`) and a two-tab switch (`Connections`, `Comments`) styled as plain text with an underline on the active one. Connections are grouped by month, each row a channel name in sage, a block count in grey, and the connector's name in sage — no border, no card, just a row, though the one under the pointer picks up a soft grey rounded highlight on hover.

The search-results grid is where the real card language shows up, and it is more specific than "borderless": **a card gets a border only when it has no image to define its own edge.** A block that's a photo just sits there, full-bleed, no frame — the picture is enough. A channel with rich contents shows a small contact-sheet mosaic of its first few blocks. A channel that's mostly text gets a full outline in that same sage, square-cornered, with its title, byline, block count and age all centred inside. The border is a stand-in for a missing image, not a decoration.

Search itself is the header. There is no nav bar — the whole top strip is one big plain text input, with a compass-mark logo to its left and the two pill auth buttons to its right. Filtering results is four plain-text columns side by side (`Where`, `Types`, `Fields`, `Order`), each a stack of options with a small dot marking the active one — no dropdowns, no chip row.

**Steal:**
- The sage-for-anything-clickable rule. One colour, one meaning, used on names and nowhere else — this is directly compatible with eski's own `--ui` token, which already exists for exactly this ("the colour of clickable text" — `broadsheet.css`).
- A border is earned by having no image, not handed out by default. An image-only block never gets a frame; a text-only card does, because it would otherwise have no visible edge.
- The plain key/value metadata block: grey label, value beside it, nothing decorative.
- The facet-list filter: plain text columns, a dot for the active choice, no dropdown chrome. Worth borrowing for eski's own browse filters some day, independent of the shorts feed.
- Grouping a list by month with a plain date heading, no card around the heading itself.

**Do not steal:**
- Rounded pill buttons (`Log in`, `Sign up`, `Connect`, `Actions`) — eski's shape system is fixed everywhere (`--r: 0`, square corners, no exceptions per surface) and this style doesn't get to unfix it. Every button here stays eski's existing `.btn`.
- The compass-mark logo and the search-bar-as-header — eski keeps its own wordmark and nav; this skill borrows are.na's colour and card logic, not its chrome.
- A hairline border around a block that already has an image. That's a broadsheet habit (every `.plate` gets one) this style deliberately drops for image content, matching what are.na actually does.

## Why it fits eski

Every existing eski surface already refuses an algorithmic feed — the browse modes are named, not ranked, and the home page is curated rails. Arena is the version of that for a surface that has to be long and chronological by nature (a shorts feed, a follow timeline), where a grid can't hide how many items there are and a marquee's one-at-a-time rotation is too slow for something people are meant to move through quickly.

The cap is the part are.na doesn't have and eski needs: a feed that never ends is the one shape "no algorithm" can't fix by itself, because infinite is still a machine optimizing for attention, just without telling you how. Capping it and handing back the tab strip is the same move as are.na's channel-hopping, done on purpose instead of as a side effect of there being more channels than one person tracks.

The sage-for-clickable rule also isn't a new colour for eski to maintain — it's `--ui`, already wired to a hover state (`--ui-hover-bg`) and already the rule for "anything you can click" per `broadsheet.css`'s own comment at line 406. Arena doesn't introduce a token; it just uses the one that was already reserved for this.

## Tokens

Inherit `tokens.css`. No new colour token — `--ui` / `--ui-hover-bg` carry every clickable name, exactly as they do everywhere else in eski. Override only the geometry:

```css
--arena-max: 640px;         /* the column. narrower than --wrap — a block reads as one thing */
--arena-gap: var(--s6);     /* air between blocks stands in for the border broadsheet would draw */
```

## Type

- Jost throughout. Gnomon does not appear in this style — are.na has no display face in the product itself (only its marketing site uses one), and borrowing eski's would make one block read as an announcement next to the one before it.
- Names, channel titles and active tabs are `--ui`. Labels, counts, timestamps are `--label`. Nothing else gets a third colour.
- Tags always `#lowercase`, never title case, never pluralised.
- Captions are one line, ellipsis-truncated. Two lines is a description, and a description belongs on the detail sheet.

## Layout

A single column, `--arena-max` wide, centred, full width on a phone. One block per row, stacked with `--arena-gap` between them — no grid, no masonry, because the whole point is that a weird aspect ratio never has to negotiate a column width with its neighbours.

The tab strip is **not a new control** — it's eski's existing `.tabs` / `.tab` (`broadsheet.css`, "used by the profile"): one scrollable row, a bottom rule, the selected tab carrying `--mark` as its underline and `--ink` as its text, the rest at `--ui` and 0.6 opacity. Arena's only addition is that the tabs are `#tag` strings instead of section names, and a composer field sits at the end of the row to build a new one.

When a feed reaches its cap, the column ends in a **feed cap** module: a stated count ("8 of 20 in #shortform"), then the tab strip again, restated as an invitation rather than a nav — so leaving one feed is entering another, not hitting a wall.

## Components

**block** — the unit. Full-width art at its own aspect ratio, no frame — per the border rule above, an image never gets one. Under it: audio glyphs (presence only, same rule as the rest of eski), a one-line caption, a byline in `--ui`, a hairline closing the row off from the next one. Tapping the art opens the detail sheet; tapping the byline goes to the profile.

**metadata panel** — label/value rows (`Added`, `By`, and whatever else a detail sheet needs), grey label, `--ui` value when the value is a name. This is the block-detail sheet's content, not the feed row's — the feed stays down to a caption and a byline on purpose.

**tab** — eski's `.tab`, unchanged, carrying a `#tag` instead of a section name.

**tab composer** — a plain text field at the end of the tab row that accepts `#tag #tag #tag` and turns it into a saved tab the moment it resolves to at least one result. No form, no name field — the tag string is the name until renamed.

**feed cap** — count, one sentence, then the tab strip. Never a spinner, never an auto-load.

**facet list** *(available, not yet used by the shorts feed)* — a plain-text column of options under a plain heading, a small dot marking the active one. No dropdown. Worth reaching for the next time a browse filter needs redesigning.

## Rules

- Every feed has a visible cap and a real number attached to it. A feed that would never end is not this style.
- `--ui` marks a name and nothing else — never a count, a label, or a decoration.
- A block gets a border only when it has no image. An image is its own edge.
- One column, always. A grid of these blocks is a different eski style — arena is specifically the exception that isn't a grid.
- Reaching a cap always offers another tab in the same breath. Never a dead end, never "check back later."
- Tags compose with a space, not an AND/OR picker.

## Surfaces this style owns

The shorts feed and its tab system. Not the rest of eski — broadsheet stays the house style everywhere a grid or a cover still makes sense.
