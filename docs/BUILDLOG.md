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
