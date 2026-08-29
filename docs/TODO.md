# eski — MASTER TODO (the one list + the runbook)

This is the **single entry point**. If someone says *"pick up where I left off"*, start here:
do the **Start here** ritual, take the **top unchecked item** in the Work Queue, build it,
**test it the deterministic way below**, commit + push to `preview`, tick the box, and append
a `BUILDLOG.md` entry. Detail lives in [`BUGLOG.md`](BUGLOG.md) (triage), history in
[`BUILDLOG.md`](BUILDLOG.md), the test method in [`VERIFICATION.md`](VERIFICATION.md), the
owner's live checklist in [`QA-CHECKLIST.md`](QA-CHECKLIST.md). **CANON wins** on any conflict.

---

## Start here (every session — do this first)

1. **Branch.** Develop on **`preview`** and push there — it deploys to `preview.eski.lol`.
   ```
   git fetch origin preview && git checkout preview && git pull origin preview
   ```
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

### 1 · Fixes for broken UI

- [ ] **B1 · Scrim-click closes every modal.** Clicking the dark backdrop (where you clicked to
      open) should dismiss any modal; today some don't. Fix once in the modal primitive.
      *Files:* `app/ui.js` (`openModal`), `styles/primitives.css`. *Easy.*
      *Test:* demo screenshot — open a modal, click the scrim, assert it's gone (`document.querySelector('.modal')===null`); repeat for upload/settings/status.
- [ ] **B2 · No URL breaks on rename.** A profile handle change must `replaceState` to `/u/<new>`
      and every Profile link must use the new handle; server/channel URLs are id-based (safe) —
      confirm and cover any gap. *Files:* `app/screens/profile.js`, `app/data.js`, `app/router.js`.
      *Easy.* *Test:* static trace + demo: after an in-page handle change, assert `location.pathname`
      updated and no route resolves to a 404 view.
- [ ] **B3 · Message permalink (Copy link) works.** `⋯ → Copy link` should copy a permalink that,
      when opened, scrolls to and flashes the message. *Files:* `app/screens/workspace.js`,
      `app/router.js`, `app/data.js` (fetch-by-id). *Medium.* *Test:* backend — service-role read of
      one message by id succeeds; demo — open the permalink route, assert the row scrolls into view + gets the flash class.
- [ ] **B4 · Directly-typed `/create` · `/upload` · `/settings` open their modal over the shell**
      instead of the "not yet ported" placeholder (normal use opens them as modals, so low
      priority). *Files:* `app/main.js` route dispatch. *Medium.* *Test:* demo — visit each path, assert the modal mounts over the shell, not the placeholder screen.

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
- [ ] **K3 · Report (moderation).** The `reports` table exists and is self-contained — the
      easiest real feature. Add an insert path (RLS or a small RPC) + wire the existing Report
      stubs (§C.4/§C.7/§C.11). *Files:* maybe `schema-24-reports.sql` (policy/RPC),
      `app/ui.js`/report modal, `app/data.js`. *Medium.* *Test:* backend — as an authenticated
      non-admin, inserting a report row is accepted; reading others' reports is denied. Use the
      reliable role-sim (gate via a `SECURITY DEFINER` check if the policy is inline-uid).
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
