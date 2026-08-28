# eski — bug / polish log (owner test pass 2026-08-28)

Issues the owner hit testing preview.eski.lol, with root-cause triage. Fixes land on
`preview`; each is checked off here as it ships. `[infra]` = depends on your R2 / SMTP /
Stripe setup, not code. See [`BUILDLOG.md`](BUILDLOG.md) for the per-commit detail.

Severity: **P1** breaks or badly misleads · **P2** wrong but usable · **P3** polish.

---

## Open

- [ ] **P1 · Modals render as full grey screens.** `/create`, `/join`, `/upload`, and
      `/s/:id/settings` aren't wired as overlays — they fall through to the "not yet
      ported" placeholder (`main.js` `IN_SHELL` + the fall-through). They should open as
      a scrim modal over the current shell, never a grey screen. **Fix:** route these to
      the real modal (or redirect + open it), never the placeholder.
- [ ] **P1 · Seed/demo data pollutes real testing + looks like accounts merging.**
      *Not a security bug* — confirmed via SQL that accounts are isolated ("Test Server"
      holds only `fresh`, "test server" only `dexter`). The culprit is the **live seed**:
      "Late Bloom LP" was seeded with *both* your accounts + 3 fake authors
      (`rae/dev/tomo@seed.eski.lol`), so both accounts see it → looks merged. **Fix (needs
      your OK — destructive):** purge Late Bloom LP + the seed authors + their works from
      the live DB so testing starts clean.
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

- [x] **P3 · Dropdowns + multi-selects showed a ✓ tick for the selected row.** Now the
      selected row is shown by inversion (filled highlight + bold), matching the hover/
      click language, no tick glyph. (`ui.js` `openMenu`/`SelectPill`, `explorer.js`
      filter menus, `primitives.css`.)
