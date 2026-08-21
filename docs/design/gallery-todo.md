# gallery.html — pending changes

Captured 2026-08-19. These are edits to `gallery.html` (LAW). Check against
CANON before implementing each one.

## Execution order (by token cost, cheapest first)

Triage 2026-08-21. Working the list in this order; input-gated items sit at the
bottom. `[x]` = done and pushed.

1. **Docs / lists (no gallery surgery):** `[x]` #35 slash commands →
   [`slash-commands.md`](slash-commands.md); `[x]` #28 placeholder inventory →
   [`placeholders.md`](placeholders.md).
2. **Global CSS (one style-block rule each):** #48 hidden scrollbars, #45 hover
   on every button, #32 borderless play icon, #31 rectangular progress bar,
   #29 transparent previewable containers, #1 circular avatars, #26 remove
   name-card circles.
3. **Localized markup on existing screens:** #2 #3 #4 #5 #7 #16 #30 #41 (details
   pane), #6 #8 #9 #36 (folder pane), #27 (drop collaborators field), #10 (nav
   arrows), #11 #12 #13 #37 (players), #21 (unpreviewable icon), #34 (server art).
4. **New surfaces / dialogs (biggest):** #14 #15 #47 (upload), #17 #18 #19 #25
   #33 (browser features), #24 #38 (player extras), #39 #40 (share + shared
   view), #42 #43 (trash + stars), #44 #46 (storage states), #22 #23 (settings +
   state screens), #49 #50 #51 (skeletons, empties, toasts), #20 (profile POVs).
5. **Needs owner input (bottom):** brand assets B1–B8 (hand-drawn), the owner
   decisions in COLLAB §"Owner decisions still open", member-colour palette
   sign-off, and any art-vs-icon call inside #50.

## Profile pictures & identity
- [x] **1.** Every profile picture → **circle**, not square. (Consistent with the
  avatars-and-presence-dots-only rule for `round`.)
- [x] **26.** Remove the circles in the **name cards** completely. *(Clarified
  2026-08-21: this means the round **colour dot** next to a name in a tag/name chip
  — `.uchip .dot`. Member colour still reads via the coloured chip text. Presence
  dots on avatars stay.)*
- [ ] ~~**27.** Remove the collaborators / credits field completely.~~ *(RESOLVED
  2026-08-21: the **collaborators field stays** — keep it, consent-gated per CANON
  §D.3.1. No change needed. Do NOT remove it.)*
- [ ] **20.** Add profile-screen views from three POVs: **owner**, **public**, and
  **mutual** (both follow each other — some files may be mutuals-only visible).

## File details pane
- [x] **2.** Drop "32.1 MB on your storage." Instead add a **file-size row** to the
  metadata.
- [x] **3.** Remove the "Personal · Public" / "Server: Specter" **badges** — the file
  location already shows where the root is.
- [x] **4.** Fix the channel/location row: files **posted in a server** show it; files
  **uploaded directly to the File explorer** don't. (The current "Channel #sh040
  review" wording is wrong — files aren't tied to channels — but a server-posted
  file does carry its posting context.)
- [x] **30.** **Details-pane buttons** need better visual balance / spacing.
- [x] **5.** Fix discussion/comments model: files posted to a **public profile** get a
  comment section; files posted **in a server** don't. (Kill "Replies happen in
  #sh040 review.")
- [x] **7.** Remove the "Opens with FL Studio 21" **Opens-with** row entirely.
- [x] **16.** Remove the "Keeps a copy in your personal storage — dedup means it costs
  ~nothing…" explanatory blurb.
- [x] **10.** Add **navigation arrows** up top where the report flag is. Visible for
  files and posts; move back/forward between **adjacent items on the same level**.
  On a folder, arrow just moves to the next file (does **not** descend into the
  folder's contents).
- [x] **41.** Add a **Modified** date row to the metadata — and **by whom**, if
  possible / necessary.

## Folder pane
- [x] **6.** Show the **item count once** — pick a single place, remove the duplicate.
- [x] **8.** The side file list should **scroll**, no click-to-expand.
- [x] **9.** Make the side file list **navigable**: click any item to open it into the
  details pane; click through folders from the list.
- [x] **36.** Fix **audio-file thumbnails** in the folder-details side file list —
  they render messed up. (Tie to #13: audio uses the music/audio icon, not a waveform.)
- [x] **17.** Add **Save to Files** — option to save the **whole folder** or **just a
  selection**.
- [x] **18.** **Download** button: relabel to just "Download", with options to download
  the **whole folder** or **just a selection**.

## Thumbnails & placeholder images
- [x] **28.** Produce a **list of every image, video, and audio placeholder** used in
  the gallery, so a suitable placeholder can be provided for each. (Audio waveforms
  would be generated from the provided placeholders.) → [`placeholders.md`](placeholders.md).
- [x] **29.** For **previewable file types**, the **square container the thumbnail sits
  in should be transparent** (the image itself fills it — no opaque tile behind it).

## Media players & cards
- [x] **11.** Any playable media (audio + video): move the **play button to the center**.
- [x] ~~**12.**~~ *(SUPERSEDED 2026-08-21: no waveform rendering anywhere — audio is always the music icon + file type. See NEW #52.)* **12.** Audio **expanded views**: use a **high-res generated waveform** as the
  thumbnail.
- [x] **13.** Audio **cards**: square like every other card; **drop the waveform** and
  use a **music/audio icon** instead.
- [x] **24.** Players need a **speed** setting and, if possible, a **quality** setting.
- [x] **31.** Music **progress bar** → slightly **taller rectangular** design; **no
  round playhead** knob.
- [x] **32.** **Play icon** should have **no border / border color**.
- [x] **37.** **Audio player** should look **just like the video player** — progress bar
  at the bottom and everything (same control layout, not a separate audio style).
- [x] **38.** **No skip UI** for audio/video, but keep the **functionality**: a **5-second
  skip** (e.g. keyboard / gesture) with no visible skip buttons.

## Upload sheet
- [x] **14.** Better UI — too much text wraps and makes elements taller than needed.
  Tighten copy.
- [x] **15.** Add a **folder version** of the upload sheet so we can see it.
- [x] **47.** Add a **real upload button** (an actual entry point that opens the upload
  sheet, not just the sheet on its own).

## Cloud file-browser features (new screens/dialogs)
- [ ] **19.** Add missing browser features: **right-click / burger menu**, **selection
  mode**, etc.
- [ ] **25.** Show what **multiple files posted in a channel** look like — should
  **clump together** like Discord does.
- [x] **33.** Add **a lot more filters** for the File explorer.

## Servers
- [x] **34.** Servers need their **icons and covers visible beyond just the rail** —
  surface them somewhere with more presence than the rail alone.

## Sharing
- [ ] **39.** Add a **Share dialog**, **Google-Drive style** — lets the user set
  **visibility** on a file/folder.
- [ ] **40.** Add a **shared-view screen** showing what a file/folder looks like **when
  shared**: viewer can **only see what's shared**, **cannot navigate** through other
  files, **read-only**.

## Files: trash & starring
- [x] **42.** Add a **Trash** that **auto-empties after 30 days**.
- [x] **43.** Add a **starring** system.

## Storage & billing states
- [ ] **44.** Add the **storage-upgrade UI elements** and the relevant screens.
- [ ] **46.** Add a screen showing the UI when files are **read-only because storage
  isn't paid for** (over-cap / lapsed — matches CANON §D.2's "read-only, never
  deleted").

## Docs / reference
- [x] **35.** Produce a **list of slash commands**. → [`slash-commands.md`](slash-commands.md).

## Interaction & polish
- [x] **45.** **Every single button** should have a **hover animation** (no dead
  buttons — consistent hover feedback across the whole UI).
- [x] **48.** **Hide scrollbars while keeping scroll** on every scroll container
  (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) — cleaner look. Keep
  keyboard/wheel/touch scroll working; don't remove overflow. Consider a subtle
  scroll-shadow/fade at the edges so scrollability still reads.

## Missing UI states
- [ ] **49.** **Loading / skeleton states** for every async surface (stream, folder
  grid, profile, member rail, details pane) — none exist anywhere today.
- [ ] **50.** **Empty states** — empty folder, empty channel, no friends, no search
  results, **empty trash** (#42), empty/newly-created server. Icon-plus-text unless a
  brand illustration is chosen.
- [ ] **51.** **Toast / notification + upload-progress** visuals — a transient feedback
  surface (there's a bell, but no toast, no upload progress UI).

## Icons
- [x] **21.** The zip-file icon isn't centered and looks bad. Decide on the single icon
  for **unsupported / unpreviewable** files and use it consistently.

## Missing screens
- [ ] **22.** Add a **Settings** screen.
- [ ] **23.** Add more state screens: **blocked**, **pending**, etc.

## New (added 2026-08-21 by owner)
- [x] **52.** **No waveform rendering anywhere** — audio is *always* the music icon
  + file type (like a normal card), including the expanded/inline player. Supersedes
  #12 and the earlier "waveform in the expanded player" carve-out. *(Done: all 5
  remaining waveform sites — folder player, chat filecards, file-feed — now render
  the music icon + WAV; `class="wave"` count is 0. The `.wave` CSS + `generateWaveform()`
  JS are now dead and can be removed in a cleanup pass.)*
- [ ] **53.** **Channel default file-save location** — each channel has a default
  folder in the File explorer where files posted to it land (CANON: needs a
  `channels.default_folder_id` and upload/placement wiring).
- [ ] **54.** **File-type permissions per channel** — a channel can be restricted so
  only certain kinds (e.g. images or videos) may be posted there (CANON: a channel
  allow-list of `kind`s; enforced by RLS/RPC on insert, signposted in the composer).
- [ ] **55.** **Tracked vs untracked (hidden) files** — a file can be posted for
  utility in chat *without* showing in the File explorer's organised view. Hidden by
  default in the file view; a "show hidden" toggle reveals them. Keeps chat-utility
  files from cluttering the library. (CANON: a `works.hidden`/`tracked` flag + a file-view toggle.)
- [ ] **56.** **Voice-chat WIP screens** — the voice/VC surfaces need explicit
  "work in progress" states so it's clear calls aren't shipping in the beta (CANON
  already defers calls to v2; the UI should say so).
- [ ] **57.** **Per-user posting permission / post approval** — an admin can set a
  member so their posts are **hidden by default** and must be **approved** before
  they're unhidden/visible. (CANON: a per-member `posts_require_approval` flag +
  a moderation queue; enforced by RLS on read/visibility.)
- [ ] **58.** **Archiving + locked folders** — folders (and files) can be
  **archived** (kept, read-only, out of the main view) and **locked** (no edits/
  moves/deletes without permission). (CANON: `folders.archived` / `folders.locked`
  + gated write RLS.)
- [ ] **59.** **Admin panel — mass file management** — bulk delete / archive /
  manage, including **delete every post from a given user** in one action. (CANON:
  admin RPCs for bulk moderation + an audit-logged admin surface.)
- [ ] **60.** **Unify every file explorer / viewer** — the server File explorer and
  the home Feed should share the **same structure and features** (search, filters,
  viewing modes, details pane). The **only** difference: the home Feed filters to
  **friends' posts** (owner's word "people you follow" = friend, the one mutual
  relationship — CANON §A; one-way follows are dropped). Build one explorer
  component, parameterised by source.
- [ ] **61.** **Update-visibility modal** — a modal to change a **post's visibility**
  (Public / Server / Private) after the fact. Pairs with the Share dialog (#39);
  #3 removed the visibility badge, so this modal (+ Share) is where visibility is
  set/seen now.
