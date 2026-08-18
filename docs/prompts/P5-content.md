# P5 — Content screens

13 prompts: Feed, Media explorer, Details pane (per kind), Profile, Upload. Law =
the matching screens/panels in [`../design/gallery.html`](../design/gallery.html).
Reuse P3 primitives + the P4 card renderers. Each `[UI]` is **done when** it
matches the gallery desktop + mobile and covers its states. Shared guardrails: see
[README](README.md).

---

### P5.1 [UI] — Feed shell
Header nav (Feed / Notifications / You), search field, Type + Sort dropdowns,
**layout toggle (even square grid ⇄ masonry)**, default even. Full-width. **DONE:**
the toggle switches grid modes; filters/sort drive the query args; matches the
`feed` screen. Member hue is **absent** here (public surface).

### P5.2 [UI] — Post card (per kind) + type card
One card renderer: square invisible cell (even) or natural aspect (masonry); media
by kind — image thumb, video play-overlay (`.playover`), audio waveform, text
words, **non-previewable → type card (icon + ext)**; title + author below. **DONE:**
all five kinds render; `.flp`/`.zip`/`.exe` show a type card, not a fake thumb;
click opens Details.

### P5.3 [GL] — Feed query
`works where visibility='public' and author ∈ accepted friends`, with Type/Sort
filters and `search_all(q,'feed')`. **DONE:** only public works by friends appear;
a stranger's public work does not; filters/search narrow correctly; empty state
shows "add friends to see their work."

### P5.4 [UI] — Media explorer
This server's files: search, filter dropdowns (Channel/Type/Uploader/Sort), layout
toggle, **Folders strip** (renamed from Collections — stacked-icon cover + count),
file card (leads with file name, author chip in **server colour** + channel tag),
grid multi-select + bulk bar, lightbox. **DONE:** matches the `explorer` screen;
Folders strip renders; bulk select shows the action bar; lightbox opens with a
"shared in" strip.

### P5.5 [GL] — Explorer query
`works where server_id` + `collections where server_id` (Folders), gated by
`can_view_channel` for works in private channels. **DONE:** members see the
server's files and folders; a work in a private channel is hidden from a
non-granted member; bulk actions call the right RPCs.

### P5.6 [UI] — Details pane — arena shell + audio & video
**Arena layout (CANON §C.7):** a near-full-screen split over a scrim — media fills
the left and grows, a fixed **~380px info rail** on the right, **no drop shadow**.
The rail's **top bar** holds a **functional version dropdown** + report + close.
The version control is a real dropdown (a native `<details>` is enough — no JS
framework): collapsed it shows just `v3 of 3`; **click it open** and it lists the
**full file names** per version (current highlighted) + "Add a version". A single
work has **no media arrows** (only a folder does, P5.7). Rail body: title, version
note, **rich metadata** (storage badge, uploaded-by, channel, added date, length
for a/v, dimensions/fps for image/video, format/codec/bit-depth, size, plays),
credits (server-hue chips), tags, actions (Download/Save/Open in canvas), **post
comments**. Audio/video: use the **`MediaPlayer` primitive (P3.15)** — real
play/pause, skip ±10s, seek, time, volume, fullscreen — pinned to the foot of the
media. Mobile: full-screen **column** — media ~42vh on top, rail below. **DONE:**
the pane is arena-scale (media dominates); the version dropdown actually opens and
reveals file names on click; the metadata is populated (not just 2–3 fields);
audio and video render with a working transport; the storage badge reads
correctly; mobile stacks.

### P5.7 [UI] — Details pane — image, other, folder (same arena shell)
Reuse the P5.6 arena shell; only the media area + rail specifics change. Image:
full still, no transport, no media arrows, Open in canvas. Other (non-previewable):
a **type card** (icon + ext) fills the media, versioned, **no Open in canvas**.
**Folder — the one pane with arrows over the media:** the media shows the **current
item** (preview + a small play control + "name · N of M") with **prev/next arrows**
to page items; the rail carries a clickable **navigation list** of all items
(thumb + name + type, current highlighted) plus folder meta (where, item count,
made-by, created), and **no version dropdown or tags** (items keep their own);
actions are Open folder / Download all. **DONE:** the "other" pane omits canvas;
only the folder shows media arrows and the side item-list, and paging/clicking the
list changes the previewed item; the folder omits the version dropdown and
work-only controls.

### P5.8 [GL] — Details data + actions
`works` + `version_of`/`version_note` + `content_tags` + `comments(context)` +
`saved_items` + transcode (Get-as). Storage badge reads `works.storage_source`.
**DONE:** versions list by file name; adding a tag/comment persists; Save files to
a folder; Get-as offers transcoded formats for audio; the crosspost badge shows
"Personal · crossposted" when `storage_source='personal'`.

### P5.9 [UI] — Profile header + shelves
**Square** avatar, name, @handle, bio; Add friend / Message (own → Edit). Shelf
tabs **Public / Server / Private** (counts) + Settings + **search** button.
**DONE:** the middle shelf is labelled **Server** (not Shared), uses `#i-server`;
tabs switch shelves; own-profile shows Edit + Settings; matches the `profile`
screen. No member hue on this public surface.

### P5.10 [GL] — Profile shelves query
`works` by the profile owner filtered by visibility per shelf (public / server /
private), honouring who's viewing. **DONE:** a visitor sees only Public; the owner
sees all three; counts match; search filters the active shelf.

### P5.11 [UI] — Upload sheet
Dropzone (multi-file, type recognised → icon/filter, **not a tag**), Title
(file-name default), **separate Tags and Credits** fields (Credits = type-ahead
chip input → member chip in **server hue**), **per-post Visibility** segmented,
**Which-server** picker when Server. **DONE:** matches the `Upload` panel; Credits
autocompletes handles to member chips; Which-server appears only for Server
visibility; the Server segment uses `#i-server`.

### P5.12 [UI] — Upload version mode
Flips the sheet to same-media-type ordered versions, each a **mandatory reason**.
**DONE:** version mode requires a note; rejects a different media kind; ordered by
newest.

### P5.13 [GL] — Upload write path
Presign via `api/sign.mjs` → PUT to R2 → insert `works` (visibility, server_id,
title, credits, file_ext) with the correct `storage_source`/`billing_server_id`
(native server post vs personal crosspost, CANON §D.3); version mode calls
`add_version`. **DONE:** a native server upload sets `storage_source='server'` +
`billing_server_id`; a personal→server crosspost sets `storage_source='personal'`,
`billing_server_id=null`; bytes hit the right meter (P2.15); a version requires a
note.

---

**End of P5.** Content screens are live. P6 builds the canvas — the moat.
