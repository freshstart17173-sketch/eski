-- eski, removing another project's tables. run once; safe to re-run.
--
-- WHAT THIS WAS. The Supabase project zidqagrmxeawpasurpwi was reused from an
-- earlier app — a private file/bookmark/notes manager with hidden folders
-- behind a PIN. Its tables sat in `public` beside eski's, sharing auth.users,
-- and nothing in this repo has ever referenced them.
--
-- WHY IT MATTERED ENOUGH TO DELETE RATHER THAN IGNORE. `folders`, `files`,
-- `notes` and `library` are exactly the words an eski feature would want. A
-- future agent reading `list_tables` would find a `library` table and a
-- `files` table and reasonably assume they were ours — the ARCHITECTURE.md
-- discipline is "know where a thing already lives", and seven decoy tables
-- defeat it. They were also carrying RLS policies and an event trigger nobody
-- was maintaining.
--
-- HOW IT WAS CHECKED BEFORE DROPPING, because this is irreversible:
--   * no reference in any .html, .js, .mjs or .sql in this repo
--   * every one of the seven tables held 0 rows
--   * both storage buckets held 0 objects
--   * the functions below are referenced ONLY by these tables' own policies
--     and triggers, never by eski's
--
-- WHAT WAS DELIBERATELY KEPT, having looked:
--   tag_synonyms   eski's. canonical_tag() reads it to normalise comic tags.
--                  It nearly went in this list on a name-shaped guess, which
--                  is the argument for checking the function bodies.
--   avatars bucket eski's — profile pictures.
--   views, reports, admins, comic_tags   all eski's (schema.sql,
--                  schema-admin.sql, schema-social.sql).
--   touch_updated_at, rls_auto_enable    generic and harmless; rls_auto_enable
--                  is an event trigger that turns RLS on for any new table,
--                  which is a good default to keep.

begin;

-- the storage policy first: it calls is_public_path(), which goes below
drop policy if exists files_obj_public on storage.objects;

-- tables. cascade is scoped to this cluster — they reference each other
-- (bookmarks/files/notes/feeds/library all point at folders) and nothing in
-- eski points at any of them.
drop table if exists bookmarks     cascade;
drop table if exists feeds         cascade;
drop table if exists files         cascade;
drop table if exists notes         cascade;
drop table if exists library       cascade;
drop table if exists folders       cascade;
drop table if exists user_settings cascade;

-- their functions, now unreferenced. dropped WITHOUT cascade on purpose: if
-- one of these is still wired to something, postgres refuses and this whole
-- transaction rolls back, which is the answer we want rather than a silent
-- widening of the blast radius.
drop function if exists cascade_hidden();
drop function if exists inherit_hidden();
drop function if exists unpublish_when_hidden();
drop function if exists folder_is_hidden(uuid);
drop function if exists is_public_path(text);
drop function if exists hidden_unlocked();
drop function if exists set_hidden_pin(text);

commit;

-- THE 'files' BUCKET IS NOT DROPPED HERE, and cannot be: storage guards its
-- own tables with protect_delete() and rejects a DELETE from SQL entirely
-- ("Use the Storage API instead"). It is empty and its only policy is gone, so
-- it is inert — but it is still listed, so delete it from the dashboard:
-- Storage > files > Delete bucket. Same for nothing else; `avatars` is ours.

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select 'tables left from that app' as check,
       (select count(*)::text from information_schema.tables
         where table_schema = 'public'
           and table_name in ('bookmarks','feeds','files','folders','library',
                              'notes','user_settings')) as value
union all
select 'its functions left',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('cascade_hidden','inherit_hidden','unpublish_when_hidden',
                             'folder_is_hidden','is_public_path','hidden_unlocked',
                             'set_hidden_pin'))
union all
select 'tag_synonyms still here (it is ours)',
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'tag_synonyms')
union all
select 'canonical_tag still works',
       (select canonical_tag('  SciFi '));
