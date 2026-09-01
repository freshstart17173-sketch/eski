-- eski schema · 39 · File explorer realtime (owner ask 2026-09-01: "real time changes so I don't
-- have to reload the page to see a tag get applied or files get moved into a folder")
--
-- The explorer has never subscribed to Realtime at all. `works`/`placement`/`content_tags`/
-- `folders` were already added to the supabase_realtime publication back in schema-16 (P1's
-- content/chat wrap), so a server-explorer subscription to those is a client-only change. But the
-- PERSONAL "My files" mount reads `saved_items`/`save_folders` (schema-07) and BOTH mounts read
-- folder tags via `folder_tags` (schema-37) — neither table was ever added to the publication, so
-- no client subscription to them can ever receive anything. This migration is that missing piece.
--
-- REPLICA IDENTITY: saved_items' PK is (user_id, work_id) and save_folders' is `id` — the default
-- PK-only identity already ships enough on a DELETE to reconcile a client view (which work moved /
-- which folder was removed). folder_tags is different: its PK is a synthetic `id` uuid the client
-- never holds, so a DELETE's old row would ship only `{id}` — useless for "which folder lost which
-- tag". FULL identity ships the whole old row (folder_id/save_folder_id/tag), matching the same
-- reasoning schema-16 already applied to placement/content_tags for the identical reason.
do $$
declare t text; live text[] := array['saved_items', 'save_folders', 'folder_tags'];
begin
  foreach t in array live loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table folder_tags replica identity full;
