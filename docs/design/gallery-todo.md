# gallery.html — pending changes

Captured 2026-08-19. Not started yet. These are edits to `gallery.html` (LAW).
Check against CANON before implementing each one.

## Profile pictures & identity
- [ ] **1.** Every profile picture → **circle**, not square. (Consistent with the
  avatars-and-presence-dots-only rule for `round`.)
- [ ] **26.** Remove the circles in the **name cards** completely.
- [ ] **27.** Remove the **collaborators / credits** field completely.
- [ ] **20.** Add profile-screen views from three POVs: **owner**, **public**, and
  **mutual** (both follow each other — some files may be mutuals-only visible).

## File details pane
- [ ] **2.** Drop "32.1 MB on your storage." Instead add a **file-size row** to the
  metadata.
- [ ] **3.** Remove the "Personal · Public" / "Server: Specter" **badges** — the file
  location already shows where the root is.
- [ ] **4.** Fix the channel/location row: files **posted in a server** show it; files
  **uploaded directly to the File explorer** don't. (The current "Channel #sh040
  review" wording is wrong — files aren't tied to channels — but a server-posted
  file does carry its posting context.)
- [ ] **30.** **Details-pane buttons** need better visual balance / spacing.
- [ ] **5.** Fix discussion/comments model: files posted to a **public profile** get a
  comment section; files posted **in a server** don't. (Kill "Replies happen in
  #sh040 review.")
- [ ] **7.** Remove the "Opens with FL Studio 21" **Opens-with** row entirely.
- [ ] **16.** Remove the "Keeps a copy in your personal storage — dedup means it costs
  ~nothing…" explanatory blurb.
- [ ] **10.** Add **navigation arrows** up top where the report flag is. Visible for
  files and posts; move back/forward between **adjacent items on the same level**.
  On a folder, arrow just moves to the next file (does **not** descend into the
  folder's contents).
- [ ] **41.** Add a **Modified** date row to the metadata — and **by whom**, if
  possible / necessary.

## Folder pane
- [ ] **6.** Show the **item count once** — pick a single place, remove the duplicate.
- [ ] **8.** The side file list should **scroll**, no click-to-expand.
- [ ] **9.** Make the side file list **navigable**: click any item to open it into the
  details pane; click through folders from the list.
- [ ] **36.** Fix **audio-file thumbnails** in the folder-details side file list —
  they render messed up. (Tie to #13: audio uses the music/audio icon, not a waveform.)
- [ ] **17.** Add **Save to Files** — option to save the **whole folder** or **just a
  selection**.
- [ ] **18.** **Download** button: relabel to just "Download", with options to download
  the **whole folder** or **just a selection**.

## Thumbnails & placeholder images
- [ ] **28.** Produce a **list of every image, video, and audio placeholder** used in
  the gallery, so a suitable placeholder can be provided for each. (Audio waveforms
  would be generated from the provided placeholders.)
- [ ] **29.** For **previewable file types**, the **square container the thumbnail sits
  in should be transparent** (the image itself fills it — no opaque tile behind it).

## Media players & cards
- [ ] **11.** Any playable media (audio + video): move the **play button to the center**.
- [ ] **12.** Audio **expanded views**: use a **high-res generated waveform** as the
  thumbnail.
- [ ] **13.** Audio **cards**: square like every other card; **drop the waveform** and
  use a **music/audio icon** instead.
- [ ] **24.** Players need a **speed** setting and, if possible, a **quality** setting.
- [ ] **31.** Music **progress bar** → slightly **taller rectangular** design; **no
  round playhead** knob.
- [ ] **32.** **Play icon** should have **no border / border color**.
- [ ] **37.** **Audio player** should look **just like the video player** — progress bar
  at the bottom and everything (same control layout, not a separate audio style).
- [ ] **38.** **No skip UI** for audio/video, but keep the **functionality**: a **5-second
  skip** (e.g. keyboard / gesture) with no visible skip buttons.

## Upload sheet
- [ ] **14.** Better UI — too much text wraps and makes elements taller than needed.
  Tighten copy.
- [ ] **15.** Add a **folder version** of the upload sheet so we can see it.
- [ ] **47.** Add a **real upload button** (an actual entry point that opens the upload
  sheet, not just the sheet on its own).

## Cloud file-browser features (new screens/dialogs)
- [ ] **19.** Add missing browser features: **right-click / burger menu**, **selection
  mode**, etc.
- [ ] **25.** Show what **multiple files posted in a channel** look like — should
  **clump together** like Discord does.
- [ ] **33.** Add **a lot more filters** for the File explorer.

## Servers
- [ ] **34.** Servers need their **icons and covers visible beyond just the rail** —
  surface them somewhere with more presence than the rail alone.

## Sharing
- [ ] **39.** Add a **Share dialog**, **Google-Drive style** — lets the user set
  **visibility** on a file/folder.
- [ ] **40.** Add a **shared-view screen** showing what a file/folder looks like **when
  shared**: viewer can **only see what's shared**, **cannot navigate** through other
  files, **read-only**.

## Files: trash & starring
- [ ] **42.** Add a **Trash** that **auto-empties after 30 days**.
- [ ] **43.** Add a **starring** system.

## Storage & billing states
- [ ] **44.** Add the **storage-upgrade UI elements** and the relevant screens.
- [ ] **46.** Add a screen showing the UI when files are **read-only because storage
  isn't paid for** (over-cap / lapsed — matches CANON §D.2's "read-only, never
  deleted").

## Docs / reference
- [ ] **35.** Produce a **list of slash commands**.

## Interaction & polish
- [ ] **45.** **Every single button** should have a **hover animation** (no dead
  buttons — consistent hover feedback across the whole UI).
- [ ] **48.** **Hide scrollbars while keeping scroll** on every scroll container
  (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) — cleaner look. Keep
  keyboard/wheel/touch scroll working; don't remove overflow. Consider a subtle
  scroll-shadow/fade at the edges so scrollability still reads.

## Icons
- [ ] **21.** The zip-file icon isn't centered and looks bad. Decide on the single icon
  for **unsupported / unpreviewable** files and use it consistently.

## Missing screens
- [ ] **22.** Add a **Settings** screen.
- [ ] **23.** Add more state screens: **blocked**, **pending**, etc.
