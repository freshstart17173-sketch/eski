# eski — bug / polish log (owner test pass 2026-08-28)

Issues the owner hit testing preview.eski.lol, with root-cause triage. Fixes land on
`preview`; each is checked off here as it ships. `[infra]` = depends on your R2 / SMTP /
Stripe setup, not code. See [`BUILDLOG.md`](BUILDLOG.md) for the per-commit detail.

Severity: **P1** breaks or badly misleads · **P2** wrong but usable · **P3** polish.

---

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
- [ ] **P2 · Profile photo + handle don't propagate** (rail/main still shows the default).
      Two possible causes to split: (a) `[infra]` avatars need R2 serving — if the R2
      env vars / CORS aren't set, `avatarUrl` 404s and falls back to initials (looks like
      "still default"); (b) the shell rail may not rebuild from fresh identity after an
      edit. **Fix:** verify the R2 path end-to-end; make identity edits reliably repaint
      the rail without a reload.
- [ ] **P2 · Uploads fail with no usable error.** `upload.js` surfaces `e.message`, but an
      R2 PUT that CORS-fails or 4xxs gives an opaque message. **Fix:** surface the HTTP
      status + a CORS/env hint from `api/sign.mjs` + the PUT; distinguish "signer failed"
      from "R2 rejected". Partly `[infra]` (R2 env/CORS must be set — see OWNER-TODO).
- [ ] **P2 · Folder upload doesn't work / isn't supported.** The upload sheet's
      Files/Folder toggle exists but folder upload isn't wired. **Fix:** implement
      `webkitdirectory` folder selection + preserve the relative folder tree on upload.
- [ ] **P2 · Reload needed for changes to show.** Several mutations don't repaint their
      view (realtime covers only chat/DM/notifs). **Fix:** every mutation optimistically
      updates its list or calls `router.reload()`; audit each screen's actions.
- [ ] **P2 · Dead / stubbed buttons on "done" screens.** Real stubs found: the details
      pane "Uploaded by / Posted by" author link only toasts instead of opening the
      profile (a regression — the profile screen exists); Report → "(P8)"; profile
      Settings tab → "(P9)"; explorer storage "manage" → "(P8)". **Fix:** wire the ones
      with real targets now (profile link); keep genuine P8/P9 as an explicit "coming"
      signpost, and audit every screen for more silent stubs.
- [ ] **P3 · Slow loading; avatars pop in after seconds.** Read waterfalls + per-avatar
      network with no caching. **Fix:** parallelise the initial reads, cache identity, and
      confirm R2/CDN latency (`cdn.eski.lol`). Partly `[infra]`.

## Done

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
