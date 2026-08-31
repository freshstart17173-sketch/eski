# eski — MASTER TODO (the one list + the runbook)

This is the **single entry point**. If someone says *"pick up where I left off"*, start here:
do the **Start here** ritual, take the **top unchecked item** in the Work Queue, build it,
**test it the deterministic way below**, commit + push to `preview`, tick the box, and append
a `BUILDLOG.md` entry. Detail lives in [`BUGLOG.md`](BUGLOG.md) (triage), history in
[`BUILDLOG.md`](BUILDLOG.md), the test method in [`VERIFICATION.md`](VERIFICATION.md), the
owner's live checklist in [`QA-CHECKLIST.md`](QA-CHECKLIST.md), and the perf/correctness/simplicity
playbook in [`OPTIMIZATION.md`](OPTIMIZATION.md). **CANON wins** on any conflict.

---

## Start here (every session — do this first)

1. **Branch + get on the true tip (do this before reading anything).** Develop on **`preview`**
   and push there — it deploys to `preview.eski.lol`. **Always start by syncing to origin's tip,
   including when it was force-updated.** The SessionStart hook fast-forwards a strictly-behind
   clone, but a **forced update** rewrites origin so the clone *diverges* — the hook only warns,
   it will not reset. So run this every session:
   ```
   git fetch --all --prune
   git checkout preview
   # clean tree + fresh remote clone → adopt origin's tip even on a forced update:
   git reset --hard origin/preview
   ```
   (`reset --hard` is safe here because a cloud session is a throwaway clone with no
   human-authored local-only commits; if you *have* made unpushed commits this session, rebase
   them onto `origin/preview` instead of discarding them.)
   If `preview`'s PR was already merged, restart it from the default branch (same name) per
   the repo's branch rules — never stack new work on merged history.
2. **Cold-start ritual.** Read [`BUILDLOG.md`](BUILDLOG.md) (Current state + the newest dated
   entries) and [`VERIFICATION.md`](VERIFICATION.md) (**mandatory before any RLS/write test**).
   Then `git log --oneline -8`, and via the **Supabase MCP** (project id
   **`zidqagrmxeawpasurpwi`**) `list_migrations` + `list_tables` so the schema in your head
   matches the DB.
3. **Conventions.** Load the **`eski-style`** skill before any styling. Search for a
   token/selector/name **before** defining it (this repo has shipped duplicate selectors).
   One canonical name per concept. Colours only from tokens. `--r` (3px) chrome radius; round
   is avatars/presence-dots only. Modals darken a scrim, no shadows.
4. **Take one item.** Pick the top unchecked box in the **Work Queue**. Do that one (or a
   tight batch), test, commit, push, tick it here, and append a `BUILDLOG.md` entry
   (DONE + commit sha + any migration name; NEXT; GOTCHA).

## How to test deterministically (this is the whole point)

- **Backend (schema / RLS / writes / RPCs):** follow [`VERIFICATION.md`](VERIFICATION.md)
  exactly. The trap: an RLS `INSERT` whose check is inline `col = auth.uid()` (works,
  placement, content_tags, saved/starred_items, share_links, comments) returns `42501`
  **non-deterministically** over the MCP connection — **never call that a bug from one run.**
  Reliable signals: `SECURITY DEFINER` RPCs and helper-gated policies tested live under
  `set local role authenticated`; **service-role row-shape checks** (insert the exact row the
  frontend sends as the service role — constraints/triggers/FKs still fire); and static policy
  reads (`select ... from pg_policies`). Wrap every harness in a `do $$ … raise exception 'X:%',
  res; … $$` block so it **rolls back** — the live DB must stay at its real accounts/servers
  only. Owner = `dexterekayu@gmail.com` = `0de00000-0000-4000-8000-000000000001`, owns server
  `5fb2b16e-8b55-4d89-aa78-2db873785e66` (channels general/wips/references).
- **Frontend layout:** the sandbox can't reach `preview.eski.lol`, but the **demo path proves
  render**. Serve the repo and drive headless Chromium (already at
  `/opt/node22/lib/node_modules/playwright`, no install) against `http://localhost:PORT/?demo=1`;
  screenshot the surface and read it. Also `node --check <file>` for syntax, and load the module
  in the page asserting **zero `pageerror`**. A green screenshot proves **layout, not live data
  flow** — say "renders", not "works". (Template harness at the bottom of this file.)
- **Live-only (upload, realtime, pfp/icon propagation, drag-drop, anything session-gated):**
  not sandbox-reachable. Verify the backend half with the method above, syntax-check + trace the
  frontend half, and **add/keep a concrete claim in [`QA-CHECKLIST.md`](QA-CHECKLIST.md)** for
  the owner to confirm on preview. Never present a demo screenshot as proof of a live path.

## 🎨 UI-change workflow (owner rule, 2026-08-29 — MANDATORY for every visual change)

**Every UI change must be produced as THREE distinct versions, batched, and shown to the owner
to pick from — do not just ship one.** Applies to any visible change: a restyle, a new
screen/dialog/component, a density pass, a layout rework, a card/viewer redesign. Procedure:

1. Build **3 genuinely different takes** (V1/V2/V3) of the change — not three tweaks of the same
   idea; vary the actual approach (layout, density, hierarchy, treatment).
2. **Batch-render** all three (demo screenshots, both themes, at 1440) — e.g. behind a
   `?v=1|2|3` switch, three sibling files/routes, or three published artifacts — so they can be
   compared side by side.
3. **Show the owner and let them pick.** Ship only the chosen one (then clean up the other two).

Pure-backend / non-visual work (RPCs, data wiring, bug fixes with no visual delta) is exempt —
this rule is about **look**. When in doubt whether a change is "visual," treat it as visual and
make the three versions.

## Definition of done (per item)

Verified the right way for its kind → committed to `preview` with a clear message →
pushed → box ticked here → `BUILDLOG.md` entry appended. Honest status only: "backend-verified
(service-role shape)", "renders in demo", or "needs live QA — claim added" — never a bare
"works". **For any UI change, the 3-versions-then-owner-picks rule above is part of "done".**

---

## The Work Queue

Four categories. Within each, ordered **easiest first**, and anything that depends on another
item is placed **after** what it needs. Cross-category dependencies are called out inline.
IDs are stable handles (`B*` broken-UI, `K*` backend, `P*` polish, `D*` deferred, `C*` conventions —
the table-stakes interactions audited in [`CONVENTIONS.md`](CONVENTIONS.md)).

### ⏱ Sorted by estimated completion time (open items only)

The open items, ordered **shortest job first**. Rounds 1–10 shipped (K11 streaming upload, P22
per-file tag/rename, B14 media keep-alive, explorer URL state, P24 real search + P21/B19, P14
densities, the wordmark fix). **Round-11 (2026-08-30) is the current backlog** — a search/filter
model overhaul, a density slider, a profile rework, a perf pass, and interaction/polish fixes; full
detail in the Round-11 section below. Ticking one here = ticking it in its category below.

| Est. | ID | What | Kind |
|---|---|---|---|
| ~~30m~~ | ~~**B36**~~ | ✅ `.expath` was `--surface` on `--paper` chrome — a stray lighter bar in dark | done |
| ~~30m~~ | ~~**B34**~~ | ✅ `.loadearlier{display:flex}` beat the UA `[hidden]` — restated the rule | done |
| ~~1.5h~~ | ~~**B32**~~ | ✅ bulk-action bar now OVERLAYS the toolbar (absolute inset:0 child) — zero grid shift on select | done |
| ~~2h~~ | ~~**B35**~~ | ✅ file/server search — was FTS-whole-word-only; added filename substring (p27) | done |
| ~~2h~~ | ~~**B31**~~ | ✅ .panebody user-select:none + mini kind-icon drag ghost | done |
| ~~2.5h~~ | ~~**B30**~~ | ✅ viewer stayed-open on refocus — auth re-emit was forcing a full re-render | done |
| ~~3h~~ | ~~**B33**~~ | ✅ one top-left click-toggle star (grid + list); killed the colliding corner check | done |
| ~~3h~~ | ~~**P28**~~ | ✅ openMenu gained an at:{x,y} cursor spawn; file/folder/empty-pane menus | done |
| ~~3h~~ | ~~**P33**~~ | ✅ facet dropdowns removed; grid Sort-by + Group-by; list column-click sort; small view cut | done |
| ~~2h~~ | ~~**P23**~~ | ✅ folder tags (p28) + UI (owner picked V1); one follow-up: upload subfolder rows (P22) | done |
| ~4h | **P31** | one modifier-based search everywhere (channel msg ↔ server file) | med-hard |
| ~4h | **P35** | loading animations everywhere; replace the spinning search icon | med |
| ~4h | **P36** | crop/zoom modal for pfp/banner/icon uploads | med-hard |
| ~5h | **P37** | multi-file download → preserve folders + zip into one archive | med-hard |
| ~5h | **P34** | real modifier system + UI hints | med-hard |
| ~4h | **P38** | click-a-tag-to-filter (retire the filter facet UI) · two click surfaces on typed tags · tag ✕ only in details | med-hard · tag-session |
| ~5h | **P29** | profile rework (drop visibility tabs · Settings button · presence/status→settings w/ save · modifier search bar) | hard |
| ~~6h~~ | ~~**P32**~~ | ✅ density SLIDER — list + 5 grid stages, `--tile`-driven re-column, eased card chrome | done |
| ~6h | **P27** | filtering (folder-scoped) ≠ searching (deep, Reddit-style folder modifier) | hard · refines P24/P26 |
| ~6h | **P30** | perf pass — search/message-send/context-switch slow; two-phase logo boot | hard |
| ~6h | **K12** | search indexing (metadata-inclusive) so search is fast | hard · pairs P30 |
| ~15m | **B9** | verify a channel upload shows as a chat file card | live-QA (owner) |
| — | **B12** | @mentions: composer autocomplete + resolve/notify | med-hard · **owner-skipped** |

**Round-11 clusters:** search/filter (**B35 → P27 · P31 · P34 · K12**, with **P33** filters + **P32**
slider on the explorer) · media/messages (**B30 · B34**) · selection (**B31 · B32 · B33 · P28**) ·
profile (**P29**) · perf (**P30**) · polish (**P35 · P36 · B36**) · downloads (**P37** — multi-file zip).

**Tag session — the click-to-filter/colour half was pulled forward and folded into the P27/P34 pass
above (owner 2026-08-31: "fold this in with p38 too"); the rest (bulk tag editing, tag management UI)
stays deferred —**
- [x] **P38 · Click-a-tag-to-filter — done.** Clicking a tag chip commits a modifier to the search
      rail (`commitModifier`) instead of jumping anywhere — narrows the current context. **Retires
      the separate filter facet UI** (P33 already dropped the dropdowns; this is the replacement
      affordance). 4 call sites wired: docked info panel, `openDetails`, `folderTagPreview`,
      `openFolderProperties`. Refines P27/P33/P34.
- [x] **Two click surfaces on a typed tag — done.** `tagChip()` in `app/tags.js`: the `.ty` (type)
      span commits `hastag:<type>` (matches ANY value of that type); the value span commits the
      exact `type:value`. An untyped grey tag has one surface, committing `tag:<value>`. New
      `clickableSpan()` helper gives each surface `role="button" tabindex="0"` + click/Enter/Space.
- [x] **Custom tag types — done.** `parseTag`/`makeTag` no longer gate on the curated `TAG_TYPES`
      list — ANY `word:value` is now a typed tag. `tagColor(type)` returns the curated `--tt-*` var
      for the 5 curated types, else a deterministic hashed hue: `hashHue(str)` (`h=(h*31+charCode)
      >>>0; h%360`) feeding `oklch(var(--tt-l) var(--tt-c) <hash>deg)` — same L/C tokens as the
      curated set (theme-swap handles light/dark for free, no JS dark-mode branch). Verified
      deterministic (same string → same hue across two calls) and that curated types still resolve
      to their fixed `--tt-*` var rather than being hashed.
- [ ] **Tag removal moves to detailed view only — mostly already true, one open case.** Audited: the
      ✕-to-remove affordance was already details-pane-only everywhere EXCEPT the folder Properties
      popover, which still lets you remove a tag inline. Judgment call made this pass: left as-is —
      the Properties popover functions as the folder's own "detail view" (a folder has no separate
      details-pane concept the way a file does), so this doesn't read as a violation of the rule.
      Flagged here in case the owner disagrees on a future pass.
- [ ] Bulk tag editing / a tag-management screen — still fully deferred, not started.

**Deferred — do NOT build now** (post-beta / infra-gated): D1 (feed+commenting, after P4),
D7 (report/moderation), D2 (storage/billing, needs Stripe), D3 (audit log), D5 (required tags
per channel, builds on P11), D6 (review canvas/kanban/versions).

### 🧭 Conventions backlog (C*) — table-stakes interactions users already expect

Owner (2026-08-31): the site is missing **basic expected-behaviour** things (like double-click-to-open
and drag-to-select, which had to be asked for). eski borrows Discord + Google Drive + the OS file
explorer mental models, so every interaction a user knows from those must Just Work, unprompted. Full
audit (have / partial / missing, with code pointers + reference links) in
[`CONVENTIONS.md`](CONVENTIONS.md). Open items, loudest-first:

| ID | Convention (missing/partial) | Surface |
|---|---|---|
| ~~**C1**~~ | ✅ arrow-key roving nav of the grid/list (↑↓←→ geometry-based; Shift+arrow extends a range) — 2026-08-31 | explorer |
| **C7** | Right-click a message → the same ⋯ menu (actions are hover-only today) | chat |
| **C5** | Undo the last file op (⌘Z) — move/trash/delete have no undo (trust gap) | explorer |
| **C3** | Inline rename (F2 / Enter on the name), not only the ⋯→dialog | explorer |
| ~~**C2**~~ | ✅ type-ahead — typing a name selects+scrolls to it; repeated letter cycles that initial (800ms buffer) — 2026-08-31 | explorer |
| ~~**C8**~~ | ✅ ↑ in an empty composer edits your last message (Discord reflex) | chat |
| **C10** | ⌘/Ctrl-F search within the current channel | chat |
| **C4** | Cut/Copy/Paste files (⌘X/⌘C/⌘V) between folders; duplicate | explorer |
| ~~**C6**~~ | ✅ click a list column header to sort (closed by P33) | explorer |
| **C11** | Alt+↑/↓ prev/next channel; Alt+Shift+↑/↓ next unread | chat |
| **C13** | "Jump to present" affordance when scrolled up in a channel | chat |
| **C14** | A discoverable keyboard-shortcuts sheet (`?` or ⌘/) — also makes C1–C13 discoverable | shell |
| ~~**C9**~~ | ✅ Esc closes the thread pane (edit-Esc already worked) | chat |
| ~~**C12**~~ | ✅ ⌘/Ctrl-Shift-N create/join a server | shell |
| **C15** | Tooltip + focus-ring audit on icon-only controls (a11y) | cross-cutting |

**File-browser deep-UX gaps** (see [`CONVENTIONS.md`](CONVENTIONS.md) §D — the owner's "layouts, selection,
drag, whitespace" ask). These are look-and-feel/interaction, so most carry the **3-version-pick** rule:

| ID | Gap (file browser) | § |
|---|---|---|
| ~~**C16**~~ | ✅ selected card is now the WHOLE tile (`--plate` fill + 2px ink ring), consistent across densities (`.card.sel`, content.css) — reconciled 2026-08-31 (was already built) | D1 |
| ~~**C17**~~ | ✅ quiet status strip at the pane foot — "N items" / "N selected · size" + current sort (`.exstatus`/`updateStatus`) — reconciled 2026-08-31 (was already built) | D1/D8 |
| ~~**C18**~~ | ✅ Select all / Deselect all / Invert in the background menu (over files + folders); ⌘A now includes folders. Click-through already held — selection is on click (mouseup) and native drag suppresses it, so a multi-drag from a member survives (B10/B31). — 2026-08-31 | D1 |
| **C19** | Hover affordances thin/uneven — whole row/tile is the hover target; reveal actions + checkbox + a name/size tooltip on all densities | D2 |
| ~~**C20**~~ | ✅ marquee now auto-scrolls near the pane edge too (native drag already did) | D3 |
| **C21** | **Spring-loaded folders** — hover a dragged item over a folder ~0.7s → it opens | D3 |
| ~~**C22**~~ | ✅ drop signal — target fills+rings with a pill ("Move N here" / "New folder") and a move cursor (`.droptarget`, explorer.js drag handlers) — reconciled 2026-08-31 (was already built) | D3 |
| **C23** | Drop OS files onto a **specific folder** (and a crumb / tree row), not only the pane | D3 |
| ~~**C24**~~ | ✅ desktop-style background right-click menu (New folder · Upload · Select all · Sort by ▸ · Group by ▸ · View ▸) at the cursor — reconciled 2026-08-31 (was already built; Paste pends C4) | D4 |
| ~~**C25**~~ | ✅ folder menu gained Rename/Move to…/Delete (Share + Properties already existed); Download still missing — folded into **P37** (needs the zip infra to download a folder meaningfully) | D4 |
| **C26** | Context menus on the breadcrumb, tree rows, and list column headers | D4/D6 |
| **C27** | Inline rename (F2/Enter/slow-click, basename pre-selected) + inline "untitled folder" in rename mode — not modal dialogs | D5 |
| **C28** | List headers inert — click-sort (+caret), drag-resize, drag-reorder, choose columns | D6 |
| ~~**C29**~~ | ✅ docked info panel on select (right column, `i` toggles; reuses details.js metaRows) — the big viewer still opens files — reconciled 2026-08-31 (was already built) | D7 |
| ~~**C30**~~ | ✅ deep breadcrumb collapses the middle to a "…" menu (root › … › parent › current); last 2 crumbs stay — 2026-08-31. (Count/sort near the path already live in the C17 status strip.) | D8 |
| ~~**C31**~~ | ✅ empty folder is a dashed **drop zone** ("Drag files here to upload") — 2026-08-31. Skeleton grid is N/A by architecture (one bundle load, instant client-side folder nav; server search shows the P35 indeterminate bar). | D9 |
| ~~**C32**~~ | ✅ corner status badges — Hidden + Public on files, Locked on folders (bottom-right, clear of star/⋯) — 2026-08-31. has-tags is redundant (tag chips already show in the footer); per-kind icons already correct + the ext label (WAV/PNG/ALS/ZIP). | D10 |
| ~~**C33**~~ | ✅ Quick Look — Space on a selected file opens the viewer, Space/Esc closes, ←/→ arrow through — 2026-08-31 | D11 |

*(Already closed while auditing: double-click-open (B26), drag-to-select/marquee + drag-to-move (B10),
right-click menus at the cursor (P28), ⌘A / Esc / **Enter-opens** / **Delete-trashes** (2026-08-31),
optimistic send (P30), viewer ←/→ + Esc. These are the baseline the C-items build on.)*


> ### 🟣 Round-7 (owner test, 2026-08-29) — DENSITY, file-browser rework + functional fixes
> Big polish + fix pass. Overarching theme: **densify everything and standardize chrome** — the app
> currently reads "tablet-sized". Load **`eski-style`** then **`eski-polish`** before the visual work.
> Sorted below:
> - **P12** Global **density** pass on **modals · dialogs · toasts** — kill excess vertical space,
>   oversized headers/footers; a popup shouldn't eat the page. Fixes alignment/spacing too.
> - **P18** **Standardize header + panel sizes & colours** app-wide (consistency; ties into P12).
> - **P13** File-channel **header flattening** — the bar above the filters (breadcrumb/`.panehd`)
>   shouldn't sit on its own row; move it down into the toolbar and **drop the server-name label**
>   (adds nothing). ALSO ensure a **path/breadcrumb viewer up top** (currently "missing").
> - **B10** **Drag-to-select** (marquee) AND **drag-and-drop still don't work** — dragging a file
>   onto another file should **create a folder** from them (Finder/Drive gesture).
> - **P14** **File-browser view modes = real density levels.** Traditional file-browser densities;
>   at larger sizes a **content thumbnail** replaces the icon, but keep a **thin (THIN) bottom band**
>   with the kind icon (audio/video/image/folder/zip/other) + filename (+ info if room) — like the
>   **landing-page cards** (screenshot `docs/design/…` / the landing if needed).
> - **B11** Clicking **my pfp** should go **straight to my profile**, not open a dropdown.
> - **P15** **Status moves to the profile page**: a **text field only** (drop the emoji+text combo)
>   + the **red/yellow/green presence** picker tied to presence levels, made **denser**.
> - **B12** **@mentions don't actually work** — autocomplete + real mention resolution/notify.
> - **P16** **Upload progress → loading animations** (not "Hashing…"/"Posting…" text), and the
>   upload should be **minimizable halfway** (Google-Drive style) so you keep working.
> - **P17** **Copy density**: drop the "(optional)" after "Add details"; **remove any control tip
>   that stops being useful after the first time** (first-run hints only).
> - **K10** **Make the storage tracker actually work** (the meter — real used/cap bytes).
> - **P19** **Unread-message indicator** on a channel (a notification UI element showing new msgs).
>
> ### 🟠 Round-5 (owner test, 2026-08-29) — UPLOAD UX + share/filtering/screens rework
> Owner feedback after round-4 shipped. **Fixed same session (small, unambiguous):** the upload
> file-picker couldn't select files — the hidden `<input type=file>` was `display:none`, which
> Chromium/Brave refuse selection on in some flows → now visually-hidden (**B7**); **Post → Upload**
> button label; dropped the useless **"Draws X's storage"** line; **removed the per-channel Files
> tab** (redundant with the server explorer + channel-upload messages — the chat-message half of B5
> stays). Everything else is captured below, sorted:
> - **B7** ✅ upload picker can't select (display:none input) — done.
> - **B8** folder / "Root folder" picker: first click expands, **second click doesn't close** it.
> - **B9** channel upload must appear **in the chat as a clickable file message** that opens the
>   detail view — B5 already builds this; verify it live once the picker fix deploys.
> - **P6** declutter the upload sheet: **Visibility is contextual** — a personal upload (esp. from
>   inside a server) probably wants a folder, not a public/private choice; only surface Visibility
>   when it's meaningful. Keep Root-folder default. (Storage line + Post label already handled.)
> - **P7** **redesign the Share dialog** (screenshot): sharing to **Public/Private makes no sense**
>   — to "share publicly" you save to your files and make that copy public. The dialog is just the
>   **link** (Google-Drive style: "anyone with the link", copy). PLUS: let a link **reference an
>   older file/folder in the channel chat** (like a reply) — an **eski file/folder link pasted in
>   chat renders as a native file card** that opens the viewer, not a raw URL.
> - **P8** **real file-type filtering + searchable filters.** The Type filter should offer **actual
>   file types** (.wav/.flp/.png…), not just broad Images/Audio/Video/Text/Projects. The
>   **Uploader / Tag / (etc.) filters need a search box** so you can find a value fast instead of
>   scrolling a flat list.
> - **P9** the **folder/file share view must look identical to the file browser** — same selection,
>   filtering, search, and view modes. Today the shared-folder viewer (K9) is a bare grid; reuse the
>   real explorer component (read-only) so it matches. Currently "looks empty".
> - **P10** **Server settings is its own SCREEN**, not a dropdown menu — one full-screen settings
>   surface containing all of it (overview/icon/cover, roles & permissions, **audit log**, members/
>   moderation, join requests, notifications, delete). Reverses the current modal-per-item approach
>   from the server menu. (Promotes/reframes the old **D4** "full-screen Server-settings port".)
> - **P5** (already listed) covers **"Messages + Friends = one screen"** — the owner restated it:
>   friends shouldn't be behind a button, it should be one DMs surface like any messaging app.
> - **cleanup** the now-dead `filesPanel` fn + the channel-files fetch in `loadWorkspace` (fed the
>   removed Files tab) — the B5 attachment-in-chat resolution stays. Do in the P6/P8 pass.

> ### 🔴 Round-4 (owner test, 2026-08-29) — UPLOAD & FILE AREA + a backend-reliability alarm
> The owner reported **uploads "literally don't work at all except for pfp and banners."** Root
> cause + fixes below; this round also opened a broader mandate: **"literally every file type
> should be accepted"**, **Google-Drive-style folder/file sharing + a request-to-join-server
> button**, a **selection/filtering** rework, and **"look over any backend code — things that
> look like they work then don't (server icon + banner) are incredibly annoying; catalogue every
> non-working action here before starting, and document anything you learn so the next agent
> doesn't fuck up."**
>
> **🚨 THE BACKEND-RELIABILITY FINDING (read this before touching any write path).** The upload
> failed because **every `INSERT` into `works` returns `42501` ("new row violates RLS")** on the
> live DB — **zero work rows had ever been created for anyone.** It is **real, consistent, and
> specific to the `works` table**: in one authenticated session an `INSERT` into `servers`
> (`owner_id = auth.uid()`) **succeeds** while an `INSERT` into `works` (`author_id = auth.uid()`)
> **fails**, with the BEFORE trigger disabled, and with the `WITH CHECK` expression evaluating to
> **TRUE** when computed by hand for the exact row (a spy trigger confirms `auth.uid()` resolves
> and every conjunct is true). Static analysis, a service-role row-shape insert, and a spy trigger
> **all say "allowed"** — yet it is denied. **`docs/VERIFICATION.md`'s "trap #1" (treat a works
> 42501 as a flaky MCP artifact) is WRONG and masked a total outage** — corrected there now.
> **Rule going forward:** a write that "looks like it works" is only proven by a **live row that
> actually lands** (`select count(*)` on the table), never by "no error." A profile `UPDATE` that
> matches no RLS row returns **0 rows and no error** — that is exactly why pfp/banner *looked*
> fine. **Prefer a `SECURITY DEFINER` RPC for every load-bearing write** (the reliable path); the
> direct-table writes in `app/data.js` are the suspect surface catalogued in **K8**.
>
> **Shipped this round:** upload write moved to the atomic `create_work` RPC (**K7**, fixes the
> 42501); **every file type accepted** (allowlist → safe-shape ext check); `.flp`/DAW/AIFF
> recognition. **New intake:** **B5** (channel Files tab always empty), **B6** (selection UX),
> **K8** (backend write audit + catalogue), **K9** (Drive-style folder/file sharing +
> request-to-join), and the **K2** icon/banner confirm-or-fix.

### 1 · Fixes for broken UI

- [x] **B1 · Scrim-click closes every modal.** Clicking the dark backdrop (where you clicked to
      open) should dismiss any modal; today some don't. Fix once in the modal primitive.
      *Done (renders in demo):* single modal instance enforced in `openModal` (a new top-level
      modal closes any open one, so no stray scrim sits behind it and eats the backdrop click);
      the one deliberate nest (move-picker → New-folder) opts out via `nested:true`. Also capped
      `.modal` height + made its body scroll so a content-tall modal (Upload/Roles/Move) no longer
      overflows the viewport — ✕, footer, and backdrop stay on-screen. 12/12 headless asserts pass
      (both themes); Modal primitive verifier green.
      *Files:* `app/ui.js` (`openModal`), `styles/primitives.css`. *Easy.*
      *Test:* demo screenshot — open a modal, click the scrim, assert it's gone (`document.querySelector('.modal')===null`); repeat for upload/settings/status.
- [x] **B2 · No URL breaks on rename.** A profile handle change must `replaceState` to `/u/<new>`
      and every Profile link must use the new handle; server/channel URLs are id-based (safe) —
      confirm and cover any gap. *Files:* `app/screens/profile.js`, `app/data.js`, `app/router.js`.
      *Easy.* *Done (renders in demo):* the rename→`/u/<new>` `replaceState` + `updateProfile`
      cache-clear were already in place; every self-profile link derives from `data.me.handle`
      (refreshed on reload) and server/channel URLs are id-based (confirmed in `router.js`). The
      **gap fixed:** the editor is now also opened from `/settings`, where the unconditional
      `replaceState('/u/<new>')` hijacked the address bar and bounced the user onto their profile
      on the on-close reload — now guarded to only follow the URL when actually on `/u/<oldHandle>`.
      6/6 headless asserts pass (rename on profile follows the URL to profile; rename from settings
      stays on settings; neither 404s).
- [x] **B3 · Message permalink (Copy link) works.** *Done (demo-verified) — found already built by a
      prior session and confirmed end-to-end this pass.* `⋯ → Copy link` builds `msgPermalink` (the
      canonical `/s/:id/c/:ch?m=<id>`, from `data.server`/`data.channel` not `location`), `workspaceView`
      parses `?m=` into `focusMsg`, and `flashMessage` (RAF-deferred) scrolls the row into view + adds
      the one-shot `.flash` pulse (`styles/shell.css` `@keyframes msgflash`). Verified: arriving at
      `/s/lb/c/beats?m=m3` finds the row, adds `.flash`, and scrolls it into view (inView:true), 0
      pageerrors. *Files:* `app/screens/workspace.js`. **Caveat:** works while channel messages load
      unbounded (they're all present); a permalink to an older message becomes unreachable once **P20**
      paginates the stream — P20 must add the load-earlier / fetch-by-id path to keep permalinks whole.
- [x] **B4 · Directly-typed `/create` · `/upload` · `/settings` open their modal over the shell.**
      *Done (demo-verified both themes).* `/settings` already resolved to the User-settings screen;
      the gap was `/create` and `/upload`, which weren't in `IN_SHELL` so they hit the "not yet
      ported" placeholder. Added a branch in `renderRoute` (before the placeholder fallthrough) that
      renders the **Feed as the backdrop shell** then opens the modal (`openCreateServer` / `openUpload`),
      exported `openCreateServer` from `shell.js`. The modal route is ephemeral so it `replaceState`s
      to `/` (the backdrop's own path); `openModal`'s single-instance guard (B1) makes a stray
      re-render just re-show the same modal. *Files:* `app/main.js`, `app/shell.js`. Verified: demo
      `/create` mounts the New-server modal over the Feed with the scrim; `/upload` renders the Feed
      backdrop (upload sheet is session-gated → opens on preview); 0 pageerrors both themes.
- [x] **B5 · Channel Files tab is always empty + a channel upload doesn't appear in the channel.**
      *Done (backend role-sim-verified + demo render).* (1) `loadWorkspace` now fetches the works
      whose placement carries the active channel_id, shapes them via `shapeWork`, and sets
      `data.files` + `channel.files` — the per-channel Files tab shows them (was hardcoded
      `files:[]`). (2) A channel upload now **also posts a message** carrying the file:
      `messages.work_id` added (schema-24, migration `p14_channel_upload_message`), `create_work`
      inserts that message atomically when a file is uploaded into a channel, and loadWorkspace +
      the realtime `liveInsert` resolve `work_id` → the attachment card, so it shows in the chat
      stream too. (3) Fixed a latent bug found on the way: `workspace.js` still had a **stub**
      `openDetails` that toasted "viewer lands in P5" — every workspace file card (chat attachments
      AND the Files tab) opened a dead toast instead of the real details pane the explorer already
      used; now wired to the real `screens/details.js` viewer. Verified: role-sim as the owner —
      channel-placed work is readable (1 row) and `create_work` into a channel lands work + 1
      message with work_id (both rolled back); demo renders the Files tab (4 cards, both themes) and
      a card click opens the real `.sheet` details pane; 0 pageerrors. Live R2 round-trip + the
      realtime attachment echo to *other* clients are live-only → QA-CHECKLIST.
      (round-4, owner: "uploaded to a channel — file didn't show in the channel, didn't show in
      that channel's Files tab; only showed in the server Files explorer.") **Root cause found:**
      `loadWorkspace` (`app/data.js`) hardcodes **`files: []`** and `channel.files: 0` — the
      per-channel **Files** tab (`filesPanel`, `app/screens/workspace.js:429`) reads `data.files`,
      so it can NEVER show anything. Wire `loadWorkspace` to fetch the works placed in the active
      channel (`placement.surface='server' AND channel_id=<channel>` → join `works`), shape them
      like the explorer (`shapeWork`), and set `channel.files` count. **Separately decide** whether
      attaching a file in the composer should also post a **message** into the chat (today the
      composer attach just opens the upload sheet → `create_work` with the `channel_id` placement;
      it posts no message, so the file is invisible in the chat stream). *Files:* `app/data.js`
      (`loadWorkspace`), `app/screens/workspace.js` (filesPanel + composer). *Medium.* *Test:*
      backend — service-role read of works by channel placement; live QA — upload in a channel,
      confirm it lands in that channel's Files tab (+ chat if we choose to post a message).
- [x] **B6 · Selection UX — Drive-like (owner: single-click-select / double-open "sucks ass").**
      *Done (demo-verified, 4/4 + persistence):* (1) the bulk bar now opens **only on multi-select
      (2+)** — a plain click selects quietly, no options bar; (2) selection **persists across leaving
      + returning** (a module-level store keyed by source+server, restored on re-mount — verified via
      real client-side nav; a hard browser refresh still clears, which is fine); (3) **clicking an
      empty area of the pane clears** the selection; and repaintBody no longer wipes selection on
      filter/search/folder-nav (only prunes deleted ids). Single-select's actions live on the card ⋯
      + the details pane. *Files:* `app/screens/explorer.js`. **Filtering audit (Type/Channel/
      Uploader/Tag/Date/Sort/Starred) is still open — fold into a follow-up.** Original ask kept below:
      (1) **selecting must NOT auto-spawn the bulk
      options bar** — the `.selbar` pops on the first selection today; hold it back (e.g. only on a
      real multi-select, a right-click/⋯, or make it a calmer inline affordance). (2) **Selection
      must persist when you leave and return to the tab / navigate** — today it clears (state lives
      in the per-render `state.selection` and is rebuilt). (3) **Clicking an empty area of the pane
      deselects** (Drive behaviour) — today only Esc/⌘-click toggles. (4) Reconsider the whole
      single-click-selects / double-click-opens model — the owner dislikes it; pick a model that
      doesn't fight the above. *Files:* `app/screens/explorer.js` (selection controller ~L316–L410,
      the `.selbar`, the card click handlers, `state.selection`). *Medium-hard.* Overlaps **P?**
      selection/filtering; do together. *Test:* demo — click a card → selected, no bulk bar pops;
      click empty area → deselected; navigate away + back → selection persists; multi-select still works.
- [x] **B7 · Upload file-picker couldn't select files (round-5 blocker).** The hidden
      `<input type=file>` (picker + folderPicker) was `display:none`, which Chromium/Brave refuse
      file selection on in some flows — the native dialog opened but a pick never registered. Now
      visually-hidden (`position:fixed;left:-9999px;opacity:0`, still in the DOM + clickable).
      *Files:* `app/screens/upload.js`. *Done (syntax-checked; upload is session-gated so it's
      live-only — owner confirms on preview).*
- [x] **B8 · Folder / "Root folder" picker won't close on a second click.** *Done (demo-verified).*
      Root cause was global, not upload-specific: `openMenu` always closed-then-reopened, and the
      outside-click handler ignores the anchor, so a second click on the trigger just flickered the
      menu closed+open. Added a toggle guard — if the anchor's menu is already open
      (`aria-expanded="true"`), close and return. Fixes **every** dropdown. *Files:* `app/ui.js`
      (`openMenu`). Verified: demo — a toolbar dropdown opens on click 1, closes on click 2, 0 pageerrors.
- [ ] **B9 · Channel upload → clickable file message in the chat.** A file uploaded to a channel
      should show in the stream as a file card that opens the detail/expanded view. **B5 already
      builds this** (messages.work_id → attachment card → real details pane); verify it end-to-end
      once B7 lets uploads through on preview. *Live QA.*
- [x] **B10 · Drag-to-select + drag-and-drop don't work (round-7).** *Done (demo-verified both
      gestures).* (a) **Marquee**: a pointer drag starting on empty pane space rubber-band-selects the
      cards it covers (Shift/⌘ adds to the current selection); the trailing click is suppressed so the
      selection survives, and 2+ opens the bulk bar. (b) **Drag-a-file-onto-another → make a folder**:
      file cards are `draggable`; dropping one onto another **file** opens the New-folder prompt and
      (on submit) creates the folder + moves both in (`makeFolderFrom` → `createFolder` +
      `moveToFolder`); dropping onto a **folder** card **moves** the dragged files into it
      (`moveInto`). Multi-drag when the grabbed card is part of a 2+ selection. Both handlers live on
      the persistent `.panebody` (survive a repaint); read-only shared views are exempt. *Files:*
      `app/screens/explorer.js` (marquee + native-drag handlers, `makeFolderFrom`/`moveInto`, gridView
      `draggable` + folder `data-folder-id`), `styles/content.css` (`.marquee`/`.card.droptarget`,
      `.panebody` position:relative). Verified: headless — a marquee over 4 cards selects 3 + persists +
      opens the bulk bar; dragging f1 onto f2 opens the prompt and creates a "Drums pack" folder from
      both; 0 pageerrors. Live move persistence (moveToFolder) is the same RPC used by the bulk
      Move-to-folder → already covered; the drag path just calls it.
- [x] **B11 · Clicking my pfp opens a dropdown, should go to my profile (round-7).** *Done.* The
      left-rail profile button now navigates straight to `/u/<me>` (no dropdown). Its old items are
      already reachable: Profile = the destination, Settings = the profile's Settings tab, Sign out
      = User settings → Account; Status moves to the profile in **P15**. *Files:* `app/shell.js`.
- [ ] **B12 · @mentions don't actually work (round-7).** *SKIPPED by owner 2026-08-30 (do later).*
      The composer `@` autocomplete + posting a real mention that resolves/notifies the person.
      **Root cause FOUND (not yet fixed):** the DB trigger `messages_fanout` (schema-14) resolves
      **`@handle`** (looks up `profiles.handle`), but the composer autocomplete (`maybeAutocomplete`,
      `workspace.js`) inserts **`@` + the display name** (`p.name`) and filters by name only — so a
      display name with spaces/casing never matches a handle → no `mentions`/`notifications` row.
      **Fix when resumed:** insert `@` + `p.handle`, filter by name OR handle, label as "name ·
      @handle"; optionally hue the rendered `@handle` by looking the member up by handle. The
      `mentions` table + notify trigger already work. *Files:* `app/screens/workspace.js`
      (`maybeAutocomplete`, `mdToHtml`). *Medium-hard.*
- [x] **B14 · Media keeps playing across navigation (round-8; owner clarified 2026-08-30 — NO dock).**
      *Done (lifecycle headless-verified: keeps playing off-screen, re-adopts on reopen at position,
      paused-close stops; 0 pageerrors).* Owner clarified they do **not** want a persistent mini-player
      dock — they want media to **keep playing (full audio) when you switch app sections and resume
      where it left off** when you come back. Root cause: the details viewer built a fresh player each
      open, and a nav (`renderRoute`→`closeDetails`) tore it down → reopening restarted at 0:00. New
      **`app/player.js`** owns the single live player OUTSIDE `#stage`: the viewer plays THROUGH
      `playInto`; on close-while-playing the SAME wrap is parked in a hidden, **off-screen but still-
      in-document** host (`.playerkeep`) so the browser keeps it playing (a *removed* media element is
      force-paused per the HTML spec — so it must stay attached, not be detached); reopening the file
      **re-adopts** the live wrap inline at its current time. A paused/ended file just stops on close.
      The visible **mini-dock UI is written but PARKED behind `DOCK_ENABLED=false`** ("save the code
      for later"). `MediaPlayer` got a `resyncHead()` hook (restart the rAF head loop after a reparent).
      *Files:* `app/player.js` (new), `app/ui.js` (`resyncHead`), `app/screens/details.js` (`fillMedia`
      plays via `playInto`; `closeDetails`→`onViewerClosing`), `styles/primitives.css` (`.playerkeep` +
      parked `.pdock`). **Note:** auto-reopening the file's viewer on return rides on the URL-state work
      (open file/folder in the URL) — see B25/link work; keep-alive already makes the audio continuous.
      **Corrected 2026-08-31 (owner: "media keeps playing even when the detailed view is closed —
      wrong behaviour").** The single `closeDetails()` had been wired to EVERY close path — ✕, Esc,
      backdrop, AND the app-navigation teardown in `main.js` — so an explicit dismiss parked/kept-
      playing the media exactly like a nav did, which reads as "it won't stop." Split it: `closeDetails()`
      (✕/Esc/backdrop/any in-pane action that closes the viewer) now calls `player.stop()` — a hard
      stop; a new `closeDetailsForNav()` (main.js's route teardown ONLY) keeps calling `onViewerClosing()`
      — the original park-and-resume behaviour, preserved for real navigation. `openDetails()`'s own
      internal "clear any stale sheet" step no longer touches the player at all (a new `closeSheetDom()`)
      since `playInto`, called moments later in the same open, already owns the adopt-vs-restart
      decision — calling `stop()` there first would have killed the "reopen the same file, resume where
      you left off" case navigation relies on. *Files:* `app/player.js`, `app/screens/details.js`,
      `app/main.js`. Verified (module-level, a real playable WAV via network intercept): nav-close keeps
      it playing + connected + adopts on reopen (unchanged); explicit close pauses + disconnects it
      (the fix); a full-UI smoke test confirms ✕/Esc/backdrop all still close the sheet, 0 pageerrors.

> ### 🟢 Round-8 (owner test, 2026-08-30) — media-player, explorer nitpicks + tag/metadata search
> Nitpicks + a search-model change captured mid-session (owner: "stop, tokens almost done — add all
> of this + past incomplete tasks to the master todo"). **Not yet built.** Sorted below.

- [x] **B15 · Blank-space click in the explorer must deselect (round-8).** *Done (verified working).*
      The empty-area click-clear (B6/B10) **does** fire — headless: select a card → click a verified-empty
      `.panebody` point → selection goes 1→0. Added a defensive reset of the B10 marquee `suppressClear`
      flag on each new `pointerdown` so a stale flag can never eat a clear-click. *Files:*
      `app/screens/explorer.js`. If the owner still sees a selection stick, it's likely a specific spot
      (the click landing on the floating exfab buttons or a card's padding) — needs the exact location.
- [x] **B16 · The "weird white square top-left" = the file-card SELECTION CHECKBOX (round-8/10).**
      *IDENTIFIED (owner screenshot, round-10):* it's `.cardsel`, the selection checkbox at a card's
      top-left. It only shows when the card is **selected** (`.card.sel`); a single click selects, so
      the box appeared and read as a mystery white square (in dark mode `--ink` is near-white).
      **Fix (in progress):** drop the checkbox square — a selected card is already shown by the
      `.card.sel .media` ink outline, so selection stays visible without the confusing square.
      *Files:* `app/cards.js` (drop `.cardsel`), `styles/content.css`. *Easy.* (Also see **B26** —
      making folder-open double-click reduces accidental single-click selects.)
- [x] **B17 · Smooth playhead scrubbing on the media player (round-8).** *Done.* The playhead was
      driven only by `timeupdate` (~4×/s → visible jumps). Now a **`requestAnimationFrame` loop**
      updates the fill/knob while playing (reading `media.currentTime`, which advances continuously),
      for 60fps motion; the loop self-stops on pause/ended/removal (`wrap.isConnected`), and
      `timeupdate` still paints seeks-while-paused. *Files:* `app/ui.js` (`MediaPlayer`). 0 pageerrors.
- [x] **B18 · Skip buttons grouped on the right (round-8).** *Done (unit-verified).* Transport
      reordered to **`[cur · seek · tot · (skip-back skip-forward) · mute · fullscreen]`** — the two
      skip buttons now sit together on the right in a `.dmskips` group (was rew on the far left, ff
      after the track). *Files:* `app/ui.js` (`MediaPlayer`), `styles/primitives.css` (`.dmskips`).
- [x] **P21 · Tag/metadata SEARCH MODIFIERS — replaces the P11 Tag-type filter facet (round-8).**
      *Done (folded into P24; demo-verified + backend role-sim).* The **"Tag type" facet dropdown is
      removed** (`state.tagTypes` gone). Modifiers are typed straight in the explorer search bar,
      parsed by `parseQuery()`: **`bpm:120`** (a known tag TYPE before the colon → an exact typed-tag
      filter), **`hastag:bpm`** (files carrying any tag of that type), **`sortby:bpm_desc` /
      `_descending` / `name_asc` / `size_desc` / `latest` / `oldest`** (sort, incl. tag-value sort).
      A recognised modifier **tints the search field** (`.hasmod`). Applied both client-side (the
      loaded set) and server-side (search_files args). *Files:* `app/screens/explorer.js`
      (`parseQuery`/`parseSortBy`, facet removal, `sortFiles` tag-value sort), `styles/primitives.css`
      (`.searchbar.hasmod`). **Supersedes the P11 Tag-type facet.**
- [x] **B19 · Free-text search must include TAGS (round-8).** *Done (demo-verified — "drums" matches a
      file tagged drums with no "drums" in its name).* A bare term now matches the filename OR any of
      the file's tags, client-side (`(w.tags||[]).some(t => t.includes(term))`) and server-side
      (search_files unions the filename FTS with a `content_tags` ILIKE). *Files:*
      `app/screens/explorer.js`, `schema-35-search-files.sql`. Folded into P24.

> ### 🟢 Round-9 (owner test, 2026-08-30) — upload perf/UX at scale, explorer + rail nitpicks
> Owner is about to upload **gigabytes**; captured for the master todo. **Not yet built.** Sorted below.

- [x] **B20 · Upload chip: inverse colour + don't cover / align with the exfab buttons (round-9).**
      *Done (demo-verified).* `.uplchip` is now **inverse** (`background:var(--ink);color:var(--on-ink)`,
      bar fill on-ink), **right-edge aligned** with the exfab (`right:var(--s5)`, matching the exfab's
      inset) and **lifted above** the New-folder/Upload cluster (`bottom:56px`, clears the ~44px button
      row) so it never covers them. *Files:* `styles/primitives.css`. Verified: chip bg = ink,
      right:24px, bottom:56px.
- [x] **B21 · Server sometimes missing on load — needs a reload (round-9).** *Done (root-caused).*
      `loadRail` cached its result **even when the `server_members` read returned null from a transient
      error** → an empty rail (no servers) got cached and served until a manual reload. Now it only
      caches when **both reads succeeded** (`!smRes.error && !profRes.error`); on any error it skips the
      cache so the next render retries the fetch instead of serving a bad empty snapshot. *Files:*
      `app/data.js` (`loadRail`). `node --check` clean. Live confirmation on preview → the reload
      symptom should be gone.
- [x] **B22 · No active-server indicator in the rail (round-9).** *Done (demo-verified).* The rail
      already set `.railbtn.on` (ink fill) on the active server, but that fill is **hidden behind a
      server's uploaded icon image**, so icon-servers showed no active cue. Added a Discord-style
      **left-edge pill** (`.railbtn.on::before`, a 3×20 ink bar) that reads regardless of icon/initials;
      excluded on the Feed logo + avatar (they keep their own active treatment). *Files:*
      `styles/shell.css`. Verified: the selected server shows the pill, 0 pageerrors.
- [x] **K11 · Large-file upload must not freeze the page or eat memory (round-9).** *Done
      (hash cross-verified against crypto.subtle + demo load, 0 pageerrors; live GB round-trip →
      QA).* Root fix: hashing no longer reads the whole file. New **`app/hash.js`** carries a
      **chunked incremental SHA-256** (`sha256File`) — reads the file in **8 MB `file.slice()`
      windows**, updates a pure-JS SHA-256 state, drops each window, so live memory is ~one chunk
      not the whole file (WebCrypto has no streaming digest, so `crypto.subtle` can't do this).
      The digest is **byte-identical** to `crypto.subtle`'s SHA-256 (verified against the FIPS
      "abc" vector, the empty digest, and random buffers across every chunk/block boundary), so a
      blob still dedups by the same `<sha>.<ext>` R2 key. Also added **`mapLimit`** and capped both
      **hashing** and the **PUT** loop at **3 concurrent** (was `Promise.all` over the whole folder —
      one socket per file + every file on the heap at once); each blob ref is dropped when its PUT
      settles. Hashing now drives the **0–15%** progress band by real bytes so a multi-GB file
      doesn't sit at 0% through its whole hash. *Files:* `app/hash.js` (new — `sha256File`,
      `mapLimit`), `app/screens/upload.js` (`doPost` hash + PUT phases; removed the old
      whole-file `sha256Hex`). Live multi-GB upload (no freeze, bounded memory) is session-gated →
      QA-CHECKLIST.
- [x] **P22 · Per-file tag + rename list in the upload sheet (multi-file / folder) (round-9).** *Done
      (per-row editors verified independent + demo load 0 pageerrors; live upload → QA).* `renderChosen`
      now renders **every file as an editable row**: an inline **rename** input (edits the work title
      only — never the folder path, so a folder upload keeps its tree) + its **own `tagEditor`** (P11),
      captured per-index in `fileMeta[i]` (`getTitle()`/`getTags()`). `doPost` reads each file's own
      title + tags from `fileMeta` (was one shared Title + Tags; a structured folder used to carry no
      tags at all — now each file carries its own). The old single Title/Tags fields are **removed**
      from "Add details"; that pane is now just **Collaborators** and only shows for a single loose
      post (where a collaborator has one work to attach to). List DOM is capped at 60 rows for a huge
      folder — files past the cap upload with their own name + no tags (noted in the row). *Files:*
      `app/screens/upload.js` (`renderChosen` editable rows + `fileMeta`; `doPost` per-file title/tags;
      `syncVis` toggles the collaborators pane), `styles/content.css` (`.chosenrow` column layout +
      `.chosenname` + per-row tag-editor compaction). Live per-file tag/rename on a real upload →
      QA-CHECKLIST. Pairs with **P23** (folder rows get their own tags next).
- [x] **P23 · Tag folders (no inheritance) (round-9).** *Done — backend role-sim-verified (migration p28);
      UI built in 3 versions, **owner picked V1** (2026-08-30) + refinements, demo-verified both themes.* A
      **folder** carries its own tags with **no propagation** to its files. **Backend**
      (`schema-37-folder-tags.sql`): a `folder_tags` table with a nullable FK to **both** folder kinds
      (server `folders` + personal `save_folders`) + a check that exactly one is set (row cascades with its
      folder); DEFINER-helper-gated RLS (`folder_tag_readable`/`folder_tag_writable` mirror the folders' own
      fences — server = member/manage_channels, personal = owner); `add_folder_tag`/`remove_folder_tag`
      DEFINER RPCs (idempotent, fence re-checked). Role-sim: owner tags server + personal folders; both-
      targets rejected; remove →0; non-member write refused; stranger reads 0 (RLS); 0 leftover, 0 ERROR
      advisors. **UI (V1 + owner refinements):** `loadExplorer` (server + personal) reads `folder_tags` into
      `folder.tags`; the large card shows the **first 3 tags on ONE line** (untyped = grey chip, typed =
      coloured) + a **"+N"** chip → the **Properties popover** (also on the folder right-click menu) which
      lists/edits ALL tags (file count + removable chips + a colon-aware add input); **list view** shows a
      few tags inline after the folder name; **small/icon view stays tag-free**. Every large card now
      `display:flex;height:100%` so a row's cards are all the tallest card's height (fixes the "wonky"
      tiling), and the card tag line is single-line so tags never grow a card. Clicking a tag searches the
      library (P26). Writer-gated (server=isAdmin, personal=owner, shared read-only). Verified: large + list
      + Properties, both themes at 1440, 0 pageerrors / 0 icon warnings. **Upload (pairs P22):** a folder
      upload's sheet now shows a **tag-editor row per subfolder** ("Folder tags" section, same row pattern
      as the per-file list); on post, after the tree is recreated (`buildFolderTree` → dir→folderId) each
      subfolder's tags are applied via `addFolderTag` (best-effort — a folder-tag failure never aborts the
      file uploads; Flatten drops folder tags since no folders are made). Live-gated → QA. *Files:*
      `schema-37-folder-tags.sql`, `app/data.js`, `app/screens/explorer.js`, `app/screens/upload.js`,
      `styles/content.css`, `app/demo.js`. **P23 fully wired — remaining is live QA on preview only.**
- [x] **P24 · A real, in-depth search built for scale (round-9).** *Done (backend role-sim-verified
      against the real 202-work DB; frontend demo-verified + shape-contract verified; live e2e →
      QA).* New **`search_files` RPC** (schema-35, migration **p26**) does the matching in Postgres so
      it scales past the client filter: full-text over the filename (`works.search_tsv`, GIN) UNIONed
      with tag-contains (**B19**), the **P21 modifiers** as structured args (exact tags, hastag types,
      extension/date facets, `sortby` incl. numeric tag-value sort), paginated with a total count,
      returning the card fields + aggregated tags + author + folder + channel. SECURITY INVOKER, so
      the `works_read` RLS (`can_read_work`) fences visibility — role-sim proved a **non-member sees 0**
      of a server's works. Enabled `pg_trgm` + a trigram GIN on `content_tags(tag)`. **Frontend**:
      `data.searchFiles` wraps the RPC; the explorer routes a **text/modifier search** to it live
      (`state.srv` cache, a "Load more" pager, a stale-token guard, and a **client-side fallback** on
      RPC error / when a Channel-or-Uploader facet is active / in demo). The client-side path also
      got the P21 modifiers + B19 + the Tag-type-facet removal, so search improves in demo too.
      *Files:* `schema-35-search-files.sql`, `app/data.js` (`searchFiles`), `app/screens/explorer.js`
      (`parseQuery`, `runServerSearch`, server branch + Load-more), `styles/content.css`,
      `styles/primitives.css`. Live search on preview (real RPC round-trip, paging) → QA-CHECKLIST.
      **Superseded/folded in P21 + B19.** *Remaining follow-up (not blocking):* the explorer still
      preloads the whole work set for browsing — once that's paginated too, `search_files` becomes the
      sole engine; Channel/Uploader could then move into the RPC (add `p_channels` + uploader-by-name).
- [x] **P25 · Show TOTAL upload size, not just per-file (round-9).** *Done.* The `renderChosen` header
      now shows the combined size (`.chosentot`, sum of `f.size` via `fmtSize`) beside the title, so a
      multi-file / folder upload reads its total (e.g. "18 files · 2.4 GB"); per-file sizes stay in the
      list. *Files:* `app/screens/upload.js` (`renderChosen`), `styles/content.css` (`.chosentot`).

> ### 🟢 Round-10 (owner test, 2026-08-30) — file-card, folder-interaction + tag nitpicks (with screenshots)
> A batch of explorer/card/tag nitpicks the owner sent with screenshots. Sorted; some being fixed
> the same session (marked). B16 is now IDENTIFIED (the selection checkbox).

- [x] **B23 · Filename must NOT show the file extension (round-10).** Card titles + the details-pane
      title should display the name **without** its extension (e.g. "Drums - WIZKID - OJUELEGBA -
      100bpm - Cmaj", not "…Cmaj.mp3") — the ext already shows in the Format meta row. *Files:*
      `app/cards.js` (`baseName` helper + card title), `app/screens/details.js` (title). *Easy.*
- [x] **B24 · File cards tile unevenly when the filename overflows (round-10).** In the folder grid,
      a long filename wraps to 2–3 lines and pushes cards to different heights, breaking the row
      alignment (screenshot). Clamp the card `.title` to a fixed line count (e.g. 2 lines, ellipsis)
      so every card is the same height. *Files:* `styles/content.css` (`.card .title`). *Easy.*
- [x] **B25 · Open-folder has no persistence — returns to root on tab switch (round-10).** Leaving the
      explorer tab and coming back always resets to the root folder; the **current folder should
      persist**. Put the open `folderId` in the URL (or session) so a return restores it (relates to
      B21/state). *Files:* `app/screens/explorer.js` (folder state ↔ route), `app/router.js`. *Medium.*
      **REDONE properly 2026-08-30 (owner: "i want the URL to change when i'm in a folder / have opened
      a file — expected behaviour, and makes saving links work").** The first pass used an in-memory
      `_folderStore` (lost on reload, and it defeated Back-to-root by re-restoring the last folder).
      Now the **URL is the single source of truth**: opening a folder writes `?folder=<id>` (pushState,
      so Back walks up the path), opening a file writes `?file=<id>` (and closing removes it), view-mode
      writes `?view=`; a reload / deep link / back-forward restores the open folder AND reopens the file
      viewer (which, via B14, adopts still-playing media). A copied link now opens the same folder/file.
      `_folderStore` removed. *Files:* `app/screens/explorer.js` (`explorerUrl`/`explorerBase`, `syncUrl`,
      `state.openFileId`, URL restore of `?file=`), `app/screens/details.js` (an `onClose` ctx hook so
      the viewer close clears `?file=`), `app/main.js` (reads `?file=` → `view.fileId`). Verified headless:
      open folder→`?folder=`, open file→`?file=`+sheet, close→sheet gone+param cleared, reload→both
      restored, Back→root; 0 pageerrors both themes.
- [x] **B26 · Folder open should be DOUBLE-click, not single (round-10).** Single-click a folder should
      **select** it (like a file); **double-click opens** it — consistent with files (Drive/Finder).
      Today a folder opens on single click. *Files:* `app/cards.js` (`folderCard`), `app/screens/explorer.js`
      (folder click handlers, selection). *Easy-med.*
- [x] **B27 · Selection counter shifts the action-bar icons (round-10).** In the bulk action bar, the
      "N selected" count changes width as N grows/shrinks, so the icons jump left/right. Give the count
      a **fixed min-width + tabular-nums** (or a stable layout) so the icons don't move. *Files:*
      `app/screens/explorer.js` (`.selbar` count), `styles/content.css`. *Easy.*
- [x] **B28 · The left navigation (folder-tree) pane should be draggable/resizable (round-10).** Add a
      drag handle on the folder-tree column's right edge to resize its width (persist the choice).
      *Files:* `app/screens/explorer.js` (tree column + a resizer), `styles/content.css`. *Medium.*
- [x] **B29 · Details-pane metadata wraps badly for long filenames (round-10).** The Location / value
      rows in the details pane wrap awkwardly for long names (screenshot). Fix the metadata value
      wrapping (allow it to wrap cleanly / break long tokens, keep the key aligned). *Files:*
      `styles/content.css` (`.sheet .meta .row .v` / `.loccrumb`), maybe `app/screens/details.js`. *Easy.*
- [x] **P26 · Tag chip: hover-x overlay + click-to-search (round-10, owner).** The current typed-tag
      chip (P11) reserves width on the right for the delete ✕, making tags too long — **wrong
      approach.** Instead: the ✕ appears on **hover** on the **right side of a normal-width tag**,
      **partly occluding** the tag's right edge (an overlay, not extra width) so the ✕ reads clearly.
      The **majority of the tag stays clickable** and a click **starts a search** for every file with
      that tag — or, for a typed tag, every file with that exact `type:value` (ties into P21/P24 search
      modifiers). *Files:* `app/tags.js` (`tagChip` — x as an absolute hover overlay + onClick→search),
      `app/screens/explorer.js` / `app/screens/details.js` (wire the tag-click to set the search),
      `styles/primitives.css` (`.tchip .x` overlay + occlusion gradient). *Medium.* Pairs with **P21**.
      The card ⋯ menu + details menu (`openCardMenu`/`detailMenuItems`) show **Rename · Delete ·
      Hide · Change visibility** on *every* work, so a member sees them on other members' server
      files. *The silent-no-op half is now FIXED* — the underlying writers (`trashWorks`,
      `restoreWork`, `purgeWork`, `setHidden`, `renameWork`, `setVisibility`) now `.select()` the
      touched rows and **throw** when RLS matched nothing, so a non-owner gets an honest "Only the
      owner or a server admin can…" error instead of a fake success + optimistic card mutation.
      **Remaining (UX): DONE (ship-single per owner call — a menu-inventory gate, not a redesign).**
      `shapeWork` now exposes `authorId`; a shared `writeMenuItems(data,state,rerender,w,hooks)` helper
      (explorer.js) is included in **both** the card ⋯ menu and the details-pane menu ONLY when
      `canWriteWork` = `isAdmin || authorId==null(personal) || authorId===me.id`. So a non-writer's
      menu is just Star · Save · Share… · Copy link; a writer/admin still gets Change visibility ·
      Rename · Move to… · Hide · Delete. (Extended one item past the ticket's four to include **Move
      to…** — same `can_write_work` class, inconsistent to leave it while hiding Rename.) *Files:*
      `app/data.js` (`shapeWork.authorId`), `app/screens/explorer.js` (`canWriteWork` + `writeMenuItems`,
      both menus). Verified: predicate unit-checked (admin/own/other/personal); demo menu unchanged
      (full set, demo=admin), 0 pageerrors; the hidden-state needs a real non-admin member → QA claim
      added (§10).

> ### 🟣 Round-11 (owner test, 2026-08-30) — search/filter model, density slider, perf, profile, polish
> Big conceptual pass after P24 (search) + P14 (densities) shipped. **Not yet built.** Two themes:
> (1) a proper **filter-vs-search split** with a real modifier system + indexing, and (2) a **file-
> explorer-grade** density slider + grouping, plus a profile rework, a perf pass, and a batch of
> interaction/polish fixes. Several items **supersede/refine** the just-shipped P24/P14 — noted inline.
> Sorted roughly easy→hard within each cluster.
>
> **— Search & filter overhaul (the big one) —**
- [x] **P27 · Filtering ≠ searching (the model split).** *Done for the client-side split (demo-
      verified, 0 pageerrors) — the server-side deep-search-returns-folders half is still open, see
      below.* **Filtering is screen-local:** a modifier typed with NO free text narrows only what's
      already in the current folder — subfolders stay visible untouched, nothing outside the folder
      is touched. **Searching digs deep:** free TEXT (with or without modifiers alongside it)
      flattens the whole tree and searches everywhere, current folder or not. Verified both
      directions: a modifier-only filter inside a folder narrows to matching files in that folder
      only and returns EMPTY for the same modifier from root (proves non-recursion); free text typed
      from inside a folder finds a match that lives elsewhere in the tree (proves it digs deep).
      **Researched 2026-08-31** (owner: "tree flattening could be fine idk, research other apps"):
      Finder and Google Drive both broaden scope on free-text search the same way eski now does —
      what they do differently is make the scope *visible* rather than silent. eski's existing
      `.exsearchstate` banner (swaps in for the breadcrumb the instant you type free text) already is
      that signal; it now also names the scope explicitly ("Search results for X — across all of
      \<name\>", was just "Search results for X"). No Finder-style clickable scope-pill override
      added — logged as a candidate, only build if the owner asks. Still open: `search_files` (server
      RPC) doesn't return folders when searching deep — today a deep search only surfaces files, not
      the folders containing them (P33's grouping would make mixed results legible once this lands).
      *Files:* `app/screens/explorer.js` (`contents()`'s `searching` branch vs. the no-free-text
      branch). **Refines P24 + P26.**
- [ ] **P31 · One modifier-based search everywhere (channel msg ↔ server file).** Every search bar
      uses the SAME modifier system, so a search inside a channel (for a message) can turn into a
      server-wide search (for a file) by editing the modifiers (e.g. drop the channel scope). *Files:*
      the channel/message search + `app/screens/explorer.js` + a shared search-parse module. *Med-hard.*
      Ties **P27/P34**.
- [x] **B35 · Server search doesn't work at all.** *Done (backend role-sim-verified on real data;
      migration p27).* **Root cause was NOT the client wiring** — the RPC signature, `data.searchFiles`
      args, and the `useSrv` gate were all correct. `search_files` (P24) matched the filename only via
      full-text (`works.search_tsv`), i.e. whole lexemes: role-sim proved "willow"=4 / "drum"=48 worked
      but every PARTIAL term returned 0 ("wil"=0, "idyll"=0, "158bpm"=0, "b.d.y"=0) — and a fragment is
      exactly what you type into a file browser, so from the owner's seat search returned nothing. Fix
      (`schema-36-search-files-substring.sql`): the free-text clause now also matches `title ILIKE
      '%term%'` (plain substring) alongside the kept filename FTS + the B19 tag-contains; a trigram GIN
      on `works.title` keeps it fast at GB scale (the filename half of K12). Only the free-text predicate
      changed — scope/facets/sort/pagination/grants + the SECURITY INVOKER RLS fence are byte-identical.
      Verified: wil 0→8, idyll 0→4, 158bpm 0→4, b.d.y 0→4; willow still 4, drum still 48, browse still 60,
      ext facet intact, non-member still sees 0 (RLS). Advisors: 0 ERROR, search_files unflagged. Live
      RPC round-trip on preview → QA-CHECKLIST. *Files:* `schema-36-search-files-substring.sql`.
- [x] **P34 · A real modifier system + UI hints.** *Done for the file explorer (demo-verified,
      light+dark, 0 pageerrors, owner 2026-08-31 — no mockups, built straight from spec).* New
      `app/search-modifiers.js` — the shared grammar module: `parseModifierToken` (`key:value` →
      `{kind:"reserved"|"tag", ...}`, `"quoted:value"` forces a literal tag read even if `key`
      collides with a reserved word), `RESERVED_KEYS` (`in/ext/by/channel/hastag/tag/before/after`),
      `splitModifiers` (buckets a modifier list into the shape `contents()` filters with),
      `modChip`/`modifierLabel` (the rail chip). **Autocomplete → rail, not inline** (owner: "should
      autocomplete like v3 but when Enter is pressed it moves to the rail so it's easy to remove and
      the separation between filtering and search is clear"): typing opens a popover suggesting
      reserved keys + every tag type actually in use, `Tab` accepts a suggestion, `Enter` promotes
      EVERY complete `key:value` token currently in the field to a removable chip in a new modifier
      rail below the toolbar (`.exmods`) and leaves any incomplete trailing text as free search text.
      Clicking a tag chip's type or value surface (P38, see below) also commits straight to the rail.
      **Sort-by/Group-by deliberately left as the existing P33 dropdowns** (owner: "leave groupby and
      sortby out for now as they are still pretty robust as dropdowns") — NOT folded into the
      modifier grammar this pass. **Scope note:** `by:`/`channel:`/`before:`/`after:`/`in:` are
      applied CLIENT-SIDE only this pass (`applyClientOnlyModifiers` in explorer.js) — never sent to
      the `search_files` RPC — to avoid a schema/RPC migration in this pass; `tag:`/`hastag:`/`ext:`
      DO go server-side when a live deep search fires. Moving the client-only modifiers server-side
      is the natural extension of **K12** (search indexing) once that lands. *Files:*
      `app/search-modifiers.js` (new), `app/screens/explorer.js` (`searchWidget()`, `commitModifier`,
      `applyClientOnlyModifiers`, the `.exmods` rail), `styles/content.css` (`.searchcombo`/`.pop`/
      `.exmods`/`.mchip`).
- [ ] **K12 · Search indexing (metadata-inclusive) so search is fast.** Add proper indexing so search
      isn't slow at scale, and make **every reasonable part of a file searchable — including
      metadata** (bpm/key/duration/dimensions/codec/… not just filename + tags). *Files:* schema
      (a metadata store or columns + GIN/tsvector over them), `search_files`. *Hard.* Pairs **P30**
      (perf) — see also "search is disgustingly slow" there.
>
> **— File explorer (continuing the P14 inspiration) —**
- [x] **P32 · A real density SLIDER (not 3 discrete modes).** *Done (demo-verified across all stages,
      0 pageerrors; no mockups per owner 2026-08-31).* The Grid/List dropdown is replaced by a **density
      slider** in the toolbar: **position 0 = the List table**, **positions 1–5 = grid stages** whose
      thumbnail min-width steps **132 → 160 → 192 → 232 → 288 px**, driving the grid's
      `minmax(var(--tile),1fr)` so it **re-columns continuously** (6→5→4→3→2 columns at 1440). Stage 4
      (232) is the historical default so existing links don't shift; **stage 2 (160) is the denser
      "mockup" anchor** the owner liked. The stages **ease**: `[data-density]` on the `.exview` wrap
      tightens card padding, the title font, and the **title→tags gap** at dense stages and loosens
      them at the large stage (the owner's "thumbnail density + title-to-tags gap" ask). The slider
      thumb is a **square** `--r` ink handle (not a native round one — the no-new-round-elements rule
      holds), flanked by a small + large grid glyph for direction. Density round-trips through the URL
      (`?view=list` / `d1`–`d5`, default grid omitted) so reload/back-forward and copied links restore
      it; `parseView`/`viewParam` also migrate the legacy `grid`/`feed`/`small` values. *Files:*
      `app/screens/explorer.js` (`DENSITY_TILE`/`parseView`/`viewParam`, the slider control, `largeView`
      `--tile`), `styles/shell.css` (`--tile` grid + `[data-density]` easing), `styles/content.css`
      (`.densityctl`/`.densityrange` square thumb). **Supersedes the discrete P14 modes** — list/small/
      large remain reachable as the slider's own anchors (0 / 2 / 5).
- [x] **P33 · Filter rework: only Hidden + Starred; add Group-by & Sort-by.** *Done (demo-verified,
      light+dark, 0 pageerrors, owner 2026-08-31 — no mockups).* Dropped ALL the explorer facet
      dropdowns (Type/Channel/Uploader/Tag/Date + the old Sort/dir buttons); only **Hidden** + **Starred**
      remain. **Grid** view gains a single **Sort-by** dropdown (Newest/Oldest · Name A–Z/Z–A · Largest/
      Smallest · File type · Uploader) + a **Group-by** dropdown (Kind/File type/Uploader/Date added →
      section headers, folders lead their own "Folders" group). **List** view has neither — its **column
      headers are click-to-sort** (asc/desc caret; Name/Type/Size/Uploader/Added), which also closes
      **C6/C28**. `sortFiles` rebuilt with canonical-ascending comparators (+ type/uploader/date keys).
      Tag-click-to-filter (P26) still populates `state.tags` — the deferred tag session owns the rest.
      *Files:* `app/screens/explorer.js`, `styles/content.css`. **Also in this pass** (owner extras):
      the **Small-icons view was cut** (Grid + List only); the **folder file-count** was removed from grid
      tiles; **folders are now selectable** by click/⌘-click/marquee (`selFolder`→`selFolders` Set); the
      **star** is one top-left click-toggle in both densities (see B33); the hover **name-scroll snaps
      back instantly**; a **hairline separates the toolbar from the pane**; and **folders can be dragged
      onto another folder to reparent them** — `move_to_folder` already handled a folder `target`
      server-side, so this only needed the client drag wiring + a client-side cycle guard for the
      personal (`save_folders`) case, which has no server-side check (`moveFolderTo` in `app/data.js`).
      *Remaining:* the search-modifier replacement for the removed facets is the P27/P34 + tag-session
      work.
>
> **— Media / messages —**
- [x] **B30 · Expanded media view closes on tab refocus.** *Done (root-caused + fixed; live-QA claim
      added).* There was **no** visibility/blur handler closing it — the closer was indirect: supabase-js
      re-emits `SIGNED_IN` / `TOKEN_REFRESHED` for the SAME user on every tab refocus (and on the periodic
      token refresh), and `main.js`'s `onChange` called `renderRoute()` on it — whose first act is
      `closeDetails()`, then a full screen + realtime rebuild. So refocusing the tab shut the expanded
      viewer (while B14 keep-alive audio played on) and needlessly reloaded everything. Fix: `onChange`
      now tracks the rendered user (`lastUid`) and **only re-renders on a real identity change** — a
      same-user refresh/refocus event is a no-op. Genuine sign-in (null→uid), sign-out, and account
      switch still re-render; the pending-invite resume still fires. Bonus: kills the whole-screen reload
      that fired on every tab focus (a P30-adjacent perf win). *Files:* `app/main.js`. node --check clean;
      boot cases unaffected (the closer path is auth-driven, not on the demo path). Live confirm on
      preview → QA-CHECKLIST. *Followed B14.*
- [x] **B34 · "Load earlier messages" shows when there are none.** *Done (headless-verified).* The
      logic was already right — the sentinel is created `hidden` when `hasMore` is false and re-hidden
      after a load returns nothing. The bug was CSS: `.loadearlier{display:flex}` (shell.css) **overrode
      the UA `[hidden]{display:none}`** (author beats UA), so the `hidden` attribute did nothing and the
      button always showed. Fix: restated `.loadearlier[hidden]{display:none}` — the exact pattern this
      file already uses 9× (`.offlinebar[hidden]`, `.composernote[hidden]`, …). Verified: `.loadearlier`
      computes `flex` when shown, `none` when `hidden`. *Files:* `styles/shell.css`. The scroll-up sentinel / button
      should not appear (or no-op) when `hasMore` is false. *Files:* `app/screens/workspace.js`
      (`wireStreamPaging`). *Easy.*
>
> **— Selection / interaction —**
- [x] **B31 · Selection is finicky + highlights text; drag image should be mini icons.** *Done (demo-
      verified; live drag-image → QA).* (1) The browsing surface no longer highlights text during a
      marquee/drag — `.panebody{user-select:none}` (a file browser isn't a text document; Finder/Drive
      do the same), with `.panebody input,textarea,[contenteditable]{user-select:text}` so a real field
      stays selectable. (2) A drag now shows a **small kind-icon token, not the card thumbnail** — the
      dragstart handler builds a `.dragghost` (a 34px square chip with the file's kind icon; a **square**
      count badge for a multi-drag, since round is avatars/dots only) and `setDragImage`s it. Verified:
      `.panebody` computes `user-select:none`; the ghost is 34×34 at `--r`, badge square + inked; 0
      pageerrors. The live drag-image swap isn't sandbox-simulable → QA-CHECKLIST. *Files:*
      `app/screens/explorer.js` (dragstart), `styles/content.css`.
- [x] **B32 · Selection action bar shifts the layout down.** *Done (already shipped; body box was
      lagging the sorted-table row).* The `.selbar` is a `position:absolute;inset:0;z-index:2` child of
      the toolbar (`.toolbar{position:relative}` anchors it), so it **overlays** the toolbar instead of
      inserting a row — zero grid shift on select. Verified in `styles/content.css:294` + the anchoring
      comment on `.toolbar` (`:64`). *Files:* `styles/content.css` (`.selbar`, `.toolbar`).
- [x] **B33 · Star: consistent, top-left, click-to-toggle across all densities.** *Done (demo-verified
      light+dark; star opacity 1 on hover, gold+filled when starred).* Merged the star INDICATOR and the
      star SELECTOR into ONE control: `workCard` renders a single `.cardstar` at the thumbnail top-left
      that is the toggle — a ghost star fades in on card hover so you can star, a starred card keeps it
      visible + gold-filled; it's no longer in the top-right ⋯ hover cluster, so nothing swaps. Grid +
      List both carry it (List rows lead with a `.flstar`; folder rows get an aligning spacer). The
      colliding corner select-checkbox (`.cardsel`, the old "weird white square" B16) was removed — the
      star owns top-left and selection shows via the `.card.sel` ring. *Files:* `app/cards.js`,
      `app/screens/explorer.js`, `styles/content.css`. **Closes B16/#43.**
- [x] **P28 · More right-click menus in the file browser, spawned at the cursor.** *Done (headless-
      verified in demo).* `openMenu(anchor, items, {at:{x,y}})` gained a cursor-position option — when
      `at` is set the menu spawns at the pointer (clamped to the viewport) and never toggle-closes (a
      right-click always re-opens at the new point); anchor is now optional (guarded) so a menu can spawn
      with no button. Wired the pointer coords through: **file card** right-click → the card menu **at the
      cursor**, now led by **Open**; **folder card** right-click → **Open + Copy folder link** at the
      cursor (was share-only, anchored); **empty pane** right-click → a new **New folder · Upload** menu at
      the cursor. The anchored ⋯ button path is unchanged (no `at`). Verified: file right-click opens at
      the cursor (menu within 40px of the point) with the full menu; empty-space right-click shows New
      folder/Upload; 0 pageerrors, no icon warnings. *Files:* `app/ui.js` (`openMenu` `at`),
      `app/screens/explorer.js` (`openCardMenu`/`shareFolderMenu` take `at`; file/folder/empty-pane
      `contextmenu` handlers pass the cursor point).
>
> **— Profile rework —**
- [ ] **P29 · Profile page serious rework.** (a) **Remove the Public/Server/Private tabs** — everything
      on a profile is public. (b) **Settings becomes a button** (next to Edit profile), not a tab. (c)
      **Presence + status need a clear editing state** — today changing them shows no "editing"/"saved"
      signal; **move them into settings** and make **all settings apply only on Save** (an explicit
      save model). (d) Keep a **search bar**, but **styled like every other search bar** — no filter/
      sort chrome, **just search (with modifiers)**. *Files:* `app/screens/profile.js`,
      `app/screens/usersettings.js`, `styles/content.css`. *Hard.* Revisits **P15/B11**.
>
> **— Performance —**
- [ ] **P30 · Perf pass — everything feels slow.** Search is **disgustingly slow** (→ K12 indexing);
      **sending messages**, **opening servers/channels**, and **switching contexts** are slow; on
      reload the **eski logo takes a while to appear**, so boot feels like **two separate loading
      phases**. Profile the read/render waterfalls, parallelise/caches, and fix the two-phase boot
      (paint the logo/shell immediately). *Files:* `app/main.js`, `app/data.js` (loaders/caching),
      `index.html` (boot/logo), realtime send path. *Hard.* Uses the perf HUD (`?perf=1`).
>
> **— Uploads / polish —**
- [x] **P35 · Loading animations EVERYWHERE.** *Done — shared vocabulary landed + spinning search icon
      retired (demo screenshot-verified both themes, 0 pageerrors; no mockups per owner 2026-08-31).*
      Two shared inline affordances in `app/ui.js`: **`loadingLabel(text)`** — a status word trailed
      by an animated **rising ellipsis** (TEXT-glyph dots, `@keyframes dotpulse`, so the
      no-new-round-elements rule holds — no circles) — and **`indetBar()`** — a slim **indeterminate
      progress bar** (a sliding sliver reusing the upload widget's `uplslide` motion, so the app has
      ONE indeterminate animation, not a second spinner). The **spinning search icon** (`.searchloading
      .ic{animation:spin}`) is **replaced** by `indetBar()` + `loadingLabel("Searching")`. Wired the
      shared label into the previously-static text placeholders: settings.js ×4, usersettings.js ×2
      (blocked/storage), and the explorer "Load more" loading state. These sit alongside the existing
      determinate affordances (P3 `busyOverlay`/`withBusy`, P16 `uploadProgress`), which already cover
      button/overlay/upload waits — P35 fills the "static text while loading" gaps with motion. *Files:*
      `app/ui.js` (`loadingLabel`, `indetBar`), `styles/primitives.css` (`.dots`/`dotpulse`,
      `.indetbar`/`.indetfill`), `styles/content.css` (`.searchloading`), `app/screens/explorer.js`,
      `app/screens/settings.js`, `app/screens/usersettings.js`. Extends **P3/P16**.
- [x] **P36 · Crop/zoom modal for image uploads.** *Done (demo-verified: round + wide variants render
      0 pageerrors, Apply resolves a real cropped `image/jpeg` File; live R2 upload session-gated → QA).*
      New shared **`cropImage(file, {aspect, round, outW, title, apply}) → Promise<Blob|null>`** in
      `app/ui.js`: a fixed-aspect crop frame the picked image **pans (drag) + zooms (slider, 1–3×,
      about the frame centre)** inside, clamped to always cover the frame; Apply draws the on-screen
      transform 1:1 into an output `<canvas>` and re-encodes JPEG @0.9 (also normalises huge sources).
      Inserted between the file-pick and `uploadBlobs()` in all four flows: profile **pfp** (1:1, round
      mask — the one place round is allowed), profile **banner** (3:1), server **icon** (1:1, `--r`
      square), server **cover** (3:1). Cancel/Esc/scrim resolves null (no upload). *Files:* `app/ui.js`
      (`cropImage`), `styles/primitives.css` (`.cropstage`/`.cropimg`/`.cropzoom`, round variant),
      `app/screens/profile.js`, `app/screens/settings.js`. *Med-hard.*
- [x] **B36 · Path bar has a black separator bar (dark mode).** *Done (dark-mode screenshot-verified).*
      Root cause was a background step: `.expath` (the path line) was `background:var(--surface)` while the
      `.toolbar` directly below and the `.pane` are both `--paper`. In dark mode `--surface` (#171717) on
      `--paper` (#0A0A0A) chrome rendered as a stray lighter bar across the top of the content pane (the
      P18 comment even said it should "align with the toolbar + body below"). Fix: `.expath` background →
      `var(--paper)`, so the path line reads as one surface with the toolbar + body. Verified: `.expath`
      computes rgb(10,10,10) in dark; the bar is gone, light mode unaffected. *Files:* `styles/content.css`.
- [ ] **P37 · Multi-file download → preserve folders + zip into one archive (round-11, owner 2026-08-30).**
      Downloading more than one file currently fires **N separate browser downloads** (`downloadSelected`
      → one `downloadWork` per file; the code even notes "a true zip-as-one-file is a later enhancement").
      The owner wants a real archive: a bulk / folder download should **rebuild the folder structure**
      (each file at its `placement.folder_id` path, nested subfolders preserved) and **zip it into a single
      download**. Also applies to **Download a folder** (whole-folder / selection, incl. the shared-folder
      viewer's Save & Download). **Approach to settle:** client-side streaming zip (e.g. a no-dep streaming
      zipper — the app is build-stepless, so it must be CDN/ESM-friendly and **stream** so a multi-GB
      selection doesn't buffer in memory) **vs.** an **edge function that streams a zip from R2** (fetches
      each blob by `<sha>.<ext>`, writes it into the archive at its folder path, streams the zip back) —
      the edge/R2 path scales better for the GB uploads the owner does and keeps signing server-side.
      Preserve real filenames (title + ext) and dedupe name collisions within a folder. *Files:*
      `app/screens/explorer.js` (`downloadSelected` + folder download), a new `api/zip.mjs` edge function
      (if server-side), `api/sign.mjs` (blob reads). *Med-hard.* Pairs with the folder-download work (K9/P9).

### 2 · Fixes for backend

- [x] **K1 · `preview_invite(code)` anon-readable RPC.** *Done (anon role-sim-verified + demo
      render).* `preview_invite(p_code)` (schema-26, migration `p16_preview_invite`) is a
      `SECURITY DEFINER` function, granted to **anon** + authenticated, returning the server
      name/icon, active member count, and inviter for a VALID/live/under-cap code; a
      revoked (deleted row) / expired / at-capacity / invalid code returns **no rows** → null.
      Same validity rules as `join_via_invite`. `data.js loadInvitePreview(code)` (never throws)
      + `screens/join.js` now enrich the invite card (server badge · "Join {name}" · "{inviter}
      invited you · N members") for both the signed-in and signed-out branches, and show the
      dead-invite state proactively when the preview is null. *Files:* `schema-26-preview-invite.sql`,
      `app/data.js`, `app/screens/join.js`. Verified: anon RPC returns the row for the real code
      and NULL for a bad code (rolled back); demo join card renders the preview both themes, 0
      pageerrors.
- [x] **K2 · Server icon + cover + profile banner upload persist and render.**
      *Done (persistence verified live; render fixed + demo-verified).* **KEY CORRECTION for the
      next agent:** this was **NOT** a silent-no-op persistence bug — the writes always persisted.
      Role-sim proved `servers.update` (icon_key) as the owner changes the row (`rows_updated=1`),
      `profiles.update` was already catalogued PASS, and the live DB *already held* a stored
      `servers.icon_key` and a `profiles.banner_key`. The bug was **purely render** — three gaps:
      (1) `loadWorkspace`/`loadExplorer` returned `data.server` as only `{id,name,initials}`, so
      the channel-column header's `srvIconEl(data.server)` always fell back to initials (icon never
      showed). Now both carry `icon_key`/`cover_key`. (2) `.srvcover` in the channel header was a
      hardcoded empty gradient band — `channelColumn` now paints `cover_key` into it (covers the
      explorer too, which reuses `channelColumn`). (3) The profile hero rendered no banner (a stub);
      now a `.pbanner` cover band renders `banner_key` when present (bannerless heroes unchanged),
      mirrored into `gallery.html` + `styles/content.css` so the LAW stays in sync. The rail badge
      already read `icon_key` (fine). *Files:* `app/data.js`, `app/screens/workspace.js`,
      `app/screens/profile.js`, `styles/content.css`, `docs/design/gallery.html`. Verified:
      role-sim `servers.update` (rolled back); demo render (CDN-intercepted 1×1 PNG) shows the
      server icon + cover in workspace AND explorer headers and the profile banner, both themes, 0
      pageerrors. Live R2 round-trip is owner-only → QA-CHECKLIST.
- [x] **K4 · Delete server + invite management (expiry / revoke).** *Done (backend
      role-sim-verified).* The invite modal's create-with-expiry/max-uses + revoke were already
      built (P9.3) and verified reliable — `si_insert`/`si_delete` gate on `is_server_admin`
      (definer): role-sim confirmed an admin creates + revokes an invite (1 row each), and a
      revoked invite is a deleted row so `join_via_invite`/`preview_invite` see nothing. The
      delete-server flow (type-the-name confirm → cascade) was a **direct `servers.delete`** —
      which role-sim exposed as the silent-no-op hazard: a non-owner's delete matched **0 rows
      with NO error** ("success" having deleted nothing). Hardened into the `delete_server`
      `SECURITY DEFINER` RPC (schema-28, migration `p18_delete_server`) that **raises** on a
      non-owner / missing server; the owner's delete removes the row + FK cascade. `data.js
      deleteServer` calls it. Verified: role-sim — non-owner raises, owner deletes (server gone),
      rolled back; live DB intact. *Files:* `schema-28-delete-server-rpc.sql`, `app/data.js`.
- [x] **K5 · Harden create-server into an atomic `create_server` RPC.** *Done (backend
      role-sim-verified).* `create_server(p_name, p_channels[])` (schema-27, migration
      `p17_create_server`) seats the server + owner membership (hue 1, active) + the one @everyone
      role (perms 113664) + the starter channels in ONE `SECURITY DEFINER` transaction — atomic
      (no half-made servers) and free of the create-time RLS chicken-and-egg. Channel names are
      normalized to handles server-side (lowercase, non-alnum→dash, trimmed), empties skipped,
      capped at 20, default `#general`. `data.js createServer` calls it (the 4 client inserts +
      the now-dead `EVERYONE_PERMS` const are gone). *Files:* `schema-27-create-server-rpc.sql`,
      `app/data.js`. Verified: role-sim created server + 1 owner-member + 1 @everyone role +
      channels `[general,wips,beats-room]` from `['General','wips!!','  ','beats room']`, rolled
      back; live DB unchanged.
- [x] **K6 · Realtime echo — DM / notification / reaction / edit.** *Code-complete (built across
      the 2026-08-28 sessions); live two-session QA is owner-only.* Audited this round: every echo
      is wired and consumed — `subscribeChannelMessages` (insert/update/delete, workspace),
      `subscribeChannelReactions` (workspace), `subscribeDMMessages` (dms), `subscribeNotifications`
      (notifications), plus typing + presence; `teardownRealtime()` runs before each render so a
      route switch never leaks a subscription. B5 also added live attachment resolution to the
      channel `liveInsert`. Syntax-clean; QA claims present (§5 second-window message/edit/delete,
      §15 DM echo, §12 B5 file-message echo). The only thing left is the owner running two windows
      on preview — not sandbox-reachable (headless Chromium can't egress to Realtime). *Known
      nice-to-have, not in scope:* the shell **bell/unread badge** only echoes while the
      Notifications screen is open (no global subscription) — fold into a later pass if wanted.
- [x] **K7 · Atomic `create_work` upload RPC — fixes the total upload 42501 (round-4).** DONE
      (`schema-23-create-work-rpc.sql`, migration `p13_create_work_rpc`, applied live +
      `upload.js doPost` rewritten). One `SECURITY DEFINER` call registers the blob, inserts the
      work, files its placement (server) / saved_items (personal folder) and tags — atomically, as
      the table owner, so the `works`-insert 42501 can't block it — and re-checks the fence itself
      (author = caller; server ⇒ `member_of` + `has_perm('upload')`; channel/folder must belong to
      the server). Also **every file type accepted** (allowlist → safe-shape ext) + `.flp`/DAW/AIFF
      recognition. Verified via reliable role-sim (personal + tags, server + placement, non-member
      refused). **Live R2 round-trip is owner-only → QA-CHECKLIST §12 rows.**
- [x] **K8 · Backend write-reliability audit + hardening (round-4 — "make sure everything actually
      works").** *Audit done + catalogued + the one at-risk content write converted.*
      **THE ROOT-CAUSE INSIGHT (this narrows the whole problem):** the confirmed-broken `works_insert`
      had a **COMPLEX** inline-`auth.uid()` WITH CHECK (a `CASE owner_type` + `member_of` + `has_perm`
      + subqueries). The **SIMPLE** shape — `col = (select auth.uid())`, e.g. `servers_insert`,
      `saved_items`, `starred_items`, `reports` — **works** (proven: `servers` insert succeeds live,
      the owner owns a server; K2 showed `servers.update` and `profiles.update` both change rows).
      So the risk is **only in COMPLEX inline-uid checks**, not every direct write. That makes the
      audit tractable instead of "convert everything."
      **The write-reliability catalogue (every write in `app/`):**
      - **RELIABLE — SECURITY DEFINER RPC:** `create_work` (upload, K7) · **`post_comment` (comments,
        NEW this round)** · `toggle_reaction` · `pin_message` · `mark_channel_read` · `create_folder`
        · `move_to_folder` · `add_tag`\* · `add_friend`/`respond_friend`/`block_user` ·
        `create_dm`/`create_group_dm` · `join_via_invite` · `invite_user_to_server` ·
        `set_member_roles` · `set_channel_access` · `kick_member`/`ban_member`/`timeout_member` ·
        `add_collaborator` · `resolve_share_link`.
      - **RELIABLE — direct write, but gated by a DEFINER helper:** `messages` insert
        (`can_post_channel`, PASS live) · `works` update/delete = trash/restore/purge/rename/hide/
        setVisibility (`can_write_work`) · `content_tags` insert/delete (`can_write_work`, author
        path) · `share_links` insert (`can_write_work`) · `dm_messages` insert (`dm_member`).
      - **RELIABLE — SIMPLE owner-only inline-uid (the working `servers_insert` shape):** `servers`
        insert (verified) · `profiles` update/upsert (verified PASS) · `servers` update (verified
        rows=1) · `saved_items` upsert/delete · `starred_items` upsert/delete · `server_prefs`
        upsert · `notifications` update · `dm_members` update · `friendships` delete (unblock) ·
        `message_pins` delete (unpin) · `reports` insert (deferred → D7).
      - **CONVERTED because COMPLEX inline-uid (the works-class risk):** `comments` insert — was a
        direct insert whose `cmt_insert` check is `can_read_work AND (author OR is_friend(author))`,
        structurally like the broken `works` check → now the `post_comment` RPC (schema-25, migration
        `p15_post_comment_rpc`), fence re-checked identically. Verified by role-sim (author allowed,
        a non-member/non-friend refused, rolled back).
      - **ALREADY FIXED:** `works` insert → `create_work` (K7). **RENDER not persistence:** server
        icon/cover + banner (K2) — those writes persisted; the bug was render.
      \* `add_tag` — data.js `addTag` currently does a **direct** `content_tags` insert (the
      `ct_ins` check `can_write_work OR collaborator`); the author path is definer-gated so it's
      reliable, but if the owner ever reports "my tag didn't save" as a collaborator, convert it too.
      **Rule going forward (unchanged):** don't trust "no error" — trust a changed row; any NEW
      load-bearing write with a COMPLEX inline-uid check gets a definer RPC, not a direct insert.
- [x] **K9 · Google-Drive-style folder & file sharing + "Request to join server" (round-4).**
      *Done (backend role-sim-verified + demo render).* **Folder sharing:** `share_links` extended
      to target a FOLDER (server folder or personal `save_folder`) instead of only a work
      (schema-29, migrations `p19`/`p20`); `create_folder_share(source, folder_id)` (fenced) mints
      a link, `resolve_folder_share(token)` (anon) returns the folder name + server context + file
      list. Client: right-click a folder → "Copy folder link" (`explorer.js`), and a read-only
      folder viewer at `/shared/folder/:token` (`screens/shared.js renderSharedFolder`, no rail,
      works signed-out) that also offers **Request to join {server}** for a server folder.
      **Request-to-join:** new `join_requests` table (RLS: your own + admins read; writes RPC-only)
      + `request_to_join_server` / `approve_join_request` (seats the member like `join_via_invite`)
      / `decline_join_request`; the server menu gains an admin **Join requests** modal
      (`workspace.js openJoinRequests`) with Approve/Decline. Verified: role-sim — anon resolves a
      folder share to its files (bad token → nothing); a join request goes pending → an admin
      approve seats the member (all rolled back). Demo: folder viewer renders 4 cards + the
      request-to-join CTA; the admin modal lists 2 requests with approve/decline; 0 pageerrors. Live
      R2 preview + a real two-account request→approve → QA-CHECKLIST. *Files:*
      `schema-29-folder-share-join-requests.sql`, `app/data.js`, `app/demo.js`, `app/router.js`,
      `app/main.js`, `app/screens/shared.js`, `app/screens/explorer.js`, `app/screens/workspace.js`,
      `app/cards.js`.
- [x] **K10 · Make the storage tracker actually work (round-7).** *Done (backend-verified +
      one real wiring fix).* **Audit result:** the read path was already correct — `loadExplorer`
      / `loadPersonalExplorer` / `loadUserSettings` read `storage_meters.bytes_used` +
      `storage_balance.purchased_gb,status` by owner, the RLS `sm_meter_read` policy lets the owner
      read their own/server meter, the column names match, and the footer/panel render the value.
      The "reads zeros" symptom was **downstream of the pre-K7 upload outage** (no works existed →
      meter was 0); with uploads fixed the meter is populated **and accurate to the byte** —
      role-sim: the live user meter (201519104) equals the distinct-blob sum across all non-purged
      works, and a rolled-back upload→trash→purge showed 0 → 123456 → 123456 (soft, unchanged) → 0
      (hard purge decrements), so the `works_blob_meter` trigger is correct. **The one real bug
      fixed:** an upload refreshes the footer via `reload()`, but **Delete-forever / Empty-trash
      only rerendered the trash list and never refreshed `data.storage`** — a hard purge frees the
      blob server-side, so the footer showed a stale (too-high) number until a manual reload (the
      owner's "reload needed for things to update"). Added `refreshStorage(data)` (`data.js`) — a
      targeted meter+balance re-read that updates `data.storage` in place — and called it from
      `purgeRow` / `emptyNow` before rerender (the footer repaints from `data.storage`). *Files:*
      `app/data.js` (`refreshStorage`), `app/screens/explorer.js` (purge/empty handlers). Verified:
      both files `node --check` clean; demo explorer renders the footer with 0 pageerrors. Live
      purge→footer-drops is session-gated → QA-CHECKLIST.
- [x] **K13 · `folders` RLS: `locked` read-only fence restored on update/delete.** *Done
      (role-sim-verified live, rolled back; migration p29 / `schema-38-folders-locked-rls.sql`).*
      Root cause confirmed against the live DB: `folders_write` (schema-03's ALL policy, `using
      (has_perm(...) and not locked)`) was **dropped** by schema-09, which replaced it with
      `folders_ins`/`folders_upd`/`folders_del` carrying `has_perm(...)` ONLY — no `locked` guard on
      update or delete. (So it wasn't an OR of two policies as first suspected — `folders_write` is
      simply gone; `pg_policy` on the live DB showed exactly these four with no `not locked`.) Fix:
      `folders_upd`/`folders_del` re-gain `and not locked` in USING (INSERT stays has_perm-only — a new
      row has no prior locked state, matching the original WITH CHECK). Also patched the schema-09
      **source** so a fresh replay is correct, not just the live DB. **Verified** per VERIFICATION.md,
      one rolled-back `do $$` block as the server owner under `set local role authenticated`: a
      `locked` folder → update=0 rows / delete=0 rows (blocked); a non-locked folder → update=1 /
      delete=1 (still writable); prod left at 0 folders (rollback), 0 ERROR security advisors, no
      `folders`-specific advisor. `locked` has no lock/unlock UI/RPC today (latent field, 0 locked
      folders in prod), so this is a fence tightening with no behavioural change — the client already
      hides Rename/Move/Delete on locked folders. *Files:* `schema-38-folders-locked-rls.sql` (new),
      `schema-09-indexes-policies.sql` (source parity).

### 3 · UI polish

- [x] **P1 · Center empty-state / placeholder text in its own pane.** *Done (demo-verified both
      themes).* One global rule: `.emptystate` (shell.css) now centers **both axes** —
      `justify-content:center` + `min-height:100%` so the block fills its host pane (every host is a
      definite-height flex context: `.stream`/`.panebody`/`.main` are `flex:1`, `.notif`/`.dmmain`
      are flex columns) and the text sits in the middle instead of top-anchored; padding evened to
      `var(--s4)`. This **replaces** the two per-pane `margin:auto` patches (`.notif .emptystate` /
      `.dmmain .emptystate`), now removed from content.css — one rule, no duplicates. Indefinite-height
      hosts degrade gracefully (min-height:100% → auto, natural height). *Files:* `styles/shell.css`,
      `styles/content.css`. Verified: empty-server "No channels yet" centers in its pane, both themes,
      text legible, CTA visible, 0 pageerrors; every empty surface inherits the one rule.
- [x] **P2 · Perf: dedupe `profiles` + defer settings reads.** *Done (static + demo-verified).*
      `loadRail` now also selects `bio,banner_key` and caches the raw profile row (`_cache.rail.profile`);
      `loadUserSettings` reuses it instead of firing a second identical `from("profiles")` read.
      Storage + Privacy are no longer fetched on settings load — `loadUserSettings` returns
      `storage:null`/`blocked:null` and the Storage/Privacy panels lazy-load (new `loadUserStorage`
      / `loadUserBlocked`) when opened, caching the result back onto `data` so re-open doesn't
      refetch. Net: the Profile panel (first render) no longer waits on `storage_meters`/
      `storage_balance`/`friendships`, and the duplicate profile read is gone. *Files:* `app/data.js`
      (`loadRail`, `loadUserSettings`, `loadUserStorage`, `loadUserBlocked`), `app/screens/usersettings.js`
      (privacy/storage panels lazy). Verified: no `from("profiles")` in the settings render path;
      demo /settings renders + Storage/Privacy panels populate on click, 0 pageerrors both themes.
- [x] **P3 · Loading animations for every async action.** *Done (demo-verified).* Added ONE shared
      busy affordance to `app/ui.js`: `busyOverlay(host)` — a light scrim + centred spinner over a
      host box (reuses `@keyframes spin`, `border-radius:inherit` so it follows a round avatar/well),
      returns a `stop()` for a `finally`; and `withBusy(btn, fn)` — runs an async fn with the button
      in the existing `.btn.loading` spinner state. CSS `.busyov`/`.busyov-sp` in `primitives.css`
      beside `.btn.loading`. Applied at the image/async call sites: **profile pfp** + **banner**
      (overlay over the avatar / banner well during the R2 round-trip, `profile.js`), **server icon**
      + **cover** (overlay over the preview, `settings.js`), and the server **Save name** button
      (`withBusy`). (Upload-sheet progress is P16's dedicated rework; folder-upload rides the same
      upload path.) *Files:* `app/ui.js`, `styles/primitives.css`, `app/screens/profile.js`,
      `app/screens/settings.js`. Verified: `node --check` clean; demo asserts the overlay mounts with
      an animating spinner and clears on stop(), 0 pageerrors.
- [x] **P4 · Cut post commenting from the beta (KEEP the Feed — owner override 2026-08-30).**
      *Done (demo-verified).* Owner amended the original ask: **keep the Feed** (nav + `/feed` route
      + the portfolio grid all stay), cut **only public-post commenting**. Removed the Details-pane
      comment thread (`commentsSection`/`commentRow` + the `loadComments`/`postComment`/`deleteComment`
      imports, `Avatar`/`avatarUrl` no longer needed) and the inline comment stub in the Explorer
      **Feed view** (`.ffcmts`) — the post view + media wall stay. Dead CSS removed (`.sheet .cmt*`,
      `.filefeed .cmt*`, `.ffcmts`). The `comments` table + `post_comment` RPC + comment→notification
      trigger stay **dormant** in the schema for D1. Mirrored the cut in **CANON** (§A beta-cut note +
      the §C.6 Feed-item and §C.7 Discussion rows marked "commenting cut — D1") and **CLAUDE.md**.
      *Files:* `app/screens/details.js`, `app/screens/explorer.js`, `app/screens/feed.js`,
      `styles/content.css`, `docs/CANON.md`, `CLAUDE.md`. Verified: `node --check` clean on all three
      screens; demo `/feed` renders (empty friends-feed state), no `.cmt*` UI code remains, 0 pageerrors.
      Gallery mirror skipped per owner (2026-08-30: stop maintaining gallery for UI changes).
- [x] **P5 · Merge Friends into Messages (one surface).** *Done (demo-verified both themes) — owner
      asked for it directly (didn't need P4 first).* Removed the `.dmfriends` button and the
      `showFriends()` right-pane swap; friends now live **inline in the `.dmlist` column** as sections:
      **Requests** (incoming with accept/decline, outgoing "pending") · **Pinned** · **Direct
      messages** · **Friends** (accepted friends without an active 1:1 DM → click to open/start one,
      no duplicate of open DMs). Add-by-username stays at the top and now actually adds a friend
      (fixed a **dangling `addByUsername` ref** that would have thrown). Removed the dead Friends-panel
      CSS (`.dmfriends`/`.friends`/`.frhd`/`.frtabs`/`.frrow`…); `.rbtn` kept for accept/decline. DM
      list header aligned to P18 (46px). *Files:* `app/screens/dms.js`, `styles/content.css`. Verified:
      Messages renders all four sections inline (no Friends button); clicking a friend opens a
      conversation; accept runs; 0 pageerrors.
- [x] **P6 · Declutter the upload sheet (round-5).** *Done.* Visibility is now **contextual** —
      launched from a server (channel composer / server explorer, `opts.serverId` set) the sheet
      hides the Public/Server/Private control entirely and shows only the server/folder target
      (`serverContext` → `visBlock.hidden`); a personal/global upload still surfaces Visibility.
      Root-folder default kept. Plus the earlier removals ("Draws X's storage" line, "Post"→"Upload").
      **Dead-code cleanup:** removed the `filesPanel` fn (workspace.js) + the channel-files fetch in
      `loadWorkspace` (both fed the removed Files tab) + the now-unused `mediaUrl` import; the B5
      chat-attachment resolution stays. *Files:* `app/screens/upload.js`, `app/screens/workspace.js`,
      `app/data.js`. Verified: workspace renders with only Messages/Pins tabs, 0 pageerrors; upload
      sheet is session-gated → owner confirms the contextual hide on preview.
- [x] **P7 · Share dialog → links only + reference-in-chat (round-5).** *Done (demo-verified).*
      The **Share dialog is now links only** (Drive-style): the Public/Server/Private segment is
      gone — it just mints/copies/revokes a read-only "anyone with the link" link, with copy that
      says publishing = save to your files + make that copy public. **Visibility moved to the file**:
      a new **"Change visibility…"** item on the card ⋯ menu AND the details-pane menu opens a small
      Public/Server/Private picker (`openVisibilityDialog`, reuses `VisibilitySeg`/`setVisibility`).
      **Reference-in-chat:** an **eski file/folder link pasted into a message renders as a native
      file/folder card** (`eskiRefCards` in `renderBody`/`messageRow`) — matches `/shared/folder/…`
      and `/shared/…`, opens the viewer natively instead of showing a raw URL. *Files:*
      `app/screens/explorer.js`, `app/screens/workspace.js`, `app/demo.js`. Verified: demo — share
      dialog has no visibility seg (links only), card menu has "Change visibility…", a chat message
      with a `/shared/folder/…` link renders a "Shared folder · opens the viewer" card, 0 pageerrors.
      *Follow-up (small):* a composer **"reference a file" picker** (choose an existing server file →
      insert its link) would complement the link-paste path — noted, not built.
- [x] **P8 · Real file-type filtering + searchable filters (round-5).** *Done (demo-verified).*
      The **Type** filter now offers the **actual file extensions present** (.wav / .flp / .png /
      .als / .zip …), derived from the files in view, filtering on `w.file_ext` (was the broad
      Images/Audio/Video kind buckets; the `TYPES` const is gone). Every multi-select facet
      (**Type / Tag / Channel / Uploader**) gets a **live search box** when it has >8 options, so a
      value is findable fast; and `openFilterMenu` picked up the same B8 toggle guard (a second
      click on the trigger closes it). *Files:* `app/screens/explorer.js`. Verified: demo Type menu
      lists `.als .flp .md .png .tmp .wav .zip`, 0 pageerrors. (Also satisfies the **B6 filtering
      audit** follow-up for search; the selection-persistence part of B6 already shipped.)
- [x] **P9 · Shared folder view matches the file browser (round-5).** *Done (demo-verified both
      themes).* The shared-folder viewer now renders through the **real explorer** in a read-only
      `shared` mode — same toolbar, search, filters (Type/Tag/Date/Sort + the P8 real-extension
      types), view modes (Grid/List/Feed), and selection. `data.shared` gates off the rail, the
      folder tree, the storage footer, New folder/Upload, drag-drop, and the per-card owner ⋯ menu;
      a standalone `sharedHeader` (eski wordmark · read-only · Request-to-join for a server folder)
      sits on top. `loadSharedFolder` now returns an explorer-shaped data object; `main.js` routes
      `/shared/folder/:token` → `renderExplorer` (dead token → `renderSharedFolderDead`); the bespoke
      `renderSharedFolder` is retired. Guarded every `data.server.id` deref for the null-server case.
      *Files:* `app/screens/explorer.js`, `app/screens/shared.js`, `app/main.js`, `app/data.js`,
      `app/demo.js`. Verified: demo shared folder renders the full browser (toolbar + 4 cards, no
      tree/rail/upload), request-to-join CTA, dead token handled, both themes, 0 pageerrors.
- [x] **P10 · Server settings as its own full SCREEN (round-5, promotes D4).** *Done (demo-verified
      both themes).* New `app/screens/settings.js` `renderServerSettings` — a real full-screen
      surface (left setnav + panels), mounted in the shell at `/s/:id/settings` (was a placeholder).
      Panels: **Overview** (name/icon/cover, inline), **Roles & permissions** (opens the roles
      editor), **Invites** (list · create · revoke), **Join requests** (approve/decline),
      **Notifications** (level + suppress-@everyone; the one panel a non-admin also sees for their
      own prefs), **Audit log**, **Danger zone** (owner: type-to-confirm delete; member: leave).
      The server menu is now just quick actions — **Server settings** routes to the screen, plus
      Invite / Notification prefs / (non-owner) Leave. Removed the four superseded modal functions
      (`openServerSettings`/`openAuditLog`/`openJoinRequests`/`deleteServerFlow` + `auditRow`/
      `escapeHtml`) and their now-dead imports from `workspace.js`. Reuses the `.usersettings`
      layout CSS (broadened to `.serversettings`). *Files:* `app/screens/settings.js` (new),
      `app/main.js` (route dispatch), `app/screens/workspace.js` (menu → route; dead-code removal),
      `styles/content.css`. Verified: demo settings screen renders all 7 nav panels, switches
      panels, danger zone has the type-to-confirm delete, in the shell with the rail, 0 pageerrors.
- [x] **P11 · Typed, colour-coded tags + a tag-type filter facet (round-6, owner).** *Done — owner
      picked the **V2 soft-chip** treatment from a 3-version review artifact (2026-08-30), now wired
      in.* Decisions settled: (a) a typed tag is stored in `content_tags.tag` as **`type:value`**
      (`bpm:142`) — **no schema change**, the type is the prefix before the first colon and must be a
      known type; (b) colour is a client-side **`--tt-<type>`** token set (bpm/key/genre/mood/
      instrument) added to `tokens.css` both themes, generated with the **same OKLCH method as the
      member hues** so they harmonise (these are content metadata, not member identity, so they may
      render anywhere); (c) the facet derives types from the tags in view. New **`app/tags.js`**:
      `parseTag`/`makeTag`, `tagChip` (the V2 soft chip — tinted box, type affix + value), and
      `tagEditor` (colon-aware input: typing `bpm:142` recognises + colours the type, Enter commits;
      `required` types pre-seed fill-in-place slots for **D5**). Wired into the **upload sheet** (Tags
      field → `tagEditor`) and the **details pane** (`tagsSection` renders `tagChip`, add normalises via
      `parseTag`). Explorer gains a **"Tag type"** filter facet (`state.tagTypes`) alongside the exact
      "Tag" facet. *Files:* `app/tags.js` (new), `styles/tokens.css` (`--tt-*`), `styles/primitives.css`
      (`.tchip`/`.tageditor`), `app/screens/upload.js`, `app/screens/details.js`, `app/screens/explorer.js`,
      `app/demo.js` (typed-tag fixtures). Verified: components render the 5 type colours correctly both
      themes, editor commits `type:value` + required-slot fill (getTags correct), "Tag type" facet shows
      in the toolbar, 0 pageerrors. **Foundation for D5** (required tags per channel — the `required`
      slot UI is built, awaiting the channel-required-types data). *Original spec:* Tags gain a
      **type** (e.g. `bpm`, `key`, `genre`) and each **type has a fixed colour** — a `bpm` tag is
      always blue, a `key` tag always green, etc. — so the same kind of tag reads the same across
      every file. The tag TYPES then show up as their **own facet in the explorer filters** (filter
      by BPM, by Key), alongside the free-tag filter. **Design/data decisions to settle first:**
      (a) how a type is attached — a reserved `type:value` convention on the existing
      `content_tags.tag` (e.g. `bpm:142`) vs. a real `tag_types` table + a `type` column; (b) the
      colour source — a small **type→colour map** (NOT the member hue, which is server-scoped
      identity; these need their own token set, e.g. `--tagtype-bpm`, `--tagtype-key`, added to
      `eski-style`); (c) how the filter facet derives the types present. This is the **foundation
      for D5** (required tags per channel): once a tag has a type, a channel can require certain
      types on upload. *Files:* `content_tags` schema/convention, `app/data.js` (tag shape +
      derive types), `app/screens/explorer.js` (colour the tag, add the type filter facet),
      `app/screens/details.js`/`cards.js` (render coloured tags), `eski-style` (tag-type colour
      tokens). *Medium-hard.* Load **`eski-style`** before styling — tags are currently "coloured
      bold text, not a pill" (CANON #26); confirm how a typed colour reads within that rule.
- [x] **P12 · Density pass: modals · dialogs · toasts (round-7).** *Done (owner picked V1 Tight from a
      3-density batch; demo-verified).* Frame + toast were already tightened; this pass took the dialog
      **body** to V1: `.modal .mbody` padding → 10/14, `.modal .field` → 6/10 (both scoped to `.modal`
      so app-wide fields/pane bodies are untouched), and the per-row vertical rhythm dropped from the
      hardcoded inline `margin-top:12px/14px` to **`--s2` (8px)** at its source across every modal
      builder (`shell.js` create/status, `report.js`, `roles.js`, `workspace.js` forward/invite/
      notifications). The New-server dialog now renders noticeably shorter — "doesn't eat the page."
      *Files:* `styles/primitives.css`, `app/shell.js`, `app/report.js`, `app/screens/roles.js`,
      `app/screens/workspace.js`. Verified: /create dialog renders tight both themes, 0 pageerrors.
      (gallery mirror skipped per owner.)
- [x] **P18 · Standardize header + panel sizes & colours (round-7).** *Done (owner picked V1 Compact
      46px from a 3-density batch; demo-verified).* Audited the inconsistency (heights 48/48/52/56;
      the only `--plate` header, `.chanhd`, is dead CSS — the real workspace server header is the
      `.srvbar` cover, its own thing; all four real primary headers were already `--surface`). Unified
      **`.mainhd` · `.panehd` · `.dmmain .mainhd` · `.svhd` to height 46px + `--s4` (16px) inset**, and
      brought the pane bodies/toolbar/path line (`.panebody` · `.toolbar` · `.expath`) to the **same
      16px inset** so headers align with their content (fixes the owner's "insets jump 12/16/24"). The
      slim P13 explorer path line stays 30px (deliberate). Mirrored into `gallery.html`. *Files:*
      `styles/shell.css`, `styles/content.css`, `docs/design/gallery.html`. Verified: workspace, feed,
      DMs, notifications, explorer render both-theme-clean with 46px headers and aligned 16px insets,
      0 pageerrors.
- [x] **P13 · Flatten the file-channel header + path viewer (round-7).** *Done (V2 + owner tweaks;
      demo-verified both themes).* Owner picked V2 from a 3-version batch, then asked to push the
      filters right, move New folder + Upload to the bottom-right, and (follow-up) drop the box around
      them. Result: the old two-row `.panehd` is gone; a slim dedicated **`.expath` path line** up top
      holds only the breadcrumb (the "path viewer"), with the **server-name crumb root dropped to a
      folder glyph** (server source only — personal keeps "My files"). The toolbar keeps **search on
      the left** and groups the **filters + view/hidden controls to the right** (`.tbfilters`). **New
      folder + Upload float bottom-right** (`.exfab`, bare square buttons, no backing) over the grid
      (`.pane` position:relative; body gets bottom padding). Also fixed a latent bug surfaced here: the
      search-results term (`Search results for X`) was captured at paint time and read empty on
      keystroke — now a live ref updated in `repaintBody`. Mirrored into **gallery.html** (LAW) + the
      P13 CSS added there. Removed dead `.toolbar .tbactions` CSS. *Files:* `app/screens/explorer.js`,
      `styles/content.css`, `docs/design/gallery.html`. Verified: server + personal explorer render
      both themes, breadcrumb fills on descend (`📁 / beats / drums`), search state live, 0 pageerrors.
- [x] **P14 · File-browser view modes = real density levels (round-7; owner spec 2026-08-30).**
      *Done (all three densities demo-verified + screenshotted; owner picks/tweaks).* Reworked the
      explorer view modes into **three Windows-Explorer densities** (owner: "a list, small icon, and
      large thumbnail density; reference Windows File Explorer"): **Large** (big content thumbnails —
      a photo/video frame fills the cell, other kinds show the kind icon — filename + uploader below,
      spacing tuned for 2-line titles), **Small icons** (a dense grid of compact `[kind icon · name]`
      cells), **List** (the "Details" table — a column per field: Name · Type · Size · Uploader ·
      Added, tabular sizes, folders as their own rows). All three share ONE select/open wiring
      (`wireFileEl`/`wireFolderEl`): single-click selects, double-click opens; selection outline,
      **marquee, bulk bar, drag-to-make-folder/move, ⌘A, and star/⋯ menus work in every density**
      (selectors broadened from `.card` to `[data-id]`/`[data-folder-id]`). Old `grid`/`feed` modes
      migrate to `large`; the Feed/media-wall was removed (may return as its own surface post-beta).
      `?view=small|list` drives + restores the density (URL state). *Files:* `app/screens/explorer.js`
      (VIEWS + `largeView`/`smallView`/`listView` + shared wiring; broadened selection/marquee/drag),
      `styles/content.css` (`.exsmall`/`.smallcard`, `.exlist`/`.flrow` columns + selection),
      `styles/shell.css` (`.masonry.even.exlarge`), `app/cards.js` (`baseName` reused). Verified:
      demo — each density renders in `beats` (4 files + folders), selection + double-open + columns
      correct, 0 pageerrors. Real content thumbnails in Large need live bytes → owner sees on preview.
      (Original ask: traditional densities compact→comfortable→large with a content thumbnail + thin
      band — realised as the three Windows-Explorer densities above.)
- [x] **P15 · Status lives on the profile page (round-7).** *Done (demo-verified both themes).* The
      status editor now lives inline on the **owner's profile hero** — a dense row: a **plain text
      field** (emoji dropped), a **simple presence picker** (`SelectPill`: Online/Idle/DND/Invisible),
      and Save (writes via `setStatus`, emoji:null, no auto-clear). Presence dots stay **monochrome**
      (`--ink`/`--muted`/`--danger` for DND) — no new colours (owner: keep it simple, no forced
      yellow). Viewers see the status as a read-only line (presence dot + text) in the identity block.
      Removed the old rail/modal `openStatus` composer entirely (emoji + auto-clear) and its now-unused
      imports; the User-settings "Set a status" button routes to the profile. `loadProfile` now selects
      `status_text`/`presence_state`. *Files:* `app/screens/profile.js`, `app/data.js`,
      `app/screens/usersettings.js`, `app/shell.js` (removed openStatus), `styles/content.css`.
      Verified: owner profile shows `[Presence ▾][text][Save]`, 0 pageerrors. Pairs with **B11**.
- [x] **P16 · Upload progress = animations + minimizable (round-7).** *Done (controller unit-verified
      + demo render; live R2 round-trip session-gated → QA).* New shared **`uploadProgress()`**
      controller in `app/ui.js`: an animated determinate **bar + %** (`.uplwidget`, `primitives.css`)
      with an **indeterminate shimmer** for the unknown-length hashing/sign phase, plus a **minimize**
      that detaches a compact **Drive-style chip** to the bottom-right (`.uplchip`) and closes the
      sheet so you keep working while it finishes — the controller owns its own DOM+state so the
      upload is unaffected. `done()`/`fail()` terminal states; the chip auto-dismisses on complete.
      Added **`putWithProgress()`** (XHR, since `fetch` has no upload progress) so the bar tracks the
      **real R2 byte transfer** aggregated across all files (the 20–80% band); hashing/sign/folders/
      save map to the rest. `upload.js doPost` rewired off the old `.uprogress` text line (removed).
      *Files:* `app/ui.js` (`uploadProgress`, `putWithProgress`), `styles/primitives.css`
      (`.uplwidget`/`.uplbar`/`.uplchip`), `app/screens/upload.js` (`doPost`), `styles/content.css`
      (dead `.uprogress` removed). Verified: `node --check` clean; headless asserts the widget mounts,
      `set()` drives the fill width, `minimize()` floats the chip + fires onMinimize, `done()` flips
      the chip to "Upload complete", 0 pageerrors; dark-mode screenshot of the bar + chip reads clean.
      Ties into **P3**. Live upload progress + the minimized-background-finish → QA-CHECKLIST.
      **Refined per owner 2026-08-30:** removed the **minimize button** and **all text stage tips**
      ("Hashing…"/"Getting URLs…"/…) — the widget is just the animated bar + %. Minimizing now happens
      by **clicking off the sheet** (the modal `onClose` floats the chip when an upload is in flight),
      so an exit never drops the upload. **Also fixed the upload sheet itself (round-8, owner):** the
      pre-seeded drag-drop (folder onto the explorer) left the dropzone blank — two **TDZ bugs**
      (`addFiles`/`fmtSize` used before their `let`/`const` init) swallowed the seed; declarations
      hoisted/moved up. The dropzone now renders a real **chosen-files UI** (`renderChosen`: header +
      Change + file list + Flatten toggle) via a persistent `summaryHost`, and **DnD moved to the
      whole `.dropwrap`** so a drop registers before AND after files are chosen. Verified with a
      session-stubbed harness: `openUpload({files, folderMode})` renders 4 rows + "Pack · 4 files in 2
      folders" + Flatten + "Upload 4 files", dropzone hidden, tag editor present, 0 pageerrors.
- [x] **P17 · Copy density — drop needless hints (round-7).** *Done (first pass).* Cut the
      "(optional)" after "Add details", the "file name if blank" Title hint, and the "(keeps its
      structure)" folder note in the upload sheet. *Files:* `app/screens/upload.js`. A broader
      one-liner-hint sweep across other surfaces can follow.
- [x] **P19 · Unread-message indicator on channels (round-7).** *Done (demo-render + live-DB RPC
      verify).* New read-only RPC **`channel_unread_counts(p_server)`** (schema-34, migration
      `p25_channel_unread_counts`): per-channel count of top-level, non-deleted messages **not by me**
      newer than my `channel_reads.last_read_at` (or all if never opened), membership-gated by
      `can_view_channel` (safe to grant `authenticated`). `loadWorkspace` calls it once per load and
      annotates a **fresh** `channelGroups` (`unread` bool + `unreadCount`) so the per-server cached
      bundle isn't mutated; the channel being opened reads as 0 (attachLive marks it read on mount).
      Render (`channelColumn`): an unread channel gets the **bold name** (existing) + a small **unread
      dot** (`.unreaddot`, presence-dot family — the only round chrome allowed); a channel with
      **@mentions** shows the count instead (stronger signal, B12 populates it). *Files:*
      `schema-34-channel-unread-counts.sql`, `app/data.js` (`loadWorkspace` unread fetch + annotate),
      `app/screens/workspace.js` (`channelColumn` row), `styles/shell.css` (`.unreaddot`),
      `app/demo.js` (fixture: `mixing` unread). Verified: role-sim as the owner returns the 3 gated
      channels; a foreign message injected into a channel bumps the owner's unread 0→1 (delta=1, rolled
      back); a non-member is correctly gated to 0 rows; demo renders the dot on `mixing` + the "4"
      mention count on `verses`, 0 pageerrors both themes. **Known gap (K6 family):** the bump is
      computed on each navigation/load — a *live* cross-channel bump (a message landing in a channel
      you're not viewing) needs a server-wide Realtime subscription (only the active channel is
      subscribed today); folded into the same later pass as the global bell/unread badge → QA-CHECKLIST.
- [x] **P20 · Paginate channel message loading (read-path audit, 2026-08-29).** *Done (demo-render +
      live-DB query verify).* `loadWorkspace` now windows the stream to the newest **`CHANNEL_PAGE`
      (50)** top-level messages (fetch newest-first + reverse to ascending; was an unbounded whole-
      history fetch). Extracted the reactions/forwards/attachments/reply-count resolution into a
      shared `resolveTopMessages(top, membersById, chanNameById, userId)` so the initial load and the
      new `loadEarlierMessages(channelId, beforeIso, data)` (scroll-up page, `created_at <` cursor)
      stay identical. `data.channel` carries `hasMore` + `oldestAt`. Workspace: `wireStreamPaging`
      adds a top **"Load earlier messages"** sentinel + a scroll-to-top auto-loader that prepends the
      older window preserving scroll position (anchors on the height delta), and anchors the fresh
      mount at the newest message (deferred RAF so the bottom-scroll doesn't self-trigger the loader).
      **B3 permalink preserved:** `focusPermalink` flashes the `?m=<id>` row if present, else pages
      earlier (bounded 40 pages) until it appears then flashes. Realtime append (`liveInsert`) still
      appends at the bottom, unaffected by the top sentinel. *Files:* `app/data.js` (`CHANNEL_PAGE`,
      `resolveTopMessages`, `loadEarlierMessages`, windowed `loadWorkspace`), `app/screens/workspace.js`
      (`wireStreamPaging`, `focusPermalink`), `styles/shell.css` (`.loadearlier`). Verified: `node
      --check` clean; demo workspace renders 0 pageerrors; live-DB query check confirms the window
      returns the newest N and the `<`-cursor earlier page is strictly-older + contiguous (distinct
      rows). Live scroll-up paging + a permalink to a message outside the window are session-gated →
      QA-CHECKLIST.

### 4 · Deferred (post-beta / infra-gated — do NOT build now)

The correct behaviour today is an explicit signpost (grayed control + WIP toast), not a fake.

- [ ] **D1 · Feed + post commenting** — deferred by P4. Public posts remain (via profile). *(post-beta)*
- [ ] **D7 · Report (moderation)** — was K3; deferred by owner (2026-08-29). The `reports` table
      exists and is self-contained; add an insert path (RLS or small RPC) + wire the Report stubs
      (§C.4/§C.7/§C.11) when moderation is prioritized. *(post-beta)*
- [ ] **D2 · Storage / billing** — usage slider, blended $/GB, single-payer server storage, export.
      Needs Stripe. *(`[infra]`, ~P8)*
- [ ] **D3 · Audit log** — read-only moderation history (actor/target/reason/time). *(post-beta)*
- [ ] ~~**D4 · Full-screen Server-settings port**~~ — **promoted to P10** (round-5): owner wants
      server settings as its own screen, not the dropdown modals. See P10.
- [ ] **D5 · Required tags / fields per channel** (BPM/Key on `#samples`) — **builds on P11**
      (typed tags): once a tag has a type, a channel names the tag **types** it requires; upload
      enforces them. Schema (`required_fields` on the channel + the typed-tag data from P11) +
      channel-settings admin + upload enforcement + an RLS/trigger fence. Owner-requested;
      substantial. Promote out of Deferred only if beta needs it. *(post-beta unless prioritized)*
- [ ] **D6 · Review canvas · kanban boards · numbered versions** — cut 2026-08-18 to keep the
      mental model simple; may return post-beta. *(post-beta)*

---

## Appendix — the frontend demo-screenshot harness (reusable template)

Serve the repo, drive headless Chromium against the demo path, screenshot + assert. No install
(Chromium is at `/opt/node22/lib/node_modules/playwright`). Write it to your scratchpad, not the repo.

```js
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const ROOT="/home/user/eski", PORT=8265;
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".json":"application/json"};
const s=createServer(async(rq,rs)=>{try{let p=decodeURIComponent(rq.url.split("?")[0]);let f=normalize(join(ROOT,p));let e=extname(f);if(!e){f=join(ROOT,"index.html");e=".html";}rs.writeHead(200,{"content-type":MIME[e]||"application/octet-stream"}).end(await readFile(f));}catch{rs.writeHead(404).end("x");}});
await new Promise(r=>s.listen(PORT,r));
const b=await pw.chromium.launch();
const p=await b.newPage({viewport:{width:1000,height:760}});
const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
await p.goto(`http://localhost:${PORT}/?demo=1`,{waitUntil:"load"});
await p.evaluate(t=>document.documentElement.setAttribute("data-theme",t),"dark"); // and "light"
await p.waitForTimeout(400);
// … navigate to the surface, then assert + screenshot …
console.log("pageerrors:", errs.length, errs.slice(0,3));
await p.screenshot({path:"/tmp/out.png"});
await b.close(); s.close();
```

Note: demo mode has **no session** (auth needs network), so session-gated surfaces (upload sheet,
etc.) won't open in demo — those are **live-only**, verify per the rules above. `pageerrors: 0` on
a surface is the minimum bar that your change didn't break module load or render.
