# CODEGEN — the Claude Code build playbook

How eski gets built: not a queue of prompts for a weak model, but a **playbook for
Claude Code** (Opus 4.8, or Sonnet 5 where the work is mechanical) to build the app
itself — authoring the backend through the **Supabase MCP**, porting the UI from the
gallery, verifying its own work, and checkpointing so the build survives being
interrupted by a context or usage limit.

Two sources sit above this file and win every disagreement:

- **[`CANON.md`](CANON.md)** — the contract (vocabulary, roles→RLS/RPC, the per-screen
  registry, §E the schema/RPCs/Realtime, §E.10 the per-control backend coverage matrix).
- **[`design/gallery.html`](design/gallery.html)** — the pixels. Every screen, state and
  dialog is a URL (`?app=1#screen/state`, `#dialog/id`); [`design/STATES.md`](design/STATES.md)
  lists them and [`design/verify.mjs`](design/verify.mjs) drives them.

If code, this guide, and CANON drift, **CANON wins** — fix the guide or the code, never
let the codebase become a third source of truth. That silent-undo is this repo's one
failure mode.

> **Beta cut.** The canvas, kanban boards, and numbered versions are out of the beta
> (their tables/RPCs/screens are removed from CANON and from the phases below). Voice/
> video (`vc`) is a v2 deferral — ship the WIP placeholder, no backend.

---

## §0. The operating model — read this first

**You are the whole build team.** One agent does the schema, the RLS, the RPCs, the
screen ports, the verification, and the git — there is no separate code-gen model to
hand UI prompts to. That changes everything about how this is sequenced.

### The stack (locked, CANON §G)
Vanilla HTML + CSS + JS **plus a thin signals reactive layer** (`@preact/signals-core`,
~2 KB) — no meta-framework, no bundler, no build step. Supabase (Postgres + Auth +
Realtime) behind RLS; Cloudflare R2 for media behind `api/sign.mjs`; Vercel deploys
`main` directly. **The live app fills the viewport; 1440 is a prototyping canvas only.**

### Build in resumable sessions
A full build does **not** fit in one context window, and an Opus session **will** get
cut off by the context limit or a usage cap and have to wait. So the unit of work is a
**session**, sized to finish-and-checkpoint inside one window, and every session is
**cold-startable** — a fresh Claude with no memory of the last one can resume from the
repo alone. Three things make that true:

1. **`docs/BUILDLOG.md` — the append-only build log.** Every session ends by appending:
   the phase/session id, what's **DONE** (with the commit sha and the migration name),
   what's **NEXT** (the exact next session to run), and any gotcha the next session needs.
   This is the single place the build's live state is written in prose — and the reason
   **any** Claude in **any** chat can take over (§6.1). When you start a session, add an
   `IN PROGRESS: <branch> — <what> — <started-at>` line and clear it when you check in;
   that's the lightweight claim that stops two agents grabbing the same item.
2. **Git is the real checkpoint.** Commit at every green sub-step; the working tree is
   never left half-broken. `main` is production, so **build on a branch** and only merge
   when green. The repo and the database must agree at every checkpoint — if you
   `apply_migration`, you commit the same SQL as a `schema-*.sql` file in the *same*
   session (never an applied migration with no committed source).
3. **The DB is queryable truth.** `list_migrations` + `list_tables` (Supabase MCP) show
   exactly what's really deployed, independent of any doc — so a resuming session trusts
   the database, not its own notes.

**Cold-start ritual — run at the top of every session:**
```
1. read docs/BUILDLOG.md (tail)           — where we are, what's next
2. git log --oneline -8 ; git status      — last green checkpoint, clean tree?
3. Supabase MCP: list_migrations ; list_tables   — real DB state
4. node docs/design/verify.mjs            — UI gate still green?
5. pick up the NEXT item from BUILDLOG; enter plan mode; execute
```

### Model & effort selection
- **Opus 4.8 (or Fast mode)** for anything load-bearing or novel: the schema + RLS
  design, every `security definer` RPC, the storage/dedup math, and the **first** port
  of each screen *archetype* (the first list, the first modal, the first media viewer).
- **Sonnet 5** for the mechanical repeats once an archetype is proven — porting the Nth
  similar dialog, the Nth settings panel — under the exact same guardrails. Cheaper and
  faster; downshift deliberately.
- **Subagents** (Explore / general-purpose) for read-only fan-out (mapping a CANON slice
  to the gallery panels it governs) and for parallel verification of independent
  surfaces. Reconcile their output at a checkpoint; never let two subagents edit the
  same file.
- **Plan mode** at the top of each session: propose the session's steps and its
  definition-of-done, then execute in small commits.

### Model routing — which model runs which session

Each phase splits into **Opus sessions** and **Sonnet sessions** so you can open the
right chat for the right work (and hand off between them, §6.1). The rule of thumb:
**Opus owns the fence and the reactive/interaction core; Sonnet ports well-specified
surfaces once the archetype exists.**

| Phase | Session (session-sized unit) | Model | Why |
|---|---|:--:|---|
| **P0** | Scaffold: router + signals wiring + Supabase client + tokens/sprite | **Opus** | sets the reactive/data patterns everything reuses |
| **P1** | Schema + RLS — every migration-unit | **Opus** | security-critical; an RLS mistake leaks data |
| **P2** | RPCs + triggers + `search_all` | **Opus** | `security definer` correctness + audit-log side effects |
| **P3** | Primitives (button/field/modal/menu/avatar/tag/toggle/checkbox/bar/toast/tabs/dropdown) | **Sonnet** | precise `eski-style` spec, mechanical port — *first* Menu/Dropdown archetype on Opus if it fights the spec |
| **P4a** | Shell: rail · channel column · header · members rail · group headers | **Sonnet** | structural port from the gallery |
| **P4b** | Chat core: message list/row · composer (markdown/@#/emoji) · thread · **Realtime GL** (channel subscribe · presence · typing · mark-read) | **Opus** | the reactive/Realtime heart of the app |
| **P5a** | **Details pane** (the one media viewer + transport) · **File explorer** (selection/marquee/two mounts/folder tree) · **Upload** (sign + dedup + storage meter) | **Opus** | interaction-heavy + storage/dedup logic |
| **P5b** | Feed grid · Profile shelves/POVs | **Sonnet** | grid + card port over an existing archetype |
| **P7a** | DM Realtime · friendship-gated `create_dm` · live bell (`user:{id}`) | **Opus** | Realtime + gating |
| **P7b** | Friends lists (All/Pending/Blocked) · Notification rows/tabs | **Sonnet** | list/row port |
| **P8a** | Roles editor + permission matrix · assign-roles · channel-permissions · the **perm-gate GL** (`has_perm` re-checks) | **Opus** | the render must match the RLS fence exactly |
| **P8b** | Settings panels: General · Channels · Moderation · Audit · Invites · Storage & billing | **Sonnet** | form/panel port |
| **P9** | Create · Join · Sign-in · 404 · dead-invite · denied · quick-switcher | **Sonnet** | cards + states (quick-switcher scoping → Opus if it fights) |

Two standing overrides, whichever model a phase names:
- **Always Opus for the *first* instance of a new archetype** — the first list, the first
  modal, the first media viewer — even inside a Sonnet phase; then Sonnet does the repeats.
- **Escalate to Opus** any session where the two-signal gate keeps failing or the change
  touches a policy/RPC. If in doubt, it's an Opus session.

### The two-half rhythm of every phase
Backend precedes the UI that reads it. Within a phase: **author + apply + verify the
backend (SQL via the Supabase MCP), then port the UI that consumes it.** The RLS policy
is the fence; the UI is only the signpost — a screen never ships before the policy that
protects its data.

---

## §1. The Supabase MCP workflow (the backend half)

All schema and policy work goes through the Supabase MCP, not raw `psql`. The repo holds
the SQL (`schema-*.sql`, CANON §E.8 order); the MCP applies it. Keep both in sync.

### Tool cheat-sheet (which tool for what)
| Need | Tool | Notes |
|---|---|---|
| See what exists before changing it | `list_tables`, `list_migrations`, `list_extensions` | **always** run before a schema change |
| Apply DDL (tables, policies, functions, triggers) | `apply_migration` | named + versioned; **idempotent** SQL only |
| Seed data · RLS policy tests · ad-hoc reads | `execute_sql` | **not** for schema; this is your test harness |
| Security + performance audit | `get_advisors` | run after **every** migration; fix before moving on |
| Keep the client typed to the schema | `generate_typescript_types` | regenerate + commit after every schema change |
| Client config for the app | `get_project_url`, `get_publishable_keys` | into the env module (P0.2) |
| Debug a failing call | `query_logs` | postgres / auth / realtime logs |
| Look something up | `search_docs` | Supabase docs, when unsure of a pattern |
| A safe place to test migrations | `create_branch` → … → `merge_branch` | see below |
| Cost gate on a branch/project | `get_cost`, `confirm_cost` | branches cost; confirm first |

### Branch-first safety (there is no staging)
`main` → prod and `apply_migration` writes to the **remote project directly**. So:

- **Greenfield (no real data yet):** apply straight to the project. Fast, fine.
- **Once there is data you care about:** `create_branch` (a Supabase dev branch is a copy
  of the DB) → `apply_migration` + `execute_sql` tests + `get_advisors` **on the branch**
  → when green, `merge_branch` to prod. `confirm_cost` first. This is the safety net that
  substitutes for the missing staging environment.

### Migration discipline
Every migration is **re-runnable**: `create table if not exists`, `create or replace
function`, `drop policy if exists` before `create policy`, `alter table … add column if
not exists`. Follow the CANON §E.8 numbered order (servers → roles/storage → works/
folders/placement → channels/messages → comments/profiles → DMs/friends → notifications/
prefs → moderation/billing → RPCs/indexes/grants → `notify pgrst 'reload schema'` +
realtime publication). One migration = one coherent unit that has its own allow+deny
test.

### Edge / server functions
The beta's only server function is **`api/sign.mjs` on Vercel** (R2 presigning) — not a
Supabase Edge Function (no ffmpeg there). `transcode` (audio, F11) is a later Vercel
Node function with `ffmpeg-static`. `deploy_edge_function` exists if a genuine Supabase
edge function is ever needed (e.g. a `notify` fanout later), but P0–P9 don't require one.

---

## §2. RLS-first verification (prove the fence before the signpost)

A table is not "done" when it exists — it's done when a test proves its policy both
**allows** the right access and **denies** the wrong access.

For each policy, after `apply_migration`, immediately `execute_sql` a test that walks the
relevant rows of the CANON §B capability matrix — **at least one allow case and one deny
case** per role that matters (owner / admin / member / timed-out / non-member / blocked).
Impersonate with the documented pattern (seed a couple of `auth.users`, set
`request.jwt.claims` / `role` per statement) so `auth.uid()` resolves inside the policy.
Examples of what each test must show:

- `messages`: a non-member `select` in a server they're not in → **0 rows**; a member → **N**.
- `works` (`works_read`): public visible to a friend, server visible to a member, private
  only to the owner, and a **trashed** (`deleted_at`) work drops out of every view but Trash.
- private channel (`channel_roles` rows): non-granted member → **0**; granted → **N**.
- storage: a user-owned work bumps the **user** meter, a server-owned work the **server**
  meter, and a blob shared by two of one owner's works counts **once** (dedup).

Then, before moving on:
- `get_advisors` (**security**) → zero "RLS disabled" / "policy permits all" findings.
- `get_advisors` (**performance**) → add the FK/policy indexes it flags (this *is* §E.7).
- `generate_typescript_types` → commit the regenerated types so the UI can't drift.

An RPC is done when a scripted `execute_sql` round-trip shows it produces exactly the
rows / notification / meter delta CANON specifies **and** is rejected when the permission
gate fails.

---

## §3. The UI-port recipe (the gallery is law)

Port one surface at a time — a screen, a single state, or one dialog — each identified by
its gallery state-URL. Never invent a control the gallery doesn't have; reuse the
`eski-style` tokens and the P3 primitives.

**Data binding:** a small **signals store** per domain (`session`, the active server,
channel, message list, notifications) wraps `supabase-js` queries + Realtime
subscriptions; components read the signals and re-render on change. Optimistic write →
reconcile against the returned row / Realtime event.

**Acceptance = two signals, both required, both themes, 1024↔1440 via `&w=`:**
1. `verify.mjs` **DOM/structure diff** vs the state-URL — deterministic, names the exact
   element/class/token that diverged.
2. A **Playwright screenshot** compared to the gallery panel — the vision pass rules on
   flagged drift.
Plus **zero console errors**. The RLS fence (P1/P2) already exists, so the port wires to
real data, real RPCs, and real Realtime — its "done" asserts live behaviour, not a mock.

**The guardrails (every port re-checks them):** search before you define; one canonical
name (UI = code = docs); every colour from a token, no hex, member hue server-scoped and
absent from public profile + Feed; `--r` on chrome, media square, round only for avatars/
presence dots; one square icon/close button style; modals on a scrim, no drop shadow;
the app fills the viewport (1440 is prototyping only).

---

## §4. Phase map (dependency order)

Backend precedes the UI that reads it; primitives precede screens; screens precede their
dialogs. Each phase is one or more **sessions** (§0); the "checkpoint" column is what must
be green — committed + logged — before the next phase starts.

| Phase | What | Sessions | Checkpoint |
|---|---|---|---|
| **P0** | Scaffold: app shell + signals + router, Supabase client/env, tokens+CSS, icon sprite | 1 | app boots, a signal re-renders, tokens resolve both themes, sprite shows |
| **P1** | Schema + RLS, in CANON §E.8 order | 3–4 | every table has a passing allow+deny test; `get_advisors` security clean; types committed |
| **P2** | RPCs + triggers + `has_perm`/`can_view_channel` + `search_all` | 2 | each RPC has a green round-trip test |
| **P3** | Design-system primitives from `eski-style` | 1–2 | each matches its spec, both themes, tokens only |
| **P4** | 3-pane shell + Workspace (chat, members, composer, thread) + Realtime | 3–4 | workspace renders **live** messages + presence |
| **P5** | Feed · File explorer (+ Trash) · Details pane · Profile · Upload | 3–4 | every media kind renders incl. type-cards; details pane is the one viewer |
| **P7** | Messages/DMs · Friends · Notifications | 2 | DM round-trip, live bell, friendship RPCs |
| **P8** | Admin: settings shell, roles editor, assign-roles, channel perms, moderation, audit, invites, storage & billing | 3 | every perm-gated control matches the fence |
| **P9** | Create · Join · Sign-in · 404 · dead-invite · denied · quick-switcher | 1–2 | every §C.14/§C.20 state reachable |

*(P6 — canvas — is cut. The number is left as a gap so later numbers don't shift.)*

The exhaustive per-surface checklist (which dialog belongs to which screen, every state
URL) lives in [`prompts/`](prompts/) — treat those as the granular to-do inside each
phase, not as prompts to feed a model.

---

## §5. The phase playbooks

Each playbook: **Goal · Read · Do · Verify · Checkpoint.** Work top to bottom; commit and
log at each Verify-green.

### P0 — Scaffold (1 session, Opus)
- **Read:** CANON §C.3 (route manifest), §G (stack); `prompts/P0-scaffold.md`.
- **Do:** app shell `index.html` + a hash/History router mounting an empty labelled
  `.screen` per §C.3 route (mirror the gallery's `?app=1#route`); wire the **signals**
  primitive (a signal-bound placeholder that re-renders proves it); the Supabase client +
  typed env module (`get_project_url` / `get_publishable_keys`) + a `session()` accessor;
  import the tokens/base CSS from `eski-style` + the theme swap; mount the `#i-*` sprite +
  an `icon()` helper.
- **Verify:** every route mounts its placeholder, no console error, no full reload; a deep
  link resolves via the Vercel rewrite; a signal updates the DOM; tokens resolve in both
  themes.
- **Checkpoint:** commit; BUILDLOG "P0 done, next P1.1 servers".

### P1 — Schema + RLS (3–4 sessions, Opus; branch-first once data exists)
- **Read:** CANON §E.1 (tables), §E.2 (enums), §B (the permission matrix each policy
  enforces), §E.8 (order); `prompts/P1-schema.md`.
- **Do:** one migration-unit at a time in §E.8 order — `servers`/`server_members`/
  `server_invites` (+ `member_of`, `is_server_admin`) → `roles`/`member_roles`/
  `channel_roles` (+ `has_perm`, `can_view_channel`) + storage (`media_blobs`,
  `storage_meters`, `storage_balance`, `works.owner_type/owner_id`) → `works`(+`works_read`,
  `deleted_at`, `hidden`, `approved_at`)/`work_items`/`folders`/`placement`/
  `content_tags`/`starred_items`/`share_links` → `channel_categories`/`channels`(+
  `post_policy`, `allowed_kinds`, `default_folder_id`)/`messages`/`message_reactions`/
  `message_pins`/`channel_reads`/`mentions` → `comments`/`profiles`(+`banner_key`) → `dm_*`/
  `dm_message_reactions`/`friendships` → `notifications`/`server_prefs`/`channel_prefs`/
  `saved_items`/`save_folders` → moderation (`server_bans`, `reports`, `audit_log`,
  `timeout_until`) + billing (`invoices`, `sessions`). Apply each with `apply_migration`
  **and** commit the matching `schema-*.sql`.
- **Verify (per unit):** `execute_sql` allow+deny tests (§2); `get_advisors` security clean;
  `generate_typescript_types`.
- **Checkpoint:** commit per unit; BUILDLOG names the last applied migration + the next.
- **Gotchas the log must carry:** the admin auto-hide rule (`servers`/`roles.
  hide_posts_by_default` → the `works`-insert trigger sets `hidden`); `works_read` honours
  a valid `share_links` token; `channel_roles` zero-rows = open to all (LOCKED, don't build
  the deny-overwrite v2 grain).

### P2 — RPCs, triggers, search (2 sessions, Opus)
- **Read:** CANON §E.3 (RPCs/triggers), §E.7 (search), §E.10 (which control calls which RPC).
- **Do:** each `security definer, search_path=public` RPC from §E.3 + its round-trip test:
  `join_via_invite`, `mark_channel_read`/`mark_server_read`, `toggle_reaction`,
  `pin_message`/`unpin_message`, `create_dm`/`create_group_dm`, `add_friend`/
  `respond_friend`/`block_user`, `move_to_folder`, `toggle_star`, `duplicate_work`,
  `save_to_files`, `create/revoke/resolve_share_link`, `hide_dm`, `approve_work`,
  `reorder_channels`/`set_channel_post_policy`, `set_member_roles`/`set_channel_access`,
  `restore_work`/`purge_work`/`empty_trash`, `ban/timeout/kick_member` (each writes
  `audit_log`), `billing_portal`, `revoke_session(s)`, `export_manifest`. Then the
  **triggers** (message-fanout → `mentions`+`notifications`; `works`-insert →
  `search_tsv` + auto-hide; refcount/meter maintenance; the 30-day Trash purge job) and
  `search_all(q,scope)` + the GIN indexes.
- **Verify:** each RPC produces exactly the asserted rows/notification/meter delta and is
  rejected when its gate fails; `get_advisors`; regen types.
- **Checkpoint:** commit; BUILDLOG.

### P3 — Primitives (1–2 sessions, Opus for the first of each, then Sonnet)
- **Read:** the `eski-style` skill (§1 tokens, §2 buttons, §4 components); `prompts/P3-primitives.md`.
- **Do, once each, reused everywhere:** `Button` (primary/default/sm/ghost/outline/danger) ·
  `IconButton`/`CloseButton` (square, `#i-x`) · `Field` · `Modal` (scrim) · `Menu`(+items/
  label/sep) · `Avatar`+`PresenceDot` · `Tag`/`uchip` · `Toggle` · `Checkbox` · `Bar` ·
  `Toast` · `Tabs` · `Dropdown`(`.btn`+chevron, multi-select `.menu`).
- **Verify:** each matches its `eski-style` spec in both themes, all states, tokens only.
- **Checkpoint:** commit; BUILDLOG.

### P4 — Shell + Workspace (P4a shell = Sonnet · P4b chat + Realtime = Opus)
- **Read:** CANON §C.4 (workspace template) + §C.3; `prompts/P4-shell-workspace.md`.
- **Do:** the shell (rail 58 · channel column 232 · main · members 210; fills the
  viewport) → server rail + menus → channel column (server-name→server menu, **Files is a
  channel entry**, channel list by kind, group headers as buttons) → channel header
  (Messages/Pins/Files tabs, bell dropdown, search, members toggle) → message list + row
  (grouped, member-colour byline, hover actions incl. Forward, reactions, edited) →
  composer (markdown toolbar, emoji-mart, @/# autocomplete, attach; slowmode/timed-out
  states) → thread view → members rail (+ member popover with the gated admin block) →
  **[GL]** `channel:{id}` live insert/edit/delete + `:typing` + `mark_channel_read`;
  `server:{id}` presence → members. Workspace edge states (new-server first-run, empty,
  reconnecting).
- **Verify:** workspace renders **live** messages (open two sessions, send, see it arrive);
  presence updates; every §C.4 state URL passes the two-signal gate.
- **Checkpoint:** commit per surface; BUILDLOG.

### P5 — Content screens (P5a details / explorer / upload = Opus · P5b feed / profile = Sonnet)
- **Read:** CANON §C.5 (Feed), §C.6 (File explorer — one component, two mounts; the
  Google-Drive selection model; Files-as-channel), §C.7 (Details pane — the one media
  viewer, backdrop close), §C.12 (Upload); `prompts/P5-content.md`.
- **Do:** Feed → **File explorer** (folder tree beside the channel column, grid/list/feed,
  multi-select: single-click select / ⌘/shift / marquee / ⌘A / Esc, double-click opens
  Details; Trash view; the two mounts — server + personal `My files`) → **Details pane**
  (the single viewer for image/video/audio/type-card, transport, info rail, comments for
  posts, closes on ✕/Esc/backdrop) → Profile (shelves + POVs) → **Upload sheet** (visibility
  tiles, add-details disclosure, location picker with nested new-folder). Wire each to
  `works`/`placement`/`folders`/`saved_items`/`starred_items`/`share_links` + `sign.mjs`.
- **Verify:** every media kind renders (incl. `.flp/.zip` type-cards); the details pane is
  the only viewer (no lightbox); selection + marquee behave; both mounts differ only by
  source; state URLs pass.
- **Checkpoint:** commit; BUILDLOG.

### P7 — Messages · Friends · Notifications (P7a DM Realtime + bell = Opus · P7b lists = Sonnet)
- **Read:** CANON §C.11 (DMs/Friends), §C.13 (Notifications); `prompts/P7-boards-dms-notifs.md`.
- **Do:** DM list + new-DM/group picker (friendship-gated) + conversation + composer;
  pin/mute/**hide**; Friends (All/Pending/Blocked, add-by-handle, accept/decline/block);
  Notifications (tabs, inline reply, mark-all, bell dropdown) → **[GL]** `create_dm`
  round-trip; `user:{id}` live bell.
- **Verify:** DM round-trip live; friendship RPCs gate correctly; bell updates in real time.
- **Checkpoint:** commit; BUILDLOG.

### P8 — Admin (P8a roles + permissions = Opus · P8b panels = Sonnet)
- **Read:** CANON §B (matrix), §C.16–C.19, §C.4 (moderation); `prompts/P8-admin.md`.
- **Do:** settings shell + nav (with the Back-to-server item) → General (name/desc/icon/
  cover) → Channels (who-can-post/slowmode/default-folder/allowed-types/private→allow-list)
  → Roles editor (permission matrix → `roles.permissions`) → Assign-roles modal → Channel
  permissions modal → Moderation (timeouts/bans/take-action/post-approval queue/**auto-hide
  defaults**/bulk-user actions) → Audit log → Invite links → Storage & billing (two
  sliders, portal, receipts). Every perm-gated control **[GL]** re-checks `has_perm`/
  `is_server_admin` — the render is a signpost, the RLS is the fence.
- **Verify:** each gated control appears only for a real admin **and** the underlying write
  is refused server-side for a non-admin (test both).
- **Checkpoint:** commit; BUILDLOG.

### P9 — Utility & focus (1–2 sessions; Sonnet)
- **Read:** CANON §C.14 (Create/Join/Sign-in), §C.20 (utility), §C.15 (quick switcher).
- **Do:** Create-server (2-step → new-server first-run) · Join preview · Sign-in/claim
  handle (magic-link/OAuth) — centred, no rail · 404 · dead-invite (4 copy states) ·
  access-denied (never leaks existence) · quick switcher (⌘K, scoped to `can_view_channel`).
  Wire the exits (every focus screen has a way back, CANON §C.3 nav contract).
- **Verify:** every §C.14/§C.20 state reachable and exitable; `join_via_invite` works.
- **Checkpoint:** commit; BUILDLOG; the app is feature-complete for the beta.

---

## §6. Working inside usage & token limits (the resumability contract)

This build **will** be interrupted — a context window fills, or a usage cap hits and you
wait for the reset. Plan for it so an interruption costs nothing:

- **Never start work you can't checkpoint in the current window.** Scope a session to one
  migration-group or one screen-plus-its-dialogs. If you're near the limit, *stop at a
  green sub-step and log* rather than pushing into a half-finished surface.
- **The repo and the DB must agree at every checkpoint.** If you `apply_migration`, commit
  the `schema-*.sql` in the same session. A migration applied to the project with no
  committed source is the one state a resuming session can't trust.
- **End every session the same way:** verify green → `git commit` → append `docs/BUILDLOG.md`
  (done sha + next session) → `git push`. That's the durable handoff.
- **Start every session the same way:** the cold-start ritual in §0 (BUILDLOG, git log,
  `list_migrations`/`list_tables`, verify, then plan mode).
- **Buy wall-clock back with parallelism** only where surfaces are independent: farm
  independent tables (P1) or independent screens (P5/P8) to subagents, reconcile at a
  checkpoint, never two agents in one file.
- **Downshift the model** once an archetype is proven — Sonnet 5 for the repeats — to
  stretch the usage budget across more surfaces per window.
- **On resume after a wait,** trust `list_migrations`/`list_tables` over any note: if the
  DB is ahead of the committed SQL, reconcile (commit the missing source) before building
  on top.

There is no fixed token budget to "buy" the way a per-prompt code-gen model needed — the
cost is Claude Code usage, and the lever is **sessions sized to checkpoint cleanly**. A
clean session that ends green is never wasted; a heroic session that dies mid-surface with
an uncommitted tree is.

### §6.1 Handing off between agents / chats

Because **all build state lives outside any chat** — in the repo (`git` + `BUILDLOG.md`)
and in the database (queryable via `list_migrations`/`list_tables`) — the builder is not
tied to one conversation. You can stop in one chat and continue in another, run a second
agent after the first, or (carefully) two at once. Nothing is stored in a session's head
that the next session can't reconstruct from the repo and the DB.

- **Sequential hand-off (one agent after another — the common case).** Agent A ends its
  session at a green checkpoint: verify green → commit → BUILDLOG (`DONE` sha + `NEXT` +
  clear its `IN PROGRESS`) → push. Agent B, in a fresh chat, runs the **cold-start ritual**
  (§0), reads `NEXT`, and continues. No overlap, no coordination beyond the log. This is
  the intended way to build across many short sessions and across usage-cap waits.
- **The claim line prevents collisions.** Before working, an agent adds `IN PROGRESS:
  <branch> — <item> — <time>` to BUILDLOG and pushes it; a second agent that sees a live
  claim on the item it wanted picks a different independent item (or waits). The claim is
  cleared at the next checkpoint.
- **Concurrent agents (two at once) — only on independent surfaces + separate git
  branches.** Give each agent its own feature branch and a **non-overlapping** scope
  (different files, different tables/screens). Merge at checkpoints. Never let two agents
  edit the same file, and never let two apply conflicting migrations to the **same**
  Supabase project — if they must both touch schema concurrently, give each its own
  `create_branch` DB branch and merge in order. When in doubt, serialize: sequential
  hand-off is simpler and almost always fast enough.
- **A resuming/second agent trusts the database over prose.** If `list_migrations` shows a
  migration the committed SQL doesn't, the previous agent applied without committing —
  reconcile (commit the missing `schema-*.sql`) before building on top. The DB is the
  ground truth; BUILDLOG is the human-readable index to it.

---

## §7. Sequencing rules the build must not break

1. **No UI before the backend it reads.** A screen whose data/RPC/policy doesn't exist
   can't assert live behaviour — P1/P2 first, always.
2. **Primitives (P3) before any screen.** A screen that hand-rolls a button instead of
   reusing the primitive is a regression; fix it before it spreads.
3. **One surface, one commit.** A screen's dialog is its own unit (the gallery already
   enumerates them). Keep diffs small enough to bisect.
4. **The gate is derived, not asserted.** "Done" means the state-URL passes `verify.mjs` +
   the screenshot + zero console errors + (for backend) the allow/deny test — not a
   checked box. `verify.mjs` reads the live DOM, so the burn-down can't lie.
5. **Backend and repo agree; CANON is truth.** Never leave the DB ahead of committed SQL,
   and when code and CANON drift, fix one of them in the same session — never ship a third
   source of truth.
6. **RLS is the fence; the UI is the signpost.** A revealed admin control must be refused
   server-side for a non-admin too — test both halves.
