-- eski schema · 40 · batch file move (move_works_to_folder)
--
-- move_to_folder (schema-12) takes ONE work/folder id, so moving N selected files in the explorer
-- looped N sequential RPC round trips (data.js moveToFolder) — each one re-doing the same
-- has_perm() check for the same destination folder. On a high-RTT connection (Supabase is
-- eu-north-1; OPTIMIZATION.md §1.7) a 20-file move cost 20 round trips serially. This is the
-- files-only (never folders — the explorer never multi-selects across the file/folder kinds in one
-- move) batch sibling: one permission check, one bulk UPDATE, one round trip.
--
-- Every work must already carry a 'server' placement on the SAME server as the destination folder
-- (or root, when folder_id is null) — mirrors move_to_folder's own checks exactly, just done once
-- instead of once per row. A work with no matching placement is silently skipped rather than
-- failing the whole batch: the explorer only ever calls this with ids it already knows are files on
-- the current server, so a mismatch here would mean the row went stale mid-flight (another tab
-- moved/removed it), not a client bug worth aborting everyone else's move over.
create or replace function move_works_to_folder(work_ids uuid[], folder_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  dest_server uuid;
  sid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if work_ids is null or array_length(work_ids, 1) is null then return; end if;

  if folder_id is not null then
    select server_id into dest_server from folders where id = move_works_to_folder.folder_id;
    if dest_server is null then raise exception 'no such destination folder' using errcode = '22023'; end if;
  end if;

  -- the server these works live on — determined from the first placement found; move_to_folder
  -- assumes the same (a single-server multi-select), so this mirrors that assumption rather than
  -- inventing a stricter one.
  select p.surface_id into sid from placement p
    where p.work_id = any(work_ids) and p.surface = 'server' limit 1;
  if sid is null then raise exception 'no server placement found for these works' using errcode = '22023'; end if;
  if folder_id is not null and dest_server <> sid then
    raise exception 'folder is not in these works'' server' using errcode = '22023'; end if;
  if not has_perm(sid, perm_bit('manage_channels')) then
    raise exception 'need manage-files' using errcode = '42501'; end if;

  update placement set folder_id = move_works_to_folder.folder_id
    where work_id = any(work_ids) and surface = 'server' and surface_id = sid;
end;
$$;

revoke all on function move_works_to_folder(uuid[], uuid) from public, anon;
grant execute on function move_works_to_folder(uuid[], uuid) to authenticated;
