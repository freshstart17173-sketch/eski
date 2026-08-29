# eski — launch checklist

Every discrete action the app supports, grouped by area, with the outcome you should
see when it works. eski is **ready to hand to real users only when every box is
checked** and working perfectly. Tick a box once *you* have tested it on the live
preview and it behaved exactly as described.

There is a live, self-saving version of this list on the site itself — **`/checklist.html`**
(e.g. `preview.eski.lol/checklist.html`): tick rows as you test and the progress persists in
your browser. That page also carries your **Setup** list (`OWNER-TODO.md`) and a read-only
**Build** tab, so the whole todo lives in one place. It parses these two markdown docs verbatim,
so this file stays the source of truth — edit here and the page follows on the next deploy. This
file is the versioned copy that build sessions treat as the acceptance bar.

**Two tags mark rows that depend on something outside the app:**

- **`[infra]`** — needs your R2 / Stripe / SMTP setup before it can pass (uploads,
  media playback, profile photos, billing, magic-link email). If one of these fails,
  confirm that setup before logging a bug.
- **`[v2]`** — deferred to v2. The *correct* behaviour today is a "being built"
  signpost (a grayed control + a WIP toast), **not** a working feature.

232 checks across 21 areas.

---

## 1. Sign in, onboarding & sign out

- [ ] Open the site signed-out → the marketing landing page renders (eski! wordmark, product copy, Sign in / Get started CTAs).
- [ ] Click Sign in / Get started on the landing page → the sign-in screen opens (Continue with Google + magic-link fallback).
- [ ] `[infra]` Click "Continue with Google" → redirects to Google, and returning lands you signed in.
- [ ] `[infra]` Enter an email and click "Email me a magic link" → a toast confirms it sent; the email arrives; clicking the link returns you signed in.
- [ ] Submit an obviously invalid email → the field flags an error and nothing is sent.
- [ ] Sign in for the very first time (no profile yet) → the create-profile screen appears before any app screen.
- [ ] Onboarding: the username is pre-filled from your email → a suggested username is present but editable.
- [ ] Onboarding: submit with the username empty → blocked; the username field shows an error, nothing is created.
- [ ] Onboarding: enter a username with spaces or symbols → rejected with "letters, numbers, or underscores".
- [ ] Onboarding: enter a username someone else already has → rejected with "That username is taken".
- [ ] Onboarding: enter a valid username and submit → profile is created and you land in the app (Feed).
- [ ] Open the rail avatar menu → Sign out → you're signed out and returned to the landing / sign-in screen.
- [ ] While signed out, open a deep link like `/u/someone` or `/s/…` → you get the sign-in prompt, not a broken screen.

## 2. Server rail (far left)

- [ ] Click the Home button → goes to the Feed; the button shows as active (inked).
- [ ] Click the Messages button → goes to Messages (DMs); an unread badge shows a count when you have unread DMs.
- [ ] Click the My-files button → opens your personal file explorer (no server channel column).
- [ ] Click a server badge → opens that server's workspace; the badge inks as active.
- [ ] Hover a server badge → a tooltip shows the server's name.
- [ ] Have unseen activity in a server you're not viewing → its badge shows an unread mark; a mention shows a count.
- [ ] Click the ＋ button → a menu opens: Create server · Join by link · Add friend.
- [ ] ＋ menu → Create server → opens the create-server flow.
- [ ] ＋ menu → Join by link → opens the join-by-link flow.
- [ ] Open the round avatar menu (foot of rail) → a menu opens: Profile · Set status · Settings · Sign out.
- [ ] Avatar menu → Set status → the status modal renders cleanly: emoji + text on one row, all four presence options (Online / Idle / DND / Invisible) on a single line with no overflow; Save updates the rail + members list.
- [ ] Avatar menu → Profile → opens YOUR profile at the correct @handle (even after you've changed your username).
- [ ] Confirm the avatar button is round → the profile button is a circle; server badges are squares.

## 3. Channel column

- [ ] Look at the server header → it shows the server's cover banner + square icon + name.
- [ ] Click the server header bar → the server menu dropdown opens; its chevron rotates while open.
- [ ] Open the server menu as an admin → shows Invite people · Server settings · Notification settings · Create channel · Leave server.
- [ ] Open the server menu as a non-admin (member) → admin-only rows (Server settings, Create channel) are absent; Invite / Notifications / Leave remain.
- [ ] Server menu: click the header again / click away / press Esc → the menu closes each way; the chevron un-rotates.
- [ ] Click the Files entry → opens the File explorer with Files highlighted in the column.
- [ ] Click a category label's caret → the group of channels collapses / expands.
- [ ] View the column as an admin → each group shows a ＋ and each channel a gear on hover, plus a drag handle.
- [ ] View the column as a member → no ＋, no gear, no drag handle.
- [ ] Click a text channel → it loads in the main pane and highlights as active.
- [ ] Have an unread text channel → its name is bold; a mention shows a count badge.
- [ ] `[v2]` Click a voice channel → a "Voice ships in v2" toast appears — it does NOT open a call.
- [ ] `[v2]` Look at the voice minibar at the foot of the column → it reads as grayed / under-construction with a build note.
- [ ] Right-click a text channel → a channel menu opens: Mark as read · Copy link · Invite · Notification level · Mute · (admin) Edit / Delete.

## 4. Channel header & tabs

- [ ] Look at the channel header → shows the # name and the channel topic.
- [ ] Look at the three tabs → Messages · Pins (count) · Files (count).
- [ ] Click the Pins tab → the pinned-messages panel shows; the stream hides.
- [ ] Click the Files tab → the channel's file grid shows.
- [ ] Click back to Messages → the message stream returns; typing indicator and jump-to-present belong only here.
- [ ] `[v2]` Click the voice / video buttons in the header → grayed; pressing raises a WIP toast — no call.
- [ ] Click the notification bell → opens the notification preview / Notifications.
- [ ] Click the search button → opens search.
- [ ] Click the members icon → toggles the members rail (its pressed state flips).

## 5. Messages — list & rows

- [ ] Load a channel with history → messages show newest-last, grouped by author, with the byline in that member's server colour.
- [ ] Look for day separators → a "Today"/date divider sits between days.
- [ ] Open a channel with unread messages → a "New messages" divider marks where you left off.
- [ ] Open a brand-new empty channel → a welcome / empty state shows instead of a blank pane.
- [ ] Hover a message (desktop) → reaction · reply · ⋯ actions appear at the top-right of the row.
- [ ] Look at a message with reactions → reaction chips show emoji + count; yours reads as active.
- [ ] `[infra]` Click a reaction chip → your reaction toggles on/off and the count moves by one.
- [ ] `[infra]` Use the react (smile) action → pick an emoji → a new reaction chip is added to the message.
- [ ] Click "N replies" / the reply action → the thread pane opens for that message.
- [ ] Open a message ⋯ menu → Add reaction · Reply in thread · Copy link · Pin · (own) Edit · (own) Delete · Forward.
- [ ] ⋯ → Copy link → the message permalink is copied; a toast confirms; opening it scrolls to & flashes the message.
- [ ] ⋯ → Pin → the message appears under the Pins tab.
- [ ] ⋯ → Edit on your OWN message → an inline editor opens; saving updates the text and adds an "(edited)" tag.
- [ ] Open the ⋯ menu on someone else's message → no Edit/Delete for you (only your own).
- [ ] ⋯ → Delete your own message → it becomes a "message deleted" tombstone.
- [ ] ⋯ → Forward → the Forward modal opens to pick target channels/DMs + an optional note.
- [ ] Look at a message that shares a file → an inline card leads with the file name; clicking opens the Details pane.
- [ ] Look at a post with several files at once → they clump into a compact chip grid with "+N more", not N separate cards.
- [ ] Look at a forwarded message → a quote block shows the source author + channel; clicking jumps to the source.
- [ ] Have a second window send a message to the same channel → it appears live without a refresh.
- [ ] Edit / delete a message from another window → the change reflects live in the first window.
- [ ] Scroll up, then have a new message arrive → a "jump to present" button appears; clicking returns you to the bottom.

## 6. Composer

- [ ] Type a message and press Enter → it sends and appears in the stream; the box clears.
- [ ] Press send with an empty box → nothing happens (send is inert when empty).
- [ ] Use the B / I / S / code / link / list / quote buttons → each inserts the right markdown around your selection.
- [ ] `[infra]` Click the emoji button → an emoji picker opens.
- [ ] Type "@" in the composer → a member autocomplete appears and filters as you type.
- [ ] Type "#" in the composer → a channel autocomplete appears and filters as you type.
- [ ] `[infra]` Click the attach (paperclip) → the upload picker opens.
- [ ] Post in a slow-mode channel repeatedly → a slow-mode notice appears and limits your rate.
- [ ] Post while timed out → the composer is disabled with a notice explaining the timeout.
- [ ] Start typing → other members in the channel see a typing indicator that clears when you stop.

## 7. Threads

- [ ] Open a thread from "N replies" → the thread pane opens with the parent message + its replies.
- [ ] Reply inside the thread → your reply posts under the parent.
- [ ] Toggle "Also send to #channel" → the toggle flips; replying with it on also posts to the main channel.
- [ ] Close the thread pane (✕) → the thread pane closes and the channel returns to full width.

## 8. Members rail & moderation

- [ ] Toggle the members rail from the header → it shows / hides.
- [ ] Look at the grouping → Admins and Members are grouped; names carry the member colour.
- [ ] Look at presence → each member shows a presence dot (online / idle / dnd / offline) and a "working on" line.
- [ ] Look at offline members → they render dimmed.
- [ ] Have someone go online/offline in another window → the rail updates live.
- [ ] Click a member row → a profile popover opens (mutual servers, role, status, Message, Add friend).
- [ ] Click a member row as an admin → the popover also shows Roles · Timeout · Kick · Ban.
- [ ] Timeout a member → pick a duration + reason → they're timed out (can't post) until it lifts; the reason is recorded.
- [ ] Kick a member → confirm → they're removed from the server (can rejoin on a fresh invite).
- [ ] Ban a member → confirm → they're banned and can't rejoin on any link; the optional "delete their posts" works.
- [ ] Try to kick/ban the OWNER → not possible; the owner can't be moderated.
- [ ] Manage roles for a member → toggle roles → Save → the member's roles update to the union you checked.

## 9. Server management (admin)

- [ ] Server menu → Create channel → the modal opens: name · Text/Voice · category · default folder · allowed types · private → Create adds it.
- [ ] Edit a channel (gear / menu) → name · topic · slow-mode · post-policy save correctly.
- [ ] Create a category → a new collapsible group appears in the column.
- [ ] Invite modal → Create link → a link is minted with your chosen expiry + max-uses; Copy copies it.
- [ ] Invite modal → Revoke a link → the link is removed and stops working.
- [ ] Invite by @handle → Invite → the person is invited; they receive an invite notification.
- [ ] Invite a suggested friend → Invite → the button flips to "Invited" and a toast confirms.
- [ ] Invite a @handle that doesn't exist → "No user with that username".
- [ ] Invite someone already in the server → "They're already in this server".
- [ ] Roles editor → add role, set colour, toggle permissions, delete role → each change persists; @everyone stays pinned & undeletable.
- [ ] Channel permissions on a private channel → adding roles/members to the allow-list controls who can see it.
- [ ] Server notification settings → level (All/@mentions/Nothing), suppress @everyone, and mute all save.
- [ ] `[infra]` Server settings → name / icon / cover → editing the name saves; uploading an icon/cover shows on the rail badge + header.
- [ ] Server menu → Leave server → confirm → you're removed from the server.
- [ ] Settings → Delete server (owner) → type the name → Delete → the server and its channels are deleted.
- [ ] Server menu → Audit log → a read-only list of moderation actions (kick/ban/timeout) with actor, target, reason, time.

## 10. File explorer

The server explorer mounts inside the shell (channel column stays); My files hides it.

- [ ] Open a server's Files → the explorer opens inside the shell with the channel column still on the left, Files active.
- [ ] Open My files from the rail → the personal explorer opens with no server channel column.
- [ ] Look at the folder tree → nested folders show; the current folder is highlighted.
- [ ] Click a folder → you descend into it; the breadcrumb updates.
- [ ] Click a breadcrumb segment → you jump back up to that folder.
- [ ] Switch the view: Grid / List / Feed → Grid & list show the current folder; Feed flattens the subtree to previewable items + inline comments.
- [ ] Search files → searches the whole tree, not just the current folder.
- [ ] Use the filter dropdowns (Channel / Type / Uploader / Tag / Date / Sort) → each narrows the view; Type/Channel/Uploader/Tag are multi-select.
- [ ] Toggle the Sort ascending/descending → order reverses.
- [ ] Use the quick-filter chips (All / Images / Audio / Video / Projects / ★) → each filters by kind / starred.
- [ ] Toggle "Show hidden" → hidden/untracked files appear or disappear.
- [ ] Single-click a card → it selects (and deselects others) and highlights.
- [ ] ⌘/Ctrl-click, Shift-click, ⌘/Ctrl-A, Esc → toggle-select, range-select, select-all, and clear all work.
- [ ] Drag on empty space → a marquee selects the cards it covers.
- [ ] Double-click (or Enter) a file → it opens in the Details pane.
- [ ] Drag a card onto a folder → the file moves into that folder.
- [ ] `[infra]` Hover a card → star / download / copy-link / ⋯ actions appear.
- [ ] Card ⋯ menu → Open · Star · Update visibility · Save to my files · Download · Copy link · Crosspost · Rename · Move to · Hide · Delete.
- [ ] Star a file → a persistent star badge shows; it appears under the ★ filter.
- [ ] Move to… → pick a destination in the tree → Move → the file re-homes to that folder (locked folders are disabled).
- [ ] Open the Trash smart-folder → shows the 30-day retention notice, trashed rows with a days-left countdown, Restore / Delete forever, Empty now.
- [ ] Look at the storage footer → shows "this server's storage — X of Y GB" + a bar + a manage link.
- [ ] Open a folder while it loads → a skeleton grid stands in; an empty folder shows a centred empty state.
- [ ] Select several cards → a bulk action bar appears (download / move / delete).
- [ ] Click Upload in the toolbar → the upload sheet opens.

## 11. Details pane (the file viewer)

- [ ] Open any file card → a near-full-screen viewer opens over a scrim.
- [ ] Close it via ✕ / Esc / clicking the dimmed backdrop → it closes each way.
- [ ] Open an image → the image fills the media area.
- [ ] `[infra]` Open a video or audio file → a big centred play button + a transport (seek, time, volume) show.
- [ ] `[infra]` Play / pause, seek, mute, and press ←/→ → playback toggles, the scrubber follows, mute swaps the icon, ←/→ skips 5s.
- [ ] Open a non-previewable file (.zip / .flp) → a type card fills the well — no broken player.
- [ ] Read the metadata → size, a clickable Location breadcrumb, posted-in channel (server files), dates, dimensions/format per kind.
- [ ] Click a Location breadcrumb segment → opens the File explorer at that folder.
- [ ] Use the prev / next arrows in the rail top bar → you move between adjacent items on the same level.
- [ ] `[infra]` Open a POST (public work on a profile/feed) → a public comment thread shows; you can read, add, and delete your comments.
- [ ] Open a SERVER file → no discussion section; chat lives in the channel.
- [ ] Add a tag to a file → the tag is saved and shows on the file.
- [ ] `[infra]` Download → the file downloads (in an offered format).
- [ ] `[infra]` Save to my files → pick a folder → a copy lands in your personal storage.
- [ ] Open the Share dialog (Update visibility) → visibility three-way + a copyable share link + a people-with-access list.
- [ ] Open a share link as a non-member → a standalone read-only page shows only that item (no rail, no browsing).

## 12. Upload

- [ ] Open the upload sheet → it opens from the explorer toolbar / composer attach.
- [ ] Drop one or more files → they're recognised by type; a Files/Folder toggle swaps the target.
- [ ] Drag files from your desktop onto the file explorer (or a channel) → the upload sheet opens pre-loaded with them, ready to post.
- [ ] Drag a whole FOLDER from your desktop onto the explorer → the sheet opens, recognises it as a folder ("N files in M folders"), and posting recreates the folder structure.
- [ ] On a folder upload, tick "Flatten folders — expose every file for tagging" → the tree is dropped, every file uploads loose, and the shared Tags apply to all of them.
- [ ] Pick a visibility (Public / Server / Private) → it's the one required choice.
- [ ] Choose Server → pick a server & folder → the target picker works; default folder is root.
- [ ] Read the storage-impact line → it states which storage the bytes draw ("{server}" or "Your" storage · X/Y GB).
- [ ] Expand "Add details" → tags + collaborators fields appear (optional).
- [ ] `[infra]` Click Post → it uploads (progress card), then a success toast; the file appears where posted.
- [ ] **`[infra]` (2026-08-29 upload-fix — was the "uploads don't work at all" 42501)** Post a single file to your **own server** → success, no "couldn't save the post (42501)"; it shows in that server's Files. Repeat to **My files (personal, Private)** → success and it shows in My files. This was failing for every file before the `create_work` RPC landed.
- [ ] **`[infra]` (upload-fix)** Post a file into a **channel** (composer attach) and into a **specific folder** → it lands in that channel's Files / that folder, not just root.
- [ ] **`[infra]` (upload-fix)** Upload a **folder that contains a `.flp`** (or `.als` / `.logicx` / `.aiff`) next to some `.wav`s → the project file is recognised (no "Skipped 1 unsupported file") and uploads with the rest.
- [ ] **`[infra]` (upload-fix)** Confirm a member who is **not** in a server still **can't** post to it (the RPC keeps the fence: needs active membership + the upload permission).
- [ ] **`[infra]` (B5 — channel Files tab + chat visibility)** Upload a file into a channel (composer attach) → it now appears in **three** places: that channel's **Files tab** (was always empty before), the **server File explorer**, AND as a **message in the channel chat** carrying the file card. Before B5 it only showed in the server explorer.
- [ ] **`[infra]` (B5)** In a channel with a file, open the **Files tab** → the uploaded files list; click one → the **real details/viewer pane opens** (previously a workspace file card only flashed a "viewer lands in P5" toast).
- [ ] **`[infra]` (B5 realtime)** With two windows on the same channel, upload a file in one → the other window sees the new **file message appear live** (the attachment card resolves in) without a reload.

## 13. Feed

- [ ] Open the Feed → a grid of your friends' public posts shows.
- [ ] Use search / type / sort / layout toggle → each filters or re-lays the grid (even grid ⇄ masonry).
- [ ] Look at cards of each kind → image thumb, video play-overlay, audio type-card, text words, non-previewable type-card — all render.
- [ ] Click a card → the Details pane opens.
- [ ] Open the Feed with no friend posts → an empty state invites you to add friends.
- [ ] Confirm no member colour on the Feed → Feed names/handles carry no server hue (it's a public context).

## 14. Profile

- [ ] Open a profile → round avatar, name, @handle, bio, and shelf tabs (Public / Server / Private) show.
- [ ] Open YOUR OWN profile → you see Edit profile, all three shelves, and Settings.
- [ ] Open a stranger's profile → you see Add friend and only the Public shelf (no Settings).
- [ ] Open a friend's profile → you see Message and the Public + server shelves.
- [ ] Edit profile → change name / bio → Save → saved; the hero updates in place and the rail reflects it.
- [ ] Edit profile → change your handle → Save → the page URL follows to `/u/<new>` so it stays valid; your Profile link everywhere uses the new handle.
- [ ] After changing your handle, reload the page → it still loads (doesn't 404).
- [ ] `[infra]` Edit profile → Change photo → pick an image → it uploads and the avatar updates in the dialog, the hero, AND the rail.
- [ ] `[infra]` Edit profile → Change banner → pick an image → the banner uploads and previews.
- [ ] On a stranger's profile, click Add friend → a friend request is sent.
- [ ] On a friend's profile, click Message → a DM with them opens.

## 15. Messages (DMs)

- [ ] Open Messages → the DM thread list (pinned + direct) shows with unread dots.
- [ ] Use the add-by-handle field → entering an exact handle starts / opens a DM.
- [ ] Use New message → pick friends → selecting one starts a 1:1; several start a group DM.
- [ ] Click a conversation → its messages + composer open.
- [ ] Send a DM → it appears immediately in your view.
- [ ] `[infra]` Have the other person send a DM (second window) → it appears live in your open conversation.
- [ ] `[infra]` Edit a DM from the other window → the edit reflects live.
- [ ] Open a DM row menu (⋯) → Mark as read · Pin · Mute · Block · Report · Close DM (group: Add people · Rename · Leave).
- [ ] Pin / mute / close a DM → each updates the row / list accordingly.
- [ ] Open a group DM's members modal → add a friend, rename, remove a member, and Leave group work.
- [ ] Click Friends → the Friends screen opens.

## 16. Friends

- [ ] Open Friends → tabs All · Pending · Blocked, each counted.
- [ ] Add a friend by handle → a request is sent (shows under outgoing/pending).
- [ ] Pending tab → Accept an incoming request → you become friends.
- [ ] Pending tab → Decline an incoming request → the request is removed.
- [ ] Pending tab → Cancel an outgoing request → the pending request is withdrawn.
- [ ] All tab → a friend row → Message → a DM opens.
- [ ] All tab → a friend row → remove / block → the friendship is removed / the user is blocked.
- [ ] Blocked tab → Unblock → the block is cleared.
- [ ] View each tab with nothing in it → a per-tab empty state shows.

## 17. Notifications

- [ ] Open Notifications → a list grouped by day, with tabs (All / Mentions).
- [ ] Look at a row → actor + text + context + time, with an unread dot when unread.
- [ ] Click a notification row → it marks read and navigates to its target.
- [ ] Click an invite notification → it takes you to the join screen for that invite.
- [ ] Click a row's ✓ → just that row marks read.
- [ ] Click Mark all read → every unread dot clears.
- [ ] `[infra]` Trigger a notification from another window (mention / invite / friend request) → it appears live at the top of the list.
- [ ] Open the header bell → a dropdown preview of recent notifications with Mark all read + See all.

## 18. Search & quick-switcher

- [ ] Press ⌘K / Ctrl-K anywhere in the app → the quick-switcher overlay opens.
- [ ] Press ⌘K / Ctrl-K again → it closes (toggles).
- [ ] Type a query → results group into servers · channels · people · files.
- [ ] Use ↑ / ↓ and Enter → you can navigate and open a result by keyboard.
- [ ] Search for a private channel you can't see → it does not appear (scope respects what you can view).

## 19. Storage & billing

- [ ] `[infra]` Open the storage manager (footer "manage") → a modal with the usage bar + a dynamic GB slider opens.
- [ ] Look at the personal usage bar → shows used / cap for your personal + public files.
- [ ] `[infra]` Drag the personal storage slider → a live blended $/GB price updates as it rises.
- [ ] `[infra]` As a billing admin, adjust the server storage slider → the server's own cap changes (single-payer).
- [ ] Fill an account past its cap → a red over-cap banner shows and files go read-only (nothing deleted).
- [ ] `[infra]` Export a server → a zip of every server file + metadata is produced.

## 20. Create & join servers

- [ ] `[infra]` Create a server (name + icon + first channel) → it's created, you're the owner, and it appears on your rail with a starter channel.
- [ ] New server first-run → the empty server shows a 3-step setup checklist (create channels · invite · upload).
- [ ] Open a valid `/join/<code>` link → a preview card shows the server name, member count, inviter, and a Join button.
- [ ] Click Join on a valid invite → you become a member and land in the server.
- [ ] Open an expired / revoked / full / already-member invite → a distinct dead-invite screen with the right reason + CTA (not the valid preview).

## 21. Utility & global states

- [ ] Visit a bad URL → a 404 "this page doesn't exist" card with a way back (no leak of whether a private thing exists).
- [ ] Open a private channel/server you can't see → a quiet "you don't have access" — never a 404 that leaks existence.
- [ ] View someone you've blocked → a "You blocked @handle …" state with an Unblock CTA.
- [ ] View an outgoing friend request that's not accepted → a "Friend request pending" state with a Cancel CTA.
- [ ] Toggle your OS/browser between light and dark → the whole app renders correctly in both themes (no invisible text).
- [ ] Resize the window from wide to ~1024px → the three panes flex and fill the width; below ~1100 the members rail tucks away. No sideways page scroll.
- [ ] `[infra]` Drop the network / Realtime connection → a "Connection lost, reconnecting…" banner shows; the composer disables until it recovers.
