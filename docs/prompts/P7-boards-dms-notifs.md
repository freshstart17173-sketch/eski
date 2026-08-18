# P7 — Boards · Messages (DMs) · Notifications

11 prompts. Law = the `board`, `dms`, `notifications` screens in
[`../design/gallery.html`](../design/gallery.html). Reuse P3 primitives + P4/P5
renderers. Each `[UI]` is **done when** it matches the gallery desktop + mobile;
`[GL]` asserts a live round-trip. Shared guardrails: see [README](README.md).

---

### P7.1 [UI] — Board shell + view switcher
Board name, view switcher **Board / Table / Calendar**, Fields, Add card. **DONE:**
the switcher changes the view; matches the `board` screen header.

### P7.2 [UI] — Board columns + cards
Columns (To do / In progress / Review / Done, admin-editable) with count badges;
card = title, label, **assignee avatar in server colour**, due date (overdue =
danger), linked work/canvas. **DONE:** cards render every field; overdue reads
danger; assignee shows the member hue; matches the gallery board.

### P7.3 [UI] — Card detail modal
Title, label picker, assignee, due-date, linked work/canvas. **DONE:** matches
"Board card detail"; a card can link a work **or** a canvas.

### P7.4 [GL] — Board drag → `move_card`
SortableJS drag (touch + autoscroll) → `move_card(card, column, position)`;
optimistic move, reconcile on the row. **DONE:** dragging a card across columns
persists via `move_card`; siblings renumber; a failed move reverts.

### P7.5 [UI] — DM thread list + add-by-handle
**Add-by-handle field inline** at the top (not a modal), friends/requests surface,
thread list (pinned + DMs, unread dot, mute/pin). **DONE:** the add field is
inline; threads show unread/mute/pin; matches the `dms` screen left column.

### P7.6 [UI] — DM conversation
Messages + composer (attach, send); header with (v2, disabled) call buttons.
**DONE:** messages render; composer sends; call buttons are present but disabled
(v2); mobile = full-screen.

### P7.7 [GL] — DM round-trip
`create_dm(handle)` (friendship-gated) → find-or-create channel; send inserts
`dm_messages`; subscribe for live delivery. **DONE:** DMing a friend opens/creates
the channel; a non-friend is refused; a sent message appears live for both.

### P7.8 [UI] — Notifications screen
Tabs (All / Mentions / Threads / Saved), rows by kind (mention / annotation /
version / board-assign / join / reaction) with links to target + inline reply,
grouped by day, mark-all-read. **DONE:** tabs filter; a row links to its target;
inline reply posts; matches the `notifications` screen.

### P7.9 [GL] — Live bell
Subscribe `user:{id}` (Postgres changes) → `notifications` insert increments the
bell; mark-all sets `read_at`. **DONE:** a new notification bumps the badge live;
mark-all clears it; inline reply reuses `messages`/`comments`.

### P7.10 [UI] — Board Table + Calendar views
The alternate board views over the same `board_cards`. **DONE:** Table lists cards
with sortable columns; Calendar places cards on due dates; both match the gallery
`kview` states.

### P7.11 [UI] — Friend requests + friends management
The requests surface: accept/decline (`respond_friend`), pending outbound, block.
**DONE:** accepting moves a request to friends; declining removes it; block hides
the user.

---

**End of P7.** P8 builds the admin surfaces.
