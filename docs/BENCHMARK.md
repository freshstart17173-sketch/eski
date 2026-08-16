# eski vs Discord and Slack, a functional gap list

**What this is.** A screen-by-screen list of what Discord and Slack have on
their equivalent screens that eski's mockup
([`docs/design/collab-mockup.html`](design/collab-mockup.html)) does not. UI/UX
and function only, not visual style.

**On screenshots:** I could not capture the real Discord/Slack app screens,
they sit behind a login and their web apps are not fetchable, so anything I
"captured" would be a marketing hero image or a fabrication. Instead this is
grounded in Discord's and Slack's own 2026 help and feature pages plus their
well documented UIs (sources at the end). Where a gap is something eski **cut on
purpose** in an earlier round (roles on a profile, public discovery, likes,
branching), it is tagged **[by design]** so it is not mistaken for an oversight.

---

## Build order (in progress)

Sorted by leverage; each is being built and pushed one at a time.

1. Search results (global, filters + modifiers)  ·  **done**
2. Quick switcher (Cmd/Ctrl+K)  ·  **done**
3. Thread view (reply thread panel)  ·  **done**
4. Channel tabs + pinned messages (Pins / Files per channel)  ·  **done**
5. Rich composer + message actions (formatting, emoji picker, edit/pin/mark-unread, typing)  ·  **done**
6. Member / profile popout + status/presence  ·  **done**
7. Call upgrades (share controls, in-call chat/notes, layout, speaking, reactions)  ·  **done**
8. DMs upgrades (group DMs, friends/requests, mute/pin)  ·  **done**
9. Notifications upgrades (inline reply, Threads tab, Saved/Later, filters)  ·  **done**
10. Group settings: moderation (bans/timeouts, audit log, per-channel settings)
11. Media explorer actions (grid actions, lightbox, shared-in)
12. Board upgrades (custom fields, views, due dates)
13. Sign-in / onboarding / username claim

---

## 0. Cross-cutting, things both apps have on most screens that eski has nowhere

These are not one screen, they show up everywhere and are the biggest gaps.

- **Global search with a results screen.** Both have full search (Slack: filter
  by messages / files / channels / people, plus modifiers `from:`, `in:`,
  `before:`, `after:`, `has:link`, `has:file`, filetype; Discord: `from:`, `in:`,
  `has:`, `before:/after:`, `mentions:`, `pinned:true`). eski has search *icons*
  and per-view search bars, but no search-results screen and no modifier syntax.
- **Quick switcher / command palette** (Ctrl/Cmd+K) to jump to any channel, DM,
  or person by typing. eski has no keyboard navigation at all.
- **Threads as a first-class object.** Discord named threads nested in the
  sidebar with archive; Slack reply-in-thread with a thread pane, a "Threads"
  view of every thread you are in, "also send to channel", and follow/unfollow.
  eski shows "3 replies" but has **no thread pane, no thread list, no follow**.
- **Typing indicators** ("X is typing…"). eski has none.
- **Message editing, deleting, "edited" label, mark-unread, copy-link, jump-to.**
  eski messages are read-only with no per-message menu beyond react/reply/more
  (and "more" is not wired to anything).
- **Pinned messages** per channel/DM (both). eski has no pin-a-message concept.
- **Presence states beyond online/offline**: Discord online / idle / do-not-
  disturb / invisible + custom status; Slack active / away / DND + custom status
  with expiry. eski has a single online/offline dot.
- **Right-click context menus** on messages, users, channels, files (Discord
  especially). eski has none.
- **Per-channel / per-group notification controls and mute**, plus a global
  Do-Not-Disturb schedule. eski has no mute or notification preferences anywhere.
- **Drafts and scheduled send** (Slack schedules; both keep per-channel drafts).
  eski's composer keeps nothing.
- **Rich composer**: formatting toolbar (bold/italic/code/quote/list/link),
  emoji picker, GIF/sticker picker, @/#/: autocomplete popovers, attach-preview
  before send, voice messages, and slash commands / app shortcuts. eski's
  composer is one text input with a paperclip and an @ icon.
- **Apps, bots, webhooks, integrations, slash commands.** eski has no
  integration surface at all.
- **A sign-in / sign-up / username-claim screen.** eski's mockup starts already
  signed in; the very first-run flow is not mocked.

---

## 1. Workspace (channels + chat + members)
Equivalent: a Discord **server**, a Slack **workspace**.

What they have that eski's Workspace screen does not:

- **Collapsible categories / custom sections** in the channel list, with per
  category collapse and unread roll-up. eski's groups (Media/Channels/Boards/
  Canvases/Voice) are fixed and not collapsible or user-defined.
- **Unread model.** Discord bolds unread channels, draws a "new messages"
  divider in the stream, and offers "mark as read" + jump-to-unread; both show a
  per-channel **mention count** distinct from generic unread. eski shows one
  numeric badge and no unread bolding, no new-message divider, no jump.
- **Per-channel header tabs** (Slack): Messages / **Pins** / **Bookmarks** /
  **Files** / **Canvas** / **Workflows**, auto-appearing and reorderable. eski's
  channel is chat only; pins, a per-channel files tab, and a **bookmarks bar** of
  pinned links/docs at the top of a channel are all absent.
- **Editable channel topic/description and member count in the header**, plus a
  channel details panel. eski's topic line is static.
- **Reply context**: Discord renders the replied-to message inline above a reply;
  Slack shows thread previews. eski replies are a flat "3 replies" link.
- **System messages** (joins, pins, boosts, "X added Y"). eski has none.
- **Member list depth**: role-grouped with role **colors**, a **rich profile
  popout** on click (mutual servers, roles, status, "add friend", "message"),
  custom status text, and live activity ("Playing…", "In a huddle"). eski's
  members rail has presence + a "working on" line but no click-to-popout, no
  status, and only Admin/Member grouping.
- **Reaction depth**: a full emoji picker with frequently-used and custom emoji,
  hover-to-see-who-reacted, and Discord **super reactions**. eski has reaction
  pills and a react button but a fixed set.
- **Slowmode, NSFW gating, announcement-channel "follow", forum/media channel
  post lists** (Discord channel types). eski has text/voice/board/canvas only.

---

## 2. Feed (people you follow)
**No equivalent.** Neither Discord nor Slack has a portfolio/following feed;
their closest surfaces are notification inboxes (covered in §12). So there is
little "theirs has, mine doesn't" here, this screen is eski-specific. The only
transferable idea is Slack's **search modifiers** for the feed's search bar.

---

## 3. Media explorer (group files)
Equivalent: Slack **Files** (global browser + per-channel Files tab), Discord
attachment search.

What they have that eski's explorer does not:

- **File actions from the grid**: star/save, share-to-channel, copy link,
  download, open in external app, rename, delete, and (Slack) **comment threads
  on a file**. eski opens the details pane but has no quick star/share/download
  from the grid itself.
- **Inline preview / lightbox** with next-prev, zoom for images, and transport
  for audio/video without leaving the browser. eski relies on the details pane.
- **Free-text search modifiers** (`from:`, `has:file`, filetype, date ranges) in
  addition to eski's dropdowns.
- **"Shared in" backlinks** (which channels/messages a file appears in). eski
  shows a single channel.
- **Bulk selection and actions**, and **saved searches**. eski has neither.

*(eski's Collections and the always-on details pane are ahead of both here.)*

---

## 4. Canvas (review scratchpad)
**Closest, not equal:** Slack **Canvas** is a collaborative *document* (text,
embeds, checklists), not media annotation; Slack **huddle drawing** lets people
draw on a shared screen live. Discord has nothing comparable. Frame.io/Figma are
the real bar, but limited to Discord/Slack:

- **Live multiplayer**: real-time cursors, presence avatars on the canvas, and
  simultaneous drawing (Slack huddle draw shows collaborators' cursors). eski's
  canvas is async, single-actor, with no "who else is here" or live cursors.
- **A laser-pointer / follow-along mode** during a live review. eski has none.
- Slack Canvas also has **rich document blocks** (headings, checklists, tables,
  embeds) that eski's canvas (media tiles + pins) does not, though that is a
  different tool.

---

## 5. Board (kanban)
**Closest:** Slack **Lists** (a structured table with fields, filters, group-by,
and saved views) and **Workflow Builder**. Discord has no native board.

What Slack Lists has that eski's board does not:

- **Custom fields** per card (status, due date, priority, assignee, number, URL),
  not just a label + assignee.
- **Multiple views** of the same data (table, board, and filtered/grouped views)
  and **filter / sort / group-by** controls.
- **Automation** (Workflow Builder) to move or create cards on events. eski's
  board is a static four-column kanban.
- **Due dates / reminders** and card detail pane. eski cards have no dates.

---

## 6. Call (voice / video)
Equivalent: a Discord **voice channel**, a Slack **huddle**.

What they have that eski's Call screen does not:

- **Screen-share source picker and sharer controls**: choose entire screen /
  window / tab, share with audio, quality/resolution/fps options, "stop
  sharing". eski shows a share is happening but no picker or controls.
- **Annotate / draw on the shared screen with live cursors** (Slack huddle).
  eski keeps annotation in the separate Canvas, not in-call.
- **Layout controls**: grid vs speaker/focus, click a tile to focus, pop-out,
  fullscreen a share. eski's share-plus-strip layout is fixed.
- **Who-is-speaking indicator** (Discord's green ring), and **per-participant
  controls** (adjust a user's local volume, mod mute/deafen, move user). eski has
  none.
- **In-call side panel**: Slack huddle has a **thread** (chat), a **canvas** for
  notes, and message reactions; "everything shared is saved to the channel."
  eski's call has no side chat, notes, or reactions.
- **Raise-hand and in-call emoji reactions** (both). eski none.
- **Deafen**, **push-to-talk**, **input/output device pickers**, **noise
  suppression toggle**. eski's bar is mic / camera / share / participants / leave.
- **Discord extras**: **soundboard**, **Activities / Watch Together**, viewer
  count on a stream, and "ring" someone into the call. Slack: **invite to
  huddle**, and **recording / AI recap**. eski has none of these.
- **Connection-quality indicator**. eski none.

---

## 7. Details pane (file detail)
Equivalent: Slack **file detail**, Discord attachment view.

Mostly at parity or ahead (eski has versions, contributors, context-scoped
comments, download-as, save, open-in-canvas). Small gaps:

- **"Shared in" list** across channels/DMs (Slack). eski shows one channel.
- **Media controls**: zoom/pan for an image, a real transport bar for audio/
  video in the pane. eski shows a static waveform + a play affordance.
- **Star/save-for-later distinct from Save-to-folder**, and **copy-link**. eski
  has Save-to-folder only.

---

## 8. Profile
Equivalent: Discord **user profile**, Slack **profile**.

What they have that eski's Profile does not:

- **Status control**: custom status (emoji + text + **expiry / clear-after**),
  presence state (online/idle/DND/invisible; active/away/DND), and auto-status
  ("In a huddle"). eski has no status or presence control on the profile.
- **Local time / timezone** of the person (Slack shows their current local
  time). eski none.
- **Structured profile fields**: title, pronouns, timezone, phone, start date,
  custom fields (Slack); About Me, pronouns, banner, badges, **connections**
  (Spotify/GitHub/etc.), **member-since**, and **mutual servers/friends**
  (Discord). eski has name / handle / bio only.
- **Block and report user**, and **mute**. eski has no safety actions on a
  profile.
- **Call button** from a profile (Slack huddle / Discord call). eski has Message
  and Add friend only.
- Per-server **roles/badges** shown in context. **[by design]** eski keeps roles
  out of profiles.

*(eski's three-shelf portfolio, Public/Shared/Private, is a creative-native
feature neither app has.)*

---

## 9. Messages (DMs)
Equivalent: Discord **DMs / Friends**, Slack **DMs**.

What they have that eski's Messages does not:

- **Group DMs** (multi-person direct messages). eski's DMs are 1:1 only.
- **A Friends surface** (Discord): Online / All / Pending / Blocked tabs, a
  **friend-request inbox**, and add-by-username with accept/decline. eski adds by
  username but has no pending/blocked/requests management.
- **Mute, mark-unread, pin a DM, leave/close DM**, and search within a DM. eski
  has a flat list with none of these.
- **Status / local time in the DM header**. eski's DM header has call/video but
  no presence or local time.
- All the **§0 message gaps** apply here too (threads, pins, formatting, typing).

---

## 10. Group settings (admin)
Equivalent: Discord **Server Settings**, Slack **workspace + channel admin**.

What they have that eski's settings do not:

- **Per-channel settings**: topic, slowmode, NSFW, notification defaults, and
  (Discord) **per-channel permission overrides** and **private channels**. eski
  can add/reorder/remove a channel but has no per-channel settings panel.
- **Roles & permissions**. **[by design]** eski chose two fixed roles, but that
  also means no per-permission control and no private channels within a group.
- **Moderation**: a **ban/kick/timeout** flow, a **members-to-review** list, an
  **audit log**, and **automod** (keyword/spam/mention filters, verification
  level). eski can remove a member but has no bans, audit log, or automod.
- **Invite depth**: per-invite max-age / max-uses / temporary-membership options
  in a dialog, **invite-tracking analytics** (who invited whom), and a **vanity
  URL**. eski lists links with uses/expiry and revoke but no per-invite config
  dialog or analytics.
- **Emoji / stickers / soundboard management** (Discord). eski none.
- **Integrations / apps / webhooks** management. eski none.
- **Group-level notification defaults**, suppress @everyone/@role, and mute.
  eski none.
- **Analytics dashboard** (Slack/Discord community insights). eski none.
- **Onboarding / rules-screening / welcome-screen** config (Discord). **[by
  design]** eski's join is a bare magic link.

---

## 11. Create group / Join by link
Equivalent: Discord **Create a server / invite**, Slack **create workspace /
join**.

What they have that eski's Create/Join does not:

- **Templates** on create (Discord: Gaming / Study Group / Friends / …; Slack
  guided setup). eski's create is a blank form.
- **Invite preview depth** on the join screen: online + total member counts,
  expiry, and (Discord) **membership-screening / rules acceptance** before entry.
  eski's join shows member count + who invited you, then one-click. **[by
  design]** eski deliberately keeps join frictionless.
- **Request-to-join / approval** path (Slack email approval, Discord community
  applications). **[by design]** eski is invite-link only.
- **Sign-up / account creation** as part of the funnel. eski does not mock it.

---

## 12. Notifications
Equivalent: Discord **Inbox** (Mentions / Unreads), Slack **Activity**.

What they have that eski's Notifications does not:

- **Reply / react inline from the inbox** (Slack Activity lets you respond
  without leaving). eski rows link out only.
- **Per-row and bulk mark-read / mark-unread**, and **mark-read-on-view / jump-
  to-source** that clears the item. eski has "Mark all read" only.
- **A Threads view** (Slack: every thread you are in) and a **Saved / Later**
  list as its own inbox. eski has neither (Save-to-folder is files only).
- **Finer filters**: Discord Inbox filters Mentions by **server** and toggles
  @everyone/@role inclusion, and an **Unreads** tab that lists unread channels
  with jump. Slack Activity filters All / Mentions & reactions / **Threads** /
  **Invitations** / **Apps** and an unread-only toggle. eski has All / Mentions /
  Unread only.
- **Do-Not-Disturb / notification schedule** entry from here. eski none.

---

## Quick tally, by weight

**Biggest, cross-cutting gaps** (fix these and many screens improve at once):
global **search** with modifiers, a **quick switcher**, first-class **threads**,
**pinned messages**, **typing indicators**, richer **presence/status**, a
**rich composer** (formatting, emoji/GIF pickers, autocomplete, drafts), and
**per-channel/group mute + notification prefs**.

**Screen-specific standouts:** the **Call** screen is the furthest behind its
equivalents (screen-share controls, in-call annotate, layout toggle, side
chat/notes, speaking indicator, per-user controls); **Group settings** lacks
moderation (bans, audit log, automod) and per-channel settings; **DMs** lack
group DMs and a friends/requests surface; **Profile** lacks status, local time,
and structured fields.

**Where eski already leads** (so the comparison is honest): the **following
feed**, the **three-visibility model** (public/shared/private), **versioned
posts with mandatory change reasons**, the **review Canvas** with anchored
draw/audio-range comments, **Collections + the always-on details pane**, and
**per-group member colours**. None of these exist in Discord or Slack.

---

## Sources
- Discord: [hidden features 2026](https://blog.communityone.io/discord-hidden-features-2026/),
  [new features for server owners 2026](https://peakbot.pro/blog/new-discord-features-2026-server-owners),
  [Pin Messages FAQ](https://support.discord.com/hc/en-us/articles/221421867-Pin-Messages-FAQ),
  [Reactions & Super Reactions FAQ](https://support.discord.com/hc/en-us/articles/12102061808663-Reactions-and-Super-Reactions-FAQ),
  [screen share / Go Live guide](https://zapier.com/blog/how-to-screen-share-on-discord/),
  [soundboard](https://voxbooster.com/blog/soundboard-for-discord/)
- Slack: [conversation tabs (Pins/Bookmarks/Files/Canvas)](https://slack.com/help/articles/32562841868307-Add-and-manage-tabs-in-channels-and-direct-messages),
  [simplified search + channel bookmarks](https://slack.com/blog/productivity/whats-new-in-slack-simplified-search-channel-bookmarks),
  [custom sidebar sections](https://slack.com/help/articles/360043207674-Organize-your-sidebar-with-custom-sections),
  [use huddles](https://slack.com/help/articles/4402059015315-Use-huddles-in-Slack),
  [new ways to work in huddles (draw, canvas)](https://slack.com/blog/productivity/introducing-new-ways-to-work-in-slack-huddles),
  [huddles feature page](https://slack.com/features/huddles)
</content>
