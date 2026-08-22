# Gap analysis — screens, buttons & links that should exist but don't

Brainstormed 2026-08-21 against the current `gallery.html` (20 screens + 10
dialogs/menus). Answers "what's missing" for a codegen-ready contract. Two
tables: **screens/surfaces** and **buttons/links/menus**. Scored so we can
sequence the work.

> **Status 2026-08-22 — the backlog is essentially built.** Functional gaps
> shipped into the gallery: S1 (admin affordances — POV switcher later removed),
> S2, S3, S4, S5, S6, S7, S8, S10, S11, S12, S13, S14, and B1–B22, B24, B25, B26
> (B6 = the private-channel allow-list §C.18; B18 = the composer autocomplete;
> B22 = copy in the invite dialog). **S16** is covered by the auth *claim-handle
> + avatar* step. **B23** (drag-reorder channels in the column) and **S15** (voice
> mini-bar) are **built 2026-08-22** — B23 also wires the Settings → Channels rows and
> adds file→folder drag in the explorer; S15 ships as a WIP signpost (voice is still
> v2). **Still open:** **S9** the full **mobile gallery** (a separate file, see
> gallery-todo) · a **deep alignment & spacing pass** across every surface. The
> cross-cutting **exploded-view catalog panels** are tracked in gallery-todo
> (deprioritised by the owner).

**Scoring**
- **Need** ★1–5 — 5 = beta-blocking, 1 = nice-to-have / post-beta.
- **Effort** ●1–5 — 1 = trivial (reuse existing components), 5 = a whole new
  surface with logic.
- **CANON** — `none` = pure UI on existing model; otherwise the section + the new
  flag/table/RPC it needs (⚑ = a genuinely new feature to add to CANON before
  build).

What already exists (don't re-add): details pane, Share dialog, card/folder
context menus, upload sheet, storage modal, dl/save/emoji/message menus, lightbox,
thread pane, profile popover, the 20 screens listed in the catalog.

---

## A. Missing screens / surfaces

| # | Screen / surface | Need | Effort | How to implement | CANON |
|---|---|---|---|---|---|
| S1 | **Admin POV of the server** — the workspace/channel column/member rail as an **admin** sees it (create-channel +, gear on every channel, kick/ban on member hover, drag-reorder, "add channel/category"). | ★5 | ●2 | A POV switch like the profile one (#20): `[data-pov=admin/member]` on the workspace toggles admin-only affordances (already have the switcher pattern). | none — gates already in §B (`is_server_admin`, `manage_channels`) |
| S2 | **Create-channel dialog** | ★5 | ●2 | Small modal (reuse `.umodal`): name, type (text/voice), category, private toggle, allowed-file-types (#54), default folder (#53). Opens from the channel-column `+` and the server dropdown. | none (channels + #53/#54 exist) |
| S3 | **Invite-to-server dialog** | ★5 | ●2 | Modal like Share: an invite link + copy + expiry/max-uses, plus "invite by @handle". Opens from server dropdown / member rail. | none (`server_invites` exists) |
| S4 | **Friends manager** — one screen: Friends / Incoming requests / Outgoing / Blocked, with accept/decline/cancel/unblock. | ★4 | ●2 | New `friends` screen; reuse `.srow` list rows + the blocked/pending copy. | none (`friendships` statuses exist) |
| S5 | **Forward dialog** + forwarded-message rendering | ★4 | ●3 | Modal: pick channels/DMs (multi), optional note. And a `.fwd` message variant (quoted source: author + channel + snippet). | ⚑ §C — define the forward/crosspost-to-chat surface + how a forwarded work re-places (`placement`) |
| S6 | **Report / flag dialog** | ★4 | ●2 | Modal from the details-pane flag + message ⋯: reason radios + note + submit. | ⚑ §B/§7 — `reports` table + who reviews (admin/moderation) |
| S7 | **Channel notification settings** (per-channel + per-server mute) | ★4 | ●2 | A small menu/sheet: All / Mentions only / Nothing + Mute 15m/1h/until. From channel right-click + the server dropdown. | ⚑ §7 — `channel_prefs`/`server_prefs(user, level, muted_until)` |
| S8 | **New server: first-run / empty server** | ★3 | ●2 | The just-created server with no channels/files: a "create your first channel / upload" welcome state (reuse `.emptystate` #50). | none |
| S9 | **Full mobile layouts** — one pane + bottom tabs (CANON §C.2 already specs it; gallery is desktop-only). | ★4 | ●5 | A parallel set of mobile artboards (or a responsive pass). Big. | none (spec exists) — but large |
| S10 | **Connection-lost / offline / reconnecting** banner+state | ★3 | ●1 | A thin top banner (reuse the #46 banner pattern) + a disabled composer. | none |
| S11 | **Billing & receipts** (invoices, payment method, plan history) | ★2 | ●3 | A `billing` sub-panel under user settings storage; Stripe portal link + receipts list. | ⚑ §D.2 — Stripe customer/portal + `invoices` |
| S12 | **Help / support / keyboard-shortcuts** | ★2 | ●2 | A shortcuts sheet (⌘/ opens it) + links to docs/support. | none |
| S13 | **Slash-command & @mention autocomplete popovers** (the composer hint exists; the popovers don't) | ★3 | ●3 | An anchored list popover over the composer; slash list from `slash-commands.md`, mentions from server members. | none (list defined) |
| S14 | **Global search scoped views** — search *within one server / channel* vs global; "Jump to" a message result. | ★2 | ●2 | Add a scope selector to the search screen; a result → jump-to-message in the workspace. | none |
| S15 | **Voice channel *joined* mini-bar** (persistent "you're in the booth" strip while browsing elsewhere) | ★2 | ●2 | A slim bottom bar with mute/leave, shown across screens while in a call. (v2 — pairs with #56.) | none (v2) |
| S16 | **Onboarding / claim-handle flow after first sign-in** (auth exists; the "pick your handle + avatar" first-run doesn't) | ★3 | ●2 | A 1–2 step onboarding after `auth`. | none |

---

## B. Missing buttons / links / menus

| # | Control | Where | Need | Effort | How | CANON |
|---|---|---|---|---|---|---|
| B1 | **Server-name dropdown** (Invite · Server settings · Notification settings · Create channel · Create category · Edit server profile · Privacy · **Leave server**) | server header (`srvhd` — today it jumps straight to settings) | ★5 | ●2 | Replace the `data-s="settings"` jump with a `.menu` (reuse the menu system) | none |
| B2 | **Create channel `+` → dialog** | channel-column group headers (the `+` exists, does nothing) | ★5 | ●1 | Wire `+` → S2 | none |
| B3 | **Create category / channel group `+`** | channel column | ★3 | ●2 | Adds a collapsible group (needs a `categories`/group concept) | ⚑ §7 — `channel_categories` (or a `group` field on channels) |
| B4 | **Channel right-click menu** (Mark as read · Mute · Edit channel · Copy link · Invite · Notification level · **Delete**) | channel rows | ★4 | ●2 | Reuse the context-menu system (like cardMenu/folderMenu) | partial — mute/notif → S7 |
| B5 | **Edit-channel button** (rename + topic quick-edit) | channel header + B4 | ★3 | ●1 | Opens a small edit modal (or the channel's settings) | none |
| B6 | **Invite-to-channel** (add roles/members to a *private* channel) | private-channel settings + B4 | ★3 | ●2 | Role/member picker writing `channel_roles` | none (`channel_roles` exists) |
| B7 | **Channel-group collapse/expand** + **"hide muted / read" toggle** | channel-column group labels | ★3 | ●2 | Twisty on `.cglabel` (collapse) + a group toggle that hides muted/all-read channels | partial — the hide-muted rule needs S7's mute state |
| B8 | **Mark channel read / Mark all as read** | B4 + channel column header | ★3 | ●1 | Writes `channel_reads.last_read_at` | none (`channel_reads` exists) |
| B9 | **Member right-click / popover admin actions** (Message · View profile · Add friend · Roles ▸ · Timeout · Kick · Ban) | member rail (`.ppop` popover exists but lacks admin actions) | ★4 | ●2 | Extend the popover; admin rows gated by `is_server_admin` (shown in S1's admin POV) | none (RPCs exist) |
| B10 | **Forward** action | message ⋯ menu (`msgMenu`) + card ⋯ | ★4 | ●2 | Add "Forward" → S5 | see S5 |
| B11 | **Unpin** / **Pins tab actions** | Pins tab | ★2 | ●1 | Unpin button (admin/pinner) | none |
| B12 | **Mute/close/pin a DM**, **leave/rename a group DM**, **add people to a group DM** | DM list row menu + DM header | ★3 | ●2 | Row context menu writing `dm_members.muted/pinned`; group management RPCs | none (`dm_members` has muted/pinned) |
| B13 | **Block / Report** from another person's profile & DM | profile actions + DM header ⋯ | ★4 | ●2 | Buttons → S6 (report) / `friendships.status='blocked'` (→ blocked screen) | see S6 |
| B14 | **New DM / New group DM** button | DMs header (only "Add by username" exists) | ★3 | ●1 | Opens a member/friend picker → `create_dm` | none |
| B15 | **Notification bell → dropdown** (recent, mark-all-read) vs only the full screen | top-right bell | ★3 | ●2 | A `.menu`/popover preview of the notifications screen | none |
| B16 | **Jump to unread / new-messages divider / scroll-to-bottom** | chat body | ★3 | ●2 | A "new messages" divider + a floating jump button | none (`channel_reads`) |
| B17 | **Help button** | app chrome (rail foot or top-right) | ★2 | ●1 | Opens S12 | none |
| B18 | **Slash-command / emoji / @mention triggers** actually open their popovers | composer | ★3 | ●3 | Wire `/`, `:`, `@` → S13 popovers | none |
| B19 | **Trash actions** — Restore · Delete forever · Empty trash now | Trash view (empty state exists, actions don't) | ★3 | ●1 | Buttons on trashed rows + a header "Empty now" | none (soft-delete + 30d) |
| B20 | **Starred view content + unstar** | the Starred smart folder (routes nowhere yet) | ★2 | ●1 | Show a filtered grid; unstar from card menu | none (star exists) |
| B21 | **Switch account / add account / sign out everywhere** | user settings / avatar menu | ★2 | ●2 | Account list + session management | ⚑ §7 — multi-session / `sessions` |
| B22 | **Copy invite / copy server link** quick action | server dropdown + invite dialog | ★3 | ●1 | Clipboard from `server_invites.code` | none |
| B23 | **Reorder channels (drag)** live in the column (settings has it; the column doesn't) | channel column, admin POV | ★2 | ●3 | Drag handles writing `channels.position` | none |
| B24 | **Audit-log filters / export** | server settings → Audit | ★1 | ●2 | Filter chips + export | none |
| B25 | **"Working on" / status composer** (set your ambient status) | avatar menu / member rail | ★2 | ●2 | Status editor writing `profiles.status_*` (the `/status` command exists) | none |
| B26 | **Save-to-Files / Download for a whole chat attachment** & **open in explorer** | chat filecards | ★2 | ●1 | Reuse the details-pane actions on the inline card | none |

---

## C. Net-new features that need CANON first (⚑)

These aren't just missing UI — they add data/permissions and must land in
`CANON.md` (§C UI registry + §E data model) before a screen is built:

1. **Notification preferences** (S7, B4, B7, B15) — per-server & per-channel
   notification level + mute-until. New `server_prefs` / `channel_prefs`
   (`user_id, level in(all,mentions,none), muted_until`). Load-bearing for the
   channel-group "hide muted" toggle.
2. **Reports / flagging** (S6, B13) — `reports(target_type, target_id, reporter,
   reason, status)` + who reviews (moderation perm) + the report dialog.
3. **Forwarding to chat** (S5, B10) — decide whether a forward is a new
   `placement` onto a channel/DM or a lightweight quoted message; define the
   forwarded-message render + re-share permission.
4. **Channel categories / groups** (B3, B7) — a `channel_categories` table (or a
   `category` field), so the column can group + collapse.
5. **Billing surface** (S11, B21) — Stripe customer/portal, `invoices`, and
   (for B21) multi-session/account switching.

Everything else in A/B is **pure UI on the existing model** — no CANON change,
just new gallery markup + wiring.

---

## D. Recommended do-first (high need ÷ low effort)

Best value, all pure-UI or tiny-model:
1. **B1 server-name dropdown** + **B2 create-channel** + **S2 dialog** (★5 / ●1–2)
2. **S1 admin POV** (★5 / ●2) — unlocks showing every admin-only button at once
3. **S3 invite-to-server dialog** (★5 / ●2)
4. **B10/S5 forward** and **B9 member admin actions** (★4)
5. **S4 friends manager**, **B14 new DM**, **B19 trash actions** (★3–4 / ●1–2)

Then the CANON-gated cluster: **S7 notification prefs → B4/B7/B15** (one feature
unlocks four controls), then **S6 reports**, then **S5 forwarding**.
