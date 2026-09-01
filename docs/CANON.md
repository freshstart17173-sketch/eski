# eski collab — the canonical model

**Status: planning. The single source of truth for the code-generation hand-off.**
Where the mockup ([`design/gallery.html`](design/gallery.html)) is the picture
and the `eski-style` skill is the tokens, this file is the *contract and the plan*: one
vocabulary, one permission model, one registry of every functional UI element
(behaviour → database → responsive layout), **and the backend it all runs
against** (schema, RPCs, Realtime, migration order). When a codegen prompt and
this file disagree, this file wins. The build itself is sliced into
individually-testable prompts in [`CODEGEN.md`](CODEGEN.md). Cross-context state
hazards (data that carries/strands/orphans when a work moves between the social,
work, and messaging contexts) were audited separately; that audit is resolved and
its decisions are folded into this file (chiefly §D).

Seven parts:
- **§A Terminology** — the canonical word for every concept, its database
  backing, and the aliases we kill so two prompts never name one thing twice.
- **§B Roles & permissions** — who can do what, mapped to the RLS policy or RPC
  that actually enforces it (the fence, not the signpost).
- **§C UI element registry** — every functional element per screen: what it
  does, where it sits in the database, its states, and desktop vs mobile.
- **§D Added scope** — granular roles, dynamic-slider storage, the placement
  model, and the utility/admin surfaces layered on after the first pass.
- **§E Backend & data model** — the hand-off-ready plan: tables + RLS, key
  columns, RPCs/triggers, Realtime, edge functions, build-vs-buy, indexes, the
  migration order, a per-screen backend checklist (§E.9), and a **per-control
  backend coverage matrix (§E.10)** mapping every clickable to the table/RPC that
  persists it. (This is where the retired COLLAB backend doc was folded in; CODEGEN
  and the prompts cite it as §E.x.)
- **§F End-to-end workflows** — two real collaborations traced through the
  product to confirm the pieces connect.
- **§G Open owner decisions** — the genuine build-vs-buy / policy calls still
  waiting on a human.

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

Kill: "room" as an entity noun (a voice channel is a voice channel). ("Feed" for
a channel was killed for the same reason the Feed screen itself was cut for beta,
2026-09-01, §A.4 — there's no "friends-only portfolio" screen for the word to
collide with any more, but the naming rule still holds if it ever returns.)

### A.4 The uploaded thing — `work`

The single most-renamed concept in the spec. One entity, one **intentional**
context-split:

| Canonical | Context | DB |
|---|---|---|
| **work** | The data entity. Use in schema, RLS, RPCs, these docs. | `works` (+ `work_items` for a multi-item work) |
| **post** | A `work` seen in a **public** context — a public profile shelf (the Feed aggregator is cut for beta, 2026-09-01, §A.4 above). Has a title. | same row, `visibility='public'` |
| **file** | A `work` seen in a **server/personal** context — a channel, the File explorer. Leads with its **file name**. | same row, `visibility in (server,personal)` |

> **LOCKED:** the post/file split is kept (F9). Kimi prompts say **post** on
> public Profile shelves, **file** in every server/personal context (a
> channel, the File explorer, the Upload sheet in server mode).

Sub-terms (not renamed, pinned for clarity):

| Canonical | Means | DB |
|---|---|---|
| **collaborators** | **CUT from the beta (2026-08-22)** — the collaborators/contributors field is removed from the UI for now (the are.na-monochrome restyle drops it; it may return post-beta). The vocab + schema below stay for when it does; **no collaborator chip renders in the beta** (details pane, upload sheet, cards). The people credited on a work — each a **chip** (a real `@handle` + an optional freeform role like "prod"/"mix"), in that member's server colour. Reads for artists *and* social ("with @rae"). **Consent-gated** (below). Renamed from **credits** (2026-08-19). | `work_collaborators(work_id, user_id, role, status)` |
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

> **Cut for beta (2026-08-30, P4):** **public-post commenting is removed** — the
> **comment thread** on a post (Details pane) and the inline comment thread in the
> Explorer **Feed** view are gone. The **post itself stays** (a public work, reached
> from a user's profile Public shelf). The `comments` table,
> the `post_comment` RPC, and the comment→notification trigger **stay in the schema,
> dormant**, for a post-beta return (TODO **D1**). Below, rows that describe a comment
> thread are marked **(commenting cut — D1)**; their schema lines stay as the dormant
> contract.

> **Cut for beta (2026-09-01):** **the Feed screen is removed** — the friends-only
> aggregated grid of public posts (old Screen 2, §C.5) is gone: no rail entry, no
> `/` route (`/` now redirects to the personal File explorer, the app's default
> surface). This is a Feed **aggregator** cut, not a visibility cut — `visibility=
> 'public'` and the **post** context-split (§A.4) are untouched; a public work is
> still reachable from its owner's profile **Public** shelf and by direct link,
> exactly as §B.3/§B.4 already specify. Old Screen 2 / §C.5 is retired (left as a
> gap, same convention as §A.5/§A.6) rather than renumbered. The `friend` relationship
> (§A.7) keeps its DM role; "surfaces their public posts in your Feed" is dormant
> along with the screen that read it — **not** a change to friendship's other
> effects (POV-gated profile access, etc). **Servers are a separate, non-cut
> decision, §C.2:** dimmed in the rail "for now" while the build's focus is the
> File explorer (personal + server) — fully functional, not a scope cut, and not
> reflected as a screen/vocab change here.

### A.7 People & relationships

| Canonical | Means | DB |
|---|---|---|
| **profile** | A person's account: name, handle, bio, shelves, status. | `profiles` |
| **handle** | The unique `@username`. The only way to find someone (no directory). | `profiles.handle` |
| **member** | A profile inside a specific server. Carries a server colour and a role. | `server_members` |
| **friend** | The **only** relationship. Mutual (pending → accepted), added by exact handle. Enables **DMs**; ~~surfaces their public posts in your Feed~~ is dormant with the Feed screen (cut 2026-09-01, above) — a friend's public posts are still reachable via their profile Public shelf, just not aggregated anywhere. | `friendships` |
| **DM** | A direct conversation (1:1 or group DM). | `dm_channels` / `dm_members` / `dm_messages` |
| **message** | A unit of chat, in a channel **or** a DM. | `messages` / `dm_messages` |

> **LOCKED:** one relationship — **friend** (mutual). The one-way `follows`
> table is **dropped** — there is no `follows` in the §E schema; the Feed query
> scopes to `friendships` where `status='accepted'`. No asymmetric "follow a
> portfolio" path in v1.

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
bylines, the Members rail, and collaborator chips. Never on a public profile.

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
`gallery.html` for sign-off, then recorded in the `eski-style` skill (tokens).

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
  visibility = 'public'                              -- portfolio (profile Public shelf)
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
- ~~Feed shows only `public` works by your friends~~ — dormant; the Feed screen
  is cut for beta (2026-09-01, §A.4). A `public` work is still only reachable
  through its owner's profile Public shelf or a direct link (below); Server and
  Private never leak into either.
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
| ~~See someone's public posts in your Feed~~ | **Dormant — the Feed screen is cut for beta** (2026-09-01, §A.4); a public work is reachable via its owner's profile Public shelf regardless of friendship. | `friendships.status='accepted'` |
| Open a DM with a handle | friendship `accepted` | `friendships`, `create_dm` *(rpc)* |
| Add by handle | exact `@handle` match only; no search, no suggestions | `add_friend(handle)` *(rpc)* |
| Respond to a request | accept / ignore | `respond_friend(user, accept)` *(rpc)* |
| Block | hides both directions, revokes DM (~~+ feed~~, dormant — §A.4) | `friendships.status='blocked'` |

**Public posts are still public** (anyone with the link / OG crawler sees a
`public` work). Friendship gates *DMs* (the Feed surface it used to also gate
is dormant, §A.4), not the raw readability of a public work.

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
chip, Role chip, Reaction pill, Avatar, Visibility marker, Card, Menu)
are the ones in the [`eski-style`](../.claude/skills/eski-style/SKILL.md) skill — the registry
references them, it doesn't redraw them.

### C.2 Global responsive contract (applies to every screen)

> **Beta is web-only (2026-08-22).** The beta ships the desktop web app with a
> sensible **scaling** range only — mobile is **deferred post-beta**. The scaling
> contract: **the live app fills the viewport at any monitor width** (owner call
> 2026-08-22 — 1440 is a *prototyping* measure, not a live cap); the three-pane
> shell flexes and holds down to a **~1024px** minimum (it flexes, it does **not**
> collapse to tabs); modals sized to the canvas. **The 1440px canvas is a
> prototyping aid only**, applied in the gallery when a width is pinned (`&w=NN`) so
> [`verify.mjs`](design/verify.mjs) can shoot the shell at a fixed measure; with no
> pinned width the app spans the whole window. The mobile spec below is **retained
> but dormant** — it's the contract the eventual mobile gallery will follow, not a
> beta deliverable.

**Mobile (post-beta) ships as a separate gallery.** [`gallery.html`](design/gallery.html)
is the **desktop** artboard set (the 1440px canvas) and carries no mobile chrome;
the mobile layouts are a distinct deliverable — their own gallery — built against
the contract below. This table is the spec that separate mobile gallery follows.

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

The four-pane shell **fills the live viewport** at any width (owner call
2026-08-22): the main pane takes the reclaimed space while the rail/columns keep
their fixed widths. **1440px is only the prototyping canvas** — the measure the
gallery pins (`&w=1440`) and the built pages are *designed* against, not a cap the
live app imposes. Dialogs, modals and menus stay sized against that design canvas
(so a scrim-backed modal reads consistently), while the shell itself spans the
window. Below ~1024px the panes flex down to the breakpoints, and mobile collapses
to one pane per C.2.

Breakpoints (to confirm against the `eski-style` skill): **≥1100px** full four-pane ·
**720–1099px** collapse members rail to an icon · **<720px** single-pane +
bottom tabs. Every element row below only notes mobile behaviour where it
differs from this contract.

### C.3 Screen manifest — build order follows §7.8

Registry column points at the section that specifies each surface. **Canvas (old
Screen 5) and Board (old Screen 6) are cut from the beta** — their rows, §C.8/§C.9
sections and §E mechanics are removed; those screen numbers are retired (left as a
gap) rather than renumbered. **Feed (old Screen 2) is cut for beta too (2026-09-01,
§A.4)** — same convention, its row and §C.5 section are removed and the number is
retired as a gap; `/` now routes straight to the File explorer (§C.6). Screen 7
(Call) remains a v2 deferral.

| # | Screen | `data-screen` | Sub-states already mocked | Registry |
|---|---|---|---|---|
| 1 | Workspace | `workspace` | chat / pins / files (`chtab`), thread view | §C.4 (template) |
| 3 | File explorer | `explorer` | files / folders | §C.6 |
| 4 | Details pane | *(overlay)* | per-context comments | §C.7 |
| 7 | Call | `vc` | chat / notes (`vctab`) | **v2 — deferred, not built** |
| 8 | Profile | `profile` | Public / Server / Private shelves, Settings | §C.10 |
| 9 | Messages (DMs) | `dms` | thread list, conversation, new-DM picker | §C.11 |
| 9b | Friends | `friends` | all / pending / blocked, add-by-handle | §C.11 |
| 10 | Upload | *(sheet)* | file upload | §C.12 |
| 11 | Server settings | `settings` | general/channels/members/roles/invites/moderation/audit/storage | §C.4–C.13 + C.16, C.19 |
| 12 | **User settings** | `usersettings` | profile · account · notifications · appearance · privacy & safety · storage (gallery #22) — distinct from *server* settings; opens from the profile Settings tab / avatar menu | §C.10 |
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
| + | Shared view | `shared` | read-only single item a share link opens to (gallery #40) | §C.7 (Share dialog) |
| + | New server (first-run) | `newserver` | empty channel column + setup checklist | §C.4 (empty states) |
| + | Create-channel · Invite-to-server · Forward | *(modals)* | from the server menu / message ⋯ | §C.4 |
| + | Server menu · notification-bell dropdown | *(menus)* | server-header dropdown; bell preview | §C.4, §C.13 |

**Navigation & back-path contract (every surface has a way in AND a way back).**
The **rail** is the always-present lateral switch for the top-level contexts —
Messages, **My files** (personal Drive, now `/`'s destination too — Feed is cut,
§A.4), each server (**dimmed "for now," §A.4 above — not cut, just not this
build's focus; still fully clickable**), Create, and Profile — so those never
dead-end. Sub-surfaces reached *from* a screen carry an explicit path back to
their parent:

- **File explorer (server)** mounts **inside the workspace shell**: the server
  channel column stays beside the browser and **Files is an entry in it, highlighted
  like any channel** (owner 2026-08-22). Any channel/voice row in that column
  switches straight to the workspace — so the file browser is never a place you get
  stranded. (The **personal** My-files mount hides that column; its rail button and
  its own tree are the navigation.)
- **Server settings** → a **Back to server** item at the top of the setnav (→
  workspace); reached from the server menu.
- **User settings** → a **Back to profile** item at the top of the setnav (→
  profile); reached from the profile Settings tab / avatar menu.
- **Call (`vc`)** → the **Leave** control returns to the workspace.
- **Focus surfaces with no rail** (auth, create, join, dead-invite, access-denied,
  404) each carry their own exit: create/join a **Cancel**, the state cards a
  **home / back-to-server / go-to-feed** button. Blocked/pending carry a **Back**.
- **Shared view** is the one deliberately standalone page (a share link opened by an
  outsider): its exit is sign-in / the wordmark, not in-app nav.

### C.4 TEMPLATE — Screen 1: Workspace

The three-pane server view. Legend: **R**=reads, **W**=writes, **RT**=Realtime.

#### Server rail (far left, 58px)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| ~~Home button~~ | **Cut with Feed (2026-09-01, §A.4)** — the logo at the top of the rail is a plain wordmark now, not a nav control (My files, right below it, is the equivalent destination and already carries the active state for "/"). | — | Top of rail | Bottom tab "Home" |
| Messages button | Go to DMs. Badge = unread DM count. | R `dm_members.last_read_at` vs `dm_messages` | Rail | Bottom tab "Messages" |
| Server badge (one per server) | Open that server's Workspace. States: default / hover (tooltip = server name) / active (ink) / **unread dot** / **mention count**. | R `servers` (membership); RT `channel_reads` | Vertical list | Horizontal strip in "Servers" tab |
| ＋ (create / join / add friend) | Menu → Create server · Join by link · Add friend. | opens `create` / `join` / `add_friend` | Below servers | In "Servers" tab header |
| Own avatar | Menu → Profile · status · settings · sign out. Shows presence ring. | R `profiles`; RT presence | Foot of rail | "You" tab |

#### Channel column (232px)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Server header | The server's **cover banner + square server icon + name** at the top of the channel column — its art gets real presence, not just the 38px rail badge (gallery #34). Tap → **server-menu dropdown** (gallery B1): Invite people · Create channel · Create category · Server settings · Notification settings · Edit server profile · **Leave server** (danger). Admin-only rows (Create channel/category, Server settings) gate on perms; every user sees Invite / Notification settings / Leave. | R `servers` (`cover_key`, icon); gate `is_server_admin` / `manage_channels`; opens the create-channel & invite modals | Column top dropdown (`.menu`) | Drawer top → sheet |
| Media entry | Open the File explorer. | R `works where server_id` | Fixed row | In left drawer |
| Channel list (text) | Each: name, unread bold, mention badge. Click → load channel. **Right-click → channel menu** (gallery B4): Mark as read (B8) · Copy link · Invite people · **Notification level** (All / Only @mentions / Nothing, `channel_prefs`) · Mute for a while · and, **for admins** (`manage_channels`), **Edit channel** (B5) + **Delete**. Admins also get a per-row **edit gear** on hover and a drag-handle to reorder. | R `channels kind='text'`, `channel_reads`, `channel_prefs`; W `set_notif_level`, `mark_channel_read`, `is_server_admin` reorder | Grouped list; menu on right-click, gear on hover | Left drawer; long-press menu |
| **Category label** (channel group) | A collapsible group header (gallery B3/B7): a **caret** toggles the group's channels open/closed; admin sees the section `+`. Categories come from **Create category** (server menu / gallery B3). | R/W `channel_categories`; collapse is client state | Caret + label | Drawer |
| Voice channels | Listed by `kind`. Voice = **disabled/hidden in v1**. | R `channels` | Section | Left drawer |
| ＋ add channel (admin) | The section `+` (shown to admins, `manage_channels`) opens the **Create-channel modal** (gallery S2): name · **Text/Voice** kind · category · **default save folder** (§D.3) · **allowed file-types** (a `kind` allow-list) · private toggle. Hidden for members. | W `channels` insert (+ `default_folder_id`, allowed-kinds), admin | Per-section `+` → modal | Drawer |

#### Main — chat pane

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Channel header | Name, topic, tabs **Messages / Pins / Files** (`chtab`), voice/video, **notification bell**, search, members icon. The bell opens a **dropdown preview** (gallery B15): recent notifications + **Mark all read**, with **See all** falling through to the full Notifications screen (§C.13) — the bell no longer jumps straight there. | R `channels`, `message_pins`, `works`, `notifications`; W mark-read | Sticky top | Sticky; members icon → sheet |
| Message list | Reverse-chron, grouped by author; byline in member colour. States: loading / empty / new-message divider. Live insert/edit/delete. | R `messages` (+`member_of`); **RT** `channel:{id}` | Scroll region | Full-screen scroll |
| Message row | Body (markdown via `marked`), edited tag, reactions. **Hover** → reaction / reply-in-thread / ⋯ menu (edit/delete own, pin, copy link, **Forward**). Forward opens the **Forward modal** (gallery S5): pick target channels/DMs (multi) + optional note → writes a `placement` onto each target (§D.3). | R `messages`, `message_reactions`; W `toggle_reaction`, `pin_message`, forward → `placement` insert | Hover actions | **Long-press** actions |
| Forwarded message | A message re-placed by a forward renders a **quote block** above the (optional) note: source **author + channel + snippet**, click → jump to the source. Read/re-share bounded by the source's visibility (§D.3 — forwarding a server file to a non-member forks a personal copy, never a live cross-server grant). | R the source via `placement` (opt. `forwarded_from`) | Quote block + note | Same |
| Shared file card | A work rendered inline, **leading with file name**. Click → Details pane. **Several files in one post clump** into a compact grid of file chips (Discord-style, with "+N more"), not N separate cards (gallery #25). | R `works` | Inline card / clump grid | Inline card |
| Thread indicator | "N replies" → opens thread view (`parent_id`). | R `messages where parent_id` | Right-side thread panel | Full-screen push |
| Composer | Textarea + formatting toolbar (insert markdown), emoji picker (emoji-mart), @mention & #channel autocomplete, file attach, send. States: empty / typing (RT broadcast) / slowmode / timed-out (disabled + notice). | W `messages` insert (rate-limited); RT `:typing`; R members for autocomplete | Docked bottom | Docked; toolbar in a "＋" sheet |
| Pins tab | List of pinned messages; unpin (member) / unpin-any (admin). | R `message_pins`; W `unpin_message` | Tab content | Tab content |
| Files tab | Works shared in this channel, as cards. | R `works where channel` | Grid | Grid |

#### Members rail (210px)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Admins / Members sections | Grouped by role; name in member colour, presence dot, "working on" line. | R `server_members` (+`profiles`); **RT** presence `server:{id}` | Right strip | Off-screen → members sheet |
| Member row | Click → **profile popover**: mutual servers, role, status, **Message** + **Add friend**. For an admin viewer the popover grows a gated **Admin block** (gallery B9): **Roles ▸ · Timeout · Kick · Ban** (last two danger) — shown when `is_server_admin`, the RLS/perm gate, not a UI toggle. | R `profiles`, `friendships`; W `add_friend`, `create_dm`, moderation RPCs (`set_member_roles`, `timeout_member`, `kick_member`, `ban_member`) | Hover/click popover | Long-press popover |
| **Timeout modal** | The duration+reason surface behind **Timeout** (member popover) and Server settings → Moderation → **Time out**: a **duration** segmented control (5m / 1h / 1d / 1w) + a **reason** (saved to the audit log, shown to the member). They stay in the server but can't post/react/join voice until it lifts. | W `timeout_member(user, until, reason)` → `server_members.timeout_until` + `audit_log`; gated `is_server_admin` | Modal on scrim | Sheet |
| **Kick / Ban confirm** | The danger confirm behind **Kick** and **Ban** (member popover, Moderation). Kick removes the member (they can rejoin on a fresh invite); **Ban** also blocks the account from rejoining on any link. Reason (→ audit log); **Ban** adds an optional **also delete their posts** (the `delete_user_works` bulk action, gallery #59). The owner can't be kicked or banned. | W `kick_member` / `ban_member(+reason)` → `server_bans` + `audit_log`; optional `delete_user_works`; gated `is_server_admin` | Modal on scrim | Sheet |
| Presence dot | online / idle / dnd / offline; "working on {doing}". | RT presence | Inline | In sheet |

**Workspace empty/edge states to build:** **new server / first-run** (gallery
S8) — the just-created, empty server renders the workspace shell with an empty
channel column (Files + a starter `general`) and a **3-step setup checklist** in
the main pane: *create your channels · invite your crew · upload your first
files* (each an action row → the create-channel modal / invite modal / upload
sheet); channel with zero messages, member with no presence, timed-out composer,
network-lost (Realtime reconnecting banner).

**Voice is a WIP signpost, not a feature (v2).** Until calls ship, every voice
surface reads as under-construction: the **call / video buttons** (workspace
header, DM header, friends rows) are **grayed** and, when pressed, raise a
"currently being built" toast; a persistent **voice minibar** (gallery S15) sits
at the foot of the channel column ("Voice connected · {channel}" + mic/leave,
grayed, with the build note); and the **voice-chat screen** (`vc`) is **not a mock
call** — its whole interface is replaced by a **placeholder**: a
transparency-checkerboard grey field with a centred icon and the *"This feature is
currently being built"* message front and centre. The control bar stays (it toasts
WIP on press). Nothing here connects — WebRTC and the real call UI land in v2.

**Workspace modals (scrim-backed, sized to the 1440px canvas per C.2):**

| Modal | Opened from | Fields / actions | DB |
|---|---|---|---|
| **Create channel** (gallery S2) | server menu · channel-section `+` (admin) | name · **Text/Voice** kind · category · **default save folder** · **allowed file-types** (kind allow-list) · private toggle · **Create** | W `channels` (+ `default_folder_id`, allowed-kinds); gate `manage_channels` |
| **Invite to server** (gallery S3) | server menu · member rail | an **invite link** + copy · expiry / max-uses · **invite by @handle** | R/W `server_invites`; gate create-invite perm |
| **Forward** (gallery S5) | message ⋯ · card ⋯ | multi-select **target channels/DMs** · optional note · **Forward** → a `placement` per target | W `placement` (§D.3) |
| **Edit channel** (gallery B5) | channel menu · per-channel gear (admin) | name · topic · slowmode · **Save** | W `channels` (rename/topic/slowmode); gate `manage_channels` |
| **Create category** (gallery B3) | server menu · channel column (admin) | category name · **Create** | W `channel_categories` insert; gate `manage_channels` |
| **Report** (gallery S6/B13) | details-pane flag · message ⋯ · profile/DM | reason (incl. CSAM) · optional details · **Submit** | W `reports` (`file_report`) |
| **Assign roles** (§C.17) | member popover **Roles ▸** · Members-row role chip | checklist of roles (a member holds several); **@everyone** locked-on baseline · **Manage roles…** → §C.16 | W `member_roles` ← `set_member_roles`; gate `manage_roles` |
| **Leave server** (confirm) | server menu **Leave server** | named consequence — loses channel/file access unless re-invited; personal-storage copies stay. Danger **Leave**. Owner must transfer ownership first (§B). | self-leave `member_of` |
| **Delete server** (type-to-confirm) | Settings → General danger box · setnav **Delete server** | **owner only**; type the server name to enable **Delete forever**; removes every channel + its files (members keep personal-storage copies). | owner `delete_server` + `audit_log` |
| **Server notification settings** (gallery S7) | server menu **Notification settings** | per-server default **level** (All / @mentions / Nothing) · **Suppress @everyone/@here** · **Mute** (Off / 15m / 1h / 8h / 24h). Per-channel levels (channel menu) override this. | W `server_prefs` (level, muted_until, suppress_everyone) ← `set_notif_level('server',…)` |

The **Edit server profile** menu item is a shortcut into Settings → General (name /
description / **server icon** / cover), not a separate modal. The **server icon** is a
separate upload from the rectangular cover — it's the square rail/header badge
(`servers.icon`), offered in both Settings → General and the Create-server flow;
the cover is the wide banner (`servers.cover_key`). Timeout / Kick / Ban confirms are
registered on the members rail (§C.4 above).

---

(§C.5 — Screen 2, Feed, the friends-only portfolio grid — is **cut for beta**, 2026-09-01, §A.4.
Retired as a gap, same convention as §A.5/§A.6/old Screens 5–6, rather than renumbered.)

### C.6 Screen 3 — File explorer

**One explorer component, two mounts (gallery #60).** The **server** File
explorer and the **personal** My-files explorer are the *same* component — same
card renderer, same filters (search / type / tag / date / sort + the
quick-filter chips), same view toggles, same details pane, same context menu,
same loading/empty states. They differ in **one** parameter, the source: the
server explorer reads that server's works (`server_id`, `member_of`); the
personal explorer reads the signed-in user's own works (`owner_id`). Build it
once, parameterised by source — don't fork two browsers. (A **third** source —
the home **Feed**, friends' public posts — used to share this component too;
it's cut for beta, 2026-09-01, §A.4, so the app currently has the two mounts
above. `/` now routes to the personal mount, same as `/files`.) The view toggle
itself is **grid / list only** (owner 2026-08-31 — the old three-way grid/list/
feed toggle's "feed" mode, a flattened previewable-only view with inline
comments, was folded away; grid/list migrate old links).

**Files is a channel, not a standalone server (owner 2026-08-22).** The server
explorer mounts **inside the workspace shell**: the server's **channel column stays**
to the left of the browser, with **Files as a highlighted entry in it** alongside the
text/voice channels — so switching from the file browser to any other channel is one
click, and the browser is never a dead-end. Layout, left→right: rail · channel column
(Files active) · folder tree · contents pane. The **personal** mount (My files, a
rail button) hides the channel column — its own folder tree is the navigation, and it
carries no server chrome (its footer reads *Your storage*, and the channel/uploader
filters drop away since personal files have neither).

The server's files as a **Discord-meets-Google-Drive file system**: a **nested
folder tree** beside the channel column, the current folder's contents in the main
pane, and a **density slider** (owner 2026-08-31/2026-09-01) spanning **List →
dense grid → large thumbnails** — position 0 is the List table, 1–5 are grid
thumbnail-size stages; it replaces the old three-way grid/list/feed toggle (the
**feed** mode — a flattened, previewable-only, comments-inline view — was folded
away the same pass; old `?view=` links with `grid`/`feed`/`small` migrate to the
large-grid default). Grid and list show subfolders + files of the **current**
folder only.

**Selection & open (Google-Drive model, owner 2026-08-22).** There is **no Select
mode button**: a **single click selects** a card (deselecting the rest) and highlights
it; **⌘/Ctrl-click** toggles, **Shift-click** ranges, **⌘/Ctrl-A** selects all,
**Esc** clears, and a **drag on empty space marquees** (build tiny or buy `viselect`,
§E.6); dragging a card is move-to-folder. The browser's native "no-drop"
cursor must **never** show during a normal drag over the pane (owner 2026-09-01:
it read as "illegal action") — `preventDefault()` fires for the WHOLE drag
gesture, not only while over a valid target; the drop-target highlight/pill
stays reserved for an actually-valid target. A **double-click (or Enter) opens** the file.
**Opening always uses the Details pane** (§C.7) — the media viewer + info rail; the
old bare "lightbox / uploaded view" is retired. The **Sort** control carries an
**ascending/descending** direction toggle beside it; Type/Channel/Uploader/Tag are
**multi-select** dropdowns, Date and Sort single.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| **Folder tree** | Collapsible nested tree of the server's folders (root → children); current folder highlighted; drag a file/folder onto a folder to move it; admin/perm can add/rename/delete a folder. | R `folders where server_id`; W `folders` · `move_to_folder` | Left rail | Drawer / breadcrumb sheet |
| **Storage footer** (Drive touch) | Pinned to the foot of the tree: "**This server's storage** — X of Y GB used" + a bar + a **manage** link to §C.19. Always visible so the server's file-storage state reads at a glance. | R `storage_meters`/`storage_balance('server',id)` | Tree foot | Drawer foot |
| **Breadcrumb** | The path to the current folder (`LP / beats / drums`); each segment navigates. | derived from `folders.parent_id` | Toolbar | Toolbar |
| **Density slider** | List → 5 grid stages (large default); replaces the old Grid/List/Feed toggle (feed mode cut, above). | — (client, `?view=`) | Toolbar | Toolbar |
| **Sort / Group dropdowns** | Sort: Newest/Oldest/Name/Size/Type/Uploader + an asc/desc direction toggle. Group: none/Kind/File type/Uploader/Date added, bucketing the current (filtered/searched) view into labelled sections — **grid AND list both carry Group** (owner 2026-09-01: list previously had neither). A section header is a **caret to collapse/expand** it and, click-to-**select every item in the group** (Ctrl/Cmd-click adds to the existing selection) — Windows-Explorer style. | R `works` filters/client sort | Toolbar | Toolbar |
| Search field | Search this server's files (whole tree, not just the current folder). | R `works where server_id` FTS | Toolbar | Full-width |
| Filter dropdowns (Channel / Type / Uploader / **Tag** / **Date**) | Narrow the current view (gallery #33). | R `works` filters | Toolbar | Filter sheet |
| **Quick-filter chips** | A second row: **All / Images / Audio / Video / Projects / ★ Starred** kind-toggles, plus a **Show hidden** toggle that reveals untracked/hidden files (gallery #33; hidden-file model is #55). | R `works` filters · `works.kind` · `saved_items`/star · `works.hidden` | Toolbar row | Filter sheet |
| **Loading / empty states** | While a folder loads, a **skeleton grid** (`.skel` shimmer cards) stands in (gallery #49). An empty container shows a centred **empty state** — icon + title + subtext — e.g. **Trash is empty** ("kept 30 days, then removed"), empty folder, no starred, no results (gallery #50). Both are reusable patterns applied across every async/empty surface (feed, profile, member rail, DMs, search). | — (client) | Grid area | Grid area |
| **Trash view** (Trash smart-folder open) | A **retention notice** ("items are permanently deleted **30 days** after they're trashed", §D.2) + **Empty trash now**, over a list of trashed rows: name · who/when trashed · a **days-left countdown** that turns danger-red near expiry · hover **Restore** / **Delete forever** (gallery B19). Soft-delete only — nothing hard-deletes before 30 days except via *Delete forever* / *Empty now*; **Empty now** clears to the empty state above. Backed by `works.deleted_at` + the 30-day purge job + the trash writers in §E.3. | R trashed `works` (`deleted_at not null`); W `restore_work` · `purge_work` · `empty_trash` | List with row actions | List; actions in ⋯/long-press |
| Folder row / card | A subfolder in the current folder — stacked-icon cover + item count; click → descend. | R `folders` (children) | In grid/list with files | 2-col / row |
| File card / row | Grid and list share one card renderer. Leads with **file name**; uploader chip (server colour) + channel tag. First few **tags inline + a "+N" chip** (or, tag-free, a bare "+ tag" chip) that opens a tags popover **on hover or click** to see/add/remove all of them (owner 2026-09-01 — folders had this, P23; files now do too) — no separate "Properties" step. **Hover actions** (⋯) — single click **selects** (no checkbox, Google-Drive model, below). **Right-click / ⋯ → context menu** (gallery #19): Open · Star · Update visibility… (#61) · Save to my files · Download · Copy link · **Crosspost to server…** · Rename · Move to… · Hide from library (#55) · Delete — **or, if the right-clicked item is part of the active multi-selection, the same menu operates on the whole selection** (Download/Move to folder…/Delete) instead, the normal-file-browser replacement for a dedicated bulk-action bar (below). On touch the ⋯ / long-press stands in for right-click. | R `works` (in this folder via `placement.folder_id`); writes gated by role; tags via `addTag`/`removeTag` | Grid/List | 2-col / row |
| ~~Feed item~~ | **Cut with the Feed view (2026-08-31) and the Feed screen (2026-09-01).** | — | — | — |
| Selection status | **No bulk-action bar** (owner 2026-09-01 — the retired `.selbar` used to overlay and occlude the whole toolbar). A quiet status strip at the pane foot reads "N selected · X files, Y folders · size" at rest "N items"; bulk actions are the context-menu-on-a-selected-item behaviour above, plus Delete/⌘⌫ for trash. | — (client) | Pane foot | Pane foot |
| **Move-to-folder picker** | The destination surface behind **Move to…** (card ⋯), the bulk bar's **Move to folder**, and the details-pane location row: a **scrollable folder tree** of this server, one destination selected, **New folder** inline, **Move here**. A move re-places the file (`placement.folder_id`) — it changes **where the file lives, not who can see it**; **locked** folders (§C.6 archived/locked, gallery #58) are shown disabled and can't receive files. | W `move_to_folder(work, folder)` → `placement.folder_id`; gated by folder write-perm | Modal on scrim | Sheet |
| Lightbox | Full media viewer + "shared in" strip. | R `works` | Overlay | Full-screen |

### C.7 Screen 4 — Details pane

Opens from any card (double-click in the File explorer; single-click elsewhere).
**This is the one media viewer for every file kind** — image fills the well, video/
audio get the centred borderless play + transport, non-previewable shows the type
card; there is no separate lightbox. **Arena layout (2026-08-18):** a near-full-screen
split over a scrim — the **media takes the room** (left, grows to fill), a **fixed
~380px info rail** on the right. No drop shadow (scrim separates). Bigger than a modal
on purpose: the media is the point. **Closes on ✕, on Esc, and on a click of the dimmed
backdrop** (like any modal, owner 2026-08-22).

**Post vs server file — the load-bearing distinction (2026-08-18b).** The *same*
arena shell serves two things; what differs is the discussion surface and which
storage the bytes draw:

- **Post** — a **public** work on a profile (the Feed it also used to reach is
  cut for beta, §A.4). Draws the owner's **personal
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
| Media area | Fills the left; **one transport (audio = video) pinned to its foot** (seek, volume, tabular time, a **playback-speed control**, a **video quality menu**, fullscreen — gallery #24); **big centred borderless play** over the media; **no visible skip buttons — 5-second skip on ←/→** (gallery #37/#38/#32/#11). Audio → **music-icon type card** (no waveform, gallery #52); video/image/type-card/folder-preview per kind. | R `works` (signed URL) | Left, grows | Top ~42vh |
| **Prev / next arrows** | A single work (post or file) has **no arrows *over the media***, but **does** get prev/next **in the rail top bar**, next to the report flag — move between adjacent items on the same level (gallery #10); on a folder the top-bar arrow just steps to the next item, it doesn't descend. A **folder** is additionally the one pane with prev/next **over the media** (page its items) plus a clickable **navigation list in the rail**. | `folders` / `placement` sibling order | Top-bar arrows (all) + folder media edges + rail list | Same |
| **Size row** | A plain **file-size** row in the metadata (e.g. "8.4 MB"). The old "leads-the-metadata storage row" — the storage×visibility badge **and** the "N MB on *whose* storage" sentence — is **removed** (gallery #2/#3): the Location breadcrumb already shows where the root is, so the badge and the whose-storage prose were redundant. | `works.bytes` | Rail meta | Rail meta |
| **Location** (clickable breadcrumb) | Where the file lives in the tree: **`Server › folder › subfolder`** (server files, from `placement.folder_id`) or **`Your files › folder`** (posts). **Each segment is a link** that opens the File explorer at that folder — quick travel up the tree. | `folders` path via `placement.folder_id` | Rail meta | Rail meta |
| Metadata (rest) | Per kind: uploaded/posted-by, **posted-in #channel** (server file only — files aren't tied to channels, but a server-*posted* file carries its posting context; a file uploaded straight to the File explorer omits this row, gallery #4), **uploaded** date, **modified** date **+ by whom** (gallery #41), **size** (above), **length** (a/v), **dimensions/fps** (image/video), **format/codec/bit-depth**. Folder: location breadcrumb, made-by, created — **item count shows once**, on the Items list header, not also in the meta (gallery #6). | `works` cols | Rail | Rail |
| Report + close | Flag (report) and × sit in the rail's top bar. | `file_report` | Rail top bar | Rail top bar |
| ~~Storage×visibility badge~~ | **Removed (gallery #3).** The "Personal · Private / Personal · Public / Server" badge no longer renders in the details pane — visibility is set/seen via the Share dialog and the Location breadcrumb, not a metadata badge. Crosspost provenance stays **not shown**. | `works.owner_type` + `visibility` | — | — |
| Title / collaborators / tags | Title (or file name); collaborator chips (server colour); user tags + ＋. **Both** posts and server files have tags. | `works.title/collaborators` · `content_tags` | Rail | Rail |
| Actions | Download (get-as formats); **"Save to my files"** → menu into a personal folder, with a note that it **copies into your storage** (dedup-cheap, survives the server deleting theirs). **Folder** pane: **Save** and **Download** each offer **whole folder or just a selection** (gallery #17/#18); "Download all" is relabelled just **Download**. | transcode · `saved_items` (owner copy) | Rail foot | Rail foot |
| **Discussion** | **(commenting cut — D1, 2026-08-30)** — a post **no longer** carries a comment thread; the Details pane shows meta + tags only, for a post and a server file alike. (Server files always used channel chat for replies; posts now have no discussion surface until D1 restores it.) | *(dormant `comments`)* / channel chat (server files) | — | — |
| Mobile | Card goes full-screen, **column**: media on top (~42vh), the rail below. | — | — | Full-screen column |

**Share dialog (gallery #39 / #61).** A Google-Drive-style modal opened from a
card's ⋯ menu ("Update visibility…") or a Share action. It carries: the
**Visibility** three-way (Public / Server / Private — this *is* how a post's
visibility is changed after the fact, #61, now that the details badge is gone,
#3); a read-only **share link** + Copy; and a **People with access** list
(owner + members with per-person Can edit / Can view — the granular-role surface,
CANON §D.1). Writes gate on ownership / `manage_*`; the link resolves to the
read-only shared view.

**Shared view (`shared`, gallery #40).** What a share link resolves to for a
non-member: a **standalone read-only page** — the eski wordmark, "Shared by
{owner} · read-only", the single shared item (its preview or type card), minimal
metadata (shared-by, size, type, access level), tags, and **Save to my files /
Download**. Crucially it has **no rail and no explorer** — the viewer sees *only*
what was shared and cannot browse the rest of the server. A shared **folder**
shows its items read-only with no way to navigate out.

### C.10 Screen 8 — Profile

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Header | **Circular** avatar image (gallery #1 — every profile picture is round; round = avatars + presence dots only), name, @handle, bio; Add friend / Message (own profile → Edit). | `profiles` · `friendships` | Top | Top |
| Shelf tabs | **Public / Server / Private** (counts) + Settings; **search** button. | R `works` by visibility | Tab bar | Tab bar |
| **POV** (viewer-dependent) | The profile renders three ways **by who's viewing** — not an in-product toggle: **owner** (self — Edit profile; all three shelves + Settings), **public** (a stranger — Add friend; **only the Public shelf**, no Settings), **mutual** (a friend — Friends✓ + Message; the Public shelf **plus mutuals-only posts**). Enforced by `works_read` + `friendships.status`. The gallery shows the **owner self-view**; the other two are this rule, applied server-side. | R `works` (visibility + mutual gate) · `friendships` | Same, chrome varies | Same |
| Grid | Even square grid ⇄ masonry toggle; same card renderer. | `works` | Grid | 2-col |
| Settings tab | Name, handle, bio, avatar, theme, status, storage (owner). | `profiles` | Form | Form |
| **Edit-profile modal** (owner) | Opens from the **Edit profile** button on the owner self-view: **display name · handle · bio · avatar · banner**. The handle is globally unique — the same claim/validation as the auth claim-handle step (§C.14); changing it breaks old links to the profile. A quick in-place editor for identity fields; the full account surface (email, sessions, notifications, privacy, storage) is **user settings** (§C.3 row 12), not this. | W `profiles` (display_name, handle, bio, avatar, banner) | Modal on scrim | Sheet |

### C.11 Screen 9 — Messages (DMs)

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| **Add-by-handle field** | Inline at top of the thread list (**not a modal**); exact handle only. | `create_dm(handle)` · `friendships` | Left column | Full-screen list |
| **New message** (gallery B14) | A **New DM / group-DM picker** from the thread-list header: multi-select friends → start a 1:1 or group DM. Complements the inline add-by-handle for the common "pick from friends" case. | `create_dm(handle)` (1:1) · `create_group_dm(handles[])` (group) · R `friendships` | Header button → picker | Header → sheet |
| Friends / requests | Friends count + pending-request badge; opens the full **Friends** screen (below). | `friendships` | Left | List |
| Thread list | Pinned + DMs; unread dot, mute/pin. **Row menu** (gallery B12, ⋯ or right-click): Mark as read · Pin · Mute · **Block** / **Report** (B13) · **Close DM** — and for a **group DM**, Add people · Rename group · **Leave group**. | `dm_channels` · `dm_members` (`muted`/`pinned`); W `block_user`, `file_report`, group RPCs | Left | List; long-press menu |
| Conversation | Messages, composer (attach, send); header with (v2) call buttons + a ⋯ opening the same DM menu (mute/block/report; group → members modal). | `dm_messages` · RT | Main | Full-screen |
| **Group members modal** (gallery B12) | From a group DM's Add-people / Rename: group name, add-a-friend picker, member list with remove, and **Leave group**. | W `dm_members` (add/remove), group rename | Modal | Sheet |

**Screen 9b — Friends** (`friends`, gallery S4). A dedicated relationship
manager, distinct from the DM thread list.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Tabs | **All · Pending · Blocked** — the `friendships.status` values, counted. | R `friendships` by `status` | Tab bar | Tab bar |
| Add-friend field | Add by exact handle → sends a request. | W `add_friend(handle)` | Top | Top |
| Incoming / outgoing requests | *(Pending tab)* incoming rows **Accept / Decline** (`respond_friend(user, accept)`, true/false); outgoing rows **Cancel** (withdraw the pending `friendships` row). | W `respond_friend`; cancel = delete pending `friendships` | List | List |
| Friend row | *(All tab)* avatar, name, presence, "working on"; **Message** + a ⋯ (remove / block). | R `profiles` · RT presence; W `create_dm`, `block_user`, remove = delete accepted `friendships` | List | List |
| Blocked row | *(Blocked tab)* **Unblock** — clears the `blocked` status (the inverse of `block_user`). | W `friendships.status` (unblock) | List | List |
| Empty states | per tab — no friends / nothing pending / no one blocked (gallery #50). | — | Centered | Centered |

### C.12 Screen 10 — Upload

**Fast by default (2026-08-19).** The default upload is **one step** — drop → pick
visibility → **Post**. Title auto-fills the file name; **Tags and Collaborators are
collapsed behind an "Add details" disclosure**, so a social user sharing a meme never
sees an artist-shaped form, while a producer expands it and credits the room. Nothing
below the visibility row is required.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| **Entry point** | Opens from a real **Upload** button in the File-explorer toolbar (gallery #47) and from the composer's attach affordance — not a sheet that appears on its own. | — | Toolbar button | Toolbar / composer |
| Dropzone | Multi-file; type recognised (icon/filter), **not shown as a tag**. A **Files / Folder toggle** swaps the drop target — Folder keeps the folder structure (gallery #15). | `works.file_ext` | Modal | Sheet |
| Visibility | **Per post**: Public / Server / Private. **The one required choice.** | `works.visibility` | Segmented | Segmented |
| **Which server / folder** | When Server: pick the target server, and optionally the target **folder** in its tree (default = root). | `works.server_id` · `placement.folder_id` | Picker | Picker |
| **Storage-impact line** | Under the picker, a plain note of **which storage the bytes draw**, tightened copy (gallery #14): "**{server}** storage · X/Y GB" (Server) or "**Your** storage · X/Y GB" (Public/Private). Keeps "who pays" honest at the point of upload. | R `storage_meters` for the target account | Row | Row |
| **Post** | Commits immediately with just the above (title = file name). Closes the sheet and shows an **upload-progress** card, then a **success toast** in the bottom-right feedback stack (gallery #51). | write path (§D.3) | Primary button | Primary |
| **▸ Add details** (disclosure) | Reveals: Title (optional, file-name default) · **Tags** · **Collaborators** (type-ahead chip input → member chip in colour + optional role). Collapsed by default. | `works.title` · `content_tags` · `works.collaborators` | Disclosure | Disclosure |

### C.13 Screen 14 — Notifications

Reached either as the full screen **or** as the **bell dropdown** (gallery B15)
in the channel header (§C.4) — a compact recent-activity preview built from the
same rows, with **Mark all read** and a **See all** that opens this screen.

| Element | Behaviour & states | DB | Desktop | Mobile |
|---|---|---|---|---|
| Tabs | All / Mentions / Threads / Saved; grouped by day. | `notifications` | Tabs | Tabs |
| Row | Mention / comment / join / reaction; links to target; inline reply. | `notifications` · RT `user:{id}` | List | List |
| Mark all read | Clears unread. | `notifications.read_at` | Header | Header |
| **Bell dropdown** (preview) | Header bell (§C.4) → a right-aligned `.menu`: header + **Mark all read**, ~4 recent rows (unread dots), **See all notifications** → this screen. Not a second data source — a preview of the same `notifications` feed. | R `notifications` (recent) · W `read_at` | Dropdown under bell | Sheet |

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

The **upgrade UI** (gallery #44) is also reachable inline from the File-explorer
storage meter's **manage** link: a modal with the **usage bar** ("74 GB used of
120 GB") and the **dynamic GB slider** (rectangular handle, ticks, live price).
When an account is **over cap or lapsed**, the explorer shows a red **over-cap
banner** (gallery #46): "Files are **read-only** — nothing is deleted — until you
free space or upgrade" (matches §D.2 "read-only, never deleted"), with an Upgrade
button that opens the same modal.

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
| **Blocked** (gallery #23) | Viewing someone you blocked: "You blocked @handle — you won't see their messages, posts, or profile; they can't message/add you; **invisible to them**". Unblock CTA. | `friendships.status='blocked'` | Symmetric hide, one-sided visibility of the state. |
| **Pending** (gallery #23) | An outbound friend request not yet accepted: "Friend request pending — waiting for @handle". Cancel CTA. (Reused shape for other pending approvals, e.g. post-approval #57.) | `friendships.status='pending'` | — |

Screen 7 (Call) stays **v2 — deferred**, and the UI now **says so**: the voice/
video screen carries a **WIP banner** — "Preview — not in the beta. Voice & video
calls ship after the beta (v2). This screen is design-only" + a "WIP · v2" tag
(gallery #56) — so no one expects calls to connect in the beta. Registry rule
holds: every row names a real table/RPC/Realtime channel from §7 (or an explicit
"—").

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
created exactly the failures the cross-context audit surfaced (that audit is now
folded into this §D): a
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
   - **Personal · Public** — your storage, world (your profile's Public shelf; the
     Feed aggregator is cut for beta, §A.4). *A public post draws your personal
     quota* — the price of a portfolio.
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

Two cross-context audit resolutions land here:

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
**Historical — the Feed screen it was written against is cut for beta (2026-09-01, §A.4);**
read its "Feed" mentions below as dormant, kept for the decisions that still apply
(profile/explorer grid, non-previewable file types, folders).

### D.6.1 Feed / profile / explorer grid
- **Full-width.** The card grid fills the pane width (no narrow max-width column).
- **Square containers, invisible.** Each work sits in a **square cell** (aspect
  1:1) with **no background/border** — the media shows at its natural aspect
  inside; audio → **music-icon type card** (no waveform anywhere, gallery #52), video → play overlay, text → its words, image →
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
folder per server (`placement.folder_id`, default root). Kill the word
"collection". (Distinct from personal **save folders**, which stay. The explorer's
**feed** view — flattening the subtree to previewable media + comments — described
here is itself cut, 2026-08-31, §C.6; folded into the density slider's grid mode.)

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

---

## §E. Backend & data model (the build target)

The hand-off-ready backend plan — the tables, RPCs, Realtime channels, indexes,
and migration order the build runs against. [`CODEGEN.md`](CODEGEN.md) and the
[`prompts/`](prompts/) build queue cite it by section number (§E.2, §E.4, §E.6,
§E.8, §E.9), so its numbering is kept stable. *(This absorbed the now-removed
COLLAB backend doc's §7; old "§7.x" citations map one-to-one onto "§E.x".)*

The backend is a **true clean slate** — the schema is authored fresh for this
product (`create table if not exists`, in the migration order of §E.8). Every
table ships with RLS: **the policy is the fence, the UI is the signpost**. This
plan carries the §D architecture — granular roles, the placement model,
dynamic-slider storage, and collaborator consent — as its baseline.

### E.1 Tables
Each row: purpose · columns · RLS summary. `uid()` = `(select auth.uid())`.

**Servers, roles, and channels**

| Table | Purpose | Columns (beyond `id uuid pk default gen_random_uuid()`, `created_at`) | RLS |
|---|---|---|---|
| `servers` | a studio | `slug uniq, name, description, icon_key (the square rail/header icon), cover_key (the wide banner — distinct from the icon, gallery #34), hide_posts_by_default bool default false (admin auto-hide: new posts anywhere in this server start `hidden` in the File explorer library, gallery), owner_id→auth.users` | read: `member_of(id)`; write: `is_server_admin(id)`; **delete: owner only** |
| `server_members` | membership + colour + timeout | `server_id, user_id, color smallint, timeout_until timestamptz, joined_at, posts_require_approval bool default false (gallery #57), pk(server_id,user_id)` | read: `member_of(server_id)`; self-leave; admin manages |
| *(post-approval)* | a flagged member's posts are **held** | `works.approved_at timestamptz null` — when the poster's `posts_require_approval`, `approved_at` starts null and the work is **hidden from readers** until an admin's `approve_work(id)` sets it (gallery #57). Admin bulk moderation RPCs `delete_user_works(server,user)` / `archive_user_works(...)` / `export_user_works(...)` are `is_server_admin`-gated + `audit_log`ged (gallery #59). | read gate adds `approved_at is not null OR is own OR is_admin` |
| `roles` | permission roles (§D.1) | `server_id, name, color smallint, position int, permissions bigint (flag bitmask), is_default bool (@everyone), hide_posts_by_default bool default false (admin auto-hide, role-scoped: posts by any holder of this role start `hidden` in the library, gallery)` | read: `member_of(server_id)`; write: `has_perm(server_id,'manage_roles')` |
| `member_roles` | members ↔ roles (union of power) | `server_id, user_id, role_id, pk(server_id,user_id,role_id)` | read: member; write: `manage_roles` |
| `channel_roles` | v1 private-channel allow-list | `channel_id, role_id, pk(channel_id,role_id)` — zero rows = open to all members | read: member; write: `manage_channels` |
| `server_invites` | invite links | `code text pk, server_id, created_by, expires_at, max_uses int, uses int default 0` | read: admin; use via RPC |
| `channel_categories` | collapsible channel groups (gallery B3/B7) | `server_id, name, position int` — a channel's group; `channels.category_id` null = ungrouped | read: `member_of`; write: `manage_channels` |
| `channels` | rooms | `server_id, category_id null→channel_categories (gallery B3), name, kind in(text,voice), topic, slowmode_sec int default 0, position int, default_folder_id null→folders (gallery #53), allowed_kinds text[] null (null=any; e.g. {image,video} — gallery #54), post_policy in(everyone,admins) default everyone (the "Who can post" channel setting — an announcements channel is admins-only, gallery)` | read: `can_view_channel(id)`; write: `manage_channels`; **message/work insert rejected when `post_policy='admins'` and the poster lacks a post perm, and when a work's `kind` isn't in `allowed_kinds`** |

**Chat, DMs, and people**

| Table | Purpose | Columns | RLS |
|---|---|---|---|
| `messages` | persistent chat | `channel_id, user_id, body, parent_id→messages, also_to_channel bool, edited_at, deleted_at, body_tsv tsvector generated` | read: `can_view_channel`; insert: member & not timed-out; update/delete own (tombstone); delete-any: `delete_any_message` |
| `message_reactions` | emoji reactions | `message_id, user_id, emoji text, pk(message_id,user_id,emoji)` | read: member; add/remove own |
| `message_pins` | per-channel pins | `channel_id, message_id, pinned_by, pk(channel_id,message_id)` | read: member; pin: `pin_message`; unpin-any: admin |
| `channel_reads` | unread/mention state | `user_id, channel_id, last_read_at, pk(user_id,channel_id)` | owner only |
| `mentions` | @-index for badges | `message_id, mentioned_user, server_id` | read: mentioned user |
| `dm_channels` | 1:1 and group DMs | `is_group bool, name null` | member of it |
| `dm_members` | who's in a DM | `dm_channel_id, user_id, muted bool, pinned bool, hidden bool default false (Hide conversation / the reworked "close DM" — removes it from your list until the other party messages again; reversible, gallery), last_read_at, pk(...)` | self |
| `dm_message_reactions` | emoji reactions on DM messages | `dm_message_id, user_id, emoji text, pk(dm_message_id,user_id,emoji)` — mirrors `message_reactions`; **built with the DM message-actions work (deferred TODO: reply/react in DMs)** | member of the DM |
| `dm_messages` | DM chat | mirrors `messages` (dm_channel_id, user_id, body, parent_id, edited_at, deleted_at) | member of the DM |
| `friendships` | add-by-handle | `a_user, b_user, status in(pending,accepted,blocked), requested_by, pk(a_user,b_user)` ordered pair | either party |
| `profiles` | account (name, handle, bio, status, presence) | `handle uniq, name, bio, avatar_key, banner_key (the profile hero banner — distinct from the avatar, gallery Edit-profile), status_emoji, status_text, status_expires_at, presence_state, tz, pronouns, links jsonb` | read: public; write: self |
| `notifications` | the bell | `user_id, kind in(mention,comment,join,reaction,invite,friend), actor_id, server_id null, target_type, target_id, excerpt text, read_at` | owner only |
| `server_prefs` | per-server notification pref (gallery S7/B15) | `user_id, server_id, level in(all,mentions,none) default all, muted_until timestamptz null, suppress_everyone bool default false, pk(user_id,server_id)` — `suppress_everyone` drops @everyone/@here pings without silencing the whole server | self |
| `channel_prefs` | per-channel notification pref (gallery S7/B4/B7) | `user_id, channel_id, level in(all,mentions,none,default) default default, muted_until timestamptz null, pk(user_id,channel_id)` — `default` inherits the server pref; drives the channel-column "hide muted" toggle | self |

**Works, files, and storage**

| Table | Purpose | Columns | RLS |
|---|---|---|---|
| `works` | the uploaded thing | `owner_type in(user,server), owner_id, visibility in(public,personal,server), server_id null, title null, file_ext, kind, blob_sha→media_blobs, bytes, hidden bool default false (untracked/utility file — gallery #55), approved_at timestamptz null (gallery #57), deleted_at timestamptz null (soft-delete / Trash — gallery #42/B19), search_tsv tsvector generated` | `works_read` (§B.3): public, or own, or `visibility='server' & member_of`, or readable via any `placement`, or reachable through a valid (unexpired, unrevoked) `share_links` token. **Hidden works are omitted from the File-explorer library view** unless "Show hidden" is on (#55); they still work inline in chat. `hidden` is set per-work (the ⋯ "Hide from library"), or **automatically at insert by the admin auto-hide rule** — when the server's `hide_posts_by_default` is on or the poster holds a role with `hide_posts_by_default` (distinct from the `approved_at` *hold*). **Trashed works (`deleted_at not null`) are omitted from every view except the Trash smart-folder**, and are hard-deleted (blob refcount decremented) 30 days after `deleted_at`. |
| `work_items` | items of a multi-item work | `work_id, blob_sha, position` | inherits the work |
| `work_collaborators` | consent-gated collaborators (§D.3.1) | `work_id, user_id, role text null, status in(accepted,pending), pk(work_id,user_id)` | read: work-readers; write: owner + accepted collaborators; self-remove always |
| `content_tags` | user labels | `work_id, tag text` | read: work-readers; write: owner + accepted collaborators |
| `comments` | post-level threads | `work_id, user_id, context in(public), body, parent_id, resolved_at, deleted_at` | read: work-readers; write: friend-of-owner / `comment` |
| `placement` | one work → many surfaces (§D.3) | `work_id, surface in(feed,server,dm), surface_id, channel_id null, folder_id null→folders, placed_by` | read: those who can see the surface; write: `upload`; detach: owner or moderation |
| `folders` | nested server file tree | `server_id, parent_id null→folders (null=root), name, archived bool default false, locked bool default false (gallery #58)` | read: `member_of`; write: `manage_channels`/folder perm; **a `locked` folder is read-only** (no add/move/delete inside) without folder-manage perm; an `archived` folder is hidden from the main tree (shown dimmed / under an Archived view) |
| `media_blobs` | content-addressed dedup store | `sha256 pk, bytes, refcount` | server-managed; GC at refcount 0 |
| `storage_meters` | usage per account | `owner_type in(user,server), owner_id, bytes_used (sum of DISTINCT owned blobs), pk(owner_type,owner_id)` | read: the account's members/self |
| `storage_balance` | one slider per account | `owner_type, owner_id, purchased_gb, status, stripe_customer, pk(owner_type,owner_id)` | read/write: self / `manage_billing` |
| `invoices` | billing receipts (gallery S11) | `owner_type, owner_id, stripe_invoice_id, amount_cents, currency, status in(paid,open,void), hosted_url, created_at` | read: self / `manage_billing`; written by the Stripe webhook |
| `sessions` | signed-in devices / accounts (gallery B21) | `user_id, device text, ip_hint, last_seen_at, current bool` | owner only; the account switcher + "sign out everywhere" read/revoke these |
| `saved_items` | Save to my files (owner copy) | `user_id, work_id, folder_id null→save_folders, pk(user_id,work_id)` | owner only |
| `save_folders` | personal Drive folders (nested) | `user_id, parent_id null→save_folders (null=root; the personal My-files tree nests, gallery), name, pk(id)` | owner only |
| `starred_items` | ⭐ starred/favourite works — **distinct from Save** (Star = a personal bookmark flag for the Starred smart-folder; Save = an owner-copy in your storage; the card offers both, gallery #43) | `user_id, work_id, created_at, pk(user_id,work_id)` | owner only |
| `share_links` | "anyone with the link" share tokens (Share dialog / shared view, gallery #39/#40) | `token text pk, work_id, created_by, access in(view) default view, expires_at null, revoked_at null` — grants read of one work to a non-member via `/s/<token>`; the read policy honours a valid (unexpired, unrevoked) token; **beyond the 3 visibility layers** (public/server/private) so a private work can be link-shared without going public | read via the token RPC; write: owner / `manage` |

**Moderation**

| Table | Purpose | Columns | RLS |
|---|---|---|---|
| `server_bans` | bans | `server_id, user_id, banned_by, reason, until timestamptz null` | admin |
| `reports` | flagged content | `reporter_id, target_type, target_id, reason, created_at` | reporter writes; admin reads |
| `audit_log` | moderation trail | `server_id, actor_id, action, target_type, target_id, meta jsonb` | admin read; server-written |

The signer (`api/sign.mjs`) keeps its rate-limit machinery; it now checks the
paying account's remaining quota (`storage_meters` vs `storage_balance`) before
issuing a PUT.

### E.2 Key columns and enums (the load-bearing fields)
```
works.owner_type   text in(user,server)          -- which storage account owns + PAYS (§D.2)
works.owner_id     uuid                          -- that account
works.visibility   text in(public,personal,server) default 'public'  -- one enum, labels Public/Server/Private
works.server_id    uuid null                     -- the chosen server when visibility='server'
works.title        text null                     -- file name is the default title
works.file_ext     text                          -- icon + Type filter, never rendered as a tag
works.kind         text                          -- image/video/audio/text/other, drives the renderer
works.blob_sha     text → media_blobs            -- content-addressed; dedup counts unique blobs
works.bytes        bigint                         -- for the storage row / meter
works.deleted_at   timestamptz null              -- soft-delete / Trash; purged 30 days later (gallery #42/B19)
works.search_tsv   tsvector generated            -- title + tags + owner, for search
comments.context   text in(public)               -- post comments only; a server file discusses in its channel
comments.resolved_at timestamptz null            -- post comments resolve
profiles.status_emoji / status_text / status_expires_at  -- global custom status
profiles.presence_state text in(online,idle,dnd,invisible) default 'online'
profiles.tz text · profiles.pronouns text · profiles.links jsonb  -- shown on the member popout
```

### E.3 RPCs, triggers, functions (all `security definer`, `search_path=public`)
- **Gate helpers** every policy calls: `member_of(server_id)`,
  `is_server_admin(server_id)`, `has_perm(server_id, flag)`,
  `can_view_channel(channel_id)` (member_of AND no role-deny on `view_channel`),
  and `dm_member(dm_channel_id)`.
- `join_via_invite(code)`, validate code (exists, not expired, uses<max) → insert `server_members`, grant the `@everyone` role, assign the next free colour (cycles past the palette size), `uses+1`; returns the server. (Powers `/join/<code>`.)
- `set_member_roles(user, role_ids[])` / `set_channel_access(channel, role_ids[], member_ids[])`, the granular-role writers (§C.17/§C.18).
- `mark_channel_read(channel_id)`, upsert `channel_reads.last_read_at=now()`; `mark_server_read(server_id)` for "mark all as read" (gallery B8).
- `set_notif_level(scope in(server,channel), id, level, muted_until)`, upsert `server_prefs`/`channel_prefs` (gallery S7/B4/B7/B15).
- `set_channel_category(channel_id, category_id)` / category CRUD, the channel-group writers (gallery B3), gated `manage_channels`.
- `toggle_reaction(message_id, emoji)`; `pin_message` / `unpin_message`.
- `create_dm(handle)` / `create_group_dm(handles[])`, resolve handles→users (friendship required), find-or-create `dm_channels` + `dm_members`.
- `add_friend(handle)` / `respond_friend(user, accept)` / `block_user(user)`.
- `move_to_folder(work_id, folder_id)`, sets the file's `placement.folder_id`.
- `toggle_star(work_id)`, insert/delete `starred_items` (the card ⭐ + the Starred smart-folder, gallery #43).
- `duplicate_work(work_id, folder_id)`, the file **Copy** action (gallery #15): insert a new `works` row for the caller pointing at the **same `blob_sha`** (so `media_blobs.refcount++`, near-zero bytes via dedup), placed in `folder_id`; gated like upload.
- `save_to_files(work_id, folder_id)` / `unsave(work_id)`, write `saved_items` (an owner copy; Save-whole-folder loops the folder's items).
- `set_channel_post_policy(channel_id, policy)` and `reorder_channels(server_id, ordered_ids[])` / `reorder_categories(...)`, the channel-settings writers (drag-reorder + "Who can post"), gated `manage_channels`.
- `create_share_link(work_id, expires_at null)` → a `share_links` token + URL; `revoke_share_link(token)`; `resolve_share_link(token)` returns the work if the token is valid (Share dialog / shared view, gallery #39/#40).
- `hide_dm(dm_channel_id)`, set `dm_members.hidden=true` (the reworked close-DM); cleared when the other party sends or you reopen.
- `approve_work(work_id)`, admin sets `works.approved_at=now()` for a held post (`posts_require_approval`, gallery #57); `audit_log`ged.
- **Bulk selection ops** (the file-browser selection bar — Download / Move / Delete / Save on many, gallery #14) run as the caller looping the single-item RPCs (`move_to_folder`, soft-delete, `save_to_files`, `toggle_star`) inside one transaction; no separate bulk table. (Admin cross-user bulk is the `delete_user_works`/`archive_user_works`/`export_user_works` set above.)
- `restore_work(work_id)` / `purge_work(work_id)` / `empty_trash(scope)` (gallery #42/B19): trash restore sets `works.deleted_at=null`; purge + empty hard-delete now (decrement blob refcount); a scheduled job purges anything past 30 days. Writer gated like delete (owner / moderation).
- `adopt_work(work_id)`, move a work's owner → the server (needs `manage_billing`).
- `billing_portal(owner_type, owner_id)` → a Stripe customer-portal URL (gallery S11); the Stripe webhook writes `invoices` + flips `storage_balance.status`.
- `revoke_session(id)` / `revoke_all_sessions()` (gallery B21 — "sign out everywhere"); the account switcher swaps the active `sessions` row.
- `ban_member` / `timeout_member` / `kick_member` (admin), each writes `audit_log`; the owner can't be kicked or banned.
- `export_manifest('server', id)`, returns JSON of works+metadata; the client fetches signed URLs and zips.
- **Triggers:** `messages` fanout on insert → parse `@handle`, write `mentions` + `notifications`; set `edited_at` on body change; tombstone on `deleted_at`. `works` insert → maintain `search_tsv`; **apply the admin auto-hide rule** — set `hidden=true` when the destination `servers.hide_posts_by_default` is on **OR** the poster holds any `roles.hide_posts_by_default` role (gallery). This is orthogonal to `posts_require_approval` (which sets `approved_at=null` to *gate* a post): auto-hide only keeps it out of the organised library view (Show-hidden reveals it, it still works in chat), a decluttering default. A member with `manage` can flip `hidden` afterward. `comments` insert with a mention → `notifications`. A work insert/delete adjusts `media_blobs.refcount` (GC the blob at 0) and `storage_meters`. A **scheduled purge job** hard-deletes `works.deleted_at` past 30-day retention. Rate-limit `messages` (e.g. 60/min), comments, and reports.
- **Utility:** `file_report`, `delete_my_account`, `profiles_tombstone` (departed members grey, not deleted).

### E.4 Realtime (Supabase)
| Channel | Mode | Carries |
|---|---|---|
| `server:{id}` | **Presence** | who's online + "working on" `{doing}` (Members rail) |
| `channel:{id}` | **Postgres Changes** | live `messages` insert/update/delete |
| `channel:{id}:typing` | **Broadcast** | typing indicators (ephemeral, no table) |
| `user:{id}` | **Postgres Changes** | `notifications` insert (the bell) |
Add the relevant tables to the `supabase_realtime` publication.

### E.5 Server / edge functions
- `api/sign.mjs`, **exists**, presigned R2 uploads. Unchanged.
- `transcode`, audio on demand (F11). **Not** a Supabase Edge Function (no ffmpeg
  there); a Vercel Node function with `ffmpeg-static`, or a tiny worker. Video is
  a later, heavier call (Mux/Cloudflare Stream).
- `notify`, email/push fanout off `notifications` (later; shares the CSAM-alert pipe).
- Export can stay client-side (JSZip) reading `export_manifest`; move server-side only if zips get large.
- WebRTC signaling is the provider's (LiveKit/Daily), not ours.

### E.6 Client packages: build vs buy (smallest unit each)
| Unit | Decide | Why |
|---|---|---|
| Voice/video calls (F14) | **Buy: LiveKit** (cloud or self-host) | media/SFU stack is months of work; rooms key by channel/DM id |
| Full-text search (#1) | **Build: Postgres FTS** (`tsvector` + GIN) | built in, enough for one server's scale; revisit Meilisearch only if it strains |
| Emoji picker (#5) | **Buy: emoji-mart** (data + search) | emoji dataset + skin tones is not worth hand-rolling |
| Message formatting (#5) | **Build tiny** | plain textarea + toolbar that inserts markdown; render with `marked` (small). No ProseMirror/Slate for v1 |
| Mentions / channel autocomplete | **Build** | a prefix query over members/channels; trivial |
| Drag-reorder (channels) | **Buy: SortableJS** | DnD edge cases (touch, autoscroll) are the time-sink |
| File-browser multi-select (marquee + click/keyboard) | **Buy: viselect** (`@viselect/vanilla`, ~a few KB) OR **build tiny** | Google-Drive-style selection: single-click selects, ⌘/Ctrl + Shift-range, ⌘/Ctrl-A, Esc, and a **drag marquee**. viselect handles the rubber-band + autoscroll edge cases; a hand-rolled version (as mocked) is fine if you'd rather not add the dep. No Select *mode* button, and files **open in the Details pane on double-click** (the bare lightbox is retired) |
| Zip export (F19) | **Buy: JSZip** | standard, client-side |
| Local time / dates | **Build: `Intl`** | built in; store `profiles.tz` |
| Quick switcher / shortcuts (#2) | **Build** | already mocked; a keydown map + fuzzy filter |
| Invite codes | **Buy: `nanoid`** | 1-line, collision-safe short codes |
| Transcode (F11) | **Buy the binary: `ffmpeg-static`**, glue is ours | don't reimplement codecs |
| Rich profile / status / presence (#6) | **Build** | plain columns + Realtime presence |

### E.7 Indexes and search
- GIN on `messages.body_tsv`, `works.search_tsv`; one `search_all(q, scope)` RPC
  unions the three (messages, works, comments) with `ts_rank`, feeding the Search
  screen and the quick switcher. Modifiers (`from:`, `in:`, `has:`) parse
  client-side into query args.
- FK indexes on every `*_id` used in a policy or a join (`messages.channel_id`,
  `notifications.user_id, read_at`, `channel_reads`, …), same discipline as the
  existing `works_*_idx`.

### E.8 Migration order (each a re-runnable file, `schema-*.sql` convention)
1. `servers`, `server_members`, `server_invites` + `member_of`/`is_server_admin`.
2. Granular roles: `roles` (seed owner + `@everyone`), `member_roles`, `channel_roles` + `has_perm`/`can_view_channel` (§D.1).
3. `media_blobs`, `storage_meters`, `storage_balance`; `works` (+ `works_read`, §B.3), `work_items`, `folders`, `placement`, `work_collaborators`, `content_tags`, `starred_items`, `share_links` (+ tag/credit consent RPCs, `toggle_star`, `duplicate_work`, the share-link RPCs).
4. `channel_categories`, `channels` (+`category_id`), `messages` (+tsv), `message_reactions`, `message_pins`, `channel_reads`, `mentions`, gated on `can_view_channel`.
5. `comments` (context, resolved_at); `profiles`.
6. `dm_channels`/`dm_members`/`dm_messages`; `friendships`.
7. `notifications`; `server_prefs`/`channel_prefs` (notification level + mute); `saved_items`/`save_folders`; message/comment→notification triggers (respecting the prefs).
8. Moderation: `server_bans`, `reports`, `audit_log`, `server_members.timeout_until`. Billing/account: `invoices`, `sessions` (+ the Stripe webhook + `billing_portal`/`revoke_session` RPCs).
9. RPCs (§E.3), FTS indexes (§E.7), grants, `notify pgrst 'reload schema'`, realtime publication.

### E.9 Per-screen backend checklist (so nothing is missed)
- **Workspace**, `server_members`→rail; `channels`→column; `messages`+Realtime→chat; `channel_reads`→unread badges; `message_reactions`; Presence→members.
- **Thread view**, `messages.parent_id`; `also_to_channel`.
- **Channel Pins/Files**, `message_pins`; works placed in the channel (`placement where channel_id`) for Files.
- **Search / quick switcher**, `search_all()` + FTS indexes, every hit filtered through the live read policy (`can_view_channel`).
- ~~Feed~~ — cut for beta (2026-09-01, §A.4); dormant query, `works` where `visibility='public'` and author ∈ friends (`friendships` accepted).
- **File explorer (server mount)**, `works` + `placement.folder_id` + `folders where server_id`; `storage_meters`/`storage_balance` for the storage footer; the **Trash smart-folder** reads `works where deleted_at not null`; the **Starred smart-folder** reads `starred_items` (restore/purge/empty + star via §E.3). Mounts **inside the workspace shell** (the channel column stays; §C.6).
- **File explorer (personal "My files" mount)**, the *same* component parameterised to the personal source: user-owned `works` (`owner_type='user'`) + `saved_items` + nested `save_folders`; `storage_meters`/`storage_balance` for `owner_type='user'` (the "Your storage" footer); its own Trash + Starred. No server chrome (the channel column, `channel`/`uploader` filters drop away).
- **Details pane**, `works` + `content_tags` + `work_collaborators` + `comments(context=public)` (posts) or the channel link (server files) + `saved_items` + `starred_items` + `share_links` (Share dialog / update-visibility) + `duplicate_work` (Copy) + transcode.
- **Profile / popout**, `profiles` (status/tz/pronouns/links) + `member_roles` + mutual servers (a join) + `friendships`.
- **Messages / Friends**, `dm_channels`/`dm_members`/`dm_messages` + `friendships` (add/respond/block, the new-DM picker via `create_dm`/`create_group_dm`); DM pin/mute/**hide** via `dm_members`; DM reply uses `dm_messages.parent_id`, DM reactions use `dm_message_reactions` (deferred with the DM message-actions TODO).
- **Server settings**, `channels` (manage), `roles`/`member_roles`/`channel_roles`, `server_invites`, `server_bans`, `audit_log`, `storage_balance`/`storage_meters` (two sliders), `export_manifest`; the **auto-hide defaults** (`servers.hide_posts_by_default` in Moderation, `roles.hide_posts_by_default` in Roles) feed the `works`-insert trigger.
- **Create / Join / new-server first-run**, `servers` insert (seed owner + `@everyone`) + `server_invites` + `join_via_invite`.
- **Notifications**, `notifications` + Realtime `user:{id}`; inline reply reuses `messages`/`comments`; the bell dropdown reads the same feed.
- **Sign-in / onboarding**, Supabase Auth + the sign-in/claim screen (§C.14) + unique `profiles.handle` claim.
- **Call** *(v2 — deferred, not built)*, a LiveKit room per `channel`/`dm` id; Presence for who's in.

### E.10 Interactive-control → backend coverage matrix

**Completeness claim:** every clickable in `gallery.html` that changes state maps to
a table + RPC below and **persists**; the only controls with no backend are the
intentionally-ephemeral view toggles listed at the foot. Read this with §B (the
permission gate on each write) and §E.1/§E.3 (the schema/RPCs named here).

| Surface | Control / action | Backend (table · RPC · realtime) | Persists |
|---|---|---|:--:|
| **Chat** | send / edit / delete message | `messages` (insert/update/`deleted_at`) · RT `channel:{id}` | ✅ |
| | react | `message_reactions` · `toggle_reaction` · RT | ✅ |
| | reply in thread · "also send to channel" | `messages.parent_id` · `also_to_channel` | ✅ |
| | pin / unpin | `message_pins` · `pin_message`/`unpin_message` | ✅ |
| | mark read · jump-to-present | `channel_reads` · `mark_channel_read` | ✅ |
| | typing indicator | RT `channel:{id}:typing` (broadcast) | ⏳ ephemeral |
| **Channel column** | create text/voice channel | `channels` insert | ✅ |
| | create / rename / reorder group | `channel_categories` · `set_channel_category`/`reorder_categories` | ✅ |
| | reorder channels (drag) | `channels.position` · `reorder_channels` | ✅ |
| | collapse a group · toggle members rail | client UI state | ⏳ ephemeral |
| **Member popout** | Message · Add friend · Block · Report | `create_dm` · `add_friend` · `block_user` · `reports`/`file_report` | ✅ |
| | Roles · Timeout · Kick · Ban | `set_member_roles` · `timeout_member` · `kick_member` · `ban_member` (+`audit_log`) | ✅ |
| **Server menu** | Invite · Notification settings · Leave · Delete server | `server_invites` · `set_notif_level`→`server_prefs` · `server_members` delete · `servers` delete (owner) | ✅ |
| **File explorer** | browse folders · breadcrumb · list/grid/feed view | `folders` · `placement.folder_id` · `works` read | (view toggle ⏳) |
| | search · filters (type/channel/uploader/tag/date/sort) | `search_all` + client query args over `works`/`placement`/`content_tags` | ✅ (query) |
| | **Star** (card ⭐ + Starred smart-folder) | `starred_items` · `toggle_star` | ✅ |
| | **Copy** (duplicate in folder) | `duplicate_work` (same `blob_sha`, dedup) | ✅ |
| | Copy link / Share | `share_links` · `create_share_link`/`revoke_share_link` | ✅ |
| | Download (file / folder / selection) | signed URL via `api/sign.mjs`; folder via `export_manifest` | n/a |
| | New folder (server / personal) | `folders` insert / `save_folders` insert (nested) | ✅ |
| | Move (drag / menu) · Rename | `move_to_folder` · `works`/`folders` update | ✅ |
| | Select mode · bulk Download/Move/Delete/Save | per-item RPC loop in one txn (§E.3) | ✅ |
| | Show hidden · Hide from library | `works.hidden` | ✅ |
| | Lock / Archive folder | `folders.locked` / `folders.archived` | ✅ |
| | Trash: delete · restore · delete-forever · empty | `works.deleted_at` · `restore_work` · `purge_work` · `empty_trash` | ✅ |
| | Crosspost to server · Update visibility | `placement` insert · `works.visibility` update | ✅ |
| | storage footer · "manage" | `storage_meters`/`storage_balance`/`invoices` | ✅ |
| **Details pane** | comments: add / reply / resolve | `comments` (`parent_id`,`resolved_at`) | ✅ |
| | add tag · Save to my files | `content_tags` · `saved_items` (`save_to_files`) | ✅ |
| | player speed/quality/seek/5s-skip | client; on-demand `transcode` for format | ⏳/n·a |
| **Profile** | ~~feed cards~~ (Feed cut, §A.4) · shelves | `works` (visibility+friends) | read |
| | layout toggle (grid⇄masonry) | client UI state | ⏳ ephemeral |
| | Edit profile (name/handle/bio/avatar/banner) | `profiles` (+`banner_key`) | ✅ |
| | custom status | `profiles.status_*` | ✅ |
| **DMs / Friends** | new DM / group · send | `create_dm`/`create_group_dm` · `dm_messages` · RT | ✅ |
| | pin · mute · **hide (close DM)** | `dm_members` (`pinned`/`muted`/`hidden`) | ✅ |
| | reply · react *(DM message-actions — deferred TODO)* | `dm_messages.parent_id` · `dm_message_reactions` | ✅ (when built) |
| | add / accept / decline / block friend | `add_friend` · `respond_friend` · `block_user` | ✅ |
| **Notifications** | list · mark-all-read · per-item read · levels | `notifications` (RT `user:{id}`) · `mark_server_read` · `read_at` · `set_notif_level` | ✅ |
| **Server settings** | general (name/desc/**icon**/**cover**) · Export | `servers` (`icon_key`/`cover_key`) · `export_manifest` | ✅ |
| | channel settings: who-can-post · slowmode · default folder · allowed types · private | `channels` (`post_policy`,`slowmode_sec`,`default_folder_id`,`allowed_kinds`) · `channel_roles` | ✅ |
| | roles: create/edit/permission-matrix/reorder/assign | `roles` · `member_roles` · `set_member_roles`/`set_channel_access` | ✅ |
| | moderation: bans · post-approval queue · bulk-delete-user | `server_bans` · `approve_work` · `delete_user_works`/`archive_user_works` (+`audit_log`) | ✅ |
| | **auto-hide new posts** (server-wide / per-role) | `servers.hide_posts_by_default` / `roles.hide_posts_by_default` + the `works`-insert trigger sets `works.hidden` | ✅ |
| | audit log · invite links (create/revoke) | `audit_log` · `server_invites` | ✅ |
| | storage & billing: two sliders · plan · portal · receipts | `storage_balance`/`storage_meters` · `billing_portal` · `invoices` | ✅ |
| **User settings** | profile/account (email/password) · privacy | Supabase Auth · `profiles` · `friendships` | ✅ |
| | account switcher · sign-out-everywhere · delete account | `sessions` · `revoke_session`/`revoke_all_sessions` · `delete_my_account` | ✅ |
| | appearance (theme) | client / per-viewer | ⏳ ephemeral |
| **Upload sheet** | pick files/folder · visibility tiles · add details · location (nested new folder) | `api/sign.mjs` + `works` + `placement` + `media_blobs` + `storage_meters`; `works.visibility`; `content_tags`; `folders`/`save_folders` | ✅ |
| **Create / Join / Auth** | create server (2-step) · join by link · sign-in / claim handle | `servers` insert (+seed owner/`@everyone`/channels) · `join_via_invite` · Auth + unique `profiles.handle` | ✅ |
| **Utility / state** | 404 · dead-invite · denied · blocked · pending · **shared view** · back buttons | reads only (shared via `share_links`); navigation is client route | read |

**Intentionally client-only (no persistence needed, not gaps):** typing indicator
(RT broadcast), the grid/list/feed and grid⇄masonry **view toggles**, channel-group
collapse, the members-rail toggle, the theme switch, and transient player controls
(speed/seek/skip). A viewer preference we *may* later persist (theme, last-open
server) would land in a small `user_prefs` row — noted, not required for the beta.

---

## §F. End-to-end workflows

Two real collaborations traced through the product to confirm the pieces connect.

### F.1 A remote album — producers and rappers across Ableton and FL
1. A producer creates a server "LP," seeds `#beats` and `#refs`, and invites the
   group by link. Everyone joins `@everyone` — no role setup.
2. She uploads a loop as a **Server** file into a **beats** folder. The
   storage-impact line confirms it draws the server's storage.
3. A rapper opens it in the Details pane, hits **Save to my files** to keep a copy
   in his own storage, and replies in `#beats` chat (a server file has no comment
   thread; discussion is the channel).
4. He records a take and uploads it as a new Server file, crediting the producer
   as a **collaborator** (auto-accepted — they're co-members).
5. When the track is done, the producer **publishes** her favorite render to her
   public portfolio. That forks a personal copy crediting the original; the server
   file stays put, and the two diverge by design.

### F.2 A VFX shot on a deadline — compositor, animator, mograph
1. A studio server "Shot 042" has folders per task and a private `#client`
   channel gated to admins by an allow-list.
2. The animator uploads a playblast as a Server file into the **anim** folder; the
   File explorer's **feed** view lets the team scroll every previewable render
   newest-first with comments inline.
3. The compositor crossposts a personal reference frame into the server — it stays
   on her storage but everyone can see it via the placement.
4. An admin **detaches** an out-of-date plate placement from the server; the
   owner's file and bytes are untouched.
5. On delivery, an admin **exports** the server — a content-addressed zip of every
   file and its metadata, no lock-in.

---

## §G. Open owner decisions

> **LOCKED — frontend stack (2026-08-22):** **vanilla HTML + CSS + JS plus a thin
> reactive layer.** No meta-framework (no React/Next), no bundler required, no build
> step. The reactive layer is a **small signals-based reactivity primitive** (reference:
> `@preact/signals-core`, ~2 KB, vendored / from CDN) that live surfaces bind to, so
> Realtime changes (new messages, reactions, presence, unread counts, notifications)
> patch the DOM through reactive bindings instead of hand-rolled diffing. Optionally
> pair it with `preact`+`htm` (no-JSX, no-build, ~5 KB total) **only** where a real
> component model earns its keep — chiefly the one shared explorer/feed component
> (§C.6 #60). The gallery's design layer (tokens, icon sprite, hand-written markup)
> carries over unchanged; keep the whole runtime dependency budget to a few KB. This
> resolves the old "framework is a P0 decision" note — P0 now *implements* this, it
> doesn't choose it. Rationale in the owner thread: the app is chat/Realtime-heavy, so
> the pain vanilla would create is reactive DOM updates; a signals layer removes exactly
> that without the weight of a framework, and public link-preview SSR was judged not a
> beta goal.

Genuine build-vs-buy or policy calls still waiting on a human (design/history in
§D and the gallery):

- **WebRTC provider for calls (v2)** — LiveKit / Daily / 100ms / self-hosted.
- **Transcode scope** — audio-only for v1 is the recommendation; video is heavier.
- **Notifications channel beyond the bell** — email/push is a later single pipe.
- **DMCA agent registration** and **Supabase region** — load-bearing before launch.
- **Ratify the permission-flag set** (§D.1) — the proposed flags are marked ⚑ratify.
- **Member-colour palette** — the 30 hex pairs are a design deliverable to sign off
  in `gallery.html`, then record in the `eski-style` skill (tokens, §A.10).
