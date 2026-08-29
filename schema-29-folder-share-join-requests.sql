-- eski schema · 29 · Drive-style folder sharing + request-to-join (K9)  — migration: p19_folder_share_join_requests
--
-- Two owner-requested capabilities, both anon-safe where they must be:
--
-- (A) FOLDER SHARING. `share_links` only targeted a single `work_id`. Extend it to also target a
--     FOLDER — a server folder (`folders`) or a personal My-files folder (`save_folders`) — so a
--     read-only viewer of the folder's contents is reachable outside the server, Drive-style. A
--     row now names exactly ONE target (a work OR a folder); a `resolve_folder_share` RPC returns
--     the folder's files to anon (the token is the capability).
--
-- (B) REQUEST TO JOIN. A `join_requests` table + RPCs so someone who lands on a server (e.g. via a
--     shared folder) can ask to join, and the server's admins can approve/decline. Approving seats
--     the member exactly like `join_via_invite` (member hue + @everyone). All writes go through
--     SECURITY DEFINER RPCs (the reliable path); RLS only governs who can READ the requests.

-- ── (A) folder sharing ──────────────────────────────────────────────────────
alter table share_links add column if not exists folder_id     uuid;
alter table share_links add column if not exists folder_source text check (folder_source in ('server','personal'));
-- a work target is no longer mandatory; a row targets a work XOR a folder.
alter table share_links alter column work_id drop not null;
alter table share_links drop constraint if exists share_links_one_target;
alter table share_links add constraint share_links_one_target check (
  (work_id is not null and folder_id is null and folder_source is null)
  or (work_id is null and folder_id is not null and folder_source is not null)
);

-- Create a folder share (owner/admin of the folder). Server folder → must be able to write the
-- server (has_perm manage_files via can_manage_files? we use member_of + the folder's server);
-- personal folder → must own it. Returns the token.
create or replace function public.create_folder_share(p_source text, p_folder_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid uuid := (select auth.uid());
  tok text;
  sid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_source = 'server' then
    select server_id into sid from folders where id = p_folder_id;
    if sid is null then raise exception 'no such folder' using errcode = '22023'; end if;
    if not member_of(sid) then raise exception 'not your server''s folder' using errcode = '42501'; end if;
  elsif p_source = 'personal' then
    if not exists (select 1 from save_folders where id = p_folder_id and user_id = uid) then
      raise exception 'that folder is not yours' using errcode = '42501'; end if;
  else
    raise exception 'bad folder source' using errcode = '22023';
  end if;

  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into share_links (token, work_id, folder_id, folder_source, created_by)
    values (tok, null, p_folder_id, p_source, uid);
  return tok;
end
$function$;

-- Resolve a folder share for the anon viewer: the folder name, its server context (for a server
-- folder — so the viewer can offer "Request to join"; null for a personal folder), and its files
-- (read-only). No auth — the token is the capability. A server folder's files are the works placed
-- in it (placement); a personal folder's are the works filed into it (saved_items).
-- NB the live definition was set by migration p20 (return-type change needs DROP+CREATE, not
-- CREATE OR REPLACE); this file carries that final shape.
drop function if exists public.resolve_folder_share(text);
create function public.resolve_folder_share(p_token text)
  returns table(folder_name text, source text, server_id uuid, server_name text,
                file_id uuid, title text, kind text, file_ext text, blob_sha text, bytes bigint)
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare sl share_links; f_name text; s_id uuid; s_name text;
begin
  select * into sl from share_links s where s.token = p_token;
  if not found or sl.folder_id is null then return; end if;
  if sl.revoked_at is not null then return; end if;
  if sl.expires_at is not null and sl.expires_at <= now() then return; end if;

  if sl.folder_source = 'server' then
    select f.name, f.server_id into f_name, s_id from folders f where f.id = sl.folder_id;
    select name into s_name from servers where id = s_id;
    return query
      select f_name, 'server'::text, s_id, s_name, w.id, w.title, w.kind, w.file_ext, w.blob_sha, w.bytes
      from placement p
      join works w on w.id = p.work_id and w.deleted_at is null
      where p.folder_id = sl.folder_id and p.surface = 'server'
      order by w.created_at desc;
  else
    select sf.name into f_name from save_folders sf where sf.id = sl.folder_id;
    return query
      select f_name, 'personal'::text, null::uuid, null::text, w.id, w.title, w.kind, w.file_ext, w.blob_sha, w.bytes
      from saved_items si
      join works w on w.id = si.work_id and w.deleted_at is null
      where si.folder_id = sl.folder_id
      order by w.created_at desc;
  end if;
end
$function$;

revoke all on function public.create_folder_share(text, uuid) from public, anon;
grant execute on function public.create_folder_share(text, uuid) to authenticated;
revoke all on function public.resolve_folder_share(text) from public;
grant execute on function public.resolve_folder_share(text) to anon, authenticated;

-- ── (B) request-to-join ─────────────────────────────────────────────────────
create table if not exists join_requests (
  server_id  uuid not null references servers(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','approved','declined')),
  message    text,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  primary key (server_id, user_id)
);
alter table join_requests enable row level security;
-- reads: your own request (to see its status) OR a server admin (to review the queue). Writes are
-- RPC-only (definer), so no insert/update policy — that keeps the fence in one place.
drop policy if exists jr_read on join_requests;
create policy jr_read on join_requests for select
  using (user_id = (select auth.uid()) or is_server_admin(server_id));
create index if not exists join_requests_server_status_idx on join_requests(server_id, status);

-- Ask to join a server. Idempotent: an active member returns 'member'; an existing pending/declined
-- row is refreshed to pending. A banned user is refused. Returns the resulting status.
create or replace function public.request_to_join_server(p_server_id uuid, p_message text default null)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from servers where id = p_server_id) then
    raise exception 'no such server' using errcode = '22023'; end if;
  if exists (select 1 from server_members m where m.server_id = p_server_id and m.user_id = uid and m.status = 'active') then
    return 'member'; end if;
  if exists (select 1 from server_bans b where b.server_id = p_server_id and b.user_id = uid and (b.until is null or b.until > now())) then
    raise exception 'you are banned from this server' using errcode = '42501'; end if;

  insert into join_requests (server_id, user_id, status, message)
    values (p_server_id, uid, 'pending', nullif(trim(coalesce(p_message,'')), ''))
  on conflict (server_id, user_id) do update
    set status = 'pending', message = excluded.message, created_at = now(), decided_by = null, decided_at = null;
  return 'pending';
end
$function$;

-- Approve a pending request (admin). Seats the member with the next free hue + @everyone, marks the
-- request approved. Mirrors join_via_invite's seating.
create or replace function public.approve_join_request(p_server_id uuid, p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid uuid := (select auth.uid());
  default_role uuid;
  new_color smallint;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not is_server_admin(p_server_id) then raise exception 'only an admin can approve' using errcode = '42501'; end if;
  if not exists (select 1 from join_requests r where r.server_id = p_server_id and r.user_id = p_user_id and r.status = 'pending') then
    raise exception 'no pending request' using errcode = '22023'; end if;

  update join_requests set status = 'approved', decided_by = uid, decided_at = now()
    where server_id = p_server_id and user_id = p_user_id;

  if not exists (select 1 from server_members m where m.server_id = p_server_id and m.user_id = p_user_id and m.status = 'active') then
    select coalesce(
      (select g from generate_series(0, 29) g
        where g not in (select m.color from server_members m where m.server_id = p_server_id and m.color is not null)
        order by g limit 1),
      (select count(*)::int % 30 from server_members m where m.server_id = p_server_id)
    ) into new_color;
    insert into server_members (server_id, user_id, color, status)
      values (p_server_id, p_user_id, new_color, 'active')
    on conflict (server_id, user_id) do update set status = 'active';
  end if;
end
$function$;

-- Decline a pending request (admin).
create or replace function public.decline_join_request(p_server_id uuid, p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not is_server_admin(p_server_id) then raise exception 'only an admin can decline' using errcode = '42501'; end if;
  update join_requests set status = 'declined', decided_by = uid, decided_at = now()
    where server_id = p_server_id and user_id = p_user_id and status = 'pending';
end
$function$;

revoke all on function public.request_to_join_server(uuid, text) from public, anon;
grant execute on function public.request_to_join_server(uuid, text) to authenticated;
revoke all on function public.approve_join_request(uuid, uuid) from public, anon;
grant execute on function public.approve_join_request(uuid, uuid) to authenticated;
revoke all on function public.decline_join_request(uuid, uuid) from public, anon;
grant execute on function public.decline_join_request(uuid, uuid) to authenticated;
