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

**Phase: build. P0–P9 core all real on `preview` (2026-08-24). The app is feature-complete
end-to-end for the core product; what's left is Realtime, a few edge/admin surfaces, and
billing.** The freshest per-feature detail is in the dated entries below (newest last) — this
header is the map. Branches `preview` and `claude/eski-preview-deploy-h2pg6s` are kept at the
same head; `preview.eski.lol` deploys from `preview`.

What's REAL (wired to Supabase, verified by the per-screen `verify-*.mjs` in demo + offline
render; the R2 round-trips + live sends are preview-verified since the sandbox browser can't
egress):
- **Servers/workspace:** create · invite (`server_invites`) · join (`join_via_invite`) · leave ·
  create channel · channel settings (name/topic/slowmode/post-policy) · chat send/receive ·
  reactions (`toggle_reaction`) · reply-threads · edit · delete · pin · moderation (timeout/
  kick/ban) · role assignment (`set_member_roles`). Create-server is now the atomic
  `create_server` RPC (K5, 2026-08-29) — server + owner membership + @everyone role + channels
  in one SECURITY DEFINER transaction (was 4 non-atomic client inserts).
- **Files:** explorer (server + personal) · details pane (the one viewer) · upload (sheet +
  `api/sign.mjs` R2 PUT) · download (cdn fetch→blob) · move/trash/star/rename/hide/tags · share
  dialog (visibility + `share_links` create/revoke) + the read-only `/shared/:token` viewer.
- **Social:** feed · profile (shelves/POV/search/edit-profile + photo upload→`avatar_key`,
  rendered on hero/rail/chat/comments) · post comments (read/post/delete) · DMs (list · friends
  add/accept/decline · conversation send · pin/mute/hide · new/group DM) · notifications
  (list · mark-read · row→target nav).

What's NOT done: **storage/billing** (needs Stripe, ~P8); the full-screen Server-settings port (the
`/create` + `/s/:id/settings` routes are now largely vestigial — most actions moved to modals); UI
polish (P1–P5) + a couple of broken-UI items (B3 message permalink, B4 typed modal routes).

**Backend queue COMPLETE (2026-08-29, round-4).** The whole master-todo backend set (K1–K9) is done
and pushed to `preview`: B5 (channel Files tab + channel-upload chat visibility), K2 (server icon/
cover + profile banner RENDER — persistence was never broken), K7 (create_work upload RPC), K8
(write-reliability audit + post_comment RPC), K1 (preview_invite anon RPC), K5 (create_server RPC),
K4 (delete_server RPC + invite mgmt), K9 (folder sharing + request-to-join), K6 (realtime echo —
already wired, live-QA only). K3 (reports) deferred to D7 by the owner. Every write audited; the
load-bearing/at-risk ones are now SECURITY DEFINER RPCs. Advisors: no RLS-disabled/permits-all, no
ERROR-level; new RPCs carry only the expected `security_definer_function_executable` WARN. What's
left is the owner's **live QA on preview** (R2 round-trips, two-session realtime, real
request→approve) — the claims are in `docs/QA-CHECKLIST.md`.

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

## 2026-08-24 — P7.1b DM row actions (pin / mute / hide)
IN PROGRESS: (cleared)
DONE: DM thread rows gained a **⋯ menu** (and right-click) — **Pin/Unpin · Mute/Unmute ·
  Hide conversation** — wired to `setDMPref(dmChannelId, patch)` (a `dm_members` update fenced
  to your own row, `dmm_update`). The list **repaints** on change: pinning jumps a row into the
  Pinned section (pin marker), hiding drops it (the reversible "close DM"). The trailing cluster
  (`.dmtrail`: muted bell / pin marker + the hover-revealed `.more2`) replaced the ad-hoc
  trailing icon so there's no margin conflict. Demo mutates `data.dms` optimistically.
  Verified: `verify-dms.mjs` +`dm-actions` — the menu lists Pin/Mute/Hide, Hide removes a row,
  Pin adds a second pin marker. All 5 dms cases GREEN both themes, zero app console errors.
NEXT: DM/notification **Realtime** (subscribe inserts — not in-sandbox verifiable); **group DM**
  creation (`create_group_dm`) + the "New message" flow; notification **bell badge** + row→target
  navigation; the P5.19 markers (banner render is out of scope — the gallery profile has no
  banner design; avatars-from-key on member rail/comments/chat remains). Bigger: **P8** (admin:
  roles/permissions/moderation/billing) or **P9** (create/join/404/quick-switcher).

## 2026-08-24 — P7.1c New message / group DM
IN PROGRESS: (cleared)
DONE: the **New message** pen (was opening Friends) now opens a **friend picker** modal —
  checkbox rows of your accepted friends; **Start conversation** opens a 1:1 (`createDM`) for
  one pick or a **group DM** (`createGroupDM` → `create_group_dm` RPC) for several, then shows
  the conversation. Demo synthesises the channel id. New CSS `.nmlist/.nmrow`.
  Verified: `verify-dms.mjs` +`new-message` — the pen opens the picker (3 friends), picking one
  and starting closes it and opens a conversation with a composer. All 6 dms cases GREEN both
  themes, zero app console errors.
NEXT: DM/notification **Realtime** (not in-sandbox verifiable); notification **row→target
  navigation** + a bell entry/badge; the P5.19 **avatars-from-key** on member rail/comments/chat
  (banner render stays out of scope — no gallery design). Bigger pillars: **P8** (admin:
  roles/permissions/moderation/billing) · **P9** (create/join server, 404, quick-switcher).
  The Messages surface (list · friends · conversation · row actions · new message) is now
  feature-complete except Realtime + group-DM naming/settings.

## 2026-08-24 — P4.12 Channel message reactions (toggle + add)
IN PROGRESS: (cleared)
DONE: channel-message **reactions** are wired (the chip click + the smile hover button were
  `toast` stubs). `toggleReaction(messageId, emoji)` calls the `toggle_reaction` RPC (adds if
  absent, removes if present). `reactionsBar(msg)` in workspace.js manages `msg.reactions`
  ({emoji,n,mine}) and repaints: clicking a chip flips your own reaction (+1/.on ⇄ -1, chip
  drops at 0), and the **smile hover button** opens a small emoji picker that adds one. Reuses
  the existing `.react`/`.react.on` CSS. Optimistic — the RPC is fire-and-forget.
  Verified: `verify-workspace.mjs` +`reactions` — toggling a demo chip adds mine (+1, .on) and
  the smile picker appends a new chip. All workspace cases GREEN both themes, zero app console
  errors.
NEXT: message-reaction **Realtime** + who-reacted tooltip; the owner-deferred **DM/thread
  message actions** (reply/react/⋯) stay deferred. Backend-blocked: **P9 create/join server**
  needs a `create_server`/`join` RPC (none exists — a migration + Supabase MCP apply, not an
  in-sandbox job). Buildable next without new backend: notification **row→target navigation**,
  the P5.19 **avatars-from-key** (member rail/comments/chat — invisible in demo, live-only),
  or **P8 moderation** if its kick/ban/timeout RPCs exist (check first).

## 2026-08-24 — P4.13 Channel message ⋯ actions (Delete + Pin)
IN PROGRESS: (cleared)
DONE: the channel message ⋯ menu's **Delete** and **Pin to channel** were `toast` stubs; both
  are real now. `deleteMessage(id)` tombstones (`messages.deleted_at`, `msg_update` = own or
  moderator) and the row is removed from the stream optimistically; `pinMessage(id)` calls the
  `pin_message` RPC (perm-gated server-side). **Edit** and **Copy link** stay honest markers
  (inline edit UI + message permalinks are P4.13-follow / need a permalink route).
  Verified: `verify-workspace.mjs` +`msg-menu` — the ⋯ menu lists Pin/Copy link, and Pin fires
  clean. All workspace cases GREEN both themes, zero app console errors.
NEXT: message **inline edit** + **permalinks**, pin **Realtime**/pins-panel refresh. The larger
  backend-blocked pillars remain (**P9 create/join** needs new RPCs; **P8 moderation** RPCs
  exist — ban/kick/timeout/set_member_roles — but need the member-popover/settings UI wired,
  a good next chunk). Plus the deferred DM/thread message actions and P5.19 avatars-from-key.

## 2026-08-24 — P8.1 Member moderation (Timeout / Kick / Ban)
IN PROGRESS: (cleared)
DONE: the members-rail **admin menu** (was Timeout/Kick `toast` stubs) now runs the real admin
  RPCs, perm-gated server-side: **Timeout** opens a duration picker (5m/1h/1d/1w) →
  `timeout_member(until)`; **Kick from server** and **Ban from server** open a danger confirm
  (reason field, audit-log note) → `kick_member` / `ban_member`, then drop the member's row
  from the rail optimistically. `data.server.id` + the member's `p.id` target the RPC. **Manage
  roles** stays a marker (needs the server role list loaded — P8.5). Added `id` to the demo
  authors so member rows carry `data-uid` (the menu only shows for a non-you member with an id).
  Verified: `verify-workspace.mjs` +`moderation` — clicking a member opens the menu (Timeout/
  Kick/Ban), Kick opens a confirm modal, confirming drops the row. All workspace cases GREEN
  both themes, zero app console errors.
NEXT: **P8.5 Manage roles** (load the server's roles → `set_member_roles` checklist) and the
  **Server settings** screens (general/roles/moderation/channels — many are gallery panels not
  yet ported), the audit log view. Also still: DM/notification **Realtime**, message inline
  edit/permalinks, P9 create/join (needs new RPCs), P5.19 avatars-from-key.

## 2026-08-24 — P7.3b Notification row navigation
IN PROGRESS: (cleared)
DONE: clicking a notification row now **navigates to its target** (and marks it read). A
  best-effort `href` is computed in `shapeNotif` (`notifHref`): a friend request → `/messages`,
  any server-scoped event → `/s/{server_id}`; exact channel/message/post permalinks come with
  permalink routing later (null = mark-read only, no nav). The row's ✓ still marks read WITHOUT
  navigating (stopPropagation). Demo notifications carry explicit hrefs.
  Verified: `verify-notifications.mjs` `read-flow` updated — the ✓ marks a row read, Mark all
  read clears all, and clicking a row navigates to `/s/lb`. All notifications cases GREEN both
  themes, zero app console errors.
NEXT: exact permalink targets (channel/message/post) once a permalink route exists; a bell
  entry/badge in the rail. Remaining: Realtime (DM/notif/reaction), message inline edit, P8.5
  role assignment + server settings screens, P9 create/join (new RPCs), P5.19 avatars-from-key.

## 2026-08-24 — P8.5 Manage roles (assign server roles to a member)
IN PROGRESS: (cleared)
DONE: the members-rail **Manage roles** action (was a marker) opens a **checklist** of the
  server's assignable (non-default) roles, pre-checked for the member's current ones → Save
  runs `set_member_roles(server_id, target_user, role_ids)` (manage_roles-gated server-side).
  `loadServerBundle` now derives `serverRoles` (non-default {id,name,color}) and each member's
  `roleIds` from the `member_roles→roles` embed (a real FK, so the embed is fine); both flow
  into the workspace data + member shapes. Role colour swatches are **square** (`.rsw` --r —
  round is avatars/dots only). Demo seeds 3 roles (Producer/Vocalist/Mixer) + a member's roleIds.
  Verified: `verify-workspace.mjs` `moderation` extended — Manage roles lists the 3 roles,
  toggling + Save closes the modal; the Kick flow still drops the row. All workspace cases GREEN
  both themes, gallery GREEN, zero app console errors.
NEXT: **Server settings** screens (general/roles-editor/moderation/channels — gallery panels
  not yet ported; a roles *editor* to create/rename/recolour roles + set permissions is the big
  one), the **audit log** view. Also outstanding: DM/notif/reaction **Realtime**, message inline
  edit/permalinks, **P9 create/join** (needs new RPCs), P5.19 avatars-from-key.

## 2026-08-24 — P4.13b Inline message edit
IN PROGRESS: (cleared)
DONE: the message ⋯ **Edit** (own message) is real — it swaps the `.tx` body for an inline
  input; **Enter** saves (`editMessage` → `messages.body` + `edited_at`, `msg_update` = own) and
  re-renders via `renderBody` with the **(edited)** marker; **Esc**/empty restores. Uses the same
  `renderBody` path as a live Realtime edit, so they stay consistent. Added a jax-authored demo
  message (m6) so own-message actions (Edit/Delete) are exercisable. New `.editinput` CSS.
  Verified: `verify-workspace.mjs` +`msg-edit` — Edit swaps in an input, Enter renders the new
  body + (edited), and Delete then removes the row. All workspace cases GREEN, gallery GREEN,
  zero app console errors.
NEXT: message **permalinks** (Copy link — needs a permalink route + jump-to-message); **Realtime**
  for DM/notif/reactions/edits (not in-sandbox verifiable); **Server settings** screens + roles
  editor + audit log (P8 remainder); **P9 create/join** (needs new RPCs); P5.19 avatars-from-key.
  The channel message surface (send · react · reply-thread · edit · delete · pin · moderate ·
  roles) is now feature-complete except permalinks + Realtime edit/delete echo.

## 2026-08-24 — P5.19b Avatars render from avatar_key (member rail · chat · comments)
IN PROGRESS: (cleared)
DONE: closes the P5.19 gap — an uploaded profile photo (`profiles.avatar_key`) now renders
  **everywhere a person appears**, not just the profile hero + DM/friend rows. `loadServerBundle`
  fetches `avatar_key` and carries it on each member; `shapeMessage` puts it on the message
  author; `loadComments` puts it on the comment author. Render sites swapped to `Avatar({src:
  avatarUrl(...)})`: the **members rail**, **chat message** avatars, and the **details-pane
  comment** avatars (was initials-only). The shared `Avatar` load-error fallback (P5.19) means a
  missing/404 photo degrades to initials, so demo (no keys) is unchanged — initials as before.
  Verified: full app suite (workspace/feed/profile/explorer/dms/notifications/shared) + gallery
  GREEN both themes, zero app console errors — the no-regression check, since demo carries no
  keys; the real photos are preview-verified.
NEXT: the remaining work is Realtime (DM/notif/reaction/edit echo — not in-sandbox verifiable),
  message **permalinks** + Copy link, **Server settings** screens + roles editor + audit log
  (P8 remainder), and **P9 create/join server** (blocked on new `create_server`/join RPCs — a
  migration job, not in-sandbox). Core product surfaces (feed · explorer · details · profile ·
  upload/download · sharing · workspace chat w/ reactions/edit/moderation/roles · DMs · friends ·
  notifications) are all real on `preview`.

## 2026-08-24 — P8.2 Create channel
IN PROGRESS: (cleared)
DONE: **Create channel** (was a `toast("P8")` stub in the channel-column ＋ and Settings) is
  real. `createChannel(serverId, name, kind)` is a direct `channels` insert (fenced by
  `ch_write` = manage_channels), name normalised to a handle (lowercase, dashes), unique-name
  clash surfaced. `createChannelFlow` opens a name modal → creates → navigates into the new
  channel (demo toasts, since its channel set is fixed). The **voice** group ＋ toasts "ships
  in v2" (consistent with the WIP voice treatment).
  Verified: `verify-workspace.mjs` +`create-channel` — the ＋ opens the name modal, submitting
  closes it. All workspace cases GREEN both themes, zero app console errors.
NEXT: **Edit/Channel settings** (rename/topic/slowmode/post-policy — a `channels` update),
  channel **reorder persistence** (reorder_channels RPC), the rest of **Server settings**
  (general/roles editor/moderation/audit log), profile **Message → DM** + Posted-by nav (small
  client wireups). Untestable/blocked as before: Realtime, permalinks, P9 create/join (new RPCs).

## 2026-08-24 — P7.4 Profile social actions (Add friend / Message)
IN PROGRESS: (cleared)
DONE: the profile hero's POV actions were toast stubs — **Add friend** (public POV) now calls
  `addFriend(p.handle)`; **Message** (mutual POV) calls `createDM(p.handle)` then navigates to
  `/messages`. Owner POV (Edit profile) is unchanged. NOTE: the app's demo profile is always
  owner-POV, so these two buttons aren't reachable in demo — verified only as no-regression on
  the owner profile; the real flows are preview-verified (a public/mutual-POV demo profile would
  be needed to click-test them, deferred as low value).
NEXT: a public/mutual-POV demo profile to exercise Add friend/Message; Posted-by → profile nav
  (needs `handle` on the who-shape); the remaining Server-settings/channel-settings surfaces;
  and the standing untestable/blocked set (Realtime, permalinks, P9 create/join RPCs).

## 2026-08-24 — P8.3 Channel settings (name / topic / slowmode / post-policy)
IN PROGRESS: (cleared)
DONE: the channel-row **edit gear** (admin, was `toast("P8")`) opens a **Channel settings**
  modal — rename, topic, **slow mode** (Off/5s/10s/30s/1m/5m) and **who can post**
  (Everyone/Admins only) → `updateChannel(id, patch)` (direct `channels` update, `ch_write` =
  manage_channels; name normalised, unique clash surfaced). The channel shape now carries
  topic/slowmode/postPolicy (added to the `loadServerBundle` select + channelGroups). Live
  navigates to refresh the header; demo toasts. Gear is text-channels-only now (voice is v2).
  Verified: `verify-workspace.mjs` +`channel-settings` — the gear opens the modal (with the
  slow-mode + post-policy selectors), renaming + Save closes it. All workspace cases GREEN both
  themes, zero app console errors.
NEXT: channel **reorder persistence** (`reorder_channels` RPC — the drag UI exists in the
  gallery), the broader **Server settings** screen (general/roles editor/moderation/audit log),
  storage/billing. Standing untestable/blocked: Realtime, permalinks, P9 create/join (new RPCs).
  Server-management is now substantial: create channel · channel settings · member
  timeout/kick/ban · role assignment.

## 2026-08-24 — P9.1 Create + Join server (client-side, no new RPC)
IN PROGRESS: (cleared)
DONE: the single biggest product gap — **you can now create and join servers** — closed WITHOUT
  new backend. Key insight: `has_perm()` grants the server **owner** (owner_id) every permission,
  so a create can be done as a sequence of client inserts each passing its own RLS:
  `createServer(name, channels)` inserts the **server** (servers_insert = owner) → **owner
  membership** (sm_insert = is_server_admin, true for the owner) → the **@everyone default role**
  (permissions = `everyone_perms()` = **113664**, inlined) → **starter channels** (ch_write =
  owner). `joinServer(link)` extracts the code from a pasted link and calls the existing
  `join_via_invite` RPC. Both clear the workspace cache so the rail re-reads. Wired from the rail
  **＋ menu**: Create server (name + comma-separated starter channels) and Join by link (invite
  input) modals → on success navigate into the server (demo toasts, since its server set is
  fixed); "Add friend" now routes to /messages. NOTE: create is 4 non-atomic inserts — a
  mid-sequence failure (owner's own network only) would leave a partial server; a future atomic
  `create_server` RPC would harden it (documented in the code).
  Verified: `verify-workspace.mjs` +`server-create-join` — the ＋ menu opens both modals, filling
  + submitting closes each. feed/dms/explorer/gallery regression GREEN (shell.js is shared),
  zero app console errors. Create modal screenshotted (works end-to-end in demo).
GOTCHA AX: shell.js ALREADY imported `isDemo` and defined `withDemo` — my additions duplicated
  both → "Identifier 'isDemo' has already been declared" (a hard pageerror blanking the rail).
  Always grep the target module for a name before importing/defining it (the repo's #1 rule).
NEXT: server **icon/cover** upload on create (R2, like avatars); an in-app **invite-link**
  create/copy (create_invite — the reverse of join); the `/create` full-screen route is now
  vestigial (the ＋ uses a modal). Standing: Realtime, permalinks, storage/billing, audit log.
  **The core product is now feature-complete end-to-end** on `preview`: create/join servers ·
  channels + settings · chat (send/react/reply/edit/delete/pin) · moderation + roles · files
  (explorer/details/upload/download/share) · feed · profile · DMs · friends · notifications.

## 2026-08-24 — P9.2 Create invite link (completes the create→invite→join loop)
IN PROGRESS: (cleared)
DONE: the server menu's **Invite people** (was a `toast` stub) now mints a real invite:
  `createInvite(serverId)` inserts a `server_invites` row (si_insert = admin) with a URL-safe
  code, and copies the `/join/:code` link (clipboard-blocked → the URL shows in the toast).
  That link is consumed by `joinServer` → `join_via_invite` (P9.1) — so the full loop is now
  real: **create a server → generate an invite → someone joins by it.**
  Verified: `verify-workspace.mjs` +`invite` — the server menu opens, Invite people surfaces a
  `/join/` link toast. All workspace cases GREEN both themes, zero app console errors.
NEXT: an invite **management** surface (expiry/max-uses/revoke — the columns exist); **Leave
  server** (still a stub — needs owner-can't-leave handling); server **icon/cover** upload (R2).
  Standing untestable/deferred: Realtime, permalinks, storage/billing, audit log, the
  vestigial `/create` full-screen route.

## 2026-08-24 — P9.3 Leave server
IN PROGRESS: (cleared)
DONE: the server menu's **Leave server** (was a `toast` stub) is real — a confirm modal →
  `leaveServer(serverId)` deletes your own `server_members` row (`sm_delete` = own) → back to the
  Feed (cache cleared so the rail drops the server). **Owners are guarded**: `loadWorkspace` now
  returns `isOwner` (activeServer.owner_id === me), and an owner is steered to "delete it from
  Server settings" rather than orphaning a server they own.
  Verified: `verify-workspace.mjs` +`leave-server` — the server menu opens, Leave opens a confirm,
  confirming closes it. All workspace cases GREEN both themes, zero app console errors.
NEXT: **Delete server** (owner, type-to-confirm — needs a servers-delete path / RPC check),
  invite **management** (expiry/max-uses/revoke), server **icon/cover** upload. Standing:
  Realtime, permalinks, storage/billing, audit log. Server lifecycle is now real end-to-end:
  create · invite · join · leave · (+ channels, settings, moderation, roles).

## 2026-08-24 — P9.4 404 / not-found screen
IN PROGRESS: (cleared)
DONE: an unknown route (router `NOT_FOUND`) now renders a proper **404** (was the generic
  ported-screen placeholder) — a standalone centered card (gallery #e404): "404 · Page not
  found" + a **Go to your feed** button. Full-screen, no shell (`app/screens/notfound.js`,
  wired in main.js next to signin). Verified by smoke test — an unmatched path renders the 404
  heading + button, zero app console errors.
NEXT: **Delete server** (owner type-to-confirm), **invite management** (expiry/revoke), server
  **icon/cover** + profile **banner** uploads. Standing: Realtime, permalinks, billing, audit log.

## 2026-08-24 — P9.5 Delete server (owner, type-to-confirm)
IN PROGRESS: (cleared)
DONE: the server menu now offers **Delete server** to the owner (was Leave-only). `deleteServer
  (serverId)` deletes the `servers` row (servers_delete = owner_id; FK cascades wipe members/
  channels/works/invites) behind a **type-to-confirm** — the Delete button stays disabled until
  the exact server name is typed. Non-owners still get **Leave server**. Demo now sets
  `isOwner:true` (jax owns Late Bloom), so the demo exercises the owner path.
  Verified: `verify-workspace.mjs` `delete-server` — the menu offers Delete server, the button is
  disabled until the name matches, then confirming closes the modal. All workspace cases GREEN
  both themes, zero app console errors. The owner's full server lifecycle is now real: **create →
  invite → (others join) → settings/moderation/roles → delete.**
NEXT: invite **management** (list/expiry/revoke — `server_invites` read+update exist); server
  **icon/cover** + profile **banner** uploads (R2); a quick-switcher (⌘K). Standing: Realtime,
  permalinks, billing (Stripe), audit log.

## 2026-08-24 — P8.4 Server notification settings
IN PROGRESS: (cleared)
DONE: the server menu's **Notification settings** (was a `toast` stub) opens a real modal —
  **notify level** (All messages / Only @mentions / Nothing) + **suppress @everyone/@here** →
  `setServerPrefs(serverId, {level, suppress_everyone})` (upsert `server_prefs`, sp_all = own).
  `loadServerPrefs` pre-fills the current values on open (live).
  Verified: `verify-workspace.mjs` +`notif-settings` — the menu opens the modal (level selector
  + suppress toggle), toggling + Save closes it. All workspace cases GREEN both themes, zero app
  console errors.
NEXT: channel-level notif prefs (`channel_prefs`); invite management; icon/cover/banner uploads.
  Standing: Realtime, permalinks, billing, audit log. The server menu is now fully wired
  (settings · invite · notification settings · leave/delete).

## 2026-08-25 — P9.1 quick-switcher (⌘K) · P9.2 message permalinks · P9.3 invite management
IN PROGRESS: (cleared)
DONE (three chunks, all GREEN in demo, both themes, zero app console errors):
  - **P9.1 quick-switcher (⌘K / Ctrl-K)** — commit `639da24`. A global capture-phase key handler
    (main.js, gated to signed-in/demo) opens `screens/switcher.js`: an overlay filtering the four
    standard destinations + your servers + friends; ↑/↓/Enter/Esc, a second press toggles it shut,
    and any nav (renderRoute → closeSwitcher) closes it. `loadSwitcher()` feeds it (demo + live via
    the rail + friendships). `.qs` CSS z-index 92. Verify: `verify-switcher.mjs`.
  - **P9.2 message permalinks** — commit `f5bdc6a`. A message's **Copy link** builds a canonical
    `…/c/<ch>?m=<id>` permalink and copies it; arriving there scrolls the message into view + runs a
    one-shot background pulse (`shell.css .msg.flash`), driven by `workspaceView.focusMsg`. Also
    consolidated the four ad-hoc `navigator.clipboard` writes onto one `ui.js copyToClipboard()`
    (same blocked-write→toast-the-url fallback). Verify: `verify-workspace` permalink-arrival + copy-link.
  - **P9.3 invite management** — commit `8bbbb11`. **Invite people** now opens the gallery's
    `#inviteModal` (was a one-shot copy): lists active links (`loadInvites`, admin-only si_read),
    each with a usage/expiry line + Copy + Revoke (`revokeInvite` → si_delete); a new link is minted
    with expiry + max-uses (`createInvite` writes `expires_at`/`max_uses`, the columns
    `join_via_invite` already enforces). `demoInvites` = 2 fixtures. Verify: `verify-workspace` invite
    (list → create → revoke → close).
NEXT: server **icon/cover** + profile **banner** uploads (R2; note the banner still has no gallery
  panel); **audit log**; the gallery's invite-by-handle + suggested-people rows (deferred — needs a
  friends-not-in-server query + an invite-to-user notification RPC, untestable in-sandbox). Standing:
  **Realtime** (DM/notif/reaction/edit echo, untestable offline), **billing** (Stripe).

## 2026-08-25 — P9.4 server icon/cover · P9.5 profile banner
IN PROGRESS: (cleared)
DONE (both GREEN in demo, both themes, zero app console errors):
  - **P9.4 server settings (icon + cover)** — commit `20fba9a`. The server menu's **Server settings**
    (admin) opens a real modal (was a route to the vestigial `/settings`): name + a square **icon**
    and a wide **cover**, both R2 uploads (`uploadBlobs → updateServer(icon_key/cover_key)`, fenced
    by `servers_update`; only changed keys written). `loadRail` + `loadServerBundle` now carry
    `icon_key/cover_key`, and the **rail badge + channel-column header render the uploaded icon**
    (square, --r, initials fallback on load error). Ported gallery `.coverpick/.cv/.frow`. Verify:
    `verify-workspace` server-settings (modal + pickers + local image preview + rename).
  - **P9.5 profile banner** — commit `a12c910`. Edit-profile's **Change banner** (a toast stub) is now
    the gallery `.epbanner` well: previews `banner_key` and uploads a new one
    (`uploadBlobs → updateProfileImage("banner_key")` — write path already existed). `loadProfile`
    returns `banner_key`. NB the gallery renders **no banner on the profile hero**, so the well is
    where it lives; a hero render can follow if a design lands. Verify: `verify-profile` edit-profile
    (well starts empty → fills on pick).
NEXT: **audit log** (needs a backend table/trigger — check schema first); the create-server modal's
  optional **icon** field (gallery ~L3057); invite **by-handle** + suggested people (needs a
  friends-not-in-server query + invite-to-user notification RPC). Standing: **Realtime** (echo,
  untestable offline), **billing** (Stripe). Live R2 round-trips (icon/cover/banner/photo) are
  preview-verified — the sandbox browser can't egress to R2, so demo previews locally (blob URL).

## 2026-08-28 — tooling: SessionStart git-freshness hook
IN PROGRESS: (cleared)
DONE: `.claude/hooks/session-start.sh` + `.claude/settings.json` (commit 6b3eb4f).
  A SessionStart hook that fetches origin and **fast-forwards the checked-out branch
  to its true remote tip** before the agent reads anything, then prints that tip so
  it lands in context. Fixes the recurring cold-start hazard where a cloud session is
  cloned from a STALE ref and builds on old history (this session was cloned at the
  08-23 commit while `origin/preview` was at 08-25 `a4250d7`, and a naive push
  collided). Fast-forward ONLY — never touches a dirty tree, unpushed commits, or a
  diverged branch (warns instead); remote-only (`CLAUDE_CODE_REMOTE`); non-fatal
  offline. Validated all five paths (up-to-date / behind→FF / ahead / diverged /
  dirty / non-remote). Takes effect for any session that clones a branch carrying it
  — it's on `preview` now; merge `preview→main` to cover sessions that start on the
  default branch.
DOC RECONCILE: **P9.6** (create-server optional icon/cover, `71aa073`) and **P9.7**
  (audit-log admin modal, `a4250d7`) shipped in code but were not logged — noting here
  so the map is honest. See those commit messages for detail.
NEXT: unchanged from the entry above — invite by-handle + suggested people is the next
  self-contained, offline-verifiable feature; Realtime echo + billing remain standing.

## 2026-08-28 — Sign in with Google (OAuth) + magic-link fallback
IN PROGRESS: (cleared)
DONE (both themes, zero app console errors): a **Continue with Google** button now
  leads the sign-in screen, with the magic-link email demoted to a fallback under an
  "or" divider. Google is the preferred path because it has no email round-trip, so it
  dodges the built-in mailer's rate limit (owner hit it). `signInWithGoogle()`
  (supabase.js) calls `supabase.auth.signInWithOAuth({provider:'google', redirectTo:
  origin})`; `detectSessionInUrl` already completes the session on return. The brand
  "G" is inlined as its own 4-colour SVG (NOT via the mono icon sprite) — a
  third-party logo is the recognised tokens-only exception (cf. the one `#fff` in
  `.btn.danger`) and it lives only on this auth screen. Styles: `.oauthbtn` + `.ordiv`
  in shell.css. All landing CTAs already route to `/signin`, so this is the single
  entry point.
OWNER: the Google provider is enabled in Supabase (owner). Still confirm, in **Supabase
  Auth → URL Configuration**, that the site URL / allowed redirect URLs include
  `https://preview.eski.lol` (and prod) so the OAuth return lands back in the app — same
  list the magic link needs (OWNER-TODO). The Google Cloud OAuth client's authorized
  redirect URI must point at the Supabase `/auth/v1/callback` (part of "enable Google").
NEXT: polish pass — icon-button bounding-box / hover-target alignment (owner noticed
  slight offsets revealed on hover). Then invite by-handle; Realtime echo + billing standing.

## 2026-08-28 — polish: icon-button hover boxes misaligned (global root-cause fix)
IN PROGRESS: (cleared)
DONE: fixed the owner-reported bug — an icon button's hover background sat ~2px off
  its glyph. ROOT CAUSE (one global miss, not per-screen): the mandatory `button`
  reset in base.css zeroed background/border/color/font but NOT **padding**, so every
  button that sets no padding of its own inherited the UA default `1px 6px`. On a
  fixed-size, grid-centred icon button (`.iconbtn`/`.cgadd`/`.cgear`/`.more2`) that
  asymmetric padding shrank the content box and pushed the centred glyph right, so the
  `:hover`/`:active` box no longer aligned to the icon. Added `padding:0` to the reset —
  fixes EVERY icon button at once. Two buttons were sized ONLY by that UA padding, so
  they got explicit boxes: `.composer .field .snd` (send) is now a real 26px grid box;
  the DMs "Add by username" `+` became a proper `.iconbtn`. `.btn`/`.menu button`/
  `.cbar .fbtn` etc. set their own padding, unaffected. VERIFIED by a measurement scan
  (icon-centre vs button-centre across workspace/dms/explorer/profile/feed/notifications:
  was 11+5+2+1 offenders → now ZERO, all |dx|,|dy| < 0.6px) plus the full verify suite
  green in both themes (workspace/feed/explorer/dms/notifications/profile/switcher/shared
  + primitives — its play/pause flake per GOTCHA K passes on re-run).
GOTCHA P: the `button` reset MUST keep `padding:0`. The UA default `1px 6px` silently
  de-centres every icon-only button (hover box drifts off the glyph) and shrinks bare
  buttons vertically. Any icon button relies on this reset for its box; give a bespoke
  icon button an explicit `width/height` + `display:grid;place-items:center` rather than
  leaning on UA padding for size.
NEXT: invite by-handle + suggested people (next self-contained feature); Realtime echo +
  billing standing.

## 2026-08-28 — P9 invite by handle + suggested people
IN PROGRESS: (cleared)
DONE: the invite modal now invites a specific person, not just a link — matching the
  gallery invite modal (LAW). Backend (migration `p9_invite_user_to_server`, applied +
  committed as `schema-18-invite-user.sql`): `alter notifications add target_ref text` +
  a SECURITY DEFINER `invite_user_to_server(p_target,p_server)` — admin-gated, mints a
  single-use 7-day `server_invites` code and drops an `invite` notification carrying the
  server NAME in `excerpt` (the invitee can't read `servers` pre-join) and the CODE in
  `target_ref`. Reuses the tested join path: the notification links to `/join/<code>` →
  join_via_invite. Round-trip tested via the Supabase MCP (happy path + all three gate
  rejections); security advisor clean (no rls-disabled/permit-all; the fn is the accepted
  authenticated-executable RPC posture). Data layer (data.js): `loadInviteCandidates`
  (my accepted friends not already in the server — pure client query over friendships +
  server_members), `inviteUserToServer`, `inviteByHandle` (resolves a @handle via
  profiles), and `shapeNotif`/`notifHref` route an invite to `/join/<target_ref>` with
  the server name from `excerpt`. UI (workspace.js `inviteFlow`): an "Or invite by handle"
  `@handle` field + a `.shareppl` list of suggested friends (avatar · neutral-bold name ·
  @handle · Invite) — names stay NEUTRAL (member hue is server-scoped, a non-member has
  none). New `.shareppl/.sharerow` CSS ported from the gallery. Verify: verify-workspace
  invite case extended (field + 3 suggested + Invited flip + toast) and verify-notifications
  (+1 invite row showing its server) — both GREEN, both themes.
GOTCHA Q: the invitee is NOT a member when the invite notification lands, so they can't
  read `servers` (servers_read = owner/member) — carry the server NAME on the notification
  itself (`excerpt`), never resolve it from a `servers` join for an invite row. Same reason
  the invite links to `/join/<code>` (RLS-allowed join path), never `/s/<id>` (denied).
NEXT: Realtime echo (DM/notif/reaction/edit — untestable in-sandbox); billing (Stripe).

## 2026-08-28 — profile identity: real handle everywhere · create-profile onboarding · propagation
IN PROGRESS: (cleared)
DONE: fixed three related profile-identity bugs the owner hit.
  1. **Changing username broke profile links.** ROOT CAUSE: `me.handle` was hardcoded to the
     EMAIL PREFIX (`user.email.split("@")[0]`) in ~7 places, but the real handle lives in
     `profiles`. So the avatar-menu "Profile" link + the feed "You" tab pointed at
     `/u/<emailstem>`, which stops resolving the moment the handle differs from the email
     stem (i.e. as soon as you set a username) → the profile 404s. FIX: `loadRail` now also
     fetches the user's own `profiles` row and builds the canonical `me` via `meFor(user,
     prof)` (handle/name from the row; email stem only as a last-resort fallback), cached and
     read by every screen. Editing your handle also `history.replaceState`s the current
     `/u/<old>` to `/u/<new>` so the page you're on stays valid (external old links still
     break — inherent to handle URLs; the edit field says so).
  2. **No profile-creation page.** A fresh Google/magic-link account has NO `profiles` row
     (no signup trigger — confirmed via SQL). Added `screens/onboard.js` (create-profile:
     username + optional display name → `createProfile` UPSERT under prof_insert/prof_update)
     and a `needsProfileSetup()` gate in `main.js` that renders it before any in-app route
     until a handle exists. Verify: new `docs/design/verify-onboard.mjs` (green both themes).
  3. **Profile updates didn't propagate.** Writes now `clearWorkspaceCache()` (updateProfile,
     updateProfileImage) so the cached rail `me` + `_cache.servers` member rows refresh, and
     the edit-profile modal calls the new `router.reload()` on close when anything persisted —
     rebuilding hero + rail avatar + bylines from fresh data instead of only the in-dialog
     preview. Also fixed the optimistic comment/DM echoes that showed your name as the email
     stem (now the cached real name). Photo/banner upload path itself was already correct
     (uploadBlobs → avatar_key → avatarUrl); it just needs the owner's R2 CORS/env (OWNER-TODO).
  All screen verifies green, both themes.
GOTCHA R (DO NOT UNDO): the signed-in `me.handle`/`me.name` MUST come from the `profiles`
  row (via `meFor`/`loadRail`), NEVER `user.email.split("@")[0]`. The email stem is a
  fallback for a pre-onboarding account only. Reverting any `me = {…}` back to the email stem
  re-breaks self profile links (`/u/:handle`) the instant a user picks a username. There is
  no signup trigger, so `hasProfile` gates onboarding — keep it.
GOTCHA S: a profile write must invalidate identity caches — call `clearWorkspaceCache()` in
  any function that mutates `profiles` (name/handle/avatar/banner), and re-render the shell
  (`router.reload()`) so the rail avatar/bylines follow. Updating only the in-dialog preview
  leaves stale identity everywhere else (the "doesn't propagate" bug).
NEXT: Realtime echo (DM/notif/reaction/edit — untestable in-sandbox); billing (Stripe).

## 2026-08-28 — Realtime echo: DM messages + notifications (+ DM edits)
IN PROGRESS: (cleared)
DONE (code complete; UNTESTABLE in-sandbox — the headless browser can't egress to Supabase
  Realtime, so this is owner-verified on preview with two windows). The workspace already
  echoed channel message insert/edit/tombstone + typing + presence (P4.10/P4.11); this adds
  the missing echoes:
  - **DM messages** (`realtime.js` `subscribeDMMessages` + `dms.js` showConvo). A DM
    conversation now appends incoming messages from the other participant live. Dedupe: skip
    my own `user_id` (already appended optimistically) and any id already in the stream
    (`.msg[data-mid]`); autoscroll only when already near the bottom. Its channel is a single
    module-tracked `dmChannel` that's REPLACED on convo switch (switching convos is in-screen,
    no route change, so no teardownRealtime) — otherwise a stale sub keeps patching a closed
    conversation. DM **edits** echo too (onUpdate rewrites the row's `.tx`).
  - **Notifications** (`realtime.js` `subscribeNotifications` + `notifications.js`). A new
    notification prepends live via `shapeIncomingNotif(row)` (fetches the actor profile; server
    name from `excerpt` for invites, else a `servers` read). Deduped by id; a shaping failure
    just skips the live prepend (a reload still shows it).
  Confirmed the realtime PUBLICATION carries `dm_messages`, `notifications`, `messages`,
  `message_reactions` (so the subs receive events). Both subs are torn down with the view
  (main.js teardownRealtime before each render) and no-op in demo/signed-out (`session()` gate).
  Screen verifies (dms/notifications/workspace) green — they exercise the demo path (subs
  guarded off), confirming no boot/parse regressions.
GOTCHA T: `message_reactions` and `dm_messages` have NO `channel_id` column, so a
  postgres_changes filter can't scope reactions to a channel. DM messages DO have
  `dm_channel_id` (filtered fine). Reaction echo is the one remaining piece — it needs an
  UNFILTERED `message_reactions` subscription with a client-side filter to the visible
  message ids (RLS still limits delivery to readable rows). Left as the next realtime item.
OWNER: verify on preview in two windows — send a DM / trigger a mention or invite in one,
  watch it appear live in the other. Needs Realtime on for the project (it is) and a signed-in
  session in both.
NEXT: reaction echo (see GOTCHA T); billing (Stripe).

## 2026-08-28 — Realtime echo: reactions (completes the echo set)
IN PROGRESS: (cleared)
DONE (code complete; UNTESTABLE in-sandbox — owner-verified on preview, two windows).
  Reaction echo (GOTCHA T): `realtime.js` `subscribeChannelReactions` subscribes to the whole
  `message_reactions` table (it has NO channel_id to filter on — RLS still limits delivery to
  readable rows); the workspace acts only on messages currently on screen. On another member's
  react, `loadMessageReactions(id)` refetches that message's chips and the row's stored
  `rx.apply(arr)` repaints them in place — keeping the same bar element + closures so the smile
  picker and flip still work. My own reactions stay optimistic (skipped by user_id). DM +
  notification + reaction echo now all live; the only remaining realtime nicety would be live
  read-receipts, not in scope. verify-workspace green both themes.
NEXT: build-guide gaps found in the 2026-08-28 audit — Forward action, channel-permissions
  modal, DM Block/Report + group management; then the roles-editor / billing scope decision.

## 2026-08-29 — build-guide audit + the remaining approved surfaces
IN PROGRESS: (cleared)
AUDIT: cross-checked every P0–P9 prompt against the built app. Everything was present
  except a handful of larger surfaces; owner picked which to build (the rest stay
  post-beta). Built this session (all verify-green in demo; live paths owner-verify on
  preview):
  - **Reaction realtime echo** (GOTCHA T) — subscribeChannelReactions; completes DM +
    notif + reaction echo.
  - **DM Block + Report + Close-DM label** — block_user wired; "Hide" → "Close DM" (§C.11).
  - **Forward** (§C.4, migration p4_message_forward → schema-21) — `messages.forwarded_from`
    + forwardMessage; the ⋯ menu's Forward opens a pick-channels+note modal; the source
    renders as a quote block on load. RLS gates the insert to channels you may post in.
  - **Reporting** (§C.4/§C.7/§C.11) — a shared `app/report.js` reason-radio modal (incl.
    CSAM) → a direct `reports` insert (rep_insert); wired to the message ⋯, the 1:1 DM menu,
    and the details-pane flag (was a stub).
  - **Roles editor** (§C.16) — server menu → Roles & permissions: a two-column modal (roles
    list + New role + @everyone undeletable · name · 30-hue colour picker · the
    Server/Members/Content permission matrix). Direct `roles` CRUD under roles_write
    (has_perm manage_roles); permissions is a bit-OR that fits a JS Number.
  - **Channel permissions** (§C.18) — channel settings → Manage access: a role-checkbox
    modal → set_channel_access. Role-only allow-list (the beta scopes by role; zero = open).
STILL POST-BETA (documented, not skipped silently): **storage & billing sliders + export
  UI** (§C.19 — needs Stripe; owner didn't pick it for beta); **group-DM management**
  (add people / rename / leave — needs backend RPCs that don't exist yet); the full-screen
  Server-settings PANELS (§C.16–19) stay replaced by the modals above per the 08-24 call.
GOTCHA U: two sessions built preview in parallel today. The SessionStart hook + a
  fetch-→ff-only-→stash-pop before every push kept it clean (we touched different files);
  schema files must be numbered against the LATEST origin (this landed schema-21 after the
  other session's schema-19/20). Always rebase-before-push here, don't assume your local tip.
NEXT: storage/billing (Stripe); group-DM management; the remaining QA-CHECKLIST rows the
  owner is testing on preview.

## 2026-08-29 — B1 scrim-click closes every modal (round-3 master-todo, item B1)
IN PROGRESS: (cleared)
DONE: `app/ui.js openModal` now enforces a **single top-level modal instance** — a new modal
  closes any open one, committed on this `preview` push (+ `docs/TODO.md` master todo landed).
  The real bug wasn't the scrim handler (it already closes on a real backdrop mousedown) but
  **stacking**: two scrims meant a backdrop click's mousedown only hit the topmost, leaving the
  earlier one behind, so the click read as ignored. The one deliberate nest (explorer
  move-picker → New-folder prompt, which must return to the picker underneath) opts out via a
  new `nested:true` flag threaded through `promptText`/`promptFolderName`.
  Also `styles/primitives.css`: `.modal` is now a flex column with `max-height:calc(100vh -
  var(--s4)*2)` and a scrolling `.mbody`, so a content-tall modal (Upload/Roles/Move) no longer
  overflows off-screen — the header ✕, footer buttons, and the scrim backdrop all stay reachable.
VERIFIED (renders in demo): headless harness, 12/12 asserts in both themes — two top-level
  modals collapse to one scrim; a real corner backdrop click dismisses; the nested prompt stacks
  (2) then unwinds to the parent (1→0); a 60-row modal fits the viewport with header/footer
  visible; ✕ closes. `verify.mjs` (gallery) green; `verify-primitives.mjs` Modal check green
  (its lone red — MediaPlayer play/pause — pre-exists on clean HEAD: headless can't decode media).
NEXT: B2 · no URL breaks on profile-handle rename (replaceState to /u/<new> + every Profile link
  uses the new handle; confirm id-based server/channel URLs are safe).
GOTCHA: local `preview` had diverged from a force-pushed origin/preview at session start —
  reset --hard to origin/preview before working. `.sheet` (details, z-81) and `.qs` (switcher)
  are separate overlay primitives, NOT `.scrim` modals; single-instance only governs `.scrim`,
  so a Rename modal still layers correctly over an open details sheet.

## 2026-08-29 — B2 no URL breaks on profile rename (master-todo item B2)
IN PROGRESS: (cleared)
DONE: `app/screens/profile.js` — the rename→`/u/<new>` `history.replaceState` is now guarded by
  `location.pathname === /u/<oldHandle>`. The editor was moved into `/settings` (round-2), so the
  old unconditional replaceState hijacked the settings URL to `/u/<new>` and the on-close
  `reload()` bounced the user onto their profile. Confirmed the rest was already correct: every
  self-profile link is built from `data.me.handle`, and `updateProfile` (data.js) calls
  `clearWorkspaceCache()` so the rail/settings links regenerate with the new handle on reload;
  server/channel URLs are id-based (`/s/:serverId/c/:channelId` in router.js), so unaffected.
VERIFIED (renders in demo): headless harness, 6/6 — rename ON the profile page follows the URL to
  `/u/<new>` and resolves to the profile screen (not 404); rename FROM `/settings` leaves the URL
  at `/settings` and stays on usersettings (no bounce, no 404); zero pageerrors. `verify.mjs` green.
NEXT: B3 · message permalink (⋯ → Copy link) copies a permalink that scrolls to + flashes the
  message; needs fetch-by-id (service-role read is the deterministic backend check) + a demo
  assert that the permalink route scrolls the row into view and applies the flash class.
GOTCHA: the editor is a shared primitive (`openEditProfile`) reached from BOTH the profile hero
  and `/settings` — any URL side effect in it must be conditioned on the current route, not assumed.

## 2026-08-29 — UPLOAD FIX: atomic create_work RPC (the "uploads don't work at all" 42501)
IN PROGRESS: (cleared)
DONE: Owner reported every file upload failing with `couldn't save the post (42501): new row
  violates row-level security policy for table "works"` — personal AND server — while pfp/banner
  "worked". Root cause + fix:
  - **Diagnosis (backend, all reliable signals).** `list_migrations`/policies read: the
    `works_insert` WITH CHECK is correct on paper. A **spy BEFORE-INSERT trigger** on a live-style
    insert showed `auth.uid()` resolves correctly and EVERY conjunct is TRUE for the caller's own
    row; the **service-role row-shape check** inserts the exact frontend row (triggers/FKs/meter
    all fire) and passes. Yet **`select count(*) from works` = 0 across all users** — no upload had
    EVER succeeded. pfp/banner only *looked* fine because they're a profile `UPDATE`, a silent
    0-row no-op under RLS, never an error. So the inline `author_id = auth.uid()` INSERT check is
    unreliable **live**, not just over MCP — the VERIFICATION "trap #1" note had masked a total
    outage (corrected there now).
  - **Fix.** New `create_work` SECURITY DEFINER RPC (schema-23-create-work-rpc.sql, migration
    `p13_create_work_rpc`): one atomic call registers the blob, inserts the work, files its
    placement (server) / saved_items row (personal folder) and tags — as the table owner, so the
    write can't be undone by the same 42501 (works RLS is not FORCEd). It re-checks the fence
    itself (author = caller; server ⇒ `member_of` + `has_perm('upload')`; personal ⇒ owner = caller;
    channel/folder must belong to the named server; personal folder must be the caller's), so
    nothing is loosened. `upload.js doPost` now calls it once per file instead of 4 client
    statements; `register_blob`/`visToDb` no longer used there.
  - **.flp + producer files.** `.flp/.als/.logicx/.rpp/.cpr/.aiff/…` were unrecognised (KIND only
    knew audio/video/image/text), so a folder containing a project file dropped it (or, if it was
    the only file, uploaded nothing). Added a DAW-project set + `aiff/aif/m4v` to `KIND`
    (upload.js) AND the signer `EXT` allowlist (api/sign.mjs) — kept in sync (a client ext the
    signer rejects dies with ESK-3006).
VERIFIED: `create_work` role-simulated as the real member (SECURITY DEFINER ⇒ reliable over MCP,
  rolled back): personal work + 2 tags OK; server work to own server + placement OK; upload to a
  server they're NOT a member of REFUSED (fence holds). Frontend: `node --check` clean; demo render
  of `/files` + workspace = 0 pageerrors. Live round-trip (R2 PUT + real session) is owner-only →
  QA-CHECKLIST rows added under §12.
NEXT: the rest of the owner's file-area asks — share a FOLDER outside the server (today share_links
  are per-work only), and a selection/filtering pass on the explorer. Then master-todo B3.
GOTCHA: pfp/banner "working" while uploads failed is the tell of an RLS write that no-ops silently
  (UPDATE) vs one that errors (INSERT) — when a write "does nothing," check the row count, and prefer
  a definer RPC for any load-bearing inline-`auth.uid()` INSERT. `register_blob` is now unused by the
  app but left in place (harmless, idempotent) — create_work does its own blob registration.

## 2026-08-29 — B6 Drive-like selection + accept-every-file-type + round-4 catalogue
IN PROGRESS: (cleared)
DONE (this session, on `preview`):
  - **Every file type accepted** (e969a0a): allowlist → safe-shape ext (`EXT_RE` in api/sign.mjs,
    `safeExt` in upload.js). KIND is now only a render hint. Empty files are the only thing skipped.
  - **B6 selection UX** (explorer.js): bulk bar only on multi-select (2+) so a plain click stays
    quiet; selection persists across route re-entry via a module-level store keyed by source+server
    (survives client-side nav; a hard reload clears — acceptable); empty-area click clears; repaint
    no longer wipes selection (prunes deleted ids only). Demo-verified 4/4 + persistence via real
    client-side nav; 0 pageerrors.
  - **Master TODO round-4 block** (docs/TODO.md): catalogued everything from the owner's file-area
    pass — the works-insert 42501 finding + reliable-write rule, K7 (create_work, done), B5 (channel
    Files tab always empty — `loadWorkspace` returns `files:[]`), K8 (backend write audit + suspect
    list), K9 (Drive folder/file sharing + request-to-join). Corrected VERIFICATION trap #1.
  - **docs/DEAD-CODE.md** created — tracks `register_blob` (now unused; kept), upload.js's inline
    sign/PUT duplicating `uploadBlobs` (fold once live-confirmed), the KIND repurpose, visToDb.
BACKEND FACT for the next agent: `INSERT into works` fails live with 42501 while an identical-shape
  `INSERT into servers` succeeds in the SAME authenticated connection, with the BEFORE trigger
  disabled and the WITH CHECK evaluating TRUE — real, works-specific, root mechanism unexplained.
  Route all work-creation through `create_work` (or a new SECURITY DEFINER RPC); never a direct
  client insert into works. A profile UPDATE that matches no RLS row returns 0 rows + NO error, so
  "no error" ≠ "it worked" — verify a live row actually changed (that's why icon/banner "looked" ok).
NEXT (still open, in docs/TODO.md): B5 (channel Files tab — fetch channel-placed works in
  loadWorkspace), K2 (server icon/cover + banner persist/render — silent-no-op class), K8 (convert
  suspect direct writes to RPCs), K9 (folder/file sharing + request-to-join), explorer filtering audit.
GOTCHA: demo harnesses that use `p.goto` between routes do a FULL page reload, which wipes
  module-level state (like the new selection store) — to test client-side persistence you must click
  the app's own nav (the router intercepts real clicks), not `p.goto`.

## 2026-08-29 — B5 channel Files tab + channel-upload chat visibility (round-4)
IN PROGRESS: (cleared)
DONE (backend role-sim-verified + demo render, on `preview`):
  - **Channel Files tab** — `loadWorkspace` (app/data.js) hardcoded `files: []` and
    `channel.files: 0`, so the per-channel Files tab (`filesPanel`) could NEVER show anything;
    a channel upload only surfaced in the server-wide explorer (the owner's exact complaint). Now
    it fetches the works whose `placement.channel_id` = the active channel, shapes them via
    `shapeWork`, and sets `data.files` + the tab count. `filesPanel` updated to the canonical
    shape (`file_ext`, `who:{name}`) + real image thumbs via `mediaUrl`.
  - **Channel upload shows in chat** — `messages` gains `work_id` (schema-24, migration
    `p14_channel_upload_message`, `on delete set null` like `forwarded_from`); `create_work`
    (schema-23) now atomically posts a message carrying the work when a file is uploaded into a
    channel. loadWorkspace resolves `work_id` → the attachment card; the realtime `liveInsert`
    resolves it live via a new `fetchChannelAttachment(workId, membersById, chanName)`.
  - **Dead stub fixed** — `workspace.js` still had a local `openDetails` that only toasted
    "viewer lands in P5"; it shadowed nothing (no import) so EVERY workspace file card (chat
    attachments + the Files tab) opened a dead toast instead of the real viewer the explorer used.
    Replaced with the real `screens/details.js` `openDetails`.
VERIFIED: role-sim as the server owner (SECURITY DEFINER `create_work` ⇒ reliable, rolled back):
  a channel-placed work is readable (1 row) and a `create_work` into the channel lands the work +
  exactly 1 message with `work_id`. Live DB re-checked clean afterwards (1 work, 0 attach msgs).
  Demo: Files tab renders 4 cards both themes, count line correct, clicking a card opens the real
  `.sheet` details pane; 0 pageerrors. `node --check` clean (data.js, workspace.js, demo.js).
NEXT: K2 (server icon/cover + profile banner — the silent-no-op UPDATE class), then the rest of
  the backend queue (K1 preview_invite, K5 create_server RPC, K4 delete/invite mgmt, K9, K6).
GOTCHA: `messages` has no attachment column by default — a "file in a channel" needed the new
  `work_id`, resolved on read. Live-only: the R2 round-trip and the realtime attachment echo to
  OTHER clients can't be exercised in-sandbox → QA-CHECKLIST §12 rows added.

## 2026-08-29 — K2 server icon/cover + profile banner RENDER (persistence was never broken)
IN PROGRESS: (cleared)
DONE (persistence verified live; render fixed + demo-verified, on `preview`):
  - **The framing was wrong.** K2/BUILDLOG had this filed as a silent-no-op UPDATE (the
    icon/banner "looked" saved but didn't persist). It's not: role-sim as the owner shows
    `servers.update` (icon_key) changes the row (`rows_updated=1`); `profiles.update` was already
    catalogued PASS; and the live DB ALREADY held a stored `servers.icon_key` (b9/…jpg) and a
    `profiles.banner_key`. The writes persisted all along. The bug was **purely render.**
  - **Server icon in the header** — `loadWorkspace`/`loadExplorer` returned `data.server` as only
    `{id,name,initials}`, so `channelColumn`'s `srvIconEl(data.server)` always fell to initials
    even with an icon set. Both now carry `icon_key`/`cover_key` (workspace already got it in B5).
  - **Server cover** — `.srvcover` in the channel header was a hardcoded empty gradient band;
    `channelColumn` now paints `cover_key` into it. The explorer reuses `channelColumn`, so its
    header gets icon+cover too.
  - **Profile banner** — the hero rendered no banner (a stub). Added a `.pbanner` cover band that
    shows `banner_key` when present (bannerless heroes unchanged), mirrored into `gallery.html`
    (LAW) + `styles/content.css` so the design source stays in sync.
VERIFIED: role-sim `update servers set icon_key` as the owner → `rows_updated=1` (rolled back).
  Demo render with the CDN request intercepted by a 1×1 PNG (so the img loads instead of tripping
  srvIconEl's error→initials fallback): server icon `src` + cover background-image present in BOTH
  the workspace and explorer headers; profile `.pbanner` present with the banner image; both
  themes; 0 pageerrors. `node --check` clean.
NEXT: K8 (backend write-reliability audit — now with servers.update + profiles.update confirmed
  PASS, so the audit narrows to the remaining direct writes), then K1/K5/K4/K9/K6.
GOTCHA: a broken image on a server icon correctly falls back to initials (srvIconEl error handler),
  so in-sandbox (no cdn.eski.lol egress) the icon LOOKS absent — that's the fallback, not a render
  miss; intercept the CDN in a harness (or test on preview) to see the real image. Cover/banner use
  background-image (no error handler) so a broken URL just shows the token background.

## 2026-08-29 — K8 write-reliability audit + post_comment RPC (the works-class risk, narrowed)
IN PROGRESS: (cleared)
DONE (audit + catalogue + one conversion, backend role-sim-verified, on `preview`):
  - **Root-cause insight that makes K8 tractable.** The broken `works_insert` had a COMPLEX
    inline-`auth.uid()` check (CASE owner_type + member_of + has_perm + subqueries). The SIMPLE
    shape `col = (select auth.uid())` WORKS — `servers_insert` succeeds live (owner owns a server),
    and K2 proved `servers.update` + `profiles.update` change rows. So the risk is only in COMPLEX
    inline-uid checks. Full write catalogue (RPC / definer-gated / simple-owner / converted) is in
    docs/TODO.md K8 — every write in app/ classified.
  - **Converted the one remaining COMPLEX inline-uid content write:** `comments` insert. Its
    `cmt_insert` fence (`can_read_work AND (author OR is_friend(author))`) is structurally like the
    works one that broke, so a direct client insert is the suspect path. New `post_comment` RPC
    (schema-25, migration `p15_post_comment_rpc`) re-checks the same fence as the table owner;
    `data.js postComment` now calls it (set-returning → array of one row).
  - Left the SIMPLE owner-only writes (saved_items, starred_items, server_prefs, notifications,
    dm_members, reports, unblock, unpin) as direct writes — they match the working servers_insert
    shape; converting them is churn without cause. dm_messages/content_tags/share_links/works-update
    stay direct because a DEFINER helper (dm_member/can_write_work) already gates them.
VERIFIED: `post_comment` role-simulated (SECURITY DEFINER ⇒ reliable over MCP, rolled back): the
  work's author may comment (row returned); a non-member/non-friend is refused (can_read_work +
  friend gate). Live DB re-checked clean (comments still 0). `node --check` clean.
NEXT: K1 (preview_invite anon RPC), K5 (create_server RPC), K4 (delete/invite mgmt), K9, K6.
GOTCHA: `post_comment` is set-returning (`returns table(...)`) so the PostgREST result is an ARRAY
  of one row — read `data[0]`, not `data`. Comments context still defaults to 'public' (the RPC
  never sets it; the check constraint requires exactly 'public').

## 2026-08-29 — K1 preview_invite anon RPC (real invite landing)
IN PROGRESS: (cleared)
DONE (anon role-sim-verified + demo render, on `preview`):
  - **`preview_invite(p_code)`** (schema-26, migration `p16_preview_invite`) — a SECURITY DEFINER
    function granted to **anon** + authenticated, returning `{server_id, server_name, icon_key,
    member_count, inviter_name}` for a VALID/live/under-cap code and NO rows for a revoked (deleted
    row) / expired / at-capacity / invalid one. Same validity rules as `join_via_invite`. Anon-safe
    by design: the landing renders before sign-in, and the code is the only secret.
  - **`data.js loadInvitePreview(code)`** — never throws (a failed preview must not block the page);
    returns null on any error → generic/dead fallback.
  - **`screens/join.js`** — both the signed-in and signed-out cards fetch the preview and fill in a
    square server badge (icon or initials), "Join {name}", and "{inviter} invited you · N members";
    a null preview shows the dead-invite state proactively. Refactored the click-time dead-invite
    into a shared `deadInvite()` helper.
VERIFIED: `preview_invite` as `anon` → the real code returns the row (server "test server",
  inviter "dexter", 1 member); a bad code returns NULL (rolled back). Demo join card renders
  "Join Late Bloom LP" · "jax invited you · 6 members" · badge, both themes, 0 pageerrors.
NEXT: K5 (atomic create_server RPC), K4 (delete server + invite expiry/revoke), K9, K6.
GOTCHA: `preview_invite` is set-returning → PostgREST result is an array; read `data[0]`. A revoked
  invite is a DELETED row (data.js revokeInvite → si_delete), so "not found" already covers revoked.

## 2026-08-29 — K5 atomic create_server RPC
IN PROGRESS: (cleared)
DONE (backend role-sim-verified, on `preview`):
  - **`create_server(p_name, p_channels[])`** (schema-27, migration `p17_create_server`) — one
    SECURITY DEFINER transaction that inserts the server (owner = caller), seats the owner's
    membership (hue 1, active), the one @everyone role (perms 113664), and the starter channels;
    channel names are normalized to handles server-side (lowercase, non-alnum→dash, trimmed),
    empties skipped, capped at 20, default `#general`. Atomic — no more half-made servers — and
    free of the create-time RLS chicken-and-egg (definer seats membership/role before any policy
    needs them). `data.js createServer` now calls it; the 4 client inserts + the dead
    `EVERYONE_PERMS` const are gone.
VERIFIED: role-sim as a real user — `create_server('K5 Test', ['General','wips!!','  ','beats
  room'])` → server + 1 active owner-member + 1 @everyone role + channels `[general,wips,beats-room]`
  (normalized, empty skipped); rolled back. Live DB unchanged (servers 2, channels 6, roles 3).
  `node --check` clean.
NEXT: K4 (delete server + invite expiry/revoke), K9 (folder sharing + request-to-join), K6 (realtime).
GOTCHA: `create_server` returns the full `servers` row (`returns servers`), so `data.js` reads
  `srv.id`/`srv.name` straight off `data` (not an array — it's a scalar composite, unlike the
  set-returning post_comment/preview_invite which come back as `data[0]`).

## 2026-08-29 — K4 delete_server RPC (silent-no-op hardening) + invite mgmt verified
IN PROGRESS: (cleared)
DONE (backend role-sim-verified, on `preview`):
  - **Invite expiry/revoke** — already built (P9.3); verified reliable. `si_insert`/`si_delete`
    gate on `is_server_admin` (definer): role-sim confirmed an admin creates + revokes an invite
    (1 row each). A revoked invite is a deleted row, so join_via_invite/preview_invite see nothing.
    Left as direct writes (definer-gated = reliable).
  - **Delete-server hardened.** Was a direct `servers.delete` (servers_delete = owner_id). Role-sim
    exposed the silent-no-op: a NON-owner's delete matched **0 rows with NO error** — "success"
    deleting nothing (the K8 class). New `delete_server(p_server_id)` SECURITY DEFINER RPC
    (schema-28, migration `p18_delete_server`) RAISES for a non-owner / missing server; the owner's
    call deletes the row + FK cascade (members/channels/works/invites/roles). `data.js deleteServer`
    calls it.
VERIFIED: role-sim — a non-owner's `delete_server` RAISES (was a silent 0-row no-op via direct
  delete); the owner's deletes the server (count→0); invite insert+delete as admin = 1 row each;
  all rolled back, live DB intact (servers 2, invites 1). `node --check` clean.
NEXT: K9 (Drive folder/file sharing + request-to-join), K6 (realtime echo, live-only).
GOTCHA: the direct servers.delete "worked" in every demo/manual test because the tester was the
  owner — the 0-row no-op only bites a non-owner, who the UI never shows Delete to, so it hid. The
  RPC makes the failure loud (raise) instead of a silent success. Same lesson as the works/icon
  bugs: a matched-0-rows write is a silent lie, not a pass.

## 2026-08-29 — K9 Drive-style folder sharing + request-to-join
IN PROGRESS: (cleared)
DONE (backend role-sim-verified + demo render, on `preview`):
  - **Folder sharing.** `share_links` extended to target a FOLDER (server `folders` or personal
    `save_folders`) instead of only a `work_id` — `work_id` now nullable + a `share_links_one_target`
    check (work XOR folder) (schema-29, migration `p19`; the resolver's server-context return was
    added by `p20`, a DROP+CREATE since the return type changed). `create_folder_share(source,
    folder_id)` (fenced: server folder needs membership, personal must be yours) mints a link;
    `resolve_folder_share(token)` (anon) returns the folder name + server context + file list.
    Client: right-click a folder → "Copy folder link" (`explorer.js shareFolderMenu` +
    `cards.js folderCard onShare`); a read-only viewer at `/shared/folder/:token`
    (`screens/shared.js renderSharedFolder`, no rail, signed-out-safe) that reuses `workCard`.
  - **Request-to-join.** New `join_requests` table (RLS `jr_read`: your own row or a server admin;
    writes are RPC-only). `request_to_join_server` (idempotent; refuses a banned user),
    `approve_join_request` (admin; seats the member with a free hue like join_via_invite),
    `decline_join_request`. Client: the shared-server-folder viewer shows **Request to join
    {server}**; the server menu gains an admin **Join requests** modal (`workspace.js
    openJoinRequests`) with Approve/Decline. New `data.js`: createFolderShare, folderShareUrl,
    loadSharedFolder, requestToJoin, loadJoinRequests, approveJoinRequest, declineJoinRequest;
    demo fixtures demoSharedFolder/demoJoinRequests; route `/shared/folder/:token`.
VERIFIED: role-sim (all rolled back) — anon resolves a server folder share to its 1 file, a bad
  token → nothing; a join request goes pending → an admin approve seats the requester as an active
  member. Demo: folder viewer renders 4 cards + the "Request to join Late Bloom LP" CTA (0
  pageerrors); the admin Join-requests modal lists 2 requests with Approve/Decline. `node --check`
  clean across data/demo/router/main/shared/explorer/workspace/cards.
NEXT: the master-todo backend queue (K1–K9) is now DONE; remaining open work is UI polish (P1–P5),
  B3 (message permalink), B4 (typed modal routes), and the live-only QA the owner runs on preview.
GOTCHA: `resolve_folder_share`'s return type changed between p19 and p20 → needed DROP+CREATE (not
  CREATE OR REPLACE). The folder viewer is a set-returning RPC → `data` is an array; the folder
  name/server context repeat on every row, so read them off `data[0]`.

## 2026-08-29 — Round-5 UX sweep (B7/B8, P6/P7/P8/P9/P10)
IN PROGRESS: (cleared)
DONE (owner round-5 feedback; each demo-verified, on `preview`):
  - **B7** upload picker couldn't select — the hidden `<input type=file>` was `display:none`
    (Chromium/Brave refuse selection); now visually-hidden. **B8** every dropdown now toggles
    closed on a second trigger click (openMenu + openFilterMenu guard on `aria-expanded`).
  - **P6** upload sheet: Visibility is contextual (hidden in a server context), "Post"→"Upload",
    storage line gone; removed the dead Files-tab code (filesPanel + loadWorkspace channel fetch).
  - **P8** the Type filter lists real file extensions (.wav/.flp/…); every multi-select facet gets
    a search box past 8 options.
  - **P7** the Share dialog is links-only (Drive-style); visibility moved to a "Change visibility…"
    item on the card/detail menus; an eski `/shared/…` link pasted in chat renders as a native
    file/folder card (`eskiRefCards`).
  - **P9** the shared-folder viewer now renders through the REAL explorer in a read-only `shared`
    mode (same toolbar/filters/search/views/selection); gated off the rail/tree/footer/upload/menu.
  - **P10** server settings is its own screen (`screens/settings.js`, `/s/:id/settings`): setnav +
    panels (overview/roles/invites/requests/notifications/audit/danger); the server menu routes to
    it; the four superseded modal fns were removed from `workspace.js`.
VERIFIED: demo render for each (0 pageerrors); B7/upload contextual bits are session-gated → owner
  QA on preview. Backend untouched this round except reusing existing RPCs.
NEXT: remaining master-todo — B3 (message permalink), B4 (typed modal routes), P1 (center empty
  states), P2 (perf), P3 (loading states), P4/P5 (cut social · merge Messages+Friends), and the
  P7 follow-up (a composer "reference a file" picker).
GOTCHA: `.usersettings` settings-layout CSS was broadened to `:is(.usersettings,.serversettings)`
  so the new server-settings screen reuses it. The shared-explorer mode needed every
  `data.server.id` deref guarded (server is null on a shared view).

## 2026-08-29 — Backend verification pass (+ approve_join_request fix)
IN PROGRESS: (cleared)
DONE: full round-trip verification of the live backend (project zidqagrmxeawpasurpwi) via
  rolled-back txns under `set local role authenticated` with real jwt claims, simulating the
  owner (dexter 0de0…0001) and a second user (fresh 0f00…0002). All green: create_server
  (channels + @everyone role + owner member), create_work personal (visibility='private' +
  tags) and server (placement + the B5 auto channel-message via messages.work_id), post_comment,
  invite_user_to_server + anon preview_invite, create_folder + create_folder_share +
  resolve_folder_share, the join-request → approve flow, RLS denial of a non-member upload, the
  works_blob_meter trigger (storage_meters.bytes_used bumps), and messages_fanout (mention +
  notification rows created, correctly RLS-scoped so only the recipient sees them). Advisors
  (security): only the accepted P1/P2 posture (definer gate helpers REST-callable) + media_blobs
  deny-all + the owner's one-click leaked-password toggle — no rls-disabled / policy-permits-all.
  43 tables, all RLS on. Migrations match committed schema-01..29.
  ONE BUG FOUND + FIXED: `approve_join_request` (schema-29 / K9) declared `default_role` but
  never used it — an approved member got a server_members row but NO @everyone member_roles row,
  unlike join_via_invite. Because has_perm() unions only owner_id + member_roles, such a member
  could READ unrestricted channels but could NOT send_messages/upload/comment/pin or see role-
  gated channels. Fixed by mirroring join_via_invite (assign the is_default role, idempotent) —
  migration `p21_approve_join_assigns_default_role`, committed as `schema-30-approve-join-default-role.sql`.
  Re-verified: post-approve member_roles=1, has_perm(send)/has_perm(upload)=true (rolled back).
  Also re-sorted the master TODO Work Queue into a single by-estimated-time view (docs/TODO.md
  "Sorted by estimated completion time" section) — content unchanged, ordering added.
NEXT: master-todo top items — B3 (message permalink), B4 (typed modal routes), P1 (center empty
  states), P2 (perf), then the round-7 density/file-browser work. K10 (storage tracker) is a
  FRONTEND read-wiring task — the meter trigger itself is confirmed working this pass.
GOTCHA N: any NEW member-creating path MUST assign the default @everyone role via member_roles —
  has_perm() does NOT implicitly grant the is_default role (owner bypasses via owner_id; everyone
  else needs the row). join_via_invite is the reference; grep `member_roles` before adding a path.
  A declared-but-unused `default_role` var is exactly how p21's bug hid in plain sight.

## 2026-08-29 — K10 storage tracker + backend audit round 2
IN PROGRESS: (cleared)
DONE: K10 (storage tracker) + a backend-audit sweep.
  K10: audited the whole storage path — the read side was already correct (loadExplorer/
  loadPersonalExplorer/loadUserSettings read storage_meters.bytes_used + storage_balance by
  owner; RLS sm_meter_read lets the owner read; columns match; footer/panel render it). The
  "reads zeros" symptom was downstream of the pre-K7 upload outage. Proved the meter is accurate
  to the byte (live user meter == distinct-blob sum over non-purged works) and the works_blob_meter
  trigger is correct (rolled-back upload→trash→purge = 0→123456→123456→0). Fixed the ONE real
  wiring bug: Delete-forever / Empty-trash freed bytes server-side but never refreshed the cached
  data.storage, so the footer stayed too-high until a reload. Added `refreshStorage(data)`
  (app/data.js) + called it from purgeRow/emptyNow (app/screens/explorer.js). node --check clean;
  demo explorer renders footer, 0 pageerrors. Live purge→drop → QA-CHECKLIST §19.
  AUDIT: (1) all 29 client rpc() calls map to existing DB functions — no missing-RPC gaps.
  (2) SECURITY FIX — register_blob (a SECURITY DEFINER write into media_blobs) was still
  anon-executable: Supabase's default-privilege grant to anon survives `revoke ... from public`,
  so schema-19 never dropped it. The client never calls register_blob (create_work inlines the
  blob insert), and an anon caller could pre-seed a media_blobs row with a chosen `bytes` for a
  known sha → create_work's `on conflict do nothing` keeps it → skews the real uploader's meter.
  Revoked anon (migration p22, schema-31). After this NO anon-executable function writes data —
  the only anon RPCs left are read-only public landings (preview_invite, resolve_share_link,
  resolve_folder_share) + self-relative gate helpers + pure utilities. (3) The 2 RLS-enabled/
  no-policy tables (media_blobs, upload_quota) are intentional deny-all — server-managed via
  definer RPCs/triggers, never read directly by the client. Confirmed correct, not a bug.
NEXT: master-todo top items (B3 permalink, B4 typed modal routes, P1 empty-states, P2 perf),
  then the round-7 density/file-browser work (P12/P13/P14/P18) under the 3-versions rule.
GOTCHA O: `revoke ... from public` does NOT remove a role's DIRECT grant. Supabase ALTER DEFAULT
  PRIVILEGES grants EXECUTE on new functions directly to anon/authenticated, so a definer write
  RPC needs an explicit `revoke ... from anon` (the create_work/create_server RPCs already do
  this; register_blob's schema-19 revoked only public and leaked). Audit new definer RPCs for a
  stray anon EXECUTE: `has_function_privilege('anon', <fn>, 'EXECUTE')`.

## 2026-08-29 — Backend audit round 3 (security fence + perf)
IN PROGRESS: (cleared)
DONE: role-sim fence + perf sweep, all rolled back.
  SECURITY FENCE — all correct:
  - Visibility (can_read_work) for public/server/private: stranger t/f/f, non-member t/f/f,
    author t/t/t, member t/t (reads server work + can_post). Private is invisible to everyone
    but the author; server work only to members.
  - DM isolation: dm_member = t/t/f for dexter/fresh/stranger, AND a real RLS read of dm_messages
    as the stranger returns 0 rows. create_dm correctly REQUIRES friendship (rejects a stranger DM).
  - Moderation: a timed-out member's can_post_channel = false; ban_member flips the member inactive
    and records a server_bans row.
  - search_all (INVOKER) is leak-safe: author finds their private work (1 hit), stranger gets 0 —
    RLS is the fence. NOTE valid scope is 'global' or a server-id (a bad scope casts to uuid → error).
  REALTIME: supabase_realtime publishes 24 tables incl. messages/dm_messages/notifications/
  message_reactions (live-echo set intact). join_requests is NOT published — nice-to-have (the
  admin Join-requests modal isn't a live stream; no frontend subscriber), not a bug.
  PERF FIX — schema-32 / migration p23: indexed 3 FK columns the p4/p19 migrations left unindexed
  (messages.forwarded_from — else every message delete scans messages for forwards; join_requests
  .user_id — jr_read filters by it and it's only the 2nd PK col; join_requests.decided_by). The
  unindexed-FK audit now returns zero rows.
NEXT: master-todo top items (B3, B4, P1, P2) then the round-7 density/file-browser work.
GOTCHA P: search_all(q, scope) — scope is 'global' (default) or a server-id string; any other
  value (e.g. 'all') hits `scope::uuid` in the body and errors 22P02. The client passes 'global'
  or a real server id, so this only bites ad-hoc test calls.

## 2026-08-29 — Frontend data-layer audit (silent-no-op writes)
IN PROGRESS: (cleared)
DONE: audited every write in app/data.js for the backend's "looks like it works then doesn't"
  class (a write that RLS filters to 0 rows returns NO error → the client fakes success).
  Classified all ~40 direct writes: most are reliable (owner-simple `user_id=auth.uid()` or
  definer-helper-gated `can_write_work`/`can_moderate_channel`). Two real issues found + fixed:
  1) SILENT-NO-OP WRITES (frontend): the file ⋯ menu / details menu offer Rename·Delete·Hide·
     Change-visibility on EVERY work with no permission gate, so a member sees them on other
     members' server files. The writers (trashWorks/restoreWork/purgeWork/setHidden/renameWork/
     setVisibility) checked only `error`, never rowcount — a non-author's update matched 0 rows
     (RLS), returned no error, and the handler showed a success toast + optimistically mutated
     the card (rename/hide/delete) until reload. Fixed: each writer now `.select("id")`s the
     touched rows and throws "Only the owner/admin can…" when empty, so the handlers' catch path
     shows an honest error and skips the optimistic update. Role-sim confirmed a non-author's
     rename/hide/trash = 0 rows, author = 1. (The UX half — don't SHOW the items to non-owners —
     is logged as B13, a visible menu change under the 3-versions rule.)
  2) FOLDER-SHARE REVOKE (backend): share_links UPDATE/DELETE policies gated only on
     can_write_work(work_id), null for a folder share (schema-29) → a folder-share creator could
     see but never revoke their link (resolve_folder_share honors a revoked_at nothing could
     set). Aligned UPDATE+DELETE with the SELECT policy (created_by OR can_write_work) —
     migration p24, schema-33. Role-sim: pre-fix revoke=0 rows, post-fix=1 and the resolver then
     refuses the revoked share.
  Also confirmed NOT bugs: profiles has no signup trigger, but loadRail uses maybeSingle +
  hasProfile gates onboarding + createProfile upserts (handled); setStatus writes only columns
  that exist (status_expires_at/presence_state present); unblockUser's friendship .or() filter
  is correct. Demo explorer still renders 0 pageerrors after the data.js edits.
NEXT: B13 (menu permission-gating, 3 versions) + the master-todo top items.
GOTCHA Q: a Supabase `.update()/.delete()` that RLS filters to 0 rows returns `{data:[], error:null}`
  — NOT an error. Any load-bearing direct write must `.select()` and check `data.length`, or it
  will silently fake success (the K2 pfp/K4 delete_server pattern, in the data layer).

## 2026-08-30 — Frontend read-path audit
IN PROGRESS: (cleared)
DONE: audited every read in app/data.js for wrong filters / FK-embed hazards / missing deleted_at
  guards / 0-row throws / visibility leaks. RESULT: the read layer is clean — no correctness bugs.
  - deleted_at is filtered everywhere it matters (channel messages, DM thread, comments, all works
    reads, work-by-id); tombstoned rows never surface.
  - author profiles are fetched SEPARATELY into a byId map everywhere (server_members/comments/
    dm_messages/notifications user_id → auth.users, no FK to profiles), so the PostgREST-embed
    hazard behind the old "empty members rail / unknown authors" bug (#1) is consistently avoided.
  - visibility is safe: loadFeed filters visibility='public' + friend authors; loadProfile lets RLS
    gate then groups the returned works by visibility into shelves (owner sees all, stranger only
    public) — no leak. can_read_work is the real fence and reads honor it.
  - every single-row read uses maybeSingle (no 0-row throw); loadDMs excludes hidden DMs and routes
    blocked edges out of the friend lists.
  - roster (loadWorkspace) does not filter server_members.status, but that is benign: ban/kick
    DELETE the row (ban also writes server_bans), leave deletes, join/approve/create set 'active';
    there is no check constraint and zero non-active rows exist, so nothing to filter.
  - pins/forwards that point at a soft-deleted message are safe: msg_edit_tombstone nulls the body
    on delete, so the embed returns an empty quote, never stale/leaked text.
  ONE non-correctness finding logged as P20: channel messages (data.js:218) load with NO .limit()
  — the whole history every open (comments 200 / DMs 300 / feed 120 are capped; channel messages
  are not). Fine at beta size, a perf/scroll landmine at scale → paginate (last ~50 + load-earlier).
NEXT: B13 (menu permission-gating, 3 versions), then the master-todo top items.
GOTCHA R: this codebase deliberately does NOT embed author profiles via PostgREST (user_id columns
  point at auth.users, which has no FK to public.profiles) — every loader fetches profiles into a
  byId map by hand. Keep that pattern for any new read; an embed will silently return nothing.

## 2026-08-30 — P2 settings perf (dedupe profiles + defer storage/privacy)
IN PROGRESS: (cleared)
DONE: loadRail now selects bio,banner_key and caches the raw profile row (_cache.rail.profile);
  loadUserSettings reuses it — the second identical from("profiles") read is gone. Storage +
  Privacy reads are deferred: loadUserSettings returns storage:null/blocked:null, and the two
  panels lazy-load via new loadUserStorage()/loadUserBlocked() on open (result cached back onto
  `data`). Profile panel (first render) no longer blocks on storage_meters/storage_balance/
  friendships. Files: app/data.js, app/screens/usersettings.js. Verified: node --check clean;
  demo /settings 0 pageerrors both themes; Storage + Privacy panels populate on click. Committed dcce6ca.
NEXT: B4 (typed /create·/upload·/settings open their modal over the shell).
GOTCHA S: the demo branch of loadUserSettings still returns storage/blocked INLINE (no session
  for lazy loaders), so demo screenshots render immediately; only the live path defers. The panels
  branch on `data.storage`/`data.blocked` being truthy → render now, else show Loading… + fetch.

## 2026-08-30 — B4 typed modal routes (/create, /upload) open over the shell
IN PROGRESS: (cleared)
DONE: /create and /upload were not in IN_SHELL → they rendered the "not yet ported" placeholder
  when typed directly. Added a renderRoute branch (before the placeholder fallthrough): render the
  Feed as the backdrop shell, then open the modal (openCreateServer / openUpload); exported
  openCreateServer from shell.js. The route is ephemeral so it replaceStates to "/" (demo: /?demo=1).
  openModal's single-instance guard (B1) makes a stray re-render just re-show the same modal.
  /settings already resolved to the User-settings screen (no change). Files: app/main.js, app/shell.js.
  Verified: demo /create mounts the New-server modal over the Feed + scrim; /upload renders the Feed
  backdrop (upload sheet is session-gated, opens on preview); node --check clean; 0 pageerrors both
  themes. Committed 7f8e0e1.
NEXT: B3 (message permalink: Copy link → scroll + flash).
GOTCHA T: openUpload() early-returns with a "Sign in to upload" toast when there's no session, so
  in demo the /upload route shows the Feed backdrop + toast, not the sheet — that's correct (upload
  is live-only). openCreateServer() has no such gate (createServer previews in demo), so /create
  opens fully in demo.

## 2026-08-30 — B3 message permalink (verified, was already built)
IN PROGRESS: (cleared)
DONE: B3 was fully implemented by a prior session but left unticked — verified end-to-end this pass
  and ticked. ⋯→Copy link builds msgPermalink (/s/:id/c/:ch?m=<id>, canonical from data not location);
  workspaceView parses ?m= → focusMsg; flashMessage (RAF) scrolls the row into view + adds the
  one-shot .flash pulse (shell.css @keyframes msgflash). Verified: arriving at /s/lb/c/beats?m=m3
  finds the row, adds .flash, scrolls it into view, 0 pageerrors. No code change (docs only).
NEXT: B13 (menu permission-gating — visible menu change, 3 versions) OR the easy visual items.
GOTCHA U: B3 permalinks only resolve while channel messages load unbounded (P20 not yet done). When
  P20 paginates the stream, a ?m=<id> to a message outside the loaded window will no-op unless P20
  adds fetch-by-id / load-earlier-until-found into flashMessage — noted on the P20 item.

## 2026-08-30 — P1 center empty-state text (one global rule)
IN PROGRESS: (cleared)
DONE: .emptystate (shell.css) now centers both axes — justify-content:center + min-height:100% fills
  the host pane (all hosts are definite-height flex: .stream/.panebody/.main flex:1, .notif/.dmmain
  flex columns), padding evened to var(--s4). Removed the now-redundant per-pane margin:auto patches
  (.notif .emptystate / .dmmain .emptystate) from content.css — one rule, no duplicates. Files:
  styles/shell.css, styles/content.css. Verified: empty-server "No channels yet" centers in-pane both
  themes, text legible + CTA visible, 0 pageerrors. Committed 0069909.
NEXT: B13 (gate file ⋯ menu write items by permission — ship single per owner's "small" call).
GOTCHA V: min-height:100% only centers when the host has a definite height; every empty-state host
  here does (flex:1 scrollers / flex columns). Where a host is indefinite, min-height:100% resolves
  to auto → natural height, no break (graceful). Don't add margin:auto back — it fought this rule.

## 2026-08-30 — B13 gate file ⋯ menu write items by ownership (UX half)
IN PROGRESS: (cleared)
DONE: shapeWork now exposes authorId; a shared writeMenuItems(data,state,rerender,w,hooks) helper
  (explorer.js) is spread into BOTH the card ⋯ menu (openCardMenu) and the details-pane menu
  (detailMenuItems) only when canWriteWork = isAdmin || authorId==null(personal) || authorId===me.id.
  A non-writer's menu is Star · Save · Share… · Copy link; a writer/admin keeps Change visibility ·
  Rename · Move to… · Hide · Delete. Shipped single (owner "ship small" — a menu-inventory gate, not
  a redesign). Extended one item past the ticket's four to include Move to… (same can_write_work
  class). Files: app/data.js, app/screens/explorer.js. Verified: predicate unit-checked
  (admin/own/other/personal → true/true/false/true); demo card menu unchanged (full set, demo=admin),
  0 pageerrors; hidden-state is live-only (demo is admin) → QA-CHECKLIST §10 claim added. Committed a7e7df7.
NEXT: the big visual redesigns as 3-version batches (owner picks): start P13 (flatten file-channel
  header + path viewer) or the P12/P18 density+standardize cluster. P20 pagination (non-visual) also
  outstanding.
GOTCHA W: demo always runs as an admin (demoExplorer isAdmin:true, demoWorkspace isOwner:true), so
  ownership-gated UI can't show its RESTRICTED state in demo — only its full state. Verify the
  restricted branch by unit-checking the predicate + a QA claim for a real member on preview.

## 2026-08-30 — P13 (in progress) — 3-version header batch built, awaiting owner pick
IN PROGRESS: P13 file-channel header — 3 versions built as a comparison (docs/design/p13-headers.html)
  using the real tokens/CSS; screenshotted both themes for the owner to pick. NOT yet wired into
  explorer.js (won't ship an unpicked visual). Variants: V1 one unified bar (path far-left, panehd
  folded fully into the toolbar); V2 slim path line up top + view/hidden controls moved down into the
  toolbar; V3 path as the search field's leading context, view+actions grouped right. All drop the
  server-name crumb root → a folder glyph (channel column already names the server). Once the owner
  picks, wire the chosen layout into explorer.js `paint()` (mind repaintBody + the crumbs/searchState
  swap) + move its CSS into content.css, then delete the comparison file.
NEXT: implement the picked P13 variant.

## 2026-08-30 — P13 done (V2 + owner tweaks) — file-channel header flattened
IN PROGRESS: (cleared)
DONE: implemented the owner-picked V2 header + tweaks. Old two-row .panehd gone → a slim .expath path
  line (breadcrumb only; server-name root dropped to a folder glyph on the server source, "My files"
  kept for personal). Toolbar: search left, filters + view/hidden controls grouped right (.tbfilters).
  New folder + Upload float bottom-right (.exfab) as bare square buttons (no backing box, per owner
  follow-up); .pane is position:relative, .panebody gets bottom padding via .pane.hasfab. Fixed a
  latent search-term staleness bug (searchQ live ref updated in repaintBody). Mirrored into
  gallery.html (LAW) + its CSS; removed dead .toolbar .tbactions CSS; deleted the p13-headers.html
  comparison scaffold. Files: app/screens/explorer.js, styles/content.css, docs/design/gallery.html.
  Verified: server + personal explorer both themes, breadcrumb fills on descend, search state live,
  0 pageerrors. Committed 5efde4d.
NEXT: remaining round-7 visual items as 3-version batches (P12 density, P18 standardize headers, P14
  view modes, P15 status→profile), or the decision-laden P4/P5, P11 (need owner input). P20 pagination
  (non-visual) also outstanding.
GOTCHA X: gallery.html screens are display-toggled by .ptab buttons, so scrollIntoView on a hidden
  screen's element no-ops in a headless shot — verify a gallery screen by clicking its tab first (or
  trust the structural + 0-pageerror check when the CSS is byte-identical to the app's).

## 2026-08-30 — P18 (in progress) — standardized-header density batch built, awaiting pick
IN PROGRESS: P18 standardize headers — audited the inconsistency (heights 48/48/52/56; .chanhd on
  --plate vs --surface elsewhere; insets s3/s4/s5). Built a 3-density comparison
  (docs/design/p18-headers.html) of the unified header set (channel-column · workspace main · DM ·
  feed/notif/search) all on --surface + --s4 inset, at 46 / 50 / 56px. Awaiting the owner's density
  pick, then rewire the real headers (shell.css .chanhd/.mainhd; content.css .panehd/.dmmain .mainhd/
  .svhd) to the chosen height + --surface + --s4, mirror into gallery.html, verify each screen.
NEXT: implement the picked P18 density; then P12, then P15.

## 2026-08-30 — P18 done (owner: V1 Compact 46px) — standardized headers + insets
IN PROGRESS: (cleared)
DONE: unified the primary headers to height 46px + --s4 (16px) inset (backgrounds were already
  --surface; the only --plate header, .chanhd, is dead CSS — the real workspace server header is the
  .srvbar cover). Changed .mainhd (shell.css), .panehd/.dmmain .mainhd/.svhd (content.css), and
  brought .panebody/.toolbar/.expath to the same 16px inset so headers align with their bodies
  (fixes "insets jump 12/16/24"). Mirrored into gallery.html; deleted the p18-headers.html scaffold.
  Files: styles/shell.css, styles/content.css, docs/design/gallery.html. Verified: workspace/feed/
  DMs/notifications/explorer render 46px headers + aligned 16px insets, both themes, 0 pageerrors.
  Committed 05c213a.
NEXT: P12 (density: modals/dialogs/toasts — 3-version batch), then P15 (status→profile; presence kept
  SIMPLE per owner — no forced yellow).
GOTCHA Y: .chanhd is dead CSS (no app JS renders it) — the workspace channel-column header is .srvbar
  over a .srvcover banner (100px, gradient scrim), a deliberately distinct cover header, NOT part of
  the 46px flat-header unification. Don't "fix" .srvbar to 46px.

## 2026-08-30 — P5 done — Friends folded into the Messages column (one surface)
IN PROGRESS: (cleared)
DONE: removed the .dmfriends button + showFriends() right-pane swap; friends now render inline in the
  .dmlist column as sections: Requests (incoming accept/decline + outgoing pending) · Pinned · Direct
  messages · Friends (accepted friends without an active 1:1 DM → click to message; no dup of open
  DMs). Add-by-username at the top now wires to addFriend (fixed a dangling addByUsername ref that
  would throw on use). Removed the dead Friends-panel CSS (.dmfriends/.friends/.frhd/.frtabs/.frrow…);
  kept .rbtn. DM list header → 46px (P18). Files: app/screens/dms.js, styles/content.css. Verified:
  all four sections render inline (no Friends button), friend-click opens a conversation, accept
  runs, 0 pageerrors both themes. Committed 039236c. (gallery.html mirror skipped per owner.)
NEXT: back to P12 (density: modals/dialogs/toasts — 3-version batch), then P15 (status→profile,
  presence kept simple).
GOTCHA Z: dms.js had a live latent bug — addByUsername() was called (list add field) but never
  defined; now defined + wired to addFriend. Watch for other dangling refs when a screen is
  refactored in halves.

## 2026-08-30 — P12 (in progress) — dialog density batch built, awaiting pick
IN PROGRESS: P12 density (modals/dialogs/toasts) — the frame is already tight; built a 3-density body
  comparison (docs/design/p12-density.html): the New-server dialog + a confirm at V1 Tight (row gap 8,
  field 6/10, body 10/14) / V2 Balanced (10, 7/11, 12/14) / V3 Current (12, 8/11, 12/16). Awaiting the
  owner's pick, then move the hardcoded inline margin-top:12px row spacing into ONE tunable class and
  apply the chosen density to .mbody/.field/.frow so every dialog matches. gallery mirror per owner.
NEXT: implement the picked P12 density; then P15 (status→profile, presence simple).

## 2026-08-30 — P12 done (owner: V1 Tight) — dialog body density
IN PROGRESS: (cleared)
DONE: applied V1 Tight dialog-body density. CSS (primitives.css, scoped to .modal so app-wide fields
  aren't touched): .modal .mbody padding → 10px 14px, .modal .field → 6px 10px. Row rhythm: the
  hardcoded inline margin-top:12px/14px on modal-body labels/rows dropped to var(--s2) (8px) at its
  source in shell.js (create/status), report.js, roles.js, workspace.js (forward/invite/notifications).
  Files: styles/primitives.css, app/shell.js, app/report.js, app/screens/roles.js,
  app/screens/workspace.js. Verified: /create dialog renders visibly tighter both themes, 0 pageerrors;
  deleted the p12-density.html scaffold. gallery mirror skipped per owner. Committed 0e33b0e.
NEXT: P15 (status → profile page; presence kept SIMPLE per owner — no forced yellow).
GOTCHA AA: inline styles beat class rules, so a CSS density rule can't override an inline
  margin-top:12px — the row gaps had to be changed at their JS source. Left settings/usersettings
  screen spacing (they're screens, not modals) alone.

## 2026-08-30 — P15 done — status moved to the profile page (simple)
IN PROGRESS: (cleared)
DONE: the status editor now lives inline on the owner's profile hero — a dense row: plain text field
  (emoji dropped) + a simple presence SelectPill (Online/Idle/DND/Invisible) + Save (setStatus,
  emoji:null, no auto-clear). Presence dots stay monochrome (--ink/--muted/--danger), no new colours
  per owner. Viewers see a read-only status line (dot + text) via whoKids. Removed the old rail/modal
  openStatus composer (emoji + auto-clear) + its unused SegmentedControl/SelectPill/setStatus imports
  in shell.js; usersettings "Set a status" now routes to the profile. loadProfile selects
  status_text/presence_state. Files: app/screens/profile.js, app/data.js, app/screens/usersettings.js,
  app/shell.js, styles/content.css. Verified: owner profile shows [Presence ▾][text][Save], 0
  pageerrors both themes. Committed 4397ab0.
NEXT: density sweep beyond dialogs (owner asked re toasts/screens/other elements) — verify toasts,
  sweep .menu rows + shared list/screen elements. Then remaining round-7 (P11 typed tags, P14 view
  modes, P16 upload progress, P19 unread) + P3/P20.

## 2026-08-30 — density sweep beyond dialogs (toasts/menus verified, upload sheet tightened)
IN PROGRESS: (cleared)
DONE: audited the shared floating elements for the owner's "toasts/screens/other elements" question —
  toasts (.toast padding --s2/--s3 = 8/12) and menu rows (.menu button padding 6px 10px) are ALREADY
  at the tight/dense spec (no change). Tightened the upload sheet to match the V1 dialog density it
  had drifted from: .fl label margin 14→8 (var(--s2)), .dropzone vertical padding 22→16, .addmore
  16→12. Upload is session-gated (can't open in demo) → QA-CHECKLIST note. content.css verified intact
  (explorer renders 0 pageerrors). Files: styles/content.css. Committed fe0d394.
NEXT: remaining round-7 — P11 (typed tags, needs a schema decision), P14 (view modes = density
  levels), P16 (upload progress), P19 (unread indicator); plus P3 (loading affordance), P20 (paginate).

## 2026-08-30 — round-8/9/10 owner nitpick sweep (large batch, all on preview)
IN PROGRESS: (cleared)
DONE: worked the master-todo frontend queue + three rounds of owner nitpicks, each verified the
  deterministic way (node --check + headless demo asserts; live-only paths → QA-CHECKLIST).
  - Queue items: P4 (cut post-commenting, KEEP Feed — owner override), P3 (busyOverlay/withBusy),
    P20 (channel message pagination + load-earlier, preserves B3 permalinks), P19 (unread indicator
    + channel_unread_counts RPC, schema-34/migration p25), P11 (typed colour-coded tags, owner picked
    the V2 soft-chip from a 3-version review artifact; --tt-* tokens; app/tags.js), P16 (real upload
    progress bar). Commits 8dc7afd·50b8bb3·40404f6·ec7abec·285e639·40f918e.
  - Search-bar density: one dense .field.searchbar height app-wide (bb58d48).
  - Upload flow rebuild: fixed a TDZ ReferenceError (addFiles/fmtSize used before their let/const
    init) that blanked the pre-seeded dropzone; renderChosen now shows a real file-list UI; DnD moved
    to the whole .dropwrap; progress has no minimize button/no text tips; clicking off the sheet
    floats the chip (onClose) so the upload finishes in the background. (aef77fe)
  - Round-9: B22 rail active pill (visible for icon-servers), B21 loadRail only caches on read success
    (was caching transient-empty rails → reload needed), B20 upload chip inverse + right-aligned above
    the exfab, P25 total upload size, B15 deselect hardening (01cae8f); B17 rAF smooth playhead + B18
    skip buttons grouped right (f1333a4).
  - Round-10: B16 removed the .cardsel white square (selection = media outline), B23 baseName() strips
    the extension on titles, B24 card title reserves 2 lines so the grid tiles evenly, B26 folder
    single-click selects / double-click opens (state.selFolder), B27 fixed-width tabular selection
    counter, B29 details metadata wraps cleanly (85de22c); B25 _folderStore persists the open folder
    across re-mount, B28 draggable/persisted tree resizer, P26 tag ✕ hover-overlay + click-a-tag →
    filter the whole library to that tag (facet filters now flatten the tree) (d6415c5).
  Backend touched: schema-34 channel_unread_counts (migration p25, applied + role-sim verified).
NEXT: the remaining bigger clusters (still open in TODO): upload-at-scale (K11 streaming/chunked
  hashing+PUT, P22 per-file tag/rename list, P23 folder tags), real in-depth search (P24, folds in
  P21 modifiers + B19 tag-inclusion), P14 view densities, B14 media-player state persistence. B12
  (@mentions) skipped by owner; B9 live-QA. B16's root cause was the checkbox — done.

## 2026-08-30 — K11 large-file upload (streaming/chunked hashing + capped concurrency)
IN PROGRESS: (cleared)
DONE: uploads no longer read the whole file into memory. New app/hash.js carries a chunked
  incremental SHA-256 (sha256File) — reads the file in 8 MB file.slice() windows, updates a pure-JS
  SHA-256, drops each window → live memory ~one chunk, not the whole file (WebCrypto has no streaming
  digest, so crypto.subtle can't do this). Digest is byte-identical to crypto.subtle (verified vs the
  FIPS "abc" vector, the empty digest, and random buffers across every chunk/block boundary — both in
  node and in-browser), so a blob still dedups by the same <sha>.<ext> R2 key. Added mapLimit and
  capped hashing + the PUT loop at 3 concurrent (was Promise.all over the whole folder → one socket
  per file + every file on the heap); blob refs drop as each PUT settles. Hashing now drives the
  0–15% progress band by real bytes. app/screens/upload.js doPost rewired; old whole-file sha256Hex
  removed. node --check clean; demo load 0 pageerrors; hash cross-check green. Commit <sha>.
NEXT: P22 (per-file tag/rename list in the upload sheet), then P24 (real server-side search, folds in
  P21 modifiers + B19 tag-inclusion), P23 (folder tags), B14 (media-player state), P14 (view densities).
GOTCHA: sha256File's hex() writes the SHA padding, so it's single-use per Sha256 instance — call it
  once. mapLimit preserves result order via fn(item, i); the sign response indexes must stay aligned
  with `hashed` order (they do — hashing keeps input order).

## 2026-08-30 — P22 per-file tag + rename in the upload sheet
IN PROGRESS: (cleared)
DONE: renderChosen now renders EVERY chosen file as an editable row — an inline rename input (edits
  the work title only, never the folder path, so a folder upload keeps its tree) + its own P11
  tagEditor. Per-row live state is captured in fileMeta[i] (getTitle/getTags), aligned to `files`.
  doPost reads each file's own title + tags (was one shared Title + Tags; a structured folder used to
  carry NO tags — now each file carries its own). Removed the shared Title/Tags fields from "Add
  details"; that pane is now Collaborators only and shows only for a single loose post. List DOM
  capped at 60 rows; files past the cap upload with their name + no tags (noted in-row). CSS:
  .chosenrow is a column (name line + tags), .chosenname is a small field, per-row tag hint hidden.
  Verified: upload.js module graph loads 0 pageerrors; 3 tag editors seeded with different tags return
  independent getTags() (bpm:120|lofi / key:F min / genre:house|warm|dark). Live per-file tag/rename
  on a real upload → QA-CHECKLIST §12. Commit <sha>.
NEXT: P23 (folder tags — a folder gets its own tags, NO inheritance to children; needs a folder-tags
  store + RLS/RPC, folder card/details editing, and taggable subfolder rows in this upload list),
  then P24 (real server-side search). B14 (media-player state) also open.
GOTCHA: renderChosen rebuilds on every addFiles, resetting per-file edits — intended (the file set
  changed). syncVis toggles the collaborators pane; it must run after addFiles (it does).

## 2026-08-30 — B14 media keeps playing across navigation (no dock, owner-clarified)
IN PROGRESS: (cleared)
DONE: media no longer resets when you leave a screen and return. New app/player.js owns the single
  live MediaPlayer wrap OUTSIDE #stage. The details viewer plays THROUGH playInto(); closeDetails
  (nav/✕/Esc) calls onViewerClosing(), which — if still playing — moves the SAME wrap into a hidden
  off-screen host (.playerkeep) that stays IN the document so the browser keeps it playing (a removed
  media element is force-paused per the HTML spec, so detaching would stop it — this was the trap;
  the fix is to keep it attached but hidden). Reopening the file re-adopts the live wrap inline at its
  current position (resyncHead restarts the head loop). A paused/ended file stops on close. Owner
  clarified they do NOT want a visible mini-dock — the dock UI is written but PARKED behind
  DOCK_ENABLED=false ("save the code for later"). Full audio, not muted (muting was test-only).
  Verified headless: plays -> switch away -> currentTime keeps advancing off-screen (still playing)
  -> reopen re-adopts same element, position preserved, still playing; paused-close stops; boot both
  themes 0 pageerrors. Commit <sha>.
NEXT: URL-addressable view state (owner ask): opening a FOLDER and opening a FILE must change the URL
  so returning/reloading restores the view (fixes "leave an open folder, come back to root") AND
  links to a folder/file work. Then P24 (real search), P23 (folder tags), P14 (view densities).
GOTCHA: keep-alive REQUIRES the element stay connected to the document — do NOT "optimise" it by
  detaching the wrap; the browser pauses a disconnected media element. .playerkeep is off-screen, not
  display:none-removed. resyncHead must run after every reparent or the playhead freezes while audio
  plays.

## 2026-08-30 — explorer view state in the URL (folder + open file) — owner ask
IN PROGRESS: (cleared)
DONE: the explorer's folder + open file now live in the URL, so a reload / deep link / back-forward
  restores the view and links actually work (owner: "i want the URL to change when i'm in a folder /
  have opened a file"). Opening a folder writes ?folder=<id> (pushState → Back walks up the path);
  opening a file writes ?file=<id> and closing removes it; view-mode writes ?view=. main.js reads
  ?file= → view.fileId; renderExplorer restores the open folder from the URL and reopens the ?file=
  viewer after paint (which, via B14, adopts still-playing media). Repurposed the dead filesHref into
  explorerUrl/explorerBase; added syncUrl (bails when navigated off the explorer so a close-on-nav
  can't clobber the next route). details.js gained an onClose ctx hook (the viewer close clears
  ?file=). REMOVED the in-memory _folderStore (B25's first mechanism) — it lost state on reload and
  overrode the URL (it defeated Back-to-root by re-restoring the last folder); the URL is the single
  source of truth now. Verified headless: open folder→?folder=, open file→?file=+sheet, close→cleared,
  reload→both restored, Back→root; boot both themes 0 pageerrors. Commit <sha>.
NEXT: same URL treatment could extend to a file opened from the Feed/Profile (details onClose hook is
  already generic) — not wired yet. Then P24 (real search), P23 (folder tags), P14 (view densities).
GOTCHA: the URL must be authoritative — do NOT reintroduce an in-memory folder cache that overrides
  it. syncUrl guards on location.pathname===explorerBase so a nav-away close doesn't rewrite the new
  route. openFile sets state.openFileId AFTER openDetails so the prior pane's onClose (which clears it)
  runs first.

## 2026-08-30 — P24 (backend) real file search RPC: search_files (migration p26)
IN PROGRESS: P24 frontend (modifier parsing + call the RPC) — backend landed + verified.
DONE: schema-35-search-files.sql applied live as migration p26_search_files. New search_files()
  (SECURITY INVOKER — RLS = can_read_work fences visibility) does server-side matching built for
  scale: full-text over the filename (works.search_tsv, GIN) UNIONed with tag-contains (B19), plus
  P21 structured modifiers — exact tags (p_tags, ALL must match), has-a-tag-type (p_hastypes,
  "hastag:"), extension facet (p_exts), uploader, date-since — sorted (latest/oldest/name/size/
  tag-value for "sortby:bpm_desc") and paginated (limit/offset, total count returned per row).
  Returns the card fields + aggregated tags + author handle/name + folder_id + channel_name. Enabled
  pg_trgm (extensions schema) + a trigram GIN on content_tags(tag) for ILIKE tag matching at scale.
  Verified via role-sim against the REAL live data (owner has 195 personal works; VERIFICATION.md's
  "0 works" is stale — it's 202 now): personal_total=195, page cap 60, text "willow"→4 (FTS), wav
  ext filter=3=direct count, name sort asc/desc correct, pagination distinct, server scope=1, exact
  tag "dumb"=1, and a NON-MEMBER sees 0 of the server's works (RLS fence). Security advisors: no new
  issue (search_files is INVOKER; not in the definer-executable list). Commit <sha>.
NEXT: P24 frontend — parse "bpm:120 / hastag:bpm / sortby:bpm_desc" in the explorer search bar,
  colour a recognised typed token, include tags in free text, REMOVE the P21 Tag-type facet, and
  call search_files in live mode (client-side fallback in demo) with a "load more" pager.
GOTCHA: search_files is SECURITY INVOKER — do NOT switch it to DEFINER (RLS is the fence). The
  p_source/p_server predicate only SCOPES; RLS still filters. tag-value sort strips non-numerics from
  the value then casts (nulls last), so "sortby:bpm_desc" orders by the numeric bpm.
