-- eski schema · 41 · duplicate_work (the Copy half of Cut/Copy/Paste)
--
-- owner ask 2026-09-01: "would I want right-click, probably" surfaced a real gap — the explorer's
-- own background-menu comment literally says "Paste → with C4 cut/copy/paste... omitted until
-- those land." Cut+Paste is just the existing move (move_works_to_folder, schema-40) triggered by
-- keys instead of a drag. Copy+Paste needs something new: an independent duplicate — a SECOND
-- `works` row the user now owns outright (renameable/deletable separately from the original),
-- not another placement of the same row (that's what saved_items/placement already do for a
-- "save"/move).
--
-- Storage cost: works.blob_sha is content-addressed and storage_meters counts DISTINCT owned
-- blobs (schema-03's own comment on bytes_used) — a duplicate pointing at the same blob_sha costs
-- ZERO extra billed storage, so no special-casing needed there; the existing works_blob_meter
-- trigger already handles multiple works rows sharing one blob (that's the dedup it exists for).
--
-- Mirrors create_work's (schema-23) shape and fence exactly, just reading the source row instead
-- of taking upload params: author_id is always the CALLER (you made this copy, not the original
-- uploader — consistent with can_write_work only ever trusting the actual writer), scoped to the
-- SAME mount as the source (a server file copies within that server, a personal file within your
-- own library — crossing mounts would mean re-deriving visibility/ownership rules from scratch,
-- out of scope here and not what "duplicate" means in a normal file browser anyway). Tags copy
-- with it; collaborators/comments do not (a fresh copy isn't the same credited work).
create or replace function public.duplicate_work(p_work_id uuid, p_dest_folder_id uuid default null)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid uuid := (select auth.uid());
  src works%rowtype;
  wid uuid;
  t   text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not can_read_work(p_work_id) then raise exception 'cannot read that file' using errcode = '42501'; end if;

  select * into src from works where id = p_work_id and deleted_at is null;
  if src.id is null then raise exception 'file not found' using errcode = '22023'; end if;

  if src.owner_type = 'server' then
    if not member_of(src.owner_id) then
      raise exception 'not a member of this server' using errcode = '42501'; end if;
    if not has_perm(src.owner_id, perm_bit('upload')) then
      raise exception 'you can''t add files here' using errcode = '42501'; end if;
    if p_dest_folder_id is not null and not exists (
        select 1 from folders f where f.id = p_dest_folder_id and f.server_id = src.owner_id) then
      raise exception 'folder is not in this server' using errcode = '22023'; end if;
  else
    if src.owner_id <> uid then raise exception 'not yours to copy' using errcode = '42501'; end if;
    if p_dest_folder_id is not null and not exists (
        select 1 from save_folders sf where sf.id = p_dest_folder_id and sf.user_id = uid) then
      raise exception 'that folder is not yours' using errcode = '22023'; end if;
  end if;

  insert into works (author_id, owner_type, owner_id, visibility, server_id, title, file_ext, kind, blob_sha, bytes)
    values (uid, src.owner_type, src.owner_id, src.visibility, src.server_id, src.title, src.file_ext, src.kind, src.blob_sha, src.bytes)
    returning id into wid;

  if src.owner_type = 'server' then
    insert into placement (work_id, surface, surface_id, channel_id, folder_id, placed_by)
      values (wid, 'server', src.owner_id, null, p_dest_folder_id, uid);
  else
    insert into saved_items (user_id, work_id, folder_id) values (uid, wid, p_dest_folder_id);
  end if;

  for t in select tag from content_tags where work_id = src.id loop
    insert into content_tags (work_id, tag) values (wid, t) on conflict do nothing;
  end loop;

  return wid;
end;
$function$;

revoke all on function public.duplicate_work(uuid, uuid) from public;
revoke all on function public.duplicate_work(uuid, uuid) from anon;
grant execute on function public.duplicate_work(uuid, uuid) to authenticated;
