---
name: eski-rack
description: The browsing-is-listening style for eski. A persistent player at the bottom of every page, every voice and every score auditionable in place, tags instead of categories, utilitarian chrome that never interrupts playback. Grounded in Bandcamp and NTS Radio. Use for browse, the contribute hub, profile pages, preview clips, and anywhere a person has to judge a performance before committing to it. Trigger on "preview", "audition", "sample a voice", "contribute hub", "player", "browse by tag", or a request to make eski feel audio-first.
---

# eski-rack

**In one line:** you cannot judge a voice actor from their name, so every name on the site should play.

## The reference

**Bandcamp**, with NTS Radio for the chrome.

Bandcamp's structural decision is that the player is part of the page, not a destination. You land on an album from a link, press play, keep browsing, and the audio never stops. It is aggressively utilitarian — small type, dense tag clouds, no marketing gloss — and that plainness is why the music reads as the point.

NTS does the same with a fixed bottom bar carrying two live channels, and a site that is basically a schedule in a table.

**Steal:**
- The persistent bottom player that survives navigation. Nothing about it is modal.
- Play affordances on *list items*, not just on detail pages. Every row in a list is playable.
- Tags as the primary taxonomy, user-authored, clickable, and shown as plain lowercase words in a wrapping cloud rather than a filter dropdown.
- The artist-page-as-index: everything a person made, in one plain reverse-chronological list.
- Copy that names the money and the terms plainly. Bandcamp says what the artist gets. eski should say what a contributor keeps.

**Do not steal:** Bandcamp's blue links and grey chrome, its cramped 12px everything, or its album-centric assumption that one work has one creator.

## Why it fits eski

Two roadmap items are the same item under this style. Preview clips for voice tracks exist so a reader can hear a performer before committing; the contribute hub exists so a performer can find an open role. Both are lists of people, and both are useless as text. Under a rack, both are a single component: a row with a play triangle.

It also fixes the thing the current mix picker gets wrong. Checkboxes ask you to choose between two names you have never heard. A rack lets you hear both in eight seconds without leaving the page.

## Tokens

Inherit `tokens.css`. Override:

```css
--paper: var(--paper-0);
--surface: var(--white);
--rule: var(--line-1);
--rack-h: 68px;                 /* the player bar, reserved on every page */
--rack-bg: var(--sage-900);
--rack-ink: var(--sage-100);
--playing: var(--sage-400);     /* the one state colour: something is sounding */
--tag-bg: var(--paper-1);
```

`--playing` is the only colour that means anything in this style, and it only ever marks audio that is currently making noise.

## Type

- Jost throughout, `--fs-sm` as the working size. This style runs one step smaller than the rest of eski on purpose.
- Gnomon only for the wordmark and comic titles on detail pages. Never in lists.
- Tags always lowercase, never title case, never pluralised by the UI.
- Durations and timecodes tabular.

## Layout

Every page reserves `--rack-h` at the bottom with `padding-block-end` so the fixed bar never covers content. Above it, a single-column list at `--max`, or a two-column split (list left, detail right) on wide screens.

Lists are hairline rows at 44px minimum height. A row is: play triangle, avatar or thumbnail at 28px, primary text, secondary text, right-aligned duration, and an action that appears on hover and is always present on touch.

## Components

**rack** — the fixed bottom bar. Left: what is playing, as `character · performer · comic`, all three linked. Centre: transport and a scrub track (`--r-track` is the only rounded thing here). Right: a queue toggle. It is dark in both themes; it is the one persistent piece of furniture.

**play row** — the workhorse. Used identically for voice previews, score previews, cast lists, contribute listings and profile discographies. When the row is sounding, the triangle becomes a square and the row takes a 2px `--playing` left edge.

**tag cloud** — wrapping lowercase words, hairline boxes, no counts unless the count is over ten. Clicking filters; the active tag pins to the front of the cloud with a filled ground.

**open role** — a play row whose performer slot is empty. Plays the reference or filler track if one exists, and its right-hand action is `record this`. This is the contribute hub, and it is the same component as everything else.

## Rules

- If a thing is audio, it plays from wherever it is named. No detail page required.
- Playback never stops on navigation and never stops because a dialog opened.
- Previews are capped at eight seconds and start on the first line of dialogue, not on silence.
- Only one thing sounds at a time. Starting a preview ducks or stops the score.
- No waveforms in lists. A waveform is detail-page furniture; a list gets a triangle and a duration.

## Surfaces this style owns

Browse, the contribute hub, profile pages, the cast bar, and the preview system across every surface.
