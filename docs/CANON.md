# eski collab — the canonical model

**Status: planning. Source of truth for the Kimi K3 hand-off.** Where
[`COLLAB.md`](COLLAB.md) is the narrative spec and the mockup is the picture,
this file is the *contract*: one vocabulary, one permission model, and one
registry of every functional UI element (behaviour → database → responsive
layout). When a Kimi prompt and this file disagree, this file wins.

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
> Private** (+ **Link** for canvases). These are final and baked in below.

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
| **Workspace** | The three-pane **screen** you land in when you open a server. **Only ever a screen name — never a data entity.** | *(screen, not a table)* | "the workspace" meaning a server or a canvas |
| **Server rail** | Far-left 58px strip: Home, Messages, one badge per server, ＋, your avatar. | — (`--rail`) | group rail, sidebar |
| **Channel column** | 232px column listing a server's Media, Channels, Boards, Canvases, Voice. | — (`--chan`) | channel list, sidebar |
| **Members rail** | 210px right strip: Admins / Members, presence, "working on". | — (`--mem`) | members list, members panel |
| **Details pane** | The slide-in that opens from any card. | — | details panel, info panel, inspector |

### A.3 Channels & their kinds

A **channel** is a room inside a server. Its `kind` is what it holds. Every
kind lives in the same channel column so the whole server is one navigable rail.

| Canonical | `channels.kind` | Means |
|---|---|---|
| **Text channel** | `text` | Persistent, searchable chat. `#beats`, `#renders`. |
| **Board** | `board` | A kanban (§A.6). |
| **Canvas** | `canvas` | A review surface (§A.5). *A canvas is reached as a channel, and is also its own entity — see A.5.* |
| **Voice channel** | `voice` | **Reserved in the enum; not built in v1** (calls deferred). Kill "voice room". |
| **Media** | *(not a channel row)* | The server's file explorer — one fixed entry in the column, not a `channels` row. Kill "media channel". |

Kill: "room" as an entity noun (a voice channel is a voice channel), "feed" for
a channel (the Feed is the friends-only portfolio, §A.7).

### A.4 The uploaded thing — `work`

The single most-renamed concept in the spec. One entity, one **intentional**
context-split:

| Canonical | Context | DB |
|---|---|---|
| **work** | The data entity. Use in schema, RLS, RPCs, these docs. | `works` (+ `work_items` for a multi-item work) |
| **post** | A `work` seen in a **public** context — the Feed, a public profile shelf. Has a title, appears to friends. | same row, `visibility='public'` |
| **file** | A `work` seen in a **server/personal** context — a channel, the Media explorer, a canvas tile. Leads with its **file name**. | same row, `visibility in (server,personal)` |

> **LOCKED:** the post/file split is kept (F9). Kimi prompts say **post** on the
> Feed and public Profile shelves, **file** in every server/personal context (a
> channel, the Media explorer, a canvas tile, the Upload sheet in server mode).

Sub-terms (not renamed, pinned for clarity):

| Canonical | Means | DB |
|---|---|---|
| **version** | A numbered iteration of a work (v1, v2…). Linear, no branches. Any member can add one; a **change reason is mandatory**. | `works.version_of`, `works.version_note` |
| **credits** | Free-text attribution on a work ("prod. jax · mix tomo"). | `works.credits` |
| **contributor chip** | A name from `credits` rendered as a chip in that member's server colour. | derived |
| **tag** | A user-added label. First 5 show inline, "+N" for the rest. | `content_tags` |
| **file type** | The extension/kind, for the icon and Type filter. **Never rendered as a tag** (F10). | `works.file_ext`, `works.kind` |
| **collection** | A named, ordered set of works. Rendered as a **carousel** in the explorer. | `collections` / `collection_items` |

Kill: "asset", "media item", "attachment", "revision" (→ version), "carousel"
as an entity (it's how a collection *renders*).

### A.5 The review surface — `canvas`

F5/F6's "canvas / scratchpad / workspace-with-visibility" are **one entity**.
Canonical name: **canvas**. The table is renamed `scratchpads` → **`canvases`**
for the clean slate.

| Canonical | Means | DB |
|---|---|---|
| **canvas** | A scratch surface holding several files as **tiles**; has its own visibility (private / server / link). Reached as a channel kind or opened from a card ("Open in canvas"). | `canvases` (owner_id, server_id?, visibility, share_code) |
| **tile** | One file placed on a canvas. Only a file *on a canvas* is a tile; elsewhere it's a card. | `canvas_items` (was `scratchpad_items`) |
| **annotation** | A **drawing** on a tile — pen / arrow / box / freeform + colour. A visual mark, not a thread. | `annotations` (tool, color, path jsonb) |
| **comment** | A **Figma-style floating pin** (shown as the author's avatar) anchored to a selection, expanding to a thread. Resolves, never deletes. **Distinct from annotation** (F5 is emphatic). | `comments` (+ `mark jsonb`, `context`, `resolved_at`) |
| **mark** | The anchor a comment points at: a point, box, freeform region, video frame, or audio range. | `comments.mark jsonb` = `{point}｜{box}｜{path}｜{frame}｜{t0,t1}` |

Kill: **scratchpad** (→ canvas), **workspace** as used in F6 (→ canvas),
**note** (→ comment; "leave a note" becomes "leave a comment"), "sticky",
"marker" (→ mark or pin per context).

> **Superseded by §E (2026-08-17c):** the tool set and annotation model above are
> redefined — **no arrows/boxes**; annotation = **3 mark types** (point /
> rectangle / lasso), each carrying a comment; plus a separate **pen + eraser**
> ink tool. The **point renders as a rectangular labelled tail, not a bare
> avatar**. See §E for the full mechanics.

### A.6 Boards

| Canonical | Means | DB |
|---|---|---|
| **board** | A kanban, itself a channel kind. | `boards` |
| **column** | To do / In progress / Review / Done (admin-editable). | `board_columns` |
| **card** *(board card)* | A task: title, label, assignee, optional linked work or canvas. | `board_cards` |

Note the one collision we accept: **card** means a board card here *and* a
work's thumbnail card in the Feed/explorer. Disambiguate by context ("board
card" vs "work card") only when both are on screen. A file on a canvas is never
a card — it's a **tile**.

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
| **save** | Bookmarking a work into a personal folder. **Distinct from pin.** | `saved_items` / `save_folders` |
| **reaction** | An emoji on a message. | `message_reactions` |
| **mention** | `@handle` in a message/comment → a notification. | `mentions` / parsed on insert |
| **notification** | A row in the bell. | `notifications` |
| **presence** | Ambient online + "working on" state. **No table** — Realtime Presence. | Realtime |

Kill: "magic link" (→ invite link; reserve "magic link" for auth email only),
"bookmark" (→ save), "react/like" (Like is retired entirely — never resurrect
the word), "notif".

### A.9 Visibility — the enum vs the label

Data enum on `works.visibility` (and `canvases.visibility`): **`public` |
`personal` | `server`** (+ `link` for canvases). The spec currently shows *three
different label sets* for this one enum — that is the sharpest drift in the doc:

| `visibility` | Profile shelf (mockup) | Upload choice (mockup) | Canonical UI label (LOCKED) |
|---|---|---|---|
| `public` | "Public" | "Everyone" | **Public** |
| `server` | "Shared" | "This server" | **Server** |
| `personal` | "Private" | "No one" | **Private** |
| `link` *(canvas only)* | — | — | **Link** |

> **LOCKED:** **Public / Server / Private** (+ **Link** for canvases), identical
> on the upload sheet, the profile shelves, and every visibility marker. "Shared",
> "Everyone", "This server", "No one" are killed. One word per value, no
> context-dependent synonyms. The data enum stays `public｜personal｜server`
> (+`link`); only the label is fixed.

### A.10 Member colours (the one hue in the UI)

The chrome is black/white/grey; the **only** colour is a member's per-server
identity hue (F12a), and it renders **only inside that server** — on chat
bylines, the Members rail, contributor chips, canvas-comment authors, and
board-card assignees. Never on a public profile or the Feed.

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
| **Link-holder** | Anyone with a canvas share link — no account rights beyond that one canvas. | `canvases.share_code` |
| **Self** | Acting on your own row, any server. | `owner_id = uid()` |

Two gate helpers every server policy calls (`security definer`,
`search_path=public`): **`member_of(gid)`** and **`is_server_admin(gid)`**.

### B.2 Capability matrix

✅ allowed · ⛔ denied · **self** = only your own rows · *(rpc)* = enforced in a
`security definer` RPC, not a raw policy.

| Capability | Owner | Admin | Member | Timed-out | Non-member | Enforced by |
|---|:--:|:--:|:--:|:--:|:--:|---|
| Read server content (works, messages, boards, canvases) | ✅ | ✅ | ✅ | ✅ | ⛔ | `member_of(server_id)` |
| Join via invite link | — | — | — | — | ✅*(rpc)* | `join_via_invite(code)` |
| Post a message | ✅ | ✅ | ✅ | ⛔ | ⛔ | insert: member & `timeout_until` null/past |
| React / pin a message | ✅ | ✅ | ✅ | ⛔ | ⛔ | member; unpin-any = admin |
| Edit / delete **own** message | self | self | self | self | ⛔ | own row, tombstone |
| Delete **any** message (moderate) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin` |
| Upload a work to the server | ✅ | ✅ | ✅ | ⛔ | ⛔ | member; `visibility='server'` |
| Add a **version** to any work | ✅ | ✅ | ✅ | ⛔ | ⛔ | `add_version` *(rpc)* — reason required, same kind |
| Delete **own** work | self | self | self | self | ⛔ | own row |
| Withhold a work (takedown) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin`, writes `audit_log` |
| Create / edit a board card | ✅ | ✅ | ✅ | ⛔ | ⛔ | member; delete = admin |
| Comment / annotate on a canvas | ✅ | ✅ | ✅ | ⛔ | link-holder✅ | canvas visibility + membership |
| Create a canvas | ✅ | ✅ | ✅ | ⛔ | ⛔ | member (server canvas) or self (private) |
| Add / rename / reorder channels & boards | ✅ | ✅ | ⛔ | ⛔ | ⛔ | `is_server_admin` |
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
-- works (and mirrored on comments, messages, board_*, canvases, collections)
create policy works_read on works for select using (
  visibility = 'public'                              -- portfolio / Feed
  or owner_id = (select auth.uid())                  -- your own + Private
  or (visibility = 'server' and member_of(server_id))  -- the Work layer
);
```

Consequences that drive the UI (§C references these):
- **Feed** shows only `public` works by your **friends** (`friendships`
  accepted). Server and Private never leak in.
- **Media explorer** shows only `where server_id = <this server>` — always
  `server` visibility, gated by `member_of`.
- **Profile shelves**: Public = anyone; Server = a viewer sees only servers you
  share; Private = self only.
- **Canvas `link`** visibility is the one non-member read path, scoped to that
  single canvas by `share_code` — never widens to the server.
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

### C.3 Screen manifest (14) — build order follows §7.8

| # | Screen | `data-screen` | Sub-states already mocked | Registry |
|---|---|---|---|---|
| 1 | Workspace | `workspace` | chat / pins / files (`chtab`), thread view | **worked below (template)** |
| 2 | Feed | `feed` | — | to fill |
| 3 | Media explorer | `explorer` | files / collections | to fill |
| 4 | Details pane | *(overlay)* | version dropdown, per-context comments | to fill |
| 5 | Canvas | `canvas` | files / pins (`chview`), annotate vs comment | to fill |
| 6 | Board | `board` | board / table / calendar (`kview`) | to fill |
| 7 | Call | `vc` | chat / notes (`vctab`) | **v2 — deferred, not built** |
| 8 | Profile | `profile` | Public / Server / Private shelves, Settings | to fill |
| 9 | Messages (DMs) | `dms` | thread list, conversation | to fill |
| 10 | Upload | *(sheet)* | new-post vs new-version mode | to fill |
| 11 | Server settings | `settings` | general/channels/members/invites/moderation/audit/storage | to fill |
| 12 | Create server | `create` | — | to fill |
| 13 | Join by link | `join` | — | to fill |
| 14 | Notifications | `notifications` | all / mentions / threads / saved (`ntab`) | to fill |
| + | Search / quick switcher | `search` | results, Cmd/Ctrl+K | to fill |
| + | Auth / onboarding | `auth` | signin / claim / sent (`astep`) | to fill |

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
| Media entry | Open the Media explorer. | R `works where server_id` | Fixed row | In left drawer |
| Channel list (text) | Each: name, unread bold, mention badge. Click → load channel. Admin sees drag-handle to reorder. | R `channels kind='text'`, `channel_reads`; W `is_server_admin` reorder | Grouped list | Left drawer |
| Boards / Canvases / Voice servers | Same list, by `kind`. Voice = **disabled/hidden in v1**. | R `channels`, `boards`, `canvases` | Sections | Left drawer |
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

### C.5 To fill (after format sign-off)

Screens 2–6, 8–14 and the two extras, each to the depth of §C.4: element ·
behaviour/states · DB binding · desktop · mobile, plus a per-screen empty/edge
list. Screen 7 (Call) is stubbed as **v2 — deferred**. The registry is done
when every element on every mocked screen has a row and every row names a real
table/RPC/Realtime channel from §7 (or an explicit "—").

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

**Permission flags (proposed set — ⚑ratify).** Grouped so the editor reads well:

| Group | Flags |
|---|---|
| Server | `manage_server`, `manage_roles`, `manage_channels`, `manage_invites`, `view_audit`, `manage_billing` |
| Members | `kick`, `ban`, `timeout`, `create_invite` |
| Content | `upload`, `add_version`, `add_tags`, `comment`, `annotate`, `manage_board`, `pin_message`, `delete_any_message` |
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

### D.2 PAYG storage & billing — new pillar

**Storage is paid, per pool.** Two pools, each metered and billed pay-as-you-go:

- **Personal storage** — the signed-in user pays for their own personal + public
  works. Pool = `sum(works.bytes)` where `owner_id = you AND storage_source='personal'`.
- **Server storage** — someone pays per server (the owner, or an admin with
  `manage_billing`). Pool = `sum(works.bytes)` where `billing_server_id = <server>`.

Schema on `works` (extends the F-series columns):

```
works.storage_source   text in (personal, server)   -- which pool pays
works.billing_server_id uuid null → servers          -- set when storage_source='server'
```

Billing/metering (details are owner's calls — provider, prices):
```
storage_meters   (owner_type in(user,server), owner_id, bytes_used, updated_at)
billing_accounts (owner_type, owner_id, plan, payg bool, stripe_customer, status)
```
`storage_meters` is maintained by the same trigger that sums `works.bytes` today,
keyed by pool. A soft cap warns; the hard ceiling stays on the signer.

### D.3 Storage source on a work — post vs crosspost

The distinction the details pane must surface:

| Action | `storage_source` | `billing_server_id` | Where it "lives" |
|---|---|---|---|
| **Post to a server** (native server file) | `server` | that server | Server pool pays |
| **Crosspost** a personal work into a server | `personal` | null | **Personal pool pays**; it stays *yours*, just shown in the server |
| Post to Public / Private (portfolio, shelf) | `personal` | null | Personal pool |

So a crosspost is a *reference* into a server that draws the owner's personal
storage, not a copy on the server's dime. The **details pane** shows a **storage
badge** — "Server: SPECTER" vs "Personal (crossposted)" — and the crosspost path
is a distinct action from a native server upload. RLS: a crossposted work is
readable by server members (it appears in the server) but its bytes never count
against the server pool.

> **LOCKED (D-ii):** ownership and moderation are split.
> **Storage + editing stay with the owner** — a crosspost draws the *personal*
> pool and only the owner can edit it or add versions. **But server admins CAN
> manage it inside the server**: an admin (with `delete_any_message`/moderation
> perm) can **remove the crosspost from the server** and moderate it there.
> Removing-from-server is a *server-scoped detach* (drops the reference /
> `withheld` in that server), **never a delete of the personal original** — the
> owner's file and its bytes are untouched. So: owner controls the file, the
> server controls its presence in the server.

### D.4 New utility & admin screens (added to the registry + gallery inventory)

Not in the mockup yet; all **TO BUILD**:

- **404 / not found** — bad URL. Minimal, on-brand.
- **Dead invite** — `/join/<code>` that's **expired / revoked / at capacity**;
  distinct from the valid join-preview card (which stays as mocked). States:
  expired, revoked, full, already-a-member.
- **Access denied** — a private channel/server you can't see (`can_view_channel`
  false) — a quiet "you don't have access", never a 404 that leaks existence.
- **Server settings → Storage & billing** — usage bars (personal vs this
  server), current plan, PAYG toggle, upgrade; gated by `manage_billing`.
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

## §E. Canvas mechanics (detailed) — 2026-08-17c

The review canvas got a full redesign pass. This **supersedes the tool/annotation
parts of §A.5** (the glossary row stays; the mechanics live here). The through-line:
**the canvas is its own workspace with its own expanded views — the details pane
never opens inside the canvas.**

### E.1 Navigation
Pan + zoom, plus **zoom presets**: **Fit** (frame all tiles), **Reset** (100%),
zoom-to-selection. A small zoom control (−/●/＋ with a % readout and Fit/Reset).

### E.2 The tool palette — exactly three groups, nothing else
**No shapes, no arrows.** The palette is:

1. **Move** — pan the canvas / select & drag tiles.
2. **Annotate** — drops a **comment anchor**. Three mark types only:
   - **Point** — a single anchor. Renders as a **rectangular label with a
     pointer/tail** (not a bare circle) carrying the **full username** in the
     member colour; **scrolls** if the name is long. The tail shows exactly what
     it's attached to.
   - **Rectangle** — a rectangular region. Renders as a **dotted outline that
     appears only on hover**, with the point-label pointing to it.
   - **Freehand (lasso)** — a freeform region. Same treatment: **hover-only
     dotted outline** + point-label.
   Every annotation **carries a comment thread, hidden until the mark is
   clicked**. (So on the canvas, annotation and comment are coupled: the mark is
   the anchor, the comment is its thread.)
3. **Pen + Eraser** — freehand **ink** markup, with **size + colour**.
   - Strokes are stored as **SVG paths**.
   - Eraser is **OneNote-style: whole-stroke erase** — touching a stroke removes
     the entire path at once, never pixel-scrubbing.
   Ink is pure visual markup — it is **not** a comment.

Removed for good: arrow, box/shape, and the old pen/arrow/box/freeform set.

### E.3 Per-media behaviour (this is the important part)
- **Image** — annotations (point/rect/lasso) + pen ink drawn directly on the
  tile. A **screencap** button copies the image at **full resolution to the
  clipboard**.
- **Video** — annotation pins sit on the frame; **as they pile up they collapse
  into a number badge** (app-notification style). Click a pin/badge → a **list
  of that video's annotations** (canvas-specific, *not* the details pane). A
  **screencap** button grabs **the current frame at full resolution → clipboard**.
- **Audio** — the point marker still applies, but clicking it opens an
  **expanded audio view**: the waveform + a **player** + the list of that audio's
  **annotations** (canvas-scoped, distinct from comments). **Trim**: select a
  waveform section and **duplicate** it as a **new audio tile in the canvas**.

### E.4 Duplicate, not copy
Wherever the old spec said "copy", the action is **duplicate** — it spawns a copy
**straight into the canvas**, never onto the clipboard. The one clipboard action
is **screencap** (a frame/image, for use outside eski). Audio-trim → **duplicate
into canvas**.

### E.5 Three distinct layers on a tile (name them right)
| Layer | What it is | Visibility |
|---|---|---|
| **annotation** | a mark (point/rectangle/lasso) that anchors a **comment** | mark's label always visible; region outline **on hover**; thread **on click** |
| **ink** | pen strokes (size/colour, SVG, whole-stroke erase) | always visible |
| **media annotations** (audio/video) | timeline/region marks inside the **expanded** audio/video view | inside that view only |

### E.6 Data implications (for §7 backend)
- `comments.mark` gains `{lasso: path}` and keeps `{point}`/`{box→rect}`; the
  point renders as a labelled tail, not a bare pin.
- New `ink` table (or `annotations` repurposed): `canvas_id, work_id, author_id,
  color, size, path jsonb` — one row per stroke (whole-stroke erase = delete row).
- Audio/video **media annotations** are their own rows keyed to the work +
  timecode/region, separate from canvas `comments`.
- Duplicate = insert a new `works`/`canvas_items` row (for audio-trim, a derived
  clip); no clipboard.
- Screencap is **client-side** (canvas/`<video>` frame grab → Clipboard API); no
  backend.

---

## §D.5 UI refinements (2026-08-17c)

Smaller corrections from the gallery review — all fold into §C when it's filled:

- **Upload — split Tags and Credits into two fields.** Credits is a
  **type-ahead chip input**: start typing a handle → it autocompletes members →
  **space/Enter** commits them as a **chip in their member colour**. Not a
  free-text line.
- **Channel rename lives in Server settings → Channels**, not a standalone
  prompt modal. (The generic single-field prompt still exists for new folder /
  new label / etc.)
- **New message is not a modal** — the add-by-handle field is **integrated into
  the Messages (DMs) screen** itself (inline at the top of the thread list),
  not a popped dialog.
- **Member popout uses a SQUARE profile image** (the large avatar). Round stays
  for small inline avatars and presence dots; the popout's hero image is square.
- **The details pane never opens inside the canvas** (see §E) — a canvas tile's
  expanded state is the audio/video expanded view, not the details pane.
