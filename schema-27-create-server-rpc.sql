-- eski schema · 27 · atomic create_server RPC (K5)  — migration: p17_create_server
--
-- Creating a server was 4 sequential client inserts under RLS (servers → server_members → the
-- @everyone role → channels). Each passed for the owner (servers.owner_id makes is_server_admin
-- true, so the role/channel writes clear their has_perm gates), but it was NOT atomic: a failure
-- after the servers insert left a half-made server — a row with no owner membership, no @everyone
-- role, or no channels — that the owner couldn't cleanly use or even delete via the UI. It also
-- leaned on the same RLS-fenced writes the K8 audit flags as the fragile path. This collapses the
-- four into ONE SECURITY DEFINER call: atomic (any failure rolls the whole thing back), and, as
-- the table owner, free of the create-time chicken-and-egg (seat the owner's membership + role
-- before any policy would need them to exist). The fence is intact — the server is always owned by
-- and seats exactly the caller.

create or replace function public.create_server(p_name text, p_channels text[] default array['general'])
  returns servers
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid   uuid := (select auth.uid());
  srv   servers;
  nm    text := trim(coalesce(p_name, ''));
  cn    text;
  pos   int := 0;
  added int := 0;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(nm) = 0 then raise exception 'a server name is required' using errcode = '22023'; end if;
  if length(nm) > 100 then nm := left(nm, 100); end if;

  insert into servers (name, owner_id) values (nm, uid) returning * into srv;

  -- seat the owner (member-hue 1, active) and the one @everyone role (perms 113664 — the
  -- default-member permission set, kept in sync with data.js EVERYONE_PERMS).
  insert into server_members (server_id, user_id, color, status) values (srv.id, uid, 1, 'active');
  insert into roles (server_id, name, is_default, permissions, position)
    values (srv.id, 'everyone', true, 113664, 0);

  -- starter channels: normalize each to a handle (lowercase, non-alnum → dashes, trimmed),
  -- skip empties, cap at 20; if nothing valid remains, create a single #general.
  foreach cn in array coalesce(p_channels, array['general']) loop
    cn := regexp_replace(lower(trim(coalesce(cn, ''))), '[^a-z0-9]+', '-', 'g');
    cn := trim(both '-' from cn);
    if cn = '' or pos >= 20 then continue; end if;
    insert into channels (server_id, name, kind, position) values (srv.id, cn, 'text', pos)
    on conflict do nothing;
    pos := pos + 1; added := added + 1;
  end loop;
  if added = 0 then
    insert into channels (server_id, name, kind, position) values (srv.id, 'general', 'text', 0);
  end if;

  return srv;
end
$function$;

revoke all on function public.create_server(text, text[]) from public;
revoke all on function public.create_server(text, text[]) from anon;
grant execute on function public.create_server(text, text[]) to authenticated;
