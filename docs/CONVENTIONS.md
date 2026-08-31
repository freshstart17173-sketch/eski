# CONVENTIONS — the table-stakes interactions eski must already do

The owner's standing note (2026-08-31): *"there's lots of stuff missing that falls not under
features to implement, but basic expected-behaviour things. Like the fact I had to ask for
double-click-to-open or drag-to-select is crazy. Nothing about this UI or mental model should be
that unfamiliar."*

So this doc is the **conventions bar**, not a feature list. eski borrows three well-known mental
models — **Discord** (servers · channels · chat), **Google Drive** (a file library), and the
**OS file explorer** (Finder / Windows Explorer) — and a user arrives already knowing how those
work. Every interaction they've memorised elsewhere must Just Work here, unprompted. A missing one
isn't a nice-to-have; it's a **bug against the mental model**.

Grounded in the published references (checked 2026-08-31):
[Google Drive shortcuts](https://support.google.com/drive/answer/2563044),
[Discord shortcuts & navigation](https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide),
[Windows File Explorer / Windows shortcuts](https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec),
plus macOS Finder norms.

**Status key:** ✅ have · 🟡 partial · ❌ missing. "Where" points the next agent at the code.
Missing/partial rows are tracked as **C-items** in [`TODO.md`](TODO.md) (the "Conventions backlog").

---

## A · File explorer (Google Drive + Finder/Windows) — `app/screens/explorer.js`

This is where the owner has already hit the most gaps. The model is a desktop file manager.

### Selection & opening (mouse)
| Convention | Status | Where / note |
|---|---|---|
| Single-click selects (clears others) | ✅ | `onCardClick` |
| Double-click opens (file → viewer, folder → into it) | ✅ | B26; `wireFileEl`/`wireFolderEl` dblclick |
| ⌘/Ctrl-click toggles one to the selection | ✅ | `onCardClick` metaKey |
| Shift-click selects a range | ✅ | `onCardClick` shiftKey + `lastIdx` |
| Marquee (drag a box on empty space) selects | ✅ | B10 marquee |
| Click empty space clears selection | ✅ | B15 |
| Right-click → context menu at the cursor | ✅ | P28 |
| Drag a file onto a folder → move; onto a file → make a folder | ✅ | B10 |

### Selection & opening (keyboard) — the weak spot
| Convention | Status | Where / note |
|---|---|---|
| ⌘/Ctrl-A select all | ✅ | screen `onKey` |
| Esc clears selection | ✅ | screen `onKey` |
| Enter opens the selection | ✅ | screen `onKey` (2026-08-31) |
| Delete / ⌘⌫ trashes the selection | ✅ | screen `onKey` (2026-08-31) |
| **Arrow keys move the selection** (↑↓←→ across the grid; Shift+arrow extends) | ❌ | **C1** — no roving focus at all |
| **Type-ahead: start typing a name → jump/select it** (Drive "first-letters", Finder type-select) | ❌ | **C2** |
| **F2 (or Enter on a highlighted name) renames in place** | ❌ | **C3** — rename is buried in the ⋯ menu → a rename dialog; no inline edit |
| **⌘I / Alt+Enter opens Properties/Get-Info** | 🟡 | folders got **Properties** on right-click (P23); files have no Properties, no keyboard |

### File operations
| Convention | Status | Where / note |
|---|---|---|
| New folder (button) | ✅ | exfab |
| Move (drag, or bulk "Move to folder") | ✅ | B10 + selbar |
| Star / unstar | ✅ | card star |
| Trash (bulk bar / Delete key) | ✅ | selbar + `onKey` |
| **Cut / Copy / Paste files (⌘X/⌘C/⌘V) between folders** | ❌ | **C4** — the standard non-drag move/duplicate; Drive & Finder both have it |
| **Undo the last file op (⌘Z)** — esp. an accidental move/trash/delete | ❌ | **C5** — high-trust: destructive ops with no undo feel dangerous |
| **Rename many / rename from the keyboard** | ❌ | part of **C3** |
| Duplicate a file | ❌ | **C4** (paste-in-place) |

### Navigation & view
| Convention | Status | Where / note |
|---|---|---|
| Breadcrumb path, click a crumb to jump | ✅ | `crumbPath` |
| Folder tree in a side column | ✅ | `.ftrow` tree |
| Back / Forward walks the folder history | ✅ | B25 pushState (browser Back = up a level) |
| URL reflects the open folder / file (deep-linkable) | ✅ | B25 |
| Grid / list (details) / small density | ✅ | P14 |
| Resizable tree column | ✅ | B28 |
| **Click a list-view column header to sort by it (toggle asc/desc)** | ❌ | **C6** — `.flhd` headers are static; Windows/Drive both sort on header click |
| **A drop-hint when dragging a file over a folder** | 🟡 | `.droptarget` highlight exists; verify it reads clearly |
| Drag files in from the desktop to upload | ✅ | `enableDropUpload` |

---

## B · Chat / servers (Discord) — `app/screens/workspace.js`, `app/screens/dms.js`

The model is Discord. Most of the surface is here; the gaps are keyboard + right-click parity.

| Convention | Status | Where / note |
|---|---|---|
| ⌘/Ctrl-K quick switcher (jump to server/channel/DM) | ✅ | `main.js` + `switcher.js` |
| Markdown in messages (`**b**` `*i*` `` `code` `` links) | ✅ | `renderBody` |
| Hover a message → quick actions (reply, react, ⋯) | ✅ | `messageRow` |
| Message ⋯ menu: Reply · React · Pin · Copy link · (own) Edit / Delete | ✅ | `msgMenuItems` |
| Reactions (add/remove, live) | ✅ | `toggle_reaction` |
| Reply in thread | ✅ | `onOpenThread` |
| Edit own message (Enter save / Esc cancel) | ✅ | `startEdit` |
| Typing indicator · unread bold + count · "Load earlier" | ✅ | attachLive · P19 · P20 |
| Optimistic send (message appears instantly) | ✅ | P30 (2026-08-31) |
| **Right-click a message → the same ⋯ menu** (Discord opens the context menu on right-click) | ❌ | **C7** — actions are hover-only; right-click does nothing |
| **↑ (up arrow) in an empty composer edits your last message** | ❌ | **C8** — a Discord reflex |
| **Esc cancels an in-progress edit / closes the thread pane / clears the reply** | 🟡 | edit Esc ✅; thread-pane / reply-target Esc → **C9** verify |
| **⌘/Ctrl-F search within the current channel** | ❌ | **C10** — Discord's in-channel find; only the explorer/global search exists |
| **Alt+↑ / Alt+↓ move to the prev/next channel; Alt+Shift+↑/↓ to the next *unread*** | ❌ | **C11** — Discord channel nav |
| **⌘/Ctrl-Shift-N create/join a server** | ❌ | **C12** (minor) |
| **"Jump to present" affordance when scrolled up** in a channel | ❌ | **C13** — a scrolled-up reader needs one click back to the newest |
| @mention autocomplete that resolves + notifies | 🟡 | **B12** (owner-skipped; the autocomplete inserts the display name, the trigger wants the handle) |
| A brand-new channel shows a welcome / empty state | ✅ | empty state |

---

## C · Cross-cutting (both surfaces + the shell)

| Convention | Status | Where / note |
|---|---|---|
| Every dropdown toggles (2nd click closes), opens flush under its trigger, rotates its chevron | ✅ | B8 + eski-polish §1B |
| Menus close on outside-click and Esc; modals close on scrim-click, ✕, and Esc | ✅ | `openMenu` / `openModal` |
| Click your avatar → your profile (not a menu) | ✅ | B11 |
| Copy-link everywhere puts a real URL on the clipboard + confirms | ✅ | share/permalink |
| Details/preview viewer: Esc closes, ←/→ move between items | ✅ | `details.js` |
| **A discoverable keyboard-shortcuts sheet (`?` or ⌘/)** | ❌ | **C14** — Discord & Drive both have one; also the place these shortcuts become *discoverable* |
| **Loading affordance on every async action** (no dead-feeling clicks) | 🟡 | P3/P35 in flight; P35 tracks the rest |
| Tooltips on icon-only controls | 🟡 | most have `title`; audit for gaps under **C15** |
| Focus-visible ring on keyboard focus (a11y) | 🟡 | tabs use an underline; general roving-focus ring → with **C1** |

---

## D · File browser — the deep, no-holds-barred UX audit

Owner (2026-08-31): *"I don't just mean keyboard shortcuts — I mean UI layouts and UX: what happens
when something is selected, what happens when something is dragged, how much whitespace is left for
right-clicks that aren't directly on files, etc."* So this section walks the **entire** file-browser
experience against Finder / Windows Explorer / Google Drive, dimension by dimension. Assume the model
is "a real file manager" and list everything eski doesn't yet do. New gaps get IDs **C16+**.

### D1 · Selection — the visual language
A user must always know, at a glance, *what is selected* and *that a click did something*.
- **What eski does:** grid = a 2px ink **outline on the media thumbnail only** (B16 removed the old
  corner checkbox); list = the whole **row** goes `--plate`; small = the whole **cell** goes `--plate`.
- ❌ **C16 — the selected state is weak and inconsistent.** In grid the title/uploader/tags *below*
  the thumbnail don't change, so a selected card barely reads (worse when the thumbnail is a busy
  image); and "thin outline" (grid) vs "filled block" (list/small) are two different languages for one
  state. Expected: one **tile-level selected treatment** — the whole card gets a tint/plate + a clear
  ring (Drive tints the entire tile a light blue and shows a filled check at the corner **on hover or
  when selected**), identical in spirit across all three densities. A **hover-reveal checkbox** at the
  card corner (Drive/OneDrive) that lets you build a multi-selection with pure clicks, no modifier, is
  the other half of this — discoverable multi-select without teaching ⌘-click.
- ❌ **C17 — no selection/status summary.** Finder & Windows show a **status bar**: "*128 items*",
  and when you select, "*3 of 128 selected · 412 MB*". eski shows neither a folder item-count nor a
  live selection count+size anywhere (the bulk bar only appears at 2+ and lists actions, not a
  tally). Add a persistent, quiet **status strip** (item count; on selection, "N selected · size").
- 🟡 **Selection persistence** across folder-nav/search is handled (B6), but **click-through nuance is
  missing (C18):** in Finder/Windows, mousing **down** on an already-selected item inside a
  multi-selection does **not** collapse the selection to that one item until **mouse-up without a
  drag** — so you can start a drag of all N. eski collapses on mousedown, which makes dragging a
  multi-selection from a member of it fragile. Also missing: **Select all / Deselect all / Invert
  selection** as explicit affordances (menu + the background right-click).

### D2 · Hover — progressive disclosure
- **What eski does:** grid card media lifts to `--paper1` on hover; `.cardacts` (a ⋯ + star) fade in
  on hover; list/small rows highlight to a step.
- 🟡 **C19 — hover affordances are thin/uneven.** A file manager reveals, on row/tile hover: quick
  actions (open, download, share, ⋯), the **selection checkbox** (see C16), and often a **richer
  tooltip / preview** (Drive shows a details tooltip; Finder has no hover-preview but has Quick Look).
  eski reveals only ⋯ + star on grid, and **nothing actionable on list/small hover**. Unify a hover
  action affordance across densities, and make the whole row/tile the hover target (not just the
  media). A hover **tooltip** with name + type + size + modified (for truncated names especially) is
  expected.

### D3 · Drag & drop — the full mechanic (the owner called this out directly)
This is where "a real file manager" is most felt, and eski is thinnest.
- **What eski does:** a card is `draggable`; drag ghost is a mini kind-icon (B31); dropping a file on a
  **file** makes a folder, on a **folder** moves in; drop target gets a `.droptarget` outline; marquee
  rubber-bands on empty space; OS files dropped on the **pane** upload.
- ❌ **C20 — no edge auto-scroll.** Dragging (or marqueeing) toward the top/bottom of a scrollable pane
  must **auto-scroll** so you can reach off-screen targets/items. eski does neither — a drag or a
  rubber-band stops dead at the visible edge. Table stakes.
- ❌ **C21 — no spring-loaded folders.** Hovering a dragged item over a folder for ~0.6–0.8s should
  **open that folder** (Finder/Windows) so you can drill in and drop deep, then it springs back if you
  leave. eski can only drop into a folder at the current level.
- ❌ **C22 — the drop model is too clever and under-signalled.** "Drop a file on a file → make a
  folder" is a **Finder/Drive gesture only when you pause**, and both apps show a **clear "New folder
  from selection" affordance**, not a silent behaviour. eski should: (a) distinguish *drop-into-folder*
  (a strong "this folder will receive" highlight — a filled tint, not just a 2px outline) from
  *drop-on-file-makes-folder* (needs its own explicit hint), (b) show a **drag count badge** ("3") on
  the ghost (B31 has the badge — verify it shows on multi), and (c) **not** trigger make-folder on a
  glancing hover. Also missing: an **insertion/OK vs no-drop cursor** (`dropEffect` move/copy/none) so
  the cursor tells you if a drop is legal.
- ❌ **C23 — can't drop OS files onto a specific folder** (only the pane background). Dragging desktop
  files onto a **folder card** should upload **into** that folder; onto the pane, into the current
  folder. And dragging **onto a breadcrumb crumb or a tree row** should move/upload there too.
- 🟡 **Drag out / to the OS** (drag a file out to the desktop to download) — advanced; note as a
  non-goal for now, but it's a Drive/Finder behaviour users try.

### D4 · Right-click — the zones (the owner called out "whitespace for right-clicks")
A file manager has a **different context menu per zone**, and generous empty space to invoke the
background menu.
- **What eski does:** right-click a **file** → the card menu at the cursor (P28); a **folder** →
  Open · Properties · Copy folder link (P28/P23); **empty pane** → New folder · Upload (P28).
- ❌ **C24 — the background (whitespace) menu is thin, and there may not be enough whitespace.** The
  desktop background menu (Windows/Drive) offers: **New folder, Upload, Paste, Select all, Sort by ▸,
  Group by ▸, View ▸, Refresh**. eski offers only New folder + Upload. And critically — *is there
  enough empty space to hit it?* In a full folder the grid fills the pane and the floating New-folder/
  Upload FAB sits bottom-right; a user needs **dead space** (the pane padding, the area below the last
  row) that reliably triggers the **background** menu and **clears selection** on click. Audit that the
  empty region is generous and that right-clicking it (not a card) always gives the background menu.
- ❌ **C25 — folder/file menus are incomplete & asymmetric.** A folder's right-click has no **Rename /
  Move to / Delete / Download (zip) / Share** — only Open/Properties/Copy-link. A file's menu is
  richer but should be the canonical set: **Open · Download · Rename · Move to… · Copy · Star · Share…
  · Copy link · Delete** (writer-gated). Both should also expose **Properties/Get info** (⌘I). Make the
  two menus parallel and complete.
- ❌ **C26 — no context menu on the breadcrumb, the tree rows, or (list view) the column headers.**
  Right-click a breadcrumb crumb → Open / Copy link / New folder here; a tree folder → the folder menu;
  a **column header** → Sort ▸ / choose columns (see D6).

### D5 · Rename & inline creation
- **What eski does:** rename is **⋯ menu → a dialog**; New folder is a **prompt dialog**.
- ❌ **C27 — no inline rename or inline new-folder.** F2 / Enter / slow-double-click on a name should
  turn it into an **in-place editable field** with the basename pre-selected (extension preserved),
  Enter commits, Esc cancels (this is C3 in the keyboard list — restated here as the *interaction*,
  not the key). New folder should drop an **"untitled folder" already in rename mode** in the grid,
  not a modal prompt (Finder/Windows/Drive). Modal dialogs for rename/new-folder feel foreign.

### D6 · List ("Details") view specifics
- **What eski does:** columns Name · Type · Size · Uploader · Added; folders as rows; static headers.
- ❌ **C28 — the columns are inert.** Expected: **click a header to sort by it** (toggle asc/desc with
  a caret indicator — this is C6), **drag a header border to resize**, **drag a header to reorder**,
  and a header right-click / a `+` to **choose which columns** show (add e.g. Kind, Tags, Location,
  Date-modified vs Date-added). Also: the **sort indicator** (which column, which direction) must be
  visible in the header, and rows should support the same selection/keyboard model as grid.

### D7 · Info / details on selection (docked panel vs modal)
- **What eski does:** opening a file launches a **full-screen modal viewer** (`.sheet`, `position:
  fixed; inset:0`). Selecting a file shows **no info at all**.
- ❌ **C29 — no lightweight, docked info/details panel.** Drive's **"i" info sidebar** and Finder's
  **inspector / preview column** show, for the *selected* item without opening it: a preview thumbnail,
  name, kind, size, location, owner, dates, tags, sharing. eski jumps straight to a giant overlay on
  **open**, and gives nothing on **select**. Add an optional **right-docked details panel** (toggle in
  the toolbar, `i` key) that updates live with the selection — the big viewer stays for actual
  playback/preview. This also gives files a home for **Properties** (parallel to folder Properties).

### D8 · Layout, chrome & density
- **What eski does:** left tree column (resizable, B28) · path line (breadcrumb) · toolbar (search +
  filters + view/hidden) · body grid · floating New-folder/Upload FAB · a **storage** footer under the
  tree.
- 🟡 **C30 — chrome polish gaps:** (a) **breadcrumb overflow** — `.expath .crumbs` is `nowrap;
  overflow:hidden`, so a deep path **clips** with no ellipsis/collapse; expected is a leading "…" that
  **collapses middle crumbs into a menu** (Windows/Drive). (b) No **status bar** (C17). (c) The **view
  switcher** is a dropdown (fine) but there's no **density slider** yet (P32) and no **Group-by** (P33).
  (d) A **selection action bar** that pushes content down instead of overlaying (B32) — already tracked.
  (e) Consider a **"sort & group" summary** and a **"N items" count** near the path so the view is
  self-describing.

### D9 · Empty states, loading & whitespace
- **What eski does:** "This folder is empty" and "No results" empty states (centered); a "Searching…"
  state; a "Load more" pager (P24).
- 🟡 **C31 — loading & first-paint:** no **skeleton** grid while a folder's contents fetch (a blank
  pane then a pop-in); pairs P35. And the **empty folder** state should invite the primary actions
  (drop files here / New folder / Upload) as a **drop zone**, not just text — Drive's empty folder is a
  big dashed drop target.

### D10 · Folder & file affordances (badges, icons, thumbnails)
- **What eski does:** folder icon + file-count; kind icons / content thumbnails (P14); star badge;
  locked/archived flags exist in data.
- 🟡 **C32 — affordance/badge gaps:** surface **shared** (a link exists), **hidden**, **locked**, and
  **has-tags** as small corner badges consistently (some exist, some don't render); folder cards could
  show a **stacked/preview** hint of contents (Drive shows mini thumbnails in a folder tile). Ensure
  file-type icons are **legible and correct per kind** (audio/video/image/zip/project/other) at every
  density (eski-polish §0.1 #13).

### D11 · Quick preview
- ❌ **C33 — no Quick Look.** Spacebar on a selected file should open a **fast, dismissable preview**
  (Finder Quick Look; Drive's preview on Enter/double-click) that you can **arrow through** without
  committing to the full viewer, Esc/Space closes. eski only has the heavy full-screen viewer on open.

---

## How to use this doc

1. **Treat 🟡/❌ rows as bugs against the mental model**, ahead of net-new features — the owner's
   bar is that nothing here should feel unfamiliar.
2. The C-items are collected in [`TODO.md`](TODO.md) under **"Conventions backlog (C*)"**, roughly
   ordered by how often a user hits them. Loudest daily gaps: **C16 (a legible selected state)**,
   **C1 (arrow-key nav)**, **C7 (right-click a message)**, **C29 (info panel on select)**, and the
   **drag mechanics C20–C23** (auto-scroll · spring-load · drop signalling · drop-into-folder). Biggest
   trust gap: **C5 (undo)**. §D (the file-browser deep audit) is where the owner's frustration lives —
   work it top-to-bottom. Note: the §D items are interaction/look-and-feel, so most carry the mandatory
   **3-versions-then-owner-picks** rule (see TODO's UI-change workflow) — the keyboard C-items (C1–C13)
   are mostly non-visual and shippable without it.
3. When you build one, tick it here *and* in the TODO, and add a QA-CHECKLIST claim (most of these
   are demo-verifiable: dispatch the key/gesture and assert the outcome).
4. Keep grounding in the real references (linked at top) rather than inventing behaviour — the whole
   point is to match what users already know.
