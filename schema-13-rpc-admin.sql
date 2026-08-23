-- eski schema · 13 · P2 RPCs — moderation, roles, channel access, export (P2.9–P2.12)
-- Re-runnable. All SECURITY DEFINER; each re-checks its perm gate. Moderation writers
-- log exactly one audit_log row, and the server owner is never a valid target.

-- ── P2.9 · ban_member / timeout_member / kick_member ────────────────────────
create or replace function ban_member(server_id uuid, target_user uuid, reason text default null, until timestamptz default null)
  returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not has_perm(ban_member.server_id, perm_bit('ban')) then
    raise exception 'need ban perm' using errcode = '42501'; end if;
  if target_user = (select owner_id from servers s where s.id = ban_member.server_id) then
    raise exception 'cannot ban the owner' using errcode = '42501'; end if;
  insert into server_bans (server_id, user_id, banned_by, reason, until)
    values (ban_member.server_id, target_user, uid, ban_member.reason, ban_member.until)
  on conflict (server_id, user_id) do update set banned_by = uid, reason = excluded.reason, until = excluded.until;
  delete from server_members m where m.server_id = ban_member.server_id and m.user_id = target_user;
  insert into audit_log (server_id, actor_id, action, target_type, target_id, meta)
    values (ban_member.server_id, uid, 'ban', 'user', target_user,
            jsonb_build_object('reason', ban_member.reason, 'until', ban_member.until));
end;
$$;

create or replace function timeout_member(server_id uuid, target_user uuid, until timestamptz)
  returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not has_perm(timeout_member.server_id, perm_bit('timeout')) then
    raise exception 'need timeout perm' using errcode = '42501'; end if;
  if target_user = (select owner_id from servers s where s.id = timeout_member.server_id) then
    raise exception 'cannot timeout the owner' using errcode = '42501'; end if;
  update server_members m set timeout_until = timeout_member.until
    where m.server_id = timeout_member.server_id and m.user_id = target_user;
  if not found then raise exception 'not a member' using errcode = '22023'; end if;
  insert into audit_log (server_id, actor_id, action, target_type, target_id, meta)
    values (timeout_member.server_id, uid, 'timeout', 'user', target_user,
            jsonb_build_object('until', timeout_member.until));
end;
$$;

create or replace function kick_member(server_id uuid, target_user uuid)
  returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not has_perm(kick_member.server_id, perm_bit('kick')) then
    raise exception 'need kick perm' using errcode = '42501'; end if;
  if target_user = (select owner_id from servers s where s.id = kick_member.server_id) then
    raise exception 'cannot kick the owner' using errcode = '42501'; end if;
  delete from server_members m where m.server_id = kick_member.server_id and m.user_id = target_user;
  if not found then raise exception 'not a member' using errcode = '22023'; end if;
  insert into audit_log (server_id, actor_id, action, target_type, target_id)
    values (kick_member.server_id, uid, 'kick', 'user', target_user);
end;
$$;

-- ── P2.10 · set_member_roles ────────────────────────────────────────────────
-- Replaces the member's non-default roles with role_ids; @everyone always stays.
-- server_id is explicit because role_ids can be empty (nothing to infer it from).
create or replace function set_member_roles(server_id uuid, target_user uuid, role_ids uuid[])
  returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not has_perm(set_member_roles.server_id, perm_bit('manage_roles')) then
    raise exception 'need manage_roles' using errcode = '42501'; end if;
  if not exists (select 1 from server_members m
      where m.server_id = set_member_roles.server_id and m.user_id = target_user) then
    raise exception 'not a member' using errcode = '22023'; end if;
  if exists (select 1 from unnest(role_ids) rid
      where not exists (select 1 from roles r
        where r.id = rid and r.server_id = set_member_roles.server_id and not r.is_default)) then
    raise exception 'invalid role for this server' using errcode = '22023'; end if;

  delete from member_roles mr
    where mr.server_id = set_member_roles.server_id and mr.user_id = target_user
      and mr.role_id in (select id from roles r where r.server_id = set_member_roles.server_id and not r.is_default);
  insert into member_roles (server_id, user_id, role_id)
    select set_member_roles.server_id, target_user, rid from unnest(role_ids) rid
  on conflict do nothing;
  insert into member_roles (server_id, user_id, role_id)
    select set_member_roles.server_id, target_user, r.id
      from roles r where r.server_id = set_member_roles.server_id and r.is_default
  on conflict do nothing;
end;
$$;

-- ── P2.11 · set_channel_access ──────────────────────────────────────────────
-- Replaces the channel's role allow-list. Empty = open to all members. The beta
-- schema scopes private channels by ROLE only (channel_roles), so there is no
-- per-member grant to set here.
create or replace function set_channel_access(channel_id uuid, role_ids uuid[])
  returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid()); sid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select server_id into sid from channels c where c.id = set_channel_access.channel_id;
  if sid is null then raise exception 'no such channel' using errcode = '22023'; end if;
  if not has_perm(sid, perm_bit('manage_channels')) then
    raise exception 'need manage_channels' using errcode = '42501'; end if;
  if exists (select 1 from unnest(role_ids) rid
      where not exists (select 1 from roles r where r.id = rid and r.server_id = sid)) then
    raise exception 'role not in this server' using errcode = '22023'; end if;
  delete from channel_roles cr where cr.channel_id = set_channel_access.channel_id;
  insert into channel_roles (channel_id, role_id)
    select set_channel_access.channel_id, rid from unnest(role_ids) rid
  on conflict do nothing;
end;
$$;

-- ── P2.12 · export_manifest(scope) ──────────────────────────────────────────
-- scope = 'account' (the caller's own works) or a server_id (that server's works,
-- requiring owner/manage_billing). Returns a JSON array the client turns into signed
-- URLs + a zip.
create or replace function export_manifest(scope text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); sid uuid; res jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if scope = 'account' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'title', w.title, 'file_ext', w.file_ext, 'kind', w.kind,
      'blob_sha', w.blob_sha, 'bytes', w.bytes, 'created_at', w.created_at)), '[]'::jsonb)
    into res from works w
    where (w.owner_type = 'user' and w.owner_id = uid) or w.author_id = uid;
  else
    sid := scope::uuid;
    if not (is_server_admin(sid) or has_perm(sid, perm_bit('manage_billing'))) then
      raise exception 'not allowed to export this server' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'title', w.title, 'file_ext', w.file_ext, 'kind', w.kind,
      'blob_sha', w.blob_sha, 'bytes', w.bytes, 'created_at', w.created_at)), '[]'::jsonb)
    into res from works w
    where w.owner_type = 'server' and w.owner_id = sid;
  end if;
  return res;
end;
$$;

revoke execute on function ban_member(uuid,uuid,text,timestamptz), timeout_member(uuid,uuid,timestamptz),
  kick_member(uuid,uuid), set_member_roles(uuid,uuid,uuid[]), set_channel_access(uuid,uuid[]),
  export_manifest(text) from anon, public;
grant execute on function ban_member(uuid,uuid,text,timestamptz), timeout_member(uuid,uuid,timestamptz),
  kick_member(uuid,uuid), set_member_roles(uuid,uuid,uuid[]), set_channel_access(uuid,uuid[]),
  export_manifest(text) to authenticated;
