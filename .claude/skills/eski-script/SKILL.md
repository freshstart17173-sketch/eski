---
name: eski-script
description: The script-is-the-timeline style for eski. Dialogue is already text, so recording, retaking and reviewing a voice part all happen in a document, line by line, with no waveform scrubbing. Take stacks, per-line status, page markers in the margin. Grounded in Descript's text-based editing and screenplay format. Use for the voiceover studio, recording flows, review and approval of a submitted part, and the dialogue side of authoring. Trigger on "voiceover", "VA", "record", "take", "retake", "dialogue", "lines", "script", or a request to make recording feel less like audio software.
---

# eski-script

**In one line:** the dialogue is already written down, so the script is the timeline and nobody should have to scrub a waveform to find line 14.

## The reference

**Descript**, with screenplay format for the page furniture.

Descript's move is that a transcript *is* the edit. Delete a word from the text and it leaves the audio; drag a paragraph and the media moves with it. It works because speech is the one kind of audio that already has a canonical textual representation, so the text view loses almost nothing and gains random access, search, and readability.

Screenplay format contributes the rest: a character cue above their line, a parenthetical for delivery, scene headings in the margin. It is a four-hundred-year-old solution to "who says what, and how."

**Steal:**
- Text as the primary surface, audio as an attachment to a line.
- Random access by reading. You find a line by reading for it, not by scrubbing.
- Speaker blocks. All of one character's lines are visually one voice.
- Non-destructive takes. A retake stacks on the line; the old one stays selectable.
- The document is the deliverable and the editor at once. No export step between reviewing and shipping.

**Do not steal:** Descript's transcription-first assumption. eski's text is authored, not transcribed — it comes from the balloons — so there is no confidence score, no correction UI, and no waveform panel at the bottom. Also skip its filler-word removal metaphor; a performance is not a transcript to clean up.

## Why it fits eski

A voice actor's job on eski is: read these lines, for this character, in order. That is a script. Handing them a DAW, a timeline and a set of drag handles is a category error, and it is the single biggest reason a casual contributor bounces.

It also makes review tractable for the comic's author, who has to approve a submitted part. Reading a script with a play triangle on each line is a two-minute job. Listening to a forty-minute continuous track to find the one bad line is not.

## Tokens

Inherit `tokens.css`. Override toward paper:

```css
--paper: #FAFBFA;
--surface: var(--white);
--rule: var(--line-1);
--cue: var(--sage-600);          /* character cue */
--paren: var(--muted);           /* delivery direction */
--line-ink: var(--ink);
--rec: var(--danger);            /* armed and recording, only here */
--done: var(--sage-400);         /* a line with a kept take */
--gap: var(--warning);           /* a line with no take yet */
--margin-w: 92px;                /* page-number gutter */
```

Three status colours and no more: recorded, missing, recording.

## Type

- Jost throughout at `--fs-lg` for spoken lines. This style runs one step **larger** than the rest of eski, because these words get read aloud off the screen.
- `line-height: 1.75` on lines. Generous, because the eye has to hold a line while speaking it.
- Character cues: `--fs-xs`, letter-spacing `.1em`, `--cue`, sitting above their block.
- Parentheticals in italic Jost, `--paren`, indented one step.
- Page numbers in the margin, tabular, `--fs-micro`.
- Measure capped at 52ch for spoken lines. Narrower than normal reading measure, on purpose: short lines are easier to perform.

## Layout

Single column, centred, with a fixed left margin gutter of `--margin-w` carrying page numbers and panel markers. The gutter is where all structure lives so the script column itself stays clean.

A line row is: status dot in the gutter edge, the spoken text, and a right-hand rail of controls that only materialises on focus or hover. Controls never sit between the reader and the words.

The record affordance is one large fixed control at the bottom centre — space bar, in practice — that always applies to the currently focused line and advances on stop.

## Components

**speaker block** — character cue, then that character's consecutive lines. The whole block takes a hairline left edge in `--cue` so a long scene reads as alternating voices at a glance.

**line row** — the atom. Text, status dot, duration when recorded, and on hover: play, retake, and a take counter (`3 takes`).

**take stack** — expanding a line reveals its takes as sub-rows, newest first, each with a duration and a keep radio. Nothing is deleted by recording again.

**gutter marker** — page number where a new comic page begins, plus a 28px page thumbnail on hover. This is how a performer knows what they are looking at without leaving the script.

**progress strip** — a thin hairline bar at the top: recorded lines against total. Words, not a percentage — `41 of 58 lines`.

## Rules

- No waveform above the fold. A waveform appears only inside an expanded take, and only for trimming its head and tail.
- Never destructive. Recording over a line creates a take; it does not replace one.
- The space bar records the focused line. Arrow keys move between lines. A performer should be able to do a whole part without touching the mouse.
- Status is a dot in the gutter, never a colour applied to the text. The text stays black because it has to be read.
- One character per session by default. Filtering to `lena, the harbourmaster` hides every other block rather than greying it out.

## Surfaces this style owns

The voiceover studio, contributor recording flows, author review and approval of submitted parts, and the dialogue half of the authoring app.
