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

## How to use this doc

1. **Treat 🟡/❌ rows as bugs against the mental model**, ahead of net-new features — the owner's
   bar is that nothing here should feel unfamiliar.
2. The C-items are collected in [`TODO.md`](TODO.md) under **"Conventions backlog (C*)"**, roughly
   ordered by how often a user hits them. **C1 (arrow-key nav)** and **C7 (right-click a message)**
   are the loudest daily gaps; **C5 (undo)** is the biggest trust gap.
3. When you build one, tick it here *and* in the TODO, and add a QA-CHECKLIST claim (most of these
   are demo-verifiable: dispatch the key/gesture and assert the outcome).
4. Keep grounding in the real references (linked at top) rather than inventing behaviour — the whole
   point is to match what users already know.
