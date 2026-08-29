# eski — bug / polish log (owner test pass 2026-08-28)

Issues the owner hit testing preview.eski.lol, with root-cause triage. Fixes land on
`preview`; each is checked off here as it ships. `[infra]` = depends on your R2 / SMTP /
Stripe setup, not code. See [`BUILDLOG.md`](BUILDLOG.md) for the per-commit detail.

Severity: **P1** breaks or badly misleads · **P2** wrong but usable · **P3** polish.

---

## Owner test pass 2026-08-29 (round 3)

- [ ] **P1 · Beta scope cut — social features to post-beta.** Drop the **main Feed** and
      **post commenting** from the beta. **Public posts still exist**, but are reached by
      going to a user's page directly (the profile **Public** shelf), not through a global
      feed. Work: remove Feed from the home/rail nav and the `feed` route; remove the public
      comment thread from the Details pane (keep the post itself). Mirror the cut in
      **CANON** and **CLAUDE.md** the way the 2026-08-18 canvas/kanban cut is recorded, so
      the contract matches. (They "may return post-beta.")
- [ ] **P1 · Server icon + cover don't update in the server, regardless of upload.**
      Uploading a server icon or banner in Server settings doesn't persist or render on the
      rail badge / server header. This is the known BUILDLOG gap ("NOT done: server
      icon/cover + profile banner upload") surfacing as a live bug: wire the
      upload → R2 (`api/sign.mjs`) → `servers.icon_key` / `servers.cover_key` → render path,
      and the same for the **profile banner** (`profiles.banner_key`).
- [ ] **P2 · No loading animations anywhere for async actions.** File upload (has a text
      progress card, but nothing else), **folder upload**, **changing pfp**, **uploading a
      server icon/banner** — none show a spinner / progress while the request runs, so it
      looks dead. Add one consistent busy affordance (a shared button-spinner + a light
      overlay) to every async action, applied everywhere, not case by case.
- [ ] **P2 · Friends and Messages shouldn't be separate screens.** Today Messages and
      Friends are two screens you swap between with the Friends button. Make them **one
      surface** — Friends lives inside the Messages pane (a tab / section in the same view),
      no full-screen context switch to see your friends.
- [ ] **P2 · Empty-state / placeholder text must be centered in its own pane.** The default
      text (channel "This is the start of #…", empty explorer, empty DM/feed, etc.) sits
      **too high** — center it **both vertically and horizontally** within the specific pane
      it occupies. Applies to **every** piece of text like this, globally. (Refines the
      earlier "too much vertical space" fix — the answer is *centered in the pane*, not
      top-anchored.)

> **Round-2 reconciliation (2026-08-29):** most of the round-2 quick-wins + build items
> below shipped — composer toolbar trimmed, rail avatar, dead Settings tab → `/settings`,
> home "e!" logo, dense empty-state copy, members-toggle persistence, Edit-profile-in-
> settings, perf **preconnect**, **global search** (`/search`), **drag-and-drop + flatten**
> (folders included), Pins **Unpin** + Files filters (commits `8e37ce0` `bcca4a1` `a77976c`
> `db85d56` `11b8318` `cb07783` `0e9dffd`). **Still open** from round 2: **modal
> scrim-click-to-close** on every modal; **dedupe `profiles`** fetch + **defer Storage/
> Privacy reads** in settings; **verify no URL breaks on rename**; some **Feed nav stubs**
> (moot for the ones under the social cut above).

## Owner test pass 2026-08-28 (round 2) — full button audit in [`BUTTON-AUDIT.md`](BUTTON-AUDIT.md)

Quick wins (fixing this pass):
- [ ] **Composer toolbar removed** — the B/I/S/code/link/list/quote formatting buttons aren't
      wired (no `/`-functions yet). Keep only **attach · @ · send**.
- [ ] **Server rail avatar reverts to initials** — the workspace `me` drops `avatar_key`; add it.
- [ ] **Profile "Settings" tab is dead** ("one of the settings buttons doesn't work") — it toasts
      "(P9)"; navigate to `/settings`, which now exists.
- [ ] **Feed nav stubs** — Notifications / You / Type / Sort / Find-friends toast placeholders;
      wire them to the real screens/actions.
- [ ] **Home rail button → the "e!" logo** instead of the home glyph.
- [ ] **Empty-state copy isn't dense** (e.g. "No results / Nothing here matches …") — tighten.
- [ ] **Members rail toggle doesn't persist** — it reopens after closing; remember the choice.
- [ ] **Move Edit profile into Settings** — open the editor from the settings Profile panel.
- [ ] **Modals close on a click where they opened** — ensure scrim-click closes every modal;
      single modal instance at a time.

Perf (from the HUD report — backend latency, not the app):
- [ ] **Preconnect** to the Supabase origin + `cdn.eski.lol` in `index.html` (saves the ~160ms
      cold connect on the first fetch).
- [ ] **Dedupe `profiles`** — `loadUserSettings` re-fetches what `loadRail` already has; reuse it.
- [ ] **Defer the Storage/Privacy reads** in user settings until their panel opens (the initial
      Profile render shouldn't wait ~700ms on `storage_meters`/`storage_balance`/`friendships`).
- [ ] Base per-fetch latency is ~350–700ms (Supabase region/free-tier). If it stays high after
      the above, consider the project's region vs. your location — an owner/infra call.

Bigger build items (added to the list, not done this pass):
- [ ] **Global search screen** (`/search`) — currently the placeholder; build it (the ⌘K
      quick-switcher exists but the full search screen isn't ported).
- [ ] **Drag-and-drop everywhere** — drop files onto the explorer / a channel / the feed to
      upload, with multi-file + inline tagging, and a **"flatten folders"** view so every file
      across subfolders is exposed for quick bulk tagging.
- [ ] **Verify no URL breaks on rename** — profile handle change replaceStates the current URL
      (server/channel URLs are id-based, so they're safe); confirm + cover any gap.
- [ ] **Pins "Unpin" + Files-tab Type/Sort filters** in the workspace are dead controls — wire
      or remove.

## Open

- [ ] **P1 · (partial) Modal routes.** `/create`, `/upload`, `/s/:id/settings` still
      render the "not yet ported" placeholder if navigated to directly — but in normal use
      each opens as a proper modal (create/join-by-link from the ＋ menu, upload from the
      toolbar, server settings from the server menu), so these aren't reached by clicking.
      `/join/:code` — the one dead route users *did* hit (invite links + notifications) —
      is now a real screen (see Done). Remaining: a follow-up so a directly-typed
      `/create` · `/upload` · `/settings` URL opens its modal over the shell instead of the
      placeholder (low priority — not a click path). Enhancement: an anon-readable
      `preview_invite(code)` RPC so the join card can show the server name · member count ·
      inviter (QA §20) instead of the generic copy.
- [ ] **P2 · Remaining stubs are genuine features.** Details "Posted by", user settings,
      and set-status are now real (see Done). Still stubbed because their feature isn't
      built: **Report** (moderation reports — `reports` table exists, self-contained, the
      easiest next), **storage "manage"** (needs Stripe/billing). These signpost "coming",
      not broken.
- [ ] **P3 · Slow loading; avatars pop in after seconds.** Backend is NOT the cause — the
      perf advisor shows no slow queries (small DB); the two duplicate indexes it flagged
      are dropped (schema-20). So this is frontend: read waterfalls + `cdn.eski.lol` image
      latency. **Now measurable:** the perf HUD (Appearance settings → performance overlay,
      or `?perf=1`) captures real load timings + slowest resources; send a Copy report and
      I'll act on the numbers (parallelise reads / preconnect the CDN / size the avatars).

## Feature requests (from the owner)

- [ ] **Required tags / post fields per channel.** A channel can require every upload to
      carry certain tag fields before it posts — e.g. a producer server's `#samples`
      channel requires **BPM** and **Key** on every file. Not free-text tags: named fields
      the uploader fills quickly in the upload sheet, enforced so a post can't go up without
      them. Scope to sketch: (1) schema — a per-channel `required_fields` list (name +
      optional type/options, e.g. Key = a note picker); store the filled values as
      structured tags on the work (or a `work_fields` table) so they're filterable in the
      explorer. (2) admin — set the required fields in channel settings. (3) upload — when
      posting to such a channel, render the fields and block Post until they're filled. (4)
      RLS/trigger — enforce server-side so the fence isn't just the UI (a `works`/placement
      trigger that rejects a post missing a required field). Filterable by field in the
      explorer once stored. → tracked as a build item; not started.

## Done

- [x] **User settings + set-status built** (were stubs). `/settings` screen (Profile ·
      Account · Appearance · Notifications · Privacy/blocked · Storage) and a status
      composer (emoji + text + auto-clear + presence). Plus a perf HUD so load timings can
      be measured on the live site and sent back (the sandbox can't reach it). Dropped two
      duplicate DB indexes the advisor flagged (schema-20).
- [x] **P2 · "Reload needed for changes to show" — the visible cases fixed.** Upload now
      reloads the explorer/workspace on done (the new file/folder appears immediately, not
      after a manual reload). Structural mutations that were missing a cache-clear now have
      one so a `reload()` actually shows fresh data: `updateServer` (rename/icon),
      `createChannel` and `updateChannel` (sidebar list). (create/leave/delete/join server
      and profile edits already cleared it.) Realtime still covers live chat/DM/notif echo.
- [x] **P2 · Folder upload — now supported, structure preserved, server + personal.** The
      upload sheet gained an "upload a folder" picker (`webkitdirectory`). On post it
      recreates the picked tree (`buildFolderTree`, parents-before-children) under the
      destination and files each work into the folder its path names — server via
      `placement.folder_id`, personal via `saved_items.folder_id`. Folder uploads keep each
      file's own name and skip the single Tags/Collaborators fields. Tree logic unit-tested.
- [x] **P1 · Every modal sat on a GREY slab in dark mode.** The recurring "modal on a grey
      screen" — the real, pervasive cause (distinct from the placeholder routes) was the
      scrim: `background:var(--ink)` + a black overlay, but `--ink` is near-WHITE in dark
      mode, so it computed to grey. The scrim is now a translucent BLACK in both themes, so
      the page dims through it and the modal reads as lifted. Fixes the backdrop for ALL
      modals at once (edit profile, upload, create, invite, settings, join …).
- [x] **P1 · An uploaded image could break the layout.** Added a global `img{max-width:
      100%;height:auto}` floor + `overflow:hidden` on `.av`, so a photo of any size clips
      to its box / the avatar circle instead of overflowing the dialog.
- [x] **P2 · Profile photo now shows on the rail** (was initials-only; R2 confirmed set by
      the owner, so the photo serves). Handle propagation is driven by the same cache-clear
      + reload path that was already in place.
- [x] **P1 · File uploads failed silently (root cause found).** `works.blob_sha` has a
      FK to `media_blobs.sha256`, but `media_blobs` is RLS-locked with no write policy and
      nothing ever created the row — so every file upload violated the FK. (Profile photos
      worked because `avatar_key` has no such FK, which matches what you saw.) Added a
      SECURITY DEFINER `register_blob(sha, bytes)` RPC (`schema-19-register-blob.sql`),
      called after the R2 PUT and before the works insert; verified the full path
      (register → works insert → meter bump) end-to-end on the live DB. Also stage-labelled
      the upload errors with the DB/HTTP code + a console.error, so a failure is now
      greppable instead of opaque.
- [x] **P1 · Seed data purged (owner-approved, 2026-08-28).** The live DB held "Late
      Bloom LP" seeded with BOTH real accounts + 3 fake authors (`@seed.eski.lol`), which
      read as "accounts aren't separate" — confirmed *not* a security bug (accounts are
      RLS-isolated). Deleted the server (cascaded channels/messages/members/roles/works)
      and the 3 fake authors. DB now clean: only the two real accounts + their own servers
      (`test server`, `Test Server`). `seed-late-bloom.sql` marked RETIRED so it's not
      re-run. The `?demo=1` screenshot fixture (app/demo.js) needs no seed and is unaffected.
- [x] **P1 · Invite links / notifications landed on a dead grey screen.** `/join/:code`
      now renders a real invite card on a scrim (`screens/join.js`): signed-out → "Sign in
      to join" (the code is stashed and resumed after sign-in); signed-in → Join →
      `join_via_invite` → land in the server; a bad/expired/revoked code → an in-place
      dead-invite state with the reason + a way back. No more "not yet ported".
- [x] **P2 · Own avatar never showed on the rail.** The rail profile button rendered
      initials only; it now draws the uploaded photo with an initials fallback.
- [x] **P2 · Details "Posted by / Uploaded by" was a dead placeholder.** Now opens the
      author's profile (`/u/:handle`); `handle` threaded into the four `who` shapes.
- [x] **P3 · Dropdowns + multi-selects showed a ✓ tick for the selected row.** Now the
      selected row is shown by inversion (filled highlight + bold), matching the hover/
      click language, no tick glyph. (`ui.js` `openMenu`/`SelectPill`, `explorer.js`
      filter menus, `primitives.css`.)
