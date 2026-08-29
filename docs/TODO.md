# eski — MASTER TODO (the one list + the runbook)

This is the **single entry point**. If someone says *"pick up where I left off"*, start here:
do the **Start here** ritual, take the **top unchecked item** in the Work Queue, build it,
**test it the deterministic way below**, commit + push to `preview`, tick the box, and append
a `BUILDLOG.md` entry. Detail lives in [`BUGLOG.md`](BUGLOG.md) (triage), history in
[`BUILDLOG.md`](BUILDLOG.md), the test method in [`VERIFICATION.md`](VERIFICATION.md), the
owner's live checklist in [`QA-CHECKLIST.md`](QA-CHECKLIST.md). **CANON wins** on any conflict.

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

## Definition of done (per item)

Verified the right way for its kind → committed to `preview` with a clear message →
pushed → box ticked here → `BUILDLOG.md` entry appended. Honest status only: "backend-verified
(service-role shape)", "renders in demo", or "needs live QA — claim added" — never a bare
"works".

---

## The Work Queue

Four categories. Within each, ordered **easiest first**, and anything that depends on another
item is placed **after** what it needs. Cross-category dependencies are called out inline.
IDs are stable handles (`B*` broken-UI, `K*` backend, `P*` polish, `D*` deferred).

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
- [ ] **B3 · Message permalink (Copy link) works.** `⋯ → Copy link` should copy a permalink that,
      when opened, scrolls to and flashes the message. *Files:* `app/screens/workspace.js`,
      `app/router.js`, `app/data.js` (fetch-by-id). *Medium.* *Test:* backend — service-role read of
      one message by id succeeds; demo — open the permalink route, assert the row scrolls into view + gets the flash class.
- [ ] **B4 · Directly-typed `/create` · `/upload` · `/settings` open their modal over the shell**
      instead of the "not yet ported" placeholder (normal use opens them as modals, so low
      priority). *Files:* `app/main.js` route dispatch. *Medium.* *Test:* demo — visit each path, assert the modal mounts over the shell, not the placeholder screen.
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

### 2 · Fixes for backend

- [ ] **K1 · `preview_invite(code)` anon-readable RPC.** So the join card shows server name ·
      member count · inviter instead of generic copy. One `SECURITY DEFINER` function returning
      those fields for a valid, unexpired, unrevoked code; wire into `screens/join.js`.
      *Files:* new `schema-23-preview-invite.sql`, `app/screens/join.js`, `app/data.js`. *Easy.*
      *Test (deterministic):* call the RPC via MCP as `anon` for a real code → returns the row;
      for a bad/expired code → returns nothing. Reliable (it's `SECURITY DEFINER`).
- [ ] **K2 · Server icon + cover + profile banner upload persist and render.** (round-3 #2 — the
      confirmed live bug + the known BUILDLOG gap.) Wire upload → `api/sign.mjs` R2 PUT →
      `servers.icon_key`/`servers.cover_key` (and `profiles.banner_key`) → render on the rail
      badge, server header, and profile hero. *Files:* `app/shell.js` / server-settings modal,
      `app/screens/profile.js` (banner), `app/data.js` (`updateServer` already clears cache).
      *Medium.* **Do before P3** (loading states should cover this new flow). *Test:* backend —
      service-role + authenticated update of `servers.icon_key` as the owner succeeds under RLS
      (`updateServer` path); render is live-only → add a QA claim. Confirm `works`-style meter
      isn't involved (icons aren't `works`).
- [ ] **K4 · Delete server + invite management (expiry / revoke).** Owner delete-server flow
      (type-the-name confirm → cascade) and invite expiry/revoke in the invite modal.
      *Files:* RPC(s) in a new schema file, `app/data.js`, server-settings + invite modals.
      *Medium-hard.* *Test:* backend — owner can delete own server + cascade; a non-owner cannot;
      revoked/expired invite fails `join_via_invite`. All gate through `SECURITY DEFINER` → reliable.
- [ ] **K5 · Harden create-server into an atomic `create_server` RPC.** Today it's 4 client
      inserts under RLS (owner passes every `has_perm`), not atomic. *Files:* new schema RPC,
      `app/data.js` create-server path. *Medium-hard.* *Test:* backend — the RPC creates
      server+default-channel+owner-membership+@everyone-role in one call; partial failure rolls back.
- [ ] **K6 · Realtime echo — DM / notification / reaction / edit.** Core but **live-only**
      (two-session echo can't run in-sandbox — headless Chromium can't egress). *Files:* the
      Realtime subscriptions in `app/data.js`/screens. *Hard.* *Test:* wire it, syntax-check,
      and add a QA claim ("second window sees X without reload"); the owner verifies on preview.
- [x] **K7 · Atomic `create_work` upload RPC — fixes the total upload 42501 (round-4).** DONE
      (`schema-23-create-work-rpc.sql`, migration `p13_create_work_rpc`, applied live +
      `upload.js doPost` rewritten). One `SECURITY DEFINER` call registers the blob, inserts the
      work, files its placement (server) / saved_items (personal folder) and tags — atomically, as
      the table owner, so the `works`-insert 42501 can't block it — and re-checks the fence itself
      (author = caller; server ⇒ `member_of` + `has_perm('upload')`; channel/folder must belong to
      the server). Also **every file type accepted** (allowlist → safe-shape ext) + `.flp`/DAW/AIFF
      recognition. Verified via reliable role-sim (personal + tags, server + placement, non-member
      refused). **Live R2 round-trip is owner-only → QA-CHECKLIST §12 rows.**
- [ ] **K8 · Backend write-reliability audit + hardening (round-4 — "make sure everything actually
      works").** The `works`-insert bug (K7) proves a **direct RLS-fenced client write can fail or
      silently no-op live in ways static analysis, service-role checks, and spy triggers all miss.**
      Audit every direct write in `app/data.js`/screens and convert the load-bearing ones to
      `SECURITY DEFINER` RPCs (the reliable path). **Two failure classes:** (a) **hard-fail** —
      inline-`auth.uid()` `INSERT` that 42501s live like `works` did; (b) **silent no-op** — an
      `UPDATE`/`DELETE` that matches 0 RLS rows and returns **no error**, so the UI shows success
      while nothing persisted (this is the **server icon/cover + profile banner** class — see
      **K2**). **Suspect direct writes to verify/convert (each: does a live row actually change?):**
      `reports` insert · `dm_messages` insert · `messages` insert/edit/delete/pin · `comments`
      insert/delete · `share_links` insert/revoke · `content_tags` add/remove · `starred_items`
      · `saved_items` · `save_folders` insert · `server_prefs`/`dm_members`/`notifications`
      updates · `works` trash/restore/rename/hide/setVisibility · `channels`/`roles` insert/update/
      delete · `servers` update (**icon/cover**, K2) + delete + leave + invite create/revoke ·
      create-server's 4 inserts (**K5**). **Confirmed-good live:** `servers` insert (owner owns a
      server), `profiles` upsert/update (avatar_key persisted). *Method:* for each, EITHER prove a
      live row changes (role-sim a definer path, or check the actual table after the app runs), or
      convert to an RPC. **Do NOT trust "no error" — trust a changed row.** *Medium-hard, ongoing.*
- [ ] **K9 · Google-Drive-style folder & file sharing + "Request to join server" (round-4).**
      Share a **folder** (and a file) to a public link, Drive-style — a read-only viewer of the
      folder's contents reachable outside the server. Today `share_links` targets a single
      `work_id` only (`app/data.js` shareWork/`resolve_share_link`, `screens/shared.js` viewer);
      extend it to a **folder target** (server folder or a personal `save_folder`) with its own
      `SECURITY DEFINER` resolver RPC + RLS, and a folder viewer screen. Add a **"Request to join
      server"** button on the share/join surface (`screens/join.js` / the shared-folder view) that
      files a join request the server admins can approve — needs a `join_requests` table (or reuse
      invites) + an RPC + an admin surface. *Files:* new `schema-*-folder-share.sql` +
      `schema-*-join-requests.sql`, `app/data.js`, `app/screens/shared.js`, `app/screens/join.js`,
      the share dialog (`explorer.js`), server-settings (approve requests). *Hard.* *Test:* backend
      — anon resolves a valid folder share to its file list; a revoked/expired one returns nothing;
      a join request inserts + an admin approve adds membership; all via `SECURITY DEFINER` → reliable.

### 3 · UI polish

- [ ] **P1 · Center empty-state / placeholder text in its own pane.** (round-3 #5.) Every default
      text block (channel "This is the start of #…", empty explorer, empty DM, etc.) is centered
      **vertically and horizontally** within its pane — globally, one rule, not case by case.
      Refines the earlier "too much vertical space" fix (centered, **not** top-anchored).
      *Files:* `styles/*` (the `.emptystate` and equivalents), audit each pane that renders one.
      *Easy.* *Test:* demo screenshot each empty surface (empty channel, empty explorer, empty DM,
      no-friends) in both themes; assert the text block is centered in its pane and legible.
- [ ] **P2 · Perf: dedupe `profiles` + defer settings reads.** `loadUserSettings` re-fetches what
      `loadRail` already has — reuse it; defer Storage/Privacy reads until their panel opens (the
      Profile panel shouldn't wait ~700ms on `storage_meters`/`storage_balance`/`friendships`).
      *Files:* `app/data.js`, `app/screens/usersettings.js`. *Easy-medium.* *Test:* static — assert
      the settings render path makes no duplicate `from("profiles")` call and no storage/friend
      fetch before its panel opens (grep + trace); demo — settings still renders.
- [ ] **P3 · Loading animations for every async action.** File upload (has text progress only),
      **folder upload**, **changing pfp**, **server icon/banner upload** — add one shared busy
      affordance (a button-spinner + a light overlay) and apply it at every async call site.
      *Files:* a small helper in `app/ui.js`, then the upload/pfp/icon/banner call sites.
      *Medium.* **Do after K2** so the new icon/banner flow gets covered too. *Test:* demo — trigger
      an async action, assert the busy class/overlay appears while pending and clears after; syntax-check.
- [ ] **P4 · Cut social (Feed + post commenting) from the beta nav/routes.** (round-3 #1.) Remove
      Feed from the home/rail nav and the `feed` route; remove the public comment thread from the
      Details pane (**keep the post itself** — public posts stay, reached via a user's profile
      Public shelf). Mirror the cut in **CANON** and **CLAUDE.md** exactly like the 2026-08-18
      canvas/kanban cut, so the contract matches. Moves the features to **D1**. *Files:* `app/shell.js`,
      `app/main.js`, `app/screens/feed.js` (retire route), Details pane comment section, `docs/CANON.md`,
      `CLAUDE.md`. *Medium.* **Do before P5** (both touch the home nav; fewer items first). *Test:*
      demo — Feed is gone from nav and `/feed` no longer resolves; a profile Public shelf still opens a post; the Details pane shows no comment thread; no `pageerror`.
- [ ] **P5 · Merge Friends into Messages (one surface).** Friends lives inside the Messages pane
      (a tab/section), not a separate screen reached by a Friends button. *Files:* `app/screens/dms.js`
      (or messages/friends screens), `app/main.js`, `app/shell.js` nav. *Medium-hard.* **After P4.**
      *Test:* demo — Messages renders with a Friends tab/section in-pane; switching stays in one view; the standalone Friends route/button is gone or folds in; no `pageerror`.

### 4 · Deferred (post-beta / infra-gated — do NOT build now)

The correct behaviour today is an explicit signpost (grayed control + WIP toast), not a fake.

- [ ] **D1 · Feed + post commenting** — deferred by P4. Public posts remain (via profile). *(post-beta)*
- [ ] **D7 · Report (moderation)** — was K3; deferred by owner (2026-08-29). The `reports` table
      exists and is self-contained; add an insert path (RLS or small RPC) + wire the Report stubs
      (§C.4/§C.7/§C.11) when moderation is prioritized. *(post-beta)*
- [ ] **D2 · Storage / billing** — usage slider, blended $/GB, single-payer server storage, export.
      Needs Stripe. *(`[infra]`, ~P8)*
- [ ] **D3 · Audit log** — read-only moderation history (actor/target/reason/time). *(post-beta)*
- [ ] **D4 · Full-screen Server-settings port** — largely vestigial; actions moved to modals. *(post-beta)*
- [ ] **D5 · Required tags / fields per channel** (BPM/Key on `#samples`) — schema
      (`required_fields` + structured `work_fields`) + channel-settings admin + upload enforcement
      + an RLS/trigger fence. Owner-requested; substantial. Promote out of Deferred only if beta needs it. *(post-beta unless prioritized)*
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
