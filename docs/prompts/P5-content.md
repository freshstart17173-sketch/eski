# P5 — Content screens

12 prompts: Feed, Media explorer, Details pane (per kind), Profile, Upload. Law =
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

### P5.4 [UI] — File explorer (nested tree + views)
A **Discord-meets-Google-Drive** file system (CANON §C.6): a **collapsible nested
folder tree** in the left rail, a **breadcrumb** of the current path, and a **grid /
list / feed** view toggle (grid default). **Grid** = subfolder cards + file cards of
the *current* folder; **List** = file-manager rows (name/type/size/uploader/date);
**Feed** = the whole subtree **flattened to previewable media only** (image/video/
audio), each at natural aspect with its **comment thread inline**, newest-first
(project files like `.flp/.als` are hidden in feed, shown in grid/list). Search
(whole tree) + filter dropdowns; grid multi-select + bulk bar (**move to folder** /
download / delete); lightbox. File card leads with **file name**, uploader chip in
**server colour** + channel tag. **DONE:** matches the `explorer` screen; the tree
expands/collapses and drives the breadcrumb; the toggle switches grid⇄list⇄feed;
feed shows only previewable works with comments; bulk select shows the action bar;
lightbox opens with a "shared in" strip. Each sub-view is its own sub-prompt.

### P5.5 [GL] — Explorer query (folders + placements)
Current folder's contents = `folders where parent_id = <cur>` (subfolders) +
`works` whose **server placement** has `folder_id = <cur>` (files); the **feed**
view unions the whole subtree (recursive on `folders.parent_id`) filtered to
previewable `kind`s + their `comments(context=server)`. All gated by
`can_view_channel` for works in private channels. Moving a file/folder writes
`placement.folder_id` / `folders.parent_id` via `move_to_folder`. **DONE:** members
see a folder's subfolders + files; descending/breadcrumb requeries; feed flattens the
subtree and excludes non-previewable kinds; a work in a private channel is hidden
from a non-granted member; move persists.

### P5.6 [UI] — Details pane — arena shell + audio & video
**Arena layout (CANON §C.7):** a near-full-screen split over a scrim — media fills
the left and grows, a fixed **~380px info rail** on the right, **no drop shadow**.
The rail's **top bar** holds the **file name** + report + close (no version
dropdown — numbered versions are cut, beta 2026-08-18e). A single work (post or
file) has **no media arrows** (only a folder does, P5.7). Rail body: title, **rich
metadata** (storage badge, posted/uploaded-by, channel [server files only], added
date, length for a/v, dimensions/fps for image/video, format/codec/bit-depth,
size), collaborators (server-hue chips, consent-gated), tags.

**Post vs server file (CANON §C.7) — the same shell, two discussion surfaces:**
- A **post** is a public work (Feed/profile) drawing the owner's **personal**
  storage; the badge reads "Public · your storage", there is **no channel**, and
  the rail ends in a public **comment thread** (`comments`, context=public) + an
  add-comment field.
- A **server file** is shared in a server; it looks identical but has **no comment
  thread** — the rail shows a "Replies happen in #channel →" link (discussion is
  the chat). It **keeps tags** and collaborators. Badge "Server: NAME" (or "Personal ·
  crossposted" for a crosspost).

Audio/video: use the **`MediaPlayer` primitive (P3.15)** — real play/pause, skip
±10s, seek, time, volume, fullscreen — pinned to the foot of the media. Mobile:
full-screen **column** — media ~42vh on top, rail below. **DONE:** the pane is
arena-scale (media dominates); the file name shows in the top bar; metadata is
populated (not 2–3 fields); a **post shows the comment thread**, a **server file
shows the #channel link instead** and both keep tags; audio/video have a working
transport; the storage badge reads correctly; mobile stacks.

### P5.7 [UI] — Details pane — image, other, folder (same arena shell)
Reuse the P5.6 arena shell (incl. the post-vs-server-file discussion rule for
image/other). Image: full still, no transport, no media arrows.
Other (non-previewable): a **type card** (icon + ext) fills the media.
**Folder — the one pane with arrows over the media:** the media shows the **current
item** (preview + a small play control + "name · N of M") with **prev/next arrows**
to page items; the rail carries a clickable **navigation list** of all items
(thumb + name + type, current highlighted) plus folder meta (where, item count,
made-by, created, visibility), and **no tags or comments** (it's not a work — items
keep their own); actions are Open folder / Download all.
**DONE:** only the folder shows media arrows and the side item-list, and
paging/clicking the list changes the previewed item; the folder omits tags and
comments.

### P5.8 [GL] — Details data + actions
`works` + `content_tags` + `comments(context)` + `saved_items` + transcode (Get-as).
Storage badge reads `works.storage_source`.
**DONE:** adding a tag/comment persists; Save files to
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

### P5.11 [UI] — Upload sheet (fast by default)
**One step by default (CANON §C.12):** dropzone (multi-file, type recognised →
icon/filter, **not a tag**) → **per-post Visibility** segmented (the one required
choice) → **Which-server / folder** picker when Server → **Post**. Title auto-fills
the file name. **Tags and Collaborators collapse behind an "Add details"
disclosure** (`<details>`, no JS framework): Collaborators = type-ahead chip input →
member chip in **server hue** with an optional freeform role. So a social user
posting a meme never sees the artist fields. **DONE:** matches the `Upload` panel; a
file can be posted with only visibility set; "Add details" reveals Title/Tags/
Collaborators; Collaborators autocompletes handles to member chips; Which-server /
folder appears only for Server visibility; the Server segment uses `#i-server`.

### P5.12 [GL] — Upload write path
Presign via `api/sign.mjs` → PUT to R2 → insert `works` (visibility, title,
file_ext) with the correct `storage_source`/`billing_server_id` (native server post
vs personal crosspost, CANON §D.3); a Server upload also creates the **server
placement** with the chosen `folder_id` (default root); each collaborator writes a
`work_collaborators` row via `add_collaborator` (consent-gated, P2). **DONE:** a
native server upload sets `storage_source='server'` + `billing_server_id` and lands
in the target folder; a personal→server crosspost sets `storage_source='personal'`,
`billing_server_id=null`; bytes hit the right meter (P2.15); a credited friend is
auto-accepted, a credited stranger is pending. *(Numbered versions are cut — a new
take is just a new upload.)*

---

**End of P5.** Content screens are live. P7 builds Messages + Notifications.
