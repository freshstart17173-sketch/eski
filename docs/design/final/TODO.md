# final designs — todo

Two styles, one for each half of the product.

**Broadsheet** dresses everything you read — home, browse, needed, details,
profile, the reader. Near-white ground, near-black rules, hairlines inside a
block, micro caps for labels, gnomon on titles only, art at comic proportions,
sage as the single accent. `broadsheet.css`.

**Workbench** dresses the three studios. Same palette, same square corners, but
hierarchy comes from surfaces rather than hairlines, and colour means one thing:
which of the four kinds of sound this is — bed, score, effects, voice — one
legend, used identically in all three tools. `studios/studio.css`, geometry in
`studios/base.css`.

All three studios share one frame: **bay on the left** when there are files to
place, **the page in the middle** at the size you would actually look at it,
**the panel on the right** where the work happens, and **a row of pages along
the bottom** — just pages, no tracks under them, the current one taking a
border.

The model these surfaces are built against is `SPEC.md` at the repository root.

## next

- [ ] **The composer studio needs a lot of work.** The frame and the style are
  settled; the interaction is not. Known gaps: no way to hear the stack (you can
  preview one clip but not the page); no fades or crossfades anywhere, though
  the manifest has them; nothing expresses "this bed ducks under dialogue"; two
  clips on one layer can overlap with nothing deciding which wins; the cue rail
  can only be filled from the bay, not recorded into; and there is no way to see
  a range as a shape now that the lanes are gone — only as "pages 7–13" in a
  row. That last one is the real open question.
- [ ] **UX pass on all three studios.** The workbench layout is a decision about
  shape and style, not a finished interaction.
- [ ] **Profile**, absorbing the shelf: reading and read become sections of it
  alongside parts performed and scores composed. Broadsheet, with a little
  colour and personality.
- [ ] **Reader.** It has to let a reader pick the mix (which voiceover per
  character, which score) and play the layers stacked.
- [ ] **`spec.html` still documents v2.** It carries a note pointing at
  `SPEC.md`; it should be rewritten to v3 once the reader plays layers.
- [ ] The open questions at the foot of `SPEC.md` — layer precedence, ducking
  across contributors, per-layer loudness, and what happens to page ranges when
  an author inserts a page.

## done

- [x] home, browse, shelf, studio, profile — `home.html`
- [x] the mix (voiceovers + score) picked in the details pane — `home.html`
- [x] **needed**, one page with two tabs: voiceover needed and score needed.
      Browse no longer carries a "needs a voice" filter — that axis lives here.
- [x] author studio — `studios/author.html`
- [x] composer studio — `studios/score.html`
- [x] voiceover studio — `studios/voice.html`
- [x] the workbench style picked over press and console; the other two skins and
      the picker are gone
- [x] one frame for all three studios: page centre, bay left, panel right, a row
      of pages at the foot
- [x] sound effects are an author-written entry type, and unfilled ones arrive
      in the composer's panel as a worklist on the page they belong to
- [x] the page-crop bug (a percentage height resolving against a parent sized by
      the image) — fixed in `studios/base.css`
- [x] the layered audio model and manifest v3 — `SPEC.md`
- [x] `.slide-list` — the hover-nudge list from the final index, kept in
      `broadsheet.css` for reuse
