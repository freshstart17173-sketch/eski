-- eski schema · 18 · invite a user to a server (P9)  — migration: p9_invite_user_to_server
-- Powers the invite modal's "invite by handle" + suggested-people rows. The notifications
-- table has no client INSERT policy (trigger-only), and the invitee isn't a member yet so
-- they can't read `servers` — so this SECURITY DEFINER RPC writes the notification and carries
-- the server NAME in `excerpt` (readable by the invitee) plus a single-use invite CODE in a new
-- `target_ref` column. Clicking the notification opens /join/<code>, which the tested
-- join_via_invite path (schema-10) consumes — no new join logic, no new "accept" surface.
--
-- Gate: admin only (matches server_invites' admin-only insert). RLS is bypassed inside a
-- definer, so this body IS the fence (the P2 rule). Round-trip tested via the Supabase MCP:
-- happy path creates the code + notification (single-use, 7-day), and every gate rejects
-- (not-permitted / already-member / self-invite). Security advisor: no rls-disabled /
-- permit-all; the function is authenticated-executable (the accepted RPC posture).

-- carry a text reference on a notification (here: the invite code; reusable for future notif
-- kinds that point at a non-uuid target).
alter table notifications add column if not exists target_ref text;

create or replace function invite_user_to_server(p_target uuid, p_server uuid)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  uid      uuid := (select auth.uid());
  srv_name text;
  code     text;
  existing text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not is_server_admin(p_server) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_target is null or not exists (select 1 from profiles where id = p_target) then
    raise exception 'no such user' using errcode = '22023';
  end if;
  if p_target = uid then
    raise exception 'cannot invite yourself' using errcode = '22023';
  end if;
  if exists (
    select 1 from server_members m
    where m.server_id = p_server and m.user_id = p_target and m.status = 'active'
  ) then
    raise exception 'already a member' using errcode = '22023';
  end if;

  select s.name into srv_name from servers s where s.id = p_server;

  -- don't spam duplicate codes: reuse the code from an existing unread invite for this pair
  -- if it's still a live invite row.
  select n.target_ref into existing from notifications n
    where n.user_id = p_target and n.server_id = p_server
      and n.kind = 'invite' and n.read_at is null
    order by n.created_at desc limit 1;
  if existing is not null and exists (select 1 from server_invites i where i.code = existing) then
    return existing;
  end if;

  -- single-use, 7-day code; gen_random_uuid is always present (it's the PK default), so no
  -- extension dependency for the code.
  code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into server_invites (code, server_id, created_by, expires_at, max_uses)
    values (code, p_server, uid, now() + interval '7 days', 1);

  insert into notifications (user_id, kind, actor_id, server_id, excerpt, target_ref)
    values (p_target, 'invite', uid, p_server, srv_name, code);

  return code;
end;
$$;

revoke execute on function invite_user_to_server(uuid, uuid) from anon, public;
grant  execute on function invite_user_to_server(uuid, uuid) to authenticated;
