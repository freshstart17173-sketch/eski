-- eski schema · 28 · delete_server RPC (K4 — reliable destructive delete)  — migration: p18_delete_server
--
-- Delete-server was a direct `delete from servers where id = ?` fenced by `servers_delete`
-- (owner_id = auth.uid()). It works for the owner (FK cascades wipe members/channels/works/
-- invites), but a delete that matches no RLS row returns **0 rows and NO error** — the exact
-- silent-no-op class the K8 audit flags. A non-owner's delete "succeeds" while deleting nothing,
-- and the UI (which only shows Delete to the owner) would still report success. For a destructive,
-- irreversible, cascading action that's not good enough. This SECURITY DEFINER RPC RAISES when the
-- caller isn't the owner (and when the server is already gone), so the outcome is never a silent
-- no-op: either the server is deleted, or the caller gets a real error to surface.

create or replace function public.delete_server(p_server_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid   uuid := (select auth.uid());
  owner uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select owner_id into owner from servers where id = p_server_id;
  if owner is null then raise exception 'no such server' using errcode = '22023'; end if;
  if owner <> uid then
    raise exception 'only the owner can delete this server' using errcode = '42501'; end if;
  delete from servers where id = p_server_id;   -- FK cascades remove members/channels/works/invites/roles
end
$function$;

revoke all on function public.delete_server(uuid) from public;
revoke all on function public.delete_server(uuid) from anon;
grant execute on function public.delete_server(uuid) to authenticated;
