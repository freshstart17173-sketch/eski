# eski, the collaboration layer (draft spec)

**Status: draft for review.** The "Discord-for-creatives" direction, worked
into a concrete plan: a feature list (each with a reason and the simplest
idiotproof way to build it), a data-model sketch, the screens, and two full
workflow walkthroughs. Nothing here is live yet.

> **Beta scope cut (2026-08-18e) — CANON is authoritative.** Three features are
> **removed from the beta**: the **review canvas** (F5/F6 + annotations/ink),
> **kanban boards** (F3a), and **numbered versions** (F7). Their tables, RPCs,
> screens and Realtime channels below are **historical** — do not build them. A new
> take is just a new upload; feedback lives in chat and post comments. Storage is
> the **two-slider, no-pooling** model priced **$0.032/$0.028/$0.024 per GB**
> (10 GB free); see CANON §D.2. Where this narrative still describes a cut feature or
> old pricing, **CANON wins.**
>
> **Later decisions (2026-08-19) — also CANON-authoritative, may post-date this text:**
> the **placement model** (a work has one home; `placement` rows put it on
> feed/server/dm — §D.3); the **File explorer** (Media→Files, a **nested folder tree**
> + grid/list/**feed** views; `folders.parent_id`, a file's location =
> `placement.folder_id` — §C.6); **Collaborators** (renamed from credits, a
> consent-gated `work_collaborators` join table — §D.3.1); the **fast upload**
> (drop → visibility → Post, details opt-in); and **default roles** (a new server
> ships Owner + @everyone only — §D.1).

A clickable black-and-white mockup of every screen lives at
[`docs/design/gallery.html`](design/gallery.html): workspace (channels,
media, chat, members), following feed, media explorer, call, details pane, profile,
DMs, upload, group settings, create/join, notifications, search, quick switcher,
thread view, channel pins, and profile popouts. *(The mockup still contains the
now-cut review canvas and kanban board — beta cut 2026-08-18e; ignore them.)* Its
tokens and components are documented 1:1 in
[`docs/design/styleguide.html`](design/styleguide.html) (§8). Read this doc next
to both.

It's grounded in the current contract (`CANON.md`, `ARCHITECTURE.md`, the design
sources in `docs/design/`) and in how the reference apps actually work, Discord,
Slack, Frame.io, Figma, SoundCloud/BandLab, and the one cautionary tale,
Abstract. Sources at the end.

---

## 0. The shape of it

### Three layers, one account

The single idea the whole thing hangs on: **every file a person has lives in
exactly one of three places, and the place decides who can see it.**

| Layer | Who sees it | What it's for |
|---|---|---|
| **Public** | anyone; shows in your followers' feeds | your portfolio, the finished pieces you're known for |
| **Personal** | only you | your private shelf, drafts, scraps, references, the stuff not ready for anyone |
| **Work** | the members of the group it's in | live collaboration, WIPs, stems, plates, sessions |

Today eski is public-by-default single-owner posting. This adds the other two
layers. In the schema it's one column, a work's **`visibility`** is `public`,
`personal`, or `group` (+ a `group_id` when `group`). Get that column and its
read rule right first; it's the expensive thing to change later (§2).

**Nothing here is publicly discoverable.** There is no directory, no open feed,
no "browse studios." You find people the way it actually happens, you see
someone's work on TikTok or at a show, you ask for their eski username, you add
them. Groups are joined by a **magic link** someone sends you. That's the whole
funnel, on purpose: it keeps private substance private (the copyright posture
below) and it matches how collaborators really meet.

### What we take from each app, and the one thing we refuse

| From | Take | Why |
|---|---|---|
| Discord | the server rail, **user-created channels**, roles, **add-a-friend-by-username**, voice/video channels | this is the workspace shape people already know |
| Slack | topic-in-channel / reply-in-thread, **persistent searchable chat** | chat that sticks is what makes it a workspace, not a fancy dropbox |
| Frame.io / Figma / SoundCloud | on-media review (draw on a frame, mark a region, highlight a waveform range) | *the review-canvas moat — **deferred past the beta** (F5 cut); listed here as the eventual differentiator* |
| Supabase Realtime | Presence for "who's online / what they're on" | the ambient "the studio is occupied" signal, no table needed |

**We refuse Abstract's model.** Abstract brought git-style
*branch → change → request review → merge* to designers; Adobe shut it down in
2023 and the documented lesson is that **forcing a developer's branch/merge
workflow onto artists does not work.** So eski has **no branching** and (as of the
beta cut) **no version stacking either** — a new take is just a new upload. "Fork"
is a plain duplicate of a file with a credit back to the original, not a branch.
That restraint is a feature.

---

## 1. Feature list

Each: **why it's here → the simplest idiotproof plan → what it touches.**
Tier = suggested build order.

### Tier 1, the workspace spine

#### F1. Groups + magic-link join
**Why.** A group is the studio you get invited to, the container Work-layer
content lives in. Joining has to be as close to zero-friction as possible.
**Plan.** `groups` + `group_members`. Joining is a **magic link**
(`/join/<code>`): open it, you're in, no application, no approval queue, no
directory. A link can be revoked or capped; that's the only gate.
**Touches.** two new tables; `/join/<code>`; the rail's "＋" (create / join /
add friend).

#### F2. Two roles: admin and member
**Why.** Someone runs the group; everyone else works in it. That's all the
distinction a small creative team actually needs on day one.
**Plan.** `group_members.role` is `admin` or `member`, nothing else. Admins
manage the group (channels, members, invite links, delete); members do
everything else. Every capability is a one-line check against that column. More
roles are a later, deliberate call, not a v1 default.
**Touches.** `group_members.role`; the Members list; group-admin write policies.

#### F3. User-created channels + persistent chat
**Why.** A real workspace is many rooms, not one feed, `#beats`, `#mixing`,
`#renders`. And the chat has to persist: searchable, exportable history is what
makes it a studio instead of a file-drop.
**Plan.** `channels` (group_id, name, `kind` in text/voice, position),
admins add, rename, reorder them. `messages` (channel_id, user_id, body,
`parent_id` for a one-level thread) **stored in Postgres**, so it's searchable
and exports. A shared file renders as its card inline in the stream. The channel
column also lists the group's **Media** (the explorer, F8) and **Voice** rooms
(F14), each a `kind` in the same column, so everything the group makes lives in
one navigable rail.
**Touches.** `channels` + `messages` tables; the channel column + chat pane
(mockup: Workspace).

#### F4. The visibility rule + copyright posture
**Why.** This is the copyright strategy as one policy: Work and Personal content
is invisible to crawlers and strangers, so DMCA volume stays low because nothing
is publicly broadcast.
**Plan.** One read rule on `works`: visible if `visibility='public'` **or**
`owner_id = you` **or** (`visibility='group'` and you're a member of its
`group_id`). Group and personal routes send `noindex`; only `public` works get
OG tags or appear anywhere a non-member can reach.
**Touches.** the `works` read policy and its mirrors on comments/messages/files.

> **F5 / F6 / F7 removed (beta cut, 2026-08-18e).** The review canvas + floating
> comments (F5), link-shareable scratchpad workspaces (F6), and numbered versions
> (F7) are **cut from the beta**. Precise on-media review and version stacking are
> gone; feedback lives in **chat and post comments**, and a new take is just a new
> upload. Their old tables (`scratchpads`, `scratchpad_items`, `annotations`,
> `works.version_of/version_note`) are not built. This is a deliberate simplification
> toward "Discord + Google Drive" — see the CANON beta-cut note.

#### F8. Attribution / **collaborators** (renamed from credits, 2026-08-19)
**Why.** On a collaborative track or shot, everyone needs to know who did what,
and that credit should travel with the file forever — and the name should read in a
social context too ("with @rae"), not only an artist one.
**Plan.** Each collaborator is a **real `@handle` + an optional role** ("prod",
"mix"), rendered as a **chip in that member's server colour** (F13a). It's
**consent-gated** (CANON §D.3.1): crediting a friend/co-member auto-accepts, a
stranger is pending, and anyone can self-remove. Not a free-text line — a
`work_collaborators(work_id, user_id, role, status)` join table, so credits link to
identities and can't be spammed onto someone. Renamed from **credits**.
**Touches.** `work_collaborators`; the upload sheet's "Add details" + details pane.

### Tier 3, files that behave

#### F9. Titles and tags, no captions
**Why.** The smallest throwaway file becomes important three weeks later; if it
was named and tagged going in, it's findable. A caption reads like a social post,
so posts have a **title, not a caption**, and the title is optional, the **file
name is the default title** when it's blank.
**Plan.** The upload sheet always shows tags + credits and an optional title.
Feeds and the explorer show the title; a file shared into a channel or message
leads with the **file name**. Inline lists show the **first 5 tags** with a
"+N"; the rest live in the details pane, which shows all with a ＋ to add more.
**Touches.** `works.title` (nullable, falls back to file name); the upload sheet
and the card renderer; `content_tags` already exists.

#### F10. File-type recognition (no visible auto-tags for now)
**Why.** The type is worth knowing (filter "all `.exr` from today"), but showing
it as a tag chip on every card clutters the tag row with `wav`/`flp`/`audio`.
**Plan.** On upload, read the extension (and magic-bytes where cheap) and store
it (`works.file_ext`, and `kind`) so the Type filter and the file icon work.
**Do not render it as a tag for now**, the icon and the Type dropdown carry it;
only the user's own tags show as chips. (Auto-tag chips can come back later if
they earn it.)
**Touches.** upload flow (client-side extension map); the Type filter; the file
icon. No auto-tag chips.

#### F11. Format conversion (upload once, download what you need)
**Why.** A collaborator on Ableton can't open your `.flp`, but they can use your
bounce, and they want it as `wav`, not `mp3`. Handing every file back in the
format the other person needs removes a whole category of friction.
**Plan.** For files where it's well-defined (audio first: `mp3`↔`wav`↔`opus`↔
`ogg`↔`flac`; video later: `mp4`/`webm`/`mov`), a **"get as …"** menu transcodes
**on demand** server-side and streams the result, you still upload once.
Project files (`.flp`, `.als`, `.aep`) aren't convertible and just download as-is.
**Touches.** a small transcode endpoint (ffmpeg); the "get as" menu on a file.

### Tier 4, people and presence

#### F12. Following feed (people you've added, never an open feed)
**Why.** You want to see what the people you rate are putting out, without an
algorithmic firehose of strangers. It's a portfolio feed of your circle.
**Plan.** `follows` already exists. The Home feed shows **only `public` works by
people you follow**, newest first, with the same card grid the current Discover
feed uses. Work and Personal never appear here.
**Touches.** the feed query (scope to followees, `visibility='public'`); the
card grid, which shows the media at its natural aspect with **no card background
or type badge** (video gets a play overlay, audio a high-resolution mirrored
waveform, text its own words) and the **title** beneath it (mockup: Feed).

#### F12a. Per-group member colours
**Why.** eski's chrome is otherwise pure black-and-white, but in a busy group
you scan by person. Giving each member one colour, and only inside that group,
makes authorship legible without turning the UI into confetti.
**Plan.** Assign each `group_members` row a colour from a small fixed palette on
join. That colour renders **only inside the group**, on a member's name or
avatar (chat byline, Members rail, contributor chips in the details pane) and
**nowhere else**, never on a profile or the public feed (both were scrubbed of
colour). It is not a role and
carries no meaning beyond identity.
**Touches.** `group_members.color`; the name-chip component.

#### F13. DMs (add by username)
**Why.** You meet someone off-platform, get their username, and message them
directly, the on-ramp before you ever share a group link.
**Plan.** Add-by-exact-username creates a DM thread; `dm_messages` mirrors the
`messages` shape. No discovery, no friend suggestions, you must know the
username. Voice/video (F15) works in a DM too.
**Touches.** `dm_threads` / `dm_messages`; the DMs screen (mockup: Direct
messages).

#### F14. Voice + video calls
**Why.** Remote collaboration needs live rooms, a co-writing session, a
pre-deadline review, screen-sharing a DAW or a comp. Async review plus a live
room is the whole loop.
**Plan.** A **voice/video channel** in a group (and a call button in a DM),
lightweight, with screen-share. Don't build the media stack from scratch, wire
a WebRTC SDK (LiveKit/Daily/100ms) into a channel; the room is keyed by
channel/DM id. Presence already shows who's in a voice channel.
**Touches.** voice channels in the channel list; a call surface; a WebRTC
provider *(owner's call: which)*.

#### F15. @mentions + notifications
**Why.** A drawn note is useless if the person who needs it never learns it's
there. Mentions pull people back.
**Plan.** Parse `@username` in messages/notes → a `notifications` row for the
mentioned member; a bell in the header shows unread. In-app first (CANON: in-app
notifications only for v1); email/push is a later single notifier pipe reused for
every alert.
**Touches.** `notifications` table; the header bell; mention parsing on insert.

#### F16. Presence
**Why.** "dev, sharing FL", "rae, recording": the ambient sense the studio is
occupied and alive.
**Plan.** **No table.** Supabase Realtime **Presence** per group: each client
`.track()`s `{username, doing}`; the Members rail reads the merged set for
online dots and the "working on" line.
**Touches.** a Realtime channel per open group; the Members rail.

### Tier 5, ownership & safety

#### F17. Storage quota (soft caps) · F18. Takedown/counter-notice/preserve · F19. Export
- **Quota:** `works.bytes` is already summed; warn at a threshold per group/owner
  rather than hard-block (the hard ceiling already lives on the signer).
- **Takedown:** a copyright report → admin sets the work `withheld` (hidden from
  the group, kept in the owner's private archive with a notice) → a one-click,
  pre-filled **counter-notice**. Content is never vaporized.
- **Export:** because storage is content-addressed, "export my group / my
  account" is a manifest + client-side zip of files + metadata. No lock-in.

### Cut on purpose (say no)
- **Public directory / discovery / open feed**, cut entirely in favour of
  invite-by-username + magic-link. This is a product stance, not a gap.
- **Branch/merge version control**, the Abstract lesson. (And in the beta, numbered
  versions too — a new take is just a new upload.)
- **Fork**, dropped entirely. To riff on a file, download, change, reupload with
  credit. A copy-with-lineage action isn't worth the concept.
- **Like / reactions**, dropped. This is a workspace, not a like economy.
- **Roles on a profile**, roles live only inside a group, never on the person.
- **Custom roles, per-channel permission overwrites**, two roles first.
- **Approval/lurker join flows**, a magic link replaces all of it.

---

## 2. Data model sketch (not final DDL)

The backend is a clean slate (CANON §D) — the schema is authored fresh for this
product, so the tables below are new, not adds onto an inherited schema.

```
groups          (id, slug, name, description, cover_key, owner_id, created_at)
group_members   (group_id, user_id, role in (admin,member), color, joined_at,
                 primary key (group_id,user_id))   -- color: per-group identity (F12a)
group_invites   (code pk, group_id, created_by, expires_at, max_uses, uses)
channels        (id, group_id, name, kind in (text,voice), position)
messages        (id, channel_id, user_id, body, parent_id, created_at)   -- persistent chat
reactions       (message_id, user_id, emoji, primary key(message_id,user_id,emoji))
dm_threads      (id, a_user, b_user, created_at)          -- add-by-username
dm_messages     (id, thread_id, user_id, body, created_at)
save_folders    (id, owner_id, name)                      -- private bookmarks (details "Save")
save_folder_items(folder_id, work_id)                     -- private bookmark folders (§A.8)
notifications   (id, user_id, kind, target_type, target_id, read_at, created_at)
placement       (id, work_id, surface in (feed,server,dm), surface_id,
                 channel_id null, folder_id null, placed_by, created_at)  -- §D.3
folders         (id, server_id, parent_id null → folders, name)          -- nested file tree, §C.6
work_collaborators(work_id, author_id, user_id, role null,
                 status in (pending,accepted), pk(work_id,user_id))       -- consent-gated, §D.3.1

works.visibility   text in (public,personal,server) -- the three layers (§0)
works.title        text null                         -- F9: optional, file name is the default
works.file_ext     text                              -- F10: type for icon + filter, not shown as a tag
comments.context   text                              -- scope: 'public' vs a server_id, so threads never mix
```
*(Cut in the beta — not in the schema: `boards`/`board_columns`/`board_cards` (F3a),
`scratchpads`/`scratchpad_items`/`annotations` (F5/F6 canvas), `works.version_of`/
`version_note` and `comments.mark` (F7 versions / canvas marks).)*

The helper every group policy leans on, and the one rewritten read rule:

```sql
create function member_of(gid uuid) returns boolean language sql stable
  security definer set search_path=public as $$
  select exists(select 1 from group_members m
    where m.group_id=gid and m.user_id=(select auth.uid())) $$;

create policy works_read on works for select using (
  visibility='public'                                   -- portfolio, in feeds
  or owner_id=(select auth.uid())                       -- your own / personal
  or (visibility='group' and member_of(group_id)));     -- the work layer
```

Follow the project's own rule, **the policy is the fence, the UI is the
signpost** (`ARCHITECTURE.md`).

---

## 3. Screens

The main screens are the mockup: [`docs/design/gallery.html`](design/gallery.html).
Design language is `docs/design/styleguide.html`: black/white/grey, surfaces separated
by background step (no borders, no hairline dividers), "on" is an ink fill,
sentence case throughout, monochrome SVG icons, no likes. The only colour is a
member's per-group identity colour (F12a). Interactive fields carry a visible
border so they read as editable. What each contains:

- **Workspace**, group rail (Home, Messages, one icon per group, ＋, and your own
  **profile picture** at the foot) · channel column listing **Media**, text
  **Channels** and **Voice** rooms (admin-editable) · chat pane (persistent; a
  shared file leads with its **file name**; each message has an **emoji-reaction**
  button on hover) · members rail (Admins / Members, presence dot + "working on",
  names in group colour).
- **Feed**, the follows-only portfolio grid with a **search bar** and dropdown
  filters; cards have **no background** (video → play overlay, audio → high-res
  waveform, image → real-aspect thumbnail, text → its words) and show the
  **title**; clicking a card opens the details pane.
- **Media explorer**, the group's files as the same grid plus a **Collections**
  strip, with a search bar + dropdown filters (channel, type, uploader, sort),
  Reddit-style, no tag modifiers; reuses the details pane.
- **Details pane**, opened from any card: media on one side; on the other the
  title (or file name), all metadata, tags (user tags only, with a ＋), contributor
  chips (in group colours), and comments **scoped to context** (group vs public
  never mix); **Download** (formats on click) and **Save** (to a folder).
- **Call** (F14), the voice/video room: a large screen-share pane (someone
  sharing a DAW or comp), a strip of participant tiles (camera or avatar, name in
  group colour, mute indicator), and a control bar (mic, camera, screen-share,
  participants, leave).
- **Profile**, Public / Shared / Private shelves (the three visibility layers)
  plus a **Settings** tab; name, handle, bio, Add-friend / Message. No roles, no
  reel, **no coloured names** (colour is group-only), no explainer text.
- **Messages**, add-by-username field (no directory), thread list, conversation,
  call/video buttons.
- **Upload**, multi-file dropzone; type is recognised for the icon and filter but
  **not shown as a tag** (F10); an optional title (file name is the default),
  user tags + contributors; a **Visibility** choice (Everyone / This group / No
  one), saved to your profile by default.

- **Group settings** (admin only), a left-nav of General (name, cover, delete),
  Channels (reorder/add/remove), Members (role toggle admin/member,
  remove), Invite links (list with uses/expiry, copy, revoke, new link), and
  Export & storage (usage bars + storage sliders + export). Reached from the group-name header.
- **Create group**, a centered card: name, cover, starter channels, and the note
  that an invite link is minted with the group. Reached from the rail's ＋.
- **Join by magic link** (`/join/<code>`), a centered preview card: cover, name,
  member count and avatars, who invited you, and one **Join group** button, no
  application or approval.
- **Notifications**, All / Mentions / Unread, grouped by day; rows for mentions,
  comments, joins, and reactions, each linking to its target. Reached from the
  header bell.

---

## 4. Two workflows

Concrete end-to-end walkthroughs. Each names the features it exercises so a flow
can be checked against §1 and the mockup.

### A. A remote album, producers & rappers across Ableton and FL

**The team.** jax (producer, Ableton) and rae (writer/rapper) are admins; dev
(producer, FL Studio), tomo (mix, Ableton), kofi and nel are members. Nobody's
in the same city.

1. **Getting everyone in.** jax makes the group **LATE BLOOM LP**, hits *invite*,
   and texts the **magic link** to the group chat they'd been using. One tap each
   and they're in, no signup dance, no approvals. (F1, F2)
2. **Rooms, not one feed.** jax sets up channels: `#announcements`, `#beats`,
   `#verses`, `#mixing`, `#references`, `#stems-and-sessions`, plus voice rooms
   *the booth* and *co-writing*. (F3)
3. **A beat goes up.** dev drags `late_bloom_beat.flp` into `#beats`. eski
   **auto-tags** it `flp` + `audio`, dev leaves the title as the file name, tags
   it `142bpm` and `bridge`, and sets the **credits** "prod. jax · arrangement
   dev." Chat is
   **persistent**, so this is findable in three weeks. (F9, F10, F8, F3)
4. **Crossing DAWs.** tomo's on Ableton and can't open a `.flp`, so dev also
   posts a `wav` bounce. tomo grabs it straight, kofi pulls the same file **as
   `mp3`** for his phone, nel takes the `flac`. One upload, everyone's format.
   (F11)
5. **Precise feedback.** rae opens the bounce in the **canvas**, **highlights
   0:42–0:48** on the waveform, "low end's muddy right here", and @mentions
   tomo. tomo gets a bell, opens the exact range, replies, and marks it resolved.
   (F5, F15)
6. **Versions, not chaos.** tomo (not the original poster, and that's fine, any
   member can) adds **v3** with the required note "brought the low end down." v1
   and v2 stay one click away in the version dropdown, each listed by file name;
   rae's canvas note stays on v2, v3 starts clean. A guest who wants to flip the
   beat just **downloads** it, reworks it, and reuploads his own with dev
   credited. No fork, no merge. (F7)
7. **A live session.** For the hook, jax, rae and dev jump into the **the booth**
   voice room; dev **screen-shares FL** while rae tracks a scratch. (F14)
8. **An outsider, safely.** The mastering engineer isn't in the group. rae makes
   a **link-only workspace** of the three finals and sends just that URL; he
   opens it, leaves a drawn/heard note, and never sees the rest of the studio.
   (F6)
9. **Meeting new people.** rae saw a vocalist on TikTok, got their username, and
   **added them by username** in DMs, then sent the group magic link. (F13, F1)
10. **Shipping.** When "bloom" is done, rae posts the master to her **Public**
    shelf with credits; it lands in her followers' **feed**. Every WIP, stem and
    session stays in the **Work** layer, private. At wrap, jax **exports** the
    group as a zip. (F12, F19)

### B. A VFX shot on a deadline, compositor, animator, mograph, generalist

**The team.** mira (compositor, admin), lin (animator), sol (motion graphics),
jax (generalist doing cleanup + wrangling). The shot `sh040` is due Friday.

1. **Spin-up.** mira creates **SPECTER, sh040** and drops the **magic link** in
   the studio's Slack; everyone's in inside a minute. Channels: `#brief`,
   `#plates`, `#anim`, `#comp`, `#mograph`, `#renders`, voice *review room*. (F1,
   F3)
2. **Assets land, already labelled.** lin posts a playblast (`mp4` → auto-tagged
   `mp4`+`video`), sol posts a title-sequence draft, jax uploads plates as
   `.exr`, **auto-tagged `exr`** so mira can later filter `#renders` to "all
   `.exr` from today." Every upload carries tags by default. (F9,
   F10)
3. **The review that only eski can do.** mira opens `sh040_comp` **v3** in the
   **canvas** and **draws on the frame**: circles the building edge that's
   ghosting against the sky, arrows the light bloom she wants kept. sol
   **highlights 0:42–0:48** on the sound-design pass, "whoosh lands a beat late,
   pull it ~6 frames." lin adds a note; each is anchored to its mark and
   resolvable. (F5)
4. **Iterations stay legible.** mira posts **v4** after the fixes; v3 keeps its
   drawn notes, v4 is clean. No `sh040_comp_FINAL_v2b`. (F7)
5. **Right format for each seat.** The client wants an `mp4` review copy, the
   editor wants a `mov`; the render's uploaded once and each pulls the format
   they need. (F11)
6. **The client, boxed in.** The director isn't in the group and shouldn't see
   the plates. mira makes a **link-only workspace** of just the shot's versions
   and sends the URL; the director draws a note on the frame, and sees nothing
   else. (F6)
7. **Crunch call.** Thursday night the four hit the **review room** voice channel;
   mira **screen-shares the comp** and they clear the last notes live. Presence
   shows who's still on. (F14, F16)
8. **Credit and archive.** The final comp's **credits** read "comp mira · anim
   lin · mograph sol · cleanup jax." mira posts the approved frame to her
   **Public** shelf; the shot's working files stay in **Work**. After delivery she
   **exports** the group for the archive. (F8, F12, F19)

---

## 5. Owner's calls (what's left to you)

Decided by your adjustments, recorded here: **two roles** (admin/member),
**user-created channels**, **persistent chat** with **emoji reactions**, **DMs by
username**, **no discovery** (magic-link + username only), **no branching and (beta)
no numbered versions** — a new take is just a new upload, **no fork** (download,
change, reupload with credit), **no likes**, **titles not captions** (file name is
the default title), **no review canvas or kanban boards in the beta**, **roles never
on a profile**, **per-group member colours**, three consistent visibility layers
(public / shared / private). Still genuinely yours:

- **WebRTC provider for calls (F14)**, LiveKit / Daily / 100ms / self-hosted.
  A real build-vs-buy and cost decision.
- **Transcode scope (F11)**, audio only for v1 (clean, cheap), or video from
  the start (heavier: codecs, storage of derived files or transcode-on-every-
  request). Recommend audio first.
- **Member-colour palette (F12a)**, how many colours, and what happens past that
  many members in one group (reuse, or extend the palette).
- **Notifications channel**, in-app bell for v1 (CANON: in-app only); email/push
  is a later single notifier pipe. When is yours.
- **Still open, now load-bearing:** register the DMCA agent (private layers lower
  volume but safe harbour still needs the filing), and the Supabase region
  (`eu-north-1`) if the collaborator audience isn't in Europe; persistent chat and
  live calls make latency more noticeable than a feed did.

---

## 6. Build status and todo

Nothing is live yet. This tracks the **gallery** (the design target) and the
**parity** pass against Discord/Slack. Backend for all of it is §7.

### Core screens (the design target)
Workspace (channel column of Media / Channels / Voice, chat, members) · Feed ·
Media explorer (+ Folders) · Details pane · Call · Profile · Messages · Upload ·
Group settings · Create group · Join by link · Notifications. *(Canvas, Board and
version mode are **cut from the beta**, 2026-08-18e.)*

### Parity pass vs Discord/Slack (13) · all 13 mocked
1. Search results · **done** (mockup)
2. Quick switcher (Cmd/Ctrl+K) · **done**
3. Thread view · **done**
4. Channel tabs + pinned messages (Pins / Files) · **done**
5. Rich composer + message actions (formatting, emoji picker, message menu, typing, edited) · **done**
6. Member / profile popout + status/presence · **done**
7. Call upgrades (share controls, in-call chat/notes, layout toggle, speaking ring, reactions) · **done**
8. DMs upgrades (group DMs, friends/requests surface, mute/pin) · **done**
9. Notifications upgrades (inline reply, Threads tab, Saved/Later, per-group filters) · **done**
10. Group settings: moderation (bans/timeouts, audit log, per-channel settings) · **done**
11. Media explorer actions (grid actions, lightbox, "shared in") · **done**
12. ~~Board upgrades (custom fields, views, due dates)~~ · **cut (beta)**
13. Sign-in / onboarding / username claim · **done**

### Owner decisions still open (see also §5)
WebRTC provider (F14) · transcode scope audio-first vs video (F11) · member-colour
palette size (F12a) · notifications email/push channel (F15) · DMCA agent + region.

---

## 7. Backend plan (hand-off ready)

Everything below is derived from the mockup. Stack is unchanged: **Supabase**
(Postgres + Auth + Realtime), **R2** for media behind `api/sign.mjs`, **Vercel**
for pages/functions. The project's rule holds: **the RLS policy is the fence, the
UI is the signpost** (`ARCHITECTURE.md`), every table ships with RLS. The schema
is authored fresh (clean slate, CANON §D); tables are `create table if not exists`
in the migration order of §7.8. Build each unit at the smallest size that works, and prefer a
proven package only where the DIY version is a real time-sink (§7.6).

### 7.1 New tables
Each row: purpose · columns · RLS summary. `uid()` = `(select auth.uid())`.

| Table | Purpose | Columns (beyond `id uuid pk default gen_random_uuid()`, `created_at`) | RLS |
|---|---|---|---|
| `groups` | a studio | `slug uniq, name, description, cover_key, owner_id→auth.users` | read: `member_of(id)`; write: `is_group_admin(id)` |
| `group_members` | membership + role + colour | `group_id, user_id, role in(admin,member), color smallint, status in(active), timeout_until timestamptz, joined_at, pk(group_id,user_id)` | read: `member_of(group_id)`; self-leave; admin manages |
| `group_invites` | magic links | `code text pk, group_id, created_by, expires_at, max_uses int, uses int default 0` | read: admin; use via RPC |
| `channels` | rooms | `group_id, name, kind in(text,voice), topic, slowmode_sec int default 0, position int` | read: `member_of(group_id)`; write: admin |
| `messages` | persistent chat | `channel_id, user_id, body, parent_id→messages, also_to_channel bool, edited_at, deleted_at, body_tsv tsvector generated` | read: member; insert: member & not timed-out; update/delete own (tombstone) |
| `message_reactions` | emoji reactions | `message_id, user_id, emoji text, pk(message_id,user_id,emoji)` | read: member; add/remove own |
| `message_pins` | per-channel pins | `channel_id, message_id, pinned_by, pk(channel_id,message_id)` | read: member; write: member (mod can unpin any) |
| `channel_reads` | unread/mention state | `user_id, channel_id, last_read_at, pk(user_id,channel_id)` | owner only |
| `mentions` | @-index for badges | `message_id, mentioned_user, group_id` | read: mentioned user |
| `dm_channels` | 1:1 and group DMs | `is_group bool, name null` | member of it |
| `dm_members` | who's in a DM | `dm_channel_id, user_id, muted bool, pinned bool, last_read_at, pk(...)` | self |
| `dm_messages` | DM chat | mirrors `messages` (dm_channel_id, user_id, body, parent_id, edited_at, deleted_at) | member of the DM |
| `friendships` | add-by-username | `a_user, b_user, status in(pending,accepted,blocked), requested_by, pk(a_user,b_user)` ordered pair | either party |
| `notifications` | the bell | `user_id, kind in(mention,comment,join,reaction,invite,friend), actor_id, group_id null, target_type, target_id, excerpt text, read_at` | owner only |
| `saved_items` | Save / Later | `user_id, target_type, target_id, folder_id null→save_folders, pk(user_id,target_type,target_id)` | owner only |
| `group_bans` | moderation | `group_id, user_id, banned_by, reason, until timestamptz null` | admin |
| `audit_log` | moderation trail | `group_id, actor_id, action, target_type, target_id, meta jsonb` | admin read; server-written |

**Already live, reused as-is:** `works`, `work_items`, `collections`,
`collection_items`, `content_tags`, `comments`, `likes` (unused, keep dormant),
`save_folders`/`save_folder_items`, `seen_marks`, `reports`, `follows`,
`profiles`, `upload_quota`, `admins`/`is_admin()`, the rate-limit machinery.

### 7.2 Columns added to existing tables
```
works.visibility    text in(public,personal,server) default 'public'  -- §0
works.title         text null                    -- F9 (file name is the default)
works.file_ext      text                         -- F10 (icon + Type filter, not a tag)
works.search_tsv    tsvector generated           -- title+tags+owner for search
comments.context    text                         -- 'public' or a server_id, threads never mix
comments.resolved_at timestamptz null            -- post comments resolve
-- new tables (2026-08-19, §D.3/§C.6): placement, folders(parent_id), work_collaborators
-- (F8 credits is now the consent-gated work_collaborators join table, not a works column)
profiles.status_emoji text / status_text text / status_expires_at timestamptz  -- custom status
profiles.presence_state text in(online,idle,dnd,invisible) default 'online'
profiles.tz         text                         -- local-time on the popout
profiles.pronouns   text
profiles.links      jsonb                         -- external connections on the popout
```
**Dropped:** `works_version_owner_guard` (numbered versions are cut, F7).

### 7.3 RPCs, triggers, functions (all `security definer`, `search_path=public`)
- `member_of(gid)` / `is_group_admin(gid)`, the two gate helpers every policy calls.
- `join_via_invite(code)`, validate code (exists, not expired, uses<max) → insert `group_members` active, assign next free colour, `uses+1`; returns group. (Powers `/join/<code>`.)
- `mark_channel_read(channel_id)`, upsert `channel_reads.last_read_at=now()`.
- `toggle_reaction(message_id, emoji)`, insert/delete `message_reactions`.
- `pin_message(message_id)` / `unpin_message(message_id)`.
- `create_dm(handle)` / `create_group_dm(handles[])`, resolve handles→users, find-or-create `dm_channels` + `dm_members`.
- `add_friend(handle)` / `respond_friend(user, accept)` / `block_user(user)`.
- `ban_member` / `timeout_member` / `kick_member` (admin), each writes `audit_log`.
- `export_manifest(group_id|'account')`, returns JSON of works+metadata; client fetches signed URLs and zips.
- **Triggers:** `messages` fanout on insert → parse `@handle`, write `mentions` + `notifications`; `set edited_at` on body change; tombstone on `deleted_at`. `works` insert → maintain `search_tsv`. `comments` insert with a mention → `notifications`. Reuse `post_status_guard`, `comments_*` guards, `claim_rate` (comments/reports already rate-limited; extend to `messages` at e.g. 60/min).
- **Kept as-is:** `file_report`, `delete_my_account`, `profiles_tombstone`, `claim_upload_quota`.

### 7.4 Realtime (Supabase)
| Channel | Mode | Carries |
|---|---|---|
| `group:{id}` | **Presence** | who's online + `{doing}` (Members rail, F16) |
| `channel:{id}` | **Postgres Changes** | live `messages` insert/update/delete |
| `channel:{id}:typing` | **Broadcast** | typing indicators (ephemeral, no table) |
| `user:{id}` | **Postgres Changes** | `notifications` insert (the bell) |
Add the relevant tables to the `supabase_realtime` publication.

### 7.5 Server / edge functions
- `api/sign.mjs`, **exists**, presigned R2 uploads. Unchanged.
- `transcode`, audio on demand (F11). **Not** a Supabase Edge Function (no ffmpeg
  there); a Vercel Node function with `ffmpeg-static`, or a tiny worker. Video is
  a later, heavier call (Mux/Cloudflare Stream).
- `notify`, email/push fanout off `notifications` (later; shares the CSAM-alert pipe).
- Export can stay client-side (JSZip) reading `export_manifest`; move server-side only if zips get large.
- WebRTC signaling is the provider's (LiveKit/Daily), not ours.

### 7.6 Client packages: build vs buy (smallest unit each)
| Unit | Decide | Why |
|---|---|---|
| Voice/video calls (F14) | **Buy: LiveKit** (cloud or self-host) | media/SFU stack is months of work; rooms key by channel/DM id |
| Full-text search (#1) | **Build: Postgres FTS** (`tsvector` + GIN) | built in, enough for one group's scale; revisit Meilisearch only if it strains |
| Emoji picker (#5) | **Buy: emoji-mart** (data + search) | emoji dataset + skin tones is not worth hand-rolling |
| Message formatting (#5) | **Build tiny** | plain textarea + toolbar that inserts markdown; render with `marked` (small). No ProseMirror/Slate for v1 |
| Mentions / channel autocomplete | **Build** | a prefix query over members/channels; trivial |
| Drag-reorder (channels) | **Buy: SortableJS** | DnD edge cases (touch, autoscroll) are the time-sink |
| Waveform render | **Build (already have)** | `generateWaveform()` exists and is theme-aware; keep |
| Zip export (F19) | **Buy: JSZip** | standard, client-side |
| Local time / dates | **Build: `Intl`** | built in; store `profiles.tz` |
| Quick switcher / shortcuts (#2) | **Build** | already mocked; a keydown map + fuzzy filter |
| Invite codes | **Buy: `nanoid`** | 1-line, collision-safe short codes |
| Transcode (F11) | **Buy the binary: `ffmpeg-static`**, glue is ours | don't reimplement codecs |
| Rich profile / status / presence (#6) | **Build** | plain columns + Realtime presence |

### 7.7 Indexes and search
- GIN on `messages.body_tsv`, `works.search_tsv`; one `search_all(q, scope)` RPC
  unions the three (messages, works, comments) with `ts_rank`, feeding screen #1
  and the quick switcher. Modifiers (`from:`, `in:`, `has:`) parse client-side into
  query args.
- FK indexes on every `*_id` used in a policy or a join (`messages.channel_id`,
  `notifications.user_id, read_at`, `channel_reads`, …) , same discipline as the
  existing `works_*_idx`.

### 7.8 Migration order (each a re-runnable file, `schema-*.sql` convention)
1. `groups`, `group_members`, `group_invites` + `member_of`/`is_group_admin`.
2. `works` column adds + the rewritten `works_read` (§2) and mirrors on comments/tags.
3. `channels`, `messages` (+tsv), `message_reactions`, `message_pins`, `channel_reads`, `mentions`.
4. `comments.context/resolved_at`.
5. `dm_channels`/`dm_members`/`dm_messages`; `friendships`.
7. `notifications`; `saved_items`; message/comment→notification triggers.
8. `profiles` additions (status, presence, tz, pronouns, links).
9. moderation: `group_bans`, `audit_log`, `group_members.timeout_until`.
10. RPCs (§7.3), FTS indexes (§7.7), grants, `notify pgrst 'reload schema'`, realtime publication.

### 7.9 Per-screen backend checklist (so nothing is missed)
- **Workspace**, `group_members`→rail; `channels`→column; `messages`+Realtime→chat; `channel_reads`→unread badges; `message_reactions`; Presence→members.
- **Thread view**, `messages.parent_id`; `also_to_channel`.
- **Channel Pins/Files**, `message_pins`; `works where group_id & channel` for Files.
- **Search / quick switcher**, `search_all()` + FTS indexes.
- **Feed**, `works` public by `follows`.
- **Media explorer**, `works where group_id` + `collections where group_id`.
- **Details pane**, `works` + `content_tags` + `comments(context)` + `saved_items` + transcode.
- **Call**, LiveKit room per `channel/dm` id; Presence for who's in.
- **Profile / popout**, `profiles` (status/tz/pronouns/links) + `group_members.role` + mutual groups (a join) + `friendships`.
- **Messages**, `dm_channels`/`dm_members`/`dm_messages` + `friendships`.
- **Group settings**, `channels` (manage), `group_members` (roles), `group_invites`, `group_bans`, `audit_log`, `storage_balance`/`storage_meters` (two sliders), `export_manifest`.
- **Create / Join**, `groups` insert + `group_invites` + `join_via_invite`.
- **Notifications**, `notifications` + Realtime `user:{id}`; inline reply reuses `messages`/`comments`.
- **Sign-in / onboarding**, Supabase Auth + the sign-in/claim screen (CANON §C.14) + unique `profiles.handle` claim.

---

## 8. Design tokens

The mockup's tokens, and the live source of truth, are in
[`docs/design/styleguide.html`](design/styleguide.html), a self-contained page
that renders every token and component **1:1 with the mockup** (same CSS, same
embedded Jost, a light/dark toggle). When the live pages are built they consume
these exact values; the style guide is the only home for raw design values.

**Grounds (light → dark).** `--paper` #FCFCFC→#0E0E0E · `--surface` #F1F1F1→#181818
· `--plate` #E7E7E7→#232323 · `--paper1` #E4E4E4→#242424 · `--railbg` #E6E6E6→#080808
· `--tagbg` #DFDFDF→#2A2A2A.
**Ink (four steps).** `--ink` #141414→#F0F0F0 · `--soft` #3A3A3A→#C6C6C6 · `--muted`
#6B6B6B→#8C8C8C · `--on-ink` #FCFCFC→#0E0E0E.
**Lines** (used only for the rare divider/field border). `--line` #DADADA→#2A2A2A ·
`--line2` #C4C4C4→#3A3A3A.
**Member colours** (the only hue, group-scoped, F12a) light→dark: `--m1`
#B0503F→#D98A7A · `--m2` #A9791F→#D6B26B · `--m3` #3F7A4E→#82BE91 · `--m4`
#2F7480→#6FB9C4 · `--m5` #3F65A6→#89A6D6 · `--m6` #77558F→#B294C7.
**Type**, Jost only. Scale: `--fs-mi` 11 · `--fs-xs` 12 · `--fs-sm` 13 · `--fs`
14.5 · `--fs-lg` 16 · `--fs-xl` 20. Weights 400/600/700. Sentence case everywhere.
**Space**, 4px scale: `--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 24.
**Shape**, `--r` 3px on chrome; media stays square. **Motion**, `--t` 150ms ease.
**Layout widths**, `--rail` 58 · `--chan` 232 · `--mem` 210.
**Rules that are not tokens:** "on/selected/primary" is an **ink fill** (not a
colour); surfaces separate by **background step**, not borders (the one exception
is an interactive **field**, which gets a `--line2` border for affordance); the
Like state is retired; icons are monochrome inline SVG.

---

## Sources

- Discord, [permissions & roles](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ),
  [invite links & join flow](https://support.discord.com/hc/en-us/articles/29729107418519-Server-Member-Applications)
- Slack, [channel organization](https://www.socialintents.com/blog/slack-channel-organization-best-practices/),
  [channels, huddles, canvas](https://rottenwifi.com/what-is-slack-and-how-does-it-work-a-practical-guide-for-beginners/)
- Frame.io, [commenting & drawing on media](https://help.frame.io/en/articles/9105251-commenting-on-your-media),
  [Version 4](https://frame.io/v4)
- Figma, [comments & regions](https://help.figma.com/hc/en-us/articles/360039825314-Guide-to-comments-in-Figma)
- SoundCloud / BandLab timed comments, [music collaboration tools](https://pibox.com/resources/best-music-collaboration-software/),
  [BandLab collaboration](https://www.audeobox.com/learn/bandlab/bandlab-collaboration-features/)
- The Abstract cautionary tale, [version control for creative teams](https://www.anchorpoint.app/blog/version-control-for-the-creative-industry)
- Supabase Realtime, [Presence](https://supabase.com/docs/guides/realtime/presence)
</content>
