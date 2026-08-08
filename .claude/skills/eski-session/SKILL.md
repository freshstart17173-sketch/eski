---
name: eski-session
description: The clip-grid style for the eski studio. Pages are rows, layers are columns, and every cell is a clip you can fire. Replaces the soundtrack timeline with a matrix that shows the whole comic's audio at a glance. Grounded in Ableton Live's Session View and Splice. Use for the composer studio, the page grid, soundtrack and one-shot placement, and pre-export validation. Trigger on "studio", "composer", "timeline", "soundtrack", "one-shots", "page grid", "scoring", or a request to make authoring legible at a glance.
---

# eski-session

**In one line:** a comic scored page by page is a matrix, not a timeline, and musicians have read that matrix since 2001.

## The reference

**Ableton Live's Session View**, with Splice for the browse-and-audition half.

Live has two views of the same song. Arrangement is a timeline: left to right, absolute time. Session is a grid: columns are tracks, rows are scenes, cells are clips, and firing a scene launches every clip in that row at once. The insight is that when a piece is built from discrete triggered chunks rather than a continuous performance, a grid beats a timeline — you can see the whole structure without scrolling, and you can rehearse any point instantly.

**Steal:**
- The grid itself. Columns are layers, rows are units of the work, cells are clips.
- Scene launch. One control per row that fires everything in the row, so you can audition a page exactly as a reader will experience it.
- The empty cell as an affordance. An empty slot is a drop target and a record-arm, not blank space.
- Clip state legible from colour and shape at thumbnail size: has content, playing, continuing from above, empty.
- The browser rail on the left, always present, drag-to-place.

**Do not steal:** Live's clip colour rainbow (eski has one hue and a locked status set), its skeuomorphic knobs, or its Arrangement view — that is the timeline the roadmap is deleting.

## Why it fits eski

`ROADMAP.md` says the soundtrack timeline goes away and each page's panel becomes where you author that page. That is a description of Session View. An eski comic is already discrete and already triggered — the page turn *is* the scene launch.

The grid also does pre-export validation for free. Duplicate trigger pages are two starts in the same column. Tracks past the last page are cells below the final row. A page with no audio is a visibly empty row. These stop being validation errors and become things you can see.

## Tokens

Inherit `tokens.css`, including the existing page-state colours, which this style promotes to clip states.

```css
--cell: 34px;                   /* row height at default zoom */
--col: 96px;                    /* layer column width */
--grid-line: var(--line-1);
--clip-start: var(--pg-song);      /* #354D41 a track starts here */
--clip-cont: var(--pg-song-cont);  /* #ABC4B8 same track, carried */
--clip-shot: var(--pg-lines);      /* #8A5A12 one-shots on this page */
--clip-empty: transparent;
--armed: var(--danger);            /* record-armed slot, the only red */
```

The two soundtrack states stay shades of one colour, exactly as `tokens.css` argues: same thing, different intensity.

## Type

- Jost only. No Gnomon anywhere in the studio grid — display type in a working tool is noise.
- `--fs-micro` inside cells, `--fs-xs` on headers, `--fs-sm` in the rail.
- Every number tabular. Page numbers, bar counts, durations, dB.
- Clip labels truncate with a scroll-on-hover, never an ellipsis that hides which take is loaded.

## Layout

Three regions, resizable by dragging their edges:

- **Rail**, left, 240px min: media browser with audition-in-place. Drag from here into a cell.
- **Grid**, centre, fills: sticky header of layer names, sticky first column of page numbers with a 40px page thumbnail. Rows are pages, in order. Columns are `score`, `voices` (one sub-column per cast character), `one-shots`.
- **Inspector**, right, 280px: the selected clip. Trim, fade, level, trigger offset, all as labelled discrete sliders with numeric readouts.

Zoom changes `--cell` and `--col` together. At the smallest zoom the whole comic fits without scrolling, which is the point of the whole style.

## Components

**cell** — square-cornered, 1px grid line, filled by state. Empty cells show a hairline plus sign on hover. A clip cell shows its label and duration. A continuation cell shows only a vertical bar in `--clip-cont`, so runs read as one block.

**scene launch** — a play triangle in the page-number column. Fires that page's score, voices and one-shots together, exactly as the reader will. Arrow keys move the launch point.

**layer header** — name, mute, solo, level. Solo is the fastest way to balance a mix and costs one button.

**run marker** — where a soundtrack starts, the cell takes a 2px top edge in `--clip-start`. Where it ends, a 2px bottom edge. A run is therefore readable as a bracket without reading any labels.

## Rules

- The grid is the authoring surface. If a control is not about a specific cell, it belongs in the rail or the inspector, not floating over the grid.
- Never scroll horizontally to see a page's full state. If the layers do not fit, collapse voice sub-columns into one summary column before you allow horizontal scroll.
- Audition before place, always. Dragging an unheard clip into a cell is the failure this style exists to prevent.
- No save button. Autosave with a quiet `saving… / saved`.
- Status colour lives only here. It never leaks onto reader or browse surfaces.

## Surfaces this style owns

The composer studio, the page grid, export validation, and the studio's media bay.
