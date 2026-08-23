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

**Phase: build. P0 DONE. P1 (Schema + RLS) DONE — all 8 groups green + wrap. NEXT: P2 (RPCs + triggers + search + realtime).**

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

**NEXT: P2 — RPCs + triggers + search + realtime.** Read CODEGEN §5 (P2) + CANON §E.3/
§E.4/§E.7 + `prompts/P2-rpcs.md`. The tables + RLS fence all exist; P2 adds the
`security definer` RPCs (`join_via_invite`, `create_dm`, `add_friend`, `toggle_reaction`,
moderation writers, share-link/trash/star RPCs, `search_all`, …), the triggers
(message-fanout → mentions/notifications; works-insert → search_tsv + auto-hide; blob
refcount/meter maintenance; 30-day trash purge), and the realtime publication
(`server:{id}` presence, `channel:{id}` changes, `user:{id}` bell).

IN PROGRESS: (none)

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
