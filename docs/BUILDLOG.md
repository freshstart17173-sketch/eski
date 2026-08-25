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

**Phase: build. P0–P4 DONE. P5 (content) IN PROGRESS. DONE so far: Upload (P5.11/P5.12 — sheet + write path + `claim_upload_quota` RPC), the "eski!" Gnomon wordmark, favicon fix. IN PROGRESS: File explorer (P5.4/P5.5) — the shared `app/cards.js` work-card renderer + explorer CSS in `styles/content.css` are done; STILL TODO: `loadExplorer()` in data.js, `app/screens/explorer.js` (tree/breadcrumb/grid/list/feed/storage-footer), and route wiring (the `explorer` route + the workspace Files entries). Then Details (P5.6–5.8), Feed (P5.1–5.3), Profile (P5.9/5.10). Owner still must apply R2 CORS + set R2 WRITE env vars in Vercel before uploads (hence any content) work.**

> **Explorer resume notes.** `app/cards.js` exports `mediaUrl(work)`, `workCard(work,{onOpen,selectable,actions,showWho})`, `folderCard(folder,{onOpen})` — the ONE card renderer (P5.2), graceful type-card fallback when R2 bytes are missing. `styles/content.css` already has the pane/tree/crumbs/grid/list/foldercard/selbar/cardacts CSS. Build `loadExplorer({serverId,folderId})` reusing the cached `loadServerBundle` (members+channels) + folders (`folders` table, nested via parent_id) + files (`placement` where surface='server', surface_id=serverId, folder_id=<cur> → embed `work:works(...)`; verify the placement→works FK first) + storage (`storage_meters`/`storage_balance` for owner_type='server'). Then `renderExplorer(data)` and wire `main.js` route `explorer` + the workspace `Files` crow (currently navigates to `/s/{id}/files`). `.wordmark` class → use it for the explorer/feed/profile "eski!" wordmarks too.

> **Working principle (owner, 2026-08-24): build the REAL thing, don't fake.** No demo
> fixtures dressed as working features; the `?demo=1` fixture stays a dev/screenshot aid
> only. Where something genuinely belongs to a later phase, leave an explicit "P*n*"
> marker, not a fake. Document + commit + push per surface (tokens can cut out).
>
> **P5 verifiability:** browser network + R2 can't be exercised in-sandbox, so live
> reads/writes are verified via SQL (MCP) + offline UI render; the owner confirms the
> full path on preview. Upload also needs the owner's R2 CORS (paste `r2-cors.json`) +
> the R2_* Vercel env vars (see OWNER-TODO) — until then the signer works but the R2
> PUT will CORS-fail.

> **P4.10/P4.11 — 6 preview bugs, all fixed in code (owner test 2026-08-24; re-test on preview).**
> The live spine works end-to-end on preview (sign-in, live send/receive, presence).
> Testing surfaced 6 bugs — **all now fixed** (verify on preview; the two-session
> harness `verify-live.mjs` still can't run in-sandbox — headless Chromium can't egress
> HTTPS through the agent proxy). Fixes, by bug:
> 1. Empty members + "unknown" authors → **FIXED**: root cause confirmed via SQL —
>    `server_members` has NO FK to `profiles` (its user_id → auth.users), so the
>    PostgREST embed errored and returned nothing. Now fetch profiles in a SEPARATE
>    `.in('id',uids)` query (profiles read policy is `true`, so co-members resolve).
> 2. Markdown not rendered → **FIXED**: `renderBody` now HTML-escapes then applies an
>    inline-markdown pass (`**b**`/`*i*`/`~~s~~`/`` `code` ``/links) + @/# spans.
> 3. Voice channels opened as text → **FIXED**: voice `.crow` → "voice ships in v2"
>    toast; `loadWorkspace` never picks a voice channel as the active (text) channel.
> 4. Slow channel switching → **FIXED**: server-level reads (rail/members/roles/
>    channels/profiles) cached per serverId (`clearWorkspaceCache` on sign-out); a
>    channel switch now only fetches that channel's messages/pins/reactions.
> 5. Flaky sign-in → **FIXED**: first render held until `ready` (getSession/URL exchange)
>    settles behind a loading state; transient null sessions (token refresh) no longer
>    flip a signed-in view back to the sign-in screen (event passed through onChange).
> 6. Members panel not toggleable → **FIXED as a side effect of #1** (empty rail read as
>    absent); toggle handler is correct once the rail is populated.
> Not bugs: Feed/DMs/etc. show the "not yet ported" placeholder — only Workspace is
> built (P5+). Re-test steps unchanged (sign in on preview, two windows).

The spec is hand-off-ready: [`CANON.md`](CANON.md) is the contract (incl. §E.10, the
per-control → backend coverage matrix), the [`design/gallery.html`](design/gallery.html)
gallery is the visual law with `verify.mjs` green, and [`CODEGEN.md`](CODEGEN.md) is the
playbook. The frontend stack is locked (vanilla + signals, no build step; CANON §G).

The app now boots from the root `index.html` (the old design-deliverables index page
is retired — those deliverables still live at their own paths, e.g.
`docs/design/gallery.html`). Deploy target is the **`preview` branch → preview.eski.lol**
(Vercel). Supabase project is **`zidqagrmxeawpasurpwi` ("Eski")** — reachable via the
Supabase MCP.

**Deploy state (2026-08-23):** `preview` is at the **P4 UI** commit (owner-authorised
fast-forward on request — the standing OK was through P3, re-confirmed for P4).
Active work branch: `claude/catch-up-p4-d3efls`. `main` (prod) is untouched. When
resuming: land green phase work on the work branch, then fast-forward `preview` to it
(re-confirm the preview push with the owner for each post-P3 phase).

**Clean slate DONE** (owner authorised 2026-08-23): migration `clean_slate_retired_pivot`
dropped every retired `public` table + function; `list_tables` is empty. Now building the
fresh CANON §E schema in §E.8 order.

**NEXT: P4.10/P4.11 — the [GL] Realtime wiring.** The P4 UI (P4.1–P4.9) is built
and green; what remains is the live spine: subscribe `channel:{id}` (Postgres
changes) → live insert/edit/tombstone into the stream; `channel:{id}:typing`
(broadcast) → the typing indicator; `mark_channel_read` on view; `server:{id}`
(Presence) → the members rail. **These need seed data + auth** (a real server,
channels, members, messages) to verify "open two sessions, send, see it arrive" —
so the live read path in `app/data.js` is deliberately a stub returning the EMPTY
shape until then (the empty states it drives are themselves a real, verified P4
state). Wire the live reads + the four Realtime channels in `app/data.js` +
`app/screens/workspace.js`; the render helpers already take a plain data object,
so live just replaces the source.

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

## 2026-08-23 — P3 UI primitives
IN PROGRESS: (cleared)
DONE: all 15 `prompts/P3-primitives.md` primitives, one canonical definition each.
  Files: `styles/primitives.css` (component classes, ported verbatim from gallery
  values + eski-style §2/§4, tokens-only), `app/ui.js` (render helpers returning DOM
  elements — Button/IconButton/CloseButton/Field/Modal/Menu/Avatar/PresenceDot/Tag/
  Chip/Toggle/Checkbox/UsageBar/Toast/Tabs/SegmentedControl/SelectPill/MediaPlayer),
  wired `styles/primitives.css` into `index.html`. Added sprite symbols `i-rewind`/
  `i-ff` (the only P3 icons the sprite lacked) to BOTH `index.html` and `gallery.html`.
  Regenerated TS types → `app/db-types.ts` (41 tables). Verify: new headless harness
  `docs/design/verify-primitives.mjs` (HTTP-served, Playwright) drives the critique
  page `docs/design/primitives.html` + `primitives.demo.js` and PASSES in BOTH themes:
  every primitive renders with zero console errors / unknown icons; Modal (scrim, no
  shadow, Esc), Menu (open/Esc), Toggle/Checkbox flip, Toast, Tabs move, Segmented
  (Server uses #i-server, one active), SelectPill (menu → label), and the MediaPlayer
  transport all behave — play/pause reflects `media.paused`, ±10s skip is clamped and
  time+scrubber follow, track-click seeks ~ratio, mute swaps the icon. Screenshotted
  light+dark at 1200w: no blended surfaces, no invisible text, no stray pills.
NEXT: P4 (three-pane shell + Workspace) — see Current state.
GOTCHA J: the app sprite lives inline in `index.html` AND `gallery.html` (and now a
  third copy inline in `docs/design/primitives.html`, needed so `<use href="#i-*">`
  resolves under the module demo). icons.js derives its known set from the live DOM, so
  a new icon must be added to every mounted sprite. Keep the three in sync.
GOTCHA K: verify-primitives.mjs serves over HTTP (not file://) because ES-module
  imports + absolute `/app` `/styles` paths need a real origin; it launches Chromium
  with `--autoplay-policy=no-user-gesture-required` and drives play via a real click so
  the transport wiring is exercised under the actual autoplay gate.
GOTCHA L: `.btn.danger` keeps `color:#fff` and a `#000/#fff` color-mix hover — this is
  the ONE hex in a component, ported verbatim from the eski-style skill's own canonical
  CSS (the authoritative source), not a freelanced literal. Don't "fix" it to a token.

## 2026-08-23 — P4 UI (shell + Workspace, P4.1–P4.9)
IN PROGRESS: (cleared)
DONE: the three-pane shell + the whole Workspace screen, assembled from the P3
  primitives (imported from `app/ui.js`, never re-minted) and rendered from a data
  layer. New files: `styles/shell.css` (shell + workspace CSS, ported verbatim from
  gallery values, tokens-only), `app/shell.js` (persistent server rail P4.2 + the
  `.app > .rail + .stage` frame P4.1), `app/screens/workspace.js` (channel column
  P4.3 · header+tabs P4.4 · message list/row P4.5 · composer P4.6 · inline file
  cards P4.7 · thread pane P4.8 · members rail P4.9 · Pins/Files panels · voice
  minibar), `app/demo.js` (the Late Bloom LP fixture matching the gallery),
  `app/data.js` (`loadWorkspace`, demo-gated), `docs/design/verify-workspace.mjs`
  (the P4 self-test). Rewrote `app/main.js` to mount the shell + swap screens;
  reconciled `styles/base.css` so `.screen` layout is owned once (by shell.css) and
  the placeholder centres its `.ph`; wired `shell.css` into `index.html`.
  Verify: `node docs/design/verify-workspace.mjs` PASSES — 10 states (default L+D,
  thread, pins, files, loading, timedout, reconnecting, empty-server, empty-live)
  render with the right structure and ZERO app console errors/unknown-icons in both
  themes; screenshotted L+D at 1440 and 1024 (shell flexes, no h-scroll) and every
  state reads against the gallery. `node docs/design/verify.mjs` (gallery) still green.
NEXT: P4.10/P4.11 [GL] Realtime (live messages/typing/mark-read + presence) — see
  Current state. Needs seed data + auth to satisfy the "renders live" checkpoint.
GOTCHA M: **beta is web-only (CANON §C.2 wins over the P4 prompt's mobile bullets)** —
  the P4-shell-workspace.md prompt still says "mobile: one pane + bottom tabs", but
  §C.2 was changed 2026-08-22 to defer mobile post-beta (a separate gallery). So the
  shell fills the viewport and flexes down to ~1024px; NO mobile collapse was built.
GOTCHA N: a component class that sets `display:` DEFEATS the UA `[hidden]{display:none}`
  rule — a `.offlinebar`/`.composernote`/`.typing`/`.mem`/`.chpanel`/`.threadpane`
  toggled via the `hidden` attr stays visible unless the CSS ALSO carries a
  `.sel[hidden]{display:none}`. Every such selector in shell.css restates it. (Caught
  by screenshot: the reconnecting banner + an empty note bar were showing by default.)
GOTCHA O: the live read path in `app/data.js` is an intentional stub (returns the
  EMPTY shape) — real reads + Realtime are P4.10/11 and need seed data to verify.
  Don't mistake the stub for missing work; the empty states it renders are verified.
GOTCHA P: PRE-EXISTING, not P4 — `verify-primitives.mjs` reports 1 FAIL (MediaPlayer
  play/pause icon) on clean HEAD too (confirmed by stashing the P4 diff). It's a
  headless autoplay-gate timing flake in the P3 harness, untouched by P4. The gallery
  gate (`verify.mjs`) is the primary check and is green.
GOTCHA Q: gallery inventory statuses (t→a→m burn-down) were NOT flipped this session
  to avoid a gallery edit + re-verify; the workspace surface is now assembled+matched
  in code. Flip them in a later gallery-touching pass.

## 2026-08-23 — P4.10/P4.11 live wiring (code complete; e2e blocked in-sandbox)
IN PROGRESS: (cleared)
DONE: the live spine for the Workspace, wired to the seeded "Late Bloom LP" server.
  - `app/data.js`: live `loadWorkspace` reads (rail servers, server, channels-by-kind,
    members + admin grouping from roles/owner, messages+reply-counts+reactions, pins)
    and `loadThread`; demo path kept; signed-out returns `{needsAuth}`. `server_members.color`
    is the member hue; `shapeMessage`/`fmtTime`/`initials` shared with realtime.
  - `app/realtime.js`: the four CANON §E.4 channels — `channel:{id}` postgres_changes
    (insert/update/tombstone), `channel:{id}:typing` broadcast (+`sendTyping`),
    `server:{id}` presence (+track); `markRead` (mark_channel_read RPC) and `sendMessage`
    (direct RLS-gated insert — there is NO send_message RPC; user_id set explicitly).
    `teardownRealtime()` removes all channels; main.js calls it before each render.
  - `app/screens/workspace.js`: `attachLive()` patches the stream on live insert/edit/
    delete, dedupes the sender's own echo, bumps reply counts, appends into an open
    thread; typing indicator; presence updates the members rail dots + doing; composer
    sends via insert + broadcasts typing; thread replies via parent_id insert.
  - `app/screens/signin.js` + shell.css `.authcard`: a minimal magic-link sign-in (full
    auth polish is P9). main.js: teardown on nav, `/signin` route, signed-out → sign-in,
    re-render on auth hydrate/change. `app/supabase.js` exposes `window.__sb` on localhost
    ONLY (for the e2e harness).
  - Seed: `docs/seed-late-bloom.sql` (committed earlier) applied; passwords set on the
    3 demo authors only (never the real accounts). RLS-verified both real accounts read
    the server + can post; Realtime publication carries `messages`.
VERIFY: `verify-workspace.mjs` GREEN (10 states, demo + signed-out sign-in, both themes);
  sign-in screen screenshotted L+D. `verify-live.mjs` (two-session live test) written but
  NOT run here — see the verification-status callout at the top of this file (sandbox
  browser can't egress HTTPS through the agent proxy).
NEXT: run `verify-live.mjs` in a network-capable env or test on preview; then P5.
GOTCHA R: to run a browser against Supabase behind the agent proxy, launch Chromium with
  args `--proxy-server=<HTTPS_PROXY minus scheme>` + `--proxy-bypass-list=127.0.0.1;localhost`
  and context `ignoreHTTPSErrors:true`. In THIS sandbox that still fails cross-origin
  HTTPS ("Failed to fetch" for supabase AND google) though the localhost app loads — so
  verify-live needs an env whose browser has real outbound HTTPS.
GOTCHA S: `messages` insert needs `user_id` explicitly (NOT NULL, no default); RLS
  with-check still gates it to auth.uid(). No `send_message` RPC exists — insert direct.
GOTCHA T: live route params are real UUIDs (`/s/<uuid>/c/<uuid>`), NOT the demo's `lb`/
  `beats` slugs — `loadWorkspace` matches the server by id, so a slug route finds nothing
  live. In-app rail/channel links already emit UUIDs; only hand-typed URLs need care.

## 2026-08-24 — P4.10/P4.11 preview-bug fixes (6, all in code)
IN PROGRESS: (cleared)
DONE: fixed all 6 bugs from the owner's preview test (details + per-bug status in the
  callout under "Current state"). Touched `app/data.js` (separate profiles query +
  per-server cache + text-only active channel + `clearWorkspaceCache`),
  `app/screens/workspace.js` (inline-markdown `renderBody`, voice-channel no-op),
  `app/supabase.js` (pass the auth event through `onChange`), `app/main.js` (hold first
  render until `ready`, loading state, ignore transient-null sessions, clear cache on
  sign-out), `styles/shell.css` (`.tx code/a/strong/del`). Verified at the layers
  reachable in-sandbox: `verify-workspace.mjs` GREEN (10 states incl. markdown +
  signed-out sign-in, both themes); confirmed via SQL that `server_members` has no FK to
  `profiles` (the bug-1 root cause) and that `profiles` read policy is `true` (so the
  separate fetch resolves), and that the pins/roles embeds DO have FKs (fine as-is).
NEXT: owner re-tests on preview (browser e2e can't run in-sandbox); then P5.
GOTCHA U: PostgREST embeds need a real FK. `server_members` has NONE (user_id → auth.users,
  cross-schema), so `select('...,profile:profiles(...)')` silently returned nothing —
  fetch profiles separately by id list. The pins (`message:messages`) and roles
  (`role:roles`) embeds are fine because those FKs exist. When adding an embed, verify
  the FK first.
GOTCHA V: `renderBody` builds HTML via innerHTML but ONLY after HTML-escaping the raw
  body, so the injected `<strong>/<em>/<code>/<a>/.men` are the only markup — no XSS.
  Keep the escape first if you extend the markdown.

## 2026-08-24 — P5.11/P5.12 Upload (sheet + write path) + favicon
IN PROGRESS: (cleared)
DONE: real Upload. `app/screens/upload.js` `openUpload({visibility,serverId,channelId,
  folderId})`: dropzone (drag/click, ext-allowlist matching the signer's EXT set) →
  VisibilitySeg (reused primitive) → server/folder picker (real: lists the user's
  servers + that server's folders) → "Add details" (`<details>`: title/tags/collabs
  chip input) → Post. Write path: sha256 (crypto.subtle) → POST /api/sign (Bearer
  from rawSession) → PUT bytes to R2 → insert `works` (owner_type/owner_id/visibility/
  server_id/blob_sha/bytes; the works_blob_meter trigger dedups + meters) → Server
  upload also inserts `placement` (surface='server', folder_id) → tags via content_tags
  → collaborators via add_collaborator(work_id,handle,role). Wired the workspace
  composer attach (live) → openUpload for the current channel. `styles/content.css`
  (new, wired into index.html) holds P5 content CSS: .dropzone/.fl/.addmore/.ustore.
  Favicon: repo logo is already BLACK; created favicon.ico (copy) + cache-busted the
  icon links (an earlier GREEN logo was stuck in the 7-day vercel cache).
  Verified: app compiles + all workspace states green (verify-workspace.mjs); works/
  placement RLS insert checks + add_collaborator/quota confirmed via SQL. The R2 PUT
  itself is unverifiable in-sandbox + owner-gated (see NEXT).
NEXT: Explorer (P5.4/5.5) reads what Upload writes; then Details, Feed, Profile.
OWNER for uploads to work on preview: the R2 **write** env vars in Vercel
  (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) + SUPABASE_URL/
  SUPABASE_PUBLISHABLE_KEY, and the bucket **CORS** (paste r2-cors.json). R2_PUBLIC_BASE_URL
  (already set) is read-only; it does NOT let the signer write.
GOTCHA W: works `visibility` maps to owner_type/owner_id — server upload = owner_type
  'server', owner_id=server_id=serverId (needs `upload` perm, @everyone has it);
  personal = owner_type 'user', owner_id=me. The prompt's "storage_source/
  billing_server_id" are these columns, not literal columns. placement.pl_write needs
  placed_by=auth.uid() AND can_read_work — so insert the work first, then the placement.

## 2026-08-24 — P5.4/P5.5 File explorer (server mount)
IN PROGRESS: (cleared)
DONE: the server **File explorer** — the Drive half of the app, reading what Upload
  writes. `app/screens/explorer.js` `renderExplorer(data, view)`: the reused channel
  column (Files highlighted, `channelColumn` now exported from workspace.js with
  `view.filesActive`) · a nested **folder tree** (root = server name, collapsible
  twisties, current folder highlighted, lock/30d-Trash rows) · a **storage footer**
  (used/cap bar) · **breadcrumb ⇄ search-results** header swap · a compact **Grid/List**
  view dropdown · **grid** (folder cards + the shared `workCard` renderer) and **list**
  (name/type/size/uploader/added rows) · **search-as-you-type** (flattens the tree to
  title matches) · reusable **empty states**. One fetch, client-side navigation:
  `loadExplorer({serverId,folderId})` in `app/data.js` reads `folders` + `works`
  (server_id, deleted_at null) + `placement` (folder location + channel, fetched
  separately — no embed, per GOTCHA U) + the `storage_meters`/`storage_balance` meter,
  and shapes works to the card model; folder position is pure client filtering. Wired
  into `app/main.js` (explorer route → `loadExplorer` → `renderExplorer`, `?folder=`/
  `?view=` deep links). Demo fixture `demoExplorer()` in `app/demo.js` mirrors the live
  shape so `?demo=1` renders identically. All CSS was already ported (the P5.4 WIP
  commit: `.explayout/.filetree/.exview/.flrow` in content.css, `.card/.masonry/
  .emptystate` in shell.css) — no new selectors added.
  Verified: new `docs/design/verify-explorer.mjs` GREEN (7 states incl. grid/list,
  folder deep-link, locked folder, empty folder, search, both themes, zero app console
  errors); verify-workspace.mjs still GREEN after the `channelColumn` export change.
  Screenshots eyeballed against gallery #60 — matches (tree, breadcrumb, kind-cards,
  uploader hue chips, storage foot).
NEXT: Details pane (P5.5 — open a card → the media viewer + info rail), then the
  personal **My files** mount (hides the channel column, `owner_type='user'` source),
  then Feed view + Trash + the filter/sort dropdowns + multi-select bulk bar.
GOTCHA X: card media 404s until a real R2 upload exists — `mediaUrl()` returns null
  when `blob_sha` is null, so image/video cells fall back to the type card (by design;
  the demo fixture leaves blob_sha null, so its images show as PNG type cards). A live
  upload with real bytes is what turns them into thumbnails.

## 2026-08-24 — P5.5 Details pane (the one media viewer)
IN PROGRESS: (cleared)
DONE: the **Details pane** (CANON §C.7, eski-style §5) — the ONE media viewer, opened
  from any file card in the explorer. `app/screens/details.js` `openDetails(work, ctx)`:
  a near-full-screen **arena** on a scrim (media takes the room left, a fixed 380px info
  rail right), **closes on ✕ / Esc / backdrop click**. Media by kind — image fills the
  well, audio/video reuse the P3 `MediaPlayer` (real transport) when bytes exist, and
  non-previewable (or, until a real R2 upload lands, anything with no blob) shows a
  **type card** ("preview loads after upload" / "no preview, download to open"), never a
  fake thumbnail. Info rail: `.dtop` (filename · Report · prev/next chevrons · close,
  inset hairline under) · `.scroll` (h2 title · dense are.na `.meta` rows: Location
  breadcrumb → Uploaded by → Posted in #channel → Added → Format → **Size last** · Tags
  as bold text) · `.foot` (Download, Save to my files, inset hairline on top). **Server
  file = NO comment thread** (chat handles replies); the `isPost` path renders a comment
  thread for later (Feed/Profile). Prev/next steps through the folder's files (siblings);
  ←/→ navigate unless a media player is focused (there they're 5s skip). Location crumbs
  open the explorer at that folder (preserves `?demo=1`). Wired `explorer.js` `openFile`
  → `openDetails`; `data.js loadExplorer` now also fetches `content_tags` (one batched
  `.in()` query) and attaches `tags` per work; `demoExplorer()` carries tags; `main.js`
  calls `closeDetails()` on every route change (the sheet lives on `body`, not `stage`).
  CSS: ported the arena block into `styles/content.css` **scoped under `.sheet`** so the
  generic names (.meta/.row/.foot/.cmt/.by/.tx) never leak (the leaked-`.msg` trap); the
  `.dmbigplay/.dmtransport/.tbtn/.navarrow` media pieces are the P3 primitives, reused.
  Verified: `docs/design/verify-explorer.mjs` extended — 9 states GREEN incl.
  details-light/dark (arena structure, ≥4 meta rows, Location crumb, tags present, NO
  comments on a server file, Size is the last row, Esc closes), both themes, zero app
  console errors. Screenshots eyeballed vs gallery arena panels — matches.
NEXT: the personal **My files** mount (hides the channel column, `owner_type='user'`
  source, "Your storage" footer), then Feed view + Trash + the filter/sort dropdowns +
  multi-select bulk bar; the Details **Download**/**Save** write paths need the R2 read
  env + `saved_items` RPC.
GOTCHA Y: the explorer opens details on a **single click** for now — the Google-Drive
  "single-click selects, double-click opens" model (CANON §C.6) waits on the multi-
  select/marquee pass; single-click-opens matches "elsewhere a single click opens" and
  is the honest v1 until selection exists. Don't wire double-click before selection, or
  a plain click will do nothing.

## 2026-08-24 — P5.6 Personal "My files" mount (explorer, personal source)
IN PROGRESS: (cleared)
DONE: the personal **My files** Drive — the SAME explorer component parameterised to the
  personal source (CANON §C.6/§E), reached from the rail's folder button (now wired to
  `/files`, highlighted when active) and the new `/files` route. `data.js
  loadPersonalExplorer(user, folderId)`: reads the user's own `works`
  (`owner_type='user'`, not-deleted) filed into nested `save_folders` (location via
  `saved_items.folder_id`, else root), `content_tags`, and the **personal** storage
  meter (`owner_type='user'`, 10 GB base). `loadExplorer({source})` branches to it;
  `renderExplorer` handles `source==='personal'` — **no channel column** (its own tree is
  the nav), tree/breadcrumb root = "My files", **"Your storage"** footer (user icon),
  "Search your files" placeholder, Upload defaults to a personal (private) upload, and
  the details Location crumb points back to `/files`. `demoExplorer('personal')` fixture
  (`demoPersonalExplorer`) mirrors the live shape so `?demo=1` renders it. Server mount
  unchanged (still mounts the channel column with Files highlighted).
  Verified: `verify-explorer.mjs` extended — 11 states GREEN incl. personal-light (NO
  channel column, "My files" tree header, "Your storage" foot, grid cards) and
  personal-folder (breadcrumb), both themes, zero app console errors. Screenshot
  eyeballed vs gallery personal tree — matches.
NEXT: Feed view (the explorer's flattened previewable-only + inline-comments view) OR
  the home Feed screen (friends' public posts — same card component, `visibility=public`
  source); then Trash view + the filter/sort dropdowns + multi-select bulk bar; the
  Save/New-folder write paths (`save_to_files`, `save_folders` insert).
GOTCHA Z: a personal work's folder location comes from `saved_items.folder_id`, but a
  straight personal **upload** writes no `saved_items` row (only saved/crossposted works
  get one), so freshly-uploaded personal files sit at **root** until filed. If personal
  uploads should land in a chosen folder, the upload write path needs a `saved_items`
  insert — not built yet (upload.js only writes `placement` for server uploads).

## 2026-08-24 — P5.1 home Feed (friends' public posts)
IN PROGRESS: (cleared)
DONE: the home **Feed** (CANON §C.5) — the friends-only portfolio grid, the public
  counterpart to the explorer (same "one card renderer, parameterised by source"). Rail
  Home button + `/` now render it for a signed-in user. `data.js loadFeed()`: accepted
  friends (`friendships` where I'm a_user OR b_user, status='accepted') → their PUBLIC
  works (`visibility='public'`, author ∈ friends, not-deleted), authors resolved from
  `profiles` (name/handle, **no colorIdx** — the member hue is server-scoped and must
  render nowhere public). `app/screens/feed.js renderFeed(data)`: wordmark + Feed/
  Notifications/You nav (`.nav.on` underline) · search (title/author) · Type/Sort
  dropdowns (placeholder actions) · **even ⇄ masonry** layout toggle (default even) ·
  the shared `workCard` with **hue:false** (plain author text) · the "Your feed is quiet"
  empty state with a Find-friends CTA. Cards open the Details pane as a **public post**
  (`isPost:true` → a Comments section; a post has no local tree so the Location row is
  dropped and it leads with **Posted by**). `cards.js workCard` gained a `hue` option
  (default true; false = plain author, no `.uchip`). `main.js` wires the feed screen
  (demo bypasses the signed-out landing so `/?demo=1` shows the fixture);
  `demoFeed()` fixture added.
  Verified: new `docs/design/verify-feed.mjs` GREEN — feed-light/dark (wordmark, active
  nav, search, post cards, **no member-hue chips**) + post-details (public post: Comments
  section present, no Location row, Posted-by present), both themes, zero app console
  errors. Screenshot eyeballed vs gallery feed — matches.
NEXT: Profile screen (§C.10 — hero + Public/Server/Private shelves, POV variants, same
  card grid) OR the explorer Trash view (§C.6) + filter/sort dropdowns + multi-select;
  then wire real comments (`comments` table, context public/server) so the post thread
  and the explorer's Feed-view comments are live.
GOTCHA AA: the Feed is empty until BOTH a friends system and public posts exist — no
  friendships/public works are seeded, so live `/` shows the "quiet feed" empty state
  (correct). Use `/?demo=1` to see the populated grid. Type/Sort are placeholder menus
  (client filters land with the explorer filter pass).

## 2026-08-24 — P5.10 Profile screen (shelves + POV)
IN PROGRESS: (cleared)
DONE: the **Profile** (CANON §C.10) — a person's shelves, reached from `/u/:handle`
  (avatar menu → Profile, the Feed's "You" nav). `data.js loadProfile(handle)`: the
  `profiles` row by handle, the viewer **POV** (owner if it's you, else `friendships`
  accepted → mutual, else public), and the author's `works` grouped by visibility into
  **Public / Server / Private** shelves (RLS is the real fence — we group whatever the
  viewer may read). `app/screens/profile.js renderProfile(data)`: round avatar hero
  (name · @handle · bio) with the **POV action** (owner→Edit profile · public→Add friend
  · mutual→Message), shelf tabs with counts + **Settings** (owner only) + search, the
  shared `workCard` grid (**hue:false** — a public profile is never server-scoped), and
  per-shelf empty states. Cards open the Details pane (Public shelf → public post w/
  comments). Which shelves a POV sees: owner all three, mutual Public+Server, public
  Public only. CSS ported into `content.css` (`.prof/.phero/.ptabs2/.ptab2`) from the
  gallery. `main.js` wires the profile screen; `demoProfile()` owner fixture for `?demo=1`.
  Verified: new `docs/design/verify-profile.mjs` GREEN — owner-light/dark + shelf-switch
  (round avatar, hero, 4 tabs, grid, exactly one active tab, Settings NOT active, NO
  member-hue chips), both themes, zero app console errors. Screenshot eyeballed vs
  gallery — matches.
FIXED (found while building): `classList.toggle(cls, undefined)` **flips** instead of
  clearing, which wrongly lit the Settings tab (it sits past the end of the shelves
  array). Coerced the toggle arg to a real boolean; added a regression assertion.
NEXT: the Edit-profile modal (owner) + user settings; then the explorer Trash view +
  filter/sort dropdowns + multi-select; then wire real `comments` (post threads +
  the explorer Feed-view). Backend for Save/New-folder/Download write paths still
  pending (`save_to_files`, `save_folders` insert, R2 read env).
GOTCHA AB: like the Feed, live profiles are sparse until public works + friendships
  exist; `/u/<you>?demo=1` shows the populated owner self-view. The three POVs are
  computed for chrome only — `works_read` + `friendships` enforce them server-side, so a
  stranger's shelves come back empty even if the client asked for more.

## 2026-08-24 — P5.6b Explorer selection model + bulk bar
IN PROGRESS: (cleared)
DONE: the Google-Drive **selection model** in the explorer grid (CANON §C.6), which
  also retires the single-click-opens stopgap (GOTCHA Y). In `explorer.js`: a
  **single click selects** a card (clearing the rest), **⌘/Ctrl-click toggles**,
  **Shift-click ranges**, **⌘/Ctrl-A** selects everything in view, **Esc** clears, and a
  **double-click opens** the Details pane. A selection lights the card (`.card.sel`
  outline + check badge via `selectable:true`) and opens the **bulk bar** (`.selbar`:
  "N selected · Download · Move to folder · Delete · Clear" — actions are wired to
  toasts pending their write paths). Keyboard is a single self-cleaning document
  listener (removes itself once the screen leaves the DOM; yields to the details overlay
  and text inputs). A folder/search change clears the selection. Folders still descend on
  a single click; list view keeps click-to-open (the bulk model is grid-focused, as in
  the gallery). All `.selbar/.cardsel/.card.sel` CSS already existed (P5.4).
  Verified: `verify-explorer.mjs` updated — the details case now asserts **single click
  selects (no details, bulk bar opens)** and **double-click opens**; 11 states GREEN,
  both themes, zero app console errors. Screenshot eyeballed (2 non-contiguous cards
  selected, bulk bar) — matches gallery.
NEXT: wire the bulk actions' write paths (delete→Trash, move_to_folder) + the Trash view
  (§C.6); the filter/sort dropdowns + quick-filter chips; then real `comments`.

## 2026-08-24 — P5.7 Explorer Type/Sort filters
IN PROGRESS: (cleared)
DONE: the explorer toolbar's **Type** + **Sort** filters and a **sort-direction** toggle
  (single-select v1 — CANON's multi-select Type/Channel/Uploader/Tag + quick-filter chips
  are a later pass). Type filters the grid by `works.kind` (All/Images/Audio/Video/Text/
  Projects); Sort orders by Latest/Oldest/Name/Size with the direction chevron flipping
  asc/desc; both re-render the contents in place and interact correctly with search,
  folder nav, and the selection model. `sortFiles()` is the shared comparator. Reused the
  existing `.btn`/menu primitives (`.exfilter` is a marker, styles as `.btn`).
  Verified: `verify-explorer.mjs` +type-filter case (open Type → Audio → only the 1 audio
  card of 4 remains); 12 states GREEN, both themes, zero app console errors.
NEXT: multi-select filters + quick-filter chips + Date + (server) Channel/Uploader/Tag;
  the write paths for the bulk-bar actions (delete→Trash `works.deleted_at`,
  `move_to_folder`) + Trash view; New folder (`folders`/`save_folders` insert); then
  real `comments`.

## 2026-08-24 — P5.8 Explorer Feed view (grid/list/feed triad complete)
IN PROGRESS: (cleared)
DONE: the explorer's third view, **Feed** (CANON §C.6) — an Instagram-style server media
  feed. `feedView()` flattens the current folder's whole **subtree** to the **previewable**
  works (image/video/audio) newest-first (project files like .flp/.zip hidden — grid/list
  show them), each rendered at natural width with a meta line (title · author · folder) and
  its **comments inline** + a comment field. A note bar explains the flatten. Ported the
  `.filefeed/.ffnote/.ffitem/.ffmedia/.ffmeta/.ffcmts` CSS into content.css (comment rows
  scoped under `.filefeed`). The view dropdown now offers Grid/List/**Feed**; `feedMedia`
  reuses the kind icons for the no-bytes-yet fallback. Demo works f2/f3 carry comment
  fixtures so `?view=feed` shows real threads.
  Verified: `verify-explorer.mjs` +feed-view case (note bar, media items, inline comments,
  exactly the 2 previewable of beats' 4 files); 13 states GREEN, both themes, zero app
  console errors. Screenshot eyeballed vs gallery feed view — matches.
NEXT: live-load the feed's server comments (`comments` context='server') + a working
  comment composer (insert), and the post details' public thread; then the write paths
  for delete→Trash / move_to_folder / New folder / save_to_files (some RPCs — restore/
  purge/empty_trash/save_to_files — are NOT yet in the DB, only move_to_folder is).
GOTCHA AC: the trash + save RPCs from CANON §E.3 (`restore_work`, `purge_work`,
  `empty_trash`, `save_to_files`, `unsave`) are NOT applied yet — only `move_to_folder`
  exists. Wiring the bulk-bar Delete/Save and the Trash view needs those migrations first
  (or a direct `works.deleted_at` update for soft-delete, but hard purge needs the blob
  refcount RPC).

## 2026-08-24 — P5.6c New folder (real write path)
IN PROGRESS: (cleared)
DONE: the **New folder** flow (CANON §C.6) — both the toolbar and folder-tree-header
  `newFolderBtn` (they were `toast("P5.6")` stubs) now open the reusable single-field
  **prompt** dialog (gallery "Prompt" panel: `openModal` → `.field` input → Cancel/Create;
  Create is disabled until the name is non-empty, Enter submits, a throw keeps the modal
  open and toasts the reason so the user can retry). On submit it hits a **real write
  path**: `createFolder()` in `data.js` calls the `create_folder` RPC for a server mount
  (the RPC is the fence — gates `has_perm(manage_channels)`, rejects cross-server parents)
  and a direct `save_folders` insert for the personal My-files mount (RLS on `user_id`).
  The new row is pushed into `data.folders` and the screen rerenders from it — no refetch,
  matching the explorer's one-fetch/client-nav model — created under the folder in view,
  with the parent + root un-collapsed so the child is visible. In `?demo=1` there is no
  network, so the insert is optimistic-only (keeps the fixture a screenshot aid, per the
  owner's "don't fake" principle — the real path is the RPC/insert above).
  Verified: `verify-explorer.mjs` +`new-folder` case (open prompt → Create disabled empty
  → type name → Create enables → submit → prompt closes → new subfolder card appears under
  beats); **14** explorer states GREEN, both themes, zero app console errors. Full gallery
  verify GREEN (21 screens · 65 states · 45 dialogs).
NEXT: wire the bulk-bar **Move to folder** to the `move_to_folder` RPC (exists) with a
  folder-picker; then multi-select filters + quick-filter chips (§C.6). Delete→Trash + the
  Trash view still need the user-facing trash RPCs (`restore_work`/`empty_trash`/`save_to_
  files` — NOT applied; only `create_folder`/`move_to_folder`/`purge_trashed_works` exist,
  the last cron-only) or a direct `works.deleted_at` soft-delete + an RLS UPDATE policy.
GOTCHA AD: `create_folder` returns the `folders` row (id/name/parent_id/archived/locked);
  I read `parent_id` off it for the folder shape. `save_folders` has no archived/locked
  columns (personal folders can't be locked) — the shape hardcodes both false there.

## 2026-08-24 — P5.6d Move to folder (real write path + picker)
IN PROGRESS: (cleared)
DONE: the bulk-bar **Move to folder** action (was a `toast("P5.6")` stub) now opens the
  gallery **destination picker** and hits a **real write path**. The picker (`openMovePicker`
  in `explorer.js`, a `wide` `openModal`): a "Destination in <server>" label, the folder
  tree in a scroll well (`.movetree` reusing `.ftrow`/`.lvlN`), **locked server folders are
  disabled rows** (lock icon + `.svnote` "Locked folders can't receive files"), a **New
  folder** shortcut that creates a destination under the current highlight without leaving
  the dialog (reuses the P5.6c prompt + `createFolder`), and **Move here** disabled until a
  destination is picked. On submit, `moveToFolder()` in `data.js` calls the **`move_to_
  folder` RPC per work** on a server (the RPC is the fence — manage-files gate, rejects a
  folder outside the work's server, null = root) and a **`saved_items` upsert** (PK
  user_id+work_id, so a never-filed and an already-filed work both land in one call) in
  My-files. Moved works get their new `folderId`, the screen rerenders (they leave the
  current folder view) and the selection clears. Demo moves optimistically (no network).
  Added `.movetree/.ulab/.svnote` to `content.css` (the picker classes were gallery-only).
  Verified: `verify-explorer.mjs` +`move-to-folder` case (select → open picker → Move here
  disabled until Root picked → Move → picker closes, selection clears, file leaves beats);
  **15** explorer states GREEN, both themes, zero app console errors. Move picker screenshot
  eyeballed light+dark vs gallery §Move-to-folder — matches (root+nested tree, locked rows
  greyed with lock, selected row highlighted, scrim not shadow). Full gallery verify GREEN.
NEXT: multi-select filters + quick-filter chips (§C.6) — the `.fchip` quick-filters +
  multi-select Type/Channel/Uploader/Tag; OR card right-click context menu ("Move to…",
  "Download", "Delete") reusing the picker. Delete→Trash + the Trash view still need the
  user-facing trash RPCs (only `create_folder`/`move_to_folder`/`purge_trashed_works`
  exist) or a `works.deleted_at` soft-delete + RLS UPDATE policy.
GOTCHA AE: `move_to_folder` is one-target — bulk = a loop of RPC calls; a partial failure
  leaves earlier works moved and throws on the first bad one (the toast surfaces it). The
  personal path is a single `saved_items` upsert (atomic). Both fine for the beta.

## 2026-08-24 — P5.7b Explorer multi-select filters (full facet set)
IN PROGRESS: (cleared)
DONE: replaced the single-select v1 Type/Sort with the **full filter set** (CANON §C.6,
  gallery toolbar): **Type / Channel / Uploader / Tag** are **multi-select**, **Date** and
  **Sort** single. Within a facet the picks **union**; across facets they **intersect**.
  Channel + Uploader are server-context only (hidden on the personal mount); their options
  (plus Tag's) are **derived from all files** so the set is stable across folder nav. Each
  multi filter opens `openFilterMenu` — checkable rows that **toggle in place** without
  closing (unlike `openMenu`), a **Clear** row when anything's picked, outside-click/Esc to
  dismiss; the button fills (`.exfilter.on`) and shows a live **count badge** (`.fc`). Date
  windows are today (since midnight) / this week / month / year via `dateCutoff`. A facet
  with no options disables its button. Fixed a **toolbar overflow**: New folder + Upload now
  travel as one right-aligned `.tbactions` unit (wraps as a pair on a narrow pane instead of
  orphaning Upload), and the search field max shrank 420→340 — the row is one line again at
  the real ~938px pane width.
  Verified: `verify-explorer.mjs` +`multi-filter` case (Type Audio∪Images→2, +Uploader rae
  intersect→2, +Tag reference→1, Clear Type→still 1 + button inactive) and the existing
  type-filter case now drives the multi menu; **16** explorer states GREEN, both themes,
  zero app console errors. Toolbar + open multi-menu screenshot eyeballed light+dark vs
  gallery §toolbar — one row, check gutter aligns, active Type shows "2" + fill. Full
  gallery verify GREEN.
NEXT: the **Starred** quick-filter is deferred — works carry no `starred`/`pinned` field
  yet, so adding the toggle would be faking (leave it out until the schema has it). Card
  **right-click context menu** ("Move to…" reusing the picker, Download, Delete) is the
  next natural surface; Delete→Trash + the Trash view still need the user-facing trash RPCs
  (only `create_folder`/`move_to_folder`/`purge_trashed_works` exist) or a `works.deleted_
  at` soft-delete + RLS UPDATE policy.
GOTCHA AF: filters persist across folder navigation + search (they live in screen `state`,
  not reset by `repaintBody`, which only clears the selection). `repaintBody` rebuilds the
  body but NOT the toolbar, so each filter button self-refreshes its count/label in place.

## 2026-08-24 — P5.7c Trash end-to-end (Delete→Trash · view · restore · purge · empty)
IN PROGRESS: (cleared)
DONE: the whole **Trash** cluster (CANON §C.6/§E.3, gallery B19) — **with NO new
  migration**. Key finding: soft-delete / restore / purge are **plain client writes**, the
  `works` RLS already fences them (`works_update`/`works_delete` gate on `can_write_work` =
  author or server admin; `authenticated` holds the UPDATE/DELETE grants), a trashed work
  stays readable by its author (`can_read_work`'s owner branch skips the `deleted_at`
  guard), and the `works_blob_meter` AFTER trigger correctly leaves the storage meter
  untouched on a `deleted_at` flip (kept 30 days) and decrements it + the blob refcount on
  the hard DELETE. So `data.js` gained direct writers — `trashWorks` (bulk soft-delete),
  `restoreWork`, `purgeWork`, `emptyTrash(scope)`, and `loadTrash` (reads the caller's own
  trashed works). Wired in `explorer.js`: the bulk-bar **Delete** → Trash with an **Undo**
  toast (one-action restore); the tree **Trash** row opens the **Trash view** (`paintTrash`)
  — the retention notice + **Empty trash now** (danger) over rows showing media icon · name
  · uploader/when · a **days-left countdown that turns danger-red ≤7d** · hover **Restore /
  Delete forever**. Entering Trash refetches from the DB in live mode; the demo seeds 3
  rows (29d/21d/6d — the last warn). `data._trash`/`data.files` stay in sync across every
  action (no refetch). Ported the B19 CSS (`.trashnote/.trrow/.tmed/.tinfo/.tleft/.tacts`)
  into content.css.
  Verified: `verify-explorer.mjs` +`trash` case (Delete removes from folder + clears the
  selection → Trash holds 3+1=4 with a warn row → Restore→3 → Delete forever→2 → Empty→0 +
  empty state); **17** explorer states GREEN, both themes, zero app console errors. Trash
  view screenshot eyeballed light+dark vs gallery B19 — matches (notice, danger Empty, red
  6d, hover actions). Full gallery verify GREEN.
NEXT: **Save to my files** (`saved_items` insert per CANON §E.3 `save_to_files`/`unsave`)
  + the **Starred** smart-folder (`starred_items` + `toggle_star` — the deferred quick-
  filter; needs the table/RPC which may not be applied — check `list_migrations`); the card
  **right-click context menu** (Move to…/Delete reuse the picker + trash writers now, plus
  Download once R2 read env lands). Card **rename** (works.title update, RLS-gated like
  delete). Drag-and-drop file→folder (`.dropinto` CSS exists) reusing `moveToFolder`.
GOTCHA AG: `loadTrash` doesn't fetch each work's `placement.folder_id`, so a live restore
  re-adds the file to `data.files` without its folderId (shows at root until the next full
  explorer load; the DB row is correct — only deleted_at was cleared). Demo restores keep
  the folder (the fixture rows carry it). Fetch placement in loadTrash to make live restore
  land in the right folder in-session.
GOTCHA AH: the server Trash view shows only **your own** trashed works (RLS `can_read_work`
  denies other members' trashed rows even to an admin). That's the safe default; an admin
  takedown is not "restorable by the admin" — only the author sees/restores it.

## 2026-08-24 — P5.8b Save to my files (details pane, real saved_items write)
IN PROGRESS: (cleared)
DONE: wired the details-pane **Save to my files** button (was a `toast("P5.8")` stub) to a
  **real write path** — a `saved_items` owner-copy pointer (CANON §E.3 `save_to_files`/
  `unsave`). `saved_items` RLS (`si_all`: user_id = auth.uid()) already fences it to the
  caller's own rows and `authenticated` holds the grants, so `data.js` gained plain client
  writers: `saveToFiles(workId, folderId=null)` (idempotent upsert on PK user_id+work_id),
  `unsaveWork(workId)` (delete the pointer — the work is untouched), `isWorkSaved(workId)`.
  The button is a **toggle**: label + icon carry the state (Save ⇄ Saved to my files), the
  current state is confirmed **async after open** so re-opening an already-saved file reads
  right, and it's **hidden on a personal file** (already in your library). Demo toggles
  optimistically (no network).
  Verified: `verify-explorer.mjs` details case +Save-toggle assertions (button reads "Save
  to my files" → click → "Saved to my files" → click → back); details-light + details-dark
  GREEN, **17** explorer states GREEN, both themes, zero app console errors. Full gallery
  verify GREEN.
NEXT: the **Starred** smart-folder + quick-filter (`starred_items` + `toggle_star` — check
  `list_migrations`; the table/RPC may not be applied). Card **right-click context menu** —
  now that Move to…/Delete(→Trash)/Save are all real writers, a fuller menu is honest
  (Download still waits on the R2 read env; Rename = a `works.title` update, RLS-gated like
  delete; Copy link = a `share_links` insert / `resolve_share_link` exists). Live **Save**
  should also target a chosen personal folder (folderId) via the same picker, not just root.
GOTCHA AI: Save filed at personal **root** (folder_id null) for now — the details pane has
  no folder chooser. The picker (`openMovePicker`) is server-scoped; a personal-folder
  variant would let Save-to-a-folder reuse it.

## 2026-08-24 — P5.9 Starred (card star + gold badge + quick-filter · real writes)
IN PROGRESS: (cleared)
DONE: the **Starred** feature end-to-end (CANON §C.6/§E.3, gallery #43/B20) — **no new
  migration**. Star/unstar are plain client writes: `starred_items` (PK user_id+work_id) has
  owner-only RLS (`star_all`) and the `authenticated` CRUD grant, so `data.js` gained
  `starWork` (idempotent upsert) + `unstarWork`; both explorer loaders now fetch the user's
  starred set (one extra `starred_items` select alongside placements/tags) and stamp
  `w.starred`. In `cards.js` `workCard` grew a `starred`/`onStar` pair: a persistent **gold
  star badge** (`.cardstar`, shown via `.card.starred`, hidden on hover) + a **star hover
  action** (gold + filled when on) as the card's first `.cardacts` button — no stub
  download/link/more added (those wait on the R2 read env / share links). Added the one
  sanctioned non-mono token **`--star:#E0A92A`** (defined once, reads on both themes) and the
  badge/action/quick-filter CSS. In `explorer.js`: `toggleStar` writes then updates the card
  **in place** (keeps the selection; rerenders only when unstarring inside the filter view);
  the **Starred quick-filter** (`.iconbtn.exstar`, gold when active) in line with the filters
  flattens the pane to a grid of every starred work (like a smart-folder) with its own "No
  starred files" empty state. Demo seeds 2 starred (f3/f5) + toggles optimistically.
  Verified: `verify-explorer.mjs` +`starred` case (seeded badge; quick-filter → 2-work flat
  grid, toggle .on; star a card via its hover action → count 1→2 → unstar → 1); **18**
  explorer states GREEN, both themes, zero app console errors. Starred grid screenshot
  eyeballed light+dark — gold badge + active gold toggle, everything else mono. Full gallery
  verify GREEN.
NEXT: the card **right-click / ⋯ context menu** — Star (done), Move to…, Delete (→Trash),
  Save to my files are all real writers now, so a fuller menu is honest (Download waits on
  the R2 read env; Rename = a `works.title` update RLS-gated like delete; Copy link = a
  `share_links` insert, `resolve_share_link` exists). Also: unstar-from-details, and the
  personal-mount Save-to-a-folder chooser (GOTCHA AI).
GOTCHA AJ: the star hover action lives in `.cardacts` (display:none until `.card:hover`),
  so a headless click must `hover()` the card first. The badge + action share the top-left
  corner with `.cardsel` (selection check) as in the gallery — a starred+selected card
  overlaps there by design (LAW); revisit only if it reads badly in real use.

## 2026-08-24 — P5.9b Card ⋯/right-click menu + Rename
IN PROGRESS: (cleared)
DONE: the card **⋯ / right-click context menu** (CANON §C.6, gallery card menu) wiring only
  the actions that have a **real write path** — **Star/Unstar · Save to my files · Rename ·
  Move to… · Delete** — no stubs (Download waits on the R2 read env, Copy link on
  share_links, Hide-from-library on the Show-hidden filter; each returns as its backend
  lands). `workCard` cards now carry a **⋯ hover action** beside the star (`onMenu`), and a
  **right-click** on any card opens the same menu. New writer `renameWork(id,title)` in
  data.js (a `works.title` update, fenced by `works_update`/can_write_work — same gate as
  delete; the trigger re-derives search_tsv). Generalised the single-field prompt to
  `promptText({title,placeholder,value,submit,…})` — New folder still uses it; **Rename**
  reuses it prefilled + text-selected (submit disabled until the name changes). Refactored
  `moveSelected`/`trashSelected` into id-taking `moveIds`/`trashIds` so the bulk bar and a
  single card menu share one path. Save is omitted on a personal file (already yours). Demo
  writes optimistically.
  Verified: `verify-explorer.mjs` +`card-menu` case (menu lists the 5 real actions; Rename
  prefills the current name → change → the card title updates + prompt closes; menu Delete
  removes one card from the folder); **19** explorer states GREEN, both themes, zero app
  console errors. Card menu screenshot eyeballed — [star, ⋯] hover actions, menu items with
  Delete in danger red, anchored to the ⋯ button. Full gallery verify GREEN.
NEXT: as their backends land — **Download** (R2 read env), **Copy link** (`share_links`
  insert; `resolve_share_link` exists), **Hide from library** (a `works.hidden` toggle +
  the panehd Show-hidden filter, currently a stub), **Crosspost to server…**. Also
  unstar/rename from the details pane, and the personal Save-to-a-folder chooser (GOTCHA AI).
GOTCHA AK: nested `<button>` — the card is a `button`, its `.cardacts` star/⋯ are buttons
  inside it. Each action's onClick calls `e.stopPropagation()` so it doesn't trigger the
  card's select/open. Right-click uses `contextmenu` (preventDefault) → the same menu.

## 2026-08-24 — P5.9c Hide from library (#55) + Show-hidden
IN PROGRESS: (cleared)
DONE: the **Hide from library** feature (CANON #55) — a hidden/utility work is omitted from
  the organised explorer view unless **Show-hidden** is on. The panehd Show-hidden toggle
  (was a `toast("P5.5")` stub) is now a real `.iconbtn.on` toggle: `state.showHidden` gates
  `contents()` (`if (!showHidden) files = files.filter(w => !w.hidden)`), applied in folder /
  search / Starred views alike. Revealed hidden cards read **dimmed** (`.card.ishidden`,
  opacity .55, lifts on hover) — same low-presence signal as the archived tree row, no new
  chrome. The card ⋯ menu gained **Hide from library / Show in library** (real writer
  `setHidden(id,hidden)` — a `works.hidden` update fenced by `works_update`/can_write_work);
  hiding a work drops it from the view (rerender). Demo seeds a hidden utility file (`f8
  system_cache.tmp`) at root.
  Verified: `verify-explorer.mjs` +`hidden` case (root hides f8; Show-hidden reveals it
  dimmed + toggle active; off re-hides; the ⋯ Hide drops a visible work from the view);
  **20** explorer states GREEN, both themes, zero app console errors. Full gallery verify
  GREEN.
NEXT: the remaining card-menu items as their backends land — **Download** (R2 read env),
  **Copy link** (`share_links` insert; `resolve_share_link` exists), **Crosspost to
  server…**. Details-pane parity (unstar/rename/hide from the viewer), and the personal
  Save-to-a-folder chooser (GOTCHA AI). The explorer's write surface (New folder · Move ·
  Trash · Star · Save · Rename · Hide) is now real end-to-end — a natural point to move to
  the **Feed comments** live path or **Profile** writes next.
GOTCHA AL: `.iconbtn.on` is a generic pressed-toggle style (Show-hidden); the Starred
  toggle keeps its gold via the more-specific `.iconbtn.exstar.on`. Order-independent —
  specificity (3 vs 2 classes) decides, not source order.

## 2026-08-24 — P5.9d Details-pane action menu (card-menu parity in the viewer)
IN PROGRESS: (cleared)
DONE: the open **Details pane** now carries the **same ⋯ action menu the card offers** —
  Star/Unstar · Save to my files · Rename · Move to… · Hide/Show in library · Delete — so a
  file is actionable from the viewer, not only from its card in the grid. A ⋯ `.iconbtn`
  (aria-haspopup=menu) sits in the info-rail header (`.dtop`, before Report); it renders
  **only when the caller supplies actions** — the explorer passes `menuItemsFor`, so public
  posts (feed/profile) show no menu. **One source of write logic:** `explorer.js`
  `detailMenuItems()` reuses the card handlers (`toggleStar/renameFile/moveIds/toggleHidden/
  trashIds`), threading the pane's own hooks — `repaint()` re-renders the pane in place after
  an in-viewer Star/Rename/Hide (the pane stays open, its title/labels update), `close()`
  dismisses it first for Move (opens the destination picker) and Delete (the file leaves the
  view). The grid behind refreshes via each handler's existing `rerender()`, so both surfaces
  stay in sync. Added an optional `after` callback to `toggleStar/toggleHidden/renameFile`
  (card path passes none — unchanged) so the pane can repaint after the write resolves.
  **Layer fix:** `.scrim` z-index 80 → **82** (above the details `.sheet` at 81) — a modal is
  always spawned *from within* a surface (the Rename prompt opens from the pane's ⋯ menu), so
  it is the newer, active interaction and must sit on top of the viewer that opened it, never
  behind it; menus (90) and toasts (95) still float above modals. Comment in
  `styles/primitives.css` records why.
  Verified: `verify-explorer.mjs` `details-{light,dark}` extended — the ⋯ menu lists all six
  actions; Rename opens a prompt that asserts `promptZ > sheetZ`, submits, and the pane's
  filename repaints in place while the pane stays open; Hide flips the menu label to
  "Show in library" with the pane still open. **18** explorer cases GREEN both themes, zero
  app console errors. Menu screenshotted in both themes (anchored under ⋯, Delete in danger
  red, square icons — matches the card menu). Full gallery `verify.mjs` GREEN.
NEXT: as their backends land — **Download** (R2 read env), **Copy link** (`share_links`
  insert; `resolve_share_link` exists), **Crosspost to server…**, plus **Add tag** (details
  Tags +) and the personal **Save-to-a-folder** chooser. Or move to a new surface: the
  **Feed comments** live write path, or **Profile** writes (edit-profile, shelves).
GOTCHA AM: `.scrim` (80) sat *below* the details `.sheet` (81) — a modal opened from the
  pane rendered behind it, invisible under the sheet's own dim. Raised scrim to 82. Any
  future full-screen overlay above a modal must land above 82 (and below the 90 menu layer).

## 2026-08-24 — P5.13 Post comments (public-post thread · live read + write)
IN PROGRESS: (cleared)
DONE: the Details-pane **comment thread** on a public post is now real — it was an empty
  list + a dead input. Wired to the `comments` table (schema-05, CANON §E.8.5): comments are
  POST-level and public-context only (a server file discusses in its channel, so the explorer
  panes still carry NO thread). New in `data.js`: `loadComments(workId)` (read
  `comments` where deleted_at is null, oldest-first) and `postComment(workId,body)` (insert).
  `comments.user_id → auth.users` has NO FK to `profiles`, so authors are fetched SEPARATELY
  into a byId map — the same embed hazard the workspace hit (bug #1), not an embed. **No
  member hue:** the thread is public context, so author names render NEUTRAL (colorIdx stays
  null) — the server-scoped hue is forbidden on the Feed (CLAUDE.md). `details.js`
  `commentsSection(ctx,w)` loads async on open, renders via a shared `commentRow`, and the
  input posts on Enter, appending optimistically + clearing; a keep-local- merge guards the
  rare race where the fetch resolves after a fast first post. **RLS is the fence:** `cmt_insert`
  allows only the author or a friend of the author — a stranger's insert is rejected by
  Postgres and surfaced as a toast ("Only the author and their friends can comment"); the
  UI stays the signpost. Demo seeds threads on q1 (2) / q2 (1) via `demoComments`; posting in
  demo appends optimistically (no network). Added `.cmtempty` (muted "Be the first to
  comment.").
  Verified: `verify-feed.mjs` `post-details` extended — q1 loads its 2 seeded comments, the
  names assert NEUTRAL (no `m\d` class, no inline color), and an Enter-post appends 0→3 and
  clears the field. Feed/profile/explorer/gallery verifies all GREEN both themes, zero app
  console errors. Thread screenshotted both themes (neutral names, avatars, input).
GOTCHA AN: `Node.replaceChildren(arr)` does NOT flatten — passing `comments.map(row)` (an
  array) as one arg appends nothing. Must spread: `replaceChildren(...nodes)`. Caught by the
  verify (0 comments) before it shipped.
NEXT: comment **delete/resolve** (own comment tombstone; author may remove — `cmt_update`/
  `cmt_delete` exist), and **Realtime** on the thread (a `comments` channel subscription so a
  new comment appears without reopening — mirror realtime.js message fanout). Then the other
  card-menu backends (Download, Copy link/`share_links`, Crosspost) or **Profile** writes
  (edit-profile, avatar/banner).

## 2026-08-24 — P5.13b Delete own comment (tombstone)
IN PROGRESS: (cleared)
DONE: a comment thread now lets you **remove your own comment**. `loadComments` returns a
  `mine` flag (`r.user_id === session().id`); `postComment` returns `mine:true`. New
  `deleteComment(id)` sets `deleted_at` (a tombstone, matching the schema column + the
  message-delete pattern, so the `is null` filter drops it) — `cmt_delete`/`cmt_update` RLS
  fence it to the comment's author (post-author removal exists in the policy but is left to a
  later pass). In `commentRow`, a `mine` comment gets a square `.iconbtn.cdel` (trash) revealed
  on row hover (and on keyboard focus, so it isn't mouse-only) and pushed to the right edge;
  deleting is optimistic on success, a rejection toasts. Demo seeds one own comment on q1
  (`dc0`, jax) so the affordance shows on open.
  Verified: `verify-feed.mjs` `post-details` extended — exactly the `mine` rows carry `.cdel`
  (others do not), and a delete removes one row (after → after−1). Feed/profile/explorer/
  gallery verifies GREEN both themes, zero app console errors. Screenshotted: trash shows only
  on the jax row, hover-revealed, names neutral.
NEXT: comment **Realtime** (a `comments` subscription so a new comment appears without
  reopening — mirror realtime.js message fanout; not in-sandbox verifiable). Then the other
  card-menu backends (Download, Copy link/`share_links`, Crosspost) or **Profile** writes
  (edit-profile: name/bio/pronouns, avatar/banner — `profiles` update is a plain client write,
  RLS `prof_update` = self only).
GOTCHA AO: Playwright clicks an `opacity:0` element fine (actionability checks layout box +
  visibility/display, not opacity), so the hover-reveal `.cdel` is testable without a hover.

## 2026-08-24 — P5.10b Edit profile (name / handle / bio — real write)
IN PROGRESS: (cleared)
DONE: the owner's **Edit profile** action (was a `toast("P5.10b")` stub) now opens the real
  modal (gallery `#epModal`, CANON §C.10) and writes the text fields. New `updateProfile
  ({name,handle,bio})` in data.js — a plain self-only `profiles` update (RLS `prof_update` =
  id === auth.uid()). Handle is validated (`^[a-z0-9_]+$`, @ stripped) and is globally
  UNIQUE, so a clash surfaces as **"That handle is taken"** (the constraint is the fence; the
  23505/unique/duplicate match covers PostgREST's error shapes). On success the hero repaints
  in place: the identity block was extracted to `whoKids(p)` so `Object.assign(p, vals)` +
  `who.replaceChildren(...)` reflects the new name/handle/bio (the bio row appears/disappears
  cleanly). **Avatar + banner are honest R2 markers** — "Change photo/banner" buttons that
  toast "needs the R2 upload env", the same gate as file uploads and Download; not fakes, per
  the build-the-real-thing principle. The svnote uses `#i-check` (no `i-info` in the sprite —
  an unknown icon would trip icons.js' dev warning, which the verify treats as an error).
  Verified: `verify-profile.mjs` +`edit-profile` — the modal opens from the owner action,
  editing name+bio and saving closes it and repaints the hero (name + bio), and an invalid
  handle ("no spaces!") keeps the modal open (rejected). owner-light/dark, shelf-switch,
  edit-profile all GREEN; feed/explorer/workspace/gallery GREEN both themes, zero app console
  errors. Modal screenshotted both themes (round avatar, @-prefixed handle, note, scrim/no
  shadow — matches the gallery).
NEXT: **avatar/banner** upload (when the R2 write env lands — reuse the upload signer path);
  **user settings** (the profile Settings tab, still `toast("P9")`) and **Search profile**
  (P5.15). Or the other card-menu backends (Download, Copy link/`share_links`, Crosspost), or
  comment **Realtime** (not in-sandbox verifiable).
GOTCHA AP: icons.js warns (console) on any `#i-*` not in the mounted sprite, and the verify
  harness counts console warnings as failures — so a new surface must only use icons that
  exist (grep the sprite / gallery first). `i-info` does not exist; `i-check` does.

## 2026-08-24 — P5.15 Search profile (inline shelf filter)
IN PROGRESS: (cleared)
DONE: the profile **Search** button (was a `toast("P5.15")` stub) now toggles an inline
  filter over the VISIBLE shelf — a client-side title narrow of what's already loaded, not a
  new query, so no backend call. The search `.iconbtn` swaps for a `.field.psearch` input
  (both right-aligned, one shown at a time); typing filters the masonry live, a non-matching
  query shows the `search`/"No results" empty state, and Esc (or re-toggling) clears the
  query + restores the full shelf. `state.query` gates `paint()`; the tab counts stay the
  shelf totals (correct — they count the shelf, not the filtered view). Switching shelves
  keeps the active query, so it narrows the newly-shown shelf too.
  Verified: `verify-profile.mjs` +`profile-search` — toggling reveals the field, "bloom"
  narrows the 5-card Public shelf to its matches (>0 and <total), a nonsense query shows the
  no-results state, and Esc restores all 5. All 5 profile cases GREEN; feed/explorer/
  workspace/gallery GREEN both themes, zero app console errors. Screenshotted (active filter).
NEXT: **user settings** (the profile Settings tab, still `toast("P9")`) is the last profile
  stub, but it's a whole P9 screen. Otherwise the remaining P5 write surfaces are owner-env-
  gated (avatar/banner, Download, upload-dependent Copy link) or not in-sandbox verifiable
  (comment Realtime). Natural next phase: **P7** (DMs · Friends · Notifications) or the P9
  utility screens (sign-in, create/join, 404, quick-switcher).

## 2026-08-24 — P5.14 Add / remove tags (+ menu-Escape scoping fix)
IN PROGRESS: (cleared)
DONE: the details-pane **Tags** are now editable (the "+" was a `toast("P5.9")` stub). New
  `addTag(workId,tag)` / `removeTag(workId,tag)` in data.js write `content_tags` (unique
  (work_id,tag)); tags are normalised (trim, drop a leading #, lowercase) so "Bridge" and
  "bridge" collapse, and a duplicate insert is an idempotent no-op success. `ct_write` RLS is
  the fence (author/admin or accepted collaborator). `tagsSection(w,ctx)` now renders when the
  work is **editable** (`ctx.menuItemsFor` — the same signal that gives an explorer file its ⋯
  menu) OR carries tags, so the first tag can be added to a tagless file; a public post stays
  read-only. The "+" swaps to an inline `.field` input (Enter adds, Esc cancels, blur commits
  non-empty), each editable chip carries the `Tag({removable})` × (hover-revealed), and writes
  are optimistic on the local `w.tags` then repainted.
  **Bug fixed en route:** `openMenu`'s Escape now `preventDefault()+stopPropagation()`s, so
  closing a menu no longer bubbles Escape to a parent surface's own handler — previously
  Escape inside the details-pane ⋯ menu closed the menu AND the whole sheet. (Flagged as a
  wart in P5.9d GOTCHA AK; now actually fixed. The primitives "Menu: Esc closes" case still
  passes — the menu still closes, it just doesn't leak the key.)
  Verified: `verify-explorer.mjs` `details-{light,dark}` extended — the editable file shows the
  add-tag +, opening it reveals the inline input, Enter appends a chip (3→4) and closes the
  input, and removing via a hover-revealed × drops it back to 3. 18 explorer cases GREEN; feed/
  profile/workspace/primitives(Menu)/gallery GREEN both themes, zero app console errors. Tag
  editor screenshotted (tags as coloured bold text, hover ×, inline add input).
NEXT: **share_links "Copy link"** needs the shared-view route (`/shared/:token` +
  `resolve_share_link`) built alongside it — a self-contained next feature (gallery #40). Then
  **Download**/avatar-banner upload (R2 env now set per owner — wire the signer path, verify on
  preview), or **P7** (DMs · Friends · Notifications).
GOTCHA AQ: `.tag .x` is `display:none` until `.tag.rm:hover` — Playwright can't click a
  zero-box element cold, so a test must `.hover()` the chip first, then click the ×.

## 2026-08-24 — P5.16 Share links (Copy link + the read-only /shared/:token viewer)
IN PROGRESS: (cleared)
DONE: "Anyone with the link" sharing, end to end. **Copy link** (was deferred in the card
  menu) is wired in BOTH the card ⋯ menu and the details-pane ⋯ menu: `createShareLink(workId)`
  mints a `share_links` token (URL-safe random; `share_write` RLS fences creation to who can
  write the work) and copies `shareUrl(token)` = `/shared/:token`; the clipboard write falls
  back to showing the URL in the toast when blocked (no gesture / permissions). **New screen**
  `app/screens/shared.js` (+ route `/shared/:token`, wired full-screen in main.js like signin —
  no shell, works signed-out): the read-only viewer shows ONLY the shared work — media, title,
  Shared-by / Type / Size / Access rows, tags, and a read-only lock note — with **no rail, no
  navigation**. It resolves the token via `loadSharedWork` → the anon `resolve_share_link` RPC
  (refuses revoked/expired/invalid → the "link is no longer active" dead state), then reads the
  author name + tags (the live link grants can_read_work). **No member hue** (anon /
  out-of-server context), consistent with the Feed.
  **Reuse, not duplication:** the full-viewer media dispatch (image / player / type-card) was
  extracted from details.js into an exported `fillMedia(mount,w)` (+ `typeCard`, `fmtBytes`)
  used by BOTH the details pane and the shared viewer — one place decides how a kind renders.
  CSS ported from the gallery (#40 `.sharedview`), and the meta/tags rows are the SAME
  `.sheet .meta/.dsec/.chips` rules **widened** to also match `.sharedview` (one definition,
  two scopes — no drift, no second selector).
  Verified: new `verify-shared.mjs` — the live file renders the standalone viewer (no rail,
  meta rows incl. Access, tags, lock note, neutral name) in both themes, and the "expired"
  token shows the dead state with no media. shared/explorer/feed/profile/workspace/gallery all
  GREEN, zero app console errors. Both states screenshotted vs the gallery (regenerable PNGs
  not committed).
NEXT: share **management** — revoke a link (`share_links.revoked_at`; `revoke_share_link` per
  CANON) and an expiry option, surfaced in a small Share dialog (gallery #39 has the Google-
  Drive share panel with a visibility control). Then **Download** / avatar-banner **upload**
  (R2 env now set per owner — wire the signer path, verify on preview), or **P7** (DMs ·
  Friends · Notifications).
GOTCHA AR: two same-named module-local helpers are NOT a clash — `explorer.js` `fmtBytes` and
  `cards.js` `typeCard` are private to their files; the EXPORTED ones live only in details.js.
  A cross-file grep flags them together; module scope keeps them independent.

## 2026-08-24 — P5.17 Share dialog (visibility + link management)
IN PROGRESS: (cleared)
DONE: the full **Share dialog** (gallery #39), opened from **Share…** in both the card ⋯ menu
  and the details ⋯ menu (the quick **Copy link** from P5.16 stays for the one-click path).
  Two real write surfaces: **Visibility** (a `VisibilitySeg` Public/Server/Private → `setVisibility`,
  `works.visibility` update fenced by `works_update`; the UI's "Private" maps to the DB noun
  **personal** via `visFromDb`/`VIS_TO_DB`) and **Anyone with the link** management — `loadShareLinks`
  lists the work's active tokens (share_read RLS: creator or work-writer), each row a readonly
  `/shared/:token` URL with **Copy** + **Revoke** (`revokeShareLink` → a `revoked_at` tombstone,
  so `resolve_share_link` then refuses it), plus **Create link** (`createShareLink`). To carry the
  current visibility, `visibility` was added to the explorer works `select` (both server + personal)
  and to `shapeWork`. Demo mutates the in-dialog link list optimistically (no network). CSS is three
  new scoped classes (`.sharelinks/.sharerow2/.sharenone`); the visibility control + modal reuse
  existing components.
  Verified: `verify-explorer.mjs` +`share-dialog` — Share… opens the dialog (title, the 3
  visibility options), the no-link state shows first, **Create link** adds one `/shared/` row, and
  **Revoke** removes it and restores the no-link state. 19 explorer cases GREEN; shared/feed/
  profile/workspace/gallery GREEN both themes, zero app console errors. Dialog screenshotted vs the
  gallery (visibility segment, link row, Create/Done).
NEXT: link **expiry** (a duration picker → `share_links.expires_at`) and the **People with access**
  collaborator rows (gallery #39 lower half — the consent-gated `work_collaborators` system, a
  bigger unit). Then **Download** / avatar-banner **upload** (R2 env is set — wire the signer path,
  verify on preview), or **P7** (DMs · Friends · Notifications).
GOTCHA AS: the visibility enum split — UI **Public/Server/Private** vs DB
  **public/server/personal**. Always map at the data boundary (`VIS_TO_DB`/`visFromDb`); never send
  "private" to Postgres (the check constraint rejects it) or show "personal" in the UI.

## 2026-08-24 — P5.18 Download (real R2 read path)
IN PROGRESS: (cleared)
DONE: **Download** is real (was an "needs the R2 read env" marker) — the env is set
  (R2_PUBLIC_BASE_URL = cdn.eski.lol). New `downloadWork(work)` in cards.js (beside mediaUrl):
  the object lives cross-origin on cdn.eski.lol where the `download` attribute is ignored, so
  it fetches the blob (R2's GET * CORS allows it) and saves via a blob URL, falling back to
  opening the URL directly if the fetch is blocked or the object is missing; a work with no
  stored bytes yet says so instead of 404ing. Wired the **details-pane** and **shared-viewer**
  Download buttons (dropped the details button's dangling chevron — single-file download needs
  no menu), and the **bulk-bar Download** (`downloadSelected` — each selected work with bytes;
  a true zip-as-one is a later enhancement).
  Verified: `verify-explorer.mjs` `details-*` — clicking Download on a bytes-less demo file
  runs `downloadWork` and surfaces the honest "no stored bytes yet" toast, zero console errors
  (the real R2 fetch is preview-verified, not in-sandbox). Full suite GREEN both themes.
NEXT: **P5.19 avatar/banner upload** (edit-profile "Change photo/banner" markers → the real
  sign→PUT→profiles.avatar_key path, reusing the upload signer), then avatars render from the
  key. After that, the last P5 gap is a true multi-file **zip** download. Or **P7** (DMs ·
  Friends · Notifications).
GOTCHA AT: a cross-origin `<a download>` (cdn.eski.lol ≠ app origin) is IGNORED by browsers —
  it navigates instead of saving with the filename. Must fetch → blob → objectURL to force the
  real filename; keep window.open as the fallback when the CORS fetch is refused.

## 2026-08-24 — P5.19 Profile photo upload (avatar → R2 → avatar_key)
IN PROGRESS: (cleared)
DONE: **Change photo** in edit-profile is a real upload (was an R2 marker). New shared
  primitive `app/upload-r2.js` — `uploadBlobs(files)` (hash → `/api/sign` presign → PUT →
  returns the content-addressed `key`), the small-file counterpart to the upload sheet's inline
  flow (kept separate on purpose — see the module header: the load-bearing post-upload path
  isn't preview-verified yet, so this doesn't refactor it). Picking a photo uploads it and
  writes `profiles.avatar_key` (`updateProfileImage`, self-only `prof_update` RLS); the new
  photo repaints in the dialog **and** the profile hero (via `onAvatar`). `avatarUrl(key)`
  (cards.js) builds the cdn URL; the **hero avatar now renders from `avatar_key`** (initials
  fallback). The shared `Avatar` component gained a load-error fallback (a 404'd photo degrades
  to initials, never a broken image). **Demo** previews the picked file locally (a blob URL, no
  R2) so it's useful for screenshots + testable offline. Change banner stays a marker until a
  hero banner render lands (its `banner_key` write path is ready via `updateProfileImage`).
  Verified: `verify-profile.mjs` `edit-profile` — the avatar starts as initials, **Change photo**
  is a real `<input type=file>` (not a stub), and `setInputFiles` (demo) turns the avatar into an
  `<img>`. All profile cases GREEN; explorer/shared/feed/workspace/gallery GREEN both themes, zero
  app console errors. Dialog screenshotted (picked photo round-cropped in the avatar).
NEXT: **banner** render (a hero banner strip → wire Change banner the same way) and render
  avatars from `avatar_key` on the **member rail / comments / cards** (loadProfile-style key on
  those shapes). Then a true multi-file **zip** download, or **P7** (DMs · Friends ·
  Notifications).
GOTCHA AU: the real R2 round-trip (sign + PUT) can't run in-sandbox (no egress), so the live
  photo upload is preview-verified; demo deliberately short-circuits to `URL.createObjectURL`
  so the picker + render path is still exercised offline.

## 2026-08-24 — P7.1a Messages screen + Friends panel (friends fully functional)
IN PROGRESS: (cleared)
DONE: the **Messages screen** (route `/messages` → `dms`, was a placeholder) is real — a
  two-pane shell: the **DM thread list** (`.dmlist`: pinned + direct, group threads show
  stacked avatars + a mute bell, presence dots on 1:1s) and a right pane that shows either a
  **conversation placeholder** (opening a thread → header + "live view lands in P7.2") or the
  **Friends panel**. Friends is fully wired: `loadDMsScreen()` reads friendships (ordered pair,
  the "other" user is whichever end isn't me) + dm_channels/dm_members, fetching profiles
  SEPARATELY into a byId map (bug-#1 embed hazard). Panel: **All** (accepted) / **Pending**
  (incoming + outgoing) tabs; **add by exact handle** → `add_friend` RPC (`addFriend`); an
  incoming request has **Accept/Decline** → `respond_friend` RPC (`respondFriend`, accept →
  friends, decline → row deleted); a friend row has **Message** → `create_dm` RPC (`createDM`,
  toasts "P7.2" for now since the conversation view isn't built). Optimistic UI, RLS is the
  fence. **NO member hue** (DMs/friends are outside any server). New: `app/screens/dms.js`,
  `demoDMs()` fixture, the ported `.dmlist/.friends/.frrow/.rbtn` CSS block in content.css,
  `main.js` dms handler, `verify-dms.mjs`.
  Verified: `verify-dms.mjs` — list renders (4 threads, group stacked avatars, Friends pending
  count); the friends flow (All=3, Pending=1+1, accept moves a request into All=4, add grows
  Outgoing) all GREEN both themes, zero app console errors. Screenshotted vs the gallery.
  profile/explorer/feed/gallery regression-checked GREEN.
NEXT (P7.2): the **DM conversation** — open a thread → load `dm_messages` (author profiles
  fetched separately), a composer that inserts a `dm_message` (RLS `dm_member`), and Realtime
  on the thread. Then wire the friend **Message** button + the DM-list rows to open it (they
  currently show the placeholder), and DM row ⋯ actions (pin/mute/hide via dm_members). Then
  **P7.3 Notifications** (route `/notifications`, still a placeholder; schema-07 + the
  notifications table/triggers exist). The `create_group_dm` RPC + the "New message" button
  (currently just opens Friends) are also pending.
GOTCHA AV: `friendships` is an ORDERED pair with `check (a_user < b_user)` and one row per
  pair — never assume "I'm a_user". `respond_friend` takes the OTHER user's id (target_id) and
  errors on answering your own request; the row is DELETED on decline (not a status change).

## Current state (updated 2026-08-24)
**Phase: build. Live app on `preview` through P7.1a.** This session shipped (all on
`preview.eski.lol`, branch `preview` fast-forwarded from `claude/eski-preview-deploy-h2pg6s`,
both at the same head): P5.9d details ⋯ menu · P5.13/13b post comments + delete · P5.10b edit
profile · P5.15 profile search · P5.14 tags · P5.16 share links + `/shared/:token` viewer ·
P5.17 share dialog (visibility + link mgmt) · P5.18 Download (real R2 read) · P5.19 profile
photo upload · **P7.1a Messages + Friends**. Two honest markers remain from P5.19: **Change
banner** (banner_key write path ready, needs a hero banner render) and rendering avatars from
`avatar_key` on the member rail / comments / cards (only the profile hero + DM/friend rows do
so far). Owner has done all external config (auth URL, Vercel env, R2 CORS/SMTP) — the real R2
round-trips (upload PUT, cdn fetch) can only be exercised on `preview`, not in-sandbox.
**Verify before committing:** `node docs/design/verify.mjs` (gallery) + the per-screen app
verifies (`verify-{workspace,explorer,feed,profile,shared,dms,primitives,live}.mjs`); `live`
needs real network (fails in-sandbox) and `primitives` has one known-flaky MediaPlayer
autoplay check — neither is a regression.

## 2026-08-24 — P7.2 DM conversation (open a thread · send · append)
IN PROGRESS: (cleared)
DONE: the **DM conversation** is live (was a placeholder). `loadDMThread(dmChannelId)` reads
  `dm_messages` (members read via `dmsg_read`), author profiles fetched SEPARATELY (bug-#1);
  `sendDM` inserts a `dm_message` (`dmsg_insert` = own + dm_member) and returns the shaped row
  so the stream appends without a refetch. `showConvo` now renders a real header + `.stream`
  (reusing the workspace `.msg/.stream/.composer` CSS) + a composer that sends on Enter/click,
  auto-scrolls, and clears; author names are **neutral** (no hue — DMs are outside any server).
  The DM-list rows and the Friends-panel **Message** button both open it (`createDM` returns
  the channel id → `showConvo`; demo uses a synthetic id → empty thread + composer). New:
  `demoDMThread()` fixture, `loadDMThread`/`sendDM`, `createDM` now returns the channel id.
  Verified: `verify-dms.mjs` +`conversation` — opening mira's thread loads 3 messages, the
  composer appends a 4th and clears, and the friend Message button opens a conversation with a
  composer. All dms cases + workspace GREEN, zero app console errors. Screenshotted.
NEXT (P7.2b/P7.3): DM **Realtime** (subscribe `dm_messages` on the open thread — mirror
  realtime.js channel fanout; not in-sandbox verifiable), DM row **⋯ actions** (pin/mute/hide
  via `dm_members`), DM **message actions** (reply/react/delete — the owner-deferred TODO), the
  **New message / group DM** flow (`create_group_dm`), then **P7.3 Notifications** (route
  `/notifications`, schema-07 + notifications table/triggers exist). Also the P5.19 markers:
  banner render + avatars-from-key on rail/comments/cards.

## 2026-08-24 — P7.3 Notifications (in-app list + mark-read)
IN PROGRESS: (cleared)
DONE: the **Notifications screen** (route `/notifications`, was a placeholder) is real.
  `loadNotifications()` reads the `notifications` table (notif_read = own), fetching actor
  profiles + server names SEPARATELY (bug-#1); the row text is built from `kind` (mention/
  comment/join/reaction/invite/friend) + the actor, with the `excerpt` as a quote and the
  server as context. Header with **All / Mentions** tabs + **Mark all read**; each row shows a
  kind icon, `<b>actor</b> text`, context, excerpt, time, and an **unread dot**; clicking a row
  (or its hover ✓) marks it read (`markNotifRead` → `read_at`), Mark all read clears every
  unread (`markAllNotifsRead`). Empty state when a tab has nothing. NO member hue. New:
  `app/screens/notifications.js`, `demoNotifications()`, the ported `.notif/.nrow` CSS,
  `main.js` handler, `verify-notifications.mjs`.
  Verified: `verify-notifications.mjs` — 5 rows / 3 unread both themes; Mentions tab filters to
  1; clicking an unread row drops the unread count; Mark all read → 0 unread. dms + gallery
  regression GREEN, zero app console errors. Screenshotted vs the gallery.
NEXT: DM/notification **Realtime** (subscribe inserts — not in-sandbox verifiable); the
  notification **bell** unread badge + a bell-dropdown preview; wiring a notification row to
  **navigate to its target** (needs target_type/target_id routing); DM row ⋯ (pin/mute/hide)
  and **group DM** creation; the P5.19 markers (banner render, avatars-from-key on rail/
  comments/cards). All P7 primary screens (Messages, Friends, DM conversation, Notifications)
  are now real — the remaining P7 work is Realtime + polish. State: live app on `preview`
  through **P7.3**; P0–P4 spine + P5 content + P7 social all shipped.
GOTCHA AW: Playwright element handles go STALE when the surface re-renders (a tab strip that
  `replaceChildren`s on click). Re-query by selector (`:has-text(...)`) between clicks instead
  of holding an array of handles — "Element is not attached to the DOM" is the tell.
