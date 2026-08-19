# P1 — Schema + RLS

Backend prompts, one migration-unit each, in COLLAB §7.8 order. Every prompt:
`create table if not exists` + `alter table … enable row level security` +
policies + **its own allow-and-deny test**. All helpers/RPCs are `security
definer` with `search_path = public`. `uid()` means `(select auth.uid())`.

Naming is CANON's: **`servers`** (not groups), **`server_members`**,
**`is_server_admin`**, **`comments`** (post-level). These override COLLAB §7's
older names.

> **Beta cut (2026-08-18e).** The **canvas** (`canvas`/`canvas_items`/
> `annotations`), **kanban boards** (`boards`/`board_columns`/`board_cards`), and
> **numbered versions** (`works.version_of`/`version_note`, `add_version`) are
> **removed**. Their prompts below (P1.10–P1.15, P2.2, P2.8) are kept as struck
> **CUT** stubs so the surrounding prompt numbers don't shift — do not build them.

A `[BE]` prompt is **done when** its stated pgTAP/SQL test passes: the allowed
role sees/does what it should, and the denied role gets 0 rows or a rejection.
Shared guardrails: see [README](README.md).

---

### P1.1 [BE] — `servers`, `server_members`, `server_invites` + gate helpers

**BUILD.**
- `servers(id uuid pk default gen_random_uuid(), created_at timestamptz default now(), slug text unique, name text, description text, cover_key text, owner_id uuid → auth.users)`.
- `server_members(server_id → servers, user_id → auth.users, color smallint, status text default 'active', timeout_until timestamptz, joined_at timestamptz default now(), pk(server_id,user_id))`. (Role is **not** here — it moves to `member_roles` in P1.24.)
- `server_invites(code text pk, server_id → servers, created_by uuid, created_at, expires_at timestamptz, max_uses int, uses int default 0)`.
- Helpers: `member_of(sid uuid) returns bool` = a `server_members` row for `(sid, uid())` with status 'active'; `is_server_admin(sid uuid) returns bool` = owner OR (in P1.24) has the `manage_server` flag — for now, `= servers.owner_id = uid()`.

**RLS.** `servers`: read `member_of(id)`; write `is_server_admin(id)`.
`server_members`: read `member_of(server_id)`; a member may delete their own row
(leave); admin manages others. `server_invites`: read/write admin only (use is via
an RPC in P2).

**DONE WHEN.** A user who is not a member gets 0 rows from `select * from servers
where id = :s`; a member gets 1. A non-owner cannot `update servers`; the owner
can. A member can delete only their own `server_members` row.

---

### P1.2 [BE] — `works` column adds + the `works_read` visibility rule

**CONTEXT.** `works` is the uploaded thing (post in public, file in server/personal).
Assume a base `works(id, owner_id, media_key, bytes, kind, created_at)` exists or
create it minimally. *(No `version_of`/`version_note` — numbered versions are cut.)*

**BUILD.** Add: `visibility text check (visibility in ('public','personal','server'))
default 'public'`; `server_id uuid null → servers`; `title text null`; `file_ext
text`; `credits text`; `search_tsv tsvector` generated from title + file_ext +
owner. Rewrite the read policy `works_read` to CANON §B.3:
- `public` → readable by anyone the owner is **friends** with (P1.19), plus the owner;
- `server` → readable by `member_of(server_id)` **and** `can_view_channel` once
  channels gate works (P1.24 widens this);
- `personal` → owner only.

**DONE WHEN.** A `public` work is visible to a friend and invisible to a stranger;
a `server` work is visible to a server member and invisible to a non-member; a
`personal` work is visible only to its owner. (`can_view_channel` is stubbed true
until P1.24.)

---

### P1.3 [BE] — `channels`

**BUILD.** `channels(id, server_id → servers, name, kind text check (kind in
('text','voice')), topic text, slowmode_sec int default 0,
position int, created_at)`.

**RLS.** read `member_of(server_id)`; write `is_server_admin(server_id)`.

**DONE WHEN.** A member reads the server's channels ordered by `position`; a
non-member reads none; only an admin can insert/reorder.

---

### P1.4 [BE] — `messages` (+ fts, threads, tombstones)

**BUILD.** `messages(id, channel_id → channels, user_id → auth.users, body text,
parent_id uuid null → messages, also_to_channel bool default false, edited_at
timestamptz, deleted_at timestamptz, created_at, body_tsv tsvector generated from
body)`.

**RLS.** read `member_of` (channel's server) — widened to `can_view_channel` in
P1.24; insert: member **and** not timed-out (`server_members.timeout_until` null
or past); update/delete: own only, and delete is a **tombstone**
(`set deleted_at = now()`, body cleared by a trigger), never a hard delete.

**DONE WHEN.** A member inserts a message; a timed-out member's insert is rejected;
a user can edit/tombstone only their own; a deleted row still exists with
`deleted_at` set and empty body; `body_tsv` is populated.

---

### P1.5 [BE] — `message_reactions`

**BUILD.** `message_reactions(message_id → messages, user_id, emoji text,
pk(message_id,user_id,emoji))`. **RLS:** read = member of the message's channel;
insert/delete = own row only.

**DONE WHEN.** A member toggles their own reaction; cannot add a reaction as
another user; a non-member reads none.

---

### P1.6 [BE] — `message_pins`

**BUILD.** `message_pins(channel_id → channels, message_id → messages, pinned_by
uuid, pk(channel_id,message_id))`. **RLS:** read = member; insert = member; delete
= member, but a moderator (P1.24 `pin_message` perm) may unpin any.

**DONE WHEN.** A member pins/unpins; a non-member reads none; a pinned message
appears once per channel (pk enforced).

---

### P1.7 [BE] — `channel_reads` (unread/mention state)

**BUILD.** `channel_reads(user_id, channel_id → channels, last_read_at timestamptz,
pk(user_id,channel_id))`. **RLS:** owner only (`user_id = uid()`).

**DONE WHEN.** A user upserts only their own read marker; cannot read or write
another user's row.

---

### P1.8 [BE] — `mentions` (@-index for badges)

**BUILD.** `mentions(message_id → messages, mentioned_user uuid, server_id →
servers)`. Written by the message-fanout trigger (P2). **RLS:** read = the
mentioned user only.

**DONE WHEN.** Only the mentioned user sees their mention rows.

---

### P1.9 [BE] — `comments` adds (post-level, context-scoped)

**BUILD.** On the existing `comments`, add `context text` ('public' or a
`server_id` string — threads never mix). Add `resolved_at timestamptz null` for
detail-pane threads if used.

**RLS.** A comment is readable wherever its target work is readable **in that
context**: a `public`-context comment is visible on the public post; a
`server`-context comment only to members of that server.

**DONE WHEN.** A public-context comment is invisible in a server context and
vice-versa; deleting a comment tombstones it.

---

### P1.10–P1.15 — ~~CUT (beta): `annotations`, `canvas`, `canvas_items`, `boards`, `board_columns`, `board_cards`~~

**Do not build.** The review canvas + annotations and kanban boards are cut from
the beta (2026-08-18e). These six table prompts are removed; their numbers are left
as a gap so the later prompts (P1.16+) keep their numbering. If the canvas or boards
return post-beta, re-add them here.

---

### P1.16 [BE] — `dm_channels`

**BUILD.** `dm_channels(id, is_group bool default false, name text null,
created_at)`. **RLS:** readable only by a member (via `dm_members`, P1.17).

**DONE WHEN.** A DM channel is invisible to anyone not in `dm_members`.

---

### P1.17 [BE] — `dm_members`

**BUILD.** `dm_members(dm_channel_id → dm_channels, user_id, muted bool default
false, pinned bool default false, last_read_at timestamptz, pk(...))`. **RLS:**
self rows (`user_id = uid()`), and membership is what grants read on the channel.

**DONE WHEN.** A user sees only DM channels they're a member of; edits only their
own mute/pin/last_read.

---

### P1.18 [BE] — `dm_messages`

**BUILD.** `dm_messages(id, dm_channel_id → dm_channels, user_id, body, parent_id,
edited_at, deleted_at, created_at)` — mirrors `messages`. **RLS:** member of the
DM only.

**DONE WHEN.** Only DM members read/insert; edit/tombstone own only.

---

### P1.19 [BE] — `friendships` (add-by-handle)

**BUILD.** `friendships(a_user uuid, b_user uuid, status text check (status in
('pending','accepted','blocked')), requested_by uuid, created_at,
pk(a_user,b_user))` stored as an **ordered pair** (`a_user < b_user`) so a pair is
unique regardless of direction. **RLS:** either party reads/updates their edge.

**DONE WHEN.** A friendship is visible to both parties and no one else; the ordered
pair prevents a duplicate reverse row; `accepted` is what P1.2's public-visibility
rule keys on.

---

### P1.20 [BE] — `notifications`

**BUILD.** `notifications(id, user_id, kind text check (kind in ('mention',
'comment','join','reaction','invite','friend')),
actor_id uuid, server_id uuid null, target_type text, target_id uuid, excerpt
text, read_at timestamptz, created_at)`. **RLS:** owner only. Add to the
`supabase_realtime` publication (the bell rides `user:{id}`).

**DONE WHEN.** A user reads only their own notifications; `read_at` marks read; the
table is in the realtime publication.

---

### P1.21 [BE] — `saved_items`

**BUILD.** `saved_items(user_id, target_type text, target_id uuid, folder_id uuid
null → save_folders, pk(user_id,target_type,target_id))`. **RLS:** owner only.

**DONE WHEN.** A user saves/unsaves only for themselves; a save can be filed to a
personal save-folder.

---

### P1.22 [BE] — `profiles` additions

**BUILD.** Add to `profiles`: `status_emoji text`, `status_text text`,
`status_expires_at timestamptz`, `presence_state text check (presence_state in
('online','idle','dnd','invisible')) default 'online'`, `tz text`, `pronouns
text`, `links jsonb`. **RLS:** public read of the profile card fields; self write.

**DONE WHEN.** A profile's status/tz/pronouns/links round-trip; only the owner
writes them; the popout can read another user's card.

---

### P1.23 [BE] — moderation: `server_bans`, `audit_log`, timeouts

**BUILD.** `server_bans(server_id → servers, user_id, banned_by uuid, reason text,
until timestamptz null, created_at)`; `audit_log(id, server_id → servers, actor_id,
action text, target_type, target_id, meta jsonb, created_at)`;
`server_members.timeout_until` already added in P1.1. **RLS:** admin read/write on
bans; `audit_log` admin-read, server-written (by the moderation RPCs in P2).

**DONE WHEN.** Only an admin sees the ban list and audit log; a banned user's
`join_via_invite` is refused (asserted fully in P2); a timeout blocks message
insert (P1.4 test).

---

### P1.24 [BE] — granular roles + channel gating + slider storage (CANON §D.1–D.3)

**The load-bearing one.** See the fully-expanded exemplar in
[`../CODEGEN.md`](../CODEGEN.md) §3 (Exemplar B) — reproduce it exactly.

**BUILD.**
- `roles(id, server_id → servers, name, color smallint, position int, permissions
  bigint, is_default bool)` — one `is_default` @everyone role per server.
- `member_roles(server_id, user_id, role_id, pk(server_id,user_id,role_id))`.
- `channel_roles(channel_id → channels, role_id → roles, pk(channel_id,role_id))`
  — the v1 **allow-list**: zero rows = open to all members; any rows = private to
  those roles. Written to the future overwrite grain (LOCKED D-i) — do **not**
  build v2 deny.
- Drop `server_members.role`.
- `has_perm(sid, flag bigint) returns bool` = OR of the member's roles'
  `permissions` includes `flag`, with the **owner implicitly all-flags**.
- `can_view_channel(cid) returns bool` = `member_of` the channel's server AND
  (no `channel_roles` rows for the channel OR the member holds a granted role).
- Re-point the channel-scoped read policies (messages, pins, files, a work in a
  private channel) from bare `member_of` to `can_view_channel`.
- Storage/billing (§D.2 — **dynamic slider, no plans, no pooling of any kind**):
  content-address the media with `media_blobs(sha256 pk, bytes, refcount)`; a work
  references a blob and names its paying account — `works.blob_sha text → media_blobs`,
  `works.owner_type text check in ('user','server')`, `works.owner_id uuid`. Meter:
  `storage_meters(owner_type check in ('user','server'), owner_id uuid, bytes_used
  bigint, updated_at)` = sum of **distinct** owned blobs (dedup; a placement adds zero
  bytes). Billing: **one slider row per storage account** — `storage_balance(owner_type
  text check in ('user','server'), owner_id uuid, purchased_gb int, status text,
  stripe_customer text, pk(owner_type, owner_id))`, billed on the bracket schedule.
  **No `billing_accounts`, no `plan`, no `storage_grants`, no `storage_allocations`** —
  accounts never combine or allocate across each other. A user's quota = 10 GB free +
  their `purchased_gb`; a server's = ~5 GB baseline + the server row's `purchased_gb`.
  The works-bytes trigger maintains `storage_meters` keyed by `owner_type`/`owner_id`.

**DONE WHEN.** (a) a member holding two roles has the **union** of their flags;
(b) `has_perm` false → a gated RPC is rejected; (c) a private channel (has
`channel_roles` rows) returns 0 messages to a non-granted member and N to a
granted one; (d) a work with `owner_type='user'` bumps that **user** meter and a
work with `owner_type='server'` bumps the **server** meter; the same blob owned by
two works for the same account counts **once** (dedup); a user's quota resolves to
`10 + purchased_gb` and a server's to `5 + purchased_gb`, with no cross-account
allocation path existing; (e) the flag permission set matches CANON §D.1
(Server/Members/Content/per-channel groups).

---

**End of P1.** With P1 applied and green, every table has RLS and an allow/deny
proof. P2 adds the RPCs and triggers that these policies reference.
