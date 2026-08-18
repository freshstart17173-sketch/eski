# P2 — RPCs, triggers, search

16 backend prompts. Each is one `security definer` function (or one trigger set)
with `search_path = public`, plus a round-trip test that asserts the exact
rows/notification/meter delta on success **and** a rejection when the gate fails.
CANON names throughout. Shared guardrails: see [README](README.md).

Because a `security definer` function bypasses RLS, **each function re-checks its
own gate inside the body** (`member_of`/`is_server_admin`/`has_perm`) — the RLS
policy is not enough once you're inside a definer.

---

### P2.1 [BE] — `join_via_invite(code text)`

Validate `server_invites`: exists, not expired, `uses < max_uses`, and the caller
is not in `server_bans` for that server. On success: insert `server_members`
(status 'active', next free `color`), add the `@everyone` `member_roles` row,
`uses + 1`, return the server. **DONE:** a valid code joins and colours the member;
an expired/at-cap/revoked code is refused; a **banned** user is refused even with a
valid code.

### P2.2 [BE] — `add_version(parent_id uuid, media_key text, ext text, version_note text)`

Require a non-empty `version_note`; require the new work's `kind` equals the
parent's; insert `works` with `version_of = parent_id`. A multi-file batch calls
it N times in order. **DONE:** a version with a note and matching kind is created;
a missing note is rejected; a kind mismatch (audio version of a video) is rejected.

### P2.3 [BE] — `mark_channel_read(channel_id uuid)`

Upsert `channel_reads(uid(), channel_id, now())`. Gate on `can_view_channel`.
**DONE:** the caller's `last_read_at` advances; a non-member call is refused; no
other user's row is touched.

### P2.4 [BE] — `toggle_reaction(message_id uuid, emoji text)`

Insert the `message_reactions` row if absent, delete it if present (own row).
**DONE:** first call adds, second removes; a non-member is refused.

### P2.5 [BE] — `pin_message(message_id)` / `unpin_message(message_id)`

Pin/unpin for the message's channel. Unpin-any requires the `pin_message` perm;
a member may unpin only their own pin. **DONE:** a member pins; a moderator unpins
another's pin; a member cannot unpin another's without the perm.

### P2.6 [BE] — `create_dm(handle text)` / `create_group_dm(handles text[])`

Resolve handle(s) → users; a 1:1 requires an **accepted friendship**; find-or-create
`dm_channels` + `dm_members`. **DONE:** creating a DM with a friend returns the
(possibly existing) channel; with a non-friend it's refused; a group DM adds all
resolved members.

### P2.7 [BE] — `add_friend(handle)` / `respond_friend(user, accept bool)` / `block_user(user)`

Insert a `pending` friendship (ordered pair); respond flips to `accepted` or
deletes; block sets `blocked`. **DONE:** a request appears `pending` to both; accept
makes it `accepted` (unlocking public-visibility reads, P1.2); block prevents
further requests and hides content.

### P2.8 [BE] — `move_card(card_id, column_id, position)`

Reposition/relocate a `board_cards` row; gate on member of the board's server.
**DONE:** the card lands in the target column at the target index and siblings
renumber; a non-member is refused.

### P2.9 [BE] — `ban_member` / `timeout_member` / `kick_member`

Each requires the matching perm (`ban`/`timeout`/`kick`), performs the action, and
writes an `audit_log` row. Timeout sets `server_members.timeout_until`. **DONE:**
each action succeeds for a permitted actor and writes exactly one audit row; is
refused for an actor without the perm; a timed-out member cannot post (P1.4).

### P2.10 [BE] — `set_member_roles(user uuid, role_ids uuid[])`

Requires `manage_roles`. Replaces the member's non-default roles with `role_ids`;
`@everyone` stays. **DONE:** the member's effective `has_perm` is the union of the
new roles; `@everyone` cannot be removed; a caller without `manage_roles` is
refused.

### P2.11 [BE] — `set_channel_access(channel_id, role_ids uuid[], member_ids uuid[])`

Requires `manage_channels`. Replaces `channel_roles` for the channel (allow-list).
Empty arrays = open to all members. **DONE:** granting roles makes the channel
private to them (`can_view_channel` false for others); clearing the list reopens
it; a caller without `manage_channels` is refused.

### P2.12 [BE] — `export_manifest(scope)` where scope = a server_id or 'account'

Returns JSON of works + metadata the caller may read (server export requires
`manage_billing`/owner; account export = the caller's own). The client fetches
signed URLs and zips (JSZip). **DONE:** a permitted caller gets a manifest listing
exactly the readable works; an unpermitted server export is refused.

### P2.13 [BE] — message fan-out trigger

On `messages` insert: parse `@handle` tokens → write `mentions` + a `mention`
`notification` for each; on `also_to_channel`, cross-post per spec. **DONE:** a
message mentioning two members writes two `mentions` and two notifications; a
message with no mention writes none.

### P2.14 [BE] — edit/tombstone + search triggers

`messages`/`dm_messages`: set `edited_at` on body change; on `deleted_at`, clear
`body` (tombstone). `works` insert/update: maintain `search_tsv`. `comments`
insert with a mention → `notification`. **DONE:** editing sets `edited_at` and
keeps the row; deleting empties the body but keeps the row; a new work is
searchable by title immediately.

### P2.15 [BE] — storage-meter trigger + blob refcount (dedup)

On `works` insert/delete/update of `blob_sha`: maintain `media_blobs.refcount` and
adjust `storage_meters` for the work's owner — keyed by `works.owner_type`/`owner_id`
(a `user` work → that user meter; a `server` work → that server meter). A meter
counts **distinct** owned blobs, so the Nth work referencing a blob the owner already
holds adds **zero** bytes (dedup); the blob's bytes leave the meter only when the
owner's last reference to it goes. **DONE:** a `user`-owned work bumps that user
meter, a `server`-owned work bumps that server meter; a second work referencing the
same blob for the same owner adds 0 bytes and bumps refcount; deleting reverses both,
and the blob is GC-eligible at refcount 0.

### P2.16 [BE] — `search_all(q text, scope text)` + FTS indexes

GIN on `messages.body_tsv` and `works.search_tsv`; one RPC unions messages, works
and comments with `ts_rank`, scoped (a server or 'global'), returning only what
the caller may read. Client parses `from:`/`in:`/`has:` modifiers into args.
**DONE:** a query returns ranked hits across the three sources; results honour
`can_view_channel`/visibility (no private-channel leak); an empty query returns
recents.

---

**End of P2.** Backend is now complete and self-testing. P3 begins the UI with the
design-system primitives every screen reuses.
