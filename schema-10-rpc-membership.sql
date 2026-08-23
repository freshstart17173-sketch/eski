-- eski schema · 10 · P2 RPCs — membership & social  (CANON §E.3, prompts/P2-rpcs.md)
-- Re-runnable. Every function is SECURITY DEFINER with search_path=public, so it
-- BYPASSES RLS and therefore RE-CHECKS its own gate in the body — the RLS policy is
-- not the fence once you are inside a definer (P2 header rule).

-- ── P2.1 · join_via_invite(code) ───────────────────────────────────────────
-- The only path a non-admin becomes a member. Gate: a valid, live, under-cap invite
-- AND the caller is not actively banned. On success: seat the member with the next
-- free member-hue, grant @everyone, burn one use, return the server.
create or replace function join_via_invite(code text) returns servers
  language plpgsql security definer set search_path = public as $$
declare
  inv          server_invites;
  srv          servers;
  uid          uuid := (select auth.uid());
  default_role uuid;
  new_color    smallint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- lock the invite row so two racing joins can't both slip past max_uses.
  select * into inv from server_invites i where i.code = join_via_invite.code for update;
  if not found then
    raise exception 'invalid invite' using errcode = '22023';
  end if;
  if inv.expires_at is not null and inv.expires_at <= now() then
    raise exception 'invite expired' using errcode = '22023';
  end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then
    raise exception 'invite at capacity' using errcode = '22023';
  end if;

  -- a ban refuses the join even with a valid code; an expired temp ban does not.
  if exists (
    select 1 from server_bans b
    where b.server_id = inv.server_id and b.user_id = uid
      and (b.until is null or b.until > now())
  ) then
    raise exception 'banned from this server' using errcode = '42501';
  end if;

  select * into srv from servers s where s.id = inv.server_id;

  -- idempotent: an already-active member gets the server back without burning a use.
  if exists (
    select 1 from server_members m
    where m.server_id = inv.server_id and m.user_id = uid and m.status = 'active'
  ) then
    return srv;
  end if;

  -- next free member hue (0..29): lowest unused, else cycle by current headcount so a
  -- 31st member still gets a deterministic colour rather than null.
  select coalesce(
    (select g from generate_series(0, 29) g
      where g not in (
        select m.color from server_members m
        where m.server_id = inv.server_id and m.color is not null)
      order by g limit 1),
    ((select count(*) from server_members m where m.server_id = inv.server_id) % 30)::smallint
  ) into new_color;

  insert into server_members (server_id, user_id, color, status)
  values (inv.server_id, uid, new_color, 'active')
  on conflict (server_id, user_id) do update set status = 'active';

  select id into default_role from roles r
    where r.server_id = inv.server_id and r.is_default;
  if default_role is not null then
    insert into member_roles (server_id, user_id, role_id)
    values (inv.server_id, uid, default_role)
    on conflict do nothing;
  end if;

  update server_invites set uses = uses + 1 where server_invites.code = inv.code;
  return srv;
end;
$$;

revoke execute on function join_via_invite(text) from anon, public;
grant  execute on function join_via_invite(text) to authenticated;
