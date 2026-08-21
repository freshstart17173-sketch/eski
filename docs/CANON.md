# eski collab — the canonical model

**Status: planning. Source of truth for the code-generation hand-off.** Where
[`COLLAB.md`](COLLAB.md) is the narrative spec and the mockup is the picture,
this file is the *contract*: one vocabulary, one permission model, and one
registry of every functional UI element (behaviour → database → responsive
layout). When a codegen prompt and this file disagree, this file wins. The
build itself is sliced into individually-testable prompts in
[`CODEGEN.md`](CODEGEN.md). Open cross-context state hazards (data that
carries/strands/orphans when a work moves between the social, work, and
messaging contexts) are audited in [`EDGECASES.md`](EDGECASES.md); its
⚑DECIDE rows graduate into this file once chosen.

Three parts:
- **§A Terminology** — the canonical word for every concept, its database
  backing, and the aliases we kill so two prompts never name one thing twice.
- **§B Roles & permissions** — who can do what, mapped to the RLS policy or RPC
  that actually enforces it (the fence, not the signpost).
- **§C UI element registry** — every functional element per screen: what it
  does, where it sits in the database, its states, and desktop vs mobile.

Backend scope is a **true clean slate** (no `schema-clean.sql` inheritance);
v1 decisions of record: **calls deferred to v2**, **audio-only transcode**,
**extended member-colour palette**, **in-app notifications only**.

> **Terminology decisions locked (2026-08-17):** **(1)** a `work` is a **post**
> in public contexts and a **file** in server/personal — the split is kept;
> **(2)** one relationship only — **friend** (mutual); one-way `follows` is
> dropped; **(3)** one user-facing label set everywhere — **Public / Server /
> Private**. These are final and baked in below.

---

## §A. Terminology

### A.1 The rule

Every concept has **exactly one canonical noun**, and it is the same noun in
the UI copy, the code, and these docs — *except* where a deliberate
context-split is called out below (a `work` is a "post" in public, a "file" in
a server; that is intentional, not drift). If you're about to name something,
find it here first. Adding a second name for an existing thing is the exact
failure mode `CLAUDE.md` warns about, applied to words instead of CSS.

### A.2 Containers & spaces

| Canonical | Means | DB | Kill these aliases |
|---|---|---|---|
| **Server** | The studio/team you create, join, and invite into. The container all Work-layer content lives in. Named "server" (Discord's word) because it's the mental model people already have. | `servers` | studio, group, guild, team, workspace *(as an entity)* |
| **Workspace** | The three-pane **screen** you land in when you open a server. **Only ever a screen name — never a data entity.** | *(screen, not a table)* | "the workspace" meaning a server |
| **Server rail** | Far-left 58px strip: Home, Messages, one badge per server, ＋, your avatar. | — (`--rail`) | group rail, sidebar |
| **Channel column** | 232px column listing a server's Files, Channels, Voice. | — (`--chan`) | channel list, sidebar |
| **Members rail** | 210px right strip: Admins / Members, presence, "working on". | — (`--mem`) | members list, members panel |
| **Details pane** | The slide-in that opens from any card. | — | details panel, info panel, inspector |

### A.3 Channels & their kinds

A **channel** is a room inside a server. Its `kind` is what it holds. Every
kind lives in the same channel column so the whole server is one navigable rail.

| Canonical | `channels.kind` | Means |
|---|---|---|
| **Text channel** | `text` | Persistent, searchable chat. `#beats`, `#renders`. |
| **Voice channel** | `voice` | **Reserved in the enum; not built in v1** (calls deferred). Kill "voice room". |
| **Files** | *(not a channel row)* | The server's **File explorer** — one fixed entry in the column (renamed from "Media", 2026-08-19), not a `channels` row. Kill "media channel". |

Kill: "room" as an entity noun (a voice channel is a voice channel), "feed" for
a channel (the Feed is the friends-only portfolio, §A.7).

### A.4 The uploaded thing — `work`

The single most-renamed concept in the spec. One entity, one **intentional**
context-split:

| Canonical | Context | DB |
|---|---|---|
| **work** | The data entity. Use in schema, RLS, RPCs, these docs. | `works` (+ `work_items` for a multi-item work) |
| **post** | A `work` seen in a **public** context — the Feed, a public profile shelf. Has a title, appears to friends. | same row, `visibility='public'` |
| **file** | A `work` seen in a **server/personal** context — a channel, the File explorer. Leads with its **file name**. | same row, `visibility in (server,personal)` |

> **LOCKED:** the post/file split is kept (F9). Kimi prompts say **post** on the
> Feed and public Profile shelves, **file** in every server/personal context (a
> channel, the File explorer, the Upload sheet in server mode).

Sub-terms (not renamed, pinned for clarity):

| Canonical | Means | DB |
|---|---|---|
| **collaborators** | The people credited on a work — each a **chip** (a real `@handle` + an optional freeform role like "prod"/"mix"), in that member's server colour. Reads for artists *and* social ("with @rae"). **Consent-gated** (below). Renamed from **credits** (2026-08-19). | `work_collaborators(work_id, user_id, role, status)` |
| **collaborator chip** | One collaborator rendered as a chip (server colour in a server context). A **pending** chip (unconfirmed stranger) reads muted. Renamed from **contributor chip**. | derived |
| **tag** | A user-added label. First 5 show inline, "+N" for the rest. | `content_tags` |
| **file type** | The extension/kind, for the icon and Type filter. **Never rendered as a tag** (F10). | `works.file_ext`, `works.kind` |
| **folder** | A **nested** container in a server's file tree — has a parent (null = server root) and holds subfolders + files. The unit of the File-explorer tree (§C.6). A server file lives in exactly one folder *per server* (default = root). Renamed from **collection** (2026-08-18d) and given nesting (2026-08-19). | `folders(server_id, parent_id, name)` · a file's location = `placement.folder_id` |

Kill: "asset", "media item", "attachment", "collection" (→ folder), "carousel",
"credits"/"contributor" (→ collaborators). **Personal `save_folders` are a
different thing** (private bookmark folders) and keep their name.

> **Cut for beta (2026-08-18e):** **numbered versions are removed** — the
> `version`/`version_of`/`version_note` concept was confusing and is gone. A new
> take is just a new upload. **Canvas** (the old §A.5 review surface) and **Kanban
> boards** (old §A.6) are also cut from the beta; their §A vocab, §C screens, §E
> mechanics and prompts are removed. Section numbers §A.5/§A.6 are retired (left as
> a gap) rather than renumbered, to keep cross-references stable.

### A.7 People & relationships

| Canonical | Means | DB |
|---|---|---|
| **profile** | A person's account: name, handle, bio, shelves, status. | `profiles` |
| **handle** | The unique `@username`. The only way to find someone (no directory). | `profiles.handle` |
| **member** | A profile inside a specific server. Carries a server colour and a role. | `server_members` |
| **friend** | The **only** relationship. Mutual (pending → accepted), added by exact handle. Being friends does two things: enables **DMs** and surfaces their **public posts in your Feed**. | `friendships` |
| **DM** | A direct conversation (1:1 or group DM). | `dm_channels` / `dm_members` / `dm_messages` |
| **message** | A unit of chat, in a channel **or** a DM. | `messages` / `dm_messages` |

> **LOCKED:** one relationship — **friend** (mutual). The one-way `follows`
> table is **dropped** (backend implication: COLLAB.md §7 still lists `follows`
> as reused — it's cut; the Feed query scopes to `friendships` where
> `status='accepted'`, not `follows`). No asymmetric "follow a portfolio"
> path in v1.

Kill: "follow"/"following" (there is no follow), "connection", "contact",
"subscriber". Button copy is **"add friend"** everywhere.

### A.8 Actions & small objects

| Canonical | Means | DB / component |
|---|---|---|
| **invite link** | The URL you send to join a server: `/join/<code>`. | `server_invites.code` (the **invite code** is the token) |
| **pin** | A message pinned in a channel. | `message_pins` |
| **save** | "Save to my files" — **keep a copy in your own personal storage**, filed in a personal folder. A new work **you** own referencing the same **dedup blob** (near-zero extra bytes if you already have it), so it's yours even if the server later deletes theirs — the Drive half of the app. Draws *your* quota. **Distinct from pin** (a message) and from a bookmark. | `saved_items` (owner copy) / `save_folders` |
| **reaction** | An emoji on a message. | `message_reactions` |
| **mention** | `@handle` in a message/comment → a notification. | `mentions` / parsed on insert |
| **notification** | A row in the bell. | `notifications` |
| **presence** | Ambient online + "working on" state. **No table** — Realtime Presence. | Realtime |

Kill: "magic link" (→ invite link; reserve "magic link" for auth email only),
"bookmark" (→ save), "react/like" (Like is retired entirely — never resurrect
the word), "notif".

### A.9 Visibility — the enum vs the label

Data enum on `works.visibility`: **`public` | `personal` | `server`**. The spec
currently shows *three different label sets* for this one enum — that is the
sharpest drift in the doc:

| `visibility` | Profile shelf (mockup) | Upload choice (mockup) | Canonical UI label (LOCKED) |
|---|---|---|---|
| `public` | "Public" | "Everyone" | **Public** |
| `server` | "Shared" | "This server" | **Server** |
| `personal` | "Private" | "No one" | **Private** |

> **LOCKED:** **Public / Server / Private**, identical on the upload sheet, the
> profile shelves, and every visibility marker. "Shared", "Everyone", "This
> server", "No one" are killed. One word per value, no context-dependent synonyms.
> The data enum is `public｜personal｜server`; only the label is fixed. (The old
> canvas-only **Link** value is removed with the canvas feature.)

### A.10 Member colours (the one hue in the UI)

The chrome is black/white/grey; the **only** colour is a member's per-server
identity hue (F12a), and it renders **only inside that server** — on chat
bylines, the Members rail, and collaborator chips. Never on a public profile or
the Feed.

**Scale (LOCKED approach — "add a lot"):** servers can hold many people, so the
palette is **large, not the original six**. Store `server_members.color` as a
`smallint` index into a fixed palette of **~30 hues** (name it `--m1 … --m30`),
generated as evenly-spaced HSL steps with a light/dark pair each, tuned for
legibility on both grounds. `join_via_invite` assigns the **next free index**;
past the palette size it **cycles** (least-recently-assigned reused). Identity
colour is a legibility aid, **not a uniqueness guarantee** at large scale — a
30-plus-person server will see a repeat, and that's acceptable (Discord itself
colours by *role*, not identity; we colour by identity and simply widen the
pool). The exact 30 hex pairs are a design deliverable — proposed in
`gallery.html` for sign-off, then written into `styleguide.html` tokens.

Kill: "role colour" (colour is identity, not role), fixed six-colour
assumptions anywhere in copy or schema.

---

## §B. Roles & permissions

### B.1 The two-axis model

Permission is **role × visibility**, never role alone. A member of server A has
zero rights in server B. The RLS policy is the fence; the UI only hides what the
policy already forbids (`ARCHITECTURE.md`).

**Actors** (most→least privileged, per server unless noted):

| Actor | Who | Source |
|---|---|---|
| **Owner** | The one profile that created the server. | `servers.owner_id` |
| **Admin** | Runs the server. | `server_members.role='admin'` |
| **Member** | Works in the server. | `server_members.role='member'` |
| **Timed-out member** | A member temporarily muted. | `server_members.timeout_until > now()` |
| **Banned / non-member** | Removed or never joined. | not in `server_members` / `server_bans` |
| **Self** | Acting on your own row, any server. | `owner_id = uid()` |

Two gate helpers every server policy calls (`security definer`,
`search_path=public`): **`member_of(gid)`** and **`is_server_admin(gid)`**.

### B.2 Capability matrix

✅ allowed · ⛔ denied · **self** = only your own rows · *(rpc)* = enforced in a
`security definer` RPC, not a raw policy.

| Capability | Owner | Admin | Member | Timed-out | Non-member | Enforced by |
|---|:--:|:--:|:--:|:--:|:--:|---|
| Read server content (works, messages) | ✅ | ✅ | ✅ | ✅ | ⛔ | `member_of(server_id)` |
| Join via invite link | — | — | — | — | ✅*(rpc)* | `join_via_invite(code)` |
| Post a message | ✅ | ✅ | ✅ | ⛔ | ⛔ | insert: member & `timeout_until` null/past |
| React / pin a message | ✅ | ✅ | ✅ | ⛔ | ⛔ | member; unpin-any = admin |
| Edit / delete **own** message | self | self | self | self | ⛔ | own row, tombstone |
| Delete **any** message (moderate) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin` |
| Upload a work to the server | ✅ | ✅ | ✅ | ⛔ | ⛔ | member; `visibility='server'` |
| Delete **own** work | self | self | self | self | ⛔ | own row |
| Withhold a work (takedown) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin`, writes `audit_log` |
| Add / rename / reorder channels | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin` |
| Manage members (role toggle, kick) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin`; owner can't be kicked |
| Ban / timeout a member | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `ban_member`/`timeout_member` *(rpc)* + `audit_log` |
| Create / revoke invite links | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin` |
| View audit log | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin` |
| Export the server | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `export_manifest('server', id)` |
| Delete the server | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | `owner_id = uid()` |
| Transfer ownership | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | *(rpc, later)* |

**Admin vs Owner:** identical except **delete server** and **transfer
ownership** (owner only), and **an admin cannot kick/ban the owner**. Everything
else an owner does, they do *as* an admin.

### B.3 The visibility read rule (the load-bearing one)

One policy, mirrored onto every server-scoped table:

```sql
-- works (and mirrored on comments, messages, folders)
create policy works_read on works for select using (
  visibility = 'public'                              -- portfolio / Feed
  or owner_id = (select auth.uid())                  -- your own + Private
  or (visibility = 'server' and member_of(server_id))  -- native server file
  or exists (                                        -- readable via ANY placement
    select 1 from placement p                        -- (crosspost / DM / forward, §D.3)
    where p.work_id = works.id and (
      (p.surface = 'server' and member_of(p.surface_id))
      or (p.surface = 'dm' and dm_member(p.surface_id))
    ))
);
```

The **placement clause is the fix for the old dead-end** (§D.3): a *personal* work
placed into a server (a crosspost) was previously owner-only — now any member who can
see the placement can read it, without changing the work's own `visibility`. A `dm`
placement grants read to the DM's members the same way.

Consequences that drive the UI (§C references these):
- **Feed** shows only `public` works by your **friends** (`friendships`
  accepted). Server and Private never leak in.
- **File explorer** shows a server's native files (`server_id`, `member_of`) **plus**
  anything placed into it (crossposts), gated the same way; folder location comes
  from `placement.folder_id`.
- **Profile shelves**: Public = anyone; Server = a viewer sees only servers you
  share; Private = self only.
- Non-public routes send `noindex`; only `public` works get OG tags.

### B.4 Relationship gates (friend-only)

One relationship (`friendships`), one verb ("add friend"). No `follows` table.

| Action | Rule | DB |
|---|---|---|
| See someone's public posts in your Feed | friendship `accepted` | `friendships.status='accepted'` |
| Open a DM with a handle | friendship `accepted` | `friendships`, `create_dm` *(rpc)* |
| Add by handle | exact `@handle` match only; no search, no suggestions | `add_friend(handle)` *(rpc)* |
| Respond to a request | accept / ignore | `respond_friend(user, accept)` *(rpc)* |
| Block | hides both directions, revokes feed + DM | `friendships.status='blocked'` |

**Public posts are still public** (anyone with the link / OG crawler sees a
`public` work). Friendship gates *the Feed surface and DMs*, not the raw
readability of a public work.

### B.5 Enforcement checklist (for the backend spec)

Every capability above resolves to one of: a `select`/`insert`/`update`/`delete`
policy on the table, or a `security definer` RPC when the check needs data the
caller can't read (invite validity, ban writes, cross-user DM creation). No
capability is UI-only. This matrix is the acceptance test for §7's RLS.

---

## §C. UI element registry

### C.1 What this is and how to read it

The master list of **every functional UI element**, screen by screen. "Functional"
= a user can act on it or it reflects live state; pure spacing/labels are out.
Each element row answers four questions:

- **Behaviour** — what it does, and its states (default / hover / active /
  loading / empty / error / disabled).
- **DB** — the exact table.column / RPC / Realtime channel it reads or writes.
  "—" means presentational only.
- **Desktop** — **the web app in a wide browser window** (this is *not* a native
  desktop build; a Tauri wrapper comes later and inherits the same web UI, so
  nothing here is Tauri-specific). Where the element sits and behaves at ≥ the
  `--chan`+`--mem` width.
- **Mobile** — **the same web app in a narrow/touch viewport**, how it collapses
  (the three-pane shell can't coexist on a phone; the rules in C.2 govern every
  screen). Responsive web, not a separate native app.

Component names (Button, Icon button, Select, Field, Tag, Filter chip, Member
chip, Role chip, Reaction pill, Avatar, Visibility marker, Waveform, Card, Menu)
are the ones in [`styleguide.html`](design/styleguide.html) §8 — the registry
references them, it doesn't redraw them.

### C.2 Global responsive contract (applies to every screen)

The desktop shell is **server rail (58) · channel column (232) · main · members
rail (210)**. A phone shows **one pane at a time**:

| Desktop pane | Mobile treatment |
|---|---|
| Server rail | Bottom tab bar (Home · Messages · Servers · Notifications · You) **or** a hamburger drawer from the header. |
| Channel column | A drawer slid in from the left (swipe or tap the server name); tapping a channel closes it and shows the channel. |
| Main | Full-screen; the default pane on load. |
| Members rail | Off-screen; reached via a "members" icon in the channel header → full-screen sheet. |
| Details pane | Slides up as a **full-height bottom sheet**, not a side panel. |
| Any hover-only affordance (reaction button, card menu) | Bound to **long-press** or an always-visible "⋯" — never hover-only on touch. |

Breakpoints (to confirm against the style guide): **≥1100px** full four-pane ·
**720–1099px** collapse members rail to an icon · **<720px** single-pane +
bottom tabs. Every element row below only notes mobile behaviour where it
differs from this contract.

### C.3 Screen manifest — build order follows §7.8

Registry column points at the section that specifies each surface. **Canvas (old
Screen 5) and Board (old Screen 6) are cut from the beta** — their rows, §C.8/§C.9
sections and §E mechanics are removed; those screen numbers are retired (left as a
gap) rather than renumbered. Screen 7 (Call) remains a v2 deferral.

| # | Screen | `data-screen` | Sub-states already mocked | Registry |
|---|---|---|---|---|
| 1 | Workspace | `workspace` | chat / pins / files (`chtab`), thread view | §C.4 (template) |
| 2 | Feed | `feed` | — | §C.5 |
| 3 | File explorer | `explorer` | files / folders | §C.6 |
| 4 | Details pane | *(overlay)* | per-context comments | §C.7 |
| 7 | Call | `vc` | chat / notes (`vctab`) | **v2 — deferred, not built** |
| 8 | Profile | `profile` | Public / Server / Private shelves, Settings | §C.10 |
| 9 | Messages (DMs) | `dms` | thread list, conversation | §C.11 |
| 10 | Upload | *(sheet)* | file upload | §C.12 |
| 11 | Server settings | `settings` | general/channels/members/roles/invites/moderation/audit/storage | §C.4–C.13 + C.16, C.19 |
| 12 | Create server | `create` | — | §C.14 |
| 13 | Join by link | `join` | — | §C.14 |
| 14 | Notifications | `notifications` | all / mentions / threads / saved (`ntab`) | §C.13 |
| + | Search / quick switcher | `search` | results, Cmd/Ctrl+K | §C.15 |
| + | Auth / onboarding | `auth` | signin / claim / sent (`astep`) | §C.14 |
| + | Roles editor | `settings/roles` | roles list + permission matrix | §C.16 |
| + | Assign roles to member | *(modal)* | multi-select checklist | §C.17 |
| + | Channel permissions | *(modal)* | allow-list (roles + members) | §C.18 |
| + | Storage & billing | `settings/storage` | two sliders (personal + server) | §C.19 |
| + | 404 · Dead invite · Access denied | *(cards)* | expired/revoked/full/member; no-access | §C.20 |

### C.4 TEMPLATE — Screen 1: Workspace

The three-pane server view. Legend: **R**=reads, **W**=writes, **RT**=Realtime.

#### Server rail (far left, 58px)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Home button | Go to Feed. Active = ink fill. | — | Top of rail | Bottom tab "Home" |
| Messages button | Go to DMs. Badge = unread DM count. | R `dm_members.last_read_at` vs `dm_messages` | Rail | Bottom tab "Messages" |
| Server badge (one per server) | Open that server's Workspace. States: default / hover (tooltip = server name) / active (ink) / **unread dot** / **mention count**. | R `servers` (membership); RT `channel_reads` | Vertical list | Horizontal strip in "Servers" tab |
| ＋ (create / join / add friend) | Menu → Create server · Join by link · Add friend. | opens `create` / `join` / `add_friend` | Below servers | In "Servers" tab header |
| Own avatar | Menu → Profile · status · settings · sign out. Shows presence ring. | R `profiles`; RT presence | Foot of rail | "You" tab |

#### Channel column (232px)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Server name header | Tap → server menu (settings if admin, leave, invite). | R `servers`; gate `is_server_admin` | Column top | Drawer top |
| Media entry | Open the File explorer. | R `works where server_id` | Fixed row | In left drawer |
| Channel list (text) | Each: name, unread bold, mention badge. Click → load channel. Admin sees drag-handle to reorder. | R `channels kind='text'`, `channel_reads`; W `is_server_admin` reorder | Grouped list | Left drawer |
| Voice channels | Listed by `kind`. Voice = **disabled/hidden in v1**. | R `channels` | Section | Left drawer |
| ＋ add channel (admin) | Inline create; name + kind. Hidden for members. | W `channels` insert, admin | Per section | Drawer |

#### Main — chat pane

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Channel header | Name, topic, tabs **Messages / Pins / Files** (`chtab`), members icon, search. | R `channels`, `message_pins`, `works` | Sticky top | Sticky; members icon → sheet |
| Message list | Reverse-chron, grouped by author; byline in member colour. States: loading / empty / new-message divider. Live insert/edit/delete. | R `messages` (+`member_of`); **RT** `channel:{id}` | Scroll region | Full-screen scroll |
| Message row | Body (markdown via `marked`), edited tag, reactions. **Hover** → reaction / reply-in-thread / ⋯ menu (edit/delete own, pin, copy link). | R `messages`, `message_reactions`; W `toggle_reaction`, `pin_message` | Hover actions | **Long-press** actions |
| Shared file card | A work rendered inline, **leading with file name**. Click → Details pane. | R `works` | Inline card | Inline card |
| Thread indicator | "N replies" → opens thread view (`parent_id`). | R `messages where parent_id` | Right-side thread panel | Full-screen push |
| Composer | Textarea + formatting toolbar (insert markdown), emoji picker (emoji-mart), @mention & #channel autocomplete, file attach, send. States: empty / typing (RT broadcast) / slowmode / timed-out (disabled + notice). | W `messages` insert (rate-limited); RT `:typing`; R members for autocomplete | Docked bottom | Docked; toolbar in a "＋" sheet |
| Pins tab | List of pinned messages; unpin (member) / unpin-any (admin). | R `message_pins`; W `unpin_message` | Tab content | Tab content |
| Files tab | Works shared in this channel, as cards. | R `works where channel` | Grid | Grid |

#### Members rail (210px)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Admins / Members sections | Grouped by role; name in member colour, presence dot, "working on" line. | R `server_members` (+`profiles`); **RT** presence `server:{id}` | Right strip | Off-screen → members sheet |
| Member row | Click → profile popout (mutual servers, role, add-friend/message). Admin hover → manage (role toggle, timeout, kick). | R `profiles`, `friendships`; W admin RPCs | Hover manage | Long-press manage |
| Presence dot | online / idle / dnd / offline; "working on {doing}". | RT presence | Inline | In sheet |

**Workspace empty/edge states to build:** no channels yet (admin sees "create
your first channel"), channel with zero messages, member with no presence,
timed-out composer, network-lost (Realtime reconnecting banner).

---

### C.5 Screen 2 — Feed

The friends-only portfolio grid.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Header nav (Feed / Notifications / You) | Switch top-level views; active = underline. | — | Top bar | Bottom tabs |
| Search field | Filter posts by title/tag/handle; server-side. | R `search_all(q,'feed')` | Toolbar | Full-width, filters in a sheet |
| Type / sort dropdowns | Filter by media type; sort newest/…; Reddit-style, no tag modifiers. | R `works` filters | Toolbar | In filter sheet |
| Layout toggle | Switch **even square grid ⇄ masonry**; default even. | — (client) | Toolbar icon | Toolbar icon |
| Post card | Square invisible cell (even) or natural aspect (masonry); media renders by kind (image thumb, video play-overlay, **audio → music-icon type card** (`#i-music` + ext; the waveform is only the expanded/inline player, gallery #13), text words, **non-previewable → type card** icon+ext); title + author below. Click → Details pane. | R `works` where `visibility='public'` and author ∈ friends | Grid, full width | 2-col grid |
| Empty | "No posts yet — add friends to see their work." | — | Centered | Centered |

### C.6 Screen 3 — File explorer

The server's files as a **Discord-meets-Google-Drive file system**: a **nested
folder tree** on the left, the current folder's contents in the main pane, and a
**three-way view toggle** — **grid** (default) · **list** · **feed**. The **feed**
view is special: it **flattens the whole subtree** to only the **previewable** works
(image / video / audio) newest-first, each with its **comments** shown inline — an
Instagram-style server media feed (unpreviewable files like `.flp/.zip` are hidden in
feed view; they appear in grid/list). Grid and list show subfolders + files of the
**current** folder only.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| **Folder tree** | Collapsible nested tree of the server's folders (root → children); current folder highlighted; drag a file/folder onto a folder to move it; admin/perm can add/rename/delete a folder. | R `folders where server_id`; W `folders` · `move_to_folder` | Left rail | Drawer / breadcrumb sheet |
| **Storage footer** (Drive touch) | Pinned to the foot of the tree: "**This server's storage** — X of Y GB used" + a bar + a **manage** link to §C.19. Always visible so the server's file-storage state reads at a glance. | R `storage_meters`/`storage_balance('server',id)` | Tree foot | Drawer foot |
| **Breadcrumb** | The path to the current folder (`LP / beats / drums`); each segment navigates. | derived from `folders.parent_id` | Toolbar | Toolbar |
| **View toggle** | **Grid** (default) · **List** (name/type/size/uploader/date columns) · **Feed** (flattened, previewable-only, comments inline). | — | Toolbar segmented | Toolbar |
| Search field | Search this server's files (whole tree, not just the current folder). | R `works where server_id` FTS | Toolbar | Full-width |
| Filter dropdowns (Channel / Type / Uploader / Sort) | Narrow the current view. | R `works` filters | Toolbar | Filter sheet |
| Folder row / card | A subfolder in the current folder — stacked-icon cover + item count; click → descend. | R `folders` (children) | In grid/list with files | 2-col / row |
| File card / row | Grid: same card renderer as Feed; List: a dense row. Leads with **file name**; uploader chip (server colour) + channel tag. | R `works` (in this folder via `placement.folder_id`) | Grid/List | 2-col / row |
| **Feed item** | *(feed view only)* a previewable work at natural aspect + its **comment thread** inline, newest-first across the subtree. | R `works` (previewable) + `comments(context=server)` | Column | Full-width |
| Grid select + bulk bar | Multi-select → action bar (download / **move to folder** / delete). | — / RPCs | Hover checkbox | Long-press |
| Lightbox | Full media viewer + "shared in" strip. | R `works` | Overlay | Full-screen |

### C.7 Screen 4 — Details pane

Opens from any card. **Arena layout (2026-08-18):** a near-full-screen split over a
scrim — the **media takes the room** (left, grows to fill), a **fixed ~380px info
rail** on the right. No drop shadow (scrim separates). Bigger than a modal on
purpose: the media is the point.

**Post vs server file — the load-bearing distinction (2026-08-18b).** The *same*
arena shell serves two things; what differs is the discussion surface and which
storage the bytes draw:

- **Post** — a **public** work on a profile/Feed. Draws the owner's **personal
  storage** (`storage_source='personal'`). Its pane is the classic one: a **public
  comment thread** (`comments`, context=public), tags, collaborators. **No channel** (it
  isn't in a server).
- **Server file** — a work shared **in a server**. Looks identical expanded but has
  **no discussion section at all** — replies happen in the **channel chat**, and the
  rail shows nothing in its place (the old "Replies happen in #channel →" link is
  removed, gallery #5). It **keeps tags** (+ collaborators). Server-stored,
  server-visible.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Media area | Fills the left; **one transport (audio = video) pinned to its foot** (seek, volume, tabular time, fullscreen); **big centred borderless play** over the media; **no visible skip buttons — 5-second skip on ←/→** (gallery #37/#38/#32/#11). Waveform/video/image/type-card/folder-preview per kind. | R `works` (signed URL) | Left, grows | Top ~42vh |
| **Prev / next arrows — folder only** | A single work (post or file) has **no** media arrows. A **folder** is the one pane that shows prev/next **over the media** (page its items) plus a clickable **navigation list in the rail**. | `folders` children order | Folder media edges + rail list | Same |
| **Size row** | A plain **file-size** row in the metadata (e.g. "8.4 MB"). The old "leads-the-metadata storage row" — the storage×visibility badge **and** the "N MB on *whose* storage" sentence — is **removed** (gallery #2/#3): the Location breadcrumb already shows where the root is, so the badge and the whose-storage prose were redundant. | `works.bytes` | Rail meta | Rail meta |
| **Location** (clickable breadcrumb) | Where the file lives in the tree: **`Server › folder › subfolder`** (server files, from `placement.folder_id`) or **`Your files › folder`** (posts). **Each segment is a link** that opens the File explorer at that folder — quick travel up the tree. | `folders` path via `placement.folder_id` | Rail meta | Rail meta |
| Metadata (rest) | Per kind: uploaded/posted-by, **posted-in #channel** (server file only — files aren't tied to channels, but a server-*posted* file carries its posting context; a file uploaded straight to the File explorer omits this row, gallery #4), **uploaded** date, **modified** date **+ by whom** (gallery #41), **size** (above), **length** (a/v), **dimensions/fps** (image/video), **format/codec/bit-depth**. Folder: location breadcrumb, made-by, created — **item count shows once**, on the Items list header, not also in the meta (gallery #6). | `works` cols | Rail | Rail |
| Report + close | Flag (report) and × sit in the rail's top bar. | `file_report` | Rail top bar | Rail top bar |
| ~~Storage×visibility badge~~ | **Removed (gallery #3).** The "Personal · Private / Personal · Public / Server" badge no longer renders in the details pane — visibility is set/seen via the Share dialog and the Location breadcrumb, not a metadata badge. Crosspost provenance stays **not shown**. | `works.owner_type` + `visibility` | — | — |
| Title / collaborators / tags | Title (or file name); collaborator chips (server colour); user tags + ＋. **Both** posts and server files have tags. | `works.title/collaborators` · `content_tags` | Rail | Rail |
| Actions | Download (get-as formats); **"Save to my files"** → menu into a personal folder, with a note that it **copies into your storage** (dedup-cheap, survives the server deleting theirs). | transcode · `saved_items` (owner copy) | Rail foot | Rail foot |
| **Discussion** | **Post** → a public **comment thread** (`comments`, context=public) with an add-comment field. **Server file** → **no discussion section at all** (removed the "Replies happen in #channel →" link, gallery #5); chat lives in the channel. | `comments` (posts) / channel chat (server files) | Rail list (post only) | Rail |
| Mobile | Card goes full-screen, **column**: media on top (~42vh), the rail below. | — | — | Full-screen column |

### C.10 Screen 8 — Profile

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Header | **Circular** avatar image (gallery #1 — every profile picture is round; round = avatars + presence dots only), name, @handle, bio; Add friend / Message (own profile → Edit). | `profiles` · `friendships` | Top | Top |
| Shelf tabs | **Public / Server / Private** (counts) + Settings; **search** button. | R `works` by visibility | Tab bar | Tab bar |
| Grid | Even square grid ⇄ masonry toggle; same card renderer. | `works` | Grid | 2-col |
| Settings tab | Name, handle, bio, avatar, theme, status, storage (owner). | `profiles` | Form | Form |

### C.11 Screen 9 — Messages (DMs)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| **Add-by-handle field** | Inline at top of the thread list (**not a modal**); exact handle only. | `create_dm(handle)` · `friendships` | Left column | Full-screen list |
| Friends / requests | Friends count + pending requests surface. | `friendships` | Left | List |
| Thread list | Pinned + DMs; unread dot, mute/pin. | `dm_channels` · `dm_members` | Left | List |
| Conversation | Messages, composer (attach, send); header with (v2) call buttons. | `dm_messages` · RT | Main | Full-screen |

### C.12 Screen 10 — Upload

**Fast by default (2026-08-19).** The default upload is **one step** — drop → pick
visibility → **Post**. Title auto-fills the file name; **Tags and Collaborators are
collapsed behind an "Add details" disclosure**, so a social user sharing a meme never
sees an artist-shaped form, while a producer expands it and credits the room. Nothing
below the visibility row is required.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Dropzone | Multi-file; type recognised (icon/filter), **not shown as a tag**. | `works.file_ext` | Modal | Sheet |
| Visibility | **Per post**: Public / Server / Private. **The one required choice.** | `works.visibility` | Segmented | Segmented |
| **Which server / folder** | When Server: pick the target server, and optionally the target **folder** in its tree (default = root). | `works.server_id` · `placement.folder_id` | Picker | Picker |
| **Storage-impact line** | Under the picker, a plain note of **which storage the bytes draw**: "Draws **{server}**'s storage · X of Y GB used" (Server) or "Draws **your** storage · X of Y GB used" (Public/Private). Keeps "who pays" honest at the point of upload. | R `storage_meters` for the target account | Row | Row |
| **Post** | Commits immediately with just the above (title = file name). | write path (§D.3) | Primary button | Primary |
| **▸ Add details** (disclosure) | Reveals: Title (optional, file-name default) · **Tags** · **Collaborators** (type-ahead chip input → member chip in colour + optional role). Collapsed by default. | `works.title` · `content_tags` · `works.collaborators` | Disclosure | Disclosure |

### C.13 Screen 14 — Notifications

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Tabs | All / Mentions / Threads / Saved; grouped by day. | `notifications` | Tabs | Tabs |
| Row | Mention / comment / join / reaction; links to target; inline reply. | `notifications` · RT `user:{id}` | List | List |
| Mark all read | Clears unread. | `notifications.read_at` | Header | Header |

### C.14 Screen 11/12/13 — Create · Join · Sign-in (focus screens)

Single-card, no server rail, scrim-free (§D.6.4). Vertically centred in a
full-height column; the card never touches the top edge.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| **Create server** — name + avatar + first channel | One card: server name, square avatar upload, seed a first text channel. Owner becomes `owner_id` (all flags); seed **only** the `@everyone` role with the non-admin flags on (§D.1 default). | W `servers` insert · `roles` seed (@everyone) · `member_roles` | Centred card, ~460px | Full-width card, gutters |
| **Join by link** — preview card | `/join/<code>` valid: server name, member count, "You were invited by X", Join. States: valid (this) / dead (→ C.17). | R `invites where code` · `servers` · W `member_roles(@everyone)` | Centred card | Full-width |
| **Sign-in / sign-up** | Email + magic-link / OAuth; toggle sign-in ⇄ create-account; error line under the field. | Supabase Auth | Centred card | Full-width |

### C.15 Search / quick-switcher (⌘K)

Global overlay, opens over any screen; not its own route.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Query field | Debounced prefix search; empty state = recent + jump-to. | R `search_all(q, scope)` | Overlay top | Full-screen sheet |
| Result groups | Servers · channels · people · files, each capped, keyboard-navigable (↑↓/⏎). | R `servers`,`channels`,`profiles`,`works` (scoped to `member_of`) | Grouped list | Grouped list |
| Scope note | Only surfaces what you can see — private channels gate on `can_view_channel`. | gate `can_view_channel` | — | — |

### C.16 Server settings → Roles (gated `manage_roles`)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Roles list | Each role: colour dot, name, member count; `@everyone` pinned last, un-deletable; drag to reorder (position). New role button. | R `roles where server_id` · W `roles` insert/`position` | Left 190px column | Stacked; list then editor |
| Colour picker | Swatches from the 30 member hues; sets `roles.color`. | W `roles.color` | Editor top | Editor top |
| Permission matrix | Flags grouped **Server / Members / Content** (D.1); each a square `.cbx` toggle; `@everyone` edits the baseline. | W `roles.permissions` bitmask | Editor body | Editor body |
| Delete role | Removes role + its `member_roles`/`channel_roles` rows; confirm modal. | W cascade delete | Danger row | Danger row |

### C.17 Assign roles to a member (gated `manage_roles`)

Modal from the role chip on a Members row, or the member popout's manage menu.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Member header | Avatar + name of the member being edited. | R `server_members` · `profiles` | Modal head | Sheet head |
| Role checklist | Every server role as a `.cbx` row (colour dot + name); **multi-select** — a member holds several. `@everyone` shown checked + locked. | W `member_roles` ← `set_member_roles(user, role_ids[])` | Checklist | Checklist |
| Effect note | "Permissions are the union of checked roles." | — | Footer | Footer |

### C.18 Channel permissions — private-channel allow-list (gated `manage_channels`)

Modal that appears when a channel is toggled **Private** in its settings.
v1 = allow-list only (D.1 LOCKED D-i).

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Roles section | Each role a `.cbx` row; checked roles see the channel. Zero rows total = open to all members. | W `channel_roles` ← `set_channel_access(channel, role_ids[], member_ids[])` | Modal | Sheet |
| Members section | Individual members (avatar + handle) grantable directly, same `.cbx`. | W `channel_roles`/member grant | Modal | Sheet |
| Add field | Type-ahead to add a role or member to the list. | R `roles`,`server_members` | Field | Field |
| Fence note | UI is the signpost; **`can_view_channel` RLS is the fence.** v2 migrates this to full allow/deny overwrites with no reshape. | gate `can_view_channel` | — | — |

### C.19 Server settings → Storage & billing (gated `manage_billing`)

Storage is a **dynamic slider** (no feature tiers, no pooling); per-GB price drops as
it rises (CANON §D.2). There are **two independent single-payer sliders** — your own
personal storage, and (gated `manage_billing`) this server's own storage — never
combined, never allocated across.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Personal usage bar | Usage / cap for the signed-in user's personal + public works; cap = 10 GB free + your `purchased_gb`. Reads "X GB used *(from Y GB of files)*" (dedup win). | R `storage_meters(user, you)` | Bar + label | Bar |
| **Personal storage slider** | Your own GB. Drag to buy; live blended **$/GB** drops as it rises (bracket schedule); shows monthly total; **min paid step ~$2/mo**. | R/W `storage_balance(user, you)` | Slider + live price | Slider |
| Server usage bar | This server's usage / cap; cap = ~5 GB baseline + the **server's** `purchased_gb`. Filling it just goes read-only — it can't inflate the admin's bill. | R `storage_meters(server, id)` | Bar + label | Bar |
| **Server storage slider** | The server's own GB, bought by one billing admin — a single bounded payer, **not** member contributions. Same bracket price. Gated `manage_billing`/owner. | R/W `storage_balance(server, id)` | Slider + live price | Slider |
| Export | Zip of every server file + metadata (content-addressed, no lock-in). | job → R2 zip | Danger-box row | Row |

### C.20 Utility screens — 404 · Dead invite · Access denied

Minimal, on-brand, no rail; centred card (§D.4).

| Screen | Behaviour & states | DB | Notes |
|---|---|---|---|
| **404 / not found** | Bad URL. One card: glyph, "This page doesn't exist", back-to-Feed. | — | Never leaks whether a private thing exists. |
| **Dead invite** | `/join/<code>` invalid. States: **expired · revoked · full · already-a-member** (each its own copy + CTA). | R `invites` (null/expired/at-cap) | Distinct from the valid preview (C.14). |
| **Access denied** | Private channel/server you can't see (`can_view_channel` false). Quiet "You don't have access" — **never a 404 that leaks existence**. | gate `can_view_channel` | Deliberately not a 404. |

Screen 7 (Call) stays **v2 — deferred**. Registry rule holds: every row names a
real table/RPC/Realtime channel from §7 (or an explicit "—").

---

## §D. Added scope (2026-08-17b)

Four things landed after §A–C were locked. Two of them (granular permissions,
PAYG storage) are **new architecture pillars** that touch the schema; the other
two (storage source, utility screens) slot in cleanly. Where D conflicts with an
earlier lock, **D wins and says so**.

### D.1 Granular roles & permissions — supersedes §B's two-role model

**This reverses the earlier "two roles only / no custom roles / no per-channel
overwrites" decision.** The ask is explicit: *assign roles, assign permissions
(can add tags, can view certain channels, …)*. So eski adopts a Discord-shaped
model: **roles carry permission flags, members hold roles, channels can be
gated.**

New tables (replace the flat `server_members.role` enum):

```
roles            (id, server_id, name, color smallint, position int,
                  permissions bigint,      -- bitmask of the flags below
                  is_default bool)         -- the @everyone role, one per server
member_roles     (server_id, user_id, role_id, pk(server_id,user_id,role_id))

-- v1 (LOCKED): private-channel allow-list. A channel with zero rows here is
-- open to every member; any rows make it private to exactly those roles.
channel_roles    (channel_id, role_id, pk(channel_id,role_id))

-- v2 (planned, not built): full per-channel allow/deny overwrites. Same grain
-- Discord uses; channel_roles migrates into this as pure `allow` rows.
-- channel_overwrites(channel_id, role_id, allow bigint, deny bigint, pk(...))
```

`server_members` stays (membership, colour, join time, timeout) but loses
`role`; a member's power is the **OR of their roles' permissions**, minus any
channel-level `deny`. The **owner** (`servers.owner_id`) is implicitly all-flags
and the only biller (§D.2).

> **Default roles for a new server (LOCKED 2026-08-19 — keep small servers light).**
> A brand-new server ships with **only two roles**: the **owner** (all flags) and
> **`@everyone`** (`is_default`), whose permission bitmask has **every non-admin flag
> ON by default** — `upload`, `add_tags`, `comment`, `pin_message`, `send_messages`,
> `view_channel` — and every admin/manage flag OFF. So a 5-friend server needs
> **zero role setup**: everyone can post, upload, comment, react out of the box, and
> only the owner administers. Granular roles (adding a "Producer", gating a channel)
> stay fully available but are **opt-in** — you reach for them only when the server
> grows. This is Discord's actual new-server default, not a stripped mode.

**Permission flags (proposed set — ⚑ratify).** Grouped so the editor reads well:

| Group | Flags |
|---|---|
| Server | `manage_server`, `manage_roles`, `manage_channels`, `manage_invites`, `view_audit`, `manage_billing` |
| Members | `kick`, `ban`, `timeout`, `create_invite` |
| Content | `upload`, `add_tags`, `comment`, `pin_message`, `delete_any_message` |
| Per-channel (via overwrite) | `view_channel`, `send_messages` |

Two RLS helpers join `member_of`/`is_server_admin`:
`has_perm(server_id, flag)` and `can_view_channel(channel_id)` (member_of AND no
role-deny on `view_channel`). **Channel-scoped reads (messages, pins, files, and
a `work` posted into a private channel) now gate on `can_view_channel`, not just
`member_of`** — this is the "view certain channels" requirement, and it widens
the §B.3 read rule for channel content.

> **LOCKED (D-i):** **v1 ships the private-channel allow-list** (`channel_roles`)
> — a channel is open to all members, or private to a chosen set of roles.
> **But the master plan must design for full per-channel overwrites** so we don't
> paint into a corner: `can_view_channel` and the permission-flag layout are
> written to the overwrite grain from day one, `channel_roles` is stored as the
> `allow`-only subset, and the v2 migration to `channel_overwrites` (allow+deny
> bitmask) is a documented, additive step — no data reshape. Every prompt that
> touches channel permissions references this two-phase plan.

### D.2 Storage & billing — **revised 2026-08-18b** (dynamic per-GB slider; no pooling at all)

The old model (a shared **server pool billed to one person** + raw per-GB PAYG)
created exactly the failures the [`EDGECASES.md`](EDGECASES.md) audit surfaced: a
biller can be bankrupted by others' uploads, a rage-quitting owner holds storage
hostage, and "the server has room but I can't upload." The interim fix (25 GB free
+ **flat feature tiers** + free-space **pooling**) fixed those but was wrong on two
counts: **1 TB Pro at ~$8 is below R2 cost** (~$0.015/GB → a packed terabyte costs
~$15, so every heavy Pro user *lost* money and the model needed a mountain of light
users to average out), and **pooling** let N accounts combine their way to a
mega-server. This revision removes both — and **pooling is gone entirely**: no
donated free space, and no "allocate my paid GB into a shared server pot" either.
Every storage account is a **single payer** on its **own** slider.

**The model in one line: storage is a dynamic slider — one continuous scale of GB, no
feature tiers. A *user* has a slider (their personal storage); a *server* has its own
slider bought by one billing admin. Each is a single, independent, bounded account.
The per-GB price *drops* as the slider goes up.**

**Five principles:**

1. **One account, one payer per byte — and accounts never combine.** Every `work` is
   owned by exactly one **storage account**: a **user** (their personal storage) or a
   **server** (its own storage, §D.3). Its bytes count against *that* account's slider
   and nobody else's. There is **no pooling**: members cannot donate free space, and
   they cannot allocate paid GB into a server — a server is funded by its **own**
   slider, set by one billing admin, and bounded by it (over the level they set →
   read-only, so members filling it can never inflate that admin's bill). This is what
   kills biller-bankruptcy, storage-hostage, *and* the free-account mega-server at
   once — there is no shared pot to bankrupt, hold, or farm.
2. **Content-addressed dedup.** Media is stored by `sha256`. A quota counts the
   **unique** blobs the account owns — a clip reposted ten times, or a sample reused
   is stored (and billed) **once**. The big lever for a social group's reposting and
   an artist reusing the same source across works.
3. **Storage only — no feature tiers.** Paid GB unlock nothing but space; every
   account has every feature. What you buy is a **number of GB on a slider**, not a
   plan. Upgrading = **sliding the scale**, never jumping a tier; downgrading is
   sliding back down. You never pay for more than the range you're in.
4. **Dynamic per-GB price (volume discount).** The slider is **bracketed** like tax
   bands — each additional band of GB costs less per GB — so the **marginal** and
   **blended** price per GB both fall as you buy more. The UI shows the live blended
   "$/GB" dropping as you drag. You're billed on the **GB you hold** — the balance is
   just a level, no per-transfer accounting.
   **Mid-cycle changes are asymmetric (prorate up, not down):**
   - **Slide up** → capacity unlocks immediately, and Stripe charges the **prorated
     difference** for the days left in the cycle (new level's price − old level's
     price, × days-remaining ÷ cycle-length). E.g. a server going 80 → 200 GB with 15
     of 30 days left: 80 GB = $2.40/mo, 200 GB = $5.88/mo, so **~$1.74 now**, then
     $5.88 at each renewal. Paying the difference is the consent action, so it's never
     a surprise — and it closes the park-and-drop loophole (you pay for the window you
     held the higher level).
   - **Slide down** → **no refund, no credit**; the lower level takes effect at the
     **next renewal**. Bytes over the new level go read-only, never deleted (free
     floor rules below). This is the only "proration mess" we avoid: refund/credit math
     on downgrades.
5. **Storage and visibility coincide — that combo is the model's spine.** A work is
   in exactly one of three states; the details-pane badge shows it verbatim:
   - **Personal · Private** — your storage, only you.
   - **Personal · Public** — your storage, world (portfolio / Feed). *A public post
     draws your personal quota* — the price of a portfolio.
   - **Server** — the **server's** storage, visible to the server's members. Native
     server files are **server-owned** (the server's slider pays), so storing-here
     and seeing-here are one act.

   The single case where storage ≠ visibility is a **crosspost** — a personal work
   *placed* into a server (§D.3): it stays **personal-stored** (draws *your* slider)
   but is seen in the server. We do **not** badge provenance; the badge shows the
   work's own state.

**Free floor:**
- **Every user: 10 GB free**, no card. Hard cap (not a soft target) — at the ceiling
  new uploads are **blocked** with "free space or add storage", never a surprise
  charge.
- **Every server: a small free baseline (~5 GB)** so a casual server works day one.
  It's **flat per server**, not per member, so it can't be farmed. Beyond it, a server
  needs its **own** paid slider (bought by a billing admin) — not member contributions.

**The paid slider (indicative brackets — owner sets final; all $/GB-month). Priced to
hold ~45% gross margin *even when an account is packed 100% full* — because the
"slide down so you never overpay" feature pushes utilization up, so we can't lean on
the unused headroom storage incumbents run on. Deliberately lean — a decent profit,
not a fat one — so the price stays defensible against the giants while still clearly
funding the service (these bytes have to be here for good; suspiciously cheap reads as
"what's the catch / who's the product").**

| Band (total held) | Marginal $/GB | Blended $/GB at top of band |
|---|---:|---:|
| 0–10 GB | **free** | — |
| 10 → 110 GB | **$0.032** | $0.032 |
| 110 → 510 GB | **$0.028** | ~$0.029 |
| 510 GB → 2 TB | **$0.024** | ~$0.025 |

Worked points (paid GB only; free 10 excluded from the charge):
`50 GB → $1.28/mo` · `110 GB → $3.20` · `250 GB → $7.12` · `510 GB → $14.40` ·
`1 TB → ~$26.7` (blended $0.026/GB) · `2 TB → ~$51.3` (blended $0.025/GB). **110 GB for
$3.20 is the anchor** — a genuinely good deal that still clears cost with room. Every
paid GB is priced **above** the full R2 cost (storage + ops, below), so **every paying
account is margin-positive from the first paid GB** at a real ~45% gross margin, and
the price is still confident enough to say "this is a funded service that will keep your
files." A **minimum paid step of ~$2/mo** (~65 GB) keeps Stripe's $0.30 fixed fee a
small % of the charge; below that, stay on the free 10 GB.

**Two guarantees that remove the anxiety:**
- **Never surprise-charged.** At any ceiling (personal or server), new uploads are
  **blocked** (read-only over cap), never auto-billed. Buying more is always an
  explicit slide.
- **Never deleted for non-payment.** Over quota / lapsed card = read-only; your files
  stay and you can always download them. Deletion is only ever the owner's own action
  or GC of an unreferenced blob. A server whose billing admin leaves or lapses:
  **transfer** billing → **grace window** → **read-only** until someone pays (never
  deleted).

**Meter shows the dedup win:** the storage bar reads "X GB used *(from Y GB of
files)*" so people see reposts cost nothing.

**Schema (replaces `storage_source`/`billing_server_id`; no `plan`, no pooling — so no
`storage_grants`, no `storage_allocations`):**
```
media_blobs     (sha256 pk, bytes, refcount)              -- content-addressed; dedup
works.blob_sha  text → media_blobs                        -- a work references a blob
works.owner_type text in (user, server)                   -- which storage account owns + PAYS
works.owner_id  uuid                                      -- that account
storage_meters  (owner_type, owner_id, bytes_used)        -- sum of DISTINCT owned blobs
storage_balance (owner_type, owner_id, purchased_gb, status, stripe_customer,
                 pk(owner_type, owner_id))                -- ONE slider per account (a user, or a server)
adopt_work(work_id)   -- rpc: move a work's owner → the server (needs manage_billing)
```
A **user's** quota = 10 GB free + their `storage_balance.purchased_gb`. A **server's**
quota = ~5 GB baseline + the server row's `purchased_gb`. Each account is billed a
single monthly charge from its own `purchased_gb` against the bracket schedule — there
is **no allocation step**, because there is nothing to allocate *across*: your slider
funds you, the server's slider funds the server. `bytes_used` counts distinct owned
blobs; **a placement adds zero bytes.** The signer (`api/sign.mjs`) checks the paying
account's remaining quota before issuing a PUT; over quota → read-only, never a charge,
never a delete.

#### D.2.1 Economics model (indicative — validate before pricing)

**Cost inputs — full R2 rate card.**
- **Storage** — **$0.015/GB-mo**.
- **Class A operations** (writes: PutObject, multipart, ListObjects, copies) —
  **$4.50 per million**.
- **Class B operations** (reads: GetObject, HeadObject — every thumbnail, preview,
  and playback fetch) — **$0.36 per million**.
- **Egress — $0** (the killer advantage; on S3 this line alone would sink a media app).
- **Free tier** — the first **10 GB-mo storage + 1M Class A + 10M Class B** each month
  are free, so at small scale ops cost is effectively **$0** and only storage bites.

Beyond the free tier, **ops are real but small** for a storage-heavy app: a Class B
fetch costs 0.36 millionths of a dollar, so even a busy mid account serving ~150k
reads/mo runs **~$0.05/mo** in Class B, and its uploads a cent or two in Class A.
Storage dominates; ops are a **~2–4% cost line**, modelled explicitly below rather than
waved off. Also: Stripe **2.9% + $0.30**/charge; fixed infra **~$45/mo** once you
outgrow free tiers (Supabase Pro $25 + Vercel Pro $20) — effectively **~$0–5/mo** at
tiny scale. Dedup means real stored GB < uploaded GB. The structural win of this
revision: **paid GB are priced above the full storage+ops cost**, so paid users are
individually profitable and the only thing to subsidise is the small, hard-capped free
floor.

**Per-account unit economics (per month), at the bracket prices above, packed 100%
full (the conservative case — see gross margin below):**

| Account | Slider | Revenue | Storage cost | R2 ops (A+B) | Stripe | Net | Net margin |
|---|---|---:|---:|---:|---:|---:|---:|
| Free (avg) | 10 GB | $0 | ~2 GB → $0.03 | ~$0 (free tier) | — | **−$0.03** | — |
| Free (maxed) | 10 GB | $0 | $0.15 | ~$0 (free tier) | — | −$0.15 | — |
| Light paid | 110 GB | $3.20 | $1.65 | $0.03 | $0.39 | **+$1.13** | **35%** |
| Mid paid | 250 GB | $7.12 | $3.75 | $0.07 | $0.51 | **+$2.79** | **39%** |
| Heavy paid | 1 TB | ~$26.7 | $15.36 | $0.20 | $1.08 | **+$10.10** | **38%** |

**Gross margin ≈ 45%** (revenue less storage **and R2 ops**) across the paid range even
at full utilization, **≈ 38% net** after Stripe — a deliberately lean but healthy
spread. R2 ops (Class A + Class B) are the ~2–4% line broken out in the table; storage
is the dominant COGS. Margin only goes *up* with unused headroom (a 250 GB account 70%
full runs ~50% net). Small accounts sit under it (the free 10 GB + Stripe's flat $0.30
drag them); everything ≥250 GB clears ~38% net.

**Three scenarios** (conv. = % of accounts holding paid GB; avg paid buyer ≈ the
250 GB row → ~+$2.79/mo; free-user avg cost as noted; servers, themselves paying
accounts, add margin on top and are folded in lightly):

| Scenario | Paid conv. | Free avg cost | Margin / user / mo | Break-even (at $45 infra) | Profit / 1,000 users / mo |
|---|---:|---:|---:|---:|---:|
| **Base** | 4% | $0.04 | ~$0.073 | **~615** | **~+$28** |
| **Optimistic** | 6% | $0.03 | ~$0.139 | **~325** | **~+$94** |
| **Pessimistic** | 2% | $0.06 (heavy) | ~−$0.003 | **~break-even** | **~−$3 (ex-infra)** |

**Read-outs:**
- **Below a few hundred users you're on free Supabase/Vercel tiers ($0 fixed) — and
  R2's own free tier (10 GB + 1M Class A + 10M Class B) zeroes ops there — so paid GB
  clear ~38% net and you're cash-positive almost immediately.** A *single* mid-tier
  paid account (~+$2.79) covers ~70 average free users. The ~$45/mo Pro-infra step only
  bites around the scale where you also have more paying users to cover it.
- **Break-even ≈ 325–615 total users** in the base/optimistic cases once you're on paid
  infra — the small nudge from the $0.028 band up to $0.032 roughly halves the
  break-even user count vs. that cut while staying far under the old $0.050 price.
- **The pessimistic case (2% conversion, heavy free users) now sits at ~break-even** —
  per-user margin is ~−$0.003 (essentially flat, up from ~−$0.017 before the nudge). At
  that conversion the free floor still just about matches the paid margin, so it neither
  clearly funds nor clearly loses; a further band bump or a tighter free floor tips it
  positive. The real lever in this case is conversion, not price — 2% is the risk, 4%
  clears it comfortably.
- **Out-of-pocket during the ramp is small.** You run under break-even only in the
  window where you've moved to paid infra but conversion is still ramping; burn there is
  **~$15–45/mo** until user count clears break-even.
- **The free floor is bounded.** The **10 GB cap is hard**, so a free user costs **at
  most $0.15/mo**. Levers, in order: **dedup** (cuts real GB most); the hard cap
  itself; nudge heavy users to add a cheap slice of paid GB rather than hit the wall.
- **Egress being free on R2 is what makes a media app viable here** — on S3, serving
  video would dwarf storage cost and flip every scenario negative.

*(Modelling assumptions, not measured. Instrument real free-user average and paid
conversion in the first months and re-run.)*

### D.3 Placements — one work, many surfaces (supersedes storage-source/crosspost)

**⚑DECIDE→LOCKED:** adopt the **placement model**. A `work` has one **home**
(owner + storage) and its own tags/collaborators; **placements** are lightweight
references that put it onto a surface. Discussion and audience attach to the
**placement**, not the work.

```
placement (id, work_id → works, surface text in (feed,server,dm),
           surface_id uuid, channel_id uuid null, placed_by uuid, created_at)
```

- **Post to a server** = a `server` placement of a work you own. Your bytes; the
  file shows in the server; **members read it via the placement** (the read rule
  gains "readable if you can see any placement", closing the old dead-end where a
  personal work in a server was owner-only).
- **Crosspost** = the *same* thing — a placement of an already-owned personal work
  into a server. No copy, no separate storage source; **it's just another
  placement**, so the confusing "personal vs server pool" split disappears.
- **Multi-share** (one work in several servers/DMs) = several placements. Storage
  counted once (dedup + single owner). "Remove from server" detaches **one
  placement**; the work and its other placements are untouched.
- **DM / forward** = a `dm` placement (grants read to the DM). **Forwarding a
  server file to a non-member copies it to the sender's personal storage** (a new
  work referencing the same dedup blob — near-zero bytes — owned by the sender),
  never a live cross-server grant. (⚑DECIDE answer.)
- **Publish (server file → public portfolio)** = **fork a personal copy**
  (⚑DECIDE answer): a new work owned by you, crediting the original; the server file
  stays put. Server and public copies then diverge by design. The details pane's
  "Publish" action is this fork.

> **LOCKED (D-ii, revised):** ownership vs presence stay split. **The owner
> controls the file** (edit, delete). **The server controls its
> presence** — an admin with moderation perm can **detach a placement** (remove it
> from the server), which never touches the owner's file or bytes. Making a work
> **Private retracts all its placements** (they show "author made this private"),
> and **deleting a work removes every placement + decrements the blob refcount**
> (the blob is GC'd when refcount hits 0). Saves resolve through the live read
> rule, so a lost placement shows "no longer available", never a dangling open.

#### D.3.1 Collaborator consent & who-can-tag (⚑DECIDE→LOCKED, 2026-08-19)

Two EDGECASES resolutions land here:

- **Collaborator consent (Instagram-style).** Crediting `@handle` on a work writes a
  `work_collaborators(work_id, user_id, role, status)` row. `status='accepted'`
  **auto** when the credited person is a **friend or a co-member** of the work's
  server; `status='pending'` for a **stranger** (their chip shows muted and the
  credit doesn't surface on *their* profile until they accept). **A credited person
  can always self-remove** (delete their own row), on any work, forever. This stops
  credit-spam and impersonation while keeping the common case (crediting your
  bandmates) frictionless.
- **Who can tag / credit.** Adding **tags** or **collaborators** to a work is limited
  to the **owner + already-accepted collaborators** — not any server member. (Global
  metadata is shaped only by the makers; a server can still organise via **folders**,
  which are server-scoped, not on the work.) Enforced in the tag/credit RPCs, not the
  UI.

### D.4 New utility & admin screens (added to the registry + gallery inventory)

Not in the mockup yet; all **TO BUILD**:

- **404 / not found** — bad URL. Minimal, on-brand.
- **Dead invite** — `/join/<code>` that's **expired / revoked / at capacity**;
  distinct from the valid join-preview card (which stays as mocked). States:
  expired, revoked, full, already-a-member.
- **Access denied** — a private channel/server you can't see (`can_view_channel`
  false) — a quiet "you don't have access", never a 404 that leaks existence.
- **Server settings → Storage & billing** — usage bars + **two storage sliders**
  (personal + this server), no plans/pooling (§C.19, §D.2); gated by `manage_billing`.
- **Server settings → Roles** — create/rename/colour a role, the permission
  matrix (D.1 flags), drag to reorder; gated by `manage_roles`.
- **Assign roles to a member** — from the member popout/manage; writes
  `member_roles`.
- **Channel permissions** — per-channel role allow-list / overwrites (D.1);
  gated by `manage_channels`.

These extend §C's 14-screen manifest to a **~21-surface** registry; each still
gets the full element · behaviour · DB · desktop · mobile treatment when §C is
filled.

---

## §D.5 UI refinements (2026-08-17c)

Smaller corrections from the gallery review — all fold into §C when it's filled:

- **Upload — Tags and Collaborators are two fields** (both opt-in behind "Add
  details", 2026-08-19). Collaborators is a **type-ahead chip input**: start typing a
  handle → it autocompletes members → **space/Enter** commits them as a **chip in
  their member colour** (with an optional freeform role). Not a free-text line.
  (Renamed from "Credits".)
- **Channel rename lives in Server settings → Channels**, not a standalone
  prompt modal. (The generic single-field prompt still exists for new folder /
  new label / etc.)
- **New message is not a modal** — the add-by-handle field is **integrated into
  the Messages (DMs) screen** itself (inline at the top of the thread list),
  not a popped dialog.
- **Member popout uses a SQUARE profile image** (the large avatar). Round stays
  for small inline avatars and presence dots; the popout's hero image is square.

---

## §D.6 Feed, profile, layout & visibility (2026-08-17d)

Gallery-review batch. All fold into §C/§E when filled; mockup screens updated where noted.

### D.6.1 Feed / profile / explorer grid
- **Full-width.** The card grid fills the pane width (no narrow max-width column).
- **Square containers, invisible.** Each work sits in a **square cell** (aspect
  1:1) with **no background/border** — the media shows at its natural aspect
  inside; audio → **music-icon type card** (waveform only in the expanded
  player, gallery #13), video → play overlay, text → its words, image →
  thumbnail. The cell is a layout unit, not a visible card.
- **Layout toggle.** A control switches between the default even grid and a
  **denser masonry** (variable-height, Pinterest-style) view. Applies to Feed,
  Profile shelves, and File explorer.
- **Search in Profile.** Profile gets a **search button** (same pattern as Feed /
  explorer) to filter that person's shelves.

### D.6.2 Non-previewable file types
Feed **and** message attachments must render **files with no visual preview**
(`.flp`, `.zip`, `.exe`, `.als`, `.aep`, project files…) as a **type card**: the
file icon + extension + name, square cell, no fake thumbnail. Add examples to the
mockup feed and a chat message.

### D.6.3 Collections → **Folders**, now a nested file tree (2026-08-19)
The server-level **Collections** are renamed **Folders** everywhere and made a
**nested tree** — the File explorer (§C.6) is a Discord-meets-Drive file system:
a folder has a `parent_id` (null = server root), a server file lives in exactly one
folder per server (`placement.folder_id`, default root), and the explorer's **feed**
view flattens the subtree to previewable media + comments. Kill the word
"collection". (Distinct from personal **save folders**, which stay.)

### D.6.4 Focused screens — create / join / sign-in / system
**Superseded 2026-08-17f — all focus/system screens are scrim modals, no rail.**
They looked wonky (content flush to the top, an in-app rail beside a single-task
card). The rule now, for **sign-in/auth, create server, join by link, 404, dead
invite, and access-denied** alike:
- **No server rail, no in-app chrome.** The whole viewport is a **dimmed backdrop
  (scrim)** with the card centered on **both** axes, generous padding, never
  top-flush.
- **The scrim is the separation — no drop shadow on the card** (the standing
  no-shadow rule; a shadow was removed here). Auth's "eski" wordmark sits on the
  scrim above the card in the on-ink colour.
- Implementation note: the app shell toggles a `focusmode` class that hides the
  rail; `.onboard`/`.authwrap` are `position:fixed` scrims. (This overrides the
  earlier "keep the rail on create/join" line.)

### D.6.6 Visibility — more rigorous, per-post, with server target
- Visibility is set **per individual post/work**, not a global default only.
- When visibility is **Server**, the user **picks which server** the post goes
  into (a server selector). A post can target a specific server.
- So the visibility control is: **Public / Server → [which server] / Private**,
  chosen per upload and editable per post. Backend: `works.visibility` +
  `works.server_id` (the chosen server) already carry this; the UI must expose
  the server picker, not assume the current one.
