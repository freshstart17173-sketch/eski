-- eski schema · 12 · P2 RPCs — DMs, friendships, file-tree  (P2.6–P2.8)
-- Re-runnable. All SECURITY DEFINER → each re-checks its own gate.

-- ── P2.6 · create_dm / create_group_dm ──────────────────────────────────────
-- A 1:1 requires an accepted friendship and is find-or-create (one canonical channel
-- per pair). is_friend() is caller-relative, exactly the check we want.
create or replace function create_dm(handle text) returns dm_channels
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); target uuid; ch uuid; res dm_channels;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select id into target from profiles p where p.handle = create_dm.handle;
  if target is null then raise exception 'no such handle' using errcode = '22023'; end if;
  if target = uid then raise exception 'cannot DM yourself' using errcode = '22023'; end if;
  if not is_friend(target) then raise exception 'not friends' using errcode = '42501'; end if;

  select dc.id into ch from dm_channels dc
   where dc.is_group = false
     and exists (select 1 from dm_members m where m.dm_channel_id = dc.id and m.user_id = uid)
     and exists (select 1 from dm_members m where m.dm_channel_id = dc.id and m.user_id = target)
     and (select count(*) from dm_members m where m.dm_channel_id = dc.id) = 2
   limit 1;
  if ch is null then
    insert into dm_channels (is_group) values (false) returning id into ch;
    insert into dm_members (dm_channel_id, user_id) values (ch, uid), (ch, target);
  end if;
  select * into res from dm_channels where id = ch;
  return res;
end;
$$;

create or replace function create_group_dm(handles text[]) returns dm_channels
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); ch uuid; res dm_channels; members uuid[];
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select array_agg(p.id) into members from profiles p where p.handle = any(handles);
  if members is null or array_length(members, 1) < 1 then
    raise exception 'no valid handles' using errcode = '22023'; end if;
  insert into dm_channels (is_group) values (true) returning id into ch;
  insert into dm_members (dm_channel_id, user_id)
    select ch, u from (select unnest(members) as u union select uid) s
  on conflict do nothing;
  select * into res from dm_channels where id = ch;
  return res;
end;
$$;

-- ── P2.7 · add_friend / respond_friend / block_user ─────────────────────────
-- One ordered-pair row (a_user < b_user). A block sets status='blocked' and prevents
-- further requests from either side.
create or replace function add_friend(handle text) returns friendships
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); target uuid; a uuid; b uuid; existing friendships; res friendships;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select id into target from profiles p where p.handle = add_friend.handle;
  if target is null then raise exception 'no such handle' using errcode = '22023'; end if;
  if target = uid then raise exception 'cannot friend yourself' using errcode = '22023'; end if;
  a := least(uid, target); b := greatest(uid, target);

  select * into existing from friendships f where f.a_user = a and f.b_user = b;
  if found then
    if existing.status = 'blocked' then raise exception 'blocked' using errcode = '42501'; end if;
    return existing;   -- already pending/accepted → idempotent
  end if;
  insert into friendships (a_user, b_user, status, requested_by)
    values (a, b, 'pending', uid) returning * into res;
  return res;
end;
$$;

create or replace function respond_friend(target_id uuid, accept boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); a uuid; b uuid; existing friendships;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  a := least(uid, target_id); b := greatest(uid, target_id);
  select * into existing from friendships f where f.a_user = a and f.b_user = b;
  if not found or existing.status <> 'pending' then
    raise exception 'no pending request' using errcode = '22023'; end if;
  if existing.requested_by = uid then
    raise exception 'cannot answer your own request' using errcode = '42501'; end if;
  if accept then
    update friendships set status = 'accepted' where a_user = a and b_user = b;
  else
    delete from friendships where a_user = a and b_user = b;
  end if;
end;
$$;

create or replace function block_user(target_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); a uuid; b uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if target_id = uid then raise exception 'cannot block yourself' using errcode = '22023'; end if;
  a := least(uid, target_id); b := greatest(uid, target_id);
  insert into friendships (a_user, b_user, status, requested_by)
    values (a, b, 'blocked', uid)
  on conflict (a_user, b_user) do update set status = 'blocked', requested_by = uid;
end;
$$;

-- ── P2.8 · move_to_folder / create_folder ───────────────────────────────────
-- Gate: manage-files (manage_channels) on the operation's server. move_to_folder
-- re-files a work's server placement OR re-parents a subfolder, and rejects a cycle
-- (a folder into its own subtree). null folder_id = server root.
create or replace function move_to_folder(target uuid, folder_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  sid uuid;
  dest_server uuid;
  is_folder boolean;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  if folder_id is not null then
    select server_id into dest_server from folders where id = move_to_folder.folder_id;
    if dest_server is null then raise exception 'no such destination folder' using errcode = '22023'; end if;
  end if;

  select exists (select 1 from folders where id = target) into is_folder;

  if is_folder then
    select server_id into sid from folders where id = target;
    if folder_id is not null and dest_server <> sid then
      raise exception 'cannot move a folder across servers' using errcode = '22023'; end if;
    if not has_perm(sid, perm_bit('manage_channels')) then
      raise exception 'need manage-files' using errcode = '42501'; end if;
    if folder_id is not null and exists (
      with recursive sub as (
        select id from folders where id = target
        union all
        select f.id from folders f join sub on f.parent_id = sub.id)
      select 1 from sub where id = move_to_folder.folder_id
    ) then
      raise exception 'cannot move a folder into its own subtree' using errcode = '22023';
    end if;
    update folders set parent_id = move_to_folder.folder_id where id = target;
  else
    select p.surface_id into sid from placement p
      where p.work_id = target and p.surface = 'server' limit 1;
    if sid is null then raise exception 'work has no server placement' using errcode = '22023'; end if;
    if folder_id is not null and dest_server <> sid then
      raise exception 'folder is not in this work''s server' using errcode = '22023'; end if;
    if not has_perm(sid, perm_bit('manage_channels')) then
      raise exception 'need manage-files' using errcode = '42501'; end if;
    update placement set folder_id = move_to_folder.folder_id
      where work_id = target and surface = 'server';
  end if;
end;
$$;

create or replace function create_folder(server_id uuid, parent_id uuid, name text) returns folders
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid()); res folders;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not has_perm(create_folder.server_id, perm_bit('manage_channels')) then
    raise exception 'need manage-files' using errcode = '42501'; end if;
  if parent_id is not null and not exists (
      select 1 from folders f where f.id = create_folder.parent_id and f.server_id = create_folder.server_id) then
    raise exception 'parent folder not in this server' using errcode = '22023'; end if;
  insert into folders (server_id, parent_id, name)
    values (create_folder.server_id, create_folder.parent_id, create_folder.name)
  returning * into res;
  return res;
end;
$$;

revoke execute on function create_dm(text), create_group_dm(text[]), add_friend(text),
  respond_friend(uuid,boolean), block_user(uuid), move_to_folder(uuid,uuid),
  create_folder(uuid,uuid,text) from anon, public;
grant execute on function create_dm(text), create_group_dm(text[]), add_friend(text),
  respond_friend(uuid,boolean), block_user(uuid), move_to_folder(uuid,uuid),
  create_folder(uuid,uuid,text) to authenticated;
