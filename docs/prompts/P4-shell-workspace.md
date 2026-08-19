# P4 — Shell + Workspace

11 prompts. Assemble the three-pane shell and the Workspace (CANON §C.4) from the
P3 primitives, then wire the live data. Law = the `workspace` screen in
[`../design/gallery.html`](../design/gallery.html) (`?app=1#workspace`) desktop,
and the CANON §C.2 mobile collapse. Each `[UI]` prompt is **done when** it matches
the gallery at desktop + mobile, covers every listed state, and reuses P3
primitives. `[GL]` prompts assert a live round-trip. Shared guardrails: see
[README](README.md).

---

### P4.1 [UI] — Three-pane shell + mobile collapse
The frame: server rail (58px) · channel column (232px) · main · members rail
(210px). Mobile (§C.2): one pane at a time + bottom tabs; the rail and members
become drawers/sheets. Owns `.app`/`.rail`/`.stage`/`.chan`/`.mem`. **DONE:** the
four panes lay out at desktop widths; at mobile width only one pane shows with
bottom tabs; no horizontal body scroll.

### P4.2 [UI] — Server rail
`Avatar`-based server badges + Feed/Messages buttons + the ＋ menu + own-avatar
menu. Badge states: default / hover (tooltip=server name) / active (ink) /
**unread dot** / **mention count**. **DONE:** every badge state renders; active is
inked; the ＋ opens a menu (Create server · Join by link · Add friend); the
avatar opens profile/status/settings/sign-out.

### P4.3 [UI] — Channel column
Server-name header (→ settings if admin), **Files** entry (opens the File explorer), channel list grouped by
kind (text/voice), unread bold, mention badge, admin drag-handle,
＋ add channel. **DONE:** channels render grouped and ordered; unread is bold;
admin sees drag + ＋, a member doesn't; clicking a channel routes to it.

### P4.4 [UI] — Channel header
Name, topic, tabs **Messages / Pins / Files**, members icon, search. Owns the
header + `.chtab`. **DONE:** the three tabs switch the main pane; members icon
opens the rail/sheet; matches the gallery header.

### P4.5 [UI] — Message list + message row
Reverse-chron, grouped by author, byline in **member colour** (server surface).
Row: markdown body (`marked`), edited tag, reactions; **hover** (desktop) /
**long-press** (mobile) → reaction · reply-in-thread · ⋯ (edit/delete own, pin,
copy link). States: loading / empty / new-message divider. **DONE:** messages
group by author with member-hue bylines; the action affordances appear on
hover/long-press; own-only edit/delete is enforced in the menu; empty and loading
states render.

### P4.6 [UI] — Composer
Textarea + formatting toolbar (inserts markdown), emoji picker (emoji-mart),
@mention & #channel autocomplete, file attach, send. States: empty / typing /
slowmode / **timed-out (disabled + notice)**. **DONE:** the toolbar inserts
markdown; @/# autocomplete filters members/channels; a timed-out state disables
input with a notice; send is disabled when empty.

### P4.7 [UI] — Shared-file card (inline)
A `work` rendered inside a message, **leading with the file name**, kind-aware
(image thumb / video play / audio wave / **type card** for non-previewable).
Click → Details pane. **DONE:** each kind renders correctly incl. a `.zip`/`.flp`
type card; the file name leads; clicking opens Details (P5.7).

### P4.8 [UI] — Thread view
Opens from a row's "N replies" (`parent_id`); desktop = right-side panel, mobile =
full-screen push; `also_to_channel` toggle when replying. **DONE:** a thread shows
the parent + replies; replying posts with `parent_id`; the also-to-channel toggle
is present.

### P4.9 [UI] — Members rail
Admins/Members groups (by role), name in member colour, presence dot, "working on"
line. Admin hover → manage (role toggle → P8.5, timeout, kick). **DONE:** members
group by role with presence and member-hue names; admin sees manage affordances; a
member doesn't; mobile shows it as a sheet.

### P4.10 [GL] — Live messages + typing + read
Subscribe `channel:{id}` (Postgres changes) → live insert/edit/delete into the
list; `channel:{id}:typing` (broadcast) → typing indicator; call
`mark_channel_read` on view. **DONE:** a message inserted elsewhere appears live;
an edit/tombstone reflects live; typing shows and clears; opening a channel clears
its unread badge.

### P4.11 [GL] — Presence
Subscribe `server:{id}` (Presence) → the members rail online/idle/dnd + `{doing}`.
**DONE:** a member going online/offline updates the rail live; the "working on"
text reflects the presence payload.

---

**Edge states (own sub-prompts):** no-channels-yet (admin CTA), zero-messages
channel, member with no presence, timed-out composer, Realtime-reconnecting
banner. Each **done when** it matches the corresponding empty/edge state and
doesn't error.

**End of P4.** The spine is live. P5 builds the content screens that read `works`.
