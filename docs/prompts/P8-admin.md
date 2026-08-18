# P8 — Admin

14 prompts: server settings and its panels. Law = the `settings` screen + its
panels in [`../design/gallery.html`](../design/gallery.html) and the admin dialogs
in §⑤. Every perm-gated control reads `has_perm`/`can_view_channel` so the
signpost matches the fence. Each `[UI]` is **done when** it matches its gallery
panel and the gate hides it for a member without the perm. Shared guardrails: see
[README](README.md).

---

### P8.1 [UI] — Settings shell + nav
Left nav (General / Channels & boards / Members / Roles / Moderation / Audit log /
Invite links / Storage & billing / Delete server) + the panel area. **DONE:** nav
switches panels; a nav item is hidden when its perm is absent; matches the settings
shell.

### P8.2 [UI] — General panel
Server name, cover, description; Delete server (owner, confirm modal). **DONE:**
edits persist; Delete is owner-only behind a named-consequence confirm.

### P8.3 [UI] — Channels & boards panel
Channel list (drag to reorder) + per-channel settings: who-can-post, slow mode,
**Private toggle → reveals the allow-list (P8.6)**. **DONE:** reordering persists
(`position`); toggling Private reveals the allow-list; matches the panel.

### P8.4 [UI] — Roles editor
Roles list (colour dot, name, member count; `@everyone` pinned + un-deletable;
drag to reorder), New role, colour swatches (from the 30 member hues),
**permission matrix** grouped Server / Members / Content with `.cbx` toggles.
**DONE:** editing a role's flags writes `roles.permissions`; `@everyone` edits the
baseline; matches the Roles panel; gated `manage_roles`.

### P8.5 [UI] — Assign-roles-to-member modal
From the role chip on a Members row / the member popout: a **multi-select checklist**
of roles (member holds several), `@everyone` checked + locked. **DONE:** matches
"Assign roles to a member"; toggling writes `set_member_roles`; `@everyone` can't
be unchecked; gated `manage_roles`.

### P8.6 [UI] — Channel permissions (allow-list) modal
Appears when a channel is Private: Roles + Members sections (`.cbx` each) + add
field. Empty list = open to all. **DONE:** matches "Private-channel allow-list";
granting writes `set_channel_access`; the fence is `can_view_channel`, not this UI;
gated `manage_channels`.

### P8.7 [UI] — Members panel
Member list with role chip (→ P8.5) + remove; counts. **DONE:** matches the Members
panel; the role chip opens the assign-roles modal; remove is gated (`kick`).

### P8.8 [UI] — Moderation panel
Active timeouts (Lift), Banned (Unban), Take-action (time out / ban a member).
**DONE:** matches the Moderation panel; actions call the P2.9 RPCs and are gated by
`timeout`/`ban`; each writes an audit row.

### P8.9 [UI] — Audit log panel
Every admin action, newest first, kept 90 days; row = actor, action, target,
context, time. **DONE:** matches the Audit panel; reads `audit_log`; gated
`view_audit`.

### P8.10 [UI] — Invite links panel
List (link, uses/expiry, copy, revoke) + New invite link. **DONE:** matches the
panel; create/revoke gated `manage_invites`/`create_invite`; copy shows a toast.

### P8.11 [UI] — Storage & billing panel
**Personal** usage bar (your public + private works) and **this server's** usage
bar (billed to the owner), Manage plan / Add storage, Export. **DONE:** matches the
"Storage & billing" panel; bars read `storage_meters` per pool; Manage plan is
gated `manage_billing`/owner.

### P8.12 [GL] — Perm-gated visibility wiring
A shared `hasPerm(serverId, flag)` function (reads the caller's roles); every admin
control calls it so the UI matches `has_perm`. **DONE:** a member without a flag sees neither the control nor
its nav item; the owner sees all; toggling a role's flags updates what the member
sees.

### P8.13 [GL] — Billing/export actions
Manage plan / Add storage open the billing flow (`billing_accounts`); Export runs
`export_manifest` → client zips (JSZip). **DONE:** export produces a zip of exactly
the readable works + metadata; billing actions are owner/`manage_billing` only.

### P8.14 [UI] — Confirm & prompt modals (admin)
The destructive-confirm (named consequence, danger primary) and single-field
prompt (rename, new label) reused across settings. **DONE:** match the global
Confirm/Prompt panels; destructive actions always route through Confirm.

---

**End of P8.** P9 finishes with the focus and system screens.
