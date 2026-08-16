# eski, the collaboration layer (draft spec)

**Status: draft for review.** The "Discord-for-creatives" direction, worked
into a concrete plan: a feature list (each with a reason and the simplest
idiotproof way to build it), a data-model sketch, the screens, and two full
workflow walkthroughs. Nothing here is live yet.

A clickable black-and-white mockup of the main screens lives at
[`docs/design/collab-mockup.html`](design/collab-mockup.html), channels + chat,
the following feed, the drawing/audio review canvas, profile, DMs, and upload
with format conversion. Read this doc next to it.

It's grounded in what eski already is (`ARCHITECTURE.md`, `schema-clean.sql`,
`docs/design/STYLE.md`) and in how the reference apps actually work, Discord,
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
| Frame.io | **drawing on a video frame**, automatic version stacking, "notes follow the work across versions", an approval state | half the moat, precise visual feedback |
| Figma | click-drag to mark a **region**, notes listed in a rail *and* on the canvas, resolve-keeps-it | the canvas interaction, already half-built in `artboard.html` |
| SoundCloud / BandLab | **highlighting a range on the waveform** to comment on it | the audio half of the canvas; eski's player already draws the waveform |
| Supabase Realtime | Presence for "who's online / what they're on" | the ambient "the studio is occupied" signal, no table needed |

**We refuse Abstract's model.** Abstract brought git-style
*branch → change → request review → merge* to designers; Adobe shut it down in
2023 and the documented lesson is that **forcing a developer's branch/merge
workflow onto artists does not work.** So eski has **no branching.** Versions
are just numbers, v1, v2, v3, a straight line. "Fork" is a plain duplicate of a
file with a credit back to the original, not a branch. That restraint is a
feature, and it's already the schema's shape (`works.version_of`).

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
**Plan.** `channels` (group_id, name, kind text/voice, position), admins add,
rename, reorder them. `messages` (channel_id, user_id, body, `parent_id` for a
one-level thread) **stored in Postgres**, so it's searchable and it exports. A
shared file renders as its card inline in the stream.
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

### Tier 2, the moat: the review canvas

#### F5. The canvas / scratchpad (annotation + floating comments)
**Why.** This is why someone picks eski over Discord: precise, visual review on
the actual media. Discord will never build it. Two distinct things live here:
**annotation** (drawing on the media) and **commenting** (a discussion anchored
to a spot).
**Plan.** A **canvas** is a scratch workspace holding several files as tiles
(the interaction already exists in `artboard.html`: pannable, freehand draw,
drag-select). **Annotation tools** (pen / arrow / box / freeform + colour) draw
directly on an image or video tile; audio is a waveform tile you can mark a
range on. **Comments are separate and Figma/paper.design-style:** the comment
tool drops a **floating pin shown as just the author's avatar**; click it to
expand the thread and its **selection**, a point, a box, a freeform region, or an
audio range. Comments resolve (don't delete). Reuse the `comments` table + a
`mark jsonb` holding the selection (`{point}`, `{box}`, `{path}`, or `{t0,t1}`);
annotations are their own drawing layer on the tile.
**Touches.** `comments.mark jsonb`; the Canvas screen (mockup: Canvas), reusing
the artboard's draw canvas and the waveform renderer.

#### F6. Workspaces with public / private / semi-private visibility
**Why.** Not every review happens inside a group. You want to hand a director or
a mastering engineer *one board* of files, without adding them to the whole
group, and let them leave notes.
**Plan.** A **scratchpad/workspace** (a named set of files + its canvas notes)
has its own visibility: **private** (you), **group** (members), or **link**
(anyone with the URL, semi-private, not in any feed, not indexed). "Share" on a
workspace mints a link. This is F5's canvas plus a visibility toggle, the same
three-layer idea applied to a board instead of a single file.
**Touches.** `scratchpads` (owner, group_id nullable, visibility, share_code);
`scratchpad_items`.

#### F7. Versions (numbers, not branches)
**Why.** No more `beat_FINAL_FINAL.wav`. One file, a numbered stack, click v2 to
see the older one.
**Plan.** `works.version_of` / `version_label` already exist. **Anyone can add a
version, not just the original poster** (the old owner-only trigger is dropped),
so a collaborator can push a fix without re-posting. **A new version requires a
mandatory reason** ("what changed"), a short line stored per version. The
version control in the details pane opens a dropdown listing every version by
its **file name** (the one place you see file names, since posts show titles)
with its reason and author; each version keeps its own canvas notes (Frame.io's
"notes follow the work"). Strictly linear, no branch graph. **No Fork:** to riff
on someone's file you download it, change it, reupload it as your own with
credit.
**Touches.** `works.version_note` (required on a version); the version dropdown;
drop `works_version_owner_guard`.

#### F8. Attribution / credits (a plain field)
**Why.** On a collaborative track or shot, everyone needs to know who did what,
and that credit should travel with the file forever.
**Plan.** A single free-text **`credits`** field on every work, filled by hand
at upload and editable after ("prod. jax · vocals rae · mix tomo"). No
role-graph, no tagging system, just a line of text that shows on the file
everywhere it appears, including on the public portfolio. In a group context
each contributor's name renders as a **chip in that member's group colour**
(F13a), so who-did-what is scannable at a glance.
**Touches.** `works.credits`; the upload form + details pane.

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

#### F10. Auto file-type recognition + autotag
**Why.** Half the value of tags is the type, and nobody wants to type it.
Recognizing `.flp`, `.als`, `.exr`, `.nk`, `.aep` and tagging automatically
makes the library instantly filterable ("all `.exr` from today").
**Plan.** On upload, read the extension (and magic-bytes where cheap) → attach a
non-removable auto-tag (`flp`, `wav`, `exr`, …) alongside the file's `kind`.
Purely additive; the user's own tags sit next to it.
**Touches.** upload flow (client-side extension map); the auto-tag chips.

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
join. That colour renders **only where a member's name appears as a chip** (chat
byline, the Members rail, contributor chips in the details pane, canvas-note
authors) and **only within that group**, never on their profile or the public
feed. It is not a role and carries no meaning beyond identity.
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
mentioned member; a bell in the header shows unread. In-app first; email/push is
the same missing pipe as the CSAM-report alert in `ROADMAP.md`, build one
notifier, use it for both.
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
- **Branch/merge version control**, the Abstract lesson. Numbers only.
- **Fork**, dropped entirely. To riff on a file, download, change, reupload with
  credit. A copy-with-lineage action isn't worth the concept.
- **Like / reactions**, dropped. This is a workspace, not a like economy.
- **Roles on a profile**, roles live only inside a group, never on the person.
- **Custom roles, per-channel permission overwrites**, two roles first.
- **Approval/lurker join flows**, a magic link replaces all of it.

---

## 2. Data model sketch (not final DDL)

Grounded in `schema-clean.sql`; column adds are `add column if not exists`.

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
scratchpads     (id, owner_id, group_id null, title,
                 visibility in (private,group,link), share_code, created_at)
scratchpad_items(scratchpad_id, work_id, idx)
save_folders    (id, owner_id, name)                      -- private bookmarks (details "Save")
save_folder_items(folder_id, work_id)                     -- both already exist in schema-clean.sql
notifications   (id, user_id, kind, target_type, target_id, read_at, created_at)

works.visibility   text in (public,personal,group)  -- the three layers (§0)
works.group_id     uuid null → groups
works.title        text null                         -- F9: optional, file name is the default
works.credits      text                              -- F8 attribution
works.version_note text                              -- F7: required "what changed" on a version
comments.mark      jsonb null                         -- F5 draw path / audio range / frame / box / point
comments.context   text                              -- scope: 'public' vs a group_id, so threads never mix
```

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

The main screens are the mockup: [`docs/design/collab-mockup.html`](design/collab-mockup.html).
Design language is `docs/design/STYLE.md`: black/white/grey, surfaces separated
by background step (no borders, no hairline dividers), "on" is an ink fill,
sentence case throughout, monochrome SVG icons, no likes. The only colour is a
member's per-group identity colour (F12a). Interactive fields carry a visible
border so they read as editable. What each contains:

- **Workspace**, group rail (Home, Messages, one icon per group, ＋, and your own
  **profile picture** at the foot) · channel column (admin-editable text + voice
  channels, people shown live in a voice room) · chat pane (persistent; a shared
  file leads with its **file name**; each message has an **emoji-reaction** button
  on hover) · members rail (Admins / Members, presence dot + "working on", names
  in group colour).
- **Feed**, the follows-only portfolio grid with a **search bar** and dropdown
  filters; cards have **no background** (video → play overlay, audio → high-res
  waveform, image → real-aspect thumbnail, text → its words) and show the
  **title**; clicking a card opens the details pane.
- **Media explorer**, the group's files as the same grid plus a **Collections**
  strip, with a search bar + dropdown filters (channel, type, uploader, sort),
  Reddit-style, no tag modifiers; reuses the details pane.
- **Details pane**, opened from any card: media on one side; on the other the
  title, a **version control** that opens the versions by **file name** (+ their
  change reasons), all metadata, tags (all, with a ＋), contributor chips (in
  group colours), and comments **scoped to context** (a group thread and a public
  thread never mix); **Download** (formats on click), **Save** (to a folder), and
  **Open in canvas** (pick which shared canvas).
- **Canvas**, a shared scratch workspace holding **multiple files as tiles**;
  a canvas picker (many canvases, not one per group or item). **Annotation and
  commenting are separate:** annotation tools (pen/arrow/box/freeform + colour)
  draw on a tile, while the **comment** tool drops a Figma-style floating pin
  shown as just the author's avatar, expanding on click to its selection (a
  point, a box, or a freeform region, or an audio range on a waveform tile) and
  thread; the canvas has its own visibility (group or link-only).
- **Profile**, Public / Shared / Private shelves (the three visibility layers)
  plus a **Settings** tab; name, handle, bio, Add-friend / Message. No roles, no
  reel, no explainer text.
- **Messages**, add-by-username field (no directory), thread list, conversation,
  call/video buttons.
- **Upload**, multi-file dropzone with auto-detected type chips; an optional
  title (file name is the default), tags + contributors; a **Visibility** choice
  (Everyone / This group / No one), saved to your profile by default. When the
  upload is a **new version** of a post, the sheet swaps to a version mode with a
  **mandatory "what changed" field** and inherits the post's visibility (F7).

Management screens not in the mockup: **Create group** (name, cover → magic-link
nudge); **Group settings** (channels, members + role toggle, invite links,
export, storage), admin only; **Notifications** (bell dropdown).

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
username**, **no discovery** (magic-link + username only), **versions as numbers**
(no branching), **anyone can add a version** with a **mandatory "what changed"
reason**, **no fork** (download, change, reupload with credit), **no likes**,
**titles not captions** (file name is the default title), **Figma-style floating
comment pins** distinct from annotation (no anchored pins-as-notes), **roles never
on a profile**, **per-group member colours**, three consistent visibility layers
(public / shared / private). Still genuinely yours:

- **WebRTC provider for calls (F14)**, LiveKit / Daily / 100ms / self-hosted.
  A real build-vs-buy and cost decision.
- **Transcode scope (F11)**, audio only for v1 (clean, cheap), or video from
  the start (heavier: codecs, storage of derived files or transcode-on-every-
  request). Recommend audio first.
- **Member-colour palette (F12a)**, how many colours, and what happens past that
  many members in one group (reuse, or extend the palette).
- **Notifications channel**, in-app bell for v1; email/push shares the CSAM-alert
  pipe from `ROADMAP.md`. When is yours.
- **Still yours from `ROADMAP.md`, now load-bearing:** register the DMCA agent
  (private layers lower volume but safe harbour still needs the filing), and the
  Supabase region (`eu-north-1`) if the collaborator audience isn't in Europe , 
  persistent chat and live calls make latency more noticeable than a feed did.

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
