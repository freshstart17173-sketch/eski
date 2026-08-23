-- eski schema · 16 · P2 residuals — share resolver, trash purge, Realtime
-- (owner-approved 2026-08-23; outside the prompts/P2-rpcs.md 16-prompt contract but
-- part of P2 scope per BUILDLOG Current state). Re-runnable.

-- ── (1) resolve_share_link(token) — the anon read path for /shared/:token ────
-- can_read_work() already GRANTS the read when a live share_links row exists, but the
-- share_read RLS policy only lets the link's CREATOR select share_links — so an outside
-- viewer holding the token can't look it up to learn which work it points at. This
-- SECURITY DEFINER resolver does that one lookup, refusing a revoked/expired token, and
-- returns the work. The client then reads the work + work_items normally (RLS passes via
-- the live link) and signs the blob URL. Anon-callable (a shared link works signed-out).
create or replace function resolve_share_link(token text) returns works
  language plpgsql security definer set search_path = public as $$
declare sl share_links; w works;
begin
  select * into sl from share_links s where s.token = resolve_share_link.token;
  if not found then raise exception 'invalid link' using errcode = '22023'; end if;
  if sl.revoked_at is not null then raise exception 'link revoked' using errcode = '42501'; end if;
  if sl.expires_at is not null and sl.expires_at <= now() then
    raise exception 'link expired' using errcode = '22023'; end if;
  select * into w from works ww where ww.id = sl.work_id;
  if not found or w.deleted_at is not null then
    raise exception 'work unavailable' using errcode = '22023'; end if;
  return w;
end;
$$;
revoke execute on function resolve_share_link(text) from public;
grant  execute on function resolve_share_link(text) to anon, authenticated;

-- ── (2) 30-day trash purge (pg_cron) ────────────────────────────────────────
-- A work is soft-deleted (deleted_at set) into Trash and stays restorable for 30 days;
-- after that this job HARD-deletes it. The row delete fires trg_works_blob_meter
-- (AFTER DELETE), dropping the blob refcount and freeing the owner's meter bytes on the
-- last reference — so purging is what actually reclaims quota. Child rows cascade via FK.
-- SECURITY DEFINER so the scheduled job runs regardless of RLS; not REST-exposed.
create or replace function purge_trashed_works() returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with del as (
    delete from works w
      where w.deleted_at is not null and w.deleted_at < now() - interval '30 days'
    returning 1)
  select count(*) into n from del;
  return n;
end;
$$;
revoke execute on function purge_trashed_works() from public, anon, authenticated;

create extension if not exists pg_cron;   -- installs into the `cron` schema
-- daily 04:00 UTC. cron.schedule() upserts by name; unschedule-if-exists keeps re-runs clean.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'purge_trashed_works') then
    perform cron.unschedule('purge_trashed_works');
  end if;
  perform cron.schedule('purge_trashed_works', '0 4 * * *', 'select public.purge_trashed_works();');
end $$;

-- ── (3) Realtime publication ────────────────────────────────────────────────
-- Adds the live-surface tables to supabase_realtime so the client's Postgres-Changes
-- subscriptions receive them. Realtime evaluates the SAME RLS as a normal read for the
-- subscribing user, so a channel/DM they can't see never reaches them — the fence is
-- already in place from P1. Client channels: `channel:{id}` (messages/reactions/pins/
-- mentions), `server:{id}` (members/roles/channels/servers), dm:{id} (dm_*), `user:{id}`
-- (notifications), plus content (works/placement/comments/tags/collaborators/folders)
-- and friendships.
do $$
declare t text; live text[] := array[
  'messages','message_reactions','message_pins','channel_reads','mentions',
  'dm_channels','dm_members','dm_messages','dm_message_reactions',
  'notifications','server_members','servers','channels','channel_categories',
  'roles','member_roles','channel_roles','works','placement','comments',
  'content_tags','work_collaborators','folders','friendships'];
begin
  foreach t in array live loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- REPLICA IDENTITY FULL on the small join/state/reaction tables: a DELETE or UPDATE
-- there must ship the OLD row so the client knows WHICH reaction/pin/member/role/tag
-- changed (default PK-only identity isn't enough to reconcile those views). The big
-- append tables (messages/works/dm_messages) keep PK identity — insert + update/
-- delete-by-pk is all their live views need, and FULL would bloat their WAL.
alter table message_reactions    replica identity full;
alter table message_pins         replica identity full;
alter table dm_message_reactions replica identity full;
alter table mentions             replica identity full;
alter table channel_reads        replica identity full;
alter table server_members       replica identity full;
alter table member_roles         replica identity full;
alter table channel_roles        replica identity full;
alter table dm_members           replica identity full;
alter table placement            replica identity full;
alter table content_tags         replica identity full;
alter table work_collaborators   replica identity full;
alter table friendships          replica identity full;
