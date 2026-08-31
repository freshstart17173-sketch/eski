-- schema-38 · K13 — restore the `locked` read-only fence on server folders.
--
-- schema-03 originally defined a single ALL policy `folders_write` whose USING clause was
-- `has_perm(server_id, manage_channels) AND NOT locked` — i.e. an admin can create folders but
-- CANNOT rename/move/delete a folder flagged `locked` (locked = read-only, the DB fence behind
-- the UI signpost). schema-09 then split that ALL policy into per-command policies
-- (`folders_ins`/`folders_upd`/`folders_del`) and, in doing so, dropped the `AND NOT locked`
-- guard from update + delete — so at the DB level a `locked` folder was fully writable again.
-- The client still hides Rename/Move/Delete on a locked folder, so this was a fence gap sitting
-- behind a signpost that happened to agree with it, not a live exploit path (and prod currently
-- holds 0 folders), but two files disagreeing is exactly the silent-undo failure mode this repo
-- guards against. This restores the guard on the two write commands that mutate an existing row.
--
-- INSERT keeps `has_perm`-only (a new row has no prior `locked` state to protect; the original
-- folders_write WITH CHECK was has_perm-only too). UPDATE/DELETE re-gain `AND NOT locked` in
-- USING so a locked row is invisible to those commands — matching folders_write's original intent
-- (and note: because USING blocks touching a locked row at all, unlocking is deliberately NOT a
-- normal-write path — it would take the service role or a dedicated SECURITY DEFINER RPC, none of
-- which exists yet because no lock/unlock feature is built).
--
-- idempotent: drop-if-exists then recreate.

drop policy if exists folders_upd on folders;
create policy folders_upd on folders for update
  using (has_perm(server_id, perm_bit('manage_channels')) and not locked)
  with check (has_perm(server_id, perm_bit('manage_channels')));

drop policy if exists folders_del on folders;
create policy folders_del on folders for delete
  using (has_perm(server_id, perm_bit('manage_channels')) and not locked);
