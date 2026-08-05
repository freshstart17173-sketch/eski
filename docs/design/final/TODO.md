# final designs — todo

Files in this folder are the agreed designs. Broadsheet is the base style —
near-white ground, near-black rules, hairlines inside a block, micro caps for
labels, gnomon on titles only, art at comic proportions, sage as the single
accent — and the shared chrome lives in `broadsheet.css`. Per-surface CSS stays
with its surface. Anything outside this folder is exploratory.

The model these surfaces are built against is `SPEC.md` at the repository root.

## next

- [ ] **soundtrack needed page.** The sibling of *voiceover needed*. Same shape:
  search, sort, filter, one dense row per entry, author and series on every row.
  Lists comics with no score rather than characters with no voice. Both hang off
  browse, and the two names have to stay parallel — *voiceover needed* /
  *soundtrack needed* — because home carries a rail for each.
- [ ] **Reader.** Nothing in this folder yet. It has to let a reader pick the
  mix (which voiceover per character, which score) and play the layers stacked.
- [ ] **`spec.html` still documents v2.** It carries a note pointing at
  `SPEC.md`; it should be rewritten to v3 once the reader plays layers.
- [ ] The open questions at the foot of `SPEC.md` — layer precedence, ducking
  across contributors, per-layer loudness, and what happens to page ranges when
  an author inserts a page.

## done

- [x] home, browse, voiceover needed, shelf, studio, profile — `home.html`
- [x] the mix (voiceovers + score) picked in the details pane — `home.html`
- [x] author studio — `studio-author.html`
- [x] composer studio, layered — `studio-score.html`
- [x] voiceover studio, with the audio bay — `studio-voice.html`
- [x] shared broadsheet chrome — `broadsheet.css`
- [x] the layered audio model and manifest v3 — `SPEC.md`
