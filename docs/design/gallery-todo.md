# gallery.html — the single gallery TODO

Captured 2026-08-19; this is the **one** live gallery backlog (the old
[`gaps.md`](gaps.md) gap-analysis is now historical reference — its items are
built or folded in below). Brand art lives separately in
[`brand-assets-todo.md`](brand-assets-todo.md); project state in
[`../../memory.md`](../../memory.md). Check against CANON before implementing.

> **The #1–#61 edit list and the gaps.md A/B backlog are done (2026-08-21/22).**
> What's left is below.

> **Missing-surface pass (2026-08-22).** Dialogs that had a live entry point but no
> target surface, now built + wired in `gallery.html` and registered in CANON.
> Batch 1: **Edit-profile modal** (Profile → Edit; §C.10), **Move-to-folder picker**
> (card ⋯ / bulk bar / details; §C.6), **Timeout modal** and **Kick/Ban confirm**
> (member popover + Moderation; §C.4 members rail). Batch 2: **Assign-roles modal**
> (popover **Roles ▸** + Members role chip — was a static panel only; §C.17/§C.4),
> **Leave-server confirm** and **Delete-server type-to-confirm** (server menu /
> Settings → General; §C.4). Also: **Edit server profile** now routes to Settings →
> General; the assign-roles role swatches were **squared** (round is avatars/dots
> only). Batch 3: **Server notification settings** (server menu → Notification
> settings — was dead; level / suppress-@everyone / mute; §C.4, adds
> `server_prefs.suppress_everyone`). Verified by screenshot in both themes,
> wire-tested, no console errors; inventory (⑤) statuses updated. Exploded-view
> standalone panels are **not** part of this pass.
>
> **Still an unbuilt feature (noted, not a dead-entry-point dialog):**
> **Crosspost to server** (details pane, inventory ⑤ 't') has no entry point at all
> — it needs a defined trigger + the personal-work→server placement flow before a
> surface can be drawn. Left for an owner call, not invented here.

## Style redesign — are.na monochrome (in progress, 2026-08-22)

Worked out in [`sandbox.html`](sandbox.html) and captured as the
[`eski-style`](../../.claude/skills/eski-style/SKILL.md) skill (tokens, buttons,
hairlines, per-screen registry, porting order). **PORTED into `gallery.html`
(2026-08-22)** — tokens, button archetypes, hairline dialogs, and the details
pane are live in the gallery; verified by screenshot (workspace, explorer, feed,
settings, detail pane, dialog) in both themes. The old `styleguide.html` is
retired — the `eski-style` skill is now the token/component source of truth.

Detail-pane refinements the owner called out — done in sandbox **and** carried
into the gallery port:

- [x] **"Posted by" is a plain text link, not a member chip** — neutral `.metalink`;
  member colour stays on names in chat / members / comments / mentions.
- [x] **No visible scrollbars anywhere** — already global in gallery; added to sandbox.
- [x] **Metadata right-aligned (are.na)** — key left / value right to the edge; denser.
- [x] **Detail pane rendered at full scale** — filling type cards; real overlay size.
- [x] **Folder nav arrows follow the button rules** — colour-change hover + invert click.
- [x] **Audio player ≈ video player** — same transport placement; audio drops speed.
- [x] **Type cards fill the media area** — unpreviewable / audio / folder edge-to-edge.
- [x] **Contributors/collaborators removed** — dropped from details pane; CANON §A marked CUT.

Remaining port polish (optional, next pass): audit round count badges vs the
square rule; convert more secondary buttons to `.ghost` text.

Standing decisions applied in this redesign (don't undo): **contributors/
collaborators removed**; monochrome + one accent (member hue, server-scoped);
round = avatars/dots only; surfaces separate by background step; modals on a
scrim, no shadow; hairlines inset, never full-width.

## Next tasks (not started)

- [ ] **Exploded-view catalog panels** — every dialog / menu / modal / popover that's
  now wired into a live screen also needs a **standalone labelled panel** in the
  catalog (sections ③/④), so each can be diagnosed in isolation. Backfill for:
  report, channel context menu, edit-channel, create-category, DM row/header menu,
  group-members modal, help/shortcuts sheet, status composer, composer autocomplete
  (/ @ # :), forward, create-channel, invite-to-server, bell dropdown, trash view,
  member popover admin block, jump-to-unread, new-DM, friends manager, notification
  levels, offline banner, billing, account-switch, onboarding. (~20 panels.) The
  gallery is an exploded view — full functionality on screens **and** labelled
  standalone panels are both the goal. *(In progress 2026-08-22.)*
- [x] **B23 — drag-reorder channels in the column** (2026-08-22). Live HTML5 drag on the
  workspace channel column (reorders within a group, drop cue + "Channel order saved"
  toast) **and** the Settings → Channels rows (the "Drag to reorder" copy is now honest).
  Also added **regular dragging** in the File explorer — drag a file card onto a folder
  (tree row or folder card) to move it (§C.6 · `move_to_folder`).
- [x] **S15 — voice "you're in the booth" mini-bar** (2026-08-22). Persistent strip at the
  foot of the channel column (mic/leave), plus the whole voice surface is marked **WIP**:
  grayed call/video buttons everywhere (workspace header, DM header, friends rows), a WIP
  **toast** when any call/video/minibar/vc control is pressed, and — per the owner —
  **the voice-chat (`vc`) interface is fully replaced** by a placeholder: a
  transparency-checkerboard grey screen with a centred icon and "This feature is currently
  being built" front and centre; the control bar stays. Voice still ships in **v2** — this
  is the signpost, not the feature.

- [ ] **Deep alignment & spacing pass** — a dedicated sweep of every screen and dialog for
  precise alignment, balance, consistent gaps/padding, type hierarchy (size *and* colour),
  and aspect ratio (per CLAUDE.md "be exacting…"). Not a restyle — a fit-and-finish audit:
  hunt for off-by-a-few-px misalignments, uneven paddings, wonky button proportions, and
  ragged edges across the whole gallery, at 1440 in both themes.

## Next galleries (not started)

- [ ] **Mobile gallery** — a **separate** gallery file for the phone layouts
  (`gallery-mobile.html`), built against the CANON §C.2 responsive contract: the
  three-pane shell collapsed to **one pane + bottom tabs**, the channel drawer,
  the members sheet, the details bottom-sheet, and every screen's narrow-viewport
  form. The desktop `gallery.html` is now mobile-free (mobile chrome removed
  2026-08-22); mobile is its own deliverable, not a responsive pass on the
  desktop file.
- [x] **Styling sandbox** ([`sandbox.html`](sandbox.html), added 2026-08-22) — a
  standalone page with **its own copy of the tokens** holding a few dialogs/modals,
  for reworking styling without touching the whole gallery. Once a direction is
  settled here, port the token/component changes into `gallery.html` and record
  them in the [`eski-style`](../../.claude/skills/eski-style/SKILL.md) skill.

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
   decisions in CANON §G (open owner decisions), member-colour palette
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
- [x] **20.** Add profile-screen views from three POVs: **owner**, **public**, and
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
- [x] **19.** Add missing browser features: **right-click / burger menu**, **selection
  mode**, etc.
- [x] **25.** Show what **multiple files posted in a channel** look like — should
  **clump together** like Discord does.
- [x] **33.** Add **a lot more filters** for the File explorer.

## Servers
- [x] **34.** Servers need their **icons and covers visible beyond just the rail** —
  surface them somewhere with more presence than the rail alone.

## Sharing
- [x] **39.** Add a **Share dialog**, **Google-Drive style** — lets the user set
  **visibility** on a file/folder.
- [x] **40.** Add a **shared-view screen** showing what a file/folder looks like **when
  shared**: viewer can **only see what's shared**, **cannot navigate** through other
  files, **read-only**.

## Files: trash & starring
- [x] **42.** Add a **Trash** that **auto-empties after 30 days**.
- [x] **43.** Add a **starring** system.

## Storage & billing states
- [x] **44.** Add the **storage-upgrade UI elements** and the relevant screens.
- [x] **46.** Add a screen showing the UI when files are **read-only because storage
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
- [x] **49.** **Loading / skeleton states** for every async surface (stream, folder
  grid, profile, member rail, details pane) — none exist anywhere today.
- [x] **50.** **Empty states** — empty folder, empty channel, no friends, no search
  results, **empty trash** (#42), empty/newly-created server. Icon-plus-text unless a
  brand illustration is chosen.
- [x] **51.** **Toast / notification + upload-progress** visuals — a transient feedback
  surface (there's a bell, but no toast, no upload progress UI).

## Icons
- [x] **21.** The zip-file icon isn't centered and looks bad. Decide on the single icon
  for **unsupported / unpreviewable** files and use it consistently.

## Missing screens
- [x] **22.** Add a **Settings** screen.
- [x] **23.** Add more state screens: **blocked**, **pending**, etc.

## New (added 2026-08-21 by owner)
- [x] **52.** **No waveform rendering anywhere** — audio is *always* the music icon
  + file type (like a normal card), including the expanded/inline player. Supersedes
  #12 and the earlier "waveform in the expanded player" carve-out. *(Done: all 5
  remaining waveform sites — folder player, chat filecards, file-feed — now render
  the music icon + WAV; `class="wave"` count is 0. The `.wave` CSS + `generateWaveform()`
  JS are now dead and can be removed in a cleanup pass.)*
- [x] **53.** **Channel default file-save location** — each channel has a default
  folder in the File explorer where files posted to it land (CANON: needs a
  `channels.default_folder_id` and upload/placement wiring).
- [x] **54.** **File-type permissions per channel** — a channel can be restricted so
  only certain kinds (e.g. images or videos) may be posted there (CANON: a channel
  allow-list of `kind`s; enforced by RLS/RPC on insert, signposted in the composer).
- [x] **55.** **Tracked vs untracked (hidden) files** — a file can be posted for
  utility in chat *without* showing in the File explorer's organised view. Hidden by
  default in the file view; a "show hidden" toggle reveals them. Keeps chat-utility
  files from cluttering the library. (CANON: a `works.hidden`/`tracked` flag + a file-view toggle.)
- [x] **56.** **Voice-chat WIP screens** — the voice/VC surfaces need explicit
  "work in progress" states so it's clear calls aren't shipping in the beta (CANON
  already defers calls to v2; the UI should say so).
- [x] **57.** **Per-user posting permission / post approval** — an admin can set a
  member so their posts are **hidden by default** and must be **approved** before
  they're unhidden/visible. (CANON: a per-member `posts_require_approval` flag +
  a moderation queue; enforced by RLS on read/visibility.)
- [x] **58.** **Archiving + locked folders** — folders (and files) can be
  **archived** (kept, read-only, out of the main view) and **locked** (no edits/
  moves/deletes without permission). (CANON: `folders.archived` / `folders.locked`
  + gated write RLS.)
- [x] **59.** **Admin panel — mass file management** — bulk delete / archive /
  manage, including **delete every post from a given user** in one action. (CANON:
  admin RPCs for bulk moderation + an audit-logged admin surface.)
- [x] **60.** **Unify every file explorer / viewer** — the server File explorer and
  the home Feed should share the **same structure and features** (search, filters,
  viewing modes, details pane). The **only** difference: the home Feed filters to
  **friends' posts** (owner's word "people you follow" = friend, the one mutual
  relationship — CANON §A; one-way follows are dropped). Build one explorer
  component, parameterised by source.
- [x] **61.** **Update-visibility modal** — a modal to change a **post's visibility**
  (Public / Server / Private) after the fact. Pairs with the Share dialog (#39);
  #3 removed the visibility badge, so this modal (+ Share) is where visibility is
  set/seen now.
