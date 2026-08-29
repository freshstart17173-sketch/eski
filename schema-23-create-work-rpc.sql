-- schema-23-create-work-rpc.sql — the atomic upload write path (create_work).
--
-- WHY THIS EXISTS (the "uploads don't work at all" bug, 2026-08-29):
-- The upload sheet used to write a file as 4+ separate client statements under RLS —
-- register_blob (RPC) → insert works → insert placement / upsert saved_items → insert
-- content_tags. On the live preview build EVERY works insert failed with 42501 ("new row
-- violates row-level security policy for table works"), so not a single work row ever got
-- created, while a profile-photo UPDATE (a 0-row no-op when RLS doesn't match) silently
-- "succeeded" — which is exactly why pfp/banner looked fine and uploads looked totally
-- broken. The works_insert WITH CHECK is correct on paper (author_id = auth.uid() AND, for a
-- server, member_of + has_perm('upload')); it evaluates TRUE for the owner's own row under a
-- spy trigger, and the same inserts succeed as the table owner (service-role row-shape check).
-- But the inline `author_id = auth.uid()` INSERT check is the exact path our own VERIFICATION
-- notes as unreliable, and it was failing for real users. Rather than keep four fragile,
-- non-atomic RLS-fenced inserts for the single most important write in the app, this collapses
-- them into ONE SECURITY DEFINER function — the same reliable pattern every other important
-- write here already uses (join_via_invite, add_collaborator, create_folder, register_blob).
--
-- The fence is NOT lost: the function re-checks the same rules explicitly before writing —
-- author is always the caller; a server upload requires active membership AND the 'upload'
-- permission; a personal upload can only be owned by the caller; a channel/folder must belong
-- to the named server; a personal folder must belong to the caller. A definer function owned
-- by the table owner bypasses RLS (works RLS is not FORCEd), so the write itself can't be
-- undone by the same 42501, and the whole thing is atomic — a failure rolls back the work,
-- its placement, and its tags together instead of leaving an orphaned half-write.

create or replace function public.create_work(
  p_owner_type text,
  p_owner_id   uuid,
  p_visibility text,
  p_server_id  uuid,
  p_title      text,
  p_file_ext   text,
  p_kind       text,
  p_blob_sha   text,
  p_bytes      bigint,
  p_channel_id uuid   default null,
  p_folder_id  uuid   default null,
  p_tags       text[] default '{}'
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid uuid := (select auth.uid());
  wid uuid;
  t   text;
  vis text := p_visibility;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_owner_type not in ('user','server') then raise exception 'bad owner_type' using errcode = '22023'; end if;

  if p_owner_type = 'server' then
    -- a server upload must name the server it draws, and the caller must be an active member
    -- with the upload permission (mirrors the works_insert WITH CHECK + placement checks).
    if p_owner_id is null or p_server_id is null or p_owner_id <> p_server_id then
      raise exception 'server upload must name its server' using errcode = '22023'; end if;
    if not member_of(p_server_id) then
      raise exception 'not a member of this server' using errcode = '42501'; end if;
    if not has_perm(p_server_id, perm_bit('upload')) then
      raise exception 'you can’t upload to this server' using errcode = '42501'; end if;
    vis := 'server';   -- a server work is server-visible; never trust a mismatched arg
    if p_channel_id is not null and not exists (
        select 1 from channels c where c.id = p_channel_id and c.server_id = p_server_id) then
      raise exception 'channel is not in this server' using errcode = '22023'; end if;
    if p_folder_id is not null and not exists (
        select 1 from folders f where f.id = p_folder_id and f.server_id = p_server_id) then
      raise exception 'folder is not in this server' using errcode = '22023'; end if;
  else
    -- a personal work can only ever be owned by the caller.
    if p_owner_id is null or p_owner_id <> uid then
      raise exception 'a personal upload must be your own' using errcode = '42501'; end if;
    if vis not in ('public','private','personal') then vis := 'private'; end if;
    if p_folder_id is not null and not exists (
        select 1 from save_folders sf where sf.id = p_folder_id and sf.user_id = uid) then
      raise exception 'that folder is not yours' using errcode = '22023'; end if;
  end if;

  -- content-address the blob (idempotent) so the works.blob_sha FK is satisfiable; the
  -- works_blob_meter trigger refcounts + meters bytes off this row.
  if p_blob_sha is not null then
    insert into media_blobs (sha256, bytes, refcount)
      values (lower(p_blob_sha), greatest(coalesce(p_bytes, 0), 0), 0)
    on conflict (sha256) do nothing;
  end if;

  insert into works (author_id, owner_type, owner_id, visibility, server_id, title, file_ext, kind, blob_sha, bytes)
    values (uid, p_owner_type, p_owner_id, vis, p_server_id, p_title,
            lower(nullif(p_file_ext,'')), p_kind, lower(nullif(p_blob_sha,'')), greatest(coalesce(p_bytes,0),0))
    returning id into wid;

  if p_owner_type = 'server' then
    insert into placement (work_id, surface, surface_id, channel_id, folder_id, placed_by)
      values (wid, 'server', p_server_id, p_channel_id, p_folder_id, uid);
  elsif p_folder_id is not null then
    -- filing a personal work into a My-files folder is a saved_items row.
    insert into saved_items (user_id, work_id, folder_id)
      values (uid, wid, p_folder_id)
    on conflict (user_id, work_id) do update set folder_id = excluded.folder_id;
  end if;

  if p_tags is not null then
    foreach t in array p_tags loop
      if length(trim(t)) > 0 then
        insert into content_tags (work_id, tag) values (wid, trim(t))
        on conflict (work_id, tag) do nothing;
      end if;
    end loop;
  end if;

  return wid;
end;
$function$;

-- lock it down to signed-in callers only (the app calls it as `authenticated`); the function
-- fences server-vs-personal itself, so anon has no business reaching it.
revoke all on function public.create_work(text,uuid,text,uuid,text,text,text,text,bigint,uuid,uuid,text[]) from public;
revoke all on function public.create_work(text,uuid,text,uuid,text,text,text,text,bigint,uuid,uuid,text[]) from anon;
grant execute on function public.create_work(text,uuid,text,uuid,text,text,text,text,bigint,uuid,uuid,text[]) to authenticated;
