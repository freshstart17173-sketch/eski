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
- [ ] **4.** Remove "Channel #sh040 review" — files aren't tied to channels.
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

## Folder pane
- [ ] **6.** Show the **item count once** — pick a single place, remove the duplicate.
- [ ] **8.** The side file list should **scroll**, no click-to-expand.
- [ ] **9.** Make the side file list **navigable**: click any item to open it into the
  details pane; click through folders from the list.
- [ ] **17.** Add **Save to Files** — option to save the **whole folder** or **just a
  selection**.
- [ ] **18.** **Download** button: relabel to just "Download", with options to download
  the **whole folder** or **just a selection**.

## Media players & cards
- [ ] **11.** Any playable media (audio + video): move the **play button to the center**.
- [ ] **12.** Audio **expanded views**: use a **high-res generated waveform** as the
  thumbnail.
- [ ] **13.** Audio **cards**: square like every other card; **drop the waveform** and
  use a **music/audio icon** instead.
- [ ] **24.** Players need a **speed** setting and, if possible, a **quality** setting.

## Upload sheet
- [ ] **14.** Better UI — too much text wraps and makes elements taller than needed.
  Tighten copy.
- [ ] **15.** Add a **folder version** of the upload sheet so we can see it.

## Cloud file-browser features (new screens/dialogs)
- [ ] **19.** Add missing browser features: **right-click / burger menu**, **selection
  mode**, etc.
- [ ] **25.** Show what **multiple files posted in a channel** look like — should
  **clump together** like Discord does.

## Icons
- [ ] **21.** The zip-file icon isn't centered and looks bad. Decide on the single icon
  for **unsupported / unpreviewable** files and use it consistently.

## Missing screens
- [ ] **22.** Add a **Settings** screen.
- [ ] **23.** Add more state screens: **blocked**, **pending**, etc.
