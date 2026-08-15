# eski — the collaboration layer (draft spec)

**Status: draft for review.** This is the "Discord-for-creatives" direction
worked into a concrete plan — a feature list with a build plan and a reason
for each, then every screen and button written out so the flows can be walked
before anything is built. Nothing here is live yet. Flag anything that doesn't
make sense; the calls I made are marked, and the genuinely-yours decisions are
collected at the bottom under **Owner's calls**.

It is grounded in what eski already is (`ARCHITECTURE.md`, `schema-clean.sql`,
`docs/design/STYLE.md`) and in how the reference apps actually work — Discord,
Slack, Frame.io, Figma, SoundCloud/BandLab, and the one cautionary tale,
Abstract. Sources are listed at the end.

---

## 0. The one decision everything hangs on

Today eski is **public-by-default, single-owner posting.** A `work` has an
`owner_id`; RLS says *"visible if `status='published'` (everyone) or you own
it."* There is no notion of "a group of people who can see this and no one
else."

The collaboration layer needs the opposite default in one specific place:
**group content is private-by-default, visible only to members.** That is the
whole copyright strategy ("private substance, public signal") and the whole
"studio not gallery" pitch. So the foundational change is:

> **A work or collection gets a nullable `group_id`.**
> `group_id IS NULL` → the public personal post it is today (public profile,
> Discover feed, indexable).
> `group_id` set → private to that group's members. Never indexed, never in
> Discover, never shown to a stranger.

Everything else — channels, roles, review pins, presence — is built on top of
that single column and one new visibility rule. **Get this rule right first;
it is the schema decision that is expensive to change later.** (§2 has the
exact policy.)

### What we steal, and the one thing we must NOT

| From | Steal | Because |
|---|---|---|
| Discord | server rail, roles as permission bundles, invite links, opt-in public directory, "lurker" preview before joining, three join modes | this is exactly the public-signal→private-substance funnel the writeup wants |
| Slack | topic-in-channel / reply-in-thread, public-by-default *inside* a group for searchability, curated starter channels for onboarding | keeps a group legible instead of one infinite scroll |
| Frame.io | frame-accurate comments, automatic version stacking, "comments follow the work across versions", approval state | this is the moat — the contextual-feedback half |
| Figma | click-to-pin **or** drag-to-select-a-region, comments listed in a side rail *and* pinned on the canvas, @mention, resolve-keeps-archived | the artboard interaction, already half-built in `artboard.html` |
| SoundCloud/BandLab | timed comments on the waveform, **range** comments across a segment | the audio half of the artboard; eski's player already draws the waveform |
| Supabase Realtime | Presence for "who's online / what are they working on", Broadcast for typing | the writeup's "lightweight who's online" — no table needed |

**Do NOT steal Abstract's model.** Abstract brought git-style
*branch → change → request review → merge* to designers and Adobe shut it down
in 2023; the documented lesson is that **forcing a developer's branch/merge/PR
workflow onto artists does not work.** eski's version control must stay what
the writeup already describes — *one post, an ordered stack of versions, click
v3 and see what changed* — a **linear lineage, not a branch graph.** The schema
already has this shape (`works.version_of`, `works.version_label`); resist
every temptation to add branching, merge conflicts, or a PR step. That
restraint is a feature.

---

## 1. Feature list

Each feature is: **why it's here → the simplest idiotproof plan → what it
touches.** Ordered by the writeup's own build order, with the supporting
pieces slotted where they're needed. Tier = suggested build order.

### Tier 1 — the spine (nothing else works without these)

#### F1. Groups + membership
**Why.** A group is the container the whole layer lives in — the "studio" you
get invited to. Without it there is no private layer and no place to scope a
feed, a project, or a review.
**Plan.** Two tables: `groups` (slug, name, genre, `type` ∈ open/approval/
invite, `accepting`, `listed`, `cover_key`, `owner_id`) and `group_members`
(group_id, user_id, `role` ∈ owner/mod/member/viewer, `status` ∈ active/
pending). Membership is the single fact every other policy reads; keep it one
row per (group, user).
**Touches.** New tables; a `member_of(gid)` SQL helper used by every group RLS
policy; the left rail and Create-group flow (§3).

#### F2. Roles (owner / mod / member / viewer)
**Why.** "Not everyone sees everything — mentors, clients, collaborators." A
client should review without posting; a viewer should look without touching.
**Plan.** A **fixed four-role enum on `group_members.role`**, not Discord's
custom-role builder — four roles cover owner-runs-it, mod-moderates,
member-posts, viewer-reads, and a fixed set is the idiotproof version. Every
capability is a plain check against that column (`role in ('owner','mod')` to
moderate, `role <> 'viewer'` to post). Custom roles are a later, real feature,
noted under Owner's calls.
**Touches.** `group_members.role`; the Members screen; every group write policy.

#### F3. Group-scoped feed
**Why.** "Works posted to and filtered by group membership." This is where
coordination happens in flow — the Slack/Discord channel, but eski-flavoured.
**Plan.** Add nullable `group_id` to `works`/`collections` (see §0) and one new
table `messages` (group_id, user_id, body, `parent_id` for one level of reply,
created_at) for the chat that isn't a posted work. The Feed screen interleaves
messages and group works newest-last; a shared work renders as its normal card
inline. **Reuse the existing comment/like/tag machinery** — a group work is
still a `work`, just with a `group_id`.
**Touches.** `works.group_id`, `collections.group_id`, new `messages` table;
the Feed screen; the visibility rule in §2.

#### F4. The visibility rule + copyright posture
**Why.** This is the copyright strategy in one policy: group content is
invisible to crawlers and strangers, so DMCA volume drops because nothing is
publicly broadcast. It is also what makes "private substance" true rather than
aspirational.
**Plan.** One rewritten `works_read` policy: *visible if
`(group_id is null and status='published')` — the public post it is today — OR
`owner_id = uid` OR `member_of(group_id)`.* Same shape for collections,
comments, tags, likes, messages. Group pages send `noindex`; `sitemap`/OG tags
are emitted only for `group_id is null` works.
**Touches.** Every read policy; `<meta name=robots noindex>` on group routes;
`api/sign.mjs` is unaffected (keys are already opaque).

### Tier 2 — the moat (why someone picks eski over Discord)

#### F5. Review mode / the artboard, as a product feature
**Why.** "Pin a comment at 1:24 on a waveform, on a video frame, or a pixel
region." Discord will never build this for VFX or music people — it's not
their market. This is the single most defensible feature.
**Plan.** The interaction is **already built** in `artboard.html` (pannable
canvas, click-to-place pin, drag-select). Make it a product feature by adding
one column: **`comments.anchor jsonb`** — `null` is a normal comment,
`{"t_ms":84000}` is a timed comment on audio/video, `{"frame":n}` on video,
`{"x":..,"y":..,"w":..,"h":..}` a region on an image. "Review" is then just the
detail overlay drawing existing comments as pins on the media, and clicking a
pin scrolls to its comment. **No new comments table, no new likes, no new
anything** — a review pin is a comment with an anchor.
**Touches.** `comments.anchor`; a Review tab/overlay reusing the player
(audio/video timecode) and the artboard's pin canvas (image regions).

#### F6. Version control (lineage, not branches)
**Why.** "No more beat_v1, beat_FINAL, beat_FINAL_FINAL. One post, multiple
versions, full lineage. Click v3, see what changed." Already the schema's
shape; the writeup just wants it surfaced and, crucially, **feedback to
follow the work across versions** (the Frame.io behaviour).
**Plan.** `works.version_of`/`version_label` already exist and
`works_version_owner_guard()` already restricts adding a version to the
original poster. Two additions: (a) a **version switcher** in the detail
overlay (the mockup's `.verwrap`/`.verdrop` already exists) that swaps the
media and shows `version_label`; (b) comments/pins are keyed to a version so
"the drop needs low end" stays attached to v2 while v3 gets a clean slate — do
this by letting `comments.anchor` optionally carry the version's work id, or
simply by each version being its own `works` row (it already is) so its
comments are naturally its own. **Keep it linear** — no branch/merge (§0).
**Touches.** detail-overlay version switcher; a small "what changed" note
field (`version_label` already carries it).

#### F7. Group collections / projects
**Why.** "Structured folders, not just chat" — a producer's stems, a lesson's
materials, an animation's shots, kept out of the chronological feed so the
best work isn't 10,000 messages up.
**Plan.** `collections` already exist and already curate arbitrary published
works. Give them the same nullable `group_id` and they become group projects
for free. The Projects tab lists the group's collections; opening one is the
existing collection carousel. (Fix the known carousel gap — Tier 2 #12 in
`ROADMAP.md` — while here, since a project of audio stems is the exact case
that breaks today.)
**Touches.** `collections.group_id`; the Projects tab; the carousel cover/
player fix already on the roadmap.

#### F8. Asset library (searchable file view)
**Why.** "Show me all .wav files tagged drums from this month." Discord search
genuinely can't do this; it's a real capability gap, not a nicety.
**Plan.** No new storage — every group file is already a `work`/`work_item`
with `kind`, `bytes`, `content_tags`, `owner`, `created_at`. The Assets tab is
**one filtered query over the group's works** with facet chips: kind, uploader,
tag, date. It's the Discover feed's existing filter code pointed at
`group_id = this group` instead of `is null`.
**Touches.** the Assets tab (reuses `index.html`'s filter machinery); no schema.

### Tier 3 — the funnel (how people find and join)

#### F9. Invite links
**Why.** "Frictionless onboarding" — the studio-door key. The industry funnel
is *meet at a show (public), get invited to the studio (link).*
**Plan.** `group_invites` (short `code`, group_id, created_by, `expires_at`,
`max_uses`, `uses`). Visiting `/join/<code>` shows the group preview + a Join
button; accepting inserts a `group_members` row (active for open/invite groups,
pending for approval groups). Mirror Discord: a link can expire or cap uses.
**Touches.** new `group_invites` table; `/join/<code>` route; the group
Settings → Invites panel.

#### F10. Public group directory
**Why.** "Public group listing: name, genre, member count, accepting toggle,
description." The public-signal layer — how a stranger discovers a studio
without a login.
**Plan.** A `/groups` page listing groups where `listed = true`, with
genre/accepting filters — the exact card grid the profile already uses. Only
public metadata is exposed (name, genre, member count, description, cover);
never the private content. Invite-only groups set `listed=false` and are
absent unless you hold the link (Discord's model exactly).
**Touches.** `/groups` route; `groups.listed`; a public count query.

#### F11. Public artist profile (the signal layer)
**Why.** "name, genre, role, open-to-collab, 30-second demo reel" — the public
face you meet before the studio. eski already has public profiles; this adds
the collaboration-facing fields.
**Plan.** Add to `profiles`: `genre`, `roles text[]` (producer/DJ/VFX/
animator/writer/rapper…), `open_to_collab bool`, `reel_key` (a ≤30s clip).
Surface them on the existing public `profile.html` header. No new page — extend
the one that exists.
**Touches.** `profiles` columns; the profile header + Settings form.

#### F12. @mentions + notifications
**Why.** "Pulls people back in." A pin is useless if the person who needs to
see it never learns it exists.
**Plan.** A `notifications` table (user_id, `kind`, target, `read_at`). A
mention is parsed from a message/comment body (`@handle`), a row is inserted
for the mentioned member, and a bell in the header shows unread. Start with
**in-app only** (a bell + list); email/push is a later, separate call (and the
CSAM-report notification gap in `ROADMAP.md` is the same missing pipe — build
one path, use it for both).
**Touches.** new `notifications` table; a header bell; mention-parse on insert.

#### F13. Presence ("who's online / what they're working on")
**Why.** "Who's online, what are they working on." The ambient sense that the
studio is occupied — the thing that makes it feel live.
**Plan.** **No table.** Supabase Realtime **Presence** on a per-group channel:
each client `.track()`s `{handle, working_on}` on join; the Members rail reads
the merged presence set for online dots. Presence is exactly built for
"slow-changing state like online/offline and active document" — don't reach
for Broadcast unless typing indicators come later.
**Touches.** a Realtime channel per open group; online dots on the Members
rail; nothing in the DB.

### Tier 4 — ownership & safety (the promises the writeup makes)

#### F14. Storage quota (soft caps)
**Why.** "Soft caps using existing bytes tracking" — keeps costs bounded
without hard-stopping someone mid-session.
**Plan.** `works.bytes` is already populated at upload and already summed on
the profile. Sum it per group (or per owner) and **warn at a threshold** rather
than block; the hard ceiling is already enforced on the signer
(`claim_upload_quota`, 2000 objects/day). A soft cap is a read + a banner.
**Touches.** a per-group bytes sum; a banner in the upload flow; no new
enforcement (the hard limit already exists on `api/sign.mjs`).

#### F15. Takedown / counter-notice / preserve-on-takedown
**Why.** The writeup's copyright promises are concrete product behaviour:
human review before removal, one-click pre-filled counter-notice, and
**never vaporize years of work** — content is preserved in the user's private
archive with a notice, not deleted.
**Plan.** `reports` already has a `copyright` category and `admin.html` is
already the review queue. Add a work `status` value `withheld` (visible only to
its owner, with a notice banner) so a takedown *hides* rather than *deletes* —
reusing the existing one-way status machinery. The counter-notice is a
pre-filled form that files a `report`-shaped record the owner reviews.
**Touches.** a `withheld` status; a notice banner; a counter-notice form
writing to `reports`/a sibling table.

#### F16. Export / "yours, not mine"
**Why.** "Artists hate platform lock-in." Content-addressed storage already
means the files are portable; exposing that as a one-click export is the
trust-builder.
**Plan.** Because keys are content-addressed (`hash-worker.js` SHA-256), an
export is a manifest: for a group (owner/mod only) or your own account, generate
a JSON of works + metadata + signed file URLs and zip client-side. **Read-only,
no new storage** — it's a query plus a zip.
**Touches.** an Export button (group Settings, profile Settings); a manifest
query; client-side zip.

### Deliberately NOT in v1 (say no on purpose)

- **Custom roles / per-channel permission overwrites** (Discord's full matrix).
  Four fixed roles first; the permission calculus is a rabbit hole.
- **Branch/merge version control.** The Abstract lesson (§0). Linear lineage only.
- **Voice/video huddles.** Slack's huddle is a whole media stack; text + async
  review is the product. Revisit only if asked.
- **DMs.** `ROADMAP.md` already parks direct messages; a group of two is the
  substitute for v1.
- **Arbitrary user-created channels inside a group.** v1 gives every group the
  same four fixed views (Feed/Projects/Review/Assets). Multiple text channels
  is a real later feature (§ Owner's calls), not a v1 default.

---

## 2. Data model changes (sketch, not final DDL)

Grounded in `schema-clean.sql`. New tables and the one rewritten policy;
column adds are `add column if not exists` in the project's idempotent style.

```
groups         (id, slug uniq, name, description, genre, cover_key,
                type check in (open,approval,invite),
                accepting bool default true, listed bool default false,
                owner_id → auth.users, created_at)
group_members  (group_id, user_id, role check in (owner,mod,member,viewer),
                status check in (active,pending), joined_at,
                primary key (group_id, user_id))
group_invites  (code text pk, group_id, created_by, expires_at,
                max_uses int, uses int default 0)
messages       (id, group_id, user_id, body, parent_id → messages,
                created_at)          -- one level of reply, like comments
notifications  (id, user_id, kind, target_type, target_id, read_at, created_at)

works.group_id        uuid null → groups           -- §0
collections.group_id  uuid null → groups
comments.anchor       jsonb null                   -- §F5 review pins
works.status          + 'withheld'                 -- §F15 preserve-on-takedown
profiles.genre / roles text[] / open_to_collab bool / reel_key   -- §F11
```

The one helper every group policy leans on:

```sql
create function member_of(gid uuid) returns boolean language sql stable
  security definer set search_path = public as $$
    select exists (select 1 from group_members m
      where m.group_id = gid and m.user_id = (select auth.uid())
        and m.status = 'active') $$;
```

The one rewritten visibility rule (works; collections/comments/tags/likes/
messages mirror it):

```sql
create policy works_read on works for select using (
  (group_id is null and status = 'published')   -- the public post it is today
  or owner_id = (select auth.uid())             -- your own drafts/private
  or (group_id is not null and member_of(group_id))  -- the private layer
);
```

**Follow the project's own rule: the policy is the fence, the UI is the
signpost.** Every "viewers can't post" / "invite-only is hidden" behaviour is a
policy first (`ARCHITECTURE.md`: *"The policies are the rule, not the UI"*).

---

## 3. Screen-by-screen layout

Purely functional — what each screen contains and what each control does. No
visual/design language here (that lives in `docs/design/STYLE.md`); this is the
inventory you walk a flow against. Access notes in parentheses name the role
that can see/use a control.

### 3.0 The shell (signed in)

Four regions, left to right:

- **Group rail** — vertical list of your groups (one avatar each), plus:
  - Home (→ the public Discover feed + your profile)
  - one entry per group you're in (selects it)
  - unread indicator per group
  - `+` (→ Create / Join group)
- **Group nav** — for the selected group:
  - group name + group menu (Invite people / Group settings / Leave group)
  - view tabs: Feed · Projects · Review · Assets · Members
- **Main pane** — the selected view (§3.2–3.5)
- **Members rail** — members grouped by role (Owner / Mods / Members / Viewers),
  online indicator + optional "working on" per member; click → member profile;
  collapse toggle
- **Top strip** (spans main + members) — notifications bell (unread count) ·
  Share (→ upload, scoped to this group) · your avatar menu (Profile / Settings
  / Sign out)

Signed out, only the public layer renders (no group rail) — see §3.6.

### 3.1 Home (existing Discover feed)
The current `index.html`: public feed of ungrouped published works, tag/
modifier filters, detail overlay, upload. Adds only the group rail on the left;
otherwise unchanged.

### 3.2 Group → Feed
The group's chat, with shared works inline.
- **Message stream** — messages newest-last; each: avatar, name, timestamp,
  body; a shared work renders as its feed card inline
  - per message: Reply (opens one-level thread) · Copy link · More (→ Delete,
    for author/mod)
- **Composer** — text field; `@` → member autocomplete; attach / drag-and-drop
  (→ runs upload, posts the resulting work card); Send
- **Empty state** — prompt + Share a file
- **Viewer role** — composer hidden, replaced by a read-only note (posting is
  refused by policy regardless)

### 3.3 Group → Projects
Structured folders (collections scoped to this group).
- **Grid** — project cards: cover, title, item count, owner
- **New project** (member+) — create-collection form (title, description,
  cover), `group_id` pre-set
- **Open a project** — collection carousel (with the Tier-2 carousel fix so
  audio gets a player and video a frame)
- **Fork** (member+, on a project you don't own) — copies its item list into a
  new collection you own, same group *(owner's call: v1 or fast-follow)*

### 3.4 Group → Review (the artboard)
Anchored feedback on one work. Entered from a work's detail overlay (Review) or
from this tab's list.
- **Work list** (tab landing) — group works with open reviews: thumb, title,
  unresolved-pin count
- **Review canvas** — the media with pins on it:
  - audio/video: player + waveform; pins at a timecode; a pin can be a range
    (segment); video pins can carry a frame
  - image: pannable canvas; pin is a point or a drag-selected region
  - mode controls: Select (navigate) · Comment (place a pin)
- **Pin ↔ comment** — clicking a pin highlights its comment; clicking a comment
  seeks/scrolls to its pin
- **Comment rail** — review comments in media order; each: author, anchor chip
  (timecode / frame / region), body, replies, Resolve (mod/owner/poster —
  resolved pins stay, dimmed)
- **Version bar** — version switcher (v1 · v2 · v3 …, with label); switching
  swaps media and its pin set; Add version (poster only → upload with
  `version_of` pre-set)
- **Mark approved** (mod/owner) — stamps the current version *(owner's call:
  keep or cut for v1)*

### 3.5 Group → Assets
Searchable file library over the group's works.
- **Filter bar** — facet chips: Kind (audio/video/image/text/other) · Uploader ·
  Tag · Date (week/month/all); combinable
- **Results** — grid/list toggle; each: thumb, title, kind, uploader, size,
  date; click → detail overlay
- **Empty state** — message + Clear

### 3.6 Public layer (signed out — no group rail)

**`/groups` — directory**
- Header: title · genre filter chips · Accepting-members toggle
- Card grid: per listed group — cover, name, genre, member count, one-line
  description, Accepting/Full indicator; click → public group page
- Invite-only groups never appear

**`/g/<slug>` — public group page (preview)**
- Header: cover, name, genre, member count, description
- Join control, keyed to group type:
  - open → Join (instant)
  - approval → Apply to join (short application field → pending member)
  - invite-only → page unreachable without a link (see §3.7)
- Preview strip: a few owner-chosen public sample works (never the private feed)
- Signed out, Join/Apply routes through sign-in first, then completes

**`/u/<handle>` — public artist profile (extends existing)**
- Header adds: genre · role chips (producer/DJ/VFX/animator/writer/rapper…) ·
  Open-to-collab badge · 30-second demo reel player
- Tabs unchanged (Posts public; Saved/Settings owner-only); Settings gains the
  new fields
- Message / Invite-to-group control *(owner's call — needs a destination;
  parked with DMs)*

### 3.7 Join, create, and manage

**`/join/<code>` — invite link landing**
- Group preview (name, genre, member count, cover) + Join group
- On accept: member row added (active for open/invite, pending for approval) →
  drops into Feed
- Expired/used-up link: notice + link to the directory

**Create group** (from the rail's `+`)
- Step 1 — Basics: name, genre, description
- Step 2 — Access: Open / Approval / Invite-only; List-in-directory toggle
  (off + disabled for invite-only)
- Step 3 — Cover (optional); Create group → you're owner, dropped into the new
  Feed with an invite nudge

**Group settings** (group menu → Group settings; owner/mod)
- General: name, genre, description, cover; Delete group (owner only, confirms)
- Access: type · directory-listing · accepting-members toggles
- Invites: existing links (code, uses, expiry) · New invite link (expiry /
  max-uses) · Revoke per link
- Members / requests: member list with per-member role dropdown (owner/mod/
  member/viewer) · Remove; approval groups also show pending requests with
  Approve / Decline
- Export: Export group → manifest + zip (owner/mod)
- Storage: used/quota bar (summed `bytes`) + soft-cap warning

**Notifications** (bell)
- List: mentions, approvals, new versions, join requests (mods); each row links
  to its target; Mark all read

### 3.8 Moderation & safety
- Report: existing on works/comments/profiles; add on groups and messages (all
  via `file_report()`)
- `admin.html` (owner console): adds a Withhold action for copyright takedowns
  (hide, not delete) and a groups row in the overview
- Counter-notice: a withheld work's banner shows File a counter-notice →
  pre-filled form recorded for the owner's review; the work stays in the
  uploader's private archive throughout

---

## 4. Flows to walk before building

Trace these against §3; if a step has no screen or button, that's a gap to fix.

1. **Meet at a show → studio.** Stranger hits `/groups` (F10) → opens `/g/beats`
   → sees preview, clicks APPLY TO JOIN → sign-in/onboarding → pending → mod
   approves in Group settings → member lands in Feed. *(Exercises F1, F2, F9,
   F10, F11.)*
2. **Drop a WIP, get frame-accurate feedback.** Member drags `beat_v2.wav` into
   Feed → posts as a card → opens it → REVIEW → drags a range 1:20–1:32, types
   "needs low end" → @mentions the mixer → mixer gets a bell, opens the pin,
   replies → poster uploads v3 with ADD VERSION → v2's pins stay on v2, v3 is
   clean. *(F3, F5, F6, F12.)*
3. **Mentor teaches.** Mentor makes a Project of stems (F7) → student FORKs it →
   student posts their attempt → mentor reviews via pins → the whole lesson is
   preserved for the next student. *(F7, F5.)*
4. **Takedown, preserved.** A `copyright` report lands → owner reviews in
   admin.html → sets the work `withheld` (hidden, not deleted) → uploader sees
   the banner + FILE A COUNTER-NOTICE → owner reviews the counter-notice. Work
   never leaves the uploader's archive. *(F15.)*
5. **Leave with your work.** Group owner clicks EXPORT GROUP → gets a zip of
   files + metadata. No lock-in. *(F16.)*

---

## 5. Owner's calls (decisions I did not make for you)

- **Fixed four views vs user-created channels.** v1 ships four fixed views per
  group (Feed/Projects/Review/Assets). Multiple named text channels inside a
  group (Discord/Slack) is a real later feature — say when it's worth the
  channel table + per-channel read scoping.
- **Fixed four roles vs custom roles.** Same shape — four roles now, Discord's
  custom-role builder is a rabbit hole to open deliberately, not by default.
- **Is real-time chat persisted or ephemeral?** `messages` above persists chat
  in Postgres (searchable, exportable — the eski-native choice). If you'd rather
  chat be ephemeral/Broadcast-only, that's cheaper but breaks Assets/Export
  covering conversation. Recommend: persist.
- **Approval state in Review (F5's MARK APPROVED)** — keep the lightweight
  approve toggle for v1, or cut until asked?
- **Fork (F7)** — v1 or fast-follow?
- **Notifications channel.** In-app bell for v1; email/push is the same missing
  pipe as the CSAM-report alert in `ROADMAP.md`. Build one notifier, use it for
  both — but *when* is yours.
- **DMs / "message this artist".** Parked with the roadmap's DM deferral; a
  group of two substitutes. Confirm that's acceptable for v1.
- **Still yours from `ROADMAP.md`, now load-bearing:** register the DMCA agent
  (the private layer lowers volume but safe harbour still needs the filing),
  and the Supabase region (`eu-north-1`) if the collaborator audience isn't in
  Europe — real-time chat makes the 1.7–3.4s round-trips more noticeable than a
  feed did.

---

## Sources

Reference-app behaviour above is from:

- Discord — [permissions & roles](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ),
  [developer permissions docs](https://docs.discord.com/developers/topics/permissions),
  [member applications](https://support.discord.com/hc/en-us/articles/29729107418519-Server-Member-Applications)
- Slack — [channel organization best practices](https://www.socialintents.com/blog/slack-channel-organization-best-practices/),
  [what Slack is: channels, huddles, canvas](https://rottenwifi.com/what-is-slack-and-how-does-it-work-a-practical-guide-for-beginners/)
- Frame.io — [commenting on media](https://help.frame.io/en/articles/9105251-commenting-on-your-media),
  [Version 4 overview](https://frame.io/v4)
- Figma — [add comments to files](https://help.frame.io/en/articles/360041068574-Add-comments-to-files),
  [guide to comments](https://help.figma.com/hc/en-us/articles/360039825314-Guide-to-comments-in-Figma)
- SoundCloud/BandLab timed comments — [music collaboration tools overview](https://pibox.com/resources/best-music-collaboration-software/),
  [BandLab collaboration features](https://www.audeobox.com/learn/bandlab/bandlab-collaboration-features/)
- The Abstract cautionary tale — [version control for creative teams](https://www.anchorpoint.app/blog/version-control-for-the-creative-industry)
- Supabase Realtime — [Presence](https://supabase.com/docs/guides/realtime/presence),
  [Realtime guide](https://supabase.com/docs/guides/realtime)
</content>
</invoke>
