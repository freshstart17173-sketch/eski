-- eski schema · 42 · search goes downward-only from the current folder, and folders themselves
-- become searchable (owner spec 2026-09-01: "the search will go as deep as it needs to to find
-- what is being searched for but never search above. If an entire folder matches (name, tags,
-- etc...) then it is surfaced, if the content also match, it returns as well.")
--
-- Two real bugs this fixes, found reading search_files (schema-35/36) end to end while
-- diagnosing "search genuinely doesn't work":
--   1. search_files had NO folder-scope parameter at all. The explorer's `in:folder` modifier was
--      applied as a CLIENT-SIDE post-filter on top of whatever page of server-wide results
--      search_files already returned (capped at p_limit) — a real match sitting deep in the
--      folder being searched could be excluded before the client-side filter ever saw it, because
--      it never made the top N server-wide results in the first place.
--   2. search_files' output `folder_id` column was ONLY ever populated from `placement` (server
--      surface) — a PERSONAL search's results always carried folder_id = null, so `in:folder`
--      could never match anything for a personal-library search regardless of #1.
--
-- folder_search_scope(): the shared "this folder + everything below it" set, computed once and
-- reused by both search_files and the new search_folders below — a folder tree nests arbitrarily
-- (K9/P23 already assume this), so this is a recursion, not a fixed-depth join. p_folder_id null
-- means "no restriction" (search the whole mount) — the recursive seed then selects every folder
-- in the mount directly, and the recursive step just re-derives rows already present (a no-op,
-- terminates immediately), so the same function serves the "current folder" and "whole library"
-- cases without a separate branch.
create or replace function folder_search_scope(p_source text, p_server uuid, p_folder_id uuid)
returns table(id uuid)
language sql stable security invoker set search_path = public as $$
  with recursive src_folders as (
    -- one (id, parent_id) shape for whichever mount is being searched, unioned ONCE here (not
    -- inside the recursive term below) — Postgres only allows a single self-reference per
    -- recursive term, so the join in `scope` below must walk one plain relation, not two.
    select id, parent_id from folders
     where p_source = 'server' and p_server is not null and server_id = p_server
    union all
    select id, parent_id from save_folders
     where p_source = 'personal' and user_id = (select auth.uid())
  ),
  scope as (
    select id, parent_id from src_folders where p_folder_id is null or id = p_folder_id
    union all
    select f.id, f.parent_id from src_folders f join scope s on f.parent_id = s.id
  )
  select id from scope;
$$;
grant execute on function folder_search_scope(text, uuid, uuid) to authenticated;

-- search_files: same signature as schema-36 plus p_folder_id (appended, so the client's existing
-- named-arg .rpc() calls that omit it keep working unchanged — it defaults to null = unscoped,
-- today's behavior). Two changes in the body: the folder-scope predicate (item 1 above), and
-- folder_id now resolves from saved_items for a personal search too (item 2 above).
create or replace function search_files(
  p_source    text        default 'server',
  p_server    uuid        default null,
  p_text      text        default null,
  p_tags      text[]      default '{}',
  p_hastypes  text[]      default '{}',
  p_exts      text[]      default '{}',
  p_uploader  text        default null,
  p_since     timestamptz default null,
  p_sort      text        default 'latest',
  p_sort_tag  text        default null,
  p_dir       text        default 'desc',
  p_limit     int         default 60,
  p_offset    int         default 0,
  p_folder_id uuid        default null   -- NEW: scope to this folder + its subtree; null = whole mount
) returns table (
  id uuid, title text, file_ext text, kind text, blob_sha text, bytes bigint,
  created_at timestamptz, author_id uuid, hidden boolean,
  author_handle text, author_name text,
  folder_id uuid, channel_name text,
  tags text[], total bigint
) language sql stable security invoker set search_path = public, extensions as $$
  with params as (
    select nullif(trim(p_text), '') as qtext,
           case when coalesce(trim(p_text), '') = '' then null
                else websearch_to_tsquery('english', p_text) end as tsq
  ),
  base as (
    select w.id, w.title, w.file_ext, w.kind, w.blob_sha, w.bytes, w.created_at, w.author_id, w.hidden
      from works w
     where w.deleted_at is null
       and (
         (p_source = 'server' and p_server is not null and (
            (w.owner_type = 'server' and w.owner_id = p_server)
            or w.server_id = p_server
            or exists (select 1 from placement p where p.work_id = w.id and p.surface = 'server' and p.surface_id = p_server)))
         or (p_source = 'personal' and w.owner_type = 'user' and w.author_id = (select auth.uid()))
       )
       and (
         (select qtext from params) is null
         or w.search_tsv @@ (select tsq from params)
         or w.title ilike '%' || (select qtext from params) || '%'
         or exists (select 1 from content_tags ct where ct.work_id = w.id and ct.tag ilike '%' || (select qtext from params) || '%')
       )
       and (cardinality(p_tags) = 0 or not exists (
             select 1 from unnest(p_tags) t
             where not exists (select 1 from content_tags ct where ct.work_id = w.id and ct.tag = t)))
       and (cardinality(p_hastypes) = 0 or not exists (
             select 1 from unnest(p_hastypes) ty
             where not exists (select 1 from content_tags ct where ct.work_id = w.id and ct.tag ilike ty || ':%')))
       and (cardinality(p_exts) = 0 or lower(coalesce(w.file_ext, '')) = any (select lower(x) from unnest(p_exts) x))
       and (p_uploader is null or exists (select 1 from profiles pr where pr.id = w.author_id and pr.handle = p_uploader))
       and (p_since is null or w.created_at >= p_since)
       -- NEW: never search above p_folder_id — restrict to files placed in it or a descendant.
       -- A null p_folder_id applies no restriction (folder_search_scope already covers the whole
       -- mount in that case, but skipping the exists() entirely when unscoped is cheaper).
       and (
         p_folder_id is null
         or (p_source = 'server' and exists (
               select 1 from placement p2 where p2.work_id = w.id and p2.surface = 'server'
                 and p2.folder_id in (select id from folder_search_scope(p_source, p_server, p_folder_id))))
         or (p_source = 'personal' and exists (
               select 1 from saved_items si where si.user_id = (select auth.uid()) and si.work_id = w.id
                 and si.folder_id in (select id from folder_search_scope(p_source, p_server, p_folder_id))))
       )
  ),
  counted as (select count(*) as total from base)
  select b.id, b.title, b.file_ext, b.kind, b.blob_sha, b.bytes, b.created_at, b.author_id, b.hidden,
         pr.handle, pr.name,
         -- folder_id: server → placement (as before); personal → saved_items (FIXED — this was
         -- always null for a personal search before, which silently broke in:folder for My files).
         case when p_source = 'server'
              then (select p.folder_id from placement p where p.work_id = b.id and p.surface = 'server' order by p.created_at limit 1)
              else (select si.folder_id from saved_items si where si.work_id = b.id and si.user_id = (select auth.uid()) limit 1)
         end as folder_id,
         (select c.name from placement p join channels c on c.id = p.channel_id
            where p.work_id = b.id and p.channel_id is not null order by p.created_at limit 1) as channel_name,
         coalesce((select array_agg(ct.tag order by ct.tag) from content_tags ct where ct.work_id = b.id), '{}') as tags,
         (select total from counted) as total
    from base b
    left join profiles pr on pr.id = b.author_id
   order by
     case when p_sort = 'tag' and p_dir = 'asc'  then (select min(nullif(regexp_replace(split_part(ct.tag, ':', 2), '[^0-9.]', '', 'g'), '')::numeric)
                                                         from content_tags ct where ct.work_id = b.id and ct.tag ilike p_sort_tag || ':%') end asc nulls last,
     case when p_sort = 'tag' and p_dir = 'desc' then (select min(nullif(regexp_replace(split_part(ct.tag, ':', 2), '[^0-9.]', '', 'g'), '')::numeric)
                                                         from content_tags ct where ct.work_id = b.id and ct.tag ilike p_sort_tag || ':%') end desc nulls last,
     case when p_sort = 'name' and p_dir = 'asc'  then lower(b.title) end asc nulls last,
     case when p_sort = 'name' and p_dir = 'desc' then lower(b.title) end desc nulls last,
     case when p_sort = 'size' and p_dir = 'asc'  then b.bytes end asc  nulls last,
     case when p_sort = 'size' and p_dir = 'desc' then b.bytes end desc nulls last,
     case when p_sort = 'oldest' then b.created_at end asc nulls last,
     case when p_sort not in ('name', 'size', 'tag', 'oldest') then b.created_at end desc nulls last,
     b.created_at desc, b.id
   limit greatest(1, least(coalesce(p_limit, 60), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function search_files(text, uuid, text, text[], text[], text[], text, timestamptz, text, text, text, int, int, uuid) to authenticated;

-- search_folders: the "if an entire folder matches, surface it too" half. Same scope (never
-- above p_folder_id), matches a folder's OWN name/tags — never its contents (a file inside a
-- tagged folder does NOT inherit the folder's tags, same rule schema-37 already enforces). The
-- folder you're currently standing in is excluded — searching from inside a folder that itself
-- matches your query would just be confusing noise ("why is the folder I'm already in a result").
create or replace function search_folders(
  p_source    text   default 'server',
  p_server    uuid   default null,
  p_text      text   default null,
  p_tags      text[] default '{}',
  p_folder_id uuid   default null,
  p_limit     int    default 30
) returns table (
  id uuid, name text, parent_id uuid, tags text[], created_at timestamptz
) language sql stable security invoker set search_path = public, extensions as $$
  with params as (select nullif(trim(p_text), '') as qtext),
  scope as (select id from folder_search_scope(p_source, p_server, p_folder_id)),
  matched as (
    select f.id, f.name, f.parent_id, f.created_at
      from folders f
     where p_source = 'server' and p_server is not null and f.id in (select id from scope)
       and f.id is distinct from p_folder_id
       and (
         (select qtext from params) is null
         or f.name ilike '%' || (select qtext from params) || '%'
         or exists (select 1 from folder_tags ft where ft.folder_id = f.id and ft.tag ilike '%' || (select qtext from params) || '%')
       )
       and (cardinality(p_tags) = 0 or not exists (
             select 1 from unnest(p_tags) t
             where not exists (select 1 from folder_tags ft where ft.folder_id = f.id and ft.tag = t)))
    union all
    select sf.id, sf.name, sf.parent_id, sf.created_at
      from save_folders sf
     where p_source = 'personal' and sf.user_id = (select auth.uid()) and sf.id in (select id from scope)
       and sf.id is distinct from p_folder_id
       and (
         (select qtext from params) is null
         or sf.name ilike '%' || (select qtext from params) || '%'
         or exists (select 1 from folder_tags ft where ft.save_folder_id = sf.id and ft.tag ilike '%' || (select qtext from params) || '%')
       )
       and (cardinality(p_tags) = 0 or not exists (
             select 1 from unnest(p_tags) t
             where not exists (select 1 from folder_tags ft where ft.save_folder_id = sf.id and ft.tag = t)))
  )
  select m.id, m.name, m.parent_id,
         coalesce((select array_agg(ft.tag order by ft.tag)
                     from folder_tags ft where ft.folder_id = m.id or ft.save_folder_id = m.id), '{}') as tags,
         m.created_at
    from matched m
   order by m.name
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
grant execute on function search_folders(text, uuid, text, text[], uuid, int) to authenticated;
