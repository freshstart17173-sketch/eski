# CODEGEN — the micro-prompt build plan

The hand-off from **spec** to **working app**, sliced so small that any one
prompt either passes its own test or fails in isolation. Nothing here is new
design: every prompt points back at [`CANON.md`](CANON.md) (the contract) and
[`design/gallery.html`](design/gallery.html) (the pixels). If a prompt and CANON
disagree, **CANON wins** — fix the prompt.

> **Vocabulary note.** [`CANON §E`](CANON.md) is the mechanical backend
> reference (tables, RPCs, triggers, Realtime channels, indexes) and already uses
> the canonical names: `server(s)` · `server_members` · `is_server_admin`/`has_perm`
> · `comments` (post-level) · `folders` (nested tree, was `collections`) ·
> `placement` + `work_collaborators` (§D.3) · `collaborators` (was credits) ·
> `roles`/`member_roles`/`channel_roles` (§D.1, replaces the flat role enum).
> Copy §E straight into a prompt — no renaming needed.
>
> **Beta cut (2026-08-18e).** The **canvas** (P6 + `canvas`/`canvas_items`/
> `annotations`), **kanban boards** (`boards`/`board_*`), and **numbered versions**
> (`version_of`/`version_note`/`add_version`) are removed from this plan. Where the
> phase map, per-phase lists, exemplars or budget below still mention them, they are
> cut — see the runnable prompts in [`prompts/`](prompts/) for the current set.

---

## §0. How to use this

### Two runners, one queue

Per the division of labour: **the backend + logic is authored here (SQL, RLS,
RPCs, policy tests) and applied via the Supabase MCP / migrations — treat those
prompts as already-correct spec to apply and verify, not creative work.** The
**UI prompts are what the code-generation model (DeepSeek V4 Flash) runs**, one
component/state/dialog at a time, against the gallery. Each prompt is tagged:

- **`[BE]`** backend — a migration, an RPC, a policy, or a policy test. Small,
  deterministic, has a SQL-level pass/fail.
- **`[UI]`** front-end — one component, one screen-state, or one dialog, built to
  match a named gallery panel. This is the DeepSeek spend.
- **`[GL]`** glue — a client data hook, a Realtime subscription, a signing call.

### The prompt template (every `[UI]`/`[GL]` prompt fills this in)

```
TITLE:      <phase>.<n> — <one thing>
CONTEXT:    Stack = vanilla HTML+CSS+JS (no framework; see prompts/README). Tokens & primitives from
            styleguide.html; this screen’s law is gallery.html panel "<name>".
BUILD:      <the single unit — one component / one state / one dialog>
PROPS/DATA: <exact inputs; which table/RPC/Realtime channel it reads or writes>
STATES:     <every visual state to cover: default/hover/active/empty/loading/error/
            disabled + the mobile layout per CANON §C.2>
DO NOT:     <the guardrails: no new colours (tokens only), no hex, --r on chrome,
            square media, square close/icon buttons, no drop shadows on modals,
            member hue is server-scoped & never on public/Feed>
DONE WHEN:  <a concrete, testable assertion — see below>
```

### Definition of done (what "testable" means per tag)

- **`[BE]`** — a `pgTAP`/SQL snippet proves the policy: e.g. *"a non-member
  `select` on `messages` in a server they’re not in returns 0 rows; a member
  gets N."* Every RLS prompt ships its own allow-and-deny test.
- **`[UI]`** — renders with no console error, matches the named gallery panel at
  desktop **and** the CANON §C.2 mobile layout, and every state in `STATES:` is
  reachable via a prop/story. A Playwright screenshot diff vs the gallery panel
  is the acceptance gate (the harness already has Chromium wired).
- **`[GL]`** — a scripted round-trip: perform the action, assert the row/Realtime
  event, assert the optimistic UI and the reconciled UI match.

### The golden rules (repeat in every prompt’s `DO NOT`)

1. **Search before you define** — reuse the token/selector/component that exists;
   never add a second one nearby.
2. **One canonical name** — UI copy = code = docs (CANON §A).
3. **Every colour from a token**, no hex in a component; member hue is the only
   colour, **server-scoped**, absent from public profile and Feed.
4. **`--r` (3px) on chrome; media stays square.** Round = avatars + presence dots
   only.
5. **Square icon/close buttons** (`.iconbtn`, `#i-x`) — don’t invent a second
   style. **Modals darken the background (scrim), no drop shadows.**
6. **Mobile is its own layout** (three-pane → one pane + bottom tabs), not a
   squeezed desktop.
7. **The RLS policy is the fence; the UI is the signpost.** A `[UI]` gate is
   never the only thing standing between a user and data.

---

## §1. Phase map & dependency order

Backend precedes the UI that reads it; primitives precede screens; screens
precede their dialogs. Follow CANON §E.8 for the migration sub-order.

| Phase | What | Tag mix | Gate before next phase |
|---|---|---|---|
| **P0** | Scaffold: app shell, Supabase client, token/CSS import, icon sprite | GL | App boots, tokens resolve, sprite renders |
| **P1** | Schema + RLS (servers → messages → DMs → notifs → profiles → moderation → roles/storage) | BE | Every table has an allow+deny test that passes |
| **P2** | RPCs + triggers (§E.3) + `has_perm`/`can_view_channel` (§D.1) | BE | Each RPC has a round-trip test |
| **P3** | Design-system primitives (button, field, modal, menu, avatar, tag, chip, toggle, checkbox, bar, toast) | UI | Each matches its styleguide spec, both themes |
| **P4** | The 3-pane shell + Workspace states | UI+GL | Workspace renders live messages |
| **P5** | Content screens: Feed, Explorer, Details, Profile, Upload | UI+GL | Cards render every media kind incl. type-cards |
| ~~**P6**~~ | ~~Canvas suite~~ — **cut (beta)** | — | — |
| **P7** | Messages/DMs, **Friends**, Notifications *(boards cut)* | UI+GL | DM round-trip, live bell, friendship RPCs |
| **P8** | Admin: settings shell, roles editor, assign-roles, channel perms, storage & billing, moderation, audit, invites | UI+GL | Perm gates match the matrix |
| **P9** | Utility + focus: Create, Join, Sign-in, 404, dead-invite, access-denied, quick-switcher | UI | Every state in §C.14/C.20 reachable |

---

## §2. The prompt queue

Each line is one prompt. Format: **`ID` — build · *DONE WHEN* · refs.** Expand a
line into the §0 template when you run it. Counts per phase are at the head.

### P0 — Scaffold · 4 prompts, all GL

- **P0.1** — Init the app shell (vanilla HTML+CSS+JS, no framework — optional esbuild),
  routing skeleton for the §C.3 manifest routes. *Done: every route mounts an
  empty labelled screen; `?app=1#route` parity with the gallery preserved.*
- **P0.2** — Supabase client + typed env, auth session provider, a `useSession`
  hook. *Done: anon boot works; a signed-in session exposes `uid`.*
- **P0.3** — Import the design tokens & base CSS from `styleguide.html` as the
  global stylesheet; wire the theme-swap (`data-theme` + `prefers-color-scheme`).
  *Done: `--r`, `--m1..30`, `--ink`, surfaces all resolve in both themes.*
- **P0.4** — Mount the SVG icon sprite (`#i-*`) once; a `<Icon name>` wrapper.
  *Done: `#i-x`, `#i-hash`, `#i-server`… all render at `.ic`/`.ic.sm` sizes.*

### P1 — Schema + RLS · ~21 prompts, all BE (one migration-unit each, CANON §E.8 order)

Each: `create table if not exists` + RLS enable + policies + the allow/deny test.

- **P1.1** `servers` (was `groups`) + `server_members` + `server_invites`;
  helpers `member_of(sid)`, `is_server_admin(sid)`. *Test: non-member sees no
  server row; member does; only admin writes.*
- **P1.2** `works` column adds (`visibility in(public,personal,server)`,
  `server_id`, `title`, `file_ext`, `search_tsv`, `hidden`, `approved_at`,
  **`deleted_at`** — soft-delete/Trash, gallery #42/B19) + the rewritten
  `works_read` (CANON §B.3), which also **omits `deleted_at not null`** from every
  view but the Trash folder. *Test: the visibility read rule — public to friends,
  server to members, private to owner; a trashed work drops out of the library.*
  *(No `version_of`/`version_note` — versions cut.)*
- **P1.3** `channels` (+`kind in(text,voice)`, `slowmode_sec`, `position`,
  **`default_folder_id`** #53, **`allowed_kinds text[]`** #54 — reject a work whose
  `kind` isn't allowed). *Test: member reads, admin writes, position orders, a
  disallowed kind is refused.*
- **P1.4** `messages` (+`body_tsv` generated, `parent_id`, `also_to_channel`,
  tombstones). *Test: member insert allowed unless timed-out; update/delete own
  only; deleted row tombstones not vanishes.*
- **P1.5** `message_reactions`, **P1.6** `message_pins`, **P1.7** `channel_reads`,
  **P1.8** `mentions` — each its own prompt + test.
- **P1.9** `comments` adds (`context`, `resolved_at`) — **post-level comments**,
  threads never mix context. *Test: a public-context comment is invisible in a
  server context and vice-versa.*
- **P1.10** `placement` (§D.3) + widen `works_read` to "readable via any placement";
  **P1.11** nested `folders` (`parent_id`, §C.6); **P1.12** `work_collaborators`
  (consent-gated, §D.3.1). **P1.13–P1.15** — **CUT (beta):** `boards`/`board_*` +
  the canvas tables are removed; numbers left as a gap so P1.16+ keep their numbers.
- **P1.16** `dm_channels`, **P1.17** `dm_members`, **P1.18** `dm_messages`,
  **P1.19** `friendships` (ordered pair, `status`). *Test: DM visible only to its
  members; friendship gates a DM create.*
- **P1.20** `notifications` (+Realtime-ready). **P1.21** `saved_items`
  (`folder_id → save_folders`).
- **P1.22** `profiles` adds (status emoji/text/expires, `presence_state`, `tz`,
  `pronouns`, `links`).
- **P1.23** moderation: `server_bans`, `audit_log`, `server_members.timeout_until`.
- **P1.24** **granular roles (CANON §D.1):** `roles(server_id, name, color,
  position, permissions bigint, is_default)`, `member_roles`, `channel_roles`
  (allow-list); drop `server_members.role`; helpers `has_perm(sid, flag)` and
  `can_view_channel(channel_id)`. Channel-scoped reads (messages/pins/files +
  a work in a private channel) re-gate on `can_view_channel`. **Storage (§D.2 —
  dynamic slider, no pooling):** `media_blobs` (dedup), `works.owner_type`/
  `owner_id`, `storage_meters`, `storage_balance` (one slider per account; no
  `billing_accounts`, no `storage_allocations`). *Test: union-of-roles permission;
  a private channel hides from a non-granted member; a work's bytes hit its owner's
  meter and dedup counts a shared blob once.*

### P2 — RPCs, triggers, search · ~15 prompts, all BE

One function + its round-trip test each: `join_via_invite` · `mark_channel_read` ·
`toggle_reaction` · `pin_message`/`unpin_message` · `create_dm`/`create_group_dm` ·
`add_friend`/`respond_friend`/`block_user` ·
`ban_member`/`timeout_member`/`kick_member` (each writes `audit_log`) ·
`set_member_roles(user, role_ids[])` · `set_channel_access(channel, role_ids[],
member_ids[])` · `move_to_folder` · **`restore_work`/`purge_work`/`empty_trash`**
(Trash — gallery #42/B19) · `export_manifest(server|'account')` · the **triggers**
(message-fanout → `mentions`+`notifications`; `edited_at`; tombstone;
`works.search_tsv`; comment-mention → notification; storage-meter maintenance;
**the 30-day Trash purge job** that hard-deletes `deleted_at` past retention) ·
`search_all(q, scope)` + the GIN indexes (§E.7). *Each done when: the action
produces exactly the rows/notification/meter delta asserted, and is rejected
when the gate fails.*

### P3 — Design-system primitives · ~14 prompts, all UI

Build each **once**, from the styleguide, reused everywhere. `Button` (primary/
default/sm/danger/icon) · `IconButton` + `CloseButton` (square, `#i-x`) ·
`Field` (the one `--line2` border) · `Modal` (scrim, no shadow) · `Menu` +
`MenuItem` + `.mlabel`/`.sep` · `Avatar` (round) + `PresenceDot` · `Tag`/`Chip`
(server-hue `uchip`) · `Toggle` · `Checkbox` (`.cbx`) · `Bar` (usage) · `Toast` ·
`Tabs` · `SegmentedControl` (visibility) · `Dropdown`/`SelectPill`. *Each done
when: matches its styleguide row in both themes, all states, and uses only
tokens.*

### P4 — Shell + Workspace · ~13 prompts, UI+GL

- **P4.1 [UI]** the 3-pane shell (server rail 58 · channel column 232 · main ·
  members rail 210) **capped at a 1440px canvas, centred with a hairline gutter,
  modals sized to it** (§C.2) + the mobile one-pane + bottom-tabs collapse.
- **P4.2 [UI]** server rail items (badge states: default/hover-tooltip/active/
  unread-dot/mention-count) + the ＋ menu + own-avatar menu.
- **P4.3 [UI]** channel column: **server-name header → server-menu dropdown**
  (Invite · Create channel/category · Server/Notification settings · Edit profile
  · Leave — admin rows gated), Media entry, channel list by kind (unread bold,
  mention badge), **admin-POV drag-handle + per-channel edit gear**, ＋ add channel
  → the Create-channel modal.
- **P4.4 [UI]** channel header (Messages/Pins/Files tabs, voice/video, **bell →
  dropdown preview**, search, members icon).
- **P4.5 [UI]** message list + message row (grouped, member-colour byline;
  hover/long-press actions incl. **Forward**; **forwarded-message quote render**;
  edited tag; reactions).
- **P4.6 [UI]** composer (toolbar-inserts-markdown, emoji-mart, @/# autocomplete,
  attach) + its states (empty/typing/slowmode/timed-out-disabled).
- **P4.7 [UI]** shared-file card inline (leads with file name) → opens Details.
- **P4.8 [UI]** thread view (`parent_id`) + `also_to_channel`.
- **P4.9 [UI]** members rail (**Member/Admin POV switch**, Admins/Members groups,
  presence dot, "working on"; **member popover** with Message/Add-friend + a gated
  **admin block** Roles/Timeout/Kick/Ban).
- **P4.10 [GL]** wire `channel:{id}` Postgres-changes → live insert/edit/delete;
  `:typing` broadcast; `mark_channel_read` on view.
- **P4.11 [GL]** `server:{id}` Presence → members rail online/doing.
- **P4.12 [UI]** the **workspace modals** — Create-channel (name/kind/category/
  default-folder/allowed-types/private), Invite-to-server (link+copy+expiry+by-
  handle), Forward (multi-target + note) — all scrim-backed, sized to the canvas.
- **P4.13 [GL]** the **admin POV** is a signpost only: every revealed control
  (＋ add channel, edit gear, kick/ban, drag-reorder) re-checks `has_perm`/
  `is_server_admin` server-side; the toggle only renders to real admins.
- **Edge states** (own prompts): **new-server first-run** (empty column + 3-step
  setup checklist → create-channel / invite / upload), no-channels-yet,
  zero-messages, no-presence, timed-out composer, Realtime-reconnecting banner.

### P5 — Content screens · ~12 prompts, UI+GL

Feed (header nav, search, type/sort, **layout toggle even⇄masonry**, post card
per kind incl. **type-card** for `.flp/.zip/.exe`, empty) · **File explorer**
(nested **folder tree** + breadcrumb, **grid/list/feed** view toggle — feed
flattens the subtree to previewable media + inline comments, bulk select-bar with
move-to-folder, lightbox, **Trash view** — retention notice + Empty-now over
rows with countdown + Restore / Delete-forever, §C.6) · Details pane (player controls, **storage badge**
server-vs-personal, **file name** in the top bar, title/**collaborators**/tags,
actions, **post-level comments**, mobile bottom sheet) · Profile (square avatar,
Public/Server/Private shelves + counts + **search**, grid toggle, Settings) ·
**Fast Upload sheet** (dropzone → visibility → Post; title=filename default; Tags +
**Collaborators** chip-input behind an **"Add details"** disclosure; **which-server
/ folder** picker). *Each card/state is its own sub-prompt.* *(No version dropdown —
numbered versions are cut.)*

### P6 — Canvas suite — **CUT (beta 2026-08-18e)**

The review canvas and its ~16 prompts are removed from the beta. If it returns
post-beta, rebuild from CANON history + the deleted `P6-canvas.md`.

### P7 — Messages · Friends · Notifications · ~9 prompts, UI+GL *(boards cut)*

Messages (add-by-handle **inline** field, **New-DM / group-DM picker** from
friends, friends/requests, thread list mute/pin, conversation + composer) +
**[GL]** `create_dm` round-trip · **Friends manager** (`friends`: All/Pending/
Blocked tabs, add-by-handle, accept/decline/cancel/unblock, friend rows with
Message + remove/block) + **[GL]** the `friendships` RPCs · Notifications (tabs,
row kinds + inline reply, mark-all, **+ the bell-dropdown preview** — recent rows
+ Mark-all + See-all, sharing the `notifications` feed) + **[GL]** `user:{id}`
live bell.

### P8 — Admin · ~14 prompts, UI+GL

Settings shell + nav · General · Channels (per-channel who-can-post/
slowmode/**Private toggle → reveals the allow-list**) · **Roles editor** (list,
new-role, colour swatches, **permission matrix** grouped Server/Members/Content,
`.cbx` toggles → `roles.permissions`) · **Assign-roles-to-member** modal
(multi-select checklist, @everyone locked → `set_member_roles`) · **Channel
permissions** allow-list modal (roles + members `.cbx` → `set_channel_access`) ·
Moderation (timeouts, bans, take-action — the same RPCs the **members-rail
popover admin block** and **admin-POV** affordances call from P4) · Audit log ·
Invite links (create/revoke — the quick **Invite modal** is P4.12) · **Storage &
billing** (personal + server usage bars, Manage plan / Add
storage, gated `manage_billing`) · Export. Plus **[GL]** each perm-gated control
reads `has_perm`/`can_view_channel` so the signpost matches the fence.

### P9 — Utility & focus · ~9 prompts, UI

Create-server card (→ on submit lands on the **new-server first-run** state,
built as a workspace edge state in P4) · Join-preview card · Sign-in/up (magic-link/OAuth, toggle,
error line) — all **centred, no rail, card never touches top** (§D.6.4) · 404 ·
Dead invite (**expired/revoked/full/already-member** — one prompt, four copy
states) · Access-denied (quiet, **never a 404 that leaks existence**) · Quick
switcher (⌘K overlay, grouped results, keyboard nav, scoped to `can_view_channel`).

---

## §3. Two fully-expanded exemplars

To calibrate the detail level a runnable prompt carries.

### Exemplar A — `P5.2 [UI]` Type-card (non-previewable file)

```
TITLE:   P5.2 — Type-card renderer for non-previewable files
CONTEXT: Stack vanilla HTML+CSS+JS (no framework). Tokens/primitives from styleguide.html. Law =
         gallery.html "type card" (feed + details `.dtype`); behaviour = CANON
         §D.6.2. Reuse the P0 icon() helper and the square-cell grid unit.
BUILD:   The type card only — a square cell that stands in for a file with no
         visual preview (.flp, .zip, .exe, .als, .aep, project files): a centered
         file icon + the extension + the file name. No fake thumbnail.
PROPS:   { fileName, ext } ; picks the icon by ext (fallback #i-file); on click →
         emits openDetails(workId). Reads `works` where kind='other'.
STATES:  default · hover (cell lifts subtly) · in-grid (fills the square cell,
         even mode) · in-details (fills the `.dmedia` area, `.dtype`). Mobile:
         same, one-column grid.
DO NOT:  no fake image thumbnail; the ext is shown as its own label, never as a
         content tag (§A.4 / F10). Media stays square (--r on chrome only);
         colour only from tokens; nothing renders a member hue on the Feed.
DONE:    a .flp/.zip/.exe renders an icon+ext+name card (not a broken image);
         clicking opens Details; the same renderer fills the details `.dtype`;
         Playwright diff vs the gallery type-card panel < threshold; zero console
         errors; one-column on mobile.
```

### Exemplar B — `P1.24 [BE]` granular roles + slider storage (the load-bearing migration)

```
TITLE:   P1.24 — roles/member_roles/channel_roles + has_perm/can_view_channel + storage columns
CONTEXT: Supabase Postgres. CANON §D.1–D.3 supersede the flat role enum (see §E).
         Re-runnable schema-*.sql; RLS on every new table.
BUILD:   (1) roles(id, server_id, name, color smallint, position int,
         permissions bigint, is_default bool) — one is_default @everyone/server.
         (2) member_roles(server_id,user_id,role_id) pk all three.
         (3) channel_roles(channel_id, role_id) pk both — allow-list; zero rows =
         open to all members (LOCKED D-i; design for v2 overwrites, don’t build).
         (4) drop server_members.role. (5) has_perm(sid,flag bigint) = OR of the
         member’s roles’ permissions, owner = all flags. (6) can_view_channel(cid)
         = member_of AND (no channel_roles rows OR a granted role). (7) media_blobs
         (sha256 pk, bytes, refcount) + works adds blob_sha, owner_type in(user,
         server), owner_id. (8) storage_meters(owner_type,owner_id,bytes_used,
         updated_at) = distinct owned blobs + storage_balance(owner_type,owner_id,
         purchased_gb,status,stripe_customer) — one slider per account; no plan, no
         pooling. Maintained by the works-bytes trigger keyed by owner.
STATES:  n/a (schema).
DO NOT:  don’t reshape for v2 — channel_roles is the allow-only subset of the
         future channel_overwrites; keep can_view_channel written to that grain.
         No storage_allocations/billing_accounts (pooling + plans are cut).
DONE:    pgTAP: (a) a member holding two roles has the UNION of their flags;
         (b) has_perm false → the gated RPC is rejected; (c) a private channel
         (has channel_roles rows) returns 0 messages to a non-granted member and
         N to a granted one; (d) a user-owned work bumps that user meter and a
         server-owned work the server meter; a blob shared by two works for one
         owner counts once (dedup).
```

---

## §4. Token budget — DeepSeek V4 Flash

Only **`[UI]`** (and light `[GL]`) prompts are DeepSeek spend; `[BE]` is applied
via the Supabase MCP and costs no model tokens. Counts:

| Phase | Prompts | of which UI/GL | Notes |
|---|---:|---:|---|
| P0 | 4 | 4 | scaffold |
| P1 | 21 | 0 | backend (+ placement/folders/collaborators) |
| P2 | 14 | 0 | backend |
| P3 | 15 | 15 | primitives |
| P4 | 13 | 13 | shell + workspace (+ admin POV, server menu, workspace modals) |
| P5 | 12 | 12 | content screens (+ Trash view) |
| ~~P6~~ | 0 | 0 | canvas — **cut (beta)** |
| P7 | 9 | 9 | DMs/**Friends**/notifs (+ new-DM picker, bell dropdown) *(boards cut)* |
| P8 | 14 | 14 | admin |
| P9 | 9 | 9 | utility/focus |
| **Total** | **~111** | **~72** | + iteration |

**Per-UI-prompt cost.** A rich prompt carries: the §0 template + the relevant
CANON slice + the gallery panel’s HTML/CSS excerpt as reference ≈ **1.5–3k input
tokens**. A component/state generation returns ≈ **1.5–4k output tokens**. Budget
one **re-roll** per prompt (screenshot diff fails → one correction round).

- First-pass, ~72 UI/GL prompts × ~5k (in+out) = **~0.36M tokens.**
- With a correction round on ~all: ~72×5k + ~72×5k ≈ **~0.72M tokens.**
- Realistic ceiling with exploratory re-prompts, context re-sends, and a few
  screens fought over: **budget 2–3M tokens.** (Earlier figures assumed the model
  also generated the backend and the now-cut canvas; it doesn’t — that trims it.)

**Recommendation: buy ~3M tokens** for a comfortable first build with iteration
headroom; the true floor if prompts land clean is well under 1M.

---

## §5. Sequencing rules the operator must not break

1. **A `[UI]` prompt never runs before the `[BE]`/`[GL]` it reads exists** —
   otherwise its "DONE WHEN" can’t assert real data. P1/P2 first.
2. **Primitives (P3) before any screen (P4+).** A screen prompt that invents its
   own button is a rejected prompt.
3. **One panel, one prompt.** If a "screen" has a dialog, the dialog is its own
   prompt (gallery already enumerates them — §④/§⑤/§⑥).
4. **Every prompt ends by updating the gallery inventory status** (`t`→`a`→`m`)
   so the burn-down is visible.
5. **When a prompt and CANON drift, stop and fix CANON or the prompt — never let
   the code become a third source of truth.** This repo’s one failure mode is a
   correct decision silently undone.
