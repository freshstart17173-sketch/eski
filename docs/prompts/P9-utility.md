# P9 — Utility & focus screens

9 prompts. Law = the `create`, `join`, `auth`, `deadinvite`, `denied` screens +
the 404 card + the quick-switcher in [`../design/gallery.html`](../design/gallery.html).
**All focus/system screens are centered cards on a dimmed scrim with no rail**
(CANON §D.6.4, updated), no drop shadow. Each `[UI]` is **done when** it matches
its panel and every listed state is reachable. Shared guardrails: see
[README](README.md).

---

### P9.1 [UI] — Focus-screen scaffold
The shared scrim frame: full-viewport dimmed backdrop, card centered both axes, no
server rail (a `focusmode` state hides it). Owns `.onboard`/`.authwrap`. **DONE:**
any focus screen renders centered on the scrim with no rail and no card shadow;
matches the create/auth layout.

### P9.2 [UI] — Create server card
Server name, square cover upload, seed starter channels, "an invite link is
created with the server", Create/Cancel. **DONE:** matches the `create` panel;
creating calls `servers` insert + seeds `roles`/`member_roles` (owner = all-flags).

### P9.3 [UI] — Join by link (preview)
`/join/:code` valid: cover, name, member count, "X invited you", Join. **DONE:**
matches the `join` panel; Join calls `join_via_invite`; a dead code routes to P9.5.

### P9.4 [UI] — Sign in / sign up
Email + magic-link (`signInWithOtp`), passkey option, sign-in ⇄ sign-up toggle,
"check your email" step, error line under the field. **DONE:** matches the `auth`
panel; sending shows the sent step; the "eski" wordmark sits on the scrim in the
on-ink colour.

### P9.5 [UI] — Dead invite
`/join/:code` invalid: states **expired / revoked / full / already-a-member**,
each its own copy + CTA. **DONE:** matches the `deadinvite` panel; the state is
chosen from the `join_via_invite` error; "already a member" offers Open the server.

### P9.6 [UI] — Access denied
A private channel/server you can't see (`can_view_channel` false): quiet "you don't
have access" — **never a 404 that leaks existence**. **DONE:** matches the `denied`
panel; it is deliberately not a 404.

### P9.7 [UI] — 404 / not found
Bad URL: glyph, "this page doesn't exist", back-to-Feed. **DONE:** matches the 404
card; the catch-all route (P0.1) renders it; it never reveals whether a private
thing exists.

### P9.8 [UI] — Quick switcher (⌘K)
Overlay over any screen: query field, result groups (servers / channels / people /
files), keyboard nav (↑↓/⏎), recent + jump-to when empty. **DONE:** ⌘K opens it;
results are keyboard-navigable; matches the `search` screen.

### P9.9 [GL] — Quick-switcher search
`search_all(q, scope)` scoped to what the caller may see (`can_view_channel`).
**DONE:** results span servers/channels/people/files; a private channel the caller
can't view never appears; ⏎ routes to the selected result.

---

**End of P9 — and the queue.** With P0–P9 built and each prompt's DONE-WHEN green,
the app matches the gallery and the fence holds under RLS. Burn-down is tracked by
flipping the gallery inventory statuses (`t`→`a`→`m`) as each prompt lands.
