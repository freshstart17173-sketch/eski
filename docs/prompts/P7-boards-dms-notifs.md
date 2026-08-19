# P7 — Messages (DMs) · Notifications

7 prompts. Law = the `dms` and `notifications` screens in
[`../design/gallery.html`](../design/gallery.html). Reuse P3 primitives + P4/P5
renderers. Each `[UI]` is **done when** it matches the gallery desktop + mobile;
`[GL]` asserts a live round-trip. Shared guardrails: see [README](README.md).

> **Boards cut (beta, 2026-08-18e).** Kanban boards and their prompts (old
> P7.1–P7.4, P7.10) are removed with the feature; this phase is now DMs +
> Notifications only. The filename is kept so existing links resolve.

---

### P7.1 [UI] — DM thread list + add-by-handle
**Add-by-handle field inline** at the top (not a modal), friends/requests surface,
thread list (pinned + DMs, unread dot, mute/pin). **DONE:** the add field is
inline; threads show unread/mute/pin; matches the `dms` screen left column.

### P7.2 [UI] — DM conversation
Messages + composer (attach, send); header with (v2, disabled) call buttons.
**DONE:** messages render; composer sends; call buttons are present but disabled
(v2); mobile = full-screen.

### P7.3 [GL] — DM round-trip
`create_dm(handle)` (friendship-gated) → find-or-create channel; send inserts
`dm_messages`; subscribe for live delivery. **DONE:** DMing a friend opens/creates
the channel; a non-friend is refused; a sent message appears live for both.

### P7.4 [UI] — Notifications screen
Tabs (All / Mentions / Threads / Saved), rows by kind (mention / comment / join /
reaction) with links to target + inline reply, grouped by day, mark-all-read.
**DONE:** tabs filter; a row links to its target; inline reply posts; matches the
`notifications` screen.

### P7.5 [GL] — Live bell
Subscribe `user:{id}` (Postgres changes) → `notifications` insert increments the
bell; mark-all sets `read_at`. **DONE:** a new notification bumps the badge live;
mark-all clears it; inline reply reuses `messages`/`comments`.

### P7.6 [UI] — Friend requests + friends management
The requests surface: accept/decline (`respond_friend`), pending outbound, block.
**DONE:** accepting moves a request to friends; declining removes it; block hides
the user.

---

**End of P7.** P8 builds the admin surfaces.
