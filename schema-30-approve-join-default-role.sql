-- schema-30 — migration p21_approve_join_assigns_default_role (2026-08-29)
--
-- BUG FIX found in the backend verification pass. approve_join_request (schema-29 / K9)
-- declared `default_role uuid` but NEVER used it: it seated the server_members row and
-- stopped there, so an approved member got NO member_roles row — unlike join_via_invite,
-- which assigns the server's is_default (@everyone) role. has_perm() unions ONLY owner_id
-- + member_roles (it does NOT implicitly grant the default role), so a member approved via
-- a join-request had zero permissions: they could READ unrestricted channels
-- (can_view_channel passes on member_of alone) but could NOT send_messages / upload /
-- comment / add_tags / pin, nor see role-gated channels. The declared-but-unused
-- `default_role` is the smoking gun — the assignment was intended and dropped.
--
-- Fix: mirror join_via_invite — assign the is_default role on approval (idempotent, so a
-- re-approval heals a missing role too). Verified by role-sim: after approve, the member's
-- member_roles count = 1 and has_perm(send_messages)/has_perm(upload) = true (rolled back).
--
-- LESSON for the next agent: any NEW member-creating path MUST assign the default role.
-- grep `member_roles` before adding one; join_via_invite is the reference implementation.
create or replace function public.approve_join_request(p_server_id uuid, p_user_id uuid)
  returns void language plpgsql security definer set search_path to 'public'
as $function$
declare uid uuid := (select auth.uid()); new_color smallint; default_role uuid;
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
  -- assign the default role so the member has the @everyone permission set (matches
  -- join_via_invite). Idempotent: re-approval heals a missing role too.
  select id into default_role from roles r where r.server_id = p_server_id and r.is_default;
  if default_role is not null then
    insert into member_roles (server_id, user_id, role_id)
      values (p_server_id, p_user_id, default_role)
    on conflict do nothing;
  end if;
end $function$;
