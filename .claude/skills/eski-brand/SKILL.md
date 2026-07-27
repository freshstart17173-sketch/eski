---
name: eski-brand
description: The eski design system as actually built: swiss grid in sage, Jost only, Gnomon for display, square corners, hairline dividers, density as a feature. Use for ANY eski surface, in the app (index/read/studio/spec) or out of it (landing pages, decks, social, app icons, docs). Trigger whenever the user mentions eski, "our brand", "on-brand", "brand colours", "the style guide", or asks to design, build, restyle or audit anything carrying the eski name. Also trigger when extending or checking existing eski work for consistency. Replaces the earlier sage marketing guide, which had no product vocabulary.
---

# eski design system

**In one line:** one hue, square structure, hairlines instead of shadows, and density treated as a feature, because this site hosts other people's artwork and the chrome's job is to get out of its way.

Lineage: this replaces the earlier eski brand guide. That guide was written for a landing page (block rhythm of `clamp(96px,14vw,200px)`, "one idea per block", "no cards") and eski became a platform: a cover grid, a reader that must disappear, and a three-column authoring studio. The palette, the type roles and the voice survived. The composition rules did not.

## The source of truth is a file

`tokens.css` at the repo root. Every colour, size, space, radius and duration lives there and is loaded by all four pages. **Read it before styling anything, and add tokens there rather than hardcoding values in a page.**

Component CSS stays per page on purpose. The four surfaces are genuinely different shapes and a shared component sheet would fight all four.

## Fixed (breaking these breaks the brand)

- **The sage ramp.** `--sage-50` through `--sage-900`, one hue. Values are locked.
- **Two faces, two roles.** Gnomon for display only (wordmark, page headings, the drop overlay), never under 32px, never for UI. Jost for absolutely everything else.
- **Lowercase.** Headings, nav, buttons, labels. Sentence case only in running copy.
- **Contrast floors.** 4.5:1 body against its ground, 3:1 display and the wordmark.
- **Dark mode flips the accent.** `--sage-500` is 3.5:1 on a dark ground and fails, so `--accent` becomes `--sage-300` there. `tokens.css` already does this. Never hardcode `--sage-500` as an interactive colour.
- **No em dashes or en dashes.** Anywhere: copy, UI text, comments, commit messages. Use a period, a comma, a colon, parentheses, or "to" in ranges.

## The look

**Square.** `--r:0`. Structure and objects both. The only survivors are `--r-round` (50%, for things that are genuinely discs: spinners, the audio dot) and `--r-track` (999px, for scrollbar thumbs and progress tracks).

**Hairlines, not shadows.** `--shadow` and `--shadow-lg` are both `none` and stay that way. Elevation is a change of ground colour plus a 1px `--line`. Never reintroduce a shadow; if two areas need separating, they need a border or a different ground.

**Grid gaps as dividers.** The dense pattern: a container with `background: var(--line)` and `gap: var(--bw)`, children with `background: var(--surface)`. One declaration gives perfect hairlines with no border-collapse problems. The library grid and the chapter chips both use it. Reach for this before writing borders on every child.

**Weight and colour carry hierarchy, not size.** Jost 400 for body, 500 for headings, labels, buttons and anything that must win. 600 is rare emphasis. Never 700, never italic. Size steps are small on purpose: `--fs-lg` 17, `--fs` 15, `--fs-sm` 13.5, `--fs-xs` 12, `--fs-micro` 11.

**Density is the default.** This is a content platform. Spacing lives at the low end of the 4px scale (`--s2` to `--s5`); `--s7` and up are for empty states and document pages only. Controls are `--ctl` (30px), which becomes 42px automatically under `@media (pointer:coarse)`. Do not add your own touch-size media query, change the token.

**Readouts get tabular figures.** Page counts, timecodes, durations, queue positions, chapter numbers: `font-variant-numeric: var(--num)`, or the `.num` class. Digits must not jitter as they tick. There is no monospace face in this system; Jost with tabular figures is the answer.

**The rule bar** is the one ornament: `.rule`, a 5px sage bar above a heading. Not on every block.

## Motion

`--t-fast` 160ms for state, `--t-mid` 220ms for reveals, `--t-slow` 300ms for transitions, easing `--ease`. Hover is a colour or ground step, never a lift, never a scale, never a shadow. `prefers-reduced-motion` is already honoured in `tokens.css`.

## Product vocabulary

What the old guide was missing.

- **Header.** `--hdr` tall, `--surface` ground, one hairline underneath, sticky. The wordmark sits left in Gnomon at ~25px, nav is `--fs-sm` muted, and actions sit right after a `.sp` spacer.
- **Grid of content.** Hairline contact sheet, see above. Covers are `aspect-ratio: 2/3`. Hover shifts the cell ground to `--sage-100`, it does not lift.
- **Panels and drawers** (the studio): ground steps through `--bg-0` to `--bg-3`, separated by hairlines. On narrow screens they become off-canvas drawers behind a scrim.
- **Buttons.** `.btn` / `.pill`: square, `--ctl` min-height, 1px `--line`, `--surface` ground, hover borders and colours to `--accent`. `.primary` fills with `--accent` and goes 500 weight.
- **Badges and tags.** Square, `--fs-micro`, weight 500, `--accent` ground with white text.
- **Modals and sheets.** Square, 1px `--edge-strong`, no shadow, over `rgba(20,34,27,.72)`. On mobile they become bottom sheets carrying their own close row, because the sheet covers the button that opened it.
- **The reader is the exception to everything.** Its chrome must vanish. Focus mode hides the header, the footer and the player bar entirely. Nothing decorative belongs on a page of someone's comic.

## Colour match

The reader re-derives its chrome from the cover art. `setTintVars()` sets `--hue` / `--tintsat` and toggles `html.tint`; the rules under the token link in `read.html` re-derive `--paper`, `--surface`, `--accent`, `--band` and `--line` from that hue, and light/dark stays CSS's problem. Dropping the class falls back to sage.

**This is why the accent tokens must stay indirect.** Anything that hardcodes `#5B7A6B` instead of `var(--accent)` will refuse to tint, and will look broken next to everything that does.

## Voice

Plain, concrete, understated. Describe what the thing does. Headlines are two to five lowercase words. Buttons say what happens ("publish", "read it", "add eski"), never "Learn More" or "Submit". Errors say what happened and what to do, without apologising. Empty states are a one-line invitation to act.

Banned: revolutionary, game-changing, seamless, leverage, empower, unlock, supercharge, delve, robust, cutting-edge, "we're excited to announce". No emoji in code, markup, copy or alt text.

The exclamation in **eski!** is part of the wordmark, not the tone. Running copy says "eski". Say "an .eski", never "a .eski".

## Tripwires, each of which has already cost time

- **The mobile `@media` block must be the last thing in a page's stylesheet.** Put it earlier and later rules of equal specificity win, and drawers silently refuse to slide.
- **`[hidden]` loses to any rule that sets `display`.** `tokens.css` carries `[hidden]{display:none!important}`. Do not remove it.
- **Controls do not inherit the page font.** `tokens.css` sets `button,input,select,textarea{font-family:inherit}`. Without it, button-based UI silently renders in Arial.
- **`.viewer-col` needs `min-height:0`** or pages balloon to natural size and push the player bar off screen. There is a fixture guarding this.
- **Icon-only controls need an explicit min size.** When a label hides at narrow widths the target collapses to the icon. Everything tappable clears 40px.
- **The test server needs a `.css` MIME entry.** Without it `tokens.css` is served as octet-stream, the browser refuses it, and every layout assertion lies to you.
- **Service workers and the HTTP cache will show you stale CSS.** After a restyle, unregister the worker and cache-bust the URL before believing what you see.

## Before you ship

- [ ] Values come from `tokens.css`. No new hardcoded hex.
- [ ] Square, unless it is a disc or a track.
- [ ] No `box-shadow` anywhere.
- [ ] Gnomon only above 32px, and only for display. Jost everywhere else.
- [ ] Every readout has tabular figures.
- [ ] Dark mode checked, and the accent stepped up the ramp.
- [ ] Colour match still tints (nothing hardcoded past `var(--accent)`).
- [ ] 390px wide: no horizontal scroll, every tap target at least 40px.
- [ ] The mobile media block is last.
- [ ] Zero em dashes.
- [ ] `node tests/smoke.js` green. The suite is the net that makes restyling safe.
