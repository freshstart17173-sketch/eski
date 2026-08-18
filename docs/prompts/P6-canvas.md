# P6 — Canvas suite (the moat)

16 prompts, the smallest slices in the whole plan. Law = CANON §E + the canvas
panels in [`../design/gallery.html`](../design/gallery.html) §④ (and
`?app=1#canvas`). Critique this hardest. Reuse P3 primitives. Each `[UI]` is
**done when** it matches its named gallery panel and covers its states; `[GL]`
asserts a live round-trip. Shared guardrails: see [README](README.md).

Core terminology (do not drift): canvas marks are **annotations**, NOT comments.
Three layers on a tile — the media, the annotations, the pen ink — named
separately (CANON §E.5).

---

### P6.1 [UI] — Canvas screen shell + header
Pannable/zoomable canvas surface + header: canvas picker (dropdown), visibility
chip, zoom (−/%/+/Fit/Reset), Add file, Share. **DONE:** pan/zoom work; header
controls render; matches the canvas header. The details pane **never** opens
inside the canvas (§E).

### P6.2 [UI] — Tool palette (exactly three groups)
Move · Annotate {point / rectangle / lasso} · Pen (+ whole-stroke eraser + size +
colour). **No shapes, no arrows.** **DONE:** exactly these three groups; selecting
a tool sets the cursor mode; matches the "Tool palette" panel.

### P6.3 [UI] — Tile renderer
A file as a tile: **author label top-right outside edge**, **square count badge**
(= total annotations on the post), **maximize** button, kind-aware base
(image / video frame / audio play+waveform), pen-ink overlay. **Screencap UI lives
only in the expanded view.** **DONE:** the label sits top-right outside; the count
badge is square and totals all annotations; maximize opens the expanded view; no
screencap UI on the tile.

### P6.4 [UI] — Mark: point
See the fully-expanded exemplar in [`../CODEGEN.md`](../CODEGEN.md) §3 (Exemplar A).
A single positioned dot for a `point` annotation; click → thread; states
default/hover/active/resolved/stacked; **no version number** in the thread.
**DONE:** N point rows place N dots at the right coords; click opens that thread;
resolved reads muted; matches "Mark: point".

### P6.5 [UI] — Mark: rectangle
A dotted box for a `rect` annotation; drag to draw; click → thread. **DONE:** the
box renders at the stored `path`; drawing creates a `rect`; matches "Annotation —
rectangle".

### P6.6 [UI] — Mark: lasso
A freeform closed path for a `lasso` annotation. **DONE:** the path renders and is
clickable; drawing captures the point list into `path`.

### P6.7 [UI] — Pen ink + whole-stroke eraser
Freehand ink as one row per stroke; the eraser removes a **whole stroke** (deletes
the row), size + colour controls. **DONE:** a stroke persists as one `ink` row;
the eraser removes an entire stroke, not a partial; size/colour apply.

### P6.8 [UI] — Annotation thread
Author chip (member hue), snippet, Resolve, replies, reply field — **no version
number**. **DONE:** opening a mark shows its thread; Resolve sets resolved state;
a reply posts; matches the thread panel.

### P6.9 [UI] — Annotations sidebar
Lists **every annotation** on the canvas (author, mark type, snippet, resolved);
click a row → jump to its mark + open its thread. **DONE:** all annotations
listed; clicking jumps/opens; matches the "Comments sidebar" panel (now
annotations).

### P6.10 [UI] — Expanded view — audio
Player + details + **annotations** (separate from post comments); trim a range →
**Duplicate selection** into the canvas. **DONE:** matches "Expanded view — audio";
the trim/duplicate control is present; annotations list by timecode.

### P6.11 [UI] — Expanded view — image
Full still with **point + rectangle** marks overlaid + annotation list below.
**DONE:** matches "Expanded view — image"; marks overlay at the right coords;
rows highlight their mark.

### P6.12 [UI] — Expanded view — video
Frame + transport with **timecode pins** on the scrubber; annotations anchored to
frames/regions, listed below. **DONE:** matches "Expanded view — video"; pins sit
at the right times; rows key by timecode.

### P6.13 [UI] — Canvas picker dialog
Dropdown/menu of the server's canvases + New canvas. **DONE:** lists canvases;
New canvas creates one; matches "Canvas picker".

### P6.14 [UI] — Share / visibility dialog
Private / Server / **Link** (share_code); Link shows/copies the URL. **DONE:**
switching to Link reveals a copyable URL; matches "Share / visibility".

### P6.15 [UI] — Tile ⋯ menu + empty state
Tile ⋯: remove from canvas, open details, duplicate. Empty canvas: "Nothing on
this canvas yet — drop files or add from Media." **DONE:** both match their panels;
remove-from-canvas deletes the `canvas_items` row, not the work.

### P6.16 [GL] — Live canvas + duplicate-not-copy
Subscribe `canvas:{id}` (Broadcast + Changes) → live annotations/ink; the
duplicate path **inserts a new `works`/`canvas_items` row** (audio-trim = a derived
clip), never a clipboard copy. **DONE:** an annotation added elsewhere appears
live; duplicate creates a new row; erasing a stroke reflects live.

---

**End of P6.** The moat is built. P7 does boards, DMs and notifications.
