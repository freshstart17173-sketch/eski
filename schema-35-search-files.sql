-- eski schema · 35 · P24 real file search (server-side, built for scale)
--
-- The explorer's client-side substring filter won't hold once a library is gigabytes / thousands of
-- files. search_files() does the heavy matching in Postgres: full-text over the filename
-- (works.search_tsv, already GIN-indexed + maintained by the works_before_write trigger) UNIONed
-- with tag matching (content_tags), plus the P21 structured modifiers (exact tags, has-a-tag-type,
-- extension, uploader, date) and B19 (a bare term also matches tags), sorted + paginated.
--
-- SECURITY INVOKER on purpose (same as search_all): the query runs as the caller, so the existing
-- works_read RLS (= can_read_work) is what filters visibility — a private / hidden / other-server
-- work can never leak. The p_source/p_server predicate only SCOPES to the requested surface; RLS is
-- the fence. Read-only, so it is safe to grant to authenticated and reliable to test (no inline-uid
-- INSERT trap). The client parses "bpm:120 / hastag:bpm / sortby:bpm_desc" into these args.

-- pg_trgm powers ILIKE '%term%' tag matching at scale; Supabase keeps extensions in `extensions`.
create extension if not exists pg_trgm with schema extensions;

-- Tag indexes: a trigram GIN for free-text "tag contains" (B19) and has-type prefix matches (P21),
-- alongside the existing pkey / unique(work_id,tag) / idx_ctags_work.
create index if not exists idx_content_tags_tag_trgm on content_tags using gin (tag extensions.gin_trgm_ops);

create or replace function search_files(
  p_source   text        default 'server',   -- 'server' | 'personal'
  p_server   uuid        default null,        -- required when source='server'
  p_text     text        default null,        -- free text: filename FTS + tag contains (B19)
  p_tags     text[]      default '{}',        -- exact tags that must ALL be present (type:value or bare)
  p_hastypes text[]      default '{}',        -- tag TYPES that must ALL be present (bpm/key/…) — hastag:
  p_exts     text[]      default '{}',        -- file extensions to include (empty = all)
  p_uploader text        default null,        -- author handle filter (optional)
  p_since    timestamptz default null,        -- created_at >= this (optional; date facet)
  p_sort     text        default 'latest',    -- latest|oldest|name|size|tag
  p_sort_tag text        default null,        -- when p_sort='tag', the tag TYPE to sort by (numeric value)
  p_dir      text        default 'desc',      -- asc|desc
  p_limit    int         default 60,
  p_offset   int         default 0
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
       -- scope to the requested surface (RLS still fences visibility on top of this)
       and (
         (p_source = 'server' and p_server is not null and (
            (w.owner_type = 'server' and w.owner_id = p_server)
            or w.server_id = p_server
            or exists (select 1 from placement p where p.work_id = w.id and p.surface = 'server' and p.surface_id = p_server)))
         or (p_source = 'personal' and w.owner_type = 'user' and w.author_id = (select auth.uid()))
       )
       -- free text: filename full-text OR any tag contains the term (B19)
       and (
         (select tsq from params) is null
         or w.search_tsv @@ (select tsq from params)
         or exists (select 1 from content_tags ct where ct.work_id = w.id and ct.tag ilike '%' || (select qtext from params) || '%')
       )
       -- exact tags: every requested tag must be present
       and (cardinality(p_tags) = 0 or not exists (
             select 1 from unnest(p_tags) t
             where not exists (select 1 from content_tags ct where ct.work_id = w.id and ct.tag = t)))
       -- has-type: every requested tag TYPE must be present (a "type:value" tag)
       and (cardinality(p_hastypes) = 0 or not exists (
             select 1 from unnest(p_hastypes) ty
             where not exists (select 1 from content_tags ct where ct.work_id = w.id and ct.tag ilike ty || ':%')))
       -- extension facet (P8): match the safe stored ext, case-insensitive
       and (cardinality(p_exts) = 0 or lower(coalesce(w.file_ext, '')) = any (select lower(x) from unnest(p_exts) x))
       -- uploader facet
       and (p_uploader is null or exists (select 1 from profiles pr where pr.id = w.author_id and pr.handle = p_uploader))
       -- date facet
       and (p_since is null or w.created_at >= p_since)
  ),
  counted as (select count(*) as total from base)
  select b.id, b.title, b.file_ext, b.kind, b.blob_sha, b.bytes, b.created_at, b.author_id, b.hidden,
         pr.handle, pr.name,
         (select p.folder_id from placement p where p.work_id = b.id and p.surface = 'server' order by p.created_at limit 1) as folder_id,
         (select c.name from placement p join channels c on c.id = p.channel_id
            where p.work_id = b.id and p.channel_id is not null order by p.created_at limit 1) as channel_name,
         coalesce((select array_agg(ct.tag order by ct.tag) from content_tags ct where ct.work_id = b.id), '{}') as tags,
         (select total from counted) as total
    from base b
    left join profiles pr on pr.id = b.author_id
   order by
     -- tag-value sort (sortby:bpm_desc): the numeric part of the file's first tag of that type
     case when p_sort = 'tag' and p_dir = 'asc'  then (select min(nullif(regexp_replace(split_part(ct.tag, ':', 2), '[^0-9.]', '', 'g'), '')::numeric)
                                                         from content_tags ct where ct.work_id = b.id and ct.tag ilike p_sort_tag || ':%') end asc nulls last,
     case when p_sort = 'tag' and p_dir = 'desc' then (select min(nullif(regexp_replace(split_part(ct.tag, ':', 2), '[^0-9.]', '', 'g'), '')::numeric)
                                                         from content_tags ct where ct.work_id = b.id and ct.tag ilike p_sort_tag || ':%') end desc nulls last,
     case when p_sort = 'name' and p_dir = 'asc'  then lower(b.title) end asc nulls last,
     case when p_sort = 'name' and p_dir = 'desc' then lower(b.title) end desc nulls last,
     case when p_sort = 'size' and p_dir = 'asc'  then b.bytes end asc  nulls last,
     case when p_sort = 'size' and p_dir = 'desc' then b.bytes end desc nulls last,
     case when p_sort = 'oldest' then b.created_at end asc nulls last,
     -- default (latest) + tiebreaker: newest first
     case when p_sort not in ('name', 'size', 'tag', 'oldest') then b.created_at end desc nulls last,
     b.created_at desc, b.id
   limit greatest(1, least(coalesce(p_limit, 60), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function search_files(text, uuid, text, text[], text[], text[], text, timestamptz, text, text, text, int, int) to authenticated;
