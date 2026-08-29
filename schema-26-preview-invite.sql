-- eski schema · 26 · preview_invite(code) anon-readable RPC (K1)  — migration: p16_preview_invite
--
-- The invite landing (/join/:code, screens/join.js) showed generic copy ("You've been invited to
-- a server") because a non-member can't read `servers`/`server_members` pre-join (RLS). This
-- SECURITY DEFINER function is the one anon-safe peek: for a VALID, live, under-cap code it returns
-- just enough to make the card real — the server name + icon, its active member count, and who
-- invited you. It applies the SAME validity rules as join_via_invite (exists, not expired, under
-- max_uses); a revoked invite is a deleted row, so "not found" and an expired/full one both return
-- NO rows → the client shows the dead-invite state. Nothing sensitive leaks: anyone holding the
-- code is already being invited, and the code itself is the secret. anon may call it (the landing
-- works signed-out, before the join).

create or replace function public.preview_invite(p_code text)
  returns table(server_id uuid, server_name text, icon_key text, member_count int, inviter_name text)
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  inv server_invites;
  srv servers;
begin
  select * into inv from server_invites i where i.code = p_code;
  if not found then return; end if;                                   -- invalid or revoked
  if inv.expires_at is not null and inv.expires_at <= now() then return; end if;  -- expired
  if inv.max_uses is not null and inv.uses >= inv.max_uses then return; end if;   -- at capacity

  select * into srv from servers s where s.id = inv.server_id;
  if not found then return; end if;                                   -- server gone

  return query
    select srv.id, srv.name, srv.icon_key,
      (select count(*)::int from server_members m where m.server_id = srv.id and m.status = 'active'),
      (select coalesce(nullif(trim(p.name), ''), p.handle) from profiles p where p.id = inv.created_by);
end
$function$;

-- anon-readable BY DESIGN (the landing renders before sign-in); authenticated too.
revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to anon, authenticated;
