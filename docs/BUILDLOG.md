# BUILDLOG — the build's live state

Append-only. This is where every build session records what it did, so **any** Claude
Code session (this chat, another chat, a second agent) can cold-start and continue from
the repo alone. The protocol lives in [`CODEGEN.md`](CODEGEN.md) §0 / §6; the short
version:

- **Start a session:** run the cold-start ritual (read this file, `git log --oneline -8`,
  Supabase MCP `list_migrations` + `list_tables`, `node docs/design/verify.mjs`), then add
  an `IN PROGRESS:` line claiming what you're taking.
- **End a session (green only):** verify → commit → append a `## <date> — <phase.session>`
  entry with **DONE** (commit sha + migration name), **NEXT** (the exact next item), and any
  **GOTCHA** — then clear your `IN PROGRESS` line and push.
- **Ground truth is the DB + git**, not this prose. If `list_migrations` disagrees with the
  committed `schema-*.sql`, reconcile before building on top.

Entry template:
```
## 2026-08-DD — P1.3 channels + policies
IN PROGRESS: (cleared)
DONE: schema-04-channels.sql applied (migration "p1_3_channels") + committed <sha>.
      allow/deny tests pass; get_advisors security clean; types regenerated.
NEXT: P1.4 messages (+ body_tsv, parent_id, tombstones), CANON §E.1/§E.8.
GOTCHA: channels.post_policy='admins' must reject non-admin inserts — test covers it.
```

---

## Current state

**Phase: build. P0 DONE. P1 (Schema + RLS) DONE. P2 (RPCs + triggers + search) DONE — all 16 `prompts/P2-rpcs.md` prompts applied + round-trip tested green. NEXT: P3 (UI primitives).**

The spec is hand-off-ready: [`CANON.md`](CANON.md) is the contract (incl. §E.10, the
per-control → backend coverage matrix), the [`design/gallery.html`](design/gallery.html)
gallery is the visual law with `verify.mjs` green, and [`CODEGEN.md`](CODEGEN.md) is the
playbook. The frontend stack is locked (vanilla + signals, no build step; CANON §G).

The app now boots from the root `index.html` (the old design-deliverables index page
is retired — those deliverables still live at their own paths, e.g.
`docs/design/gallery.html`). Deploy target is the **`preview` branch → preview.eski.lol**
(Vercel). Supabase project is **`zidqagrmxeawpasurpwi` ("Eski")** — reachable via the
Supabase MCP.

**Clean slate DONE** (owner authorised 2026-08-23): migration `clean_slate_retired_pivot`
dropped every retired `public` table + function; `list_tables` is empty. Now building the
fresh CANON §E schema in §E.8 order.

**NEXT: P3 — UI primitives.** Read CODEGEN §5 (P3) + `prompts/P3-primitives.md` +
the `eski-style` skill. Start by regenerating + committing the TS types (Supabase MCP
`generate_typescript_types`) now that the RPC surface is final (P1 GOTCHA E).

**P2 residuals (owner-approved 2026-08-23) — DONE**, migration
`p2_08_share_trash_realtime`, committed as `schema-16-residuals.sql`, round-trip tested:
- `resolve_share_link(token)` — anon read path for `/shared/:token`; refuses revoked/
  expired/unknown. Anon-executable by design (adds one accepted anon-definer advisor WARN,
  like `can_read_work`).
- 30-day trash purge — `purge_trashed_works()` (hard-deletes >30d-trashed works; the delete
  fires the meter/refcount trigger so quota is reclaimed) scheduled daily 04:00 UTC via
  **pg_cron** (`cron.job` name `purge_trashed_works`).
- Realtime publication — 24 live tables added to `supabase_realtime` (it was empty);
  REPLICA IDENTITY FULL on the join/state/reaction tables so DELETE/UPDATE ship the old row.
  Realtime enforces the same RLS as a read, so no unseen channel/DM leaks.
- star / share-link management need no RPC: `starred_items` (star_all) and `share_links`
  (share_write) are already direct RLS-gated table ops.

---

## Log

<!-- newest entries at the bottom; append, never edit past entries -->

## 2026-08-23 — P0 Scaffold
IN PROGRESS: (cleared)
DONE: app shell + router + signals + Supabase client + tokens/theme + icon sprite.
  Files: `index.html` (shell + sprite, ported verbatim from the gallery),
  `app/{signals,router,env,supabase,theme,icons,main}.js`,
  `styles/{tokens,base}.css`, `vercel.json` SPA rewrite, `package.json` type:module.
  Verify (headless Chromium smoke, `python3 -m http.server`): every route swaps its
  placeholder with **no full reload**; `match()` resolves all §C.3 routes + params +
  404 fallback; `--r`=3px, `--rail`=58px, `--m1..--m6` all resolve; theme toggle flips
  `--paper` FCFCFC↔0A0A0A and back; sprite mounts 63 `#i-*` symbols and `icon()`
  renders a `<use>`; a `tick` signal advances the DOM without a reload; **zero console
  errors**. (Deep-link-on-hard-refresh is covered by the Vercel rewrite, not testable
  under the plain static server.)
NEXT: P1.1 schema (servers) — but first resolve the clean-slate BLOCKER above.
GOTCHA 1: member hues are **30**, not 6 (owner confirmed 2026-08-23). The 6 static
  `--m1..--m6` in the gallery/skill `:root` were a stale base; the REAL palette is 30
  perceptually-even OKLCH hues **generated in JS** in `gallery.html` (`oklch2hex`,
  `#palette`): `H=(i*12+25)°`, light `L=.585 C=.125`, dark `L=.79 C=.112`. Baked that
  exact output into `styles/tokens.css` as `--m1..--m30` (light + both dark blocks);
  reconciled the `eski-style` skill to describe the generator. `--danger` is its own
  token, NOT a member hue. Regenerate from the formula — never hand-edit a member hex.
GOTCHA 2: `styles/tokens.css` `@import`s `../docs/design/_fonts.css` (single source for
  the base64 Jost faces) — the app depends on `docs/` being deployed. Fine on Vercel
  (whole repo ships); revisit if docs/ is ever split out.
GOTCHA 3: `theme.js` is a CLASSIC blocking script in `<head>` BEFORE the stylesheets —
  it must stay there (and stay non-module) to stamp `data-theme` before first paint.
GOTCHA 4: Vercel rewrite is `/((?!api/|.*\.).*) -> /index.html` — anything with a dot
  (static assets, docs/*.html) or under `/api/` is served directly; everything else
  hits the SPA shell. Adding a real top-level path with a dot in it would bypass the
  shell.

## 2026-08-23 — P1 Schema + RLS (all 8 groups + wrap)
IN PROGRESS: (cleared)
DONE: fresh CANON §E schema authored in §E.8 order. Migrations
  clean_slate_retired_pivot, p1_01_servers … p1_08_moderation_billing,
  p1_09_indexes_policies (all applied to project zidqagrmxeawpasurpwi). Committed as
  schema-01..09*.sql. Every group has a role-switching allow/deny test that PASSES
  (server visibility, granular-role union + gates, §B.3 works_read incl. placement
  crosspost + private-channel gating, message post/timeout gates, friend-of-author
  comments, DM isolation, moderation/billing scoping). ~35 tables, all RLS-enabled.
  Advisors: security has ZERO "RLS disabled"/"policy permits all" (the acceptance gate);
  performance shows only unused_index INFO (empty DB, expected). unindexed-FK (60) and
  multiple-permissive-policy (65) findings RESOLVED by the wrap.
NEXT: P2 (see Current state).
GOTCHA A: a FOR ALL policy's USING **also grants SELECT** and ORs into the read rule.
  This briefly leaked a private channel (group 4). Fix pattern, now standard here: never
  use FOR ALL alongside a separate read policy — split into for insert/update/delete
  (schema-09 did this for all 13 affected tables). can_view_channel also states the
  owner/admin override explicitly.
GOTCHA B: gate helpers are SECURITY DEFINER (owned by postgres → BYPASSRLS inside), the
  ONLY thing stopping a server_members/dm_members policy from recursing when it calls
  member_of/dm_member. Keep them definer.
GOTCHA C: works has an added `author_id` (uploader) distinct from owner_type/owner_id
  (the PAYING account) — CANON §E.1 lists only the payer. can_read_work/can_write_work
  wrap the §B.3 logic so child tables (work_items/content_tags/collaborators/comments)
  reuse it. approved_at defaults now(); the P2 hold-trigger nulls it to gate a post.
GOTCHA D: forward-refs resolved by stubs then redefinition — dm_member + is_friend start
  as `select false` (groups 3/5) and become real in group 6, retroactively activating
  DM-placement reads and the friend comment gate. channel_roles + can_view_channel live
  in group 4 (hard FK dep on channels), not group 2.
GOTCHA E: TYPES NOT COMMITTED YET. The app is vanilla JS (no build step, no TS consumer
  yet). Regenerate via Supabase MCP generate_typescript_types at the start of P3/P4 and
  commit then — the schema is the source, the DB is queryable, so nothing drifts.
GOTCHA F: accepted security advisor WARNs — the SECURITY DEFINER gate helpers are
  REST-callable by authenticated (0029); they return only self-relative booleans ("can
  *I* see X"), and RLS policy evaluation REQUIRES the invoker to hold EXECUTE, so they
  can't be revoked. anon EXECUTE was tightened to just can_read_work. Optional future
  hardening: move all gate helpers into a non-exposed `private` schema. media_blobs is
  RLS-on/no-policy = deny-all by design (server-managed).

## 2026-08-23 — P2 RPCs + triggers + search
IN PROGRESS: (cleared)
DONE: all 16 `prompts/P2-rpcs.md` prompts. Migrations p2_01_join_via_invite …
  p2_06_search (+ p2_02 on-conflict fixups, p2_07_lock_internal_functions), applied to
  project zidqagrmxeawpasurpwi. Committed as schema-10..15*.sql. Every RPC/trigger has a
  role-switching round-trip test that PASSES (success delta + gate rejection), run in a
  rolled-back txn via the Supabase MCP:
  - 10 join_via_invite · 11 add_collaborator/remove_collaborator/add_tag,
    mark_channel_read, toggle_reaction, pin/unpin_message
  - 12 create_dm/create_group_dm, add_friend/respond_friend/block_user,
    move_to_folder/create_folder (cycle-guarded)
  - 13 ban/timeout/kick_member (+audit), set_member_roles, set_channel_access, export_manifest
  - 14 triggers: message fan-out → mentions+notifications, edit/tombstone (msg+dm),
    works search_tsv + auto-hide/approval-hold, comment mention → notification,
    storage-meter + blob refcount (dedup)
  - 15 search_all + GIN(body_tsv, search_tsv)
  Advisors (security): ZERO rls-disabled / policy-permits-all (the acceptance gate).
  Remaining WARNs are the accepted P1 posture (definer RPC/gate helper callable by
  authenticated — inherent to the RPC pattern) + media_blobs deny-all INFO. The 4
  internal helpers (meter_bump + trigger fns) were revoked from public/anon/authenticated
  so they are NOT REST-exposed.
NEXT: P3 (UI primitives) — regenerate + commit TS types first (GOTCHA E). See Current
  state for the P2 residuals (resolve_share_link, trash-purge job, realtime publication)
  that are outside the 16-prompt contract and await an owner call.
GOTCHA G: a plpgsql param that shares a name with a column used bare in ON CONFLICT
  (e.g. work_id, channel_id, message_id) is ambiguous — set `#variable_conflict use_column`
  in the body and reach the param via `fn_name.param` when needed. Bit P2.2/2.3/2.5.
GOTCHA H: search_all is SECURITY INVOKER on purpose — RLS itself is the leak fence, so no
  in-body gate is needed and none can be forgotten. Testing an INVOKER function through the
  Supabase MCP requires `set local role authenticated` (the service role bypasses RLS) in
  addition to the jwt-claims GUC.
GOTCHA I: moderation targets never include the owner; ON CONFLICT keeps a member's
  @everyone row on set_member_roles; the storage meter counts DISTINCT owned blobs, so the
  2nd work on the same owner+blob adds 0 bytes (dedup) and only the last unref frees them.
