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
IDs are stable handles (`B*` broken-UI, `K*` backend, `P*` polish, `D*` deferred).

### ⏱ Sorted by estimated completion time (open items only)

The same open items as the categorized queue below, flattened and ordered **shortest job
first** (estimates assume one focused session; a `P*`/`B*` visual item also carries the
3-versions-then-owner-picks rule, which adds render+review time). Dependencies noted inline.
Backend is **done + verified** (2026-08-29 pass) — everything open is frontend except K10's
read-wiring. Ticking one here = ticking it in its category below.

| Est. | ID | What | Kind |
|---|---|---|---|
| ~15m | **B9** | verify channel upload shows as a chat file card (B5 built it; owner QA once B7 deploys) | live-QA |
| ~45m | **P1** | center empty-state/placeholder text in its pane (one global rule) | easy |
| ~1h | **P2** | perf: dedupe `profiles` fetch + defer settings reads | easy-med |
| ~1.5h | ~~**K10**~~ | ✅ storage tracker — read path was correct; fixed the purge/empty-trash footer refresh | done |
| ~1.5h | **B4** | typed `/create`·`/upload`·`/settings` open their modal over the shell | med |
| ~2h | **B3** | message permalink (Copy link → scroll + flash) | med |
| ~2h | **P4** | cut Feed + post-commenting from beta nav/routes (→ D1); mirror in CANON/CLAUDE.md | med · before P5 |
| ~2h | **P13** | flatten file-channel header + add path/breadcrumb viewer | med |
| ~2.5h | **P18** | standardize header + panel sizes & colours app-wide | med · overlaps P12 |
| ~2.5h | **P15** | status → profile page (text field + R/Y/G presence, denser) | med · pairs B11 |
| ~2.5h | **P3** | shared loading/busy affordance at every async call site | med |
| ~3h | **P12** | density pass on modals·dialogs·toasts (primitive done; rest = 3 versions) | med |
| ~4h | **P5** | merge Friends into Messages (one surface) | med-hard · after P4 |
| ~4h | **B12** | @mentions: composer autocomplete + real resolve/notify | med-hard |
| ~4h | **P11** | typed, colour-coded tags + a tag-type filter facet (foundation for D5) | med-hard |
| ~4h | **P16** | upload progress → animation + minimizable (Drive-style) | med-hard · ties P3 |
| ~4h | **P19** | unread-message indicator on channels | med-hard |
| ~6h | **B10** | drag-to-select (marquee) + drag-file-onto-file → make folder | hard |
| ~6h | **P14** | file-browser view modes = real density levels (thumbnail + thin band) | hard |

**Deferred — do NOT build now** (post-beta / infra-gated): D1 (feed+commenting, after P4),
D7 (report/moderation), D2 (storage/billing, needs Stripe), D3 (audit log), D5 (required tags
per channel, builds on P11), D6 (review canvas/kanban/versions).


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
- [ ] **B10 · Drag-to-select + drag-and-drop don't work (round-7).** In the file browser: (a) a
      **marquee drag** on empty space should rubber-band-select cards; (b) **dragging a file onto
      another file** should offer to **make a folder** from them (Finder/Drive). Today neither
      fires. *Files:* `app/screens/explorer.js` (grid pointer handlers, `enableDropUpload`),
      `app/data.js` (createFolder + moveToFolder to seed the new folder). *Hard.*
- [x] **B11 · Clicking my pfp opens a dropdown, should go to my profile (round-7).** *Done.* The
      left-rail profile button now navigates straight to `/u/<me>` (no dropdown). Its old items are
      already reachable: Profile = the destination, Settings = the profile's Settings tab, Sign out
      = User settings → Account; Status moves to the profile in **P15**. *Files:* `app/shell.js`.
- [ ] **B12 · @mentions don't actually work (round-7).** The composer `@` autocomplete +
      posting a real mention that resolves/notifies the person. Today it inserts text but nothing
      resolves. *Files:* `app/screens/workspace.js` (composer autocomplete + mention render),
      `app/data.js`/RPC (mentions table + notify). *Medium-hard.*
- [ ] **B13 · Gate write actions on the file ⋯ menu by permission (data-layer audit, 2026-08-29).**
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
- [ ] **P11 · Typed, colour-coded tags + a tag-type filter facet (round-6, owner).** Tags gain a
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
- [ ] **P14 · File-browser view modes = real density levels (round-7).** Rework the explorer view
      modes into traditional file-browser densities (e.g. compact list → comfortable → large). At
      the larger sizes a **content thumbnail** replaces the kind icon, but every card keeps a **thin
      bottom band**: the kind icon (audio/video/image/folder/zip/other) + filename (+ extra info if
      room) — modelled on the **landing-page cards** (screenshot the landing / `docs/design/` if
      needed). *Files:* `app/cards.js` (`workCard`/`folderCard`), `app/screens/explorer.js` (VIEWS +
      grid/list), `styles/content.css`. *Hard.* Load **`eski-style`**.
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
